// A haptic for something that happens on its own (a reveal opening on load),
// not in answer to a tap. Browsers block navigator.vibrate until the page has
// had a user gesture and log an error each time, so this only buzzes once the
// person has interacted with the page.
export function vibrateIfActive(pattern: number | number[]): void {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (!activation?.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {
    // Haptics are a nicety; never let one throw.
  }
}
