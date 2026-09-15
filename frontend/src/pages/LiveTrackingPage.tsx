import React, { useEffect, useState, useCallback, useRef } from "react";
import { visionService, VisionStatus } from "../services/visionService";
import { trainingService, InferenceStatus } from "../services/trainingService";
import { gestureService, RecordStatus } from "../services/gestureService";
import { servoService } from "../services/servoService";
import "./LiveTrackingPage.css";

// ─── Gesture class definitions ────────────────────────────────────────────────
const GESTURE_CLASSES = [
  { name: "yes_nod",        label: "YES Nod ↕️",      color: "#22c55e", icon: "✅", hint: "Nod head up & down 2x" },
  { name: "no_shake",       label: "NO Shake ↔️",     color: "#ef4444", icon: "❌", hint: "Shake head left & right 2x" },
  { name: "head_tilt_left", label: "Tilt Left 🔄",    color: "#a78bfa", icon: "↖️", hint: "Tilt head to left shoulder" },
  { name: "head_tilt_right",label: "Tilt Right 🔄",   color: "#f59e0b", icon: "↗️", hint: "Tilt head to right shoulder" },
  { name: "look_away",      label: "Look Away 👀",    color: "#64748b", icon: "😶", hint: "Look away from camera" },
  { name: "attention",      label: "Attention ✨",    color: "#06b6d4", icon: "👁️", hint: "Look straight at camera" },
];

const GESTURE_BADGE_MAP: Record<string, { label: string; cls: string; color: string }> = {
  yes_nod:        { label: "YES — NOD ↕️",     cls: "gesture-badge--yes",       color: "#22c55e" },
  no_shake:       { label: "NO — SHAKE ↔️",    cls: "gesture-badge--no",        color: "#ef4444" },
  head_tilt_left: { label: "TILT LEFT 🔄",     cls: "gesture-badge--tilt",      color: "#a78bfa" },
  head_tilt_right:{ label: "TILT RIGHT 🔄",    cls: "gesture-badge--tilt",      color: "#f59e0b" },
  look_away:      { label: "LOOK AWAY 👀",     cls: "gesture-badge--away",      color: "#64748b" },
  attention:      { label: "ATTENTION ✨",     cls: "gesture-badge--attention", color: "#06b6d4" },
};

export default function LiveTrackingPage() {
  // ── Vision state ─────────────────────────────────────────────────────────
  const [status, setStatus] = useState<VisionStatus>({
    camera_running: false, is_tracking: false, tracking_mode: "off",
    fps: 0, face_detected: false, yaw: 0, pitch: 0, roll: 0,
    confidence: 0, bbox: [0, 0, 0, 0], sensitivity: 0.5,
    smoothing_alpha: 0.35, dead_zone: 3.0,
  });
  const [cameraOn, setCameraOn] = useState(false);
  const [selectedMode, setSelectedMode] = useState("mirror");
  const [overlayMesh, setOverlayMesh] = useState(true);
  const [overlayBbox, setOverlayBbox]   = useState(true);
  const [overlayAxis, setOverlayAxis]   = useState(true);
  const [streamError, setStreamError]   = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Inference / gesture state ─────────────────────────────────────────────
  const [inferenceStatus, setInferenceStatus] = useState<InferenceStatus | null>(null);
  const [togglingReaction, setTogglingReaction] = useState(false);
  const [lastMotorCmd, setLastMotorCmd] = useState<string | null>(null);
  const lastGestureRef = useRef<string | null>(null);

  // ── Quick gesture lab state ────────────────────────────────────────────────
  const [labOpen, setLabOpen]                     = useState(false);
  const [recording, setRecording]                 = useState<RecordStatus | null>(null);
  const [activeRecordGesture, setActiveRecordGesture] = useState<string | null>(null);
  const [sampleCounts, setSampleCounts]           = useState<Record<string, number>>({});
  const [trainingInProgress, setTrainingInProgress] = useState(false);
  const [trainMsg, setTrainMsg]                   = useState<string | null>(null);
  const recordPollRef = useRef<number | null>(null);
  const pollTimerRef  = useRef<number | null>(null);

  // ── Servo position display ────────────────────────────────────────────────
  const [servoPan,  setServoPan]  = useState(90);
  const [servoTilt, setServoTilt] = useState(90);

  // ─────────────────────────────────────────────────────────────────────────
  // Polling loop: vision status + inference + servo position
  // ─────────────────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const data = await visionService.getStatus();
      setStatus(data);
      if (data.tracking_mode !== "off") setSelectedMode(data.tracking_mode);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Vision backend offline");
    }
    try {
      const inf = await trainingService.getInferenceStatus();
      setInferenceStatus(inf);

      // ── Auto motor command when new gesture detected ──────────────────
      const detected = inf?.last_detected_gesture;
      if (detected && detected !== lastGestureRef.current && inf.last_confidence >= 0.8) {
        lastGestureRef.current = detected;
        if (detected === "yes_nod") {
          setLastMotorCmd("▲▼ SERVO NOD (YES)");
          try { await servoService.executeGesture("yes"); } catch {}
          setTimeout(() => setLastMotorCmd(null), 2500);
        } else if (detected === "no_shake") {
          setLastMotorCmd("◄► SERVO SHAKE (NO)");
          try { await servoService.executeGesture("no"); } catch {}
          setTimeout(() => setLastMotorCmd(null), 2500);
        }
      }
    } catch {}
    try {
      const sv = await servoService.getStatus();
      setServoPan(sv.pan_angle ?? 90);
      setServoTilt(sv.tilt_angle ?? 90);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    pollTimerRef.current = window.setInterval(fetchStatus, 500);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchStatus]);

  // Refresh sample counts whenever lab opens
  useEffect(() => {
    if (!labOpen) return;
    (async () => {
      const counts: Record<string, number> = {};
      for (const g of GESTURE_CLASSES) {
        try {
          const samples = await gestureService.getSamples(g.name);
          counts[g.name] = samples.length;
        } catch { counts[g.name] = 0; }
      }
      setSampleCounts(counts);
    })();
  }, [labOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // Camera toggle
  // ─────────────────────────────────────────────────────────────────────────
  const handleCameraToggle = () => {
    if (cameraOn) {
      // Turn off tracking too
      if (status.is_tracking) {
        visionService.stopTracking().catch(() => {});
      }
      setCameraOn(false);
      setStreamError(false);
    } else {
      setCameraOn(true);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tracking toggle
  // ─────────────────────────────────────────────────────────────────────────
  const handleToggleTracking = async () => {
    try {
      if (status.is_tracking) {
        await visionService.stopTracking();
      } else {
        if (!cameraOn) setCameraOn(true);
        await visionService.startTracking(selectedMode);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to toggle tracking");
    }
  };

  const handleModeChange = async (mode: string) => {
    setSelectedMode(mode);
    if (status.is_tracking) {
      try { await visionService.startTracking(mode); } catch {}
    }
  };

  const handleConfigChange = async (key: string, value: number) => {
    try { await visionService.updateConfig({ [key]: value }); } catch {}
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Quick gesture lab — record + retrain
  // ─────────────────────────────────────────────────────────────────────────
  const startRecord = async (gestureName: string) => {
    if (activeRecordGesture) return;
    if (!cameraOn) { setCameraOn(true); await new Promise(r => setTimeout(r, 600)); }
    try {
      setActiveRecordGesture(gestureName);
      await gestureService.startRecording(gestureName, 30, 3);
      setRecording({ status: "countdown", countdown_remaining: 3, frames_captured: 0, total_frames: 30, duration_seconds: 1 });

      recordPollRef.current = window.setInterval(async () => {
        try {
          const st = await gestureService.getRecordingStatus();
          setRecording(st);
          if (st.status === "completed" || st.status === "cancelled" || st.status === "idle") {
            clearInterval(recordPollRef.current!);
            setActiveRecordGesture(null);
            setRecording(null);
            // Refresh counts
            const samples = await gestureService.getSamples(gestureName);
            setSampleCounts(prev => ({ ...prev, [gestureName]: samples.length }));
          }
        } catch {
          clearInterval(recordPollRef.current!);
          setActiveRecordGesture(null);
          setRecording(null);
        }
      }, 200);
    } catch (err: any) {
      setActiveRecordGesture(null);
      setError("Record failed: " + err?.message);
    }
  };

  const cancelRecord = async () => {
    clearInterval(recordPollRef.current!);
    try { await gestureService.cancelRecording(); } catch {}
    setActiveRecordGesture(null);
    setRecording(null);
  };

  const handleTrainNow = async () => {
    setTrainingInProgress(true);
    setTrainMsg("Training gesture model with real samples…");
    try {
      const model = await trainingService.trainModel({ model_name: "Live-Gesture-RF", model_type: "sklearn_rf" });
      if (model.id) {
        await trainingService.activateModel(model.id);
        const acc = model.metrics?.test_accuracy ?? 0;
        setTrainMsg(`✅ Model trained & activated! Test accuracy: ${(acc * 100).toFixed(1)}%`);
      }
    } catch (err: any) {
      setTrainMsg("❌ Training failed: " + (err?.response?.data?.detail || err.message));
    } finally {
      setTrainingInProgress(false);
      setTimeout(() => setTrainMsg(null), 6000);
    }
  };

  const handleToggleAutonomousReaction = async () => {
    if (!inferenceStatus) return;
    try {
      setTogglingReaction(true);
      const updated = await trainingService.toggleAutonomousReaction(!inferenceStatus.autonomous_reaction_enabled);
      setInferenceStatus(updated);
    } catch {} finally { setTogglingReaction(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
  const getYawLabel  = (v: number) => Math.abs(v) < status.dead_zone ? "CENTER"         : v > 0 ? "RIGHT ➡️"   : "LEFT ⬅️";
  const getPitchLabel= (v: number) => Math.abs(v) < status.dead_zone ? "LEVEL"          : v > 0 ? "UP ⬆️"     : "DOWN ⬇️";
  const gestureInfo  = GESTURE_BADGE_MAP[inferenceStatus?.last_detected_gesture ?? ""] ?? { label: "MONITORING…", cls: "gesture-badge--idle", color: "#64748b" };
  const streamUrl    = visionService.getStreamUrl(overlayMesh || overlayBbox || overlayAxis);
  const totalSamples = Object.values(sampleCounts).reduce((a, b) => a + b, 0);
  const canTrain     = totalSamples >= 10;

  return (
    <div className="live-tracking" data-testid="live-tracking-page">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="live-tracking__header">
        <div>
          <h1 className="live-tracking__title">Computer Vision & Live Tracking</h1>
          <p className="live-tracking__subtitle">
            Real-time MediaPipe face tracking · Gesture prediction · Motor control
          </p>
        </div>
        <div className="live-tracking__header-actions">
          {/* Camera Power Button */}
          <button
            className={`btn cam-power-btn ${cameraOn ? "cam-power-btn--on" : "cam-power-btn--off"}`}
            onClick={handleCameraToggle}
            title={cameraOn ? "Turn camera OFF" : "Turn camera ON"}
          >
            <span className="cam-power-icon">{cameraOn ? "🟢" : "⚫"}</span>
            {cameraOn ? "CAM ON" : "CAM OFF"}
          </button>

          <button
            className={`btn ${status.is_tracking ? "btn--danger btn--pulse" : "btn--primary"}`}
            onClick={handleToggleTracking}
            disabled={!cameraOn && !status.is_tracking}
          >
            {status.is_tracking ? "🛑 STOP TRACKING" : "▶ START TRACKING"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button className="btn btn--small" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Motor Command Flash ──────────────────────────────────────────── */}
      {lastMotorCmd && (
        <div className="motor-cmd-flash">
          <span className="motor-cmd-icon">⚙️</span>
          <span>{lastMotorCmd}</span>
        </div>
      )}

      {/* ── Main 2-column grid ──────────────────────────────────────────── */}
      <div className="live-tracking__grid">

        {/* ── LEFT: Camera + ML Prediction ─────────────────────────────── */}
        <div className="live-tracking__viewport-col">

          {/* Camera viewport */}
          <div className="card viewport-card">
            <div className="viewport-card__header">
              <div className="viewport-status">
                <span className={`status-dot ${status.is_tracking ? "status-dot--active" : cameraOn ? "status-dot--preview" : ""}`} />
                <span className="viewport-status__text">
                  {status.is_tracking
                    ? `TRACKING // ${status.tracking_mode.toUpperCase()}`
                    : cameraOn ? "PREVIEW // FACE DETECTION ACTIVE" : "CAMERA OFF"}
                </span>
              </div>
              <div className="viewport-fps">
                <span>⚡ {status.fps.toFixed(1)} FPS</span>
              </div>
            </div>

            <div className="video-container">
              {cameraOn ? (
                !streamError ? (
                  <img
                    src={streamUrl}
                    alt="Live camera feed with face mesh overlay"
                    className="video-feed"
                    onError={() => setStreamError(true)}
                  />
                ) : (
                  <div className="video-placeholder">
                    <div className="video-placeholder__reticle" />
                    <span>Camera stream error</span>
                    <button className="btn btn--small" onClick={() => setStreamError(false)}>Retry</button>
                  </div>
                )
              ) : (
                <div className="video-placeholder video-placeholder--off">
                  <div className="cam-off-icon">📷</div>
                  <span>Camera is OFF</span>
                  <button className="btn btn--primary btn--small" onClick={handleCameraToggle}>
                    Turn Camera ON
                  </button>
                </div>
              )}

              {/* HUD corners */}
              {cameraOn && (
                <div className="hud-overlay">
                  <div className="hud-corner hud-corner--tl" />
                  <div className="hud-corner hud-corner--tr" />
                  <div className="hud-corner hud-corner--bl" />
                  <div className="hud-corner hud-corner--br" />
                  <div className="hud-center-cross" />
                </div>
              )}
            </div>

            {/* Overlay toggles */}
            {cameraOn && (
              <div className="overlay-toggles">
                <span className="overlay-toggles__label">Overlays:</span>
                {[
                  { label: "Face Mesh",     val: overlayMesh, set: setOverlayMesh },
                  { label: "Bounding Box",  val: overlayBbox, set: setOverlayBbox },
                  { label: "3D Vectors",    val: overlayAxis, set: setOverlayAxis },
                ].map(o => (
                  <label key={o.label} className="toggle-chip">
                    <input type="checkbox" checked={o.val} onChange={e => o.set(e.target.checked)} />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ML Gesture Prediction card */}
          <div className="card ml-prediction-card" data-testid="gesture-prediction-hud">
            <div className="ml-prediction-card__header">
              <div className="ml-title-group">
                <span className="ml-title-icon">🧠</span>
                <div>
                  <h2 className="card__title">Real-Time Gesture Prediction</h2>
                  <span className="ml-subtitle">
                    {inferenceStatus?.active_model_name
                      ? `Model: ${inferenceStatus.active_model_name}`
                      : "No model loaded — train one in the Gesture Lab below"}
                  </span>
                </div>
              </div>
              <div className="ml-cooldown-badge">
                {inferenceStatus?.is_cooldown_active ? (
                  <span className="badge badge--warning">
                    ⏳ COOLDOWN ({inferenceStatus.cooldown_remaining_sec.toFixed(1)}s)
                  </span>
                ) : inferenceStatus?.is_ready ? (
                  <span className="badge badge--success">⚡ READY</span>
                ) : (
                  <span className="badge badge--neutral">
                    BUFFERING ({inferenceStatus?.buffer_frames ?? 0}/{inferenceStatus?.buffer_capacity ?? 30})
                  </span>
                )}
              </div>
            </div>

            {/* Detected gesture banner */}
            <div className="gesture-live-banner" style={{ borderColor: gestureInfo.color + "55" }}>
              <div className="gesture-live-banner__main">
                <span className="gesture-live-banner__label">DETECTED:</span>
                <span className={`gesture-live-banner__value ${gestureInfo.cls}`}
                      style={{ color: gestureInfo.color }}>
                  {gestureInfo.label}
                </span>
              </div>
              <div className="gesture-live-banner__confidence">
                <span>Confidence:</span>
                <span className="gesture-conf-num">
                  {Math.round((inferenceStatus?.last_confidence ?? 0) * 100)}%
                </span>
              </div>
            </div>
            <div className="confidence-meter-bar">
              <div
                className="confidence-meter-fill"
                style={{
                  width: `${Math.round((inferenceStatus?.last_confidence ?? 0) * 100)}%`,
                  background: gestureInfo.color,
                }}
              />
            </div>

            {/* Autonomous Robot Reaction toggle */}
            <div className="autonomous-reaction-box">
              <div className="autonomous-reaction-info">
                <span className="autonomous-reaction-title">🤖 Motor Auto-Reaction</span>
                <span className="autonomous-reaction-desc">
                  Robot physically nods/shakes when gesture confidence ≥ 80%
                </span>
              </div>
              <button
                className={`btn btn--small ${inferenceStatus?.autonomous_reaction_enabled ? "btn--primary" : "btn--secondary"}`}
                onClick={handleToggleAutonomousReaction}
                disabled={togglingReaction}
              >
                {inferenceStatus?.autonomous_reaction_enabled ? "✅ ENABLED" : "DISABLED"}
              </button>
            </div>
          </div>

          {/* ── Gesture Quick Lab ────────────────────────────────────── */}
          <div className="card gesture-lab-card">
            <div className="gesture-lab__header" onClick={() => setLabOpen(v => !v)} style={{ cursor: "pointer" }}>
              <div className="gesture-lab__title-group">
                <span className="gesture-lab__icon">🎓</span>
                <div>
                  <h2 className="card__title">Gesture Training Lab</h2>
                  <span className="ml-subtitle">
                    Record real samples from live camera → retrain model
                  </span>
                </div>
              </div>
              <span className={`lab-chevron ${labOpen ? "lab-chevron--open" : ""}`}>▼</span>
            </div>

            {labOpen && (
              <div className="gesture-lab__body">
                {/* Data quality warning if no real samples */}
                {totalSamples < 10 && (
                  <div className="lab-warning">
                    ⚠️ <strong>Low Training Data:</strong> The current model uses synthetic data only.
                    Record at least <strong>5 real samples per gesture</strong> for accurate results.
                  </div>
                )}

                {/* Recording progress */}
                {recording && activeRecordGesture && (
                  <div className="lab-recording-bar">
                    <div className="lab-recording-bar__top">
                      <span>
                        {recording.status === "countdown"
                          ? `⏳ Get ready: ${recording.countdown_remaining.toFixed(1)}s`
                          : `🔴 Recording ${activeRecordGesture}: ${recording.frames_captured}/${recording.total_frames} frames`}
                      </span>
                      <button className="btn btn--danger btn--small" onClick={cancelRecord}>✕ Cancel</button>
                    </div>
                    <div className="lab-progress-track">
                      <div
                        className="lab-progress-fill"
                        style={{ width: `${(recording.frames_captured / recording.total_frames) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Gesture grid */}
                <div className="gesture-lab__grid">
                  {GESTURE_CLASSES.map(g => {
                    const count = sampleCounts[g.name] ?? 0;
                    const isActive = activeRecordGesture === g.name;
                    const isGood   = count >= 5;
                    return (
                      <div
                        key={g.name}
                        className={`lab-gesture-tile ${isActive ? "lab-gesture-tile--recording" : ""}`}
                        style={{ borderColor: g.color + "44" }}
                      >
                        <div className="lab-gesture-tile__icon" style={{ color: g.color }}>{g.icon}</div>
                        <div className="lab-gesture-tile__label">{g.label}</div>
                        <div className="lab-gesture-tile__hint">{g.hint}</div>
                        <div className="lab-gesture-tile__count" style={{ color: isGood ? "#22c55e" : "#f59e0b" }}>
                          {count} sample{count !== 1 ? "s" : ""} {isGood ? "✅" : "(need 5+)"}
                        </div>
                        <button
                          className={`btn btn--small ${isActive ? "btn--danger" : "btn--secondary"}`}
                          style={!isActive ? { borderColor: g.color, color: g.color } : {}}
                          onClick={() => isActive ? cancelRecord() : startRecord(g.name)}
                          disabled={!!activeRecordGesture && !isActive}
                        >
                          {isActive ? "⏳ Recording…" : "⏺ Record"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Train button */}
                <div className="lab-train-row">
                  <div className="lab-train-info">
                    <span>Total real samples: <strong>{totalSamples}</strong></span>
                    {!canTrain && <span className="lab-train-need"> (need at least 10 to train)</span>}
                  </div>
                  <button
                    className="btn btn--primary"
                    onClick={handleTrainNow}
                    disabled={trainingInProgress || !canTrain}
                  >
                    {trainingInProgress ? "⏳ Training…" : "🚀 Train & Activate Model"}
                  </button>
                </div>
                {trainMsg && (
                  <div className={`lab-train-msg ${trainMsg.startsWith("✅") ? "lab-train-msg--ok" : "lab-train-msg--err"}`}>
                    {trainMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Pose + Servo + Tracking Controls ───────────────────── */}
        <div className="live-tracking__controls-col">

          {/* Live Servo Position card */}
          <div className="card servo-pos-card">
            <h2 className="card__title">⚙️ Live Servo Position</h2>
            <div className="servo-display">
              <div className="servo-axis">
                <div className="servo-axis__label">
                  <span>PAN (Horizontal)</span>
                  <span className="servo-axis__angle">{servoPan.toFixed(1)}°</span>
                </div>
                <div className="servo-track">
                  <div className="servo-fill" style={{ width: `${(servoPan / 180) * 100}%` }} />
                  <div className="servo-needle" style={{ left: `${(servoPan / 180) * 100}%` }} />
                  <div className="servo-center-mark" />
                </div>
                <div className="servo-axis__range"><span>0°</span><span>CENTER</span><span>180°</span></div>
              </div>
              <div className="servo-axis">
                <div className="servo-axis__label">
                  <span>TILT (Vertical)</span>
                  <span className="servo-axis__angle">{servoTilt.toFixed(1)}°</span>
                </div>
                <div className="servo-track">
                  <div className="servo-fill servo-fill--tilt" style={{ width: `${((servoTilt - 30) / 120) * 100}%` }} />
                  <div className="servo-needle" style={{ left: `${((servoTilt - 30) / 120) * 100}%` }} />
                  <div className="servo-center-mark" />
                </div>
                <div className="servo-axis__range"><span>30°</span><span>CENTER</span><span>150°</span></div>
              </div>
            </div>
            {lastMotorCmd && (
              <div className="servo-cmd-badge">
                <span>🔴 LIVE</span> {lastMotorCmd}
              </div>
            )}
          </div>

          {/* 3D Pose Estimation card */}
          <div className="card pose-hud-card">
            <h2 className="card__title">3D Head Pose Estimation</h2>
            <div className="pose-meters">
              {[
                { label: "YAW (Horizontal)",  val: status.yaw,   max: 50,  cls: "",         sub: getYawLabel(status.yaw) },
                { label: "PITCH (Vertical)",  val: status.pitch, max: 40,  cls: "--pitch",  sub: getPitchLabel(status.pitch) },
                { label: "ROLL (Tilt)",       val: status.roll,  max: 45,  cls: "--roll",   sub: "" },
              ].map(m => (
                <div key={m.label} className="pose-meter">
                  <div className="pose-meter__header">
                    <span className="pose-meter__name">{m.label}</span>
                    <span className="pose-meter__value">{m.val.toFixed(1)}°</span>
                  </div>
                  <div className="pose-meter__bar-bg">
                    <div
                      className={`pose-meter__bar-fill${m.cls}`}
                      style={{
                        width: `${Math.min(100, Math.abs(m.val) / m.max * 100)}%`,
                        left: m.val >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(m.val) / m.max * 50)}%`,
                      }}
                    />
                    <div className="pose-meter__center-mark" />
                  </div>
                  {m.sub && <span className="pose-meter__sub">{m.sub}</span>}
                </div>
              ))}
            </div>

            {/* Face detection indicator */}
            <div className="detection-banner">
              <div className="detection-status">
                <span className={`detection-indicator ${status.face_detected ? "detection-indicator--active" : ""}`}>
                  {status.face_detected ? "🎯 FACE DETECTED" : "🔍 SEARCHING…"}
                </span>
              </div>
              <span className="confidence-text">
                Confidence: {Math.round(status.confidence * 100)}%
              </span>
            </div>
          </div>

          {/* Tracking Mode & Tuning */}
          <div className="card tuning-card">
            <h2 className="card__title">Tracking Mode & Tuning</h2>
            <div className="mode-selector">
              {[
                { id: "mirror", icon: "🪞", title: "Mirror Pose",  desc: "Head angles copied 1:1 to robot" },
                { id: "follow", icon: "🎯", title: "Center Face",  desc: "Robot tracks to center you in frame" },
              ].map(m => (
                <button
                  key={m.id}
                  className={`mode-btn ${selectedMode === m.id ? "mode-btn--active" : ""}`}
                  onClick={() => handleModeChange(m.id)}
                >
                  <span className="mode-btn__icon">{m.icon}</span>
                  <span className="mode-btn__title">{m.title}</span>
                  <span className="mode-btn__desc">{m.desc}</span>
                </button>
              ))}
            </div>

            <div className="tuning-sliders">
              {[
                { key: "sensitivity",     label: "Tracking Sensitivity", min: 0.1, max: 1.5, step: 0.05, val: status.sensitivity,    fmt: (v: number) => `${v.toFixed(2)}x` },
                { key: "smoothing_alpha", label: "EMA Smoothing (Alpha)", min: 0.05,max: 0.9,  step: 0.05, val: status.smoothing_alpha,fmt: (v: number) => v.toFixed(2) },
                { key: "dead_zone",       label: "Dead-Zone Filter",      min: 0,   max: 10,   step: 0.5,  val: status.dead_zone,     fmt: (v: number) => `${v.toFixed(1)}°` },
              ].map(sl => (
                <div key={sl.key} className="tuning-slider">
                  <div className="tuning-slider__header">
                    <span>{sl.label}</span>
                    <span>{sl.fmt(sl.val)}</span>
                  </div>
                  <input
                    type="range" min={sl.min} max={sl.max} step={sl.step} value={sl.val}
                    onChange={e => handleConfigChange(sl.key, parseFloat(e.target.value))}
                    aria-label={`${sl.label} slider`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}