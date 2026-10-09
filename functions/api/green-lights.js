// Green Lights — a double-blind comfort & agreements questionnaire.
//
// Sibling to the Sex Quiz, different axis: each partner privately answers a deck
// of statements on per-question answer scales (comfort / agree / want / matters
// / prefer / cadence — see green-lights-deck.ts). Nothing is revealed until BOTH
// submit. Then the API hands back ONLY the partner answers that equal yours
// (the agreements), and the CLIENT derives the buckets (green lights, agreed
// limits, shared concerns, same cadence) from the deck. Where you differ stays
// private unless BOTH partners opt in to compare ("compare"), which then opens
// the partner's full answer set for the talk-about-these list. The server is
// scale-agnostic: it stores opaque value ids + notes, compares them only for
// equality, and gates the double-blind reveal. No score and no count of
// differences ever leaves the server. Round rules (minimum batch, frozen
// answers, re-reveal cooldown) live in _reveal_round.js.
//
// Shared product handler (Cloudflare + self-host): only Web-standard globals +
// the storage seam (getStore / mutateKey). v1 is plaintext-at-rest (the store
// envelope encrypts on disk) + double-blind at the app layer, mirroring sex-quiz.js.

import { getStore } from "./_kv.js";
import { mutateKey, readKeyStrong } from "./_state.js";
import { getAuthenticatedIdentity, jsonResponse, normalizeEmail } from "./_auth.js";
import {
  authorizeWorkspaceAccess,
  cleanText,
  workspaceIdFromPayload,
  workspaceIdFromRequest,
} from "./_workspaces.js";
import { appendAudit } from "./_audit.js";
import { notifyWorkspaceEvent } from "./_notification_policy.js";
import { broadcastRoomEvent } from "./_live_room.js";
import {
  MIN_ROUND_ANSWERS,
  cleanRevealedSnapshot,
  entrySubmittedInRound,
  nextRoundFrom,
  partnerChangeNotice,
  recordRound,
  resolveRoundReveal,
} from "./_reveal_round.js";

const STORE_NAME = "sexualsync-green-lights";
function greenLightsKey(workspaceId) { return `greenLights:${workspaceId}`; }
function store(env) { return getStore(env, STORE_NAME); }

const MAX_CARDS = 300;
const MAX_CARD_ID = 64;
const MAX_NOTE = 240;
const MAX_VALUE_LEN = 40;

function activeMemberEmails(workspace) {
  return (workspace?.members || [])
    .filter((member) => member.status === "active")
    .map((member) => normalizeEmail(member.email))
    .filter(Boolean);
}

function actorNameFor(access, identity) {
  const actorEmail = normalizeEmail(identity.email);
  return access.actorName
    || access.workspace?.members?.find((member) => normalizeEmail(member.email) === actorEmail)?.displayName
    || "";
}

function cleanAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  let count = 0;
  for (const [rawId, rawAns] of Object.entries(value)) {
    if (count >= MAX_CARDS) break;
    const cardId = cleanText(rawId, MAX_CARD_ID);
    if (!cardId || !rawAns || typeof rawAns !== "object") continue;
    // The deck (client-side) owns each card's answer scale + its option ids; the
    // server is a dumb double-blind store, so it keeps an opaque, length-capped
    // value string + optional note and never interprets them.
    const v = cleanText(rawAns.value, MAX_VALUE_LEN);
    if (!v) continue;
    const entry = { value: v };
    const note = cleanText(rawAns.note, MAX_NOTE);
    if (note) entry.note = note;
    out[cardId] = entry;
    count += 1;
  }
  return out;
}

function emptyRecord(workspaceId, now) {
  return {
    workspaceId,
    status: "open",
    round: 1,
    entries: {},
    fullReveal: {},
    createdAt: now,
    updatedAt: now,
    revealedAt: "",
    lastRevealedAt: "",
  };
}

function migrateRecord(raw, workspaceId, now) {
  if (!raw || typeof raw !== "object") return emptyRecord(workspaceId, now);
  const entries = {};
  const rawEntries = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
  for (const [email, entry] of Object.entries(rawEntries)) {
    const normalized = normalizeEmail(email || entry?.email);
    if (!normalized || !entry || typeof entry !== "object") continue;
    entries[normalized] = {
      email: normalized,
      name: cleanText(entry.name, 80),
      answers: cleanAnswers(entry.answers),
      submittedAt: entry.submittedAt || "",
      round: Number.isInteger(entry.round) && entry.round > 0 ? entry.round : 1,
      updatedAt: entry.updatedAt || entry.submittedAt || raw.createdAt || now,
    };
  }
  // Mutual opt-in to compare the answers where you differ (per round).
  const fullReveal = {};
  const rawFull = raw.fullReveal && typeof raw.fullReveal === "object" ? raw.fullReveal : {};
  for (const [email, on] of Object.entries(rawFull)) {
    const normalized = normalizeEmail(email);
    if (normalized && on) fullReveal[normalized] = true;
  }
  return {
    workspaceId,
    status: raw.status === "revealed" ? "revealed" : "open",
    round: recordRound(raw),
    entries,
    fullReveal,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    revealedAt: raw.revealedAt || "",
    lastRevealedAt: raw.lastRevealedAt || "",
    revealedSnapshot: cleanRevealedSnapshot(raw.revealedSnapshot),
  };
}

// What a reveal compares: the answer value per card (notes never count).
function answerSignatures(entry) {
  const out = {};
  for (const [cardId, answer] of Object.entries(entry?.answers || {})) out[cardId] = String(answer?.value || "");
  return out;
}

function revealIfComplete(record, workspace, now) {
  return resolveRoundReveal(record, activeMemberEmails(workspace), now);
}

function entrySubmitted(entry, record) {
  return entrySubmittedInRound(entry, record);
}

// The partner's answers you're allowed to see: only the cards where they gave
// the SAME value as you (agreements), unless you both opted in to compare.
// Equality is the only comparison the server makes, so it stays scale-agnostic.
function sharedAnswers(mine, partner) {
  const out = {};
  for (const [cardId, answer] of Object.entries(partner || {})) {
    const own = mine?.[cardId];
    if (own && own.value === answer.value) out[cardId] = answer;
  }
  return out;
}

export function publicGreenLights(record, workspace, actorEmail) {
  const me = normalizeEmail(actorEmail);
  const required = activeMemberEmails(workspace);
  const partnerEmail = required.find((email) => email !== me) || "";
  const mine = record.entries?.[me] || null;
  const partner = record.entries?.[partnerEmail] || null;
  const mySubmitted = entrySubmitted(mine, record);
  const partnerSubmitted = entrySubmitted(partner, record);
  // Never expose partner data unless it's a genuine two-person revealed round.
  const revealed = record.status === "revealed" && required.length === 2 && Boolean(partnerEmail);
  const compareMine = Boolean(record.fullReveal?.[me]);
  const comparePartner = Boolean(record.fullReveal?.[partnerEmail]);

  const out = {
    workspaceId: record.workspaceId,
    status: record.status,
    requiredCount: Math.max(2, required.length),
    mySubmitted,
    partnerSubmitted,
    round: recordRound(record),
    // Only YOUR own timestamp: record-level times move when the partner submits.
    mySubmittedAt: mySubmitted ? mine?.submittedAt || "" : "",
    revealOpensAt: record.status === "revealed" ? "" : record.revealOpensAt || "",
    minAnswers: MIN_ROUND_ANSWERS,
    // Your own answers are always yours to see.
    myAnswers: mine?.answers || {},
    partnerName: partner?.name || "",
    // Your own opt-in is yours to see. The partner's opt-in only shows once it
    // is mutual (the comparison is open), so an unanswered opt-in never reads
    // as a visible "no".
    compareMine,
    compareOpen: revealed && compareMine && comparePartner,
    // A new round waiting on you: how many of their answers changed since the
    // last reveal, and whether a small change means looking over yours again.
    ...partnerChangeNotice(record, me, partnerEmail, answerSignatures),
    // Reveal-gated. Agreements only, unless the comparison is open.
    partnerAnswers: {},
  };

  if (revealed) {
    const myAnswers = mine?.answers || {};
    const partnerAll = partner?.answers || {};
    // Agreements only, unless both opted in to compare. Either way the
    // "Words I like" cards then go through the overlap-only filter: a word is
    // a yes or a pass, and a pass must never leak, compare or not (two equal
    // passes are an "agreement" sharedAnswers would otherwise hand over).
    const visible = out.compareOpen ? partnerAll : sharedAnswers(myAnswers, partnerAll);
    out.partnerAnswers = overlapOnlyPartnerAnswers(myAnswers, visible);
  }
  return out;
}

// "Words I like" cards (ids prefixed wd-) reveal only overlaps: the partner's
// answer is handed over only when both said yes. A pass, a mismatch, or an
// unanswered card is dropped server-side, so the client can never learn the
// partner's word preferences beyond the words you share.
export const OVERLAP_ONLY_PREFIX = "wd-";
const OVERLAP_YES = "yes";

export function overlapOnlyPartnerAnswers(myAnswers, partnerAnswers) {
  const out = {};
  for (const [cardId, answer] of Object.entries(partnerAnswers || {})) {
    if (!cardId.startsWith(OVERLAP_ONLY_PREFIX)) {
      out[cardId] = answer;
      continue;
    }
    if (answer?.value === OVERLAP_YES && myAnswers?.[cardId]?.value === OVERLAP_YES) {
      // Notes stay private on these: only the shared word is revealed.
      out[cardId] = { value: OVERLAP_YES };
    }
  }
  return out;
}

async function readRecord(env, workspaceId, workspace, now) {
  let raw = null;
  // Strong read so a just-submitted round shows on the Sexboard immediately,
  // instead of lagging behind KV's ~60s eventual consistency.
  try { raw = await readKeyStrong(env, STORE_NAME, greenLightsKey(workspaceId)); } catch { raw = null; }
  return revealIfComplete(migrateRecord(raw, workspaceId, now), workspace, now);
}

// Lightweight submission status for the Sexboard handoff — booleans + reveal
// state only, NEVER any answers, so the double-blind contract holds.
export async function readGreenLightsStatus(env, workspace, actorEmail, now = new Date().toISOString()) {
  const record = await readRecord(env, workspace.id, workspace, now);
  const me = normalizeEmail(actorEmail);
  const required = activeMemberEmails(workspace);
  const partnerEmail = required.find((email) => email !== me) || "";
  return {
    status: record.status,
    mySubmitted: entrySubmitted(record.entries?.[me], record),
    partnerSubmitted: entrySubmitted(record.entries?.[partnerEmail], record),
    revealed: record.status === "revealed" && required.length === 2 && Boolean(partnerEmail),
  };
}

export async function onRequest(context) {
  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;

  const request = context.request;
  const method = request.method.toUpperCase();
  let payload = {};
  if (method !== "GET") {
    try { payload = await request.json(); }
    catch { return jsonResponse(400, { error: "Expected JSON body." }); }
  }

  const workspaceId = method === "GET"
    ? workspaceIdFromRequest(request)
    : workspaceIdFromPayload(payload, workspaceIdFromRequest(request));
  const access = await authorizeWorkspaceAccess(context, identity, workspaceId);
  if (!access.ok) return access.response;

  const env = context.env;
  const workspace = access.workspace;
  const actorEmail = normalizeEmail(identity.email);
  const actorName = actorNameFor(access, identity);
  const now = new Date().toISOString();

  if (method === "GET") {
    const record = await readRecord(env, workspace.id, workspace, now);
    return jsonResponse(200, publicGreenLights(record, workspace, actorEmail));
  }
  if (method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const action = cleanText(payload.action, 40) || "submit";

  if (action === "submit") {
    if (payload.answers && typeof payload.answers === "object" && Object.keys(payload.answers).length > 1000) {
      return jsonResponse(400, { error: "Too many answers." });
    }
    const answers = cleanAnswers(payload.answers);
    // Minimum batch: a tiny round would turn the reveal into a per-card oracle.
    if (Object.keys(answers).length < MIN_ROUND_ANSWERS) {
      return jsonResponse(400, { error: `Answer at least ${MIN_ROUND_ANSWERS} before you lock in.` });
    }
    const result = await mutateKey(env, STORE_NAME, greenLightsKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      // Re-answering after a reveal starts a NEW round: both lock in again and
      // the compare opt-ins reset. Before a reveal only this actor's resets.
      let reopened = nextRoundFrom(record, answerSignatures);
      if (reopened === record) {
        const fullReveal = { ...(record.fullReveal || {}) };
        delete fullReveal[actorEmail];
        reopened = { ...record, fullReveal };
      }
      const nextEntry = {
        email: actorEmail,
        name: actorName,
        answers,
        submittedAt: now,
        round: recordRound(reopened),
        updatedAt: now,
      };
      let next = {
        ...reopened,
        entries: { ...(reopened.entries || {}), [actorEmail]: nextEntry },
        updatedAt: now,
      };
      next = revealIfComplete(next, workspace, now);
      return { value: next, result: { next } };
    });
    await appendAudit(env, workspace.id, {
      type: "green_lights_submitted",
      actorEmail,
      actorName,
      entityType: "green_lights",
      entityId: workspace.id,
      metadata: { revealed: result.next.status === "revealed" },
    });
    // Nudge the partner: their reveal is ready (you completed the round) or it's
    // their turn (you finished first). Auto-suppressed if they're currently active.
    context.waitUntil?.(notifyWorkspaceEvent(context, workspace.id, actorEmail, {
      title: "Sexualsync",
      body: "Something new in your room.",
      tag: "game-ready",
      url: "/games/green-lights",
    }));
    // Live hint so the partner's Play hub and "locked in" screen refetch (and
    // move to the reveal) without a reload. It carries no answers, and the
    // activity feed ignores this resource, so nothing about the round leaks.
    broadcastRoomEvent(context, workspace.id, {
      resource: "green-lights",
      action: "submitted",
      entityId: workspace.id,
      actorEmail,
      actorName,
      passive: true,
    });
    return jsonResponse(200, publicGreenLights(result.next, workspace, actorEmail));
  }

  if (action === "retake") {
    const result = await mutateKey(env, STORE_NAME, greenLightsKey(workspace.id), (current) => {
      const record = nextRoundFrom(revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now), answerSignatures);
      const entries = { ...(record.entries || {}) };
      delete entries[actorEmail];
      const fullReveal = { ...(record.fullReveal || {}) };
      delete fullReveal[actorEmail];
      const next = { ...record, entries, fullReveal, status: "open", revealedAt: "", updatedAt: now };
      return { value: next, result: { next } };
    });
    broadcastRoomEvent(context, workspace.id, {
      resource: "green-lights", action: "retake", entityId: workspace.id, actorEmail, actorName, passive: true,
    });
    return jsonResponse(200, publicGreenLights(result.next, workspace, actorEmail));
  }

  // Opt in (or out) of comparing where you differ. Opens only when both are in.
  if (action === "compare") {
    const on = payload.on !== false;
    const result = await mutateKey(env, STORE_NAME, greenLightsKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      const fullReveal = { ...(record.fullReveal || {}) };
      if (on) fullReveal[actorEmail] = true; else delete fullReveal[actorEmail];
      const next = { ...record, fullReveal, updatedAt: now };
      return { value: next, result: { next } };
    });
    return jsonResponse(200, publicGreenLights(result.next, workspace, actorEmail));
  }

  // Keep last round's answers and lock in to the new round without re-answering.
  if (action === "confirm") {
    const result = await mutateKey(env, STORE_NAME, greenLightsKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      const entry = record.entries?.[actorEmail];
      if (!entry || Object.keys(entry.answers || {}).length < MIN_ROUND_ANSWERS) {
        return { write: false, result: { next: record, missing: true } };
      }
      if (entrySubmitted(entry, record)) return { write: false, result: { next: record } };
      const partnerEmail = activeMemberEmails(workspace).find((email) => email !== actorEmail) || "";
      const notice = partnerChangeNotice(record, actorEmail, partnerEmail, answerSignatures);
      if (notice.reanswerRequired) return { write: false, result: { next: record, reanswer: notice } };
      const nextEntry = { ...entry, name: actorName || entry.name, submittedAt: now, round: recordRound(record), updatedAt: now };
      const next = revealIfComplete({
        ...record,
        entries: { ...(record.entries || {}), [actorEmail]: nextEntry },
        updatedAt: now,
      }, workspace, now);
      return { value: next, result: { next, changed: true } };
    });
    if (result.missing) return jsonResponse(400, { error: "There are no saved answers to keep. Answer the deck instead." });
    if (result.reanswer) {
      return jsonResponse(409, {
        ...publicGreenLights(result.next, workspace, actorEmail),
        error: "A few of their answers changed. Look over yours before you lock in.",
      });
    }
    if (result.changed) {
      context.waitUntil?.(notifyWorkspaceEvent(context, workspace.id, actorEmail, {
        title: "Sexualsync",
        body: "Something new in your room.",
        tag: "game-ready",
        url: "/games/green-lights",
      }));
      broadcastRoomEvent(context, workspace.id, {
        resource: "green-lights", action: "submitted", entityId: workspace.id, actorEmail, actorName, passive: true,
      });
    }
    return jsonResponse(200, publicGreenLights(result.next, workspace, actorEmail));
  }

  return jsonResponse(400, { error: "Unsupported green lights action." });
}
