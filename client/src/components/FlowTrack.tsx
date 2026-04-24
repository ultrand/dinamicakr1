import { Fragment, type CSSProperties } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";

export type ChainEntry = { id: string; taskId: string };

/* ── Bank card compact (draggable from the library) ─────── */
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
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="bank-card-compact">
      <span className="bc-verb">{(task.verb ?? "").toUpperCase()}</span>
      <span className="bc-text">{task.textoPrincipal}</span>
      {task.atividade && <span className="bc-meta">{task.atividade}</span>}
    </div>
  );
}

/* ── Append drop zone (bottom of vertical rail) ─────────── */
function AppendDrop({ criticalId }: { criticalId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `append-${criticalId}`,
    data: { type: "append" as const, criticalId },
  });
  return (
    <div ref={setNodeRef} className={`flow-drop-vert${isOver ? " over" : ""}`}>
      + solte aqui
    </div>
  );
}

/* ── One step in the vertical rail (sortable) ───────────── */
function SortableStep({
  entry,
  task,
  stepNum,
  criticalId,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  entry: ChainEntry;
  task: Task;
  stepNum: number;
  criticalId: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
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
    <div ref={setNodeRef} style={style} className="flow-step-vert">
      {/* drag handle */}
      <button
        type="button"
        className="fstep-drag"
        {...listeners}
        {...attributes}
        title="Arrastar para reordenar"
      >⠿</button>
      <span className="fstep-num">{stepNum}</span>
      <div className="fstep-body">
        <span className="fstep-verb">{(task.verb ?? "").toUpperCase()}</span>
        <span className="fstep-text">{task.textoPrincipal}</span>
        {task.etapa && <span className="fstep-meta">Etapa: {task.etapa}</span>}
      </div>
      <div className="fstep-actions" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn-icon" onClick={onMoveUp} disabled={isFirst} title="Subir">↑</button>
        <button type="button" className="btn-icon" onClick={onMoveDown} disabled={isLast} title="Descer">↓</button>
        <button type="button" className="btn-icon danger" onClick={onRemove} title="Remover">✕</button>
      </div>
    </div>
  );
}

/* ── Destination card (CHEGAR EM) ───────────────────────── */
export function FlowDestCard({ task }: { task: Task }) {
  return (
    <div className="flow-dest-card">
      <span className="flow-dest-label">CHEGAR EM</span>
      <div className="flow-dest-body">
        <span className="flow-dest-verb">{(task.verb ?? "").toUpperCase()}</span>
        <span className="flow-dest-text">{task.textoPrincipal}</span>
        {task.atividade && <span className="flow-dest-meta">{task.atividade}</span>}
      </div>
    </div>
  );
}

/* ── FlowTrack (vertical) ───────────────────────────────── */
type Props = {
  critical: Task;
  taskById: Map<string, Task>;
  chain: ChainEntry[];
  onChange: (next: ChainEntry[]) => void;
};

export function FlowTrack({ critical, taskById, chain, onChange }: Props) {
  const move = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= chain.length) return;
    onChange(arrayMove(chain, idx, ni));
  };

  return (
    <div className="flow-vert-block">
      <SortableContext
        id={critical.id}
        items={chain.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
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
                isFirst={idx === 0}
                isLast={idx === chain.length - 1}
                onRemove={() => onChange(chain.filter((c) => c.id !== entry.id))}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
              />
              <div className="flow-arrow-vert">↓</div>
            </Fragment>
          );
        })}
      </SortableContext>

      <AppendDrop criticalId={critical.id} />

      <div className="flow-arrow-vert flow-arrow-dest">↓</div>
      <FlowDestCard task={critical} />
    </div>
  );
}

export function reorderChain(chain: ChainEntry[], activeId: string, overId: string) {
  const oldIndex = chain.findIndex((c) => c.id === activeId);
  const newIndex = chain.findIndex((c) => c.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return chain;
  return arrayMove(chain, oldIndex, newIndex);
}
