import type { Task } from "../types";

type Props = {
  task: Task;
  style?: React.CSSProperties;
  selected?: boolean;
};

/**
 * Card compacto: topo amarelo (verbo + texto principal bold),
 * rodapé branco com Atividade/Etapa discretos.
 * Sem max-width fixo — preenche a célula do grid.
 */
export function TaskCard({ task, style, selected }: Props) {
  return (
    <div className={`tc${selected ? " selected" : ""}`} style={style}>
      <div className="tc-top">
        <div className="tc-verb">{task.verb}</div>
        <div className="tc-title">{task.textoPrincipal || "—"}</div>
      </div>
      <div className="tc-foot">
        <div>
          <strong>Ativ:</strong> {task.atividade || <span style={{ color: "#bbb" }}>—</span>}
        </div>
        <div>
          <strong>Etapa:</strong> {task.etapa || <span style={{ color: "#bbb" }}>—</span>}
        </div>
      </div>
    </div>
  );
}
