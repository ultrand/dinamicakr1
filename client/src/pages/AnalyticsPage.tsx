import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { ciapMotion } from "../ciap-motion";

const LS = "dinamica_admin_token";

type Rank   = { taskId: string; count: number; label: string };
type RankPos = { taskId: string; label: string; avgPosition: number; count: number };
type Disagree = { taskId: string; label: string; disagreement: number; count: number };
type HardestCount = { taskId: string; label: string; count: number };
type FlowCov = { criticalTaskId: string; label: string; filledCount: number; skippedCount: number; emptyCount: number; filledPercent: number };
type Common = { criticalTaskId: string; criticalLabel: string; sequenceLabel: string[]; frequency: number; percent: number };
type Edge   = { from: string; to: string; fromLabel: string; toLabel: string; weight: number };
type Keyword = { term: string; count: number };
type ResponseIdentity = { id: string; createdAt: string; participantName: string };
type Analytics = {
  criticalRanking: Rank[];
  bottleneckRanking: Rank[];
  step1Ranking: Rank[];
  commonPathByCritical: Common[];
  graph: { edges: Edge[] };
  // novos
  top5Ranking: Rank[];
  avgRankPosition: RankPos[];
  disagreementIndex: Disagree[];
  hardestCounts: HardestCount[];
  flowCoverageTop5: FlowCov[];
  whyKeywordsTop: Keyword[];
  longTextKeywordsTop: Keyword[];
  responses: ResponseIdentity[];
};
type Ver = { id: string; number: number; publishedAt: string | null; _count: { responses: number } };

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const token = localStorage.getItem(LS) ?? "";
  const [versions,     setVersions]     = useState<Ver[]>([]);
  const [versionId,    setVersionId]    = useState("");
  const [critFilter,   setCritFilter]   = useState("");
  const [critChoices,  setCritChoices]  = useState<{ id: string; label: string }[]>([]);
  const [data,         setData]         = useState<Analytics | null>(null);
  const [err,          setErr]          = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [section,      setSection]      = useState<"ranking" | "fluxos" | "grafo">("ranking");

  const exportAnalyticsCsv = () => {
    if (!data || !versionId) return;
    const version = versions.find((v) => v.id === versionId);
    const lines: string[] = [];
    const now = new Date().toISOString();
    lines.push(["meta", "generated_at", now].map(csvCell).join(","));
    lines.push(["meta", "version_id", versionId].map(csvCell).join(","));
    lines.push(["meta", "version_number", version ? `v${version.number}` : "desconhecida"].map(csvCell).join(","));
    lines.push(["meta", "critical_filter", critFilter || "todas"].map(csvCell).join(","));
    lines.push(["meta", "responses_count", data.responses.length].map(csvCell).join(","));

    const pushRank = (metric: string, rows: { label: string; count: number }[]) => {
      rows.forEach((r, i) => lines.push(["ranking", metric, i + 1, r.label, r.count].map(csvCell).join(",")));
    };
    const pushAvg = (metric: string, rows: RankPos[]) => {
      rows.forEach((r, i) => lines.push(["ranking", metric, i + 1, r.label, r.avgPosition.toFixed(2), r.count].map(csvCell).join(",")));
    };
    const pushDisagree = (metric: string, rows: Disagree[]) => {
      rows.forEach((r, i) => lines.push(["ranking", metric, i + 1, r.label, r.disagreement.toFixed(2), r.count].map(csvCell).join(",")));
    };
    const pushKeywords = (metric: string, rows: Keyword[]) => {
      rows.forEach((r, i) => lines.push(["keywords", metric, i + 1, r.term, r.count].map(csvCell).join(",")));
    };

    lines.push(["section", "kind", "metric", "pos", "label_or_term", "value1", "value2"].map(csvCell).join(","));
    data.responses.forEach((r, i) =>
      lines.push(["responses", "identity", "submitted", i + 1, r.id, r.createdAt, r.participantName || ""].map(csvCell).join(",")),
    );
    pushRank("critical_selected", data.criticalRanking);
    pushRank("top5_ranking", data.top5Ranking);
    pushRank("bottleneck", data.bottleneckRanking);
    pushRank("step1", data.step1Ranking);
    pushRank("hardest", data.hardestCounts);
    pushAvg("avg_rank_position", data.avgRankPosition);
    pushDisagree("rank_disagreement", data.disagreementIndex);
    pushKeywords("hardest_why", data.whyKeywordsTop);
    pushKeywords("long_text", data.longTextKeywordsTop);

    data.flowCoverageTop5.forEach((r) =>
      lines.push(["flow_coverage", "coverage", "top5", r.label, r.filledCount, r.skippedCount, r.emptyCount, r.filledPercent].map(csvCell).join(",")),
    );
    data.commonPathByCritical.forEach((r) =>
      lines.push(["common_path", "path", "dominant", r.criticalLabel, r.sequenceLabel.join(" -> "), r.frequency, r.percent].map(csvCell).join(",")),
    );
    data.graph.edges.forEach((e) =>
      lines.push(["graph", "edge", "transition", `${e.fromLabel} -> ${e.toLabel}`, e.weight, e.from, e.to].map(csvCell).join(",")),
    );

    const filename = `analytics-v${version?.number ?? "x"}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(lines.join("\n"), filename);
  };

  const loadVers = useCallback(async () => {
    if (!token) return;
    setLoadingVersions(true);
    setErr(null);
    try {
      const v = await apiGet<Ver[]>("/api/admin/versions", token);
      setVersions(v);
      setVersionId((cur) => (cur && v.some((x) => x.id === cur) ? cur : v[0]?.id ?? ""));
      if (v.length === 0) setData(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
      setVersions([]);
      setVersionId("");
      setData(null);
    } finally {
      setLoadingVersions(false);
    }
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token || !versionId) { setData(null); return; }
    setErr(null);
    setLoadingData(true);
    try {
      const q = new URLSearchParams({ versionId });
      if (critFilter) q.set("criticalTaskId", critFilter);
      const a = await apiGet<Analytics>(`/api/admin/analytics?${q.toString()}`, token);
      setData(a);
      if (!critFilter) {
        setCritChoices(a.commonPathByCritical.map((c) => ({ id: c.criticalTaskId, label: c.criticalLabel })));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); setData(null); }
    finally { setLoadingData(false); }
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
  const maxRank = (rows: { count: number }[]) => rows.length ? Math.max(...rows.map((r) => r.count)) : 1;

  return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Análise agregada</h1>
        <div className="row-s">
          <button type="button" className="btn ghost" onClick={exportAnalyticsCsv} disabled={!data || !versionId}>
            Exportar análise (CSV)
          </button>
          <Link to="/admin/export" className="btn ghost">Exportar</Link>
          <Link to="/admin" className="btn ghost">← Admin</Link>
        </div>
      </div>

      {/* filtros */}
      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div className="field">
          <label>Versão</label>
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)} style={{ width: 200 }} disabled={versions.length === 0}>
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

      {/* sub-nav */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(["ranking","fluxos","grafo"] as const).map((s) => (
          <button key={s} type="button" className={`tab${section === s ? " active" : ""}`} onClick={() => setSection(s)}>
            {s === "ranking" ? "Ranking & Seleção" : s === "fluxos" ? "Fluxos" : "Grafo"}
          </button>
        ))}
      </div>

      {loadingVersions ? (
        <p className="muted">Carregando versões…</p>
      ) : versions.length === 0 ? (
        <div className="panel">
          <div className="panel-hd">Nenhuma versão publicada</div>
          <div className="panel-body">
            <p className="muted">Publique um rascunho no Admin para liberar o participante e começar a coletar resultados.</p>
          </div>
        </div>
      ) : loadingData ? (
        <p className="muted">Carregando análise…</p>
      ) : data ? (
        <>
          {section === "ranking" && (
            <div className="stack-s">
              <div className="panel">
                <div className="panel-hd">Respostas recebidas (horário e identificação)</div>
                <div className="panel-body">
                  {!data.responses.length ? (
                    <p className="muted">Sem respostas nesta versão.</p>
                  ) : (
                    <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Horário</th>
                            <th>Nome (opcional)</th>
                            <th>ID da resposta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.responses.map((r, i) => (
                            <tr key={r.id}>
                              <td>{i + 1}</td>
                              <td>{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                              <td>{r.participantName || "—"}</td>
                              <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: "var(--fs-xs)" }}>
                                {r.id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              {/* linha 1 */}
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Críticas mais selecionadas</div>
                  <div className="panel-body">
                    <RankList rows={data.criticalRanking} max={maxRank(data.criticalRanking)} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Top-5 mais frequentes no ranking</div>
                  <div className="panel-body">
                    <RankList rows={data.top5Ranking} max={maxRank(data.top5Ranking)} />
                  </div>
                </div>
              </div>

              {/* linha 2 */}
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd" title="Posição média no ranking (menor = mais prioritária)">
                    Posição média no ranking ↓ melhor
                  </div>
                  <div className="panel-body">
                    <AvgPosList rows={data.avgRankPosition} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd" title="Desvio-padrão das posições — tarefas controversas têm maior divergência">
                    Divergência de posição (controversas)
                  </div>
                  <div className="panel-body">
                    <DisagreeList rows={data.disagreementIndex} />
                  </div>
                </div>
              </div>

              {/* linha 3 */}
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Tarefa mais difícil (mais citada)</div>
                  <div className="panel-body">
                    <RankList rows={data.hardestCounts} max={maxRank(data.hardestCounts)} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Palavras-chave: "por quê é difícil"</div>
                  <div className="panel-body">
                    <KeywordCloud words={data.whyKeywordsTop} />
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-hd">Palavras-chave: texto longo (dificuldades conceituais)</div>
                <div className="panel-body">
                  <KeywordCloud words={data.longTextKeywordsTop} />
                </div>
              </div>
            </div>
          )}

          {section === "fluxos" && (
            <div className="stack-s">
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Cobertura dos fluxos (Top-5 do ranking)</div>
                  <div className="panel-body">
                    <FlowCoveragePanel rows={data.flowCoverageTop5} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Gargalos (pré-requisitos mais usados)</div>
                  <div className="panel-body">
                    <RankList rows={data.bottleneckRanking} max={maxRank(data.bottleneckRanking)} />
                  </div>
                </div>
              </div>

              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Passo 1 — mais frequente nos fluxos</div>
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
            </div>
          )}

          {section === "grafo" && (
            <div className="panel">
              <div className="panel-hd">Grafo de transições A → B (espessura = frequência)</div>
              <div className="panel-body">
                {data.graph.edges.length > 60 && (
                  <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 0 }}>
                    Mostrando as 60 transições mais fortes de {data.graph.edges.length}.
                  </p>
                )}
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
          )}
        </>
      ) : (
        <p className="muted">Sem dados para esta versão.</p>
      )}
    </motion.div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function RankList({ rows, max }: { rows: { taskId?: string; label: string; count: number }[]; max: number }) {
  if (!rows.length) return <p className="muted">Sem dados.</p>;
  return (
    <>
      {rows.slice(0, 20).map((r, i) => (
        <div key={r.taskId ?? i} className="rank-row">
          <span className="rank-n">{i + 1}</span>
          <div className="rank-bar" style={{ width: `${Math.max(4, (r.count / max) * 120)}px` }} />
          <span className="rank-label">{r.label}</span>
          <span className="rank-count">{r.count}</span>
        </div>
      ))}
    </>
  );
}

function AvgPosList({ rows }: { rows: RankPos[] }) {
  if (!rows.length) return <p className="muted">Sem dados de ranking.</p>;
  const maxPos = Math.max(...rows.map((r) => r.avgPosition), 1);
  return (
    <>
      {rows.slice(0, 20).map((r, i) => (
        <div key={r.taskId} className="rank-row">
          <span className="rank-n">{i + 1}</span>
          <div className="rank-bar" style={{ width: `${Math.max(4, (r.avgPosition / maxPos) * 120)}px`, background: "var(--accent)" }} />
          <span className="rank-label">{r.label}</span>
          <span className="rank-count" title="posição média">{r.avgPosition.toFixed(1)}</span>
        </div>
      ))}
    </>
  );
}

function DisagreeList({ rows }: { rows: Disagree[] }) {
  if (!rows.length) return <p className="muted">Sem dados de ranking.</p>;
  const maxD = Math.max(...rows.map((r) => r.disagreement), 1);
  return (
    <>
      {rows.slice(0, 20).map((r, i) => (
        <div key={r.taskId} className="rank-row">
          <span className="rank-n">{i + 1}</span>
          <div
            className="rank-bar"
            style={{ width: `${Math.max(4, (r.disagreement / maxD) * 120)}px`, background: "#f59e0b" }}
          />
          <span className="rank-label">{r.label}</span>
          <span className="rank-count" title="desvio-padrão das posições">σ {r.disagreement.toFixed(1)}</span>
        </div>
      ))}
    </>
  );
}

function FlowCoveragePanel({ rows }: { rows: FlowCov[] }) {
  if (!rows.length) return <p className="muted">Sem dados de fluxo.</p>;
  return (
    <div className="stack-s">
      {rows.map((r) => (
        <div key={r.criticalTaskId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
          <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, gridColumn: "1/-1" }}>{r.label}</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span className="badge badge-y" title="Preenchidos">{r.filledCount} ✓</span>
            <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }} title="Pulados">{r.skippedCount} →</span>
            <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }} title="Vazios">{r.emptyCount} ✗</span>
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", alignSelf: "center" }}>
            {r.filledPercent}% preenchidos
          </span>
          <div style={{ gridColumn: "1/-1", height: 6, background: "#e5e7eb", borderRadius: 3 }}>
            <div style={{ width: `${r.filledPercent}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KeywordCloud({ words }: { words: { term: string; count: number }[] }) {
  if (!words.length) return <p className="muted">Sem dados.</p>;
  const maxC = Math.max(...words.map((w) => w.count), 1);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {words.map((w) => (
        <span
          key={w.term}
          className="chip"
          style={{ fontSize: `${0.65 + (w.count / maxC) * 0.45}rem`, opacity: 0.6 + (w.count / maxC) * 0.4 }}
          title={`${w.count}×`}
        >
          {w.term}
        </span>
      ))}
    </div>
  );
}
