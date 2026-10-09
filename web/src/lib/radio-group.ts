import type { KeyboardEvent } from "react";

/**
 * Keyboard support for a chip set that behaves as one choice
 * (role="radiogroup" with role="radio" children): arrow keys move the choice
 * and focus with it, Home/End jump to the ends. Pair it with roving tabindex
 * on the radios (tabIndex 0 on the checked one, -1 on the rest) via
 * `radioTabIndex`.
 */
export function radioGroupKeyDown<T>(
  event: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (value: T) => void,
): void {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key) || values.length === 0) return;
  event.preventDefault();
  const index = values.indexOf(current);
  const last = values.length - 1;
  const next = event.key === "Home" ? 0
    : event.key === "End" ? last
    : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index >= last ? 0 : index + 1)
    : (index <= 0 ? last : index - 1);
  onChange(values[next]);
  const radios = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  radios[next]?.focus();
}

/** Roving tabindex: only the checked radio (or the first, if none) is a tab stop. */
export function radioTabIndex<T>(values: readonly T[], current: T, value: T): 0 | -1 {
  const hasChecked = values.includes(current);
  if (value === current) return 0;
  return !hasChecked && values[0] === value ? 0 : -1;
}
