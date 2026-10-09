// The offline write queue's flush loop: transient failures stay queued for the
// backoff, writes the server refuses for good are dropped and announced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A minimal in-memory IndexedDB: one object store, add/getAll/put/delete,
// requests that succeed on the next microtask and transactions that complete
// once every request has.
class FakeRequest<T> {
  result: T | undefined;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
  private pending = 0;
  constructor(private rows: Map<number, Record<string, unknown>>, private nextId: { value: number }) {}
  objectStore() {
    const request = <T>(work: () => T) => {
      const req = new FakeRequest<T>();
      this.pending += 1;
      queueMicrotask(() => {
        req.result = work();
        req.onsuccess?.();
        this.pending -= 1;
        if (this.pending === 0) queueMicrotask(() => this.oncomplete?.());
      });
      return req;
    };
    return {
      add: (value: Record<string, unknown>) => request(() => {
        const id = this.nextId.value++;
        this.rows.set(id, structuredClone({ ...value, id }));
        return id;
      }),
      put: (value: Record<string, unknown>) => request(() => {
        this.rows.set(value.id as number, structuredClone(value));
        return value.id;
      }),
      delete: (id: number) => request(() => { this.rows.delete(id); return undefined; }),
      getAll: () => request(() => [...this.rows.values()].map((row) => structuredClone(row))),
    };
  }
}

function installFakeIndexedDb() {
  const rows = new Map<number, Record<string, unknown>>();
  const nextId = { value: 1 };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => new FakeTransaction(rows, nextId),
  };
  vi.stubGlobal("IDBRequest", FakeRequest);
  vi.stubGlobal("indexedDB", {
    open: () => {
      const req = new FakeRequest<typeof db>() as FakeRequest<typeof db> & { onupgradeneeded: (() => void) | null };
      req.onupgradeneeded = null;
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  });
  return rows;
}

type Dispatched = { type: string; detail?: Record<string, unknown> };
let dispatched: Dispatched[] = [];
let rows: Map<number, Record<string, unknown>>;

beforeEach(() => {
  vi.resetModules();
  dispatched = [];
  rows = installFakeIndexedDb();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
    dispatchEvent: (event: Event & { detail?: Record<string, unknown> }) => {
      dispatched.push({ type: event.type, detail: event.detail });
      return true;
    },
  });
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function queueOneChatSend() {
  const queue = await import("../offline-queue");
  await queue.enqueueWrite({
    intent: "chat:send",
    idempotencyKey: "key-1",
    url: "/api/chat",
    method: "POST",
    body: { text: "hi" },
  });
  return queue;
}

const drops = () => dispatched.filter((entry) => entry.type === "ss:offline-write-dropped");

describe("isTerminalQueueStatus", () => {
  it("treats refusals as terminal and timing problems as retriable", async () => {
    const { isTerminalQueueStatus } = await import("../offline-queue");
    for (const status of [400, 403, 404, 410, 413, 422]) expect(isTerminalQueueStatus(status)).toBe(true);
    for (const status of [200, 401, 408, 425, 429, 500, 503]) expect(isTerminalQueueStatus(status)).toBe(false);
  });
});

describe("flushOfflineQueue", () => {
  it("drops a write the server refuses for good and passes the reason on", async () => {
    const queue = await queueOneChatSend();
    const fetchMock = respondWith(400, { error: "Room Encryption requires encrypted messages." });

    const result = await queue.flushOfflineQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.pending).toBe(0);
    expect(rows.size).toBe(0);
    expect(drops()).toHaveLength(1);
    expect(drops()[0].detail).toMatchObject({
      intent: "chat:send",
      idempotencyKey: "key-1",
      serverError: "Room Encryption requires encrypted messages.",
    });
    expect(String(drops()[0].detail?.reason)).toContain("Room Encryption requires encrypted messages.");
  });

  it("drops a write after removal from the room (403) even without a body", async () => {
    const queue = await queueOneChatSend();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));

    const result = await queue.flushOfflineQueue();

    expect(result.pending).toBe(0);
    expect(drops()).toHaveLength(1);
    expect(drops()[0].detail?.serverError).toBeUndefined();
  });

  it("keeps rate-limited and server-error writes queued for the backoff", async () => {
    const queue = await queueOneChatSend();
    respondWith(429, { error: "Slow down." });
    expect((await queue.flushOfflineQueue()).pending).toBe(1);

    respondWith(503, { error: "Try later." });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await queue.flushOfflineQueue()).pending).toBe(1);
    vi.useRealTimers();

    expect(drops()).toHaveLength(0);
    expect([...rows.values()][0].attempts).toBe(2);
  });

  it("removes a write once the server accepts it", async () => {
    const queue = await queueOneChatSend();
    respondWith(201, { ok: true });
    expect((await queue.flushOfflineQueue()).flushed).toBe(1);
    expect(rows.size).toBe(0);
    expect(drops()).toHaveLength(0);
  });
});
