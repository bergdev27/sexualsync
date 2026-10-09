import { useEffect, useState } from "react";

// The current time as state, refreshed every `intervalMs` and whenever the page
// becomes visible again. Components compare against this instead of calling
// Date.now() during render, which keeps render pure and still lets a cooldown
// run out while the page stays open.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    // No re-renders while hidden; the visibility handler catches up on return.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return now;
}
