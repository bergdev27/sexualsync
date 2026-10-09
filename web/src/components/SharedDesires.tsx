"use client";

/**
 * "What you're both into" — the Sex Quiz matches (cards you BOTH marked Into it),
 * surfaced as an always-on strip on the Sexboard so the quiz keeps paying off
 * after the reveal instead of being a one-time screen. Each chip deep-links to
 * the Ask composer pre-noted with that act ("tap to propose"). Self-contained and
 * best-effort like PartnerTurnOns: fetches the quiz, renders nothing until it's
 * revealed with at least one match.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSexQuiz } from "@/lib/api";
import { QUIZ_CARD_BY_ID, proposeHref } from "@/lib/quiz-deck";

export default function SharedDesires({ workspaceId }: { workspaceId: string }) {
  const [cardIds, setCardIds] = useState<string[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    getSexQuiz(workspaceId)
      .then((res) => {
        if (cancelled || res.status !== "revealed") return;
        setCardIds((res.matches || []).map((m) => m.cardId));
      })
      .catch(() => { /* strip is best-effort; never blocks the Sexboard */ });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const cards = cardIds.map((id) => QUIZ_CARD_BY_ID[id]).filter(Boolean);
  if (!cards.length) return null;

  return (
    <section
      aria-label="What you're both into"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--r-lg)", boxShadow: "var(--ring-hairline)" }}
    >
      <span className="kicker" style={{ color: "rgb(var(--accent-rgb) / 0.85)" }}>
        What you&apos;re both into · tap to propose
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {cards.map((c) => (
          <Link
            key={c.id}
            href={proposeHref(c.label)}
            className="pressable"
            style={{ padding: "5px 11px", borderRadius: "var(--r-pill)", fontSize: "var(--fs-13)", background: "var(--cream-a08)", color: "var(--cream)", boxShadow: "var(--ring-hairline)", textDecoration: "none" }}
          >
            {c.emoji} {c.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
