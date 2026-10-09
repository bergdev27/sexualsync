"use client";

/**
 * Green Lights — a double-blind comfort & agreements questionnaire (sibling to
 * the Sex Quiz). Each partner privately answers "I'm good / Depends / No" (with
 * an optional note) to a deck of agreement statements; nothing reveals until both
 * finish. Then it opens what you're on the same page about (green lights + agreed
 * limits) and — the point — the opposites: where you differ or it's conditional,
 * as a "talk about these" list.
 *
 * Route + API are /games/green-lights and /api/green-lights. v1 stores answers
 * plaintext-at-rest (encrypted by the store envelope) + double-blind at the app
 * layer, mirroring the Sex Quiz.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell, { useFocusedRun } from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import DesireStyles from "@/components/DesireStyles";
import LibidoNote from "@/components/LibidoNote";
import SyncScoreReveal from "@/components/SyncScoreReveal";
import { ErrorState, SkeletonList } from "@/components/States";
import {
  ApiUnauthorizedError,
  getGreenLights,
  retakeGreenLights,
  submitGreenLights,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { clearRunnerDraft, loadRunnerDraft, saveRunnerDraft } from "@/lib/runner-draft";
import { useLiveRoomReload } from "@/lib/use-live-room";
import {
  GREEN_LIGHT_DECK,
  GREEN_LIGHT_BY_ID,
  activeGreenLightAnswers,
  unansweredGreenLightCards,
  computeGreenLightsReveal,
  greenLightCategoryTitle,
  labelForCardValue,
  optionsForCard,
  valueTone,
  type GreenLightTone,
} from "@/lib/green-lights-deck";
import type { AuthInfo, GreenLightAnswer, GreenLightsResponse, ProfileResponse, Workspace } from "@/lib/types";
import "./green-lights.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "no-workspace" }
  | { kind: "ready"; auth: AuthInfo; workspace: Workspace; data: GreenLightsResponse };

// Answer buttons are styled (.rg-answer.is-tone-*) by the card's position TONE (see valueTone):
// pos = top/positive, mid = middle, neg = bottom/no, pole = a prefer/cadence
// choice (neither good nor bad → neutral accent).
function toneColor(tone: GreenLightTone): string {
  if (tone === "pos") return "var(--yes)";
  if (tone === "mid") return "var(--gold)";
  if (tone === "neg") return "rgb(var(--no-rgb))";
  return "var(--accent)";
}
// Cadence reveal — text for a gap already measured (steps apart) by the engine.
function cadenceGapText(gap: number): string {
  if (gap === 0) return "Same answer — you're in sync on how often.";
  if (gap === 1) return "One step apart — close. Easy to meet in the middle.";
  return "A real gap in how often you each want it — worth talking about what you each need.";
}

export default function GreenLightsPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile: ProfileResponse = await getProfileCached();
        if (cancelled) return;
        if (!profile.activeWorkspace) {
          setState({ kind: "no-workspace" });
          return;
        }
        const data = await getGreenLights(profile.activeWorkspace.id);
        if (cancelled) return;
        setState({ kind: "ready", auth: profile.auth, workspace: profile.activeWorkspace, data });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState({ kind: "error", message: error instanceof Error ? error.message : "Couldn't load Green Lights." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the partner submits, the "locked in" screen moves to the reveal on its
  // own. A runner in progress keeps its local answers; only `data` refreshes.
  const workspaceId = state.kind === "ready" ? state.workspace.id : "";
  useLiveRoomReload({
    workspaceId,
    actorEmail: state.kind === "ready" ? state.auth.email : "",
    resources: ["green-lights"],
    onReload: async () => {
      if (!workspaceId) return;
      const data = await getGreenLights(workspaceId);
      setState((current) => (current.kind === "ready" ? { ...current, data } : current));
    },
  });

  return (
    <AppShell>
      <ScreenHeader
        variant="bar"
        back={{ href: "/games", label: "Play" }}
        title="Green Lights"
      />
      <Body state={state} setState={setState} />
    </AppShell>
  );
}

function Body({ state, setState }: { state: LoadState; setState: (s: LoadState) => void }) {
  // Answering only the questions added (or re-scaled) since the last submit.
  const [topUp, setTopUp] = useState(false);
  if (state.kind === "loading") return <SkeletonList count={4} />;
  if (state.kind === "unauthorized") {
    return <ErrorState title="Session expired" body="Sign in again to take Green Lights." action={<Link href="/" className="btn-ghost">Back to sign-in</Link>} />;
  }
  if (state.kind === "error") return <ErrorState title="Couldn't load Green Lights" body={state.message} />;
  if (state.kind === "no-workspace") {
    return <ErrorState title="No partner space yet" body="Green Lights needs a paired room." action={<Link href="/space" className="btn-ghost">Open Us</Link>} />;
  }

  const { workspace, data } = state;
  const onUpdate = (next: GreenLightsResponse) => setState({ ...state, data: next });

  if (!data.mySubmitted) return <Runner workspace={workspace} onSubmitted={onUpdate} />;
  if (topUp) {
    return (
      <Runner
        workspace={workspace}
        baseline={data.myAnswers || {}}
        onSubmitted={(next) => { setTopUp(false); onUpdate(next); }}
        onCancel={() => setTopUp(false)}
      />
    );
  }
  const startTopUp = () => setTopUp(true);
  if (data.status !== "revealed") return <Waiting workspace={workspace} data={data} onUpdate={onUpdate} onAnswerNew={startTopUp} />;
  return <Reveal workspace={workspace} data={data} onUpdate={onUpdate} onAnswerNew={startTopUp} />;
}

// ---------- Taking it ----------

function Runner({
  workspace,
  onSubmitted,
  baseline,
  onCancel,
}: {
  workspace: Workspace;
  onSubmitted: (next: GreenLightsResponse) => void;
  // Present when topping up: answers already submitted. Only questions without
  // a usable answer are dealt; the rest are carried into the submit.
  baseline?: Record<string, GreenLightAnswer>;
  onCancel?: () => void;
}) {
  const deck = useMemo(() => (baseline ? unansweredGreenLightCards(baseline) : GREEN_LIGHT_DECK), [baseline]);
  const draftKey = baseline ? "green-lights-new-cards" : "green-lights";
  const [phase, setPhase] = useState<"intro" | "cards" | "review">("intro");
  // Once the cards are dealt this is a focused run: the tab bar steps away.
  useFocusedRun(phase !== "intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, GreenLightAnswer>>({});
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // The saved draft is read once at mount and held in state, so render never
  // reads a ref. Starting fresh clears it.
  const [savedDraft, setSavedDraft] = useState(() => loadRunnerDraft<{ answers: Record<string, GreenLightAnswer>; index: number; phase: "cards" | "review" }>(draftKey, workspace.id));
  const savedDraftCount = Object.keys(savedDraft?.answers || {}).length;

  // Autosave (same-device, localStorage) so a long sit can be picked back up.
  useEffect(() => {
    if (phase === "intro") return;
    saveRunnerDraft(draftKey, workspace.id, { answers, index, phase });
  }, [answers, index, phase, workspace.id, draftKey]);

  const card = deck[index];

  function loadCard(i: number) {
    const existing = answers[deck[i].id];
    setNote(existing?.note || "");
    setShowNote(Boolean(existing?.note));
  }

  function choose(value: string) {
    const entry: GreenLightAnswer = { value };
    const trimmed = note.trim();
    if (trimmed) entry.note = trimmed;
    setAnswers((prev) => ({ ...prev, [card.id]: entry }));
    if (index + 1 < deck.length) {
      const next = index + 1;
      setIndex(next);
      loadCard(next);
    } else {
      setPhase("review");
    }
  }

  function back() {
    if (index === 0) return;
    const prev = index - 1;
    setIndex(prev);
    loadCard(prev);
  }

  // Move forward through already-answered cards WITHOUT re-answering, so going
  // back to review never forces a re-pick (which silently changed the answer).
  function next() {
    if (index + 1 >= deck.length || !answers[card.id]) return;
    const upcoming = index + 1;
    setIndex(upcoming);
    loadCard(upcoming);
  }

  function resumeDraft() {
    const d = savedDraft;
    if (!d) return;
    const restored = d.answers || {};
    setAnswers(restored);
    const i = Math.min(Math.max(0, d.index || 0), deck.length - 1);
    setIndex(i);
    const existing = restored[deck[i].id];
    setNote(existing?.note || "");
    setShowNote(Boolean(existing?.note));
    setPhase(d.phase === "review" ? "review" : "cards");
  }
  function startFresh() {
    clearRunnerDraft(draftKey, workspace.id);
    setSavedDraft(null);
    setAnswers({});
    setIndex(0);
    setNote("");
    setShowNote(false);
    setPhase("cards");
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const finalAnswers = baseline ? { ...activeGreenLightAnswers(baseline), ...answers } : answers;
      const next = await submitGreenLights({ workspaceId: workspace.id, answers: finalAnswers });
      clearRunnerDraft(draftKey, workspace.id);
      onSubmitted(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit. Try again.");
      setSubmitting(false);
    }
  }

  if (phase === "intro" && baseline) {

    return (
      <div className="rg-pane">
        <p className="eyebrow">New questions</p>
        <p className="rg-lead">
          <strong>{deck.length}</strong> new or reworded {deck.length === 1 ? "question" : "questions"} since you last answered. Just these; everything else you said stays.
        </p>
        <button type="button" className="rg-btn pressable" onClick={savedDraftCount > 0 ? resumeDraft : startFresh}>
          {savedDraftCount > 0 ? `Resume — ${savedDraftCount} answered` : "Answer the new questions"}
        </button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Not now</button>}
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="rg-pane">
        <p className="eyebrow">Where you both stand</p>
        <p className="rg-lead">
          {deck.length} honest reads on sex, autonomy, and what you&apos;re each okay with — your green lights and your hard limits both. Answer <strong>I&apos;m good</strong>, <strong>Depends</strong>, or <strong>No</strong>, and add a note wherever it&apos;s conditional.
        </p>
        <p className="rg-hint">
          🔒 Double-blind: nothing shows until you&apos;ve both finished. Then you&apos;ll see what you&apos;re aligned on — and the few worth talking through.
        </p>
        <p className="rg-hint">
          No wrong answers — and <strong>Depends</strong> is often the most honest one.
        </p>
        <DesireStyles />
        <LibidoNote />
        {savedDraftCount > 0 ? (
          <>
            <button type="button" className="rg-btn pressable" onClick={resumeDraft}>
              Resume — {savedDraftCount} answered
            </button>
            <button type="button" className="btn-ghost" onClick={startFresh}>Start over</button>
          </>
        ) : (
          <button type="button" className="rg-btn pressable" onClick={startFresh}>
            Start
          </button>
        )}
      </div>
    );
  }

  if (phase === "review") {
    const answered = Object.keys(answers).length;
    return (
      <div className="rg-pane is-centered">
        <div className="rg-done-emoji">🔒</div>
        <p className="rg-done-title">You answered all {answered}</p>
        <p className="rg-done-body">
          Lock it in — your partner won&apos;t see anything until they finish too, and neither will you.
        </p>
        {error && <p className="rg-error">{error}</p>}
        <div className="rg-actions">
          <button type="button" className="btn-ghost" disabled={submitting} onClick={() => { setPhase("cards"); setIndex(deck.length - 1); loadCard(deck.length - 1); }}>Back</button>
          <button type="button" className="rg-btn is-grow pressable" disabled={submitting} onClick={submit}>
            {submitting ? "Locking in…" : "Lock in my answers"}
          </button>
        </div>
      </div>
    );
  }

  // phase === "cards"
  const pct = Math.round(((index + 1) / deck.length) * 100);
  const nextDisabled = index + 1 >= deck.length || !answers[card.id];
  return (
    <div className="rg-runner">
      <div className="rg-progress">
        <button type="button" className="rg-step" onClick={back} aria-label="Previous" disabled={index === 0}>‹</button>
        <div className="rg-track">
          {/* scaleX, not width — a width transition re-runs layout every frame. */}
          <div className="rg-track-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="rg-count">{index + 1} / {deck.length}</div>
        <button type="button" className="rg-step" onClick={next} aria-label="Next" disabled={nextDisabled}>›</button>
      </div>

      <div className="rg-stage">
        <div className="rg-card">
          <div className="rg-card-kicker">
            {greenLightCategoryTitle(card.category)}{card.heavy ? " · Talk first" : ""}
          </div>
          <div className="rg-card-title is-question">{card.label}</div>
          {showNote ? (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a condition (optional)"
              maxLength={240}
              aria-label="Condition (optional)"
              className="rg-note-input"
            />
          ) : (
            <button type="button" className="rg-link" onClick={() => setShowNote(true)}>+ Add a note</button>
          )}
        </div>
      </div>

      {/* Each card renders its own scale's options, ordered positive → negative,
          tone-colored (green / gold / red, or neutral accent for prefer & cadence). */}
      <div className="rg-answers is-stack">
        {optionsForCard(card).map((opt) => {
          const picked = answers[card.id]?.value === opt.id;
          const tone = valueTone(card, opt.id);
          return (
            <button key={opt.id} type="button" className={`rg-answer is-tone is-tone-${tone} pressable${answers[card.id] && !picked ? " is-dim" : ""}`} aria-pressed={picked} onClick={() => choose(opt.id)}>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Waiting ----------

function NewQuestionsPrompt({ data, onAnswerNew }: { data: GreenLightsResponse; onAnswerNew: () => void }) {
  const count = useMemo(() => unansweredGreenLightCards(data.myAnswers || {}).length, [data.myAnswers]);
  if (count === 0) return null;
  return (
    <div className="gl-new-questions rg-panel is-row">
      <div className="rg-panel-main">
        <p className="rg-panel-title">{count} new {count === 1 ? "question" : "questions"}</p>
        <p className="rg-panel-body">Added or reworded since you answered.</p>
      </div>
      <button type="button" className="rg-btn is-compact pressable" onClick={onAnswerNew}>
        Answer them
      </button>
    </div>
  );
}

function Waiting({ workspace, data, onUpdate, onAnswerNew }: { workspace: Workspace; data: GreenLightsResponse; onUpdate: (next: GreenLightsResponse) => void; onAnswerNew: () => void }) {
  const [showMine, setShowMine] = useState(false);
  return (
    <div className="rg-pane is-centered">
      <div className="rg-done-emoji">🔒</div>
      <p className="rg-done-title">Your answers are locked in</p>
      <NewQuestionsPrompt data={data} onAnswerNew={onAnswerNew} />
      <p className="rg-done-body">
        {data.partnerName || "Your partner"}&apos;s stay hidden until they finish too — but you can always look back at your own.
      </p>
      <button type="button" className="btn-ghost" onClick={() => setShowMine((v) => !v)} aria-expanded={showMine}>
        {showMine ? "Hide my answers" : "View my answers"}
      </button>
      {showMine && <MyGreenLights data={data} />}
      <button type="button" className="btn-ghost mt-2" onClick={() => { retakeGreenLights(workspace.id).then(onUpdate).catch(() => {}); }}>
        Redo my answers
      </button>
    </div>
  );
}

// Read-only view of your own answers — every card you answered, grouped by
// category, with the option you picked. Available while waiting (and reusable in
// the reveal) so you never have to retake just to remember what you said.
function MyGreenLights({ data }: { data: GreenLightsResponse }) {
  const answers = data.myAnswers || {};
  const rows = GREEN_LIGHT_DECK.filter((card) => answers[card.id]);
  if (rows.length === 0) {
    return <p className="rg-hint">You didn&apos;t answer any.</p>;
  }
  return (
    <div className="rg-section">
      <p className="eyebrow">Your answers</p>
      <div className="rg-list">
        {rows.map((card, i) => {
          const answer = answers[card.id];
          const showHeader = i === 0 || rows[i - 1].category !== card.category;
          return (
            <div key={card.id}>
              {showHeader && (
                <div className="rg-list-group">
                  {greenLightCategoryTitle(card.category)}
                </div>
              )}
              <div className="rg-list-row">
                <span className="rg-list-label">{card.label}</span>
                <span className="rg-list-meta" style={{ color: toneColor(valueTone(card, answer.value)) }}>
                  {labelForCardValue(card, answer.value)}
                </span>
              </div>
              {answer.note && (
                <div className="rg-list-quote">&ldquo;{answer.note}&rdquo;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Reveal ----------

function Reveal({ workspace, data, onUpdate, onAnswerNew }: { workspace: Workspace; data: GreenLightsResponse; onUpdate: (next: GreenLightsResponse) => void; onAnswerNew: () => void }) {
  const partnerName = data.partnerName || "your partner";
  const [showMine, setShowMine] = useState(false);
  // The deck is the source of truth: derive every bucket from both answer sets.
  const { greenLights, sharedConcerns, agreedLimits, talk, cadence, syncScore, categories } = useMemo(
    () => computeGreenLightsReveal(data.myAnswers || {}, data.partnerAnswers || {}),
    [data.myAnswers, data.partnerAnswers],
  );

  return (
    <div className="rg-reveal">
      <NewQuestionsPrompt data={data} onAnswerNew={onAnswerNew} />
      <div>
        <p className="eyebrow">Where you stand</p>
        {syncScore !== null && <SyncScoreReveal score={syncScore} label="On the same page" />}
        {categories.length > 1 && (
          <details className="sync-breakdown">
            <summary>See it by topic</summary>
            <ul>
              {categories.map((c) => (
                <li key={c.category}>
                  <span className="sync-breakdown-title">{c.title}</span>
                  <span className="sync-breakdown-bar" aria-hidden="true"><span style={{ transform: `scaleX(${c.score / 100})` }} /></span>
                  <span className="sync-breakdown-value">{c.aligned}/{c.total}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="rg-reveal-body">
          You&apos;re aligned on <strong>{greenLights.length + agreedLimits.length + sharedConcerns.length}</strong>{talk.length > 0 ? <> — and there {talk.length === 1 ? "is" : "are"} <strong>{talk.length}</strong> worth talking through.</> : "."}
        </p>
      </div>

      {cadence.length > 0 && (
        <section>
          <p className="eyebrow">How often you each want it</p>
          <div className="rg-compare">
            {cadence.map((c) => (
              <div key={c.id} className="rg-compare-card">
                <div className="rg-compare-q">{c.label}</div>
                <div className="rg-compare-sides">
                  <div className="rg-compare-side">
                    <div className="rg-compare-who">You</div>
                    <div className="rg-compare-answer">{c.mine.label}</div>
                  </div>
                  <div className="rg-compare-rule" aria-hidden="true" />
                  <div className="rg-compare-side">
                    <div className="rg-compare-who">{partnerName}</div>
                    <div className="rg-compare-answer">{c.partner.label}</div>
                  </div>
                </div>
                <div className="rg-compare-verdict" style={{ color: c.gap >= 2 ? "var(--gold)" : "var(--yes)" }}>
                  {c.gap === 0 ? "✓ " : ""}{cadenceGapText(c.gap)}
                </div>
                {(c.mine.note || c.partner.note) && (
                  <div className="rg-compare-notes">
                    {c.mine.note ? <span>You: {c.mine.note}</span> : null}
                    {c.partner.note ? <span>{partnerName}: {c.partner.note}</span> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {talk.length > 0 && (
        <section>
          <p className="eyebrow text-gold">Talk about these</p>
          <div className="rg-compare">
            {talk.map((t) => {
              const card = GREEN_LIGHT_BY_ID[t.id];
              return (
                <div key={t.id} className="rg-compare-card is-compact">
                  <div className="rg-compare-label">{t.label}</div>
                  <div className="rg-compare-lines">
                    <span style={{ color: card ? toneColor(valueTone(card, t.mine.value)) : "var(--cream)" }}>You: {t.mine.label}{t.mine.note ? ` — ${t.mine.note}` : ""}</span>
                    <span style={{ color: card ? toneColor(valueTone(card, t.partner.value)) : "var(--cream)" }}>{partnerName}: {t.partner.label}{t.partner.note ? ` — ${t.partner.note}` : ""}</span>
                  </div>
                  <div className="rg-compare-tip">
                    💬 {t.opener}
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/chat" className="rg-btn mt-3 w-full pressable">
            Talk it through in Sext
          </Link>
        </section>
      )}

      {sharedConcerns.length > 0 && (
        <section className="gl-shared-concerns">
          <p className="eyebrow text-gold">Shared, worth naming</p>
          <p className="rg-panel-body mt-1">
            You both said yes to these. Not a problem to fix, just something you both carry. Saying it out loud takes the weight off.
          </p>
          <div className="rg-chips mt-2">
            {sharedConcerns.map((c) => (
              <span key={c.id} className="rg-chip is-small is-gold">
                {c.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {greenLights.length > 0 && (
        <section>
          <p className="eyebrow" style={{ color: "var(--yes)" }}>Green lights · you&apos;re aligned</p>
          <div className="rg-chips mt-2">
            {greenLights.map((c) => (
              <span key={c.id} className="rg-chip is-small is-green">
                {c.label}{c.scale !== "comfort" ? ` · ${c.valueLabel}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {agreedLimits.length > 0 && (
        <section>
          <p className="eyebrow" style={{ color: "rgb(var(--no-rgb))" }}>Agreed limits · shared no&apos;s</p>
          <div className="rg-chips mt-2">
            {agreedLimits.map((c) => (
              <span key={c.id} className="rg-chip is-small is-no">
                {c.label}{c.scale !== "comfort" ? ` · ${c.valueLabel}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="text-center">
        <button type="button" className="btn-ghost" onClick={() => setShowMine((v) => !v)} aria-expanded={showMine}>
          {showMine ? "Hide my answers" : "View my answers"}
        </button>
      </div>
      {showMine && <MyGreenLights data={data} />}

      <p className="rg-note">
        A gap isn&apos;t a verdict — it&apos;s just where a conversation helps.
      </p>

      <button type="button" className="btn-ghost" onClick={() => { retakeGreenLights(workspace.id).then(onUpdate).catch(() => {}); }}>
        Retake
      </button>
    </div>
  );
}
