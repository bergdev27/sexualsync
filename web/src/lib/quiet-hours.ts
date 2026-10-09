/**
 * Recipient-controlled quiet hours (research rec #4). A per-device window in
 * which the server holds back pushes to this device (functions/api/_push.js
 * isWithinQuietHours). It rides along with every push-subscription save, is
 * kept only on this device's subscription, and is never shown to the partner.
 */

export type QuietHours = { enabled: boolean; start: string; end: string };

export const QUIET_HOURS_KEY = "sexualsync-quiet-hours";
export const QUIET_HOURS_DEFAULT: QuietHours = { enabled: false, start: "22:00", end: "08:00" };
export const QUIET_HOURS_CHANGE_EVENT = "sexualsync:quiet-hours-change";

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function cleanClock(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  return CLOCK_RE.test(text) ? text : fallback;
}

export function readStoredQuietHours(): QuietHours {
  if (typeof localStorage === "undefined") return { ...QUIET_HOURS_DEFAULT };
  try {
    const raw = JSON.parse(localStorage.getItem(QUIET_HOURS_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...QUIET_HOURS_DEFAULT };
    return {
      enabled: raw.enabled === true,
      start: cleanClock(raw.start, QUIET_HOURS_DEFAULT.start),
      end: cleanClock(raw.end, QUIET_HOURS_DEFAULT.end),
    };
  } catch {
    return { ...QUIET_HOURS_DEFAULT };
  }
}

export function storeQuietHours(value: QuietHours): void {
  try {
    localStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the setting still applies for this save.
  }
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The wire shape for /api/push-subscribe, or null when quiet hours are off. */
export function quietHoursPayload(value: QuietHours = readStoredQuietHours()): { start: string; end: string; timeZone: string } | null {
  if (!value.enabled || value.start === value.end) return null;
  return { start: value.start, end: value.end, timeZone: deviceTimeZone() };
}

/** A short signature so a quiet-hours change counts as a changed subscription. */
export function quietHoursSignature(value: QuietHours = readStoredQuietHours()): string {
  const payload = quietHoursPayload(value);
  return payload ? `${payload.start}-${payload.end}@${payload.timeZone}` : "off";
}

/** "10 pm" / "7:30 am" for a 24h clock string. */
export function clockLabel(clock: string): string {
  const [hours, minutes] = clock.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return clock;
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}
