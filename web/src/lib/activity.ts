import { isPassActivityAction, passActivityText } from "./pass-reassurance";
import type { ActivityItem, ActivityResource } from "@/lib/types";

export type ActivitySummary = Partial<Record<ActivityResource, number>>;

export const ACTIVITY_SUMMARY_EVENT = "sexualsync:activity-summary";
export const ACTIVITY_SUMMARY_KEY = "ss:activity-summary";

const ACTION_COPY: Record<string, Record<string, string>> = {
  "request-board": {
    created: "Ask drafted.",
    sent: "New Ask landed.",
    reviewed: "Ask reviewed.",
    said_yes: "Your Ask got a yes.",
    passed: "Passed for now. No reason needed.",
    maybe: "Your Ask got a maybe.",
    counter_accepted: "Counter accepted.",
    revoked: "Ask taken back.",
    archive: "Ask archived.",
    restore: "Ask restored.",
    on_deck: "Ask moved on deck.",
    completed: "Ask completed.",
    expire: "Ask expired.",
    planned: "Plan set.",
    unplanned: "Change of plans.",
    withdrawn: "Change of plans.",
    updated: "Sexboard updated.",
  },
  "fantasy-backlog": {
    created: "New Kink shared.",
    focused: "This kink got them thinking dirty.",
    updated: "Idea updated.",
    restored: "Idea restored.",
    deleted: "Idea archived.",
  },
  shelf: {
    added: "Shelf updated.",
    focused: "They came back for another taste.",
    reacted: "Shelf reaction landed.",
    matched: "You both saved the same thing.",
    updated: "Shelf updated.",
    deleted: "Shelf item removed.",
  },
  vault: {
    added: "Vault clip added.",
    title_updated: "Vault title updated.",
    moment: "Vault moment saved.",
    moment_title_updated: "Vault moment title updated.",
    moment_deleted: "Vault moment removed.",
    reacted: "Vault reaction landed.",
    commented: "Vault comment added.",
    deleted: "Vault clip removed.",
  },
  pile: {
    started: "Pile started.",
    ended: "Pile ended.",
    declined: "Pile declined.",
    locked: "Pile locked in.",
    time_updated: "Pile time changed.",
    dropped: "Pile changed.",
    undropped: "Pile changed.",
  },
  "blind-reveals": {
    created: "Blind Reveal started.",
    submitted: "Answer locked.",
    revealed: "Blind Reveal opened.",
    archived: "Blind Reveal closed.",
    promoted: "Saved to Inspiration.",
  },
  // Only the shared match is ever an activity item; "ended" is a live-only
  // signal with no copy, so it never toasts.
  mood: {
    match: "You're both horny.",
    match_mixed: "You're both up for it.",
    match_open: "You're both open to it.",
  },
};

export const ACTIVITY_RESOURCE_ROUTES: Record<ActivityResource, string> = {
  "request-board": "/sexboard",
  "fantasy-backlog": "/inspiration",
  shelf: "/inspiration/shelf",
  vault: "/space/vault",
  pile: "/games/pile",
  "blind-reveals": "/games/blind-reveal",
  mood: "/sexboard",
};

export const ACTIVITY_RESOURCE_GLYPHS: Record<ActivityResource, string> = {
  "request-board": "A",
  "fantasy-backlog": "I",
  shelf: "S",
  vault: "V",
  pile: "P",
  "blind-reveals": "B",
  mood: "M",
};

// Which bottom tab carries a resource's unread badge (TabBar ids: home, play,
// ask, chat, us). Inspiration and the Shelf live inside Play, the games are
// Play, and the Vault is part of Us. This only routes the in-app tab badges;
// the PWA icon badge is a separate needs-you count (lib/app-badge on the
// client, functions/api/_attention.js on the server) and never reads this map.
export const ACTIVITY_RESOURCE_TAB: Record<ActivityResource, string> = {
  "request-board": "home",
  "fantasy-backlog": "play",
  shelf: "play",
  vault: "us",
  pile: "play",
  "blind-reveals": "play",
  mood: "home",
};

// The mood match has no actor: it is something both of you did. Rows and
// toasts for it must never read as "{partner} ...".
export const MOOD_MATCH_HREF = "/sexboard?mood=match";
export const MOOD_MATCH_COPY = "You're both horny";

// Shared, actor-less wording per match kind (rows and toasts). Matches
// functions/api/_activity.js; the Home card says it from your side instead.
// Feed actions: "match" (both horny), "match_mixed", "match_open".
const MOOD_MATCH_COPY_BY_KIND: Record<string, string> = {
  horny: MOOD_MATCH_COPY,
  mixed: "You're both up for it",
  open: "You're both open to it",
};

/** Row/toast title for a mood match, from its kind or its feed action. */
export function moodMatchCopy(kindOrAction: string | null | undefined): string {
  const kind = String(kindOrAction || "").replace(/^match_?/, "") || "horny";
  return MOOD_MATCH_COPY_BY_KIND[kind] || MOOD_MATCH_COPY;
}

export function isMoodActivity(item: Pick<ActivityItem, "resource"> | null | undefined) {
  return item?.resource === "mood";
}

export function mutualAskHref(requestId = "", acts: string[] = [], narration = "") {
  const params = new URLSearchParams({ source: "ask" });
  const cleanRequestId = String(requestId || "").trim();
  const cleanActs = acts.map((item) => String(item || "").trim()).filter(Boolean);
  const cleanNarration = String(narration || "").trim();
  if (cleanRequestId) params.set("requestId", cleanRequestId);
  if (cleanActs.length) {
    params.set("count", String(cleanActs.length));
    params.set("acts", cleanActs.join("|"));
  }
  if (cleanNarration) params.set("narration", cleanNarration);
  return `/mutual?${params.toString()}`;
}

// "Last activity" timestamp for an Ask, derived from real user-action events
// (created / sent / reviewed / counter-accepted / completed / passed / archived)
// rather than `updatedAt`. The server re-stamps `updatedAt` on automatic,
// read-time timing/expiry/restore passes, so a request nobody has touched can
// show "Updated 1h ago". Picking the latest genuine event keeps the label honest.
export function lastRequestEventAt(request: {
  createdAt?: string;
  sentAt?: string;
  reviewedAt?: string;
  counterAcceptedAt?: string;
  completedAt?: string;
  passedAt?: string;
  archivedAt?: string;
  withdrawnAt?: string;
}): string {
  const times = [
    request.createdAt,
    request.sentAt,
    request.reviewedAt,
    request.counterAcceptedAt,
    request.completedAt,
    request.passedAt,
    request.archivedAt,
    request.withdrawnAt,
  ]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  if (!times.length) return request.createdAt || "";
  return new Date(Math.max(...times)).toISOString();
}

export function activityHref(item: ActivityItem) {
  if (item.resource === "mood") return MOOD_MATCH_HREF;
  if ((item.groupedCount || 0) > 1) return ACTIVITY_RESOURCE_ROUTES[item.resource];
  const entityId = encodeURIComponent(item.entityId || "");
  const activityParam = "activity=1";
  const actionParam = item.action ? `&action=${encodeURIComponent(item.action)}` : "";
  if (item.resource === "request-board" && (item.action === "counter_accepted" || item.action === "planned") && item.entityId) {
    return mutualAskHref(item.entityId);
  }
  if (item.resource === "request-board" && entityId) return `/ask-detail?id=${entityId}&${activityParam}`;
  if (item.resource === "fantasy-backlog" && entityId) return `/inspiration/kink?id=${entityId}&${activityParam}`;
  if (item.resource === "shelf" && entityId) return `/inspiration/shelf?item=${entityId}&${activityParam}${actionParam}`;
  if (item.resource === "vault" && entityId) return `/space/vault?item=${entityId}&${activityParam}${actionParam}`;
  if (item.resource === "pile" && entityId) return `/games/pile?session=${entityId}&${activityParam}`;
  if (item.resource === "blind-reveals" && entityId) return `/games/blind-reveal?id=${entityId}&${activityParam}`;
  return ACTIVITY_RESOURCE_ROUTES[item.resource];
}

export function activityTabForResource(resource: ActivityResource) {
  return ACTIVITY_RESOURCE_TAB[resource] || "";
}

export function dedupeActivity(items: ActivityItem[]) {
  const seen = new Set<string>();
  const result: ActivityItem[] = [];
  for (const item of items) {
    const key = `${item.resource}:${item.action}:${item.entityId || item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function compactActivityRows(items: ActivityItem[]) {
  const groups = new Map<string, ActivityItem[]>();
  const passthrough: ActivityItem[] = [];

  for (const item of items) {
    const key = compactGroupKey(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const compacted = [
    ...passthrough,
    ...Array.from(groups.values()).map((group) => compactGroup(group)),
  ];

  return compacted.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function groupActivityByDay(items: ActivityItem[]) {
  const groups: Array<{ label: string; items: ActivityItem[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const group = groups.find((entry) => entry.label === label);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export function publishActivitySummary(summary: ActivitySummary) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_SUMMARY_EVENT, { detail: summary }));
  try {
    window.localStorage.setItem(ACTIVITY_SUMMARY_KEY, JSON.stringify(summary));
  } catch {}
}

export function textForActivityEvent(resource = "", action = "", actorName = "") {
  // A pass or a maybe names who said it, like the activity feed row does.
  const first = String(actorName || "").trim().split(/\s+/)[0];
  if (resource === "request-board" && first && action === "maybe") return `${first} said maybe.`;
  if (resource === "request-board" && first && action === "said_yes") return `${first} said yes.`;
  // A pass always reads warm, with the reviewer's optional reassurance.
  if (resource === "request-board" && isPassActivityAction(action)) return passActivityText(action, first);
  return ACTION_COPY[resource]?.[action] || "";
}

function dayLabel(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Earlier";
  const date = new Date(time);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startItem = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (startItem === startToday) return "Today";
  if (startItem === startToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

function compactGroupKey(item: ActivityItem) {
  const day = dayLabel(item.at);
  const actor = item.actorEmail || item.actorName || "partner";
  if (item.resource === "pile" && ["dropped", "undropped"].includes(item.action)) {
    return `${day}:${actor}:pile:changed`;
  }
  if (item.resource === "shelf" && item.action === "revealed") {
    return `${day}:${actor}:shelf:revealed`;
  }
  if (item.resource === "shelf" && item.action === "reacted") {
    return `${day}:${actor}:shelf:reacted`;
  }
  if (item.resource === "vault" && ["reacted", "commented", "moment"].includes(item.action)) {
    return `${day}:${actor}:vault:${item.action}`;
  }
  return "";
}

function compactGroup(group: ActivityItem[]): ActivityItem {
  const sorted = [...group].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const first = sorted[0] as ActivityItem;
  if (sorted.length === 1) return first;
  const count = sorted.length;
  return {
    ...first,
    id: `group:${compactGroupKey(first)}:${count}`,
    entityId: "",
    label: compactLabel(first, count),
    passive: sorted.every((item) => item.passive),
    unread: sorted.some((item) => item.unread),
    groupedCount: count,
    sourceIds: sorted.map((item) => item.id).filter(Boolean),
  };
}

function compactLabel(item: ActivityItem, count: number) {
  if (item.resource === "pile" && ["dropped", "undropped"].includes(item.action)) {
    return `Pile changed ${count} times`;
  }
  if (item.resource === "shelf" && item.action === "revealed") {
    return `Opened ${count} Shelf saves`;
  }
  if (item.resource === "shelf" && item.action === "reacted") {
    return `${count} Shelf reactions landed`;
  }
  if (item.resource === "vault" && item.action === "reacted") {
    return `${count} Vault reactions landed`;
  }
  if (item.resource === "vault" && item.action === "commented") {
    return `${count} Vault comments added`;
  }
  if (item.resource === "vault" && item.action === "moment") {
    return `${count} Vault moments saved`;
  }
  return item.label;
}
