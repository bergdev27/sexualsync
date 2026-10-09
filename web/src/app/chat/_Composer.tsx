"use client";

/**
 * The Sext text field and send button. It owns the draft, so a keystroke
 * re-renders only this component instead of the whole thread. The page talks
 * to it through a small imperative handle (set / append / clear / submit) for
 * the few moments it needs the text: starting an edit, the emoji palette, and
 * restoring a draft after a failed send.
 */

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { sendChatTyping } from "@/lib/api";
import { mergeHandoffDraft } from "@/lib/chat-draft";

export const MAX_INPUT = 4000;
const TYPING_THROTTLE_MS = 3000;
// Draft persistence waits for a pause in typing; pagehide, send and unmount
// flush it right away so nothing typed is lost.
const DRAFT_PERSIST_DELAY_MS = 400;

// Persist the composer draft per workspace so a half-typed message survives a
// reload / navigating away (e.g. to check a notification) instead of vanishing.
const sextDraftKey = (workspaceId: string) => `ss:sext:draft:${workspaceId}`;
function readPersistedDraft(workspaceId: string): string {
  if (typeof window === "undefined" || !workspaceId) return "";
  try { return window.localStorage.getItem(sextDraftKey(workspaceId)) || ""; } catch { return ""; }
}
function writePersistedDraft(workspaceId: string, value: string): void {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (value.trim()) window.localStorage.setItem(sextDraftKey(workspaceId), value);
    else window.localStorage.removeItem(sextDraftKey(workspaceId));
  } catch { /* storage blocked — the draft just won't persist, no harm */ }
}

export type ComposerHandle = {
  /** Replace the text (start an edit, restore after a failed send). */
  set: (text: string) => void;
  /** Append at the end (emoji palette). */
  append: (text: string) => void;
  /** Put an unsent message back, after anything already typed. */
  restore: (text: string) => void;
  /** Words handed in from elsewhere (a plan teaser, a Kink, a prompt): see mergeHandoffDraft. */
  handoff: (text: string, isKnownPrefill: (text: string) => boolean) => void;
  /** Empty the field. */
  clear: () => void;
  /** Send what's typed, as the submit button would. */
  submit: () => void;
};

type ComposerProps = {
  workspaceId: string;
  partnerName: string;
  /** Editing an existing message: the text isn't a new-message draft. */
  editing: boolean;
  sending: boolean;
  /** Called with the trimmed text; the page decides when to clear. */
  onSend: (text: string) => void;
  onPasteImage: (file: File) => void;
  /** Field focused (the page re-pins the thread once the keyboard is up). */
  onFocus: () => void;
};

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { workspaceId, partnerName, editing, sending, onSend, onPasteImage, onFocus },
  ref,
) {
  const [draft, setDraft] = useState(() => readPersistedDraft(workspaceId));
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingSentRef = useRef(0);

  // Debounced persistence. The pending value lives in a ref so pagehide and
  // unmount can flush it synchronously.
  const pendingRef = useRef<{ value: string; timer: number } | null>(null);
  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRef.current = null;
    writePersistedDraft(workspaceId, pending.value);
  }, [workspaceId]);
  useEffect(() => {
    if (editing) return;
    if (pendingRef.current) window.clearTimeout(pendingRef.current.timer);
    const timer = window.setTimeout(flush, DRAFT_PERSIST_DELAY_MS);
    pendingRef.current = { value: draft, timer };
  }, [draft, editing, flush]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // Grow the field to fit what you're typing (iMessage-style), capped so it
  // never eats the thread; past the cap it scrolls. Runs on every draft change
  // — typing, clearing after send, and populating it to edit a message.
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    // Defer the scrollHeight read/write off the keystroke's critical path so a
    // forced reflow doesn't land on every character (rAF coalesces it).
    const raf = requestAnimationFrame(() => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
    return () => cancelAnimationFrame(raf);
  }, [draft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
  }, [draft, onSend]);

  useImperativeHandle(ref, () => ({
    set: (text: string) => setDraft(text),
    append: (text: string) => setDraft((d) => (d + text).slice(0, MAX_INPUT)),
    restore: (text: string) => setDraft((d) => (d.trim() ? `${d}\n${text}` : text).slice(0, MAX_INPUT)),
    handoff: (text: string, isKnownPrefill: (text: string) => boolean) => setDraft((d) => mergeHandoffDraft(d, text, isKnownPrefill).slice(0, MAX_INPUT)),
    clear: () => {
      setDraft("");
      // A sent message must not come back as a draft after a quick reload.
      if (pendingRef.current) window.clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
      if (!editing) writePersistedDraft(workspaceId, "");
    },
    submit,
  }), [editing, submit, workspaceId]);

  function emitTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    void sendChatTyping(workspaceId);
  }

  return (
    <>
      <textarea
        ref={fieldRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); emitTyping(); }}
        onPaste={(e) => {
          const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith("image/"));
          if (item) { const file = item.getAsFile(); if (file) { e.preventDefault(); onPasteImage(file); } }
        }}
        onKeyDown={(e) => {
          // Enter sends only with a real keyboard (desktop / non-touch). On a
          // phone the Return key must insert a newline so you can write more
          // than one sentence — sending is the dedicated send button. (A
          // hardware Shift+Enter always inserts a newline regardless.)
          const coarsePointer = typeof window !== "undefined"
            && typeof window.matchMedia === "function"
            && window.matchMedia("(pointer: coarse)").matches;
          if (e.key === "Enter" && !e.shiftKey && !coarsePointer) { e.preventDefault(); submit(); }
        }}
        onFocus={onFocus}
        placeholder={`Message ${partnerName}…`}
        aria-label={`Message ${partnerName}`}
        rows={1}
        className="chat-input"
        maxLength={MAX_INPUT}
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        inputMode="text"
      />
      <button
        type="submit"
        className="chat-send pressable"
        disabled={!draft.trim() || sending}
        aria-label={editing ? "Save edit" : "Send message"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 19.5V5M12 5l-6.5 6.5M12 5l6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
});

export default memo(Composer);
