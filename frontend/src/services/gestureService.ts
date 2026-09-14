import axios from "axios";

export interface GestureClass {
  id: string;
  name: string;
  description?: string;
  type: string;
  sample_count: number;
}

export interface RecordStatus {
  session_id?: string | null;
  gesture_name?: string | null;
  status: "idle" | "countdown" | "recording" | "completed" | "cancelled";
  countdown_remaining: number;
  frames_captured: number;
  total_frames: number;
  duration_seconds: number;
  feature_file_path?: string | null;
}

export interface GestureSample {
  id: string;
  dataset_id: string;
  gesture_id: string;
  gesture_name: string;
  feature_file?: string | null;
  frame_count?: number | null;
  duration?: number | null;
  created_at?: string | null;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  version: string;
  status: string;
  sample_count: number;
}

export interface ActiveLearningItem {
  id: string;
  predicted_gesture: string;
  confidence: number;
  entropy: number;
  feature_file: string;
  created_at: number;
}

const API_BASE = "/api/v1/gestures";

export const gestureService = {
  async getClasses(): Promise<GestureClass[]> {
    const res = await axios.get<GestureClass[]>(`${API_BASE}/classes`);
    return res.data;
  },

  async startRecording(
    gestureName: string,
    sequenceLength = 30,
    countdownSeconds = 3.0
  ): Promise<RecordStatus> {
    const res = await axios.post<RecordStatus>(`${API_BASE}/record/start`, {
      gesture_name: gestureName,
      sequence_length: sequenceLength,
      countdown_seconds: countdownSeconds,
    });
    return res.data;
  },

  async getRecordingStatus(): Promise<RecordStatus> {
    const res = await axios.get<RecordStatus>(`${API_BASE}/record/status`);
    return res.data;
  },

  async cancelRecording(): Promise<RecordStatus> {
    const res = await axios.post<RecordStatus>(`${API_BASE}/record/cancel`);
    return res.data;
  },

  async getSamples(gestureName?: string, datasetId?: string): Promise<GestureSample[]> {
    const params: any = {};
    if (gestureName) params.gesture_name = gestureName;
    if (datasetId) params.dataset_id = datasetId;
    const res = await axios.get<GestureSample[]>(`${API_BASE}/samples`, { params });
    return res.data;
  },

  async createSample(sample: {
    gesture_name: string;
    dataset_id?: string;
    feature_file: string;
    frame_count: number;
    duration: number;
  }): Promise<GestureSample> {
    const res = await axios.post<GestureSample>(`${API_BASE}/samples`, sample);
    return res.data;
  },

  async deleteSample(sampleId: string): Promise<void> {
    await axios.delete(`${API_BASE}/samples/${sampleId}`);
  },

  async getDatasets(): Promise<Dataset[]> {
    const res = await axios.get<Dataset[]>(`${API_BASE}/datasets`);
    return res.data;
  },

  async createDataset(dataset: {
    name: string;
    description?: string;
    version?: string;
  }): Promise<Dataset> {
    const res = await axios.post<Dataset>(`${API_BASE}/datasets`, dataset);
    return res.data;
  },

  async getActiveLearningQueue(): Promise<ActiveLearningItem[]> {
    const res = await axios.get<ActiveLearningItem[]>(`${API_BASE}/active-learning`);
    return res.data;
  },

  async labelActiveLearningSample(
    sampleId: string,
    confirmedGesture: string
  ): Promise<GestureSample> {
    const res = await axios.post<GestureSample>(
      `${API_BASE}/active-learning/${sampleId}/label`,
      { confirmed_gesture: confirmedGesture }
    );
    return res.data;
  },
};
