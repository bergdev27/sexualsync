// Shelf share modes: "send" / "together" are shared, "private" is a
// save-for-me that the partner never sees (no tile, no count, no activity)
// unless they save the same thing, which turns it into a mutual find.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  onRequest as shelf,
  cleanShareMode,
  derivedMatchKey,
  visibleShelfItems,
} from "../../functions/api/shelf.js";
import { onRequest as reencrypt } from "../../functions/api/e2ee/reencrypt.js";
import { onRequest as e2eeStatus } from "../../functions/api/e2ee/status.js";
import { mutatePlatformState } from "../../functions/api/_workspaces.js";
import { mutateKey, readKey } from "../../functions/api/_state.js";
import { makeSessionToken, makeStateEnv } from "./helpers.mjs";

const ME = "local-preview@example.test";
const PARTNER = "partner@example.test";
const STORE = "sexualsync-shelf";
const KEY = "shelf:w1";

async function setup(items = []) {
  const e = makeStateEnv();
  e.ALLOW_LOCAL_PREVIEW = "1";
  await mutatePlatformState(e, () => ({
    profiles: [
      { id: "p1", email: ME, displayName: "Me" },
      { id: "p2", email: PARTNER, displayName: "Partner" }
    ],
    workspaces: [{
      id: "w1", name: "Room", displayName: "Room", status: "active", productMode: "couples",
      members: [
        { email: ME, role: "owner", status: "active", displayName: "Me" },
        { email: PARTNER, role: "partner", status: "active", displayName: "Partner" }
      ],
      settings: {}
    }],
    invites: []
  }));
  if (items.length) await mutateKey(e, STORE, KEY, () => ({ value: items }));
  return e;
}

const item = (id, overrides = {}) => ({
  id,
  type: "story",
  source: "other",
  sourceUrl: `https://example.test/${id}`,
  embedUrl: "",
  posterUrl: "",
  videoHdUrl: "",
  videoSdUrl: "",
  passageText: "",
  title: "",
  addedByEmail: PARTNER,
  addedByName: "Partner",
  addedAt: new Date().toISOString(),
  reactions: {},
  ...overrides
});

const call = (e, method, body, query = "") => shelf({
  request: new Request(`http://localhost/api/shelf${query}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) })
  }),
  env: e
});

test("share mode defaults to send and rejects unknown modes", () => {
  assert.equal(cleanShareMode(""), "send");
  assert.equal(cleanShareMode("together"), "together");
  assert.equal(cleanShareMode("PRIVATE"), "private");
  assert.equal(cleanShareMode("public"), "send");
});

test("a partner's unmatched private save is invisible; mutual and shared ones are not", () => {
  const items = [
    item("shared"),
    item("theirs-private", { share: "private" }),
    item("theirs-mutual", { share: "private", mutualAt: "2026-05-23T00:00:00.000Z" }),
    item("mine-private", { share: "private", addedByEmail: ME })
  ];
  assert.deepEqual(visibleShelfItems(items, ME).map((it) => it.id), ["shared", "theirs-mutual", "mine-private"]);
  assert.deepEqual(visibleShelfItems(items, PARTNER).map((it) => it.id), ["shared", "theirs-private", "theirs-mutual"]);
});

test("match keys normalize links and passages; encrypted items use the client blind index", () => {
  assert.equal(
    derivedMatchKey(item("a", { sourceUrl: "https://www.Example.test/clip/" })),
    derivedMatchKey(item("b", { sourceUrl: "https://example.test/clip" }))
  );
  assert.equal(derivedMatchKey({ type: "passage", passageText: "  Hot   LINE " }), "text:hot line");
  assert.equal(derivedMatchKey({ type: "gif", source: "redgifs", sourceId: "AbC" }), "gif:redgifs:abc");
  assert.equal(derivedMatchKey({ type: "encrypted", matchKey: "sxs-bi-v1:abcdefghijklmnopqrstu" }), "sxs-bi-v1:abcdefghijklmnopqrstu");
});

test("GET never returns or counts the partner's private saves", async () => {
  const e = await setup([item("shared"), item("secret", { share: "private" })]);
  const res = await call(e, "GET", null, "?workspaceId=w1");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.items.map((it) => it.id), ["shared"]);
  assert.ok(!JSON.stringify(data).includes("secret"));
});

test("saving for me stores a private item the saver can see", async () => {
  const e = await setup();
  const res = await call(e, "POST", { workspaceId: "w1", content: "https://example.test/mine", mode: "private" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.item.share, "private");
  assert.equal(data.item.mutual, false);
  const stored = (await readKey(e, STORE, KEY)) || [];
  assert.equal(stored[0].share, "private");
});

test("saving what the partner privately saved makes it mutual instead of a duplicate", async () => {
  const e = await setup([item("secret", { share: "private", sourceUrl: "https://example.test/same" })]);
  const res = await call(e, "POST", { workspaceId: "w1", content: "https://www.example.test/same/", mode: "together" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mutual, true);
  assert.equal(data.item.id, "secret");
  assert.equal(data.item.mutual, true);
  assert.equal(data.item.share, "together");
  const stored = (await readKey(e, STORE, KEY)) || [];
  assert.equal(stored.length, 1, "no second tile");
  assert.ok(stored[0].mutualAt);
});

test("a different link never reveals or matches the partner's private save", async () => {
  const e = await setup([item("secret", { share: "private", sourceUrl: "https://example.test/theirs" })]);
  const res = await call(e, "POST", { workspaceId: "w1", content: "https://example.test/other" });
  const data = await res.json();
  assert.ok(!data.mutual);
  assert.ok(!data.duplicate);
  assert.deepEqual(data.items.map((it) => it.sourceUrl), ["https://example.test/other"]);
});

test("reacting to a partner's private save is a 404, like it doesn't exist", async () => {
  const e = await setup([item("secret", { share: "private" })]);
  const res = await call(e, "PATCH", { workspaceId: "w1", id: "secret", reaction: "fire" });
  assert.equal(res.status, 404);
});

test("removing a partner's private save is a 404 too, never a 'not yours'", async () => {
  const e = await setup([item("secret", { share: "private" })]);
  const res = await call(e, "DELETE", { workspaceId: "w1", id: "secret" });
  assert.equal(res.status, 404);
});

const SECRET = "shelf-private-test-session-secret-1234567890";
async function callAs(e, email, method, body) {
  e.APP_SESSION_SECRET = SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(SECRET, { sid: `t-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600 });
  return shelf({
    request: new Request(`https://app.example.test/api/shelf${method === "GET" ? "?workspaceId=w1" : ""}`, {
      method,
      headers: { "content-type": "application/json", cookie: `sxs-session=${encodeURIComponent(token)}` },
      ...(method === "GET" ? {} : { body: JSON.stringify({ workspaceId: "w1", ...body }) }),
    }),
    env: e,
  });
}

test("a mutual find is attributed to both of you and dated now, never to the private saver", async () => {
  const longAgo = "2026-01-02T03:04:05.000Z";
  const e = await setup([item("secret", { share: "private", sourceUrl: "https://example.test/same", addedAt: longAgo })]);
  const res = await callAs(e, ME, "POST", { content: "https://example.test/same" });
  const data = await res.json();
  assert.equal(data.mutual, true);
  for (const tile of [data.item, data.items.find((it) => it.id === "secret")]) {
    assert.equal(tile.mutual, true);
    assert.equal(tile.share, "together");
    assert.equal(tile.addedByName, "");
    assert.equal(tile.addedByEmail, ME, "it's yours too");
    assert.notEqual(tile.addedAt, longAgo, "the private save's date never shows");
  }
  // The private saver sees the same neutral shape from their side.
  const theirs = await (await callAs(e, PARTNER, "GET")).json();
  const theirTile = theirs.items.find((it) => it.id === "secret");
  assert.equal(theirTile.addedByEmail, PARTNER);
  assert.equal(theirTile.addedByName, "");
  assert.equal(theirTile.addedAt, data.item.addedAt);
});

test("either saver can take a mutual find off their own Shelf without deleting the other's save", async () => {
  const e = await setup([item("secret", { share: "private", sourceUrl: "https://example.test/same" })]);
  await callAs(e, ME, "POST", { content: "https://example.test/same" });
  // The second saver can rename it like any of their own saves.
  const rename = await callAs(e, ME, "PATCH", { id: "secret", title: "Ours" });
  assert.equal(rename.status, 200);

  const removed = await callAs(e, ME, "DELETE", { id: "secret" });
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).items.map((it) => it.id), [], "gone from my Shelf");
  const theirs = await (await callAs(e, PARTNER, "GET")).json();
  const kept = theirs.items.find((it) => it.id === "secret");
  assert.ok(kept, "the other saver keeps it");
  assert.equal(kept.share, "private");
  assert.equal(kept.mutual, false);
  assert.equal(kept.addedByEmail, PARTNER);
  const mine = await (await callAs(e, ME, "GET")).json();
  assert.equal(mine.items.length, 0, "and it stays out of my view");

  // Saving it again makes it mutual again; the original saver removing it then
  // leaves it with me.
  await callAs(e, ME, "POST", { content: "https://example.test/same" });
  const partnerRemoves = await callAs(e, PARTNER, "DELETE", { id: "secret" });
  assert.equal(partnerRemoves.status, 200);
  const mineAfter = await (await callAs(e, ME, "GET")).json();
  assert.equal(mineAfter.items.find((it) => it.id === "secret")?.addedByEmail, ME);
  const stored = (await readKey(e, STORE, KEY)) || [];
  assert.equal(stored.length, 1);
});

// ---------- Room Encryption migration ----------

const encBox = (ciphertext) => ({
  __sxsRoomEncrypted: true, version: "sxs-room-e2ee-v1", algorithm: "AES-GCM", iv: "AAECAwQFBgcICQoL", ciphertext,
});
const MATCH_KEY = "sxs-bi-v1:abcdefghijklmnopqrstuvwxyz012345";

async function e2eeRoom(items) {
  const e = await setup(items);
  e.E2EE_REENCRYPT_ENABLED = "1";
  await mutatePlatformState(e, (state) => ({
    ...state,
    workspaces: state.workspaces.map((ws) => ({ ...ws, settings: { ...ws.settings, roomE2eeEnabled: true } })),
  }));
  return e;
}

async function migrateAs(e, email, patches) {
  e.APP_SESSION_SECRET = SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(SECRET, { sid: `t-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600 });
  const res = await reencrypt({
    request: new Request("https://app.example.test/api/e2ee/reencrypt", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sxs-session=${encodeURIComponent(token)}` },
      body: JSON.stringify({ workspaceId: "w1", surface: "shelf", patches }),
    }),
    env: e,
  });
  return res.json();
}

async function shelfPendingFor(e, email) {
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(SECRET, { sid: `t-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600 });
  const res = await e2eeStatus({
    request: new Request("https://app.example.test/api/e2ee/status?workspaceId=w1", {
      headers: { cookie: `sxs-session=${encodeURIComponent(token)}` },
    }),
    env: e,
  });
  const body = await res.json();
  return body.legacyPlaintext?.surfaces?.shelfContent ?? body.legacyPlaintext?.shelfContent;
}

test("E2EE migration keeps a private save matchable, and each partner migrates only their own", async () => {
  const e = await e2eeRoom([
    item("mine", { share: "private", addedByEmail: ME, addedByName: "Me", sourceUrl: "https://example.test/same" }),
    item("theirs", { share: "private", sourceUrl: "https://example.test/other" }),
  ]);
  // My client sends patches for both ids; only my own save is touched.
  const result = await migrateAs(e, ME, [
    { id: "mine", encryptedContent: encBox("bWluZQ=="), matchKey: MATCH_KEY },
    { id: "theirs", encryptedContent: encBox("dGhlaXJz"), matchKey: MATCH_KEY },
  ]);
  assert.equal(result.changed, 1, JSON.stringify(result));
  const stored = (await readKey(e, STORE, KEY)) || [];
  const mine = stored.find((it) => it.id === "mine");
  const theirs = stored.find((it) => it.id === "theirs");
  assert.equal(mine.type, "encrypted");
  assert.equal(mine.matchKey, MATCH_KEY, "the blind index survives the migration");
  assert.equal(derivedMatchKey(mine), MATCH_KEY);
  assert.equal(theirs.type, "story", "a partner's private save is theirs to migrate");
  assert.equal(theirs.matchKey, undefined);

  // The status each client reads tells the saver their own save still needs it.
  assert.equal(await shelfPendingFor(e, ME), 0);
  assert.equal(await shelfPendingFor(e, PARTNER), 1);

  // A malformed blind index is dropped, never stored.
  await migrateAs(e, PARTNER, [{ id: "theirs", encryptedContent: encBox("dGhlaXJz"), matchKey: "sxs-bi-v1:bad!" }]);
  assert.equal(((await readKey(e, STORE, KEY)) || []).find((it) => it.id === "theirs").matchKey, undefined);
  assert.equal(await shelfPendingFor(e, PARTNER), 0);

  // My migrated private save still turns into a mutual find when the partner
  // saves the same thing.
  const res = await callAs(e, PARTNER, "POST", { content: "enc", encryptedContent: encBox("c2FtZQ=="), matchKey: MATCH_KEY });
  const data = await res.json();
  assert.equal(data.mutual, true);
  assert.equal(data.item.id, "mine");
});
