import asyncio
import io
import json
import logging
import math
import os
import random
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.gesture import Gesture as GestureModel
from app.models.model_version import ModelVersion as ModelVersionModel
from app.models.training_dataset import TrainingDataset as DatasetModel
from app.models.training_sample import TrainingSample as SampleModel

logger = logging.getLogger(__name__)

STANDARD_GESTURES = [
    "yes_nod",
    "no_shake",
    "head_tilt_left",
    "head_tilt_right",
    "look_away",
    "attention",
]


class GestureTrainer:
    """
    Production machine learning training pipeline for time-series gesture classification.
    Supports feature extraction, synthetic trajectory augmentation, multi-class model training,
    comprehensive metrics evaluation, and model artifact versioning.
    """

    def __init__(self):
        self._models_dir = settings.recordings_directory / "models"
        self._models_dir.mkdir(parents=True, exist_ok=True)
        self._samples_dir = settings.recordings_directory / "samples"
        self._samples_dir.mkdir(parents=True, exist_ok=True)

    def generate_synthetic_trajectory(self, gesture_name: str, sequence_length: int = 30) -> np.ndarray:
        """
        Generate realistic synthetic 3D pose and landmark time-series for bootstrapping
        and data augmentation.
        """
        t = np.linspace(0, 2 * np.pi, sequence_length)
        noise = lambda scale=0.03: np.random.normal(0, scale, sequence_length)

        # Baseline angles
        yaw = np.zeros(sequence_length) + noise(0.5)
        pitch = np.zeros(sequence_length) + noise(0.5)
        roll = np.zeros(sequence_length) + noise(0.5)

        g_lower = gesture_name.lower().strip()
        if g_lower in ("yes_nod", "nod", "yes"):
            # Vertical sinusoidal pitch nod (amplitude 15° to 25°)
            amp = random.uniform(18.0, 26.0)
            freq = random.uniform(1.8, 2.4)
            pitch = amp * np.sin(freq * t) + noise(0.8)
        elif g_lower in ("no_shake", "shake", "no"):
            # Horizontal sinusoidal yaw shake (amplitude 20° to 35°)
            amp = random.uniform(22.0, 34.0)
            freq = random.uniform(1.8, 2.4)
            yaw = amp * np.sin(freq * t) + noise(0.8)
        elif "tilt_left" in g_lower:
            roll = -random.uniform(15.0, 28.0) * np.sin(0.8 * t + 0.5) + noise(0.5)
        elif "tilt_right" in g_lower:
            roll = random.uniform(15.0, 28.0) * np.sin(0.8 * t + 0.5) + noise(0.5)
        elif "look_away" in g_lower:
            yaw = random.uniform(30.0, 45.0) * np.ones(sequence_length) + noise(1.0)
            pitch = random.uniform(-10.0, 10.0) * np.ones(sequence_length) + noise(1.0)
        elif "attention" in g_lower:
            yaw = noise(0.4)
            pitch = noise(0.4)
            roll = noise(0.4)

        # Compute angular velocities
        dyaw = np.gradient(yaw, 1.0 / 30.0)
        dpitch = np.gradient(pitch, 1.0 / 30.0)
        droll = np.gradient(roll, 1.0 / 30.0)

        # Generate 12 normalized landmark coordinates (relative to face box)
        norm_landmarks = []
        for i in range(12):
            base_val = (i % 4 - 1.5) * 0.2
            landmark_series = base_val + 0.05 * (yaw / 30.0) + noise(0.01)
            norm_landmarks.append(landmark_series)

        # Assemble (sequence_length, 18)
        feature_cols = [yaw, pitch, roll, dyaw, dpitch, droll] + norm_landmarks
        matrix = np.column_stack(feature_cols).astype(np.float32)
        return matrix

    def extract_features_from_sample(self, raw_sequence: Any, target_length: int = 30) -> np.ndarray:
        """
        Transform a variable-length time-series (T, F) into a fixed-length feature representation.
        Pads/interpolates to 30 frames and 18 features, then computes statistical summary features + flattened series.
        Output is guaranteed to be a 1D float32 numpy array of shape (630,).
        """
        try:
            seq = np.array(raw_sequence, dtype=np.float32)
        except Exception:
            return np.zeros(630, dtype=np.float32)

        if seq.ndim == 1:
            if seq.size % 18 == 0 and seq.size > 0:
                seq = seq.reshape(-1, 18)
            else:
                seq = seq.reshape(-1, 1)

        if seq.ndim != 2:
            return np.zeros(630, dtype=np.float32)

        cur_len, num_features = seq.shape
        if cur_len == 0:
            return np.zeros(630, dtype=np.float32)

        # Standardize columns to exactly 18 features
        if num_features != 18:
            fixed_cols = np.zeros((cur_len, 18), dtype=np.float32)
            cols_to_copy = min(18, num_features)
            fixed_cols[:, :cols_to_copy] = seq[:, :cols_to_copy]
            seq = fixed_cols
            num_features = 18

        # Resample / interpolate temporal length to target_length (30)
        if cur_len != target_length:
            if cur_len == 1:
                seq = np.repeat(seq, target_length, axis=0)
            else:
                x_old = np.linspace(0, 1, cur_len)
                x_new = np.linspace(0, 1, target_length)
                resampled = np.zeros((target_length, 18), dtype=np.float32)
                for f_idx in range(18):
                    resampled[:, f_idx] = np.interp(x_new, x_old, seq[:, f_idx])
                seq = resampled

        # Flattened sequence (30 * 18 = 540)
        flattened = seq.flatten()

        # Statistical features (18 * 5 = 90)
        f_mean = np.mean(seq, axis=0)
        f_std = np.std(seq, axis=0)
        f_min = np.min(seq, axis=0)
        f_max = np.max(seq, axis=0)
        f_ptp = f_max - f_min

        stats = np.concatenate([f_mean, f_std, f_min, f_max, f_ptp])
        out = np.concatenate([flattened, stats]).astype(np.float32)

        if out.shape != (630,):
            out = np.resize(out, (630,))
        return out

    async def collect_training_dataset(
        self,
        db: AsyncSession,
        dataset_id: Optional[str] = None,
        min_samples_per_class: int = 25,
    ) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """
        Load dataset samples from database and disk.
        Automatically augments classes with realistic synthetic trajectories if count < min_samples_per_class.
        """
        # 1. Fetch available samples from database
        stmt = select(SampleModel, GestureModel.name).join(
            GestureModel, SampleModel.gesture_id == GestureModel.id
        )
        if dataset_id:
            stmt = stmt.where(SampleModel.dataset_id == dataset_id)

        res = await db.execute(stmt)
        rows = res.all()

        samples_by_class: Dict[str, List[np.ndarray]] = {g: [] for g in STANDARD_GESTURES}

        for sample, g_name in rows:
            clean_name = g_name.lower().strip()
            if clean_name in ("nod", "yes"):
                clean_name = "yes_nod"
            elif clean_name in ("shake", "no"):
                clean_name = "no_shake"

            if clean_name not in samples_by_class:
                samples_by_class[clean_name] = []

            # Load .npy file
            if sample.feature_file and os.path.exists(sample.feature_file):
                try:
                    arr = np.load(sample.feature_file)
                    samples_by_class[clean_name].append(arr)
                except Exception as exc:
                    logger.warning("Could not read sample %s: %s", sample.feature_file, exc)

        # 2. Augment / seed classes to ensure balanced representation
        for g_name in STANDARD_GESTURES:
            cur_count = len(samples_by_class[g_name])
            needed = max(0, min_samples_per_class - cur_count)
            for _ in range(needed):
                synth_seq = self.generate_synthetic_trajectory(g_name, sequence_length=30)
                samples_by_class[g_name].append(synth_seq)

        # 3. Extract feature vectors and labels
        X_list = []
        y_list = []
        class_labels = sorted(list(samples_by_class.keys()))

        for class_idx, g_name in enumerate(class_labels):
            for seq in samples_by_class[g_name]:
                feat_vec = self.extract_features_from_sample(seq)
                X_list.append(feat_vec)
                y_list.append(class_idx)

        X = np.array(X_list, dtype=np.float32)
        y = np.array(y_list, dtype=np.int64)

        logger.info(
            "Prepared training dataset: %d samples across %d classes (%s)",
            len(y),
            len(class_labels),
            ", ".join(class_labels),
        )
        return X, y, class_labels

    async def train(
        self,
        db: Optional[AsyncSession] = None,
        dataset_id: Optional[str] = None,
        model_name: str = "Gesture-RF-Classifier",
        model_type: str = "sklearn_rf",
        n_estimators: int = 100,
        max_depth: Optional[int] = 15,
        set_active: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute full machine learning training, validation, metrics generation,
        and persist versioned model artifacts.
        """
        if db is None:
            async with AsyncSessionLocal() as session:
                return await self.train(
                    db=session,
                    dataset_id=dataset_id,
                    model_name=model_name,
                    model_type=model_type,
                    n_estimators=n_estimators,
                    max_depth=max_depth,
                    set_active=set_active,
                )

        start_time = time.time()
        model_id = str(uuid.uuid4())
        version_tag = f"v{int(time.time()) % 10000:04d}"

        # 1. Prepare Dataset
        X, y, class_labels = await self.collect_training_dataset(db, dataset_id=dataset_id)

        # 2. Stratified Train / Val / Test Split (70% Train, 15% Val, 15% Test)
        X_train, X_temp, y_train, y_temp = train_test_split(
            X, y, test_size=0.30, random_state=42, stratify=y
        )
        X_val, X_test, y_val, y_test = train_test_split(
            X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
        )

        # 3. Build Model Pipeline
        if model_type == "sklearn_mlp":
            classifier = MLPClassifier(
                hidden_layer_sizes=(128, 64),
                max_iter=300,
                random_state=42,
            )
        elif model_type == "sklearn_gb":
            classifier = GradientBoostingClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth or 5,
                random_state=42,
            )
        else:
            classifier = RandomForestClassifier(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=42,
                n_jobs=-1,
            )

        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", classifier),
        ])

        # 4. Fit Model
        pipeline.fit(X_train, y_train)

        # 5. Evaluate Metrics
        train_preds = pipeline.predict(X_train)
        val_preds = pipeline.predict(X_val)
        test_preds = pipeline.predict(X_test)

        train_acc = float(np.mean(train_preds == y_train))
        val_acc = float(np.mean(val_preds == y_val))
        test_acc = float(np.mean(test_preds == y_test))

        macro_f1 = float(f1_score(y_test, test_preds, average="macro", zero_division=0))
        macro_prec = float(precision_score(y_test, test_preds, average="macro", zero_division=0))
        macro_rec = float(recall_score(y_test, test_preds, average="macro", zero_division=0))

        cm = confusion_matrix(y_test, test_preds, labels=list(range(len(class_labels))))
        cm_list = cm.tolist()

        training_duration = round(time.time() - start_time, 2)

        # 6. Save Model Bundle Artifacts
        model_dir = self._models_dir / model_id
        model_dir.mkdir(parents=True, exist_ok=True)
        model_file = model_dir / "model.joblib"
        joblib.dump(pipeline, str(model_file))

        metrics_data = {
            "train_accuracy": round(train_acc, 4),
            "val_accuracy": round(val_acc, 4),
            "test_accuracy": round(test_acc, 4),
            "macro_f1": round(macro_f1, 4),
            "macro_precision": round(macro_prec, 4),
            "macro_recall": round(macro_rec, 4),
            "class_labels": class_labels,
            "confusion_matrix": cm_list,
            "training_time_seconds": training_duration,
            "sample_count": len(y),
        }

        feature_schema = {
            "version": "1.0",
            "sequence_length": 30,
            "raw_features_per_frame": 18,
            "total_feature_dimensions": int(X.shape[1]),
            "feature_names": [
                "yaw", "pitch", "roll", "dyaw", "dpitch", "droll",
                "left_eye_x", "left_eye_y", "right_eye_x", "right_eye_y",
                "nose_x", "nose_y", "mouth_left_x", "mouth_left_y",
                "mouth_right_x", "mouth_right_y", "chin_x", "chin_y",
            ],
            "class_labels": class_labels,
        }

        # Save metadata.json and evaluation.json
        with open(model_dir / "metadata.json", "w") as fp:
            json.dump(
                {
                    "model_id": model_id,
                    "name": model_name,
                    "version": version_tag,
                    "model_type": model_type,
                    "created_at": time.time(),
                    "dataset_id": dataset_id,
                    "feature_schema": feature_schema,
                },
                fp,
                indent=2,
            )

        with open(model_dir / "evaluation.json", "w") as fp:
            json.dump(metrics_data, fp, indent=2)

        # 7. Persist in Database
        if set_active:
            # Set all prior active models to ready
            await db.execute(
                update(ModelVersionModel)
                .where(ModelVersionModel.status == "active")
                .values(status="ready")
            )

        model_record = ModelVersionModel(
            id=model_id,
            name=model_name,
            version=version_tag,
            model_type=model_type,
            model_file=str(model_file),
            feature_schema=feature_schema,
            metrics=metrics_data,
            status="active" if set_active else "ready",
            dataset_id=dataset_id,
        )
        db.add(model_record)
        await db.commit()

        logger.info(
            "Model training complete: %s (%s) - Test Acc: %.2f%%, F1: %.2f in %.2fs",
            model_name,
            version_tag,
            test_acc * 100,
            macro_f1,
            training_duration,
        )

        return {
            "id": model_id,
            "name": model_name,
            "version": version_tag,
            "model_type": model_type,
            "status": model_record.status,
            "dataset_id": dataset_id,
            "model_file": str(model_file),
            "metrics": metrics_data,
            "created_at": model_record.created_at.isoformat() if model_record.created_at else None,
        }

    async def list_models(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """List all trained model versions from database."""
        stmt = select(ModelVersionModel).order_by(ModelVersionModel.created_at.desc())
        res = await db.execute(stmt)
        models = res.scalars().all()
        output = []
        for m in models:
            output.append({
                "id": m.id,
                "name": m.name,
                "version": m.version,
                "model_type": m.model_type,
                "status": m.status,
                "dataset_id": m.dataset_id,
                "model_file": m.model_file,
                "metrics": m.metrics,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })
        return output

    async def get_model(self, model_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """Retrieve details and metrics for a specific model version."""
        stmt = select(ModelVersionModel).where(ModelVersionModel.id == model_id)
        res = await db.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return {
            "id": m.id,
            "name": m.name,
            "version": m.version,
            "model_type": m.model_type,
            "status": m.status,
            "dataset_id": m.dataset_id,
            "model_file": m.model_file,
            "metrics": m.metrics,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }

    async def activate_model(self, model_id: str, db: AsyncSession) -> bool:
        """Set a specified model version as the active model for live inference."""
        stmt = select(ModelVersionModel).where(ModelVersionModel.id == model_id)
        res = await db.execute(stmt)
        target = res.scalar_one_or_none()
        if not target:
            return False

        # Demote all current active models
        await db.execute(
            update(ModelVersionModel)
            .where(ModelVersionModel.status == "active")
            .values(status="ready")
        )

        target.status = "active"
        await db.commit()
        return True

    async def delete_model(self, model_id: str, db: AsyncSession) -> bool:
        """Delete a model version and its serialized artifacts on disk."""
        stmt = select(ModelVersionModel).where(ModelVersionModel.id == model_id)
        res = await db.execute(stmt)
        target = res.scalar_one_or_none()
        if not target:
            return False

        model_dir = self._models_dir / model_id
        if model_dir.exists():
            import shutil
            shutil.rmtree(str(model_dir), ignore_errors=True)

        await db.delete(target)
        await db.commit()
        return True


def get_gesture_trainer() -> GestureTrainer:
    return GestureTrainer()
