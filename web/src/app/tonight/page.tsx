"use client";

/**
 * Tonight — the dashboard (brief screen 6).
 *
 * Behavior:
 *  - Pulls /api/profile (for me + active workspace) and /api/request-board.
 *  - Groups active items by timing bucket. Pending-from-partner is the
 *    top-rank card per the brief.
 *  - Empty state copy is gentle, not pitchy.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, ErrorState, SkeletonList } from "@/components/States";
import Reveal from "@/components/Reveal";
import {
  ApiUnauthorizedError,
  getRequestBoard,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { lastRequestEventAt } from "@/lib/activity";
import type {
  AuthInfo,
  ProfileResponse,
  RequestBoardResponse,
  RequestRecord,
  Workspace,
} from "@/lib/types";
import {
  TIMING_BUCKETS,
  groupByTiming,
  isFromPartner,
  rankActive,
} from "@/lib/workspace";
import { currentTimingLabel, isApprovedSexActRequest, isApprovedSexActStale, isAwaitingFirstReply, isStalePendingAsk, askStatusLabel } from "@/lib/request-state";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "no-workspace"; auth: AuthInfo }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      board: RequestBoardResponse;
    };

export default function TonightPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  async function load(isCancelled: () => boolean = () => false) {
    setState({ kind: "loading" });
    try {
      const profile: ProfileResponse = await getProfileCached();
      if (isCancelled()) return;
      if (!profile.activeWorkspace) {
        setState({ kind: "no-workspace", auth: profile.auth });
        return;
      }
      const board = await getRequestBoard(profile.activeWorkspace.id);
      if (isCancelled()) return;
      setState({
        kind: "ready",
        auth: profile.auth,
        workspace: profile.activeWorkspace,
        board,
      });
    } catch (error) {
      if (isCancelled()) return;
      if (error instanceof ApiUnauthorizedError) {
        setState({ kind: "unauthorized" });
        return;
      }
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went sideways.",
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => void load(() => cancelled), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <AppShell>
      {/* A drill-down under Home: chevron + parent, like every other one. No
          sticky "Ask" here: the tab bar's raised Ask is the one rose action. */}
      <ScreenHeader
        back={{ href: "/sexboard", label: "Home" }}
        showBrand={false}
        title="Tonight"
        subtitle={subtitleFor(state)}
      />
      <Body state={state} onReload={load} />
    </AppShell>
  );
}

// ---------- helpers ----------

function subtitleFor(state: LoadState) {
  if (state.kind !== "ready") return undefined;
  const total = state.board.activeRequests.length;
  if (total === 0) return "Nothing on the board.";
  if (total === 1) return "One thing on the board.";
  return `${total} things on the board.`;
}

// ---------- body ----------

function Body({ state, onReload }: { state: LoadState; onReload: () => Promise<void> }) {
  if (state.kind === "loading") return <SkeletonList count={3} />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Session expired"
        body="Sign in again to see what's on tonight."
        action={
          <Link href="/" className="btn-ghost">Back to sign-in</Link>
        }
      />
    );
  }
  if (state.kind === "error") {
    return (
      <ErrorState
        title="Couldn't load your room"
        body={state.message || "Something went sideways. Try again."}
        action={<button type="button" className="btn-ghost" onClick={() => { void onReload(); }}>Try again</button>}
      />
    );
  }
  if (state.kind === "no-workspace") {
    return (
      <EmptyState
        title="Set up your room"
        body="You're signed in, but you don't have a partner-paired room yet."
        action={<Link href="/onboarding" className="btn-ghost">Create my room</Link>}
      />
    );
  }

  return <TonightBoard state={state} />;
}

function TonightBoard({
  state,
}: {
  state: Extract<LoadState, { kind: "ready" }>;
}) {
  // Drop Asks whose scheduled window has passed — agreed acts AND still-pending
  // Asks the partner never answered — so a "tonight" Ask doesn't linger here into
  // the next day (the server pads room-encrypted expiry to ~7 days). Mirrors the
  // Sexboard filter.
  const ranked = rankActive(state.board.activeRequests, state.auth)
    .filter((request) => !(
      (isApprovedSexActRequest(request) && isApprovedSexActStale(request))
      || isStalePendingAsk(request)
    ));
  if (ranked.length === 0) {
    return (
      <EmptyState
        title="Quiet board."
        body="Nothing scheduled, nothing pending. When something feels right, ask."
        action={<Link href="/ask" className="btn-ghost">Compose a request</Link>}
      />
    );
  }

  // Top-rank: pending from partner. The brief calls this out explicitly —
  // it should outrank everything else.
  const topRank = ranked.filter((r) => isAwaitingFirstReply(r.status) && isFromPartner(r, state.auth));
  const remaining = ranked.filter((r) => !(isAwaitingFirstReply(r.status) && isFromPartner(r, state.auth)));
  const grouped = groupByTiming(remaining);

  return (
    <div className="space-y-2 pb-4">
      {topRank.length > 0 && (
        <section className="px-5 pt-2">
          <h2 className="kicker mb-2 text-rose">
            From {topRank[0].requesterName || topRank[0].requester}
          </h2>
          <div className="space-y-2">
            {topRank.map((req) => (
              <Reveal key={req.id}>
                <RequestCard request={req} me={state.auth} topRank />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {TIMING_BUCKETS.map((bucket) => {
        const items = grouped[bucket.key];
        if (!items.length) return null;
        return (
          <section key={bucket.key} className="px-5 pt-3">
            <h2 className="kicker mb-2 text-ink-2">{bucket.label}</h2>
            <div className="space-y-2">
              {items.map((req) => (
                <Reveal key={req.id}>
                  <RequestCard request={req} me={state.auth} />
                </Reveal>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RequestCard({
  request,
  me,
  topRank = false,
}: {
  request: RequestRecord;
  me: AuthInfo;
  topRank?: boolean;
}) {
  const fromPartner = isFromPartner(request, me);
  const author = fromPartner ? (request.requesterName || request.requester) : "You";

  return (
    <Link
      href={`/ask-detail?id=${encodeURIComponent(request.id)}`}
      className={[
        "card pressable block p-4",
        topRank ? "ring-2 ring-rose/50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span>{author}</span>
        <span aria-hidden>·</span>
        <span>{currentTimingLabel(request)}</span>
        <span aria-hidden>·</span>
        <span>{askStatusLabel(request, { mine: !fromPartner, partnerName: fromPartner ? author : (request.reviewerName || request.reviewer || "your partner") }).label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {request.categories.length === 0 && (
          <span className="text-sm italic text-ink-2">(no items)</span>
        )}
        {request.categories.slice(0, 6).map((cat) => (
          <span key={cat} className="chip">{cat}</span>
        ))}
        {request.categories.length > 6 && (
          <span className="chip">+{request.categories.length - 6}</span>
        )}
      </div>
      {request.note && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-2">{request.note}</p>
      )}
      {request.filming === "Yes" && (
        <p className="mt-3 text-xs text-gold">Filming requested</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-ink-3">
          {formatWhen(lastRequestEventAt(request))}
        </span>
        <span className="text-xs text-ink-3" aria-hidden="true">
          {topRank ? "Open" : request.status === "on_deck" ? "View" : "Open"} ›
        </span>
      </div>
    </Link>
  );
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
