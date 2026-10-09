// quiz-deck data-integrity tests.
//
// quiz-deck.ts is mostly a large static deck of cards + a derived id map and two
// helpers. There's no runtime logic to flake, but the deck is hand-authored, so
// these guard against content-entry mistakes that would silently break the Sex
// Quiz: a duplicate card id (clobbers QUIZ_CARD_BY_ID), a card pointing at a
// category that doesn't exist (orphaned in the grouped reveal), or a malformed
// card. Plus the two helpers.
import { describe, expect, it } from "vitest";

import {
  QUIZ_CARD_BY_ID,
  QUIZ_CATEGORIES,
  QUIZ_DECK,
  RETIRED_QUIZ_CARD_IDS,
  activeQuizRatings,
  categoryTitle,
  proposeHref,
  quizOverlapByCategory,
  unratedQuizCards,
} from "../quiz-deck";
import {
  BLIND_REVEAL_QUESTIONS,
  DEFAULT_BLIND_REVEAL_QUESTION,
  nextBlindRevealQuestion,
} from "../blind-reveal-questions";

describe("quiz-deck: data integrity", () => {
  it("has a non-trivial deck and category list", () => {
    expect(QUIZ_DECK.length).toBeGreaterThan(20);
    expect(QUIZ_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("has unique card ids (a dup would clobber QUIZ_CARD_BY_ID)", () => {
    const ids = QUIZ_DECK.map((card) => card.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("has unique category ids", () => {
    const ids = QUIZ_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every card belongs to a defined category", () => {
    const categoryIds = new Set(QUIZ_CATEGORIES.map((c) => c.id));
    const orphans = QUIZ_DECK.filter((card) => !categoryIds.has(card.category)).map(
      (card) => `${card.id}→${card.category}`,
    );
    expect(orphans).toEqual([]);
  });

  it("every card has the required non-empty fields and boolean flags", () => {
    const bad = QUIZ_DECK.filter((card) =>
      !card.id
      || !card.label
      || !card.emoji
      || !card.desc
      || typeof card.role !== "boolean"
      || typeof card.edge !== "boolean",
    ).map((card) => card.id || "(missing id)");
    expect(bad).toEqual([]);
  });

  it("QUIZ_CARD_BY_ID maps every card by id and nothing extra", () => {
    expect(Object.keys(QUIZ_CARD_BY_ID).length).toBe(QUIZ_DECK.length);
    for (const card of QUIZ_DECK) {
      expect(QUIZ_CARD_BY_ID[card.id]).toBe(card);
    }
  });
});

describe("quiz-deck: ids and point of view", () => {
  it("never reuses a retired id", () => {
    expect(RETIRED_QUIZ_CARD_IDS.filter((id) => QUIZ_CARD_BY_ID[id])).toEqual([]);
  });

  it("gives every first-person card a give/receive choice", () => {
    // "Rub my clit while you fuck me" is answerable by the partner doing it only
    // if they can say "give". Mutual wording ("we", "our", "each other") is exempt.
    const firstPerson = /\b(me|my|I)\b/;
    const mutual = /\b(we|us|our|each other|together)\b/i;
    const missing = QUIZ_DECK.filter((card) => firstPerson.test(card.label) && !mutual.test(card.label) && !card.role)
      .map((card) => card.id);
    expect(missing).toEqual([]);
  });

  it("deals gentle cards before edge cards within each category", () => {
    const seenEdge = new Set<string>();
    const late: string[] = [];
    for (const card of QUIZ_DECK) {
      if (card.edge) seenEdge.add(card.category);
      else if (seenEdge.has(card.category)) late.push(card.id);
    }
    expect(late).toEqual([]);
  });

  it("unratedQuizCards lists only current cards without a rating", () => {
    const ratings = Object.fromEntries(QUIZ_DECK.slice(1).map((card) => [card.id, { interest: "pass" }]));
    ratings.handedge = { interest: "into" };
    expect(unratedQuizCards(ratings).map((card) => card.id)).toEqual([QUIZ_DECK[0].id]);
  });

  it("activeQuizRatings drops retired and unknown ids", () => {
    expect(activeQuizRatings({ oral: 1, handedge: 2, nope: 3 })).toEqual({ oral: 1 });
  });
});

describe("quiz-deck: overlap by category", () => {
  it("ranks categories by shared cards and ignores unknown ids", () => {
    const overlap = quizOverlapByCategory(
      [{ cardId: "oral" }, { cardId: "sixtynine" }, { cardId: "frombehind" }, { cardId: "handedge" }],
      [{ cardId: "facesitting" }, { cardId: "analsex" }],
    );
    expect(overlap.map((c) => [c.category, c.matches, c.curious])).toEqual([
      ["mouths", 2, 1],
      ["positions", 1, 0],
      ["anal", 0, 1],
    ]);
  });
});

describe("blind reveal questions", () => {
  it("opens on the default and cycles through every question", () => {
    expect(DEFAULT_BLIND_REVEAL_QUESTION).toBe(BLIND_REVEAL_QUESTIONS[0]);
    const seen = new Set<string>();
    let current = DEFAULT_BLIND_REVEAL_QUESTION;
    for (let i = 0; i < BLIND_REVEAL_QUESTIONS.length; i += 1) {
      seen.add(current);
      current = nextBlindRevealQuestion(current);
    }
    expect(seen.size).toBe(BLIND_REVEAL_QUESTIONS.length);
    expect(current).toBe(DEFAULT_BLIND_REVEAL_QUESTION);
    expect(nextBlindRevealQuestion("my own question")).toBe(BLIND_REVEAL_QUESTIONS[0]);
  });
});

describe("quiz-deck: helpers", () => {
  it("categoryTitle resolves every category and falls back to '' for unknown ids", () => {
    for (const c of QUIZ_CATEGORIES) {
      expect(categoryTitle(c.id)).toBe(c.title);
    }
    expect(categoryTitle("does-not-exist")).toBe("");
    expect(categoryTitle("")).toBe("");
  });

  it("proposeHref builds an encoded /ask deep-link that round-trips the label", () => {
    const href = proposeHref("Oral & hands");
    expect(href.startsWith("/ask?note=")).toBe(true);
    // The label is percent-encoded (no raw space or ampersand in the query).
    expect(href).not.toContain(" ");
    expect(href.slice("/ask?note=".length)).not.toContain("&");
    const note = new URLSearchParams(href.split("?")[1]).get("note");
    expect(note).toBe("From our Sex Quiz: Oral & hands");
  });
});
