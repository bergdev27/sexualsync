/**
 * Shared-element morph into the match moment (/mutual).
 *
 * Plain same-document View Transitions around a client navigation: the tapped
 * Sexboard row's title is named `match-hero`, the transition snapshots it, the
 * router navigates, and the callback resolves once /mutual has rendered its own
 * `[data-match-hero]` (which carries the same view-transition-name). Browsers
 * without `document.startViewTransition`, and anyone with reduced motion, get
 * the normal navigation; the caller lets the <Link> handle it.
 */

export const MATCH_HERO_VT_NAME = "match-hero";

// Set for the single navigation that is morphing, read once by /mutual so it
// can skip its own entrance on the hero (the morph already brought it in).
let pendingMorph = false;

export function consumeMatchMorph(): boolean {
  const value = pendingMorph;
  pendingMorph = false;
  return value;
}

export function supportsMatchMorph(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (typeof document.startViewTransition !== "function") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // matchMedia unavailable: treat as no preference.
  }
  return true;
}

const HERO_SELECTOR = "[data-match-hero][data-ready='1']";
const MAX_WAIT_MS = 900;

function waitForHero(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(HERO_SELECTOR)) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector(HERO_SELECTOR)) finish();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
    const timer = window.setTimeout(finish, MAX_WAIT_MS);
  });
}

/**
 * Navigate to `href` (a /mutual URL) morphing `source` into the match hero.
 * Returns true when it took over the navigation; false means "not supported,
 * let the link navigate normally".
 */
export function navigateWithMatchMorph(
  push: (href: string) => void,
  href: string,
  source: HTMLElement | null,
): boolean {
  if (!source || !supportsMatchMorph()) return false;
  source.style.setProperty("view-transition-name", MATCH_HERO_VT_NAME);
  pendingMorph = true;
  try {
    const transition = document.startViewTransition(async () => {
      // The old snapshot is taken before this callback runs; release the name
      // so only the new page's hero carries it.
      source.style.removeProperty("view-transition-name");
      push(href);
      await waitForHero();
    });
    // A skipped transition (another navigation, hidden tab) rejects `ready`
    // and `updateCallbackDone` too, not just `finished`; swallow all three so
    // none surfaces as an unhandled rejection.
    transition.ready?.catch(() => undefined);
    transition.updateCallbackDone?.catch(() => undefined);
    transition.finished.catch(() => undefined).finally(() => {
      source.style.removeProperty("view-transition-name");
    });
  } catch {
    source.style.removeProperty("view-transition-name");
    pendingMorph = false;
    return false;
  }
  return true;
}
