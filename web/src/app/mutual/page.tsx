"use client";

/**
 * The match moment. Both partners said yes, and this is the screen that says
 * so. Everything below is in the DOM from the first render; the reveal is a
 * CSS sequence that only enhances an already-complete screen:
 *
 *   0.08–0.80s  the two ribbon strokes start at opposite tips, cross in the
 *               middle and close into one loop (stroke-dashoffset)
 *   0.30–0.95s  kicker + heading open from the centre (clip-path)
 *   0.70–1.35s  the matched Acts arrive, emoji first
 *   1.00–1.60s  timing, narration, notes and the dock settle in
 *
 * A tap or key press anywhere finishes it at once; reduced motion skips it;
 * a repeat visit to the same match gets a short fade instead of the full
 * sequence. Arriving from a Sexboard row in a browser with View Transitions
 * morphs the row title into the hero (lib/match-transition.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { announce } from "@/lib/announce";
import { getRequestBoard, planAsk, updateRequestAction } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-dialog";
import { getProfileCached } from "@/lib/profile-cache";
import {
  activePlanDate,
  currentTimingLabel,
  isApprovedSexActRequest,
  timingCopyForRequest,
} from "@/lib/request-state";
import {
  PLAN_SLOTS,
  type PlanSlot,
  fromDatetimeLocalValue,
  isPlannableTime,
  planDayLabel,
  planLabel,
  planTimeLabel,
  resolvePlanSlot,
  slotForPlan,
  toDatetimeLocalValue,
  PLAN_MAX_AHEAD_DAYS,
} from "@/lib/plan-time";
import { consumeMatchMorph } from "@/lib/match-transition";
import { useDayRollover } from "@/lib/use-day-rollover";
import { partnerOf } from "@/lib/workspace";
import type { RequestRecord } from "@/lib/types";
import "./mutual.css";

type Celebration = {
  source: "pile" | "ask" | "shelf" | "kink";
  acts: string[];
  count: number;
  requestId: string;
  narration: string;
  // Decrypted by getRequestBoard; only populated once the matched request
  // loads. The optimistic URL/sessionStorage paint never carries notes.
  notes: { id: string; author: string; label?: string; text: string }[];
};

type RevealMode = "full" | "brief" | "done";

// Caps for values seeded from raw URL params. React escapes the strings so
// there's no XSS here — these guard against an over-long URL blowing out the
// layout (a huge acts list, a giant count, or a paragraph-length narration).
const MAX_ACTS = 24;
const MAX_ACT_LENGTH = 80;
const MAX_COUNT = 99;
const MAX_NARRATION_LENGTH = 280;

// Reveal budget. Matches the CSS timeline in the match-moment block of
// globals.css; after this the page drops the animations entirely.
const FULL_REVEAL_MS = 1700;
const BRIEF_REVEAL_MS = 420;
// The two strokes cross at about half their draw: the haptic lands there.
const CROSSING_MS = 430;
const SEEN_KEY = "ss:match-seen";
const SEEN_LIMIT = 40;

function clampActs(acts: string[]): string[] {
  return acts.slice(0, MAX_ACTS).map((act) => act.slice(0, MAX_ACT_LENGTH));
}

function clampCount(count: number, fallback: number): number {
  if (!Number.isFinite(count)) return Math.min(MAX_COUNT, Math.max(1, fallback));
  return Math.min(MAX_COUNT, Math.max(1, Math.floor(count)));
}

function matchHaptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([10, 30, 60, 30, 10]);
    }
  } catch {
    // Vibration is a nicety; some engines throw instead of returning false.
  }
}

function hasUserActivation(): boolean {
  try {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    return Boolean(activation?.hasBeenActive);
  } catch {
    return false;
  }
}

// Per-device memory of which matches this person has already watched, so the
// tenth tap on the same "It's on!" row is a quick fade, not a ceremony.
// The same mount can run its effect twice (React strict/dev remounts); reuse
// the first answer for a moment so it doesn't count as a repeat visit.
const recentSeenChecks = new Map<string, { at: number; seen: boolean }>();

function markMatchSeen(key: string): boolean {
  if (!key) return false;
  const recent = recentSeenChecks.get(key);
  if (recent && Date.now() - recent.at < 1500) return recent.seen;
  const seen = readAndMarkSeen(key);
  recentSeenChecks.set(key, { at: Date.now(), seen });
  return seen;
}

function readAndMarkSeen(key: string): boolean {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
    const seen: string[] = Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : [];
    if (seen.includes(key)) return true;
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([key, ...seen].slice(0, SEEN_LIMIT)));
    return false;
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// The URL / sessionStorage handoff is one-shot (it strips the URL and clears
// the storage). A remount of the same page (React strict/dev double effects)
// must reuse the first read instead of finding the handoff already gone.
let recentSeed: { at: number; url: string; value: { celebration: Celebration; morphed: boolean } } | null = null;

function readMatchSeed(): { celebration: Celebration; morphed: boolean } {
  const currentUrl = window.location.pathname + window.location.search;
  if (recentSeed && Date.now() - recentSeed.at < 1500 && recentSeed.url === currentUrl) return recentSeed.value;
  const params = new URLSearchParams(window.location.search);
  let privateCelebration: Partial<Celebration> | null = null;
  if (params.get("private") === "1") {
    try {
      privateCelebration = JSON.parse(sessionStorage.getItem("ss:mutual-celebration") || "null");
      sessionStorage.removeItem("ss:mutual-celebration");
    } catch {
      privateCelebration = null;
    }
  }
  const source = String(privateCelebration?.source || params.get("source") || "ask") as Celebration["source"];
  const rawActs = Array.isArray(privateCelebration?.acts) ? privateCelebration.acts : (params.get("acts") || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  const acts = clampActs(rawActs);
  const count = clampCount(Number(privateCelebration?.count || params.get("count") || acts.length || 1), acts.length || 1);
  const requestId = params.get("requestId") || "";
  const narration = String(privateCelebration?.narration || params.get("narration") || "").trim().slice(0, MAX_NARRATION_LENGTH);
  // Privacy: on the non-encrypted path the plaintext act names + narration
  // arrive in the query string. They're captured in state now, so strip just
  // those from THIS history entry — otherwise they persist in browser history
  // and sync to the user's other signed-in devices. Keep the non-sensitive
  // source/requestId (opaque ids the match-load still needs). The encrypted
  // path already hands off via one-shot sessionStorage and carries nothing
  // sensitive in the URL.
  if (typeof window !== "undefined" && window.history?.replaceState) {
    const keep = new URLSearchParams();
    if (source) keep.set("source", source);
    if (requestId) keep.set("requestId", requestId);
    if (params.get("private") === "1") keep.set("private", "1");
    const query = keep.toString();
    window.history.replaceState(null, "", query ? `/mutual?${query}` : "/mutual");
  }
  const nextCelebration: Celebration = {
    source: ["pile", "ask", "shelf", "kink"].includes(source) ? source : "ask",
    acts,
    count,
    requestId,
    narration,
    notes: [],
  };
  const value = { celebration: nextCelebration, morphed: consumeMatchMorph() };
  recentSeed = { at: Date.now(), url: window.location.pathname + window.location.search, value };
  return value;
}

export default function MutualPage() {
  const router = useRouter();
  useDayRollover();
  const [celebration, setCelebration] = useState<Celebration>({
    source: "ask",
    acts: [],
    count: 1,
    requestId: "",
    narration: "",
    notes: [],
  });
  const [passContext, setPassContext] = useState<{ workspaceId: string; request: RequestRecord } | null>(null);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState("");
  // True once we've loaded the request and confirmed it is NOT an approved
  // all-yes match (revoked / passed / expired). Until then we keep the
  // optimistic "Both of you said yes" paint — the URL alone never asserts it.
  const [staleMatch, setStaleMatch] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reveal, setReveal] = useState<RevealMode>("full");
  const [morph, setMorph] = useState(false);

  // Plan it
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slot, setSlot] = useState<PlanSlot | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const headingRef = useRef<HTMLHeadingElement>(null);
  const planButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLFieldSetElement>(null);
  const hapticPendingRef = useRef(false);

  const finishReveal = useCallback(() => {
    setReveal((current) => (current === "done" ? current : "done"));
    if (hapticPendingRef.current) {
      hapticPendingRef.current = false;
      matchHaptic();
    }
  }, []);

  useEffect(() => {
    // Hydration-safe URL read: server can't reach window.location, so seed the
    // celebration from query params after mount.
    const { celebration: nextCelebration, morphed } = readMatchSeed();
    const { source, acts, requestId, narration } = nextCelebration;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCelebration(nextCelebration);
    setNow(new Date());

    // Reveal choreography. The content is already on screen; this only picks
    // how much of the entrance plays.
    if (morphed) setMorph(true);
    const seenKey = requestId ? `ask:${requestId}` : acts.length ? `${source}:${acts.join("|").toLowerCase()}` : "";
    const reduced = prefersReducedMotion();
    const seenBefore = markMatchSeen(seenKey);
    const mode: RevealMode = reduced ? "done" : seenBefore ? "brief" : "full";
    setReveal(mode);
    const timers: number[] = [];
    if (mode !== "done") {
      timers.push(window.setTimeout(() => setReveal("done"), mode === "full" ? FULL_REVEAL_MS : BRIEF_REVEAL_MS));
    }
    // Haptics need a user gesture. A tap on the Sexboard row already counts
    // (sticky activation survives client-side navigation), so fire at the
    // stroke crossing; a cold open (push notification, reload) waits for the
    // first tap instead of being silently blocked.
    if (!seenBefore) {
      if (hasUserActivation()) {
        timers.push(window.setTimeout(matchHaptic, reduced ? 0 : CROSSING_MS));
      } else {
        hapticPendingRef.current = true;
      }
    }
    headingRef.current?.focus({ preventScroll: true });

    let cancelled = false;

    const loadPartner = async () => {
      try {
        const profile = await getProfileCached();
        const workspace = profile.activeWorkspace;
        const partner = partnerOf(workspace, profile.auth?.email || "");
        const name = firstName(partner?.displayName || "");
        if (!cancelled && name) setPartnerName(name);
      } catch {
        // The partner's name is decoration on this screen; carry on without it.
      }
    };

    const loadPrewarmedMatch = async () => {
      try {
        const profile = await getProfileCached();
        const workspaceId = profile.activeWorkspace?.id || profile.activeWorkspaceId || "";
        const myEmail = String(profile.auth?.email || "").toLowerCase();
        if (!workspaceId) return Boolean(narration);

        let matchedNarration = narration;
        let foundMatch = false;

        const board = await getRequestBoard(workspaceId);
        const match = [
          ...(board.activeRequests || []),
          ...(board.requests || []),
          ...(board.history || []),
        ].find((item) => item.id === requestId);
        if (match) {
          foundMatch = true;
          const matchedActs = approvedActsForRequest(match);
          matchedNarration = (match.matchNarration || "").trim() || matchedNarration;
          const approved = isApprovedSexActRequest(match);
          if (!cancelled) setStaleMatch(!approved);
          if (!cancelled && approved) {
            setPassContext({ workspaceId, request: match });
          }
          if (!cancelled && matchedActs.length) {
            setCelebration((current) => ({
              ...current,
              acts: matchedActs,
              count: matchedActs.length,
            }));
          }
          // The notes around the match: the Ask's own note (from whoever
          // asked), the reply note and any per-act notes attached to a Yes
          // (from whoever answered). getRequestBoard has already decrypted
          // these, so an E2EE room shows them too once unlocked.
          if (!cancelled) {
            const requesterIsMe = String(match.requesterEmail || "").toLowerCase() === myEmail;
            const reviewerIsMe = String(match.reviewerEmail || "").toLowerCase() === myEmail;
            const requester = requesterIsMe ? "You" : firstName(match.requesterName || match.requester || "") || "Their Ask";
            const reviewer = reviewerIsMe ? "You" : firstName(match.reviewerName || match.reviewer || "") || "Their reply";
            const notes: Celebration["notes"] = [];
            const askNote = String(match.note || "").trim();
            if (askNote) notes.push({ id: "ask", author: requester, text: askNote });
            const replyNote = String(match.feedback || "").trim();
            if (replyNote) notes.push({ id: "reply", author: reviewer, text: replyNote });
            (match.decisions || [])
              .filter((decision) => decision.decision === "Yes" && String(decision.note || "").trim())
              .forEach((decision, index) => {
                notes.push({
                  id: `act-${index}`,
                  author: reviewer,
                  label: String(decision.label || "").trim(),
                  text: String(decision.note || "").trim(),
                });
              });
            setCelebration((current) => ({ ...current, notes }));
            const otherName = requesterIsMe ? firstName(match.reviewerName || match.reviewer || "") : firstName(match.requesterName || match.requester || "");
            if (otherName) setPartnerName(otherName);
          }
        }

        if (!cancelled && matchedNarration) {
          setCelebration((current) => ({ ...current, narration: matchedNarration }));
        }
        return Boolean(matchedNarration || !foundMatch);
      } catch {
        return Boolean(narration);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    const scheduleRetries = (delays: number[]) => {
      const [delay, ...remainingDelays] = delays;
      if (!delay) return;
      const timer = window.setTimeout(async () => {
        if (cancelled) return;
        const ready = await loadPrewarmedMatch();
        if (!ready) {
          scheduleRetries(remainingDelays);
        }
      }, delay);
      timers.push(timer);
    };

    void loadPartner();
    if (requestId) {
      void (async () => {
        const ready = await loadPrewarmedMatch();
        if (!ready && !cancelled) {
          scheduleRetries([1200, 5000, 22000]);
        }
      })();
    } else {
      setLoaded(true);
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  // Tap / key anywhere finishes the reveal immediately.
  useEffect(() => {
    if (reveal === "done") return;
    const onKey = () => finishReveal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal, finishReveal]);

  useEffect(() => {
    if (pickerOpen) pickerRef.current?.querySelector<HTMLInputElement>("input[type='radio']:checked, input[type='radio']")?.focus();
  }, [pickerOpen]);

  async function passTonight() {
    if (!passContext || passBusy) return;
    const timingCopy = timingCopyForRequest(passContext.request);
    const confirmed = await confirmAction({
      title: `Pass on this Ask for ${timingCopy}?`,
      body: "It will leave the active Sexboard for both of you.",
      confirmLabel: "Pass",
      destructive: true,
    });
    if (!confirmed) return;
    setPassBusy(true);
    setPassError("");
    try {
      await updateRequestAction({
        workspaceId: passContext.workspaceId,
        id: passContext.request.id,
        action: "pass",
      });
      if (navigator.vibrate) navigator.vibrate(8);
      router.push("/sexboard");
    } catch (error) {
      setPassError(error instanceof Error ? error.message : "Couldn't pass on this Ask.");
      setPassBusy(false);
    }
  }

  const plannedDate = passContext ? activePlanDate(passContext.request, now) : null;

  function openPicker() {
    const current = new Date();
    setNow(current);
    const existing = plannedDate ? slotForPlan(plannedDate, current) : null;
    setSlot(existing || "tonight");
    setCustomValue(toDatetimeLocalValue(plannedDate || resolvePlanSlot("tomorrow", current) || current));
    setPlanError("");
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPlanError("");
    window.requestAnimationFrame(() => planButtonRef.current?.focus());
  }

  async function savePlan(clear = false) {
    if (!passContext || planBusy) return;
    const current = new Date();
    const target = clear
      ? null
      : slot === "custom"
      ? fromDatetimeLocalValue(customValue)
      : slot ? resolvePlanSlot(slot, current) : null;
    if (!clear && !isPlannableTime(target, current)) {
      setPlanError(slot === "custom" ? `Pick a time from now up to ${PLAN_MAX_AHEAD_DAYS} days out.` : "Pick when.");
      return;
    }
    setPlanBusy(true);
    setPlanError("");
    try {
      const response = await planAsk({
        workspaceId: passContext.workspaceId,
        id: passContext.request.id,
        plannedFor: clear || !target ? "" : target.toISOString(),
      });
      const updated = response.request || { ...passContext.request, plannedFor: clear || !target ? undefined : target.toISOString() };
      setPassContext({ workspaceId: passContext.workspaceId, request: updated });
      setNow(new Date());
      setPickerOpen(false);
      // Spoken through the app's one polite announcer.
      announce(clear || !target ? "Plan cleared." : `Planned for ${planLabel(target, current)}.`);
      if (!clear && typeof navigator.vibrate === "function") navigator.vibrate(12);
      window.requestAnimationFrame(() => planButtonRef.current?.focus());
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Couldn't save the plan. Try again.");
    } finally {
      setPlanBusy(false);
    }
  }

  const label = useMemo(() => {
    if (celebration.source === "pile") return "The Pile found overlap.";
    if (celebration.source === "shelf") return "You both wanted this.";
    if (celebration.source === "kink") return "You both leaned in.";
    return "The Ask landed.";
  }, [celebration.source]);

  const fallbackLabel = `${celebration.count} mutual yes${celebration.count === 1 ? "" : "es"}`;
  const narrationText = celebration.narration || fallbackNarrationForCelebration(celebration);
  const passTimingCopy = passContext ? timingCopyForRequest(passContext.request) : "tonight";
  const partner = partnerName || "them";
  const canPlan = Boolean(celebration.requestId) && celebration.source === "ask";
  const whenLabel = plannedDate
    ? planLabel(plannedDate, now)
    : passContext
    ? currentTimingLabel(passContext.request)
    : celebration.source === "pile"
    ? "Tonight"
    : "";
  const heroActs = celebration.acts.length ? celebration.acts : [];
  const heroReady = heroActs.length > 0 || loaded;

  // The request loaded but is no longer an approved match (revoked / passed /
  // expired). Don't assert a mutual yes from the stale URL — show a neutral
  // closed state with a way back instead.
  if (staleMatch) {
    return (
      <main id="app-main" tabIndex={-1} className="surface mutual-surface match-moment" data-reveal="done">
        <div className="atmosphere" aria-hidden="true">
          <div className="atm-top" />
          <div className="atm-bottom" />
          <div className="grain" />
        </div>
        <section className="mutual-stage">
          <div className="match-scroll">
            <div className="mutual-mark match-mark match-mark--quiet" aria-hidden="true">
              <RibbonMark />
            </div>
            <p className="mutual-eyebrow">This Ask changed.</p>
            <h1 className="h-intimate mutual-title" tabIndex={-1}>This one&rsquo;s no longer active.</h1>
            <p className="mutual-narration mutual-narration--fallback" aria-live="polite">
              It may have been passed, taken back, or expired. Check the Sexboard for what&rsquo;s on now.
            </p>
          </div>
          <div className="match-dock">
            <Link href="/sexboard" className="cta-primary match-cta pressable">
              Back to Sexboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      id="app-main"
      tabIndex={-1}
      className="surface mutual-surface match-moment"
      data-reveal={reveal}
      data-morph={morph ? "1" : undefined}
      onPointerDownCapture={finishReveal}
    >
      <div className="atmosphere" aria-hidden="true">
        <div className="atm-top" />
        <div className="atm-bottom" />
        <div className="grain" />
      </div>
      <section className="mutual-stage" aria-labelledby="match-title">
        <div className="match-scroll">
          <div className="mutual-mark match-mark" aria-hidden="true">
            <span className="match-bloom" />
            <span className="match-ring" />
            <RibbonMark />
            <span className="match-spark" />
          </div>

          <p className="mutual-eyebrow match-kicker">{label}</p>
          <h1 id="match-title" ref={headingRef} tabIndex={-1} className="h-intimate mutual-title match-title">
            Both of you said yes.
          </h1>

          <div className="match-hero" data-match-hero="" data-ready={heroReady ? "1" : "0"} aria-live="polite">
            <ul className="match-acts" aria-label="What you matched on">
              {heroActs.length ? heroActs.map((act, index) => {
                const { emoji, name } = splitActLabel(act);
                return (
                  <li
                    key={`${act}-${index}`}
                    className="mutual-act match-act"
                    style={{ ["--i" as string]: Math.min(index, 4) }}
                  >
                    {emoji ? <span className="match-act-emoji" aria-hidden="true">{emoji}</span> : null}
                    <span className="match-act-name">{name || act}</span>
                  </li>
                );
              }) : (
                <li className="mutual-act match-act match-act--count">
                  <span className="match-act-name">{fallbackLabel}</span>
                </li>
              )}
            </ul>
            {whenLabel ? (
              <p className="match-when">
                <span className={plannedDate ? "match-when-time is-planned" : "match-when-time"}>{whenLabel}</span>
                {partnerName ? <span className="match-when-with"> · with {partnerName}</span> : null}
              </p>
            ) : partnerName ? (
              <p className="match-when"><span className="match-when-with">You and {partnerName}</span></p>
            ) : null}
          </div>

          <p className={`mutual-narration ${celebration.narration ? "" : "mutual-narration--fallback"}`}>
            {narrationText}
          </p>

          {celebration.notes.length > 0 && (
            <div className="mutual-note match-notes">
              {celebration.notes.map((note) => (
                <figure key={note.id} className="match-note">
                  <blockquote className="mutual-note-text">{note.text}</blockquote>
                  <figcaption className="mutual-note-label">
                    {note.author}
                    {note.label ? <span className="mutual-note-act"> · on {note.label}</span> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {passContext && (
            <button
              type="button"
              className="match-pass pressable"
              disabled={passBusy}
              onClick={passTonight}
            >
              {passBusy ? "Passing..." : `Pass ${passTimingCopy}`}
            </button>
          )}
          {passError && <p className="mutual-error" role="alert">{passError}</p>}
        </div>

        <div className="match-dock" data-open={pickerOpen ? "1" : undefined}>
          {pickerOpen ? (
            <form
              className="match-plan"
              onSubmit={(event) => {
                event.preventDefault();
                void savePlan();
              }}
            >
              <fieldset ref={pickerRef} className="match-plan-fieldset">
                <legend className="match-plan-legend">When?</legend>
                <div className="match-plan-options">
                  {PLAN_SLOTS.map((option) => {
                    const resolved = resolvePlanSlot(option.id, now);
                    const hint = option.id === "custom"
                      ? "Day and time"
                      : !resolved
                      ? ""
                      : option.id === "weekend"
                      ? `${resolved.toLocaleDateString("en-US", { weekday: "short" })}, ${planTimeLabel(resolved)}`
                      : option.id === "tonight" && planDayLabel(resolved, now) !== "Tonight"
                      ? `${planDayLabel(resolved, now)}, ${planTimeLabel(resolved)}`
                      : planTimeLabel(resolved);
                    return (
                      <label key={option.id} className="match-plan-option pressable" data-checked={slot === option.id ? "1" : undefined}>
                        <input
                          type="radio"
                          name="plan-slot"
                          value={option.id}
                          checked={slot === option.id}
                          onChange={() => {
                            setSlot(option.id);
                            setPlanError("");
                          }}
                        />
                        <span className="match-plan-option-label">{option.label}</span>
                        <span className="match-plan-option-hint">{hint}</span>
                      </label>
                    );
                  })}
                </div>
                {slot === "custom" && (
                  <label className="match-plan-custom">
                    <span className="match-plan-custom-label">Day and time</span>
                    <input
                      type="datetime-local"
                      className="match-plan-input"
                      value={customValue}
                      min={toDatetimeLocalValue(now)}
                      max={toDatetimeLocalValue(new Date(now.getTime() + PLAN_MAX_AHEAD_DAYS * 86_400_000))}
                      onChange={(event) => {
                        setCustomValue(event.target.value);
                        setPlanError("");
                      }}
                    />
                  </label>
                )}
              </fieldset>
              {planError && <p className="mutual-error match-plan-error" role="alert">{planError}</p>}
              <div className="match-plan-actions">
                <button type="button" className="btn-ghost match-secondary pressable" onClick={closePicker} disabled={planBusy}>
                  Cancel
                </button>
                <button type="submit" className="cta-primary match-cta pressable" disabled={planBusy || !slot}>
                  {planBusy ? "Saving..." : "Save plan"}
                </button>
              </div>
              {plannedDate && (
                <button type="button" className="match-pass match-plan-clear pressable" onClick={() => void savePlan(true)} disabled={planBusy}>
                  Clear the plan
                </button>
              )}
            </form>
          ) : (
            <>
              {canPlan ? (
                plannedDate ? (
                  <div className="match-planned">
                    <button
                      ref={planButtonRef}
                      type="button"
                      className="match-planned-change pressable"
                      onClick={openPicker}
                    >
                      <span className="match-planned-copy">
                        <span className="match-planned-kicker">Planned</span>
                        <span className="match-planned-time">{planLabel(plannedDate, now)}</span>
                      </span>
                      <span className="match-planned-action">Change</span>
                    </button>
                  </div>
                ) : (
                  <button
                    ref={planButtonRef}
                    type="button"
                    className="cta-primary match-cta pressable"
                    onClick={openPicker}
                    disabled={!passContext}
                    aria-describedby="match-plan-hint"
                  >
                    Plan it
                  </button>
                )
              ) : null}
              {canPlan && !plannedDate && (
                <p id="match-plan-hint" className="sr-only">Put it on the calendar for both of you.</p>
              )}
              <div className={canPlan ? "match-secondary-row" : "match-secondary-row match-secondary-row--lead"}>
                {canPlan ? (
                  <>
                    <Link href="/chat" className={`${plannedDate ? "cta-primary" : "btn-ghost"} match-secondary pressable`}>
                      Message {partner}
                    </Link>
                    <Link href="/sexboard" className="btn-ghost match-secondary pressable">
                      Back to Sexboard
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/sexboard" className="cta-primary match-cta pressable">
                      Back to Sexboard
                    </Link>
                    <Link href="/chat" className="btn-ghost match-secondary pressable">
                      Message {partner}
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * The Sync Wave infinity as two strokes. Stroke A runs from the left tip
 * through the crossing to the right tip; stroke B mirrors it from the right.
 * Drawn together they start apart, cross in the middle and close one loop.
 */
function RibbonMark() {
  return (
    <svg className="match-ribbon" width="168" height="84" viewBox="0 0 100 50" fill="none">
      <path
        className="match-stroke match-stroke--a"
        d="M12 25 C 12 10, 38 10, 50 25 C 62 40, 88 40, 88 25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        pathLength={100}
      />
      <path
        className="match-stroke match-stroke--b"
        d="M88 25 C 88 10, 62 10, 50 25 C 38 40, 12 40, 12 25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        pathLength={100}
      />
    </svg>
  );
}

const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*)\s*/u;

function splitActLabel(label: string): { emoji: string; name: string } {
  const trimmed = String(label || "").trim();
  const match = trimmed.match(LEADING_EMOJI_RE);
  if (!match) return { emoji: "", name: trimmed };
  return { emoji: match[1], name: trimmed.slice(match[0].length).trim() };
}

function fallbackNarrationForCelebration(celebration: Celebration) {
  if (celebration.source === "pile") return "The overlap is locked. The rest is getting close.";
  if (celebration.source === "shelf" || celebration.source === "kink") return "That shared yes is locked in. Now it gets real.";
  return "That yes is locked in. Now it gets real.";
}

function firstName(value: string) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function approvedActsForRequest(request: RequestRecord) {
  const approved = (request.decisions || [])
    .filter((decision) => decision.decision === "Yes" && (!decision.targetType || decision.targetType === "act"))
    .map((decision) => decision.label);
  return uniqueLabels(approved.length ? approved : request.categories || []);
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  const clean: string[] = [];
  labels.forEach((label) => {
    const value = String(label || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    clean.push(value);
  });
  return clean;
}
