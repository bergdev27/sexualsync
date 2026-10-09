import { describe, expect, it } from "vitest";

import { mergeHandoffDraft } from "../chat-draft";
import { isPlanTeaserStem } from "../plan-time";

describe("handing words to the Sext composer", () => {
  const known = (text: string) => isPlanTeaserStem(text);

  it("fills an empty composer and leaves the same words alone", () => {
    expect(mergeHandoffDraft("", "Tonight I'm going to ", known)).toBe("Tonight I'm going to ");
    expect(mergeHandoffDraft("I want you", "I want you", known)).toBe("I want you");
  });

  it("replaces a lone teaser stem instead of stacking stems", () => {
    expect(mergeHandoffDraft("Tonight I'm going to ", "Tomorrow I'm going to ", known)).toBe("Tomorrow I'm going to ");
    expect(mergeHandoffDraft("Saturday I'm going to ", "Let's talk about this first", known)).toBe("Let's talk about this first");
  });

  it("keeps anything typed and puts the new words on the next line", () => {
    expect(mergeHandoffDraft("Tonight I'm going to tie you up", "Tomorrow I'm going to ", known)).toBe("Tonight I'm going to tie you up\nTomorrow I'm going to ");
  });

  it("recognizes every teaser stem planTeaserDraft writes", () => {
    for (const stem of ["Later I'm going to ", "When it's time, I'm going to ", "Tonight I'm going to ", "Tomorrow I'm going to ", "Friday I'm going to "]) {
      expect(isPlanTeaserStem(stem)).toBe(true);
    }
    expect(isPlanTeaserStem("Tonight I'm going to lick you")).toBe(false);
  });
});
