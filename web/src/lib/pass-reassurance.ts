/**
 * Warm passes, rain checks and the re-ask cooldown for Asks.
 *
 * Research rec #2 (Kim et al. 2020; Kim, Muise & Impett 2018; Dobson et al.
 * 2025): a pass delivered with reassurance (affection, attraction, interest in a
 * future time) keeps the asker's satisfaction and interest up, while a bare
 * refusal stings. So a pass is always free and one tap, the reviewer can add
 * one optional reassurance from a fixed list, and the asker never sees a cold
 * "Passed." Rec #4 (Rosen et al. 2024, demand-withdraw; the FTC's "nagging"
 * pattern): the same Ask rests for a week after a pass unless a rain check
 * opened it sooner, and a rain check comes back to the asker only as a quiet
 * suggestion they decide on. Nothing is re-sent automatically.
 *
 * The ids mirror functions/api/request-board.js PASS_NOTE_IDS, and the activity
 * copy mirrors functions/api/_activity.js PASS_ACTIVITY_COPY.
 */

import { requestedActDecisions, requestCounterItems } from "./request-state";
import type { PassNoteId, RequestRecord } from "@/lib/types";

export type PassReassurance = {
  id: PassNoteId;
  /** The one-tap chip on the reply card. */
  chip: string;
  /** How the asker hears it, in the reviewer's voice. */
  quote: string;
  rainCheck: boolean;
};

export const PASS_REASSURANCES: PassReassurance[] = [
  { id: "still_want", chip: "Not tonight, I still want you", quote: "Not tonight. I still want you.", rainCheck: false },
  { id: "love_asked", chip: "Love that you asked", quote: "Love that you asked.", rainCheck: false },
  { id: "this_weekend", chip: "Ask me this weekend", quote: "Ask me again this weekend.", rainCheck: true },
  { id: "next_week", chip: "Rain check: next week", quote: "Rain check. Ask me again next week.", rainCheck: true },
];

// Same window as the server's REASK_COOLDOWN_MS.
export const REASK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const RAIN_CHECK_HOUR = 10;

export function passReassuranceFor(id: string | undefined | null): PassReassurance | null {
  return PASS_REASSURANCES.find((item) => item.id === id) || null;
}

/**
 * When a rain check comes back, in the reviewer's local time: Saturday morning
 * for "this weekend" (Sunday morning if it's already Saturday after 10, and the
 * next Saturday if it's Sunday after 10), and a week from today at 10 am for
 * "next week". Morning so the asker can still make it an Ask for that day.
 */
export function rainCheckTimeFor(id: PassNoteId, now: Date = new Date()): Date | null {
  const at = (dayOffset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, RAIN_CHECK_HOUR, 0, 0, 0);
  if (id === "next_week") return at(7);
  if (id !== "this_weekend") return null;
  const day = now.getDay(); // 0 Sun … 6 Sat
  if (day === 6) return at(0).getTime() > now.getTime() ? at(0) : at(1);
  if (day === 0) return at(0).getTime() > now.getTime() ? at(0) : at(6);
  return at(6 - day);
}

/** A reply that passed on every requested Act (no yes, no maybe, no counter). */
export function isPlainPass(request: RequestRecord): boolean {
  if (!["reviewed", "on_deck", "archived", "expired"].includes(request.status)) return false;
  if (request.withdrawnAt) return false;
  if (requestCounterItems(request).length) return false;
  const answers = requestedActDecisions(request);
  return answers.length > 0 && answers.every((item) => item.decision === "No");
}

/** "this weekend" / "next week" / "Saturday" for a rain check time. */
export function rainCheckWhen(request: RequestRecord): string {
  const reassurance = passReassuranceFor(request.passNote);
  if (reassurance?.id === "this_weekend") return "this weekend";
  if (reassurance?.id === "next_week") return "next week";
  return "later";
}

/**
 * The one line that says how a pass went, from either side. Never a bare
 * "passed": the asker hears it was for now and that no reason is owed.
 */
export function passOutcomeLine(request: RequestRecord, { mine, partnerName }: { mine: boolean; partnerName: string }): string {
  const reassurance = passReassuranceFor(request.passNote);
  if (!mine) {
    if (reassurance?.rainCheck) return `You passed for now and offered a rain check for ${rainCheckWhen(request)}.`;
    return "You passed for now. No reason needed.";
  }
  if (reassurance?.id === "still_want") return `Not tonight, but ${partnerName} still wants you.`;
  if (reassurance?.rainCheck) return `${partnerName} passed for now and wants you to ask again ${rainCheckWhen(request)}.`;
  return `${partnerName} passed for now. No reason needed.`;
}

/** Activity + toast copy for a pass room event (`passed` or `passed_<id>`). */
export function passActivityText(action: string, actorFirstName: string): string {
  const who = actorFirstName || "Your partner";
  switch (action) {
    case "passed_still_want": return `Not tonight, but ${who} still wants you.`;
    case "passed_love_asked": return `${who} passed for now, and loved that you asked.`;
    case "passed_this_weekend": return `${who} said ask again this weekend.`;
    case "passed_next_week": return `${who} took a rain check for next week.`;
    default: return `${who} passed for now. No reason needed.`;
  }
}

export function isPassActivityAction(action: string): boolean {
  return action === "passed" || /^passed_(still_want|love_asked|this_weekend|next_week)$/.test(action);
}

function actSetKey(categories: string[]): string {
  const keys = (categories || [])
    .map((label) => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(keys)].sort().join("|");
}

/**
 * The re-ask cooldown for a set of Acts, from the asker's decrypted board (the
 * server can't compare Room-Encrypted Asks, so the client applies the same rule).
 * Returns when the Ask opens up again, or null when it's free to send.
 */
export function reaskCooldown(
  requests: RequestRecord[],
  { myEmail, partnerEmail, categories, now = Date.now() }: { myEmail: string; partnerEmail: string; categories: string[]; now?: number },
): { until: Date; request: RequestRecord } | null {
  const key = actSetKey(categories);
  if (!key) return null;
  const me = myEmail.trim().toLowerCase();
  const partner = partnerEmail.trim().toLowerCase();
  let best: { until: Date; request: RequestRecord } | null = null;
  for (const request of requests || []) {
    if (String(request.requesterEmail || "").toLowerCase() !== me) continue;
    if (String(request.reviewerEmail || "").toLowerCase() !== partner) continue;
    if (request.e2eeLocked || !isPlainPass(request)) continue;
    if (actSetKey(request.categories) !== key) continue;
    const passedMs = Date.parse(request.reviewedAt || "");
    if (!Number.isFinite(passedMs)) continue;
    let untilMs = passedMs + REASK_COOLDOWN_MS;
    const rainMs = Date.parse(request.rainCheckAt || "");
    // A rain check opens it at exactly the time the rain-check copy shows.
    if (Number.isFinite(rainMs)) untilMs = rainMs;
    if (now >= untilMs) continue;
    if (!best || untilMs > best.until.getTime()) best = { until: new Date(untilMs), request };
  }
  return best;
}

/**
 * Rain checks that have come due for the asker: a gentle "Try this again?" on
 * Home. One per Ask, gone once set aside or once the asker sends the same Acts
 * again. Never shown to the reviewer, never a push.
 */
export function dueRainChecks(requests: RequestRecord[], myEmail: string, now: number = Date.now()): RequestRecord[] {
  const me = myEmail.trim().toLowerCase();
  const mine = (requests || []).filter((request) => String(request.requesterEmail || "").toLowerCase() === me);
  return mine.filter((request) => {
    if (!request.rainCheckAt || request.rainCheckDismissedAt || request.e2eeLocked) return false;
    if (!passReassuranceFor(request.passNote)?.rainCheck || !isPlainPass(request)) return false;
    const dueMs = Date.parse(request.rainCheckAt);
    if (!Number.isFinite(dueMs) || dueMs > now) return false;
    // Stale after two weeks: the moment has passed, so let it go quietly.
    if (now - dueMs > 14 * 24 * 60 * 60 * 1000) return false;
    const key = actSetKey(request.categories);
    const reasked = mine.some((other) => other.id !== request.id
      && actSetKey(other.categories) === key
      && Date.parse(other.sentAt || other.createdAt || "") > Date.parse(request.reviewedAt || ""));
    return !reasked;
  });
}
