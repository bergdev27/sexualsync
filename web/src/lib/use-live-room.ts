"use client";

import { createContext, useContext, useEffect, useRef } from "react";

export const LIVE_ROOM_EVENT = "sexualsync:room-event";
export const LIVE_ROOM_PRESENCE = "sexualsync:room-presence";
const LAST_EVENT_SEQ_KEY = "ss:room:last-seq:";

export type LiveRoomResource =
  | "request-board"
  | "fantasy-backlog"
  | "shelf"
  | "vault"
  | "pile"
  | "blind-reveals"
  | "sex-quiz"
  | "green-lights"
  | "chat"
  | "mood"
  | "presence";

export interface LiveRoomEventDetail {
  seq?: number;
  id?: string;
  resource?: string;
  action?: string;
  entityId?: string;
  actorEmail?: string;
  actorName?: string;
  at?: string;
  passive?: boolean;
}

// Mood light room events. Both carry NO actor (so they reach every device of
// both partners and never say who switched): `match` when the second partner
// switches on (entityId/at = when the match formed), `ended` when either
// switches off during a match. A match that simply runs out at `match.until`
// sends nothing — clients time that out from the GET /api/mood response.
// Events can arrive via reconnect replay, so treat them as "refetch" hints and
// confirm with getMood() before celebrating.
export const MOOD_ROOM_RESOURCE = "mood";
export type MoodRoomAction = "match" | "ended";

export function moodRoomAction(detail: LiveRoomEventDetail | null | undefined): MoodRoomAction | null {
  if (detail?.resource !== MOOD_ROOM_RESOURCE) return null;
  return detail.action === "match" || detail.action === "ended" ? detail.action : null;
}

/**
 * Subscribe to mood-light room events. Needs the shared room socket to be
 * open, i.e. a useLiveRoomReload() somewhere on screen (or one that unmounted
 * within the hub's idle window). Passing resources: ["mood"] there also
 * triggers its onReload for these events. The hub dispatches each room event
 * once, however many screens are subscribed.
 */
export function useMoodRoomEvents(onMoodEvent: (action: MoodRoomAction, detail: LiveRoomEventDetail) => void) {
  const handlerRef = useRef(onMoodEvent);
  useEffect(() => { handlerRef.current = onMoodEvent; }, [onMoodEvent]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onRoomEvent(event: Event) {
      const detail = (event as CustomEvent<LiveRoomEventDetail>).detail;
      const action = moodRoomAction(detail);
      if (action) handlerRef.current(action, detail);
    }
    window.addEventListener(LIVE_ROOM_EVENT, onRoomEvent);
    return () => window.removeEventListener(LIVE_ROOM_EVENT, onRoomEvent);
  }, []);
}

// How old a room event's own `at` stamp may be before a screen must not act on
// it as news (navigate, celebrate). The hub already withholds replays; this is
// the second guard for anything that slips through (clock skew aside).
export const LIVE_ROOM_EVENT_MAX_AGE_MS = 60_000;

/** True when the event says it happened more than `maxAgeMs` ago. Events without a readable `at` are not stale. */
export function isStaleRoomEvent(detail: LiveRoomEventDetail | null | undefined, nowMs = Date.now(), maxAgeMs = LIVE_ROOM_EVENT_MAX_AGE_MS) {
  const atMs = Date.parse(detail?.at || "");
  return Number.isFinite(atMs) && nowMs - atMs > maxAgeMs;
}

export interface LiveRoomPresenceDetail {
  actorEmail?: string;
  actorName?: string;
  status?: string;
  at?: string;
}

interface RoomMessage {
  type?: string;
  seq?: number;
  latestSeq?: number;
  event?: LiveRoomEventDetail;
  actorEmail?: string;
  actorName?: string;
  status?: string;
  at?: string;
  // room.hello: the actors already connected when we join (seeds presence).
  online?: string[];
}

function parseMessage(raw: MessageEvent<string>): RoomMessage | null {
  try {
    return JSON.parse(raw.data) as RoomMessage;
  } catch {
    return null;
  }
}

function normalizeSeq(value: unknown) {
  const seq = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(seq) && seq > 0 ? seq : 0;
}

function storedSeqKey(workspaceId: string) {
  return `${LAST_EVENT_SEQ_KEY}${workspaceId}`;
}

function readStoredSeq(workspaceId: string) {
  try {
    return normalizeSeq(window.localStorage.getItem(storedSeqKey(workspaceId)));
  } catch {
    return 0;
  }
}

function writeStoredSeq(workspaceId: string, seq: number) {
  if (!seq) return;
  try {
    window.localStorage.setItem(storedSeqKey(workspaceId), String(seq));
  } catch {}
}

function socketUrl(workspaceId: string, lastEventSeq: number) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL("/api/room/socket", `${protocol}//${window.location.host}`);
  url.searchParams.set("workspaceId", workspaceId);
  if (lastEventSeq > 0) url.searchParams.set("lastEventSeq", String(lastEventSeq));
  return url.toString();
}

function dispatchLiveRoomEvent(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}


// ─── Shared room connection ──────────────────────────────────────────────────
// One socket per signed-in session, owned by <LiveRoomProvider> in the root
// layout, so moving between screens doesn't close and reopen the connection
// (and doesn't trigger the reconnect resync on every navigation). Screens
// subscribe through useLiveRoomReload(); the hub fans events out to them.

// Liveness: any inbound frame proves the socket is real. Mobile networks
// produce half-open sockets (readyState OPEN, peer long gone) that never fire
// `close` — without a receive-side deadline we'd keep "sending" heartbeats into
// the void until the OS notices. 90s ≈ two heartbeat rounds plus slack for
// background-tab timer throttling (~1/min), so a healthy-but-throttled tab
// never trips it.
const LIVENESS_TIMEOUT_MS = 90_000;
const HEARTBEAT_MS = 25_000;
// A socket that stays open this long is "real": only then does the backoff reset.
const STABLE_OPEN_MS = 10_000;
// A connection that never opened (server down, auth bounced, captive portal)
// waits at least this long before trying again.
const NEVER_OPENED_MIN_DELAY_MS = 2_000;
// After this many consecutive failures, back off to the slow lane.
const SLOW_LANE_AFTER_FAILURES = 6;
const SLOW_LANE_MIN_MS = 30_000;
const SLOW_LANE_MAX_MS = 60_000;
// With no screen subscribed (e.g. a screen without live data), keep the socket
// for a while so the next navigation reuses it, then let it go.
const IDLE_CLOSE_MS = 120_000;
// A subscriber that just mounted fetched its own data; the reconnect resync
// skips anything reloaded more recently than this.
const RESYNC_FRESH_MS = 5_000;
const RELOAD_DEBOUNCE_MS = 350;

interface LiveRoomSubscription {
  workspaceId: string;
  actorEmail: () => string;
  resources: () => Set<LiveRoomResource>;
  reload: () => Promise<void> | void;
  // Per-subscriber reload scheduling.
  reloadTimer: number | null;
  reloadInFlight: boolean;
  reloadQueued: boolean;
  pendingWhileHidden: boolean;
  lastReloadAt: number;
}

type LiveRoomSubscriberInput = Pick<LiveRoomSubscription, "workspaceId" | "actorEmail" | "resources" | "reload">;

function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Full-jitter reconnect delay with a floor for never-opened sockets and a slow lane. */
export function liveRoomReconnectDelay(failures: number, everOpened: boolean, random = Math.random()) {
  if (failures >= SLOW_LANE_AFTER_FAILURES) {
    return SLOW_LANE_MIN_MS + random * (SLOW_LANE_MAX_MS - SLOW_LANE_MIN_MS);
  }
  // Full jitter: pick a delay uniformly in [0, cap] so devices reconnecting
  // after a redeploy spread out instead of forming a thundering herd, and a
  // flaky link that drops fast doesn't tight-loop at a fixed floor.
  const ceiling = Math.min(20_000, 1_000 * Math.pow(1.7, failures));
  const delay = random * ceiling;
  return everOpened ? delay : Math.max(NEVER_OPENED_MIN_DELAY_MS, delay);
}

export class LiveRoomHub {
  private subs = new Set<LiveRoomSubscription>();
  private workspaceId = "";
  private socket: WebSocket | null = null;
  private closed = true;
  private failures = 0;
  private openedThisAttempt = false;
  private heartbeat: number | null = null;
  private reconnectTimer: number | null = null;
  private stableTimer: number | null = null;
  private idleTimer: number | null = null;
  private waitingForVisible = false;
  private lastInboundAt = 0;
  private lastEventSeq = 0;
  // The room's latest seq when this socket said hello. Anything at or below it
  // is a replay of the past (catch-up after a reconnect, or the whole buffer
  // for a device with no stored seq): a refetch hint, never live news.
  private replayCeiling = 0;
  // Who is online right now, so a screen that subscribes to an already-open
  // socket still learns about a partner who was here before it mounted.
  private presence = new Map<string, LiveRoomPresenceDetail>();
  private visibilityBound = false;

  subscribe(input: LiveRoomSubscriberInput) {
    const entry: LiveRoomSubscription = {
      ...input,
      reloadTimer: null,
      reloadInFlight: false,
      reloadQueued: false,
      pendingWhileHidden: false,
      lastReloadAt: Date.now(),
    };
    this.subs.add(entry);
    this.clearIdle();
    this.bindVisibility();
    if (this.workspaceId !== input.workspaceId || this.closed) this.open(input.workspaceId);
    else this.replayPresence();
    return () => {
      this.subs.delete(entry);
      if (entry.reloadTimer !== null) window.clearTimeout(entry.reloadTimer);
      entry.reloadTimer = null;
      if (this.subs.size === 0) {
        this.clearIdle();
        this.idleTimer = window.setTimeout(() => this.close(), IDLE_CLOSE_MS);
      }
    };
  }

  dispose() {
    this.close();
    if (this.visibilityBound) document.removeEventListener("visibilitychange", this.onVisibility);
    this.visibilityBound = false;
    for (const sub of this.subs) if (sub.reloadTimer !== null) window.clearTimeout(sub.reloadTimer);
    this.subs.clear();
  }

  private actor() {
    let actor = "";
    for (const sub of this.subs) actor = sub.actorEmail() || actor;
    return actor;
  }

  private bindVisibility() {
    if (this.visibilityBound || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.visibilityBound = true;
  }

  private onVisibility = () => {
    if (isHidden()) {
      // No reconnect attempts from the background: a pending retry waits for
      // the app to come forward.
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.waitingForVisible = true;
      }
      return;
    }
    if (this.waitingForVisible && !this.closed) {
      this.waitingForVisible = false;
      this.connect();
    }
    for (const sub of this.subs) {
      if (sub.pendingWhileHidden) {
        sub.pendingWhileHidden = false;
        this.scheduleReload(sub);
      }
    }
  };

  private open(workspaceId: string) {
    this.close();
    this.workspaceId = workspaceId;
    this.closed = false;
    this.failures = 0;
    this.presence.clear();
    this.lastEventSeq = readStoredSeq(workspaceId);
    this.connect();
  }

  private close() {
    this.closed = true;
    this.clearIdle();
    this.clearHeartbeat();
    this.clearStable();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.waitingForVisible = false;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(); } catch { /* already gone */ }
  }

  private clearIdle() {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearHeartbeat() {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearStable() {
    if (this.stableTimer !== null) window.clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }

  private rememberSeq(value: unknown) {
    const seq = normalizeSeq(value);
    if (!seq || seq <= this.lastEventSeq) return;
    this.lastEventSeq = seq;
    writeStoredSeq(this.workspaceId, seq);
  }

  private replayPresence() {
    if (this.presence.size === 0) return;
    const snapshot = [...this.presence.values()];
    // After the subscribing screen's own listeners attach (later effects).
    window.setTimeout(() => {
      for (const detail of snapshot) dispatchLiveRoomEvent(LIVE_ROOM_PRESENCE, detail);
    }, 0);
  }

  private notePresence(detail: LiveRoomPresenceDetail) {
    const email = (detail.actorEmail || "").toLowerCase();
    if (!email) return;
    const online = detail.status === "online" || detail.status === "active";
    if (online) this.presence.set(email, detail);
    else this.presence.delete(email);
  }

  private scheduleReload(sub: LiveRoomSubscription) {
    sub.lastReloadAt = Date.now();
    if (sub.reloadTimer !== null) window.clearTimeout(sub.reloadTimer);
    sub.reloadTimer = window.setTimeout(() => {
      sub.reloadTimer = null;
      if (!this.subs.has(sub)) return;
      // Don't refetch + re-decrypt the whole resource for a screen the user
      // isn't looking at — on mobile the tab is backgrounded constantly. While
      // hidden, coalesce every missed event into a single reload that fires
      // when the tab becomes visible again (see onVisibility).
      if (isHidden()) {
        sub.pendingWhileHidden = true;
        return;
      }
      if (sub.reloadInFlight) {
        sub.reloadQueued = true;
        return;
      }
      sub.reloadInFlight = true;
      Promise.resolve(sub.reload())
        .catch(() => {})
        .finally(() => {
          sub.reloadInFlight = false;
          if (sub.reloadQueued && this.subs.has(sub)) {
            sub.reloadQueued = false;
            this.scheduleReload(sub);
          }
        });
    }, RELOAD_DEBOUNCE_MS);
  }

  private connect() {
    if (this.closed || !this.workspaceId) return;
    this.reconnectTimer = null;
    this.openedThisAttempt = false;
    this.replayCeiling = 0;
    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl(this.workspaceId, this.lastEventSeq));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.openedThisAttempt = true;
      // Don't reset the backoff immediately: a link that connects then drops
      // within a second would otherwise tight-loop at the floor. Only reset
      // once the socket has stayed open long enough to be real.
      this.clearStable();
      this.stableTimer = window.setTimeout(() => {
        this.failures = 0;
        this.stableTimer = null;
      }, STABLE_OPEN_MS);
      this.clearHeartbeat();
      this.lastInboundAt = Date.now();
      this.heartbeat = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastInboundAt > LIVENESS_TIMEOUT_MS) {
          // Dead peer: force the close path so the jittered reconnect (and
          // its resync-on-open) takes over instead of a zombie connection.
          try { socket.close(); } catch { /* already gone */ }
          return;
        }
        socket.send(JSON.stringify({ type: "heartbeat" }));
      }, HEARTBEAT_MS);
      // The WS replay buffer is capped server-side, so a client that was
      // offline past the cap would silently miss events. Treat every
      // (re)connect as an invalidation signal and reconcile every subscribed
      // resource from the source of truth. Screens that loaded within the
      // last few seconds are skipped (a fresh mount already has current
      // data), so a first connect doesn't double-fetch and rapid reconnects
      // don't storm.
      for (const sub of this.subs) {
        if (sub.resources().size > 0 && Date.now() - sub.lastReloadAt > RESYNC_FRESH_MS) {
          this.scheduleReload(sub);
        }
      }
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      // Any frame (hello/event/presence/pong) counts as proof of life.
      this.lastInboundAt = Date.now();
      const message = parseMessage(event);
      if (!message) return;
      const actor = this.actor();
      if (message.type === "room.hello") {
        this.replayCeiling = normalizeSeq(message.latestSeq);
        if (this.lastEventSeq <= 0) this.rememberSeq(message.latestSeq);
        // Surface who is ALREADY present as presence events — plain presence
        // only covers online/offline changes after we connect, so without this
        // a freshly-opened screen can't tell a partner who's already online.
        this.presence.clear();
        if (Array.isArray(message.online)) {
          for (const email of message.online) {
            if ((email || "").toLowerCase() === actor) continue;
            const detail: LiveRoomPresenceDetail = { actorEmail: email, status: "online", at: message.at };
            this.notePresence(detail);
            dispatchLiveRoomEvent(LIVE_ROOM_PRESENCE, detail);
          }
        }
        return;
      }
      if (message.type === "room.event") {
        const roomEvent = message.event || {};
        const seq = normalizeSeq(message.seq || roomEvent.seq);
        const replayed = seq > 0 && seq <= this.replayCeiling;
        this.rememberSeq(seq);
        // An event with no actor (or a hub with no signed-in subscriber yet)
        // is never a self-echo: "" === "" must not swallow it.
        const fromMe = Boolean(actor) && Boolean(roomEvent.actorEmail) && String(roomEvent.actorEmail).toLowerCase() === actor;
        if (!fromMe && roomEvent.resource) {
          // Replays only refresh the screens that show this resource (the
          // debounce folds a whole catch-up into one reload). They are never
          // dispatched, so nothing navigates, toasts or bumps an unread count
          // for something that happened before this connection.
          if (!replayed) dispatchLiveRoomEvent(LIVE_ROOM_EVENT, roomEvent);
          for (const sub of this.subs) {
            if (sub.resources().has(roomEvent.resource as LiveRoomResource)) this.scheduleReload(sub);
          }
        }
        return;
      }
      if (message.type === "room.presence") {
        const fromMe = Boolean(actor) && Boolean(message.actorEmail) && String(message.actorEmail).toLowerCase() === actor;
        if (!fromMe) {
          const detail: LiveRoomPresenceDetail = {
            actorEmail: message.actorEmail,
            actorName: message.actorName,
            status: message.status,
            at: message.at,
          };
          this.notePresence(detail);
          dispatchLiveRoomEvent(LIVE_ROOM_PRESENCE, detail);
          for (const sub of this.subs) {
            if (sub.resources().has("presence")) this.scheduleReload(sub);
          }
        }
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearHeartbeat();
      this.clearStable();
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      try { socket.close(); } catch { /* already gone */ }
    });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const delay = liveRoomReconnectDelay(this.failures, this.openedThisAttempt);
    this.failures += 1;
    // Never retry from the background; the visibility handler reconnects as
    // soon as the app is in front again.
    if (isHidden()) {
      this.waitingForVisible = true;
      return;
    }
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }
}

let fallbackHub: LiveRoomHub | null = null;
/** Provided by <LiveRoomProvider>; screens outside it share a module-level hub. */
export const LiveRoomContext = createContext<LiveRoomHub | null>(null);

function fallbackLiveRoomHub(): LiveRoomHub | null {
  if (typeof window === "undefined" || !("WebSocket" in window)) return null;
  if (!fallbackHub) fallbackHub = new LiveRoomHub();
  return fallbackHub;
}

export function useLiveRoomReload({
  workspaceId,
  actorEmail,
  resources,
  onReload,
}: {
  workspaceId?: string;
  actorEmail?: string;
  resources: LiveRoomResource[];
  onReload: () => Promise<void> | void;
}) {
  const provided = useContext(LiveRoomContext);
  const reloadRef = useRef(onReload);
  const resourceRef = useRef(new Set(resources));
  const actorRef = useRef((actorEmail || "").toLowerCase());

  useEffect(() => { reloadRef.current = onReload; }, [onReload]);
  useEffect(() => { resourceRef.current = new Set(resources); }, [resources]);
  useEffect(() => { actorRef.current = (actorEmail || "").toLowerCase(); }, [actorEmail]);

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined" || !("WebSocket" in window)) return;
    const hub = provided || fallbackLiveRoomHub();
    if (!hub) return;
    return hub.subscribe({
      workspaceId,
      actorEmail: () => actorRef.current,
      resources: () => resourceRef.current,
      reload: () => reloadRef.current(),
    });
  }, [provided, workspaceId]);
}
