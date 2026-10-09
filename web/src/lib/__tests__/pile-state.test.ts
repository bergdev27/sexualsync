// Badge parity: pileNeedsMe must agree with attentionCountFor's Pile rule in
// functions/api/_attention.js (tests/unit/attention.test.mjs uses the same
// cases): revealed, or under the minimum drops, needs you.
import { describe, expect, it } from "vitest";

import { pileMinNeeded, pileNeedsMe } from "../pile-state";

const pile = (mine: string[], extra: Record<string, unknown> = {}) => ({
  isRevealed: false,
  mine,
  maxDropCount: 4,
  ...extra,
});

describe("pileNeedsMe", () => {
  it("needs you with no drops, and with one drop under a two-drop minimum", () => {
    expect(pileNeedsMe(pile([]))).toBe(true);
    expect(pileNeedsMe(pile(["Kiss"]))).toBe(true);
  });

  it("stops needing you once you reach the minimum, until it reveals", () => {
    expect(pileNeedsMe(pile(["Kiss", "Massage"]))).toBe(false);
    expect(pileNeedsMe(pile(["Kiss", "Massage"], { isRevealed: true }))).toBe(true);
  });

  it("uses the server's minimum, bounded by a one-drop cap", () => {
    expect(pileMinNeeded({ minDropCount: 2, maxDropCount: 4 })).toBe(2);
    expect(pileMinNeeded({ maxDropCount: 1 })).toBe(1);
    expect(pileNeedsMe(pile(["Kiss"], { maxDropCount: 1, minDropCount: 1 }))).toBe(false);
    expect(pileNeedsMe(null)).toBe(false);
  });
});
