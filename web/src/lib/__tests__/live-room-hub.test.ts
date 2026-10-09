// The shared live-room connection: one socket survives screen changes, the
// reconnect backoff has a floor and a slow lane, and nothing reconnects while
// the app is in the background.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_ROOM_EVENT, LiveRoomHub, isStaleRoomEvent, liveRoomReconnectDelay, moodRoomAction, type LiveRoomEventDetail } from "../use-live-room";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  url: string;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), fn]);
  }
  emit(type: string, event: unknown = {}) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  // The room answers every heartbeat, which keeps the liveness check happy.
  send() {
    this.emit("message", { data: JSON.stringify({ type: "pong" }) });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close");
  }
}

let visibility: "visible" | "hidden" = "visible";
const docListeners = new Map<string, Array<() => void>>();

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  visibility = "visible";
  docListeners.clear();
  const storage = new Map<string, string>();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("document", {
    get visibilityState() { return visibility; },
    addEventListener: (type: string, fn: () => void) => docListeners.set(type, [...(docListeners.get(type) || []), fn]),
    removeEventListener: (type: string, fn: () => void) => docListeners.set(type, (docListeners.get(type) || []).filter((f) => f !== fn)),
  });
  vi.stubGlobal("window", {
    location: { protocol: "https:", host: "example.test" },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
    dispatchEvent: () => true,
    WebSocket: FakeSocket,
  });
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: unknown) {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setVisibility(next: "visible" | "hidden") {
  visibility = next;
  for (const fn of docListeners.get("visibilitychange") || []) fn();
}

const subscriber = (reload = vi.fn()) => ({
  workspaceId: "room-1",
  actorEmail: () => "alex@example.test",
  resources: () => new Set(["chat" as const]),
  reload,
});

describe("liveRoomReconnectDelay", () => {
  it("waits at least 2s after a connection that never opened", () => {
    expect(liveRoomReconnectDelay(0, false, 0)).toBe(2_000);
    expect(liveRoomReconnectDelay(0, true, 0)).toBe(0);
  });

  it("moves to a 30-60s slow lane after six straight failures", () => {
    expect(liveRoomReconnectDelay(5, true, 1)).toBeLessThanOrEqual(20_000);
    expect(liveRoomReconnectDelay(6, true, 0)).toBe(30_000);
    expect(liveRoomReconnectDelay(9, false, 1)).toBe(60_000);
  });
});

describe("LiveRoomHub", () => {
  it("keeps one socket across a screen change", () => {
    const hub = new LiveRoomHub();
    const leave = hub.subscribe(subscriber());
    expect(FakeSocket.instances).toHaveLength(1);
    FakeSocket.instances[0].open();
    leave();
    hub.subscribe(subscriber());
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].readyState).toBe(1);
    hub.dispose();
  });

  it("does not resync a screen that just loaded when the socket opens", () => {
    const hub = new LiveRoomHub();
    const reload = vi.fn();
    hub.subscribe(subscriber(reload));
    FakeSocket.instances[0].open();
    vi.advanceTimersByTime(1_000);
    expect(reload).not.toHaveBeenCalled();
    hub.dispose();
  });

  it("closes an idle socket a while after the last screen leaves", () => {
    const hub = new LiveRoomHub();
    const leave = hub.subscribe(subscriber());
    FakeSocket.instances[0].open();
    leave();
    vi.advanceTimersByTime(119_000);
    expect(FakeSocket.instances[0].readyState).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(FakeSocket.instances[0].readyState).toBe(3);
    hub.dispose();
  });

  it("holds reconnects while hidden and reconnects on return", () => {
    const hub = new LiveRoomHub();
    hub.subscribe(subscriber());
    FakeSocket.instances[0].open();
    setVisibility("hidden");
    FakeSocket.instances[0].close();
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    setVisibility("visible");
    expect(FakeSocket.instances).toHaveLength(2);
    hub.dispose();
  });

  it("never retries a refused connection sooner than 2s", () => {
    const hub = new LiveRoomHub();
    hub.subscribe(subscriber());
    FakeSocket.instances[0].close();
    vi.advanceTimersByTime(1_999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    hub.dispose();
  });

  it("fans an actorless mood match out once, however many screens are subscribed", () => {
    const dispatched: Array<{ type: string; detail: LiveRoomEventDetail }> = [];
    (window as unknown as { dispatchEvent: (event: unknown) => boolean }).dispatchEvent = (event) => {
      const custom = event as { type: string; init: { detail: LiveRoomEventDetail } };
      dispatched.push({ type: custom.type, detail: custom.init.detail });
      return true;
    };
    const roomEvents = () => dispatched.filter((entry) => entry.type === LIVE_ROOM_EVENT);
    const hub = new LiveRoomHub();
    const moodReload = vi.fn();
    hub.subscribe(subscriber());
    hub.subscribe({ ...subscriber(moodReload), resources: () => new Set(["mood" as const]) });
    expect(FakeSocket.instances).toHaveLength(1);
    const socket = FakeSocket.instances[0];
    socket.open();
    const send = (event: LiveRoomEventDetail, seq: number) =>
      socket.emit("message", { data: JSON.stringify({ type: "room.event", seq, event: { ...event, seq } }) });

    // Mood events carry no actor, so they reach both partners' devices.
    send({ resource: "mood", action: "match", entityId: "2026-05-23T01:00:00.000Z" }, 7);
    expect(roomEvents()).toHaveLength(1);
    expect(moodRoomAction(roomEvents()[0].detail)).toBe("match");
    vi.advanceTimersByTime(400);
    expect(moodReload).toHaveBeenCalledTimes(1);

    // My own writes never echo back as live activity.
    send({ resource: "chat", action: "created", actorEmail: "alex@example.test" }, 8);
    expect(roomEvents()).toHaveLength(1);
    hub.dispose();
  });

  it("treats actorless events as the partner's when no subscriber has an actor yet", () => {
    const dispatched: Array<{ type: string; detail: unknown }> = [];
    (window as unknown as { dispatchEvent: (event: unknown) => boolean }).dispatchEvent = (event) => {
      const custom = event as { type: string; init: { detail: unknown } };
      dispatched.push({ type: custom.type, detail: custom.init.detail });
      return true;
    };
    const hub = new LiveRoomHub();
    const reload = vi.fn();
    hub.subscribe({ ...subscriber(reload), actorEmail: () => "" });
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.emit("message", { data: JSON.stringify({ type: "room.event", seq: 3, event: { resource: "chat", action: "created", seq: 3 } }) });
    expect(dispatched.filter((entry) => entry.type === LIVE_ROOM_EVENT)).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);
    socket.emit("message", { data: JSON.stringify({ type: "room.presence", actorEmail: "", status: "online", at: "2026-05-23T01:00:00.000Z" }) });
    expect(dispatched.filter((entry) => entry.type !== LIVE_ROOM_EVENT)).toHaveLength(1);
    hub.dispose();
  });

  it("refetches on replayed events but never dispatches them as live", () => {
    const dispatched: Array<{ type: string; detail: LiveRoomEventDetail }> = [];
    (window as unknown as { dispatchEvent: (event: unknown) => boolean }).dispatchEvent = (event) => {
      const custom = event as { type: string; init: { detail: LiveRoomEventDetail } };
      dispatched.push({ type: custom.type, detail: custom.init.detail });
      return true;
    };
    const roomEvents = () => dispatched.filter((entry) => entry.type === LIVE_ROOM_EVENT);
    const hub = new LiveRoomHub();
    const reload = vi.fn();
    hub.subscribe({ ...subscriber(reload), resources: () => new Set(["request-board" as const]) });
    const socket = FakeSocket.instances[0];
    // A fresh device: no stored seq, so the server replays its buffer after hello.
    expect(socket.url).not.toContain("lastEventSeq");
    socket.open();
    socket.emit("message", { data: JSON.stringify({ type: "room.hello", latestSeq: 12, online: [] }) });
    for (const seq of [10, 11, 12]) {
      socket.emit("message", { data: JSON.stringify({
        type: "room.event",
        seq,
        event: { seq, resource: "request-board", action: "counter_accepted", entityId: "r1", actorEmail: "jordan@example.test" },
      }) });
    }
    expect(roomEvents()).toHaveLength(0);
    vi.advanceTimersByTime(400);
    expect(reload).toHaveBeenCalledTimes(1);

    // Something that happens after the hello is live news.
    socket.emit("message", { data: JSON.stringify({
      type: "room.event",
      seq: 13,
      event: { seq: 13, resource: "request-board", action: "counter_accepted", entityId: "r2", actorEmail: "jordan@example.test" },
    }) });
    expect(roomEvents()).toHaveLength(1);
    expect(roomEvents()[0].detail.entityId).toBe("r2");
    hub.dispose();
  });
});

describe("isStaleRoomEvent", () => {
  it("flags events stamped more than a minute ago, not undated ones", () => {
    const now = Date.parse("2026-05-23T01:00:00.000Z");
    expect(isStaleRoomEvent({ at: "2026-05-23T00:58:00.000Z" }, now)).toBe(true);
    expect(isStaleRoomEvent({ at: "2026-05-23T00:59:30.000Z" }, now)).toBe(false);
    expect(isStaleRoomEvent({}, now)).toBe(false);
  });
});
