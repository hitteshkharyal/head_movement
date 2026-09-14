import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import GestureTrainingPage from "../../src/pages/GestureTrainingPage";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("GestureTrainingPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes("/classes")) {
        return Promise.resolve({
          data: [
            { id: "1", name: "nod", description: "Head nod", type: "predefined", sample_count: 5 },
            { id: "2", name: "shake", description: "Head shake", type: "predefined", sample_count: 3 },
          ],
        });
      }
      if (url.includes("/samples")) {
        return Promise.resolve({
          data: [
            { id: "s1", dataset_id: "d1", gesture_id: "1", gesture_name: "nod", frame_count: 30, duration: 1.0 },
          ],
        });
      }
      if (url.includes("/datasets")) {
        return Promise.resolve({
          data: [
            { id: "d1", name: "Default Dataset", version: "1.0", status: "ready", sample_count: 8 },
          ],
        });
      }
      if (url.includes("/active-learning")) {
        return Promise.resolve({
          data: [
            {
              id: "al-1",
              predicted_gesture: "shake",
              confidence: 0.65,
              entropy: 0.72,
              feature_file: "/tmp/al1.npy",
              created_at: 1000,
            },
          ],
        });
      }
      if (url.includes("/record/status")) {
        return Promise.resolve({
          data: {
            status: "idle",
            countdown_remaining: 0,
            frames_captured: 0,
            total_frames: 30,
            duration_seconds: 0,
          },
        });
      }
      return Promise.reject(new Error("not found"));
    });

    mockedAxios.post.mockResolvedValue({
      data: {
        session_id: "test-session",
        gesture_name: "nod",
        status: "countdown",
        countdown_remaining: 3.0,
        frames_captured: 0,
        total_frames: 30,
        duration_seconds: 0,
      },
    });

    mockedAxios.delete.mockResolvedValue({ data: { status: "deleted" } });
  });

  it("renders recording studio and dataset overview", async () => {
    render(<GestureTrainingPage />);

    expect(screen.getByText("Gesture Recording & Active Learning")).toBeInTheDocument();
    expect(screen.getByText("Live Gesture Recording Studio")).toBeInTheDocument();
    expect(screen.getByText("Active Learning Review Queue")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/NOD \(5\)/i)).toBeInTheDocument();
      expect(screen.getByText("1 Pending")).toBeInTheDocument();
    });
  });

  it("triggers recording on button click", async () => {
    render(<GestureTrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/NOD \(5\)/i)).toBeInTheDocument();
    });

    const startBtn = screen.getByRole("button", { name: /start recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/api/v1/gestures/record/start",
        expect.objectContaining({ gesture_name: "nod" })
      );
    });
  });

  it("confirms active learning item", async () => {
    render(<GestureTrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Predicted:/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "/api/v1/gestures/active-learning/al-1/label",
        { confirmed_gesture: "shake" }
      );
    });
  });

  it("opens new dataset modal", async () => {
    render(<GestureTrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/NOD \(5\)/i)).toBeInTheDocument();
    });

    const newDsBtn = screen.getByRole("button", { name: /new dataset/i });
    fireEvent.click(newDsBtn);

    expect(screen.getByText("Create Training Dataset")).toBeInTheDocument();
  });
});
