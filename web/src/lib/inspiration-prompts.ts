/**
 * Offline "Today's prompt" lines. Inspiration paints one of these first and
 * swaps in the generated prompt when it arrives; Play shows the same line as
 * its way into Inspiration. Picking by calendar day (not at random per
 * render) keeps the two screens saying the same thing on the same day.
 *
 * The lines live on a low-to-high ladder (desire-voice.ts DAILY_LADDER); a
 * person's own spice ceiling decides how far up it goes.
 */
import { DEFAULT_SPICE, dailyPromptFor, type SpiceCeiling } from "./desire-voice";

export const FALLBACK_PROMPTS = [
  "Name the fantasy that would feel easier if they admitted one too.",
  "What want have you been editing in your head instead of saying plainly?",
  "Write the version of it that would make you feel relieved to be known.",
];

export function fallbackPromptForToday(now = new Date(), ceiling: SpiceCeiling = DEFAULT_SPICE): string {
  return dailyPromptFor(ceiling, now);
}
