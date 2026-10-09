"use client";

import { useEffect } from "react";

/** How long the shell atmosphere drifts after launch before it rests. */
const ATMOSPHERE_DRIFT_MS = 20_000;

/**
 * One global switchboard for ambient motion (DESIGN.md "Ambient loops").
 * Renders nothing; it only sets two attributes on <html> that CSS keys off:
 *
 * - `data-page-hidden` while the document is hidden, so every decorative
 *   loop pauses (`animation-play-state: paused`) instead of ticking in the
 *   background.
 * - `data-atm-rest` once the launch drift has played, so the atmosphere
 *   stays still on later screens rather than restarting with each route.
 */
export default function AmbientMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (document.hidden) root.setAttribute("data-page-hidden", "");
      else root.removeAttribute("data-page-hidden");
    };
    sync();
    document.addEventListener("visibilitychange", sync);

    // The drift timer counts visible time only, so a launch straight into the
    // background still gets its one drift when the app comes forward.
    let remaining = ATMOSPHERE_DRIFT_MS;
    let startedAt = 0;
    let timer: number | undefined;
    const rest = () => {
      root.setAttribute("data-atm-rest", "");
      timer = undefined;
    };
    const schedule = () => {
      if (root.hasAttribute("data-atm-rest")) return;
      if (document.hidden) {
        if (timer !== undefined) {
          window.clearTimeout(timer);
          timer = undefined;
          remaining = Math.max(0, remaining - (performance.now() - startedAt));
        }
        return;
      }
      if (timer === undefined) {
        startedAt = performance.now();
        timer = window.setTimeout(rest, remaining);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("visibilitychange", schedule);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return null;
}
