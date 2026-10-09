/**
 * One app-level polite announcer for screen readers.
 *
 * Visual-only confirmations (the send pulse, a toast that is aria-hidden for
 * motion reasons) call `announce()` so their words still reach assistive
 * tech. RouteAnnouncer (root layout) owns the single live region and speaks
 * both route changes and these messages, so the page never grows a second
 * competing live region.
 */

export const ANNOUNCE_EVENT = "ss:announce";

export function announce(message: string): void {
  if (typeof window === "undefined") return;
  const text = (message || "").trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent<string>(ANNOUNCE_EVENT, { detail: text }));
}
