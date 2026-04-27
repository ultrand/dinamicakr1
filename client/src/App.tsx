import { Link, Route, Routes } from "react-router-dom";
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function NotFoundPage() {
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <h1>Página não encontrada</h1>
      <p className="muted">Confira o endereço ou escolha um dos caminhos abaixo.</p>
      <div className="row-s">
        <Link to="/" className="btn primary">Participante</Link>
        <Link to="/admin" className="btn">Admin</Link>
      </div>
    </main>
  );
}
