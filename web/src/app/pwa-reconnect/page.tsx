"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import {
  clearPwaReconnectAttempt,
  clearReconnectAttemptLog,
} from "@/lib/api";
import { clearIntentionalSignOut } from "@/lib/auth-state";
import { getPwaEnvironment } from "@/lib/pwa-environment";

const HANDOFF_STORAGE_KEY = "ss:pwa-browser-handoff";
const APPROVAL_SECRET_PREFIX = "ss:pwa-browser-approval:";

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

export default function PwaReconnectPage() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading", message: "Preparing a secure reconnect." });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
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
          setScreen({ kind: "error", message: "This reconnect link is incomplete. Start again from the installed app." });
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
        let pending = loadPending(returnTo);
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
  }, [params]);

  useEffect(() => {
    if (screen.kind !== "pwa" || !screen.opened) return;
    let cancelled = false;

    async function redeem() {
      if (cancelled || redeemingRef.current || screen.kind !== "pwa") return;
      redeemingRef.current = true;
      try {
        const response = await handoffRequest({
          action: "redeem",
          id: screen.pending.id,
          secret: screen.pending.secret,
          returnTo: screen.pending.returnTo,
        });
        if (response.status === 202) return;
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          savePending(null);
          setScreen({ kind: "error", message: body.error || "Reconnect request expired. Try again." });
          return;
        }
        savePending(null);
        clearIntentionalSignOut();
        clearPwaReconnectAttempt();
        clearReconnectAttemptLog();
        window.location.replace(safeReturnTo(body.returnTo || screen.pending.returnTo));
      } catch {
        // Switching to Safari often suspends PWA network activity. Retry when
        // the app becomes visible again instead of surfacing a false failure.
      } finally {
        redeemingRef.current = false;
      }
    }

    const interval = window.setInterval(() => void redeem(), 5000);
    const onFocus = () => void redeem();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void redeem();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    void redeem();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen]);

  if (screen.kind === "pwa") {
    const browserPath = `/pwa-reconnect?approve=${encodeURIComponent(screen.pending.id)}#secret=${encodeURIComponent(screen.pending.secret)}`;
    const browserName = env.ios ? "Safari" : "your browser";
    const absoluteUrl = `${window.location.origin}${browserPath}`;
    const markOpened = () => setScreen({ ...screen, opened: true });
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
    return (
      <ReconnectShell eyebrow="Reconnect stopped" title="Try again from the app.">
        <p role="alert">{screen.message}</p>
        <a className="btn-primary pressable" href="/signin?source=pwa">Restart reconnect</a>
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
