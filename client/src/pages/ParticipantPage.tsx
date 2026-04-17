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
import { v4 as uuid } from "uuid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiSend, apiGet } from "../api";
import { ciapMotion, ciapStagger } from "../ciap-motion";
import { BankDraggable, FlowTrack, reorderChain, type ChainEntry } from "../components/FlowTrack";
import { TaskCard } from "../components/TaskCard";
import type { Question, StudyVersion, Task } from "../types";

type VersionPayload = { studyId: string; version: StudyVersion | null };

export function ParticipantPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState<StudyVersion | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [hardestId, setHardestId] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [longText, setLongText] = useState("");
  const [chains, setChains] = useState<Record<string, ChainEntry[]>>({});

  const [overlayTask, setOverlayTask] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGet<VersionPayload>("/api/public/version");
      setVersion(data.version);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    (version?.tasks ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [version]);

  const questions = version?.questions ?? [];
  const qCritical = questions.find((q) => q.type === "critical_select");
  const qHardest  = questions.find((q) => q.type === "hardest_critical");
  const qText     = questions.find((q) => q.type === "text_long");
  const qFlow     = questions.find((q) => q.type === "flow_builder_per_critical");

  const toggleCrit = (id: string) => {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      setHardestId((h) => (h && !next.includes(h) ? null : h));
      setChains((c) => {
        const o = { ...c };
        for (const k of Object.keys(o)) { if (!next.includes(k)) delete o[k]; }
        for (const nid of next)          { if (!o[nid]) o[nid] = []; }
        return o;
      });
      return next;
    });
  };

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { type?: string; taskId?: string } | undefined;
    setOverlayTask(d?.type === "bank" && d.taskId ? (taskById.get(d.taskId) ?? null) : null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setOverlayTask(null);
    const { active, over } = e;
    if (!over) return;
    const a = active.data.current as
      | { type: "bank"; taskId: string }
      | { type: "sort"; criticalId: string; entryId: string }
      | undefined;
    const o = over.data.current as
      | { type: "append"; criticalId: string }
      | { type: "sort"; criticalId: string; entryId: string }
      | undefined;

    if (a?.type === "bank") {
      const taskId = a.taskId;
      if (String(over.id).startsWith("append-")) {
        const critId = String(over.id).replace("append-", "");
        if (!selected.includes(critId)) return;
        setChains((p) => ({ ...p, [critId]: [...(p[critId] ?? []), { id: uuid(), taskId }] }));
        return;
      }
      if (o?.type === "sort") {
        const critId = o.criticalId;
        setChains((p) => {
          const cur = p[critId] ?? [];
          const idx = cur.findIndex((x) => x.id === String(over.id));
          if (idx < 0) return p;
          const next = [...cur];
          next.splice(idx, 0, { id: uuid(), taskId });
          return { ...p, [critId]: next };
        });
        return;
      }
    }

    if (a?.type === "sort") {
      const critId = a.criticalId;
      if (o?.type === "sort" && o.criticalId === critId) {
        setChains((p) => ({
          ...p,
          [critId]: reorderChain(p[critId] ?? [], String(active.id), String(over.id)),
        }));
      }
    }
  };

  const submit = async () => {
    if (!version || !qCritical || !qHardest || !qText || !qFlow) {
      setErr("Formulário incompleto no servidor."); return;
    }
    if (selected.length === 0)         { setErr("Selecione ao menos uma tarefa crítica."); return; }
    if (!hardestId || !why.trim())      { setErr("Indique a crítica mais difícil e o motivo."); return; }
    if (!longText.trim())               { setErr("Responda ao texto sobre dificuldades."); return; }

    const flows = selected.map((criticalTaskId) => ({
      criticalTaskId,
      stepTaskIds: (chains[criticalTaskId] ?? []).map((e) => e.taskId),
    }));

    setSubmitting(true);
    setErr(null);
    try {
      await apiSend("/api/public/responses", "POST", {
        studyVersionId: version.id,
        answers: [
          { questionId: qCritical.id, criticalTaskIds: selected },
          { questionId: qHardest.id, taskId: hardestId, why },
          { questionId: qText.id, text: longText },
          { questionId: qFlow.id, flows },
        ],
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── estados simples ── */
  if (loading) {
    return (
      <motion.div className="page muted" {...ciapMotion.fade}>
        Carregando…
      </motion.div>
    );
  }
  if (err && !version) {
    return (
      <motion.div className="page" {...ciapMotion.sectionFade}>
        <p className="error">{err}</p>
      </motion.div>
    );
  }
  if (!version) {
    return (
      <motion.div className="page" {...ciapMotion.sectionFade}>
        <h1>Estudo indisponível</h1>
        <p className="muted">Ainda não há versão publicada. Acesse /admin para publicar.</p>
      </motion.div>
    );
  }
  if (done) {
    return (
      <motion.div className="page" {...ciapMotion.celebrationCard}>
        <h1>Obrigado</h1>
        <p className="success">Respostas registradas com sucesso.</p>
      </motion.div>
    );
  }

  const tasks     = version.tasks ?? [];
  const critTasks = selected.map((id) => taskById.get(id)).filter(Boolean) as Task[];

  return (
    <motion.div className="page" {...ciapMotion.sectionFade}>

      {/* ── cabeçalho ── */}
      <motion.div className="row spread" style={{ marginBottom: 16 }} {...ciapMotion.headerLift}>
        <h1>Dinâmica — Tarefas críticas</h1>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
      </motion.div>

      {/* ── seleção de críticas ── */}
      {qCritical && (
        <motion.section style={{ marginBottom: 20 }} {...ciapMotion.projectGridSection}>
          <div className="section-hd">
            <h2 style={{ margin: 0 }}>{qCritical.title}</h2>
            <span className="muted">{qCritical.helpText}</span>
            {selected.length > 0 && (
              <span className="badge badge-y">{selected.length} selecionada{selected.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="crit-bank">
            {tasks.map((t, i) => (
              <motion.button
                key={t.id}
                type="button"
                className={`crit-btn${selected.includes(t.id) ? " on" : ""}`}
                onClick={() => toggleCrit(t.id)}
                {...ciapMotion.projectCard}
                transition={ciapStagger(i, 0.045)}
              >
                <TaskCard task={t} selected={selected.includes(t.id)} />
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── crítica mais difícil ── */}
      <AnimatePresence>
        {qHardest && selected.length > 0 && (
          <motion.section key="hardest" style={{ marginBottom: 20 }} {...ciapMotion.onboardingY12}>
            <div className="section-hd">
              <h2 style={{ margin: 0 }}>{qHardest.title}</h2>
              <span className="muted">{qHardest.helpText}</span>
            </div>
            <div className="stack-s" style={{ maxWidth: 640 }}>
              {critTasks.map((t) => (
                <label key={t.id} className="row-s" style={{ cursor: "pointer", gap: 8 }}>
                  <input
                    type="radio"
                    name="hardest"
                    checked={hardestId === t.id}
                    onChange={() => setHardestId(t.id)}
                  />
                  <span style={{ fontSize: "var(--fs-sm)", fontWeight: hardestId === t.id ? 700 : 400 }}>
                    {t.verb} {t.textoPrincipal}
                  </span>
                </label>
              ))}
              <textarea
                placeholder="Por quê esta foi a mais difícil?"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                style={{ minHeight: 72 }}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── dificuldades conceituais ── */}
      {qText && (
        <motion.section style={{ marginBottom: 20 }} {...ciapMotion.onboardingY8}>
          <div className="section-hd">
            <h2 style={{ margin: 0 }}>{qText.title}</h2>
            <span className="muted">{qText.helpText}</span>
          </div>
          <textarea
            value={longText}
            onChange={(e) => setLongText(e.target.value)}
            style={{ maxWidth: 760, minHeight: 96 }}
          />
        </motion.section>
      )}

      {/* ── fluxos ── */}
      <AnimatePresence>
        {qFlow && selected.length > 0 && (
          <motion.section key="flows" style={{ marginBottom: 20 }} {...ciapMotion.onboardingY12}>
            <div className="section-hd">
              <h2 style={{ margin: 0 }}>{qFlow.title}</h2>
              <span className="muted">{qFlow.helpText}</span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setOverlayTask(null)}
            >
              <div className="flow-layout">
                {/* banco lateral fixo */}
                <div className="flow-bank-sticky">
                  <div className="bank-wrap">
                    <div className="bank-wrap-hd">
                      <span className="label-sm">Banco de cards</span>
                      <span className="badge">{tasks.length}</span>
                    </div>
                    <p className="muted" style={{ marginBottom: 10 }}>
                      Arraste para a trilha. Reuse em vários fluxos.
                    </p>
                    <div className="bank">
                      {tasks.map((t, i) => (
                        <motion.div
                          key={t.id}
                          {...ciapMotion.projectCard}
                          transition={ciapStagger(i, 0.03)}
                        >
                          <BankDraggable task={t} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* trilhas */}
                <div>
                  {critTasks.map((c, i) => (
                    <motion.div
                      key={c.id}
                      {...ciapMotion.listSlide}
                      transition={{ delay: i * 0.08, duration: 0.3 }}
                    >
                      <FlowTrack
                        critical={c}
                        taskById={taskById}
                        chain={chains[c.id] ?? []}
                        onChange={(next) => setChains((p) => ({ ...p, [c.id]: next }))}
                      />
                    </motion.div>
                  ))}
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── enviar ── */}
      <motion.div className="row" style={{ marginTop: 12 }} {...ciapMotion.microLift}>
        <button type="button" className="btn primary" disabled={submitting} onClick={() => void submit()}>
          {submitting ? "Enviando…" : "Enviar respostas"}
        </button>
        {err && <span className="error">{err}</span>}
      </motion.div>
    </motion.div>
  );
}
