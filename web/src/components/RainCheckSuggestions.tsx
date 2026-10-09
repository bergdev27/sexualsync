"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { splitActLabel } from "@/lib/act-label";
import { updateRequestAction } from "@/lib/api";
import { dueRainChecks, rainCheckWhen } from "@/lib/pass-reassurance";
import "./rain-check.css";
import type { RequestRecord } from "@/lib/types";

/**
 * "Try this again?" on Home: a rain check the partner offered when they passed
 * has come due (research rec #2). Shown only to the person who asked, as a quiet
 * suggestion. The asker decides: "Ask again" opens the composer with the same
 * Acts, "Not now" sets it aside. Nothing is ever re-sent automatically, nothing
 * pushes, and the partner sees no trace of it.
 */
export default function RainCheckSuggestions({
  requests,
  myEmail,
  partnerName,
  workspaceId,
}: {
  requests: RequestRecord[];
  myEmail: string;
  partnerName: string;
  workspaceId: string;
}) {
  const [setAside, setSetAside] = useState<string[]>([]);
  const [busyId, setBusyId] = useState("");
  const due = useMemo(
    () => dueRainChecks(requests, myEmail).filter((request) => !setAside.includes(request.id)).slice(0, 2),
    [requests, myEmail, setAside],
  );
  if (!due.length) return null;

  async function dismiss(id: string) {
    setBusyId(id);
    // Hide at once; the server write only makes it stick across devices.
    setSetAside((ids) => [...ids, id]);
    try {
      await updateRequestAction({ workspaceId, id, action: "dismiss_rain_check" });
    } catch {
      // Best effort: it stays hidden here and may show again on another device.
    } finally {
      setBusyId("");
    }
  }

  return (
    // Uses the Sexboard's own section head so it reads as one more quiet row
    // group in the card, not a banner.
    <section className="sexboard-handoff-section rain-check" aria-label="Try this again?" data-testid="rain-check">
      <div className="sexboard-section-head"><span>Try this again?</span></div>
      {due.map((request) => {
        const acts = request.categories.map((label) => splitActLabel(label).text).filter(Boolean);
        return (
          <article key={request.id} className="rain-check-item" data-testid="rain-check-item">
            <p className="rain-check-body">
              {partnerName} said to ask again {rainCheckWhen(request)}. It&rsquo;s your call.
            </p>
            {acts.length > 0 && <p className="rain-check-acts">{acts.join(" · ")}</p>}
            <div className="rain-check-actions">
              <Link
                href={`/ask?again=${encodeURIComponent(request.id)}`}
                className="cta-primary rain-check-cta pressable"
                data-testid="rain-check-ask"
              >
                Ask again
              </Link>
              <button
                type="button"
                className="btn-ghost rain-check-dismiss pressable"
                disabled={busyId === request.id}
                onClick={() => void dismiss(request.id)}
                data-testid="rain-check-dismiss"
              >
                Not now
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
