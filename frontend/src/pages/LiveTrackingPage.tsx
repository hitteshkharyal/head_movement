import React, { useEffect, useState, useCallback, useRef } from "react";
import { visionService, VisionStatus } from "../services/visionService";
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

  const [overlayMesh, setOverlayMesh] = useState(true);
  const [overlayBbox, setOverlayBbox] = useState(true);
  const [overlayAxis, setOverlayAxis] = useState(true);
  const [selectedMode, setSelectedMode] = useState("mirror");
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
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

  return (
    <div className="live-tracking" data-testid="live-tracking-page">
      {/* Header */}
      <div className="live-tracking__header">
        <div>
          <h1 className="live-tracking__title">Computer Vision & Live Tracking</h1>
          <p className="live-tracking__subtitle">
            Real-time MediaPipe face mesh, 3D head pose estimation (solvePnP), and closed-loop servo mirroring
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