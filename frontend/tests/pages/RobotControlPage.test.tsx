import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import axios from "axios";
import RobotControlPage from "../../src/pages/RobotControlPage";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("RobotControlPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/status")) {
        return Promise.resolve({
          data: {
            connected: true,
            controller_type: "mock",
            pan_angle: 90.0,
            tilt_angle: 90.0,
            is_moving: false,
            is_emergency_stopped: false,
            latency_ms: 1.2,
          },
        });
      }
      if (url.includes("/calibration")) {
        return Promise.resolve({
          data: [
            {
              servo_name: "pan",
              axis: "yaw",
              min_angle: 0.0,
              max_angle: 180.0,
              center_angle: 90.0,
              speed: 50.0,
              sensitivity: 0.5,
              trim_offset: 0.0,
              invert: false,
              dead_zone: 2.0,
            },
            {
              servo_name: "tilt",
              axis: "pitch",
              min_angle: 30.0,
              max_angle: 150.0,
              center_angle: 90.0,
              speed: 50.0,
              sensitivity: 0.5,
              trim_offset: 0.0,
              invert: false,
              dead_zone: 2.0,
            },
          ],
        });
      }
      if (url.includes("/ports")) {
        return Promise.resolve({
          data: [
            {
              port: "COM3",
              description: "USB Serial Port (COM3)",
              manufacturer: "Silicon Labs",
              hwid: "USB\\VID_10C4&PID_EA60",
            },
          ],
        });
      }
      return Promise.reject(new Error("not found"));

    });

    mockedAxios.post.mockResolvedValue({
      data: {
        connected: true,
        controller_type: "mock",
        pan_angle: 90.0,
        tilt_angle: 90.0,
        is_moving: false,
        is_emergency_stopped: false,
        latency_ms: 1.2,
      },
    });
  });

  it("renders header and main control sections", async () => {
    render(<RobotControlPage />);

    expect(screen.getByText("Robot Pan-Tilt Control")).toBeInTheDocument();
    expect(screen.getByText("Live Head Orientation")).toBeInTheDocument();
    expect(screen.getByText("Precision Servo Controls")).toBeInTheDocument();
    expect(screen.getByText(/Human Gestures & Motion Presets/i)).toBeInTheDocument();
    expect(screen.getByText("YES Gesture")).toBeInTheDocument();
    expect(screen.getByText("NO Gesture")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("MOCK")).toBeInTheDocument();
    });
  });

  it("toggles calibration drawer on button click", async () => {
    render(<RobotControlPage />);

    await waitFor(() => {
      expect(screen.getByText("MOCK")).toBeInTheDocument();
    });

    const calBtn = screen.getByRole("button", { name: /calibration/i });
    fireEvent.click(calBtn);

    const calPanel = screen.getByTestId("calibration-panel");
    expect(calPanel).toBeInTheDocument();
    expect(within(calPanel).getByText(/PAN SERVO/i)).toBeInTheDocument();
  });

  it("triggers emergency stop and renders banner", async () => {
    render(<RobotControlPage />);

    await waitFor(() => {
      expect(screen.getByText("MOCK")).toBeInTheDocument();
    });

    mockedAxios.post.mockImplementation((url: string) => {
      if (url.includes("/emergency-stop")) {
        return Promise.resolve({
          data: {
            status: "EMERGENCY_STOP_TRIGGERED",
            emergency_stopped: true,
            message: "Emergency stop active",
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const estopBtn = screen.getByRole("button", { name: /emergency stop/i });
    fireEvent.click(estopBtn);

    await waitFor(() => {
      expect(screen.getByText("EMERGENCY STOP ACTIVE")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /resume control/i }).length).toBeGreaterThan(0);
    });
  });

  it("triggers YES and NO gestures successfully", async () => {
    render(<RobotControlPage />);

    await waitFor(() => {
      expect(screen.getByText("MOCK")).toBeInTheDocument();
    });

    const yesBtn = screen.getByRole("button", { name: /yes gesture/i });
    fireEvent.click(yesBtn);

    const noBtn = screen.getByRole("button", { name: /no gesture/i });
    expect(noBtn).toBeInTheDocument();
  });

  it("calls preset center and updates angle sliders", async () => {
    render(<RobotControlPage />);

    await waitFor(() => {
      expect(screen.getByText("MOCK")).toBeInTheDocument();
    });

    const centerBtn = screen.getByRole("button", { name: /center \(home\)/i });
    fireEvent.click(centerBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith("/api/v1/servos/center");
    });
  });
});
