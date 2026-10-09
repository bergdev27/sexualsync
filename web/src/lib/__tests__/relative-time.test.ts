import { describe, expect, it } from "vitest";
import { relativeAge } from "../relative-time";

// Local-time anchor: Thursday Oct 8 2026, 20:00.
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo, d, h, mi).toISOString();

describe("relativeAge", () => {
  it("handles missing or invalid values", () => {
    expect(relativeAge("", NOW)).toBe("recently");
    expect(relativeAge("not a date", NOW)).toBe("recently");
    expect(relativeAge(undefined, NOW)).toBe("recently");
  });

  it("uses minutes and hours for today", () => {
    expect(relativeAge(new Date(NOW - 20 * 1000), NOW)).toBe("just now");
    expect(relativeAge(new Date(NOW + 5 * 1000), NOW)).toBe("just now");
    expect(relativeAge(new Date(NOW - 5 * 60 * 1000), NOW)).toBe("5m ago");
    expect(relativeAge(at(2026, 9, 8, 17, 0), NOW)).toBe("3h ago");
  });

  it("uses calendar days, not 24h buckets", () => {
    expect(relativeAge(at(2026, 9, 7, 23, 30), NOW)).toBe("Yesterday");
    expect(relativeAge(at(2026, 9, 6), NOW)).toBe("2d ago");
    expect(relativeAge(at(2026, 9, 2), NOW)).toBe("6d ago");
  });

  it("shows a real date for anything a week or older, never 'last week'", () => {
    const weekOld = relativeAge(at(2026, 9, 1), NOW);
    const monthsOld = relativeAge(at(2026, 7, 12), NOW);
    const lastYear = relativeAge(at(2025, 7, 12), NOW);
    for (const label of [weekOld, monthsOld, lastYear]) expect(label).not.toMatch(/last week|ago/i);
    expect(monthsOld).not.toEqual(weekOld);
    expect(lastYear).toContain("2025");
    expect(monthsOld).not.toContain("2026");
  });
});
