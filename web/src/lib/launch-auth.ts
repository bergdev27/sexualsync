const LAUNCH_SESSION_KEY = "ss:auth:launch-ok";
const LAUNCH_COOKIE = "sxs-launch";
// Persistent companion of LAUNCH_SESSION_KEY. sessionStorage (and the memory
// flag) die when iOS kills the web-app process, which made every cold start
// re-authenticate even while the 30-day server session cookie was valid. This
// timestamp — kept in the `ss:` namespace so clearAllNamespacedLocalState()
// sweeps it on sign-out — lets a cold start honour the per-user
// `staySignedInDays` window. It only ever skips the *forced* launch logout;
// every API call is still authorised by the HttpOnly session cookie, and the
// server caps the window at its own 30-day session lifetime.
const LAUNCH_PERSISTED_AT_KEY = "ss:auth:launch-at";
const MINUTE_MS = 60 * 1000;

let memoryLaunchOk = false;

export function markLaunchAuthenticated(): void {
  memoryLaunchOk = true;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAUNCH_SESSION_KEY, "1");
  } catch {
    // WebViews/private mode can block storage; memory still covers this tab.
  }
  stampPersistentLaunch();
}

export function stampPersistentLaunch(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAUNCH_PERSISTED_AT_KEY, String(now));
  } catch {
    // Storage blocked; the session-marker path still applies for this launch.
  }
}

// Clears only the persistent stamp (not the re-auth cooldown counter, which
// must survive the logout redirect to keep the reconnect-loop guard armed).
// The forced launch re-auth is a sign-out: without this, the next account to
// sign in on the same device would inherit the previous user's stamp and
// skip its own launch re-auth inside the window.
export function clearPersistentLaunchStamp(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAUNCH_PERSISTED_AT_KEY);
  } catch {
    // Storage blocked; there is nothing to clear.
  }
}

export function hasPersistentLaunchOk(days: number, now = Date.now()): boolean {
  if (!(days > 0)) return false;
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(LAUNCH_PERSISTED_AT_KEY);
    if (!stored) return false;
    const at = Number(stored);
    if (!Number.isFinite(at)) return false;
    // Small clock-skew allowance; a stamp far in the future is treated as
    // corrupt rather than a free pass.
    if (at > now + 5 * MINUTE_MS) return false;
    return now - at <= days * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function hasLaunchAuthenticated(): boolean {
  if (memoryLaunchOk) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(LAUNCH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function hasLaunchCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${LAUNCH_COOKIE}=1`);
}

/**
 * Read-only version of ensureLaunchAuthenticated(): true when this launch is
 * already authenticated on this device, without consuming the one-shot cookie.
 */
export function isLaunchAuthenticated(): boolean {
  return hasLaunchAuthenticated() || hasLaunchCookie();
}

export function consumeLaunchCookie(): boolean {
  if (!hasLaunchCookie()) return false;
  markLaunchAuthenticated();
  document.cookie = `${LAUNCH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  return true;
}

export function ensureLaunchAuthenticated(): boolean {
  return hasLaunchAuthenticated() || consumeLaunchCookie();
}

// Loop guard for reauth-on-launch. The launch-authenticated marker lives in
// sessionStorage + memory, and the server's one-shot `sxs-launch` cookie is
// consumed (deleted) on first read. In a standalone PWA where sessionStorage is
// partitioned or cleared between document loads, that marker can vanish — and
// with no cap, RoomEncryptionGate would log the user out on every protected
// page load forever (logout -> sign in -> land -> logout ...). We stamp each
// forced reauth in localStorage and refuse to reauth again within a short
// window: at most one forced reauth per launch, then trust the still-valid
// session instead of looping.
//
// The key is deliberately NOT `ss:`-prefixed so it survives
// clearAllNamespacedLocalState() (which the sign-out path runs) — otherwise the
// logout half of the reauth would wipe the very marker meant to break the loop.
const LAUNCH_REAUTH_ATTEMPT_KEY = "sxs-launch-reauth-at";
const LAUNCH_REAUTH_COOLDOWN_MS = 2 * 60 * 1000;

export function launchReauthRecentlyAttempted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const at = Number(window.localStorage.getItem(LAUNCH_REAUTH_ATTEMPT_KEY)) || 0;
    return at > 0 && Date.now() - at < LAUNCH_REAUTH_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function recordLaunchReauthAttempt(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAUNCH_REAUTH_ATTEMPT_KEY, String(Date.now()));
  } catch {
    // localStorage blocked too — nothing else to persist; the gate then falls
    // through to marking the launch authenticated so the user is never trapped.
  }
}

export function shouldForceLaunchReauth(options: {
  reauthOnLaunch?: boolean;
  staySignedInDays?: number;
  persistentOk: boolean;
  reauthAttemptedRecently: boolean;
}): boolean {
  // Legacy escape hatch: user explicitly turned re-auth off.
  if (options.reauthOnLaunch === false) return false;
  // Configurable "stay signed in" window: a recent successful open (see
  // hasPersistentLaunchOk) rides out the sessionStorage wipe on cold start.
  if ((options.staySignedInDays ?? 0) > 0 && options.persistentOk) return false;
  // Loop guard: a full logout already ran in this browser very recently.
  if (options.reauthAttemptedRecently) return false;
  return true;
}
