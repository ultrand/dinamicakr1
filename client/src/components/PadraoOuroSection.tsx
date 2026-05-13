import { useMemo } from "react";
import { EXPERT_GOLD_CARDS } from "../data/expertGold";
import {
  computePadraoOuroResearch,
  DEFAULT_GOLD_WEIGHTS,
  diffExpertVsResearch,
  EPS_POSITION,
  INNER_WEIGHTS_CONSENSUS,
  INNER_WEIGHTS_CRITICALITY,
  INNER_WEIGHTS_FREQUENCY,
  INNER_WEIGHTS_RECURRENCE,
  matchExpertCardsToTasks,
  N_CEIL,
  N_FLOOR,
  SIGMA_EPS,
  type GoldTaskBreakdown,
  type GoldWeights,
  type PadraoOuroAnalyticsInput,
} from "../lib/padraoOuroCalc";

type Props = {
  data: PadraoOuroAnalyticsInput;
  weights: GoldWeights;
  onWeightsChange: (w: GoldWeights) => void;
  onResetWeights: () => void;
};

function pct1(x: number) {
  return (100 * x).toFixed(0);
}

function diffStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "agree":
      return { text: "Aparece nas duas listas, posição parecida", className: "gold-status-ok" };
    case "reorder":
      return { text: "Nas duas, mas ordem bem diferente", className: "gold-status-warn" };
    case "expert_only":
      return { text: "Só na referência do especialista", className: "gold-status-info" };
    case "research_only":
      return { text: "Só na lista das respostas", className: "gold-status-info" };
    default:
      return { text: status, className: "" };
  }
}

export function PadraoOuroSection({ data, weights, onWeightsChange, onResetWeights }: Props) {
  const pack = useMemo(() => computePadraoOuroResearch(data, weights), [data, weights]);

  const expertMatches = useMemo(
    () => matchExpertCardsToTasks(EXPERT_GOLD_CARDS, data.graph.nodes),
    [data.graph.nodes],
  );

  const diffRows = useMemo(() => {
    const expertIds = expertMatches.map((m) => m.taskId);
    return diffExpertVsResearch(expertIds, pack.fusedTop);
  }, [expertMatches, pack.fusedTop]);

  const wMix = pack.weightsEffective;
  const mediana = data.medianCriticalSelections ?? 0;

  return (
    <div className="stack-s">
      <section className="gold-hero" aria-labelledby="gold-hero-title">
        <h2 id="gold-hero-title" className="gold-hero-title">O que é o Padrão ouro?</h2>
        <p className="gold-hero-lead">
          Junta <strong>duas leituras</strong>: uma lista de referência (especialista) e outra montada pelas respostas da equipa.
          O objetivo é conversar sobre o "mínimo indispensável" sem ficar preso só a opinião ou só a números.
        </p>
        <div className="gold-step-grid">
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>1</span>
            <h3>Referência do especialista</h3>
            <p>Lista fixa e curta de tarefas que sustentam um escopo bem-feito.</p>
          </div>
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>2</span>
            <h3>Lista da equipa (automática)</h3>
            <p>O sistema lê as respostas e monta uma sugestão de prioridades.</p>
          </div>
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>3</span>
            <h3>Comparar as duas</h3>
            <p>Na tabela lá embaixo: onde batem certo, onde divergem, onde só uma fala.</p>
          </div>
        </div>
      </section>

      {/* ── Sliders ── */}
      <div className="panel">
        <div className="panel-hd">Quanto cada "sinal" das respostas deve pesar?</div>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Arraste os controles. Não precisa somar 100 — o sistema reparte sozinho.
          </p>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-urg">Urgência e dor (posição alta no ranking + votos "mais difícil")</label>
            <span className="gold-weight-hint">Prioriza o que o grupo vê como mais doloroso ou urgente.</span>
            <input id="gold-w-urg" type="range" min={0} max={100}
              value={Math.round(weights.criticality)}
              onChange={(e) => onWeightsChange({ ...weights, criticality: Number(e.target.value) })}
            />
          </div>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-agree">Acordo (menos divergência entre respostas + fluxos preenchidos)</label>
            <span className="gold-weight-hint">Valoriza o que o grupo pensa parecido — pouca briga de posição.</span>
            <input id="gold-w-agree" type="range" min={0} max={100}
              value={Math.round(weights.consensus)}
              onChange={(e) => onWeightsChange({ ...weights, consensus: Number(e.target.value) })}
            />
          </div>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-freq">Frequência de aparição (quantas vezes foi selecionada / ficou no top-5)</label>
            <span className="gold-weight-hint">Quanto mais gente escolheu ou ranqueou essa tarefa, mais forte aqui.</span>
            <input id="gold-w-freq" type="range" min={0} max={100}
              value={Math.round(weights.frequency)}
              onChange={(e) => onWeightsChange({ ...weights, frequency: Number(e.target.value) })}
            />
          </div>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-path">Caminhos (passos e ligações que mais repetem nos fluxos)</label>
            <span className="gold-weight-hint">Valoriza tarefas que aparecem como degrau ou ligação nos fluxos desenhados.</span>
            <input id="gold-w-path" type="range" min={0} max={100}
              value={Math.round(weights.recurrence)}
              onChange={(e) => onWeightsChange({ ...weights, recurrence: Number(e.target.value) })}
            />
          </div>

          <div className="row-s" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={onResetWeights}>
              Voltar ao padrão (35 · 25 · 25 · 15)
            </button>
          </div>

          <div className="gold-pill-row" aria-label="Resumo dos pesos usados">
            <span className="gold-pill">Na mistura: <strong>{pct1(wMix.criticality)}%</strong> urgência</span>
            <span className="gold-pill"><strong>{pct1(wMix.consensus)}%</strong> acordo</span>
            <span className="gold-pill"><strong>{pct1(wMix.frequency)}%</strong> frequência</span>
            <span className="gold-pill"><strong>{pct1(wMix.recurrence)}%</strong> caminhos</span>
          </div>

          {!pack.hasRanking && (
            <p className="gold-muted-box" style={{ border: "1px solid #fecaca", background: "#fff7ed", color: "#9a3412" }}>
              <strong>Atenção:</strong> nesta versão quase não há dados de ordenação. "Acordo" fica mais fraco; a lista usa
              sobretudo frequência + "mais difícil" + caminhos.
            </p>
          )}

          <p className="gold-muted-box" style={{ marginTop: 12 }}>
            <strong>Quantas tarefas na lista?</strong> São <strong>{pack.n}</strong>. Baseado na mediana de
            críticas por envio (≈ {mediana.toFixed(1)}), entre {N_FLOOR} e {N_CEIL}.
          </p>
        </div>
      </div>

      {/* ── Listas lado a lado ── */}
      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-hd">Lista de referência (especialista)</div>
          <div className="panel-body">
            <p className="analytics-lede muted" style={{ marginTop: 0 }}>
              Tarefas mínimas para um escopo redondo. Se um card não existe nesta versão, aparece aviso.
            </p>
            <ol className="form-answer-list form-answer-ol" style={{ marginTop: 0 }}>
              {expertMatches.map((m, i) => (
                <li key={`${m.card.verb}-${m.card.textoPrincipal}`}>
                  <div style={{ fontWeight: 600 }}>
                    {i + 1}. {m.label ?? `${m.card.verb} ${m.card.textoPrincipal}`}
                    {!m.taskId && <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>(não nesta versão)</span>}
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: "var(--fs-xs)", lineHeight: 1.5 }}>
                    <strong>{m.card.etapa}.</strong> {m.card.rationale}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">Lista sugerida pelas respostas</div>
          <div className="panel-body">
            <p className="analytics-lede muted" style={{ marginTop: 0 }}>
              Top {pack.n} tarefas pela pontuação geral (mistura dos 4 sinais).
            </p>
            {!pack.fusedTop.length ? (
              <p className="muted">Ainda sem dados suficientes neste filtro.</p>
            ) : (
              <GoldFusedTable rows={pack.fusedTop} />
            )}
          </div>
        </div>
      </div>

      {/* ── Variações ── */}
      <details className="panel analytics-reading-guide">
        <summary>Ver quatro ordenações alternativas (opcional)</summary>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Mesma ideia, mas <strong>um sinal de cada vez</strong>. Útil para discutir isoladamente.
          </p>
          <div className="analytics-grid">
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>Só urgência e dor</h4>
              <GoldVariantTable rows={pack.variantCriticality} scoreKey="zCriticality" scoreLabel="Força" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>Só acordo / consistência</h4>
              <GoldVariantTable rows={pack.variantConsensus} scoreKey="zConsensus" scoreLabel="Força" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>Só frequência de aparição</h4>
              <GoldVariantTable rows={pack.variantFrequency} scoreKey="zFrequency" scoreLabel="Força" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>Só caminhos repetidos</h4>
              <GoldVariantTable rows={pack.variantRecurrence} scoreKey="zRecurrence" scoreLabel="Força" />
            </div>
          </div>
        </div>
      </details>

      {/* ── Comparativo ── */}
      <div className="panel">
        <div className="panel-hd">Especialista e respostas: batem certo?</div>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            <strong>Ref.</strong> = posição na lista de referência. <strong>Resp.</strong> = posição na lista automática.
          </p>
          <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr><th>Tarefa</th><th>Ref.</th><th>Resp.</th><th>Leitura rápida</th></tr>
              </thead>
              <tbody>
                {diffRows.map((d) => {
                  const st = diffStatusLabel(d.status);
                  return (
                    <tr key={d.taskId ?? d.label}>
                      <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{d.label}</td>
                      <td>{d.expertPos ?? "—"}</td>
                      <td>{d.researchPos ?? "—"}</td>
                      <td style={{ fontSize: "var(--fs-xs)" }} className={st.className}>{st.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Detalhe técnico ── */}
      <details className="panel analytics-reading-guide">
        <summary>Detalhe técnico (como o sistema calcula)</summary>
        <div className="panel-body">
          <h3 className="analytics-help-h">Tamanho N</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>{pack.nFormula}</p>

          <h3 className="analytics-help-h">Quatro "lentes" antes da pontuação final</h3>
          <ul className="analytics-help-ul">
            <li>
              <strong>Urgência (A):</strong> {INNER_WEIGHTS_CRITICALITY.rankInverse}× (1 ÷ (posição média + {EPS_POSITION})) +{" "}
              {INNER_WEIGHTS_CRITICALITY.hardest}× votos "mais difícil". Sem ranking, posição fica zero.
            </li>
            <li>
              <strong>Acordo (B):</strong> {INNER_WEIGHTS_CONSENSUS.inverseSigma}× (1 ÷ (σ + {SIGMA_EPS})) +{" "}
              {INNER_WEIGHTS_CONSENSUS.flowCoverage}× cobertura de fluxo.
            </li>
            <li>
              <strong>Frequência (C):</strong> {INNER_WEIGHTS_FREQUENCY.selection}× seleções como crítica +{" "}
              {INNER_WEIGHTS_FREQUENCY.top5}× vezes no top-5 do ranking.
            </li>
            <li>
              <strong>Caminhos (D):</strong> {INNER_WEIGHTS_RECURRENCE.bottleneck}× gargalos +{" "}
              {INNER_WEIGHTS_RECURRENCE.step1}× primeiro passo + {INNER_WEIGHTS_RECURRENCE.edgeDegree}× ligações no grafo.
            </li>
          </ul>

          <h3 className="analytics-help-h">Pontuação geral (fusão)</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Em cada lente: z-score entre todas as tarefas. Pontuação = soma pesada dos z-scores com os pesos efetivos.
            Se uma lente tiver variância zero, peso é redistribuído para as outras.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ── Tabelas internas ── */

function GoldFusedTable({ rows }: { rows: GoldTaskBreakdown[] }) {
  return (
    <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
      <table>
        <thead>
          <tr><th>#</th><th>Tarefa sugerida</th><th>Pontuação</th><th style={{ width: 140 }}>Detalhe</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.taskId}>
              <td>{i + 1}</td>
              <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{r.label}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                {r.fusedScore.toFixed(2)}
              </td>
              <td>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "var(--fs-xs)", color: "var(--accent)", fontWeight: 600 }}>
                    Ver apoio
                  </summary>
                  <div className="gold-muted-box" style={{ marginTop: 8, maxWidth: 340 }}>
                    <strong>4 forças:</strong> urgência {r.zCriticality.toFixed(2)}, acordo {r.zConsensus.toFixed(2)},
                    frequência {r.zFrequency.toFixed(2)}, caminhos {r.zRecurrence.toFixed(2)}.
                    <br />
                    <span style={{ fontSize: "10px", display: "block", marginTop: 6 }}>
                      Selecionada: {r.components.selCount}× · Top-5: {r.components.top5Count}× · Mais difícil: {r.components.hardestCount}× · Gargalo: {r.components.bottleneck}× · 1º passo: {r.components.step1}× · Grafo: {r.components.edgeDegree}
                    </span>
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoldVariantTable({
  rows,
  scoreKey,
  scoreLabel,
}: {
  rows: GoldTaskBreakdown[];
  scoreKey: "zCriticality" | "zConsensus" | "zFrequency" | "zRecurrence";
  scoreLabel: string;
}) {
  return (
    <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
      <table>
        <thead>
          <tr><th>#</th><th>Tarefa</th><th>{scoreLabel}</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.taskId}>
              <td>{i + 1}</td>
              <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{r.label}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-xs)" }}>{r[scoreKey].toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
