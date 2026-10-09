"use client";

/**
 * Ask — the request builder (brief screen 7).
 *
 * Behavior:
 *  - Pulls /api/profile, /api/approved-acts (for the picker), /api/boundaries
 *    (for conflict checks).
 *  - Form: acts multi-select, timing, filming, optional note.
 *  - Inline boundary conflict warnings — hard-no blocks send; talk-first
 *    warns.
 *  - On submit, POST /api/request-board, then route to /sexboard.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import StickyAction from "@/components/StickyAction";
import { announce } from "@/lib/announce";
import { radioGroupKeyDown, radioTabIndex } from "@/lib/radio-group";
import WaitingForPartner from "@/components/WaitingForPartner";
import { SLOW_TOUCH_ACT_HINT, SLOW_TOUCH_ACT_LABEL, combineBuiltInAndSavedActs } from "@/lib/built-in-acts";
import { reaskCooldown } from "@/lib/pass-reassurance";
import { planLabel } from "@/lib/plan-time";
import { ErrorState, SkeletonList } from "@/components/States";
import {
  ApiFailureError,
  ApiOfflineQueuedError,
  ApiUnauthorizedError,
  createAct,
  createRequest,
  getActs,
  getBoundaries,
  getFantasyBacklog,
  getRequestBoard,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import type {
  Act,
  Boundary,
  Filming,
  ProfileResponse,
  Timing,
  Workspace,
  AuthInfo,
  KinkIdea,
  RequestRecord,
} from "@/lib/types";
import { splitActLabel } from "@/lib/act-label";
import { partnerOf } from "@/lib/workspace";
import { getCachedResource, invalidateResource, setCachedResource, useColdStart } from "@/lib/resource-cache";
import { fireSendPulse } from "@/lib/send-pulse";
import { askSeedSourceLabel, consumeAskSeed, matchSeedActs, seededActsFor, seededNote as seedNoteFor, type AskSeed } from "@/lib/ask-seed";
import {
  hasUnlockedRoomE2eeKey,
  restoreRoomE2eeSession,
  setRoomE2eeEnabled,
} from "@/lib/room-crypto";
import "./ask.css";

const TIMINGS: { value: Timing; label: string }[] = [
  { value: "Tonight",   label: "Tonight" },
  { value: "Mid-day",   label: "Mid-day" },
  { value: "Tomorrow",  label: "Tomorrow" },
  { value: "Next week", label: "Next week" },
];

const COLLAPSED_ACT_COUNT = 10;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "no-workspace" }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      acts: Act[];
      boundaries: Boundary[];
      seededKink: KinkIdea | null;
      seededNote: string;
      // The board, for the re-ask cooldown (it has to be checked after
      // decrypting, so the client applies it too) and "Ask again" prefill.
      requests?: RequestRecord[];
      againActIds?: string[];
      againTiming?: Timing;
      // A one-shot handoff from a reveal ("Make it an Ask").
      seed?: AskSeed | null;
    };

export default function AskPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>(() => getCachedResource<LoadState>("ask") ?? { kind: "loading" });
  useColdStart("ask", setState);
  // A reveal handoff is one-shot: never cache it into the next visit.
  useEffect(() => { if (state.kind === "ready") setCachedResource("ask", { ...state, seed: null }); }, [state]);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => {
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        // Only getProfileCached accepts an AbortSignal today. getActs /
        // getBoundaries / getFantasyBacklog don't take one, so they stay
        // guarded by the `cancelled` flag below.
        const profile: ProfileResponse = await getProfileCached({ signal: controller.signal });
        if (cancelled) return;
        if (!profile.activeWorkspace) {
          setState({ kind: "no-workspace" });
          return;
        }
        const [actsRes, boundariesRes, boardRes] = await Promise.all([
          getActs(profile.activeWorkspace.id),
          getBoundaries(profile.activeWorkspace.id),
          // Best effort: without the board the server still applies the
          // cooldown to plaintext Asks.
          getRequestBoard(profile.activeWorkspace.id).catch(() => null),
        ]);
        const query = new URLSearchParams(window.location.search);
        const combinedActs = combineBuiltInAndSavedActs(actsRes.acts, profile.activeWorkspace.id);
        const requests = boardRes?.requests || [];
        // "Ask again" from a rain check: preselect the same Acts.
        const againId = query.get("again") || "";
        const againRequest = againId ? requests.find((item) => item.id === againId) : undefined;
        const againLabels = new Set((againRequest?.categories || []).map((label) => label.toLowerCase()));
        const againActIds = combinedActs.filter((act) => againLabels.has(act.label.toLowerCase())).map((act) => act.id);
        const kinkId = query.get("kink") || "";
        const seededNote = (query.get("note") || "").trim().slice(0, 1800);
        const seed = query.get("seed") === "1" ? consumeAskSeed() : null;
        const seededKink = kinkId
          ? (await getFantasyBacklog(profile.activeWorkspace.id)).ideas.find((kink) => kink.id === kinkId) || null
          : null;
        if (cancelled) return;
        setState({
          kind: "ready",
          auth: profile.auth,
          workspace: profile.activeWorkspace,
          acts: combinedActs,
          boundaries: boundariesRes.boundaries,
          seededKink,
          seededNote,
          requests,
          againActIds,
          againTiming: againRequest?.timing,
          seed,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState({ kind: "error", message: error instanceof Error ? error.message : "Couldn't load." });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  if (state.kind === "loading") {
    return (
      <AppShell>
        <ScreenHeader
          showBrand={false}
          title="Be specific."
          subtitle="What do you want?"
        />
        <SkeletonList count={4} />
      </AppShell>
    );
  }
  if (state.kind === "unauthorized") {
    return (
      <AppShell>
        <ScreenHeader
          showBrand={false}
          title="Be specific."
          subtitle="Sign in again to send a request."
        />
        <ErrorState
          title="Session expired"
          body="Sign in again to send a request."
          action={<Link href="/" className="btn-ghost">Back to sign-in</Link>}
        />
      </AppShell>
    );
  }
  if (state.kind === "no-workspace") {
    return (
      <AppShell>
        <ScreenHeader
          showBrand={false}
          title="Be specific."
          subtitle="You need a paired workspace before you can send an Ask."
        />
        <ErrorState
          title="No partner space yet"
          body="You need a paired workspace before you can send an Ask."
          action={<Link href="/space" className="btn-ghost">Open Us</Link>}
        />
      </AppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <AppShell>
        <ScreenHeader
          showBrand={false}
          title="Be specific."
          subtitle="What do you want?"
        />
        <ErrorState
          title="Couldn't load"
          body={state.message}
          action={<button className="btn-ghost" onClick={reload}>Try again</button>}
        />
      </AppShell>
    );
  }
  // Workspace exists but partner hasn't joined the claimable invite yet —
  // render the shared waiting state instead of a broken AskForm with a
  // permanently disabled Send button.
  if (!hasJoinedPartner(state.workspace, state.auth.email)) {
    return (
      <AppShell>
        <ScreenHeader
          showBrand={false}
          title="Be specific."
          subtitle="One clear ask, no awkward pause."
        />
        <WaitingForPartner workspace={state.workspace} intent="Asking" />
      </AppShell>
    );
  }
  return <AskForm key={state.seed ? "seeded" : "plain"} state={state} router={router} />;
}

function hasJoinedPartner(workspace: Workspace, myEmail: string): boolean {
  const me = (myEmail || "").toLowerCase();
  return (workspace.members || []).some((member) => {
    return member.status === "active" && (member.email || "").toLowerCase() !== me;
  });
}

// ---------- form ----------

function AskForm({
  state,
  router,
}: {
  state: Extract<LoadState, { kind: "ready" }>;
  router: ReturnType<typeof useRouter>;
}) {
  const partner = partnerOf(state.workspace, state.auth.email);
  const partnerFirst = partner?.displayName?.split(" ")[0] || "your partner";

  // A reveal handoff preselects the matched Acts; names with no matching Act
  // (a quiz card, a "lights them up" line) join the grid as Acts for this Ask,
  // picked, so it can be sent straight away. "Ask again" from a rain check
  // preselects the same Acts as before.
  const seedMatch = useMemo(
    () => (state.seed ? matchSeedActs(state.seed.acts, state.acts) : { ids: [] as string[], unmatched: [] as string[] }),
    [state.seed, state.acts],
  );
  const [seededActs] = useState<Act[]>(() => seededActsFor(seedMatch.unmatched, state.workspace.id));
  const [acts, setActs] = useState<Act[]>(() => [...state.acts, ...seededActs]);
  const [selectedActIds, setSelectedActIds] = useState<string[]>(
    () => Array.from(new Set([...(state.againActIds || []), ...seedMatch.ids, ...seededActs.map((act) => act.id)])),
  );
  const [actsExpanded, setActsExpanded] = useState(false);
  // Acts picked from the expanded list that sit outside the starter set. They
  // join the collapsed grid (at the end) only when the list collapses, and
  // stay put even if un-picked, so nothing moves under the finger.
  const [keptActIds, setKeptActIds] = useState<string[]>(() => [...(state.againActIds || []), ...seededActs.map((act) => act.id)]);
  const sendReasonRef = useRef<HTMLParagraphElement | null>(null);
  const [actSearch, setActSearch] = useState("");
  const [actComposerOpen, setActComposerOpen] = useState(false);
  // "Ask again" keeps the original timing; a fresh Ask starts on Tonight.
  const [timing, setTiming] = useState<Timing>(() => state.againTiming || "Tonight");
  const [filming, setFilming] = useState<Filming>("No");
  const [note, setNote] = useState<string>(
    state.seededNote
      || (state.seed ? seedNoteFor(state.seed, []) : "")
      || (state.seededKink ? `Inspired by: ${state.seededKink.text}` : ""),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  // A new acts list from the parent replaces the local one and drops any
  // selection that no longer exists. Adjusting state during render (instead of
  // an effect) avoids a second render with stale acts.
  const [syncedActs, setSyncedActs] = useState(state.acts);
  if (syncedActs !== state.acts) {
    const nextActs = [...state.acts, ...seededActs];
    const availableIds = new Set(nextActs.map((act) => act.id));
    setSyncedActs(state.acts);
    setActs(nextActs);
    setSelectedActIds((prev) => prev.filter((id) => availableIds.has(id)));
  }

  const selectedActs = useMemo(
    () => acts.filter((act) => selectedActIds.includes(act.id)),
    [acts, selectedActIds],
  );

  const filteredActs = useMemo(() => {
    const query = actSearch.trim().toLowerCase();
    if (!query) return acts;
    return acts.filter((act) => act.label.toLowerCase().includes(query) || act.tags?.some((tag) => tag.includes(query)));
  }, [actSearch, acts]);

  const visibleActs = useMemo(() => {
    if (actsExpanded) return filteredActs;
    const starters = acts.slice(0, COLLAPSED_ACT_COUNT);
    const starterIds = new Set(starters.map((act) => act.id));
    const kept = keptActIds
      .filter((id) => !starterIds.has(id))
      .map((id) => acts.find((act) => act.id === id))
      .filter((act): act is Act => Boolean(act));
    return [...starters, ...kept];
  }, [acts, actsExpanded, filteredActs, keptActIds]);

  const hiddenActCount = Math.max(0, acts.length - visibleActs.length);

  // Conflicts inline. Each boundary text gets normalized and compared with
  // the selected act labels by simple substring match — the same rough
  // heuristic the legacy SPA uses, kept here for parity.
  const conflicts = useMemo(() => {
    if (!selectedActIds.length) return { hard: [] as Boundary[], warn: [] as Boundary[] };
    const labels = acts
      .filter((a) => selectedActIds.includes(a.id))
      .map((a) => a.label.toLowerCase());
    const hard: Boundary[] = [];
    const warn: Boundary[] = [];
    for (const boundary of state.boundaries) {
      const text = boundary.text.toLowerCase();
      const matched = labels.some((label) => text.includes(label) || label.includes(text));
      if (!matched) continue;
      if (boundary.type === "Hard No") hard.push(boundary);
      else if (boundary.type === "Talk First" || boundary.type === "Soft Limit") warn.push(boundary);
    }
    return { hard, warn };
  }, [acts, selectedActIds, state.boundaries]);

  // Re-ask cooldown (research rec #4, anti-nagging): the same Acts rest for a
  // week after a pass, or until the rain check the partner offered. Said
  // calmly, as timing, never as an error.
  const cooldown = useMemo(() => {
    if (!partner || !selectedActIds.length) return null;
    const categories = acts.filter((act) => selectedActIds.includes(act.id)).map((act) => act.label);
    return reaskCooldown(state.requests || [], { myEmail: state.auth.email, partnerEmail: partner.email, categories });
  }, [acts, partner, selectedActIds, state.auth.email, state.requests]);
  const slowTouchAct = acts.find((act) => act.label === SLOW_TOUCH_ACT_LABEL) || null;
  const slowTouchPicked = Boolean(slowTouchAct && selectedActIds.includes(slowTouchAct.id));

  const canSubmit = selectedActIds.length > 0 && conflicts.hard.length === 0 && !!partner && !submitting && !cooldown;
  // Why Send is unavailable, in words — shown in the sticky bar and linked to
  // the button with aria-describedby.
  const sendBlockedReason = !partner
    ? "Your partner hasn't joined yet"
    : selectedActIds.length === 0
    ? "Choose at least one Act"
    : conflicts.hard.length > 0
    ? "Remove the Act that hits a hard limit"
    : cooldown
    ? `This one rests until ${planLabel(cooldown.until)}`
    : "";
  const selectionSummary = selectedActIds.length
    ? `${selectedActIds.length} Act${selectedActIds.length === 1 ? "" : "s"} selected · ${timing}`
    : "";

  function collapseActs() {
    const starterIds = new Set(acts.slice(0, COLLAPSED_ACT_COUNT).map((act) => act.id));
    setKeptActIds((prev) => {
      const next = [...prev];
      for (const id of selectedActIds) {
        if (!starterIds.has(id) && !next.includes(id)) next.push(id);
      }
      return next;
    });
    setActsExpanded(false);
  }

  // Send is aria-disabled rather than disabled, so it stays focusable and a
  // tap explains itself instead of doing nothing.
  function explainBlockedSend() {
    if (!sendBlockedReason) return;
    announce(sendBlockedReason);
    const reason = sendReasonRef.current;
    if (reason) {
      reason.classList.remove("is-nudged");
      void reason.offsetWidth;
      reason.classList.add("is-nudged");
    }
  }
  function toggleAct(id: string) {
    setSelectedActIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // The no-goal touch Act, offered as a low-stakes way in.
  function pickSlowTouch() {
    if (!slowTouchAct) return;
    setSelectedActIds((prev) => (prev.includes(slowTouchAct.id) ? prev : [...prev, slowTouchAct.id]));
    setKeptActIds((prev) => (prev.includes(slowTouchAct.id) ? prev : [...prev, slowTouchAct.id]));
  }

  function surpriseMe() {
    const myEmail = state.auth.email.toLowerCase();
    const safe = acts
      .filter((a) => {
        const myComfort = a.comfort?.[myEmail];
        return myComfort === "favorite" || myComfort === "curious";
      })
      .map((a) => a.id);
    const pool = safe.length ? safe : acts.map((a) => a.id);
    // pick up to 2
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
    setSelectedActIds(shuffled);
    if (!actsExpanded) {
      const starterIds = new Set(acts.slice(0, COLLAPSED_ACT_COUNT).map((act) => act.id));
      setKeptActIds((prev) => [...prev, ...shuffled.filter((id) => !starterIds.has(id) && !prev.includes(id))]);
    }
  }

  async function handleCreateAct(label: string) {
    const result = await createAct({
      workspaceId: state.workspace.id,
      label,
      myComfort: "curious",
    });
    setActs([...combineBuiltInAndSavedActs(result.acts, state.workspace.id), ...seededActs]);
    setSelectedActIds((prev) => (
      prev.includes(result.act.id) ? prev : [...prev, result.act.id]
    ));
    // A new Act joins the end of the grid, picked, so it's visible without
    // reshuffling anything already on screen.
    setKeptActIds((prev) => (prev.includes(result.act.id) ? prev : [...prev, result.act.id]));
    setActsExpanded(false);
    setActSearch("");
    setActComposerOpen(false);
    invalidateResource("ask");
    if (navigator.vibrate) navigator.vibrate(4);
  }

  async function submit(originEl?: HTMLElement) {
    if (!partner) return;
    const partnerName = partner.displayName?.split(" ")[0] || "your partner";
    const workspace = state.workspace;
    const requiresE2ee = Boolean(workspace.settings?.roomE2eeEnabled);
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);
    try {
      // Room Encryption: the server rejects a plaintext Ask in an E2EE room
      // (400 "Room Encryption requires encrypted Asks"), so the Ask must be
      // encrypted client-side — which needs the room key unlocked in this
      // session. The unlock gate normally guarantees that, but the in-memory
      // key can be dropped (full reload, background relock) without the gate
      // re-locking the view in time. Re-check here so we never post an Ask
      // that the server silently drops.
      if (requiresE2ee && !hasUnlockedRoomE2eeKey(workspace.id)) {
        const restored = await restoreRoomE2eeSession(workspace.id);
        if (!restored) {
          // Re-arm the gate: setting the local flag emits ss:room-e2ee-change,
          // which makes RoomEncryptionGate show the passphrase overlay.
          setRoomE2eeEnabled(workspace.id, true);
          setSubmitError("Unlock Room Encryption to send this Ask.");
          setSubmitting(false);
          return;
        }
      }

      const selected = acts.filter((a) => selectedActIds.includes(a.id));
      const categories = selected.map((a) => a.label);

      const result = await createRequest({
        workspaceId: state.workspace.id,
        requesterEmail: state.auth.email,
        reviewerEmail: partner.email,
        categories,
        timing,
        filming,
        note: note.trim(),
        boundaryConflicts: conflicts.warn.map((b) => b.text),
        seededFromKinkId: state.seededKink?.id,
      });
      const cachedSexboard = getCachedResource<{ kind: string; board?: unknown }>("sexboard");
      if (cachedSexboard?.kind === "ready") {
        setCachedResource("sexboard", {
          ...cachedSexboard,
          board: {
            ...(typeof cachedSexboard.board === "object" && cachedSexboard.board ? cachedSexboard.board : {}),
            workspaceId: state.workspace.id,
            requests: result.requests,
            activeRequests: result.activeRequests,
            history: result.history,
          },
        });
      }

      // Only celebrate once the Ask has actually landed. Firing the pulse +
      // "It's with X now" before the write resolved meant a rejected send
      // (e.g. Room Encryption locked → 400) still told the user it was sent,
      // while nothing reached the Sexboard. Await the pulse so the confirm
      // moment lands on this calm composer, then navigate — sending it over an
      // immediate route change made it flash and jump to the Sexboard mid-mount.
      await fireSendPulse(originEl, {
        confirm: {
          headline: `It's with ${partnerName} now.`,
          sub: "The Sexboard will update when they respond",
        },
      });
      router.push("/sexboard");
    } catch (error) {
      // Offline: the write was queued locally and will sync when the network
      // returns. Treat it like a success — neutral confirmation, then move on
      // to the Sexboard — instead of the red error treatment below. Land the
      // queued confirmation on this composer first (same pulse as a real
      // send) so it is actually seen; the Sexboard then shows the Ask as
      // "Waiting to send" until the queue flushes.
      if (error instanceof ApiOfflineQueuedError) {
        setSubmitNotice("Queued — sends when you're back online.");
        await fireSendPulse(originEl, {
          confirm: {
            headline: "Queued — sends when you're back online.",
            sub: `It goes to ${partnerName} as soon as you reconnect`,
          },
        });
        router.push("/sexboard");
        return;
      }
      // The server's re-ask cooldown (plaintext Asks): calm timing, not an error.
      const restingUntil = error instanceof ApiFailureError && error.status === 409
        ? String((error.data as { cooldown?: { until?: string } } | null)?.cooldown?.until || "")
        : "";
      if (restingUntil && Number.isFinite(Date.parse(restingUntil))) {
        setSubmitNotice(`${partnerName} passed on this one recently, so it rests until ${planLabel(new Date(restingUntil))}. Something else in the meantime?`);
        setSubmitting(false);
        return;
      }
      const message = error instanceof Error ? error.message : "";
      // Backstop: our local E2EE state read "off" or "unlocked" (e.g. a stale
      // profile), but the server — the authoritative shared setting — still
      // required encryption and rejected the plaintext Ask. Re-arm the gate so
      // the user can unlock, then resend, instead of stranding the Ask.
      if (/room encryption requires encrypted/i.test(message)) {
        setRoomE2eeEnabled(workspace.id, true);
        setSubmitError("Unlock Room Encryption, then send your Ask again.");
      } else {
        setSubmitError(message || "Couldn't send the request.");
      }
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <ScreenHeader
        showBrand={false}
        title="Be specific."
        subtitle={`What do you want to do to ${partnerFirst}? Pick the physical Acts. Your partner can approve, counter, or pass without the awkward pause.`}
      />
      <div className="ask-stage">
      <form
        className="ask-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) {
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
            submit(submitter ?? e.currentTarget);
          } else {
            explainBlockedSend();
          }
        }}
      >
        {state.seed && (
          <p className="ask-seed" data-testid="ask-seed-from-reveal">
            From <em>{askSeedSourceLabel(state.seed.source)}</em>, something you both want. Change anything, pick a time, send it when it feels right.
          </p>
        )}
        {state.seededKink && (
          <p className="ask-seed">
            Inspired by <em>{state.seededKink.text}</em>. Pick the exact Acts before sending.
          </p>
        )}

        <section className="ask-section">
          <SectionLabel id="ask-acts-heading" title="Acts" hint={selectedActs.length ? `${selectedActs.length} picked` : "Pick one or more"} />
          {actsExpanded && (
            <input
              value={actSearch}
              onChange={(event) => setActSearch(event.target.value)}
              placeholder="Search Acts"
              aria-label="Search Acts"
              className="input mb-3"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
            />
          )}

          {acts.length === 0 ? (
            <button
              type="button"
              onClick={() => setActComposerOpen(true)}
              className="card p-4 text-left pressable"
            >
              <p className="text-sm text-ink-2">
                No Acts in the library yet. Tap to add your first one — it&apos;ll be saved for later.
              </p>
            </button>
          ) : (
            <div className="ask-act-grid" role="group" aria-labelledby="ask-acts-heading">
              {visibleActs.map((act) => (
                <ActButton
                  key={act.id}
                  act={act}
                  selected={selectedActIds.includes(act.id)}
                  onClick={() => toggleAct(act.id)}
                />
              ))}
            </div>
          )}

          <div className="ask-act-actions">
            {acts.length > COLLAPSED_ACT_COUNT && (
              <button
                type="button"
                onClick={() => {
                  if (actsExpanded) collapseActs();
                  else setActsExpanded(true);
                  setActSearch("");
                }}
                className="btn-ghost ask-act-action"
              >
                {actsExpanded ? "Collapse Acts" : `Show all ${acts.length} Acts`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActComposerOpen((value) => !value)}
              className="btn-ghost ask-act-action"
            >
              {actComposerOpen ? "Close" : "Add your own"}
            </button>
            {acts.length > 0 && (
              <button
                type="button"
                onClick={surpriseMe}
                className="btn-ghost ask-act-action ask-surprise-action"
              >
                Open to anything? Surprise me
              </button>
            )}
            {slowTouchAct && !slowTouchPicked && (
              <button
                type="button"
                onClick={pickSlowTouch}
                className="btn-ghost ask-act-action ask-slow-touch-action"
                data-testid="ask-slow-touch"
              >
                Low-key? Slow touch, no finish line
              </button>
            )}
          </div>

          {slowTouchPicked && (
            <p className="ask-slow-touch-hint" data-testid="ask-slow-touch-hint">{SLOW_TOUCH_ACT_HINT}</p>
          )}

          {cooldown && (
            <p className="ask-rest-note" role="status" data-testid="ask-rest-note">
              {partner?.displayName?.split(" ")[0] || "Your partner"} passed on this one recently, so it rests until {planLabel(cooldown.until)}. Something else in the meantime?
            </p>
          )}

          {!actsExpanded && hiddenActCount > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              {hiddenActCount} more saved Acts are tucked away until you expand.
            </p>
          )}

          {actComposerOpen && (
            <ActComposer
              onCancel={() => setActComposerOpen(false)}
              onSubmit={handleCreateAct}
            />
          )}
        </section>

        {/* Conflict banners */}
        {conflicts.hard.length > 0 && (
          <div className="card border-no/40 p-4">
            <p className="kicker" style={{ color: "rgb(var(--no-rgb))" }}>
              Hits a hard limit
            </p>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "rgb(var(--no-rgb))" }}>
              {conflicts.hard.map((b) => (
                <li key={b.id}>{b.text}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-2">
              You can&apos;t send this. Swap or remove the items above.
            </p>
          </div>
        )}
        {conflicts.warn.length > 0 && (
          <div className="card p-4" style={{ borderColor: "rgb(var(--gold-rgb) / 0.4)" }}>
            <p className="kicker text-gold">Worth a heads-up</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {conflicts.warn.map((b) => (
                <li key={b.id}>{b.text} <span className="text-ink-3">— {b.type}</span></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">
              These touch existing limits. You can still send.
            </p>
          </div>
        )}

        <section className="ask-section">
          <SectionLabel id="ask-timing-heading" title="Timing" />
          <RadioRow
            options={TIMINGS}
            value={timing}
            onChange={(v) => setTiming(v as Timing)}
            labelledBy="ask-timing-heading"
          />
          <button
            type="button"
            role="switch"
            aria-checked={filming === "Yes"}
            className={`filming-check ask-film-button pressable ${filming === "Yes" ? "is-on" : ""}`}
            onClick={() => setFilming((value) => value === "Yes" ? "No" : "Yes")}
          >
            <span>Filming OK</span>
          </button>
        </section>

        <section className="ask-section">
          <SectionLabel id="ask-note-heading" title="Note" hint="Optional" />
          <textarea
            aria-labelledby="ask-note-heading"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line for your partner - vibe, timing, or a dare."
            rows={3}
            className="input note-field resize-none"
            maxLength={1800}
            autoCapitalize="none"
            autoCorrect="on"
            spellCheck
            inputMode="text"
          />
        </section>

        {submitNotice && (
          <p className="text-sm text-ink-2" role="status" aria-live="polite">{submitNotice}</p>
        )}
        {submitError && (
          <p className="text-sm" role="alert" aria-live="assertive" style={{ color: "rgb(var(--no-rgb))" }}>{submitError}</p>
        )}

        <StickyAction>
          <div className="ask-submit-panel">
            <p
              ref={sendReasonRef}
              id="ask-send-status"
              className={`ask-submit-hint${sendBlockedReason ? " is-blocked" : ""}`}
              data-testid="ask-send-status"
            >
              {sendBlockedReason || selectionSummary}
            </p>
            <button
              type="submit"
              aria-disabled={!canSubmit}
              aria-describedby="ask-send-status"
              className="btn-primary ask-submit-button"
              data-testid="ask-submit"
              onClick={(event) => {
                if (submitting) { event.preventDefault(); return; }
                if (!canSubmit) {
                  event.preventDefault();
                  explainBlockedSend();
                }
              }}
            >
              {submitting ? "Sending…" : "Send to " + (partner?.displayName?.split(" ")[0] || "partner")}
            </button>
          </div>
        </StickyAction>
      </form>
      </div>
    </AppShell>
  );
}

// ---------- pieces ----------

function SectionLabel({
  id,
  title,
  hint,
  action,
}: {
  id?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 id={id} className="font-display text-title text-ink">{title}</h2>
      <div className="flex items-baseline gap-3">
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
        {action}
      </div>
    </div>
  );
}

// A single choice: a radiogroup with roving focus (arrow keys move and pick,
// Tab enters on the picked option).
function RadioRow<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  labelledBy?: string;
}) {
  const values = options.map((opt) => opt.value);
  return (
    <div className="cadence-grid" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={(event) => radioGroupKeyDown(event, values, value, onChange)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={radioTabIndex(values, value, opt.value)}
            onClick={() => onChange(opt.value)}
            className={[
              "cadence-chip pressable",
              active ? "is-picked" : "",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ActButton({
  act,
  selected,
  onClick,
}: {
  act: Act;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "act-chip pressable",
        selected ? "is-picked" : "",
      ].join(" ")}
    >
      <ActLabel label={act.label} className="act-chip-inner" />
    </button>
  );
}

function ActLabel({ label, className }: { label: string; className: string }) {
  const { emoji, text } = splitActLabel(label);
  return (
    <span className={className}>
      {emoji && <span className="act-label-emoji" aria-hidden="true">{emoji}</span>}
      <span className="act-chip-name">{text}</span>
    </span>
  );
}

function ActComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = label.trim();

  async function submit() {
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(clean);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this Act.");
      setBusy(false);
    }
  }

  return (
    <div className="act-composer card p-4">
      <p className="font-display text-title text-ink">Add an Act</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Acts are physical things you do. Kinks stay in Inspiration.
      </p>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="e.g. Slow undressing"
        className="input mt-3"
        maxLength={80}
        autoCapitalize="none"
        autoCorrect="on"
        spellCheck
        inputMode="text"
      />
      {error && <p className="mt-2 text-sm" role="alert" style={{ color: "rgb(var(--no-rgb))" }}>{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm" disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={submit} className="btn-primary text-sm" disabled={busy || !clean}>
          {busy ? "Saving..." : "Add and select"}
        </button>
      </div>
    </div>
  );
}
