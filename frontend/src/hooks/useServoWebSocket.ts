import { useEffect, useRef, useState, useCallback } from "react";
import { ServoStatus } from "../services/servoService";

export interface TelemetryData {
  pan: number;
  tilt: number;
  is_moving: boolean;
  connected: boolean;
  controller_type: string;
  is_emergency_stopped: boolean;
  latency_ms: number;
}

export function useServoWebSocket(initialStatus?: ServoStatus) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    pan: initialStatus?.pan_angle ?? 90,
    tilt: initialStatus?.tilt_angle ?? 90,
    is_moving: initialStatus?.is_moving ?? false,
    connected: initialStatus?.connected ?? false,
    controller_type: initialStatus?.controller_type ?? "mock",
    is_emergency_stopped: initialStatus?.is_emergency_stopped ?? false,
    latency_ms: initialStatus?.latency_ms ?? 0,
  });

  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "telemetry" || data.type === "heartbeat") {
            setTelemetry((prev) => ({
              ...prev,
              pan: data.pan ?? prev.pan,
              tilt: data.tilt ?? prev.tilt,
              is_moving: data.is_moving ?? prev.is_moving,
              connected: data.connected ?? prev.connected,
              controller_type: data.controller_type ?? prev.controller_type,
              is_emergency_stopped: data.is_emergency_stopped ?? prev.is_emergency_stopped,
              latency_ms: data.latency_ms ?? prev.latency_ms,
            }));
          }
        } catch {
          // ignore non-json messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Attempt reconnect after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setWsConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendCommand = useCallback((cmd: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
      return true;
    }
    return false;
  }, []);

  return { telemetry, wsConnected, sendCommand, setTelemetry };
}
