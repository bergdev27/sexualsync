import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Exercise the component's effect/ref lifecycle without a DOM dependency.
const hooks = vi.hoisted(() => ({ pathname: "/signin", ref: { current: false }, effect: null as null | (() => void | (() => void)), deps: undefined as unknown[] | undefined, cleanup: undefined as void | (() => void) }));
const calls = vi.hoisted(() => ({ bootstrap: vi.fn(), profile: vi.fn(), ensure: vi.fn(), prefs: { chat: false, requests: true } }));
vi.mock("react", () => ({
  useRef: () => hooks.ref,
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (!hooks.deps || deps.some((dep, i) => dep !== hooks.deps?.[i])) {
      hooks.cleanup?.(); hooks.effect = effect; hooks.deps = deps;
    }
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => hooks.pathname }));
vi.mock("@/lib/api", () => ({ getBootstrap: calls.bootstrap }));
vi.mock("@/lib/profile-cache", () => ({ getProfileCached: calls.profile }));
vi.mock("@/lib/pwa-reconnect", () => import("../pwa-reconnect"));
vi.mock("@/lib/push-subscription", () => ({ ensurePushSubscription: calls.ensure, readStoredPushPrefs: () => calls.prefs }));
import PushReconnect from "../../components/PushReconnect";

async function render(pathname: string) {
  hooks.pathname = pathname;
  PushReconnect();
  if (hooks.effect) { const effect = hooks.effect; hooks.effect = null; hooks.cleanup = effect(); }
  await Promise.resolve(); await Promise.resolve();
}
beforeEach(() => {
  vi.clearAllMocks();
  hooks.ref = { current: false }; hooks.deps = undefined; hooks.effect = null; hooks.cleanup = undefined;
  const navigator = { serviceWorker: {} };
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("window", { navigator, Notification: { permission: "granted" }, PushManager: {}, location: { origin: "https://app.example" } });
  vi.stubGlobal("Notification", window.Notification);
  calls.bootstrap.mockResolvedValue({ activeWorkspaceId: "room", workspaces: [] });
  calls.profile.mockResolvedValue({ activeWorkspaceId: "room", workspaces: [] });
});
afterEach(() => { hooks.cleanup?.(); vi.unstubAllGlobals(); });

it.each(["/signin", "/signed-out", "/pwa-reconnect", "/auth-blocked", "/welcome", "/splash", "/"])("skips public %s without consuming launch eligibility", async (path) => {
  await render(path);
  expect(calls.profile).not.toHaveBeenCalled();
  expect(calls.bootstrap).not.toHaveBeenCalled();
  expect(calls.ensure).not.toHaveBeenCalled();
  await render("/sexboard");
  expect(calls.bootstrap).toHaveBeenCalledWith(undefined, { suppressPwaReconnect: true });
  expect(calls.ensure).toHaveBeenCalledWith("room", calls.prefs);
  await render("/space");
  expect(calls.ensure).toHaveBeenCalledTimes(1);
});
it("does not share a potentially navigating profile-cache request", async () => {
  await render("/sexboard");
  expect(calls.profile).not.toHaveBeenCalled();
  expect(calls.bootstrap).toHaveBeenCalledWith(undefined, { suppressPwaReconnect: true });
});
it("ignores a late bootstrap after navigation to a public route", async () => {
  let resolve!: (value: unknown) => void;
  calls.bootstrap.mockReturnValue(new Promise((done) => { resolve = done; }));
  calls.profile.mockReturnValue(new Promise(() => {}));
  await render("/sexboard");
  await render("/pwa-reconnect");
  resolve({ activeWorkspaceId: "room" });
  await Promise.resolve(); await Promise.resolve();
  expect(calls.ensure).not.toHaveBeenCalled();
});
it("uses the first workspace when none is active", async () => {
  calls.bootstrap.mockResolvedValue({ workspaces: [{ id: "fallback" }] });
  await render("/sexboard");
  expect(calls.ensure).toHaveBeenCalledWith("fallback", calls.prefs);
});
it("retries eligibility after effect cleanup before bootstrap completes", async () => {
  let resolve!: (value: unknown) => void;
  calls.bootstrap.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await render("/sexboard");
  // Force a same-route effect setup/cleanup replay, as in React Strict Mode.
  hooks.deps = undefined;
  await render("/sexboard");
  resolve({ activeWorkspaceId: "stale-room" });
  await Promise.resolve(); await Promise.resolve();
  expect(calls.ensure).toHaveBeenCalledTimes(1);
  expect(calls.ensure).toHaveBeenCalledWith("room", calls.prefs);
});
it("treats unauthorized bootstrap as best effort", async () => {
  calls.bootstrap.mockRejectedValue(new Error("Unauthorized"));
  await render("/sexboard");
  expect(calls.ensure).not.toHaveBeenCalled();
});
it.each(["denied", "default", "unsupported"])("does nothing for %s notifications", async (permission) => {
  if (permission === "unsupported") delete (window as unknown as Record<string, unknown>).Notification;
  else vi.stubGlobal("Notification", { permission });
  await render("/sexboard");
  expect(calls.profile).not.toHaveBeenCalled();
  expect(calls.bootstrap).not.toHaveBeenCalled();
  expect(calls.ensure).not.toHaveBeenCalled();
});
