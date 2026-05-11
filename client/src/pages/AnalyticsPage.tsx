import { useCallback, useEffect, useMemo, useState } from "react";
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

type ResponseDetailBlock =
  | {
      questionId: string;
      type: "critical_select";
      title: string;
      helpText: string;
      tasks: { id: string; label: string }[];
    }
  | {
      questionId: string;
      type: "critical_rank";
      title: string;
      helpText: string;
      ordered: { position: number; id: string; label: string }[];
    }
  | {
      questionId: string;
      type: "hardest_critical";
      title: string;
      helpText: string;
      task: { id: string; label: string } | null;
      whyText: string;
    }
  | {
      questionId: string;
      type: "text_long";
      title: string;
      helpText: string;
      text: string;
    }
  | {
      questionId: string;
      type: "flow_builder_per_critical";
      title: string;
      helpText: string;
      flows: {
        criticalTaskId: string;
        criticalLabel: string;
        steps: { id: string; label: string }[];
        comment: string;
      }[];
    }
  | {
      questionId: string;
      type: "unknown_question_type";
      title: string;
      helpText: string;
      note: string;
    };

type ResponsesDetailPayload = {
  studyVersionId: string;
  questions: { id: string; sortOrder: number; type: string; title: string; helpText: string }[];
  responses: {
    id: string;
    createdAt: string;
    participantName: string;
    blocks: ResponseDetailBlock[];
  }[];
};

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
  /** ranking = posições 1–5 do passo "ordenar"; selecao = fallback pelas mais marcadas na seleção */
  flowCoverageBasis: "ranking" | "selecao" | "none";
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
  const [section,      setSection]      = useState<"ranking" | "fluxos" | "grafo" | "respostas">("ranking");
  const [responseDetail, setResponseDetail] = useState<ResponsesDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detailQuery, setDetailQuery] = useState("");

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
    lines.push(["meta", "flow_coverage_basis", data.flowCoverageBasis ?? "none"].map(csvCell).join(","));

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

  const loadResponseDetail = useCallback(async () => {
    if (!token || !versionId) {
      setResponseDetail(null);
      return;
    }
    setDetailErr(null);
    setLoadingDetail(true);
    try {
      const q = new URLSearchParams({ versionId });
      const d = await apiGet<ResponsesDetailPayload>(`/api/admin/responses-detail?${q.toString()}`, token);
      setResponseDetail(d);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Erro");
      setResponseDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [token, versionId]);

  useEffect(() => { void loadVers(); }, [loadVers]);
  useEffect(() => { setCritFilter(""); }, [versionId]);
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (section !== "respostas") return;
    void loadResponseDetail();
  }, [section, loadResponseDetail]);

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
        {section !== "respostas" && (
          <div className="field">
            <label>Filtrar por crítica</label>
            <select value={critFilter} onChange={(e) => setCritFilter(e.target.value)} style={{ width: 260 }}>
              <option value="">Todas</option>
              {critChoices.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
        {err && <span className="error">{err}</span>}
      </div>

      {/* sub-nav */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(["ranking","fluxos","grafo","respostas"] as const).map((s) => (
          <button key={s} type="button" className={`tab${section === s ? " active" : ""}`} onClick={() => setSection(s)}>
            {s === "ranking" ? "Ranking & Seleção" : s === "fluxos" ? "Fluxos" : s === "grafo" ? "Grafo" : "Por resposta"}
          </button>
        ))}
      </div>

      <AnalyticsReadingGuide activeSection={section} />

      {loadingVersions ? (
        <p className="muted">Carregando versões…</p>
      ) : versions.length === 0 ? (
        <div className="panel">
          <div className="panel-hd">Nenhuma versão publicada</div>
          <div className="panel-body">
            <p className="muted">Publique um rascunho no Admin para liberar o participante e começar a coletar resultados.</p>
          </div>
        </div>
      ) : section === "respostas" ? (
        <ResponseFormsPanel
          loading={loadingDetail}
          err={detailErr}
          detail={responseDetail}
          query={detailQuery}
          onQueryChange={setDetailQuery}
          onRefresh={() => void loadResponseDetail()}
        />
      ) : loadingData ? (
        <p className="muted">Carregando análise…</p>
      ) : data ? (
        <>
          {section === "ranking" && (
            <div className="stack-s">
              <p className="analytics-lede muted" style={{ margin: "0 0 4px" }}>
                <strong>Visão geral:</strong> contagens e palavras-chave. Quem respondeu o quê, linha a linha, está na aba <strong>Por resposta</strong>.
              </p>
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
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Quantas vezes cada card foi marcado como <strong>crítico</strong> no passo de seleção (uma pessoa pode marcar vários).
                    </p>
                    <RankList rows={data.criticalRanking} max={maxRank(data.criticalRanking)} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Top-5 mais frequentes no ranking</div>
                  <div className="panel-body">
                    <RankList rows={data.top5Ranking} max={maxRank(data.top5Ranking)} />
                    {!data.top5Ranking.length && (
                      <p className="analytics-lede muted" style={{ marginTop: 10 }}>
                        Só preenche se existir a etapa em que o participante <strong>ordena</strong> as críticas e já houver respostas com essa ordenação.
                        Se o formulário não tem essa pergunta, ignore este bloco — os outros gráficos continuam válidos.
                      </p>
                    )}
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
                    {!data.avgRankPosition.length && (
                      <p className="analytics-lede muted" style={{ marginTop: 10 }}>
                        Precisa dos dados de <strong>ranking</strong> (ordenar tarefas). Sem isso, fica vazio.
                      </p>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd" title="Desvio-padrão das posições — tarefas controversas têm maior divergência">
                    Divergência de posição (controversas)
                  </div>
                  <div className="panel-body">
                    <DisagreeList rows={data.disagreementIndex} />
                    {!data.disagreementIndex.length && (
                      <p className="analytics-lede muted" style={{ marginTop: 10 }}>
                        Também depende do <strong>ranking</strong>. Mostra tarefas em que as pessoas discordaram da ordem (quando há várias respostas).
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* linha 3 */}
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Tarefa mais difícil (mais citada)</div>
                  <div className="panel-body">
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Votação do passo “qual foi a <strong>mais difícil</strong>” entre as críticas já selecionadas.
                    </p>
                    <RankList rows={data.hardestCounts} max={maxRank(data.hardestCounts)} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Palavras-chave: "por quê é difícil"</div>
                  <div className="panel-body">
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Palavras que mais apareceram nos <strong>textos curtos</strong> do motivo da tarefa mais difícil (automático, não é análise clínica).
                    </p>
                    <KeywordCloud words={data.whyKeywordsTop} />
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-hd">Palavras-chave: texto longo (dificuldades conceituais)</div>
                <div className="panel-body">
                  <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                    Mesma ideia, aplicada ao <strong>campo de texto longo</strong> do formulário.
                  </p>
                  <KeywordCloud words={data.longTextKeywordsTop} />
                </div>
              </div>
            </div>
          )}

          {section === "fluxos" && (
            <div className="stack-s">
              <p className="analytics-lede muted" style={{ margin: "0 0 4px" }}>
                <strong>Fluxos</strong> usam só o que as pessoas arrastaram na montagem do caminho até cada tarefa crítica. Nada aqui é mapa nem GPS.
              </p>
              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Cobertura dos fluxos (até 5 tarefas-alvo)</div>
                  <div className="panel-body">
                    <FlowCoveragePanel rows={data.flowCoverageTop5} basis={data.flowCoverageBasis ?? "none"} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Gargalos (pré-requisitos mais usados)</div>
                  <div className="panel-body">
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Conta cada card que apareceu <strong>no meio</strong> do caminho (antes da crítica final). Quanto maior o número, mais vezes serviu de “degrau” para chegar em alguma crítica.
                    </p>
                    <RankList rows={data.bottleneckRanking} max={maxRank(data.bottleneckRanking)} />
                  </div>
                </div>
              </div>

              <div className="analytics-grid">
                <div className="panel">
                  <div className="panel-hd">Passo 1 — mais frequente nos fluxos</div>
                  <div className="panel-body">
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Só olha a <strong>primeira posição</strong> de cada fluxo preenchido: qual card costuma começar a sequência. Com poucos envios, muitos empates em “1” são normais.
                    </p>
                    <RankList rows={data.step1Ranking} max={maxRank(data.step1Ranking)} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-hd">Caminho mais comum por crítica</div>
                  <div className="panel-body">
                    <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                      Para <strong>cada</strong> tarefa crítica, qual sequência inteira apareceu mais vezes. <strong>n</strong> = quantas vezes essa sequência venceu; <strong>%</strong> = dentro daquela crítica, que parcela dos fluxos foi essa sequência.
                    </p>
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
              <div className="panel-hd">Transições no fluxo (lista A → B)</div>
              <div className="panel-body">
                <p className="analytics-lede muted" style={{ marginTop: 0 }}>
                  <strong>Não é um desenho em bolhas.</strong> Cada linha é um par “tarefa de onde saiu → tarefa para onde foi”, quando alguém colocou as duas <strong>seguidas</strong> no mesmo fluxo.
                  O número à esquerda (ex.: 3×) é quantas vezes esse salto apareceu no total. A barra roxa é só visual: mais longa = mais frequente.
                  Se quase tudo está 1×, é porque cada caminho ainda é quase único — com mais respostas, alguns pares sobem.
                </p>
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

function AnalyticsReadingGuide({
  activeSection,
}: {
  activeSection: "ranking" | "fluxos" | "grafo" | "respostas";
}) {
  const tabLabel =
    activeSection === "ranking"
      ? "Ranking & Seleção"
      : activeSection === "fluxos"
        ? "Fluxos"
        : activeSection === "grafo"
          ? "Transições (lista A → B)"
          : "Por resposta";

  return (
    <details className="panel analytics-reading-guide">
      <summary>O que significa cada bloco? (guia — pode fechar depois de ler)</summary>
      <div className="panel-body">
        <p className="analytics-lede muted" style={{ marginTop: 0 }}>
          Aba aberta agora: <strong>{tabLabel}</strong>. Cada aba também tem um parágrafo curto em cima dos gráficos.
        </p>

        <h3 className="analytics-help-h">Ranking &amp; Seleção</h3>
        <ul className="analytics-help-ul">
          <li><strong>Lista de envios</strong> — quem mandou e quando (nome é opcional).</li>
          <li><strong>Críticas mais selecionadas</strong> — vezes que cada card foi marcado como crítico.</li>
          <li><strong>Ranking / posição média / divergência</strong> — só funcionam se o formulário tiver o passo de <strong>ordenar</strong> as críticas e já existirem respostas com isso.</li>
          <li><strong>Mais difícil</strong> — qual tarefa foi escolhida como a mais difícil, e nuvem de palavras nos motivos.</li>
        </ul>

        <h3 className="analytics-help-h">Fluxos</h3>
        <ul className="analytics-help-ul">
          <li><strong>Cobertura</strong> — para até cinco tarefas-alvo, quantos participantes montaram um caminho, deixaram vazio ou “pularam” na prática (ver contadores no card).</li>
          <li><strong>Gargalos</strong> — cards que mais aparecem como passo intermediário (não a crítica final).</li>
          <li><strong>Passo 1</strong> — primeiro card de cada fluxo que alguém preencheu.</li>
          <li><strong>Caminho dominante</strong> — para cada crítica, a sequência que mais se repetiu.</li>
        </ul>

        <h3 className="analytics-help-h">Transições (lista A → B)</h3>
        <ul className="analytics-help-ul">
          <li><strong>Não é mapa nem desenho em rede.</strong> É uma lista: de uma tarefa para a seguinte no mesmo fluxo.</li>
          <li><strong>Número ×</strong> — quantas vezes esse par apareceu no total. Poucos envios → muitos “1×” e barras iguais é esperado.</li>
        </ul>

        <h3 className="analytics-help-h">Por resposta</h3>
        <ul className="analytics-help-ul">
          <li><strong>Cada envio completo</strong>, pergunta a pergunta, como em relatório de formulário.</li>
        </ul>
      </div>
    </details>
  );
}

function ResponseFormsPanel({
  loading,
  err,
  detail,
  query,
  onQueryChange,
  onRefresh,
}: {
  loading: boolean;
  err: string | null;
  detail: ResponsesDetailPayload | null;
  query: string;
  onQueryChange: (q: string) => void;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => {
    if (!detail?.responses.length) return [];
    const q = query.trim().toLowerCase();
    if (!q) return detail.responses;
    return detail.responses.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [detail, query]);

  if (loading && !detail) {
    return <p className="muted">Carregando respostas…</p>;
  }
  if (err && !detail) {
    return (
      <div className="panel">
        <div className="panel-body">
          <p className="error">{err}</p>
          <button type="button" className="btn" onClick={onRefresh}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return <p className="muted">Sem dados.</p>;
  }

  return (
    <div className="stack-s">
      <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Cada bloco abaixo é um envio completo, na ordem das perguntas configuradas no estudo.
        </p>
        <div className="row-s" style={{ flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="resp-search">Buscar</label>
            <input
              id="resp-search"
              type="search"
              placeholder="Nome, ID ou trecho de resposta…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              style={{ minWidth: 220 }}
            />
          </div>
          <button type="button" className="btn ghost" onClick={onRefresh} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {err && (
        <p className="error" style={{ margin: 0 }}>{err}</p>
      )}

      {!detail.responses.length ? (
        <div className="panel">
          <div className="panel-hd">Nenhum envio nesta versão</div>
          <div className="panel-body">
            <p className="muted">Quando houver participantes, as respostas aparecem aqui.</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="muted">Nenhum envio corresponde à busca.</p>
      ) : (
        <div className="response-forms-list">
          {filtered.map((r, idx) => (
            <details key={r.id} className="response-forms-card panel" open={idx === 0}>
              <summary className="response-forms-summary">
                <span className="response-forms-summary-title">
                  Envio #{detail.responses.findIndex((x) => x.id === r.id) + 1}
                </span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {new Date(r.createdAt).toLocaleString("pt-BR")}
                  {r.participantName ? ` · ${r.participantName}` : ""}
                </span>
                <code className="response-forms-id">{r.id}</code>
              </summary>
              <div className="panel-body response-forms-body">
                {r.blocks.map((b) => (
                  <FormAnswerBlock key={b.questionId} block={b} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function FormAnswerBlock({ block }: { block: ResponseDetailBlock }) {
  const qTitle = (
    <div className="form-answer-q">
      <strong>{block.title || "(Sem título)"}</strong>
      {block.helpText ? <p className="muted form-answer-help">{block.helpText}</p> : null}
    </div>
  );

  switch (block.type) {
    case "critical_select":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            {!block.tasks.length ? (
              <span className="muted">—</span>
            ) : (
              <ul className="form-answer-list">
                {block.tasks.map((t) => (
                  <li key={t.id}>{t.label}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    case "critical_rank":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            {!block.ordered.length ? (
              <span className="muted">—</span>
            ) : (
              <ol className="form-answer-list form-answer-ol">
                {block.ordered.map((row) => (
                  <li key={`${row.id}-${row.position}`}>
                    <span className="badge" style={{ marginRight: 8 }}>{row.position}º</span>
                    {row.label}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      );
    case "hardest_critical":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            {block.task ? <p style={{ margin: "0 0 8px" }}>{block.task.label}</p> : <p className="muted" style={{ margin: "0 0 8px" }}>—</p>}
            <div className="form-answer-text">{block.whyText || <span className="muted">—</span>}</div>
          </div>
        </div>
      );
    case "text_long":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            <div className="form-answer-text">{block.text || <span className="muted">—</span>}</div>
          </div>
        </div>
      );
    case "flow_builder_per_critical":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            {!block.flows.length ? (
              <span className="muted">—</span>
            ) : (
              <div className="stack-s" style={{ gap: 12 }}>
                {block.flows.map((f) => (
                  <div key={f.criticalTaskId} className="form-answer-flow">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Crítica: {f.criticalLabel}</div>
                    {f.steps.length > 0 ? (
                      <ol className="form-answer-list form-answer-ol" style={{ marginTop: 0 }}>
                        {f.steps.map((s, i) => (
                          <li key={`${f.criticalTaskId}-${s.id}-${i}`}>{s.label}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted" style={{ margin: 0 }}>Fluxo vazio</p>
                    )}
                    {f.comment ? (
                      <div className="form-answer-text form-answer-text-sub">Comentário: {f.comment}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    case "unknown_question_type":
      return (
        <div className="form-answer-row">
          {qTitle}
          <div className="form-answer-a">
            <p className="muted" style={{ margin: 0 }}>{block.note}</p>
          </div>
        </div>
      );
    default: {
      const _exhaust: never = block;
      return _exhaust;
    }
  }
}

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

function FlowCoveragePanel({
  rows,
  basis,
}: {
  rows: FlowCov[];
  basis: "ranking" | "selecao" | "none";
}) {
  if (!rows.length) {
    return (
      <p className="muted">
        {basis === "none"
          ? "Ainda não dá para montar esta visão (sem seleções ou sem versão com dados)."
          : "Não há fluxos gravados para essas tarefas-alvo — ou todos os fluxos estão vazios nas respostas."}
      </p>
    );
  }
  return (
    <div className="stack-s">
      {basis === "selecao" && (
        <p className="analytics-inline-note" role="note">
          <strong>Sem ranking salvo.</strong> Usamos as <strong>cinco críticas mais marcadas</strong> na seleção como alvo (mesma ideia da cobertura, com outra base).
        </p>
      )}
      {basis === "ranking" && (
        <p className="analytics-inline-note muted" role="note">
          Base: tarefas que mais apareceram nas <strong>posições 1 a 5</strong> do passo de ordenação.
        </p>
      )}
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
