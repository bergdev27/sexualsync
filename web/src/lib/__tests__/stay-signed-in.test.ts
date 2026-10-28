// Session persistence across PWA cold starts. iOS wipes sessionStorage when
// the web-app process dies; the `ss:auth:launch-at` localStorage stamp (swept
// by the sign-out `ss:` cleanup) is what lets the gate honour the per-user
// staySignedInDays window instead of forcing a re-auth on every launch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistentLaunchStamp,
  hasPersistentLaunchOk,
  markLaunchAuthenticated,
  shouldForceLaunchReauth,
} from "../launch-auth";
import { clearAllNamespacedLocalState } from "../local-storage-sweep";

const DAY_MS = 24 * 60 * 60 * 1000;
const STAMP_KEY = "ss:auth:launch-at";

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => { map.clear(); },
    __map: map,
  };
}

let localStorageMock: ReturnType<typeof makeStorage>;
let sessionStorageMock: ReturnType<typeof makeStorage>;

beforeEach(() => {
  localStorageMock = makeStorage();
  sessionStorageMock = makeStorage();
  vi.stubGlobal("window", {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistent launch stamp", () => {
  it("markLaunchAuthenticated writes both the session marker and the persistent stamp", () => {
    markLaunchAuthenticated();
    expect(sessionStorageMock.getItem("ss:auth:launch-ok")).toBe("1");
    const at = Number(localStorageMock.getItem(STAMP_KEY));
    expect(Number.isFinite(at)).toBe(true);
    expect(Math.abs(at - Date.now())).toBeLessThan(5000);
  });

  it("hasPersistentLaunchOk is false when the window is disabled (0 days)", () => {
    markLaunchAuthenticated();
    expect(hasPersistentLaunchOk(0)).toBe(false);
  });

  it("hasPersistentLaunchOk is false with no prior open", () => {
    expect(hasPersistentLaunchOk(30)).toBe(false);
  });

  it("honours the configured window", () => {
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    localStorageMock.setItem(STAMP_KEY, String(now - 2 * DAY_MS));
    expect(hasPersistentLaunchOk(1, now)).toBe(false);
    expect(hasPersistentLaunchOk(2, now)).toBe(true);
    expect(hasPersistentLaunchOk(7, now)).toBe(true);
    expect(hasPersistentLaunchOk(30, now)).toBe(true);
  });

  it("rejects corrupt or future-stamped values", () => {
    const now = Date.UTC(2026, 9, 28, 12, 0, 0);
    localStorageMock.setItem(STAMP_KEY, "not-a-number");
    expect(hasPersistentLaunchOk(30, now)).toBe(false);
    localStorageMock.setItem(STAMP_KEY, String(now + 60 * 60 * 1000));
    expect(hasPersistentLaunchOk(30, now)).toBe(false);
  });
});

describe("shouldForceLaunchReauth", () => {
  it("legacy escape hatch (reauthOnLaunch === false) never forces", () => {
    expect(shouldForceLaunchReauth({
      reauthOnLaunch: false, staySignedInDays: 0, persistentOk: false, reauthAttemptedRecently: false,
    })).toBe(false);
  });

  it("fresh persistent stamp inside the window skips the forced re-auth", () => {
    expect(shouldForceLaunchReauth({
      reauthOnLaunch: true, staySignedInDays: 7, persistentOk: true, reauthAttemptedRecently: false,
    })).toBe(false);
  });

  it("stale stamp outside the window still forces re-auth (default behaviour)", () => {
    expect(shouldForceLaunchReauth({
      reauthOnLaunch: true, staySignedInDays: 7, persistentOk: false, reauthAttemptedRecently: false,
    })).toBe(true);
  });

  it("default settings (window 0) force re-auth exactly as before", () => {
    expect(shouldForceLaunchReauth({
      staySignedInDays: 0, persistentOk: true, reauthAttemptedRecently: false,
    })).toBe(true);
  });

  it("loop guard beats the window when a reauth just ran", () => {
    expect(shouldForceLaunchReauth({
      reauthOnLaunch: true, staySignedInDays: 30, persistentOk: false, reauthAttemptedRecently: true,
    })).toBe(false);
  });
});

describe("sign-out sweep", () => {
  it("clearAllNamespacedLocalState removes the persistent launch stamp", () => {
    localStorageMock.setItem(STAMP_KEY, String(Date.now()));
    localStorageMock.setItem("ss:auth:launch-ok", "1");
    localStorageMock.setItem("unrelated-key", "keep");
    clearAllNamespacedLocalState();
    expect(localStorageMock.getItem(STAMP_KEY)).toBeNull();
    expect(localStorageMock.getItem("ss:auth:launch-ok")).toBeNull();
    expect(localStorageMock.getItem("unrelated-key")).toBe("keep");
  });

  it("clearPersistentLaunchStamp drops the stamp so the next account cannot ride it", () => {
    markLaunchAuthenticated();
    localStorageMock.setItem("reconnect-loop-guard-key", "armed");
    expect(hasPersistentLaunchOk(30)).toBe(true);
    clearPersistentLaunchStamp();
    expect(localStorageMock.getItem(STAMP_KEY)).toBeNull();
    expect(hasPersistentLaunchOk(30)).toBe(false);
    // The cooldown counter lives outside the stamp and must survive.
    expect(localStorageMock.getItem("reconnect-loop-guard-key")).toBe("armed");
  });
});
