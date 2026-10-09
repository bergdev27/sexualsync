"use client";

import { useEffect } from "react";
import "./globals.css";
import "./polish-shared.css";
import "./error.css";

/**
 * Boundary for errors in the root layout itself, where app/error.tsx can't
 * reach. It replaces the whole document, so it carries its own html/body and
 * stays on the dark wine canvas instead of Next's white default.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="font-sans">
        <main className="surface route-error min-h-screen">
          <section className="route-error-panel" role="alert" aria-labelledby="global-error-title">
            <h1 id="global-error-title">The app hit a snag.</h1>
            <p>Nothing you saved is lost. Try again, or reload the app.</p>
            <div className="route-error-actions">
              {tryAgain && (
                <button type="button" className="btn-primary pressable" onClick={() => tryAgain()}>
                  Try again
                </button>
              )}
              <a className="btn-ghost pressable" href="/sexboard">
                Reload the app
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
