import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { apiGet, downloadFile } from "../api";
import { ciapMotion } from "../ciap-motion";

const LS = "dinamica_admin_token";
type Ver = { id: string; number: number; _count: { responses: number } };

export function ExportPage() {
  const token = localStorage.getItem(LS) ?? "";
  const [versions,  setVersions]  = useState<Ver[]>([]);
  const [versionId, setVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const v = await apiGet<Ver[]>("/api/admin/versions", token);
      setVersions(v);
      setVersionId((cur) => (cur && v.some((x) => x.id === cur) ? cur : v[0]?.id ?? ""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
      setVersions([]);
      setVersionId("");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!token) return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <p className="error">Acesse /admin primeiro.</p>
      <Link to="/admin">Admin</Link>
    </motion.div>
  );

  const dl = async (fmt: "csv" | "json") => {
    if (!versionId) return;
    setErr(null);
    try {
      await downloadFile(
        `/api/admin/export/${fmt}?versionId=${encodeURIComponent(versionId)}`,
        token,
        `responses-${versionId}.${fmt}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao exportar");
    }
  };

  return (
    <motion.div className="page" style={{ maxWidth: 680 }} {...ciapMotion.sectionFade}>
      <div className="row spread" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Exportar resultados</h1>
        <div className="row-s">
          <Link to="/admin/analise" className="btn ghost">Análise</Link>
          <Link to="/admin" className="btn ghost">← Admin</Link>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Carregando versões…</p>}

      <div className="field" style={{ maxWidth: 300, marginBottom: 14 }}>
        <label>Versão publicada</label>
        <select value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={versions.length === 0}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} — {v._count.responses} respostas
            </option>
          ))}
        </select>
        {!loading && versions.length === 0 && (
          <p className="muted" style={{ fontSize: "var(--fs-xs)", margin: "4px 0 0" }}>
            Nenhuma versão publicada. Publique um rascunho no Admin antes de exportar.
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" disabled={!versionId} onClick={() => void dl("csv")}>
          ↓ CSV — por passo
        </button>
        <button type="button" className="btn primary" disabled={!versionId} onClick={() => void dl("json")}>
          ↓ JSON — por resposta
        </button>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-hd">Estrutura dos arquivos</div>
        <div className="panel-body stack-s" style={{ fontSize: "var(--fs-sm)" }}>
          <div>
            <strong>CSV</strong>
            <code style={{ display: "block", marginTop: 3, background: "#f4f4f0", padding: "4px 8px", borderRadius: 4 }}>
              response_id, created_at, selected_task_ids, ranked_task_ids, hardest_task_id, hardest_why, long_texts_json, critical_task_id, flow_steps, flow_comment
            </code>
          </div>
          <div>
            <strong>JSON</strong>
            <code style={{ display: "block", marginTop: 3, background: "#f4f4f0", padding: "4px 8px", borderRadius: 4 }}>
              {`[{ id, createdAt, selectedCriticalTaskIds, orderedCriticalTaskIds, hardestTaskId, hardestWhy, longTexts, flows }]`}
            </code>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
