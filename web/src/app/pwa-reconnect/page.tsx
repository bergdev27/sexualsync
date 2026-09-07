"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import {
  clearPwaReconnectAttempt,
  clearReconnectAttemptLog,
} from "@/lib/api";
import { clearIntentionalSignOut, markIntentionalSignOut } from "@/lib/auth-state";
import { getPwaEnvironment } from "@/lib/pwa-environment";

const HANDOFF_STORAGE_KEY = "ss:pwa-browser-handoff";
const APPROVAL_SECRET_PREFIX = "ss:pwa-browser-approval:";

// Poll quickly while Safari is most likely still open, then ease off. The
// redeem endpoint is rate-limited per IP and both partners usually share one
// home network, so two installed apps polling every 5s for the whole handoff
// window would trip the limit for each other.
const REDEEM_FAST_INTERVAL_MS = 5 * 1000;
const REDEEM_SLOW_INTERVAL_MS = 10 * 1000;
const REDEEM_FAST_WINDOW_MS = 60 * 1000;
const REDEEM_MIN_BACKOFF_MS = 5 * 1000;
const REDEEM_MAX_BACKOFF_MS = 60 * 1000;
// The server is authoritative on expiry; this only stops the wait from
// running on forever if the server's 400 never reaches us.
const EXPIRY_GRACE_MS = 30 * 1000;

type PendingHandoff = {
  id: string;
  secret: string;
  expiresAt: number;
  returnTo: string;
};

type Screen =
  | { kind: "loading"; message: string }
  | { kind: "pwa"; pending: PendingHandoff; opened: boolean }
  | { kind: "approved" }
  | { kind: "browser-auth"; signInUrl: string }
  | { kind: "browser-info" }
  | { kind: "error"; message: string };

function isStandaloneDisplay(): boolean {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function safeReturnTo(value: string | null): string {
  if (!value) return "/sexboard";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/sexboard";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("/api/auth/")) return "/sexboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/sexboard";
  }
}

function approvalSecret(id: string): string {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("secret") || "";
  if (fromHash) {
    try { window.sessionStorage.setItem(`${APPROVAL_SECRET_PREFIX}${id}`, fromHash); } catch {}
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(`${APPROVAL_SECRET_PREFIX}${id}`) || "";
  } catch {
    return "";
  }
}

function loadPending(returnTo: string): PendingHandoff | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HANDOFF_STORAGE_KEY) || "null");
    if (
      parsed
      && typeof parsed.id === "string"
      && typeof parsed.secret === "string"
      && Number(parsed.expiresAt) > Date.now()
      && parsed.returnTo === returnTo
    ) {
      return parsed as PendingHandoff;
    }
  } catch {}
  return null;
}

function savePending(pending: PendingHandoff | null): void {
  try {
    if (pending) window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(pending));
    else window.localStorage.removeItem(HANDOFF_STORAGE_KEY);
  } catch {}
}

// An iOS Home Screen web app cannot hand a same-origin link to real Safari:
// in-scope links (scope is "/") stay inside the app, `target="_blank"` is
// swallowed, and out-of-scope links open an in-app view that does not share
// Safari's cookies. Safari does register the `x-safari-https:` scheme, which
// opens the URL in Safari itself, so that is the only path that reaches the
// browser session we want to reuse. Other platforms keep a normal new tab.
function safariHandoffHref(path: string): string {
  const scheme = window.location.protocol === "http:" ? "x-safari-http" : "x-safari-https";
  return `${scheme}://${window.location.host}${path}`;
}

// The sign-in page skips its automatic reconnect redirect while the
// intentional sign-out marker is fresh. That is exactly the opening a manual
// in-app sign-in needs; the marker clears itself after two minutes or on the
// next successful sign-in.
function allowInAppSignIn(): void {
  markIntentionalSignOut();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {}
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ url: value });
      return true;
    }
  } catch {}
  return false;
}

async function handoffRequest(payload: Record<string, unknown>): Promise<Response> {
  return fetch("/api/auth/pwa-handoff", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function backoffFromResponse(response: Response): number {
  const retryAfterSeconds = Number(response.headers.get("retry-after")) || 0;
  return Math.min(Math.max(retryAfterSeconds * 1000, REDEEM_MIN_BACKOFF_MS), REDEEM_MAX_BACKOFF_MS);
}

export default function PwaReconnectPage() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading", message: "Preparing a secure reconnect." });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  // Bumped by "Restart reconnect" so the setup effect runs again in place.
  const [attempt, setAttempt] = useState(0);
  const redeemingRef = useRef(false);
  const params = useMemo(
    () => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search),
    [],
  );
  const env = useMemo(() => getPwaEnvironment(), []);

  useEffect(() => {
    let cancelled = false;
    const approveId = (params.get("approve") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);

    if (approveId) {
      const secret = approvalSecret(approveId);
      if (!secret) {
        const timer = window.setTimeout(() => {
          setScreen({
            kind: "error",
            message: "This reconnect link is missing its secret. In the installed app, tap Copy link instead and paste the whole link into Safari.",
          });
        }, 0);
        return () => window.clearTimeout(timer);
      }
      (async () => {
        try {
          const response = await handoffRequest({ action: "approve", id: approveId, secret });
          if (cancelled) return;
          if (response.status === 401) {
            const returnTo = `/pwa-reconnect?approve=${encodeURIComponent(approveId)}`;
            setScreen({
              kind: "browser-auth",
              signInUrl: `/signin?${new URLSearchParams({ returnTo, source: "browser-handoff" }).toString()}`,
            });
            return;
          }
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "This reconnect request expired.");
          }
          try { window.sessionStorage.removeItem(`${APPROVAL_SECRET_PREFIX}${approveId}`); } catch {}
          setScreen({ kind: "approved" });
        } catch (error) {
          if (!cancelled) {
            setScreen({ kind: "error", message: error instanceof Error ? error.message : "Reconnect failed." });
          }
        }
      })();
      return () => { cancelled = true; };
    }

    if (!isStandaloneDisplay()) {
      const timer = window.setTimeout(() => setScreen({ kind: "browser-info" }), 0);
      return () => window.clearTimeout(timer);
    }

    const returnTo = safeReturnTo(params.get("returnTo"));
    (async () => {
      try {
        // A restart always mints a fresh handoff; the stored one belongs to the
        // attempt that just failed.
        let pending = attempt > 0 ? null : loadPending(returnTo);
        if (!pending) {
          const response = await handoffRequest({ action: "start", returnTo });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Couldn't start reconnect.");
          pending = {
            id: body.id,
            secret: body.secret,
            expiresAt: Number(body.expiresAt),
            returnTo: safeReturnTo(body.returnTo),
          };
          savePending(pending);
        }
        if (!cancelled) setScreen({ kind: "pwa", pending, opened: false });
      } catch (error) {
        if (!cancelled) {
          setScreen({ kind: "error", message: error instanceof Error ? error.message : "Couldn't start reconnect." });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [params, attempt]);

  useEffect(() => {
    if (screen.kind !== "pwa" || !screen.opened) return;
    const { pending } = screen;
    let cancelled = false;
    let timer = 0;
    let pausedUntil = 0;
    const startedAt = Date.now();

    const fail = (message: string) => {
      savePending(null);
      setScreen({ kind: "error", message });
    };

    async function redeem() {
      if (cancelled || redeemingRef.current || Date.now() < pausedUntil) return;
      if (Date.now() > pending.expiresAt + EXPIRY_GRACE_MS) {
        fail("Safari didn't approve in time. Start a fresh reconnect.");
        return;
      }
      redeemingRef.current = true;
      try {
        const response = await handoffRequest({
          action: "redeem",
          id: pending.id,
          secret: pending.secret,
          returnTo: pending.returnTo,
        });
        if (response.status === 202) return;
        if (response.status === 429 || response.status >= 500) {
          // Rate-limited (the other partner may be reconnecting on the same
          // network) or a transient upstream blip. The approval can still
          // land, so back off instead of ending the handoff with an error.
          pausedUntil = Date.now() + backoffFromResponse(response);
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) fail(body.error || "Reconnect request expired. Try again.");
          return;
        }
        savePending(null);
        clearIntentionalSignOut();
        clearPwaReconnectAttempt();
        clearReconnectAttemptLog();
        window.location.replace(safeReturnTo(body.returnTo || pending.returnTo));
      } catch {
        // Switching to Safari often suspends PWA network activity. Retry when
        // the app becomes visible again instead of surfacing a false failure.
      } finally {
        redeemingRef.current = false;
      }
    }

    const schedule = () => {
      if (cancelled) return;
      const delay = Date.now() - startedAt < REDEEM_FAST_WINDOW_MS
        ? REDEEM_FAST_INTERVAL_MS
        : REDEEM_SLOW_INTERVAL_MS;
      timer = window.setTimeout(() => { void redeem().then(schedule); }, delay);
    };
    const onFocus = () => void redeem();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void redeem();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void redeem().then(schedule);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen]);

  // Restart in place. Bouncing through /signin?source=pwa (the old restart
  // link) re-entered the launch path, whose loop guards — the two-minute
  // cooldown and the attempt cap — treat a manual retry like a runaway
  // redirect and either park the user on the sign-in hero or send them to
  // /auth-blocked. A manual restart is not a loop, so reset those guards and
  // mint a new handoff right here.
  const restart = useCallback(() => {
    savePending(null);
    clearPwaReconnectAttempt();
    clearReconnectAttemptLog();
    redeemingRef.current = false;
    setCopyState("idle");
    if (params.has("approve")) {
      // A stale approval id would send the next attempt down the browser path.
      params.delete("approve");
      const search = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
    setScreen({ kind: "loading", message: "Starting a fresh reconnect." });
    setAttempt((count) => count + 1);
  }, [params]);

  if (screen.kind === "pwa") {
    const browserPath = `/pwa-reconnect?approve=${encodeURIComponent(screen.pending.id)}#secret=${encodeURIComponent(screen.pending.secret)}`;
    const browserName = env.ios ? "Safari" : "your browser";
    const absoluteUrl = `${window.location.origin}${browserPath}`;
    const markOpened = () => {
      if (!screen.opened) setScreen({ ...screen, opened: true });
    };
    const copyLink = async () => {
      const copied = await copyText(absoluteUrl);
      setCopyState(copied ? "copied" : "manual");
      markOpened();
    };
    const status = screen.opened
      ? `Waiting for ${browserName} to approve. If it didn't open, copy the link and paste it into ${browserName}.`
      : "This link expires in 10 minutes.";
    return (
      <ReconnectShell eyebrow="Reconnect installed app" title={`Use your ${browserName} sign-in.`}>
        <p>
          Your existing web sign-in in {browserName} will approve this installed app—no password is copied into the app.
        </p>
        {env.ios ? (
          <a className="btn-primary pressable" href={safariHandoffHref(browserPath)} onClick={markOpened}>
            Open Safari to reconnect
          </a>
        ) : (
          <a className="btn-primary pressable" href={browserPath} target="_blank" rel="noopener" onClick={markOpened}>
            Open browser to reconnect
          </a>
        )}
        <button type="button" className="btn-ghost pressable pwa-reconnect-copy" onClick={() => void copyLink()}>
          {copyState === "copied" ? "Link copied" : "Copy link instead"}
        </button>
        {copyState === "manual" ? (
          <p className="pwa-reconnect-manual">
            Couldn’t copy automatically. Long-press this link and choose Copy:
            {" "}
            <a href={browserPath} target="_blank" rel="noopener">{absoluteUrl}</a>
          </p>
        ) : null}
        <p className="pwa-reconnect-status" role="status">{status}</p>
        <p className="pwa-reconnect-alt">
          <a href="/signin" onClick={allowInAppSignIn}>Sign in here instead</a>
        </p>
      </ReconnectShell>
    );
  }

  if (screen.kind === "approved") {
    return (
      <ReconnectShell eyebrow="Connected" title="Installed app approved.">
        <p>Return to the installed app. It will finish reconnecting automatically.</p>
      </ReconnectShell>
    );
  }

  if (screen.kind === "browser-auth") {
    return (
      <ReconnectShell eyebrow="Browser sign-in needed" title="Sign in once here.">
        <p>Use the web sign-in already saved in this browser. You’ll return here to approve the installed app.</p>
        <a className="btn-primary pressable" href={screen.signInUrl}>Continue to web sign-in</a>
      </ReconnectShell>
    );
  }

  if (screen.kind === "browser-info") {
    return (
      <ReconnectShell eyebrow="Browser reconnect" title="Start from the installed app.">
        <p>Open the Home Screen app first. It will create a one-time reconnect link for this browser.</p>
      </ReconnectShell>
    );
  }

  if (screen.kind === "error") {
    if (!env.standalone) {
      return (
        <ReconnectShell eyebrow="Reconnect stopped" title="Try again from the app.">
          <p role="alert">{screen.message}</p>
          <p>Open the installed app from your Home Screen and tap Restart reconnect there.</p>
        </ReconnectShell>
      );
    }
    return (
      <ReconnectShell eyebrow="Reconnect stopped" title="Start a fresh reconnect.">
        <p role="alert">{screen.message}</p>
        <button type="button" className="btn-primary pressable" onClick={restart}>
          Restart reconnect
        </button>
        <p className="pwa-reconnect-alt">
          <a href="/signin" onClick={allowInAppSignIn}>Sign in here instead</a>
        </p>
      </ReconnectShell>
    );
  }

  return (
    <ReconnectShell eyebrow="Secure reconnect" title="One moment.">
      <p role="status">{screen.message}</p>
    </ReconnectShell>
  );
}

function ReconnectShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="pwa-reconnect min-h-screen">
      <div className="pwa-reconnect-glow" aria-hidden="true" />
      <section className="pwa-reconnect-card" aria-labelledby="pwa-reconnect-title">
        <BrandWordmark className="pwa-reconnect-wordmark" />
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="pwa-reconnect-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}
