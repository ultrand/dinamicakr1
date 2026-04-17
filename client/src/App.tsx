import { Navigate, Route, Routes } from "react-router-dom";
import { ParticipantPage } from "./pages/ParticipantPage";
import { AdminPage } from "./pages/AdminPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ExportPage } from "./pages/ExportPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ParticipantPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/analise" element={<AnalyticsPage />} />
      <Route path="/admin/export" element={<ExportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
