import { describe, expect, it } from "vitest";
import { planCountdown, planTeaserDraft } from "../plan-time";
import { moodMatchCopy } from "../activity";

// Local-time anchor: Thursday Oct 8 2026, 18:00.
const NOW = new Date(2026, 9, 8, 18, 0, 0);
const at = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi);

describe("planCountdown", () => {
  it("rounds to something warm, never to the second", () => {
    expect(planCountdown(new Date(NOW.getTime() - 10 * 60_000), NOW)).toBe("It’s time");
    expect(planCountdown(new Date(NOW.getTime() + 3 * 60_000), NOW)).toBe("Any minute now");
    expect(planCountdown(new Date(NOW.getTime() + 40 * 60_000), NOW)).toBe("In 40 minutes");
    expect(planCountdown(at(8, 19), NOW)).toBe("In an hour");
    expect(planCountdown(at(8, 21), NOW)).toBe("In 3 hours");
    expect(planCountdown(at(10, 21), NOW)).toBe("In 2 days");
  });
});

describe("planTeaserDraft", () => {
  it("opens with the plan's day, addressed to the partner", () => {
    expect(planTeaserDraft(at(8, 21), NOW)).toBe("Tonight I'm going to ");
    expect(planTeaserDraft(at(9, 21), NOW)).toBe("Tomorrow I'm going to ");
    expect(planTeaserDraft(at(10, 21), NOW)).toBe("Saturday I'm going to ");
    expect(planTeaserDraft(at(20, 21), NOW)).toBe("When it's time, I'm going to ");
    const morning = new Date(2026, 9, 8, 8, 0);
    expect(planTeaserDraft(at(8, 13), morning)).toBe("Later I'm going to ");
  });
});

describe("moodMatchCopy", () => {
  it("is actor-less for every match kind and feed action", () => {
    expect(moodMatchCopy("match")).toBe("You're both horny");
    expect(moodMatchCopy("horny")).toBe("You're both horny");
    expect(moodMatchCopy("match_mixed")).toBe("You're both up for it");
    expect(moodMatchCopy("mixed")).toBe("You're both up for it");
    expect(moodMatchCopy("match_open")).toBe("You're both open to it");
    expect(moodMatchCopy(undefined)).toBe("You're both horny");
  });
});
