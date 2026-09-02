import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

const TIP_WIDTH = 260;
const TIP_HEIGHT = 118;
const TIP_GAP = 10;

type Props = {
  task: Task | null | undefined;
  children: ReactNode;
  className?: string;
};

export function TaskHoverTip({ task, children, className }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.left + r.width / 2 - TIP_WIDTH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - TIP_WIDTH - 8));
    let top = r.top - TIP_HEIGHT - TIP_GAP;
    if (top < 8) top = r.bottom + TIP_GAP;
    setPos({ top, left });
  }, []);

  const show = () => {
    if (!task) return;
    updatePos();
    setVisible(true);
  };

  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible) return;
    const onMove = () => updatePos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [visible, updatePos]);

  if (!task) return <>{children}</>;

  const wrapClass = ["task-hover-tip-wrap", className].filter(Boolean).join(" ");

  return (
    <>
      <span
        ref={wrapRef}
        className={wrapClass}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {visible && createPortal(
        <div className="task-hover-tip" style={{ top: pos.top, left: pos.left, width: TIP_WIDTH }} role="tooltip">
          <TaskCard task={task} />
        </div>,
        document.body,
      )}
    </>
  );
}
