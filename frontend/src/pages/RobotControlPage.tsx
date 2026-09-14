import React, { useEffect, useState, useCallback } from "react";
import {
  servoService,
  ServoStatus,
  ServoConfigItem,
  HardwarePortItem,
} from "../services/servoService";
import { useServoWebSocket } from "../hooks/useServoWebSocket";
import "./RobotControlPage.css";

export default function RobotControlPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(80);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibration, setCalibration] = useState<ServoConfigItem[]>([]);
  const [calibrationSaving, setCalibrationSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Hardware Connection Bar state
  const [connTab, setConnTab] = useState<"serial" | "wifi">("serial");
  const [availablePorts, setAvailablePorts] = useState<HardwarePortItem[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("COM3");
  const [selectedBaud, setSelectedBaud] = useState<number>(115200);
  const [wifiIp, setWifiIp] = useState<string>("192.168.1.100");
  const [wifiPort, setWifiPort] = useState<number>(8080);
  const [isScanningPorts, setIsScanningPorts] = useState(false);
  const [isSwitchingHardware, setIsSwitchingHardware] = useState(false);
  const [hardwareMsg, setHardwareMsg] = useState<string | null>(null);
  const [wiringGuideOpen, setWiringGuideOpen] = useState(false);

  // Local target sliders (for smooth input handling)
  const [targetPan, setTargetPan] = useState<number>(90);
  const [targetTilt, setTargetTilt] = useState<number>(90);

  const { telemetry, wsConnected, sendCommand, setTelemetry } = useServoWebSocket();

  // Load available serial ports
  const scanSerialPorts = useCallback(async () => {
    try {
      setIsScanningPorts(true);
      const ports = await servoService.listPorts();
      setAvailablePorts(ports);
      if (ports.length > 0 && (!selectedPort || selectedPort === "COM3")) {
        setSelectedPort(ports[0].port);
      }
    } catch (e: any) {
      console.warn("Could not list serial ports:", e);
    } finally {
      setIsScanningPorts(false);
    }
  }, [selectedPort]);

  // Load initial status and calibration
  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      const [statusData, calData] = await Promise.all([
        servoService.getStatus(),
        servoService.getCalibration(),
      ]);
      setTelemetry((prev) => ({
        ...prev,
        pan: statusData.pan_angle,
        tilt: statusData.tilt_angle,
        connected: statusData.connected,
        controller_type: statusData.controller_type,
        is_emergency_stopped: statusData.is_emergency_stopped,
        is_moving: statusData.is_moving,
        latency_ms: statusData.latency_ms,
      }));
      setTargetPan(statusData.pan_angle);
      setTargetTilt(statusData.tilt_angle);
      setCalibration(calData);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to connect to servo backend");
    } finally {
      setLoading(false);
    }
  }, [setTelemetry]);

  useEffect(() => {
    refreshStatus();
    scanSerialPorts();
  }, [refreshStatus, scanSerialPorts]);

  // Sync sliders with telemetry when not actively dragging
  useEffect(() => {
    setTargetPan(telemetry.pan);
    setTargetTilt(telemetry.tilt);
  }, [telemetry.pan, telemetry.tilt]);

  // Handle Connecting to ESP32 Hardware via Serial
  const handleConnectESP32 = async () => {
    try {
      setIsSwitchingHardware(true);
      setHardwareMsg(`Connecting to ESP32 on USB Serial ${selectedPort}...`);
      const res = await servoService.connectHardware("serial", selectedPort, selectedBaud);
      if (res.connected) {
        setHardwareMsg(`✅ Connected to ESP32 on ${selectedPort} (${selectedBaud} baud)`);
      } else {
        setHardwareMsg(`❌ Failed to connect on ${selectedPort}. Check USB cable & wiring.`);
      }
      await refreshStatus();
      setTimeout(() => setHardwareMsg(null), 5000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
      setHardwareMsg(null);
    } finally {
      setIsSwitchingHardware(false);
    }
  };

  // Handle Connecting to ESP32 Hardware via WiFi
  const handleConnectWiFi = async () => {
    try {
      setIsSwitchingHardware(true);
      setHardwareMsg(`Connecting to wireless ESP32 at ${wifiIp}:${wifiPort}...`);
      const res = await servoService.connectHardware("wifi", undefined, undefined, wifiIp, wifiPort);
      if (res.connected) {
        setHardwareMsg(`✅ Connected to wireless ESP32 at ${wifiIp}:${wifiPort}`);
      } else {
        setHardwareMsg(`❌ Could not reach ESP32 at ${wifiIp}:${wifiPort}. Check Wi-Fi network & IP address.`);
      }
      await refreshStatus();
      setTimeout(() => setHardwareMsg(null), 5000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
      setHardwareMsg(null);
    } finally {
      setIsSwitchingHardware(false);
    }
  };

  // Handle Switching to Mock Mode
  const handleSwitchToMock = async () => {
    try {
      setIsSwitchingHardware(true);
      setHardwareMsg("Switching to Mock Controller simulation...");
      await servoService.connectHardware("mock");
      setHardwareMsg("✅ Switched to Mock Controller mode");
      await refreshStatus();
      setTimeout(() => setHardwareMsg(null), 4000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setIsSwitchingHardware(false);
    }
  };

  // Handle Test Ping
  const handlePingHardware = async () => {
    try {
      const res = await servoService.pingHardware();
      if (res.success) {
        setHardwareMsg(`⚡ Ping OK! Round-Trip Latency: ${res.latency_ms.toFixed(1)} ms`);
        setTelemetry((prev) => ({ ...prev, latency_ms: res.latency_ms, connected: res.connected }));
      } else {
        setHardwareMsg("⚠️ Ping timed out or controller not responding");
      }
      setTimeout(() => setHardwareMsg(null), 4000);
    } catch (e: any) {
      setError("Ping failed: " + e.message);
    }
  };


  // Handle Pan slider move
  const handlePanChange = async (newPan: number) => {
    setTargetPan(newPan);
    if (!sendCommand({ type: "move", pan: newPan, tilt: targetTilt, speed })) {
      try {
        await servoService.move(newPan, targetTilt, speed);
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    }
  };

  // Handle Tilt slider move
  const handleTiltChange = async (newTilt: number) => {
    setTargetTilt(newTilt);
    if (!sendCommand({ type: "move", pan: targetPan, tilt: newTilt, speed })) {
      try {
        await servoService.move(targetPan, newTilt, speed);
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    }
  };

  // Step adjustments
  const adjustAngle = (axis: "pan" | "tilt", delta: number) => {
    if (axis === "pan") {
      const clamped = Math.max(0, Math.min(180, targetPan + delta));
      handlePanChange(clamped);
    } else {
      const clamped = Math.max(30, Math.min(150, targetTilt + delta));
      handleTiltChange(clamped);
    }
  };

  // Preset commands
  const applyPreset = async (pan: number, tilt: number) => {
    setTargetPan(pan);
    setTargetTilt(tilt);
    if (!sendCommand({ type: "move", pan, tilt, speed })) {
      try {
        await servoService.move(pan, tilt, speed);
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    }
  };

  const handleCenter = async () => {
    if (!sendCommand({ type: "center" })) {
      try {
        await servoService.center();
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    }
  };

  const handleEmergencyStop = async () => {
    try {
      if (!sendCommand({ type: "emergency_stop" })) {
        await servoService.emergencyStop();
      }
      setTelemetry((prev) => ({ ...prev, is_emergency_stopped: true, is_moving: false }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleResume = async () => {
    try {
      if (!sendCommand({ type: "resume" })) {
        await servoService.resume();
      }
      setTelemetry((prev) => ({ ...prev, is_emergency_stopped: false }));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSweepTest = async () => {
    const sweepPositions = [
      { pan: 30, tilt: 90 },
      { pan: 150, tilt: 90 },
      { pan: 90, tilt: 130 },
      { pan: 90, tilt: 50 },
      { pan: 90, tilt: 90 },
    ];
    for (const pos of sweepPositions) {
      await applyPreset(pos.pan, pos.tilt);
      await new Promise((res) => setTimeout(res, 400));
    }
  };

  // Calibration save
  const handleSaveCalibration = async () => {
    try {
      setCalibrationSaving(true);
      const updated = await servoService.updateCalibration(calibration);
      setCalibration(updated);
      setSaveSuccessMsg("Calibration saved and applied to controller!");
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCalibrationSaving(false);
    }
  };

  const updateCalItem = (index: number, key: keyof ServoConfigItem, value: any) => {
    setCalibration((prev) => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [key]: value };
      return clone;
    });
  };

  const isESP32Active = telemetry.controller_type === "esp32";

  return (
    <div className="robot-control" data-testid="robot-control-page">
      {/* Header */}
      <div className="robot-control__header">
        <div>
          <h1 className="robot-control__title">Robot Pan-Tilt Control</h1>
          <p className="robot-control__subtitle">
            Direct servo positioning, motion smoothing, ESP32 serial bridge, and hardware calibration
          </p>
        </div>
        <div className="robot-control__header-actions">
          <button
            className={`btn ${calibrationOpen ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setCalibrationOpen(!calibrationOpen)}
          >
            ⚙️ {calibrationOpen ? "Close Calibration" : "Calibration"}
          </button>
          {telemetry.is_emergency_stopped ? (
            <button className="btn btn--success btn--pulse" onClick={handleResume}>
              ▶ RESUME CONTROL
            </button>
          ) : (
            <button className="btn btn--danger btn--pulse" onClick={handleEmergencyStop}>
              🛑 EMERGENCY STOP
            </button>
          )}
        </div>
      </div>

      {/* Hardware Connection Manager Bar */}
      <div className="card hardware-bar">
        <div className="hardware-bar__status">
          <span className={`status-indicator ${telemetry.connected ? "status-indicator--online" : "status-indicator--offline"}`} />
          <div className="hardware-bar__info">
            <span className="hardware-bar__title">
              Mode: <strong>{isESP32Active ? "ESP32 HARDWARE (SERIAL)" : "MOCK CONTROLLER (VIRTUAL)"}</strong>
            </span>
            <span className="hardware-bar__sub">
              {telemetry.connected
                ? `🟢 Connected & Ready | Latency: ${telemetry.latency_ms.toFixed(1)}ms`
                : "🔴 Disconnected / Port Closed"}
            </span>
          </div>
        </div>

        <div className="hardware-bar__controls">
          {/* Tab Switcher: USB Serial vs Wireless Wi-Fi */}
          <div className="hardware-bar__tabs">
            <button
              className={`btn btn--small ${connTab === "serial" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setConnTab("serial")}
              type="button"
            >
              🔌 USB Serial
            </button>
            <button
              className={`btn btn--small ${connTab === "wifi" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setConnTab("wifi")}
              type="button"
            >
              📶 Wireless Wi-Fi
            </button>
          </div>

          {connTab === "serial" ? (
            <>
              <div className="hardware-bar__select-group">
                <label htmlFor="port-select" className="hardware-bar__label">Port:</label>
                <select
                  id="port-select"
                  className="hardware-bar__select"
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  disabled={isSwitchingHardware}
                >
                  {availablePorts.length === 0 ? (
                    <option value="COM3">COM3 (Default)</option>
                  ) : (
                    availablePorts.map((p) => (
                      <option key={p.port} value={p.port}>
                        {p.port} - {p.description.slice(0, 30)}
                      </option>
                    ))
                  )}
                </select>
                <button
                  className="btn btn--secondary btn--small"
                  onClick={scanSerialPorts}
                  disabled={isScanningPorts || isSwitchingHardware}
                  title="Scan available USB COM ports"
                >
                  {isScanningPorts ? "..." : "🔄 Scan"}
                </button>
              </div>

              <div className="hardware-bar__select-group">
                <label htmlFor="baud-select" className="hardware-bar__label">Baud:</label>
                <select
                  id="baud-select"
                  className="hardware-bar__select"
                  value={selectedBaud}
                  onChange={(e) => setSelectedBaud(parseInt(e.target.value, 10))}
                  disabled={isSwitchingHardware}
                >
                  <option value="115200">115200</option>
                  <option value="57600">57600</option>
                  <option value="9600">9600</option>
                </select>
              </div>

              {isESP32Active ? (
                <>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={handlePingHardware}
                    disabled={isSwitchingHardware || !telemetry.connected}
                    title="Test ESP32 latency"
                  >
                    ⚡ Ping
                  </button>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={handleSwitchToMock}
                    disabled={isSwitchingHardware}
                    title="Switch back to Mock Controller"
                  >
                    💻 Switch to Mock
                  </button>
                </>
              ) : (
                <button
                  className="btn btn--primary btn--small"
                  onClick={handleConnectESP32}
                  disabled={isSwitchingHardware}
                  title="Connect via USB Serial"
                >
                  {isSwitchingHardware ? "Connecting..." : "🔌 Connect Serial"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="hardware-bar__select-group">
                <label htmlFor="wifi-ip" className="hardware-bar__label">ESP32 IP:</label>
                <input
                  id="wifi-ip"
                  type="text"
                  className="hardware-bar__input"
                  value={wifiIp}
                  onChange={(e) => setWifiIp(e.target.value)}
                  placeholder="192.168.1.100"
                  disabled={isSwitchingHardware}
                />
              </div>

              <div className="hardware-bar__select-group">
                <label htmlFor="wifi-port" className="hardware-bar__label">Port:</label>
                <input
                  id="wifi-port"
                  type="number"
                  className="hardware-bar__input hardware-bar__input--short"
                  value={wifiPort}
                  onChange={(e) => setWifiPort(parseInt(e.target.value, 10))}
                  placeholder="8080"
                  disabled={isSwitchingHardware}
                />
              </div>

              {isESP32Active ? (
                <>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={handlePingHardware}
                    disabled={isSwitchingHardware || !telemetry.connected}
                    title="Test ESP32 latency"
                  >
                    ⚡ Ping
                  </button>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={handleSwitchToMock}
                    disabled={isSwitchingHardware}
                    title="Switch back to Mock Controller"
                  >
                    💻 Switch to Mock
                  </button>
                </>
              ) : (
                <button
                  className="btn btn--primary btn--small"
                  onClick={handleConnectWiFi}
                  disabled={isSwitchingHardware}
                  title="Connect wirelessly over Wi-Fi"
                >
                  {isSwitchingHardware ? "Connecting..." : "📶 Connect Wi-Fi"}
                </button>
              )}
            </>
          )}

          <button
            className="btn btn--secondary btn--small"
            onClick={() => setWiringGuideOpen(!wiringGuideOpen)}
            title="View ESP32 Servo Pinout & Wiring Diagram"
          >
            📋 Wiring Guide
          </button>
        </div>
      </div>


      {/* Hardware Action Notification */}
      {hardwareMsg && (
        <div className="info-banner" role="status">
          <span>{hardwareMsg}</span>
        </div>
      )}

      {/* Wiring Guide Drawer */}
      {wiringGuideOpen && (
        <div className="card wiring-guide-card">
          <div className="card__header">
            <h3 className="card__title">🔌 ESP32 to MG90S / MG995 / MG996R Wiring Pinout</h3>
            <button className="btn btn--small" onClick={() => setWiringGuideOpen(false)}>✕ Close</button>
          </div>
          <div className="wiring-guide-grid">
            <div className="wiring-item">
              <strong>PAN (Yaw - Horizontal)</strong>
              <p>ESP32 <code>GPIO 18</code> ➔ Servo PWM Signal (Orange/Yellow)</p>
            </div>
            <div className="wiring-item">
              <strong>TILT (Pitch - Vertical)</strong>
              <p>ESP32 <code>GPIO 19</code> ➔ Servo PWM Signal (Orange/Yellow)</p>
            </div>
            <div className="wiring-item">
              <strong>COMMON GROUND</strong>
              <p>ESP32 <code>GND</code> ➔ Servo Power GND & External 5V GND (Black/Brown)</p>
            </div>
            <div className="wiring-item">
              <strong>EXTERNAL 5V POWER</strong>
              <p>External 5V 2A+ Power Supply ➔ Servo VCC (Red)</p>
            </div>
          </div>
          <p className="wiring-note">
            ⚠️ <em>Important: Do NOT power servos directly from ESP32 3.3V or 5V pin under load; use an external 5V 2A+ power supply with GND connected to ESP32 GND.</em>
          </p>
        </div>
      )}

      {/* Emergency Stop Active Banner */}
      {telemetry.is_emergency_stopped && (
        <div className="estop-banner" role="alert">
          <span className="estop-banner__icon">⚠️</span>
          <div className="estop-banner__text">
            <strong>EMERGENCY STOP ACTIVE</strong>
            <span>All servo power and movement commands are locked. Click Resume to re-engage.</span>
          </div>
          <button className="btn btn--success" onClick={handleResume}>
            Resume Control
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && !telemetry.is_emergency_stopped && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button className="btn btn--small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}


      {/* Main Grid */}
      <div className="robot-control__grid">
        {/* Left Column: Visual Head Gauge & Live Telemetry */}
        <div className="robot-control__col">
          {/* Head 3D Orientation Gauge */}
          <div className="card gauge-card">
            <div className="card__header">
              <h2 className="card__title">Live Head Orientation</h2>
              <span className={`status-pill ${telemetry.is_moving ? "status-pill--active" : ""}`}>
                {telemetry.is_moving ? "MOVING" : "IDLE"}
              </span>
            </div>

            <div className="gauge-stage">
              <div
                className="head-avatar"
                style={{
                  transform: `perspective(600px) rotateY(${(90 - telemetry.pan) * 0.8}deg) rotateX(${(telemetry.tilt - 90) * 0.8}deg)`,
                }}
              >
                <div className="head-avatar__face">
                  <div className="head-avatar__eyes">
                    <div className="eye eye--left" />
                    <div className="eye eye--right" />
                  </div>
                  <div className="head-avatar__mouth" />
                  <div className="head-avatar__crosshair" />
                </div>
              </div>
            </div>

            <div className="angle-readouts">
              <div className="angle-box">
                <span className="angle-box__label">PAN (YAW)</span>
                <span className="angle-box__value">{telemetry.pan.toFixed(1)}°</span>
                <span className="angle-box__sub">Rel: {(telemetry.pan - 90).toFixed(1)}°</span>
              </div>
              <div className="angle-box">
                <span className="angle-box__label">TILT (PITCH)</span>
                <span className="angle-box__value">{telemetry.tilt.toFixed(1)}°</span>
                <span className="angle-box__sub">Rel: {(telemetry.tilt - 90).toFixed(1)}°</span>
              </div>
            </div>
          </div>

          {/* Telemetry Diagnostics HUD */}
          <div className="card telemetry-card">
            <h3 className="card__title">Hardware Diagnostics HUD</h3>
            <div className="hud-metrics">
              <div className="hud-metric">
                <span className="hud-metric__label">Hardware State</span>
                <span className="hud-metric__value">
                  {telemetry.connected ? "🟢 ONLINE" : "🔴 OFFLINE"}
                </span>
              </div>
              <div className="hud-metric">
                <span className="hud-metric__label">Controller Type</span>
                <span className="hud-metric__value hud-metric__value--highlight">
                  {telemetry.controller_type.toUpperCase()}
                </span>
              </div>
              <div className="hud-metric">
                <span className="hud-metric__label">Round-Trip Latency</span>
                <span className="hud-metric__value">
                  {telemetry.latency_ms.toFixed(1)} ms
                </span>
              </div>
              <div className="hud-metric">
                <span className="hud-metric__label">Telemetry Stream</span>
                <span className="hud-metric__value">
                  {wsConnected ? "⚡ WebSocket (Live)" : "🔄 REST Polling"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Precision Sliders, Steppers & Presets */}
        <div className="robot-control__col">
          {/* Sliders Card */}
          <div className="card controls-card">
            <h2 className="card__title">Precision Servo Controls</h2>

            {/* Pan Axis */}
            <div className="axis-control">
              <div className="axis-control__header">
                <span className="axis-control__name">Pan Servo (Horizontal Axis)</span>
                <span className="axis-control__badge">{targetPan.toFixed(1)}°</span>
              </div>
              <div className="slider-row">
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("pan", -5)}
                >
                  -5°
                </button>
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("pan", -1)}
                >
                  -1°
                </button>
                <input
                  type="range"
                  min="0"
                  max="180"
                  step="0.5"
                  value={targetPan}
                  disabled={telemetry.is_emergency_stopped}
                  onChange={(e) => handlePanChange(parseFloat(e.target.value))}
                  className="servo-slider"
                  aria-label="Pan angle slider"
                />
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("pan", 1)}
                >
                  +1°
                </button>
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("pan", 5)}
                >
                  +5°
                </button>
              </div>
              <div className="slider-labels">
                <span>0° (Far Right)</span>
                <span>90° (Center)</span>
                <span>180° (Far Left)</span>
              </div>
            </div>

            {/* Tilt Axis */}
            <div className="axis-control">
              <div className="axis-control__header">
                <span className="axis-control__name">Tilt Servo (Vertical Axis)</span>
                <span className="axis-control__badge">{targetTilt.toFixed(1)}°</span>
              </div>
              <div className="slider-row">
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("tilt", -5)}
                >
                  -5°
                </button>
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("tilt", -1)}
                >
                  -1°
                </button>
                <input
                  type="range"
                  min="30"
                  max="150"
                  step="0.5"
                  value={targetTilt}
                  disabled={telemetry.is_emergency_stopped}
                  onChange={(e) => handleTiltChange(parseFloat(e.target.value))}
                  className="servo-slider"
                  aria-label="Tilt angle slider"
                />
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("tilt", 1)}
                >
                  +1°
                </button>
                <button
                  className="btn btn--icon"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => adjustAngle("tilt", 5)}
                >
                  +5°
                </button>
              </div>
              <div className="slider-labels">
                <span>30° (Down)</span>
                <span>90° (Level)</span>
                <span>150° (Up)</span>
              </div>
            </div>

            {/* Speed Control */}
            <div className="speed-control">
              <div className="speed-control__header">
                <span>Movement Speed</span>
                <span>{speed}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={speed}
                disabled={telemetry.is_emergency_stopped}
                onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
                className="speed-slider"
                aria-label="Movement speed"
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="card presets-card">
            <h2 className="card__title">Quick Pose Presets</h2>
            <div className="preset-grid">
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={handleCenter}
              >
                <span className="preset-btn__icon">🎯</span>
                <span className="preset-btn__label">Center (Home)</span>
                <span className="preset-btn__angles">90°, 90°</span>
              </button>
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => applyPreset(150, 90)}
              >
                <span className="preset-btn__icon">⬅️</span>
                <span className="preset-btn__label">Look Left</span>
                <span className="preset-btn__angles">150°, 90°</span>
              </button>
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => applyPreset(30, 90)}
              >
                <span className="preset-btn__icon">➡️</span>
                <span className="preset-btn__label">Look Right</span>
                <span className="preset-btn__angles">30°, 90°</span>
              </button>
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => applyPreset(90, 130)}
              >
                <span className="preset-btn__icon">⬆️</span>
                <span className="preset-btn__label">Look Up</span>
                <span className="preset-btn__angles">90°, 130°</span>
              </button>
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => applyPreset(90, 50)}
              >
                <span className="preset-btn__icon">⬇️</span>
                <span className="preset-btn__label">Look Down</span>
                <span className="preset-btn__angles">90°, 50°</span>
              </button>
              <button
                className="preset-btn preset-btn--special"
                disabled={telemetry.is_emergency_stopped}
                onClick={handleSweepTest}
              >
                <span className="preset-btn__icon">🔄</span>
                <span className="preset-btn__label">Sweep Sequence</span>
                <span className="preset-btn__angles">Smooth Test</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calibration Drawer / Section */}
      {calibrationOpen && (
        <div className="card calibration-section" data-testid="calibration-panel">
          <div className="card__header">
            <h2 className="card__title">Servo Calibration & Trimming</h2>
            <div className="calibration-actions">
              {saveSuccessMsg && <span className="success-msg">{saveSuccessMsg}</span>}
              <button
                className="btn btn--primary"
                disabled={calibrationSaving}
                onClick={handleSaveCalibration}
              >
                {calibrationSaving ? "Saving..." : "Save Calibration"}
              </button>
            </div>
          </div>

          <div className="calibration-grid">
            {calibration.map((item, idx) => (
              <div key={item.servo_name} className="calibration-box">
                <h3 className="calibration-box__title">
                  {item.servo_name.toUpperCase()} SERVO ({item.axis.toUpperCase()})
                </h3>

                <div className="cal-field">
                  <label>Zero-Trim Offset: {item.trim_offset}°</label>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.5"
                    value={item.trim_offset}
                    onChange={(e) =>
                      updateCalItem(idx, "trim_offset", parseFloat(e.target.value))
                    }
                  />
                </div>

                <div className="cal-field-row">
                  <div className="cal-field">
                    <label>Min Angle (°)</label>
                    <input
                      type="number"
                      value={item.min_angle}
                      onChange={(e) =>
                        updateCalItem(idx, "min_angle", parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="cal-field">
                    <label>Max Angle (°)</label>
                    <input
                      type="number"
                      value={item.max_angle}
                      onChange={(e) =>
                        updateCalItem(idx, "max_angle", parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="cal-field">
                    <label>Center Angle (°)</label>
                    <input
                      type="number"
                      value={item.center_angle}
                      onChange={(e) =>
                        updateCalItem(idx, "center_angle", parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="cal-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.invert}
                      onChange={(e) => updateCalItem(idx, "invert", e.target.checked)}
                    />
                    Invert Movement Axis Direction
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}