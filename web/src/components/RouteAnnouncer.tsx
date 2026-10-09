"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ANNOUNCE_EVENT } from "@/lib/announce";

// Discretion keeps document.title statically "Private notes" on every route,
// which silences Next's built-in route announcer (it only speaks when the
// title CHANGES) — so without this, every client-side navigation is a silent
// page swap for screen-reader users. This announcer lives in the persistent
// root layout (page-level AppShells remount per navigation and would reset),
// moves focus to the new screen's main region, and speaks an IN-APP screen
// name through a polite live region — the OS-visible title stays generic.
const SCREEN_NAMES: Record<string, string> = {
  "/": "Welcome",
  "/welcome": "Welcome",
  "/signin": "Sign in",
  "/signed-out": "Signed out",
  "/onboarding": "Set up your room",
  "/sexboard": "Home",
  "/tonight": "Tonight",
  "/ask": "New Ask",
  "/ask-detail": "Ask details",
  "/review": "Ask details",
  "/chat": "Sext",
  "/mutual": "It's a match",
  "/space": "Us",
  "/space/acts": "Acts",
  "/space/limits": "Limits",
  "/space/notes": "Private notes",
  "/space/health": "Health",
  "/space/vault": "Vault",
  "/space/privacy": "Privacy",
  "/space/tutorial": "Tutorial",
  "/limits": "Limits",
  "/games": "Play",
  "/games/sex-quiz": "Sex Quiz",
  "/games/green-lights": "Green Lights",
  "/games/pile": "The Pile",
  "/games/blind-reveal": "Blind Reveal",
  "/inspiration": "Inspiration",
  "/inspiration/kink": "Kink",
  "/inspiration/shelf": "Shelf",
  "/share": "Save to Shelf",
  "/more": "Account and data",
};

function screenNameFor(pathname: string): string {
  if (SCREEN_NAMES[pathname]) return SCREEN_NAMES[pathname];
  const segment = pathname.split("/").filter(Boolean).pop() || "Home";
  return segment.replace(/[-_]+/g, " ").replace(/^./, (char) => char.toUpperCase());
}

export default function RouteAnnouncer() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");
  const isFirstRender = useRef(true);
  // A confirmation spoken just before a navigation (e.g. "It's with Jordan
  // now." as the composer routes to the Sexboard) would be cut off by the
  // route name, so the route announcement carries it along.
  const recentMessage = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    // The initial document load is announced by the browser itself; only
    // client-side navigations need help.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Land keyboard/SR focus on the new screen's content (programmatic focus
    // doesn't trigger :focus-visible, so no ring flashes for pointer users).
    const main = document.getElementById("app-main");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
    }
    const recent = recentMessage.current;
    const carry = recent && Date.now() - recent.at < 4000 ? `${recent.text} ` : "";
    recentMessage.current = null;
    setAnnouncement(`${carry}${screenNameFor(pathname)}`);
  }, [pathname]);

  // Visual-only confirmations (send pulse, aria-hidden toasts) speak through
  // this same region via lib/announce. Clearing first lets the same sentence
  // be announced twice in a row.
  useEffect(() => {
    let timer: number | undefined;
    function onAnnounce(event: Event) {
      const text = String((event as CustomEvent<string>).detail || "");
      if (!text) return;
      recentMessage.current = { text, at: Date.now() };
      setAnnouncement("");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAnnouncement(text), 60);
    }
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-live="polite" role="status" className="sr-only" data-testid="app-announcer">
      {announcement}
    </div>
  );
}
