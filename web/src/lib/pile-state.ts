import type { PileView } from "./types";

// Drops each partner needs before a Pile can open. Mirrors pileMinDropCount
// in functions/api/pile.js (2, bounded by the Pile's own cap).
export const PILE_MIN_DROPS = 2;

export function pileMinNeeded(pile: Pick<PileView, "minDropCount" | "maxDropCount" | "targetDropCount">): number {
  if (pile.minDropCount && pile.minDropCount > 0) return pile.minDropCount;
  const max = pile.maxDropCount || pile.targetDropCount || 0;
  return max > 0 ? Math.min(PILE_MIN_DROPS, max) : PILE_MIN_DROPS;
}

// "Needs you" for a visible Pile: its reveal is open, or you're still under the
// minimum it needs to open. Must agree with attentionCountFor in
// functions/api/_attention.js so the badge matches the app.
export function pileNeedsMe(pile: Pick<PileView, "isRevealed" | "mine" | "minDropCount" | "maxDropCount" | "targetDropCount"> | null | undefined): boolean {
  if (!pile) return false;
  if (pile.isRevealed) return true;
  return (pile.mine?.length || 0) < pileMinNeeded(pile);
}
