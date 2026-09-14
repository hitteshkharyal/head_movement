import React, { useEffect, useState, useCallback, useRef } from "react";
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

  // Omnidirectional Virtual Joystick / Trackpad State
  const [joystickSpring, setJoystickSpring] = useState<boolean>(false);
  const [isDraggingJoystick, setIsDraggingJoystick] = useState<boolean>(false);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFaceDragging, setIsFaceDragging] = useState<boolean>(false);
  const [activePresetSequence, setActivePresetSequence] = useState<string | null>(null);

  // Internal target angles (kept as ref & state for instant feedback & zero desync)
  const [targetPan, setTargetPan] = useState<number>(90);
  const [targetTilt, setTargetTilt] = useState<number>(90);
  const panRef = useRef<number>(90);
  const tiltRef = useRef<number>(90);
  const lastSentTimeRef = useRef<number>(0);

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const faceStageRef = useRef<HTMLDivElement | null>(null);

  const { telemetry, wsConnected, sendCommand, setTelemetry } = useServoWebSocket();

  // Keep refs aligned
  useEffect(() => {
    panRef.current = targetPan;
  }, [targetPan]);

  useEffect(() => {
    tiltRef.current = targetTilt;
  }, [targetTilt]);

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
      panRef.current = statusData.pan_angle;
      tiltRef.current = statusData.tilt_angle;
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

  // Sync targets with telemetry when not actively dragging
  useEffect(() => {
    if (!isDraggingJoystick && !isFaceDragging && !activePresetSequence) {
      setTargetPan(telemetry.pan);
      setTargetTilt(telemetry.tilt);
      panRef.current = telemetry.pan;
      tiltRef.current = telemetry.tilt;

      // Update 2D joystick puck position from telemetry
      const normX = ((90 - telemetry.pan) / 90);
      const normY = ((telemetry.tilt - 90) / 60);
      setJoystickPos({ x: normX, y: normY });
    }
  }, [telemetry.pan, telemetry.tilt, isDraggingJoystick, isFaceDragging, activePresetSequence]);

  // Connect to ESP32 Hardware via Serial
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

  // Connect to ESP32 Hardware via WiFi
  const handleConnectWiFi = async () => {
    try {
      setIsSwitchingHardware(true);
      setHardwareMsg(`Connecting to wireless ESP32 at ${wifiIp}:${wifiPort}...`);
      const res = await servoService.connectHardware("wifi", undefined, undefined, wifiIp, wifiPort);
      if (res.connected) {
        setHardwareMsg(`✅ Connected to wireless ESP32 at ${wifiIp}:${wifiPort}`);
      } else {
        setHardwareMsg(`❌ Could not reach ESP32 at ${wifiIp}:${wifiPort}. Check Wi-Fi network & IP.`);
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

  // Switch to Mock Mode
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

  // Test Ping
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

  // --- UNIVERSAL TRANSMITTER ---
  const sendTargetCoordinates = useCallback(
    async (pan: number, tilt: number, spd: number = speed, force = false) => {
      const now = performance.now();
      if (!force && now - lastSentTimeRef.current < 25) {
        return; // throttle rapid drag events to 40Hz
      }
      lastSentTimeRef.current = now;

      const clampedPan = Math.max(0, Math.min(180, pan));
      const clampedTilt = Math.max(30, Math.min(150, tilt));

      setTargetPan(clampedPan);
      setTargetTilt(clampedTilt);
      panRef.current = clampedPan;
      tiltRef.current = clampedTilt;

      const payload = { type: "move", pan: clampedPan, tilt: clampedTilt, speed: spd };
      if (!sendCommand(payload)) {
        try {
          await servoService.move(clampedPan, clampedTilt, spd);
        } catch (e: any) {
          setError(e?.response?.data?.detail || e.message);
        }
      }
    },
    [sendCommand, speed]
  );

  // --- INDEPENDENT STEPPING ACTIONS ---

  // Move Tilt Up (+10°) while locking Pan at current angle
  const handleStepTiltUp = () => {
    const nextTilt = Math.min(150, tiltRef.current + 10);
    sendTargetCoordinates(panRef.current, nextTilt, speed, true);
  };

  // Move Tilt Down (-10°) while locking Pan at current angle
  const handleStepTiltDown = () => {
    const nextTilt = Math.max(30, tiltRef.current - 10);
    sendTargetCoordinates(panRef.current, nextTilt, speed, true);
  };

  // Move Pan Left (+10°) while locking Tilt at current angle
  const handleStepPanLeft = () => {
    const nextPan = Math.min(180, panRef.current + 10);
    sendTargetCoordinates(nextPan, tiltRef.current, speed, true);
  };

  // Move Pan Right (-10°) while locking Tilt at current angle
  const handleStepPanRight = () => {
    const nextPan = Math.max(0, panRef.current - 10);
    sendTargetCoordinates(nextPan, tiltRef.current, speed, true);
  };

  // Step Diagonal (Both motors simultaneously)
  const handleStepDiagonal = (panDelta: number, tiltDelta: number) => {
    const nextPan = Math.max(0, Math.min(180, panRef.current + panDelta));
    const nextTilt = Math.max(30, Math.min(150, tiltRef.current + tiltDelta));
    sendTargetCoordinates(nextPan, nextTilt, speed, true);
  };

  // --- INDEPENDENT CENTERING ---

  // Center Pan Only (90°), leaves Tilt untouched
  const handleCenterPan = async () => {
    sendTargetCoordinates(90, tiltRef.current, speed, true);
  };

  // Center Tilt Only (90°), leaves Pan untouched
  const handleCenterTilt = async () => {
    sendTargetCoordinates(panRef.current, 90, speed, true);
  };

  // Center Both (90°, 90°)
  const handleCenterBoth = async () => {
    setTargetPan(90);
    setTargetTilt(90);
    panRef.current = 90;
    tiltRef.current = 90;
    if (!sendCommand({ type: "center" })) {
      try {
        await servoService.center();
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message);
      }
    }
  };

  // --- OMNIDIRECTIONAL 360° VIRTUAL JOYSTICK & TOUCHPAD ---

  const handleJoystickMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!joystickRef.current) return;
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const radius = rect.width / 2;

      let dx = (clientX - centerX) / radius;
      let dy = (centerY - clientY) / radius; // Invert Y so up is positive

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        dx /= dist;
        dy /= dist;
      }

      setJoystickPos({ x: dx, y: dy });

      // Convert joystick (-1 to +1) to Servo Angles
      // X: +1 (right) -> 30° (Right), -1 (left) -> 150° (Left), 0 -> 90°
      const targetPanAngle = 90 - dx * 60;
      // Y: +1 (up) -> 140° (Up), -1 (down) -> 40° (Down), 0 -> 90°
      const targetTiltAngle = 90 + dy * 50;

      sendTargetCoordinates(targetPanAngle, targetTiltAngle, speed);
    },
    [sendTargetCoordinates, speed]
  );

  const handleJoystickMouseDown = (e: React.MouseEvent) => {
    setIsDraggingJoystick(true);
    handleJoystickMove(e.clientX, e.clientY);
  };

  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsDraggingJoystick(true);
      handleJoystickMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Window drag listeners for smooth omnidirectional joystick
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingJoystick) {
        handleJoystickMove(e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      if (isDraggingJoystick) {
        setIsDraggingJoystick(false);
        if (joystickSpring) {
          handleCenterBoth();
          setJoystickPos({ x: 0, y: 0 });
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingJoystick && e.touches.length > 0) {
        handleJoystickMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onTouchEnd = () => {
      if (isDraggingJoystick) {
        setIsDraggingJoystick(false);
        if (joystickSpring) {
          handleCenterBoth();
          setJoystickPos({ x: 0, y: 0 });
        }
      }
    };

    if (isDraggingJoystick) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", onTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDraggingJoystick, joystickSpring, handleJoystickMove, handleCenterBoth]);

  // --- INTERACTIVE 3D FACE DRAGGING (DRAG TO LOOK) ---

  const handleFaceMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!faceStageRef.current) return;
      const rect = faceStageRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const normX = Math.max(-1, Math.min(1, (clientX - centerX) / (rect.width / 2)));
      const normY = Math.max(-1, Math.min(1, (clientY - centerY) / (rect.height / 2)));

      // Dragging right rotates head right, dragging down points chin down
      const calculatedPan = 90 - normX * 60;
      const calculatedTilt = 90 - normY * 45;

      sendTargetCoordinates(calculatedPan, calculatedTilt, speed);
    },
    [sendTargetCoordinates, speed]
  );

  const handleFaceMouseDown = (e: React.MouseEvent) => {
    setIsFaceDragging(true);
    handleFaceMove(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isFaceDragging) {
        handleFaceMove(e.clientX, e.clientY);
      }
    };
    const onMouseUp = () => {
      if (isFaceDragging) {
        setIsFaceDragging(false);
      }
    };

    if (isFaceDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isFaceDragging, handleFaceMove]);

  // --- HUMAN EXPRESSION & PRESENTATION SEQUENCES ---

  const executeSequence = async (name: string, steps: Array<{ pan: number; tilt: number; delay: number }>) => {
    setActivePresetSequence(name);
    for (const step of steps) {
      await sendTargetCoordinates(step.pan, step.tilt, 85, true);
      await new Promise((res) => setTimeout(res, step.delay));
    }
    setActivePresetSequence(null);
  };

  // YES Gesture: Smooth up-and-down vertical nod (keeps Pan strictly steady at current angle)
  const handleYesGesture = async () => {
    sendCommand({ type: "gesture", name: "yes" });
    const currentPan = panRef.current;
    await executeSequence("yes_gesture", [
      { pan: currentPan, tilt: 115, delay: 280 },
      { pan: currentPan, tilt: 65, delay: 280 },
      { pan: currentPan, tilt: 110, delay: 240 },
      { pan: currentPan, tilt: 70, delay: 240 },
      { pan: currentPan, tilt: 90, delay: 250 },
    ]);
  };

  // NO Gesture: Smooth left-and-right horizontal head shake (keeps Tilt strictly steady at current angle)
  const handleNoGesture = async () => {
    sendCommand({ type: "gesture", name: "no" });
    const currentTilt = tiltRef.current;
    await executeSequence("no_gesture", [
      { pan: 125, tilt: currentTilt, delay: 280 },
      { pan: 55, tilt: currentTilt, delay: 280 },
      { pan: 120, tilt: currentTilt, delay: 240 },
      { pan: 60, tilt: currentTilt, delay: 240 },
      { pan: 90, tilt: currentTilt, delay: 250 },
    ]);
  };

  const handlePresenterScan = () => {
    executeSequence("presenterScan", [
      { pan: 140, tilt: 90, delay: 600 },
      { pan: 140, tilt: 105, delay: 400 },
      { pan: 90, tilt: 90, delay: 500 },
      { pan: 40, tilt: 90, delay: 600 },
      { pan: 40, tilt: 105, delay: 400 },
      { pan: 90, tilt: 90, delay: 400 },
    ]);
  };

  const handleThinkingGesture = () => {
    executeSequence("thinking", [
      { pan: 60, tilt: 125, delay: 800 },
      { pan: 65, tilt: 130, delay: 600 },
      { pan: 90, tilt: 90, delay: 500 },
    ]);
  };

  const handleAffirmativeNod = () => {
    handleYesGesture();
  };

  const handleCuriousGlance = () => {
    executeSequence("curious", [
      { pan: 135, tilt: 115, delay: 500 },
      { pan: 125, tilt: 100, delay: 400 },
      { pan: 90, tilt: 90, delay: 400 },
    ]);
  };

  // Quick Inversion Toggles
  const handleTogglePanInvert = async () => {
    if (calibration.length < 2) return;
    const clone = [...calibration];
    const panIdx = clone.findIndex((c) => c.servo_name === "pan");
    if (panIdx >= 0) {
      clone[panIdx].invert = !clone[panIdx].invert;
      setCalibration(clone);
      await servoService.updateCalibration(clone);
      setHardwareMsg(`Pan direction ${clone[panIdx].invert ? "INVERTED (Mirrored)" : "NORMAL"}`);
      setTimeout(() => setHardwareMsg(null), 3000);
    }
  };

  const handleToggleTiltInvert = async () => {
    if (calibration.length < 2) return;
    const clone = [...calibration];
    const tiltIdx = clone.findIndex((c) => c.servo_name === "tilt");
    if (tiltIdx >= 0) {
      clone[tiltIdx].invert = !clone[tiltIdx].invert;
      setCalibration(clone);
      await servoService.updateCalibration(clone);
      setHardwareMsg(`Tilt direction ${clone[tiltIdx].invert ? "INVERTED (Mirrored)" : "NORMAL"}`);
      setTimeout(() => setHardwareMsg(null), 3000);
    }
  };

  // Emergency Stop & Resume
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
            All-round 360° human gaze joystick, 3D interactive head drag, independent single-axis steppers, and ESP32 hardware bridge
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

      {/* Hardware Connection Bar */}
      <div className="card hardware-bar">
        <div className="hardware-bar__status">
          <span className={`status-indicator ${telemetry.connected ? "status-indicator--online" : "status-indicator--offline"}`} />
          <div className="hardware-bar__info">
            <span className="hardware-bar__title">
              Mode: <strong>{isESP32Active ? "ESP32 HARDWARE (SERIAL / WIFI)" : "MOCK CONTROLLER (VIRTUAL)"}</strong>
            </span>
            <span className="hardware-bar__sub">
              {telemetry.connected
                ? `🟢 Connected & Ready | Latency: ${telemetry.latency_ms.toFixed(1)}ms`
                : "🔴 Disconnected / Port Closed"}
            </span>
          </div>
        </div>

        <div className="hardware-bar__controls">
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

      {/* Notification Banner */}
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
              <strong>PAN (Motor 1 - Yaw / Horizontal)</strong>
              <p>ESP32 <code>GPIO 18</code> ➔ Servo PWM Signal (Orange/Yellow)</p>
            </div>
            <div className="wiring-item">
              <strong>TILT (Motor 2 - Pitch / Vertical)</strong>
              <p>ESP32 <code>GPIO 19</code> ➔ Servo PWM Signal (Orange/Yellow)</p>
            </div>
            <div className="wiring-item">
              <strong>COMMON GROUND</strong>
              <p>ESP32 <code>GND</code> ➔ Servo Power GND (Black/Brown)</p>
            </div>
            <div className="wiring-item">
              <strong>SERVO POWER (5V)</strong>
              <p>ESP32 <code>VIN / 5V</code> (or External 5V 2A Power) ➔ Servo VCC (Red)</p>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Stop Banner */}
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

      {/* ========================================================================= */}
      {/* TOP STAGE: 3D INTERACTIVE AVATAR (LEFT) + 360° HUMAN GAZE JOYSTICK (RIGHT)*/}
      {/* ========================================================================= */}
      <div className="robot-control__top-grid">
        {/* Left Card: 3D Head Avatar with Direct Drag-to-Look */}
        <div className="card gauge-card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Live Head Orientation</h2>
              <span className="card__subtitle">Click & drag face directly for interactive natural head movement</span>
            </div>
            <span className={`status-pill ${telemetry.is_moving ? "status-pill--active" : ""}`}>
              {telemetry.is_moving ? "MOVING" : "IDLE"}
            </span>
          </div>

          <div
            ref={faceStageRef}
            className={`gauge-stage ${isFaceDragging ? "gauge-stage--dragging" : ""}`}
            onMouseDown={handleFaceMouseDown}
            title="Click and drag to aim the robot head naturally"
          >
            <div
              className="head-avatar"
              style={{
                transform: `perspective(600px) rotateY(${(90 - targetPan) * 0.8}deg) rotateX(${(targetTilt - 90) * 0.8}deg)`,
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
            <div className="gauge-stage__hint">🖱️ Click & Drag Face to Look</div>
          </div>

          {/* Real-time Angle Readouts */}
          <div className="angle-readouts">
            <div className="angle-box">
              <span className="angle-box__label">MOTOR 1 : PAN (HORIZONTAL)</span>
              <span className="angle-box__value">{targetPan.toFixed(1)}°</span>
              <span className="angle-box__sub">
                {targetPan < 88 ? "Turning Right" : targetPan > 92 ? "Turning Left" : "Centered (Forward)"}
              </span>
            </div>
            <div className="angle-box">
              <span className="angle-box__label">MOTOR 2 : TILT (VERTICAL)</span>
              <span className="angle-box__value">{targetTilt.toFixed(1)}°</span>
              <span className="angle-box__sub">
                {targetTilt < 88 ? "Chin Down" : targetTilt > 92 ? "Head Up" : "Normal Level Gaze"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Card: Omnidirectional 360° Human Gaze Joystick & D-Pad */}
        <div className="card dpad-card">
          <div className="card__header">
            <div>
              <h2 className="card__title">All-Round Axis Gaze Controller</h2>
              <span className="card__subtitle">
                360° omnidirectional spatial gaze pad + precision 8-way directional steppers
              </span>
            </div>
            <div className="joystick-toggle">
              <label className="toggle-label" title="When enabled, releasing thumbstick returns head smoothly to center">
                <input
                  type="checkbox"
                  checked={joystickSpring}
                  onChange={(e) => setJoystickSpring(e.target.checked)}
                />
                Spring-To-Center
              </label>
            </div>
          </div>

          <div className="control-panels-split">
            {/* 360° Omnidirectional Trackpad Pad */}
            <div className="omni-joystick-section">
              <div
                ref={joystickRef}
                className="omni-pad"
                onMouseDown={handleJoystickMouseDown}
                onTouchStart={handleJoystickTouchStart}
                title="Drag in any direction for fluid, human-like head movement"
              >
                <div className="omni-pad__rings">
                  <div className="omni-pad__ring omni-pad__ring--outer" />
                  <div className="omni-pad__ring omni-pad__ring--mid" />
                  <div className="omni-pad__ring omni-pad__ring--inner" />
                  <div className="omni-pad__cross-h" />
                  <div className="omni-pad__cross-v" />
                </div>

                {/* Draggable Gaze Puck */}
                <div
                  className={`omni-puck ${isDraggingJoystick ? "omni-puck--active" : ""}`}
                  style={{
                    transform: `translate(calc(-50% + ${joystickPos.x * 65}px), calc(-50% - ${joystickPos.y * 65}px))`,
                  }}
                >
                  <div className="omni-puck__glow" />
                  <div className="omni-puck__dot" />
                </div>

                <div className="omni-pad__label omni-pad__label--top">⬆️ UP</div>
                <div className="omni-pad__label omni-pad__label--bottom">⬇️ DOWN</div>
                <div className="omni-pad__label omni-pad__label--left">⬅️ LEFT</div>
                <div className="omni-pad__label omni-pad__label--right">➡️ RIGHT</div>
              </div>
              <span className="omni-pad__caption">360° Omnidirectional Gaze Pad</span>
            </div>

            {/* Precision 8-Way D-Pad Grid */}
            <div className="dpad-grid-wrapper">
              <div className="dpad-grid-3x3">
                <button
                  className="dpad-btn dpad-btn--diag"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => handleStepDiagonal(10, 10)}
                  title="Up + Left (Simultaneous)"
                  type="button"
                >
                  ↖️
                  <span className="dpad-btn__text">UP-L</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--cardinal dpad-btn--up"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={handleStepTiltUp}
                  title="Head Up (+10° Tilt only - Motor 2)"
                  type="button"
                >
                  ⬆️
                  <span className="dpad-btn__text">UP</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--diag"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => handleStepDiagonal(-10, 10)}
                  title="Up + Right (Simultaneous)"
                  type="button"
                >
                  ↗️
                  <span className="dpad-btn__text">UP-R</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--cardinal dpad-btn--left"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={handleStepPanLeft}
                  title="Pan Left (+10° Pan only - Motor 1)"
                  type="button"
                >
                  ⬅️
                  <span className="dpad-btn__text">LEFT</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--center"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={handleCenterBoth}
                  title="Center Both Motors (90°, 90°)"
                  type="button"
                >
                  🎯
                  <span className="dpad-btn__text">CENTER</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--cardinal dpad-btn--right"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={handleStepPanRight}
                  title="Pan Right (-10° Pan only - Motor 1)"
                  type="button"
                >
                  ➡️
                  <span className="dpad-btn__text">RIGHT</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--diag"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => handleStepDiagonal(10, -10)}
                  title="Down + Left (Simultaneous)"
                  type="button"
                >
                  ↙️
                  <span className="dpad-btn__text">DN-L</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--cardinal dpad-btn--down"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={handleStepTiltDown}
                  title="Chin Down (-10° Tilt only - Motor 2)"
                  type="button"
                >
                  ⬇️
                  <span className="dpad-btn__text">DOWN</span>
                </button>

                <button
                  className="dpad-btn dpad-btn--diag"
                  disabled={telemetry.is_emergency_stopped}
                  onClick={() => handleStepDiagonal(-10, -10)}
                  title="Down + Right (Simultaneous)"
                  type="button"
                >
                  ↘️
                  <span className="dpad-btn__text">DN-R</span>
                </button>
              </div>
            </div>
          </div>

          {/* Dedicated Individual Centering Buttons */}
          <div className="individual-centers">
            <span className="individual-centers__title">Independent Motor Centering:</span>
            <div className="individual-centers__row">
              <button
                className="btn btn--secondary btn--small center-action-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={handleCenterPan}
                title="Reset Motor 1 (Pan Horizontal) to 90°"
                type="button"
              >
                🎯 Center Pan (Motor 1)
              </button>
              <button
                className="btn btn--secondary btn--small center-action-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={handleCenterTilt}
                title="Reset Motor 2 (Tilt Vertical) to 90° Normal Level"
                type="button"
              >
                🎯 Center Tilt (Motor 2)
              </button>
              <button
                className="btn btn--primary btn--small center-action-btn"
                disabled={telemetry.is_emergency_stopped}
                onClick={handleCenterBoth}
                title="Reset both motors to 90°, 90°"
                type="button"
              >
                🎯 Center Both (90°, 90°)
              </button>
            </div>
          </div>

          {/* Human Expression & Presentation Pose Sequences */}
          <div className="presets-container">
            <div className="presets-header-row">
              <h2 className="card__title presets-container__title">🎭 Human Gestures & Motion Presets</h2>
              {activePresetSequence && (
                <span className="gesture-active-indicator">
                  ✨ Executing {activePresetSequence === "yes_gesture" ? "YES (Up & Down Nod)" : activePresetSequence === "no_gesture" ? "NO (Left & Right Shake)" : activePresetSequence}...
                </span>
              )}
            </div>

            {/* Featured YES & NO Gesture Cards */}
            <div className="gesture-grid-featured">
              <button
                className={`preset-btn preset-btn--yes ${activePresetSequence === "yes_gesture" ? "preset-btn--active-pulse" : ""}`}
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handleYesGesture}
                title="Execute YES Gesture (Smooth Up & Down Vertical Nodding)"
                type="button"
              >
                <div className="preset-btn__top-row">
                  <span className="preset-btn__icon">👍</span>
                  <span className="preset-btn__badge preset-btn__badge--yes">YES (NOD)</span>
                </div>
                <span className="preset-btn__label">YES Gesture</span>
                <span className="preset-btn__angles">↕️ Up & Down Nod (Tilt)</span>
              </button>

              <button
                className={`preset-btn preset-btn--no ${activePresetSequence === "no_gesture" ? "preset-btn--active-pulse" : ""}`}
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handleNoGesture}
                title="Execute NO Gesture (Smooth Left & Right Horizontal Shaking)"
                type="button"
              >
                <div className="preset-btn__top-row">
                  <span className="preset-btn__icon">👎</span>
                  <span className="preset-btn__badge preset-btn__badge--no">NO (SHAKE)</span>
                </div>
                <span className="preset-btn__label">NO Gesture</span>
                <span className="preset-btn__angles">↔️ Left & Right Shake (Pan)</span>
              </button>
            </div>

            {/* Additional Expression & Pose Presets */}
            <div className="preset-grid">
              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handleCenterBoth}
                type="button"
              >
                <span className="preset-btn__icon">🎯</span>
                <span className="preset-btn__label">Center (Home)</span>
                <span className="preset-btn__angles">90°, 90°</span>
              </button>

              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handlePresenterScan}
                type="button"
              >
                <span className="preset-btn__icon">🗣️</span>
                <span className="preset-btn__label">Presenter Scan</span>
                <span className="preset-btn__angles">Room Sweep</span>
              </button>

              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handleThinkingGesture}
                type="button"
              >
                <span className="preset-btn__icon">🤔</span>
                <span className="preset-btn__label">Thinking Look</span>
                <span className="preset-btn__angles">Up-Right Gaze</span>
              </button>

              <button
                className="preset-btn"
                disabled={telemetry.is_emergency_stopped || !!activePresetSequence}
                onClick={handleCuriousGlance}
                type="button"
              >
                <span className="preset-btn__icon">👀</span>
                <span className="preset-btn__label">Curious Glance</span>
                <span className="preset-btn__angles">Side Look</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM SECTION: PRECISION SLIDERS, INVERSIONS & HARDWARE DIAGNOSTICS HUD */}
      {/* ========================================================================= */}
      <div className="robot-control__bottom-grid">
        {/* Sliders & Speed Card */}
        <div className="card controls-card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Precision Servo Controls</h2>
              <span className="card__subtitle">Fine-grained angle adjustments with ±1° & ±5° stepping</span>
            </div>
          </div>

          {/* Pan Axis Slider */}
          <div className="axis-control">
            <div className="axis-control__header">
              <span className="axis-control__name">Motor 1: Pan (Horizontal Axis)</span>
              <span className="axis-control__badge">{targetPan.toFixed(1)}°</span>
            </div>
            <div className="slider-row">
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(Math.max(0, targetPan - 5), targetTilt, speed, true)}
                type="button"
              >
                -5°
              </button>
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(Math.max(0, targetPan - 1), targetTilt, speed, true)}
                type="button"
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
                onChange={(e) => sendTargetCoordinates(parseFloat(e.target.value), targetTilt, speed, true)}
                className="servo-slider"
                aria-label="Pan angle slider"
              />
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(Math.min(180, targetPan + 1), targetTilt, speed, true)}
                type="button"
              >
                +1°
              </button>
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(Math.min(180, targetPan + 5), targetTilt, speed, true)}
                type="button"
              >
                +5°
              </button>
            </div>
            <div className="slider-labels">
              <span>0° (Right)</span>
              <span>90° (Center)</span>
              <span>180° (Left)</span>
            </div>
          </div>

          {/* Tilt Axis Slider */}
          <div className="axis-control">
            <div className="axis-control__header">
              <span className="axis-control__name">Motor 2: Tilt (Vertical Axis - Chin/Up)</span>
              <span className="axis-control__badge">{targetTilt.toFixed(1)}°</span>
            </div>
            <div className="slider-row">
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(targetPan, Math.max(30, targetTilt - 5), speed, true)}
                type="button"
              >
                -5°
              </button>
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(targetPan, Math.max(30, targetTilt - 1), speed, true)}
                type="button"
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
                onChange={(e) => sendTargetCoordinates(targetPan, parseFloat(e.target.value), speed, true)}
                className="servo-slider"
                aria-label="Tilt angle slider"
              />
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(targetPan, Math.min(150, targetTilt + 1), speed, true)}
                type="button"
              >
                +1°
              </button>
              <button
                className="btn btn--icon"
                disabled={telemetry.is_emergency_stopped}
                onClick={() => sendTargetCoordinates(targetPan, Math.min(150, targetTilt + 5), speed, true)}
                type="button"
              >
                +5°
              </button>
            </div>
            <div className="slider-labels">
              <span>30° (Down - Chin)</span>
              <span>90° (Normal Gaze)</span>
              <span>150° (Up - Head)</span>
            </div>
          </div>

          {/* Speed Control & Inversion Row */}
          <div className="speed-and-inversion">
            <div className="speed-control">
              <div className="speed-control__header">
                <span>Movement Speed:</span>
                <strong>{speed}%</strong>
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

            <div className="inversion-controls">
              <span className="inversion-controls__label">Hardware Direction Adjustment:</span>
              <div className="inversion-controls__buttons">
                <button
                  className={`btn btn--small ${calibration.find((c) => c.servo_name === "pan")?.invert ? "btn--primary" : "btn--secondary"}`}
                  onClick={handleTogglePanInvert}
                  title="Invert Pan (Left ⇄ Right) axis direction"
                  type="button"
                >
                  ⇄ Invert Pan {calibration.find((c) => c.servo_name === "pan")?.invert ? "(ON)" : "(OFF)"}
                </button>
                <button
                  className={`btn btn--small ${calibration.find((c) => c.servo_name === "tilt")?.invert ? "btn--primary" : "btn--secondary"}`}
                  onClick={handleToggleTiltInvert}
                  title="Invert Tilt (Up ⇄ Down) axis direction"
                  type="button"
                >
                  ⇅ Invert Tilt {calibration.find((c) => c.servo_name === "tilt")?.invert ? "(ON)" : "(OFF)"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Diagnostics HUD */}
        <div className="card telemetry-card">
          <div className="card__header">
            <div>
              <h3 className="card__title">Hardware Diagnostics HUD</h3>
              <span className="card__subtitle">Connection metrics & bus latency</span>
            </div>
          </div>

          <div className="hud-metrics">
            <div className="hud-metric">
              <span className="hud-metric__label">Hardware State</span>
              <span className="hud-metric__value">
                {telemetry.connected ? "🟢 ONLINE" : "🔴 OFFLINE"}
              </span>
            </div>
            <div className="hud-metric">
              <span className="hud-metric__label">Controller Driver</span>
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
              <span className="hud-metric__label">Telemetry Transport</span>
              <span className="hud-metric__value">
                {wsConnected ? "⚡ WebSocket (Live)" : "🔄 REST Polling"}
              </span>
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