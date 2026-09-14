import axios from "axios";

export interface ServoStatus {
  connected: boolean;
  controller_type: string;
  pan_angle: number;
  tilt_angle: number;
  is_moving: boolean;
  is_emergency_stopped: boolean;
  latency_ms: number;
  error?: string | null;
}

export interface ServoConfigItem {
  servo_name: string;
  axis: string;
  min_angle: number;
  max_angle: number;
  center_angle: number;
  speed: number;
  sensitivity: number;
  trim_offset: number;
  invert: boolean;
  dead_zone: number;
}

export interface EmergencyStopResult {
  status: string;
  emergency_stopped: boolean;
  message: string;
}

export interface HardwarePortItem {
  port: string;
  description: string;
  manufacturer?: string;
  hwid?: string;
}

export interface HardwareConnectResult {
  success: boolean;
  mode: string;
  port?: string | null;
  baud_rate?: number | null;
  host?: string | null;
  wifi_port?: number | null;
  connected: boolean;
  message: string;
}

export interface HardwarePingResult {
  success: boolean;
  latency_ms: number;
  controller_type: string;
  connected: boolean;
}

const API_BASE = "/api/v1/servos";

export const servoService = {
  async getStatus(): Promise<ServoStatus> {
    const res = await axios.get<ServoStatus>(`${API_BASE}/status`);
    return res.data;
  },

  async listPorts(): Promise<HardwarePortItem[]> {
    const res = await axios.get<HardwarePortItem[]>(`${API_BASE}/ports`);
    return res.data;
  },

  async connectHardware(
    mode: string,
    port = "COM3",
    baud_rate = 115200,
    host = "192.168.1.100",
    wifi_port = 8080,
  ): Promise<HardwareConnectResult> {
    const res = await axios.post<HardwareConnectResult>(`${API_BASE}/connect`, {
      mode,
      port,
      baud_rate,
      host,
      wifi_port,
    });
    return res.data;
  },


  async disconnectHardware(): Promise<HardwareConnectResult> {
    const res = await axios.post<HardwareConnectResult>(`${API_BASE}/disconnect`);
    return res.data;
  },

  async pingHardware(): Promise<HardwarePingResult> {
    const res = await axios.post<HardwarePingResult>(`${API_BASE}/ping`);
    return res.data;
  },

  async move(pan?: number, tilt?: number, speed = 100): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/move`, {
      pan_angle: pan,
      tilt_angle: tilt,
      speed,
      smooth: true,
    });
    return res.data;
  },

  async movePan(angle: number, speed = 100): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/pan`, { angle, speed });
    return res.data;
  },

  async moveTilt(angle: number, speed = 100): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/tilt`, { angle, speed });
    return res.data;
  },

  async center(): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/center`);
    return res.data;
  },

  async centerPan(): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/center/pan`);
    return res.data;
  },

  async centerTilt(): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/center/tilt`);
    return res.data;
  },

  async stop(): Promise<ServoStatus> {
    const res = await axios.post<ServoStatus>(`${API_BASE}/stop`);
    return res.data;
  },

  async emergencyStop(): Promise<EmergencyStopResult> {
    const res = await axios.post<EmergencyStopResult>(`${API_BASE}/emergency-stop`);
    return res.data;
  },

  async resume(): Promise<EmergencyStopResult> {
    const res = await axios.post<EmergencyStopResult>(`${API_BASE}/resume`);
    return res.data;
  },

  async getCalibration(): Promise<ServoConfigItem[]> {
    const res = await axios.get<ServoConfigItem[]>(`${API_BASE}/calibration`);
    return res.data;
  },

  async updateCalibration(servos: ServoConfigItem[]): Promise<ServoConfigItem[]> {
    const res = await axios.put<ServoConfigItem[]>(`${API_BASE}/calibration`, { servos });
    return res.data;
  },
};

