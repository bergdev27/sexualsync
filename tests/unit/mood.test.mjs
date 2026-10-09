// Mood light — double-blind "I'm in the mood" signal (functions/api/mood.js).
//
// Drives the REAL onRequest handler as two signed-in partners against a
// CAS-backed env (and once against the plain-KV fallback the self-host edition
// uses), asserting:
//   1. Double-blind: while I'm off (or on alone), my response is byte-identical
//      whether the partner is on, off, or expired.
//   2. Match formation: the second switch-on forms a match for both, emits ONE
//      actor-less `mood/match` room event, and records one activity item.
//   3. Switching off mid-match ends it for both with an actor-less `ended`.
//   4. Cooldown: back ON within 5 minutes of OFF is a 429 with retryAt.
//   5. Clamp: past rejected, >24h clamped down, tiny windows clamped up.
//   6. Expiry: windows lapse at `until` with no write; the match goes with them.
//   7. Auth + membership: anonymous 401, non-member 403, 3-person rooms never match.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  onRequest as moodRequest,
  publicMood,
  deriveMoodMatch,
  clampMoodUntil,
  applyMoodOn,
  applyMoodOff,
  MOOD_STORE_NAME,
  MOOD_COOLDOWN_MS,
  MOOD_MAX_WINDOW_MS,
  MOOD_MIN_WINDOW_MS,
  moodKey,
} from "../../functions/api/mood.js";
import { mutatePlatformState } from "../../functions/api/_workspaces.js";
import { mutateKey, readKey } from "../../functions/api/_state.js";
import { isEncryptedJsonStore } from "../../functions/api/_encrypted_store.js";
import { makeSessionToken, makeStateEnv } from "./helpers.mjs";

const ME = "alex@example.test";
const PARTNER = "jordan@example.test";
const THIRD = "third@example.test";
const OUTSIDER = "outsider@example.test";
const WS = "w-mood";
const SECRET = "mood-test-session-secret-1234567890abcdef";
const HOUR = 60 * 60 * 1000;

const member = (email, role, displayName) => ({ email, role, status: "active", displayName });
const COUPLE = [member(ME, "owner", "Alex"), member(PARTNER, "partner", "Jordan")];
const workspaceFor = (members = COUPLE) => ({
  id: WS, name: "Room", displayName: "Room", status: "active", productMode: "couples", members, settings: {},
});

function roomRecorder() {
  const events = [];
  const ROOMS = {
    idFromName: (name) => name,
    get: (id) => ({
      async fetch(request) {
        const url = new URL(request.url);
        events.push({ room: id, path: url.pathname, body: await request.json() });
        return new Response("{}", { status: 200 });
      },
    }),
  };
  return { ROOMS, events };
}

async function setup({ members = COUPLE, withState = true } = {}) {
  const e = makeStateEnv();
  if (!withState) delete e.STATE;
  e.APP_SESSION_SECRET = SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  const room = roomRecorder();
  e.ROOMS = room.ROOMS;
  await mutatePlatformState(e, () => ({
    profiles: [...members, member(OUTSIDER, "owner", "Out")].map((m, i) => ({
      id: `p${i + 1}`, email: m.email, displayName: m.displayName,
    })),
    workspaces: [workspaceFor(members)],
    invites: [],
  }));
  return { e, room };
}

async function cookieFor(email) {
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(SECRET, {
    sid: `test-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600,
  });
  return `sxs-session=${encodeURIComponent(token)}`;
}

async function call(e, email, { method = "GET", body } = {}) {
  const headers = {};
  if (email) headers.cookie = await cookieFor(email);
  if (body) headers["content-type"] = "application/json";
  const tasks = [];
  const url = method === "GET"
    ? `https://app.example.test/api/mood?workspaceId=${WS}`
    : "https://app.example.test/api/mood";
  const res = await moodRequest({
    request: new Request(url, { method, headers, body: body ? JSON.stringify({ workspaceId: WS, ...body }) : undefined }),
    env: e,
    waitUntil: (task) => tasks.push(Promise.resolve(task).catch(() => null)),
  });
  await Promise.all(tasks);
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

const on = (e, email, untilMs) => call(e, email, { method: "POST", body: { action: "on", until: new Date(untilMs).toISOString() } });
const off = (e, email) => call(e, email, { method: "POST", body: { action: "off" } });

// Strip the server clock so two responses taken a few ms apart compare equal.
function blindShape(json) {
  const { serverNow, ...rest } = json;
  assert.ok(serverNow, "serverNow present");
  return JSON.stringify(rest);
}

async function setRecord(e, transform) {
  await mutateKey(e, MOOD_STORE_NAME, moodKey(WS), (current) => ({ value: transform(current || { v: 1, byEmail: {} }) }));
}

test("mood store is registered as encrypted at rest", () => {
  assert.equal(isEncryptedJsonStore(MOOD_STORE_NAME), true);
});

test("double-blind: my response is identical whether the partner is off, on, or expired", async () => {
  const { e, room } = await setup();

  // I'm off; partner has never touched it.
  const baseline = await call(e, ME);
  assert.equal(baseline.status, 200);
  assert.deepEqual(baseline.json.mine, { on: false, since: null, until: null, cooldownUntil: null });
  assert.equal(baseline.json.match, null);

  // Partner switches on → my view must not change at all.
  assert.equal((await on(e, PARTNER, Date.now() + HOUR)).status, 200);
  const partnerOn = await call(e, ME);
  assert.equal(blindShape(partnerOn.json), blindShape(baseline.json), "partner ON is invisible to me while I'm off");

  // Partner switches off → still identical (their cooldown is theirs alone).
  assert.equal((await off(e, PARTNER)).status, 200);
  const partnerOff = await call(e, ME);
  assert.equal(blindShape(partnerOff.json), blindShape(baseline.json), "partner OFF is invisible too");

  // Partner window lapsed (expired) → identical.
  await setRecord(e, (rec) => ({ ...rec, byEmail: { ...rec.byEmail, [PARTNER]: { since: new Date(Date.now() - 2 * HOUR).toISOString(), until: new Date(Date.now() - HOUR).toISOString() } } }));
  const partnerExpired = await call(e, ME);
  assert.equal(blindShape(partnerExpired.json), blindShape(baseline.json), "partner expired is invisible");

  // No room events or activity were emitted for a lone switch.
  assert.equal(room.events.length, 0, "a lone on/off never reaches the room");
  const activity = await readKey(e, "sexualsync-activity", `events:${WS}`);
  assert.ok(!activity || activity.length === 0, "a lone on/off never reaches activity");
});

test("double-blind: on alone, my response is identical whether the partner is off or expired", async () => {
  const { e } = await setup();
  const until = Date.now() + 2 * HOUR;
  await on(e, ME, until);
  const alone = await call(e, ME);
  assert.equal(alone.json.mine.on, true);
  assert.equal(alone.json.match, null);
  await setRecord(e, (rec) => ({ ...rec, byEmail: { ...rec.byEmail, [PARTNER]: { since: new Date(Date.now() - 3 * HOUR).toISOString(), until: new Date(Date.now() - HOUR).toISOString() } } }));
  const partnerExpired = await call(e, ME);
  assert.equal(blindShape(partnerExpired.json), blindShape(alone.json));
  await setRecord(e, (rec) => ({ ...rec, byEmail: { ...rec.byEmail, [PARTNER]: { offAt: new Date().toISOString() } } }));
  const partnerCooling = await call(e, ME);
  assert.equal(blindShape(partnerCooling.json), blindShape(alone.json), "partner's cooldown never leaks");
});

test("match forms on the second switch-on, for both, with one actor-less room event", async () => {
  const { e, room } = await setup();
  const myUntil = Date.now() + 3 * HOUR;
  const partnerUntil = Date.now() + HOUR;

  await on(e, ME, myUntil);
  // Backdate my switch-on so "formation time" and "first switch-on" differ.
  const firstSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await setRecord(e, (rec) => ({ ...rec, byEmail: { ...rec.byEmail, [ME]: { ...rec.byEmail[ME], since: firstSince } } }));
  assert.equal((await call(e, ME)).json.mine.since, firstSince);

  const formed = await on(e, PARTNER, partnerUntil);
  assert.equal(formed.status, 200);
  assert.ok(formed.json.match, "partner sees the match in their own response");

  const mine = await call(e, ME);
  assert.ok(mine.json.match, "I see the match too");
  assert.deepEqual(mine.json.match, formed.json.match, "same match for both");
  // since = when the match formed (partner's switch-on), NOT my earlier since.
  assert.ok(mine.json.match.since > firstSince, "match.since is formation time, not when the first partner switched on");
  assert.equal(mine.json.match.since, formed.json.mine.since);
  // until = earlier of the two windows.
  assert.equal(new Date(mine.json.match.until).getTime(), partnerUntil);

  const broadcasts = room.events.filter((evt) => evt.path === "/broadcast");
  assert.equal(broadcasts.length, 1, "exactly one room event");
  assert.equal(broadcasts[0].room, `workspace:${WS}`);
  assert.equal(broadcasts[0].body.resource, "mood");
  assert.equal(broadcasts[0].body.action, "match");
  assert.equal(broadcasts[0].body.actorEmail, "", "match event names no actor");
  assert.equal(broadcasts[0].body.entityId, mine.json.match.since);

  const activity = await readKey(e, "sexualsync-activity", `events:${WS}`);
  assert.equal(activity.length, 1, "one activity item for the match");
  assert.equal(activity[0].resource, "mood");
  assert.equal(activity[0].label, "You're both in the mood");
  assert.equal(activity[0].actorEmail, "");

  // Extending while matched keeps the match (same since) and emits nothing new.
  const extended = await on(e, PARTNER, partnerUntil + HOUR);
  assert.equal(extended.json.match.since, mine.json.match.since, "extending keeps the formation time");
  assert.equal(room.events.filter((evt) => evt.path === "/broadcast").length, 1, "no second match event");
});

test("switching off mid-match ends it for both with an actor-less `ended`", async () => {
  const { e, room } = await setup();
  await on(e, ME, Date.now() + HOUR);
  await on(e, PARTNER, Date.now() + HOUR);
  assert.ok((await call(e, ME)).json.match);

  const ended = await off(e, PARTNER);
  assert.equal(ended.status, 200);
  assert.equal(ended.json.match, null);
  assert.equal(ended.json.mine.on, false);

  const mine = await call(e, ME);
  assert.equal(mine.json.match, null, "match gone for me");
  assert.equal(mine.json.mine.on, true, "my own light stays on");

  const endEvents = room.events.filter((evt) => evt.body.resource === "mood" && evt.body.action === "ended");
  assert.equal(endEvents.length, 1);
  assert.equal(endEvents[0].body.actorEmail, "", "ended never says who switched off");
  assert.equal(endEvents[0].body.actorName, "");
  const activity = await readKey(e, "sexualsync-activity", `events:${WS}`);
  assert.equal(activity.filter((item) => item.action === "ended").length, 0, "an ended match is not an activity item");

  // Switching off again is a no-op: no event, no new cooldown write.
  await off(e, PARTNER);
  assert.equal(room.events.filter((evt) => evt.body.action === "ended").length, 1);
});

test("cooldown: back on within 5 minutes of off is a 429 with retryAt", async () => {
  const { e } = await setup();
  await on(e, ME, Date.now() + HOUR);
  const offRes = await off(e, ME);
  assert.ok(offRes.json.mine.cooldownUntil, "my response tells me when I can switch on again");

  const blocked = await on(e, ME, Date.now() + HOUR);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.code, "mood_cooldown");
  const retryAt = new Date(blocked.json.retryAt).getTime();
  assert.ok(retryAt > Date.now() && retryAt <= Date.now() + MOOD_COOLDOWN_MS, "retryAt within the cooldown");
  assert.equal(blocked.json.mine.on, false, "429 carries my (blind) state");
  assert.equal(blocked.json.match, null);

  // Age the off stamp past the cooldown → switching on works again.
  await setRecord(e, (rec) => ({ ...rec, byEmail: { ...rec.byEmail, [ME]: { offAt: new Date(Date.now() - MOOD_COOLDOWN_MS - 1000).toISOString() } } }));
  const allowed = await on(e, ME, Date.now() + HOUR);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.mine.on, true);
  assert.equal(allowed.json.mine.cooldownUntil, null);
});

test("clamp: past rejected, >24h clamped down, short windows clamped up", async () => {
  const now = Date.parse("2026-10-07T20:00:00.000Z");
  assert.equal(clampMoodUntil("2026-10-07T19:00:00.000Z", now).ok, false, "past rejected");
  assert.equal(clampMoodUntil(new Date(now).toISOString(), now).ok, false, "now rejected");
  assert.equal(clampMoodUntil("not a date", now).ok, false, "garbage rejected");
  assert.equal(clampMoodUntil("", now).ok, false, "missing rejected");
  assert.equal(clampMoodUntil(new Date(now + 3 * 24 * HOUR).toISOString(), now).untilMs, now + MOOD_MAX_WINDOW_MS, "capped at 24h");
  assert.equal(clampMoodUntil(new Date(now + 60 * 1000).toISOString(), now).untilMs, now + MOOD_MIN_WINDOW_MS, "raised to the minimum window");
  assert.equal(clampMoodUntil(new Date(now + 2 * HOUR).toISOString(), now).untilMs, now + 2 * HOUR, "in-range kept");

  const { e } = await setup();
  const past = await on(e, ME, Date.now() - 1000);
  assert.equal(past.status, 400);
  assert.equal(past.json.code, "mood_invalid_until");
  const far = await on(e, ME, Date.now() + 7 * 24 * HOUR);
  assert.equal(far.status, 200);
  assert.ok(new Date(far.json.mine.until).getTime() <= Date.now() + MOOD_MAX_WINDOW_MS);
});

test("expiry: windows lapse at `until` without a write, and the match goes with them", () => {
  const workspace = workspaceFor();
  const t0 = Date.parse("2026-10-07T20:00:00.000Z");
  const record = {
    v: 1,
    byEmail: {
      [ME]: { since: new Date(t0).toISOString(), until: new Date(t0 + 2 * HOUR).toISOString() },
      [PARTNER]: { since: new Date(t0 + 10 * 60 * 1000).toISOString(), until: new Date(t0 + HOUR).toISOString() },
    },
  };
  const during = publicMood(record, workspace, ME, t0 + 30 * 60 * 1000);
  assert.deepEqual(during.match, { since: new Date(t0 + 10 * 60 * 1000).toISOString(), until: new Date(t0 + HOUR).toISOString() });
  const afterPartner = publicMood(record, workspace, ME, t0 + HOUR);
  assert.equal(afterPartner.match, null, "match ends exactly at the earlier until");
  assert.equal(afterPartner.mine.on, true, "my own window still runs");
  const afterMine = publicMood(record, workspace, ME, t0 + 2 * HOUR);
  assert.deepEqual(afterMine.mine, { on: false, since: null, until: null, cooldownUntil: null }, "lapse is not an off: no cooldown");

  // Partner switches back on after lapsing → a NEW match with a new since.
  const later = t0 + 90 * 60 * 1000;
  const re = applyMoodOn(record, workspace, PARTNER, later + HOUR, later);
  assert.equal(re.result.formed, true, "re-forming after a lapse counts as a new match");
  assert.equal(re.result.match.since, new Date(later).toISOString());
});

test("pure transitions: off when already off writes nothing; noop extend writes nothing", () => {
  const workspace = workspaceFor();
  const now = Date.parse("2026-10-07T20:00:00.000Z");
  assert.equal(applyMoodOff(null, workspace, ME, now).write, false);
  const first = applyMoodOn(null, workspace, ME, now + HOUR, now);
  assert.notEqual(first.write, false);
  const again = applyMoodOn(first.value, workspace, ME, now + HOUR + 1000, now + 5000);
  assert.equal(again.write, false, "same until (within tolerance) is a no-op");
  assert.equal(deriveMoodMatch(first.value, workspace, now), null);
});

test("concurrent switch-on by both partners forms exactly one match", async () => {
  const { e, room } = await setup();
  const until = Date.now() + HOUR;
  const [a, b] = await Promise.all([on(e, ME, until), on(e, PARTNER, until)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.ok((await call(e, ME)).json.match, "match exists after the race");
  assert.equal(room.events.filter((evt) => evt.body.action === "match").length, 1, "exactly one match event");
});

test("self-host fallback (no CAS coordinator) behaves the same", async () => {
  const { e, room } = await setup({ withState: false });
  await on(e, ME, Date.now() + HOUR);
  const formed = await on(e, PARTNER, Date.now() + HOUR);
  assert.ok(formed.json.match);
  assert.ok((await call(e, ME)).json.match);
  assert.equal(room.events.filter((evt) => evt.body.action === "match").length, 1);
});

test("auth + membership: anonymous 401, outsider 403, bad method 405, bad action 400", async () => {
  const { e } = await setup();
  assert.equal((await call(e, null)).status, 401);
  const outsider = await call(e, OUTSIDER);
  assert.equal(outsider.status, 403, "a non-member cannot read this room's mood");
  const outsiderWrite = await call(e, OUTSIDER, { method: "POST", body: { action: "on", until: new Date(Date.now() + HOUR).toISOString() } });
  assert.equal(outsiderWrite.status, 403, "a non-member cannot write either");
  assert.equal((await call(e, ME, { method: "DELETE" })).status, 405);
  assert.equal((await call(e, ME, { method: "POST", body: { action: "flip" } })).status, 400);
});

test("a room with three active members never forms a match", async () => {
  const { e, room } = await setup({ members: [...COUPLE, member(THIRD, "partner", "Third")] });
  await on(e, ME, Date.now() + HOUR);
  await on(e, PARTNER, Date.now() + HOUR);
  assert.equal((await call(e, ME)).json.match, null, "two of three is not a match");
  assert.equal(room.events.length, 0);
});
