// Health — what you've enjoyed together, not how much.
//
// By default this reports moments and overlaps: recent approved Asks and Pile
// overlaps, the acts that keep showing up, and firsts. It never reports "days
// since", streaks, targets, comparisons, or who asked more. Volume (totals,
// per-day rhythm, per-act counts) is OPT-IN PER PERSON via the viewer's own
// profile setting `healthShowCounts` (off by default, never shown to the
// partner). Instructed frequency lowered wanting and enjoyment in the one RCT
// on it (Loewenstein et al. 2015), and a visible benchmark creates a "should"
// (Muise, Schimmack & Impett 2016), so counts are something a person chooses.
//
// Only consented, approved acts count. Withdrawn or cleared Asks never count,
// and a plan is not a moment: an Ask still waiting on its planned time is
// left out until that time has passed.

import {
  getAuthenticatedIdentity,
  jsonResponse,
  normalizeEmail
} from "../_auth.js";
import {
  authorizeWorkspaceAccess,
  workspaceIdFromRequest,
  workspaceIdsForDataAccess
} from "../_workspaces.js";
import { computeOverlapLabels, pileIsRevealed, readPile, readPileSessions } from "../pile.js";
import { readRequestBoardForWorkspace } from "../request-board.js";
import { readActsForWorkspace } from "../approved-acts.js";

const RANGE_OPTIONS = {
  "30d": { id: "30d", label: "30 days", days: 30 },
  "90d": { id: "90d", label: "90 days", days: 90 },
  all: { id: "all", label: "All time", days: null }
};

const APPROVED_REQUEST_STATUSES = new Set(["reviewed", "on_deck", "completed", "archived", "expired"]);
const BUILT_IN_ACT_EMOJIS = new Map([
  ["kiss", "💋"],
  ["kissing", "💋"],
  ["slow kissing", "💋"],
  ["makeout", "💋"],
  ["make out", "💋"],
  ["oral", "👅"],
  ["blowjob", "👅"],
  ["blow job", "👅"],
  ["mouth", "👅"],
  ["massage", "💆"],
  ["shower sex", "🚿"],
  ["shower", "🚿"],
  ["bath", "🛁"],
  ["filming = yes", "📹"],
  ["filming yes", "📹"],
  ["filming", "📹"],
  ["aftercare", "🤗"],
  ["hands pinned over head", "⛓️"],
  ["sensual massage", "💆"],
  ["tongue lashing", "👅"],
  ["mutual oral", "💋"],
  ["penetration", "🍆"],
  ["slow positions", "🐢"],
  ["active positions", "🔥"],
  ["cowgirl or reverse", "🤠"],
  ["from behind", "🍑"],
  ["standing or wall", "🧍"],
  ["on top", "👑"],
  ["couch", "🛋️"],
  ["toys or accessories", "🎁"],
  ["dirty talk", "💬"],
  ["kink", "🔗"],
  ["light restraint", "⛓️"],
  ["cuddling", "🤗"],
  ["mutual masturbation", "✋"],
  ["face sitting", "🪑"],
  ["roleplay", "🎭"],
  ["slow touch, no finish line", "🪶"],
  ["slow touch", "🪶"]
]);
const KEYWORD_ACT_EMOJIS = [
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
  { terms: ["kink"], emoji: "🔗" }
];
const LEADING_EMOJI_RE = /^([\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F)?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\uFE0F)?)*)\s*/u;

function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function labelKey(value) {
  return cleanLabel(value).replace(LEADING_EMOJI_RE, "").toLowerCase();
}

function emojiFromText(value) {
  const match = cleanLabel(value).match(LEADING_EMOJI_RE);
  return match?.[1] || "";
}

function keywordEmojiForLabel(label) {
  const key = labelKey(label);
  for (const option of KEYWORD_ACT_EMOJIS) {
    if (option.terms.some((term) => key.includes(term))) return option.emoji;
  }
  return "";
}

function emojiForLabel(label, actEmojiMap) {
  const direct = emojiFromText(label);
  if (direct) return direct;
  const key = labelKey(label);
  return actEmojiMap.get(key) || BUILT_IN_ACT_EMOJIS.get(key) || keywordEmojiForLabel(label) || "💞";
}

function buildActEmojiMap(acts) {
  const map = new Map();
  for (const act of acts || []) {
    const icon = emojiFromText(act?.icon) || emojiFromText(act?.label);
    const key = labelKey(act?.label);
    if (key && icon && !map.has(key)) map.set(key, icon);
  }
  return map;
}

function uniqueLabels(labels) {
  const seen = new Set();
  const result = [];
  for (const raw of labels) {
    const label = cleanLabel(raw);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function parseTime(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function isoFromCandidates(candidates) {
  for (const candidate of candidates) {
    if (parseTime(candidate)) return new Date(candidate).toISOString();
  }
  return new Date().toISOString();
}

function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function rangeFromRequest(request) {
  let id = "30d";
  try {
    const requested = new URL(request.url).searchParams.get("range") || "";
    if (RANGE_OPTIONS[requested]) id = requested;
  } catch {}
  const option = RANGE_OPTIONS[id];
  const now = new Date();
  const from = option.days
    ? new Date(now.getTime() - option.days * 24 * 60 * 60 * 1000).toISOString()
    : "";
  return {
    ...option,
    from,
    to: now.toISOString()
  };
}

function withinRange(event, range) {
  if (!range.from) return true;
  const time = parseTime(event.at);
  return time >= parseTime(range.from) && time <= parseTime(range.to);
}

// Any marker that the Ask was taken back. Withdrawing is free and leaves no
// record of a "cancel", so a withdrawn Ask must simply never count.
// `withdrawnAt` is what "Change of plans" stamps today; `passedAt` on an
// archived Ask is the legacy stamp for the same withdrawal.
function requestWithdrawn(request) {
  const status = String(request?.status || "").toLowerCase();
  return Boolean(
    request?.withdrawnAt
    || (request?.passedAt && status === "archived")
    || request?.withdrawn === true
    || request?.clearedAt
    || request?.cleared === true
    || status === "withdrawn"
    || status === "cleared"
  );
}

// A planned Ask is a plan, not a moment, until its time has passed.
function requestStillPlanned(request, nowMs = Date.now()) {
  const planned = parseTime(request?.plannedFor);
  return planned > nowMs;
}

function approvedActLabelsForRequest(request) {
  if (!APPROVED_REQUEST_STATUSES.has(String(request?.status || "").toLowerCase())) return [];
  // A yes that either partner later withdrew ("Change of plans") is not an
  // approval and is never counted (FRIES consent, research rec #15), and a
  // planned Ask is not a moment until its time has passed.
  if (requestWithdrawn(request) || requestStillPlanned(request)) return [];
  return uniqueLabels((Array.isArray(request?.decisions) ? request.decisions : [])
    .filter((item) => /^yes$/i.test(String(item?.decision || "")))
    .filter((item) => !item?.targetType || item.targetType === "act")
    .map((item) => item.label));
}

export function sourceEventsFromRequests(board) {
  return (board.requests || []).flatMap((request) => {
    const acts = approvedActLabelsForRequest(request);
    if (!acts.length) return [];
    const at = isoFromCandidates([
      request.counterAcceptedAt,
      request.reviewedAt,
      request.completedAt,
      request.updatedAt,
      request.createdAt
    ]);
    return [{
      id: `ask:${request.id}`,
      type: "ask",
      title: request.timing ? `${request.timing} Ask` : "Approved Ask",
      at,
      acts,
      actorName: request.requesterName || request.requester || "",
      partnerName: request.reviewerName || request.reviewer || "",
      sourceId: request.id,
      sourceStatus: request.status || "",
      sourceHref: `/ask-detail?id=${encodeURIComponent(request.id)}&activity=1`
    }];
  });
}

function sourceEventsFromPileSessions(sessions) {
  return (sessions || []).flatMap((session) => {
    const acts = uniqueLabels(session.overlap?.length ? session.overlap : session.acts);
    if (!acts.length) return [];
    const at = isoFromCandidates([
      session.lockedAt,
      session.revealAt,
      session.startedAt
    ]);
    return [{
      id: `pile:${session.id}`,
      type: "pile",
      title: "Pile overlap",
      at,
      acts,
      actorName: session.lockedByName || "",
      partnerName: "",
      sourceId: session.id,
      sourceStatus: "overlap",
      sourceHref: `/games/pile?session=${encodeURIComponent(session.id)}&activity=1`
    }];
  });
}

function sourceEventsFromActivePiles(piles) {
  return (piles || []).flatMap(({ workspaceId, pile }) => {
    if (!pile?.revealAt || !pileIsRevealed(pile)) return [];
    const overlap = computeOverlapLabels(pile);
    const acts = pile.roomE2ee
      ? overlap.map(() => "Encrypted Pile match")
      : uniqueLabels(overlap);
    if (!acts.length) return [];
    const at = isoFromCandidates([
      pile.revealAt,
      pile.startedAt
    ]);
    return [{
      id: `pile-active:${workspaceId}:${dayKey(at)}`,
      type: "pile",
      title: "Pile overlap",
      at,
      acts,
      actorName: "",
      partnerName: "",
      sourceId: `active:${workspaceId}`,
      sourceStatus: "overlap",
      sourceHref: "/games/pile?activity=1"
    }];
  });
}

function buildRhythm(events) {
  const byDay = new Map();
  for (const event of events) {
    const key = dayKey(event.at);
    const existing = byDay.get(key) || {
      date: key,
      sexEvents: 0,
      sexActs: 0,
      askEvents: 0,
      pileEvents: 0
    };
    existing.sexEvents += 1;
    existing.sexActs += event.acts.length;
    if (event.type === "ask") existing.askEvents += 1;
    if (event.type === "pile") existing.pileEvents += 1;
    byDay.set(key, existing);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildTopActs(events, allEvents, range) {
  const firstSeen = new Map();
  for (const event of [...allEvents].sort((a, b) => parseTime(a.at) - parseTime(b.at))) {
    for (const label of event.acts) {
      const key = label.toLowerCase();
      if (!firstSeen.has(key)) firstSeen.set(key, event.at);
    }
  }

  const counts = new Map();
  for (const event of events) {
    for (const label of event.acts) {
      const key = label.toLowerCase();
      const existing = counts.get(key) || {
        label,
        count: 0,
        askCount: 0,
        pileCount: 0,
        firstSeenAt: firstSeen.get(key) || event.at,
        lastSeenAt: event.at,
        newInRange: false
      };
      existing.count += 1;
      if (event.type === "ask") existing.askCount += 1;
      if (event.type === "pile") existing.pileCount += 1;
      if (parseTime(event.at) > parseTime(existing.lastSeenAt)) existing.lastSeenAt = event.at;
      existing.newInRange = range.from
        ? parseTime(existing.firstSeenAt) >= parseTime(range.from)
        : true;
      counts.set(key, existing);
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);
}

function decorateEventActs(event, actEmojiMap) {
  return {
    ...event,
    actSummaries: event.acts.map((label) => ({
      label,
      emoji: emojiForLabel(label, actEmojiMap)
    }))
  };
}

// A moment as the default view shows it: what and when, no per-person
// attribution and no tally.
function momentFromEvent(event, actEmojiMap) {
  const decorated = decorateEventActs(event, actEmojiMap);
  return {
    id: decorated.id,
    type: decorated.type,
    title: decorated.title,
    at: decorated.at,
    acts: decorated.acts,
    actSummaries: decorated.actSummaries,
    sourceId: decorated.sourceId,
    sourceHref: decorated.sourceHref
  };
}

export function buildResponse(workspaceId, range, allEvents, actEmojiMap = new Map(), options = {}) {
  const showCounts = options.showCounts === true;
  const events = allEvents
    .filter((event) => withinRange(event, range))
    .sort((a, b) => parseTime(b.at) - parseTime(a.at));
  const topActs = buildTopActs(events, allEvents, range);
  const withEmoji = (label) => ({ label, emoji: emojiForLabel(label, actEmojiMap) });

  const base = {
    workspaceId,
    range,
    showCounts,
    // Recent moments, newest first.
    events: events.slice(0, 50).map((event) => momentFromEvent(event, actEmojiMap)),
    // Acts that came back more than once, by label only (no tally).
    keepsShowingUp: topActs.filter((act) => act.count >= 2).slice(0, 6).map((act) => withEmoji(act.label)),
    // Acts that happened for the first time in this range.
    firsts: topActs.filter((act) => act.newInRange).slice(0, 5).map((act) => withEmoji(act.label))
  };
  if (!showCounts) return base;

  const uniqueActs = new Set(events.flatMap((event) => event.acts.map((label) => label.toLowerCase())));
  return {
    ...base,
    totals: {
      sexEvents: events.length,
      sexActs: events.reduce((count, event) => count + event.acts.length, 0),
      uniqueActs: uniqueActs.size,
      askEvents: events.filter((event) => event.type === "ask").length,
      pileEvents: events.filter((event) => event.type === "pile").length
    },
    rhythm: buildRhythm(events),
    topActs
  };
}

export async function onRequest(context) {
  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;

  if (context.request.method.toUpperCase() !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const workspaceId = workspaceIdFromRequest(context.request);
  const access = await authorizeWorkspaceAccess(context, identity, workspaceId);
  if (!access.ok) return access.response;

  const actorEmail = normalizeEmail(identity.email);
  const dataWorkspaceIds = access.dataWorkspaceIds;
  const range = rangeFromRequest(context.request);

  const [board, pileSessionGroups, activePiles, actsResponse] = await Promise.all([
    readRequestBoardForWorkspace(context.env, access.workspace.id, {
      expireInMemory: false,
      workspaceIds: dataWorkspaceIds
    }),
    Promise.all(dataWorkspaceIds.map((id) => readPileSessions(context.env, id))),
    Promise.all(dataWorkspaceIds.map(async (id) => ({
      workspaceId: id,
      pile: await readPile(context.env, id)
    }))),
    readActsForWorkspace(context.env, access.workspace.id, {
      workspaceIds: dataWorkspaceIds
    })
  ]);

  const allEvents = [
    ...sourceEventsFromRequests(board),
    ...sourceEventsFromPileSessions(pileSessionGroups.flat()),
    ...sourceEventsFromActivePiles(activePiles)
  ];

  // The viewer's own, private choice. The partner's setting is never read here.
  const showCounts = access.profile?.settings?.healthShowCounts === true;
  return jsonResponse(200, buildResponse(
    access.workspace.id,
    range,
    allEvents,
    buildActEmojiMap(actsResponse.acts),
    { showCounts }
  ));
}
