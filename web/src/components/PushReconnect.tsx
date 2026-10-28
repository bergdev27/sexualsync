"use client";

/**
 * Silently re-ensures this device's push subscription on app launch.
 *
 * iOS invalidates a PWA's push subscription whenever the service worker updates,
 * which happens on every deploy (sw.js bakes in the release version). Before
 * this, the subscription only got re-created if the user happened to open the
 * Space page — so after each update notifications went quiet until they manually
 * "re-enabled" them. Running once per launch, when permission is already
 * granted, makes a stale subscription self-heal with no user action.
 *
 * Mounted app-wide in layout.tsx alongside PwaBridge. Renders nothing.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getBootstrap } from "@/lib/api";
import { isPwaPublicRoute } from "@/lib/pwa-reconnect";
import { ensurePushSubscription, readStoredPushPrefs } from "@/lib/push-subscription";

export default function PushReconnect() {
  const ran = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || isPwaPublicRoute(pathname)) return;
    if (ran.current) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // Only re-ensure for users who already opted in. We never prompt here.
    if (Notification.permission !== "granted") return;
    ran.current = true;
    let cancelled = false;
    let settled = false;

    (async () => {
      try {
        // Independent from the foreground cache: background 401s must neither
        // navigate nor suppress an overlapping foreground reconnect.
        const profile = await getBootstrap(undefined, { suppressPwaReconnect: true });
        if (cancelled) return;
        const workspaceId = profile.activeWorkspaceId || profile.workspaces?.[0]?.id || "";
        if (!workspaceId) return;
        settled = true;
        await ensurePushSubscription(workspaceId, readStoredPushPrefs());
      } catch {
        // Best effort — the Space page can still enable notifications manually.
      } finally {
        settled = true;
      }
    })();
    return () => {
      cancelled = true;
      // Preserve eligibility if route cleanup or Strict Mode replay cancelled
      // the bootstrap before it could finish this launch's reconnect.
      if (!settled) ran.current = false;
    };
  }, [pathname]);

  return null;
}
