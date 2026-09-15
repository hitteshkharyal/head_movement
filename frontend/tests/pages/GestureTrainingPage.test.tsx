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
      if (url.includes("/training/models") || url.includes("/models")) {
        return Promise.resolve({
          data: [
            {
              id: "m-1",
              name: "Gesture-RF-Classifier",
              version: "1.0.0",
              model_type: "sklearn_rf",
              status: "active",
              metrics: {
                train_accuracy: 0.98,
                val_accuracy: 0.94,
                test_accuracy: 0.95,
                macro_f1: 0.95,
                macro_precision: 0.96,
                macro_recall: 0.95,
                class_labels: ["yes_nod", "no_shake", "head_tilt_left", "head_tilt_right", "look_away", "attention"],
                confusion_matrix: [
                  [20, 0, 0, 0, 0, 0],
                  [0, 20, 0, 0, 0, 0],
                  [0, 0, 19, 1, 0, 0],
                  [0, 0, 0, 20, 0, 0],
                  [0, 0, 0, 0, 20, 0],
                  [0, 0, 0, 0, 0, 20],
                ],
                training_time_seconds: 1.25,
                sample_count: 120,
              },
              created_at: "2026-09-15T10:00:00Z",
            },
          ],
        });
      }
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
      return Promise.resolve({ data: [] });
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

    expect(screen.getByText("Gesture Studio & ML Training")).toBeInTheDocument();
    expect(screen.getByText("Motion Recording Studio")).toBeInTheDocument();
    expect(screen.getByText("Active Learning Queue")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Pending/i)).toBeInTheDocument();
      expect(screen.getByText(/ML Model Training Studio/i)).toBeInTheDocument();
    });
  });

  it("triggers recording on button click", async () => {
    render(<GestureTrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Motion Recording Studio/i)).toBeInTheDocument();
    });

    const startBtn = screen.getByRole("button", { name: /start motion recording/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalled();
    });
  });

  it("confirms active learning item", async () => {
    render(<GestureTrainingPage />);

    const confirmBtn = await screen.findByRole("button", { name: /✓ Confirm/i });
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
      expect(screen.getByText("Motion Recording Studio")).toBeInTheDocument();
    });

    const newDsBtn = screen.getByRole("button", { name: /new dataset/i });
    fireEvent.click(newDsBtn);

    expect(screen.getByText("Create Training Dataset")).toBeInTheDocument();
  });

  it("renders model metrics and confusion matrix", async () => {
    render(<GestureTrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Models Trained/i)).toBeInTheDocument();
      expect(screen.getByText("Gesture-RF-Classifier")).toBeInTheDocument();
      expect(screen.getByText(/Evaluation Metrics/i)).toBeInTheDocument();
      expect(screen.getByText(/Confusion Matrix/i)).toBeInTheDocument();
    });
  });
});
