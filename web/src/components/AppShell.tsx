"use client";

/**
 * Top-level container for every authenticated screen.
 * - Caps width at 440px (mobile-first; design at 390px per the brief).
 * - Reserves room for the bottom tab bar.
 * - Tab bar visibility comes from lib/tabbar-visibility (route + whether a
 *   game run is in progress), never from a per-page flag.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isTabBarHidden } from "@/lib/tabbar-visibility";
import BrandWordmark from "./BrandWordmark";
import LiveActivityToast, { LiveApprovalSplashRedirect } from "./LiveActivityToast";
import { OfflinePill, SkeletonList } from "./States";
import TabBar from "./TabBar";

function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="atm-top" />
      <div className="atm-bottom" />
      <div className="grain" />
    </div>
  );
}

// Game runners report "a run is under way" through useFocusedRun(); the
// shell feeds it to the one visibility rule.
const FocusedRunContext = createContext<(active: boolean) => void>(() => {});

/**
 * Call from a game runner: while `active` is true (a run has started) the
 * screen is a focused flow and the tab bar steps away.
 */
export function useFocusedRun(active: boolean) {
  const setRunActive = useContext(FocusedRunContext);
  useEffect(() => {
    setRunActive(active);
    return () => setRunActive(false);
  }, [active, setRunActive]);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [runActive, setRunActive] = useState(false);
  const hideTabBar = isTabBarHidden(pathname, { runActive });
  return (
    <div className="min-h-screen bg-bg">
      <div className={`surface app-shell ${hideTabBar ? "app-shell-no-tabbar" : "app-shell-with-tabbar"}`}>
        <Atmosphere />
        {/* tabIndex={-1}: RouteAnnouncer (root layout) moves focus here on
            client-side navigations so keyboard/SR users land on the new
            screen instead of staying on the old link. */}
        <main id="app-main" tabIndex={-1} className="app-shell-main route-enter">
          <FocusedRunContext.Provider value={setRunActive}>{children}</FocusedRunContext.Provider>
        </main>
        <LiveApprovalSplashRedirect />
        <LiveActivityToast />
        <OfflinePill />
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}

/**
 * The shell a protected screen paints while the launch check (session +
 * room key) is still running: same frame, tab bar and header rhythm as the
 * real screen, with skeleton rows where content will land. It renders no
 * data, no cached snapshot and no live components, so it is safe to show
 * before anything about the session or the room key is known.
 */
export function AppShellSkeleton() {
  const pathname = usePathname() || "";
  const hideTabBar = isTabBarHidden(pathname);
  return (
    <div className="min-h-screen bg-bg">
      <div className={`surface app-shell ${hideTabBar ? "app-shell-no-tabbar" : "app-shell-with-tabbar"}`}>
        <Atmosphere />
        <main className="app-shell-main app-shell-skeleton" aria-busy="true">
          <header className="px-5 pb-4 pt-6" aria-hidden="true">
            <BrandWordmark className="mb-4" />
            <div className="skeleton-shimmer app-shell-skeleton-title" />
            <div className="skeleton-shimmer app-shell-skeleton-sub" />
          </header>
          <SkeletonList count={3} />
        </main>
        <OfflinePill />
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}
