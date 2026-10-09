"use client";

/**
 * Mood light: the double-blind "I'm in the mood" switch at the top of Home.
 *
 * Each partner switches their own light on until a time. The server only ever
 * returns MY state plus a `match` when both lights are on, so nothing here can
 * say anything about the partner unless the match exists. States:
 *
 *  - off:      one quiet row; tapping it opens an inline chooser (no modal).
 *  - on:       "Your light's on until …" and Turn off. Nothing about the partner.
 *  - cooldown: switched off a few minutes ago; says when it can go back on.
 *  - match:    "You're both in the mood." with a bloom and quick actions.
 *
 * Times come from the server clock (serverNow skew), expiry is timed out here
 * because the server sends no event when a window simply ends, and mood
 * writes are never queued offline: the server has to decide the match.
 */

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MoodRibbonMark from "@/components/MoodRibbonMark";
import { announce } from "@/lib/announce";
import { MoodCooldownError, clearMood, getMood, setMood } from "@/lib/api";
import { useOnlineStatus, useRecoverOnReconnect } from "@/lib/network-status";
import { useMoodRoomEvents } from "@/lib/use-live-room";
import type { MoodResponse } from "@/lib/types";

type Phase = "loading" | "off" | "cooldown" | "on" | "match";
type ChoiceId = "hour" | "tonight" | "open";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// "Tonight" runs to this local hour the next morning.
const TONIGHT_END_HOUR = 4;
// Bloom runs once per match; keep the attribute a little past the animation.
const BLOOM_MS = 1400;
const MATCH_ANNOUNCEMENT = "You're both in the mood.";

// In-process only (never persisted): a revisit paints the last known state
// while the GET revalidates. A full reload or sign-out starts clean.
const lastSnapshot = new Map<string, Snapshot>();

interface Snapshot {
  mood: MoodResponse;
  /** serverNow minus the device clock when the response landed. */
  skewMs: number;
}

/** Device clock; read in handlers and effects, never during render. */
function deviceNow(): number {
  return Date.now();
}

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function snapshotFrom(mood: MoodResponse): Snapshot | null {
  if (!mood || typeof mood !== "object" || !mood.mine) return null;
  const server = parseTime(mood.serverNow);
  return { mood, skewMs: server ? server - deviceNow() : 0 };
}

function phaseFor(snapshot: Snapshot | null, nowMs: number, retryAtMs: number): Phase {
  if (!snapshot) return retryAtMs > nowMs ? "cooldown" : "off";
  const { mine, match } = snapshot.mood;
  if (match && parseTime(match.until) > nowMs) return "match";
  if (mine.on && parseTime(mine.until) > nowMs) return "on";
  if (Math.max(parseTime(mine.cooldownUntil), retryAtMs) > nowMs) return "cooldown";
  return "off";
}

/** "11:40 pm", plus "tomorrow" when the time is most of a day away. */
export function moodClock(targetMs: number, nowMs: number): string {
  if (!targetMs) return "";
  const target = new Date(targetMs);
  const raw = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(target);
  const clock = raw.replace(/\s?([AaPp])\.?\s?[Mm]\.?/, (_match, letter: string) => ` ${letter.toLowerCase()}m`);
  const now = new Date(nowMs);
  const otherDay = target.toDateString() !== now.toDateString();
  return otherDay && targetMs - nowMs > 12 * HOUR_MS ? `${clock} tomorrow` : clock;
}

function untilFor(choice: ChoiceId, nowMs: number): number {
  if (choice === "hour") return nowMs + HOUR_MS;
  if (choice === "open") return nowMs + DAY_MS;
  const end = new Date(nowMs);
  end.setHours(TONIGHT_END_HOUR, 0, 0, 0);
  if (end.getTime() <= nowMs) end.setDate(end.getDate() + 1);
  return end.getTime();
}

function buzz() {
  // Only after the person has touched the page: a vibration with no gesture
  // behind it is blocked anyway, and would be a surprise.
  if (typeof navigator === "undefined") return;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
  if (!activation?.hasBeenActive) return;
  try {
    navigator.vibrate?.([14, 60, 22]);
  } catch {
    // Not supported (iOS Safari): the bloom and the copy carry it.
  }
}

/** Reads `?mood=match` (the push deep link). Lives in Suspense for prerender. */
function MoodDeepLink({ onMatchLink }: { onMatchLink: () => void }) {
  const params = useSearchParams();
  const wantsMatch = params?.get("mood") === "match";
  const handlerRef = useRef(onMatchLink);
  useEffect(() => { handlerRef.current = onMatchLink; }, [onMatchLink]);
  useEffect(() => {
    if (wantsMatch) handlerRef.current();
  }, [wantsMatch]);
  return null;
}

export function MoodLight({ workspaceId, partnerName }: { workspaceId: string; partnerName: string }) {
  const online = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => lastSnapshot.get(workspaceId) ?? null);
  const [loaded, setLoaded] = useState(() => lastSnapshot.has(workspaceId));
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryAtMs, setRetryAtMs] = useState(0);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [busy, setBusy] = useState<"" | ChoiceId | "off">("");
  const [writeFailed, setWriteFailed] = useState(false);
  const [blooming, setBlooming] = useState(false);
  const [deepLinkPending, setDeepLinkPending] = useState(false);
  // Render-time clock: refreshed when data lands, a window edge passes, or
  // the chooser opens, so render itself stays pure.
  const [clockMs, setClockMs] = useState(() => Date.now());

  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const loadSeq = useRef(0);
  const bloomTimer = useRef<number | undefined>(undefined);

  const ids = useId();
  const titleId = `${ids}-title`;
  const hintId = `${ids}-hint`;
  const chooserId = `${ids}-chooser`;

  const skewMs = snapshot?.skewMs ?? 0;
  const nowMs = clockMs + skewMs;
  const phase: Phase = loaded || snapshot ? phaseFor(snapshot, nowMs, retryAtMs) : "loading";
  const partner = partnerName || "your partner";

  const celebrate = useCallback(() => {
    window.clearTimeout(bloomTimer.current);
    setBlooming(true);
    bloomTimer.current = window.setTimeout(() => setBlooming(false), BLOOM_MS);
    announce(MATCH_ANNOUNCEMENT);
    buzz();
  }, []);

  // Apply a fresh server response. A match that wasn't on screen a moment
  // ago gets the bloom + announcement, whatever brought it in.
  const apply = useCallback((mood: MoodResponse) => {
    const next = snapshotFrom(mood);
    if (!next) return;
    const before = phaseRef.current;
    const after = phaseFor(next, deviceNow() + next.skewMs, 0);
    lastSnapshot.set(workspaceId, next);
    setClockMs(deviceNow());
    setSnapshot(next);
    setLoaded(true);
    setLoadFailed(false);
    if (after === "match" && before !== "match" && before !== "loading") celebrate();
  }, [celebrate, workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const seq = ++loadSeq.current;
    try {
      const mood = await getMood(workspaceId);
      if (seq !== loadSeq.current) return;
      apply(mood);
    } catch {
      if (seq !== loadSeq.current) return;
      setLoaded(true);
      setLoadFailed(true);
    }
  }, [apply, workspaceId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    // Initial load; refresh() only sets state once the GET settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Foreground / back online: the window may have ended or a match formed
  // while the app was away.
  useRecoverOnReconnect(refresh, true);

  // Room events are refetch hints (they can replay after a reconnect), so the
  // GET decides whether there's really a match.
  useMoodRoomEvents(() => { void refresh(); });

  // Nothing tells us when a window ends, so time it out locally (server
  // clock) and confirm with a refetch.
  useEffect(() => {
    if (!snapshot) return;
    const { mine, match } = snapshot.mood;
    const now = deviceNow() + snapshot.skewMs;
    const edges = [parseTime(match?.until), parseTime(mine.until), parseTime(mine.cooldownUntil), retryAtMs]
      .filter((edge) => edge > now);
    if (!edges.length) return;
    const wait = Math.min(Math.min(...edges) - now + 250, 2 ** 31 - 1);
    const timer = window.setTimeout(() => {
      setClockMs(deviceNow());
      void refresh();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [snapshot, retryAtMs, refresh]);

  useEffect(() => () => window.clearTimeout(bloomTimer.current), []);

  // Push deep link: bring the control into view and put focus on it once we
  // know its state.
  const onMatchLink = useCallback(() => setDeepLinkPending(true), []);
  useEffect(() => {
    if (!deepLinkPending || phase === "loading") return;
    const node = rootRef.current;
    if (!node) return;
    setDeepLinkPending(false);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    node.focus({ preventScroll: true });
  }, [deepLinkPending, phase]);

  useEffect(() => {
    if (chooserOpen) firstOptionRef.current?.focus();
  }, [chooserOpen]);

  async function switchOn(choice: ChoiceId) {
    if (busy || !online) return;
    setBusy(choice);
    setWriteFailed(false);
    const until = new Date(untilFor(choice, deviceNow() + skewMs));
    try {
      const mood = await setMood(workspaceId, until);
      setChooserOpen(false);
      setRetryAtMs(0);
      apply(mood);
      if (!mood.match) {
        announce(`Your light's on until ${moodClock(parseTime(mood.mine.until), deviceNow() + (snapshotFrom(mood)?.skewMs ?? 0))}.`);
      }
      // The chooser closed under focus; keep it on the control.
      window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-mood-focus]")?.focus());
    } catch (error) {
      if (error instanceof MoodCooldownError) {
        setChooserOpen(false);
        setRetryAtMs(parseTime(error.retryAt));
        if (error.mood) apply(error.mood);
        const offset = error.mood ? (snapshotFrom(error.mood)?.skewMs ?? skewMs) : skewMs;
        announce(`You can switch it back on at ${moodClock(parseTime(error.retryAt), deviceNow() + offset)}.`);
        window.requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
      } else {
        setWriteFailed(true);
        announce("Couldn't switch it on. Try again.");
      }
    } finally {
      setBusy("");
    }
  }

  async function switchOff() {
    if (busy || !online) return;
    setBusy("off");
    setWriteFailed(false);
    try {
      const mood = await clearMood(workspaceId);
      apply(mood);
      announce("Mood light off.");
      // The off-state trigger may be disabled (cooldown), so land on the
      // control itself rather than losing focus to the page.
      window.requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        if (trigger && !trigger.disabled) trigger.focus();
        else rootRef.current?.focus({ preventScroll: true });
      });
    } catch {
      setWriteFailed(true);
      announce("Couldn't switch it off. Try again.");
    } finally {
      setBusy("");
    }
  }

  const mine = snapshot?.mood.mine;
  const match = snapshot?.mood.match;
  const mineUntil = moodClock(parseTime(mine?.until), nowMs);
  const matchUntil = moodClock(parseTime(match?.until), nowMs);
  const cooldownAt = moodClock(Math.max(parseTime(mine?.cooldownUntil), retryAtMs), nowMs);
  const offlineHint = "You're offline. The mood light needs a connection.";

  let hint = `Only shows if ${partner}'s is on too.`;
  if (phase === "cooldown") hint = `You can switch it back on at ${cooldownAt}.`;
  else if (loadFailed && !snapshot) hint = "Couldn't check it just now. It'll catch up when you're back.";
  if (!online && phase !== "match") hint = offlineHint;
  if (writeFailed && online) hint = phase === "on" || phase === "match" ? "Couldn't switch it off. Try again." : "Couldn't switch it on. Try again.";

  const nowForChoices = nowMs;
  // Labels are fixed; the detail shows the real end time for this moment.
  const choices: Array<{ id: ChoiceId; label: string; detail: string }> = [
    { id: "hour", label: "For the next hour", detail: `until ${moodClock(untilFor("hour", nowForChoices), nowForChoices)}` },
    { id: "tonight", label: "Tonight", detail: `until ${moodClock(untilFor("tonight", nowForChoices), nowForChoices)}` },
    { id: "open", label: "Until I turn it off", detail: "24 hours at most" },
  ];

  return (
    <section
      ref={rootRef}
      className="mood-light"
      data-phase={phase}
      data-blooming={blooming ? "true" : undefined}
      aria-labelledby={titleId}
      aria-busy={phase === "loading" || Boolean(busy) || undefined}
      tabIndex={-1}
      data-testid="mood-light"
    >
      <Suspense fallback={null}>
        <MoodDeepLink onMatchLink={onMatchLink} />
      </Suspense>

      {phase === "match" ? (
        <>
          <span className="mood-light-bloom" aria-hidden="true" />
          <div className="mood-light-match">
            <MoodRibbonMark state="both" className="mood-light-mark" size={38} />
            <h2 id={titleId} className="mood-light-match-title" data-mood-focus tabIndex={-1}>
              You&rsquo;re both in the mood.
            </h2>
            <div className="mood-light-meta">
              <p id={hintId} className="mood-light-hint">
                {writeFailed && online ? hint : `Until ${matchUntil}`}
              </p>
              <button
                type="button"
                className="mood-light-off mood-light-off--quiet pressable"
                onClick={() => void switchOff()}
                disabled={!online || Boolean(busy)}
              >
                {busy === "off" ? "Turning off…" : "Turn off"}
              </button>
            </div>
            <div className="mood-light-actions">
              <Link href="/ask" className="btn-primary mood-light-action">Ask</Link>
              <Link href="/chat" className="btn-ghost mood-light-action">Sext</Link>
            </div>
            {!online ? <p className="mood-light-hint">{offlineHint}</p> : null}
          </div>
        </>
      ) : phase === "on" ? (
        <div className="mood-light-row">
          <MoodRibbonMark state="mine" className="mood-light-mark" />
          <span className="mood-light-copy">
            <span id={titleId} className="mood-light-title" data-mood-focus tabIndex={-1}>
              Your light&rsquo;s on <span className="mood-light-nowrap">until {mineUntil}</span>
            </span>
            <span id={hintId} className="mood-light-hint">{hint}</span>
          </span>
          <button
            type="button"
            className="mood-light-off pressable"
            onClick={() => void switchOff()}
            disabled={!online || Boolean(busy)}
            aria-describedby={titleId}
          >
            {busy === "off" ? "Turning off…" : "Turn off"}
          </button>
        </div>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="mood-light-trigger pressable"
            aria-expanded={chooserOpen}
            aria-controls={chooserId}
            aria-labelledby={titleId}
            aria-describedby={hintId}
            disabled={phase === "loading" || phase === "cooldown" || !online || Boolean(busy)}
            data-mood-focus
            onClick={() => {
              setWriteFailed(false);
              setClockMs(deviceNow());
              setChooserOpen((open) => !open);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && chooserOpen) setChooserOpen(false);
            }}
          >
            <MoodRibbonMark state="off" className="mood-light-mark" />
            <span className="mood-light-copy">
              <span id={titleId} className="mood-light-title">Mood light</span>
              <span id={hintId} className="mood-light-hint">{hint}</span>
            </span>
            <span className="mood-light-chevron" aria-hidden="true" />
          </button>
          <div
            id={chooserId}
            className="mood-light-chooser"
            role="group"
            aria-label="Keep my light on"
            hidden={!chooserOpen || phase !== "off"}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setChooserOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            {choices.map((choice, index) => (
              <button
                key={choice.id}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                className="mood-light-option pressable"
                onClick={() => void switchOn(choice.id)}
                disabled={!online || Boolean(busy)}
                aria-busy={busy === choice.id || undefined}
              >
                <span className="mood-light-option-label">{choice.label}</span>
                <span className="mood-light-option-detail">{busy === choice.id ? "Switching on…" : choice.detail}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
