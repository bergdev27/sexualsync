"use client";

// "Make it an Ask" / "Plan it" under a reveal result. A match is an invitation,
// not a task: the copy talks about trying something you both want, and nothing
// here is counted, tracked or nagged about. Plan it appears only when an
// approved, unplanned Ask already covers one of these acts.

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRequestBoard } from "@/lib/api";
import { mutualAskHref } from "@/lib/activity";
import { ASK_SEED_HREF, actKey, storeAskSeed, type AskSeedSource } from "@/lib/ask-seed";
import type { RequestRecord } from "@/lib/types";

const APPROVED = new Set(["reviewed", "on_deck"]);

function approvedActKeys(request: RequestRecord): string[] {
  return (request.decisions || [])
    .filter((item) => /^yes$/i.test(String(item?.decision || "")))
    .map((item) => actKey(String(item?.label || "")))
    .filter(Boolean);
}

// An approved Ask that covers one of these acts and has no time on it yet.
function findPlannable(requests: RequestRecord[], acts: string[]): RequestRecord | null {
  const wanted = new Set(acts.map(actKey));
  return requests.find((request) => {
    if (!APPROVED.has(String(request.status || "")) || request.plannedFor) return false;
    // "Change of plans" withdrew it: not something to plan.
    if (request.withdrawnAt) return false;
    return approvedActKeys(request).some((key) => wanted.has(key));
  }) || null;
}

// A single match row or chip that opens the Ask composer prefilled with it.
export function SeedLink({
  source,
  acts,
  note = "",
  className,
  children,
  testId,
}: {
  source: AskSeedSource;
  acts: string[];
  note?: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const router = useRouter();
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (storeAskSeed({ source, acts, note })) return;
    event.preventDefault();
    router.push(`/ask?note=${encodeURIComponent(note || `From a reveal: ${acts.join(", ")}`)}`);
  }
  return (
    <Link href={ASK_SEED_HREF} onClick={onClick} className={className} data-testid={testId}>
      {children}
    </Link>
  );
}

export default function MatchActions({
  workspaceId,
  acts,
  note = "",
  source,
  label = "Make it an Ask",
  lead,
  compact = false,
}: {
  workspaceId: string;
  acts: string[];
  note?: string;
  source: AskSeedSource;
  label?: string;
  lead?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [plannable, setPlannable] = useState<RequestRecord | null>(null);
  const actsKey = acts.join("|");

  useEffect(() => {
    if (!workspaceId || !acts.length) return;
    let cancelled = false;
    getRequestBoard(workspaceId)
      .then((board) => { if (!cancelled) setPlannable(findPlannable(board.requests || [], acts)); })
      .catch(() => { /* Plan it is optional; the Ask path still works */ });
    return () => { cancelled = true; };
    // actsKey stands in for the acts array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, actsKey]);

  function onAsk(event: MouseEvent<HTMLAnchorElement>) {
    if (storeAskSeed({ source, acts, note })) return;
    // Storage blocked: fall back to the plain note prefill.
    event.preventDefault();
    const fallback = note || `From a reveal: ${acts.join(", ")}`;
    router.push(`/ask?note=${encodeURIComponent(fallback)}`);
  }

  if (!acts.length && !note) return null;
  return (
    <div className={`match-actions ${compact ? "is-compact" : ""}`}>
      {lead && <p className="match-actions-lead">{lead}</p>}
      <div className="match-actions-row">
        <Link href={ASK_SEED_HREF} onClick={onAsk} className="rg-btn is-grow pressable" data-testid="make-it-an-ask">
          {label}
        </Link>
        {plannable && (
          <Link href={mutualAskHref(plannable.id)} className="btn-ghost match-actions-plan pressable" data-testid="plan-it-from-reveal">
            Plan it
          </Link>
        )}
      </div>
    </div>
  );
}
