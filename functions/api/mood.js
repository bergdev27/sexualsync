// Mood light — a double-blind "I'm in the mood" signal.
//
// Each partner can switch their mood light ON until an absolute time (the UI
// offers "next hour", "tonight", "until I turn it off"), or OFF at any time. The
// server NEVER reveals a partner's state on its own: the response only says
// something about the partner when EVERY active member is currently on — a
// match. Otherwise the response is built from the caller's own state alone, so
// it is byte-for-byte the same whether the partner is on, off, or expired.
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
import { broadcastRoomEvent, broadcastRoomSignal } from "./_live_room.js";

export const MOOD_STORE_NAME = "sexualsync-mood";
export function moodKey(workspaceId) { return `mood:${workspaceId}`; }

export const MOOD_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MOOD_MIN_WINDOW_MS = 15 * 60 * 1000;
export const MOOD_COOLDOWN_MS = 5 * 60 * 1000;
// Re-sending ON with an `until` this close to the stored one is a no-op (no
// KV write) — absorbs double-taps and client clock jitter.
const UNTIL_NOOP_TOLERANCE_MS = 60 * 1000;

export const MOOD_PUSH_TAG = "mood-match";
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
    }
    if (entry.offAt && nowMs - toMs(entry.offAt) < MOOD_COOLDOWN_MS) next.offAt = entry.offAt;
    if (Object.keys(next).length) byEmail[email] = next;
  }
  return { v: 1, byEmail };
}

/**
 * The match, if every active member (and at least two) is on right now.
 * since = the later switch-on time (when the match formed),
 * until = the earliest expiry (when it ends unless someone extends).
 */
export function deriveMoodMatch(record, workspace, nowMs = Date.now()) {
  const emails = activeMemberEmails(workspace);
  if (emails.length < 2) return null;
  const clean = cleanRecord(record);
  const entries = emails.map((email) => clean.byEmail[email]);
  if (!entries.every((entry) => entryOn(entry, nowMs))) return null;
  const since = Math.max(...entries.map((entry) => toMs(entry.since)));
  const until = Math.min(...entries.map((entry) => toMs(entry.until)));
  return { since: iso(since), until: iso(until) };
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
 * there is no match the response is identical whatever the partner's state.
 */
export function publicMood(record, workspace, actorEmail, nowMs = Date.now()) {
  const clean = cleanRecord(record);
  const mine = clean.byEmail[normalizeEmail(actorEmail)] || null;
  const on = entryOn(mine, nowMs);
  const cooldownUntil = on ? 0 : cooldownUntilFor(mine, nowMs);
  return {
    workspaceId: workspace?.id || "",
    mine: {
      on,
      since: on ? mine.since : null,
      until: on ? mine.until : null,
      cooldownUntil: cooldownUntil ? iso(cooldownUntil) : null,
    },
    match: deriveMoodMatch(clean, workspace, nowMs),
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
  if (!requested) return { ok: false, error: "Pick when your mood light should turn off." };
  if (requested <= nowMs) return { ok: false, error: "That time has already passed." };
  const untilMs = Math.min(nowMs + MOOD_MAX_WINDOW_MS, Math.max(nowMs + MOOD_MIN_WINDOW_MS, requested));
  return { ok: true, untilMs };
}

/**
 * Pure transition for "switch ON (or extend) until untilMs". Returns the
 * mutateKey transform outcome plus what happened.
 */
export function applyMoodOn(current, workspace, actorEmail, untilMs, nowMs = Date.now()) {
  const email = normalizeEmail(actorEmail);
  const record = cleanRecord(current);
  const before = deriveMoodMatch(record, workspace, nowMs);
  const mine = record.byEmail[email] || null;
  const wasOn = entryOn(mine, nowMs);

  if (!wasOn) {
    const cooldownUntil = cooldownUntilFor(mine, nowMs);
    if (cooldownUntil) {
      return { write: false, result: { status: "cooldown", retryAt: iso(cooldownUntil), record } };
    }
  } else if (Math.abs(toMs(mine.until) - untilMs) < UNTIL_NOOP_TOLERANCE_MS) {
    return { write: false, result: { status: "unchanged", record, formed: false } };
  }

  const next = pruneRecord(record, nowMs);
  next.byEmail[email] = {
    since: wasOn ? mine.since : iso(nowMs),
    until: iso(untilMs),
  };
  const after = deriveMoodMatch(next, workspace, nowMs);
  return {
    value: next,
    result: { status: "ok", record: next, formed: Boolean(after && !before), match: after },
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

  if (action === "on") {
    const clamp = clampMoodUntil(payload.until, nowMs);
    if (!clamp.ok) return jsonResponse(400, { error: clamp.error, code: "mood_invalid_until" });
    const outcome = await mutateKey(context.env, MOOD_STORE_NAME, moodKey(workspace.id), (current) => (
      applyMoodOn(current, workspace, actorEmail, clamp.untilMs, nowMs)
    ));
    if (outcome.status === "cooldown") {
      return jsonResponse(429, {
        error: "You just switched your mood light off. Give it a few minutes.",
        code: "mood_cooldown",
        retryAt: outcome.retryAt,
        ...publicMood(outcome.record, workspace, actorEmail, nowMs),
      });
    }
    if (outcome.formed && outcome.match) {
      announceMatch(context, workspace.id, actorEmail, outcome.match);
    }
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

function announceMatch(context, workspaceId, actorEmail, match) {
  // Room event + activity item for BOTH members. No actor on the event: it is a
  // shared state ("you're both in the mood"), so every connected device —
  // including the switcher's other devices — receives it, and the activity row
  // reads the same for both. entityId is the match's formation time, which is
  // already in both members' responses.
  broadcastRoomEvent(context, workspaceId, {
    resource: MOOD_ROOM_RESOURCE,
    action: "match",
    entityId: match.since,
    at: match.since,
  });
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
    body: "You're both in the mood.",
    tag: MOOD_PUSH_TAG,
    url: "/sexboard?mood=match",
  }).catch(() => null));
}
