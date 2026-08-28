import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";
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

type ConnectorPath = { id: string; d: string; isDest: boolean };

type Box = { left: number; right: number; top: number; bottom: number; cx: number; cy: number };

function toBox(rect: DOMRect, container: DOMRect): Box {
  const left = rect.left - container.left;
  const top = rect.top - container.top;
  return {
    left,
    top,
    right: rect.right - container.left,
    bottom: rect.bottom - container.top,
    cx: left + rect.width / 2,
    cy: top + rect.height / 2,
  };
}

/** Mesma linha: horizontal no vão. Quebra: só no gutter entre fileiras (nunca sobre o card). */
function buildConnectorPath(fromRect: DOMRect, toRect: DOMRect, containerRect: DOMRect): string {
  const a = toBox(fromRect, containerRect);
  const b = toBox(toRect, containerRect);
  const rowTol = 10;
  const sameRow = Math.abs(a.top - b.top) <= rowTol && b.left > a.right + 1;

  if (sameRow) {
    const y = (a.cy + b.cy) / 2;
    return `M ${a.right + 2} ${y} L ${b.left - 3} ${y}`;
  }

  if (b.top >= a.bottom - rowTol) {
    const sx = a.cx;
    const sy = a.bottom;
    const ex = b.cx;
    const enterY = b.top + 2;
    let midY = (a.bottom + b.top) / 2;
    if (b.top <= a.bottom) midY = a.bottom + 8;
    else midY = Math.max(a.bottom + 4, Math.min(b.top - 4, midY));
    if (Math.abs(sx - ex) < 16) {
      return `M ${sx} ${sy} L ${ex} ${enterY}`;
    }
    return `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${enterY}`;
  }

  /* Mesma fileira visual, tops levemente desalinhados */
  if (b.left > a.right + 1 && Math.abs(a.top - b.top) <= rowTol * 2) {
    const y = (a.cy + b.cy) / 2;
    return `M ${a.right + 2} ${y} L ${b.left - 3} ${y}`;
  }

  return "";
}

function useFlowConnectors(nodeIds: string[]) {
  const railRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const railRect = rail.getBoundingClientRect();
    setSvgSize({ w: rail.offsetWidth, h: rail.offsetHeight });

    const next: ConnectorPath[] = [];
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const fromEl = nodesRef.current.get(nodeIds[i]!);
      const toEl = nodesRef.current.get(nodeIds[i + 1]!);
      if (!fromEl || !toEl) continue;
      const d = buildConnectorPath(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect(), railRect);
      if (!d) continue;

      next.push({
        id: `${nodeIds[i]}->${nodeIds[i + 1]}`,
        d,
        isDest: nodeIds[i + 1]!.startsWith("dest-"),
      });
    }
    setPaths(next);
  }, [nodeIds]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measure();
    });
  }, [measure]);

  const setFlowNode = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) {
        nodesRef.current.set(id, el);
        observerRef.current?.observe(el);
      } else {
        const prev = nodesRef.current.get(id);
        if (prev) observerRef.current?.unobserve(prev);
        nodesRef.current.delete(id);
      }
      scheduleMeasure();
    },
    [scheduleMeasure],
  );

  useLayoutEffect(() => {
    measure();
    const rail = railRef.current;
    if (!rail) return;

    const ro = new ResizeObserver(scheduleMeasure);
    observerRef.current = ro;
    ro.observe(rail);
    for (const el of nodesRef.current.values()) ro.observe(el);

    const onResize = () => scheduleMeasure();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerup", scheduleMeasure);
    window.addEventListener("pointermove", scheduleMeasure);

    return () => {
      ro.disconnect();
      observerRef.current = null;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", scheduleMeasure);
      window.removeEventListener("pointermove", scheduleMeasure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure, scheduleMeasure, nodeIds.join("|")]);

  useEffect(() => {
    scheduleMeasure();
  }, [scheduleMeasure, nodeIds.join("|")]);

  return { railRef, setFlowNode, paths, svgSize };
}

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
      className={`bank-card-compact tc-compact-wrap${dimmed ? " is-dimmed" : ""}${!dimmed && (otherFlowNumbers?.length ?? 0) > 0 ? " has-flow-xrefs" : ""}`}
      onClick={() => { if (!dimmed) onClick?.(task); }}
      onKeyDown={(e) => {
        if (dimmed) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(task); }
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

function AppendDrop({
  criticalId,
  isEmpty,
  nodeRef,
}: {
  criticalId: string;
  isEmpty: boolean;
  nodeRef: RefCallback<HTMLDivElement>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `append-${criticalId}`,
    data: { type: "append" as const, criticalId },
  });
  const combinedRef: RefCallback<HTMLDivElement> = (el) => {
    setNodeRef(el);
    nodeRef(el);
  };
  return (
    <div
      ref={combinedRef}
      className={`flow-drop-wrap flow-rail-node${isOver ? " over" : ""}${isEmpty ? " empty" : " compact"}`}
      aria-label="Solte aqui para adicionar ao fim do fluxo"
      title="Solte aqui para adicionar ao fim do fluxo"
    >
      {isEmpty ? "+ solte aqui" : "+"}
    </div>
  );
}

function SortableStep({
  entry,
  task,
  stepNum,
  criticalId,
  onRemove,
  nodeRef,
}: {
  entry: ChainEntry;
  task: Task;
  stepNum: number;
  criticalId: string;
  onRemove: () => void;
  nodeRef: RefCallback<HTMLDivElement>;
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
  const combinedRef: RefCallback<HTMLDivElement> = (el) => {
    setNodeRef(el);
    nodeRef(el);
  };
  return (
    <div ref={combinedRef} style={style} className="flow-step-wrap flow-rail-node">
      <button type="button" className="flow-step-drag" title="Arraste o card para reordenar" aria-label="Arraste o card para reordenar">⠿</button>
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

export function FlowDestCard({ task }: { task: Task }) {
  const verb = (task.verb ?? "").trim().toUpperCase();
  const texto = (task.textoPrincipal ?? "").trim();
  const title = texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "—";
  return (
    <div className="flow-dest-card">
      <span className="flow-dest-badge">CHEGAR EM</span>
      <div className="flow-dest-top">
        <div className="flow-dest-verb">{verb}</div>
        <div className="flow-dest-title">{title}</div>
      </div>
      <div className="flow-dest-foot">
        <div>
          <strong>Ativ:</strong> {task.atividade || <span className="flow-dest-empty">—</span>}
        </div>
        <div>
          <strong>Etapa:</strong> {task.etapa || <span className="flow-dest-empty">—</span>}
        </div>
      </div>
    </div>
  );
}

function FlowConnectorsSvg({
  paths,
  width,
  height,
  uid,
}: {
  paths: ConnectorPath[];
  width: number;
  height: number;
  uid: string;
}) {
  if (!width || !height || !paths.length) return null;
  const arrowId = `flow-conn-${uid}`;
  const arrowDestId = `flow-conn-dest-${uid}`;
  return (
    <svg className="flow-connectors-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <marker id={arrowId} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="context-stroke" stroke="none" />
        </marker>
        <marker id={arrowDestId} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="context-stroke" stroke="none" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          className={`flow-connector-path${p.isDest ? " is-dest" : ""}`}
          markerEnd={p.isDest ? `url(#${arrowDestId})` : `url(#${arrowId})`}
        />
      ))}
    </svg>
  );
}

type Props = {
  critical: Task;
  taskById: Map<string, Task>;
  chain: ChainEntry[];
  isActive?: boolean;
  onChange: (next: ChainEntry[]) => void;
};

export function FlowTrack({ critical, taskById, chain, isActive, onChange }: Props) {
  const nodeIds = useMemo(() => {
    const ids = chain.map((c) => `step-${c.id}`);
    ids.push(`append-${critical.id}`, `dest-${critical.id}`);
    return ids;
  }, [chain, critical.id]);

  const { railRef, setFlowNode, paths, svgSize } = useFlowConnectors(nodeIds);
  const appendId = `append-${critical.id}`;
  const destId = `dest-${critical.id}`;

  return (
    <div className="flow-wrap-block">
      <SortableContext id={critical.id} items={chain.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div ref={railRef} className={`flow-rail-wrap${isActive ? " active" : ""}`}>
          <FlowConnectorsSvg paths={paths} width={svgSize.w} height={svgSize.h} uid={critical.id} />

          {chain.map((entry, idx) => {
            const t = taskById.get(entry.taskId);
            if (!t) return null;
            return (
              <SortableStep
                key={entry.id}
                entry={entry}
                task={t}
                stepNum={idx + 1}
                criticalId={critical.id}
                onRemove={() => onChange(chain.filter((c) => c.id !== entry.id))}
                nodeRef={(el) => setFlowNode(`step-${entry.id}`, el)}
              />
            );
          })}

          <AppendDrop
            criticalId={critical.id}
            isEmpty={chain.length === 0}
            nodeRef={(el) => setFlowNode(appendId, el)}
          />
          <div ref={(el) => setFlowNode(destId, el)} className="flow-rail-node flow-dest-wrap">
            <FlowDestCard task={critical} />
          </div>
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
