// Mood light — a double-blind "I'm horny" signal.
//
// Each partner can switch their mood light ON until an absolute time (the UI
// offers "next hour", "tonight", "until I turn it off"), or OFF at any time. The
// server NEVER reveals a partner's state on its own: the response only says
// something about the partner when EVERY active member is currently on — a
// match. Otherwise the response is built from the caller's own state alone, so
// it is byte-for-byte the same whether the partner is on, off, or expired.
//
// "On" comes in two states:
//   - "horny": the spontaneous kind.
//   - "open":  not there yet, but open to being seduced. Responsive desire,
//     wanting that shows up once things start, is a common pattern in long
//     relationships rather than a lesser one (Basson 2000, J Sex Marital Ther
//     26(1):51-65; Carvalheira, Brotto & Leal 2010, J Sex Med 7(4):1454-1463:
//     women in longer relationships more often began sex without desire at
//     the outset). So "open" is a first-class "on": any mix of the two states
//     matches (horny+horny, horny+open, open+open), and only the match reveals
//     which state the partner chose.
// Records written before the second state existed carry no `state`; they read
// as "horny". Switching state while on (action "state") is an update, not a
// new switch-on: it can't form or end a match (a match only needs everyone
// on), it never pushes, and it touches no cooldown, so it can't be used to
// learn anything the response doesn't already say.
//
// Inherent limit (same as every double-blind reveal in the app): a partner can
// probe by switching on and seeing whether a match appears. Three things blunt
// that:
//   1. Switching back ON within MOOD_COOLDOWN_MS of switching OFF is refused
//      (429 + retryAt), so each probe costs a cooldown.
//   2. A window is never shorter than MIN_WINDOW_MS, so letting a tiny window
//      lapse is not a cooldown-free way to "switch off".
//   3. A probe that hits is not silent: the partner gets the match too (room
//      event + push), so probing announces itself.
// The match's `since` is the moment the match FORMED (the later of the two
// switch-on times), never when the partner first switched on.
//
// Storage: one small record per workspace (`mood:<workspaceId>` in the
// encrypted-at-rest `sexualsync-mood` store), written only on real transitions
// to keep KV writes low. Writes go through mutateKey (CAS) so two partners
// switching on at the same moment compose; reads go through readKeyStrong so a
// switch you just made is visible immediately (KV is eventually consistent).
// Expiry is evaluated at read time — no timers, no background writes.
//
// Shared product handler (Cloudflare + self-host): Web-standard globals and the
// storage / room / push seams only.

import { mutateKey, readKeyStrong } from "./_state.js";
import { getAuthenticatedIdentity, jsonResponse, normalizeEmail } from "./_auth.js";
import {
  authorizeWorkspaceAccess,
  cleanText,
  workspaceIdFromPayload,
  workspaceIdFromRequest,
} from "./_workspaces.js";
import { notifyWorkspaceEvent } from "./_notification_policy.js";
import { broadcastRoomSignal } from "./_live_room.js";
import { recordActivityEvent } from "./_activity.js";

export const MOOD_STORE_NAME = "sexualsync-mood";
export function moodKey(workspaceId) { return `mood:${workspaceId}`; }

export const MOOD_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MOOD_MIN_WINDOW_MS = 15 * 60 * 1000;
export const MOOD_COOLDOWN_MS = 5 * 60 * 1000;
// Re-sending ON with an `until` this close to the stored one is a no-op (no
// KV write) — absorbs double-taps and client clock jitter.
const UNTIL_NOOP_TOLERANCE_MS = 60 * 1000;

export const MOOD_PUSH_TAG = "mood-match";
export const MOOD_STATES = Object.freeze(["horny", "open"]);
const DEFAULT_MOOD_STATE = "horny";

/** Unknown, missing or legacy values all read as "horny". */
export function normalizeMoodState(value) {
  return value === "open" ? "open" : DEFAULT_MOOD_STATE;
}
export const MOOD_ROOM_RESOURCE = "mood";

function toMs(value) {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function activeMemberEmails(workspace) {
  return (workspace?.members || [])
    .filter((member) => member.status === "active")
    .map((member) => normalizeEmail(member.email))
    .filter(Boolean);
}

function cleanEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = {};
  const since = toMs(raw.since);
  const until = toMs(raw.until);
  const offAt = toMs(raw.offAt);
  if (since && until) {
    entry.since = iso(since);
    entry.until = iso(until);
    entry.state = normalizeMoodState(raw.state);
  }
  if (offAt) entry.offAt = iso(offAt);
  return Object.keys(entry).length ? entry : null;
}

function cleanRecord(raw) {
  const byEmail = {};
  const source = raw && typeof raw === "object" && raw.byEmail && typeof raw.byEmail === "object" ? raw.byEmail : {};
  for (const [email, value] of Object.entries(source)) {
    const normalized = normalizeEmail(email);
    const entry = cleanEntry(value);
    if (normalized && entry) byEmail[normalized] = entry;
  }
  return { v: 1, byEmail };
}

function entryOn(entry, nowMs) {
  return Boolean(entry && toMs(entry.since) && toMs(entry.until) > nowMs);
}

// Drop dead weight before a write: expired windows and cooldown stamps older
// than the cooldown carry no information the protocol needs.
function pruneRecord(record, nowMs) {
  const byEmail = {};
  for (const [email, entry] of Object.entries(record.byEmail)) {
    const next = {};
    if (entryOn(entry, nowMs)) {
      next.since = entry.since;
      next.until = entry.until;
      next.state = normalizeMoodState(entry.state);
    }
    if (entry.offAt && nowMs - toMs(entry.offAt) < MOOD_COOLDOWN_MS) next.offAt = entry.offAt;
    if (Object.keys(next).length) byEmail[email] = next;
  }
  return { v: 1, byEmail };
}

/**
 * The match, if every active member (and at least two) is on right now, in
 * either state.
 * since = the later switch-on time (when the match formed),
 * until = the earliest expiry (when it ends unless someone extends),
 * kind  = "horny" (everyone horny) | "open" (everyone open) | "mixed".
 */
export function deriveMoodMatch(record, workspace, nowMs = Date.now()) {
  const emails = activeMemberEmails(workspace);
  if (emails.length < 2) return null;
  const clean = cleanRecord(record);
  const entries = emails.map((email) => clean.byEmail[email]);
  if (!entries.every((entry) => entryOn(entry, nowMs))) return null;
  const since = Math.max(...entries.map((entry) => toMs(entry.since)));
  const until = Math.min(...entries.map((entry) => toMs(entry.until)));
  const states = new Set(entries.map((entry) => normalizeMoodState(entry.state)));
  const kind = states.size > 1 ? "mixed" : [...states][0];
  return { since: iso(since), until: iso(until), kind };
}

// The other members' state, as the caller sees it inside a match: "horny" if
// any of them is horny, else "open". Only ever computed when a match exists.
function partnerStateFor(record, workspace, actorEmail) {
  const me = normalizeEmail(actorEmail);
  const others = activeMemberEmails(workspace).filter((email) => email !== me);
  return others.some((email) => normalizeMoodState(record.byEmail[email]?.state) === "horny") ? "horny" : "open";
}

function cooldownUntilFor(entry, nowMs) {
  const offAt = toMs(entry?.offAt);
  if (!offAt) return 0;
  const until = offAt + MOOD_COOLDOWN_MS;
  return until > nowMs ? until : 0;
}

/**
 * The ONLY shape a caller ever sees. Everything except `match` is derived from
 * the caller's own entry, and `match` is null unless everyone is on — so when
 * there is no match the response is identical whatever the partner's state
 * (off, horny, open, cooling down, or lapsed). The partner's state appears
 * only inside a match, where both of you already know it.
 */
export function publicMood(record, workspace, actorEmail, nowMs = Date.now()) {
  const clean = cleanRecord(record);
  const mine = clean.byEmail[normalizeEmail(actorEmail)] || null;
  const on = entryOn(mine, nowMs);
  const cooldownUntil = on ? 0 : cooldownUntilFor(mine, nowMs);
  const match = deriveMoodMatch(clean, workspace, nowMs);
  return {
    workspaceId: workspace?.id || "",
    mine: {
      on,
      state: on ? normalizeMoodState(mine.state) : null,
      since: on ? mine.since : null,
      until: on ? mine.until : null,
      cooldownUntil: cooldownUntil ? iso(cooldownUntil) : null,
    },
    match: match ? { ...match, partnerState: partnerStateFor(clean, workspace, actorEmail) } : null,
    serverNow: iso(nowMs),
  };
}

/**
 * Validate + clamp a requested `until`. Returns { ok, untilMs } or
 * { ok:false, error }. Past/now is rejected; beyond 24h is clamped down; under
 * the minimum window is clamped up (see probing note at the top).
 */
export function clampMoodUntil(value, nowMs = Date.now()) {
  const requested = toMs(value);
  if (!requested) return { ok: false, error: "Pick how long." };
  if (requested <= nowMs) return { ok: false, error: "That time has already passed." };
  const untilMs = Math.min(nowMs + MOOD_MAX_WINDOW_MS, Math.max(nowMs + MOOD_MIN_WINDOW_MS, requested));
  return { ok: true, untilMs };
}

// A live match whose kind changed (someone switched state while matched).
// Never true when a match formed or ended: those have their own events.
function matchRestated(before, after) {
  return Boolean(before && after && before.kind !== after.kind);
}

/**
 * Pure transition for "switch ON (or extend) until untilMs" in `state`
 * ("horny" | "open"). Returns the mutateKey transform outcome plus what
 * happened.
 */
export function applyMoodOn(current, workspace, actorEmail, untilMs, nowMs = Date.now(), state = DEFAULT_MOOD_STATE) {
  const email = normalizeEmail(actorEmail);
  const nextState = normalizeMoodState(state);
  const record = cleanRecord(current);
  const before = deriveMoodMatch(record, workspace, nowMs);
  const mine = record.byEmail[email] || null;
  const wasOn = entryOn(mine, nowMs);

  if (!wasOn) {
    const cooldownUntil = cooldownUntilFor(mine, nowMs);
    if (cooldownUntil) {
      return { write: false, result: { status: "cooldown", retryAt: iso(cooldownUntil), record } };
    }
  } else if (
    Math.abs(toMs(mine.until) - untilMs) < UNTIL_NOOP_TOLERANCE_MS
    && normalizeMoodState(mine.state) === nextState
  ) {
    return { write: false, result: { status: "unchanged", record, formed: false } };
  }

  const next = pruneRecord(record, nowMs);
  next.byEmail[email] = {
    since: wasOn ? mine.since : iso(nowMs),
    until: iso(untilMs),
    state: nextState,
  };
  const after = deriveMoodMatch(next, workspace, nowMs);
  return {
    value: next,
    result: {
      status: "ok",
      record: next,
      formed: Boolean(after && !before),
      restated: matchRestated(before, after),
      match: after,
    },
  };
}

/**
 * Pure transition for "switch my state while on" (horny <-> open). Keeps the
 * window exactly as it is. Off (or lapsed) callers get status "off" and no
 * write: switching state is never a way to switch on.
 */
export function applyMoodState(current, workspace, actorEmail, state, nowMs = Date.now()) {
  const email = normalizeEmail(actorEmail);
  const nextState = normalizeMoodState(state);
  const record = cleanRecord(current);
  const mine = record.byEmail[email] || null;
  if (!entryOn(mine, nowMs)) {
    return { write: false, result: { status: "off", record } };
  }
  if (normalizeMoodState(mine.state) === nextState) {
    return { write: false, result: { status: "unchanged", record, restated: false } };
  }
  const before = deriveMoodMatch(record, workspace, nowMs);
  const next = pruneRecord(record, nowMs);
  next.byEmail[email] = { since: mine.since, until: mine.until, state: nextState };
  const after = deriveMoodMatch(next, workspace, nowMs);
  return {
    value: next,
    result: { status: "ok", record: next, restated: matchRestated(before, after), match: after },
  };
}

/** Pure transition for "switch OFF". */
export function applyMoodOff(current, workspace, actorEmail, nowMs = Date.now()) {
  const email = normalizeEmail(actorEmail);
  const record = cleanRecord(current);
  const mine = record.byEmail[email] || null;
  if (!entryOn(mine, nowMs)) {
    // Already off (or lapsed): nothing to write, no new cooldown.
    return { write: false, result: { status: "unchanged", record, ended: false } };
  }
  const before = deriveMoodMatch(record, workspace, nowMs);
  const next = pruneRecord(record, nowMs);
  next.byEmail[email] = { offAt: iso(nowMs) };
  return { value: next, result: { status: "ok", record: next, ended: Boolean(before) } };
}

export async function readMoodRecord(env, workspaceId) {
  try {
    return await readKeyStrong(env, MOOD_STORE_NAME, moodKey(workspaceId));
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;

  const request = context.request;
  const method = request.method.toUpperCase();
  let payload = {};
  if (method === "POST") {
    try { payload = await request.json(); }
    catch { return jsonResponse(400, { error: "Expected JSON body." }); }
  } else if (method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const workspaceId = method === "GET"
    ? workspaceIdFromRequest(request)
    : workspaceIdFromPayload(payload, workspaceIdFromRequest(request));
  const access = await authorizeWorkspaceAccess(context, identity, workspaceId);
  if (!access.ok) return access.response;

  const workspace = access.workspace;
  const actorEmail = normalizeEmail(identity.email);
  const nowMs = Date.now();

  if (method === "GET") {
    const record = await readMoodRecord(context.env, workspace.id);
    return jsonResponse(200, publicMood(record, workspace, actorEmail, nowMs));
  }

  const action = cleanText(payload.action, 16).toLowerCase();
  const requestedState = cleanText(payload.state, 16).toLowerCase();
  if (requestedState && !MOOD_STATES.includes(requestedState)) {
    return jsonResponse(400, { error: "Unsupported mood state.", code: "mood_invalid_state" });
  }

  if (action === "on") {
    const clamp = clampMoodUntil(payload.until, nowMs);
    if (!clamp.ok) return jsonResponse(400, { error: clamp.error, code: "mood_invalid_until" });
    const state = requestedState || DEFAULT_MOOD_STATE;
    const outcome = await mutateKey(context.env, MOOD_STORE_NAME, moodKey(workspace.id), (current) => (
      applyMoodOn(current, workspace, actorEmail, clamp.untilMs, nowMs, state)
    ));
    if (outcome.status === "cooldown") {
      return jsonResponse(429, {
        error: "You just switched it off. Give it a few minutes.",
        code: "mood_cooldown",
        retryAt: outcome.retryAt,
        ...publicMood(outcome.record, workspace, actorEmail, nowMs),
      });
    }
    if (outcome.formed && outcome.match) {
      announceMatch(context, workspace.id, actorEmail, outcome.match, state);
    } else if (outcome.restated && outcome.match) {
      restateMatch(context, workspace.id, outcome.match);
    }
    return jsonResponse(200, publicMood(outcome.record, workspace, actorEmail, nowMs));
  }

  if (action === "state") {
    if (!requestedState) return jsonResponse(400, { error: "Pick horny or open.", code: "mood_invalid_state" });
    const outcome = await mutateKey(context.env, MOOD_STORE_NAME, moodKey(workspace.id), (current) => (
      applyMoodState(current, workspace, actorEmail, requestedState, nowMs)
    ));
    if (outcome.status === "off") {
      // Only the caller's own state is in here: they already know they're off.
      return jsonResponse(409, {
        error: "Switch it on first.",
        code: "mood_off",
        ...publicMood(outcome.record, workspace, actorEmail, nowMs),
      });
    }
    if (outcome.restated && outcome.match) restateMatch(context, workspace.id, outcome.match);
    return jsonResponse(200, publicMood(outcome.record, workspace, actorEmail, nowMs));
  }

  if (action === "off") {
    const outcome = await mutateKey(context.env, MOOD_STORE_NAME, moodKey(workspace.id), (current) => (
      applyMoodOff(current, workspace, actorEmail, nowMs)
    ));
    if (outcome.ended) {
      // Neutral: no actor, so neither the event nor the client can say who
      // switched off. Broadcast-only — an ended match isn't an activity item.
      broadcastRoomSignal(context, workspace.id, {
        resource: MOOD_ROOM_RESOURCE,
        action: "ended",
      });
    }
    return jsonResponse(200, publicMood(outcome.record, workspace, actorEmail, nowMs));
  }

  return jsonResponse(400, { error: "Unsupported mood action." });
}

// Activity actions per match kind. The live room event is always `match`
// (one shape, both runtimes); only the recorded feed item names the kind, with
// a label that reads the same for both members (no actor, no "who's which").
const MATCH_ACTIVITY_ACTION = Object.freeze({
  horny: "match",
  open: "match_open",
  mixed: "match_mixed",
});

// Push copy per kind, from the recipient's side. The lock-screen scrub in
// notifyWorkspaceEvent replaces it anyway; this is what an unscrubbed channel
// would say, and it never names anyone.
function matchPushBody(match, actorState) {
  if (match.kind === "open") return "You're both open to it.";
  if (match.kind === "mixed") {
    return normalizeMoodState(actorState) === "horny" ? "They're horny for you." : "They're open to being seduced.";
  }
  return "You're both horny.";
}

function announceMatch(context, workspaceId, actorEmail, match, actorState) {
  // Live room event + one activity item for BOTH members. No actor on either:
  // it is a shared state ("you're both up for it"), so every connected device,
  // including the switcher's other devices, receives it, and the activity row
  // reads the same for both. entityId is the match's formation time, which is
  // already in both members' responses. One id ties the event to its row.
  const id = crypto.randomUUID();
  broadcastRoomSignal(context, workspaceId, {
    id,
    resource: MOOD_ROOM_RESOURCE,
    action: "match",
    entityId: match.since,
    at: match.since,
  });
  const recorded = recordActivityEvent(context?.env, workspaceId, {
    id,
    resource: MOOD_ROOM_RESOURCE,
    action: MATCH_ACTIVITY_ACTION[match.kind] || MATCH_ACTIVITY_ACTION.horny,
    entityId: match.since,
    at: match.since,
  }).catch(() => null);
  context.waitUntil?.(recorded);
  // Push to the partner (the switcher already has the match in this response).
  // notifyWorkspaceEvent applies the usual policy: per-device `mood-match`
  // preference, recipient-active suppression (a partner with the app open gets
  // the live event instead of a push), and the lock-screen scrub, so no name or
  // explicit copy ever reaches a lock screen.
  // The push starts immediately either way; waitUntil (Cloudflare and the
  // self-host server both pass it) only keeps it alive past the response. The
  // optional call lets a bare context (unit tests) skip that without throwing.
  context.waitUntil?.(notifyWorkspaceEvent(context, workspaceId, actorEmail, {
    title: "Sexualsync",
    body: matchPushBody(match, actorState),
    tag: MOOD_PUSH_TAG,
    url: "/sexboard?mood=match",
  }).catch(() => null));
}

// Someone switched state while matched (open -> horny, say). Live-only refetch
// hint with the same `match` shape and entityId as the original event, so the
// partner's screen updates its copy; no activity row, no push, no toast (the
// client toasts a match once per formation time). Only ever sent while a match
// exists, when both members already know each other's state.
function restateMatch(context, workspaceId, match) {
  broadcastRoomSignal(context, workspaceId, {
    resource: MOOD_ROOM_RESOURCE,
    action: "match",
    entityId: match.since,
    // Now, not the formation time: this hint is news, and a match that formed
    // a while ago must not be dropped as a stale replay.
    at: new Date().toISOString(),
  });
}
