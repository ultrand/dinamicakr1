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
import { TaskHoverTip } from "../components/TaskHoverTip";
import type { Question, StudyVersion, Task } from "../types";
import { parseDynamicSettings, findTaskByPromptLabel, metodoDifficultyPromptLabels, METODO_TEXT_LONG_HELP, promptLineMarker, templateForStage, validatePromptLongText, type DynamicSettings } from "../lib/dynamicSettings";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type VersionPayload = { studyId: string; version: StudyVersion | null };

function countSelectedInEtapa(tasks: Task[], selected: string[], etapa: string) {
  return tasks.filter((t) => (t.etapa || "Sem etapa") === etapa && selected.includes(t.id)).length;
}

function validateSelectionLimits(
  tasks: Task[],
  selected: string[],
  settings: DynamicSettings,
): string | null {
  if (selected.length < settings.minCriticalSelected) {
    return `Selecione ao menos ${settings.minCriticalSelected} tarefa(s) antes de avançar.`;
  }
  if (settings.maxCriticalSelected != null && selected.length > settings.maxCriticalSelected) {
    return `Selecione no máximo ${settings.maxCriticalSelected} tarefa(s) no total neste passo.`;
  }
  if (settings.maxCriticalPerGroup != null) {
    const byEtapa = new Map<string, number>();
    for (const id of selected) {
      const t = tasks.find((x) => x.id === id);
      const k = t?.etapa || "Sem etapa";
      byEtapa.set(k, (byEtapa.get(k) ?? 0) + 1);
      if (byEtapa.get(k)! > settings.maxCriticalPerGroup) {
        return `Selecione no máximo ${settings.maxCriticalPerGroup} tarefa(s) por grupo (${k}).`;
      }
    }
  }
  return null;
}

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
  selected: string[];
  orderedSelected: string[];
  hardestId: string | null;
  why: string;
  longText: string;
  chains: Record<string, ChainEntry[]>;
  flowComments: Record<string, string>;
  visibleFlowCount: number;               // quantos fluxos estão visíveis (1-5)
};

type Action =
  | { type: "SET_STEP"; step: WizardState["step"] }
  | { type: "TOGGLE_SELECT"; id: string }
  | { type: "SET_ORDERED"; ids: string[] }
  | { type: "SET_HARDEST"; id: string | null }
  | { type: "SET_WHY"; why: string }
  | { type: "SET_LONG_TEXT"; text: string }
  | { type: "SET_CHAIN"; critId: string; chain: ChainEntry[] }
  | { type: "SET_FLOW_COMMENT"; critId: string; comment: string }
  | { type: "ADD_NEXT_FLOW" };

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
    case "SET_FLOW_COMMENT":
      return { ...s, flowComments: { ...s.flowComments, [a.critId]: a.comment } };
    case "ADD_NEXT_FLOW":
      return { ...s, visibleFlowCount: Math.min(s.visibleFlowCount + 1, 5) };
    default: return s;
  }
}

const initState: WizardState = {
  step: 1, selected: [], orderedSelected: [],
  hardestId: null, why: "", longText: "",
  chains: {}, flowComments: {}, visibleFlowCount: 1,
};

/* ─────────────────────────────────────────────
   Stepper header
───────────────────────────────────────────── */
function Stepper({ step, maxReached, labels }: { step: number; maxReached: number; labels: DynamicSettings["stepLabels"] }) {
  const steps = labels.map((label, i) => ({ n: (i + 1) as 1 | 2 | 3 | 4 | 5, label }));
  return (
    <div className="wz-stepper" role="list">
      {steps.map(({ n, label }, i) => {
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

function StepIntro({
  title,
  sub,
  aside,
  hint,
}: {
  title: string;
  sub: string;
  aside?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="wz-section-hd">
      <div className="wz-section-intro">
        <h2 className="wz-title">{title}</h2>
        {sub ? <p className="wz-sub">{sub}</p> : null}
        {hint ? <p className="wz-hint">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PASSO 1 — Seleção por etapa (accordion)
───────────────────────────────────────────── */
function Step1({
  tasks, selected, dispatch, title, sub, maxPerGroup, maxTotal,
}: {
  tasks: Task[];
  selected: string[];
  dispatch: React.Dispatch<Action>;
  title: string;
  sub: string;
  maxPerGroup: number | null;
  maxTotal: number | null;
}) {
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

  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [limitFlash, setLimitFlash] = useState(false);
  const limitBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!limitMsg) return;
    const t = window.setTimeout(() => setLimitMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [limitMsg]);

  const showLimitFeedback = (message: string) => {
    setLimitMsg(message);
    setLimitFlash(true);
    window.setTimeout(() => setLimitFlash(false), 700);
    limitBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const toggle = (k: string) =>
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const trySelect = (t: Task) => {
    if (selected.includes(t.id)) {
      setLimitMsg(null);
      dispatch({ type: "TOGGLE_SELECT", id: t.id });
      return;
    }
    if (maxTotal != null && selected.length >= maxTotal) {
      showLimitFeedback(`Limite de ${maxTotal} tarefas atingido. Desmarque uma para selecionar outra.`);
      return;
    }
    if (maxPerGroup != null) {
      const etapa = t.etapa || "Sem etapa";
      const n = countSelectedInEtapa(tasks, selected, etapa);
      if (n >= maxPerGroup) {
        showLimitFeedback(`Limite de ${maxPerGroup} tarefa(s) por grupo (${etapa}). Desmarque uma para trocar.`);
        return;
      }
    }
    setLimitMsg(null);
    dispatch({ type: "TOGGLE_SELECT", id: t.id });
  };

  return (
    <div className="wz-body">
      <StepIntro
        title={title}
        sub={sub}
        aside={
          <div className="wz-counter-pill">
            {maxTotal != null
              ? `${selected.length} / ${maxTotal} selecionada${selected.length !== 1 ? "s" : ""}`
              : `${selected.length} selecionada${selected.length !== 1 ? "s" : ""}`}
            {maxPerGroup != null && maxTotal == null && (
              <span className="muted"> · máx. {maxPerGroup}/grupo</span>
            )}
          </div>
        }
      />

      {limitMsg && (
        <div
          ref={limitBannerRef}
          className={`wz-limit-banner on${limitFlash ? " flash" : ""}`}
          role="alert"
          aria-live="assertive"
        >
          <span className="wz-limit-banner-icon" aria-hidden="true">!</span>
          <span>{limitMsg}</span>
        </div>
      )}

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
                    <span className="badge badge-y">
                      {selCount} sel.{maxPerGroup != null ? ` / ${maxPerGroup}` : ""}
                    </span>
                  )}
                </span>
                {/* mini chips quando fechado */}
                {!isOpen && selCount > 0 && (
                  <span className="wz-accord-chips">
                    {etapaTasks.filter((t) => selected.includes(t.id)).map((t) => (
                      <TaskHoverTip key={t.id} task={t} className="wz-chip">{formatTaskLabel(t)}</TaskHoverTip>
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
                          onClick={() => trySelect(t)}
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
        <TaskHoverTip task={task}>
          <span className="wz-rank-text">{formatTaskLabel(task)}</span>
        </TaskHoverTip>
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
  orderedSelected, taskById, dispatch, title, sub,
}: { orderedSelected: string[]; taskById: Map<string, Task>; dispatch: React.Dispatch<Action>; title: string; sub: string }) {
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
      <StepIntro title={title} sub={sub} />

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
const ESCOPO_TEXT_PROMPTS = [
  "Objetivo geral",
  "Objetivos específicos",
  "Pessoas do serviço",
  "Hipótese de ponto de partida",
] as const;

function buildPromptLine(label: string) {
  return `${promptLineMarker(label)} `;
}

function PromptChip({
  label, task, used, onInsert,
}: {
  label: string;
  task?: Task;
  used: boolean;
  onInsert: (label: string) => void;
}) {
  const chip = (
    <button
      type="button"
      className={`wz-prompt-tag wz-prompt-tag-btn${used ? " used" : ""}`}
      onClick={() => onInsert(label)}
      aria-pressed={used}
    >
      {label}
    </button>
  );

  if (!task) return chip;
  return <TaskHoverTip task={task}>{chip}</TaskHoverTip>;
}

function Step3({
  qHardest, qText, hardestId, why, longText, orderedSelected, taskById, dispatch, invalidHardest, invalidText, title, sub, researchStage,
}: {
  qHardest: Question | undefined;
  qText: Question | undefined;
  hardestId: string | null;
  why: string;
  longText: string;
  orderedSelected: string[];
  taskById: Map<string, Task>;
  dispatch: React.Dispatch<Action>;
  invalidHardest: boolean;
  invalidText: boolean;
  title: string;
  sub: string;
  researchStage: "escopo" | "metodo";
}) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const metodoPromptLabels = useMemo(
    () => (researchStage === "metodo" ? metodoDifficultyPromptLabels(taskById, hardestId) : []),
    [researchStage, taskById, hardestId],
  );

  const insertPromptLine = (label: string) => {
    const line = buildPromptLine(label);
    const marker = promptLineMarker(label);
    const ta = textAreaRef.current;

    if (longText.includes(marker)) {
      const idx = longText.indexOf(marker);
      const cursor = idx + line.length;
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(cursor, cursor);
      });
      return;
    }

    const needsBreak = longText.length > 0 && !longText.endsWith("\n");
    const prefix = needsBreak ? "\n" : "";
    const next = longText + prefix + line;

    dispatch({ type: "SET_LONG_TEXT", text: next });
    requestAnimationFrame(() => {
      ta?.focus();
      const cursor = next.length;
      ta?.setSelectionRange(cursor, cursor);
    });
  };

  const textPlaceholder =
    researchStage === "metodo" && !metodoPromptLabels.length
      ? "A tarefa mais difícil já foi comentada acima — não há outras nesta lista para repetir aqui."
      : "Escreva livremente, abordando as tarefas acima…";

  const textLongHelp =
    researchStage === "metodo" ? METODO_TEXT_LONG_HELP : qText?.helpText;

  return (
    <div className="wz-body">
      <StepIntro title={title} sub={sub} />

      {/* 3.1 — hardest_critical */}
      {qHardest && (
        <motion.div className={`wz-q-block${invalidHardest ? " wz-invalid-pulse" : ""}`} {...ciapMotion.onboardingY8}>
          <div className="wz-q-label">{qHardest.title}</div>
          {qHardest.helpText && <p className="muted wz-q-help">{qHardest.helpText}</p>}
          <div className="wz-hardest-list">
            {orderedSelected.map((id) => {
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
                  <TaskHoverTip task={t} className="wz-hardest-text">{formatTaskLabel(t)}</TaskHoverTip>
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
          {textLongHelp && (researchStage !== "metodo" || metodoPromptLabels.length > 0) && (
            <p className="muted wz-q-help">{textLongHelp}</p>
          )}
          {researchStage === "metodo" ? (
            metodoPromptLabels.length > 0 ? (
              <>
                <div className="wz-text-prompts">
                  {metodoPromptLabels.map((label) => (
                    <PromptChip
                      key={label}
                      label={label}
                      task={findTaskByPromptLabel(taskById, label) as Task | undefined}
                      used={longText.includes(promptLineMarker(label))}
                      onInsert={insertPromptLine}
                    />
                  ))}
                </div>
                <p className="muted wz-q-help wz-prompt-click-hint">
                  Clique em um chip, se desejar, para copiar o nome da tarefa no campo abaixo.
                </p>
              </>
            ) : (
              <p className="wz-hint" style={{ marginBottom: "var(--ciap-space-2)" }}>
                A tarefa mais difícil já foi comentada acima — não há outras nesta lista para repetir aqui.
              </p>
            )
          ) : (
            <>
              <div className="wz-text-prompts">
                {ESCOPO_TEXT_PROMPTS.map((label) => (
                  <PromptChip
                    key={label}
                    label={label}
                    used={longText.includes(promptLineMarker(label))}
                    onInsert={insertPromptLine}
                  />
                ))}
              </div>
              <p className="muted wz-q-help wz-prompt-click-hint">
                Clique em um chip, se desejar, para copiar o tópico no campo abaixo.
              </p>
            </>
          )}
          <textarea
            ref={textAreaRef}
            className="wz-textarea"
            placeholder={textPlaceholder}
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
   PASSO 4 — Fluxos (progressivo, top 1-5)
───────────────────────────────────────────── */
function Step4({
  top5, taskById, chains, flowComments, visibleFlowCount, dispatch, title, sub, minFilledFlows,
}: {
  top5: Task[];
  taskById: Map<string, Task>;
  chains: Record<string, ChainEntry[]>;
  flowComments: Record<string, string>;
  visibleFlowCount: number;
  dispatch: React.Dispatch<Action>;
  title: string;
  sub: string;
  minFilledFlows: number;
}) {
  const allTasks = Array.from(taskById.values());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [overlayTask, setOverlayTask] = useState<Task | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [activeCritId, setActiveCritId] = useState<string>("");
  const [flashCritId, setFlashCritId] = useState<string>("");
  const [dupToastCritId, setDupToastCritId] = useState<string>("");

  useEffect(() => {
    const nodes = document.querySelectorAll(".wz-quick-add");
    nodes.forEach((node) => node.remove());
  }, []);

  const visibleTop5 = top5.slice(0, visibleFlowCount);
  useEffect(() => {
    if (!visibleTop5.length) return;
    if (!activeCritId || !visibleTop5.some((t) => t.id === activeCritId)) {
      setActiveCritId(visibleTop5[0]!.id);
    }
  }, [visibleTop5, activeCritId]);

  const addToFlow = (critId: string, taskId: string) => {
    const cur = chains[critId] ?? [];
    if (cur.some((e) => e.taskId === taskId)) {
      setDupToastCritId(critId);
      window.setTimeout(() => setDupToastCritId(""), 2200);
      return;
    }
    dispatch({ type: "SET_CHAIN", critId, chain: [...cur, { id: uuid(), taskId }] });
    setFlashCritId(critId);
    window.setTimeout(() => setFlashCritId((x) => (x === critId ? "" : x)), 700);
  };

  const filteredBank = bankSearch
    ? allTasks.filter((t) =>
        `${t.verb} ${t.textoPrincipal} ${t.atividade} ${t.etapa}`
          .toLowerCase()
          .includes(bankSearch.toLowerCase()),
      )
    : allTasks;
  const activeFlowNumber = Math.max(1, visibleTop5.findIndex((t) => t.id === activeCritId) + 1);
  const activeChainTaskIds = new Set((chains[activeCritId] ?? []).map((entry) => entry.taskId));
  const taskOtherFlowNumbers = new Map<string, number[]>();
  visibleTop5.forEach((crit, idx) => {
    if (crit.id === activeCritId) return;
    const flowNumber = idx + 1;
    const uniqueTaskIds = new Set((chains[crit.id] ?? []).map((entry) => entry.taskId));
    uniqueTaskIds.forEach((taskId) => {
      const prev = taskOtherFlowNumbers.get(taskId) ?? [];
      prev.push(flowNumber);
      taskOtherFlowNumbers.set(taskId, prev);
    });
  });

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
        addToFlow(critId, taskId);
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
        setFlashCritId(critId);
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
      <StepIntro
        title={title}
        sub={sub}
        hint={`Ao menos ${minFilledFlows} fluxo(s) deve(m) ser preenchido(s).`}
        aside={
          <div className="wz-counter-pill">{visibleFlowCount} de {Math.min(top5.length, 5)}</div>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setOverlayTask(null)}
      >
        <div className="wz-flow-layout">

          {/* ── banco lateral ── */}
          <div className="wz-flow-bank-sticky">
            <div className="bank-wrap">
              <div className="bank-wrap-hd">
                <span className="label-sm">Banco de cards</span>
                <span className="badge">{allTasks.length}</span>
              </div>
              <input
                type="search"
                className="bank-search"
                placeholder="Buscar…"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
              />
              <div className="bank wz-bank-2col">
                {filteredBank.map((t) => (
                  <BankDraggable
                    key={t.id}
                    task={t}
                    dimmed={activeChainTaskIds.has(t.id)}
                    activeFlowNumber={activeFlowNumber}
                    otherFlowNumbers={taskOtherFlowNumbers.get(t.id)}
                    onClick={() => activeCritId && addToFlow(activeCritId, t.id)}
                  />
                ))}
                {filteredBank.length === 0 && (
                  <p className="muted" style={{ fontSize: "var(--fs-xs)", gridColumn: "1/-1" }}>Nenhum card.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── trilhas progressivas ── */}
          <div className="wz-flow-tracks">
            {visibleTop5.map((crit, i) => {
              const chain = chains[crit.id] ?? [];
              const comment = flowComments[crit.id] ?? "";
              return (
                <motion.div
                  key={crit.id}
                  className={`wz-flow-track-wrap${activeCritId === crit.id ? " active" : ""}${flashCritId === crit.id ? " flash" : ""}${dupToastCritId === crit.id ? " dup-shake" : ""}`}
                  onClick={() => setActiveCritId(crit.id)}
                  onPointerDown={() => setActiveCritId(crit.id)}
                  {...ciapMotion.onboardingY12}
                  transition={ciapStagger(i, 0.07)}
                >
                  <div className="wz-flow-track-hd">
                    <span className="wz-flow-rank-badge">#{i + 1}</span>
                    <TaskHoverTip task={crit}>
                      <span className="wz-flow-crit-name">{formatTaskLabel(crit)}</span>
                    </TaskHoverTip>
                    {crit.etapa && <span className="wz-flow-etapa">{crit.etapa}</span>}
                  </div>

                  <FlowTrack
                    critical={crit}
                    taskById={taskById}
                    chain={chain}
                    isActive={activeCritId === crit.id}
                    onChange={(c) => dispatch({ type: "SET_CHAIN", critId: crit.id, chain: c })}
                  />

                  {/* toast duplicata */}
                  <AnimatePresence>
                    {dupToastCritId === crit.id && (
                      <motion.div
                        className="wz-dup-toast"
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18 }}
                      >
                        Card já está neste fluxo
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* campo comentário */}
                  <div className="wz-flow-comment">
                    <label className="label-sm">
                      Comentário sobre este fluxo
                      <span className="muted" style={{ fontWeight: 400 }}> — dificuldades, tarefas faltantes, raciocínio (opcional)</span>
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => dispatch({ type: "SET_FLOW_COMMENT", critId: crit.id, comment: e.target.value })}
                      rows={2}
                      placeholder="Ex: Achei difícil conectar com a etapa X…"
                    />
                  </div>
                </motion.div>
              );
            })}

            {/* botão adicionar próximo fluxo */}
            {visibleFlowCount < Math.min(top5.length, 5) && (
              <motion.div {...ciapMotion.nudgeY}>
                <button
                  type="button"
                  className="btn wz-add-next-flow"
                  onClick={() => {
                    const nextCrit = top5[visibleFlowCount];
                    dispatch({ type: "ADD_NEXT_FLOW" });
                    if (nextCrit?.id) setActiveCritId(nextCrit.id);
                  }}
                >
                  + Montar próximo fluxo (#{visibleFlowCount + 1} — opcional)
                </button>
              </motion.div>
            )}
          </div>
        </div>

        <DragOverlay>
          {overlayTask ? (
            <div className="bank-card-compact tc-compact-wrap drag-overlay" style={{ width: 170 }}>
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
  submitting, err, onSubmit, title, sub,   participantName, onParticipantNameChange, reviewSelectedLabel,
}: {
  state: WizardState;
  taskById: Map<string, Task>;
  qHardest: Question | undefined;
  qText: Question | undefined;
  version: StudyVersion;
  submitting: boolean;
  err: string | null;
  onSubmit: () => void;
  title: string;
  sub: string;
  participantName: string;
  onParticipantNameChange: (name: string) => void;
  reviewSelectedLabel: string;
}) {
  const { orderedSelected, hardestId, why, longText, chains, flowComments, visibleFlowCount } = state;
  const top5 = orderedSelected.slice(0, visibleFlowCount);
  const [showAllRank, setShowAllRank] = useState(false);
  const visibleRank = showAllRank ? orderedSelected : orderedSelected.slice(0, 10);

  return (
    <div className="wz-body">
      <StepIntro title={title} sub={sub} hint={`Versão ${version.number}`} />

      {/* resumo seleção */}
      <div className="wz-review-block">
        <div className="wz-review-hd">
          <span>{reviewSelectedLabel}</span>
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
                <TaskHoverTip task={t}>
                  <span className="wz-rank-text">{t?.verb} {t?.textoPrincipal}</span>
                </TaskHoverTip>
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
          const comment = flowComments[id] ?? "";
          return (
            <div key={id} className="wz-review-flow">
              <div className="wz-review-flow-hd">
                <span className="wz-flow-rank-badge">#{i + 1}</span>
                <TaskHoverTip task={t}>
                  <span className="wz-rank-text">{formatTaskLabel(t)}</span>
                </TaskHoverTip>
              </div>
              {chain.length === 0 ? (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>— nenhum passo adicionado</span>
              ) : (
                <div className="wz-review-chips">
                  {chain.map((e, si) => {
                    const stepTask = taskById.get(e.taskId);
                    return (
                      <TaskHoverTip key={e.id} task={stepTask} className="wz-chip">
                        {si + 1}. {formatTaskLabel(stepTask)}
                      </TaskHoverTip>
                    );
                  })}
                </div>
              )}
              {comment && (
                <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4, fontStyle: "italic" }}>
                  "{comment}"
                </p>
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
            <TaskHoverTip task={taskById.get(hardestId)}>
              <strong>{formatTaskLabel(taskById.get(hardestId))}</strong>
            </TaskHoverTip>
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

      <div className="wz-review-block">
        <div className="wz-review-hd">Identificação opcional</div>
        <label>
          Nome (opcional)
          <input
            type="text"
            placeholder="Ex.: Maria S."
            value={participantName}
            onChange={(e) => onParticipantNameChange(e.target.value)}
            maxLength={120}
          />
        </label>
        <p className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: 0 }}>
          Se preencher, o nome aparecerá na análise junto do horário da resposta.
        </p>
      </div>

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
  const [participantName, setParticipantName] = useState("");
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
  const dynamicSettings = useMemo(() => parseDynamicSettings(version?.settingsJson), [version?.settingsJson]);

  const top5Tasks = useMemo(
    () => state.orderedSelected.slice(0, 5).map((id) => taskById.get(id)).filter(Boolean) as Task[],
    [state.orderedSelected, taskById],
  );

  const goStep = (target: WizardState["step"]) => {
    setStepErr(null);
    if (state.step !== 3) setInvalidStep3({ hardest: false, text: false });

    if (target > state.step) {
      // validate current step
      if (state.step === 1) {
        const selErr = validateSelectionLimits(version?.tasks ?? [], state.selected, dynamicSettings);
        if (selErr) { setStepErr(selErr); return; }
      }
      if (state.step === 3) {
        let invalidHardest = false;
        let invalidText = false;
        if (qHardest?.required && (!state.hardestId || !state.why.trim())) invalidHardest = true;
        if (qText?.required) {
          const promptLabels =
            dynamicSettings.researchStage === "metodo"
              ? metodoDifficultyPromptLabels(taskById, state.hardestId)
              : [...ESCOPO_TEXT_PROMPTS];
          if (promptLabels.length === 0 && dynamicSettings.researchStage === "metodo") {
            // Só a mais difícil se aplica — campo de baixo fica vazio de chips.
          } else if (!validatePromptLongText(state.longText, promptLabels)) {
            invalidText = true;
          }
        }
        if (invalidHardest || invalidText) {
          setInvalidStep3({ hardest: invalidHardest, text: invalidText });
          setStepErr(
            invalidText && state.longText.trim()
              ? "Complete a explicação de cada tarefa — não basta só o nome inserido pelo chip."
              : "Preencha os campos obrigatórios destacados em vermelho.",
          );
          return;
        }
      }
      if (state.step === 4) {
        const visibleIds = state.orderedSelected.slice(0, state.visibleFlowCount);
        const filledCount = visibleIds.filter((id) => (state.chains[id] ?? []).length > 0).length;
        if (filledCount < dynamicSettings.minFilledFlows) {
          setStepErr(`Preencha ao menos ${dynamicSettings.minFilledFlows} fluxo(s) antes de avançar.`);
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
      const visibleTop5 = top5Tasks.slice(0, state.visibleFlowCount);
      const flows = visibleTop5.map((t) => ({
        criticalTaskId: t.id,
        stepTaskIds: (state.chains[t.id] ?? []).map((e) => e.taskId),
        comment: (state.flowComments[t.id] ?? "").trim(),
      }));
      answers.push({ questionId: qFlow.id, flows });
    }

    setSubmitting(true);
    try {
      await apiSend("/api/public/responses", "POST", {
        studyVersionId: version.id,
        answers,
        /** Sempre envia a ordem do passo 2 — o servidor grava em CriticalRank mesmo sem pergunta critical_rank. */
        orderedCriticalTaskIds: state.orderedSelected,
        participantName: participantName.trim(),
      });
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
        <h1 style={{ margin: 0, fontSize: "var(--fs-md)" }}>{dynamicSettings.pageTitle}</h1>
        <Stepper step={state.step} maxReached={maxReached} labels={dynamicSettings.stepLabels} />
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
            <Step1
              tasks={version.tasks}
              selected={state.selected}
              dispatch={dispatch}
              title={dynamicSettings.step1Title}
              sub={dynamicSettings.step1Sub}
              maxPerGroup={dynamicSettings.maxCriticalPerGroup}
              maxTotal={dynamicSettings.maxCriticalSelected}
            />
          )}
          {state.step === 2 && (
            <Step2 orderedSelected={state.orderedSelected} taskById={taskById} dispatch={dispatch} title={dynamicSettings.step2Title} sub={dynamicSettings.step2Sub} />
          )}
          {state.step === 3 && (
            <Step3
              qHardest={qHardest} qText={qText}
              hardestId={state.hardestId} why={state.why} longText={state.longText}
              orderedSelected={state.orderedSelected} taskById={taskById} dispatch={dispatch}
              invalidHardest={invalidStep3.hardest}
              invalidText={invalidStep3.text}
              title={dynamicSettings.step3Title}
              sub={templateForStage(dynamicSettings.researchStage).step3Sub}
              researchStage={dynamicSettings.researchStage}
            />
          )}
          {state.step === 4 && (
            <Step4
              top5={top5Tasks} taskById={taskById}
              chains={state.chains}
              flowComments={state.flowComments}
              visibleFlowCount={state.visibleFlowCount}
              dispatch={dispatch}
              title={dynamicSettings.step4Title}
              sub={dynamicSettings.step4Sub}
              minFilledFlows={dynamicSettings.minFilledFlows}
            />
          )}
          {state.step === 5 && (
            <Step5
              state={state} taskById={taskById}
              qHardest={qHardest} qText={qText}
              version={version} submitting={submitting} err={submitErr}
              onSubmit={() => void submit()}
              title={dynamicSettings.step5Title}
              sub={dynamicSettings.step5Sub}
              participantName={participantName}
              onParticipantNameChange={setParticipantName}
              reviewSelectedLabel={dynamicSettings.reviewSelectedLabel}
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
