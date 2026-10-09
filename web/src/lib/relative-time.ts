// Short "when" labels for history rows: "just now", "5m ago", "3h ago",
// "Yesterday", "4d ago", then a real date ("Aug 12", or "Aug 12, 2025" for an
// earlier year). Anything a week or older shows its date, never a vague bucket.
export function relativeAge(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value ?? "").getTime();
  if (!Number.isFinite(timestamp)) return "recently";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const diff = now - timestamp;

  // Small clock skew between devices can put a fresh item a few seconds ahead.
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;

  const date = new Date(timestamp);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const calendarDays = Math.round((startOfToday - startOfThatDay) / (24 * hour));

  if (calendarDays <= 0) return `${Math.floor(diff / hour)}h ago`;
  if (calendarDays === 1) return "Yesterday";
  if (calendarDays < 7) return `${calendarDays}d ago`;

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}
