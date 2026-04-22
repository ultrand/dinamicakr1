import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { v4 as uuid } from "uuid";
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiSend, apiGet } from "../api";
import { ciapMotion, ciapStagger } from "../ciap-motion";
import { BankDraggable, FlowTrack, reorderChain, type ChainEntry } from "../components/FlowTrack";
import { TaskCard } from "../components/TaskCard";
import type { Question, StudyVersion, Task } from "../types";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type VersionPayload = { studyId: string; version: StudyVersion | null };

function capitalizeText(s: string) {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatTaskLabel(task: Task | undefined) {
  if (!task) return "—";
  const verb = (task.verb ?? "").trim().toUpperCase();
  const text = capitalizeText(task.textoPrincipal);
  return `${verb} ${text}`.trim();
}

type WizardState = {
  step: 1 | 2 | 3 | 4 | 5;
  selected: string[];                         // IDs selecionados
  orderedSelected: string[];                  // ranking passo 2
  hardestId: string | null;
  why: string;
  longText: string;
  chains: Record<string, ChainEntry[]>;       // fluxos por critica
  skippedFlows: Set<string>;                  // top5 pulados
};

type Action =
  | { type: "SET_STEP"; step: WizardState["step"] }
  | { type: "TOGGLE_SELECT"; id: string }
  | { type: "SET_ORDERED"; ids: string[] }
  | { type: "SET_HARDEST"; id: string | null }
  | { type: "SET_WHY"; why: string }
  | { type: "SET_LONG_TEXT"; text: string }
  | { type: "SET_CHAIN"; critId: string; chain: ChainEntry[] }
  | { type: "TOGGLE_SKIP_FLOW"; critId: string };

function reducer(s: WizardState, a: Action): WizardState {
  switch (a.type) {
    case "SET_STEP": return { ...s, step: a.step };
    case "TOGGLE_SELECT": {
      const sel = s.selected.includes(a.id)
        ? s.selected.filter((x) => x !== a.id)
        : [...s.selected, a.id];
      const ord = s.orderedSelected.filter((x) => sel.includes(x));
      for (const id of sel) if (!ord.includes(id)) ord.push(id);
      return {
        ...s,
        selected: sel,
        orderedSelected: ord,
        hardestId: s.hardestId && !sel.includes(s.hardestId) ? null : s.hardestId,
      };
    }
    case "SET_ORDERED": return { ...s, orderedSelected: a.ids };
    case "SET_HARDEST": return { ...s, hardestId: a.id };
    case "SET_WHY": return { ...s, why: a.why };
    case "SET_LONG_TEXT": return { ...s, longText: a.text };
    case "SET_CHAIN": return { ...s, chains: { ...s.chains, [a.critId]: a.chain } };
    case "TOGGLE_SKIP_FLOW": {
      const next = new Set(s.skippedFlows);
      next.has(a.critId) ? next.delete(a.critId) : next.add(a.critId);
      return { ...s, skippedFlows: next };
    }
    default: return s;
  }
}

const initState: WizardState = {
  step: 1, selected: [], orderedSelected: [],
  hardestId: null, why: "", longText: "",
  chains: {}, skippedFlows: new Set(),
};

/* ─────────────────────────────────────────────
   Stepper header
───────────────────────────────────────────── */
const STEPS = [
  { n: 1, label: "Seleção" },
  { n: 2, label: "Ranking" },
  { n: 3, label: "Perguntas" },
  { n: 4, label: "Fluxos" },
  { n: 5, label: "Revisão" },
] as const;

function Stepper({ step, maxReached }: { step: number; maxReached: number }) {
  return (
    <div className="wz-stepper" role="list">
      {STEPS.map(({ n, label }, i) => {
        const done = n < step;
        const active = n === step;
        const locked = n > maxReached;
        return (
          <Fragment key={n}>
            {i > 0 && <div className={`wz-step-line${done ? " done" : ""}`} />}
            <div
              role="listitem"
              className={`wz-step${active ? " active" : ""}${done ? " done" : ""}${locked ? " locked" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <div className="wz-step-dot">{done ? "✓" : n}</div>
              <span className="wz-step-label">{label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 1 — Seleção por etapa (accordion)
───────────────────────────────────────────── */
function Step1({
  tasks, selected, dispatch,
}: { tasks: Task[]; selected: string[]; dispatch: React.Dispatch<Action> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = t.etapa || "Sem etapa";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    const arr = Array.from(map.entries());
    // Ordem aleatória por sessão para evitar viés de leitura.
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [tasks]);

  // Inicia com todos os acordeões fechados.
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (k: string) =>
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="wz-body">
      <div className="wz-section-hd">
        <div>
          <h2 className="wz-title">Selecione as tarefas críticas</h2>
          <p className="wz-sub">Escolha todas as tarefas que considera difíceis de realizar no método.</p>
        </div>
        <div className="wz-counter-pill">
          {selected.length} selecionada{selected.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="wz-accordion">
        {grouped.map(([etapa, etapaTasks], gi) => {
          const selCount = etapaTasks.filter((t) => selected.includes(t.id)).length;
          const isOpen = open.has(etapa);
          return (
            <motion.div key={etapa} className="wz-accord-item" {...ciapMotion.projectCard} transition={ciapStagger(gi, 0.04)}>
              <button
                type="button"
                className="wz-accord-hd"
                onClick={() => toggle(etapa)}
                aria-expanded={isOpen}
              >
                <span className="wz-accord-chevron">{isOpen ? "▾" : "▸"}</span>
                <span className="wz-accord-title">{etapa}</span>
                <span className="wz-accord-meta">
                  <span className="badge">{etapaTasks.length}</span>
                  {selCount > 0 && (
                    <span className="badge badge-y">{selCount} sel.</span>
                  )}
                </span>
                {/* mini chips quando fechado */}
                {!isOpen && selCount > 0 && (
                  <span className="wz-accord-chips">
                    {etapaTasks.filter((t) => selected.includes(t.id)).map((t) => (
                      <span key={t.id} className="wz-chip">{formatTaskLabel(t)}</span>
                    ))}
                  </span>
                )}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="wz-accord-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="wz-card-grid">
                      {etapaTasks.map((t, ti) => (
                        <motion.button
                          key={t.id}
                          type="button"
                          className={`crit-btn${selected.includes(t.id) ? " on" : ""}`}
                          onClick={() => dispatch({ type: "TOGGLE_SELECT", id: t.id })}
                          {...ciapMotion.projectCard}
                          transition={ciapStagger(ti, 0.025)}
                        >
                          <TaskCard task={t} selected={selected.includes(t.id)} />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 2 — Ranking (sortable vertical)
───────────────────────────────────────────── */
function SortableRankItem({
  id, task, rank, total, onMove,
}: { id: string; task: Task; rank: number; total: number; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="wz-rank-row"
      {...listeners}
      {...attributes}
      title="Arrastar para reordenar"
    >
      <span className="wz-rank-n">{rank}</span>
      <div className="wz-rank-card">
        <span className="wz-rank-text">{formatTaskLabel(task)}</span>
        <div className="wz-rank-meta">
          {task.etapa && <span className="wz-rank-meta-item">Etapa: <strong>{task.etapa}</strong></span>}
          {task.atividade && <span className="wz-rank-meta-item">Atividade: <strong>{task.atividade}</strong></span>}
        </div>
      </div>
      <div className="wz-rank-btns" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn-icon" onClick={() => onMove(-1)} disabled={rank === 1} title="Subir">↑</button>
        <button type="button" className="btn-icon" onClick={() => onMove(1)} disabled={rank === total} title="Descer">↓</button>
      </div>
    </div>
  );
}

function Step2({
  orderedSelected, taskById, dispatch,
}: { orderedSelected: string[]; taskById: Map<string, Task>; dispatch: React.Dispatch<Action> }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oi = orderedSelected.indexOf(String(active.id));
    const ni = orderedSelected.indexOf(String(over.id));
    if (oi < 0 || ni < 0) return;
    dispatch({ type: "SET_ORDERED", ids: arrayMove(orderedSelected, oi, ni) });
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = orderedSelected.indexOf(id);
    if (i < 0) return;
    const ni = i + dir;
    if (ni < 0 || ni >= orderedSelected.length) return;
    dispatch({ type: "SET_ORDERED", ids: arrayMove(orderedSelected, i, ni) });
  };

  return (
    <div className="wz-body">
      <div className="wz-section-hd">
        <div>
          <h2 className="wz-title">Ordene por prioridade</h2>
          <p className="wz-sub">Arraste ou use ↑↓ para ordenar de forma geral, do mais crítico ao menos crítico.</p>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={orderedSelected} strategy={verticalListSortingStrategy}>
          <div className="wz-rank-list">
            {orderedSelected.map((id, i) => {
              const t = taskById.get(id);
              if (!t) return null;
              return (
                <SortableRankItem
                  key={id} id={id} task={t}
                  rank={i + 1} total={orderedSelected.length}
                  onMove={(dir) => move(id, dir)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 3 — Perguntas conceituais
───────────────────────────────────────────── */
function Step3({
  qHardest, qText, hardestId, why, longText, selected, taskById, dispatch, invalidHardest, invalidText,
}: {
  qHardest: Question | undefined;
  qText: Question | undefined;
  hardestId: string | null;
  why: string;
  longText: string;
  selected: string[];
  taskById: Map<string, Task>;
  dispatch: React.Dispatch<Action>;
  invalidHardest: boolean;
  invalidText: boolean;
}) {
  return (
    <div className="wz-body">
      <h2 className="wz-title">Perguntas sobre o método</h2>
      <p className="wz-sub">Responda antes de montar os fluxos.</p>

      {/* 3.1 — hardest_critical */}
      {qHardest && (
        <motion.div className={`wz-q-block${invalidHardest ? " wz-invalid-pulse" : ""}`} {...ciapMotion.onboardingY8}>
          <div className="wz-q-label">{qHardest.title}</div>
          {qHardest.helpText && <p className="muted wz-q-help">{qHardest.helpText}</p>}
          <div className="wz-hardest-list">
            {selected.map((id) => {
              const t = taskById.get(id);
              if (!t) return null;
              return (
                <label key={id} className={`wz-hardest-opt${hardestId === id ? " on" : ""}`}>
                  <input
                    type="radio"
                    name="hardest"
                    checked={hardestId === id}
                    onChange={() => dispatch({ type: "SET_HARDEST", id })}
                  />
                  <span className="wz-hardest-text">{formatTaskLabel(t)}</span>
                </label>
              );
            })}
          </div>
          <div className="wz-q-sub-label" style={{ marginTop: 10 }}>Por que essa é a mais difícil?</div>
          <textarea
            className="wz-textarea"
            placeholder="Descreva as razões…"
            value={why}
            onChange={(e) => dispatch({ type: "SET_WHY", why: e.target.value })}
          />
        </motion.div>
      )}

      {/* 3.2 — text_long */}
      {qText && (
        <motion.div className={`wz-q-block${invalidText ? " wz-invalid-pulse" : ""}`} {...ciapMotion.onboardingY8} transition={{ delay: 0.08 }}>
          <div className="wz-q-label">{qText.title}</div>
          {qText.helpText && <p className="muted wz-q-help">{qText.helpText}</p>}
          <div className="wz-text-prompts">
            <span className="wz-prompt-tag">Objetivo geral</span>
            <span className="wz-prompt-tag">Objetivos específicos</span>
            <span className="wz-prompt-tag">Pessoas do serviço</span>
            <span className="wz-prompt-tag">Hipótese de ponto de partida</span>
          </div>
          <textarea
            className="wz-textarea"
            placeholder="Escreva livremente, abordando os tópicos acima…"
            value={longText}
            onChange={(e) => dispatch({ type: "SET_LONG_TEXT", text: e.target.value })}
            style={{ minHeight: 120 }}
          />
        </motion.div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 4 — Fluxos (top 5)
───────────────────────────────────────────── */
function Step4({
  top5, taskById, chains, skippedFlows, dispatch,
}: {
  top5: Task[];
  taskById: Map<string, Task>;
  chains: Record<string, ChainEntry[]>;
  skippedFlows: Set<string>;
  dispatch: React.Dispatch<Action>;
}) {
  const allTasks = Array.from(taskById.values());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [overlayTask, setOverlayTask] = useState<Task | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { type?: string; taskId?: string } | undefined;
    setOverlayTask(d?.type === "bank" && d.taskId ? (taskById.get(d.taskId) ?? null) : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setOverlayTask(null);
    const { active, over } = e;
    if (!over) return;
    const a = active.data.current as { type: "bank"; taskId: string } | { type: "sort"; criticalId: string; entryId: string } | undefined;
    const o = over.data.current as { type: "append"; criticalId: string } | { type: "sort"; criticalId: string; entryId: string } | undefined;

    if (a?.type === "bank") {
      const taskId = a.taskId;
      if (String(over.id).startsWith("append-")) {
        const critId = String(over.id).replace("append-", "");
        const cur = chains[critId] ?? [];
        dispatch({ type: "SET_CHAIN", critId, chain: [...cur, { id: uuid(), taskId }] });
        return;
      }
      if (o?.type === "sort") {
        const critId = o.criticalId;
        const cur = chains[critId] ?? [];
        const idx = cur.findIndex((x) => x.id === String(over.id));
        if (idx < 0) return;
        const next = [...cur];
        next.splice(idx, 0, { id: uuid(), taskId });
        dispatch({ type: "SET_CHAIN", critId, chain: next });
        return;
      }
    }

    if (a?.type === "sort") {
      const critId = a.criticalId;
      if (o?.type === "sort" && o.criticalId === critId) {
        dispatch({
          type: "SET_CHAIN", critId,
          chain: reorderChain(chains[critId] ?? [], String(active.id), String(over.id)),
        });
      }
    }
  };

  return (
    <div className="wz-body">
      <h2 className="wz-title">Monte os fluxos de tarefas</h2>
      <p className="wz-sub">Para cada crítica do Top 5, indique a sequência de passos necessários para realizá-la. Clique em + Adicionar ou arraste do banco.</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setOverlayTask(null)}>
        <div className="wz-flow-layout">
          {/* banco lateral */}
          <div className="wz-flow-bank-sticky">
            <div className="bank-wrap">
              <div className="bank-wrap-hd">
                <span className="label-sm">Banco de cards</span>
                <span className="badge">{allTasks.length}</span>
              </div>
              <p className="muted" style={{ margin: "4px 0 8px", fontSize: "var(--fs-xs)" }}>Clique em + ou arraste</p>
              <div className="bank wz-bank-compact">
                {allTasks.map((t, i) => (
                  <motion.div key={t.id} {...ciapMotion.projectCard} transition={ciapStagger(i, 0.02)}>
                    <BankDraggable task={t} />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* trilhas */}
          <div className="wz-flow-tracks">
            {top5.map((crit, i) => {
              const chain = chains[crit.id] ?? [];
              const skipped = skippedFlows.has(crit.id);
              return (
                <motion.div key={crit.id} className="wz-flow-track-wrap" {...ciapMotion.onboardingY12} transition={ciapStagger(i, 0.07)}>
                  <div className="wz-flow-track-hd">
                    <span className="wz-top5-star">{i + 1}.</span>
                    <span className="wz-flow-crit-name">{formatTaskLabel(crit)}</span>
                    <label className="wz-skip-label row-s" style={{ marginLeft: "auto" }}>
                      <input type="checkbox" checked={skipped} onChange={() => dispatch({ type: "TOGGLE_SKIP_FLOW", critId: crit.id })} />
                      <span style={{ fontSize: "var(--fs-xs)" }}>Pular</span>
                    </label>
                  </div>

                  {!skipped && (
                    <>
                      <FlowTrack
                        critical={crit}
                        taskById={taskById}
                        chain={chain}
                        onChange={(c) => dispatch({ type: "SET_CHAIN", critId: crit.id, chain: c })}
                      />
                      {/* botões "Adicionar" por clique */}
                      <div className="wz-add-bar">
                        {allTasks.slice(0, 8).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="wz-add-chip"
                            onClick={() => dispatch({ type: "SET_CHAIN", critId: crit.id, chain: [...chain, { id: uuid(), taskId: t.id }] })}
                            title={`Adicionar: ${t.verb} ${t.textoPrincipal}`}
                          >
                            + {formatTaskLabel(t)}
                          </button>
                        ))}
                        {allTasks.length > 8 && (
                          <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>…arraste do banco para ver mais</span>
                        )}
                      </div>
                    </>
                  )}
                  {skipped && <p className="muted" style={{ fontSize: "var(--fs-xs)", padding: "6px 0" }}>Fluxo pulado.</p>}
                </motion.div>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {overlayTask ? (
            <div style={{ width: 160, opacity: 0.92 }}>
              <TaskCard task={overlayTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 5 — Revisão e envio
───────────────────────────────────────────── */
function Step5({
  state, taskById, qHardest, qText, version,
  submitting, err, onSubmit,
}: {
  state: WizardState;
  taskById: Map<string, Task>;
  qHardest: Question | undefined;
  qText: Question | undefined;
  version: StudyVersion;
  submitting: boolean;
  err: string | null;
  onSubmit: () => void;
}) {
  const { orderedSelected, hardestId, why, longText, chains, skippedFlows } = state;
  const top5 = orderedSelected.slice(0, 5);
  const [showAllRank, setShowAllRank] = useState(false);
  const visibleRank = showAllRank ? orderedSelected : orderedSelected.slice(0, 10);

  return (
    <div className="wz-body">
      <h2 className="wz-title">Revise e envie</h2>
      <p className="wz-sub">Confirme antes de submeter. Versão: <strong>{version.number}</strong></p>

      {/* resumo seleção */}
      <div className="wz-review-block">
        <div className="wz-review-hd">
          <span>Tarefas críticas selecionadas</span>
          <span className="badge badge-y">{orderedSelected.length}</span>
        </div>
        <div className="wz-review-rank">
          {visibleRank.map((id, i) => {
            const t = taskById.get(id);
            const isTop = i < 5;
            return (
              <div key={id} className={`wz-review-rank-row${isTop ? " top5" : ""}`}>
                <span className="wz-rank-n">{i + 1}</span>
                {isTop && <span className="wz-top5-star">★</span>}
                <span className="wz-rank-text">{t?.verb} {t?.textoPrincipal}</span>
              </div>
            );
          })}
          {orderedSelected.length > 10 && (
            <button type="button" className="btn ghost" style={{ marginTop: 4 }} onClick={() => setShowAllRank((v) => !v)}>
              {showAllRank ? "Mostrar menos" : `+ ${orderedSelected.length - 10} mais`}
            </button>
          )}
        </div>
      </div>

      {/* top5 fluxos */}
      <div className="wz-review-block">
        <div className="wz-review-hd">Fluxos (Top 5)</div>
        {top5.map((id, i) => {
          const t = taskById.get(id);
          const chain = chains[id] ?? [];
          const skipped = skippedFlows.has(id);
          return (
            <div key={id} className="wz-review-flow">
              <span className="wz-top5-star">★{i + 1}</span>
              <span className="wz-rank-text">{formatTaskLabel(t)}</span>
              {skipped ? (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>— pulado</span>
              ) : chain.length === 0 ? (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>— nenhum passo</span>
              ) : (
                <div className="wz-review-chips">
                  {chain.map((e, si) => (
                    <span key={e.id} className="wz-chip">
                      {si + 1}. {formatTaskLabel(taskById.get(e.taskId))}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* respostas textuais */}
      {hardestId && (
        <div className="wz-review-block">
          <div className="wz-review-hd">{qHardest?.title ?? "Tarefa mais difícil"}</div>
          <p style={{ fontSize: "var(--fs-sm)", margin: 0 }}>
            <strong>{formatTaskLabel(taskById.get(hardestId))}</strong>
          </p>
          <p className="muted" style={{ fontSize: "var(--fs-sm)", margin: "4px 0 0" }}>{why}</p>
        </div>
      )}
      {longText && (
        <div className="wz-review-block">
          <div className="wz-review-hd">{qText?.title ?? "Dificuldades conceituais"}</div>
          <p style={{ fontSize: "var(--fs-sm)", margin: 0, whiteSpace: "pre-wrap" }}>{longText}</p>
        </div>
      )}

      {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn primary" disabled={submitting} onClick={onSubmit}>
          {submitting ? "Enviando…" : "Enviar respostas"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main ParticipantPage — Wizard
───────────────────────────────────────────── */
export function ParticipantPage() {
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [version, setVersion] = useState<StudyVersion | null>(null);
  const [state, dispatch] = useReducer(reducer, initState);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [invalidStep3, setInvalidStep3] = useState({ hardest: false, text: false });
  const [maxReached, setMaxReached] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setFetchErr(null);
    try {
      const data = await apiGet<VersionPayload>("/api/public/version");
      setVersion(data.version);
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : "Erro ao carregar");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    (version?.tasks ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [version]);

  const questions = version?.questions ?? [];
  const qSelect  = questions.find((q) => q.type === "critical_select");
  const qRank    = questions.find((q) => q.type === "critical_rank");
  const qHardest = questions.find((q) => q.type === "hardest_critical");
  const qText    = questions.find((q) => q.type === "text_long");
  const qFlow    = questions.find((q) => q.type === "flow_builder_per_critical");

  const top5Tasks = useMemo(
    () => state.orderedSelected.slice(0, 5).map((id) => taskById.get(id)).filter(Boolean) as Task[],
    [state.orderedSelected, taskById],
  );

  const goStep = (target: WizardState["step"]) => {
    setStepErr(null);
    if (state.step !== 3) setInvalidStep3({ hardest: false, text: false });

    if (target > state.step) {
      // validate current step
      if (state.step === 1 && state.selected.length === 0) {
        setStepErr("Selecione ao menos uma tarefa antes de avançar."); return;
      }
      if (state.step === 3) {
        let invalidHardest = false;
        let invalidText = false;
        if (qHardest && (!state.hardestId || !state.why.trim())) {
          invalidHardest = true;
        }
        if (qText && !state.longText.trim()) {
          invalidText = true;
        }
        if (invalidHardest || invalidText) {
          setInvalidStep3({ hardest: invalidHardest, text: invalidText });
          setStepErr("Preencha os campos obrigatórios destacados em vermelho.");
          return;
        }
      }
    }

    dispatch({ type: "SET_STEP", step: target });
    if (target > maxReached) setMaxReached(target);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    if (!version) return;
    setSubmitErr(null);

    const answers = [];

    if (qSelect) answers.push({ questionId: qSelect.id, criticalTaskIds: state.selected });
    if (qRank)   answers.push({ questionId: qRank.id, orderedCriticalTaskIds: state.orderedSelected });
    if (qHardest && state.hardestId) answers.push({ questionId: qHardest.id, taskId: state.hardestId, why: state.why });
    if (qText) answers.push({ questionId: qText.id, text: state.longText });
    if (qFlow) {
      const flows = top5Tasks
        .filter((t) => !state.skippedFlows.has(t.id))
        .map((t) => ({
          criticalTaskId: t.id,
          stepTaskIds: (state.chains[t.id] ?? []).map((e) => e.taskId),
        }));
      answers.push({ questionId: qFlow.id, flows });
    }

    setSubmitting(true);
    try {
      await apiSend("/api/public/responses", "POST", { studyVersionId: version.id, answers });
      setDone(true);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Falha ao enviar");
    } finally { setSubmitting(false); }
  };

  /* ── estados globais ── */
  if (loading) return (
    <motion.div className="page muted" {...ciapMotion.fade}>Carregando…</motion.div>
  );
  if (fetchErr) return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <p className="error">{fetchErr}</p>
    </motion.div>
  );
  if (!version) return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      <h1>Estudo indisponível</h1>
      <p className="muted">Ainda não há versão publicada. Acesse /admin para publicar.</p>
    </motion.div>
  );
  if (done) return (
    <motion.div className="page" style={{ maxWidth: 520 }} {...ciapMotion.celebrationCard}>
      <h1>Obrigado</h1>
      <p className="success">Respostas registradas com sucesso.</p>
    </motion.div>
  );

  return (
    <motion.div className="page wz-page" ref={topRef} {...ciapMotion.sectionFade}>
      {/* header */}
      <div className="wz-header">
        <h1 style={{ margin: 0, fontSize: "var(--fs-md)" }}>Dinâmica — Tarefas Críticas</h1>
        <Stepper step={state.step} maxReached={maxReached} />
      </div>

      {/* body com animação de troca */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {state.step === 1 && (
            <Step1 tasks={version.tasks} selected={state.selected} dispatch={dispatch} />
          )}
          {state.step === 2 && (
            <Step2 orderedSelected={state.orderedSelected} taskById={taskById} dispatch={dispatch} />
          )}
          {state.step === 3 && (
            <Step3
              qHardest={qHardest} qText={qText}
              hardestId={state.hardestId} why={state.why} longText={state.longText}
              selected={state.selected} taskById={taskById} dispatch={dispatch}
              invalidHardest={invalidStep3.hardest}
              invalidText={invalidStep3.text}
            />
          )}
          {state.step === 4 && (
            <Step4
              top5={top5Tasks} taskById={taskById}
              chains={state.chains} skippedFlows={state.skippedFlows} dispatch={dispatch}
            />
          )}
          {state.step === 5 && (
            <Step5
              state={state} taskById={taskById}
              qHardest={qHardest} qText={qText}
              version={version} submitting={submitting} err={submitErr}
              onSubmit={() => void submit()}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* footer nav */}
      <div className="wz-footer">
        {stepErr && <p className="error" style={{ margin: 0 }}>{stepErr}</p>}
        <div className="wz-nav">
          {state.step > 1 && (
            <button type="button" className="btn" onClick={() => goStep((state.step - 1) as WizardState["step"])}>
              ← Voltar
            </button>
          )}
          {state.step < 5 && (
            <button type="button" className="btn primary" onClick={() => goStep((state.step + 1) as WizardState["step"])}>
              {state.step === 4 ? "Revisar →" : "Avançar →"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
