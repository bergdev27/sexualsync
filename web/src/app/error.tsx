"use client";

import Link from "next/link";
import { useEffect } from "react";
// error.css loads from the root layout: imported here, Next preloads it on
// every page and the browser warns that it went unused.

/**
 * Last-resort boundary for a screen that throws while rendering. Without it
 * the browser shows Next's bare white error page, which breaks the dark room
 * and offers no way back. Nothing the user saved lives in render state, so the
 * copy says so, and the two ways out are trying the screen again or Home.
 */
export default function RouteError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = retry ?? reset;

  return (
    <main className="surface route-error min-h-screen">
      <div className="atmosphere" aria-hidden="true">
        <div className="atm-top" />
        <div className="atm-bottom" />
        <div className="grain" />
      </div>
      <section className="route-error-panel" role="alert" aria-labelledby="route-error-title">
        <h1 id="route-error-title">This screen hit a snag.</h1>
        <p>Nothing you saved is lost. Try the screen again, or head back to Home.</p>
        <div className="route-error-actions">
          {tryAgain && (
            <button type="button" className="btn-primary pressable" onClick={() => tryAgain()}>
              Try again
            </button>
          )}
          <Link className="btn-ghost pressable" href="/sexboard">
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
