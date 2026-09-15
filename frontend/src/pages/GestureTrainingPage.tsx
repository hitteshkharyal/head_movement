import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  gestureService,
  GestureClass,
  GestureSample,
  Dataset,
  ActiveLearningItem,
  RecordStatus,
} from "../services/gestureService";
import {
  trainingService,
  ModelVersion,
  ModelMetrics,
} from "../services/trainingService";
import "./GestureTrainingPage.css";

export default function GestureTrainingPage() {
  const [classes, setClasses] = useState<GestureClass[]>([]);
  const [samples, setSamples] = useState<GestureSample[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeQueue, setActiveQueue] = useState<ActiveLearningItem[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelVersion | null>(null);

  // Studio Recording State
  const [selectedClass, setSelectedClass] = useState<string>("yes_nod");
  const [sequenceLength, setSequenceLength] = useState<number>(30);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3);
  const [recordingStatus, setRecordingStatus] = useState<RecordStatus>({
    status: "idle",
    countdown_remaining: 0,
    frames_captured: 0,
    total_frames: 30,
    duration_seconds: 0,
  });

  // Training State
  const [isTraining, setIsTraining] = useState(false);
  const [modelType, setModelType] = useState<string>("sklearn_rf");
  const [trainingEstimators, setTrainingEstimators] = useState<number>(100);

  const [newDatasetName, setNewDatasetName] = useState("");
  const [showNewDatasetModal, setShowNewDatasetModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [clsData, smpData, dsData, alData, mdlData] = await Promise.all([
        gestureService.getClasses(),
        gestureService.getSamples(),
        gestureService.getDatasets(),
        gestureService.getActiveLearningQueue(),
        trainingService.getModels(),
      ]);
      setClasses(clsData || []);
      setSamples(smpData || []);
      setDatasets(dsData || []);
      setActiveQueue(alData || []);
      setModels(mdlData || []);

      if (mdlData && mdlData.length > 0) {
        const active = mdlData.find((m) => m.status === "active") || mdlData[0];
        setSelectedModel(active);
      }

      if (clsData && clsData.length > 0) {
        setSelectedClass(clsData[0].name);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load gesture and training data");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling recording status when active
  useEffect(() => {
    if (recordingStatus.status === "countdown" || recordingStatus.status === "recording") {
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const st = await gestureService.getRecordingStatus();
          setRecordingStatus(st);
          if (st.status === "completed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setSuccessMsg(`Gesture sample recorded successfully for '${st.gesture_name}'!`);
            if (st.feature_file_path && st.gesture_name) {
              await gestureService.createSample({
                gesture_name: st.gesture_name,
                feature_file: st.feature_file_path,
                frame_count: st.frames_captured,
                duration: st.duration_seconds,
              });
              await loadData();
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 100);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [recordingStatus.status, loadData]);

  const handleStartRecording = async () => {
    try {
      setError(null);
      setSuccessMsg(null);
      const st = await gestureService.startRecording(
        selectedClass,
        sequenceLength,
        countdownSeconds
      );
      setRecordingStatus(st);
    } catch (err: any) {
      setError(err?.message || "Failed to start recording");
    }
  };

  const handleCancelRecording = async () => {
    try {
      const st = await gestureService.cancelRecording();
      setRecordingStatus(st);
    } catch (err: any) {
      setError(err?.message || "Failed to cancel recording");
    }
  };

  const handleDeleteSample = async (id: string) => {
    try {
      await gestureService.deleteSample(id);
      setSamples((prev) => prev.filter((s) => s.id !== id));
      setSuccessMsg("Sample deleted");
    } catch (err: any) {
      setError(err?.message || "Failed to delete sample");
    }
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim()) return;
    try {
      await gestureService.createDataset({
        name: newDatasetName,
        version: "1.0",
      });
      setNewDatasetName("");
      setShowNewDatasetModal(false);
      await loadData();
      setSuccessMsg("Dataset created successfully");
    } catch (err: any) {
      setError(err?.message || "Failed to create dataset");
    }
  };

  const handleLabelActiveLearning = async (sampleId: string, label: string) => {
    try {
      await gestureService.labelActiveLearningSample(sampleId, label);
      setActiveQueue((prev) => prev.filter((item) => item.id !== sampleId));
      await loadData();
      setSuccessMsg(`Sample confirmed and labeled as '${label}'`);
    } catch (err: any) {
      setError(err?.message || "Failed to label active learning item");
    }
  };

  // --- MODEL TRAINING HANDLERS ---

  const handleTrainModel = async () => {
    try {
      setIsTraining(true);
      setError(null);
      setSuccessMsg(null);
      const trained = await trainingService.trainModel({
        model_type: modelType,
        n_estimators: trainingEstimators,
        model_name: `Gesture-${modelType === "sklearn_mlp" ? "MLP" : modelType === "sklearn_gb" ? "GB" : "RF"}-Model`,
      });
      setSuccessMsg(`🎉 Model ${trained.version} trained successfully! Test Accuracy: ${((trained.metrics?.test_accuracy || 0) * 100).toFixed(1)}%`);
      setSelectedModel(trained);
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Model training failed");
    } finally {
      setIsTraining(false);
    }
  };

  const handleActivateModel = async (modelId: string) => {
    try {
      await trainingService.activateModel(modelId);
      setSuccessMsg("Model activated for live inference!");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to activate model");
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await trainingService.deleteModel(modelId);
      if (selectedModel?.id === modelId) setSelectedModel(null);
      setSuccessMsg("Model version deleted");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to delete model");
    }
  };

  const isRecordingActive =
    recordingStatus.status === "countdown" || recordingStatus.status === "recording";

  return (
    <div className="gesture-training" data-testid="gesture-training-page">
      {/* Header */}
      <div className="gesture-training__header">
        <div>
          <h1 className="gesture-training__title">Gesture Studio & ML Training</h1>
          <p className="gesture-training__subtitle">
            Capture 3D motion samples, train machine learning classifiers, and manage active learning queues
          </p>
        </div>
        <div className="gesture-training__header-actions">
          <button className="btn btn--secondary" onClick={() => setShowNewDatasetModal(true)}>
            📁 New Dataset
          </button>
          <button
            className="btn btn--primary"
            disabled={isTraining}
            onClick={handleTrainModel}
            title="Train a new ML model version on current gesture samples"
          >
            {isTraining ? "⏳ Training Model..." : "🧠 Train Model Now"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button className="btn btn--small" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="success-banner" role="status">
          <span>✅ {successMsg}</span>
          <button className="btn btn--small" onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {/* Grid Layout */}
      <div className="gesture-training__grid">
        {/* Left Column: Recording Studio & ML Training Studio */}
        <div className="gesture-training__main-column">
          {/* Studio Recording Card */}
          <div className="card studio-card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Motion Recording Studio</h2>
                <span className="card__subtitle">Capture high-frequency 3D head pose and landmark sequences</span>
              </div>
              <span className={`status-pill status-pill--${recordingStatus.status}`}>
                {recordingStatus.status.toUpperCase()}
              </span>
            </div>

            {/* Countdown / Recording HUD Overlay */}
            {isRecordingActive && (
              <div className="recording-hud">
                {recordingStatus.status === "countdown" ? (
                  <div className="recording-hud__countdown">
                    <span className="countdown-number">
                      {Math.ceil(recordingStatus.countdown_remaining)}
                    </span>
                    <span className="countdown-label">Get Ready to Perform Gesture...</span>
                  </div>
                ) : (
                  <div className="recording-hud__recording">
                    <div className="rec-indicator">
                      <div className="rec-dot rec-dot--pulsing" />
                      <span>RECORDING MOTION: {recordingStatus.gesture_name?.toUpperCase()}</span>
                    </div>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${(recordingStatus.frames_captured / recordingStatus.total_frames) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="frame-counter">
                      {recordingStatus.frames_captured} / {recordingStatus.total_frames} Frames
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            <div className="studio-controls">
              <div className="form-row">
                <div className="form-group">
                  <label>Target Gesture Class</label>
                  <select
                    disabled={isRecordingActive}
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.sample_count} samples)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Sequence Length</label>
                  <select
                    disabled={isRecordingActive}
                    value={sequenceLength}
                    onChange={(e) => setSequenceLength(Number(e.target.value))}
                  >
                    <option value={20}>20 Frames (~0.7s)</option>
                    <option value={30}>30 Frames (~1.0s - Recommended)</option>
                    <option value={45}>45 Frames (~1.5s)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Pre-Roll Countdown</label>
                  <select
                    disabled={isRecordingActive}
                    value={countdownSeconds}
                    onChange={(e) => setCountdownSeconds(Number(e.target.value))}
                  >
                    <option value={1}>1 Second</option>
                    <option value={3}>3 Seconds (Default)</option>
                    <option value={5}>5 Seconds</option>
                  </select>
                </div>
              </div>

              <div className="studio-actions">
                {isRecordingActive ? (
                  <button className="btn btn--danger" onClick={handleCancelRecording}>
                    ✕ Cancel Recording
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={handleStartRecording}>
                    ⏺️ Start Motion Recording
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ML Model Training Studio Card */}
          <div className="card training-studio-card">
            <div className="card__header">
              <div>
                <h2 className="card__title">🧠 ML Model Training Studio</h2>
                <span className="card__subtitle">Train multi-class gesture models, inspect confusion matrices, and manage deployments</span>
              </div>
              <span className="badge badge--success">{models.length} Models Trained</span>
            </div>

            {/* Model Configuration & Train Action */}
            <div className="training-controls-row">
              <div className="form-group">
                <label>Model Architecture</label>
                <select
                  disabled={isTraining}
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                >
                  <option value="sklearn_rf">Random Forest (Fast & Robust)</option>
                  <option value="sklearn_gb">Gradient Boosting (High Precision)</option>
                  <option value="sklearn_mlp">Multi-Layer Perceptron (Neural Net)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Estimators / Iterations</label>
                <select
                  disabled={isTraining}
                  value={trainingEstimators}
                  onChange={(e) => setTrainingEstimators(Number(e.target.value))}
                >
                  <option value={50}>50 Trees (Ultra-fast)</option>
                  <option value={100}>100 Trees (Balanced)</option>
                  <option value={200}>200 Trees (Deep)</option>
                </select>
              </div>

              <div className="form-group training-submit-group">
                <button
                  className="btn btn--primary"
                  disabled={isTraining}
                  onClick={handleTrainModel}
                >
                  {isTraining ? "⏳ Training..." : "🚀 Train New Model"}
                </button>
              </div>
            </div>

            {/* Model Versions List Table */}
            <div className="model-versions-wrapper">
              <h3 className="section-subtitle">Trained Model Versions</h3>
              {models.length === 0 ? (
                <div className="empty-state">
                  <span>No models trained yet. Click "Train New Model" to train your first gesture classifier.</span>
                </div>
              ) : (
                <div className="models-table-container">
                  <table className="models-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Architecture</th>
                        <th>Status</th>
                        <th>Test Acc</th>
                        <th>Macro F1</th>
                        <th>Training Time</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m) => (
                        <tr
                          key={m.id}
                          className={selectedModel?.id === m.id ? "model-row--selected" : ""}
                          onClick={() => setSelectedModel(m)}
                        >
                          <td>
                            <strong>{m.version}</strong>
                            <span className="model-name-sub">{m.name}</span>
                          </td>
                          <td>
                            <code>{m.model_type}</code>
                          </td>
                          <td>
                            <span className={`status-badge status-badge--${m.status}`}>
                              {m.status.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className="metric-highlight">
                              {m.metrics?.test_accuracy ? `${(m.metrics.test_accuracy * 100).toFixed(1)}%` : "N/A"}
                            </span>
                          </td>
                          <td>{m.metrics?.macro_f1 ? m.metrics.macro_f1.toFixed(3) : "N/A"}</td>
                          <td>{m.metrics?.training_time_seconds ? `${m.metrics.training_time_seconds}s` : "N/A"}</td>
                          <td>
                            <div className="table-actions">
                              {m.status !== "active" && (
                                <button
                                  className="btn btn--small btn--primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleActivateModel(m.id);
                                  }}
                                  title="Deploy this model for live inference"
                                >
                                  Deploy Active
                                </button>
                              )}
                              <button
                                className="btn btn--icon btn--danger-subtle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteModel(m.id);
                                }}
                                title="Delete Model"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Detailed Confusion Matrix & Metrics Display for Selected Model */}
            {selectedModel && selectedModel.metrics && (
              <div className="model-metrics-panel">
                <div className="metrics-panel-header">
                  <div>
                    <h3 className="section-subtitle">Evaluation Metrics: {selectedModel.version}</h3>
                    <span className="metrics-sub">
                      Trained on {selectedModel.metrics.sample_count} samples across {selectedModel.metrics.class_labels.length} classes
                    </span>
                  </div>
                  <div className="metric-pills-row">
                    <div className="metric-pill">
                      <span className="metric-pill__label">Train Acc</span>
                      <span className="metric-pill__value">{((selectedModel.metrics.train_accuracy || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="metric-pill">
                      <span className="metric-pill__label">Val Acc</span>
                      <span className="metric-pill__value">{((selectedModel.metrics.val_accuracy || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="metric-pill">
                      <span className="metric-pill__label">Test Acc</span>
                      <span className="metric-pill__value metric-pill__value--good">
                        {((selectedModel.metrics.test_accuracy || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-pill">
                      <span className="metric-pill__label">Macro F1</span>
                      <span className="metric-pill__value">{(selectedModel.metrics.macro_f1 || 0).toFixed(3)}</span>
                    </div>
                  </div>
                </div>

                {/* Confusion Matrix Heatmap Table */}
                {selectedModel.metrics.confusion_matrix && (
                  <div className="confusion-matrix-wrapper">
                    <h4 className="matrix-title">Confusion Matrix (Predicted vs Actual)</h4>
                    <div className="matrix-scroll">
                      <table className="confusion-matrix-table">
                        <thead>
                          <tr>
                            <th className="matrix-corner">Actual \ Pred</th>
                            {selectedModel.metrics.class_labels.map((lbl) => (
                              <th key={lbl} className="matrix-col-header">{lbl}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedModel.metrics.confusion_matrix.map((row, rIdx) => (
                            <tr key={selectedModel.metrics!.class_labels[rIdx]}>
                              <th className="matrix-row-header">{selectedModel.metrics!.class_labels[rIdx]}</th>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`matrix-cell ${rIdx === cIdx ? "matrix-cell--diag" : cell > 0 ? "matrix-cell--error" : ""}`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Learning & Dataset Samples */}
        <div className="gesture-training__side-column">
          {/* Active Learning Queue */}
          <div className="card active-learning-card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Active Learning Queue</h2>
                <span className="card__subtitle">Ambiguous / low-confidence live samples needing human label review</span>
              </div>
              <span className="badge badge--warning">{activeQueue.length} Pending</span>
            </div>

            {activeQueue.length === 0 ? (
              <div className="empty-state">
                <span>All inference detections confident. No items in review queue.</span>
              </div>
            ) : (
              <div className="al-items-list">
                {activeQueue.map((item) => (
                  <div key={item.id} className="al-item">
                    <div className="al-item__info">
                      <div className="al-item__gesture">
                        <strong>{item.predicted_gesture}</strong>
                        <span className="al-confidence">{(item.confidence * 100).toFixed(1)}% Conf</span>
                      </div>
                      <span className="al-entropy">Entropy: {item.entropy.toFixed(2)}</span>
                    </div>

                    <div className="al-item__actions">
                      <button
                        className="btn btn--small btn--success"
                        onClick={() => handleLabelActiveLearning(item.id, item.predicted_gesture)}
                      >
                        ✓ Confirm
                      </button>
                      <select
                        className="al-select"
                        onChange={(e) => {
                          if (e.target.value) handleLabelActiveLearning(item.id, e.target.value);
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Re-label...</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recorded Samples Table */}
          <div className="card samples-card">
            <div className="card__header">
              <h2 className="card__title">Recorded Dataset Samples</h2>
              <span className="badge">{samples.length} Total</span>
            </div>

            {samples.length === 0 ? (
              <div className="empty-state">
                <span>No gesture samples recorded yet. Use the studio to record your first motion.</span>
              </div>
            ) : (
              <div className="samples-table-wrapper">
                <table className="samples-table">
                  <thead>
                    <tr>
                      <th>Gesture</th>
                      <th>Frames</th>
                      <th>Duration</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="gesture-tag">{s.gesture_name}</span>
                        </td>
                        <td>{s.frame_count || 30}</td>
                        <td>{s.duration ? `${s.duration}s` : "1.0s"}</td>
                        <td>
                          <button
                            className="btn btn--icon btn--danger-subtle"
                            title="Delete Sample"
                            onClick={() => handleDeleteSample(s.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Dataset Modal */}
      {showNewDatasetModal && (
        <div className="modal-backdrop">
          <div className="modal card">
            <div className="card__header">
              <h2 className="card__title">Create Training Dataset</h2>
              <button className="btn btn--icon" onClick={() => setShowNewDatasetModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateDataset} className="modal-form">
              <div className="form-group">
                <label>Dataset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Presentation Gestures v1"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowNewDatasetModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Create Dataset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}