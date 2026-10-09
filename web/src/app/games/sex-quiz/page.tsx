"use client";

/**
 * Sex Quiz — a double-blind desire profile. Each partner privately rates the
 * deck (Pass / Curious / Into it, plus Give / Receive / Both where it applies)
 * and pins their top turn-ons. Nothing reveals until both finish; then the
 * overlap (matches + complementary fits + curious-together) opens, and each
 * partner's top picks surface here, on the Sexboard, and in Sext.
 *
 * The route + API are /games/sex-quiz and /api/sex-quiz. v1 stores ratings
 * plaintext-at-rest (encrypted by the store envelope) + double-blind at the
 * app layer; Room-E2EE for the ratings is a planned follow-up.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell, { useFocusedRun } from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import DesireStyles from "@/components/DesireStyles";
import MatchActions, { SeedLink } from "@/components/MatchActions";
import { ErrorState, SkeletonList } from "@/components/States";
import TopTurnOns from "@/components/TopTurnOns";
import {
  ApiUnauthorizedError,
  confirmSexQuiz,
  createBoundary,
  getSexQuiz,
  setSexQuizFullReveal,
  setSexQuizTopPicks,
  submitSexQuiz,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { clearRunnerDraft, loadRunnerDraft, saveRunnerDraft } from "@/lib/runner-draft";
import { useLiveRoomReload } from "@/lib/use-live-room";
import {
  QUIZ_CARD_BY_ID,
  QUIZ_DECK,
  activeQuizRatings,
  quizOverlapByCategory,
  unratedQuizCards,
  categoryTitle,
  type QuizCard,
  type QuizInterest,
  type QuizRole,
} from "@/lib/quiz-deck";
import type { AuthInfo, ProfileResponse, SexQuizRating, SexQuizResponse, Workspace } from "@/lib/types";
import "./sex-quiz.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "no-workspace" }
  | { kind: "ready"; auth: AuthInfo; workspace: Workspace; quiz: SexQuizResponse };

export default function SexQuizPage() {
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
        const quiz = await getSexQuiz(profile.activeWorkspace.id);
        if (cancelled) return;
        setState({ kind: "ready", auth: profile.auth, workspace: profile.activeWorkspace, quiz });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState({ kind: "error", message: error instanceof Error ? error.message : "Couldn't load the Sex Quiz." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the partner submits, the "locked in" screen moves to the reveal on its
  // own. A runner in progress keeps its local answers; only `quiz` refreshes.
  const workspaceId = state.kind === "ready" ? state.workspace.id : "";
  useLiveRoomReload({
    workspaceId,
    actorEmail: state.kind === "ready" ? state.auth.email : "",
    resources: ["sex-quiz"],
    onReload: async () => {
      if (!workspaceId) return;
      const quiz = await getSexQuiz(workspaceId);
      setState((current) => (current.kind === "ready" ? { ...current, quiz } : current));
    },
  });

  return (
    <AppShell>
      <ScreenHeader
        variant="bar"
        back={{ href: "/games", label: "Play" }}
        title="Sex Quiz"
      />
      <Body state={state} setState={setState} />
    </AppShell>
  );
}

function Body({ state, setState }: { state: LoadState; setState: (s: LoadState) => void }) {
  // Rating only the cards added since this person last submitted.
  const [topUp, setTopUp] = useState(false);
  // Going back through every answer (pre-filled) to change any of them.
  const [editing, setEditing] = useState(false);
  if (state.kind === "loading") return <SkeletonList count={4} />;
  if (state.kind === "unauthorized") {
    return <ErrorState title="Session expired" body="Sign in again to take the Sex Quiz." action={<Link href="/" className="btn-ghost">Back to sign-in</Link>} />;
  }
  if (state.kind === "error") return <ErrorState title="Couldn't load the Sex Quiz" body={state.message} />;
  if (state.kind === "no-workspace") {
    return <ErrorState title="No partner space yet" body="The Sex Quiz needs a paired room." action={<Link href="/space" className="btn-ghost">Open Us</Link>} />;
  }

  const { workspace, quiz } = state;
  const onUpdate = (next: SexQuizResponse) => setState({ ...state, quiz: next });

  if (!quiz.mySubmitted) {
    // A new round after a reveal: last round's answers are still saved.
    if (Object.keys(quiz.myRatings || {}).length >= (quiz.minAnswers || 10)) {
      return <NewRound workspace={workspace} quiz={quiz} onUpdate={onUpdate} />;
    }
    return <QuizRunner workspace={workspace} onSubmitted={onUpdate} />;
  }
  if (topUp) {
    return (
      <QuizRunner
        workspace={workspace}
        baseline={{ ratings: quiz.myRatings, topPicks: quiz.myTopPicks }}
        onSubmitted={(next) => { setTopUp(false); onUpdate(next); }}
        onCancel={() => setTopUp(false)}
      />
    );
  }
  if (editing) {
    return (
      <QuizRunner
        workspace={workspace}
        onSubmitted={(next) => { setEditing(false); onUpdate(next); }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  const startTopUp = () => setTopUp(true);
  // Changing your answers never wipes them: the runner opens on your saved
  // answers, and only a submit starts the next round.
  const startEdit = () => {
    saveRunnerDraft("sex-quiz", workspace.id, { ratings: quiz.myRatings, topPicks: quiz.myTopPicks, index: 0, phase: "cards" });
    setEditing(true);
  };
  if (quiz.status !== "revealed") {
    return <Waiting workspace={workspace} quiz={quiz} onUpdate={onUpdate} onRateNew={startTopUp} onChangeAnswers={startEdit} />;
  }
  return <Reveal workspace={workspace} quiz={quiz} onUpdate={onUpdate} onRateNew={startTopUp} onChangeAnswers={startEdit} />;
}

// ---------- Taking the quiz ----------

function QuizRunner({
  workspace,
  onSubmitted,
  baseline,
  onCancel,
}: {
  workspace: Workspace;
  onSubmitted: (next: SexQuizResponse) => void;
  // Present when topping up: the answers already submitted. Only the cards
  // missing from them are dealt, and the rest are carried into the submit.
  baseline?: { ratings: Record<string, SexQuizRating>; topPicks: string[] };
  onCancel?: () => void;
}) {
  const baselineRatings = baseline?.ratings;
  const deck = useMemo(() => (baselineRatings ? unratedQuizCards(baselineRatings) : QUIZ_DECK), [baselineRatings]);
  const draftKey = baseline ? "sex-quiz-new-cards" : "sex-quiz";
  const [phase, setPhase] = useState<"intro" | "cards" | "picks">("intro");
  // Once the cards are dealt this is a focused run: the tab bar steps away.
  useFocusedRun(phase !== "intro");
  const [index, setIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, SexQuizRating>>({});
  const [role, setRole] = useState<QuizRole | "">("");
  const [topPicks, setTopPicks] = useState<string[]>(() => (baseline?.topPicks || []).filter((id) => QUIZ_CARD_BY_ID[id]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // The saved draft is read once at mount and held in state, so render never
  // reads a ref. Starting fresh clears it.
  const [savedDraft, setSavedDraft] = useState(() => loadRunnerDraft<{ ratings: Record<string, SexQuizRating>; topPicks: string[]; index: number; phase: "cards" | "picks" }>(draftKey, workspace.id));
  const savedDraftCount = Object.keys(savedDraft?.ratings || {}).length;

  // Autosave (same-device, localStorage) so a long sit can be picked back up.
  useEffect(() => {
    if (phase === "intro") return;
    saveRunnerDraft(draftKey, workspace.id, { ratings, topPicks, index, phase });
  }, [ratings, topPicks, index, phase, workspace.id, draftKey]);

  function resumeDraft() {
    const d = savedDraft;
    if (!d) return;
    const restored = d.ratings || {};
    setRatings(restored);
    setTopPicks(Array.isArray(d.topPicks) ? d.topPicks : []);
    const i = Math.min(Math.max(0, d.index || 0), deck.length - 1);
    setIndex(i);
    setRole((restored[deck[i].id]?.role as QuizRole) || "");
    setPhase(d.phase === "picks" ? "picks" : "cards");
  }
  function startFresh() {
    clearRunnerDraft(draftKey, workspace.id);
    setSavedDraft(null);
    setRatings({});
    setTopPicks((baseline?.topPicks || []).filter((id) => QUIZ_CARD_BY_ID[id]));
    setIndex(0);
    setRole("");
    setPhase("cards");
  }

  // Swipe-to-rate: drag the card left = Pass, right = Into it, up = Curious. The
  // buttons stay as the tap fallback. dragRef mirrors `drag` so the pointer-up
  // handler reads the latest offset without a stale closure.
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });
  const moveRaf = useRef(0);
  const flinging = useRef(false);

  const card = deck[index];
  const mergedRatings = useMemo(
    () => ({ ...activeQuizRatings(baselineRatings), ...ratings }),
    [baselineRatings, ratings],
  );
  const intoCards = useMemo(() => QUIZ_DECK.filter((c) => mergedRatings[c.id]?.interest === "into"), [mergedRatings]);

  function fling(interest: QuizInterest, target: { x: number; y: number }) {
    flinging.current = true;
    setDrag(target);
    window.setTimeout(() => {
      rate(interest);
      dragRef.current = { x: 0, y: 0 };
      setDrag({ x: 0, y: 0 });
      flinging.current = false;
    }, 180);
  }

  function onCardPointerDown(e: React.PointerEvent) {
    // Don't hijack taps on the role buttons inside the card.
    if (flinging.current || (e.target as HTMLElement).closest("button")) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    // Capture so move/up keep firing even if the finger drifts off the card.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    setDragging(true);
  }
  function onCardPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const next = { x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y };
    dragRef.current = next;
    // Coalesce to one state commit per frame: pointermove fires at up to
    // 120Hz on iOS, and each uncoalesced setDrag ran a full QuizRunner
    // render (header, card, hint, buttons) before the style could land.
    if (moveRaf.current) return;
    moveRaf.current = requestAnimationFrame(() => {
      moveRaf.current = 0;
      setDrag(dragRef.current);
    });
  }
  function onCardPointerEnd() {
    if (!dragStart.current) return;
    dragStart.current = null;
    // A queued frame committing a stale mid-drag position after the snap-back
    // reset would make the card jump — drop it.
    if (moveRaf.current) {
      cancelAnimationFrame(moveRaf.current);
      moveRaf.current = 0;
    }
    setDragging(false);
    const { x, y } = dragRef.current;
    if (x > 90) fling("into", { x: 480, y });
    else if (x < -90) fling("pass", { x: -480, y });
    else if (y < -80) fling("curious", { x, y: -480 });
    else { dragRef.current = { x: 0, y: 0 }; setDrag({ x: 0, y: 0 }); }
  }

  function rate(interest: QuizInterest) {
    const entry: SexQuizRating = { interest };
    // Only record a role when the user actually picked one — don't coerce an
    // unspecified preference into "both" (which would fake a give/receive fit).
    if (card.role && interest !== "pass" && role) entry.role = role as QuizRole;
    setRatings((prev) => ({ ...prev, [card.id]: entry }));
    if (index + 1 < deck.length) {
      const next = deck[index + 1];
      setIndex(index + 1);
      setRole((ratings[next.id]?.role as QuizRole) || "");
    } else {
      setPhase("picks");
    }
  }

  function back() {
    if (index === 0) return;
    const prev = deck[index - 1];
    setIndex(index - 1);
    setRole((ratings[prev.id]?.role as QuizRole) || "");
  }

  // Move forward through already-rated cards WITHOUT re-rating them, so going
  // back to review an answer never forces a re-pick (which silently changed it).
  // Disabled on the unrated frontier (current card not yet rated) and the end.
  function next() {
    if (index + 1 >= deck.length || !ratings[card.id]) return;
    const upcoming = deck[index + 1];
    setIndex(index + 1);
    setRole((ratings[upcoming.id]?.role as QuizRole) || "");
  }

  function togglePick(id: string) {
    setTopPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const finalRatings = baseline ? mergedRatings : ratings;
      const finalPicks = topPicks.filter((id) => finalRatings[id]?.interest === "into");
      const next = await submitSexQuiz({ workspaceId: workspace.id, ratings: finalRatings, topPicks: finalPicks });
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
        <p className="eyebrow">New cards</p>
        <p className="rg-lead">
          <strong>{deck.length}</strong> new {deck.length === 1 ? "card" : "cards"} since you last played. Rate just these; your other answers and top turn-ons stay as they are.
        </p>
        <p className="rg-hint">
          🔒 Same rules: your passes stay private, and only what you both want shows up as a match.
        </p>
        <button type="button" className="rg-btn pressable" onClick={savedDraftCount > 0 ? resumeDraft : startFresh}>
          {savedDraftCount > 0 ? `Resume — ${savedDraftCount} rated` : "Rate the new cards"}
        </button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Not now</button>}
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="rg-pane">
        <p className="eyebrow">Build your desire map</p>
        <p className="rg-lead">
          {deck.length} cards, softest first — the full map of what turns you on. Mark each <strong>Pass</strong>, <strong>Curious</strong>, or <strong>Into it</strong>, and call who gives or receives where it fits.
        </p>
        <p className="rg-lead">
          Then pick your <strong>top 5 most-wanted</strong> — the highlights your partner sees first.
        </p>
        <p className="rg-hint">
          🔒 It&apos;s double-blind: nothing you pick shows to {workspace.members?.length ? "your partner" : "them"} until you&apos;ve <em>both</em> finished. Passes stay private.
        </p>
        <p className="rg-hint">
          No wrong answers — nothing&apos;s too much or too tame. Let the slut out; your passes never show, so be greedy.
        </p>
        <DesireStyles />
        {savedDraftCount > 0 ? (
          <>
            <button type="button" className="rg-btn pressable" onClick={resumeDraft}>
              Resume — {savedDraftCount} rated
            </button>
            <button type="button" className="btn-ghost" onClick={startFresh}>Start over</button>
          </>
        ) : (
          <button type="button" className="rg-btn pressable" onClick={startFresh}>
            Start
          </button>
        )}
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Not now</button>}
      </div>
    );
  }

  if (phase === "picks") {
    return (
      <div className="rg-pane is-tight">
        <p className="eyebrow">Your top turn-ons</p>
        <p className="rg-lead">
          Tap your <strong>5 most-wanted</strong> in order — first tap is your #1. These are the highlights your partner sees first.
        </p>
        {intoCards.length === 0 ? (
          <p className="rg-hint">
            You didn&apos;t mark anything &quot;Into it&quot; — that&apos;s okay. You can still reveal and compare.
          </p>
        ) : (
          <div className="rg-chips">
            {intoCards.map((c) => {
              const rank = topPicks.indexOf(c.id);
              const on = rank >= 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => togglePick(c.id)}
                  aria-pressed={on}
                  className="rg-chip"
                >
                  {on ? <strong className="rg-chip-rank">{rank + 1}.</strong> : null}{c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="rg-count">{topPicks.length} / 5 pinned</div>
        {error && <p className="rg-error">{error}</p>}
        <div className="rg-actions">
          <button type="button" className="btn-ghost" onClick={() => setPhase("cards")} disabled={submitting}>Back</button>
          <button type="button" className="rg-btn is-grow pressable" disabled={submitting} onClick={submit}>
            {submitting ? "Revealing…" : "Reveal to your partner"}
          </button>
        </div>
      </div>
    );
  }

  // phase === "cards"
  const pct = Math.round(((index + 1) / deck.length) * 100);
  const swipeHint = drag.x > 50 ? { label: "Into it", color: "var(--accent)" }
    : drag.x < -50 ? { label: "Pass", color: "var(--cream-muted)" }
    : drag.y < -45 ? { label: "Curious", color: "var(--cream)" }
    : null;
  const swipeOpacity = Math.min(1, Math.max(Math.abs(drag.x) / 90, drag.y < 0 ? -drag.y / 80 : 0));
  const savedInterest = ratings[card.id]?.interest;
  const nextDisabled = index + 1 >= deck.length || !savedInterest;
  return (
    <div className="rg-runner">
      <div className="rg-progress">
        <button type="button" className="rg-step" onClick={back} aria-label="Previous card" disabled={index === 0}>‹</button>
        <div className="rg-track">
          {/* scaleX, not width — a width transition re-runs layout every frame. */}
          <div className="rg-track-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="rg-count">{index + 1} / {deck.length}</div>
        <button type="button" className="rg-step" onClick={next} aria-label="Next card" disabled={nextDisabled}>›</button>
      </div>

      <div className="rg-stage">
        <div
          onPointerDown={onCardPointerDown}
          onPointerMove={onCardPointerMove}
          onPointerUp={onCardPointerEnd}
          onPointerCancel={onCardPointerEnd}
          className={`rg-card is-swipe${dragging ? " is-dragging" : ""}`}
          style={{ transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)` }}
        >
          {swipeHint && (
            <div aria-hidden="true" className="rg-swipe-hint" style={{ opacity: swipeOpacity, color: swipeHint.color }}>
              {swipeHint.label}
            </div>
          )}
          <div className="rg-card-kicker">
            {categoryTitle(card.category)}{card.edge ? " · Talk first" : ""}
          </div>
          <div className="rg-card-emoji">{card.emoji}</div>
          <div className="rg-card-title">{card.label}</div>
          <div className="rg-card-desc">{card.desc}</div>
          {card.role && (
            <>
              <div className="rg-card-label">I want to</div>
              <div className="rg-roles">
                {(["give", "receive", "both"] as QuizRole[]).map((r) => {
                  const on = role === r;
                  return (
                    <button key={r} type="button" className="rg-chip is-small rg-role" onClick={() => setRole(on ? "" : r)} aria-pressed={on}>
                      {r}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="rg-tip">
        Swipe ← pass · ↑ curious · into → — or tap
      </p>
      <div className="rg-answers">
        <button type="button" className={`rg-answer is-pass pressable${savedInterest && savedInterest !== "pass" ? " is-dim" : ""}`} aria-pressed={savedInterest === "pass"} onClick={() => rate("pass")}>Pass</button>
        <button type="button" className={`rg-answer pressable${savedInterest && savedInterest !== "curious" ? " is-dim" : ""}`} aria-pressed={savedInterest === "curious"} onClick={() => rate("curious")}>Curious</button>
        <button type="button" className={`rg-answer is-into pressable${savedInterest && savedInterest !== "into" ? " is-dim" : ""}`} aria-pressed={savedInterest === "into"} onClick={() => rate("into")}>Into it</button>
      </div>
    </div>
  );
}

// ---------- A new round ----------

// Answers freeze per round. After a reveal, any change starts a new round and
// both partners lock in again, so nobody can edit one card and watch what
// changes. Your saved answers carry over; keeping them is one tap.
function NewRound({ workspace, quiz, onUpdate }: { workspace: Workspace; quiz: SexQuizResponse; onUpdate: (next: SexQuizResponse) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (editing) return <QuizRunner workspace={workspace} onSubmitted={onUpdate} />;
  async function keep() {
    setBusy(true);
    setError("");
    try { onUpdate(await confirmSexQuiz(workspace.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't lock in. Try again."); }
    finally { setBusy(false); }
  }
  function change() {
    // Load last round's answers into the runner so changing one card doesn't
    // mean re-rating the whole deck.
    saveRunnerDraft("sex-quiz", workspace.id, { ratings: quiz.myRatings, topPicks: quiz.myTopPicks, index: 0, phase: "cards" });
    setEditing(true);
  }
  // A small change since the last reveal is the shape of a one-card probe, so
  // it gets a fresh look instead of a one-tap keep (server rule, see
  // functions/api/_reveal_round.js).
  const changed = typeof quiz.partnerChangedCount === "number" ? quiz.partnerChangedCount : null;
  const reanswer = Boolean(quiz.reanswerRequired);
  return (
    <div className="rg-pane is-centered" data-testid="quiz-new-round">
      <p className="rg-done-title">A new round is open</p>
      {changed !== null && changed > 0 && (
        <p className="rg-done-body" data-testid="quiz-partner-changed">
          {`${quiz.partnerName || "Your partner"} changed ${changed} ${changed === 1 ? "answer" : "answers"} since last time.`}
        </p>
      )}
      {reanswer ? (
        <p className="rg-done-body">
          Look over yours before you lock in, so you know exactly what the next reveal will show.
        </p>
      ) : (
        <p className="rg-done-body">
          Your answers from last time are saved. Keep them as they are, or change anything first. The next reveal opens once you&apos;re both in.
        </p>
      )}
      {reanswer ? (
        <button type="button" className="rg-btn pressable" disabled={busy} onClick={change}>Look over my answers</button>
      ) : (
        <>
          <button type="button" className="rg-btn pressable" disabled={busy} onClick={keep}>
            {busy ? "Locking in…" : "Keep my answers"}
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={change}>Change my answers</button>
        </>
      )}
      {error && <p className="rg-error" role="alert">{error}</p>}
    </div>
  );
}

function revealOpensLabel(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// ---------- Waiting for partner ----------

// Shown once someone has submitted but the deck has grown since.
function NewCardsPrompt({ quiz, onRateNew }: { quiz: SexQuizResponse; onRateNew: () => void }) {
  const count = useMemo(() => unratedQuizCards(quiz.myRatings).length, [quiz.myRatings]);
  if (count === 0) return null;
  return (
    <div className="quiz-new-cards rg-panel is-row">
      <div className="rg-panel-main">
        <p className="rg-panel-title">{count} new {count === 1 ? "card" : "cards"} to rate</p>
        <p className="rg-panel-body">The deck grew since you played. Your other answers stay.</p>
      </div>
      <button type="button" className="rg-btn is-compact pressable" onClick={onRateNew}>
        Rate them
      </button>
    </div>
  );
}

function Waiting({ workspace, quiz, onUpdate, onRateNew, onChangeAnswers }: { workspace: Workspace; quiz: SexQuizResponse; onUpdate: (next: SexQuizResponse) => void; onRateNew: () => void; onChangeAnswers: () => void }) {
  const [showMine, setShowMine] = useState(false);
  const hasPicks = (quiz.myTopPicks?.length || 0) > 0;
  // Open the pinner by default when nothing's pinned yet — this is the step
  // people miss at the end of the quiz, so make it the first thing waiting here.
  const [editPicks, setEditPicks] = useState(!hasPicks);
  return (
    <div className="rg-pane is-centered">
      <div className="rg-done-emoji">🔒</div>
      <p className="rg-done-title">Your answers are locked in</p>
      <NewCardsPrompt quiz={quiz} onRateNew={onRateNew} />
      {quiz.revealOpensAt ? (
        <p className="rg-done-body" data-testid="quiz-reveal-opens">
          You&apos;re both in. A new reveal opens a day after the last one, so this one opens {revealOpensLabel(quiz.revealOpensAt)}.
        </p>
      ) : (
        <p className="rg-done-body">
          {quiz.partnerName || "Your partner"}&apos;s answers stay hidden until they finish too — but you can always look back at your own.
        </p>
      )}
      <button type="button" className="btn-ghost" onClick={() => setEditPicks((v) => !v)} aria-expanded={editPicks}>
        {hasPicks ? (editPicks ? "Done editing turn-ons" : "Edit my top turn-ons") : (editPicks ? "Hide" : "Pick my top turn-ons")}
      </button>
      {editPicks && <TopPicksEditor workspace={workspace} quiz={quiz} onUpdate={onUpdate} />}
      <button type="button" className="btn-ghost" onClick={() => setShowMine((v) => !v)} aria-expanded={showMine}>
        {showMine ? "Hide my answers" : "View my answers"}
      </button>
      {showMine && <MyAnswers quiz={quiz} />}
      <EdgePassToLimits workspace={workspace} quiz={quiz} />
      <button type="button" className="btn-ghost mt-2" onClick={onChangeAnswers} data-testid="quiz-change-answers">
        Change my answers
      </button>
    </div>
  );
}

// Pin / re-pin your top turn-ons after submitting, without re-rating the deck —
// the fix for "I never got to pick my top 5." Saves only this actor's picks via
// set_top_picks; ratings, status, and the reveal are untouched.
function TopPicksEditor({ workspace, quiz, onUpdate }: { workspace: Workspace; quiz: SexQuizResponse; onUpdate: (next: SexQuizResponse) => void }) {
  const intoCards = useMemo(
    () => Object.entries(quiz.myRatings)
      .filter(([, r]) => r.interest === "into")
      .map(([id]) => QUIZ_CARD_BY_ID[id])
      .filter((c): c is QuizCard => Boolean(c)),
    [quiz.myRatings],
  );
  const [picks, setPicks] = useState<string[]>(quiz.myTopPicks || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const original = quiz.myTopPicks || [];
  const dirty = picks.length !== original.length || picks.some((id) => !original.includes(id));

  function toggle(id: string) {
    setSaved(false);
    setPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev));
  }
  async function save() {
    setSaving(true);
    try {
      onUpdate(await setSexQuizTopPicks({ workspaceId: workspace.id, topPicks: picks }));
      setSaved(true);
    } catch { /* best-effort; the chips just stay as-is on failure */ }
    finally { setSaving(false); }
  }

  if (intoCards.length === 0) {
    return (
      <p className="rg-hint max-w-[34ch]">
        You didn&apos;t mark anything &quot;Into it&quot; yet — redo the quiz to add some, then pin your favorites here.
      </p>
    );
  }
  return (
    <div className="rg-panel">
      <p className="eyebrow">Your top turn-ons</p>
      <p className="rg-hint">
        Tap up to 5 in order — first tap is your #1. The highlights {quiz.partnerName || "your partner"} sees first.
      </p>
      <div className="rg-chips">
        {intoCards.map((c) => {
          const rank = picks.indexOf(c.id);
          const on = rank >= 0;
          return (
            <button key={c.id} type="button" className="rg-chip" onClick={() => toggle(c.id)} aria-pressed={on}>
              {on ? <strong className="rg-chip-rank">{rank + 1}.</strong> : null}{c.emoji} {c.label}
            </button>
          );
        })}
      </div>
      <div className="rg-panel-foot">
        <span className="rg-count">{picks.length} / 5 pinned</span>
        <button type="button" className="rg-btn is-compact pressable" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Read-only view of your own answers — your pinned turn-ons plus how you rated
// every card. Available while waiting (and in the reveal) so you never have to
// retake just to remember what you said.
function MyAnswers({ quiz }: { quiz: SexQuizResponse }) {
  const rows = fullAnswerRows(quiz.myRatings);
  if (rows.length === 0) {
    return (
      <p className="rg-hint">You didn&apos;t rate any cards.</p>
    );
  }
  return (
    <div className="rg-stack">
      <TopTurnOns name="Your" cardIds={quiz.myTopPicks} ranked />
      <section>
        <p className="eyebrow">Your answers</p>
        <div className="rg-list">
          {rows.map(({ card, rating }) => (
            <div key={card.id} className="rg-list-row">
              <span className="rg-list-emoji">{card.emoji}</span>
              <span className="rg-list-label">{card.label}</span>
              <span className="rg-list-meta" style={{ color: interestColor(rating.interest) }}>
                {interestLabel(rating.interest)}{rating.role ? ` · ${rating.role}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Reveal ----------

function Reveal({ workspace, quiz, onUpdate, onRateNew, onChangeAnswers }: { workspace: Workspace; quiz: SexQuizResponse; onUpdate: (next: SexQuizResponse) => void; onRateNew: () => void; onChangeAnswers: () => void }) {
  // The reveal opens at the top, not wherever the last screen was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  const fits = quiz.matches.filter((m) => m.complementary).length;
  const overlapByCategory = useMemo(
    () => quizOverlapByCategory(quiz.matches, quiz.curiousTogether),
    [quiz.matches, quiz.curiousTogether],
  );
  const maxOverlap = overlapByCategory.reduce((max, c) => Math.max(max, c.matches + c.curious), 0);
  const partnerName = quiz.partnerName || "your partner";
  const [editPicks, setEditPicks] = useState(false);

  return (
    <div className="rg-reveal">
      <NewCardsPrompt quiz={quiz} onRateNew={onRateNew} />
      <div>
        <p className="rg-reveal-title">{quiz.matches.length ? "What you both want" : "Your reveal is open"}</p>
        <p className="rg-reveal-body">
          {quiz.matches.length
            ? <>You both lit up on <strong>{quiz.matches.length}</strong> of the same desires{fits > 0 ? <> and <strong>{fits}</strong> are a perfect give/receive fit.</> : "."}</>
            : <>No shared &ldquo;into it&rdquo; this round. Anything you&apos;re both curious about is below.</>}
        </p>
      </div>

      {overlapByCategory.length > 1 && (
        <details className="sync-breakdown">
          <summary>Where you overlap most</summary>
          <ul>
            {overlapByCategory.map((c) => (
              <li key={c.category}>
                <span className="sync-breakdown-title">{c.title}</span>
                <span className="sync-breakdown-bar" aria-hidden="true"><span style={{ transform: `scaleX(${(c.matches + c.curious) / maxOverlap})` }} /></span>
                <span className="sync-breakdown-value">{c.matches} into{c.curious ? ` · ${c.curious} curious` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <TopTurnOns name={partnerName} cardIds={quiz.partnerTopPicks} ranked caption={`What ${partnerName} craves most — with you.`} />

      {quiz.matches.length > 0 && (
        <section>
          <p className="eyebrow">Matches · both into it · tap to propose</p>
          <div className="rg-list">
            {quiz.matches.map((m) => {
              const card = QUIZ_CARD_BY_ID[m.cardId];
              if (!card) return null;
              return (
                <SeedLink key={m.cardId} source="quiz" acts={[card.label]} note={`From our Sex Quiz: ${card.label}`} className="rg-list-row pressable">
                  <span className="rg-list-emoji">{card.emoji}</span>
                  <span className="rg-list-label">{card.label}</span>
                  <span className="rg-list-meta" style={{ color: m.complementary ? "var(--accent)" : "var(--cream-faint)" }}>
                    {roleTag(m)}
                  </span>
                  <span aria-hidden="true" className="rg-list-chevron">›</span>
                </SeedLink>
              );
            })}
          </div>
        </section>
      )}

      {quiz.curiousTogether.length > 0 && (
        <section>
          <p className="eyebrow">Curious together · tap to propose</p>
          <div className="rg-chips mt-2">
            {quiz.curiousTogether.map(({ cardId }) => {
              const card = QUIZ_CARD_BY_ID[cardId];
              if (!card) return null;
              return <SeedLink key={cardId} source="quiz" acts={[card.label]} note={`Curious together, from our Sex Quiz: ${card.label}`} className="rg-chip is-small pressable">{card.emoji} {card.label}</SeedLink>;
            })}
          </div>
        </section>
      )}

      <p className="rg-note">
        🔒 Passes &amp; limits stay private — never shown to {partnerName} as a &quot;no&quot;.
      </p>

      {quiz.matches.length > 0 && (
        <MatchActions
          workspaceId={workspace.id}
          source="quiz"
          acts={topMatchLabels(quiz)}
          note={askNote(quiz)}
          lead="Something new you both want. Make it an Ask whenever it feels right."
        />
      )}

      <LightsThemUp workspace={workspace} quiz={quiz} />

      {quiz.partnerRatings && (
        <section>
          <p className="eyebrow">{partnerName}&apos;s full answers</p>
          <div className="rg-list">
            {fullAnswerRows(quiz.partnerRatings).map(({ card, rating }) => (
              <div key={card.id} className="rg-list-row">
                <span className="rg-list-emoji">{card.emoji}</span>
                <span className="rg-list-label">{card.label}</span>
                <span className="rg-list-meta" style={{ color: interestColor(rating.interest) }}>
                  {interestLabel(rating.interest)}{rating.role ? ` · ${rating.role}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <FullRevealToggle workspace={workspace} quiz={quiz} onUpdate={onUpdate} />

      <button type="button" className="btn-ghost" onClick={() => setEditPicks((v) => !v)} aria-expanded={editPicks}>
        {editPicks ? "Done editing turn-ons" : "Edit my top turn-ons"}
      </button>
      {editPicks && <TopPicksEditor workspace={workspace} quiz={quiz} onUpdate={onUpdate} />}

      <button type="button" className="btn-ghost" onClick={onChangeAnswers} data-testid="quiz-change-answers">
        Change my answers
      </button>
      <p className="rg-note">
        Your answers carry over, so change only what you want. A change starts a new round: you both lock in again, and the next reveal opens a day after this one.
      </p>
    </div>
  );
}

// What lights them up: the partner's wants that you share, offered as ideas if
// you feel like spoiling them. Only mutual matches ever appear (never a want of
// theirs you didn't match), there are no counts, and it starts closed. Your own
// side sits right next to it so the giving runs both ways.
const LIGHTS_PREF_KEY = "ss:lights-them-up";

function LightsThemUp({ workspace, quiz }: { workspace: Workspace; quiz: SexQuizResponse }) {
  const partnerName = quiz.partnerName || "your partner";
  // Rendered only after the quiz loads on the client, so reading storage in the
  // initializer can't mismatch a server render.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(`${LIGHTS_PREF_KEY}:${workspace.id}`) === "1"; } catch { return false; }
  });
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(`${LIGHTS_PREF_KEY}:${workspace.id}`, next ? "1" : "0"); } catch { /* per-device only */ }
  }
  const giver = (role: string) => role === "give" || role === "both";
  const receiver = (role: string) => role === "receive" || role === "both";
  const theirs = quiz.matches.filter((m) => quiz.partnerTopPicks.includes(m.cardId) || (m.complementary && receiver(m.partnerRole) && giver(m.myRole)));
  const yours = quiz.matches.filter((m) => quiz.myTopPicks.includes(m.cardId) || (m.complementary && receiver(m.myRole) && giver(m.partnerRole)));
  if (theirs.length === 0 && yours.length === 0) return null;
  const chip = (cardId: string, note: string) => {
    const card = QUIZ_CARD_BY_ID[cardId];
    if (!card) return null;
    return (
      <SeedLink key={cardId} source="lights-them-up" acts={[card.label]} note={`${note} ${card.label}`} className="rg-chip is-small pressable">
        {card.emoji} {card.label}
      </SeedLink>
    );
  };
  return (
    <section className="rg-panel is-quiet lights-them-up" data-testid="lights-them-up">
      <button type="button" className="lights-them-up-toggle pressable" aria-expanded={open} onClick={toggle}>
        <span>What lights {partnerName} up</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="lights-them-up-body">
          {theirs.length > 0 && (
            <>
              <p className="rg-panel-body">Ideas {partnerName} is into that you&apos;re into too, if you&apos;re ever in the mood to spoil them.</p>
              <div className="rg-chips">{theirs.map((m) => chip(m.cardId, "Something I'd love to give you:"))}</div>
            </>
          )}
          {yours.length > 0 && (
            <>
              <p className="rg-panel-body">And what lights you up, that {partnerName} wants too. Ask for yours as freely as you give.</p>
              <div className="rg-chips">{yours.map((m) => chip(m.cardId, "Something I'd love from you:"))}</div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// The labels a "Make it an Ask" carries: give/receive fits first, then the
// partner's pinned favorites, then the rest. A few, not the whole list.
function topMatchLabels(quiz: SexQuizResponse): string[] {
  const ranked = [...quiz.matches].sort((a, b) => {
    const score = (m: typeof a) => (m.complementary ? 2 : 0) + (quiz.partnerTopPicks.includes(m.cardId) ? 1 : 0);
    return score(b) - score(a);
  });
  return ranked.slice(0, 3).map((m) => QUIZ_CARD_BY_ID[m.cardId]?.label).filter((label): label is string => Boolean(label));
}

function FullRevealToggle({ workspace, quiz, onUpdate }: { workspace: Workspace; quiz: SexQuizResponse; onUpdate: (next: SexQuizResponse) => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try { onUpdate(await setSexQuizFullReveal({ workspaceId: workspace.id, on: !quiz.fullRevealMine })); }
    catch { /* best-effort; toggle simply stays put on failure */ }
    finally { setBusy(false); }
  }
  const both = Boolean(quiz.fullRevealOpen);
  return (
    <div className="rg-panel is-quiet">
      <p className="rg-panel-title">Open the full deck to each other?</p>
      <p className="rg-panel-body">
        {both ? "You're both open — every answer is visible above." : quiz.fullRevealMine ? `Waiting for ${quiz.partnerName || "your partner"} to opt in too.` : "Only if you both choose to — then you'll each see every rating, not just the matches."}
      </p>
      {!both && (
        <button type="button" className={`${quiz.fullRevealMine ? "rg-chip is-small" : "rg-btn is-compact"} mt-2.5 self-start pressable`} disabled={busy} onClick={toggle}>
          {quiz.fullRevealMine ? "You're in — undo" : "I'm open to it"}
        </button>
      )}
    </div>
  );
}

function EdgePassToLimits({ workspace, quiz }: { workspace: Workspace; quiz: SexQuizResponse }) {
  const edgePasses = useMemo(
    () => Object.entries(quiz.myRatings).filter(([id, r]) => r.interest === "pass" && QUIZ_CARD_BY_ID[id]?.edge).map(([id]) => id),
    [quiz.myRatings],
  );
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (edgePasses.length === 0 || done) return null;
  async function fileThem() {
    setBusy(true);
    setError("");
    try {
      for (const id of edgePasses) {
        const card = QUIZ_CARD_BY_ID[id];
        if (card) await createBoundary({ workspaceId: workspace.id, text: card.label, type: "Soft Limit" });
      }
      setDone(true);
    } catch {
      // createBoundary throws in a locked Room-Encryption workspace and on
      // network errors; some boundaries may already be saved (createBoundary
      // dedups, so a retry is safe).
      setError("Couldn't save them all. If Room Encryption is on, unlock it in Privacy, then try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rg-edge">
      <button type="button" className="rg-chip is-small mt-1 pressable" disabled={busy} onClick={fileThem}>
        {busy ? "Saving…" : `File ${edgePasses.length} hard-pass${edgePasses.length === 1 ? "" : "es"} as Limits`}
      </button>
      {error && <span className="rg-error">{error}</span>}
    </div>
  );
}

function roleTag(m: { myRole: string; partnerRole: string; complementary: boolean }): string {
  if (m.complementary && m.myRole && m.partnerRole) {
    if (m.myRole === "both" && m.partnerRole === "both") return "✨ you both switch";
    const mine = m.myRole === "both" ? "give & receive" : m.myRole;
    const theirs = m.partnerRole === "both" ? "give & receive" : m.partnerRole;
    return `✨ you ${mine} · them ${theirs}`;
  }
  if (m.myRole && m.partnerRole && m.myRole === m.partnerRole) return `both ${m.myRole === "both" ? "switch" : m.myRole}`;
  return "both";
}

function askNote(quiz: SexQuizResponse): string {
  const labels = topMatchLabels(quiz);
  return labels.length ? `From our Sex Quiz: ${labels.join(", ")}` : "From our Sex Quiz";
}

const INTEREST_ORDER: Record<string, number> = { into: 0, curious: 1, pass: 2 };

function fullAnswerRows(ratings: Record<string, SexQuizRating>): Array<{ card: QuizCard; rating: SexQuizRating }> {
  return Object.entries(ratings)
    .map(([id, rating]) => ({ card: QUIZ_CARD_BY_ID[id], rating }))
    .filter((row): row is { card: QuizCard; rating: SexQuizRating } => Boolean(row.card))
    .sort((a, b) => (INTEREST_ORDER[a.rating.interest] ?? 3) - (INTEREST_ORDER[b.rating.interest] ?? 3));
}

function interestLabel(interest: string): string {
  return interest === "into" ? "Into it" : interest === "curious" ? "Curious" : "Pass";
}

function interestColor(interest: string): string {
  if (interest === "into") return "var(--accent)";
  if (interest === "curious") return "var(--cream-muted)";
  return "var(--cream-faint)";
}
