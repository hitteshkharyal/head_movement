import axios from "axios";

export interface VisionStatus {
  camera_running: boolean;
  is_tracking: boolean;
  tracking_mode: string;
  fps: number;
  face_detected: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  confidence: number;
  bbox: [number, number, number, number];
  sensitivity: number;
  smoothing_alpha: number;
  dead_zone: number;
}

export interface VisionConfigUpdate {
  sensitivity?: number;
  smoothing_alpha?: number;
  dead_zone?: number;
  mode?: string;
}

const API_BASE = "/api/v1/vision";

export const visionService = {
  async getStatus(): Promise<VisionStatus> {
    const res = await axios.get<VisionStatus>(`${API_BASE}/status`);
    return res.data;
  },

  async startTracking(mode = "mirror"): Promise<VisionStatus> {
    const res = await axios.post<VisionStatus>(`${API_BASE}/tracking/start`, { mode });
    return res.data;
  },

  async stopTracking(): Promise<VisionStatus> {
    const res = await axios.post<VisionStatus>(`${API_BASE}/tracking/stop`);
    return res.data;
  },

  async updateConfig(config: VisionConfigUpdate): Promise<VisionStatus> {
    const res = await axios.put<VisionStatus>(`${API_BASE}/config`, config);
    return res.data;
  },

  getStreamUrl(overlay = true): string {
    return `${API_BASE}/stream?overlay=${overlay}`;
  },
};
