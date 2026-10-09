// Sex Quiz — a double-blind desire profile for the two partners.
//
// Each partner privately rates a deck of intimacy cards (Pass / Curious / Into
// it), with an optional Give / Receive / Both role on cards where that applies,
// and pins a few "top turn-ons". Nothing about a partner's answers is revealed
// until BOTH have submitted — then the API returns the overlap (matches +
// complementary give/receive pairs + curious-together). Each partner's curated
// top picks are shared on reveal so they can surface on the Sexboard / Sext.
//
// No score. The reveal returns what you share, never a "% in sync" number and
// never a count of where you differ: a visible benchmark turns desire into a
// "should" (Loewenstein et al. 2015, instructed frequency lowered wanting;
// Muise et al. 2016 on "doing it as much as we think we should"). Round rules
// (minimum batch, frozen answers, re-reveal cooldown) live in _reveal_round.js.
//
// Shared product handler (Cloudflare + self-host): only Web-standard globals +
// the storage seam (getStore / mutateKey). v1 is plaintext-at-rest (the store
// envelope encrypts on disk) + double-blind at the app layer; Room-E2EE for the
// ratings is a planned follow-up that would mirror blind-reveals.js.

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

const STORE_NAME = "sexualsync-sex-quiz";
function quizKey(workspaceId) { return `sexQuiz:${workspaceId}`; }
function store(env) { return getStore(env, STORE_NAME); }

const MAX_CARDS = 300;
const MAX_CARD_ID = 64;
const MAX_TOP_PICKS = 5;
const INTERESTS = new Set(["pass", "curious", "into"]);
const ROLES = new Set(["give", "receive", "both"]);

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

function cleanRatings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  let count = 0;
  for (const [rawId, rawRating] of Object.entries(value)) {
    if (count >= MAX_CARDS) break;
    const cardId = cleanText(rawId, MAX_CARD_ID);
    if (!cardId || !rawRating || typeof rawRating !== "object") continue;
    const interest = String(rawRating.interest || "");
    if (!INTERESTS.has(interest)) continue;
    const entry = { interest };
    const role = String(rawRating.role || "");
    if (ROLES.has(role)) entry.role = role;
    out[cardId] = entry;
    count += 1;
  }
  return out;
}

function cleanTopPicks(value, ratings) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (out.length >= MAX_TOP_PICKS) break;
    const cardId = cleanText(raw, MAX_CARD_ID);
    // Only "into" cards can be a top pick, and no duplicates.
    if (!cardId || seen.has(cardId) || ratings?.[cardId]?.interest !== "into") continue;
    seen.add(cardId);
    out.push(cardId);
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
    const ratings = cleanRatings(entry.ratings);
    entries[normalized] = {
      email: normalized,
      name: cleanText(entry.name, 80),
      ratings,
      topPicks: cleanTopPicks(entry.topPicks, ratings),
      submittedAt: entry.submittedAt || "",
      round: Number.isInteger(entry.round) && entry.round > 0 ? entry.round : 1,
      updatedAt: entry.updatedAt || entry.submittedAt || raw.createdAt || now,
    };
  }
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

// What a reveal compares: interest and role per card.
function ratingSignatures(entry) {
  const out = {};
  for (const [cardId, rating] of Object.entries(entry?.ratings || {})) {
    out[cardId] = `${rating?.interest || ""}:${rating?.role || ""}`;
  }
  return out;
}

function revealIfComplete(record, workspace, now) {
  return resolveRoundReveal(record, activeMemberEmails(workspace), now);
}

function entrySubmitted(entry, record) {
  return entrySubmittedInRound(entry, record);
}

// True when both partners want this card *and* their roles cover a giver and a
// receiver — the "you receive · they give" highlight. "both" counts as either.
function isComplementary(myRole, partnerRole) {
  if (!myRole || !partnerRole) return false;
  const roles = [myRole, partnerRole];
  const hasGiver = roles.some((r) => r === "give" || r === "both");
  const hasReceiver = roles.some((r) => r === "receive" || r === "both");
  if (!hasGiver || !hasReceiver) return false;
  // Two identical single-sided roles (give+give / receive+receive) are not a fit.
  return !(myRole === partnerRole && myRole !== "both");
}

function computeOverlap(record, workspace, me) {
  const required = activeMemberEmails(workspace);
  const partnerEmail = required.find((email) => email !== me) || "";
  const mine = record.entries?.[me]?.ratings || {};
  const partner = record.entries?.[partnerEmail]?.ratings || {};
  const matches = [];
  const curiousTogether = [];
  for (const [cardId, myRating] of Object.entries(mine)) {
    const partnerRating = partner[cardId];
    if (!partnerRating) continue;
    if (myRating.interest === "into" && partnerRating.interest === "into") {
      matches.push({
        cardId,
        myRole: myRating.role || "",
        partnerRole: partnerRating.role || "",
        complementary: isComplementary(myRating.role, partnerRating.role),
      });
    } else if (
      (myRating.interest === "into" || myRating.interest === "curious") &&
      (partnerRating.interest === "into" || partnerRating.interest === "curious") &&
      !(myRating.interest === "into" && partnerRating.interest === "into")
    ) {
      curiousTogether.push({ cardId });
    }
  }
  return { matches, curiousTogether };
}

export function publicQuiz(record, workspace, actorEmail) {
  const me = normalizeEmail(actorEmail);
  const required = activeMemberEmails(workspace);
  const partnerEmail = required.find((email) => email !== me) || "";
  const mine = record.entries?.[me] || null;
  const partner = record.entries?.[partnerEmail] || null;
  const mySubmitted = entrySubmitted(mine, record);
  const partnerSubmitted = entrySubmitted(partner, record);
  // Only ever expose partner data in a genuine two-person revealed round. The
  // exposure target (the single `partnerEmail`) is ambiguous with 3+ active
  // members, so never reveal unless there's exactly one partner — defends the
  // double-blind contract even if a workspace somehow holds an extra member.
  const revealed = record.status === "revealed" && required.length === 2 && Boolean(partnerEmail);

  const out = {
    workspaceId: record.workspaceId,
    status: record.status,
    requiredCount: Math.max(2, required.length),
    mySubmitted,
    partnerSubmitted,
    round: recordRound(record),
    // Only YOUR own timestamp. The record's updatedAt / revealedAt move when
    // the partner submits, so exposing them would leak "partner answered at".
    mySubmittedAt: mySubmitted ? mine?.submittedAt || "" : "",
    // Set when both are in but the re-reveal cooldown is still running.
    revealOpensAt: record.status === "revealed" ? "" : record.revealOpensAt || "",
    minAnswers: MIN_ROUND_ANSWERS,
    // Your own answers are always yours to see.
    myRatings: mine?.ratings || {},
    myTopPicks: mine?.topPicks || [],
    // Reveal-gated: never expose the partner's picks/overlap until both finished.
    matches: [],
    curiousTogether: [],
    partnerTopPicks: [],
    partnerName: partner?.name || "",
    // Your own opt-in is yours to see. The partner's only shows once it is
    // mutual (the full deck is open), so an unanswered opt-in never reads as a
    // visible "no", and opting in never tells them you're waiting on them.
    // Mirrors Green Lights' compareMine / compareOpen.
    fullRevealMine: Boolean(record.fullReveal?.[me]),
    fullRevealOpen: revealed && Boolean(record.fullReveal?.[me]) && Boolean(record.fullReveal?.[partnerEmail]),
    partnerRatings: null,
    // A new round waiting on you: how many of their answers changed since the
    // last reveal, and whether a small change means looking over yours again.
    ...partnerChangeNotice(record, me, partnerEmail, ratingSignatures),
  };

  if (revealed) {
    const overlap = computeOverlap(record, workspace, me);
    out.matches = overlap.matches;
    out.curiousTogether = overlap.curiousTogether;
    out.partnerTopPicks = partner?.topPicks || [];
    // Full deck only when BOTH partners opt in.
    if (out.fullRevealOpen) {
      out.partnerRatings = partner?.ratings || {};
    }
  }
  return out;
}

async function readRecord(env, workspaceId, workspace, now) {
  let raw = null;
  // Strong read so a just-submitted round shows on the Sexboard immediately,
  // instead of lagging behind KV's ~60s eventual consistency.
  try { raw = await readKeyStrong(env, STORE_NAME, quizKey(workspaceId)); } catch { raw = null; }
  return revealIfComplete(migrateRecord(raw, workspaceId, now), workspace, now);
}

// Lightweight submission status for the Sexboard handoff — booleans + reveal
// state only, NEVER any answers, so the double-blind contract holds.
export async function readSexQuizStatus(env, workspace, actorEmail, now = new Date().toISOString()) {
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
    return jsonResponse(200, publicQuiz(record, workspace, actorEmail));
  }
  if (method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const action = cleanText(payload.action, 40) || "submit";

  if (action === "submit") {
    if (payload.ratings && typeof payload.ratings === "object" && Object.keys(payload.ratings).length > 1000) {
      return jsonResponse(400, { error: "Too many cards." });
    }
    const ratings = cleanRatings(payload.ratings);
    // Minimum batch: a tiny round would turn the reveal into a per-card oracle.
    if (Object.keys(ratings).length < MIN_ROUND_ANSWERS) {
      return jsonResponse(400, { error: `Rate at least ${MIN_ROUND_ANSWERS} cards before you lock in.` });
    }
    const topPicks = cleanTopPicks(payload.topPicks, ratings);
    const result = await mutateKey(env, STORE_NAME, quizKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      // Changing answers after a reveal starts a NEW round: both partners lock
      // in again before anything reveals, and every full-deck opt-in resets.
      // Before a reveal, only this actor's own opt-in resets (fresh answers
      // need fresh consent).
      let reopened = nextRoundFrom(record, ratingSignatures);
      if (reopened === record) {
        const fullReveal = { ...(record.fullReveal || {}) };
        delete fullReveal[actorEmail];
        reopened = { ...record, fullReveal };
      }
      const nextEntry = {
        email: actorEmail,
        name: actorName,
        ratings,
        topPicks,
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
      type: "sex_quiz_submitted",
      actorEmail,
      actorName,
      entityType: "sex_quiz",
      entityId: workspace.id,
      metadata: { revealed: result.next.status === "revealed" },
    });
    // Nudge the partner: their reveal is ready (you completed the round) or it's
    // their turn (you finished first). Auto-suppressed if they're currently active.
    context.waitUntil?.(notifyWorkspaceEvent(context, workspace.id, actorEmail, {
      title: "Sexualsync",
      body: "Something new in your room.",
      tag: "game-ready",
      url: "/games/sex-quiz",
    }));
    // Live hint so the partner's Play hub and "locked in" screen refetch (and
    // move to the reveal) without a reload. It carries no answers, and the
    // activity feed ignores this resource, so nothing about the round leaks.
    broadcastRoomEvent(context, workspace.id, {
      resource: "sex-quiz",
      action: "submitted",
      entityId: workspace.id,
      actorEmail,
      actorName,
      passive: true,
    });
    return jsonResponse(200, publicQuiz(result.next, workspace, actorEmail));
  }

  if (action === "retake") {
    const result = await mutateKey(env, STORE_NAME, quizKey(workspace.id), (current) => {
      const record = nextRoundFrom(revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now), ratingSignatures);
      const entries = { ...(record.entries || {}) };
      delete entries[actorEmail];
      const fullReveal = { ...(record.fullReveal || {}) };
      delete fullReveal[actorEmail];
      const next = { ...record, entries, fullReveal, status: "open", revealedAt: "", updatedAt: now };
      return { value: next, result: { next } };
    });
    broadcastRoomEvent(context, workspace.id, {
      resource: "sex-quiz", action: "retake", entityId: workspace.id, actorEmail, actorName, passive: true,
    });
    return jsonResponse(200, publicQuiz(result.next, workspace, actorEmail));
  }

  if (action === "full_reveal") {
    const on = payload.on !== false;
    const result = await mutateKey(env, STORE_NAME, quizKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      const fullReveal = { ...(record.fullReveal || {}) };
      if (on) fullReveal[actorEmail] = true; else delete fullReveal[actorEmail];
      const next = revealIfComplete({ ...record, fullReveal, updatedAt: now }, workspace, now);
      return { value: next, result: { next } };
    });
    return jsonResponse(200, publicQuiz(result.next, workspace, actorEmail));
  }

  // Keep last round's answers and lock in to the new round without re-rating.
  // Only the actor's own stored answers are re-confirmed; the reveal still
  // waits for both partners plus the re-reveal cooldown.
  if (action === "confirm") {
    const result = await mutateKey(env, STORE_NAME, quizKey(workspace.id), (current) => {
      const record = revealIfComplete(migrateRecord(current, workspace.id, now), workspace, now);
      const entry = record.entries?.[actorEmail];
      if (!entry || Object.keys(entry.ratings || {}).length < MIN_ROUND_ANSWERS) {
        return { write: false, result: { next: record, missing: true } };
      }
      if (entrySubmitted(entry, record)) return { write: false, result: { next: record } };
      const partnerEmail = activeMemberEmails(workspace).find((email) => email !== actorEmail) || "";
      const notice = partnerChangeNotice(record, actorEmail, partnerEmail, ratingSignatures);
      if (notice.reanswerRequired) return { write: false, result: { next: record, reanswer: notice } };
      const nextEntry = { ...entry, name: actorName || entry.name, submittedAt: now, round: recordRound(record), updatedAt: now };
      const next = revealIfComplete({
        ...record,
        entries: { ...(record.entries || {}), [actorEmail]: nextEntry },
        updatedAt: now,
      }, workspace, now);
      return { value: next, result: { next, changed: true } };
    });
    if (result.missing) return jsonResponse(400, { error: "There are no saved answers to keep. Take the quiz instead." });
    if (result.reanswer) {
      return jsonResponse(409, {
        ...publicQuiz(result.next, workspace, actorEmail),
        error: "A few of their answers changed. Look over yours before you lock in.",
      });
    }
    if (result.changed) {
      context.waitUntil?.(notifyWorkspaceEvent(context, workspace.id, actorEmail, {
        title: "Sexualsync",
        body: "Something new in your room.",
        tag: "game-ready",
        url: "/games/sex-quiz",
      }));
      broadcastRoomEvent(context, workspace.id, {
        resource: "sex-quiz", action: "submitted", entityId: workspace.id, actorEmail, actorName, passive: true,
      });
    }
    return jsonResponse(200, publicQuiz(result.next, workspace, actorEmail));
  }

  // Pin/repin your top turn-ons WITHOUT re-rating the deck. Touches only this
  // actor's topPicks — never ratings, status, or the reveal — so someone who
  // skipped the pick step (or wants to change their showcase) can do it after
  // submitting instead of redoing all the cards.
  if (action === "set_top_picks") {
    const result = await mutateKey(env, STORE_NAME, quizKey(workspace.id), (current) => {
      const record = migrateRecord(current, workspace.id, now);
      const entry = record.entries?.[actorEmail];
      if (!entry || !entry.submittedAt) {
        return { value: record, result: { next: record, missing: true } };
      }
      const topPicks = cleanTopPicks(payload.topPicks, entry.ratings || {});
      const nextEntry = { ...entry, topPicks, updatedAt: now };
      const next = {
        ...record,
        entries: { ...(record.entries || {}), [actorEmail]: nextEntry },
        updatedAt: now,
      };
      return { value: next, result: { next } };
    });
    if (result.missing) {
      return jsonResponse(400, { error: "Take the quiz before pinning your top turn-ons." });
    }
    return jsonResponse(200, publicQuiz(result.next, workspace, actorEmail));
  }

  return jsonResponse(400, { error: "Unsupported sex quiz action." });
}
