import { useMemo } from "react";
import { EXPERT_GOLD_CARDS } from "../data/expertGold";
import {
  computePadraoOuroResearch,
  DEFAULT_GOLD_WEIGHTS,
  diffExpertVsResearch,
  EPS_POSITION,
  INNER_WEIGHTS_CONSENSUS,
  INNER_WEIGHTS_CRITICALITY,
  INNER_WEIGHTS_RECURRENCE,
  matchExpertCardsToTasks,
  N_CEIL,
  N_FLOOR,
  SIGMA_EPS,
  type GoldTaskBreakdown,
  type GoldWeights,
  type PadraoOuroAnalyticsInput,
} from "../lib/padraoOuroCalc";

type AnalyticsGold = PadraoOuroAnalyticsInput;

type Props = {
  data: AnalyticsGold;
  weights: GoldWeights;
  onWeightsChange: (w: GoldWeights) => void;
  onResetWeights: () => void;
};

function pct3(w: { criticality: number; consensus: number; recurrence: number }) {
  return {
    c: (100 * w.criticality).toFixed(1),
    s: (100 * w.consensus).toFixed(1),
    r: (100 * w.recurrence).toFixed(1),
  };
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

  const normEff = pct3(pack.weightsEffective);

  return (
    <div className="stack-s">
      <p className="analytics-lede muted" style={{ margin: "0 0 4px" }}>
        <strong>Padrão ouro</strong> combina um baseline editorial (especialista) com uma síntese numérica dos dados desta versão.
        Ajuste os pesos abaixo; o cálculo usa sempre os valores <strong>normalizados</strong> para somar 1, e recalcula os pesos
        <strong> efetivos</strong> se alguma lente tiver variância zero.
      </p>

      <div className="panel">
        <div className="panel-hd">Pesos da fusão (criticidade · consenso · recorrência)</div>
        <div className="panel-body">
          <div className="row" style={{ flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Criticidade (entrada)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(weights.criticality)}
                onChange={(e) =>
                  onWeightsChange({ ...weights, criticality: Number(e.target.value) })
                }
              />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{weights.criticality}</span>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Consenso (entrada)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(weights.consensus)}
                onChange={(e) =>
                  onWeightsChange({ ...weights, consensus: Number(e.target.value) })
                }
              />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{weights.consensus}</span>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Recorrência (entrada)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(weights.recurrence)}
                onChange={(e) =>
                  onWeightsChange({ ...weights, recurrence: Number(e.target.value) })
                }
              />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{weights.recurrence}</span>
            </div>
            <button type="button" className="btn ghost" onClick={onResetWeights}>
              Voltar ao padrão ({DEFAULT_GOLD_WEIGHTS.criticality} · {DEFAULT_GOLD_WEIGHTS.consensus} ·{" "}
              {DEFAULT_GOLD_WEIGHTS.recurrence})
            </button>
          </div>
          <p className="analytics-lede muted" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Normalizado (soma 1):</strong> criticidade {(100 * pack.weightsNormalized.criticality).toFixed(1)}% · consenso{" "}
            {(100 * pack.weightsNormalized.consensus).toFixed(1)}% · recorrência{" "}
            {(100 * pack.weightsNormalized.recurrence).toFixed(1)}%.
            <br />
            <strong>Pesos efetivos (após lentes sem variância):</strong> {normEff.c}% · {normEff.s}% · {normEff.r}%.
            {!pack.hasRanking ? (
              <>
                {" "}
                <span className="error" style={{ fontWeight: 600 }}>
                  Sem dados de ranking nesta versão/filtro
                </span>
                — posição média e σ ficam vazios; a lente de criticidade usa só seleção + “mais difícil”.
              </>
            ) : null}
          </p>
          <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 8, marginBottom: 0 }}>
            <strong>N (tamanho do ouro pesquisa):</strong> {pack.nFormula}
          </p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-hd">Ouro especialista (baseline editorial)</div>
          <div className="panel-body">
            <ol className="form-answer-list form-answer-ol" style={{ marginTop: 0 }}>
              {expertMatches.map((m, i) => (
                <li key={`${m.card.verb}-${m.card.textoPrincipal}`}>
                  <div style={{ fontWeight: 600 }}>
                    {i + 1}. {m.label ?? `${m.card.verb} ${m.card.textoPrincipal}`}
                    {!m.taskId ? (
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                        (card não encontrado nesta versão)
                      </span>
                    ) : null}
                  </div>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--fs-xs)" }}>
                    <strong>Etapa:</strong> {m.card.etapa} — {m.card.rationale}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">Ouro pesquisa (fusão z-score)</div>
          <div className="panel-body">
            <p className="analytics-lede muted" style={{ marginTop: 0 }}>
              Ordenado por <code>score</code> = w̃<sub>c</sub>·z<sub>A</sub> + w̃<sub>s</sub>·z<sub>B</sub> + w̃<sub>r</sub>·z<sub>C</sub>{" "}
              (w̃ = pesos efetivos). Top {pack.n} tarefas.
            </p>
            {!pack.fusedTop.length ? (
              <p className="muted">Sem tarefas no universo (sem seleções/fluxos/arestas neste filtro).</p>
            ) : (
              <GoldTaskTable rows={pack.fusedTop} showFused />
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd">Variações (só uma lente — mesmo N)</div>
        <div className="panel-body">
          <div className="analytics-grid">
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só criticidade (z<sub>A</sub>)
              </h4>
              <GoldTaskTable rows={pack.variantCriticality} zKey="zCriticality" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só consenso (z<sub>B</sub>)
              </h4>
              <GoldTaskTable rows={pack.variantConsensus} zKey="zConsensus" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só recorrência (z<sub>C</sub>)
              </h4>
              <GoldTaskTable rows={pack.variantRecurrence} zKey="zRecurrence" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hd">Comparativo especialista × pesquisa</div>
        <div className="panel-body">
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Cartão</th>
                  <th>Esp.</th>
                  <th>Pesq.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((d) => (
                  <tr key={d.taskId ?? d.label}>
                    <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{d.label}</td>
                    <td>{d.expertPos ?? "—"}</td>
                    <td>{d.researchPos ?? "—"}</td>
                    <td style={{ fontSize: "var(--fs-xs)" }}>
                      {d.status === "agree" && "✓ Concordância de posição"}
                      {d.status === "reorder" && "↔ Ambos, posições distantes"}
                      {d.status === "expert_only" && "△ Só especialista"}
                      {d.status === "research_only" && "□ Só pesquisa"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <details className="panel analytics-reading-guide">
        <summary>Fórmulas e constantes (memória de cálculo)</summary>
        <div className="panel-body">
          <h3 className="analytics-help-h">Universo de tarefas</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            União dos <code>taskId</code> que aparecem em: críticas selecionadas, ranking, mais difícil, gargalos, passo 1,
            alvos em cobertura de fluxo (top 5), e extremos das arestas do grafo A→B.
          </p>

          <h3 className="analytics-help-h">N</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Mediana do número de críticas marcadas por envio vem do servidor como <code>medianCriticalSelections</code>.
            Depois: <code>N = min({N_CEIL}, max({N_FLOOR}, round(mediana)))</code>. Se mediana for 0, usa-se {N_FLOOR}.
          </p>

          <h3 className="analytics-help-h">Lente A — criticidade (raw antes do z-score)</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Para cada métrica entre tarefas do universo, divide-se pelo <strong>máximo</strong> (normalização max-norm).
            <br />
            <code>
              raw<sub>A</sub> = {INNER_WEIGHTS_CRITICALITY.selection}·norm(sel) + {INNER_WEIGHTS_CRITICALITY.rankInverse}
              ·norm(1/(avgPos+{EPS_POSITION})) + {INNER_WEIGHTS_CRITICALITY.hardest}·norm(hardest)
            </code>
            <br />
            <code>sel</code> = vezes marcada como crítica; <code>avgPos</code> = posição média no ranking (só se houver ranking);
            ausência de ranking zera o termo de posição. <code>hardest</code> = votos “mais difícil”.
          </p>

          <h3 className="analytics-help-h">Lente B — consenso</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            <code>invSig = 1/(σ + {SIGMA_EPS})</code> com σ = desvio-padrão das posições no ranking. Se a tarefa não tem σ,
            usa-se a <strong>mediana</strong> dos <code>invSig</code> das tarefas que têm σ.
            <br />
            <code>flowCov</code> = percentual de fluxos preenchidos quando a tarefa é alvo no bloco de cobertura (0 se não está no top 5 de alvos).
            <br />
            <code>
              raw<sub>B</sub> = {INNER_WEIGHTS_CONSENSUS.inverseSigma}·norm(invSig) +{" "}
              {INNER_WEIGHTS_CONSENSUS.flowCoverage}·norm(flowCov/100)
            </code>
          </p>

          <h3 className="analytics-help-h">Lente C — recorrência</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            <code>
              raw<sub>C</sub> = {INNER_WEIGHTS_RECURRENCE.bottleneck}·norm(gargalo) + {INNER_WEIGHTS_RECURRENCE.step1}
              ·norm(passo1) + {INNER_WEIGHTS_RECURRENCE.edgeDegree}·norm(grau)
            </code>
            <br />
            <code>grau</code> = soma dos pesos das arestas incidentes no grafo agregado.
          </p>

          <h3 className="analytics-help-h">Z-score e fusão</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Para cada lente, <code>z = (raw − média) / σ</code> entre todas as tarefas do universo. Se σ=0, z=0 para todas.
            <br />
            <code>score = w̃<sub>c</sub>·z<sub>A</sub> + w̃<sub>s</sub>·z<sub>B</sub> + w̃<sub>r</sub>·z<sub>C</sub></code> com w̃ =
            pesos normalizados pelo utilizador, depois <strong>redistribuídos</strong> se alguma lente tiver todos os z iguais a zero.
          </p>
        </div>
      </details>
    </div>
  );
}

function GoldTaskTable({
  rows,
  showFused,
  zKey,
}: {
  rows: GoldTaskBreakdown[];
  showFused?: boolean;
  zKey?: "zCriticality" | "zConsensus" | "zRecurrence";
}) {
  return (
    <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tarefa</th>
            {showFused ? <th>Score</th> : <th>z</th>}
            <th>z<sub>A</sub></th>
            <th>z<sub>B</sub></th>
            <th>z<sub>C</sub></th>
            <th title="Detalhe">···</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.taskId}>
              <td>{i + 1}</td>
              <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{r.label}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-xs)" }}>
                {showFused ? r.fusedScore.toFixed(3) : zKey ? r[zKey].toFixed(3) : "—"}
              </td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-xs)" }}>{r.zCriticality.toFixed(2)}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-xs)" }}>{r.zConsensus.toFixed(2)}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-xs)" }}>{r.zRecurrence.toFixed(2)}</td>
              <td style={{ padding: 0 }}>
                <details>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: "var(--fs-xs)" }}>
                    raw
                  </summary>
                  <div
                    className="muted"
                    style={{ fontSize: "var(--fs-xs)", padding: "4px 8px", maxWidth: 280, whiteSpace: "pre-wrap" }}
                  >
                    rawA={r.rawCriticality.toFixed(3)} rawB={r.rawConsensus.toFixed(3)} rawC={r.rawRecurrence.toFixed(3)}
                    {"\n"}
                    sel={r.components.selCount} 1/pos′={r.components.rankInverse.toFixed(3)} hard={r.components.hardestCount}
                    {"\n"}
                    σ={r.components.sigma ?? "—"} invSig={r.components.invSigma.toFixed(3)} flow%=
                    {r.components.flowCovFilledPct ?? "—"}
                    {"\n"}
                    bot={r.components.bottleneck} s1={r.components.step1} grau={r.components.edgeDegree}
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
