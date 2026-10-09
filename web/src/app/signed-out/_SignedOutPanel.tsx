"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Two reasons land here: someone signed out (or another tab did), or the room
 * asked for a fresh sign-in because the app was just opened (reauth on
 * launch). The second is routine, so it reads as a doorway, not an error.
 */
export default function SignedOutPanel() {
  const launch = useSearchParams()?.get("reason") === "launch";
  if (launch) {
    return (
      <section className="signed-out-panel" aria-labelledby="signed-out-title">
        <span className="signed-out-mark" aria-hidden="true">ss</span>
        <h1 id="signed-out-title">Sign in to open your room.</h1>
        <p>
          Your room asks for a fresh sign-in each time the app opens, so nobody who picks up this phone can walk in.
        </p>
        <div className="signed-out-actions">
          <Link className="btn-primary pressable" href="/signin">
            Sign in
          </Link>
        </div>
      </section>
    );
  }
  return <SignedOutDefault />;
}

export function SignedOutDefault() {
  return (
    <section className="signed-out-panel" aria-labelledby="signed-out-title">
      <span className="signed-out-mark" aria-hidden="true">ss</span>
      <p className="eyebrow">Signed out</p>
      <h1 id="signed-out-title">This device is clear.</h1>
      <p>
        Your Sexualsync session was closed here. Open the app again when you are ready to come back to your room.
      </p>
      <div className="signed-out-actions">
        <Link className="btn-primary pressable" href="/signin">
          Sign back in
        </Link>
        <Link className="btn-ghost pressable" href="/">
          Back to welcome
        </Link>
      </div>
    </section>
  );
}
