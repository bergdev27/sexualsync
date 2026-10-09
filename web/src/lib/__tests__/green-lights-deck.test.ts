import { describe, expect, it } from "vitest";

import {
  GREEN_LIGHT_BY_ID,
  GREEN_LIGHT_CATEGORIES,
  GREEN_LIGHT_DECK,
  RETIRED_GREEN_LIGHT_IDS,
  activeGreenLightAnswers,
  computeGreenLightsReveal,
  actionableGreenLights,
  optionsForCard,
  unansweredGreenLightCards,
} from "../green-lights-deck";

function allTop(): Record<string, { value: string }> {
  return Object.fromEntries(GREEN_LIGHT_DECK.map((card) => [card.id, { value: optionsForCard(card)[0].id }]));
}

describe("green-lights-deck: data integrity", () => {
  it("has unique ids that all point at a defined category", () => {
    const ids = GREEN_LIGHT_DECK.map((card) => card.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const categories = new Set(GREEN_LIGHT_CATEGORIES.map((c) => c.id));
    expect(GREEN_LIGHT_DECK.filter((card) => !categories.has(card.category)).map((card) => card.id)).toEqual([]);
  });

  it("never reuses a retired id", () => {
    expect(RETIRED_GREEN_LIGHT_IDS.filter((id) => GREEN_LIGHT_BY_ID[id])).toEqual([]);
  });

  it("every card has options to answer with", () => {
    expect(GREEN_LIGHT_DECK.filter((card) => optionsForCard(card).length < 2).map((card) => card.id)).toEqual([]);
  });
});

describe("green-lights-deck: reveal valence", () => {
  it("files a shared worry as shared ground, never as a green light", () => {
    const reveal = computeGreenLightsReveal(allTop(), allTop());
    const concernIds = GREEN_LIGHT_DECK.filter((card) => card.valence === "concern").map((card) => card.id);
    expect(concernIds).toContain("pl-pressure");
    expect(concernIds).toContain("cf-bodyconscious");
    expect(reveal.sharedConcerns.map((item) => item.id).sort()).toEqual([...concernIds].sort());
    expect(reveal.greenLights.some((item) => concernIds.includes(item.id))).toBe(false);
  });

  it("treats both saying no to a worry as a green light", () => {
    const card = GREEN_LIGHT_BY_ID["pl-pressure"];
    const last = optionsForCard(card).at(-1)!.id;
    const reveal = computeGreenLightsReveal({ "pl-pressure": { value: last } }, { "pl-pressure": { value: last } });
    expect(reveal.greenLights.map((item) => item.id)).toEqual(["pl-pressure"]);
    expect(reveal.agreedLimits).toEqual([]);
    expect(reveal.sharedConcerns).toEqual([]);
  });
});

describe("green-lights-deck: no scores", () => {
  it("never computes a sync score or a per-topic tally", () => {
    const answers = { "pl-pressure": { value: "agree" }, "am-happy": { value: "agree" } };
    const reveal = computeGreenLightsReveal(answers, answers) as unknown as Record<string, unknown>;
    expect("syncScore" in reveal).toBe(false);
    expect("categories" in reveal).toBe(false);
  });

  it("offers only shared, non-heavy wants as something to try together", () => {
    const want = GREEN_LIGHT_DECK.find((card) => card.scale === "want" && !card.heavy && card.category === "novelty")!;
    const amount = GREEN_LIGHT_BY_ID["am-more"];
    const top = (id: string) => optionsForCard(GREEN_LIGHT_BY_ID[id])[0].id;
    const answers = { [want.id]: { value: top(want.id) }, [amount.id]: { value: top(amount.id) } };
    const { greenLights } = computeGreenLightsReveal(answers, answers);
    expect(actionableGreenLights(greenLights).map((item) => item.id)).toEqual([want.id]);
  });
});

describe("green-lights-deck: new questions after a deck change", () => {
  it("counts a card answered under an old scale as unanswered", () => {
    const answers = allTop();
    answers["sl-tell-after"] = { value: "agree" };
    expect(unansweredGreenLightCards(answers).map((card) => card.id)).toEqual(["sl-tell-after"]);
  });

  it("drops retired cards and stale values from a resubmit", () => {
    const active = activeGreenLightAnswers({
      "am-happy": { value: "agree" },
      "sl-no-need-tell": { value: "agree" },
      "sl-tell-after": { value: "agree" },
    });
    expect(Object.keys(active)).toEqual(["am-happy"]);
  });
});
