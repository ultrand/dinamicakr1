import { Fragment, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

export type ChainEntry = { id: string; taskId: string };

/* ── Bank card (draggable from the library) ─────────────── */
export function BankDraggable({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bank-${task.id}`,
    data: { type: "bank" as const, taskId: task.id },
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.25 : 1,
    cursor: "grab",
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} />
    </div>
  );
}

/* ── Append drop zone (end of rail) ─────────────────────── */
function AppendDrop({ criticalId }: { criticalId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `append-${criticalId}`,
    data: { type: "append" as const, criticalId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flow-drop${isOver ? " over" : ""}`}
    >
      + solte aqui
    </div>
  );
}

/* ── One step in the rail (sortable) ────────────────────── */
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
    <div ref={setNodeRef} style={style} className="flow-step drag-handle" {...listeners} {...attributes}>
      <span className="flow-step-num">{stepNum}</span>
      <button
        type="button"
        className="btn-icon"
        aria-label="Remover"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        ✕
      </button>
      <TaskCard task={task} />
    </div>
  );
}

/* ── FlowTrack ──────────────────────────────────────────── */
type Props = {
  critical: Task;
  taskById: Map<string, Task>;
  chain: ChainEntry[];
  onChange: (next: ChainEntry[]) => void;
};

export function FlowTrack({ critical, taskById, chain, onChange }: Props) {
  return (
    <div className="flow-block">
      <div className="flow-hd">
        <span className="flow-hd-title">Fluxo →</span>
        <span className="flow-hd-crit">{critical.textoPrincipal || critical.verb}</span>
        <span className="flow-hd-count">{chain.length} passo{chain.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flow-rail">
        {chain.length > 0 ? (
          <SortableContext
            id={critical.id}
            items={chain.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {chain.map((entry, idx) => {
              const t = taskById.get(entry.taskId);
              if (!t) return null;
              return (
                <Fragment key={entry.id}>
                  {idx > 0 && <span className="flow-arrow">→</span>}
                  <SortableStep
                    entry={entry}
                    task={t}
                    stepNum={idx + 1}
                    criticalId={critical.id}
                    onRemove={() => onChange(chain.filter((c) => c.id !== entry.id))}
                  />
                </Fragment>
              );
            })}
          </SortableContext>
        ) : null}

        {chain.length > 0 && <span className="flow-arrow">→</span>}
        <AppendDrop criticalId={critical.id} />
        <span className="flow-arrow">→</span>

        <div className="flow-target">
          <span className="flow-target-label">Chegar em</span>
          <span className="flow-target-name">{critical.verb} {critical.textoPrincipal}</span>
        </div>
      </div>
    </div>
  );
}

export function reorderChain(chain: ChainEntry[], activeId: string, overId: string) {
  const oldIndex = chain.findIndex((c) => c.id === activeId);
  const newIndex = chain.findIndex((c) => c.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return chain;
  return arrayMove(chain, oldIndex, newIndex);
}
