"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import AskCounterSheet from "@/components/AskCounterSheet";
import { splitActLabel } from "@/lib/act-label";
import { announce } from "@/lib/announce";
import { PASS_REASSURANCES, rainCheckTimeFor } from "@/lib/pass-reassurance";
import type { Act, Decision, Filming, PassNoteId, Timing } from "@/lib/types";

export type ReplyDecisionPayload = {
  label: string;
  decision: Decision;
  counter?: string;
  note?: string;
  targetType?: "act" | "timing" | "filming" | "general";
  actId?: string;
  counterActId?: string;
};

export type QuickReply = "yes" | "maybe" | "pass";
export type ReplyKind = QuickReply | "counter";
// The optional reassurance a pass can carry (research rec #2). Choosing none
// sends a plain pass, which the asker still reads as warm.
export type PassExtra = { passNote?: PassNoteId; rainCheckAt?: string };

// How long a one-tap answer waits before it is sent. Long enough to catch a
// mis-tap, short enough that walking away doesn't leave it unsent (it also
// flushes immediately if the screen is left or hidden).
export const REPLY_UNDO_MS = 4000;
// A pass holds a little longer so the optional reassurance chips can be read.
// Tapping one sends at once; the pass itself never needs more than one tap.
export const PASS_UNDO_MS = 8000;

function undoWindowMs(kind: QuickReply) {
  return kind === "pass" ? PASS_UNDO_MS : REPLY_UNDO_MS;
}

const QUICK_COPY: Record<QuickReply, { pending: string; sending: string }> = {
  yes: { pending: "Sending your yes", sending: "Sending your yes…" },
  maybe: { pending: "Saving your maybe", sending: "Saving your maybe…" },
  pass: { pending: "Sending your pass", sending: "Sending your pass…" },
};

export function allActDecisions(requested: string[], decision: "Yes" | "No"): ReplyDecisionPayload[] {
  const labels = requested.length ? requested : ["This Ask"];
  return labels.map((label) => ({
    label,
    decision,
    counter: "",
    note: "",
    targetType: "act" as const,
    actId: "",
    counterActId: "",
  }));
}

/**
 * The top of every Ask view: who it's from, the requested Acts as the hero,
 * then timing, filming and the note. Shared by the reply card and the
 * read-only summary so an Ask always reads the same way.
 */
export function AskHero({
  headingId,
  headingRef,
  kicker,
  heading,
  categories,
  chips,
  note,
  noteAuthor,
  limits,
}: {
  headingId: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  kicker: ReactNode;
  heading: string;
  categories: string[];
  chips: ReactNode;
  note?: string;
  noteAuthor: string;
  limits?: string[];
}) {
  return (
    <div className="reply-hero">
      <p className="kicker reply-hero-kicker">{kicker}</p>
      <h1 id={headingId} ref={headingRef} tabIndex={-1} className="reply-hero-title">
        {heading}
      </h1>
      {categories.length > 0 ? (
        <ul className="reply-acts" aria-label="Requested Acts">
          {categories.map((label, index) => {
            const { emoji, text } = splitActLabel(label);
            return (
              <li key={`${label}-${index}`} className="reply-act">
                <span className="reply-act-emoji" aria-hidden="true">{emoji || "•"}</span>
                <span className="reply-act-name">{text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="reply-acts-empty">No Acts picked, just the note.</p>
      )}
      <div className="reply-chips">{chips}</div>
      {note && (
        <figure className="reply-note">
          <figcaption className="reply-note-label">{noteAuthor}</figcaption>
          <blockquote className="reply-note-text">{note}</blockquote>
        </figure>
      )}
      {limits && limits.length > 0 && (
        <div className="reply-limits">
          <p className="reply-limits-label">Limits touched</p>
          <ul>
            {limits.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The Ask reply as one focused card. Three one-tap answers sit in the thumb
 * zone (Pass, Maybe, Yes); each holds for a short undo window before it is
 * sent. Counter opens a sheet with the Act grid, timing and a note.
 */
export default function AskReplyCard({
  partnerName,
  kicker,
  categories,
  timing,
  filming,
  note,
  limits,
  acts,
  isMaybe = false,
  allowMaybe,
  onCreateAct,
  onSubmit,
  onMaybe,
}: {
  partnerName: string;
  kicker: ReactNode;
  categories: string[];
  timing: Timing;
  filming: Filming;
  note?: string;
  limits?: string[];
  acts: Act[];
  // The Ask is already a maybe: this is the "decide now" pass.
  isMaybe?: boolean;
  allowMaybe: boolean;
  onCreateAct: (label: string) => Promise<Act>;
  // Resolve = sent (or queued); reject = show the error and stay on the card.
  onSubmit: (decisions: ReplyDecisionPayload[], note: string, kind: ReplyKind, extra?: PassExtra) => Promise<void>;
  onMaybe?: () => Promise<void>;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const counterButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const answersRef = useRef<HTMLDivElement>(null);
  // The answer that was just undone, so focus can go back to its button.
  const [undone, setUndone] = useState<QuickReply | null>(null);
  const [pending, setPending] = useState<QuickReply | null>(null);
  const [sending, setSending] = useState<ReplyKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [remaining, setRemaining] = useState(Math.ceil(REPLY_UNDO_MS / 1000));
  const multi = categories.length > 1;
  const yesLabel = multi ? "Yes to all" : "Yes";

  // Focus starts on the card heading so a screen reader hears who and what.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const commit = useCallback(async (kind: QuickReply, extra?: PassExtra) => {
    setPending(null);
    setSending(kind);
    setError(null);
    try {
      if (kind === "maybe") {
        if (!onMaybe) throw new Error("Maybe isn't available here.");
        await onMaybe();
      } else {
        await onSubmit(allActDecisions(categories, kind === "yes" ? "Yes" : "No"), "", kind, kind === "pass" ? extra : undefined);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't send your answer. Try again.");
      setSending(null);
    }
  }, [categories, onMaybe, onSubmit]);

  // Latest pending + commit for the flush-on-leave paths below.
  const pendingRef = useRef<QuickReply | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => {
    pendingRef.current = pending;
    commitRef.current = commit;
  }, [pending, commit]);

  // The undo window. Counting down in whole seconds; the bar drains in CSS.
  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const windowMs = undoWindowMs(pending);
    const tick = window.setInterval(() => {
      setRemaining(Math.max(1, Math.ceil((windowMs - (Date.now() - startedAt)) / 1000)));
    }, 250);
    const fire = window.setTimeout(() => {
      commitRef.current(pending);
    }, windowMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fire);
    };
  }, [pending]);

  // The tapped button is swapped for the undo bar: carry focus with it, and
  // back to that answer's button after an Undo.
  useEffect(() => {
    if (pending) undoButtonRef.current?.focus({ preventScroll: true });
  }, [pending]);
  useEffect(() => {
    if (!undone) return;
    answersRef.current?.querySelector<HTMLButtonElement>(`[data-testid="ask-reply-${undone}"]`)?.focus({ preventScroll: true });
  }, [undone]);

  // Leaving or hiding the screen mid-window sends the answer rather than
  // silently dropping it: the tap was the decision, the window is only for
  // catching a mistake.
  useEffect(() => {
    function flush() {
      const kind = pendingRef.current;
      if (!kind) return;
      pendingRef.current = null;
      commitRef.current(kind);
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function choose(kind: QuickReply) {
    if (sending) return;
    setError(null);
    if (navigator.vibrate) navigator.vibrate(6);
    setRemaining(Math.ceil(undoWindowMs(kind) / 1000));
    setUndone(null);
    setPending(kind);
  }

  async function submitCounter(decisions: ReplyDecisionPayload[], counterNote: string) {
    setSending("counter");
    setError(null);
    try {
      await onSubmit(decisions, counterNote, "counter");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't send your counter. Try again.");
      setSending(null);
    }
  }

  const busy = Boolean(sending);
  const statusText = pending
    ? `${QUICK_COPY[pending].pending}. Undo within ${Math.ceil(undoWindowMs(pending) / 1000)} seconds.`
    : sending && sending !== "counter"
      ? QUICK_COPY[sending].sending
      : "";

  // Spoken through the app's one polite announcer (no second live region).
  useEffect(() => {
    if (statusText) announce(statusText);
  }, [statusText]);

  return (
    <section className="reply-card-stage" aria-labelledby={headingId}>
      <div className="reply-card-wrap">
        <article className="reply-card">
          <AskHero
            headingId={headingId}
            headingRef={headingRef}
            kicker={kicker}
            heading={`${partnerName} wants`}
            categories={categories}
            chips={(
              <>
                <span className="chip">{timing}</span>
                <span className="chip">{filming === "Yes" ? "Filming ok" : "No filming"}</span>
              </>
            )}
            note={note}
            noteAuthor={`${partnerName}'s note`}
            limits={limits}
          />
          {isMaybe && (
            <p className="reply-maybe-line">
              You said maybe earlier. Decide now, or leave it for later.
            </p>
          )}
        </article>
      </div>

      <div className="reply-decide">
        {error && <p className="reply-error" role="alert">{error}</p>}
        {pending ? (
          <div className="reply-undo" data-kind={pending}>
            <div className="reply-undo-copy">
              <span className="reply-undo-label">{QUICK_COPY[pending].pending}</span>
              <span className="reply-undo-count" aria-hidden="true">{remaining}s</span>
            </div>
            <div className="reply-undo-track" aria-hidden="true">
              <div className="reply-undo-fill" style={{ animationDuration: `${undoWindowMs(pending)}ms` }} />
            </div>
            {pending === "pass" && (
              <div className="reply-pass-notes" role="group" aria-labelledby={`${headingId}-pass-notes`}>
                <p id={`${headingId}-pass-notes`} className="reply-pass-notes-label">
                  Add a few warm words for {partnerName}? Optional.
                </p>
                <div className="reply-pass-chips">
                  {PASS_REASSURANCES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="reply-pass-chip pressable"
                      data-testid={`ask-pass-note-${item.id}`}
                      onClick={() => {
                        const at = item.rainCheck ? rainCheckTimeFor(item.id) : null;
                        commit("pass", { passNote: item.id, ...(at ? { rainCheckAt: at.toISOString() } : {}) });
                      }}
                    >
                      {item.chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="reply-undo-actions">
              <button
                ref={undoButtonRef}
                type="button"
                className="rg-answer pressable"
                onClick={() => {
                  setUndone(pending);
                  setPending(null);
                }}
                data-testid="ask-reply-undo"
              >
                Undo
              </button>
              <button type="button" className="rg-answer is-into pressable" onClick={() => commit(pending)} data-testid="ask-reply-send-now">
                Send now
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              ref={counterButtonRef}
              type="button"
              className="reply-counter-open pressable"
              onClick={() => setSheetOpen(true)}
              disabled={busy}
              aria-haspopup="dialog"
              data-testid="ask-reply-counter"
            >
              {busy && sending === "counter" ? "Sending counter…" : "Counter with something else"}
            </button>
            <div ref={answersRef} className="rg-answers reply-answers" role="group" aria-label="Your answer">
              <button
                type="button"
                className="rg-answer is-pass pressable"
                onClick={() => choose("pass")}
                disabled={busy}
                data-testid="ask-reply-pass"
              >
                {sending === "pass" ? "Sending…" : "Pass"}
              </button>
              {allowMaybe && onMaybe && (
                <button
                  type="button"
                  className="rg-answer pressable"
                  onClick={() => choose("maybe")}
                  disabled={busy}
                  data-testid="ask-reply-maybe"
                >
                  {sending === "maybe" ? "Saving…" : "Maybe"}
                </button>
              )}
              <button
                type="button"
                className="rg-answer is-into pressable"
                onClick={() => choose("yes")}
                disabled={busy}
                data-testid="ask-reply-yes"
              >
                {sending === "yes" ? "Sending…" : yesLabel}
              </button>
            </div>
          </>
        )}
      </div>

      <AskCounterSheet
        open={sheetOpen}
        partnerName={partnerName}
        requested={categories}
        requestedTiming={timing}
        acts={acts}
        submitting={sending === "counter"}
        error={sheetOpen ? error : null}
        onClose={() => {
          setSheetOpen(false);
          requestAnimationFrame(() => counterButtonRef.current?.focus());
        }}
        onCreateAct={onCreateAct}
        onSubmit={submitCounter}
      />
    </section>
  );
}
