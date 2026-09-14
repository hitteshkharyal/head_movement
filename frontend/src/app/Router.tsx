import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import DashboardPage from "../pages/DashboardPage";
import RobotControlPage from "../pages/RobotControlPage";
import LiveTrackingPage from "../pages/LiveTrackingPage";
import GestureTrainingPage from "../pages/GestureTrainingPage";
import ModelsPage from "../pages/ModelsPage";
import AudiencePage from "../pages/AudiencePage";
import PresentationPage from "../pages/PresentationPage";
import SystemLogsPage from "../pages/SystemLogsPage";
import SettingsPage from "../pages/SettingsPage";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="robot-control" element={<RobotControlPage />} />
          <Route path="live-tracking" element={<LiveTrackingPage />} />
          <Route path="gesture-training" element={<GestureTrainingPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="audience" element={<AudiencePage />} />
          <Route path="presentation" element={<PresentationPage />} />
          <Route path="system-logs" element={<SystemLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
