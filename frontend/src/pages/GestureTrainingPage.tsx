import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  gestureService,
  GestureClass,
  GestureSample,
  Dataset,
  ActiveLearningItem,
  RecordStatus,
} from "../services/gestureService";
import { visionService } from "../services/visionService";
import "./GestureTrainingPage.css";

export default function GestureTrainingPage() {
  const [classes, setClasses] = useState<GestureClass[]>([]);
  const [samples, setSamples] = useState<GestureSample[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeQueue, setActiveQueue] = useState<ActiveLearningItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("nod");
  const [sequenceLength, setSequenceLength] = useState<number>(30);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3);
  const [recordingStatus, setRecordingStatus] = useState<RecordStatus>({
    status: "idle",
    countdown_remaining: 0,
    frames_captured: 0,
    total_frames: 30,
    duration_seconds: 0,
  });

  const [newDatasetName, setNewDatasetName] = useState("");
  const [showNewDatasetModal, setShowNewDatasetModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [clsData, smpData, dsData, alData] = await Promise.all([
        gestureService.getClasses(),
        gestureService.getSamples(),
        gestureService.getDatasets(),
        gestureService.getActiveLearningQueue(),
      ]);
      setClasses(clsData);
      setSamples(smpData);
      setDatasets(dsData);
      setActiveQueue(alData);
      if (clsData.length > 0 && !selectedClass) {
        setSelectedClass(clsData[0].name);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load gesture data");
    }
  }, [selectedClass]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling recording status when active
  useEffect(() => {
    if (recordingStatus.status === "countdown" || recordingStatus.status === "recording") {
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const st = await gestureService.getRecordingStatus();
          setRecordingStatus(st);
          if (st.status === "completed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setSuccessMsg(`Gesture sample recorded successfully for '${st.gesture_name}'!`);
            // Save sample to database
            if (st.feature_file_path && st.gesture_name) {
              await gestureService.createSample({
                gesture_name: st.gesture_name,
                feature_file: st.feature_file_path,
                frame_count: st.frames_captured,
                duration: st.duration_seconds,
              });
              await loadData();
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 100);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [recordingStatus.status, loadData]);

  const handleStartRecording = async () => {
    try {
      setError(null);
      setSuccessMsg(null);
      const st = await gestureService.startRecording(
        selectedClass,
        sequenceLength,
        countdownSeconds
      );
      setRecordingStatus(st);
    } catch (err: any) {
      setError(err?.message || "Failed to start recording");
    }
  };

  const handleCancelRecording = async () => {
    try {
      const st = await gestureService.cancelRecording();
      setRecordingStatus(st);
    } catch (err: any) {
      setError(err?.message || "Failed to cancel recording");
    }
  };

  const handleDeleteSample = async (id: string) => {
    try {
      await gestureService.deleteSample(id);
      setSamples((prev) => prev.filter((s) => s.id !== id));
      setSuccessMsg("Sample deleted");
    } catch (err: any) {
      setError(err?.message || "Failed to delete sample");
    }
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim()) return;
    try {
      await gestureService.createDataset({
        name: newDatasetName,
        version: "1.0",
      });
      setNewDatasetName("");
      setShowNewDatasetModal(false);
      await loadData();
      setSuccessMsg("Dataset created successfully");
    } catch (err: any) {
      setError(err?.message || "Failed to create dataset");
    }
  };

  const handleLabelActiveLearning = async (sampleId: string, label: string) => {
    try {
      await gestureService.labelActiveLearningSample(sampleId, label);
      setActiveQueue((prev) => prev.filter((item) => item.id !== sampleId));
      await loadData();
      setSuccessMsg(`Sample confirmed and labeled as '${label}'`);
    } catch (err: any) {
      setError(err?.message || "Failed to label active learning item");
    }
  };

  const isRecordingActive =
    recordingStatus.status === "countdown" || recordingStatus.status === "recording";

  return (
    <div className="gesture-training" data-testid="gesture-training-page">
      {/* Header */}
      <div className="gesture-training__header">
        <div>
          <h1 className="gesture-training__title">Gesture Recording & Active Learning</h1>
          <p className="gesture-training__subtitle">
            Capture 3D motion time-series, curate labeled training datasets, and refine ambiguous samples
          </p>
        </div>
        <div className="gesture-training__header-actions">
          <button
            className="btn btn--secondary"
            onClick={() => setShowNewDatasetModal(true)}
          >
            📁 New Dataset
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button className="btn btn--small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="success-banner" role="alert">
          <span>✅ {successMsg}</span>
          <button className="btn btn--small" onClick={() => setSuccessMsg(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="gesture-training__grid">
        {/* Left Column: Recording Studio Viewport */}
        <div className="gesture-training__col">
          <div className="card studio-card">
            <div className="card__header">
              <h2 className="card__title">Live Gesture Recording Studio</h2>
              <span className={`status-pill ${isRecordingActive ? "status-pill--active" : ""}`}>
                {recordingStatus.status.toUpperCase()}
              </span>
            </div>

            {/* Viewport with Animated Overlay */}
            <div className="studio-viewport">
              <img
                src={visionService.getStreamUrl(true)}
                alt="Live Camera Capture Feed"
                className="studio-feed"
              />

              {/* Countdown Overlay */}
              {recordingStatus.status === "countdown" && (
                <div className="countdown-overlay">
                  <div className="countdown-ring">
                    <span className="countdown-number">
                      {Math.ceil(recordingStatus.countdown_remaining)}
                    </span>
                  </div>
                  <span className="countdown-label">GET READY: PERFORM {selectedClass.toUpperCase()}</span>
                </div>
              )}

              {/* Recording Overlay */}
              {recordingStatus.status === "recording" && (
                <div className="recording-active-overlay">
                  <div className="rec-dot" />
                  <span className="rec-text">RECORDING MOTION...</span>
                  <div className="rec-progress-bar">
                    <div
                      className="rec-progress-fill"
                      style={{
                        width: `${(recordingStatus.frames_captured / recordingStatus.total_frames) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="rec-count">
                    {recordingStatus.frames_captured} / {recordingStatus.total_frames} Frames
                  </span>
                </div>
              )}
            </div>

            {/* Recording Controls */}
            <div className="studio-controls">
              <div className="class-selector">
                <span className="control-label">Target Gesture Class:</span>
                <div className="class-chips">
                  {classes.map((cls) => (
                    <button
                      key={cls.id}
                      className={`class-chip ${selectedClass === cls.name ? "class-chip--active" : ""}`}
                      onClick={() => setSelectedClass(cls.name)}
                      disabled={isRecordingActive}
                    >
                      {cls.name.toUpperCase()} ({cls.sample_count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="recording-parameters">
                <div className="param-item">
                  <span className="control-label">Sequence Frames: {sequenceLength}</span>
                  <input
                    type="range"
                    min="15"
                    max="60"
                    step="5"
                    value={sequenceLength}
                    disabled={isRecordingActive}
                    onChange={(e) => setSequenceLength(parseInt(e.target.value, 10))}
                    aria-label="Sequence frames slider"
                  />
                </div>
                <div className="param-item">
                  <span className="control-label">Pre-roll Countdown: {countdownSeconds}s</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={countdownSeconds}
                    disabled={isRecordingActive}
                    onChange={(e) => setCountdownSeconds(parseInt(e.target.value, 10))}
                    aria-label="Countdown seconds slider"
                  />
                </div>
              </div>

              <div className="studio-actions">
                {isRecordingActive ? (
                  <button className="btn btn--danger btn--full" onClick={handleCancelRecording}>
                    ✕ CANCEL RECORDING
                  </button>
                ) : (
                  <button className="btn btn--primary btn--full btn--pulse" onClick={handleStartRecording}>
                    ⏺ START RECORDING ({selectedClass.toUpperCase()})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dataset Metrics, Recorded Samples & Active Learning Queue */}
        <div className="gesture-training__col">
          {/* Active Learning Review Queue */}
          <div className="card active-learning-card">
            <div className="card__header">
              <h2 className="card__title">Active Learning Review Queue</h2>
              <span className="badge badge--warning">{activeQueue.length} Pending</span>
            </div>

            {activeQueue.length === 0 ? (
              <div className="empty-state">
                <span>✨ No unconfirmed samples in the active learning queue.</span>
              </div>
            ) : (
              <div className="al-queue-list">
                {activeQueue.map((item) => (
                  <div key={item.id} className="al-item">
                    <div className="al-item__info">
                      <span className="al-item__pred">
                        Predicted: <strong>{item.predicted_gesture}</strong>
                      </span>
                      <span className="al-item__conf">
                        Conf: {(item.confidence * 100).toFixed(0)}% · Entropy: {item.entropy}
                      </span>
                    </div>
                    <div className="al-item__actions">
                      <button
                        className="btn btn--small btn--success"
                        onClick={() => handleLabelActiveLearning(item.id, item.predicted_gesture)}
                      >
                        ✓ Confirm
                      </button>
                      <select
                        className="al-select"
                        onChange={(e) => {
                          if (e.target.value) handleLabelActiveLearning(item.id, e.target.value);
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Re-label...</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recorded Samples Table */}
          <div className="card samples-card">
            <div className="card__header">
              <h2 className="card__title">Recorded Dataset Samples</h2>
              <span className="badge">{samples.length} Total</span>
            </div>

            {samples.length === 0 ? (
              <div className="empty-state">
                <span>No gesture samples recorded yet. Use the studio to record your first motion.</span>
              </div>
            ) : (
              <div className="samples-table-wrapper">
                <table className="samples-table">
                  <thead>
                    <tr>
                      <th>Gesture</th>
                      <th>Frames</th>
                      <th>Duration</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="gesture-tag">{s.gesture_name}</span>
                        </td>
                        <td>{s.frame_count || 30}</td>
                        <td>{s.duration ? `${s.duration}s` : "1.0s"}</td>
                        <td>
                          <button
                            className="btn btn--icon btn--danger-subtle"
                            title="Delete Sample"
                            onClick={() => handleDeleteSample(s.id)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Dataset Modal */}
      {showNewDatasetModal && (
        <div className="modal-backdrop">
          <div className="modal card">
            <div className="card__header">
              <h2 className="card__title">Create Training Dataset</h2>
              <button className="btn btn--icon" onClick={() => setShowNewDatasetModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateDataset} className="modal-form">
              <div className="form-group">
                <label>Dataset Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Presentation Gestures v1"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowNewDatasetModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Create Dataset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}