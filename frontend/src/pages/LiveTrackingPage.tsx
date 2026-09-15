import React, { useEffect, useState, useCallback, useRef } from "react";
import { visionService, VisionStatus } from "../services/visionService";
import { trainingService, InferenceStatus } from "../services/trainingService";
import "./LiveTrackingPage.css";

export default function LiveTrackingPage() {
  const [status, setStatus] = useState<VisionStatus>({
    camera_running: false,
    is_tracking: false,
    tracking_mode: "off",
    fps: 0,
    face_detected: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    confidence: 0,
    bbox: [0, 0, 0, 0],
    sensitivity: 0.5,
    smoothing_alpha: 0.35,
    dead_zone: 3.0,
  });

  const [inferenceStatus, setInferenceStatus] = useState<InferenceStatus | null>(null);
  const [overlayMesh, setOverlayMesh] = useState(true);
  const [overlayBbox, setOverlayBbox] = useState(true);
  const [overlayAxis, setOverlayAxis] = useState(true);
  const [selectedMode, setSelectedMode] = useState("mirror");
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [togglingReaction, setTogglingReaction] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await visionService.getStatus();
      setStatus(data);
      if (data.tracking_mode !== "off") {
        setSelectedMode(data.tracking_mode);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Vision backend offline");
    }

    try {
      const inf = await trainingService.getInferenceStatus();
      setInferenceStatus(inf);
    } catch {
      // Inference status failure is non-blocking
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollTimerRef.current = window.setInterval(fetchStatus, 500);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchStatus]);

  const handleToggleTracking = async () => {
    try {
      if (status.is_tracking) {
        const updated = await visionService.stopTracking();
        setStatus(updated);
      } else {
        const updated = await visionService.startTracking(selectedMode);
        setStatus(updated);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to toggle tracking");
    }
  };

  const handleModeChange = async (mode: string) => {
    setSelectedMode(mode);
    if (status.is_tracking) {
      try {
        const updated = await visionService.startTracking(mode);
        setStatus(updated);
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const handleConfigChange = async (key: string, value: number) => {
    try {
      const updated = await visionService.updateConfig({ [key]: value });
      setStatus(updated);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Determine direction labels
  const getYawLabel = (yaw: number) => {
    if (Math.abs(yaw) < status.dead_zone) return "CENTER";
    return yaw > 0 ? "TURNING RIGHT ➡️" : "TURNING LEFT ⬅️";
  };

  const getPitchLabel = (pitch: number) => {
    if (Math.abs(pitch) < status.dead_zone) return "LEVEL";
    return pitch > 0 ? "TILTING UP ⬆️" : "TILTING DOWN ⬇️";
  };

  const streamUrl = visionService.getStreamUrl(overlayMesh || overlayBbox || overlayAxis);

  const handleToggleAutonomousReaction = async () => {
    if (!inferenceStatus) return;
    try {
      setTogglingReaction(true);
      const nextState = !inferenceStatus.autonomous_reaction_enabled;
      const updated = await trainingService.toggleAutonomousReaction(nextState);
      setInferenceStatus(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to toggle autonomous reaction");
    } finally {
      setTogglingReaction(false);
    }
  };

  const getGestureBadge = (gesture?: string | null) => {
    switch (gesture) {
      case "yes_nod":
        return { label: "YES (NOD) ↕️", class: "gesture-badge--yes" };
      case "no_shake":
        return { label: "NO (SHAKE) ↔️", class: "gesture-badge--no" };
      case "head_tilt_left":
        return { label: "TILT LEFT 🔄", class: "gesture-badge--tilt" };
      case "head_tilt_right":
        return { label: "TILT RIGHT 🔄", class: "gesture-badge--tilt" };
      case "look_away":
        return { label: "LOOK AWAY 👀", class: "gesture-badge--away" };
      case "attention":
        return { label: "ATTENTION ✨", class: "gesture-badge--attention" };
      default:
        return { label: "MONITORING / IDLE", class: "gesture-badge--idle" };
    }
  };

  const gestureInfo = getGestureBadge(inferenceStatus?.last_detected_gesture);

  return (
    <div className="live-tracking" data-testid="live-tracking-page">
      {/* Header */}
      <div className="live-tracking__header">
        <div>
          <h1 className="live-tracking__title">Computer Vision & Live Tracking</h1>
          <p className="live-tracking__subtitle">
            Real-time MediaPipe face mesh, 3D head pose estimation (solvePnP), and real-time ML gesture prediction
          </p>
        </div>
        <div className="live-tracking__header-actions">
          <button
            className={`btn ${status.is_tracking ? "btn--danger btn--pulse" : "btn--primary"}`}
            onClick={handleToggleTracking}
          >
            {status.is_tracking ? "🛑 STOP TRACKING" : "▶ START TRACKING"}
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button className="btn btn--small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="live-tracking__grid">
        {/* Left Column: Video Viewport & Overlays */}
        <div className="live-tracking__viewport-col">
          <div className="card viewport-card">
            <div className="viewport-card__header">
              <div className="viewport-status">
                <span className={`status-dot ${status.is_tracking ? "status-dot--active" : ""}`} />
                <span className="viewport-status__text">
                  {status.is_tracking
                    ? `ACTIVE // MODE: ${status.tracking_mode.toUpperCase()}`
                    : "STANDBY // PREVIEW ONLY"}
                </span>
              </div>
              <div className="viewport-fps">
                <span>⚡ {status.fps.toFixed(1)} FPS</span>
              </div>
            </div>

            <div className="video-container">
              {!streamError ? (
                <img
                  src={streamUrl}
                  alt="Live Camera Feed with Face Mesh Overlay"
                  className="video-feed"
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="video-placeholder">
                  <div className="video-placeholder__reticle" />
                  <span>CAMERA STREAM CONNECTING...</span>
                  <button className="btn btn--small" onClick={() => setStreamError(false)}>
                    Retry Stream
                  </button>
                </div>
              )}

              {/* HUD Reticle Overlay */}
              <div className="hud-overlay">
                <div className="hud-corner hud-corner--tl" />
                <div className="hud-corner hud-corner--tr" />
                <div className="hud-corner hud-corner--bl" />
                <div className="hud-corner hud-corner--br" />
                <div className="hud-center-cross" />
              </div>
            </div>

            {/* Overlay Toggles */}
            <div className="overlay-toggles">
              <span className="overlay-toggles__label">HUD Overlays:</span>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={overlayMesh}
                  onChange={(e) => setOverlayMesh(e.target.checked)}
                />
                Face Mesh
              </label>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={overlayBbox}
                  onChange={(e) => setOverlayBbox(e.target.checked)}
                />
                Bounding Box
              </label>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={overlayAxis}
                  onChange={(e) => setOverlayAxis(e.target.checked)}
                />
                3D Pose Vectors
              </label>
            </div>
          </div>

          {/* ML Real-time Gesture Prediction Card */}
          <div className="card ml-prediction-card" data-testid="gesture-prediction-hud">
            <div className="ml-prediction-card__header">
              <div className="ml-title-group">
                <span className="ml-title-icon">🧠</span>
                <div>
                  <h2 className="card__title">Real-Time Gesture ML Engine</h2>
                  <span className="ml-subtitle">
                    {inferenceStatus?.active_model_name
                      ? `Model: ${inferenceStatus.active_model_name} (${inferenceStatus.active_model_version || "v1.0.0"})`
                      : "No Model Loaded (Train model in Gesture Studio)"}
                  </span>
                </div>
              </div>
              <div className="ml-cooldown-badge">
                {inferenceStatus?.is_cooldown_active ? (
                  <span className="badge badge--warning">
                    ⏳ COOLDOWN ({inferenceStatus.cooldown_remaining_sec.toFixed(1)}s)
                  </span>
                ) : inferenceStatus?.is_ready ? (
                  <span className="badge badge--success">⚡ READY (30 FPS)</span>
                ) : (
                  <span className="badge badge--neutral">
                    BUFFERING ({inferenceStatus?.buffer_frames || 0}/{inferenceStatus?.buffer_capacity || 30})
                  </span>
                )}
              </div>
            </div>

            {/* Live Detected Gesture Banner */}
            <div className="gesture-live-banner">
              <div className="gesture-live-banner__main">
                <span className="gesture-live-banner__label">DETECTED GESTURE:</span>
                <span className={`gesture-live-banner__value ${gestureInfo.class}`}>
                  {gestureInfo.label}
                </span>
              </div>
              <div className="gesture-live-banner__confidence">
                <span>Confidence:</span>
                <span className="gesture-conf-num">
                  {Math.round((inferenceStatus?.last_confidence || 0) * 100)}%
                </span>
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="confidence-meter-bar">
              <div
                className="confidence-meter-fill"
                style={{ width: `${Math.round((inferenceStatus?.last_confidence || 0) * 100)}%` }}
              />
            </div>

            {/* Autonomous Robot Reaction Controls */}
            <div className="autonomous-reaction-box">
              <div className="autonomous-reaction-info">
                <span className="autonomous-reaction-title">🤖 Autonomous Robot Reaction</span>
                <span className="autonomous-reaction-desc">
                  Robot automatically nods or shakes servos when human gesture confidence exceeds 80%
                </span>
              </div>
              <button
                className={`btn btn--small ${
                  inferenceStatus?.autonomous_reaction_enabled ? "btn--primary" : "btn--secondary"
                }`}
                onClick={handleToggleAutonomousReaction}
                disabled={togglingReaction}
              >
                {inferenceStatus?.autonomous_reaction_enabled ? "✅ ENABLED" : "DISABLED"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: 3D Pose Angles & Closed-Loop Controls */}
        <div className="live-tracking__controls-col">
          {/* 3D Pose HUD Gauge */}
          <div className="card pose-hud-card">
            <h2 className="card__title">3D Head Pose Estimation</h2>

            <div className="pose-meters">
              {/* Yaw Meter */}
              <div className="pose-meter">
                <div className="pose-meter__header">
                  <span className="pose-meter__name">YAW (Horizontal)</span>
                  <span className="pose-meter__value">{status.yaw.toFixed(1)}°</span>
                </div>
                <div className="pose-meter__bar-bg">
                  <div
                    className="pose-meter__bar-fill"
                    style={{
                      width: `${Math.min(100, Math.abs(status.yaw) * 2)}%`,
                      left: status.yaw >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(status.yaw))}%`,
                    }}
                  />
                  <div className="pose-meter__center-mark" />
                </div>
                <span className="pose-meter__sub">{getYawLabel(status.yaw)}</span>
              </div>

              {/* Pitch Meter */}
              <div className="pose-meter">
                <div className="pose-meter__header">
                  <span className="pose-meter__name">PITCH (Vertical)</span>
                  <span className="pose-meter__value">{status.pitch.toFixed(1)}°</span>
                </div>
                <div className="pose-meter__bar-bg">
                  <div
                    className="pose-meter__bar-fill pose-meter__bar-fill--pitch"
                    style={{
                      width: `${Math.min(100, Math.abs(status.pitch) * 2.5)}%`,
                      left: status.pitch >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(status.pitch) * 1.25)}%`,
                    }}
                  />
                  <div className="pose-meter__center-mark" />
                </div>
                <span className="pose-meter__sub">{getPitchLabel(status.pitch)}</span>
              </div>

              {/* Roll Meter */}
              <div className="pose-meter">
                <div className="pose-meter__header">
                  <span className="pose-meter__name">ROLL (Tilt)</span>
                  <span className="pose-meter__value">{status.roll.toFixed(1)}°</span>
                </div>
                <div className="pose-meter__bar-bg">
                  <div
                    className="pose-meter__bar-fill pose-meter__bar-fill--roll"
                    style={{
                      width: `${Math.min(100, Math.abs(status.roll) * 3)}%`,
                      left: status.roll >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(status.roll) * 1.5)}%`,
                    }}
                  />
                  <div className="pose-meter__center-mark" />
                </div>
              </div>
            </div>

            {/* Target Detection Metric */}
            <div className="detection-banner">
              <div className="detection-status">
                <span className={`detection-indicator ${status.face_detected ? "detection-indicator--active" : ""}`}>
                  {status.face_detected ? "TARGET ACQUIRED" : "NO TARGET DETECTED"}
                </span>
              </div>
              <span className="confidence-text">
                Confidence: {Math.round(status.confidence * 100)}%
              </span>
            </div>
          </div>

          {/* Tracking Modes & Sensitivity Controls */}
          <div className="card tuning-card">
            <h2 className="card__title">Tracking Modes & Tuning</h2>

            <div className="mode-selector">
              <button
                className={`mode-btn ${selectedMode === "mirror" ? "mode-btn--active" : ""}`}
                onClick={() => handleModeChange("mirror")}
              >
                <span className="mode-btn__icon">🪞</span>
                <span className="mode-btn__title">Mirror Pose</span>
                <span className="mode-btn__desc">Directly copy human head angles</span>
              </button>
              <button
                className={`mode-btn ${selectedMode === "follow" ? "mode-btn--active" : ""}`}
                onClick={() => handleModeChange("follow")}
              >
                <span className="mode-btn__icon">🎯</span>
                <span className="mode-btn__title">Center Face</span>
                <span className="mode-btn__desc">Inverted track to keep face centered</span>
              </button>
            </div>

            {/* Tuning Sliders */}
            <div className="tuning-sliders">
              <div className="tuning-slider">
                <div className="tuning-slider__header">
                  <span>Tracking Sensitivity</span>
                  <span>{status.sensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={status.sensitivity}
                  onChange={(e) => handleConfigChange("sensitivity", parseFloat(e.target.value))}
                  aria-label="Tracking sensitivity slider"
                />
              </div>

              <div className="tuning-slider">
                <div className="tuning-slider__header">
                  <span>EMA Motion Smoothing (Alpha)</span>
                  <span>{status.smoothing_alpha.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  value={status.smoothing_alpha}
                  onChange={(e) => handleConfigChange("smoothing_alpha", parseFloat(e.target.value))}
                  aria-label="Motion smoothing alpha slider"
                />
              </div>

              <div className="tuning-slider">
                <div className="tuning-slider__header">
                  <span>Dead-Zone Filter</span>
                  <span>{status.dead_zone.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="10.0"
                  step="0.5"
                  value={status.dead_zone}
                  onChange={(e) => handleConfigChange("dead_zone", parseFloat(e.target.value))}
                  aria-label="Dead zone filter slider"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}