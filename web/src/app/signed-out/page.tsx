import { Suspense } from "react";
import SignedOutPanel, { SignedOutDefault } from "./_SignedOutPanel";
import "./signed-out.css";

export default function SignedOutPage() {
  return (
    <main id="app-main" tabIndex={-1} className="surface signed-out min-h-screen">
      <div className="atmosphere" aria-hidden="true">
        <div className="atm-top" />
        <div className="atm-bottom" />
        <div className="grain" />
      </div>

      <Suspense fallback={<SignedOutDefault />}>
        <SignedOutPanel />
      </Suspense>
    </main>
  );
}
