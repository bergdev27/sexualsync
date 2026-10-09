import type { DecisionItem, RequestRecord } from "@/lib/types";

export type RequestCounterItem = Pick<DecisionItem, "targetType"> & {
  fromLabel: string;
  label: string;
};

export function requestCounterItems(request: RequestRecord): RequestCounterItem[] {
  const raw = request.counters?.length
    ? request.counters
    : (request.decisions || []).filter((item) => item.counter || item.counterActId);
  return raw
    .map((item) => {
      const label = String(item.counter || item.label || "").trim();
      const rawFromLabel = String(item.label || "").trim();
      const fromLabel = rawFromLabel && rawFromLabel !== label && !/^Counter option \d+$/i.test(rawFromLabel)
        ? rawFromLabel
        : "";
      return {
        fromLabel,
        label,
        targetType: item.targetType || "act",
      };
    })
    .filter((item) => item.label);
}

export function hasPendingRequestCounter(request: RequestRecord): boolean {
  return !request.counterAcceptedAt && requestCounterItems(request).length > 0;
}

export function isApprovedSexActRequest(request: RequestRecord): boolean {
  if (hasPendingRequestCounter(request)) return false;
  const hasApprovedActDecision = (request.decisions || []).some((decision) => (
    decision.decision === "Yes" && (!decision.targetType || decision.targetType === "act")
  ));
  if (hasApprovedActDecision) return request.status === "reviewed" || request.status === "on_deck";
  return request.status === "on_deck" && (request.categories || []).length > 0;
}

// Mirror of functions/api/request-board.js TIMING_EXPIRY_DAYS. The server pads
// room-encrypted (E2EE) Asks to a 7-day window because it can't read the real
// timing — only the partners' clients can. So the client is the source of truth
// for whether an agreed act's scheduled window has actually passed.
const TIMING_EXPIRY_DAYS: Record<string, number> = {
  "Tonight": 1,
  "Mid-day": 1,
  "Tomorrow": 2,
  "Next week": 7,
};

/**
 * True once a request's scheduled timing window has passed, computed from the
 * *decrypted* timing the client can read. Live through the whole window; stale
 * once the local day `days` after the anchor day begins — e.g. a "Tomorrow" act
 * anchored Monday is live Mon–Tue and goes stale Wed 00:00, and a "Tonight" one
 * goes stale at the start of the next day. Matches the server's non-E2EE expiry.
 */
function timingWindowPassed(request: RequestRecord, now: Date): boolean {
  const days = TIMING_EXPIRY_DAYS[request.timing];
  if (!days) return false;
  const anchorDay = startOfLocalDay(timingAnchorForRequest(request));
  if (!anchorDay) return false;
  return now.getTime() >= addLocalDays(anchorDay, days).getTime();
}

/**
 * True once an approved/agreed act's scheduled window has passed (the server
 * keeps E2EE Asks around for up to a week — it can't read their real timing — so
 * without this an agreed "tonight"/"tomorrow" act lingers on the Sexboard for
 * days). Gated to approved acts by its call sites.
 */
export function isApprovedSexActStale(request: RequestRecord, now: Date = new Date()): boolean {
  // A plan keeps the agreed act live through the end of the planned day, the
  // same way the server stretches its expiry (functions/api/request-board.js
  // plannedExpirationFor). It never shortens the timing window.
  if (activePlanDate(request, now)) return false;
  return timingWindowPassed(request, now);
}

/**
 * The plan's date ("Plan it" on the match moment) while the planned day has not
 * ended yet; null when there's no plan or it's in the past.
 */
export function activePlanDate(request: Pick<RequestRecord, "plannedFor">, now: Date = new Date()): Date | null {
  const ms = Date.parse(request.plannedFor || "");
  if (!Number.isFinite(ms)) return null;
  const planned = new Date(ms);
  const day = startOfLocalDay(planned);
  if (!day) return null;
  return now.getTime() < addLocalDays(day, 1).getTime() ? planned : null;
}

/**
 * True once a still-PENDING/sent Ask's timing window has passed — the same E2EE
 * lingering problem as isApprovedSexActStale, but for an Ask the reviewer never
 * answered. In an encrypted room the server pads the expiry to ~7 days (it can't
 * read the real timing), so a "tonight" Ask the partner didn't respond to would
 * otherwise sit on the Sexboard for days. A still-pending/sent status already
 * means "unanswered" (any reviewer action moves it past those states).
 */
export function isStalePendingAsk(request: RequestRecord, now: Date = new Date()): boolean {
  // `maybe` included: a deferred Ask whose window passed is as stale as an
  // unanswered one. The server expires it on the next board read (mirrors this),
  // but filtering client-side hides it immediately, even from cached state.
  if (request.status !== "pending" && request.status !== "sent" && request.status !== "maybe") return false;
  return timingWindowPassed(request, now);
}

export function currentTimingLabel(request: RequestRecord): RequestRecord["timing"] {
  if (request.timing !== "Tomorrow") return request.timing;

  const anchor = timingAnchorForRequest(request);
  const anchorDay = startOfLocalDay(anchor);
  if (!anchorDay) return request.timing;

  const targetDay = addLocalDays(anchorDay, 1);
  const today = startOfLocalDay(new Date());
  if (!today) return request.timing;

  const dayDiff = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff <= 0) return "Tonight";
  return request.timing;
}

export function timingAnchorForRequest(request: RequestRecord): Date {
  const hasTimingCounter = Boolean(request.acceptedTimingCounter)
    || (request.acceptedCounters || []).some((item) => item.targetType === "timing");
  // Field order MUST mirror the server (functions/api/request-board.js
  // timingAnchorForRequest): counterAcceptedAt first for an accepted timing
  // counter, sentAt first otherwise. A drift here makes the Tomorrow→Tonight
  // label disagree with when the server actually expires the Ask.
  const base = hasTimingCounter
    ? request.counterAcceptedAt || request.reviewedAt || request.sentAt || request.createdAt || request.updatedAt
    : request.sentAt || request.createdAt || request.reviewedAt || request.counterAcceptedAt || request.updatedAt;
  // A manual restore opens a fresh timing window — anchor on whichever is later,
  // matching the server so the label stays in step after a restore.
  if (request.restoredAt) {
    const restoredMs = new Date(request.restoredAt).getTime();
    const baseMs = new Date(base || "").getTime();
    if (Number.isFinite(restoredMs) && (!Number.isFinite(baseMs) || restoredMs > baseMs)) {
      return new Date(request.restoredAt);
    }
  }
  return new Date(base || "");
}

export function startOfLocalDay(value: Date): Date | null {
  const time = value.getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addLocalDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

export function timingCopyForRequest(request: RequestRecord): string {
  return currentTimingLabel(request).toLowerCase();
}

/**
 * An Ask the reviewer still owes a first answer on. `sent` is the legacy
 * name for `pending`; the server treats both as replyable (request-board.js
 * REPLYABLE_STATUSES, _attention.js), so the client must too or a partner's
 * legacy Ask drops out of "Needs you" and the badge disagrees with the board.
 */
export function isAwaitingFirstReply(status: RequestRecord["status"]): boolean {
  return status === "pending" || status === "sent";
}

// ---------- Ask status + reply summary (one helper for every Ask surface) ----

export type AskViewer = "requester" | "reviewer";
export type AskStatusTone = "yes" | "no" | "neutral";

/**
 * The one human status for an Ask, read from the viewer's side (`mine` is
 * true when the viewer sent it). Raw status codes (`sent`, `pending`,
 * `on_deck`, `reviewed`) never reach the UI (DESIGN.md naming glossary); this
 * is the one place that maps them to the words people see, and every Ask
 * surface (Sexboard rows, Tonight, the Ask card) uses it. A replied Ask says
 * how it went (Yes, Countered, Passed) rather than just "replied".
 */
export function askStatusLabel(
  request: RequestRecord,
  { mine, partnerName = "your partner" }: { mine: boolean; partnerName?: string },
): { label: string; tone: AskStatusTone } {
  const actDecisions = requestedActDecisions(request);
  const anyYes = actDecisions.some((item) => item.decision === "Yes");
  const allNo = actDecisions.length > 0 && actDecisions.every((item) => item.decision === "No");
  switch (request.status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "pending":
    case "sent":
      return { label: mine ? `Waiting on ${partnerName}` : "Waiting on you", tone: "neutral" };
    case "maybe":
      return { label: mine ? `${partnerName} said maybe` : "You said maybe", tone: "neutral" };
    case "reviewed":
    case "on_deck":
      if (hasPendingRequestCounter(request)) return { label: "Countered", tone: "neutral" };
      if (request.counterAcceptedAt || anyYes) return { label: "Yes", tone: "yes" };
      if (allNo) return { label: "Passed", tone: "no" };
      if (request.status === "on_deck") return { label: "Yes", tone: "yes" };
      return { label: mine ? `${partnerName} replied` : "You replied", tone: "neutral" };
    case "completed":
      return { label: "Done", tone: "neutral" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "archived":
      if (request.passedAt || allNo) return { label: "Passed", tone: "no" };
      return { label: "Archived", tone: "neutral" };
    default:
      return { label: "Open", tone: "neutral" };
  }
}

/**
 * The reviewer's per-act answers to the Acts that were asked for: decisions
 * that target an act and are not themselves a counter offer. Counter offers
 * come from requestCounterItems so they render once, with human labels.
 */
export function requestedActDecisions(request: Pick<RequestRecord, "decisions">): DecisionItem[] {
  return (request.decisions || []).filter((item) => (
    (!item.targetType || item.targetType === "act")
    && Boolean(item.decision)
    && item.decision !== "Counter"
    && !item.counter
    && !item.counterActId
    && !/^Counter option \d+$/i.test(String(item.label || ""))
  ));
}

/** Human word for one reply decision ("No" reads as a pass, never a rejection). */
export function replyDecisionLabel(decision: DecisionItem["decision"]): string {
  switch (decision) {
    case "Yes": return "Yes";
    case "No": return "Pass";
    case "Maybe": return "Maybe";
    case "Let's chat": return "Let's talk";
    case "Counter": return "Counter";
    default: return "No answer";
  }
}
