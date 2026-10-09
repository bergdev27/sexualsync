"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import AskReplyCard, { type PassExtra, type ReplyDecisionPayload, type ReplyKind } from "@/components/AskReplyCard";
import AskSummaryCard from "@/components/AskSummaryCard";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, ErrorState, LoadErrorState, SkeletonList } from "@/components/States";
import { combineBuiltInAndSavedActs } from "@/lib/built-in-acts";
import { mutualAskHref } from "@/lib/activity";
import { announce } from "@/lib/announce";
import { confirmAction } from "@/lib/confirm-dialog";
import { passReassuranceFor } from "@/lib/pass-reassurance";
import { planLabel, planPhrase } from "@/lib/plan-time";
import { activePlanDate, currentTimingLabel, isApprovedSexActRequest, isWithdrawnRequest, requestCounterItems, timingCopyForRequest } from "@/lib/request-state";
import {
  ApiOfflineQueuedError,
  ApiUnauthorizedError,
  createAct,
  getActs,
  getRequestBoard,
  maybeAsk,
  remindAsk,
  replyToRequest,
  updateRequestAction,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { hasUnlockedRoomE2eeKey, restoreRoomE2eeSession, setRoomE2eeEnabled } from "@/lib/room-crypto";
import { useLiveRoomReload } from "@/lib/use-live-room";
import { useDayRollover } from "@/lib/use-day-rollover";
import { useNow } from "@/lib/use-now";
import "../ask-reply.css";
import type {
  Act,
  AuthInfo,
  ProfileResponse,
  RequestBoardResponse,
  RequestRecord,
  Workspace,
} from "@/lib/types";

type RequestAction = "revoke" | "accept_counter" | "archive" | "withdraw" | "restore";
type BusyAction = RequestAction | "remind";
type ReplyResultState = { kind: ReplyKind; queued: boolean; extra?: PassExtra };

// Mirrors the server's one-nudge rule (functions/api/request-board.js
// REMIND_AVAILABLE_AFTER_MS): the nudge opens a few hours after sending.
const REMIND_AVAILABLE_AFTER_MS = 4 * 60 * 60 * 1000;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; error?: unknown }
  | { kind: "unauthorized" }
  | { kind: "no-workspace" }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      board: RequestBoardResponse;
      acts: Act[];
    };

export default function AskDetailPage() {
  return (
    <Suspense fallback={<DetailShell><SkeletonList count={4} /></DetailShell>}>
      <AskDetail />
    </Suspense>
  );
}

function AskDetail() {
  const params = useSearchParams();
  const router = useRouter();
  const requestId = params.get("id") || "";
  const highlightedFromActivity = params.get("activity") === "1";
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Set once this screen sends a reply: the calm confirmation that replaces
  // the reply card (a mutual yes hands off to /mutual instead).
  const [replyResult, setReplyResult] = useState<ReplyResultState | null>(null);
  // Cheap guard so a live-room push doesn't refetch while a reload it
  // triggered is still in flight (useLiveRoomReload also debounces, but a
  // visibility flip can race with it).
  const reloadInFlight = useRef(false);

  // Fetch profile + board + acts and re-derive the ready state. `signal` only
  // gates our own setState calls below — it is deliberately NOT forwarded to
  // getProfileCached, whose in-flight promise is shared across consumers:
  // aborting it (on unmount, or a StrictMode/fast remount) would also reject
  // the fetch for whoever else joined that same promise. The board/acts
  // endpoints don't accept a signal either, so callers must still drop
  // superseded results themselves. A re-derive over a ready state replaces it
  // in place so a live push doesn't flash the loading skeleton.
  const load = useCallback(async (signal?: AbortSignal) => {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    try {
      const profile: ProfileResponse = await getProfileCached();
      if (signal?.aborted) return;
      if (!profile.activeWorkspace) {
        setState({ kind: "no-workspace" });
        return;
      }
      const [board, actsRes] = await Promise.all([
        getRequestBoard(profile.activeWorkspace.id),
        getActs(profile.activeWorkspace.id),
      ]);
      if (signal?.aborted) return;
      const workspace = profile.activeWorkspace;
      setState({
        kind: "ready",
        auth: profile.auth,
        workspace,
        board,
        acts: combineBuiltInAndSavedActs(actsRes.acts, workspace.id),
      });
    } finally {
      reloadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await load(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState({ kind: "error", message: error instanceof Error ? error.message : "", error });
      }
    })();
    return () => {
      controller.abort();
      // A StrictMode (or any fast) remount tears this mount down mid-load and
      // aborts above. Release the in-flight guard too — otherwise the
      // remount's load bails on a flag the aborted run never reached its
      // finally to clear, stranding the page on its loading skeleton.
      reloadInFlight.current = false;
    };
  }, [load]);

  // H7: surface incoming counters/replies live. The reply surface lives here,
  // so a partner's counter or reply must appear without a manual refresh. We
  // re-fetch + re-derive on a request-board push, and add a visibilitychange
  // floor so returning to a backgrounded tab also resyncs (the socket may
  // have dropped while hidden).
  const onLiveReload = useCallback(() => {
    if (state.kind !== "ready") return;
    load().catch(() => {});
  }, [load, state.kind]);

  useLiveRoomReload({
    workspaceId: state.kind === "ready" ? state.workspace.id : undefined,
    actorEmail: state.kind === "ready" ? state.auth.email : undefined,
    resources: ["request-board"],
    onReload: onLiveReload,
  });

  useEffect(() => {
    if (state.kind !== "ready") return;
    function onVisibility() {
      if (document.visibilityState === "visible") onLiveReload();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state.kind, onLiveReload]);

  // H6: retry wired into the error state (LoadErrorState also calls it on
  // reconnect / return to the foreground). Re-runs the same load + error
  // mapping as the initial mount; the card shows its own busy state, so no
  // flash back to the skeleton.
  const retryLoad = useCallback(async () => {
    try {
      await load();
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) {
        setState({ kind: "unauthorized" });
        return;
      }
      setState({ kind: "error", message: error instanceof Error ? error.message : "", error });
    }
  }, [load]);

  async function runAction(action: RequestAction) {
    if (state.kind !== "ready" || !requestId) return;
    // Same confirm as the match moment: taking back a yes is free, but never
    // a stray tap.
    if (action === "withdraw") {
      const confirmed = await confirmAction({
        title: "Change of plans?",
        body: "It comes off the Sexboard for both of you. No reason needed, and nothing is counted.",
        confirmLabel: "Change plans",
        cancelLabel: "Keep it",
      });
      if (!confirmed) return;
    }
    setBusyAction(action);
    setActionError(null);
    try {
      const result = await updateRequestAction({
        workspaceId: state.workspace.id,
        id: requestId,
        action,
      });
      if (result.revoked) {
        router.push("/sexboard");
        return;
      }
      if (action === "accept_counter") {
        router.push(mutualAskHref(
          result.request?.id || requestId,
          result.request?.categories || [],
          result.request?.matchNarration || "",
        ));
        return;
      }
      if (action === "withdraw") {
        announce("Change of plans. It's off the Sexboard for both of you.");
        router.push("/sexboard");
        return;
      }
      setState({
        ...state,
        board: {
          workspaceId: result.workspaceId,
          requests: result.requests,
          activeRequests: result.activeRequests,
          history: result.history,
        },
      });
      if (navigator.vibrate) navigator.vibrate(6);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Couldn't update this Ask.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runRemind() {
    if (state.kind !== "ready" || !requestId) return;
    setBusyAction("remind");
    setActionError(null);
    try {
      const result = await remindAsk({ workspaceId: state.workspace.id, id: requestId });
      setState({
        ...state,
        board: {
          workspaceId: result.workspaceId,
          requests: result.requests,
          activeRequests: result.activeRequests,
          history: result.history,
        },
      });
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (error) {
      // A too-soon tap comes back as a cooldown error — surface its gentle copy.
      setActionError(error instanceof Error ? error.message : "Couldn't send the reminder.");
    } finally {
      setBusyAction(null);
    }
  }

  // Throws on failure so the reply card can show the error and stay put. A
  // write that lands in the offline queue counts as sent: the card hands over
  // to the result state with an optimistic copy of the answer.
  async function runMaybe() {
    if (state.kind !== "ready" || !requestId) return;
    const current = state;
    try {
      const result = await maybeAsk({ workspaceId: current.workspace.id, id: requestId });
      setState({
        ...current,
        board: {
          workspaceId: result.workspaceId,
          requests: result.requests,
          activeRequests: result.activeRequests,
          history: result.history,
        },
      });
      setReplyResult({ kind: "maybe", queued: false });
      if (navigator.vibrate) navigator.vibrate(6);
    } catch (error) {
      if (error instanceof ApiOfflineQueuedError) {
        setState(withLocalRequest(current, requestId, { status: "maybe", maybeAt: new Date().toISOString() }));
        setReplyResult({ kind: "maybe", queued: true });
        return;
      }
      throw new Error(error instanceof Error && error.message ? error.message : "Couldn't save your maybe.");
    }
  }

  async function runReply(decisions: ReplyDecisionPayload[], note: string, kind: ReplyKind, extra?: PassExtra) {
    if (state.kind !== "ready" || !requestId) return;
    const current = state;
    // Room Encryption: a reply in an E2EE room must be encrypted client-side,
    // which needs the room key unlocked this session. The gate normally
    // guarantees that, but the in-memory key can be dropped (full reload,
    // background relock). Mirror the create flow (ask/page.tsx runSend): re-
    // check, try to restore the session, and re-arm the passphrase gate —
    // otherwise the server silently 400s the reply and the user dead-ends.
    const requiresE2ee = Boolean(current.workspace.settings?.roomE2eeEnabled);
    if (requiresE2ee && !hasUnlockedRoomE2eeKey(current.workspace.id)) {
      const restored = await restoreRoomE2eeSession(current.workspace.id);
      if (!restored) {
        setRoomE2eeEnabled(current.workspace.id, true);
        throw new Error("Unlock Room Encryption to send this reply.");
      }
    }
    try {
      const result = await replyToRequest({
        workspaceId: current.workspace.id,
        id: requestId,
        decisions,
        note,
        ...(extra?.passNote ? { passNote: extra.passNote } : {}),
        ...(extra?.rainCheckAt ? { rainCheckAt: extra.rainCheckAt } : {}),
      });
      if (navigator.vibrate) navigator.vibrate(8);
      const answered = result.request || result.requests.find((item) => item.id === requestId);
      // A plain yes makes the Ask agreed: hand off to the match moment, the
      // same place the Sexboard routes an agreed Ask.
      if (kind === "yes" && answered && isApprovedSexActRequest(answered)) {
        router.push(mutualAskHref(answered.id, answered.categories || [], answered.matchNarration || ""));
        return;
      }
      setState({
        ...current,
        board: {
          workspaceId: result.workspaceId,
          requests: result.requests,
          activeRequests: result.activeRequests,
          history: result.history,
        },
      });
      setReplyResult({ kind, queued: false, extra });
    } catch (error) {
      if (error instanceof ApiOfflineQueuedError) {
        const now = new Date().toISOString();
        setState(withLocalRequest(current, requestId, {
          status: "reviewed",
          decisions: decisions.map((item) => ({
            label: item.label,
            decision: item.decision,
            counter: item.counter || "",
            counterActId: item.counterActId || "",
            note: item.note || "",
            targetType: item.targetType || "act",
            actId: item.actId || "",
          })),
          counters: [],
          feedback: note,
          reviewedAt: now,
          updatedAt: now,
          ...(extra?.passNote ? { passNote: extra.passNote } : {}),
          ...(extra?.rainCheckAt ? { rainCheckAt: extra.rainCheckAt } : {}),
        }));
        setReplyResult({ kind, queued: true, extra });
        return;
      }
      const message = error instanceof Error ? error.message : "";
      // Backstop: local E2EE state read "unlocked" but the authoritative server
      // setting still required encryption and rejected the reply. Re-arm the
      // gate so the user can unlock and resend instead of stranding the reply.
      if (/room encryption requires encrypted/i.test(message)) {
        setRoomE2eeEnabled(current.workspace.id, true);
        throw new Error("Unlock Room Encryption, then send your reply again.");
      }
      throw new Error(message || "Couldn't send this reply.");
    }
  }

  async function runCreateCounterAct(label: string) {
    if (state.kind !== "ready") throw new Error("This Ask is not ready yet.");
    const result = await createAct({
      workspaceId: state.workspace.id,
      label,
      myComfort: "curious",
    });
    setState({
      ...state,
      acts: combineBuiltInAndSavedActs(result.acts, state.workspace.id),
    });
    return result.act;
  }

  if (state.kind === "loading") return <DetailShell><SkeletonList count={4} /></DetailShell>;
  if (state.kind === "unauthorized") {
    return (
      <DetailShell>
        <ErrorState
          title="Session expired"
          body="Sign in again to open this Ask."
          action={<Link href="/" className="btn-ghost">Back to sign-in</Link>}
        />
      </DetailShell>
    );
  }
  if (state.kind === "no-workspace") {
    return (
      <DetailShell>
        <ErrorState
          title="No partner space yet"
          body="Asks are scoped to a shared room."
          action={<Link href="/space" className="btn-ghost">Open Us</Link>}
        />
      </DetailShell>
    );
  }
  if (state.kind === "error") {
    return (
      <DetailShell>
        <LoadErrorState what="this Ask" error={state.error ?? state.message} onRetry={retryLoad} />
      </DetailShell>
    );
  }

  const request = state.board.requests.find((item) => item.id === requestId);
  if (!request) {
    return (
      <DetailShell>
        <EmptyState
          title="Ask not found"
          body="It may have been revoked, archived, or expired."
          action={<Link href="/sexboard" className="btn-ghost">Back to Sexboard</Link>}
        />
      </DetailShell>
    );
  }

  return (
    <DetailShell focused>
      <RequestDetail
        request={request}
        me={state.auth}
        acts={state.acts}
        busyAction={busyAction}
        actionError={actionError}
        replyResult={replyResult}
        onClearResult={() => setReplyResult(null)}
        onAction={runAction}
        onRemind={runRemind}
        onReply={runReply}
        onMaybe={runMaybe}
        onCreateCounterAct={runCreateCounterAct}
        highlightedFromActivity={highlightedFromActivity}
      />
    </DetailShell>
  );
}

type ReadyState = Extract<LoadState, { kind: "ready" }>;

// Replace one Ask in a ready state with a locally patched copy (used when a
// reply is waiting in the offline queue and the server hasn't echoed it yet).
function withLocalRequest(current: ReadyState, id: string, patch: Partial<RequestRecord>): ReadyState {
  const patchOne = (item: RequestRecord) => (item.id === id ? { ...item, ...patch } : item);
  return {
    ...current,
    board: {
      ...current.board,
      requests: current.board.requests.map(patchOne),
      activeRequests: current.board.activeRequests.map(patchOne),
      history: current.board.history.map(patchOne),
    },
  };
}

function DetailShell({
  children,
  title = "Ask details",
  focused = false,
}: {
  children: React.ReactNode;
  title?: string;
  // The Ask itself is on screen: its card carries the page heading, so the
  // shell drops its own title and wordmark.
  focused?: boolean;
}) {
  return (
    <AppShell>
      <ScreenHeader
        back={{ href: "/sexboard", label: "Sexboard" }}
        showBrand={false}
        title={focused ? undefined : title}
      />
      {children}
    </AppShell>
  );
}

const RESULT_COPY: Record<ReplyKind, { title: string; body: (partner: string, timing: string, extra?: PassExtra) => string }> = {
  yes: { title: "Yes sent.", body: (partner) => `${partner} will see it next time they look.` },
  // A pass is free (research rec #2): no reason owed, and the asker hears it
  // warmly, with the words you picked if you picked any.
  pass: {
    title: "Passed for now.",
    body: (partner, _timing, extra) => {
      const reassurance = passReassuranceFor(extra?.passNote);
      if (!reassurance) return `${partner} sees a kind pass. No reason needed.`;
      const rainAt = extra?.rainCheckAt ? new Date(extra.rainCheckAt) : null;
      if (reassurance.rainCheck && rainAt && !Number.isNaN(rainAt.getTime())) {
        return `${partner} sees “${reassurance.quote}” It comes back to them as a suggestion ${planLabel(rainAt)}.`;
      }
      return `${partner} sees “${reassurance.quote}”`;
    },
  },
  maybe: { title: "Saved as a maybe.", body: (_partner, timing) => `It stays open, and comes back to you closer to ${timing}.` },
  counter: { title: "Counter sent.", body: (partner) => `${partner} can take it or ask again.` },
};

function ReplyResult({
  result,
  partnerName,
  timingCopy,
  onDecideNow,
}: {
  result: ReplyResultState;
  partnerName: string;
  timingCopy: string;
  onDecideNow?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = RESULT_COPY[result.kind];
  const body = result.queued
    ? "Your answer sends as soon as you're back online."
    : copy.body(partnerName, timingCopy, result.extra);
  // Focus lands on the result title (so it is read), and the explanation goes
  // through the app's one polite announcer rather than a second live region.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    announce(body);
  }, [body]);
  return (
    <section className="reply-result" data-testid="ask-reply-result">
      <h2 ref={headingRef} tabIndex={-1} className="reply-result-title">
        {result.queued ? "Saved offline." : copy.title}
      </h2>
      <p className="reply-result-body">{body}</p>
      <div className="reply-result-actions">
        <Link href="/sexboard" className="cta-primary pressable">Back to Sexboard</Link>
        {onDecideNow && (
          <button type="button" className="btn-ghost w-full" onClick={onDecideNow}>
            Decide now instead
          </button>
        )}
      </div>
    </section>
  );
}

function RequestDetail({
  request,
  me,
  acts,
  busyAction,
  actionError,
  replyResult,
  onClearResult,
  onAction,
  onRemind,
  onReply,
  onMaybe,
  onCreateCounterAct,
  highlightedFromActivity = false,
}: {
  request: RequestRecord;
  me: AuthInfo;
  acts: Act[];
  busyAction: BusyAction | null;
  actionError: string | null;
  replyResult: ReplyResultState | null;
  onClearResult: () => void;
  onAction: (action: RequestAction) => Promise<void>;
  onRemind: () => Promise<void>;
  onReply: (decisions: ReplyDecisionPayload[], note: string, kind: ReplyKind, extra?: PassExtra) => Promise<void>;
  onMaybe: () => Promise<void>;
  onCreateCounterAct: (label: string) => Promise<Act>;
  highlightedFromActivity?: boolean;
}) {
  useDayRollover();
  // Ticks each minute so the one-hour reminder cooldown can lift on screen.
  const now = useNow(60 * 1000);

  const mine = normalize(request.requesterEmail) === normalize(me.email);
  const requesterName = request.requesterName || request.requester || "Partner";
  const reviewerName = request.reviewerName || request.reviewer || "Partner";
  const partnerName = mine ? reviewerName : requesterName;
  const counters = requestCounterItems(request);
  const hasCounter = counters.length > 0;
  // A plan set on the match moment is the real time ("tomorrow, 9 pm").
  const planDate = activePlanDate(request, new Date(now));
  const timingCopy = planDate ? planPhrase(planDate, new Date(now)) : timingCopyForRequest(request);
  // The reply card shows for a first answer (pending/sent) AND to convert an
  // existing maybe ("Decide now"). Deferring itself is only offered on a first
  // answer — you can't re-defer a maybe.
  const awaitingMyReply = !mine && ["pending", "sent", "maybe"].includes(request.status);
  const canDefer = !mine && ["pending", "sent"].includes(request.status);
  const canRevoke = mine && ["draft", "pending", "sent"].includes(request.status);
  const canAcceptCounter = mine
    && hasCounter
    && ["reviewed", "on_deck"].includes(request.status)
    && !request.counterAcceptedAt;
  const canPassAgreed = !awaitingMyReply && isApprovedSexActRequest(request);
  const canArchive = !awaitingMyReply && !canPassAgreed && !["completed", "archived", "expired"].includes(request.status);
  // A change of plans is final for that yes: no Restore, only a fresh Ask
  // (which the re-ask rules and the other partner's own answer still govern).
  const withdrawn = isWithdrawnRequest(request);
  const canRestore = request.status === "archived" && !withdrawn;
  const canAskAgain = withdrawn && (request.categories || []).length > 0;
  // One manual nudge per Ask, ever (research rec #4, anti-nagging): only the
  // requester, only before a first answer (never after a maybe), and only a
  // few hours after sending. Mirrors the server rule.
  const openForNudge = mine && ["pending", "sent"].includes(request.status);
  const lastReminderMs = request.lastReminderAt ? Date.parse(request.lastReminderAt) : 0;
  const nudgeUsed = lastReminderMs > 0;
  const sentMs = Date.parse(request.sentAt || request.createdAt || "") || 0;
  const nudgeOpensAt = sentMs ? sentMs + REMIND_AVAILABLE_AFTER_MS : 0;
  const nudgeTooSoon = nudgeOpensAt > now;
  const remindedAgo = nudgeUsed ? relativeAgo(lastReminderMs) : "";
  const showMaybeNote = mine && request.status === "maybe";
  const askedWhen = formatWhen(request.sentAt || request.createdAt || "");
  const stageClass = `activity-detail-stage ${highlightedFromActivity ? "is-activity-highlight" : ""}`;

  if (awaitingMyReply && !replyResult) {
    return (
      <div
        className={`${stageClass} reply-stage`}
        data-activity-highlight={highlightedFromActivity ? "true" : undefined}
      >
        <AskReplyCard
          partnerName={requesterName}
          kicker={request.status === "maybe"
            ? `Your maybe · from ${requesterName}`
            : `From ${requesterName}${askedWhen ? ` · ${askedWhen}` : ""}`}
          categories={request.categories}
          timing={currentTimingLabel(request)}
          filming={request.filming}
          note={request.note}
          limits={request.boundaryConflicts}
          acts={acts}
          isMaybe={request.status === "maybe"}
          allowMaybe={canDefer}
          onCreateAct={onCreateCounterAct}
          onSubmit={onReply}
          onMaybe={canDefer ? onMaybe : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className={`${stageClass} reply-detail`}
      data-activity-highlight={highlightedFromActivity ? "true" : undefined}
    >
      {replyResult && (
        <ReplyResult
          result={replyResult}
          partnerName={partnerName}
          timingCopy={timingCopy}
          onDecideNow={replyResult.kind === "maybe" && !replyResult.queued && awaitingMyReply ? onClearResult : undefined}
        />
      )}

      <AskSummaryCard
        request={request}
        viewer={mine ? "requester" : "reviewer"}
        partnerName={partnerName}
        when={askedWhen}
        autoFocus={!replyResult}
      />

      {actionError && (
        <p className="reply-error" role="alert">{actionError}</p>
      )}

      {canPassAgreed && (
        <section className="card p-5" style={{ borderColor: "rgb(var(--accent-rgb) / 0.45)" }}>
          <p className="kicker" style={{ color: "var(--accent)" }}>It&rsquo;s on</p>
          <h2 className="mt-2 font-display text-display-md italic leading-tight text-ink">Both of you said yes.</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">This yes is for this Ask, {timingCopy}. If plans change for either of you, that&rsquo;s fine. No reason needed.</p>
          <Link
            href={mutualAskHref(request.id, request.categories || [], request.matchNarration || "")}
            className="btn-primary w-full mt-4"
          >
            See the match
          </Link>
        </section>
      )}

      {showMaybeNote && (
        <section className="reply-remind">
          <p className="reply-remind-copy" data-testid="ask-maybe-note">
            {partnerName} said maybe and will decide closer to {timingCopy}. It stays open, and there&rsquo;s nothing you need to do.
          </p>
        </section>
      )}

      {openForNudge && (
        <section className="reply-remind">
          <p className="reply-remind-copy" data-testid="ask-nudge-copy">
            {nudgeUsed
              ? `You sent your one nudge ${remindedAgo}. The rest is up to ${partnerName}.`
              : nudgeTooSoon
                ? `It’s with ${partnerName}. If it’s still open later, you can send one gentle nudge.`
                : `It’s with ${partnerName}. You can send one gentle nudge: a quiet notification, and only one per Ask.`}
          </p>
          {/* No disabled countdown button: waiting to nudge shouldn't feel like
              a timer. The button only appears once the nudge is available. */}
          {!nudgeUsed && !nudgeTooSoon && (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!!busyAction}
              onClick={onRemind}
              data-testid="ask-action-remind"
            >
              {busyAction === "remind" ? "Sending your nudge…" : `Nudge ${partnerName}`}
            </button>
          )}
        </section>
      )}

      {(canRevoke || canAcceptCounter || canPassAgreed || canArchive || canRestore || canAskAgain) && (
        <section className="reply-actions">
          {canAcceptCounter && (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!!busyAction}
              onClick={() => onAction("accept_counter")}
              data-testid="ask-action-accept-counter"
            >
              {busyAction === "accept_counter" ? "Accepting…" : "Accept counter"}
            </button>
          )}
          {canPassAgreed && (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!!busyAction}
              onClick={() => onAction("withdraw")}
              data-testid="ask-action-withdraw"
            >
              {busyAction === "withdraw" ? "Changing plans…" : "Change of plans"}
            </button>
          )}
          {canRevoke && (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!!busyAction}
              onClick={() => onAction("revoke")}
              data-testid="ask-action-revoke"
            >
              {busyAction === "revoke" ? "Taking it back…" : "Take back this Ask"}
            </button>
          )}
          {canArchive && !canRevoke && (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!!busyAction}
              onClick={() => onAction("archive")}
              data-testid="ask-action-archive"
            >
              {busyAction === "archive" ? "Archiving…" : "Archive"}
            </button>
          )}
          {canRestore && (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!!busyAction}
              onClick={() => onAction("restore")}
              data-testid="ask-action-restore"
            >
              {busyAction === "restore" ? "Restoring…" : "Restore to Sexboard"}
            </button>
          )}
          {canAskAgain && (
            <Link
              href={`/ask?again=${encodeURIComponent(request.id)}`}
              className="btn-ghost w-full"
              data-testid="ask-action-ask-again"
            >
              Ask again
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
}

function relativeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
