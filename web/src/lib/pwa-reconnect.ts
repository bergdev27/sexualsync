/** Public launch/auth surfaces must not start automatic session recovery. */
export function isPwaPublicRoute(pathname: string): boolean {
  try {
    const path = decodeURIComponent(pathname).replace(/\/+$/, "") || "/";
    return ["/", "/signin", "/signed-out", "/welcome", "/splash", "/pwa-reconnect", "/auth-blocked"].includes(path)
      || path === "/api/auth" || path.startsWith("/api/auth/");
  } catch {
    return true;
  }
}

/** Final app destination only; not the Safari approval return through sign-in. */
export function safePwaReturnTo(value: string | null, origin: string): string {
  const fallback = "/sexboard";
  if (!value || /[\\\s\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || (!value.startsWith("/") && !/^https?:\/\//.test(value))) return fallback;
    // Reject stale/encoded wrappers wholesale, never recursively unwrap them.
    if (/%(?:2f|5c|25)/i.test(url.pathname)) return fallback;
    decodeURIComponent(url.pathname); // Malformed escapes are not destinations.
    if (isPwaPublicRoute(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
