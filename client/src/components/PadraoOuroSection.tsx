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

function pct1(x: number) {
  return (100 * x).toFixed(0);
}

function diffStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "agree":
      return { text: "Aparece nas duas listas, em posição parecida", className: "gold-status-ok" };
    case "reorder":
      return { text: "Aparece nas duas, mas numa ordem bem diferente", className: "gold-status-warn" };
    case "expert_only":
      return { text: "Só na lista de referência do especialista", className: "gold-status-info" };
    case "research_only":
      return { text: "Só na lista tirada das respostas", className: "gold-status-info" };
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
        <h2 id="gold-hero-title" className="gold-hero-title">
          O que é o Padrão ouro?
        </h2>
        <p className="gold-hero-lead">
          É uma forma de juntar <strong>duas leituras</strong>: uma lista de tarefas pensada como referência de projeto bem
          feito, e outra lista montada a partir do que as pessoas responderam nesta versão do estudo. O objetivo é
          conversar com a equipa sobre o que é “mínimo indispensável” sem ficar preso só a opinião ou só a números.
        </p>
        <div className="gold-step-grid">
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>
              1
            </span>
            <h3>Referência do especialista</h3>
            <p>Uma lista fixa, curta, com tarefas que costumam sustentar bem um escopo. Serve de conversa: “será que o nosso projeto cobre isto?”</p>
          </div>
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>
              2
            </span>
            <h3>Lista da equipa (automática)</h3>
            <p>
              O sistema lê as respostas (o que marcam como crítico, o que é difícil, os fluxos, etc.) e monta uma sugestão
              de prioridades.
            </p>
          </div>
          <div className="gold-step-card">
            <span className="gold-step-num" aria-hidden>
              3
            </span>
            <h3>Comparar as duas</h3>
            <p>Na tabela lá em baixo vês onde as duas listas batem certo, onde só uma fala, e onde a ordem diverge — bom tema para reunião.</p>
          </div>
        </div>
      </section>

      <div className="panel">
        <div className="panel-hd">Quanto cada “sinal” das respostas deve pesar?</div>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Arrasta os controles para dizer o que importa mais <strong>hoje</strong> na leitura automática. Não precisa somar
            100 — o sistema reparte sozinho. O botão <strong>Voltar ao padrão</strong> traz o equilíbrio inicial (50 · 30 · 20).
          </p>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-urg">Urgência e dor (o grupo marcou como crítico, difícil, etc.)</label>
            <span className="gold-weight-hint">Quanto mais à direita, mais a lista automática segue o que a equipa disse que pesa.</span>
            <input
              id="gold-w-urg"
              type="range"
              min={0}
              max={100}
              value={Math.round(weights.criticality)}
              onChange={(e) => onWeightsChange({ ...weights, criticality: Number(e.target.value) })}
            />
          </div>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-agree">Acordo (menos divergência, fluxos mais preenchidos)</label>
            <span className="gold-weight-hint">Valoriza o que o grupo pensa parecido e o que aparece com caminho mais consistente.</span>
            <input
              id="gold-w-agree"
              type="range"
              min={0}
              max={100}
              value={Math.round(weights.consensus)}
              onChange={(e) => onWeightsChange({ ...weights, consensus: Number(e.target.value) })}
            />
          </div>

          <div className="gold-weight-card">
            <label htmlFor="gold-w-path">Caminhos (passos e ligações que mais repetem)</label>
            <span className="gold-weight-hint">Valoriza tarefas que aparecem muito como degrau ou ligação nos fluxos desenhados.</span>
            <input
              id="gold-w-path"
              type="range"
              min={0}
              max={100}
              value={Math.round(weights.recurrence)}
              onChange={(e) => onWeightsChange({ ...weights, recurrence: Number(e.target.value) })}
            />
          </div>

          <div className="row-s" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={onResetWeights}>
              Voltar ao padrão (50 · 30 · 20)
            </button>
          </div>

          <div className="gold-pill-row" aria-label="Resumo dos pesos usados na lista automática">
            <span className="gold-pill">
              Na mistura de agora: <strong>{pct1(wMix.criticality)}%</strong> urgência
            </span>
            <span className="gold-pill">
              <strong>{pct1(wMix.consensus)}%</strong> acordo
            </span>
            <span className="gold-pill">
              <strong>{pct1(wMix.recurrence)}%</strong> caminhos
            </span>
          </div>

          {!pack.hasRanking ? (
            <p className="gold-muted-box" style={{ border: "1px solid #fecaca", background: "#fff7ed", color: "#9a3412" }}>
              <strong>Atenção:</strong> nesta versão (ou com o filtro atual) quase não há dados de <strong>ordenação</strong> das
              críticas. A parte de “acordo” fica mais fraca; a lista automática usa sobretudo o que foi marcado como crítico e
              “mais difícil”, mais os caminhos.
            </p>
          ) : null}

          <p className="gold-muted-box" style={{ marginTop: 12 }}>
            <strong>Quantas tarefas na lista automática?</strong> São <strong>{pack.n}</strong> sugestões. O número tenta
            acompanhar <strong>quantas críticas, em média, cada pessoa marcou</strong> no formulário (mediana ≈{" "}
            {mediana.toFixed(1)}), mas fica sempre entre <strong>{N_FLOOR}</strong> e <strong>{N_CEIL}</strong> para não virar
            lista gigante nem minúscula.
          </p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-hd">Lista de referência (especialista)</div>
          <div className="panel-body">
            <p className="analytics-lede muted" style={{ marginTop: 0 }}>
              Ordem sugerida para conversar sobre “o mínimo para um escopo redondo”. Se um card não existir nesta versão do
              estudo, aparece aviso ao lado.
            </p>
            <ol className="form-answer-list form-answer-ol" style={{ marginTop: 0 }}>
              {expertMatches.map((m, i) => (
                <li key={`${m.card.verb}-${m.card.textoPrincipal}`}>
                  <div style={{ fontWeight: 600 }}>
                    {i + 1}. {m.label ?? `${m.card.verb} ${m.card.textoPrincipal}`}
                    {!m.taskId ? (
                      <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                        (não encontrado nesta versão)
                      </span>
                    ) : null}
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
              As <strong>{pack.n}</strong> tarefas com melhor pontuação geral depois de misturar os três sinais com os pesos
              acima. <strong>Pontuação geral</strong> é só para ordenar — não é nota de 0 a 10.
            </p>
            {!pack.fusedTop.length ? (
              <p className="muted">Ainda não há dados suficientes neste filtro (por exemplo, sem escolhas ou sem fluxos).</p>
            ) : (
              <GoldFusedTable rows={pack.fusedTop} />
            )}
          </div>
        </div>
      </div>

      <details className="panel analytics-reading-guide">
        <summary>Ver três ordenações alternativas (opcional)</summary>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Aqui podes ver a mesma ideia, mas <strong>uma de cada vez</strong>: só urgência, só acordo, ou só caminhos. Útil
            quando queres discutir “o que é consenso?” separado de “o que é incómodo?”.
          </p>
          <div className="analytics-grid">
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só urgência e dor
              </h4>
              <GoldVariantTable rows={pack.variantCriticality} scoreKey="zCriticality" scoreLabel="Força neste recorte" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só acordo / consistência
              </h4>
              <GoldVariantTable rows={pack.variantConsensus} scoreKey="zConsensus" scoreLabel="Força neste recorte" />
            </div>
            <div>
              <h4 className="analytics-help-h" style={{ marginTop: 0 }}>
                Só caminhos repetidos
              </h4>
              <GoldVariantTable rows={pack.variantRecurrence} scoreKey="zRecurrence" scoreLabel="Força neste recorte" />
            </div>
          </div>
        </div>
      </details>

      <div className="panel">
        <div className="panel-hd">Especialista e respostas: batem certo?</div>
        <div className="panel-body">
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            <strong>Ref.</strong> = posição na lista de referência. <strong>Resp.</strong> = posição na lista automática.
            “—” quer dizer que essa lista não trouxe a tarefa para o topo.
          </p>
          <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Tarefa</th>
                  <th>Ref.</th>
                  <th>Resp.</th>
                  <th>Leitura rápida</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((d) => {
                  const st = diffStatusLabel(d.status);
                  return (
                    <tr key={d.taskId ?? d.label}>
                      <td style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>{d.label}</td>
                      <td>{d.expertPos ?? "—"}</td>
                      <td>{d.researchPos ?? "—"}</td>
                      <td style={{ fontSize: "var(--fs-xs)" }} className={st.className}>
                        {st.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <details className="panel analytics-reading-guide">
        <summary>Detalhe técnico (como o sistema calcula, para quem precisa)</summary>
        <div className="panel-body">
          <h3 className="analytics-help-h">De onde vêm as tarefas analisadas</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Junta-se tudo o que apareceu nas respostas desta versão: críticas escolhidas, ordenação (se existir), voto da mais
            difícil, gargalos e primeiro passo dos fluxos, alvos no bloco de cobertura (até 5), e ligações A→B do grafo.
          </p>

          <h3 className="analytics-help-h">Tamanho N da lista automática</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            {pack.nFormula}
          </p>

          <h3 className="analytics-help-h">Três “lentes” antes da pontuação final</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Cada métrica é primeiro escalada pelo maior valor entre tarefas (para ficar comparável). Depois:
          </p>
          <ul className="analytics-help-ul">
            <li>
              <strong>Urgência (lente A):</strong>{" "}
              {INNER_WEIGHTS_CRITICALITY.selection}× marcações como crítica + {INNER_WEIGHTS_CRITICALITY.rankInverse}×
              (1 ÷ (posição média + {EPS_POSITION})) + {INNER_WEIGHTS_CRITICALITY.hardest}× votos “mais difícil”. Sem ranking,
              o termo da posição fica zero.
            </li>
            <li>
              <strong>Acordo (lente B):</strong> {INNER_WEIGHTS_CONSENSUS.inverseSigma}× (1 ÷ (desvio-padrão das posições +{" "}
              {SIGMA_EPS})) + {INNER_WEIGHTS_CONSENSUS.flowCoverage}× cobertura de fluxo quando a tarefa é alvo (0 se não está
              no top 5 de alvos). Quem não tem desvio usa a mediana dos outros.
            </li>
            <li>
              <strong>Caminhos (lente C):</strong> {INNER_WEIGHTS_RECURRENCE.bottleneck}× gargalos +{" "}
              {INNER_WEIGHTS_RECURRENCE.step1}× primeiro passo + {INNER_WEIGHTS_RECURRENCE.edgeDegree}× soma das ligações no
              grafo.
            </li>
          </ul>

          <h3 className="analytics-help-h">Pontuação geral (fusão)</h3>
          <p className="analytics-lede muted" style={{ marginTop: 0 }}>
            Em cada lente calcula-se um z-score (média e dispersão entre todas as tarefas). A pontuação geral é a soma
            pesada desses z-scores. Se uma lente não tiver diferença entre tarefas (todos iguais), o peso dela é repartido
            pelas outras.
          </p>
        </div>
      </details>
    </div>
  );
}

function GoldFusedTable({ rows }: { rows: GoldTaskBreakdown[] }) {
  return (
    <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tarefa sugerida</th>
            <th>Pontuação geral</th>
            <th style={{ width: 140 }}>Detalhe</th>
          </tr>
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
                    Ver números de apoio
                  </summary>
                  <div className="gold-muted-box" style={{ marginTop: 8, maxWidth: 320 }}>
                    <strong>Três forças (técnico):</strong> urgência {r.zCriticality.toFixed(2)}, acordo {r.zConsensus.toFixed(2)}
                    , caminhos {r.zRecurrence.toFixed(2)}.
                    <br />
                    <strong>Valores brutos misturados antes do z:</strong> {r.rawCriticality.toFixed(3)} · {r.rawConsensus.toFixed(3)}{" "}
                    · {r.rawRecurrence.toFixed(3)}.
                    <br />
                    <span style={{ fontSize: "10px", display: "block", marginTop: 6 }}>
                      Marcada como crítica: {r.components.selCount}× · Mais difícil: {r.components.hardestCount}× · Gargalo no
                      fluxo: {r.components.bottleneck}× · 1º passo: {r.components.step1}× · Ligações no grafo:{" "}
                      {r.components.edgeDegree}
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
  scoreKey: "zCriticality" | "zConsensus" | "zRecurrence";
  scoreLabel: string;
}) {
  return (
    <div className="table-wrap gold-task-table-wrap" style={{ border: "none", borderRadius: 0 }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tarefa</th>
            <th>{scoreLabel}</th>
          </tr>
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
