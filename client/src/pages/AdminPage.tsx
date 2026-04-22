import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { ciapMotion } from "../ciap-motion";
import type { Question, Task } from "../types";

const LS = "dinamica_admin_token";

type Overview = {
  study: { id: string; name: string };
  draft: { id: string; tasks: Task[]; questions: Question[] };
  publishedVersions: { id: string; number: number; publishedAt: string | null; _count: { responses: number } }[];
};

/* ── Sortable question editor ───────────────────────────── */
function SortableQ({
  q,
  onSave,
}: {
  q: Question;
  onSave: (id: string, patch: Partial<Question>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  const [title,    setTitle]    = useState(q.title);
  const [help,     setHelp]     = useState(q.helpText);
  const [required, setRequired] = useState(q.required);
  useEffect(() => {
    setTitle(q.title); setHelp(q.helpText); setRequired(q.required);
  }, [q.id, q.title, q.helpText, q.required]);

  return (
    <div ref={setNodeRef} style={style} className="q-card">
      {/* col 1: handle */}
      <button type="button" className="btn ghost q-drag" {...listeners} {...attributes} title="Arrastar">
        ⠿
      </button>

      {/* col 2: fields */}
      <div className="q-body">
        <div className="q-meta">
          <span className="badge" title={
            q.type === "critical_select" ? "Seleção livre de tarefas críticas" :
            q.type === "critical_rank" ? "Ranking das tarefas selecionadas (top-5 vai para fluxo)" :
            q.type === "hardest_critical" ? "Qual foi a crítica mais difícil e por quê" :
            q.type === "text_long" ? "Texto livre sobre dificuldades conceituais" :
            q.type === "flow_builder_per_critical" ? "Fluxo de passos por crítica (top-5)" : q.type
          }>{q.type}</span>
          <label className="row-s" style={{ cursor: "pointer", gap: 4 }}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span style={{ fontSize: "var(--fs-xs)" }}>Obrigatória</span>
          </label>
        </div>
        <div className="q-fields">
          <div className="field">
            <label>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Instrução / ajuda</label>
            <textarea value={help} onChange={(e) => setHelp(e.target.value)} style={{ minHeight: 48 }} />
          </div>
        </div>
      </div>

      {/* col 3: save */}
      <div className="q-actions">
        <button
          type="button"
          className="btn primary"
          style={{ whiteSpace: "nowrap" }}
          onClick={() => onSave(q.id, { title, helpText: help, required })}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

/* ── Main AdminPage ─────────────────────────────────────── */
export function AdminPage() {
  const [token,    setToken]    = useState(() => localStorage.getItem(LS) ?? "");
  const [input,    setInput]    = useState("");
  const [tab,      setTab]      = useState<"q" | "c" | "v">("q");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [err,      setErr]      = useState<string | null>(null);
  const [msg,      setMsg]      = useState<string | null>(null);
  const [qSearch,  setQSearch]  = useState("");
  const [bulk,     setBulk]     = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const authed = token.length > 0;

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    try {
      setOverview(await apiGet<Overview>("/api/admin/overview", token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
      setOverview(null);
    }
  }, [token]);

  useEffect(() => {
    if (token) localStorage.setItem(LS, token);
    void load();
  }, [token, load]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const questions = overview?.draft.questions ?? [];
  const sortedQ   = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

  const flash = (m: string, e?: string) => { setMsg(m); setErr(e ?? null); };

  const onReorder = async (event: DragEndEvent) => {
    if (!overview) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sortedQ.map((q) => q.id);
    const oi  = ids.indexOf(String(active.id));
    const ni  = ids.indexOf(String(over.id));
    if (oi < 0 || ni < 0) return;
    try {
      await apiSend("/api/admin/questions/reorder", "PUT", { orderedIds: arrayMove(ids, oi, ni) }, token);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); }
  };

  const saveQuestion = async (id: string, patch: Partial<Question>) => {
    try { await apiSend(`/api/admin/questions/${id}`, "PATCH", patch, token); flash("Pergunta salva."); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro"); }
  };

  const publish = async () => {
    try { await apiSend("/api/admin/publish", "POST", {}, token); flash("Versão publicada!"); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro"); }
  };

  const saveTask = async (t: Task) => {
    try {
      const { hasResponses: _h, ...patch } = t; void _h;
      await apiSend(`/api/admin/tasks/${t.id}`, "PATCH", patch, token);
      flash("Card salvo."); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); }
  };

  const bulkAdd = async () => {
    try {
      await apiSend("/api/admin/tasks/bulk", "POST", { text: bulk }, token);
      setBulk(""); setBulkOpen(false); flash("Cards criados."); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); }
  };

  const filteredTasks = (overview?.draft.tasks ?? []).filter((t) => {
    const s = qSearch.toLowerCase();
    if (!s) return true;
    return [t.verb, t.textoPrincipal, t.atividade, t.etapa].some((v) => v.toLowerCase().includes(s));
  });

  /* ── login ── */
  if (!authed) {
    return (
      <motion.div className="page" style={{ maxWidth: 480 }} {...ciapMotion.wizardModal}>
        <h1>Admin</h1>
        <p className="muted">Token ADMIN_TOKEN do server/.env</p>
        <div className="row" style={{ marginTop: 12 }}>
          <input
            type="password"
            placeholder="Token…"
            value={input}
            style={{ flex: 1 }}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setToken(input)}
          />
          <button type="button" className="btn primary" onClick={() => setToken(input)}>
            Entrar
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="page" {...ciapMotion.sectionFade}>
      {/* ── topbar ── */}
      <div className="row spread" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <div className="row-s">
          <Link to="/admin/analise" className="btn ghost">Análise</Link>
          <Link to="/admin/export"  className="btn ghost">Export</Link>
          <button type="button" className="btn ghost" onClick={() => publish()}>
            ↑ Publicar
          </button>
          <button type="button" className="btn ghost" onClick={() => setToken("")}>Sair</button>
        </div>
      </div>

      {err && <motion.p className="error" style={{ margin: "0 0 6px" }} {...ciapMotion.nudgeY}>{err}</motion.p>}
      {msg && <motion.p className="success" style={{ margin: "0 0 6px" }} {...ciapMotion.nudgeY}>{msg}</motion.p>}

      <div className="tabs">
        {(["q","c","v"] as const).map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            { t === "q" ? "Perguntas" : t === "c" ? `Cards (${overview?.draft.tasks.length ?? 0})` : "Versões" }
          </button>
        ))}
      </div>

      {/* ── TAB: Perguntas ── */}
      {tab === "q" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onReorder(e)}>
          <SortableContext items={sortedQ.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <div className="stack-s">
              {sortedQ.map((q) => (
                <SortableQ key={q.id} q={q} onSave={(id, p) => void saveQuestion(id, p)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ── TAB: Cards ── */}
      {tab === "c" && (
        <div className="stack-s">
          {/* toolbar */}
          <div className="row" style={{ gap: 6 }}>
            <input
              type="search"
              placeholder="Buscar cards…"
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setBulkOpen((v) => !v)}
            >
              {bulkOpen ? "Fechar" : "+ Adicionar em massa"}
            </button>
          </div>

          {/* bulk */}
          {bulkOpen && (
            <div className="panel">
              <div className="panel-hd">Adicionar em massa — uma tarefa por linha</div>
              <div className="panel-body stack-s">
                <textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={6}
                  placeholder={"Definir objetivos do serviço\nMapear pessoas envolvidas\n…"}
                />
                <div className="row-s">
                  <button type="button" className="btn primary" onClick={() => void bulkAdd()}>Criar cards</button>
                  <button type="button" className="btn" onClick={() => setBulkOpen(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Verbo</th>
                  <th>Texto principal</th>
                  <th style={{ width: 120 }}>Atividade</th>
                  <th style={{ width: 100 }}>Etapa</th>
                  <th style={{ width: 64 }}>Status</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t) => (
                  <TaskRow key={t.id} t={t} onSave={(row) => void saveTask(row)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Versões ── */}
      {tab === "v" && (
        <div className="stack-s">
          <div className="row-s">
            <button type="button" className="btn primary" onClick={() => void publish()}>
              ↑ Publicar versão (snapshot imutável)
            </button>
            <span className="muted">Tudo editado fica em rascunho até publicar.</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>v</th>
                  <th>Publicada em</th>
                  <th>Respostas</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.publishedVersions ?? []).map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.number}</strong></td>
                    <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString("pt-BR") : "—"}</td>
                    <td>{v._count.responses}</td>
                    <td className="muted" style={{ fontFamily: "monospace", fontSize: "0.68rem" }}>{v.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ── Inline-editable table row for cards ────────────────── */
function TaskRow({ t, onSave }: { t: Task; onSave: (t: Task) => void }) {
  const [verb, setVerb] = useState(t.verb);
  const [tp,   setTp]   = useState(t.textoPrincipal);
  const [at,   setAt]   = useState(t.atividade);
  const [et,   setEt]   = useState(t.etapa);
  const dirty = verb !== t.verb || tp !== t.textoPrincipal || at !== t.atividade || et !== t.etapa;
  useEffect(() => { setVerb(t.verb); setTp(t.textoPrincipal); setAt(t.atividade); setEt(t.etapa); }, [t]);

  return (
    <tr style={{ background: t.inactive ? "#fafafa" : undefined, opacity: t.inactive ? 0.5 : 1 }}>
      <td><input value={verb} onChange={(e) => setVerb(e.target.value)} /></td>
      <td><input value={tp}   onChange={(e) => setTp(e.target.value)}  /></td>
      <td><input value={at}   onChange={(e) => setAt(e.target.value)}  /></td>
      <td><input value={et}   onChange={(e) => setEt(e.target.value)}  /></td>
      <td>
        <span className={`badge${t.inactive ? "" : " badge-y"}`}>
          {t.inactive ? "inativo" : "ativo"}
        </span>
      </td>
      <td>
        <div className="td-actions">
          {dirty && (
            <button
              type="button"
              className="btn primary"
              onClick={() => onSave({ ...t, verb, textoPrincipal: tp, atividade: at, etapa: et })}
            >
              Salvar
            </button>
          )}
          <button
            type="button"
            className={`btn${t.inactive ? "" : " danger"}`}
            onClick={() => onSave({ ...t, inactive: !t.inactive })}
          >
            {t.inactive ? "Reativar" : "Arquivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
