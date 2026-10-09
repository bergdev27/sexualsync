"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { splitActLabel } from "@/lib/act-label";
import type { Act, Timing } from "@/lib/types";
import type { ReplyDecisionPayload } from "@/components/AskReplyCard";

const COLLAPSED_ACT_COUNT = 10;
const TIMINGS: Timing[] = ["Tonight", "Mid-day", "Tomorrow", "Next week"];

function actKey(label: string) {
  return splitActLabel(label).text.trim().toLowerCase();
}

/**
 * Build the reply payload for a counter. Kept Acts answer "Yes", each offered
 * Act is a Counter decision, and a new time is a timing Counter. A time-only
 * counter with nothing kept means "yes, but at another time", so every
 * requested Act answers Yes (the long-standing reply contract).
 */
export function buildCounterDecisions({
  requested,
  requestedTiming,
  keptActs,
  counterActs,
  counterTiming,
}: {
  requested: string[];
  requestedTiming: Timing;
  keptActs: string[];
  counterActs: Act[];
  counterTiming: Timing | "";
}): ReplyDecisionPayload[] {
  const yesLabels = counterActs.length === 0 && keptActs.length === 0 && counterTiming
    ? requested
    : requested.filter((label) => keptActs.includes(label));
  const decisions: ReplyDecisionPayload[] = yesLabels.map((label) => ({
    label,
    decision: "Yes",
    counter: "",
    note: "",
    targetType: "act",
    actId: "",
    counterActId: "",
  }));
  counterActs.forEach((act, index) => {
    decisions.push({
      label: `Counter option ${index + 1}`,
      decision: "Counter",
      counter: act.label,
      note: "",
      targetType: "act",
      actId: "",
      counterActId: act.id,
    });
  });
  if (counterTiming) {
    decisions.push({
      label: `Timing: ${requestedTiming}`,
      decision: "Counter",
      counter: counterTiming,
      note: "",
      targetType: "timing",
      actId: "",
      counterActId: "",
    });
  }
  return decisions;
}

/**
 * The Counter step of an Ask reply. A native <dialog> opened with
 * showModal(): it traps focus, closes on Escape, and keeps the reply card
 * inert behind it. Focus lands on the first control and returns to the
 * opener (handled by the caller's onClose).
 */
export default function AskCounterSheet({
  open,
  partnerName,
  requested,
  requestedTiming,
  acts,
  submitting,
  error,
  onClose,
  onCreateAct,
  onSubmit,
}: {
  open: boolean;
  partnerName: string;
  requested: string[];
  requestedTiming: Timing;
  acts: Act[];
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onCreateAct: (label: string) => Promise<Act>;
  onSubmit: (decisions: ReplyDecisionPayload[], note: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [keptActs, setKeptActs] = useState<string[]>([]);
  const [selectedCounterActIds, setSelectedCounterActIds] = useState<string[]>([]);
  const [actsExpanded, setActsExpanded] = useState(false);
  const [actSearch, setActSearch] = useState("");
  const [actComposerOpen, setActComposerOpen] = useState(false);
  const [counterTiming, setCounterTiming] = useState<Timing | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // showModal focuses the first focusable element; pin it explicitly so
      // it's the first decision rather than whatever the browser picks.
      requestAnimationFrame(() => firstControlRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The offered grid never repeats what was already asked for.
  const offerableActs = useMemo(() => {
    const asked = new Set(requested.map(actKey));
    return acts.filter((act) => !asked.has(actKey(act.label)));
  }, [acts, requested]);
  const selectedCounterActs = useMemo(
    () => selectedCounterActIds
      .map((id) => offerableActs.find((act) => act.id === id))
      .filter((act): act is Act => Boolean(act)),
    [offerableActs, selectedCounterActIds],
  );
  const filteredActs = useMemo(() => {
    const query = actSearch.trim().toLowerCase();
    if (!query) return offerableActs;
    return offerableActs.filter((act) => act.label.toLowerCase().includes(query) || act.tags?.some((tag) => tag.includes(query)));
  }, [actSearch, offerableActs]);
  // Stable order: the collapsed grid is the first N in library order, plus any
  // picked Act from further down appended in place. Nothing moves under the
  // finger when a chip is picked.
  const visibleActs = useMemo(() => {
    if (actsExpanded) return filteredActs;
    const selected = new Set(selectedCounterActIds);
    return offerableActs.filter((act, index) => index < COLLAPSED_ACT_COUNT || selected.has(act.id));
  }, [actsExpanded, filteredActs, offerableActs, selectedCounterActIds]);
  const timingOptions = TIMINGS.filter((option) => option !== requestedTiming);
  const canSend = !submitting && (selectedCounterActs.length > 0 || Boolean(counterTiming));

  function toggleKept(label: string) {
    setKeptActs((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
  }

  function toggleCounterAct(id: string) {
    setSelectedCounterActIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreateAct(label: string) {
    const act = await onCreateAct(label);
    setSelectedCounterActIds((prev) => (prev.includes(act.id) ? prev : [...prev, act.id]));
    setActComposerOpen(false);
    setActsExpanded(false);
    setActSearch("");
    if (navigator.vibrate) navigator.vibrate(4);
  }

  function send() {
    if (!canSend) return;
    onSubmit(
      buildCounterDecisions({ requested, requestedTiming, keptActs, counterActs: selectedCounterActs, counterTiming }),
      note.trim(),
    );
  }

  const summary = [
    keptActs.length ? `${keptActs.length} kept` : "",
    selectedCounterActs.length ? `${selectedCounterActs.length} offered` : "",
    counterTiming ? counterTiming : "",
  ].filter(Boolean).join(" · ");

  return (
    <dialog
      ref={dialogRef}
      className="reply-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        // Escape: let our state drive the close so focus can return cleanly.
        event.preventDefault();
        if (!submitting) onClose();
      }}
      onClick={(event) => {
        // Tap on the backdrop (the dialog box itself, outside the panel) closes.
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      {open && (
        <form
          className="reply-sheet-panel"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <header className="reply-sheet-head">
            <h2 id={titleId} className="reply-sheet-title">Counter</h2>
            <button
              ref={firstControlRef}
              type="button"
              className="done-pill reply-sheet-close pressable"
              onClick={onClose}
              disabled={submitting}
            >
              Back
            </button>
          </header>

          <div className="reply-sheet-body">
            {requested.length > 0 && (
              <section className="reply-sheet-section" aria-labelledby={`${titleId}-keep`}>
                <h3 id={`${titleId}-keep`} className="reply-sheet-label">Keep from {partnerName}&rsquo;s Ask</h3>
                <p className="reply-sheet-hint">Tap any you&rsquo;re still up for. Leave them off to offer something instead.</p>
                <div className="reply-keep-list">
                  {requested.map((label) => {
                    const kept = keptActs.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`act-chip pressable ${kept ? "is-picked" : ""}`}
                        aria-pressed={kept}
                        disabled={submitting}
                        onClick={() => toggleKept(label)}
                      >
                        <ActLabel label={label} className="act-chip-inner" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="reply-sheet-section" aria-labelledby={`${titleId}-offer`}>
              <h3 id={`${titleId}-offer`} className="reply-sheet-label">Offer instead</h3>
              {actsExpanded && (
                <input
                  value={actSearch}
                  onChange={(event) => setActSearch(event.target.value)}
                  placeholder="Search Acts"
                  aria-label="Search Acts"
                  className="input"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="search"
                  disabled={submitting}
                />
              )}
              <div className="ask-act-grid">
                {visibleActs.map((act) => {
                  const picked = selectedCounterActIds.includes(act.id);
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => toggleCounterAct(act.id)}
                      aria-pressed={picked}
                      disabled={submitting}
                      className={`act-chip pressable ${picked ? "is-picked" : ""}`}
                    >
                      <ActLabel label={act.label} className="act-chip-inner" />
                    </button>
                  );
                })}
              </div>
              <div className="ask-act-actions">
                {offerableActs.length > COLLAPSED_ACT_COUNT && (
                  <button
                    type="button"
                    onClick={() => {
                      setActsExpanded((value) => !value);
                      setActSearch("");
                    }}
                    className="btn-ghost ask-act-action"
                    aria-expanded={actsExpanded}
                    disabled={submitting}
                  >
                    {actsExpanded ? "Fewer Acts" : `Show all ${offerableActs.length} Acts`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActComposerOpen((value) => !value)}
                  className="btn-ghost ask-act-action"
                  aria-expanded={actComposerOpen}
                  disabled={submitting}
                >
                  {actComposerOpen ? "Close" : "Add your own"}
                </button>
              </div>
              {actComposerOpen && (
                <ActComposer onCancel={() => setActComposerOpen(false)} onSubmit={handleCreateAct} />
              )}
            </section>

            <section className="reply-sheet-section" aria-labelledby={`${titleId}-timing`}>
              <h3 id={`${titleId}-timing`} className="reply-sheet-label">Timing</h3>
              <p className="reply-sheet-hint">They asked for {requestedTiming.toLowerCase()}.</p>
              <div className="cadence-grid review-cadence-grid" role="group" aria-labelledby={`${titleId}-timing`}>
                {timingOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`cadence-chip pressable ${counterTiming === option ? "is-picked" : ""}`}
                    aria-pressed={counterTiming === option}
                    disabled={submitting}
                    onClick={() => setCounterTiming((value) => (value === option ? "" : option))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>

            <label className="reply-sheet-section reply-sheet-note">
              <span className="reply-sheet-label">Note</span>
              <textarea
                className="input review-textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional. Say what you'd love instead."
                maxLength={1800}
                rows={3}
                disabled={submitting}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                inputMode="text"
              />
            </label>
          </div>

          <footer className="reply-sheet-foot">
            {error && <p className="reply-error" role="alert">{error}</p>}
            {!canSend && !submitting && (
              <p className="reply-sheet-hint">Pick an Act to offer or a different time.</p>
            )}
            <button type="submit" className="cta-primary pressable" disabled={!canSend} data-testid="ask-reply-submit">
              {submitting ? "Sending…" : summary ? `Send counter · ${summary}` : "Send counter"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}

function ActLabel({ label, className }: { label: string; className: string }) {
  const { emoji, text } = splitActLabel(label);
  return (
    <span className={className}>
      {emoji && <span className="act-label-emoji" aria-hidden="true">{emoji}</span>}
      <span className="act-chip-name">{text}</span>
    </span>
  );
}

function ActComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = label.trim();

  async function submit() {
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(clean);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this Act.");
      setBusy(false);
    }
  }

  return (
    <div className="reply-composer">
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => {
          // Enter adds the Act; it must not submit the whole counter.
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="e.g. Slow undressing"
        aria-label="New Act"
        className="input"
        maxLength={80}
        autoCapitalize="none"
        autoCorrect="on"
        spellCheck
        inputMode="text"
        disabled={busy}
      />
      {error && <p className="reply-error" role="alert">{error}</p>}
      <div className="reply-composer-actions">
        <button type="button" onClick={onCancel} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={submit} className="btn-primary" disabled={busy || !clean}>
          {busy ? "Saving…" : "Add and select"}
        </button>
      </div>
    </div>
  );
}
