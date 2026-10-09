/**
 * The one place that decides whether the bottom tab bar shows.
 *
 * Rule (DESIGN.md "Tab Bar Visibility Rule"): the bar is shown on browse
 * screens and hidden on focused task flows. Visibility is decided by route,
 * plus one piece of state for game runners: a runner screen is a browse
 * screen on its intro/history view and a focused flow once a run starts.
 * Never decided by scroll position, and never by an ad-hoc page flag.
 */

// Routes that are always a focused flow (or a standalone, out-of-room
// screen) and never show the tab bar.
export const FOCUSED_FLOW_PREFIXES = [
  "/admin",
  "/ask-detail",
  "/review",
  "/mutual",
  "/inspiration/kink",
  "/inspiration/kinks",
  "/inspiration/shelf",
  "/space/vault",
  "/more",
  "/welcome",
  "/onboarding",
  "/share",
] as const;

// Game runners: the tab bar hides once a run is in progress.
export const RUNNER_PREFIXES = [
  "/games/sex-quiz",
  "/games/green-lights",
  "/games/pile",
  "/games/blind-reveal",
] as const;

export function matchesRoutePrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isRunnerRoute(pathname: string): boolean {
  return matchesRoutePrefix(pathname, RUNNER_PREFIXES);
}

export function isTabBarHidden(pathname: string, options: { runActive?: boolean } = {}): boolean {
  if (matchesRoutePrefix(pathname, FOCUSED_FLOW_PREFIXES)) return true;
  if (isRunnerRoute(pathname)) return Boolean(options.runActive);
  return false;
}
