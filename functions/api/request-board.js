import { getStore } from "./_kv.js";
import {
  LEGACY_WORKSPACE_ID,
  getAuthenticatedIdentity,
  jsonResponse as sendJson,
  normalizeEmail
} from "./_auth.js";
import {
  authorizeWorkspaceAccess,
  cleanText,
  legacyEmailForName,
  legacyNameForEmail,
  legacyPeopleForEnv,
  workspaceIdFromPayload,
  workspaceIdFromRequest
} from "./_workspaces.js";
import { appendAudit } from "./_audit.js";
import { cleanRoomEncryptedBox } from "./_e2ee.js";
import { mutateKey, readKeyStrong } from "./_state.js";
import { checkRateLimit, rateLimitResponse } from "./_rate_limit.js";
import {
  createReviewToken,
  revokeRequestTokens
} from "./_tokens.js";
import { sendCounterAcceptedEmail, sendRequestEmail, sendRequestReminderEmail, sendReviewEmail } from "./_email.js";
import { trustedOrigin } from "./_origin.js";
import { isNotificationSatisfied, notifyWorkspaceEvent } from "./_notification_policy.js";
import { broadcastRoomEvent } from "./_live_room.js";
import { narrateMatch, readCachedMatchNarration } from "./_match_narration.js";
import { cleanIdempotencyKey, idempotentId } from "./_idempotency.js";
import {
  addDaysToDateParts,
  zonedDateTimeUtc,
  zonedMidnightUtc,
  zonedParts
} from "./_request-time.js";
// Sprint 0.2 — nextPushBody no longer called; lock-screen body is generic.
// _pushBody.js preserved for future in-app rich-notification reuse.

const STORE_NAME = "sexualsync-request-board";
// C3 — requests are now keyed per workspace so the MAX_REQUESTS cap and the CAS
// version are scoped to one couple. The bare "requests" key is retained ONLY as
// a read-time legacy fallback and as a seed for the first per-workspace write;
// new writes never touch it. See scripts/migrate-store-keys.mjs.
const LEGACY_STORE_KEY = "requests";
// Exported so the E2EE migration routes (status/reencrypt) mutate the SAME
// per-workspace key the handlers do, instead of the dead legacy global key.
export function requestsKey(workspaceId) { return `requests:${workspaceId}`; }
const BOUNDARY_STORE_NAME = "sexualsync-boundaries";
// Mirrors boundaries.js per-workspace keying (read-only here — this route only
// reads the Hard No list to gate conflicting Asks).
const LEGACY_BOUNDARY_STORE_KEY = "boundaries";
function boundariesKey(workspaceId) { return `boundaries:${workspaceId}`; }
const MAX_REQUESTS = 500;
const MAX_TEXT_LENGTH = 260;
const MAX_LONG_TEXT_LENGTH = 1800;
const MAX_DECISIONS = 60;
const MAX_BOUNDARY_CONFLICTS = 40;

const VALID_TIMING = new Set(["Tonight", "Mid-day", "Tomorrow", "Next week"]);
const VALID_FILMING = new Set(["Yes", "No"]);
const VALID_DECISIONS = new Set(["Yes", "Maybe", "Let's chat", "Counter", "No"]);
const VALID_TARGET_TYPES = new Set(["act", "timing", "filming", "general"]);

const STATUS_ALIASES = {
  "Pending review": "pending",
  Reviewed: "reviewed",
  "On deck": "on_deck",
  Completed: "completed",
  Archived: "archived"
};
const ALL_STATUSES = new Set(["draft", "pending", "sent", "maybe", "reviewed", "on_deck", "completed", "archived", "expired"]);
// A `maybe` is deliberately REPLYABLE: the reviewer deferred ("I'll know closer
// to the time"), so the reply action must still let her convert it to a real
// Yes/Counter/Pass later ("Decide now"). It's the only non-pending/sent status
// that can be replied to.
const REPLYABLE_STATUSES = new Set(["pending", "sent", "maybe"]);
// What the asker may set through the create/edit POST. Everything else is an
// answer and has its own reviewer-side action.
const REQUESTER_POST_STATUSES = new Set(["draft", "pending", "sent", "archived"]);

const STATUS_TRANSITIONS = {
  draft: new Set(["sent", "archived"]),
  pending: new Set(["sent", "maybe", "reviewed", "on_deck", "completed", "archived", "expired"]),
  sent: new Set(["maybe", "reviewed", "on_deck", "completed", "archived", "expired"]),
  // maybe → the reviewer decides (reviewed/on_deck), it lapses (expired), or
  // either partner shelves it (archived). Back to sent is allowed so a re-send
  // path stays open.
  maybe: new Set(["sent", "reviewed", "on_deck", "completed", "archived", "expired"]),
  reviewed: new Set(["on_deck", "completed", "archived", "expired"]),
  on_deck: new Set(["completed", "archived", "reviewed"]),
  completed: new Set(["archived", "on_deck"]),
  archived: new Set(["on_deck"]),
  expired: new Set(["archived", "on_deck"])
};

function requestStore(env) {
  return getStore(env, STORE_NAME);
}

function boundaryStore(env) {
  return getStore(env, BOUNDARY_STORE_NAME);
}

function cleanShortText(value, max = MAX_TEXT_LENGTH) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanCategories(value) {
  if (!Array.isArray(value)) return [];
  return value.map((category) => cleanShortText(category, 120)).filter(Boolean).slice(0, MAX_DECISIONS);
}

function cleanDecisions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label: cleanShortText(item.label, 160),
      decision: VALID_DECISIONS.has(item.decision) ? item.decision : "",
      counter: cleanShortText(item.counter, 220),
      counterActId: cleanShortText(item.counterActId, 64),
      note: cleanShortText(item.note, 220),
      targetType: VALID_TARGET_TYPES.has(item.targetType) ? item.targetType : "act",
      actId: cleanShortText(item.actId, 64)
    }))
    .filter((item) => item.label)
    .slice(0, MAX_DECISIONS);
}

function cleanConflicts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanShortText(item, 180)).filter(Boolean).slice(0, MAX_BOUNDARY_CONFLICTS);
}

function uniqueLabels(labels) {
  const seen = new Set();
  return labels
    .map((label) => cleanShortText(label, 160))
    .filter((label) => {
      const key = label.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_DECISIONS);
}

function counterItemsForRequest(request) {
  const decisions = cleanDecisions(request?.decisions || []);
  const counters = cleanDecisions(request?.counters || []);
  const source = counters.length ? counters : decisions.filter((item) => item.counter || item.counterActId);
  return source
    .map((item) => {
      const label = cleanShortText(item.counter || item.label, 160);
      const rawFromLabel = cleanShortText(item.label, 160);
      const fromLabel = rawFromLabel && rawFromLabel !== label && !/^counter option \d+$/i.test(rawFromLabel)
        ? rawFromLabel
        : "";
      return {
        fromLabel,
        label,
        targetType: VALID_TARGET_TYPES.has(item.targetType) ? item.targetType : "act"
      };
    })
    .filter((item) => item.label);
}

function yesLabelsForRequest(request) {
  return cleanDecisions(request?.decisions || [])
    .filter((item) => item.decision === "Yes")
    .map((item) => item.label);
}

function approvedActLabelsForNarration(request, options = {}) {
  const yesActLabels = cleanDecisions(request?.decisions || [])
    .filter((item) => item.decision === "Yes" && item.targetType === "act")
    .map((item) => item.label);
  const counterActLabels = options.includeCounters
    ? counterItemsForRequest(request).filter((item) => item.targetType === "act").map((item) => item.label)
    : [];
  const acceptedLabels = uniqueLabels([...yesActLabels, ...counterActLabels]);
  return acceptedLabels.length ? acceptedLabels : uniqueLabels(request?.status === "on_deck" ? request?.categories || [] : []);
}

function firstName(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

// "Plan it" (the match moment): either partner can pin an approved Ask to a
// concrete time. The plan lives on the Ask record itself (no new store) and
// only stretches the auto-expiry so a plan for the weekend isn't expired by the
// Ask's original "Tonight" window. Bounds keep a garbled client from parking an
// Ask for months or planning it in the past.
const PLAN_MAX_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;
const PLAN_PAST_GRACE_MS = 6 * 60 * 60 * 1000;

function cleanPlannedFor(value) {
  const text = cleanShortText(value, 40);
  if (!text) return "";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function plannedForWithinBounds(iso, nowMs = Date.now()) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= nowMs - PLAN_PAST_GRACE_MS && ms <= nowMs + PLAN_MAX_AHEAD_MS;
}

// A reply that countered and is now waiting on the REQUESTER to accept or pass.
// Mirrors the client's hasPendingRequestCounter (web/src/lib/request-state.ts),
// and backs the "needs you" badge count for the requester (_attention.js). An
// encrypted counter is recognised by its "Counter" decision, as accept_counter
// does.
export function counterAwaitsRequester(request) {
  if (!request || !["reviewed", "on_deck"].includes(request.status) || request.counterAcceptedAt) return false;
  if (counterItemsForRequest(request).length > 0) return true;
  return Boolean(cleanRoomEncryptedBox(request.encryptedReply, 60000))
    && cleanDecisions(request.decisions || []).some((item) => item.decision === "Counter");
}

// Server mirror of the client's isApprovedSexActRequest
// (web/src/lib/request-state.ts): only an all-agreed Ask with no counter still
// pending can be planned.
function isApprovedForPlanning(request) {
  if (!request) return false;
  const counterPending = !request.counterAcceptedAt && counterItemsForRequest(request).length > 0;
  if (counterPending) return false;
  const hasApprovedAct = cleanDecisions(request.decisions || [])
    .some((item) => item.decision === "Yes" && item.targetType === "act");
  if (hasApprovedAct) return request.status === "reviewed" || request.status === "on_deck";
  return request.status === "on_deck" && cleanCategories(request.categories).length > 0;
}

// "Change of plans" is final for that yes (FRIES consent: a yes covers one Act
// at one time, and taking it back must stick). `withdrawnAt` is today's stamp;
// an archived Ask with `passedAt` and a Yes is the legacy stamp for the same
// withdrawal. Neither partner can restore it: the way back is a fresh Ask, which
// the other partner answers again.
export function isWithdrawnRequest(request) {
  if (!request) return false;
  if (request.withdrawnAt) return true;
  if (request.status !== "archived" || !request.passedAt) return false;
  return cleanDecisions(request.decisions || []).some((item) => item.decision === "Yes");
}

export const WITHDRAWN_RESTORE_ERROR = "This one was set aside. Ask again instead.";

function matchNarrationInputForRequest(request, options = {}) {
  const acts = approvedActLabelsForNarration(request, options);
  const you = firstName(request?.requesterName || request?.requester || "");
  const partner = firstName(request?.reviewerName || request?.reviewer || "");
  if (!acts.length || !you || !partner) return null;
  return {
    you,
    partner,
    acts,
    timing: request.timing || "Tonight",
    filming: request.filming === "Yes"
  };
}

async function requestWithCachedMatchNarration(env, request) {
  if (request?.matchNarration) return request;
  const input = matchNarrationInputForRequest(request);
  if (!input) return request;
  const cached = await readCachedMatchNarration(env, input);
  const text = cleanShortText(cached.text, 260);
  if (!text) return request;
  return {
    ...request,
    matchNarration: text,
    matchNarrationAt: new Date().toISOString()
  };
}

function prewarmRequestCounterNarrationCache(context, workspaceId, request) {
  if (request?.matchNarration) return;
  const counterItems = counterItemsForRequest(request);
  const timingCounter = counterItems.find((item) => item.targetType === "timing") || null;
  const filmingCounter = counterItems.find((item) => item.targetType === "filming") || null;
  const candidateRequest = {
    ...request,
    timing: timingFromCounter(timingCounter?.label || "") || request.timing || "Tonight",
    filming: filmingFromCounter(filmingCounter?.label || "") || request.filming || "No"
  };
  const input = matchNarrationInputForRequest(candidateRequest, { includeCounters: true });
  if (!input) return;
  runAfterResponse(context, async () => {
    const limited = await checkRateLimit(context.env, {
      bucket: "ai-match-narration-prewarm",
      key: `${workspaceId}:${request.id}:counter-candidate`,
      limit: 12,
      windowSeconds: 60 * 60
    });
    if (!limited.ok) return;
    await narrateMatch(context.env, input, {
      feature: "request-match-narration",
      routeFlag: "LLM_ENABLE_NARRATE",
      defaultEnabled: true,
      timeoutMs: 20000
    });
  });
}

function prewarmRequestMatchNarration(context, workspaceId, request) {
  if (request?.matchNarration) return;
  const input = matchNarrationInputForRequest(request);
  if (!input) return;
  runAfterResponse(context, async () => {
    const limited = await checkRateLimit(context.env, {
      bucket: "ai-match-narration-prewarm",
      key: `${workspaceId}:${request.id}`,
      limit: 12,
      windowSeconds: 60 * 60
    });
    if (!limited.ok) return;
    const generated = await narrateMatch(context.env, input, {
      feature: "request-match-narration",
      routeFlag: "LLM_ENABLE_NARRATE",
      defaultEnabled: true,
      timeoutMs: 20000
    });
    const text = cleanShortText(generated.text, 260);
    if (!text) return;
    // Per-workspace key; the `item.workspaceId !== workspaceId` guard is now
    // redundant (the key is already scoped) but kept as a defensive no-op.
    await writeRequestsAtomic(context.env, workspaceId, (fresh) => fresh.map((item) => {
      if (item.id !== request.id || item.workspaceId !== workspaceId || item.matchNarration) return item;
      return {
        ...item,
        matchNarration: text,
        matchNarrationAt: new Date().toISOString()
      };
    }));
  });
}

function scheduleMissingMatchNarrationPrewarm(context, workspaceId, workspaceIds, requests) {
  const ids = workspaceIdSet(workspaceIds);
  requests
    .filter((request) => ids.has(request.workspaceId))
    .filter((request) => !request.matchNarration && ["reviewed", "on_deck"].includes(request.status))
    .filter((request) => matchNarrationInputForRequest(request))
    .slice(0, 3)
    .forEach((request) => prewarmRequestMatchNarration(context, workspaceId, request));
}

function decisionCounts(decisions) {
  return {
    yesCount: decisions.filter((item) => item.decision === "Yes").length,
    maybeCount: decisions.filter((item) => item.decision === "Maybe").length,
    chatCount: decisions.filter((item) => item.decision === "Let's chat").length,
    counterCount: decisions.filter((item) => item.decision === "Counter").length,
    noCount: decisions.filter((item) => item.decision === "No").length
  };
}

function normalizeStatus(value) {
  const aliased = STATUS_ALIASES[value] || value;
  return ALL_STATUSES.has(aliased) ? aliased : "pending";
}

function canTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  return STATUS_TRANSITIONS[fromStatus]?.has(toStatus) || false;
}

function isRequestParticipant(request, email) {
  const actor = normalizeEmail(email);
  if (!actor) return false;
  return normalizeEmail(request?.requesterEmail) === actor
    || normalizeEmail(request?.reviewerEmail) === actor;
}

function cleanFilming(value) {
  return VALID_FILMING.has(value) ? value : "No";
}

function cleanTiming(value) {
  return VALID_TIMING.has(value) ? value : "Tonight";
}

function timingFromCounter(value) {
  const text = cleanShortText(value, 220).toLowerCase();
  if (!text) return "";
  if (/\btonight\b/.test(text)) return "Tonight";
  if (/\bmid[-\s]?day\b|\bnoon\b|\bafternoon\b/.test(text)) return "Mid-day";
  if (/\btomorrow\b/.test(text)) return "Tomorrow";
  if (/\bnext\s+week\b/.test(text)) return "Next week";
  return "";
}

function filmingFromCounter(value) {
  const text = cleanShortText(value, 220).toLowerCase();
  if (!text) return "";
  if (/\b(no|without|nope)\b/.test(text)) return "No";
  if (/\b(yes|film|record|camera)\b/.test(text)) return "Yes";
  return "";
}

// Auto-expiration windows by timing. Accepted timing counters restart the clock
// from the counter agreement so "Tomorrow" can roll into "Tonight" before expiry.
const TIMING_EXPIRY_DAYS = {
  "Tonight": 1,
  "Mid-day": 1,
  "Tomorrow": 2,
  "Next week": 7
};
// Anti-nagging (research rec #4: Rosen et al. 2024 on demand-withdraw; FTC
// "nagging" dark pattern). There is NO automatic reminder: the reviewer is
// notified once, when the Ask lands. The requester may send ONE manual nudge
// per Ask, ever, only while it is still a first-answer Ask (never after a pass
// or a maybe), and only once some time has passed since it was sent, so the
// nudge can't stack on top of the "new Ask" notification.
const REMIND_AVAILABLE_AFTER_MS = 4 * 60 * 60 * 1000;
export const MAX_MANUAL_REMINDERS_PER_ASK = 1;
const REMINDABLE_STATUSES = new Set(["pending", "sent"]);
// Re-ask cooldown (rec #4): after a pass, the SAME Ask (same requester, same
// partner, same set of Acts) can't be re-sent for a week, unless the reviewer
// offered a rain check, which opens it up at the time they picked.
export const REASK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Reassuring pass notes (rec #2: Kim et al. 2020 and Dobson et al. 2025 found
// reassuring, future-facing rejections keep the asker's interest and
// satisfaction up). A fixed allowlist of ids, never free text, so a note carries
// no user-written content and stays readable without Room Encryption, like the
// plaintext decision words it sits beside.
export const PASS_NOTE_IDS = new Set(["still_want", "love_asked", "this_weekend", "next_week"]);
export const RAIN_CHECK_NOTE_IDS = new Set(["this_weekend", "next_week"]);
const RAIN_CHECK_MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
// Used only when a client sends a rain-check note without a resolved local time.
const RAIN_CHECK_FALLBACK_MS = {
  this_weekend: 3 * 24 * 60 * 60 * 1000,
  next_week: 7 * 24 * 60 * 60 * 1000
};
const UNANSWERED_REVIEW_GRACE_DAYS = 1;
const UNANSWERED_TONIGHT_STALE_HOUR = 12;
const UNANSWERED_EXPIRY_RESTORE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function hasAcceptedTimingCounter(request) {
  if (request.acceptedTimingCounter) return true;
  return (request.acceptedCounters || []).some((item) => item?.targetType === "timing");
}

function hasEncryptedAcceptedCounter(request) {
  if (!request.counterAcceptedAt) return false;
  if (!cleanRoomEncryptedBox(request.encryptedReply, 60000)) return false;
  return cleanDecisions(request.decisions || []).some((item) => item.decision === "Counter");
}

function hasAcceptedCounterTimingWindow(request) {
  return hasAcceptedTimingCounter(request) || hasEncryptedAcceptedCounter(request);
}

function hasRoomEncryptedPayload(request) {
  return Boolean(cleanRoomEncryptedBox(request.encryptedPayload, 60000));
}

function hasReviewerResponse(request) {
  return Boolean(
    request.reviewedAt
    || request.reviewedByEmail
    || request.counterAcceptedAt
    || cleanDecisions(request.decisions || []).length
    || cleanDecisions(request.counters || []).length
  );
}

function safeDateMsValue(value) {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Order-independent key for "the same set of Acts" (re-ask cooldown).
function actSetKey(categories) {
  return [...new Set(cleanCategories(categories).map(compactMatchText).filter(Boolean))].sort().join("|");
}

// A reply that passed on every requested Act: no yes, no maybe, no counter.
export function isPlainPassReply(request) {
  if (!request) return false;
  const decisions = cleanDecisions(request.decisions || []).filter((item) => item.decision);
  if (!decisions.length) return false;
  if (counterItemsForRequest(request).length) return false;
  return decisions.every((item) => item.decision === "No");
}

function cleanRainCheckAt(value, nowMs) {
  const iso = cleanPlannedFor(value);
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (ms <= nowMs || ms > nowMs + RAIN_CHECK_MAX_AHEAD_MS) return "";
  return iso;
}

// The optional reassurance a reviewer attached to a pass. Only a plain pass can
// carry one; anything else (a yes, a counter, a garbled id) yields no fields, so
// a pass with no chip stays a plain pass and the asker sees the default warm copy.
export function passReplyFields(payload, decisions, nowMs = Date.now()) {
  const answered = cleanDecisions(decisions).filter((item) => item.decision);
  const plainPass = answered.length > 0
    && answered.every((item) => item.decision === "No" && !item.counter && !item.counterActId);
  if (!plainPass) return {};
  const passNote = cleanShortText(payload?.passNote, 32);
  if (!PASS_NOTE_IDS.has(passNote)) return {};
  const fields = { passNote };
  if (RAIN_CHECK_NOTE_IDS.has(passNote)) {
    fields.rainCheckAt = cleanRainCheckAt(payload?.rainCheckAt, nowMs)
      || new Date(nowMs + RAIN_CHECK_FALLBACK_MS[passNote]).toISOString();
  }
  return fields;
}

// The room event for a plain pass. The note id rides in the action so the
// activity row and toast can say the reassurance instead of a bare "passed".
export function passActivityAction(passNote) {
  return PASS_NOTE_IDS.has(passNote) ? `passed_${passNote}` : "passed";
}

// The room event for a reply that is not a full pass: a yes (with no counter
// waiting) reads warmly as "Jordan said yes"; anything else (a counter, a mix)
// stays the neutral "reviewed".
export function reviewActivityAction(decisions) {
  const answered = cleanDecisions(decisions).filter((item) => item.decision);
  const hasCounter = answered.some((item) => item.decision === "Counter" || item.counter || item.counterActId);
  return !hasCounter && answered.some((item) => item.decision === "Yes") ? "said_yes" : "reviewed";
}

// Re-ask cooldown: the latest plain pass of the same Acts between the same two
// people that is still resting. Room-encrypted Asks are skipped (the server only
// sees placeholders); the client applies the same rule after decrypting.
export function reaskCooldownFor(requests, { requesterEmail, reviewerEmail, categories, workspaceIds }, nowMs = Date.now()) {
  const key = actSetKey(categories);
  if (!key) return null;
  const ids = workspaceIdSet(workspaceIds);
  let best = null;
  for (const request of requests || []) {
    if (!request || (ids.size && !ids.has(request.workspaceId))) continue;
    if (hasRoomEncryptedPayload(request)) continue;
    if (normalizeEmail(request.requesterEmail) !== normalizeEmail(requesterEmail)) continue;
    if (normalizeEmail(request.reviewerEmail) !== normalizeEmail(reviewerEmail)) continue;
    if (!["reviewed", "archived", "expired"].includes(request.status)) continue;
    if (request.withdrawnAt || !isPlainPassReply(request)) continue;
    if (actSetKey(request.categories) !== key) continue;
    const passedMs = safeDateMsValue(request.reviewedAt);
    if (!passedMs) continue;
    let untilMs = passedMs + REASK_COOLDOWN_MS;
    const rainMs = safeDateMsValue(request.rainCheckAt);
    // A rain check is the reviewer's own time: the Ask opens up exactly then,
    // the same instant the rain-check copy shows (it can sit a little past the
    // week, e.g. "next week" at 10 am).
    if (rainMs) untilMs = rainMs;
    if (nowMs >= untilMs) continue;
    if (!best || untilMs > best.untilMs) best = { untilMs, requestId: request.id };
  }
  return best ? { until: new Date(best.untilMs).toISOString(), requestId: best.requestId } : null;
}

function unansweredAnchorMs(request) {
  return safeDateMsValue(request.sentAt || request.createdAt || request.updatedAt);
}

function isStaleUnansweredRequest(request, nowIso = new Date().toISOString()) {
  // `maybe` is treated like an unanswered Ask for expiry: the reviewer deferred
  // but never gave a final answer, so once the timing window passes it lapses
  // the same way a never-opened Ask does (hasReviewerResponse stays false for a
  // maybe — it stamps maybeAt, not reviewedAt/decisions).
  if (!["pending", "sent", "maybe"].includes(request.status)) return false;
  if (hasReviewerResponse(request)) return false;
  const staleAt = unansweredStaleAtForRequest(request);
  if (!staleAt) return false;
  return nowIso >= staleAt;
}

function timingAnchorForRequest(request) {
  const base = hasAcceptedCounterTimingWindow(request)
    ? (request.counterAcceptedAt || request.reviewedAt || request.sentAt || request.createdAt || request.updatedAt)
    : (request.sentAt || request.createdAt || request.reviewedAt || request.counterAcceptedAt || request.updatedAt);
  // A manual `restore` (and the accepted-counter restore) opens a FRESH timing
  // window: anchor on whichever of the base event / restore is later. Without
  // this, restoring an Ask whose original send is already past its timing window
  // re-expires it on the very next board read (the restore looked like a no-op).
  // A counter accepted AFTER a restore still wins because accept_counter stamps
  // restoredAt == counterAcceptedAt, so the two never disagree by event order.
  // updatedAt stays out of `base` so ordinary edits never reset the window.
  if (request.restoredAt && safeDateMsValue(request.restoredAt) > safeDateMsValue(base)) {
    return request.restoredAt;
  }
  return base;
}

function expiryDaysForRequest(request) {
  const days = TIMING_EXPIRY_DAYS[request.timing];
  // Room-encrypted Asks carry a placeholder timing ("Tonight") — the real
  // window lives inside the encrypted payload only the partners can read, so
  // the server-side expiry machine must never trust the placeholder's short
  // clock. Pad to the most generous window: a real "Next week" E2EE Ask must
  // not be expired on the placeholder's 1-day timing; a real "Tonight" one
  // just lingers until the partners act (the client shows true timing after
  // decrypting, and pass/archive remain available).
  if (hasRoomEncryptedPayload(request)) {
    return Math.max(days || 0, TIMING_EXPIRY_DAYS["Next week"]);
  }
  if (hasEncryptedAcceptedCounter(request) && request.timing === "Tonight") {
    return Math.max(days || 0, TIMING_EXPIRY_DAYS["Tomorrow"]);
  }
  return days;
}

function timingExpirationFor(request) {
  const anchor = timingAnchorForRequest(request);
  if (!anchor) return null;
  const days = expiryDaysForRequest(request);
  if (!days) return null;
  const base = new Date(anchor);
  if (Number.isNaN(base.getTime())) return null;
  const expiryDate = addDaysToDateParts(zonedParts(base), days);
  return zonedMidnightUtc(expiryDate.year, expiryDate.month, expiryDate.day).toISOString();
}

// A plan keeps the Ask live through the end of the planned day. It only ever
// EXTENDS the timing window (never shortens it), so planning can't expire an Ask
// earlier than its timing already would.
function plannedExpirationFor(request) {
  const planned = cleanPlannedFor(request?.plannedFor);
  if (!planned) return null;
  const dayAfter = addDaysToDateParts(zonedParts(new Date(planned)), 1);
  return zonedMidnightUtc(dayAfter.year, dayAfter.month, dayAfter.day).toISOString();
}

function expirationFor(request) {
  const timingExpiry = timingExpirationFor(request);
  const plannedExpiry = plannedExpirationFor(request);
  if (!plannedExpiry) return timingExpiry;
  if (!timingExpiry) return plannedExpiry;
  return plannedExpiry > timingExpiry ? plannedExpiry : timingExpiry;
}

function unansweredStaleAtForRequest(request) {
  // The Tonight fast path (stale by next-day noon) must not fire for
  // room-encrypted Asks: their "Tonight" is a placeholder and the real timing
  // may be days out. They take the generic expiresAt+grace path below, which
  // expiryDaysForRequest pads to the most generous window.
  if (request.timing === "Tonight" && !hasRoomEncryptedPayload(request)) {
    const anchorMs = unansweredAnchorMs(request);
    if (!anchorMs) return null;
    const nextDay = addDaysToDateParts(zonedParts(new Date(anchorMs)), 1);
    return zonedDateTimeUtc(nextDay.year, nextDay.month, nextDay.day, UNANSWERED_TONIGHT_STALE_HOUR).toISOString();
  }

  const expiresAt = expirationFor(request);
  if (expiresAt) {
    const expiresDate = new Date(expiresAt);
    if (!Number.isNaN(expiresDate.getTime())) {
      const staleDate = addDaysToDateParts(zonedParts(expiresDate), UNANSWERED_REVIEW_GRACE_DAYS);
      return zonedMidnightUtc(staleDate.year, staleDate.month, staleDate.day).toISOString();
    }
  }

  const anchorMs = unansweredAnchorMs(request);
  if (!anchorMs) return null;
  return new Date(anchorMs + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function isAutoExpired(request, nowIso = new Date().toISOString()) {
  // Pending/sent Asks have no first answer yet; timing copy should not
  // remove the request before they have a chance to answer.
  if (!["reviewed", "on_deck"].includes(request.status)) return false;
  const expiresAt = expirationFor(request);
  if (!expiresAt) return false;
  return nowIso >= expiresAt;
}

function shouldRestoreMistimedTimingCounter(request, nowIso = new Date().toISOString()) {
  if (request.status !== "expired") return false;
  if (request.expiredReason !== "timing_window_passed") return false;
  if (!hasAcceptedCounterTimingWindow(request)) return false;
  const expiresAt = expirationFor(request);
  if (!expiresAt) return false;
  return nowIso < expiresAt;
}

function shouldRestorePrematureUnansweredExpiry(request, nowIso = new Date().toISOString()) {
  if (request.status !== "expired") return false;
  if (request.expiredReason !== "timing_window_passed") return false;
  if (hasReviewerResponse(request)) return false;
  const nowMs = safeDateMsValue(nowIso);
  const expiredMs = safeDateMsValue(request.expiredAt || request.updatedAt);
  if (!nowMs || !expiredMs || nowMs - expiredMs > UNANSWERED_EXPIRY_RESTORE_GRACE_MS) return false;
  if (isStaleUnansweredRequest({ ...request, status: "pending" }, nowIso)) return false;
  return Boolean(request.requesterEmail && request.reviewerEmail);
}

function restoreMistimedTimingCounter(request, nowIso) {
  const { expiredAt, expiredReason, ...activeRequest } = request;
  return {
    ...activeRequest,
    status: "on_deck",
    updatedAt: nowIso
  };
}

function restorePrematureUnansweredExpiry(request, nowIso) {
  const { expiredAt, expiredReason, ...activeRequest } = request;
  return {
    ...activeRequest,
    status: "pending",
    updatedAt: nowIso
  };
}

function timingWindowStatusForRead(request, nowIso) {
  if (isStaleUnansweredRequest(request, nowIso)) {
    return { ...request, status: "expired", updatedAt: nowIso, expiredAt: nowIso, expiredReason: "unanswered_stale" };
  }
  if (shouldRestorePrematureUnansweredExpiry(request, nowIso)) {
    return restorePrematureUnansweredExpiry(request, nowIso);
  }
  if (shouldRestoreMistimedTimingCounter(request, nowIso)) {
    return restoreMistimedTimingCounter(request, nowIso);
  }
  if (isAutoExpired(request, nowIso)) {
    return { ...request, status: "expired", updatedAt: nowIso, expiredAt: nowIso, expiredReason: "timing_window_passed" };
  }
  return request;
}

// Read-only legacy fallback: the bare global key from before per-workspacing.
async function readLegacyRequests(env) {
  try {
    const requests = await requestStore(env).get(LEGACY_STORE_KEY, {
      type: "json"
    });
    return Array.isArray(requests) ? requests : [];
  } catch {
    return [];
  }
}

async function readWorkspaceRequestsRaw(env, workspaceId) {
  try {
    // Strong read so an Ask just sent shows on BOTH partners' Sexboards right
    // away, instead of lagging KV's ~60s eventual consistency.
    const requests = await readKeyStrong(env, STORE_NAME, requestsKey(workspaceId));
    return Array.isArray(requests) ? requests : [];
  } catch {
    return [];
  }
}

// Read every request visible to a set of workspace ids: union of the
// per-workspace keys PLUS a read-only fallback to the legacy global key
// (filtered to the same ids) so nothing disappears before the migration runs.
// De-duped by id with the per-workspace key winning over a stale legacy row.
// Exported so the review-token route (emailed-link reply path) reads requests
// through the SAME per-workspace key + legacy-fallback union the board uses,
// instead of the dead bare "requests" key.
export async function readRequests(env, workspaceIds) {
  const ids = workspaceIdSet(workspaceIds);
  // Defensive: an unscoped caller (none expected post-fix) would otherwise read
  // nothing. Fall back to the legacy global list so behaviour degrades safely.
  if (!ids.size) return readLegacyRequests(env);
  const seen = new Set();
  const out = [];
  // The legacy fallback read is independent of the per-workspace keys — fetch
  // it in the same parallel batch instead of paying a serial KV round-trip.
  const [lists, legacy] = await Promise.all([
    Promise.all([...ids].map((id) => readWorkspaceRequestsRaw(env, id))),
    readLegacyRequests(env),
  ]);
  for (const list of lists) {
    for (const request of list) {
      if (request && request.id && !seen.has(request.id)) { seen.add(request.id); out.push(request); }
    }
  }
  for (const request of legacy) {
    const wsId = request?.workspaceId || LEGACY_WORKSPACE_ID;
    if (ids.has(wsId) && request?.id && !seen.has(request.id)) { seen.add(request.id); out.push(request); }
  }
  return out;
}

// Atomic read-modify-write of ONE workspace's requests list. `mutateFreshList`
// receives the current (migrated) list for THIS workspace and returns the new
// list, or null for "no change". The compare-and-set coordinator serializes
// this across isolates so concurrent edits to different requests can no longer
// clobber each other (see _state.js); the cap + version are now scoped to a
// single workspace key. Async work (boundary reads, token creation) must happen
// BEFORE this call — the transform is synchronous and may run more than once on
// a version retry. When the per-workspace key is still empty (pre-migration),
// the fresh list is seeded from the legacy global key (filtered to this
// workspace) so edits compose and the first write adopts legacy rows.
//
// Writes target ONLY the per-workspace key. The legacy global key is never
// written by the runtime — it is a read-only fallback (readRequests de-dupes
// with the per-ws row winning) plus a one-time seed for the first per-workspace
// write, and is retired by the offline migration (scripts/migrate-store-keys.mjs).
export async function writeRequestsAtomic(env, workspaceId, mutateFreshList, options = {}) {
  const legacyPeople = options.legacyPeople || await legacyPeopleForEnv(env);
  const legacySeed = options.legacySeed
    || (await readLegacyRequests(env))
      .filter((request) => (request?.workspaceId || LEGACY_WORKSPACE_ID) === workspaceId);
  const written = await mutateKey(env, STORE_NAME, requestsKey(workspaceId), (raw) => {
    const base = Array.isArray(raw) && raw.length ? raw : legacySeed;
    const fresh = base.map((request) => migrate(request, legacyPeople));
    const next = mutateFreshList(fresh);
    if (next == null) return { write: false, result: fresh };
    const capped = next.slice(0, MAX_REQUESTS);
    return { value: capped, result: capped };
  });
  return written;
}

// Hard-delete safety net for the legacy global key. writeRequestsAtomic only
// removes a row from the PER-WORKSPACE key, but readRequests still falls back to
// the legacy global key for any id missing from the per-workspace key — so a
// deleted row that also lives in the legacy key gets RESURRECTED on the next
// board read (the request reappears on the Sexboard). Revoke is the only action
// that removes a row outright; every other action keeps the id with a changed
// status, so its per-workspace row keeps masking the legacy copy. Revoke must
// therefore also prune the id from the legacy global key. Best-effort, and a
// no-op (no write) when the legacy key is empty or the id isn't present.
async function pruneLegacyRequest(env, id) {
  if (!id) return;
  await mutateKey(env, STORE_NAME, LEGACY_STORE_KEY, (raw) => {
    if (!Array.isArray(raw) || !raw.length) return { write: false, result: raw };
    const next = raw.filter((item) => item && item.id !== id);
    if (next.length === raw.length) return { write: false, result: raw };
    return { value: next, result: next };
  });
}

// Read the migrated board scoped to a data-access set, then atomically persist
// any timing-window auto-expirations. Most loads have nothing to expire, so we
// only pay the compare-and-set write for the workspace key(s) that actually
// have an expiring request. Each affected per-workspace key is mutated through
// its own CAS so the transform re-checks expiry against the fresh per-workspace
// list (concurrent writers stay correct). Returns the merged, expired list.
async function loadAndExpireRequests(env, workspaceIds, legacyPeople) {
  const now = new Date().toISOString();
  let allRequests = (await readRequests(env, workspaceIds)).map((item) => migrate(item, legacyPeople));
  const expiringWorkspaceIds = new Set(
    allRequests
      .filter((req) => isAutoExpired(req, now) || isStaleUnansweredRequest(req, now) || shouldRestorePrematureUnansweredExpiry(req, now) || shouldRestoreMistimedTimingCounter(req, now))
      .map((req) => req.workspaceId)
  );
  if (!expiringWorkspaceIds.size) return allRequests;
  for (const wsId of expiringWorkspaceIds) {
    try {
      await writeRequestsAtomic(env, wsId, (fresh) => {
        let changed = false;
        const next = fresh.map((req) => {
          const normalized = timingWindowStatusForRead(req, now);
          if (normalized === req) return req;
          changed = true;
          return normalized;
        });
        return changed ? next : null;
      }, { legacyPeople });
    } catch {
      // Best effort — fall through to a fresh re-read below.
    }
  }
  return (await readRequests(env, workspaceIds)).map((item) => migrate(item, legacyPeople));
}

function runAfterResponse(context, task) {
  const promise = Promise.resolve().then(task).catch(() => null);
  if (typeof context?.waitUntil === "function") {
    context.waitUntil(promise);
  }
}

async function readLegacyBoundaries(env) {
  try {
    const boundaries = await boundaryStore(env).get(LEGACY_BOUNDARY_STORE_KEY, {
      type: "json"
    });
    return Array.isArray(boundaries) ? boundaries : [];
  } catch {
    return [];
  }
}

async function readWorkspaceBoundariesRaw(env, workspaceId) {
  try {
    const boundaries = await boundaryStore(env).get(boundariesKey(workspaceId), {
      type: "json"
    });
    return Array.isArray(boundaries) ? boundaries : [];
  } catch {
    return [];
  }
}

// Read the Hard No boundaries visible to a set of workspace ids: union of the
// per-workspace keys PLUS a read-only fallback to the legacy global key. Mirrors
// boundaries.js; this route never writes boundaries, so no atomic writer here.
// Exported so other consent surfaces (e.g. the Tonight Pile) gate against the
// SAME Hard No list the Ask flow uses, instead of skipping the check entirely.
export async function readBoundaries(env, workspaceIds) {
  const ids = workspaceIdSet(workspaceIds);
  const seen = new Set();
  const out = [];
  const lists = await Promise.all([...ids].map((id) => readWorkspaceBoundariesRaw(env, id)));
  for (const list of lists) {
    for (const boundary of list) {
      if (boundary && boundary.id && !seen.has(boundary.id)) { seen.add(boundary.id); out.push(boundary); }
    }
  }
  const legacy = await readLegacyBoundaries(env);
  for (const boundary of legacy) {
    const wsId = boundary?.workspaceId || LEGACY_WORKSPACE_ID;
    if (ids.has(wsId) && boundary?.id && !seen.has(boundary.id)) { seen.add(boundary.id); out.push(boundary); }
  }
  return out;
}

function compactMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// A Hard No phrased as a sentence ("no anal", "never filming", "nothing rough")
// should still match the bare act label. Strip a single leading negation from
// the already-compacted boundary text. This only ADDS potential matches (the
// consent-safe direction) — the original text is still matched too, so we never
// lose an existing block. Input is the compacted (lowercased, space-separated)
// form, so "don't" has already become "don t".
function stripLeadingNegation(compactValue) {
  return String(compactValue || "")
    .replace(/^(?:no|not|never|nothing|none|dont|do not|don t)\s+/, "")
    .trim();
}

function isHardNo(boundary) {
  return String(boundary?.type || "").toLowerCase().replace(/[\s_-]+/g, "") === "hardno";
}

function workspaceIdSet(workspaceIds) {
  return new Set((Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds]).filter(Boolean));
}

export function hardNoConflicts(boundaries, workspaceIds, { categories, filming }) {
  const requested = [
    ...categories.map((category) => ({ label: category, value: compactMatchText(category) })),
    ...(filming === "Yes" ? [{ label: "Filming", value: "filming" }] : [])
  ].filter((item) => item.value);

  if (!requested.length) return [];

  const ids = workspaceIdSet(workspaceIds);
  return boundaries
    .filter((boundary) => ids.has(boundary.workspaceId || LEGACY_WORKSPACE_ID) && isHardNo(boundary))
    .map((boundary) => {
      const boundaryText = compactMatchText(boundary.text);
      if (!boundaryText) return null;
      const boundaryCore = stripLeadingNegation(boundaryText);
      const boundaryForms = boundaryCore && boundaryCore !== boundaryText
        ? [boundaryText, boundaryCore]
        : [boundaryText];
      const matched = requested.find((item) => boundaryForms.some((form) => {
        return item.value === form
          || item.value.includes(form)
          || form.includes(item.value);
      }));
      if (!matched) return null;
      return boundary.text || matched.label;
    })
    .filter(Boolean);
}

function migrate(request, legacyPeople = {}) {
  const status = normalizeStatus(request.status);
  const requesterEmail = request.requesterEmail || legacyEmailForName(request.requester, legacyPeople);
  const reviewerEmail = request.reviewerEmail || legacyEmailForName(request.reviewer, legacyPeople);
  const encryptedPayload = cleanRoomEncryptedBox(request.encryptedPayload, 60000);
  const encryptedReply = cleanRoomEncryptedBox(request.encryptedReply, 60000);

  const migrated = {
    ...request,
    workspaceId: request.workspaceId || LEGACY_WORKSPACE_ID,
    status,
    requester: request.requester || legacyNameForEmail(requesterEmail, legacyPeople) || "",
    reviewer: request.reviewer || legacyNameForEmail(reviewerEmail, legacyPeople) || "",
    requesterEmail: normalizeEmail(requesterEmail),
    reviewerEmail: normalizeEmail(reviewerEmail),
    categories: cleanCategories(request.categories),
    timing: cleanTiming(request.timing),
    filming: cleanFilming(request.filming),
    decisions: cleanDecisions(request.decisions),
    counters: cleanDecisions(request.counters),
    boundaryConflicts: cleanConflicts(request.boundaryConflicts),
    note: cleanShortText(request.note, MAX_LONG_TEXT_LENGTH),
    feedback: cleanShortText(request.feedback, MAX_LONG_TEXT_LENGTH),
    matchNarration: cleanShortText(request.matchNarration, 260),
    matchNarrationAt: cleanShortText(request.matchNarrationAt, 80),
    seededFromKinkId: cleanShortText(request.seededFromKinkId || request.seeded_from_kink_id, 90),
    createdAt: request.createdAt || new Date().toISOString(),
    updatedAt: request.updatedAt || request.createdAt || new Date().toISOString()
  };
  const plannedFor = cleanPlannedFor(request.plannedFor);
  if (plannedFor) migrated.plannedFor = plannedFor;
  else {
    delete migrated.plannedFor;
    delete migrated.plannedAt;
    delete migrated.plannedByEmail;
    delete migrated.plannedByName;
  }
  const passNote = cleanShortText(request.passNote, 32);
  if (PASS_NOTE_IDS.has(passNote)) migrated.passNote = passNote;
  else delete migrated.passNote;
  const rainCheckAt = cleanPlannedFor(request.rainCheckAt);
  if (rainCheckAt && RAIN_CHECK_NOTE_IDS.has(passNote)) migrated.rainCheckAt = rainCheckAt;
  else {
    delete migrated.rainCheckAt;
    delete migrated.rainCheckDismissedAt;
  }
  if (encryptedPayload) migrated.encryptedPayload = encryptedPayload;
  else delete migrated.encryptedPayload;
  if (encryptedReply) migrated.encryptedReply = encryptedReply;
  else delete migrated.encryptedReply;
  return migrated;
}

function sortByUpdated(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

// Per-viewer projection of an Ask row. Some fields are one partner's private
// bookkeeping and never reach the other: the asker setting a rain check aside,
// and the asker's own nudge counter. Everything else (including encrypted
// boxes and placeholders) passes through untouched.
const REQUESTER_ONLY_FIELDS = ["rainCheckDismissedAt", "lastReminderAt", "reminderCount"];
// Who said "Change of plans" stays with the person who said it.
const WITHDRAWER_ONLY_FIELDS = ["withdrawnByEmail", "withdrawnByName"];

export function projectRequestForViewer(request, viewerEmail) {
  if (!request || typeof request !== "object") return request;
  const viewer = normalizeEmail(viewerEmail);
  const hidden = [
    ...(viewer && normalizeEmail(request.requesterEmail) === viewer ? [] : REQUESTER_ONLY_FIELDS),
    ...(viewer && normalizeEmail(request.withdrawnByEmail) === viewer ? [] : WITHDRAWER_ONLY_FIELDS),
  ].filter((field) => field in request);
  if (!hidden.length) return request;
  const projected = { ...request };
  for (const field of hidden) delete projected[field];
  return projected;
}

// Applies projectRequestForViewer to every Ask row a board-shaped body carries.
export function projectBoardForViewer(body, viewerEmail) {
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  if (out.request) out.request = projectRequestForViewer(out.request, viewerEmail);
  for (const key of ["requests", "activeRequests", "history"]) {
    if (Array.isArray(out[key])) out[key] = out[key].map((row) => projectRequestForViewer(row, viewerEmail));
  }
  return out;
}

function partitionForWorkspace(allRequests, workspaceIds) {
  const ids = workspaceIdSet(workspaceIds);
  const scoped = allRequests.filter((request) => ids.has(request.workspaceId));
  const sorted = sortByUpdated(scoped);
  return {
    requests: sorted,
    activeRequests: sorted.filter((request) => !["completed", "archived", "expired"].includes(request.status)),
    history: sorted.filter((request) => ["completed", "archived", "expired"].includes(request.status))
  };
}

// A per-workspace write returns only the written workspace's rows. Recombine
// them with the rest of the data-access set (e.g. legacy-couple rows under a
// different key, sourced from the earlier `allRequests` read) so the response
// still reflects everything visible to the caller. partitionForWorkspace then
// re-filters by the same id set.
function recombineRequests(allRequests, writtenWorkspaceId, writtenRows) {
  return [...allRequests.filter((req) => req.workspaceId !== writtenWorkspaceId), ...writtenRows];
}

function roomE2eeRequired(workspace) {
  return Boolean(workspace?.settings?.roomE2eeEnabled);
}

export async function readRequestBoardForWorkspace(env, workspaceId, options = {}) {
  const { expireInMemory = true, workspaceIds = workspaceId, viewerEmail = "" } = options;
  const now = new Date().toISOString();
  const legacyPeople = options.legacyPeople || await legacyPeopleForEnv(env);
  const allRequests = (await readRequests(env, workspaceIds)).map((request) => migrate(request, legacyPeople)).map((request) => {
    if (!expireInMemory) return request;
    return timingWindowStatusForRead(request, now);
  });
  const board = {
    workspaceId,
    ...partitionForWorkspace(allRequests, workspaceIds)
  };
  // Server-side readers (Health) pass no viewer and see full rows; anything
  // that goes back to a client passes its viewer.
  return viewerEmail ? projectBoardForViewer(board, viewerEmail) : board;
}

function buildReviewUrl(env, request, token) {
  const origin = trustedOrigin(env, request);
  return origin ? `${origin}/review?token=${encodeURIComponent(token)}` : `/review?token=${encodeURIComponent(token)}`;
}

function buildDashboardUrl(env, request) {
  return trustedOrigin(env, request) || "/";
}

function mutualAskPath(requestId) {
  return `/mutual?source=ask&requestId=${encodeURIComponent(requestId || "")}`;
}

function buildMutualAskUrl(env, request, requestId) {
  const path = mutualAskPath(requestId);
  const origin = trustedOrigin(env, request);
  return origin ? `${origin}${path}` : path;
}

function resolveMember(workspace, email) {
  return (workspace.members || []).find((member) => normalizeEmail(member.email) === normalizeEmail(email));
}

function safeTimeMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Deliver the one manual nudge for `current` to its reviewer: mint a fresh
// review token, push to the reviewer (lock-screen-safe), and fall back to email
// if the push isn't satisfied (a recipient's quiet hours count as satisfied, so
// they never turn into an email). Returns the new token + delivery channel; the
// caller persists lastReminderAt/reminderCount.
async function sendReviewReminderPush(context, workspace, current, requesterMember, reviewerMember) {
  const env = context.env;
  const token = await createReviewToken(env, {
    workspaceId: workspace.id,
    requestId: current.id,
    reviewerEmail: reviewerMember.email
  });
  const reviewUrl = buildReviewUrl(context.env, context.request, token.token);
  // Same calm, generic phrasing as every other push: no urgency, no "still
  // waiting", no partner name or content.
  const pushResults = await notifyWorkspaceEvent(context, workspace.id, normalizeEmail(requesterMember.email), {
    title: "Sexualsync",
    body: "Something new in your room.",
    tag: "request-reminder",
    url: reviewUrl,
    actions: [{ action: "review", title: "Review", url: reviewUrl }],
    onlyEmail: normalizeEmail(reviewerMember.email)
  }, { preserveExternalDelivery: true }).catch(() => []);
  let reminderDelivery = "push";
  if (!isNotificationSatisfied(pushResults)) {
    const emailResult = await sendRequestReminderEmail(env, {
      to: reviewerMember.email,
      fromName: requesterMember.displayName,
      toName: reviewerMember.displayName,
      reviewUrl,
      workspaceDisplayName: workspace.displayName
    }).catch((error) => ({ ok: false, error: error?.message || "send-failed" }));
    reminderDelivery = emailResult?.ok && !emailResult?.skipped
      ? "email"
      : emailResult?.reason || "failed";
  }
  return { token, reminderDelivery };
}

export async function onRequest(context) {
  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;
  // Every response from this handler goes back to `identity`, so every Ask row
  // in it is projected for that viewer.
  const jsonResponse = (status, body) => sendJson(status, projectBoardForViewer(body, identity.email));

  const env = context.env;
  const legacyPeople = await legacyPeopleForEnv(env);
  const request = context.request;
  const method = request.method.toUpperCase();
  const workspaceIdFromQuery = workspaceIdFromRequest(request);

  // Per-workspace keying means we can only read/expire the board once we know
  // which workspace(s) the caller may access — so authorize first, then read
  // scoped to that data-access set. loadAndExpireRequests reads the board and
  // atomically persists any timing-window auto-expirations per affected
  // workspace key (most loads have nothing to expire, so no write happens).

  if (method === "GET") {
    // Polling GETs can drive reminder/push/email side effects and KV writes, so
    // throttle per identity before doing any of that work.
    const readLimited = await checkRateLimit(env, {
      bucket: "request-board-read",
      key: identity.email,
      limit: 60,
      windowSeconds: 300
    });
    if (!readLimited.ok) return rateLimitResponse(readLimited.retryAfter);

    const access = await authorizeWorkspaceAccess(context, identity, workspaceIdFromQuery);
    if (!access.ok) return access.response;
    const dataWorkspaceIds = access.dataWorkspaceIds;
    const allRequests = await loadAndExpireRequests(env, dataWorkspaceIds, legacyPeople);
    scheduleMissingMatchNarrationPrewarm(context, access.workspace.id, dataWorkspaceIds, allRequests);
    return jsonResponse(200, {
      workspaceId: access.workspace.id,
      ...partitionForWorkspace(allRequests, dataWorkspaceIds)
    });
  }

  if (!["POST", "PATCH", "DELETE"].includes(method)) {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload = {};
  try { payload = await request.json(); }
  catch { return jsonResponse(400, { error: "Expected JSON body" }); }

  const workspaceId = workspaceIdFromPayload(payload, workspaceIdFromQuery);
  const access = await authorizeWorkspaceAccess(context, identity, workspaceId);
  if (!access.ok) return access.response;
  const limited = await checkRateLimit(env, {
    bucket: `request-board-${method}`,
    key: `${identity.email}:${access.workspace.id}`,
    limit: 80,
    windowSeconds: 300
  });
  if (!limited.ok) return rateLimitResponse(limited.retryAfter);

  const workspace = access.workspace;
  const actorEmail = identity.email;
  const actorName = access.actorName;
  const dataWorkspaceIds = access.dataWorkspaceIds;
  const allRequests = await loadAndExpireRequests(env, dataWorkspaceIds, legacyPeople);

  if (method === "PATCH" || method === "DELETE") {
    const id = cleanShortText(payload.id, 90);
    const index = allRequests.findIndex((req) => req.id === id && dataWorkspaceIds.includes(req.workspaceId));
    if (index === -1) return jsonResponse(404, { error: "Request not found" });

    const existing = allRequests[index];
    const action = method === "DELETE" ? "archive" : String(payload.action || "").trim();

    // v2 · Revoke — the requester takes back a pending request before the
    // partner has reviewed it. Hard-deletes the row + invalidates any active
    // review tokens so no email/link can resurrect it.
    if (action === "revoke") {
      if (normalizeEmail(existing.requesterEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the requester can take this back." });
      }
      const revocableStatuses = new Set(["draft", "pending", "sent"]);
      if (!revocableStatuses.has(existing.status)) {
        return jsonResponse(409, { error: "Too late — this one's already been reviewed." });
      }
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => fresh.filter((item) => item.id !== existing.id), { legacyPeople });
      // Also drop it from the legacy global key, or readRequests' read-only
      // fallback would resurrect it on the next board load.
      await pruneLegacyRequest(env, existing.id).catch(() => {});
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      await revokeRequestTokens(env, workspace.id, existing.id).catch(() => {});
      await appendAudit(env, workspace.id, {
        type: "request_revoked",
        actorEmail, actorName,
        entityType: "request", entityId: existing.id,
        metadata: { fromStatus: existing.status }
      });
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: "revoked",
        entityId: existing.id,
        actorEmail,
        actorName,
      });
      return jsonResponse(200, {
        revoked: true,
        requests: partitionForWorkspace(next, dataWorkspaceIds).activeRequests,
        workspaceId: workspace.id
      });
    }

    // Manual nudge: the requester can send ONE gentle nudge per Ask, ever,
    // while it still has no first answer. Never after a pass, a counter or a
    // maybe (a maybe is a real answer for now), and never right after sending.
    if (action === "remind") {
      if (normalizeEmail(existing.requesterEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the person who sent this Ask can send a nudge." });
      }
      if (!REMINDABLE_STATUSES.has(existing.status)) {
        return jsonResponse(409, { error: "This Ask already has an answer for now." });
      }
      const requesterMember = resolveMember(workspace, existing.requesterEmail);
      const reviewerMember = resolveMember(workspace, existing.reviewerEmail);
      if (!reviewerMember?.email || reviewerMember.status !== "active"
        || !requesterMember?.email || requesterMember.status !== "active"
        || normalizeEmail(reviewerMember.email) === normalizeEmail(requesterMember.email)) {
        return jsonResponse(409, { error: "There's no active partner to remind right now." });
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      // Claim the reminder slot ATOMICALLY before sending anything: re-check the
      // status + cooldown against the FRESH row and stamp lastReminderAt in one
      // CAS. A losing double-tap / queued replay bails here, so it never mints a
      // review token (which deletes the winner's token) or fires a second push —
      // the pre-read cooldown check alone couldn't prevent that.
      let claimed = null;
      let conflict = null;
      let reminderCount = 0;
      await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { conflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!REMINDABLE_STATUSES.has(cur.status)) { conflict = { status: 409, error: "This Ask already has an answer for now." }; return null; }
        if (cur.lastReminderAt || Number(cur.reminderCount || 0) >= MAX_MANUAL_REMINDERS_PER_ASK) {
          conflict = { status: 409, error: "You've sent your one nudge for this Ask. The rest is up to them." };
          return null;
        }
        const sentMs = safeTimeMs(cur.sentAt || cur.createdAt);
        if (sentMs && nowMs - sentMs < REMIND_AVAILABLE_AFTER_MS) {
          conflict = {
            status: 409,
            error: "They just got this one. If it's still open in a few hours, you can send one nudge.",
            availableAt: new Date(sentMs + REMIND_AVAILABLE_AFTER_MS).toISOString()
          };
          return null;
        }
        reminderCount = Number(cur.reminderCount || 0) + 1;
        claimed = { ...cur, lastReminderAt: nowIso, reminderCount, updatedAt: nowIso };
        return fresh.map((item) => item.id === cur.id ? claimed : item);
      }, { legacyPeople });
      if (conflict) {
        const body = { reminded: false, error: conflict.error };
        if (conflict.availableAt) body.availableAt = conflict.availableAt;
        return jsonResponse(conflict.status, body);
      }
      // We won the slot — now actually deliver (token + push, email fallback).
      const { token, reminderDelivery } = await sendReviewReminderPush(context, workspace, claimed, requesterMember, reviewerMember);
      // Record the freshly-minted token + resolved delivery channel.
      let updated = claimed;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) return null;
        updated = { ...cur, reviewTokenId: token.id, reviewTokenExpiresAt: token.expiresAt, reminderDelivery };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      await appendAudit(env, workspace.id, {
        type: "request_reminder_sent",
        actorEmail, actorName,
        entityType: "request", entityId: existing.id,
        metadata: { delivery: reminderDelivery, reminderCount, manual: true }
      });
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: "reminded",
        entityId: existing.id,
        actorEmail, actorName,
      });
      return jsonResponse(200, {
        request: updated,
        reminded: true,
        delivery: reminderDelivery,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    if (action === "reply") {
      if (normalizeEmail(existing.reviewerEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the assigned reviewer can reply to this Ask." });
      }
      if (!REPLYABLE_STATUSES.has(existing.status)) {
        return jsonResponse(409, { error: "This request is no longer waiting for review." });
      }
      const decisions = cleanDecisions(payload.decisions).filter((item) => item.decision);
      if (!decisions.length) {
        return jsonResponse(400, { error: "Pick a decision for at least one item." });
      }

      const now = new Date().toISOString();
      const encryptedReply = cleanRoomEncryptedBox(payload.encryptedReply, 60000);
      if (roomE2eeRequired(workspace) && !encryptedReply) {
        return jsonResponse(400, { error: "Room Encryption requires encrypted replies." });
      }
      const passFields = passReplyFields(payload, decisions, Date.parse(now));
      const replyPatch = {
        status: "reviewed",
        decisions,
        counters: decisions.filter((item) => item.counter || item.counterActId),
        feedback: cleanShortText(payload.note || payload.feedback || existing.feedback, MAX_LONG_TEXT_LENGTH),
        reviewedAt: now,
        reviewedByEmail: actorEmail,
        reviewedByName: actorName,
        updatedAt: now,
        ...passFields,
        ...(encryptedReply ? { encryptedReply } : {})
      };
      // Re-check the precondition against the FRESH row INSIDE the CAS transform
      // (not the stale pre-read), and build the updated row from it. Two
      // concurrent replies/accepts therefore can't both pass the guard and
      // clobber each other — the loser sees the moved status on retry. A no-op
      // return maps to the same 409 the outer guard would have produced.
      let updated = null;
      let raceConflict = null;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!REPLYABLE_STATUSES.has(cur.status)) { raceConflict = { status: 409, error: "This request is no longer waiting for review." }; return null; }
        updated = { ...cur, ...replyPatch };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      if (raceConflict) return jsonResponse(raceConflict.status, { error: raceConflict.error });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      await revokeRequestTokens(env, workspace.id, existing.id).catch(() => {});

      const requesterMember = resolveMember(workspace, existing.requesterEmail);
      const reviewerMember = resolveMember(workspace, existing.reviewerEmail);
      const hasYes = decisions.some((item) => item.decision === "Yes");
      const hasCounter = counterItemsForRequest(updated).length > 0;
      if (!encryptedReply && hasYes) {
        if (!hasCounter) prewarmRequestMatchNarration(context, workspace.id, updated);
        else prewarmRequestCounterNarrationCache(context, workspace.id, updated);
      } else if (!encryptedReply && hasCounter) {
        prewarmRequestCounterNarrationCache(context, workspace.id, updated);
      }
      let emailResult = { ok: true, skipped: true, reason: "no-recipient" };

      if (requesterMember?.email && requesterMember.status === "active") {
        emailResult = { ok: true, queued: true, reason: "delivery-queued" };
        runAfterResponse(context, async () => {
          const pushResults = await notifyWorkspaceEvent(context, workspace.id, actorEmail, {
            title: "Sexualsync",
            body: "Something new in your room.",
            tag: "request-reviewed",
            url: "/",
            onlyEmail: normalizeEmail(requesterMember.email)
          }).catch(() => []);
          const pushDelivered = isNotificationSatisfied(pushResults);
          if (pushDelivered) return;

          await sendReviewEmail(env, {
            to: requesterMember.email,
            fromName: reviewerMember?.displayName || actorName,
            toName: requesterMember.displayName,
            dashboardUrl: buildDashboardUrl(env, request),
            workspaceDisplayName: workspace.displayName,
            hasYes
          }).catch(() => null);
        });
      }

      await appendAudit(env, workspace.id, {
        type: "request_reviewed",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id,
        metadata: decisionCounts(decisions)
      });
      // A reply that is a pass on every act says so in the activity feed, in
      // warm words ("Jordan passed for now"), carrying the reviewer's optional
      // reassurance instead of a generic "Ask reviewed".
      const passedEverything = !hasYes && !hasCounter
        && decisions.every((item) => item.decision === "No");
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: passedEverything ? passActivityAction(passFields.passNote) : reviewActivityAction(decisions),
        entityId: existing.id,
        actorEmail,
        actorName,
      });

      return jsonResponse(200, {
        request: updated,
        emailResult,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    if (action === "maybe") {
      // Reviewer defers: "I don't know how I'll feel yet." Unlike `reply`, this
      // is NOT a final answer — the Ask stays REPLYABLE so she can convert it to
      // a real Yes/Counter/Pass later ("Decide now"). We stamp maybeAt (never
      // reviewedAt/decisions), so hasReviewerResponse stays false and the Ask
      // still lapses on its timing window if she never circles back.
      if (normalizeEmail(existing.reviewerEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the assigned reviewer can mark this Ask as a maybe." });
      }
      if (!["pending", "sent"].includes(existing.status)) {
        return jsonResponse(409, { error: "This Ask is no longer waiting for a first answer." });
      }
      const now = new Date().toISOString();
      const maybePatch = {
        status: "maybe",
        maybeAt: now,
        maybeByEmail: actorEmail,
        maybeByName: actorName,
        updatedAt: now
      };
      let updated = null;
      let raceConflict = null;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!["pending", "sent"].includes(cur.status)) { raceConflict = { status: 409, error: "This Ask is no longer waiting for a first answer." }; return null; }
        updated = { ...cur, ...maybePatch };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      if (raceConflict) return jsonResponse(raceConflict.status, { error: raceConflict.error });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      // Deliberately DON'T revoke reply tokens — an emailed-link reply must
      // still let her decide later. A maybe is not a terminal answer.

      const requesterMember = resolveMember(workspace, existing.requesterEmail);
      let emailResult = { ok: true, skipped: true, reason: "maybe-no-email" };
      if (requesterMember?.email && requesterMember.status === "active") {
        // Push only, generic lock-screen-safe body (same discretion as reply).
        // No email fallback: a "still deciding" signal doesn't warrant an inbox
        // hit, and the Sexboard surfaces it on next open regardless.
        runAfterResponse(context, async () => {
          await notifyWorkspaceEvent(context, workspace.id, actorEmail, {
            title: "Sexualsync",
            body: "Something new in your room.",
            tag: "request-maybe",
            url: "/",
            onlyEmail: normalizeEmail(requesterMember.email)
          }).catch(() => []);
        });
      }

      await appendAudit(env, workspace.id, {
        type: "request_maybe",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id
      });
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: "maybe",
        entityId: existing.id,
        actorEmail,
        actorName,
      });

      return jsonResponse(200, {
        request: updated,
        emailResult,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    if (action === "accept_counter") {
      if (normalizeEmail(existing.requesterEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the requester can accept a counter." });
      }
      if (!["reviewed", "on_deck"].includes(existing.status)) {
        return jsonResponse(409, { error: "This request is not waiting on a counter acceptance." });
      }
      if (existing.counterAcceptedAt) {
        return jsonResponse(409, { error: "This counter has already been accepted." });
      }
      const counterItems = counterItemsForRequest(existing);
      const encryptedCounterOnly = !counterItems.length
        && cleanRoomEncryptedBox(existing.encryptedReply, 60000)
        && cleanDecisions(existing.decisions || []).some((item) => item.decision === "Counter");
      if (!counterItems.length && !encryptedCounterOnly) {
        return jsonResponse(400, { error: "No counter to accept." });
      }
      const now = new Date().toISOString();
      let acceptedLabels = [];
      const counterPatch = encryptedCounterOnly ? {
        status: "on_deck",
        counterAcceptedAt: now,
        counterAcceptedByEmail: actorEmail,
        counterAcceptedByName: actorName,
        restoredAt: now,
        restoredByEmail: actorEmail,
        restoredByName: actorName,
        updatedAt: now
      } : {};
      if (!encryptedCounterOnly) {
        const actCounterItems = counterItems.filter((item) => item.targetType === "act");
        const timingCounter = counterItems.find((item) => item.targetType === "timing") || null;
        const filmingCounter = counterItems.find((item) => item.targetType === "filming") || null;
        acceptedLabels = uniqueLabels([
          ...yesLabelsForRequest(existing),
          ...actCounterItems.map((item) => item.label)
        ]);
        if (!acceptedLabels.length) {
          return jsonResponse(400, { error: "No accepted act found." });
        }

        const conflicts = hardNoConflicts(await readBoundaries(env, dataWorkspaceIds), dataWorkspaceIds, {
          categories: acceptedLabels,
          filming: existing.filming || "No"
        });
        if (conflicts.length) {
          return jsonResponse(409, {
            error: "This counter conflicts with a Hard No boundary.",
            conflicts
          });
        }

        const acceptedDecisionKeys = new Set(
          cleanDecisions(existing.decisions || [])
            .filter((item) => item.decision === "Yes")
            .map((item) => item.label.toLowerCase())
        );
        const acceptedCounterDecisions = actCounterItems
          .filter((item) => !acceptedDecisionKeys.has(item.label.toLowerCase()))
          .map((item) => ({
            label: item.label,
            decision: "Yes",
            counter: "",
            counterActId: "",
            note: item.fromLabel ? `Accepted counter for ${item.fromLabel}` : "Accepted counter",
            targetType: "act",
            actId: ""
          }));
        const acceptedTiming = timingFromCounter(timingCounter?.label || "") || existing.timing || "Tonight";
        const acceptedFilming = filmingFromCounter(filmingCounter?.label || "") || existing.filming || "No";
        Object.assign(counterPatch, {
          status: "on_deck",
          originalCategories: Array.isArray(existing.originalCategories) ? existing.originalCategories : existing.categories,
          categories: acceptedLabels,
          timing: acceptedTiming,
          filming: acceptedFilming,
          decisions: [
            ...cleanDecisions(existing.decisions || []),
            ...acceptedCounterDecisions
          ],
          acceptedCounters: counterItems,
          acceptedTimingCounter: timingCounter,
          acceptedFilmingCounter: filmingCounter,
          counterAcceptedAt: now,
          counterAcceptedByEmail: actorEmail,
          counterAcceptedByName: actorName,
          restoredAt: now,
          restoredByEmail: actorEmail,
          restoredByName: actorName,
          updatedAt: now
        });
      }
      // Resolve any cached match narration BEFORE the synchronous CAS transform
      // (the transform may run more than once on a version retry and must stay
      // side-effect-free).
      if (!encryptedCounterOnly) {
        const narrated = await requestWithCachedMatchNarration(env, { ...existing, ...counterPatch });
        if (narrated.matchNarration) {
          counterPatch.matchNarration = narrated.matchNarration;
          counterPatch.matchNarrationAt = narrated.matchNarrationAt;
        }
      }
      // Re-check status + counterAcceptedAt against the FRESH row INSIDE the CAS
      // transform so a double accept_counter (double-tap, two devices, a queued
      // offline replay racing a live tap) can't both pass the guard and
      // double-apply / double-fire the counter-accepted notification.
      let updated = null;
      let raceConflict = null;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!["reviewed", "on_deck"].includes(cur.status)) { raceConflict = { status: 409, error: "This request is not waiting on a counter acceptance." }; return null; }
        if (cur.counterAcceptedAt) { raceConflict = { status: 409, error: "This counter has already been accepted." }; return null; }
        updated = { ...cur, ...counterPatch };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      });
      if (raceConflict) return jsonResponse(raceConflict.status, { error: raceConflict.error });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      if (!encryptedCounterOnly) prewarmRequestMatchNarration(context, workspace.id, updated);
      const mutualPath = mutualAskPath(updated.id);
      const mutualUrl = buildMutualAskUrl(env, request, updated.id);

      let emailResult = { ok: true, skipped: true, reason: "no-recipient" };
      if (existing.reviewerEmail) {
        emailResult = { ok: true, queued: true, reason: "delivery-queued" };
        runAfterResponse(context, async () => {
          // Sprint 0.2 — lock-screen-safe generic body.
          const pushResults = await notifyWorkspaceEvent(context, workspace.id, actorEmail, {
            title: "Sexualsync",
            body: "Something new in your room.",
            tag: "request-reviewed",
            url: mutualPath,
            onlyEmail: normalizeEmail(existing.reviewerEmail)
          }).catch(() => []);
          const pushDelivered = isNotificationSatisfied(pushResults);
          if (pushDelivered) return;

          const reviewerMember = resolveMember(workspace, existing.reviewerEmail);
          await sendCounterAcceptedEmail(env, {
            to: existing.reviewerEmail,
            fromName: actorName,
            toName: reviewerMember?.displayName || existing.reviewerName || "",
            dashboardUrl: mutualUrl,
            workspaceDisplayName: workspace.displayName
          }).catch(() => null);
        });
      }

      await appendAudit(env, workspace.id, {
        type: "request_counter_accepted",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id,
        metadata: {
          acceptedCount: encryptedCounterOnly ? 1 : acceptedLabels.length,
          counterCount: encryptedCounterOnly ? 1 : counterItems.length,
          encrypted: encryptedCounterOnly || undefined
        }
      });
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: "counter_accepted",
        entityId: existing.id,
        actorEmail,
        actorName,
      });

      return jsonResponse(200, {
        request: updated,
        emailResult,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    // "Plan it": either participant pins an approved Ask to a time (or clears
    // the plan with an empty plannedFor). Status is untouched: a plan is a note
    // on the agreement, not a state transition. One CAS write; the room event
    // refreshes the partner's Sexboard and records a generic activity row.
    if (action === "plan") {
      if (!isRequestParticipant(existing, actorEmail)) {
        return jsonResponse(403, { error: "Only this Ask's participants can plan it." });
      }
      const rawPlannedFor = payload.plannedFor;
      const clearing = rawPlannedFor === "" || rawPlannedFor === null;
      const plannedFor = clearing ? "" : cleanPlannedFor(rawPlannedFor);
      if (!clearing && !plannedFor) {
        return jsonResponse(400, { error: "Pick a time for the plan." });
      }
      if (plannedFor && !plannedForWithinBounds(plannedFor)) {
        return jsonResponse(400, { error: "Pick a time between now and the next two months." });
      }
      const now = new Date().toISOString();
      let updated = null;
      let raceConflict = null;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!isRequestParticipant(cur, actorEmail)) {
          raceConflict = { status: 403, error: "Only this Ask's participants can plan it." };
          return null;
        }
        if (!isApprovedForPlanning(cur)) {
          raceConflict = { status: 409, error: "Only an Ask you both said yes to can be planned." };
          return null;
        }
        const rest = { ...cur };
        delete rest.plannedFor;
        delete rest.plannedAt;
        delete rest.plannedByEmail;
        delete rest.plannedByName;
        updated = plannedFor
          ? { ...rest, plannedFor, plannedAt: now, plannedByEmail: actorEmail, plannedByName: actorName, updatedAt: now }
          : { ...rest, updatedAt: now };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      if (raceConflict) return jsonResponse(raceConflict.status, { error: raceConflict.error });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      await appendAudit(env, workspace.id, {
        type: plannedFor ? "request_planned" : "request_unplanned",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id,
        metadata: { plannedFor }
      });
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: plannedFor ? "planned" : "unplanned",
        entityId: existing.id,
        actorEmail,
        actorName,
      });
      return jsonResponse(200, {
        request: updated,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    // "Change of plans" (FRIES consent, research rec #15: a yes is reversible
    // and covers one Act at one time). Either partner can withdraw an Ask you
    // both said yes to. It leaves the Sexboard for both of you, any plan is
    // cleared, and it is stamped `withdrawnAt`, never `passedAt`: it is not a
    // pass, not a cancellation, and Health never counts it as an approval.
    // `pass` is the legacy name for the same action from older clients.
    if (action === "withdraw" || action === "pass") {
      if (!isRequestParticipant(existing, actorEmail)) {
        return jsonResponse(403, { error: "Only this Ask's participants can change plans." });
      }
      const now = new Date().toISOString();
      let updated = null;
      let raceConflict = null;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
        if (!isApprovedForPlanning(cur)) {
          raceConflict = { status: 409, error: "Only an Ask you both said yes to can change plans." };
          return null;
        }
        const rest = { ...cur };
        delete rest.plannedFor;
        delete rest.plannedAt;
        delete rest.plannedByEmail;
        delete rest.plannedByName;
        updated = {
          ...rest,
          status: "archived",
          withdrawnAt: now,
          withdrawnByEmail: actorEmail,
          withdrawnByName: actorName,
          updatedAt: now
        };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      if (raceConflict) return jsonResponse(raceConflict.status, { error: raceConflict.error });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      await revokeRequestTokens(env, workspace.id, existing.id).catch(() => {});
      await appendAudit(env, workspace.id, {
        type: "request_plans_changed",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id
      });
      // No actor, like a mood match: "Change of plans" reads the same for both
      // of you, and never says which of you took the yes back.
      broadcastRoomEvent(context, workspace.id, {
        resource: "request-board",
        action: "withdrawn",
        entityId: existing.id,
      });
      return jsonResponse(200, {
        request: updated,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    // The asker sets aside a rain-check suggestion ("Not now"). Only hides the
    // suggestion on their own Home; nothing is broadcast and the partner sees
    // no trace of it.
    if (action === "dismiss_rain_check") {
      if (normalizeEmail(existing.requesterEmail) !== normalizeEmail(actorEmail)) {
        return jsonResponse(403, { error: "Only the person who asked can set this aside." });
      }
      const now = new Date().toISOString();
      let updated = existing;
      const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
        const cur = fresh.find((item) => item.id === existing.id);
        if (!cur || !cur.rainCheckAt || cur.rainCheckDismissedAt) return null;
        updated = { ...cur, rainCheckDismissedAt: now };
        return fresh.map((item) => item.id === cur.id ? updated : item);
      }, { legacyPeople });
      const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
      return jsonResponse(200, {
        request: updated,
        workspaceId: workspace.id,
        ...partitionForWorkspace(next, dataWorkspaceIds)
      });
    }

    const targetStatusByAction = {
      archive: "archived",
      restore: "on_deck",
      on_deck: "on_deck",
      completed: "completed",
      expire: "expired"
    };
    const targetStatus = targetStatusByAction[action];
    if (!targetStatus) return jsonResponse(400, { error: "Unsupported request action" });
    if (!isRequestParticipant(existing, actorEmail)) {
      return jsonResponse(403, { error: "Only this Ask's participants can change its status." });
    }
    if (targetStatus === "on_deck" && isWithdrawnRequest(existing)) {
      return jsonResponse(409, { error: WITHDRAWN_RESTORE_ERROR, withdrawn: true });
    }
    if (!canTransition(existing.status, targetStatus)) {
      return jsonResponse(400, {
        error: `Request cannot move from ${existing.status} to ${targetStatus}.`
      });
    }

    const now = new Date().toISOString();
    let updated = null;
    let raceConflict = null;
    const writtenRows = await writeRequestsAtomic(env, existing.workspaceId, (fresh) => {
      const cur = fresh.find((item) => item.id === existing.id);
      if (!cur) { raceConflict = { status: 404, error: "This Ask is no longer available." }; return null; }
      if (!isRequestParticipant(cur, actorEmail)) {
        raceConflict = { status: 403, error: "Only this Ask's participants can change its status." };
        return null;
      }
      if (targetStatus === "on_deck" && isWithdrawnRequest(cur)) {
        raceConflict = { status: 409, error: WITHDRAWN_RESTORE_ERROR, withdrawn: true };
        return null;
      }
      if (!canTransition(cur.status, targetStatus)) {
        raceConflict = { status: 400, error: `Request cannot move from ${cur.status} to ${targetStatus}.` };
        return null;
      }
      updated = {
        ...cur,
        status: targetStatus,
        updatedAt: now,
        ...(targetStatus === "completed" ? { completedAt: now, completedByEmail: actorEmail, completedByName: actorName } : {}),
        ...(targetStatus === "archived" ? { archivedAt: now, archivedByEmail: actorEmail, archivedByName: actorName } : {}),
        // Manual expire stamps the same metadata every auto-expiry writes, so
        // history rows aren't missing expiredAt and the restore-grace math
        // doesn't have to fall back to updatedAt. Reason "manual" deliberately
        // does NOT match the auto-restore checks (those only undo
        // timing_window_passed) — a deliberately expired Ask stays expired.
        ...(targetStatus === "expired" ? { expiredAt: now, expiredReason: "manual" } : {}),
        ...(targetStatus === "on_deck" ? {
          restoredAt: now,
          restoredByEmail: actorEmail,
          restoredByName: actorName,
          expiredAt: undefined,
          expiredReason: undefined
        } : {})
      };
      return fresh.map((item) => item.id === cur.id ? updated : item);
    });
    if (raceConflict) {
      return jsonResponse(raceConflict.status, {
        error: raceConflict.error,
        ...(raceConflict.withdrawn ? { withdrawn: true } : {})
      });
    }
    const next = recombineRequests(allRequests, existing.workspaceId, writtenRows);
    if (targetStatus === "on_deck") prewarmRequestMatchNarration(context, workspace.id, updated);

    if (targetStatus === "archived") {
      await revokeRequestTokens(env, workspace.id, existing.id).catch(() => {});
      await appendAudit(env, workspace.id, {
        type: "request_archived",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id,
        metadata: {}
      });
    } else if (targetStatus === "on_deck") {
      await appendAudit(env, workspace.id, {
        type: "request_on_deck",
        actorEmail,
        actorName,
        entityType: "request",
        entityId: existing.id
      });
    }
    broadcastRoomEvent(context, workspace.id, {
      resource: "request-board",
      action: action || targetStatus,
      entityId: existing.id,
      actorEmail,
      actorName,
    });

    return jsonResponse(200, {
      request: updated,
      workspaceId: workspace.id,
      ...partitionForWorkspace(next, dataWorkspaceIds)
    });
  }

  // POST = create or update
  const payloadId = cleanShortText(payload.id, 90);
  const idempotencyKey = cleanIdempotencyKey(request.headers.get("idempotency-key"));
  const derivedId = !payloadId && idempotencyKey
    ? await idempotentId({
        namespace: "request-board:create",
        key: idempotencyKey,
        prefix: "req",
        workspaceId: workspace.id,
        actorEmail
      })
    : "";
  const id = payloadId || derivedId || crypto.randomUUID();
  const now = new Date().toISOString();
  const index = allRequests.findIndex((req) => req.id === id && dataWorkspaceIds.includes(req.workspaceId));
  const existing = index === -1 ? null : allRequests[index];

  if (existing && normalizeEmail(existing.requesterEmail) !== normalizeEmail(identity.email)) {
    return jsonResponse(403, { error: "Only the requester can edit this request." });
  }

  if (existing && derivedId && (existing.status !== "pending" || existing.reviewTokenId)) {
    return jsonResponse(200, {
      request: existing,
      workspaceId: workspace.id,
      reviewToken: null,
      emailResult: { skipped: true, reason: "idempotent-replay" },
      ...partitionForWorkspace(allRequests, dataWorkspaceIds)
    });
  }

  if (existing && ["reviewed", "on_deck", "completed", "archived", "expired"].includes(existing.status)) {
    return jsonResponse(400, { error: "Reviewed or archived requests cannot be edited here." });
  }

  // A maybe stays with the partner who said it until they decide (it never
  // auto-converts and never triggers a reminder). The asker can't re-send or
  // re-word it underneath them; taking it back (revoke) is still open.
  if (existing && existing.status === "maybe") {
    return jsonResponse(409, { error: "They said maybe. It's theirs to decide when they're ready." });
  }

  const requesterMember = resolveMember(workspace, existing?.requesterEmail || identity.email);
  const reviewerEmail = existing?.reviewerEmail
    || payload.reviewerEmail
    || (workspace.members || []).find((member) => {
      return member.status === "active" && normalizeEmail(member.email) !== normalizeEmail(requesterMember?.email || identity.email);
    })?.email;
  const reviewerMember = resolveMember(workspace, reviewerEmail);

  if (!requesterMember || !reviewerMember) {
    return jsonResponse(400, {
      error: "Both partners need to be in the workspace before a request can be sent."
    });
  }

  if (normalizeEmail(requesterMember.email) === normalizeEmail(reviewerMember.email)) {
    return jsonResponse(400, { error: "Pick a different reviewer for this request." });
  }

  const previousStatus = existing?.status || "draft";
  const desiredStatus = normalizeStatus(payload.status || (payload.kind === "review" ? "reviewed" : existing?.status || "sent"));

  if (desiredStatus === "reviewed") {
    return jsonResponse(403, { error: "Submit reviews through the private review link." });
  }

  // This path is the ASKER's: create, save a draft, send it, or set it aside.
  // Answering (maybe/yes/on deck/done/expired) belongs to the reply, maybe,
  // accept_counter and status actions, so an asker can never stamp their own
  // Ask as agreed.
  if (!REQUESTER_POST_STATUSES.has(desiredStatus)) {
    return jsonResponse(403, { error: "Only your partner can answer this Ask." });
  }

  if (existing && !canTransition(previousStatus, desiredStatus)) {
    return jsonResponse(400, {
      error: `Request cannot move from ${previousStatus} to ${desiredStatus}.`
    });
  }

  // Decisions are the reviewer's words; the asker's payload never sets them.
  const decisions = existing?.decisions || [];
  const counters = decisions.filter((item) => item.counter || item.counterActId);
  const baseCategories = cleanCategories(payload.categories);
  const nextCategories = baseCategories.length ? baseCategories : (existing?.categories || []);
  const nextTiming = payload.timing ? cleanTiming(payload.timing) : (existing?.timing || "Tonight");
  const nextFilming = payload.filming ? cleanFilming(payload.filming) : (existing?.filming || "No");
  const encryptedPayload = cleanRoomEncryptedBox(payload.encryptedPayload, 60000);
  if (roomE2eeRequired(workspace) && !encryptedPayload) {
    return jsonResponse(400, { error: "Room Encryption requires encrypted Asks." });
  }

  // Sending: a brand-new Ask, or a saved draft going out. Both get the same
  // treatment (sentAt, pending, a review link and one notification).
  const sendingNow = (!existing || existing.status === "draft")
    && (desiredStatus === "sent" || desiredStatus === "pending");

  // Re-ask cooldown: a calm 409 (not an error state in the client) when the
  // same Acts were just passed on. It applies whenever an Ask becomes
  // answerable with this set of Acts: a fresh send, a draft going out, or an
  // open Ask re-worded to a different set. Plaintext only (the server sees
  // placeholders for a Room-encrypted Ask; the client applies the same rule).
  const rewordedOpenAsk = Boolean(existing)
    && REPLYABLE_STATUSES.has(desiredStatus)
    && actSetKey(existing.categories) !== actSetKey(nextCategories);
  const plaintextAsk = !encryptedPayload && !hasRoomEncryptedPayload(existing || {});
  if ((sendingNow || rewordedOpenAsk) && plaintextAsk) {
    const cooldown = reaskCooldownFor(allRequests, {
      requesterEmail: requesterMember.email,
      reviewerEmail: reviewerMember.email,
      categories: nextCategories,
      workspaceIds: dataWorkspaceIds
    });
    if (cooldown) {
      return jsonResponse(409, {
        error: "This one's resting for a few days after a pass. Ask for something else, or bring it back later.",
        cooldown
      });
    }
  }

  const serverHardNoConflicts = hardNoConflicts(await readBoundaries(env, dataWorkspaceIds), dataWorkspaceIds, {
    categories: nextCategories,
    filming: nextFilming
  });

  if (serverHardNoConflicts.length) {
    return jsonResponse(409, {
      error: "This request conflicts with a Hard No boundary.",
      conflicts: serverHardNoConflicts
    });
  }

  const nextRequest = {
    ...(existing || {}),
    id,
    workspaceId: workspace.id,
    requesterEmail: normalizeEmail(requesterMember.email),
    requesterName: requesterMember.displayName,
    reviewerEmail: normalizeEmail(reviewerMember.email),
    reviewerName: reviewerMember.displayName,
    requester: legacyNameForEmail(requesterMember.email, access.legacyPeople) || requesterMember.displayName,
    reviewer: legacyNameForEmail(reviewerMember.email, access.legacyPeople) || reviewerMember.displayName,
    sender: legacyNameForEmail(requesterMember.email, access.legacyPeople) || requesterMember.displayName,
    recipient: legacyNameForEmail(reviewerMember.email, access.legacyPeople) || reviewerMember.displayName,
    categories: nextCategories,
    timing: nextTiming,
    filming: nextFilming,
    status: desiredStatus,
    decisions,
    counters,
    boundaryConflicts: cleanConflicts(payload.boundaryConflicts),
    note: cleanShortText(payload.note || existing?.note, MAX_LONG_TEXT_LENGTH),
    feedback: cleanShortText(payload.feedback || existing?.feedback, MAX_LONG_TEXT_LENGTH),
    reviewSummary: cleanShortText(payload.reviewSummary || existing?.reviewSummary, MAX_LONG_TEXT_LENGTH),
    seededFromKinkId: cleanShortText(payload.seededFromKinkId || payload.seeded_from_kink_id || existing?.seededFromKinkId, 90),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (encryptedPayload) nextRequest.encryptedPayload = encryptedPayload;

  let reviewTokenInfo = null;
  let emailResult = { skipped: true };
  let deliveryTask = null;

  if (sendingNow) {
    nextRequest.sentAt = now;
    nextRequest.status = "pending";
  }

  // [L4] Durability-first ordering. The per-workspace request write must commit
  // BEFORE any external side-effect (review-token mint, audit, email schedule),
  // so a CAS-exhaustion 500 on the write can't leave an orphaned token or audit
  // row for a request that was never saved. The token id/expiry are stamped onto
  // the request in a follow-up atomic write after the token mints. Edits always
  // re-stamp workspaceId = workspace.id (prior behaviour), so the write targets
  // that id; recombine drops this request id from anywhere it previously lived.
  const writeTargetWorkspaceId = nextRequest.workspaceId;
  const upsert = (fresh) => {
    const i = fresh.findIndex((item) => item.id === nextRequest.id);
    return i === -1 ? [nextRequest, ...fresh] : fresh.map((item, idx) => idx === i ? nextRequest : item);
  };
  let writtenRows = await writeRequestsAtomic(env, writeTargetWorkspaceId, upsert);

  // Only an actual send mints a review link and notifies. Editing an Ask that's
  // already out never re-notifies: that would be an uncapped nudge.
  if (sendingNow) {
    const token = await createReviewToken(env, {
      workspaceId: workspace.id,
      requestId: nextRequest.id,
      reviewerEmail: nextRequest.reviewerEmail
    });
    nextRequest.reviewTokenId = token.id;
    nextRequest.reviewTokenExpiresAt = token.expiresAt;
    reviewTokenInfo = {
      token: token.token,
      id: token.id,
      expiresAt: token.expiresAt,
      reviewUrl: buildReviewUrl(env, request, token.token)
    };
    // Stamp the freshly-minted token id/expiry onto the already-saved request.
    // The request is already durable; if this follow-up write fails, reminders
    // re-mint a token on the next GET, so no orphan results.
    writtenRows = await writeRequestsAtomic(env, writeTargetWorkspaceId, (fresh) => fresh.map((item) => {
      if (item.id !== nextRequest.id) return item;
      return { ...item, reviewTokenId: token.id, reviewTokenExpiresAt: token.expiresAt };
    }));

    if (reviewerMember.status === "active" && reviewerMember.email) {
      emailResult = { ok: true, queued: true, reason: "delivery-queued" };
      deliveryTask = async () => {
        // Push-first: if the recipient has an active subscription that
        // delivers cleanly, skip email so they're not notified twice.
        // Sprint 0.2 — lock-screen-safe generic body. The LLM-generated
        // bodies in _pushBody.js are kept for future use in in-app rich
        // notifications (which render only after biometric unlock).
        const pushResults = await notifyWorkspaceEvent(context, workspace.id, actorEmail, {
          title: "Sexualsync",
          body: "Something new is waiting in your room.",
          tag: "request-sent",
          url: reviewTokenInfo.reviewUrl,
          actions: [{ action: "review", title: "Review", url: reviewTokenInfo.reviewUrl }],
          onlyEmail: normalizeEmail(reviewerMember.email)
        }, { preserveExternalDelivery: true }).catch(() => []);
        const pushDelivered = isNotificationSatisfied(pushResults);
        if (pushDelivered) return;

        await sendRequestEmail(env, {
          to: reviewerMember.email,
          fromName: requesterMember.displayName,
          toName: reviewerMember.displayName,
          reviewUrl: reviewTokenInfo.reviewUrl,
          workspaceDisplayName: workspace.displayName
        }).catch(() => null);
      };
    }

    await appendAudit(env, workspace.id, {
      type: "request_sent",
      actorEmail,
      actorName,
      entityType: "request",
      entityId: nextRequest.id,
      metadata: {
        itemCount: nextRequest.categories.length,
        timing: nextRequest.timing
      }
    });
  }

  if (nextRequest.status === "reviewed") {
    nextRequest.reviewedAt = existing?.reviewedAt || now;
    nextRequest.reviewedByEmail = actorEmail;
    nextRequest.reviewedByName = actorName;
    await revokeRequestTokens(env, workspace.id, nextRequest.id).catch(() => {});

    const hasYes = decisions.some((item) => item.decision === "Yes");
    if (requesterMember.email && requesterMember.status === "active") {
      emailResult = { ok: true, queued: true, reason: "delivery-queued" };
      deliveryTask = async () => {
        // Push-first: fall back to email only if no push subscription delivers.
        // Sprint 0.2 — lock-screen-safe generic body regardless of yes/no.
        const pushResults = await notifyWorkspaceEvent(context, workspace.id, actorEmail, {
          title: "Sexualsync",
          body: "Something new in your room.",
          tag: "request-reviewed",
          url: "/",
          onlyEmail: normalizeEmail(requesterMember.email)
        }).catch(() => []);
        const pushDelivered = isNotificationSatisfied(pushResults);
        if (pushDelivered) return;

        await sendReviewEmail(env, {
          to: requesterMember.email,
          fromName: reviewerMember.displayName,
          toName: requesterMember.displayName,
          dashboardUrl: buildDashboardUrl(env, request),
          workspaceDisplayName: workspace.displayName,
          hasYes
        }).catch(() => null);
      };
    }

    await appendAudit(env, workspace.id, {
      type: "request_reviewed",
      actorEmail,
      actorName,
      entityType: "request",
      entityId: nextRequest.id,
      metadata: decisionCounts(decisions)
    });
  }

  // Recombine: drop this request id from wherever it lived (in case an edit
  // moved it across workspaces) and splice in the freshly-written rows.
  const nextRequests = [
    ...allRequests.filter((req) => req.workspaceId !== writeTargetWorkspaceId && req.id !== nextRequest.id),
    ...writtenRows
  ];

  if (deliveryTask) runAfterResponse(context, deliveryTask);
  broadcastRoomEvent(context, workspace.id, {
    resource: "request-board",
    action: sendingNow ? "sent" : (index === -1 ? "created" : "updated"),
    entityId: nextRequest.id,
    actorEmail,
    actorName,
  });

  return jsonResponse(index === -1 ? 201 : 200, {
    request: nextRequest,
    workspaceId: workspace.id,
    reviewToken: reviewTokenInfo,
    emailResult,
    ...partitionForWorkspace(nextRequests, dataWorkspaceIds)
  });
}
