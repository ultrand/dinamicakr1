import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { ciapMotion } from "../ciap-motion";

const LS = "dinamica_admin_token";

type Rank   = { taskId: string; count: number; label: string };
type Common = { criticalTaskId: string; criticalLabel: string; sequenceLabel: string[]; frequency: number; percent: number };
type Edge   = { from: string; to: string; fromLabel: string; toLabel: string; weight: number };
type Analytics = {
  criticalRanking: Rank[];
  bottleneckRanking: Rank[];
  step1Ranking: Rank[];
  commonPathByCritical: Common[];
  graph: { edges: Edge[] };
};
type Ver = { id: string; number: number; publishedAt: string | null; _count: { responses: number } };

export function AnalyticsPage() {
  const token = localStorage.getItem(LS) ?? "";
  const [versions,     setVersions]     = useState<Ver[]>([]);
  const [versionId,    setVersionId]    = useState("");
  const [critFilter,   setCritFilter]   = useState("");
  const [critChoices,  setCritChoices]  = useState<{ id: string; label: string }[]>([]);
  const [data,         setData]         = useState<Analytics | null>(null);
  const [err,          setErr]          = useState<string | null>(null);

  const loadVers = useCallback(async () => {
    if (!token) return;
    const v = await apiGet<Ver[]>("/api/admin/versions", token);
    setVersions(v);
    setVersionId((cur) => (cur && v.some((x) => x.id === cur) ? cur : v[0]?.id ?? ""));
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token || !versionId) return;
    setErr(null);
    try {
      const q = new URLSearchParams({ versionId });
      if (critFilter) q.set("criticalTaskId", critFilter);
      const a = await apiGet<Analytics>(`/api/admin/analytics?${q.toString()}`, token);
      setData(a);
      if (!critFilter) {
        setCritChoices(a.commonPathByCritical.map((c) => ({ id: c.criticalTaskId, label: c.criticalLabel })));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); setData(null); }
  }, [token, versionId, critFilter]);

  useEffect(() => { void loadVers(); }, [loadVers]);
  useEffect(() => { setCritFilter(""); }, [versionId]);
  useEffect(() => { void loadData(); }, [loadData]);

  if (!token) return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <p className="error">Acesse /admin e faça login primeiro.</p>
      <Link to="/admin">Admin</Link>
    </motion.div>
  );

  const maxEdge = data?.graph.edges.length ? Math.max(...data.graph.edges.map((e) => e.weight)) : 1;
  const maxRank = (rows: Rank[]) => rows.length ? Math.max(...rows.map((r) => r.count)) : 1;

  return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Análise agregada</h1>
        <Link to="/admin" className="btn ghost">← Admin</Link>
      </div>

      {/* filtros */}
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <div className="field">
          <label>Versão</label>
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)} style={{ width: 200 }}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.number} — {v._count.responses} resp.
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Filtrar por crítica</label>
          <select value={critFilter} onChange={(e) => setCritFilter(e.target.value)} style={{ width: 260 }}>
            <option value="">Todas</option>
            {critChoices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        {err && <span className="error">{err}</span>}
      </div>

      {data ? (
        <div className="stack-s">
          {/* rankings em 2 colunas */}
          <div className="analytics-grid">
            <div className="panel">
              <div className="panel-hd">Críticas mais selecionadas</div>
              <div className="panel-body">
                <RankList rows={data.criticalRanking} max={maxRank(data.criticalRanking)} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">Gargalos (pré-requisitos mais usados)</div>
              <div className="panel-body">
                <RankList rows={data.bottleneckRanking} max={maxRank(data.bottleneckRanking)} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">Passo 1 — mais frequente</div>
              <div className="panel-body">
                <RankList rows={data.step1Ranking} max={maxRank(data.step1Ranking)} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-hd">Caminho mais comum por crítica</div>
              <div className="panel-body">
                <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Crítica</th>
                        <th>Sequência dominante</th>
                        <th>n</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commonPathByCritical.map((c) => (
                        <tr key={c.criticalTaskId}>
                          <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.criticalLabel}
                          </td>
                          <td style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
                            {c.sequenceLabel.join(" → ") || "—"}
                          </td>
                          <td>{c.frequency}</td>
                          <td>{c.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* grafo full width */}
          <div className="panel">
            <div className="panel-hd">Grafo de transições A → B (espessura = frequência)</div>
            <div className="panel-body">
              {data.graph.edges.slice(0, 60).map((e) => (
                <div key={`${e.from}-${e.to}`} className="graph-edge">
                  <span className="rank-n" style={{ width: "auto" }}>{e.weight}×</span>
                  <span className="rank-label">{e.fromLabel} → {e.toLabel}</span>
                  <div
                    className="graph-bar"
                    style={{ width: `${Math.max(6, (e.weight / maxEdge) * 240)}px` }}
                  />
                </div>
              ))}
              {data.graph.edges.length === 0 && <p className="muted">Sem dados.</p>}
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">Carregando…</p>
      )}
    </motion.div>
  );
}

function RankList({ rows, max }: { rows: Rank[]; max: number }) {
  if (!rows.length) return <p className="muted">Sem dados.</p>;
  return (
    <>
      {rows.slice(0, 20).map((r, i) => (
        <div key={r.taskId} className="rank-row">
          <span className="rank-n">{i + 1}</span>
          <div className="rank-bar" style={{ width: `${Math.max(4, (r.count / max) * 120)}px` }} />
          <span className="rank-label">{r.label}</span>
          <span className="rank-count">{r.count}</span>
        </div>
      ))}
    </>
  );
}
