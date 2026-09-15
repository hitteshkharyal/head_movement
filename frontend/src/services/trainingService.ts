import axios from "axios";

export interface ModelMetrics {
  train_accuracy: number;
  val_accuracy: number;
  test_accuracy: number;
  macro_f1: number;
  macro_precision: number;
  macro_recall: number;
  class_labels: string[];
  confusion_matrix: number[][];
  training_time_seconds: number;
  sample_count: number;
}

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  model_type: string;
  status: string; // 'training' | 'ready' | 'active' | 'archived'
  dataset_id?: string | null;
  model_file?: string | null;
  metrics?: ModelMetrics | null;
  created_at?: string | null;
}

export interface InferenceStatus {
  active_model_id?: string | null;
  active_model_name?: string | null;
  active_model_version?: string | null;
  buffer_frames: number;
  buffer_capacity: number;
  is_ready: boolean;
  last_detected_gesture?: string | null;
  last_confidence: number;
  is_cooldown_active: boolean;
  cooldown_remaining_sec: number;
  autonomous_reaction_enabled: boolean;
}

export interface TrainModelParams {
  dataset_id?: string;
  model_name?: string;
  model_type?: string;
  n_estimators?: number;
  max_depth?: number;
}

const API_TRAINING = "/api/v1/training";
const API_PREDICTIONS = "/api/v1/predictions";

export const trainingService = {
  async trainModel(params: TrainModelParams = {}): Promise<ModelVersion> {
    const res = await axios.post<ModelVersion>(`${API_TRAINING}/train`, {
      dataset_id: params.dataset_id,
      model_name: params.model_name || "Gesture-RF-Classifier",
      model_type: params.model_type || "sklearn_rf",
      n_estimators: params.n_estimators || 100,
      max_depth: params.max_depth || 15,
    });
    return res.data;
  },

  async getModels(): Promise<ModelVersion[]> {
    const res = await axios.get<ModelVersion[]>(`${API_TRAINING}/models`);
    return res.data;
  },

  async getModelDetails(modelId: string): Promise<ModelVersion> {
    const res = await axios.get<ModelVersion>(`${API_TRAINING}/models/${modelId}`);
    return res.data;
  },

  async activateModel(modelId: string): Promise<{ status: string; model_id: string }> {
    const res = await axios.post<{ status: string; model_id: string }>(`${API_TRAINING}/models/${modelId}/activate`);
    return res.data;
  },

  async deleteModel(modelId: string): Promise<{ status: string; model_id: string }> {
    const res = await axios.delete<{ status: string; model_id: string }>(`${API_TRAINING}/models/${modelId}`);
    return res.data;
  },

  async getInferenceStatus(): Promise<InferenceStatus> {
    const res = await axios.get<InferenceStatus>(`${API_PREDICTIONS}/status`);
    return res.data;
  },

  async toggleAutonomousReaction(enabled: boolean): Promise<InferenceStatus> {
    const res = await axios.post<InferenceStatus>(`${API_PREDICTIONS}/autonomous-reaction`, { enabled });
    return res.data;
  },
};
