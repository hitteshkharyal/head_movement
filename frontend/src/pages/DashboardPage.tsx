import { useEffect, useState } from "react";
import "./DashboardPage.css";

interface HealthStatus {
  status: string;
  version: string;
  uptime_seconds: number;
  hardware_mode: string;
  environment: string;
}

interface StatusCard {
  label: string;
  value: string;
  detail?: string;
  status: "online" | "offline" | "idle" | "warning";
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    fetch(`${apiBase}/api/v1/health`)
      .then((r) => r.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Cannot connect to backend");
        setLoading(false);
      });
  }, []);

  const cards: StatusCard[] = [
    {
      label: "Robot",
      value: "Disconnected",
      detail: health ? `Mode: ${health.hardware_mode}` : "—",
      status: "offline",
    },
    {
      label: "Pan Angle",
      value: "90°",
      detail: "Center",
      status: "idle",
    },
    {
      label: "Tilt Angle",
      value: "90°",
      detail: "Center",
      status: "idle",
    },
    {
      label: "Camera",
      value: "Idle",
      detail: "Not started",
      status: "offline",
    },
    {
      label: "Face Detection",
      value: "—",
      detail: "Camera not active",
      status: "idle",
    },
    {
      label: "Gesture Model",
      value: "None",
      detail: "No active model",
      status: "idle",
    },
    {
      label: "Speech",
      value: "Idle",
      detail: "Not listening",
      status: "idle",
    },
    {
      label: "Audience",
      value: "—",
      detail: "Tracking inactive",
      status: "idle",
    },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__subtitle">
            AI Humanoid Presentation Robot — System Overview
          </p>
        </div>
        <div className="dashboard__api-status">
          {loading && (
            <span className="status-badge status-badge--idle">Connecting…</span>
          )}
          {error && (
            <span className="status-badge status-badge--offline">
              Backend Offline
            </span>
          )}
          {health && (
            <span className="status-badge status-badge--online">
              API v{health.version} · {Math.round(health.uptime_seconds)}s uptime
            </span>
          )}
        </div>
      </header>

      <div className="dashboard__grid">
        {cards.map((card) => (
          <div key={card.label} className="status-card">
            <div className="status-card__header">
              <span className="status-card__label">{card.label}</span>
              <span className={`status-dot status-dot--${card.status}`} />
            </div>
            <div className="status-card__value">{card.value}</div>
            {card.detail && (
              <div className="status-card__detail">{card.detail}</div>
            )}
          </div>
        ))}
      </div>

      {health && (
        <div className="dashboard__info-bar">
          <span>Environment: <strong>{health.environment}</strong></span>
          <span>Hardware: <strong>{health.hardware_mode}</strong></span>
          <span>Uptime: <strong>{Math.round(health.uptime_seconds)}s</strong></span>
        </div>
      )}

      <div className="dashboard__phases">
        <h2>Development Progress</h2>
        <div className="phases-grid">
          {[
            { num: 0, name: "Architecture & Foundation", done: true },
            { num: 1, name: "ESP32 + Servo Control", done: false },
            { num: 2, name: "Manual Control Dashboard", done: false },
            { num: 3, name: "Predefined YES/NO Gestures", done: false },
            { num: 4, name: "Live Head Tracking", done: false },
            { num: 5, name: "Human → Robot Mimic", done: false },
            { num: 6, name: "Gesture Data Collection", done: false },
            { num: 7, name: "Gesture Model Training", done: false },
            { num: 8, name: "Live Gesture Prediction", done: false },
            { num: 9, name: "ESP32 Model Interface", done: false },
            { num: 10, name: "Speech-to-Text", done: false },
            { num: 11, name: "NLP / Intent Engine", done: false },
            { num: 12, name: "Audience Face Detection", done: false },
            { num: 13, name: "Time-Aware Greeting", done: false },
            { num: 14, name: "Complete AI Presentation", done: false },
          ].map((phase) => (
            <div
              key={phase.num}
              className={`phase-badge ${phase.done ? "phase-badge--done" : ""}`}
            >
              <span className="phase-badge__num">
                {phase.done ? "✓" : phase.num}
              </span>
              <span className="phase-badge__name">{phase.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
