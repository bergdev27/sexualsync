"use client";

/**
 * Sexboard body — every component below the route shell:
 * NoWorkspaceView / WaitingOnPartner / PendingInviteBanner / TonightBoard
 * / HandoffSection / HandoffRow, plus the handoff-builder helpers that
 * shape `LoadState` into the renderable handoff items.
 *
 * Extracted from page.tsx as part of H-2 so the route shell stays a
 * thin wrapper around state + reload + AppShell.
 */

import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { syncAppBadge } from "@/lib/app-badge";
import { LiveActivitySection } from "@/components/LiveActivityToast";
import { ErrorState, LoadErrorState, SkeletonList } from "@/components/States";
import WaitingForPartner from "@/components/WaitingForPartner";
import PartnerTurnOns from "@/components/PartnerTurnOns";
import SharedDesires from "@/components/SharedDesires";
import RainCheckSuggestions from "@/components/RainCheckSuggestions";
import { dueRainChecks, passOutcomeLine } from "@/lib/pass-reassurance";
import { acceptInvite, declineInvite } from "@/lib/api";
import type { QueuedWritePreview } from "@/lib/offline-queue";
import { ROOM_E2EE_PLACEHOLDER } from "@/lib/room-crypto";
import { mutualAskHref } from "@/lib/activity";
import { navigateWithMatchMorph } from "@/lib/match-transition";
import { planCountdown, planPhrase } from "@/lib/plan-time";
import { useDayRollover } from "@/lib/use-day-rollover";
import type {
  AuthInfo,
  BlindReveal,
  GameRoundStatus,
  KinkIdea,
  PendingInvite,
  PileSession,
  PileView,
  RequestRecord,
  Workspace,
} from "@/lib/types";
import { isFromPartner, partnerOf, rankActive } from "@/lib/workspace";
import {
  approvedRequestBody,
  blindRevealHasTwoAnswers,
  compactScheduledLabel,
  currentTimingLabel,
  friendlyDateLabel,
  hasPendingRequestCounter,
  hasJoinedPartner,
  isApprovedSexActRequest,
  isApprovedSexActStale,
  isStalePendingAsk,
  kinkReviewHref,
  requestTitle,
  safeDateMs,
  scheduledLabel,
  sharedKinksHref,
  unansweredKinksFor,
} from "./_sexboard-helpers";
import { pileMinNeeded, pileNeedsMe } from "@/lib/pile-state";
import { activePlanDate, askStatusLabel, isAwaitingFirstReply, requestedActDecisions } from "@/lib/request-state";
import { PresenceBand, PulseWaves } from "./_sexboard-presence";
import { MoodLight } from "./_sexboard-mood";
import type { HandoffItem, HandoffSummary, LoadState } from "./_sexboard-types";

const DASHBOARD_COPY = "Check here for live reveals, active requests, and anything that needs your response.";

export function Body({
  state,
  queuedAsks = [],
  onRetry,
  removingPileSessionId,
  viewedLockedPileSessionIds,
  viewedLockedBlindRevealIds,
  onRemoveLockedPile,
  onViewLockedPile,
  onViewLockedBlindReveal,
}: {
  state: LoadState;
  queuedAsks?: QueuedWritePreview[];
  onRetry: () => unknown;
  removingPileSessionId: string;
  viewedLockedPileSessionIds: Set<string>;
  viewedLockedBlindRevealIds: Set<string>;
  onRemoveLockedPile: (sessionId: string) => void;
  onViewLockedPile: (sessionId: string) => void;
  onViewLockedBlindReveal: (revealId: string) => void;
}) {
  const dayTick = useDayRollover();

  if (state.kind === "loading") return <SkeletonList count={3} />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Session expired"
        body="Sign in again to see your Sexboard."
        action={
          <Link href="/" className="btn-ghost">Back to sign-in</Link>
        }
      />
    );
  }
  if (state.kind === "error") {
    return <LoadErrorState what="your Sexboard" error={state.error ?? state.message} onRetry={onRetry} />;
  }
  if (state.kind === "no-workspace") {
    return <NoWorkspaceView pendingInvites={state.pendingInvites} />;
  }

  const partnerJoined = hasJoinedPartner(state.workspace, state.auth.email);
  if (!partnerJoined) {
    return (
      <WaitingOnPartner
        workspace={state.workspace}
        pendingInvites={state.pendingInvites}
      />
    );
  }

  return (
    <>
      {state.pendingInvites.length > 0 && (
        <div className="sexboard-pending-banner-wrap">
          <PendingInviteBanner invite={state.pendingInvites[0]} mode="ready" />
        </div>
      )}
      <TonightBoard
        state={state}
        queuedAsks={queuedAsks}
        dayTick={dayTick}
        removingPileSessionId={removingPileSessionId}
        viewedLockedPileSessionIds={viewedLockedPileSessionIds}
        viewedLockedBlindRevealIds={viewedLockedBlindRevealIds}
        onRemoveLockedPile={onRemoveLockedPile}
        onViewLockedPile={onViewLockedPile}
        onViewLockedBlindReveal={onViewLockedBlindReveal}
      />
    </>
  );
}

function NoWorkspaceView({ pendingInvites }: { pendingInvites: PendingInvite[] }) {
  if (pendingInvites.length > 0) {
    return (
      <div className="sexboard-waiting-shell">
        <PendingInviteBanner invite={pendingInvites[0]} mode="no-workspace" />
      </div>
    );
  }
  return (
    <div className="sexboard-waiting-shell">
      <RoomSyncMark mode="create" />
      <h2 className="sexboard-waiting-title">Set up your room.</h2>
      <p className="sexboard-waiting-body">A private space for two &mdash; you and one other person. Takes a minute.</p>
      <div className="sexboard-waiting-actions">
        <Link href="/onboarding" className="btn-primary sexboard-waiting-cta">Create my room</Link>
      </div>
    </div>
  );
}

function WaitingOnPartner({
  workspace,
  pendingInvites,
}: {
  workspace: Workspace;
  pendingInvites: PendingInvite[];
}) {
  return (
    <>
      {pendingInvites.length > 0 && (
        <div className="sexboard-pending-banner-wrap">
          <PendingInviteBanner invite={pendingInvites[0]} mode="ready" />
        </div>
      )}
      <WaitingForPartner workspace={workspace} />
    </>
  );
}

function RoomSyncMark({ mode }: { mode: "create" | "waiting" }) {
  return (
    <div className="sexboard-waiting-orb" data-mode={mode} aria-hidden="true">
      <svg className="sexboard-waiting-wave" viewBox="0 0 160 112" fill="none" focusable="false">
        <path className="sexboard-waiting-wave-back" pathLength={1} d="M 18 42 C 42 14 62 14 80 42 C 98 70 118 70 142 42" />
        <path className="sexboard-waiting-wave-line" pathLength={1} d="M 18 42 C 42 14 62 14 80 42 C 98 70 118 70 142 42" />
        <path className="sexboard-waiting-wave-sweep" pathLength={1} d="M 18 42 C 42 14 62 14 80 42 C 98 70 118 70 142 42" />
        <path className="sexboard-waiting-wave-back is-lower" pathLength={1} d="M 18 70 C 42 42 62 42 80 70 C 98 98 118 98 142 70" />
        <path className="sexboard-waiting-wave-line is-lower" pathLength={1} d="M 18 70 C 42 42 62 42 80 70 C 98 98 118 98 142 70" />
        <path className="sexboard-waiting-wave-sweep is-lower" pathLength={1} d="M 18 70 C 42 42 62 42 80 70 C 98 98 118 98 142 70" />
        <circle className="sexboard-waiting-spark a" cx="80" cy="24" r="1.8" />
        <circle className="sexboard-waiting-spark b" cx="41" cy="58" r="1.45" />
        <circle className="sexboard-waiting-spark c" cx="119" cy="87" r="1.45" />
      </svg>
    </div>
  );
}

function PendingInviteBanner({ invite, mode }: { invite: PendingInvite; mode: "ready" | "no-workspace" }) {
  const [busy, setBusy] = useState<"" | "accept" | "decline">("");
  const [error, setError] = useState<string | null>(null);
  const inviter = invite.inviterName?.split(" ")[0] || "Someone";
  const room = invite.workspaceName || "their room";

  async function handle(action: "accept" | "decline") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      if (action === "accept") {
        await acceptInvite(invite.id);
        window.location.assign("/welcome");
      } else {
        await declineInvite(invite.id);
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update this invite.");
      setBusy("");
    }
  }

  return (
    <div className="sexboard-pending-banner" role="region" aria-label="Pending invite">
      <p className="sexboard-pending-eyebrow">New invite</p>
      <h2 className="sexboard-pending-title">{inviter} invited you to {mode === "no-workspace" ? "a private room" : "their room"}</h2>
      <p className="sexboard-pending-body">
        {mode === "no-workspace"
          ? `Accepting puts you in ${room} with ${inviter}.`
          : `If you accept, you'll move into ${room}. Your current empty room here gets closed.`}
      </p>
      {error && <p className="sexboard-pending-error" role="alert">{error}</p>}
      <div className="sexboard-pending-row">
        <button type="button" className="sexboard-pending-accept" disabled={Boolean(busy)} onClick={() => void handle("accept")}>
          {busy === "accept" ? "Accepting..." : "Accept & move in"}
        </button>
        <button type="button" className="sexboard-pending-decline" disabled={Boolean(busy)} onClick={() => void handle("decline")}>
          {busy === "decline" ? "Declining..." : "Not now"}
        </button>
      </div>
    </div>
  );
}

// Mirrors the "Needs you" count onto the PWA home-screen icon badge whenever the
// Sexboard (the app's default landing surface) is mounted, so opening the app
// reconciles the badge to reality. No-op off-PWA / on browsers without the
// Badging API. Live updates while the app is closed land via the service-worker
// push path (it reads a `badge` count from the payload), tracked separately.
function BadgeSync({ count }: { count: number }) {
  useEffect(() => { syncAppBadge(count); }, [count]);
  return null;
}

function TonightBoard({
  state,
  queuedAsks,
  dayTick,
  removingPileSessionId,
  viewedLockedPileSessionIds,
  viewedLockedBlindRevealIds,
  onRemoveLockedPile,
  onViewLockedPile,
  onViewLockedBlindReveal,
}: {
  state: Extract<LoadState, { kind: "ready" }>;
  queuedAsks: QueuedWritePreview[];
  dayTick: number;
  removingPileSessionId: string;
  viewedLockedPileSessionIds: Set<string>;
  viewedLockedBlindRevealIds: Set<string>;
  onRemoveLockedPile: (sessionId: string) => void;
  onViewLockedPile: (sessionId: string) => void;
  onViewLockedBlindReveal: (revealId: string) => void;
}) {
  // Derive the handoff summary from state plus day-rollover ticks. A Remove
  // click should not rebuild unrelated handoff arrays under live-room churn.
  const summary = useMemo(
    () => handoffSummaryFor(state, viewedLockedPileSessionIds, viewedLockedBlindRevealIds),
    // dayTick is the recompute trigger: "tonight"/"tomorrow" windows shift at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, viewedLockedPileSessionIds, viewedLockedBlindRevealIds, dayTick],
  );
  const {
    ranked,
    activeGamesCount,
    latestPile,
    latestBlindReveal,
    kinksNeedingMe,
    handoffs,
    needsCount,
    waitingCount,
    partnerName,
  } = summary;
  const dashboardState = sexboardDashboardState(ranked, state.auth, Boolean(activeGamesCount), kinksNeedingMe.length, latestPile, latestBlindReveal);
  const pulseState = pulseStateFor(dashboardState);
  // A due rain check shows right under the headline, so "caught up" would
  // contradict it. (The suggestion itself is the asker's call, never needs-you.)
  const rainChecksDue = useMemo(
    () => dueRainChecks(state.board.requests, state.auth.email).length > 0,
    // dayTick re-evaluates as rain checks come due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.board.requests, state.auth.email, dayTick],
  );
  // { pre, accent, post } so the key phrase renders in the editorial <em>
  // (italic, accent-colored). The reassembled text is identical to before.
  const headline = useMemo<{ pre: string; accent: string; post: string }>(() => (
    kinksNeedingMe.length && needsCount === 1
      ? { pre: "", accent: `${kinksNeedingMe.length} kink${kinksNeedingMe.length === 1 ? "" : "s"}`, post: " need your response." }
      : needsCount === 0
      ? waitingCount === 0
        ? handoffs.planned.length
          ? { pre: "Something's ", accent: "planned.", post: "" }
          : handoffs.locked.length
          ? { pre: "Tonight is ", accent: "locked in.", post: "" }
          : rainChecksDue
          ? { pre: "Something to ", accent: "try again.", post: "" }
          : { pre: "You're ", accent: "caught up.", post: "" }
        : waitingCount === 1
          ? { pre: "Waiting on ", accent: `${partnerName}.`, post: "" }
          : { pre: "", accent: `${waitingCount} things`, post: ` waiting on ${partnerName}.` }
      : needsCount === 1
      ? { pre: "", accent: "1 thing", post: " needs a response." }
      : { pre: "", accent: `${needsCount} things`, post: " need a response." }
  ), [kinksNeedingMe.length, needsCount, waitingCount, handoffs.locked.length, handoffs.planned.length, partnerName, rainChecksDue]);
  // Stabilize the parent's remove handler so the Locked-in section's React.memo
  // only re-renders when its own items / removing flag actually change.
  const handleRemoveLockedPile = useCallback(
    (sessionId: string) => onRemoveLockedPile(sessionId),
    [onRemoveLockedPile],
  );
  const handleViewLockedPile = useCallback(
    (sessionId: string) => onViewLockedPile(sessionId),
    [onViewLockedPile],
  );
  const handleViewLockedBlindReveal = useCallback(
    (revealId: string) => onViewLockedBlindReveal(revealId),
    [onViewLockedBlindReveal],
  );
  const lockedSection = useMemo(() => (
    handoffs.locked.length ? (
      <HandoffSection
        title="Locked in"
        emptyEyebrow=""
        emptyTitle=""
        emptyBody=""
        items={handoffs.locked}
        removingPileSessionId={removingPileSessionId}
        onRemoveLockedPile={handleRemoveLockedPile}
        onViewLockedPile={handleViewLockedPile}
        onViewLockedBlindReveal={handleViewLockedBlindReveal}
      />
    ) : null
  ), [handoffs.locked, removingPileSessionId, handleRemoveLockedPile, handleViewLockedPile, handleViewLockedBlindReveal]);

  return (
    <section className="dashboard-home" data-dashboard-state={dashboardState}>
      <BadgeSync count={handoffs.needsYou.length} />
      <MoodLight workspaceId={state.workspace.id} partnerName={partnerName} />
      <article className="card pulse-card sexboard-card sexboard-handoff-card" data-pulse-state={pulseState} aria-label="Sexboard">
        <PresenceBand workspace={state.workspace} auth={state.auth} presence={state.presence} />

        <section className="sexboard-wave-panel" aria-label="Sexboard status">
          <PulseWaves state={pulseState} synced={dashboardState === "tonight"} />
          <div className="sexboard-status-copy">
            <h2>{headline.pre}<em>{headline.accent}</em>{headline.post}</h2>
            <p>{DASHBOARD_COPY}</p>
          </div>
        </section>

        <QueuedAskSection items={queuedAsks} workspaceId={state.workspace.id} partnerName={partnerName} />

        <RainCheckSuggestions
          requests={state.board.requests}
          myEmail={state.auth.email}
          partnerName={partnerName}
          workspaceId={state.workspace.id}
        />

        {!handoffs.needsYou.length ? lockedSection : null}

        <HandoffSection
          title="Needs you"
          attention
          emptyEyebrow="All clear"
          emptyTitle="Nothing needs your response"
          emptyBody="New requests, reveals, and kink responses will show here."
          items={handoffs.needsYou}
        />

        {handoffs.needsYou.length ? lockedSection : null}

        {handoffs.planned.length ? (
          <HandoffSection
            title="Planned"
            emptyEyebrow=""
            emptyTitle=""
            emptyBody=""
            items={handoffs.planned}
          />
        ) : null}

        <HandoffSection
          title={`Waiting on ${partnerName}`}
          emptyEyebrow="Nothing sent"
          emptyTitle={`Nothing waiting on ${partnerName}`}
          emptyBody={`Asks, Pile lists, and kinks you send to ${partnerName} will show here.`}
          items={handoffs.waiting}
        />

        {handoffs.replies.length ? (
          <HandoffSection
            title="Replies"
            emptyEyebrow=""
            emptyTitle=""
            emptyBody=""
            items={handoffs.replies}
          />
        ) : null}
      </article>

      <SharedDesires workspaceId={state.workspace.id} />

      <PartnerTurnOns workspaceId={state.workspace.id} />

      <LiveActivitySection
        workspaceId={state.workspace.id}
        myEmail={state.auth.email}
        partnerName={partnerName}
        partnerLastSeen={state.presence?.partner?.lastSeen || ""}
        initialActivity={state.activity}
        refreshOnRoomEvent={false}
      />
    </section>
  );
}

function queuedAskTitle(body: unknown): string {
  const record = (body && typeof body === "object" ? body : {}) as { categories?: unknown; encryptedPayload?: unknown };
  const categories = Array.isArray(record.categories)
    ? record.categories.filter((item): item is string => typeof item === "string" && item !== ROOM_E2EE_PLACEHOLDER)
    : [];
  if (record.encryptedPayload || !categories.length) return "Your Ask";
  return categories.length > 2 ? `${categories.slice(0, 2).join(", ")} +${categories.length - 2}` : categories.join(", ");
}

/**
 * Asks composed offline. They live in the device's offline queue until the
 * connection returns, so they aren't on the server board yet; without this
 * row the Sexboard would look like the Ask vanished.
 */
function QueuedAskSection({
  items,
  workspaceId,
  partnerName,
}: {
  items: QueuedWritePreview[];
  workspaceId: string;
  partnerName: string;
}) {
  const mine = items.filter((item) => {
    const target = (item.body as { workspaceId?: unknown } | null)?.workspaceId;
    return !target || target === workspaceId;
  });
  if (!mine.length) return null;
  return (
    <section className="sexboard-handoff-section" aria-label="Waiting to send">
      <div className="sexboard-section-head">
        <span>Waiting to send</span>
      </div>
      <div className="sexboard-handoff-list">
        {mine.map((item) => (
          <div key={item.id} className="sexboard-handoff-row sexboard-handoff-row--queued">
            <span className="sexboard-handoff-copy">
              <span className="sexboard-handoff-eyebrow">Queued Ask</span>
              <strong>{queuedAskTitle(item.body)}</strong>
              <small>Sends to {partnerName} when you&apos;re back online.</small>
            </span>
            <span className="sexboard-handoff-queued-mark" aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}

const HandoffSection = memo(function HandoffSection({
  title,
  attention = false,
  emptyEyebrow,
  emptyTitle,
  emptyBody,
  items,
  removingPileSessionId = "",
  onRemoveLockedPile,
  onViewLockedPile,
  onViewLockedBlindReveal,
}: {
  title: string;
  attention?: boolean;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyBody: string;
  items: HandoffItem[];
  removingPileSessionId?: string;
  onRemoveLockedPile?: (sessionId: string) => void;
  onViewLockedPile?: (sessionId: string) => void;
  onViewLockedBlindReveal?: (revealId: string) => void;
}) {
  const sectionClass = `sexboard-handoff-section ${attention && items.length ? "is-attention" : ""}`;
  return (
    <section className={sectionClass} aria-label={title}>
      <div className="sexboard-section-head">
        <span>{title}</span>
      </div>
      {items.length ? (
        <div className="sexboard-handoff-list">
          {items.map((item) => (
            <HandoffRow
              key={item.id}
              item={item}
              removing={Boolean(item.removeSessionId && removingPileSessionId === item.removeSessionId)}
              onRemoveLockedPile={onRemoveLockedPile}
              onViewLockedPile={onViewLockedPile}
              onViewLockedBlindReveal={onViewLockedBlindReveal}
            />
          ))}
        </div>
      ) : (
        <div className="sexboard-handoff-row sexboard-handoff-row--empty">
          <span className="sexboard-handoff-copy">
            <span className="sexboard-handoff-eyebrow">{emptyEyebrow}</span>
            <strong>{emptyTitle}</strong>
            <small>{emptyBody}</small>
          </span>
        </div>
      )}
    </section>
  );
});

const HandoffRow = memo(function HandoffRow({
  item,
  removing,
  onRemoveLockedPile,
  onViewLockedPile,
  onViewLockedBlindReveal,
}: {
  item: HandoffItem;
  removing: boolean;
  onRemoveLockedPile?: (sessionId: string) => void;
  onViewLockedPile?: (sessionId: string) => void;
  onViewLockedBlindReveal?: (revealId: string) => void;
}) {
  const rowClass = [
    "sexboard-handoff-row",
    item.removeSessionId ? "" : "pressable",
    item.tone ? `sexboard-handoff-row--${item.tone}` : "",
    item.glow ? "sexboard-handoff-row--approved-match" : "",
  ].filter(Boolean).join(" ");
  const actionClass = [
    "sexboard-handoff-action",
    item.actionGlow ? "sexboard-handoff-action--glow" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <span className="sexboard-handoff-copy">
      <span className="sexboard-handoff-eyebrow">{item.eyebrow}</span>
      <strong>{item.title}</strong>
      <small>{item.body}</small>
      {item.tags?.length ? (
        <span className="sexboard-handoff-tags">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="sexboard-handoff-tag">{tag}</span>
          ))}
          {item.tags.length > 4 ? (
            <span className="sexboard-handoff-tag">+{item.tags.length - 4}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
  const hasViewDismiss = Boolean(
    (item.dismissOnViewSessionId && onViewLockedPile)
      || (item.dismissOnViewRevealId && onViewLockedBlindReveal)
  );
  const router = useRouter();
  const onViewClick = hasViewDismiss
    ? () => {
        if (item.dismissOnViewSessionId) onViewLockedPile?.(item.dismissOnViewSessionId);
        if (item.dismissOnViewRevealId) onViewLockedBlindReveal?.(item.dismissOnViewRevealId);
      }
    : undefined;
  // Approved-match rows hand their title to the /mutual hero as a shared
  // element where View Transitions exist; elsewhere the Link just navigates.
  const onMorphClick = item.morph
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const source = event.currentTarget.querySelector<HTMLElement>(".sexboard-handoff-copy strong");
        if (navigateWithMatchMorph(router.push, item.href, source)) event.preventDefault();
      }
    : onViewClick;

  if (item.removeSessionId && onRemoveLockedPile) {
    return (
      <div className={rowClass}>
        <Link href={item.href} className="sexboard-handoff-main pressable" onClick={onViewClick}>
          {content}
        </Link>
        <span className="sexboard-handoff-action-stack">
          <Link href={item.href} className={`${actionClass} pressable`} onClick={onViewClick}>
            {item.action}
          </Link>
          <button
            type="button"
            className="sexboard-handoff-remove pressable"
            onClick={() => item.removeSessionId && onRemoveLockedPile(item.removeSessionId)}
            disabled={removing}
          >
            {removing ? "Removing" : "Remove"}
          </button>
        </span>
      </div>
    );
  }

  return (
    <Link href={item.href} className={rowClass} onClick={onMorphClick}>
      {content}
      <span className={actionClass}>
        {item.action}
      </span>
    </Link>
  );
});

function handoffSummaryFor(
  state: Extract<LoadState, { kind: "ready" }>,
  viewedLockedPileSessionIds: Set<string>,
  viewedLockedBlindRevealIds: Set<string>,
): HandoffSummary {
  // Drop any Ask whose scheduled window has already passed — both agreed acts AND
  // still-pending Asks the partner never answered. The server keeps room-encrypted
  // Asks for up to a week (it can't read their real timing), so without this a
  // "tonight" Ask sent last night keeps showing the next day for days.
  const ranked = rankActive(state.board.activeRequests, state.auth)
    .filter((request) => !(
      (isApprovedSexActRequest(request) && isApprovedSexActStale(request))
      || isStalePendingAsk(request)
    ));
  const visibleBlindReveal = state.blindReveal && !(
    state.blindReveal.status === "revealed"
    && viewedLockedBlindRevealIds.has(String(state.blindReveal.id || ""))
  )
    ? state.blindReveal
    : null;
  const visiblePile = sexboardVisiblePile(state.pile);
  const activeGamesCount = Number(Boolean(visiblePile)) + Number(Boolean(visibleBlindReveal));
  const latestPile = state.pileSessions.find((session) => session.id && !viewedLockedPileSessionIds.has(String(session.id)));
  const latestBlindReveal = state.blindReveals.find((reveal) => {
    if (reveal.id === visibleBlindReveal?.id) return false;
    if (viewedLockedBlindRevealIds.has(String(reveal.id || ""))) return false;
    return reveal.status !== "open" && (reveal.entries || []).length > 0;
  });
  const kinksNeedingMe = unansweredKinksFor(state.fantasy.ideas, state.auth.email, "from-partner");
  const kinksWaitingOnPartner = unansweredKinksFor(state.fantasy.ideas, state.auth.email, "from-me");
  const hasApprovedSexActRequest = ranked.some(isApprovedSexActRequest);
  const partner = partnerOf(state.workspace, state.auth.email);
  const partnerName = partner?.displayName?.split(" ")[0] || "your partner";
  const handoffs = buildHandoffs({
    pile: visiblePile,
    blindReveal: visibleBlindReveal,
    requests: ranked,
    kinksNeedingMe,
    kinksWaitingOnPartner,
    latestPile,
    latestBlindReveal,
    hasApprovedSexActRequest,
    sexQuiz: state.sexQuiz,
    greenLights: state.greenLights,
    me: state.auth,
    partnerName,
  });
  return {
    ranked,
    latestPile,
    latestBlindReveal,
    activeGamesCount,
    kinksNeedingMe,
    kinksWaitingOnPartner,
    handoffs,
    needsCount: handoffs.needsYou.length,
    waitingCount: handoffs.waiting.length,
    partnerName,
  };
}

function sexboardVisiblePile(pile: PileView | null): PileView | null {
  if (!pile) return null;
  if (pile.isRevealed) return pile;
  const revealAt = safeDateMs(pile.revealAt);
  return revealAt > 0 && revealAt <= Date.now() ? null : pile;
}

function buildHandoffs({
  pile,
  blindReveal,
  requests,
  kinksNeedingMe,
  kinksWaitingOnPartner,
  latestPile,
  latestBlindReveal,
  hasApprovedSexActRequest,
  sexQuiz,
  greenLights,
  me,
  partnerName,
}: {
  pile: PileView | null;
  blindReveal: BlindReveal | null;
  requests: RequestRecord[];
  kinksNeedingMe: KinkIdea[];
  kinksWaitingOnPartner: KinkIdea[];
  latestPile?: PileSession;
  latestBlindReveal?: BlindReveal;
  hasApprovedSexActRequest: boolean;
  sexQuiz: GameRoundStatus | null;
  greenLights: GameRoundStatus | null;
  me: AuthInfo;
  partnerName: string;
}): HandoffSummary["handoffs"] {
  const needsYou: HandoffItem[] = [];
  const replies: HandoffItem[] = [];
  // Approved Asks with a time on them ("Plan it" on the match moment). Never a
  // needs-you contributor, so the badge parity with the server is unaffected.
  const planned: { at: number; item: HandoffItem }[] = [];
  const waiting: HandoffItem[] = [];
  const locked: HandoffItem[] = [
    latestPile ? lockedPileHandoff(latestPile, hasApprovedSexActRequest) : null,
    latestBlindReveal ? lockedBlindRevealHandoff(latestBlindReveal) : null,
  ].filter(Boolean) as HandoffItem[];

  if (pile) {
    const mineCount = pile.mine?.length || 0;
    const maxDropCount = pile.maxDropCount || pile.targetDropCount || 0;
    const usesDropLimit = maxDropCount > 0;
    // The Pile needs you until you've dropped the minimum it needs to open.
    // Mirrors attentionCountFor in functions/api/_attention.js (badge parity).
    const minNeeded = pileMinNeeded(pile);
    const mineReady = mineCount >= minNeeded;
    const shortBy = mineCount > 0 && !mineReady ? minNeeded - mineCount : 0;
    const revealLabel = compactScheduledLabel(scheduledLabel(pile.revealAt));
    const revealDue = safeDateMs(pile.revealAt) <= Date.now();
    const pileItem: HandoffItem = pile.isRevealed
      ? {
          id: "pile-reveal",
          href: "/games/pile",
          eyebrow: "The Pile reveal is open",
          title: "Open the reveal",
          body: pile.overlap?.length
            ? `${pile.overlap.length} overlap${pile.overlap.length === 1 ? "" : "s"} ready.`
            : "See what matched and what stayed private.",
          action: "Open",
        }
      : {
          id: "pile-live",
          href: "/games/pile",
          eyebrow: usesDropLimit
            ? `The Pile allows up to ${maxDropCount} each`
            : pile.partnerHasDropped
            ? `${partnerName} added acts`
            : "The Pile is live",
          title: shortBy
            ? (shortBy === 1 ? "Add one more" : `Add ${shortBy} more`)
            : mineCount
            ? "Edit your acts"
            : "Add your acts",
          body: shortBy
            ? (shortBy === 1 ? "Add one more to the Pile so it can open." : `Add ${shortBy} more to the Pile so it can open.`)
            : mineCount
            ? revealDue && !pile.partnerHasDropped
              ? `Waiting for ${partnerName} to add their Acts.`
              : `Your list is saved. You can update it before reveal in ${revealLabel}.`
            : usesDropLimit
            ? revealDue
              ? `Drop ${Math.min(pile.minDropCount || 2, maxDropCount)} to ${maxDropCount} Acts to open the reveal.`
              : `Drop ${Math.min(pile.minDropCount || 2, maxDropCount)} to ${maxDropCount} Acts before reveal in ${revealLabel}.`
            : `Matches reveal in ${revealLabel} if you both picked the same acts.`,
          action: "Open Pile",
        };
    if (pileNeedsMe(pile)) needsYou.push(pileItem);
    else waiting.push({
      ...pileItem,
      eyebrow: usesDropLimit ? `Up to ${maxDropCount} each` : pile.partnerHasDropped ? "Both added acts" : "You added acts",
      title: pile.partnerHasDropped
        ? "Both Pile lists are in"
        : "Your Pile list is in",
      body: pile.partnerHasDropped
        ? `Reveal in ${revealLabel}. You can still edit before it opens.`
        : revealDue
        ? `Waiting for ${partnerName} to add their Acts.`
        : `Waiting for ${partnerName} and reveal in ${revealLabel}.`,
      action: "Edit",
    });
  }

  if (blindReveal) {
    const needsSubmission = blindReveal.status !== "revealed" && !blindReveal.mySubmitted;
    const partnerSubmitted = blindReveal.partnerSubmitted;
    const hasTwoAnswers = blindRevealHasTwoAnswers(blindReveal);
    const item: HandoffItem = {
      id: `blind-${blindReveal.id}`,
      href: "/games/blind-reveal",
      eyebrow: partnerSubmitted ? `${partnerName} answered Blind Reveal` : "Blind Reveal is open",
      title: blindReveal.status === "revealed" ? "Open the answers" : "Answer Blind Reveal",
      body: blindReveal.status === "revealed"
        ? "Both answers are visible."
        : `${blindReveal.submittedCount}/${blindReveal.requiredCount} answers locked.`,
      action: blindReveal.status === "revealed" ? "Open" : needsSubmission ? "Answer" : "View",
      actionGlow: hasTwoAnswers,
    };
    if (blindReveal.status === "revealed") locked.push(lockedBlindRevealHandoff(blindReveal, hasTwoAnswers));
    else if (needsSubmission) needsYou.push(item);
    else waiting.push({
      ...item,
      eyebrow: "You answered Blind Reveal",
      title: "Answer locked",
      body: `Waiting on ${partnerName}.`,
      action: "View",
    });
  }

  // Sex Quiz / Green Lights — mirror the Pile/Blind Reveal in-flight states:
  // partner finished and you haven't (needs you), or you finished and they
  // haven't (waiting). Both done / revealed shows neither.
  if (sexQuiz) {
    if (sexQuiz.partnerSubmitted && !sexQuiz.mySubmitted) {
      needsYou.push({
        id: "sexquiz-needs-you",
        href: "/games/sex-quiz",
        eyebrow: `${partnerName} took the Sex Quiz`,
        title: "Take the Sex Quiz",
        body: "Answer yours to unlock what you're both into.",
        action: "Take it",
      });
    } else if (sexQuiz.mySubmitted && !sexQuiz.partnerSubmitted) {
      waiting.push({
        id: "sexquiz-waiting",
        href: "/games/sex-quiz",
        eyebrow: "Your Sex Quiz is in",
        title: `Waiting on ${partnerName}`,
        body: `Your answers are saved — ${partnerName} hasn't finished theirs.`,
        action: "View",
      });
    }
  }
  if (greenLights) {
    if (greenLights.partnerSubmitted && !greenLights.mySubmitted) {
      needsYou.push({
        id: "greenlights-needs-you",
        href: "/games/green-lights",
        eyebrow: `${partnerName} took Green Lights`,
        title: "Take Green Lights",
        body: "Answer yours to see where you align.",
        action: "Take it",
      });
    } else if (greenLights.mySubmitted && !greenLights.partnerSubmitted) {
      waiting.push({
        id: "greenlights-waiting",
        href: "/games/green-lights",
        eyebrow: "Your Green Lights are in",
        title: `Waiting on ${partnerName}`,
        body: `Your answers are saved — ${partnerName} hasn't finished theirs.`,
        action: "View",
      });
    }
  }

  if (kinksNeedingMe.length) {
    needsYou.push(kinkResponseHandoff({
      id: "kinks-need-me",
      href: kinkReviewHref(kinksNeedingMe),
      count: kinksNeedingMe.length,
      actorName: partnerName,
      mode: "needs-me",
    }));
  }

  if (kinksWaitingOnPartner.length) {
    waiting.push(kinkResponseHandoff({
      id: "kinks-waiting-partner",
      href: sharedKinksHref(),
      count: kinksWaitingOnPartner.length,
      actorName: partnerName,
      mode: "waiting-partner",
    }));
  }

  requests.forEach((request) => {
    const fromPartner = isFromPartner(request, me);
    const title = requestTitle(request);
    const href = requestHandoffHref(request);
    const pendingCounter = hasPendingRequestCounter(request);
    const approvedSexAct = isApprovedSexActRequest(request);
    const timingLabel = currentTimingLabel(request);
    const action = approvedSexAct ? "It's on!" : pendingCounter && !fromPartner ? "Review" : "Open";
    const planDate = approvedSexAct ? activePlanDate(request) : null;
    if (planDate) {
      // A warm countdown, not a to-do: who planned it doesn't matter here,
      // and nothing nags as the time gets close (no reminders for plans).
      const countdown = planCountdown(planDate);
      const ahead = planDate.getTime() - Date.now() > 5 * 60_000;
      planned.push({
        at: planDate.getTime(),
        item: {
          id: `planned-${request.id}`,
          href,
          eyebrow: `Planned for ${planPhrase(planDate)}`,
          title,
          body: ahead ? `${countdown}. The waiting’s part of it.` : `${countdown}.`,
          action,
          actionGlow: true,
          morph: true,
        },
      });
      return;
    }
    if (fromPartner && isAwaitingFirstReply(request.status)) {
      needsYou.push({
        id: `request-${request.id}`,
        href,
        eyebrow: `${request.requesterName || partnerName} sent an Ask`,
        title,
        body: `${timingLabel} · waiting for your yes, no, or counter.`,
        action: "Reply",
      });
      return;
    }

    // A deferred Ask. On the reviewer's board it's a "needs you" — she owes a
    // final call — with copy that escalates from "decide by <when>" to a direct
    // "yes or no?" once the timing window has actually arrived (Tomorrow rolls
    // to Tonight via currentTimingLabel). On the requester's board it's a soft
    // waiting row with a Nudge that routes to the Ask (where Remind lives).
    if (request.status === "maybe") {
      const decideNow = timingLabel === "Tonight" || timingLabel === "Mid-day";
      if (fromPartner) {
        needsYou.push({
          id: `request-${request.id}`,
          href,
          eyebrow: `${request.requesterName || partnerName} sent an Ask`,
          title,
          body: decideNow
            ? "Still a maybe from earlier — yes or no?"
            : `Maybe · decide closer to ${timingLabel.toLowerCase()}.`,
          action: decideNow ? "Decide" : "Decide now",
        });
      } else {
        waiting.push({
          id: `request-${request.id}`,
          href,
          eyebrow: "You sent an Ask",
          title,
          body: `${partnerName} said maybe · deciding by ${timingLabel.toLowerCase()}.`,
          action: "Nudge",
        });
      }
      return;
    }

    // A counter on my Ask: the next move (accept or pass) is mine. Mirrors
    // counterAwaitsRequester() in request-board.js, which _attention.js counts
    // for the badge, so the board and the icon agree.
    if (!fromPartner && pendingCounter && (request.status === "reviewed" || request.status === "on_deck")) {
      needsYou.push({
        id: `request-${request.id}`,
        href,
        eyebrow: `${partnerName} countered your Ask`,
        title,
        body: "Accept the counter or pass.",
        action: "Review",
      });
      return;
    }

    // A final answer that isn't a yes (a pass, a maybe-for-now, "let's talk")
    // isn't waiting on anyone: it's an outcome, said in plain words.
    if (request.status === "reviewed" && !pendingCounter && !approvedSexAct) {
      replies.push({
        id: `request-${request.id}`,
        href,
        eyebrow: fromPartner ? `${request.requesterName || partnerName} sent an Ask` : "You sent an Ask",
        title,
        body: replyOutcomeBody(request, fromPartner ? "You" : partnerName),
        action: "Open",
      });
      return;
    }

    if (!fromPartner) {
      waiting.push({
        id: `request-${request.id}`,
        href,
        eyebrow: "You sent an Ask",
        title,
        body: request.status === "on_deck" || approvedSexAct
          ? approvedRequestBody(request)
          : request.status === "reviewed"
          ? `${partnerName} replied.`
          : `Waiting on ${partnerName}.`,
        action,
        actionGlow: approvedSexAct && request.status === "on_deck",
        morph: approvedSexAct,
      });
    } else {
      waiting.push({
        id: `request-${request.id}`,
        href,
        eyebrow: `${request.requesterName || partnerName} sent an Ask`,
        title,
        body: request.status === "on_deck"
          ? approvedRequestBody(request)
          : request.status === "reviewed" && pendingCounter
          ? "Counter offered."
          : `${askStatusLabel(request, { mine: false, partnerName }).label} · ${timingLabel}`,
        action,
        actionGlow: approvedSexAct && request.status === "on_deck",
        morph: approvedSexAct,
      });
    }
  });

  return {
    needsYou,
    waiting,
    locked,
    planned: planned.sort((a, b) => a.at - b.at).map((entry) => entry.item),
    replies,
  };
}

// "Jordan passed for now. No reason needed." / "You said maybe for now." for a
// final answer with no yes. A pass always reads warm (lib/pass-reassurance).
function replyOutcomeBody(request: RequestRecord, who: string): string {
  const you = who === "You";
  const answers = requestedActDecisions(request).map((item) => item.decision);
  if (answers.length && answers.every((answer) => answer === "No")) return passOutcomeLine(request, { mine: !you, partnerName: who });
  if (answers.includes("Maybe")) return `${who} said maybe for now.`;
  if (answers.includes("Let's chat")) return you ? "You want to talk about it first." : `${who} wants to talk about it first.`;
  return `${who} replied.`;
}

function requestHandoffHref(request: RequestRecord) {
  // An approved all-yes Ask (status reviewed *or* on_deck) routes to the
  // /mutual celebration — not just on_deck — so a plain "Yes to all" reply that
  // lands in `reviewed` still lands on "Both of you said yes." rather than the
  // Pass/Archive-only Ask detail.
  if (isApprovedSexActRequest(request)) return mutualAskHref(request.id, request.categories || [], request.matchNarration || "");
  return `/ask-detail?id=${encodeURIComponent(request.id)}`;
}

function lockedPileHandoff(session: PileSession, hasApprovedSexActRequest = false): HandoffItem {
  const acts = session.acts || session.overlap || [];
  const matchLabel = `${acts.length} match${acts.length === 1 ? "" : "es"}`;
  return {
    id: `locked-pile-${session.id}`,
    href: `/games/pile?session=${encodeURIComponent(session.id)}&activity=1`,
    eyebrow: `${friendlyDateLabel(session.lockedAt || session.revealAt)} · ${matchLabel}`,
    title: session.revealNarration || `${matchLabel} locked in`,
    body: "Pile overlap locked in for tonight.",
    action: "View",
    tags: acts,
    tone: "locked",
    glow: hasApprovedSexActRequest && acts.length > 0,
    removeSessionId: session.id,
    dismissOnViewSessionId: session.id,
  };
}

function lockedBlindRevealHandoff(reveal: BlindReveal, hasTwoAnswers = false): HandoffItem {
  return {
    id: `locked-blind-${reveal.id}`,
    href: `/games/blind-reveal?id=${encodeURIComponent(reveal.id)}&activity=1`,
    eyebrow: `${friendlyDateLabel(reveal.archivedAt || reveal.revealedAt || reveal.updatedAt)} · Blind Reveal`,
    title: reveal.prompt || "Closed Blind Reveal",
    body: "Both answers can be reopened.",
    action: "View",
    tone: "locked",
    actionGlow: hasTwoAnswers,
    dismissOnViewRevealId: reveal.id,
  };
}

function kinkResponseHandoff({
  id,
  href,
  count,
  actorName,
  mode,
}: {
  id: string;
  href: string;
  count: number;
  actorName: string;
  mode: "needs-me" | "waiting-partner";
}): HandoffItem {
  if (mode === "needs-me") {
    return {
      id,
      href,
      eyebrow: `${actorName} shared ${count} kink${count === 1 ? "" : "s"}`,
      title: "Review kink responses",
      body: count === 1 ? "One quick reaction is waiting." : `${count} quick reactions are waiting.`,
      action: count === 1 ? "Review" : `Review ${count}`,
    };
  }
  return {
    id,
    href,
    eyebrow: `You shared ${count} kink${count === 1 ? "" : "s"}`,
    title: count === 1 ? "Waiting on a kink response" : `${count} kinks waiting`,
    body: `Waiting on ${actorName} to respond.`,
    action: "Open",
  };
}

function sexboardDashboardState(
  requests: RequestRecord[],
  auth: AuthInfo,
  hasActiveGame: boolean,
  pendingKinkResponses: number,
  latestPile?: PileSession,
  latestBlindReveal?: BlindReveal,
): "quiet" | "needs-you" | "active" | "tonight" {
  if (requests.some((request) => isAwaitingFirstReply(request.status) && isFromPartner(request, auth))) return "needs-you";
  if (pendingKinkResponses > 0) return "needs-you";
  if (
    requests.some((request) => (
      isApprovedSexActRequest(request)
        ? currentTimingLabel(request) === "Tonight"
        : !hasPendingRequestCounter(request) && currentTimingLabel(request) === "Tonight"
    ))
    || hasActiveGame
    || latestPile
    || latestBlindReveal
  ) return "tonight";
  if (requests.length) return "active";
  return "quiet";
}

function pulseStateFor(state: "quiet" | "needs-you" | "active" | "tonight"): "quiet" | "pending" | "lit" | "hot" {
  if (state === "needs-you") return "pending";
  if (state === "tonight") return "hot";
  if (state === "active") return "lit";
  return "quiet";
}
