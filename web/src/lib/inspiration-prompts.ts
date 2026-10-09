/**
 * Offline "Today's prompt" lines. Inspiration paints one of these first and
 * swaps in the generated prompt when it arrives; Play shows the same line as
 * its way into Inspiration. Picking by calendar day (not at random per
 * render) keeps the two screens saying the same thing on the same day.
 */
export const FALLBACK_PROMPTS = [
  "Name the fantasy that would feel easier if they admitted one too.",
  "What want have you been editing in your head instead of saying plainly?",
  "Write the version of it that would make you feel relieved to be known.",
];

export function fallbackPromptForToday(now = new Date()): string {
  const day = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return FALLBACK_PROMPTS[((day % FALLBACK_PROMPTS.length) + FALLBACK_PROMPTS.length) % FALLBACK_PROMPTS.length];
}
