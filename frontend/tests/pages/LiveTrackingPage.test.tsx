import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import LiveTrackingPage from "../../src/pages/LiveTrackingPage";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

const mockVisionStatus = {
  camera_running: true,
  is_tracking: false,
  tracking_mode: "off",
  fps: 29.8,
  face_detected: true,
  yaw: 12.4,
  pitch: -4.5,
  roll: 1.1,
  confidence: 0.94,
  bbox: [100, 80, 150, 180],
  sensitivity: 0.5,
  smoothing_alpha: 0.35,
  dead_zone: 3.0,
};

const mockInferenceStatus = {
  active_model_id: "m-1",
  active_model_name: "Gesture-RF-Classifier",
  active_model_version: "v1.0.0",
  buffer_frames: 30,
  buffer_capacity: 30,
  is_ready: true,
  last_detected_gesture: "yes_nod",
  last_confidence: 0.94,
  is_cooldown_active: false,
  cooldown_remaining_sec: 0.0,
  autonomous_reaction_enabled: false,
};

const mockServoStatus = {
  connected: false, controller_type: "mock",
  pan_angle: 90, tilt_angle: 90,
  is_moving: false, is_emergency_stopped: false, latency_ms: 0,
};

describe("LiveTrackingPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/predictions/status"))
        return Promise.resolve({ data: mockInferenceStatus });
      if (url.includes("/servos/status"))
        return Promise.resolve({ data: mockServoStatus });
      // gestures/samples
      if (url.includes("/gestures/samples"))
        return Promise.resolve({ data: [] });
      // default → vision status
      return Promise.resolve({ data: mockVisionStatus });
    });

    mockedAxios.post.mockImplementation((url: string) => {
      if (url.includes("/autonomous-reaction"))
        return Promise.resolve({ data: { ...mockInferenceStatus, autonomous_reaction_enabled: true } });
      if (url.includes("/tracking/start"))
        return Promise.resolve({ data: { ...mockVisionStatus, is_tracking: true, tracking_mode: "mirror" } });
      if (url.includes("/tracking/stop"))
        return Promise.resolve({ data: { ...mockVisionStatus, is_tracking: false } });
      return Promise.resolve({ data: mockVisionStatus });
    });

    mockedAxios.put.mockResolvedValue({ data: { ...mockVisionStatus, sensitivity: 0.8 } });
  });

  it("renders live tracking header and main sections", async () => {
    render(<LiveTrackingPage />);

    expect(screen.getByText("Computer Vision & Live Tracking")).toBeInTheDocument();
    expect(screen.getByText("3D Head Pose Estimation")).toBeInTheDocument();
    expect(screen.getByText("Tracking Mode & Tuning")).toBeInTheDocument();
    expect(screen.getByText("Real-Time Gesture Prediction")).toBeInTheDocument();
  });

  it("renders live pose values after status fetch", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => {
      expect(screen.getByText("12.4°")).toBeInTheDocument();
    });
    expect(screen.getByText("🎯 FACE DETECTED")).toBeInTheDocument();
  });

  it("shows detected gesture from inference status", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => {
      // The gesture label in GESTURE_BADGE_MAP for yes_nod
      expect(screen.getByText("YES — NOD ↕️")).toBeInTheDocument();
    });
  });

  it("camera toggle button turns camera on/off", async () => {
    render(<LiveTrackingPage />);

    const camBtn = screen.getByTitle("Turn camera ON");
    expect(camBtn).toBeInTheDocument();
    fireEvent.click(camBtn);
    await waitFor(() => {
      expect(screen.getByTitle("Turn camera OFF")).toBeInTheDocument();
    });
  });

  it("starts tracking when tracking button clicked with camera on", async () => {
    render(<LiveTrackingPage />);

    // Turn camera on first
    fireEvent.click(screen.getByTitle("Turn camera ON"));
    await waitFor(() => screen.getByTitle("Turn camera OFF"));

    const trackBtn = screen.getByRole("button", { name: /start tracking/i });
    fireEvent.click(trackBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/api/v1/vision/tracking/start",
        { mode: "mirror" }
      );
    });
  });

  it("switches tracking mode buttons", async () => {
    render(<LiveTrackingPage />);

    const followBtn = screen.getByRole("button", { name: /center face/i });
    fireEvent.click(followBtn);
    expect(followBtn).toHaveClass("mode-btn--active");
  });

  it("adjusts tracking sensitivity slider", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => screen.getByText("12.4°"));

    const slider = screen.getByLabelText(/tracking sensitivity slider/i);
    fireEvent.change(slider, { target: { value: "0.8" } });

    await waitFor(() => {
      expect(mockedAxios.put).toHaveBeenCalledWith(
        "/api/v1/vision/config",
        { sensitivity: 0.8 }
      );
    });
  });

  it("toggles autonomous robot reaction", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => screen.getByText("YES — NOD ↕️"));

    const reactionBtn = screen.getByRole("button", { name: /disabled/i });
    fireEvent.click(reactionBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/api/v1/predictions/autonomous-reaction",
        { enabled: true }
      );
    });
  });

  it("gesture lab section is collapsible", async () => {
    render(<LiveTrackingPage />);

    expect(screen.getByText("Gesture Training Lab")).toBeInTheDocument();
    // Body hidden by default (labOpen=false)
    expect(screen.queryByText("Record real samples from live camera → retrain model")).toBeInTheDocument();
  });
});
