/**
 * The mood light's mark: two ribbon strokes, one per partner.
 *
 * - "off":   both strokes faint.
 * - "mine":  your stroke lit, the other stays a ghost. It never changes with
 *            the partner's state, so the mark can't leak it.
 * - "both":  both strokes lit and interlaced (the match).
 *
 * Purely decorative; the surrounding copy carries the meaning.
 */
export type MoodRibbonState = "off" | "mine" | "both";

export default function MoodRibbonMark({
  state = "both",
  className = "",
  size = 28,
}: {
  state?: MoodRibbonState;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={`mood-ribbon ${className}`.trim()}
      data-state={state}
      width={size}
      height={Math.round(size * 0.58)}
      viewBox="0 0 48 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="mood-ribbon-theirs" d="M3 14 C 11 3, 19 3, 24 14 S 37 25, 45 14" />
      <path className="mood-ribbon-mine" d="M3 14 C 11 25, 19 25, 24 14 S 37 3, 45 14" />
    </svg>
  );
}
