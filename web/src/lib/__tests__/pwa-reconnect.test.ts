import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBootstrap, getChatImageBlob, getProfile, maybeReconnectStandalonePwa, narrateActs, ApiUnauthorizedError } from "../api";
import { markIntentionalSignOut } from "../auth-state";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const replace = vi.fn();
function locate(path: string) {
  Object.assign(window.location, new URL(path, "https://app.example"));
  const url = new URL(path, "https://app.example");
  Object.assign(window.location, { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash });
}
beforeEach(() => {
  vi.stubGlobal("window", { location: { replace }, sessionStorage: storage(), localStorage: storage(), navigator: {}, matchMedia: () => ({ matches: true }) });
  locate("/sexboard?view=all#today");
  replace.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
});
afterEach(() => vi.unstubAllGlobals());

const publicPaths = ["/", "/signin", "/signed-out", "/welcome", "/splash", "/pwa-reconnect", "/pwa-reconnect?approve=test-id#secret=test-secret", "/auth-blocked", "/signin/", "/%70wa-reconnect"];
describe("automatic unauthorized reconnect", () => {
  it.each(publicPaths)("stays on public route %s", async (path) => {
    locate(path);
    await expect(getProfile()).rejects.toBeInstanceOf(ApiUnauthorizedError);
    expect(replace).not.toHaveBeenCalled();
  });
  it("guards the independent narration request entry point", async () => {
    locate("/auth-blocked");
    await expect(narrateActs({ you: "", partner: "", acts: [] })).rejects.toBeInstanceOf(ApiUnauthorizedError);
    expect(replace).not.toHaveBeenCalled();
  });
  it("guards the binary request entry point", async () => {
    locate("/pwa-reconnect?approve=test-id#secret=test-secret");
    await expect(getChatImageBlob({ workspaceId: "room", media: { mediaId: "test", key: "test", iv: "test", mediaType: "image/png", mediaSize: 0 } })).rejects.toBeInstanceOf(ApiUnauthorizedError);
    expect(replace).not.toHaveBeenCalled();
  });
  it("reconnects protected foreground requests preserving query and hash", async () => {
    await expect(getProfile()).rejects.toBeInstanceOf(ApiUnauthorizedError);
    const url = new URL(replace.mock.calls[0][0], window.location.origin);
    expect(url.pathname).toBe("/pwa-reconnect");
    expect(url.searchParams.get("returnTo")).toBe("/sexboard?view=all#today");
  });
  it.each([false, true])("preserves deliberate signin reconnect preferBrowserSession=%s", (preferBrowserSession) => {
    locate("/signin");
    expect(maybeReconnectStandalonePwa("/space?tab=push#prefs", { preferBrowserSession })).toBe(true);
    expect(new URL(replace.mock.calls[0][0], window.location.origin).searchParams.get("source")).toBe(preferBrowserSession ? "pwa-launch" : "pwa-auto");
  });
  it.each(["signout", "auth", "browser", "cooldown"])("retains %s suppression", (reason) => {
    if (reason === "signout") markIntentionalSignOut();
    if (reason === "auth") locate("/sexboard?auth=failed");
    if (reason === "browser") window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    if (reason === "cooldown") window.sessionStorage.setItem("ss:pwa-auto-google", JSON.stringify({ returnTo: "/sexboard?view=all#today", at: Date.now() }));
    expect(maybeReconnectStandalonePwa()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
  it("retains the hard cap", () => {
    window.localStorage.setItem("ss:pwa-auto-google-loop", JSON.stringify([Date.now(), Date.now(), Date.now()]));
    expect(maybeReconnectStandalonePwa()).toBe(true);
    expect(replace).toHaveBeenCalledWith("/auth-blocked");
  });
  it.each([true, false])("background and foreground requests remain independent, background first=%s", async (backgroundFirst) => {
    const pending: Array<() => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { pending.push(() => resolve(new Response(null, { status: 401 }))); }));
    const background = () => getBootstrap(undefined, { suppressPwaReconnect: true }).catch((error) => error);
    const foreground = () => getProfile().catch((error) => error);
    const first = backgroundFirst ? background() : foreground();
    const second = backgroundFirst ? foreground() : background();
    pending[backgroundFirst ? 0 : 1]();
    expect(await (backgroundFirst ? first : second)).toBeInstanceOf(ApiUnauthorizedError);
    expect(replace).not.toHaveBeenCalled();
    pending[backgroundFirst ? 1 : 0]();
    expect(await (backgroundFirst ? second : first)).toBeInstanceOf(ApiUnauthorizedError);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("reconnect final destinations", () => {
  it.each(["/pwa-reconnect", "/auth-blocked", "/pwa-reconnect?returnTo=%2Fpwa-reconnect%3FreturnTo%3D%252Fspace", "/%70wa-reconnect?approve=test", "/%2570wa-reconnect", "/signin", "/signed-out", "//evil.example/path", "//app.example/space", "/\\evil.example", "https://evil.example/space", "/api/auth/google", "/space%2f..%2fpwa-reconnect", "/bad%ZZ"])("rejects unsafe target %s", (target) => {
    maybeReconnectStandalonePwa(target);
    expect(new URL(replace.mock.calls[0][0], window.location.origin).searchParams.get("returnTo")).toBe("/sexboard");
  });
  it.each(["/space?tab=push#prefs", "https://app.example/space?tab=push#prefs"])("preserves safe target %s", (target) => {
    maybeReconnectStandalonePwa(target);
    expect(new URL(replace.mock.calls[0][0], window.location.origin).searchParams.get("returnTo")).toBe("/space?tab=push#prefs");
  });
});
