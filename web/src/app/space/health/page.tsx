"use client";

/**
 * Health — what you've enjoyed together, not how much.
 *
 * The default view is moments and overlaps: recent approved Asks and Pile
 * overlaps, the acts that keep coming back, and firsts. No "days since", no
 * streaks, no who-asked-more, no targets. Counts and the rhythm chart are a
 * private, per-person opt-in (off by default, stored on your own profile and
 * never shown to your partner); the server only sends them to someone who
 * turned them on. Research: instructed frequency lowered wanting
 * (Loewenstein et al. 2015) and visible benchmarks create a "should"
 * (Muise, Schimmack & Impett 2016).
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import RollingNumber from "@/components/RollingNumber";
import { EmptyState, ErrorState, SkeletonList } from "@/components/States";
import {
  ApiUnauthorizedError,
  getHealthDashboard,
  updateProfileSettings,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import type {
  AuthInfo,
  HealthEvent,
  HealthRangeId,
  HealthResponse,
  Workspace,
} from "@/lib/types";
import "./health.css";

const RANGES: Array<{ id: HealthRangeId; label: string }> = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "no-workspace"; auth: AuthInfo }
  | { kind: "ready"; auth: AuthInfo; workspace: Workspace; health: HealthResponse };

export default function HealthPage() {
  const [range, setRange] = useState<HealthRangeId>("all");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState((current) => current.kind === "ready" ? current : { kind: "loading" });
        const profile = await getProfileCached();
        if (cancelled) return;
        if (!profile.activeWorkspace) {
          setState({ kind: "no-workspace", auth: profile.auth });
          return;
        }
        const health = await getHealthDashboard({
          workspaceId: profile.activeWorkspace.id,
          range,
        });
        if (cancelled) return;
        setState({
          kind: "ready",
          auth: profile.auth,
          workspace: profile.activeWorkspace,
          health,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState({ kind: "error", message: error instanceof Error ? error.message : "Couldn't load Health." });
      }
    })();
    return () => { cancelled = true; };
  }, [range, reloadKey]);

  async function setShowCounts(on: boolean) {
    await updateProfileSettings({ healthShowCounts: on });
    setReloadKey((value) => value + 1);
  }

  return (
    <AppShell>
      <ScreenHeader
        back={{ href: "/space", label: "Us" }}
        showBrand={false}
        title="Health"
        subtitle="What you've enjoyed together."
      />
      <Body
        state={state}
        range={range}
        onRange={setRange}
        onShowCounts={setShowCounts}
      />
    </AppShell>
  );
}

function Body({
  state,
  range,
  onRange,
  onShowCounts,
}: {
  state: LoadState;
  range: HealthRangeId;
  onRange: (range: HealthRangeId) => void;
  onShowCounts: (on: boolean) => Promise<void>;
}) {
  if (state.kind === "loading") return <SkeletonList count={4} />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Session expired"
        body="Sign in again to see Health."
        action={<Link href="/" className="btn-ghost">Back to sign-in</Link>}
      />
    );
  }
  if (state.kind === "error") {
    return <ErrorState title="Couldn't load Health" body={state.message} />;
  }
  if (state.kind === "no-workspace") {
    return (
      <ErrorState
        title="No partner space yet"
        body="Health is scoped to a shared room."
        action={<Link href="/space" className="btn-ghost">Open Us</Link>}
      />
    );
  }

  const health = state.health;
  return (
    <div className="health-stage">
      <RangePicker value={range} onChange={onRange} />
      <Moments events={health.events} />
      <ActChips title="Keeps coming back" label="Acts that keep coming back" acts={health.keepsShowingUp} />
      <ActChips title="Firsts" label="First times" acts={health.firsts} prefix="First time: " />
      {health.showCounts && (
        <>
          <HealthSummary health={health} />
          <RhythmCard health={health} />
          <TopActs health={health} />
        </>
      )}
      <CountsSetting on={health.showCounts} onChange={onShowCounts} />
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: HealthRangeId;
  onChange: (range: HealthRangeId) => void;
}) {
  const activeIndex = Math.max(0, RANGES.findIndex((item) => item.id === value));
  return (
    <div
      className="health-range"
      role="group"
      aria-label="Health range"
      style={{ "--active-index": activeIndex } as CSSProperties}
    >
      <span className="health-range-thumb" aria-hidden="true" />
      {RANGES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          className={`health-range-button pressable ${value === item.id ? "is-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HealthSummary({ health }: { health: HealthResponse }) {
  const totals = health.totals;
  if (!totals) return null;
  return (
    <section className="health-summary" aria-label="Health summary">
      <div className="health-summary-head">
        <p className="eyebrow">{health.range.label}</p>
        <span className="health-rule-pill">only you see this</span>
      </div>
      <div className="health-hero-stat">
        <RollingNumber value={totals.sexEvents} className="health-hero-num" />
        <div className="health-hero-meta">
          <strong>sex event{totals.sexEvents === 1 ? "" : "s"}</strong>
          <span>
            {totals.askEvents} Ask{totals.askEvents === 1 ? "" : "s"} · {totals.pileEvents} Pile overlap{totals.pileEvents === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="health-substat-grid">
        <div className="health-substat">
          <RollingNumber value={totals.sexActs} className="health-substat-num" />
          <p>approved Acts</p>
        </div>
        <div className="health-substat">
          <RollingNumber value={totals.uniqueActs} className="health-substat-num" />
          <p>unique Acts</p>
        </div>
      </div>
    </section>
  );
}

function RhythmCard({ health }: { health: HealthResponse }) {
  const buckets = useMemo(() => compactRhythm(health), [health]);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.sexEvents));
  return (
    <section className="health-section" aria-label="Rhythm">
      <div className="health-section-head">
        <h2>Rhythm</h2>
        <span>by day</span>
      </div>
      <div className="health-card health-rhythm-card">
        <div className="health-bars" aria-hidden="true">
          {buckets.map((bucket, index) => {
            const height = Math.max(10, Math.round((bucket.sexEvents / max) * 78));
            return (
              <span
                key={bucket.date}
                className={`health-bar ${bucket.pileEvents ? "has-pile" : ""} ${bucket.askEvents ? "has-ask" : ""}`}
                style={{ height, animationDelay: `${260 + index * 46}ms` } as CSSProperties}
              />
            );
          })}
        </div>
        <p>
          Approved Asks and Pile overlaps, grouped by day. A picture, not a target.
        </p>
      </div>
    </section>
  );
}

function TopActs({ health }: { health: HealthResponse }) {
  const topActs = health.topActs || [];
  if (!topActs.length) return null;
  const max = Math.max(1, ...topActs.map((act) => act.count));
  return (
    <section className="health-section" aria-label="Act counts">
      <div className="health-section-head">
        <h2>Acts showing up</h2>
        <span>top {Math.min(5, topActs.length)}</span>
      </div>
      <div className="health-card health-act-list">
        {topActs.slice(0, 5).map((act, index) => (
          <div key={act.label} className="health-act-row">
            <span>
              <strong>{act.label}</strong>
              <span className="health-meter">
                <span
                  style={{
                    width: `${Math.max(8, Math.round((act.count / max) * 100))}%`,
                    animationDelay: `${220 + index * 90}ms`,
                  } as CSSProperties}
                />
              </span>
            </span>
            <em>{act.count}x</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function Moments({ events }: { events: HealthEvent[] }) {
  if (!events.length) {
    return (
      <EmptyState
        title="Nothing here yet."
        body="Approved Asks and Pile overlaps show up here as moments you shared."
        action={<Link href="/ask" className="btn-ghost">Send an Ask</Link>}
      />
    );
  }

  return (
    <section className="health-section" aria-label="Moments">
      <div className="health-section-head">
        <h2>Lately</h2>
      </div>
      <div className="health-card health-event-list">
        {events.slice(0, 8).map((event) => (
          <div key={event.id} className="health-event-row">
            <span className={`health-event-type ${event.type === "pile" ? "is-pile" : ""}`}>
              {event.type === "pile" ? "Pile" : "Ask"}
            </span>
            <span className="health-event-copy">
              <strong>{event.acts.slice(0, 3).join(", ")}{event.acts.length > 3 ? "…" : ""}</strong>
              <span>{formatDate(event.at)}</span>
            </span>
            {/* The emoji row reads as one image named by the act list. */}
            <span className="health-event-acts" role="img" aria-label={event.acts.join(", ")}>
              {eventActSummaries(event).slice(0, 4).map((act, index) => (
                <span key={`${event.id}-${act.label}-${index}`} className="health-act-emoji" title={act.label}>
                  {act.emoji}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActChips({
  title,
  label,
  acts,
  prefix = "",
}: {
  title: string;
  label: string;
  acts: Array<{ label: string; emoji: string }>;
  prefix?: string;
}) {
  if (!acts.length) return null;
  return (
    <section className="health-section" aria-label={label}>
      <div className="health-section-head">
        <h2>{title}</h2>
      </div>
      <div className="health-chip-row" role="group" aria-label={label}>
        {acts.map((act) => (
          <span key={act.label} className="chip">{act.emoji} {prefix}{act.label}</span>
        ))}
      </div>
    </section>
  );
}

// Counts and the rhythm chart are each person's own choice. The setting lives
// on your profile; your partner never sees it or your numbers.
function CountsSetting({ on, onChange }: { on: boolean; onChange: (on: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onChange(!on); }
    catch { setError("Couldn't save that. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <section className="health-section health-counts-setting" aria-label="Counts">
      <div className="health-card">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className="settings-row pressable"
          onClick={toggle}
          disabled={busy}
          data-testid="health-counts-toggle"
        >
          <span>
            <span className="settings-row-title">Show counts and rhythm</span>
            <span className="settings-row-sub">Off unless you turn it on. Only you see this choice and these numbers.</span>
          </span>
          <span className={`switch ${on ? "is-on" : ""}`} aria-hidden="true">
            <span className="switch-thumb" />
          </span>
        </button>
      </div>
      {error && <p className="health-counts-error" role="alert">{error}</p>}
    </section>
  );
}

function eventActSummaries(event: HealthEvent) {
  if (event.actSummaries?.length) return event.actSummaries;
  return event.acts.map((label) => ({ label, emoji: emojiFromLabel(label) }));
}

const CLIENT_ACT_EMOJI_RULES: Array<{ terms: string[]; emoji: string }> = [
  { terms: ["kiss", "make out", "makeout"], emoji: "💋" },
  { terms: ["oral", "tongue", "lick", "mouth", "blow", "suck"], emoji: "👅" },
  { terms: ["massage", "rub"], emoji: "💆" },
  { terms: ["shower"], emoji: "🚿" },
  { terms: ["bath", "tub"], emoji: "🛁" },
  { terms: ["filming = yes", "filming yes", "recording", "camcorder"], emoji: "📹" },
  { terms: ["toy", "vibrator", "plug"], emoji: "🎁" },
  { terms: ["dirty talk", "talk"], emoji: "💬" },
  { terms: ["restraint", "tie", "bound", "pinned", "hands"], emoji: "⛓️" },
  { terms: ["cowgirl", "reverse"], emoji: "🤠" },
  { terms: ["behind", "doggy"], emoji: "🍑" },
  { terms: ["wall", "standing"], emoji: "🧍" },
  { terms: ["couch"], emoji: "🛋️" },
  { terms: ["roleplay", "role play"], emoji: "🎭" },
  { terms: ["cuddle", "aftercare", "hold"], emoji: "🤗" },
  { terms: ["penetration", "sex"], emoji: "🍆" },
  { terms: ["rough", "active"], emoji: "🔥" },
  { terms: ["slow"], emoji: "🐢" },
  { terms: ["kink"], emoji: "🔗" },
];

function emojiFromLabel(label: string) {
  const trimmed = label.trim();
  const match = trimmed.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*/u);
  if (match?.[1]) return match[1];
  const normalized = trimmed.toLowerCase();
  const matched = CLIENT_ACT_EMOJI_RULES.find((rule) => rule.terms.some((term) => normalized.includes(term)));
  return matched?.emoji || "💞";
}

function compactRhythm(health: HealthResponse) {
  const rhythm = health.rhythm || [];
  if (rhythm.length >= 12) return rhythm.slice(-12);
  if (rhythm.length > 0) {
    const existing = rhythm.slice();
    const start = new Date(existing[0].date);
    const pads = [];
    for (let index = 12 - existing.length; index > 0; index -= 1) {
      const date = new Date(start);
      date.setDate(start.getDate() - index);
      const key = date.toISOString().slice(0, 10);
      pads.push({ date: key, sexEvents: 0, sexActs: 0, askEvents: 0, pileEvents: 0 });
    }
    return [...pads, ...existing];
  }
  const end = new Date(health.range.to || Date.now());
  const buckets = [];
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    buckets.push({ date: key, sexEvents: 0, sexActs: 0, askEvents: 0, pileEvents: 0 });
  }
  return buckets;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
