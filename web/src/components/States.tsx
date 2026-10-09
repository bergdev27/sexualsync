"use client";

/**
 * Shared empty / loading / error states for the four primary screens.
 *
 * Per the brief:
 *  - Empty states are inviting, not aggressive. No sales pitch tone.
 *  - Loading is a skeleton, not a spinner.
 *  - Errors are short, plain-language, with a clear next action. Never blame
 *    the user. Never expose stack traces.
 */
import { useState, type ReactNode } from "react";
import { describeLoadError, useOnlineStatus, useRecoverOnReconnect } from "@/lib/network-status";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-card card mx-5 my-2 p-6 text-center">
      <h2 className="font-display italic text-title text-ink">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="sync-skeleton-card">
      <div className="sync-skeleton-head">
        <span className="sync-skeleton-dot" />
        <div className="skeleton-shimmer sync-skeleton-title" />
      </div>
      <div className="skeleton-shimmer sync-skeleton-line is-wide" />
      <div className="skeleton-shimmer sync-skeleton-line" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="sync-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="sync-loader-signal" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="sync-skeleton-list">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-card card mx-5 my-2 p-6 text-center" role="alert" aria-live="assertive">
      <h2 className="font-display italic text-title text-ink">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * A failed screen load, never a dead end: plain-language copy for whatever
 * went wrong (no raw "Failed to fetch" / "Internal error"), a Try again
 * button, and an automatic retry when the device reconnects or the app comes
 * back to the foreground. While offline the button steps aside for a calm
 * "waiting for a connection" line, since tapping it can't help yet.
 */
export function LoadErrorState({
  what,
  error,
  onRetry,
  secondary,
}: {
  /** What failed to load, as it reads mid-sentence: "your Sexboard", "Play". */
  what: string;
  error: unknown;
  onRetry: () => unknown;
  secondary?: ReactNode;
}) {
  const online = useOnlineStatus();
  const [retrying, setRetrying] = useState(false);
  const copy = describeLoadError(online ? error : "offline", what);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // The screen re-renders its own error state on failure.
    } finally {
      setRetrying(false);
    }
  }

  useRecoverOnReconnect(retry, true);

  return (
    <ErrorState
      title={copy.title}
      body={copy.body}
      action={
        <div className="load-error-actions">
          {online ? (
            <button type="button" className="btn-ghost" onClick={retry} disabled={retrying} aria-busy={retrying}>
              {retrying ? "Trying again…" : "Try again"}
            </button>
          ) : (
            <p className="load-error-waiting">Waiting for a connection…</p>
          )}
          {secondary}
        </div>
      }
    />
  );
}

/**
 * App-wide connection indicator. The live region stays mounted so screen
 * readers hear the change; the pill itself only renders while offline.
 */
export function OfflinePill() {
  const online = useOnlineStatus();
  return (
    <div className="offline-pill-region" role="status" aria-live="polite">
      {!online && (
        <span className="offline-pill">
          <span className="offline-pill-dot" aria-hidden="true" />
          You&apos;re offline
        </span>
      )}
    </div>
  );
}
