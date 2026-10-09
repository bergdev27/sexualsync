"use client";

/**
 * Connectivity helpers shared by every screen.
 *
 *  - useOnlineStatus(): live navigator.onLine, hydration-safe (the server
 *    snapshot is "online" so SSR and the first client paint agree).
 *  - useRecoverOnReconnect(fn, enabled): re-run a failed load when the network
 *    comes back or the app returns to the foreground. This is what keeps an
 *    error state from being a dead end: nobody has to find a retry button
 *    after their phone reconnects.
 *  - describeLoadError(error, what): turn transport / server failures into
 *    plain copy. Raw strings like "Failed to fetch" or "Internal error" never
 *    reach the screen.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function getServerSnapshot(): boolean {
  return true;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** True while the browser reports a network connection. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Two triggers can fire together (iOS sends `online` and `visibilitychange`
// back to back when the app is reopened on a fresh connection). One retry is
// enough; the second lands inside this window and is dropped.
const RECOVER_DEBOUNCE_MS = 1200;

/**
 * Calls `recover` when the device comes back online, or when the app becomes
 * visible again while online. Only armed while `enabled` is true, so a screen
 * passes `state.kind === "error"` (or similar) and stays quiet otherwise.
 */
export function useRecoverOnReconnect(recover: () => unknown, enabled: boolean): void {
  const recoverRef = useRef(recover);
  useEffect(() => { recoverRef.current = recover; }, [recover]);

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const run = () => {
      if (isOffline()) return;
      const now = Date.now();
      if (now - last < RECOVER_DEBOUNCE_MS) return;
      last = now;
      try {
        const result = recoverRef.current();
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          (result as Promise<unknown>).catch(() => {});
        }
      } catch {
        // The screen's own error state already covers a failed retry.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

export interface LoadErrorCopy {
  title: string;
  body: string;
  /** "offline" while the device has no connection; the UI waits instead of nagging. */
  tone: "offline" | "network" | "server" | "busy" | "message";
}

// Browser transport failures differ per engine; none of them are human copy.
const TRANSPORT_PATTERNS = [
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /network request failed/i,
  /network connection was lost/i,
  /internet connection appears to be offline/i,
  /^offline/i,
  /fetch failed/i,
];
const TIMEOUT_PATTERNS = [/timed out/i, /timeout/i];
const SERVER_PATTERNS = [
  /^internal error/i,
  /^internal server error/i,
  /^bad gateway/i,
  /^service unavailable/i,
  /^gateway timeout/i,
  /^request failed/i,
  /^something went sideways/i,
  /^unexpected/i,
  /^couldn.t load/i,
  /^\s*$/,
];
const BUSY_PATTERNS = [/too many/i, /rate limit/i];

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "";
  return "";
}

function errorStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 0;
}

/**
 * Plain-language copy for a failed load. `what` names the thing that didn't
 * load ("your Sexboard", "Play"), used in the title.
 */
export function describeLoadError(error: unknown, what: string): LoadErrorCopy {
  const message = errorMessage(error).trim();
  const status = errorStatus(error);

  if (isOffline()) {
    return {
      title: "You're offline",
      body: `${capitalize(what)} will load as soon as you're back online.`,
      tone: "offline",
    };
  }
  if (TRANSPORT_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      title: "Couldn't connect",
      body: "Check your connection, then try again. We'll also retry when your signal comes back.",
      tone: "network",
    };
  }
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      title: "This is taking too long",
      body: "The connection is slow right now. Try again in a moment.",
      tone: "network",
    };
  }
  if (status === 429 || BUSY_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      title: "Too many tries",
      body: "Give it a few seconds, then try again.",
      tone: "busy",
    };
  }
  if (status >= 500 || SERVER_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      title: `Couldn't load ${what}`,
      body: "Something went wrong on our side. Try again in a moment.",
      tone: "server",
    };
  }
  // A 4xx with a written reason ("Choose a room first.") is already human copy.
  return {
    title: `Couldn't load ${what}`,
    body: /[.!?]$/.test(message) ? message : `${message}.`,
    tone: "message",
  };
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
