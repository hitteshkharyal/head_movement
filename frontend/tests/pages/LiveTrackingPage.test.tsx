import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import LiveTrackingPage from "../../src/pages/LiveTrackingPage";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("LiveTrackingPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedAxios.get.mockResolvedValue({
      data: {
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
      },
    });

    mockedAxios.post.mockResolvedValue({
      data: {
        camera_running: true,
        is_tracking: true,
        tracking_mode: "mirror",
        fps: 30.0,
        face_detected: true,
        yaw: 12.4,
        pitch: -4.5,
        roll: 1.1,
        confidence: 0.94,
        bbox: [100, 80, 150, 180],
        sensitivity: 0.5,
        smoothing_alpha: 0.35,
        dead_zone: 3.0,
      },
    });

    mockedAxios.put.mockResolvedValue({
      data: {
        camera_running: true,
        is_tracking: false,
        tracking_mode: "off",
        fps: 30.0,
        face_detected: true,
        yaw: 12.4,
        pitch: -4.5,
        roll: 1.1,
        confidence: 0.94,
        bbox: [100, 80, 150, 180],
        sensitivity: 0.8,
        smoothing_alpha: 0.35,
        dead_zone: 3.0,
      },
    });
  });

  it("renders live tracking header and pose metrics", async () => {
    render(<LiveTrackingPage />);

    expect(screen.getByText("Computer Vision & Live Tracking")).toBeInTheDocument();
    expect(screen.getByText("3D Head Pose Estimation")).toBeInTheDocument();
    expect(screen.getByText("Tracking Modes & Tuning")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("TARGET ACQUIRED")).toBeInTheDocument();
      expect(screen.getByText("12.4°")).toBeInTheDocument();
    });
  });

  it("toggles start/stop tracking on button click", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => {
      expect(screen.getByText("TARGET ACQUIRED")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /start tracking/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/v1/vision/tracking/start", { mode: "mirror" });
    });
  });

  it("switches tracking mode", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => {
      expect(screen.getByText("TARGET ACQUIRED")).toBeInTheDocument();
    });

    const followBtn = screen.getByRole("button", { name: /center face/i });
    fireEvent.click(followBtn);

    expect(followBtn).toHaveClass("mode-btn--active");
  });

  it("adjusts tracking sensitivity slider", async () => {
    render(<LiveTrackingPage />);

    await waitFor(() => {
      expect(screen.getByText("TARGET ACQUIRED")).toBeInTheDocument();
    });

    const slider = screen.getByLabelText(/tracking sensitivity slider/i);
    fireEvent.change(slider, { target: { value: "0.8" } });

    await waitFor(() => {
      expect(mockedAxios.put).toHaveBeenCalledWith("/api/v1/vision/config", { sensitivity: 0.8 });
    });
  });
});
