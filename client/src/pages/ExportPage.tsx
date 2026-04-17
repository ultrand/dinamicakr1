import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { apiGet, downloadUrl } from "../api";
import { ciapMotion } from "../ciap-motion";

const LS = "dinamica_admin_token";
type Ver = { id: string; number: number; _count: { responses: number } };

export function ExportPage() {
  const token = localStorage.getItem(LS) ?? "";
  const [versions,  setVersions]  = useState<Ver[]>([]);
  const [versionId, setVersionId] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const v = await apiGet<Ver[]>("/api/admin/versions", token);
    setVersions(v);
    setVersionId((cur) => (cur && v.some((x) => x.id === cur) ? cur : v[0]?.id ?? ""));
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!token) return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <p className="error">Acesse /admin primeiro.</p>
      <Link to="/admin">Admin</Link>
    </motion.div>
  );

  const dl = (fmt: "csv" | "json") =>
    versionId &&
    downloadUrl(`/api/admin/export/${fmt}?versionId=${encodeURIComponent(versionId)}`, token);

  return (
    <motion.div className="page" style={{ maxWidth: 680 }} {...ciapMotion.sectionFade}>
      <div className="row spread" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Export</h1>
        <Link to="/admin" className="btn ghost">← Admin</Link>
      </div>

      <div className="field" style={{ maxWidth: 300, marginBottom: 14 }}>
        <label>Versão publicada</label>
        <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} — {v._count.responses} respostas
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" onClick={() => dl("csv")}>
          ↓ CSV — por passo
        </button>
        <button type="button" className="btn primary" onClick={() => dl("json")}>
          ↓ JSON — por resposta
        </button>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-hd">Estrutura dos arquivos</div>
        <div className="panel-body stack-s" style={{ fontSize: "var(--fs-sm)" }}>
          <div>
            <strong>CSV</strong>
            <code style={{ display: "block", marginTop: 3, background: "#f4f4f0", padding: "4px 8px", borderRadius: 4 }}>
              response_id, critical_task_id, step_index, task_id
            </code>
          </div>
          <div>
            <strong>JSON</strong>
            <code style={{ display: "block", marginTop: 3, background: "#f4f4f0", padding: "4px 8px", borderRadius: 4 }}>
              {`{ response_id: { critical_task_id: [task_id, …] } }`}
            </code>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
