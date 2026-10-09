import { describe, expect, it } from "vitest";

import { matchSeedActs, seededActsFor, SEEDED_ACT_PREFIX } from "../ask-seed";

const library = [
  { id: "a1", label: "💆 Massage" },
  { id: "a2", label: "Kissing" },
];

describe("reveal seeds the Ask composer", () => {
  it("matches library Acts by name and leaves the rest unmatched", () => {
    expect(matchSeedActs(["massage", "Long, filthy makeouts"], library)).toEqual({
      ids: ["a1"],
      unmatched: ["Long, filthy makeouts"],
    });
  });

  it("turns each unmatched name into one Act for this Ask, deduped by name", () => {
    const acts = seededActsFor(["Long, filthy makeouts", "long, filthy  makeouts", "Oral"], "ws");
    expect(acts.map((act) => act.label)).toEqual(["Long, filthy makeouts", "Oral"]);
    expect(acts.every((act) => act.id.startsWith(SEEDED_ACT_PREFIX) && act.workspaceId === "ws")).toBe(true);
    expect(new Set(acts.map((act) => act.id)).size).toBe(2);
    expect(seededActsFor(["", "  "], "ws")).toEqual([]);
  });
});
