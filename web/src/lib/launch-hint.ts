/**
 * Last-known launch hint: which room this device opened last time and whether
 * that room needs its passphrase key to read. RoomEncryptionGate reads it on a
 * cold launch so a screen can start painting (and fetching) in parallel with
 * the session check instead of after it.
 *
 * Deliberately minimal and non-sensitive: a workspace id and one boolean. No
 * key material, no profile fields, no content. The `ss:` prefix means
 * sign-out's namespace sweep removes it with everything else.
 */

const LAUNCH_HINT_KEY = "ss:launch-hint";
const LAUNCH_HINT_VERSION = 1;

export interface LaunchHint {
  workspaceId: string;
  /** True when the room is end-to-end encrypted and needs its key on-device. */
  roomLocked: boolean;
}

export function readLaunchHint(): LaunchHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAUNCH_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; workspaceId?: unknown; roomLocked?: unknown };
    if (parsed?.v !== LAUNCH_HINT_VERSION) return null;
    if (typeof parsed.workspaceId !== "string" || !parsed.workspaceId) return null;
    // Anything but an explicit `false` is treated as locked (fail closed).
    return { workspaceId: parsed.workspaceId, roomLocked: parsed.roomLocked !== false };
  } catch {
    return null;
  }
}

export function writeLaunchHint(hint: LaunchHint | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!hint) {
      window.localStorage.removeItem(LAUNCH_HINT_KEY);
      return;
    }
    window.localStorage.setItem(
      LAUNCH_HINT_KEY,
      JSON.stringify({ v: LAUNCH_HINT_VERSION, workspaceId: hint.workspaceId, roomLocked: hint.roomLocked }),
    );
  } catch {
    // Storage blocked: launches just take the slower, fully verified path.
  }
}
