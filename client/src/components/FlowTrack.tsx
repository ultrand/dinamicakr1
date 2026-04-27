import { Fragment, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

export type ChainEntry = { id: string; taskId: string };

/* ── Bank card compact (draggable from the library) ─────── */
export function BankDraggable({
  task,
  onClick,
  dimmed,
  activeFlowNumber,
  otherFlowNumbers,
}: {
  task: Task;
  onClick?: (task: Task) => void;
  dimmed?: boolean;
  activeFlowNumber?: number;
  otherFlowNumbers?: number[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bank-${task.id}`,
    data: { type: "bank" as const, taskId: task.id },
    disabled: !!dimmed,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.25 : 1,
    cursor: dimmed ? "not-allowed" : "grab",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bank-card-compact tc-compact-wrap${dimmed ? " is-dimmed" : ""}`}
      onClick={() => {
        if (!dimmed) onClick?.(task);
      }}
      onKeyDown={(e) => {
        if (dimmed) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(task);
        }
      }}
      role="button"
      tabIndex={dimmed ? -1 : 0}
      aria-disabled={dimmed ? "true" : "false"}
      aria-label={dimmed
        ? `${task.verb} ${task.textoPrincipal} já está no fluxo ativo`
        : `Adicionar ${task.verb} ${task.textoPrincipal} ao fluxo ativo`}
    >
      {!dimmed && (otherFlowNumbers?.length ?? 0) > 0 && (
        <div className="bank-card-flow-dots" aria-hidden="true">
          {otherFlowNumbers!.map((flowNum) => (
            <span key={flowNum} className="bank-card-flow-dot">#{flowNum}</span>
          ))}
        </div>
      )}
      {dimmed && typeof activeFlowNumber === "number" && (
        <span className="bank-card-used-tag">JA NO FLUXO #{activeFlowNumber}</span>
      )}
      <TaskCard task={task} />
    </div>
  );
}

/* ── Append drop zone (bottom of vertical rail) ─────────── */
function AppendDrop({ criticalId, isEmpty }: { criticalId: string; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `append-${criticalId}`,
    data: { type: "append" as const, criticalId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flow-drop-wrap${isOver ? " over" : ""}${isEmpty ? " empty" : " compact"}`}
      aria-label="Solte aqui para adicionar ao fim do fluxo"
      title="Solte aqui para adicionar ao fim do fluxo"
    >
      {isEmpty ? "+ solte aqui" : "+"}
    </div>
  );
}

/* ── One step in wrapped rail (sortable) ────────────────── */
function SortableStep({
  entry,
  task,
  stepNum,
  criticalId,
  onRemove,
}: {
  entry: ChainEntry;
  task: Task;
  stepNum: number;
  criticalId: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type: "sort" as const, criticalId, entryId: entry.id },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flow-step-wrap">
      <button
        type="button"
        className="flow-step-drag"
        title="Arraste o card para reordenar"
        aria-label="Arraste o card para reordenar"
      >⠿</button>
      <span className="flow-step-num-badge">{stepNum}</span>
      <div className="flow-step-card" {...listeners} {...attributes}>
        <TaskCard task={task} />
      </div>
      <div className="flow-step-actions" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn-icon danger" onClick={onRemove} title="Remover" aria-label="Remover passo do fluxo">✕</button>
      </div>
    </div>
  );
}

/* ── Destination card (CHEGAR EM) ───────────────────────── */
export function FlowDestCard({ task }: { task: Task }) {
  return (
    <div className="flow-dest-card">
      <span className="flow-dest-bullseye">◎</span>
      <div className="flow-dest-body">
        <span className="flow-dest-label">CHEGAR EM</span>
        <span className="flow-dest-verb">{(task.verb ?? "").toUpperCase()}</span>
        <span className="flow-dest-text">{task.textoPrincipal}</span>
        {task.atividade && <span className="flow-dest-meta">{task.atividade}</span>}
      </div>
    </div>
  );
}

/* ── FlowTrack (wrap horizontal, sem scroll) ────────────── */
type Props = {
  critical: Task;
  taskById: Map<string, Task>;
  chain: ChainEntry[];
  isActive?: boolean;
  onChange: (next: ChainEntry[]) => void;
};

export function FlowTrack({ critical, taskById, chain, isActive, onChange }: Props) {
  return (
    <div className="flow-wrap-block">
      <SortableContext
        id={critical.id}
        items={chain.map((c) => c.id)}
        strategy={rectSortingStrategy}
      >
        <div className={`flow-rail-wrap${isActive ? " active" : ""}`}>
          {chain.map((entry, idx) => {
          const t = taskById.get(entry.taskId);
          if (!t) return null;
          return (
            <Fragment key={entry.id}>
              <SortableStep
                entry={entry}
                task={t}
                stepNum={idx + 1}
                criticalId={critical.id}
                onRemove={() => onChange(chain.filter((c) => c.id !== entry.id))}
              />
              <span className="flow-arrow-inline">→</span>
            </Fragment>
          );
          })}

          <AppendDrop criticalId={critical.id} isEmpty={chain.length === 0} />
          <span className={`flow-arrow-inline flow-arrow-dest${isActive ? " flow-arrow-animated" : ""}`}>→</span>
          <FlowDestCard task={critical} />
        </div>
      </SortableContext>
    </div>
  );
}

export function reorderChain(chain: ChainEntry[], activeId: string, overId: string) {
  const oldIndex = chain.findIndex((c) => c.id === activeId);
  const newIndex = chain.findIndex((c) => c.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return chain;
  return arrayMove(chain, oldIndex, newIndex);
}
