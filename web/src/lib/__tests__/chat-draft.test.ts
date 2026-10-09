import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_DRAFT_HANDOFF_HREF, consumeChatDraft, stashChatDraft } from "../chat-draft";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

describe("chat draft handoff", () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = memoryStorage();
  });

  it("keeps the words out of the URL", () => {
    expect(CHAT_DRAFT_HANDOFF_HREF).toBe("/chat?compose=1");
  });

  it("hands the words over once", () => {
    expect(stashChatDraft('About "a secret": ')).toBe(true);
    expect(consumeChatDraft()).toBe('About "a secret": ');
    expect(consumeChatDraft()).toBe("");
  });

  it("drops a stale handoff nobody picked up", () => {
    stashChatDraft("old words");
    expect(consumeChatDraft(Date.now() + 10 * 60_000)).toBe("");
  });

  it("returns nothing when storage is unavailable", () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(stashChatDraft("x")).toBe(false);
    expect(consumeChatDraft()).toBe("");
  });
});
