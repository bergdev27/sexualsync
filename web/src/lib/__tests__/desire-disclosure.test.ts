import { describe, expect, it } from "vitest";

import { GREEN_LIGHT_DECK, computeGreenLightsReveal } from "../green-lights-deck";
import { DAILY_LADDER, STARTER_LADDER, dailyPromptFor, pickStarterLadder, sextPromptsFor, voiced } from "../desire-voice";
import { isHighRisk, normTagFor } from "../fantasy-themes";

describe("Words I like (overlap-only Green Lights cards)", () => {
  const wordCards = GREEN_LIGHT_DECK.filter((card) => card.overlapOnly);

  it("every overlap-only card uses the wd- prefix the server filters on", () => {
    expect(wordCards.length).toBeGreaterThan(0);
    expect(wordCards.filter((card) => !card.id.startsWith("wd-")).map((card) => card.id)).toEqual([]);
    expect(GREEN_LIGHT_DECK.filter((card) => card.id.startsWith("wd-") && !card.overlapOnly).map((c) => c.id)).toEqual([]);
  });

  it("reveals only words both said yes to, and never a mismatch or pass", () => {
    const mine = { "wd-call-baby": { value: "yes" }, "wd-call-slut": { value: "yes" }, "wd-use-beg": { value: "pass" } };
    const partner = { "wd-call-baby": { value: "yes" }, "wd-call-slut": { value: "pass" }, "wd-use-beg": { value: "yes" } };
    const reveal = computeGreenLightsReveal(mine, partner);
    expect(reveal.wordsShared.map((item) => item.id)).toEqual(["wd-call-baby"]);
    expect(reveal.talk).toEqual([]);
    expect(reveal.agreedLimits).toEqual([]);
    expect(reveal.greenLights).toEqual([]);
    expect("syncScore" in reveal).toBe(false);
  });
});

describe("prompt ladder", () => {
  it("orders the composer stems low risk first and respects the ceiling", () => {
    const mildOnly = new Set(STARTER_LADDER.filter((p) => p.tier === "mild").map((p) => p.text));
    for (let i = 0; i < 20; i += 1) {
      expect(pickStarterLadder("mild").every((text) => mildOnly.has(text))).toBe(true);
    }
    const full = pickStarterLadder("filthy", 3, () => 0);
    const tiers = full.map((text) => STARTER_LADDER.find((p) => p.text === text)?.tier);
    expect(tiers).toEqual(["mild", "spicy", "filthy"]);
  });

  it("today's prompt never climbs past the ceiling", () => {
    const mild = new Set(DAILY_LADDER.filter((p) => p.tier === "mild").map((p) => p.text));
    for (let day = 0; day < 30; day += 1) {
      expect(mild.has(dailyPromptFor("mild", new Date(2026, 4, 1 + day)))).toBe(true);
    }
  });

  it("Sext prompts at mild are affirmation, not explicit asks", () => {
    expect(sextPromptsFor("mild")).toContain("I want you because ");
    expect(sextPromptsFor("mild")).not.toContain("Tell me one thing you'd do to me tonight.");
    expect(sextPromptsFor("spicy")).toContain("Tell me one thing you'd do to me tonight.");
  });

  it("standard voice is the app as it was", () => {
    expect(voiced("standard", { gentle: "a", standard: "b", filthy: "c" })).toBe("b");
  });
});

describe("fantasy themes", () => {
  it("tags only themes the research measured", () => {
    expect(normTagFor("Tie me up and take control")?.id).toBe("power");
    expect(normTagFor("Sex with a stranger at a bar")?.id).toBe("stranger");
    expect(normTagFor("Swap partners with another couple")?.id).toBe("swinging");
    expect(normTagFor("A little spanking")?.id).toBe("kink");
    expect(normTagFor("Try the hotel window fantasy.")).toBeNull();
    expect(normTagFor("Slow kissing on the couch")).toBeNull();
  });

  it("flags other people and pain as talk-first themes", () => {
    expect(isHighRisk("A threesome with someone else")).toBe(true);
    expect(isHighRisk("Choke me a little")).toBe(true);
    expect(isHighRisk("Slow kissing on the couch")).toBe(false);
  });
});
