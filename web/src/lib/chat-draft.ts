// One-shot handoff of words to drop into the Sext composer when they are the
// person's own content (Kink detail's "Talk first" quotes the Kink). They ride
// in sessionStorage, never the URL: in a static export a client navigation
// requests `/chat.txt?<query>` from the host, so anything in the query string
// leaves the device, and under Room Encryption the Kink text is plaintext only
// here. Fixed app copy (the plan teaser) can still use `?draft=`.

const KEY = "ss:chat-draft-handoff";
const MAX_LEN = 1000;
// A handoff nobody picked up (the navigation failed) goes stale quickly.
const MAX_AGE_MS = 5 * 60_000;

export const CHAT_DRAFT_HANDOFF_HREF = "/chat?compose=1";

// Returns false when storage is unavailable, so the caller can fall back.
export function stashChatDraft(text: string): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text: String(text || "").slice(0, MAX_LEN), at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

// Read once and clear.
export function consumeChatDraft(now = Date.now()): string {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string") return "";
    if (!(now - Number(parsed.at) <= MAX_AGE_MS)) return "";
    return parsed.text.slice(0, MAX_LEN);
  } catch {
    return "";
  }
}

// Where handed-off words land in a composer that may already hold a draft.
// Empty: they fill it. Already the same words: nothing changes. A draft that is
// only a known prefill (a plan teaser stem like "Tonight I'm going to ", or a
// prompt chip) is replaced, so stems never stack up. Anything the person typed
// themselves is kept, and the new words go on the next line.
export function mergeHandoffDraft(
  current: string,
  incoming: string,
  isKnownPrefill: (text: string) => boolean,
): string {
  if (!incoming.trim()) return current;
  if (!current.trim()) return incoming;
  if (current.trim() === incoming.trim()) return current;
  if (isKnownPrefill(current)) return incoming;
  return `${current}\n${incoming}`;
}
