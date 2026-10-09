/**
 * "Plan it" time helpers for the match moment (/mutual) and the Sexboard's
 * Planned rows. Everything is local time on the viewer's device: the plan is
 * stored as an ISO instant, so both partners see it in their own clock.
 */

export type PlanSlot = "tonight" | "tomorrow" | "weekend" | "custom";

export const PLAN_SLOTS: { id: PlanSlot; label: string }[] = [
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "custom", label: "Pick a time" },
];

// Default hour for the quick slots. 9 pm is the product's "tonight".
const EVENING_HOUR = 21;
const QUARTER_MS = 15 * 60 * 1000;
// Mirrors the server bound (functions/api/request-board.js PLAN_MAX_AHEAD_MS).
export const PLAN_MAX_AHEAD_DAYS = 60;

function atHour(base: Date, dayOffset: number, hour = EVENING_HOUR): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0, 0, 0);
}

function roundUpToQuarter(ms: number): Date {
  return new Date(Math.ceil(ms / QUARTER_MS) * QUARTER_MS);
}

/** The concrete time a quick slot means right now. `custom` has no default. */
export function resolvePlanSlot(slot: PlanSlot, now: Date = new Date()): Date | null {
  if (slot === "tonight") {
    const tonight = atHour(now, 0);
    // Already past 9 pm: "tonight" means soon, not a time that has gone by.
    return tonight.getTime() > now.getTime() ? tonight : roundUpToQuarter(now.getTime() + 30 * 60 * 1000);
  }
  if (slot === "tomorrow") return atHour(now, 1);
  if (slot === "weekend") {
    const day = now.getDay(); // 0 Sun … 6 Sat
    if (day === 6) {
      const sat = atHour(now, 0);
      return sat.getTime() > now.getTime() ? sat : atHour(now, 1);
    }
    if (day === 0) {
      const sun = atHour(now, 0);
      return sun.getTime() > now.getTime() ? sun : atHour(now, 6);
    }
    return atHour(now, 6 - day);
  }
  return null;
}

function dayDiff(target: Date, now: Date) {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - n) / 86_400_000);
}

/** "9 pm", "8:30 pm", "11 am". */
export function planTimeLabel(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

/** "Tonight", "Today", "Tomorrow", "Saturday", "Oct 14". */
export function planDayLabel(date: Date, now: Date = new Date()): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return date.getHours() >= 17 ? "Tonight" : "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Tonight, 9 pm" · "Saturday, 9 pm" · "Oct 14, 8:30 pm". */
export function planLabel(date: Date, now: Date = new Date()): string {
  return `${planDayLabel(date, now)}, ${planTimeLabel(date)}`;
}

/** Mid-sentence form: "tonight, 9 pm" · "Saturday, 9 pm" (for "Planned for …"). */
export function planPhrase(date: Date, now: Date = new Date()): string {
  const day = planDayLabel(date, now);
  const lead = day === "Tonight" || day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day;
  return `${lead}, ${planTimeLabel(date)}`;
}

/**
 * The belief line shown wherever a plan is made. Planned sex was as satisfying
 * as spontaneous sex in a 21-day diary study of 121 couples, and participants
 * said planning built anticipation (Kovacevic, Muise et al. 2023); reading a
 * short summary of that research led to more sex and higher desire over two
 * weeks in a randomized experiment with parents of young children (Kovacevic
 * et al. 2025). One sentence, never a quota or a reminder.
 */
export const PLAN_BELIEF_LINE = "Couples who plan sex enjoy it as much as the spontaneous kind, and the waiting is half the fun.";

/**
 * Warm countdown for a planned time: "In 40 minutes", "In 3 hours",
 * "In 2 days", "Any minute now". Rounded, never to-the-second.
 */
export function planCountdown(date: Date, now: Date = new Date()): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (minutes < 0) return "It’s time";
  if (minutes <= 5) return "Any minute now";
  if (minutes < 55) return `In ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "In an hour" : `In ${hours} hours`;
  const days = dayDiff(date, now);
  return days <= 1 ? "Tomorrow" : `In ${days} days`;
}

/**
 * Opening words for a teaser sext before a plan: the composer is prefilled
 * with this (never sent for you). Partner-directed, so the fantasy is about
 * them: "Tonight I'm going to ", "Saturday I'm going to ".
 */
export function planTeaserDraft(date: Date, now: Date = new Date()): string {
  const day = planDayLabel(date, now);
  if (day === "Today") return "Later I'm going to ";
  if (dayDiff(date, now) >= 7) return "When it's time, I'm going to ";
  return `${day} I'm going to `;
}

/** Which quick slot (if any) a stored plan corresponds to, for re-opening the picker. */
export function slotForPlan(date: Date | null, now: Date = new Date()): PlanSlot | null {
  if (!date) return null;
  for (const slot of ["tonight", "tomorrow", "weekend"] as PlanSlot[]) {
    const resolved = resolvePlanSlot(slot, now);
    if (resolved && Math.abs(resolved.getTime() - date.getTime()) < 60_000) return slot;
  }
  return "custom";
}

/** Value for <input type="datetime-local"> in local time ("2026-05-23T21:00"). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** True when a picked time is one the server will accept. */
export function isPlannableTime(date: Date | null, now: Date = new Date()): date is Date {
  if (!date) return false;
  const ms = date.getTime();
  return ms >= now.getTime() - 5 * 60 * 1000 && ms <= now.getTime() + PLAN_MAX_AHEAD_DAYS * 86_400_000;
}

/** True when `text` is only a plan teaser stem (what planTeaserDraft starts Sext with), nothing typed after it. */
export function isPlanTeaserStem(text: string): boolean {
  return /^(?:Later|When it's time,|Tonight|Today|Tomorrow|[A-Z][a-z]+day) I'm going to\s*$/.test(String(text || "").trimStart());
}
