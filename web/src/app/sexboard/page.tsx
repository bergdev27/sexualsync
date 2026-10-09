"use client";

/**
 * Sexboard — home for active Asks.
 *
 * Behavior:
 *  - Pulls /api/sexboard (profile + workspace + ranked board + pile + blind
 *    reveal + presence + activity).
 *  - Routes loading / unauthorized / no-workspace / waiting-on-partner /
 *    ready states into Body (split out to _sexboard-body.tsx).
 *  - Subscribes to live-room events so partner activity refreshes the page.
 */

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import AboutManifesto from "@/components/AboutManifesto";
import { ApiUnauthorizedError, getSexboard, removePileSession } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-dialog";
import { normalizeEmail, partnerOf } from "@/lib/workspace";
import { useLiveRoomReload } from "@/lib/use-live-room";
import { getCachedResource, setCachedResource, useColdStart } from "@/lib/resource-cache";
import { useRecoverOnReconnect } from "@/lib/network-status";
import { useQueuedWrites } from "@/lib/use-queued-writes";
import type { QueuedWritePreview } from "@/lib/offline-queue";
import {
  emailGreetingName,
  emptyFantasy,
  preferredGreetingName,
} from "./_sexboard-helpers";
import { Body } from "./_sexboard-body";
import type { LoadState } from "./_sexboard-types";
import { useMarkActivityRead } from "@/lib/use-mark-activity-read";
import type { RequestBoardResponse } from "@/lib/types";
import { readVoice, voiced } from "@/lib/desire-voice";
import "./sexboard.css";

// Read-your-writes shim for Cloudflare KV's eventual consistency. mutateKey
// writes go through the CAS Durable Object, but reads hit KV directly (see
// functions/api/_state.js), which can serve a stale value for ~60s after a
// write. So an Ask you JUST sent can be missing from this fresh /api/sexboard
// read and the optimistic Sexboard entry would get clobbered until KV catches up
// (or a PWA restart). This re-adds your own very-recent requests that the server
// has NO record of yet (not in active OR history) — once the server knows the
// Ask at all (even as reviewed history), we defer to the server, so a quick
// review can't be re-shown as pending.
const ASK_KV_LAG_MS = 90_000;
function mergeRecentlySentAsks(
  serverBoard: RequestBoardResponse,
  priorBoard: RequestBoardResponse | undefined,
  myEmail: string,
): RequestBoardResponse {
  if (!priorBoard) return serverBoard;
  const me = normalizeEmail(myEmail);
  const cutoff = Date.now() - ASK_KV_LAG_MS;
  const known = new Set(
    [...(serverBoard.requests || []), ...(serverBoard.activeRequests || []), ...(serverBoard.history || [])]
      .map((r) => r.id),
  );
  const recentMine = (priorBoard.activeRequests || []).filter((r) =>
    r?.id
    && !known.has(r.id)
    && normalizeEmail(r.requesterEmail) === me
    && new Date(r.createdAt || r.sentAt || 0).getTime() > cutoff,
  );
  if (!recentMine.length) return serverBoard;
  return {
    ...serverBoard,
    requests: [...recentMine, ...(serverBoard.requests || [])],
    activeRequests: [...recentMine, ...(serverBoard.activeRequests || [])],
  };
}

const VIEWED_LOCKED_PILE_SESSION_KEY_PREFIX = "ss:sexboard:viewed-locked-pile-sessions:";
const VIEWED_LOCKED_BLIND_REVEAL_KEY_PREFIX = "ss:sexboard:viewed-locked-blind-reveals:";

function viewedLockedPileSessionKey(workspaceId: string) {
  return `${VIEWED_LOCKED_PILE_SESSION_KEY_PREFIX}${workspaceId}`;
}

function viewedLockedBlindRevealKey(workspaceId: string) {
  return `${VIEWED_LOCKED_BLIND_REVEAL_KEY_PREFIX}${workspaceId}`;
}

const NO_QUEUED: QueuedWritePreview[] = [];

function readViewedIds(storageKey: string): Set<string> {
  if (typeof window === "undefined" || !storageKey) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberViewedId(storageKey: string, id: string): Set<string> {
  const ids = readViewedIds(storageKey);
  ids.add(id);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Soft preference only; memory/cache state still hides it for this visit.
  }
  return ids;
}

export default function SexboardPage() {
  // Seed from the last in-memory snapshot so a revisit paints instantly while
  // reload() revalidates in the background, instead of re-paying the ~400ms
  // cold-KV /api/sexboard wait. Memory-only; cleared on sign-out.
  const cachedSexboard = getCachedResource<LoadState>("sexboard");
  const cachedWorkspaceId = cachedSexboard?.kind === "ready" ? cachedSexboard.workspace.id : "";
  const [state, setState] = useState<LoadState>(() => cachedSexboard ?? { kind: "loading" });
  useColdStart("sexboard", setState);
  const [removingPileSessionId, setRemovingPileSessionId] = useState("");
  const [viewedLockedPileSessionIds, setViewedLockedPileSessionIds] = useState<Set<string>>(() => readViewedIds(viewedLockedPileSessionKey(cachedWorkspaceId)));
  const [viewedLockedBlindRevealIds, setViewedLockedBlindRevealIds] = useState<Set<string>>(() => readViewedIds(viewedLockedBlindRevealKey(cachedWorkspaceId)));

  async function reload() {
    const profile = await getSexboard();
    if (!profile.activeWorkspace) {
      setViewedLockedPileSessionIds(new Set());
      setViewedLockedBlindRevealIds(new Set());
      setState({ kind: "no-workspace", auth: profile.auth, pendingInvites: profile.pendingInvites || [] });
      return;
    }
    setViewedLockedPileSessionIds(readViewedIds(viewedLockedPileSessionKey(profile.activeWorkspace.id)));
    setViewedLockedBlindRevealIds(readViewedIds(viewedLockedBlindRevealKey(profile.activeWorkspace.id)));
    // Preserve an Ask you just sent if this (possibly stale) KV read hasn't
    // caught up yet — keyed off the latest snapshot we rendered.
    const priorSnapshot = getCachedResource<LoadState>("sexboard");
    const priorBoard = priorSnapshot?.kind === "ready" ? priorSnapshot.board : undefined;
    const ready: LoadState = {
      kind: "ready",
      auth: profile.auth,
      profile: profile.profile,
      workspace: profile.activeWorkspace,
      pendingInvites: profile.pendingInvites || [],
      board: mergeRecentlySentAsks(profile.sexboard.board, priorBoard, profile.auth.email),
      pile: profile.sexboard.pile,
      pileSessions: profile.sexboard.pileSessions || [],
      blindReveal: profile.sexboard.blindReveal,
      blindReveals: profile.sexboard.blindReveals || [],
      fantasy: profile.sexboard.fantasy || emptyFantasy(profile.sexboard.workspaceId),
      presence: profile.sexboard.presence,
      activity: profile.sexboard.activity,
      sexQuiz: profile.sexboard.sexQuiz ?? null,
      greenLights: profile.sexboard.greenLights ?? null,
    };
    setState(ready);
    setCachedResource("sexboard", ready);
  }

  async function removeLockedPileSession(sessionId: string) {
    if (state.kind !== "ready" || !sessionId || removingPileSessionId) return;
    const confirmed = await confirmAction({
      title: "Remove this locked Pile?",
      body: "It leaves tonight and Health for both of you.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setRemovingPileSessionId(sessionId);
    try {
      const result = await removePileSession({ workspaceId: state.workspace.id, sessionId });
      setState((current) => current.kind === "ready"
        ? {
            ...current,
            pile: result.pile ?? null,
            pileSessions: result.sessions || current.pileSessions.filter((session) => session.id !== sessionId),
          }
        : current);
    } finally {
      setRemovingPileSessionId("");
    }
  }

  function viewLockedPileSession(sessionId: string) {
    if (state.kind !== "ready" || !sessionId) return;
    setViewedLockedPileSessionIds(rememberViewedId(viewedLockedPileSessionKey(state.workspace.id), sessionId));
    const cached = getCachedResource<LoadState>("sexboard");
    if (cached?.kind === "ready") {
      setCachedResource("sexboard", {
        ...cached,
        pileSessions: cached.pileSessions.filter((session) => session.id !== sessionId),
      });
    }
    setState((current) => {
      if (current.kind !== "ready") return current;
      const next = {
        ...current,
        pileSessions: current.pileSessions.filter((session) => session.id !== sessionId),
      };
      setCachedResource("sexboard", next);
      return next;
    });
  }

  function hideBlindRevealFromSexboard(current: Extract<LoadState, { kind: "ready" }>, revealId: string): Extract<LoadState, { kind: "ready" }> {
    return {
      ...current,
      blindReveal: current.blindReveal?.id === revealId && current.blindReveal.status === "revealed"
        ? null
        : current.blindReveal,
      blindReveals: current.blindReveals.filter((reveal) => reveal.id !== revealId),
    };
  }

  function viewLockedBlindReveal(revealId: string) {
    if (state.kind !== "ready" || !revealId) return;
    setViewedLockedBlindRevealIds(rememberViewedId(viewedLockedBlindRevealKey(state.workspace.id), revealId));
    const cached = getCachedResource<LoadState>("sexboard");
    if (cached?.kind === "ready") setCachedResource("sexboard", hideBlindRevealFromSexboard(cached, revealId));
    setState((current) => {
      if (current.kind !== "ready") return current;
      const next = hideBlindRevealFromSexboard(current, revealId);
      setCachedResource("sexboard", next);
      return next;
    });
  }

  // A failed load never dead-ends: a board already on screen (memory or cold
  // snapshot) stays put, otherwise the error state offers Try again. Either
  // way the load re-runs on reconnect / return to the foreground.
  const mountedRef = useRef(true);
  const [loadFailed, setLoadFailed] = useState(false);
  async function load() {
    try {
      await reload();
      if (mountedRef.current) setLoadFailed(false);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ApiUnauthorizedError) {
        setState({ kind: "unauthorized" });
        return;
      }
      setLoadFailed(true);
      setState((current) => (current.kind === "ready" || current.kind === "no-workspace"
        ? current
        : {
            kind: "error",
            message: error instanceof Error ? error.message : "",
            error,
          }));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
    // Mount-only: load() reads fresh state through setState updaters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRecoverOnReconnect(load, loadFailed && state.kind !== "error");

  // Asks sent while offline wait in the offline queue; show them as
  // "Waiting to send" and refresh the board once the queue drains.
  const queuedAsks = useQueuedWrites("ask:create") ?? NO_QUEUED;
  const queuedCountRef = useRef(queuedAsks.length);
  useEffect(() => {
    const previous = queuedCountRef.current;
    queuedCountRef.current = queuedAsks.length;
    if (queuedAsks.length < previous) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedAsks.length]);

  useLiveRoomReload({
    workspaceId: state.kind === "ready" ? state.workspace.id : "",
    actorEmail: state.kind === "ready" ? state.auth.email : "",
    resources: ["request-board", "fantasy-backlog", "shelf", "pile", "blind-reveals", "sex-quiz", "green-lights", "presence"],
    onReload: reload,
  });

  // Home shows its own activity feed, so opening it reads what the Home tab
  // badge was counting, the way opening Play's games clears theirs.
  const homeWorkspaceId = state.kind === "ready" ? state.workspace.id : "";
  useMarkActivityRead({ workspaceId: homeWorkspaceId, resource: "request-board", enabled: Boolean(homeWorkspaceId) });
  useMarkActivityRead({ workspaceId: homeWorkspaceId, resource: "mood", enabled: Boolean(homeWorkspaceId) });

  const subtitle = subtitleFor(state);

  return (
    <AppShell>
      <ScreenHeader
        eyebrow={greeting(state)}
        showBrand={false}
        title="Sexboard"
        subtitle={subtitle}
        trailing={<AboutManifesto />}
      />
      <div className="sexboard-stage">
        <Body
          state={state}
          queuedAsks={queuedAsks}
          onRetry={load}
          removingPileSessionId={removingPileSessionId}
          viewedLockedPileSessionIds={viewedLockedPileSessionIds}
          viewedLockedBlindRevealIds={viewedLockedBlindRevealIds}
          onRemoveLockedPile={removeLockedPileSession}
          onViewLockedPile={viewLockedPileSession}
          onViewLockedBlindReveal={viewLockedBlindReveal}
        />
      </div>
    </AppShell>
  );
}

// Follows this person's own explicit-language setting (lib/desire-voice.ts).
function greeting(state: LoadState) {
  if (state.kind !== "ready") return undefined;
  const voice = readVoice(state.profile?.settings?.explicitVoice);
  const me = state.workspace.members.find((member) => normalizeEmail(member.email) === normalizeEmail(state.auth.email));
  const name = preferredGreetingName(
    state.profile?.displayName,
    me?.displayName,
    state.presence?.me?.displayName,
    state.auth.person,
    emailGreetingName(state.auth.email),
  );
  return voiced(voice, {
    gentle: `Hi, ${name}`,
    standard: `Hi, ${name}`,
    filthy: `Hey, dirty ${name}`,
  });
}

function subtitleFor(state: LoadState) {
  // Hold the subtitle's space while loading so the header doesn't grow
  // under the first paint when the real line arrives.
  if (state.kind === "loading") return <span className="sexboard-subtitle-reserve" aria-hidden="true" />;
  if (state.kind !== "ready") return undefined;
  const partner = partnerOf(state.workspace, state.auth.email);
  const partnerName = partner?.displayName?.split(" ")[0] || "your partner";
  return `Your private dashboard for sex with ${partnerName}.`;
}
