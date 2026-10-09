"use client";

import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import QuietHoursSetting from "@/components/QuietHoursSetting";
import RoomEncryptionPanel from "@/components/RoomEncryptionPanel";
import DesireVoiceSettings from "@/components/DesireVoiceSettings";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState, LoadErrorState, SkeletonList } from "@/components/States";
import { combineBuiltInAndSavedActs } from "@/lib/built-in-acts";
import { APP_RELEASE_VERSION } from "@/lib/app-version";
import { privateNoteCount } from "@/lib/private-notes";
import { prepareSignOut } from "@/lib/signout";
import { partnerOf } from "@/lib/workspace";
import { getCachedResource, setCachedResource, useColdStart } from "@/lib/resource-cache";
import { ensurePushSubscription, recordPushSave } from "@/lib/push-subscription";
import {
  ApiUnauthorizedError,
  createClaimableInvite,
  getConfig,
  getBootstrap,
  getMyInvites,
  getShelf,
  revokeInvite,
  savePushSubscription,
  sendTestPush,
  submitFeedback,
  updateProfileSettings,
  type InvitePreview,
} from "@/lib/api";
import type {
  Act,
  AuthInfo,
  BootstrapResponse,
  Boundary,
  FantasyBacklogResponse,
  FeedbackSentiment,
  RequestBoardResponse,
  ShelfResponse,
  Workspace,
} from "@/lib/types";
import "./space.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; error?: unknown }
  | { kind: "unauthorized" }
  | { kind: "no-workspace"; auth: AuthInfo }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      boundaries: Boundary[];
      acts: Act[];
      backlog: FantasyBacklogResponse;
      shelf: ShelfResponse;
      board: RequestBoardResponse;
    };

type SpacePrefs = {
  blur: boolean;
  lock: boolean;
  notifyName: boolean;
  shareAttentionSignals: boolean;
};

const PUSH_PREFS_KEY = "sexualsync-push-preferences";
const SPACE_RECONNECT_URL = "/api/auth/google?returnTo=%2Fspace";
const FEEDBACK_OPTIONS: { id: FeedbackSentiment; label: string }[] = [
  { id: "positive", label: "Good" },
  { id: "neutral", label: "Idea" },
  { id: "negative", label: "Issue" },
];
const PUSH_PREF_LABELS: { id: string; title: string; sub: string }[] = [
  { id: "chat-message", title: "Sext messages", sub: "When your partner sends you a sext." },
  { id: "request-reviewed", title: "Ask replies", sub: "When your partner answers or counters an Ask." },
  { id: "request-sent", title: "New Asks", sub: "When your partner sends something for review." },
  { id: "request-reminder", title: "Ask nudges", sub: "The one nudge your partner can send about an Ask." },
  { id: "kink-nudge", title: "Kink nudges", sub: "A batched reminder when several Kinks are waiting." },
  { id: "pile-started", title: "Pile starts", sub: "When your partner starts a Pile that needs you." },
  { id: "pile-reminder", title: "Pile reminders", sub: "Halfway, 1 hour, and 10 minutes before reveal." },
  { id: "blind-reveal", title: "Blind Reveal ready", sub: "When both answers are ready." },
  { id: "game-ready", title: "Quiz & Green Lights", sub: "When a reveal is ready, or it's your turn." },
  { id: "mood-match", title: "Horny matches", sub: "When you've both said you're horny, or open to it." },
];

// Notification presets. Each one is a complete map over every PUSH_PREF_LABELS
// tag and is written exactly like a hand-flipped toggle: the same per-device
// `preferences` object the server already filters on (functions/api/_push.js
// DEFAULT_PUSH_PREFERENCES). Tags missing from a preset's list are turned off.
//
//  - Everything: every tag on (the default for a new device).
//  - Only what needs me: things addressed to you or waiting on your answer:
//    Sexts, new Asks, Ask replies and reminders, a Pile your partner started,
//    your turn / reveal in the Quiz and Green Lights, and a mood match. Off:
//    Kink nudges, Pile countdown reminders and Blind Reveal ready.
//  - Quiet: only a new Ask and a mood match.
type PushPresetId = "everything" | "needs-me" | "quiet";
const PUSH_PRESETS: { id: PushPresetId; title: string; sub: string; tags: string[] }[] = [
  {
    id: "everything",
    title: "Everything",
    sub: "Every Sext, Ask, game turn, reminder and nudge.",
    tags: PUSH_PREF_LABELS.map((pref) => pref.id),
  },
  {
    id: "needs-me",
    title: "Only what needs me",
    sub: "Sexts, Asks, your turn in a game, and mood matches. No countdowns or nudges.",
    tags: ["chat-message", "request-sent", "request-reviewed", "request-reminder", "pile-started", "game-ready", "mood-match"],
  },
  {
    id: "quiet",
    title: "Quiet",
    sub: "Just new Asks and mood matches.",
    tags: ["request-sent", "mood-match"],
  },
];

function presetPrefs(presetId: PushPresetId): Record<string, boolean> {
  const preset = PUSH_PRESETS.find((item) => item.id === presetId) || PUSH_PRESETS[0];
  return Object.fromEntries(PUSH_PREF_LABELS.map((pref) => [pref.id, preset.tags.includes(pref.id)])) as Record<string, boolean>;
}

/** The preset the current toggles match exactly, or null for a custom mix. */
function matchingPreset(prefs: Record<string, boolean>): PushPresetId | null {
  for (const preset of PUSH_PRESETS) {
    const wanted = presetPrefs(preset.id);
    if (PUSH_PREF_LABELS.every((pref) => (prefs[pref.id] !== false) === wanted[pref.id])) return preset.id;
  }
  return null;
}

function defaultPushPrefs() {
  return Object.fromEntries(PUSH_PREF_LABELS.map((pref) => [pref.id, true])) as Record<string, boolean>;
}

export default function SpacePage() {
  const [state, setState] = useState<LoadState>(() => getCachedResource<LoadState>("space") ?? { kind: "loading" });
  useColdStart("space", setState);
  useEffect(() => { if (state.kind === "ready") setCachedResource("space", state); }, [state]);
  const [notesCount, setNotesCount] = useState(0);
  const [pushPrefs, setPushPrefs] = useState<Record<string, boolean>>(defaultPushPrefs);
  const [pushPrefsLoaded, setPushPrefsLoaded] = useState(false);
  const [pushStatus, setPushStatus] = useState("Checking notification support.");
  const pushAutoRegisterAttemptedRef = useRef("");
  const [prefs, setPrefs] = useState<SpacePrefs>({
    blur: true,
    lock: true,
    notifyName: false,
    shareAttentionSignals: true,
  });

  useEffect(() => {
    // Hydration-safe seed: read prefs, push prefs, and note count from
    // localStorage after mount so the server-rendered defaults match the
    // first client paint.
    const initTimer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("ss:v1:space-prefs") || "{}");
        setPrefs((current) => ({ ...current, ...stored }));
      } catch {}
      try {
        setPushPrefs({ ...defaultPushPrefs(), ...JSON.parse(localStorage.getItem(PUSH_PREFS_KEY) || "{}") });
      } catch {
        setPushPrefs(defaultPushPrefs());
      }
      setPushPrefsLoaded(true);

      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("Push is not available in this browser.");
        return;
      }
      if (Notification.permission === "granted") {
        navigator.serviceWorker.ready
          .then((registration) => registration.pushManager.getSubscription())
          .then((subscription) => setPushStatus(subscription ? "Notifications are on for this device." : "Notifications are allowed. Tap Enable to connect this device."))
          .catch(() => setPushStatus("Notifications are available."));
        return;
      }
      setPushStatus(Notification.permission === "denied" ? "Notifications are blocked in browser settings." : "Notifications are off on this device.");
    }, 0);

    // Private notes are encrypted at rest, so the count comes from the async
    // privateNoteCount() (it decrypts) rather than a raw localStorage parse.
    // Returns 0 while the app lock is engaged — the intended privacy behavior.
    void privateNoteCount().then(setNotesCount).catch(() => setNotesCount(0));

    return () => window.clearTimeout(initTimer);
  }, []);

  // Lets the error card's Try again re-run the mount load below.
  const loadRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile: BootstrapResponse = await getBootstrap();
        if (cancelled) return;
        if (!profile.activeWorkspace) {
          setState({ kind: "no-workspace", auth: profile.auth });
          return;
        }
        const workspaceId = profile.activeWorkspace.id;
        const shelfResult = await Promise.allSettled([getShelf(workspaceId)]);
        const bootstrap = profile.bootstrap;
        if (cancelled) return;
        setPrefs((current) => ({
          ...current,
          shareAttentionSignals: profile.profile?.settings?.shareAttentionSignals !== false,
        }));
        setState({
          kind: "ready",
          auth: profile.auth,
          workspace: profile.activeWorkspace,
          boundaries: bootstrap.boundaries?.boundaries || [],
          acts: combineBuiltInAndSavedActs(bootstrap.acts?.acts || [], workspaceId),
          backlog: bootstrap.fantasy || emptyBacklog(workspaceId),
          shelf: shelfResult[0]?.status === "fulfilled" ? shelfResult[0].value : emptyShelf(workspaceId),
          board: bootstrap.requests || emptyBoard(workspaceId),
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized" });
          return;
        }
        setState((current) => (current.kind === "ready"
          ? current
          : { kind: "error", message: error instanceof Error ? error.message : "", error }));
      }
    }

    loadRef.current = load;
    void load();

    // Re-fetch whenever the tab becomes visible again. Handles the common
    // case where the user is on /space waiting for the partner to claim
    // the invite link — once they swap tabs and come back, this refresh
    // picks up the new workspace state and InviteSection drops the
    // now-useless "Your room link" card.
    function onVisibility() {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load();
      }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  function updatePref(key: keyof SpacePrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { localStorage.setItem("ss:v1:space-prefs", JSON.stringify(next)); } catch {}
    if (key === "shareAttentionSignals") {
      updateProfileSettings({ shareAttentionSignals: value })
        .then((profile) => {
          const persisted = profile.profile?.settings?.shareAttentionSignals !== false;
          setPrefs((current) => ({ ...current, shareAttentionSignals: persisted }));
          try {
            const stored = JSON.parse(localStorage.getItem("ss:v1:space-prefs") || "{}");
            localStorage.setItem("ss:v1:space-prefs", JSON.stringify({ ...stored, shareAttentionSignals: persisted }));
          } catch {}
        })
        .catch(() => {
          const reverted = { ...next, shareAttentionSignals: !value };
          setPrefs(reverted);
          try { localStorage.setItem("ss:v1:space-prefs", JSON.stringify(reverted)); } catch {}
        });
    }
  }

  const syncPushSubscription = useCallback(async (nextPrefs: Record<string, boolean> = pushPrefs) => {
    if (state.kind !== "ready") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("Push is not available in this browser.");
      return;
    }
    setPushStatus("Connecting notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushStatus(permission === "denied" ? "Notifications are blocked in browser settings." : "Notifications were not enabled.");
      return;
    }
    const config = await getConfig();
    if (!config.vapidPublicKey) {
      setPushStatus("Push keys are not configured yet.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      });
    }
    const json = subscription.toJSON();
    await savePushSubscription({
      workspaceId: state.workspace.id,
      subscription: json,
      preferences: nextPrefs,
    });
    // Record the manual save so the background re-ensure (PushReconnect / the
    // auto-register effect below) can skip a redundant POST against the limit.
    recordPushSave(json.endpoint || "", nextPrefs);
    setPushStatus("Notifications are on for this device.");
  }, [pushPrefs, state]);

  useEffect(() => {
    if (state.kind !== "ready" || !pushPrefsLoaded) return;
    if (pushAutoRegisterAttemptedRef.current === state.workspace.id) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    pushAutoRegisterAttemptedRef.current = state.workspace.id;
    const timeout = window.setTimeout(() => {
      // Deduped background heal — skips the POST when the subscription + prefs
      // are unchanged and saved recently, so repeated Space visits don't burn
      // the push-subscribe rate limit. The manual toggle still always saves.
      ensurePushSubscription(state.workspace.id, pushPrefs).catch(() => {
        // Best effort; manual enable below still works.
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [pushPrefs, pushPrefsLoaded, state]);

  function updatePushPref(key: string, value: boolean) {
    savePushPrefs({ ...pushPrefs, [key]: value });
  }

  function applyPushPreset(presetId: PushPresetId) {
    // Keep any tag outside the labelled list (none today) as it was.
    savePushPrefs({ ...pushPrefs, ...presetPrefs(presetId) });
  }

  function savePushPrefs(next: Record<string, boolean>) {
    setPushPrefs(next);
    try { localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(next)); } catch {}
    syncPushSubscription(next).catch((error) => {
      setPushStatus(error instanceof Error ? error.message : "Couldn't update notifications.");
    });
  }

  async function sendTestNotification() {
    if (state.kind !== "ready") return;
    try {
      await syncPushSubscription(pushPrefs);
      await sendTestPush(state.workspace.id);
      setPushStatus("Test push sent to this device.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Couldn't send a test push.");
    }
  }

  // Settings live in a sheet over Us. `/space?settings=1` (or #settings)
  // opens it directly, so other screens can link straight to it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("settings") || window.location.hash === "#settings") {
      // One-shot deep link read after mount (window is client-only).
      setSettingsOpen(true);
    }
  }, []);

  function closeSettings() {
    setSettingsOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("settings") || url.hash === "#settings") {
      url.searchParams.delete("settings");
      url.hash = "";
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }
    // Focus returns to the gear that opened the sheet.
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
  }

  return (
    <AppShell>
      <ScreenHeader
        showBrand={false}
        title="Us"
        subtitle={subtitleFor(state)}
        trailing={(
          <button
            ref={settingsTriggerRef}
            type="button"
            className="us-settings-trigger pressable"
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            data-testid="us-settings-open"
            onClick={() => setSettingsOpen(true)}
          >
            <IconGear />
          </button>
        )}
      />
      <Body
        state={state}
        onRetry={() => loadRef.current()}
        notesCount={notesCount}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={closeSettings}
        state={state}
        prefs={prefs}
        pushPrefs={pushPrefs}
        pushStatus={pushStatus}
        onPref={updatePref}
        onPushPref={updatePushPref}
        onPushPreset={applyPushPreset}
        onEnablePush={() => syncPushSubscription().catch((error) => {
          setPushStatus(error instanceof Error ? error.message : "Couldn't enable notifications.");
        })}
        onTestPush={sendTestNotification}
      />
    </AppShell>
  );
}

function IconGear() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14.1 2.5h-4.2l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4.2l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3.9 2-3.4-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function emptyBacklog(workspaceId: string): FantasyBacklogResponse {
  return { workspaceId, reactionCatalog: [], ideas: [], graveyard: [] };
}

function emptyShelf(workspaceId: string): ShelfResponse {
  return { workspaceId, reactionCatalog: [], items: [] };
}

function emptyBoard(workspaceId: string): RequestBoardResponse {
  return { workspaceId, requests: [], activeRequests: [], history: [] };
}

function Body({
  state,
  onRetry,
  notesCount,
}: {
  state: LoadState;
  onRetry: () => Promise<void>;
  notesCount: number;
}) {
  if (state.kind === "loading") return <SkeletonList count={4} />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Couldn't confirm your session"
        body="We couldn't verify your Google session. Reconnect and come right back here."
        action={
          <span className="settings-actions settings-actions-center">
            <Link href="/space" className="btn-ghost pressable">Try again</Link>
            <a className="btn-primary pressable" href={SPACE_RECONNECT_URL}>Reconnect</a>
          </span>
        }
      />
    );
  }
  if (state.kind === "error") {
    return <LoadErrorState what="Us" error={state.error ?? state.message} onRetry={onRetry} />;
  }
  if (state.kind === "no-workspace") {
    return (
      <ErrorState
        title="No partner space yet"
        body="You're signed in, but this device did not receive your partner space."
        action={<a className="btn-primary pressable" href={SPACE_RECONNECT_URL}>Reconnect</a>}
      />
    );
  }

  const hardLimits = state.boundaries.filter((item) => item.type === "Hard No").length;
  const careLimits = state.boundaries.length - hardLimits;

  return (
    <div className="settings-stage us-stage">
      {!hasJoinedPartner(state.workspace, state.auth.email) && (
        <InviteSection workspaceId={state.workspace.id} />
      )}

      <section className="settings-section" aria-labelledby="us-together">
        <h2 id="us-together" className="eyebrow">Together</h2>
        <div className="settings-card">
          <SettingsLink
            href="/space/limits"
            title="Limits"
            sub={state.boundaries.length ? `${hardLimits} hard · ${careLimits} handle with care` : "None set yet. Hard No, Talk First, and more."}
          />
          <SettingsLink href="/space/acts" title="Your acts library" sub={`${state.acts.length} available Acts`} />
          <SettingsLink href="/space/health" title="Health" sub="Approved sex, Pile overlaps, and Act counts" />
          <SettingsLink href="/space/vault" title="Private Vault" sub="Encrypted clips, moments, reactions, and comments" />
          <SettingsLink href="/space/notes" title="Private notes" sub={`${notesCount} on this device · never synced`} />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="us-privacy">
        <h2 id="us-privacy" className="eyebrow">Privacy and help</h2>
        <div className="settings-card">
          <SettingsLink href="/space/privacy" title="Privacy & data" sub="See what is stored, what stays here, and how deletion works" />
          <SettingsLink href="/space/tutorial" title="Quick tour" sub="A short map of Home, Play, Ask, Sext, and Us" />
        </div>
      </section>

      <div className="settings-footer">
        <span className="chip settings-version">{APP_RELEASE_VERSION}</span>
      </div>
    </div>
  );
}

/**
 * Settings, opened from the gear on Us. A native <dialog> sheet: showModal()
 * traps focus and makes Us inert behind it, Escape and a backdrop tap close
 * it, and focus returns to the gear (the caller's onClose). The body scrolls
 * on its own and clears the home indicator.
 */
function SettingsSheet({
  open,
  onClose,
  state,
  prefs,
  pushPrefs,
  pushStatus,
  onPref,
  onPushPref,
  onPushPreset,
  onEnablePush,
  onTestPush,
}: {
  open: boolean;
  onClose: () => void;
  state: LoadState;
  prefs: SpacePrefs;
  pushPrefs: Record<string, boolean>;
  pushStatus: string;
  onPref: (key: keyof SpacePrefs, value: boolean) => void;
  onPushPref: (key: string, value: boolean) => void;
  onPushPreset: (presetId: PushPresetId) => void;
  onEnablePush: () => void;
  onTestPush: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [customizing, setCustomizing] = useState(false);
  const activePreset = matchingPreset(pushPrefs);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => doneRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const ready = state.kind === "ready" ? state : null;

  return (
    <dialog
      ref={dialogRef}
      className="us-settings-sheet"
      aria-labelledby={titleId}
      data-testid="us-settings-sheet"
      onClose={() => { if (open) onClose(); }}
      onCancel={(event) => {
        // Escape: let state drive the close so focus can return cleanly.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the backdrop (the dialog box itself, outside the panel).
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="us-settings-panel">
          <div className="us-settings-head">
            <h2 id={titleId} className="us-settings-title">Settings</h2>
            <button ref={doneRef} type="button" className="done-pill pressable" onClick={onClose}>
              Done
            </button>
          </div>
          <div className="us-settings-body">
            <section className="settings-section" aria-labelledby="settings-notifications">
              <h3 id="settings-notifications" className="eyebrow">Notifications</h3>
              <div className="settings-card">
                <div className="settings-row settings-row-stack">
                  <span>
                    <span className="settings-row-title">This device</span>
                    <span className="settings-row-sub" role="status">{pushStatus}</span>
                  </span>
                  <span className="settings-actions">
                    <button type="button" className="btn-ghost pressable" onClick={onEnablePush}>Enable</button>
                    <button type="button" className="btn-ghost pressable" onClick={onTestPush}>Test</button>
                  </span>
                </div>
              </div>
              <div className="us-settings-presets" role="radiogroup" aria-label="What to be notified about">
                {PUSH_PRESETS.map((preset) => {
                  const checked = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      data-push-preset={preset.id}
                      className={`us-preset pressable ${checked ? "is-active" : ""}`}
                      onClick={() => onPushPreset(preset.id)}
                    >
                      <span className="us-preset-dot" aria-hidden="true" />
                      <span className="us-preset-copy">
                        <span className="us-preset-title">{preset.title}</span>
                        <span className="us-preset-sub">{preset.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="us-customize pressable"
                aria-expanded={customizing}
                aria-controls="settings-push-tags"
                onClick={() => setCustomizing((value) => !value)}
              >
                <span>{activePreset ? "Customize" : "Customize · your own mix"}</span>
                <span className="us-customize-chev" aria-hidden="true">{customizing ? "−" : "+"}</span>
              </button>
              {customizing && (
                <div id="settings-push-tags" className="settings-card us-push-tags">
                  {PUSH_PREF_LABELS.map((pref) => (
                    <SettingRow
                      key={pref.id}
                      title={pref.title}
                      sub={pref.sub}
                      checked={pushPrefs[pref.id] !== false}
                      onChange={(value) => onPushPref(pref.id, value)}
                      dataPushPref={pref.id}
                    />
                  ))}
                </div>
              )}
              {ready && <QuietHoursSetting workspaceId={ready.workspace.id} />}
            </section>

            {/* Per-person prompt ceiling + explicit voice (self-contained). */}
            <DesireVoiceSettings />

            <section className="settings-section" aria-labelledby="settings-privacy">
              <h3 id="settings-privacy" className="eyebrow">Privacy</h3>
              <div className="settings-card">
                <SettingRow
                  title="Blur the dirty stuff"
                  sub="Thumbnails open clean. You decide what to reveal."
                  checked={prefs.blur}
                  onChange={(value) => onPref("blur", value)}
                />
                <SettingRow
                  title="Show partner name in notifications"
                  sub="Off, it reads as new from your partner."
                  checked={prefs.notifyName}
                  onChange={(value) => onPref("notifyName", value)}
                />
                <SettingRow
                  title="Share attention signals"
                  sub="Rare heat signals when a Kink or Shelf save holds your focus."
                  checked={prefs.shareAttentionSignals}
                  onChange={(value) => onPref("shareAttentionSignals", value)}
                />
              </div>
            </section>

            <section className="settings-section settings-room-encryption-section" aria-labelledby="settings-encryption">
              <h3 id="settings-encryption" className="eyebrow">Room encryption</h3>
              <RoomEncryptionPanel />
            </section>

            <section className="settings-section" aria-labelledby="settings-account">
              <h3 id="settings-account" className="eyebrow">Account</h3>
              <div className="settings-card">
                <SettingsLink
                  href="/more"
                  title="Account and data"
                  sub={ready ? `Download or delete · ${ready.backlog.ideas.length} Kinks · ${ready.shelf.items.length} Shelf items` : "Download or delete your data"}
                  arrow="→"
                />
                <a className="settings-link pressable" href="/api/auth/logout" onClick={prepareSignOut}>
                  <span>
                    Sign out of this device
                    <span className="settings-link-sub">{ready ? `Signed in as ${ready.auth.email}` : "Clears your Google session here."}</span>
                  </span>
                  <span className="settings-link-chev">→</span>
                </a>
              </div>
            </section>

            {ready && <FeedbackSection workspaceId={ready.workspace.id} />}

            <section className="settings-section settings-beta-note" aria-labelledby="settings-beta">
              <h3 id="settings-beta" className="eyebrow">Early access</h3>
              <div className="settings-card settings-beta-card">
                <p>
                  Sexualsync is in early access. Core privacy, auth, export, deletion, and safety checks are live, but the product is still young. Please use it with someone you trust and report anything weird.
                </p>
              </div>
            </section>

            <a
              className="settings-coffee-link pressable"
              href="https://ko-fi.com/bergwa"
              target="_blank"
              rel="noreferrer"
            >
              <span className="settings-coffee-mark" aria-hidden="true">k</span>
              <span className="settings-coffee-copy">
                <span>Support Sexualsync on Ko-fi</span>
                <small>Help keep the room cared for.</small>
              </span>
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}

function FeedbackSection({ workspaceId }: { workspaceId: string }) {
  const [sentiment, setSentiment] = useState<FeedbackSentiment>("neutral");
  const [message, setMessage] = useState("");
  const [mayContact, setMayContact] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = message.trim().length > 0 && !submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setStatus("");
    setError("");
    try {
      await submitFeedback({
        workspaceId,
        sentiment,
        message: message.trim(),
        mayContact,
        route: typeof window === "undefined" ? "/space" : `${window.location.pathname}${window.location.search}`,
        surface: "space",
      });
      setMessage("");
      setMayContact(false);
      setSentiment("neutral");
      setStatus("Thanks. Feedback sent.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't send feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="settings-section settings-feedback-section">
      <h3 className="eyebrow">Feedback</h3>
      <form className="settings-card settings-feedback" onSubmit={submit}>
        <div className="settings-feedback-head">
          <span className="settings-row-title">What should feel better?</span>
          <span className="settings-row-sub">Private to Sexualsync. Skip intimate details.</span>
        </div>
        <div className="settings-feedback-options" role="group" aria-label="Feedback type">
          {FEEDBACK_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`settings-feedback-chip pressable ${sentiment === option.id ? "is-active" : ""}`}
              onClick={() => setSentiment(option.id)}
              aria-pressed={sentiment === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
        <textarea
          className="input settings-feedback-input"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (status) setStatus("");
            if (error) setError("");
          }}
          placeholder="What should we fix, keep, or rethink?"
          aria-label="Feedback"
          maxLength={1200}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
        />
        <label className="settings-feedback-followup">
          <input
            type="checkbox"
            checked={mayContact}
            onChange={(event) => setMayContact(event.target.checked)}
          />
          <span>You can follow up with me</span>
        </label>
        <div className="settings-feedback-actions">
          {(status || error) && (
            <p className={`settings-feedback-status ${error ? "is-error" : ""}`} role="status">
              {error || status}
            </p>
          )}
          <button type="submit" className="btn-primary pressable" disabled={!canSubmit}>
            {submitting ? "Sending" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

function SettingsLink({
  href,
  title,
  sub,
  arrow = "›",
}: {
  href: string;
  title: string;
  sub: string;
  arrow?: string;
}) {
  return (
    <Link href={href} className="settings-link pressable">
      <span>
        {title}
        <span className="settings-link-sub">{sub}</span>
      </span>
      <span className="settings-link-chev">{arrow}</span>
    </Link>
  );
}

function SettingRow({
  title,
  sub,
  checked,
  onChange,
  dataPushPref,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  dataPushPref?: string;
}) {
  // The whole row is the control (role=switch) so the title text is a tap
  // target too — a <label> does NOT forward clicks to a nested <button>, so the
  // old markup left only the small switch thumb tappable (WCAG 2.5.5). The
  // visible pill is now decorative; the row carries the name + state.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-push-pref={dataPushPref}
      className="settings-row pressable"
      onClick={() => onChange(!checked)}
    >
      <span>
        <span className="settings-row-title">{title}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      <span className={`switch ${checked ? "is-on" : ""}`} aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}

function subtitleFor(state: LoadState) {
  if (state.kind !== "ready") return "Your limits, Acts, notes, and Vault, together.";
  if (!hasJoinedPartner(state.workspace, state.auth.email)) return "Your room. Invite your partner below.";
  const partnerName = partnerOf(state.workspace, state.auth.email)?.displayName?.split(" ")[0];
  return partnerName ? `Your room with ${partnerName}.` : "Your room, together.";
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function hasJoinedPartner(workspace: Workspace, myEmail: string): boolean {
  const me = (myEmail || "").toLowerCase();
  return (workspace.members || []).some((member) => {
    return member.status === "active" && (member.email || "").toLowerCase() !== me;
  });
}

function buildInviteShareUrl(inviteId: string): string {
  if (typeof window === "undefined") return `/signin?invite=${inviteId}`;
  return `${window.location.origin}/signin?invite=${encodeURIComponent(inviteId)}`;
}

function InviteSection({ workspaceId }: { workspaceId: string }) {
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "copy" | "regen">("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getMyInvites();
        if (cancelled) return;
        const match = list.sent.find((item) => item.workspaceId === workspaceId && item.claimable && item.status === "pending");
        setInvite(match || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load your invite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function copy() {
    if (!invite || busy) return;
    setBusy("copy");
    setError(null);
    try {
      const url = buildInviteShareUrl(invite.id);
      let copiedToClipboard = false;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copiedToClipboard = true;
      }
      if (!copiedToClipboard) {
        setError("Couldn't copy automatically. Long-press the link above to copy it manually.");
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Long-press the link above to copy manually.");
    } finally {
      setBusy("");
    }
  }

  async function regenerate() {
    if (!invite || busy) return;
    setBusy("regen");
    setError(null);
    try {
      await revokeInvite(invite.id);
      // Old link is dead the moment revoke resolves. Clear it immediately so a
      // failure on the create side doesn't leave a stale revoked URL on screen
      // for the user to copy and share.
      setInvite(null);
      const created = await createClaimableInvite({ workspaceId });
      setInvite(created.invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't regenerate the link.");
    } finally {
      setBusy("");
    }
  }

  async function create() {
    if (busy) return;
    setBusy("regen");
    setError(null);
    try {
      const created = await createClaimableInvite({ workspaceId });
      setInvite(created.invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the link.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="settings-section">
      <p className="eyebrow">Your room link</p>
      <div className="settings-card space-invite-card">
        {loading ? (
          <p className="space-invite-loading">Loading link&hellip;</p>
        ) : invite ? (
          <>
            <div className="space-invite-row">
              <span className="space-invite-url" title={buildInviteShareUrl(invite.id)}>
                {buildInviteShareUrl(invite.id)}
              </span>
              <span className="space-invite-status">Unclaimed</span>
            </div>
            <p className="space-invite-meta">
              {formatRelativeAge(invite.createdAt)} &middot; expires {formatRelativeExpiry(invite.expiresAt)}
            </p>
            {error && <p className="space-invite-error" role="alert">{error}</p>}
            <div className="space-invite-actions">
              <button type="button" className="space-invite-pill" onClick={() => void copy()} disabled={busy === "copy"}>
                {copied ? "Copied" : busy === "copy" ? "Copying..." : "Copy link"}
              </button>
              <button type="button" className="space-invite-pill space-invite-pill-ghost" onClick={() => void regenerate()} disabled={busy === "regen"}>
                {busy === "regen" ? "Regenerating..." : "Revoke & regenerate"}
              </button>
            </div>
            <p className="space-invite-hint">
              Revoking immediately voids the old link. Once your partner joins, this section goes away.
            </p>
          </>
        ) : (
          <>
            <p className="space-invite-empty">You don&apos;t have a shareable link yet for this room.</p>
            {error && <p className="space-invite-error" role="alert">{error}</p>}
            <div className="space-invite-actions">
              <button type="button" className="space-invite-pill" onClick={() => void create()} disabled={Boolean(busy)}>
                {busy ? "Creating..." : "Create invite link"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function formatRelativeAge(iso: string): string {
  const when = new Date(iso).getTime();
  if (!Number.isFinite(when)) return "just now";
  const diff = Math.max(0, Date.now() - when);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `created ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `created ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `created ${days}d ago`;
}

function formatRelativeExpiry(iso: string): string {
  const when = new Date(iso).getTime();
  if (!Number.isFinite(when)) return "soon";
  const diff = when - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `in ${days}d`;
  return `in ${days}d ${remHours}h`;
}
