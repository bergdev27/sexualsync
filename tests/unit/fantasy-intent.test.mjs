// Fantasy vs intent label on Kinks, and the warm "Saving this for later"
// reaction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as fantasy, cleanIntent } from "../../functions/api/fantasy-backlog.js";
import { mutatePlatformState } from "../../functions/api/_workspaces.js";
import { mutateKey, readKey } from "../../functions/api/_state.js";
import { makeStateEnv } from "./helpers.mjs";

const ME = "local-preview@example.test";
const PARTNER = "partner@example.test";
const STORE = "sexualsync-ideas";
const WORKSPACE_ID = "w1";
const IDEAS_KEY = `ideas:${WORKSPACE_ID}`;
const NOW = new Date().toISOString();

const member = (email, role = "partner") => ({ email, role, status: "active", displayName: email.split("@")[0] });

function idea(id, overrides = {}) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    text: "Private idea",
    tags: [],
    addedByEmail: ME,
    addedByName: "local-preview",
    createdAt: NOW,
    updatedAt: NOW,
    comments: [],
    reactions: [],
    statusHistory: [],
    ...overrides,
  };
}

async function setup(ideas = [], settings = {}) {
  const env = makeStateEnv();
  env.ALLOW_LOCAL_PREVIEW = "1";
  await mutatePlatformState(env, () => ({
    profiles: [
      { id: "p1", email: ME, displayName: "Me" },
      { id: "p2", email: PARTNER, displayName: "Partner" },
    ],
    workspaces: [{
      id: WORKSPACE_ID, name: "Room", displayName: "Room", status: "active", productMode: "couples",
      members: [member(ME, "owner"), member(PARTNER)],
      settings,
    }],
    invites: [],
  }));
  if (ideas.length) await mutateKey(env, STORE, IDEAS_KEY, () => ({ value: ideas }));
  return env;
}

const call = (env, method, body) => fantasy({
  request: new Request("http://localhost/api/fantasy-backlog", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  env,
});

test("cleanIntent keeps the three labels and drops anything else", () => {
  assert.equal(cleanIntent("fantasy"), "fantasy");
  assert.equal(cleanIntent("TALK"), "talk");
  assert.equal(cleanIntent("try"), "try");
  assert.equal(cleanIntent("demand"), "");
  assert.equal(cleanIntent(undefined), "");
});

test("POST stores the sharer's intent label so a fantasy isn't read as a request", async () => {
  const env = await setup();
  const res = await call(env, "POST", { workspaceId: WORKSPACE_ID, text: "Hotel window", intent: "fantasy" });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.idea.intent, "fantasy");
  const stored = await readKey(env, STORE, IDEAS_KEY);
  assert.equal(stored[0].intent, "fantasy");
});

test("no label is the default", async () => {
  const env = await setup();
  const res = await call(env, "POST", { workspaceId: WORKSPACE_ID, text: "Something", intent: "demand" });
  const data = await res.json();
  assert.equal(data.idea.intent, undefined);
});

test("the author can change the intent with a text edit, and clear it", async () => {
  const env = await setup([idea("i1", { intent: "fantasy" })]);
  let res = await call(env, "PATCH", { workspaceId: WORKSPACE_ID, id: "i1", text: "Private idea", intent: "try" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).idea.intent, "try");
  res = await call(env, "PATCH", { workspaceId: WORKSPACE_ID, id: "i1", text: "Private idea", intent: "" });
  assert.equal((await res.json()).idea.intent, undefined);
});

test("a stored plaintext intent is dropped once the text is encrypted", async () => {
  const box = { __sxsRoomEncrypted: true, version: "sxs-room-e2ee-v1", algorithm: "AES-GCM", iv: "aaaaaaaaaaaaaaaa", ciphertext: "bbbbbbbbbbbbbbbbbbbbbbbb" };
  const env = await setup([idea("i3", { intent: "try" })]);
  const res = await call(env, "PATCH", { workspaceId: WORKSPACE_ID, id: "i3", text: "Encrypted content", encryptedText: box, intent: "try" });
  assert.equal(res.status, 200);
  const stored = await readKey(env, STORE, IDEAS_KEY);
  assert.ok(stored[0].encryptedText);
  assert.equal(stored[0].intent, undefined, "the label lives inside the encrypted box");
});

test("under Room Encryption a new kink never stores a plaintext intent", async () => {
  const box = { __sxsRoomEncrypted: true, version: "sxs-room-e2ee-v1", algorithm: "AES-GCM", iv: "aaaaaaaaaaaaaaaa", ciphertext: "bbbbbbbbbbbbbbbbbbbbbbbb" };
  const env = await setup([], { roomE2eeEnabled: true });
  const res = await call(env, "POST", { workspaceId: WORKSPACE_ID, text: "Encrypted content", encryptedText: box, intent: "try" });
  assert.equal(res.status, 201);
  const stored = await readKey(env, STORE, IDEAS_KEY);
  assert.equal(stored[0].intent, undefined);
});

test("partners can answer with 'Saving this for later'", async () => {
  const env = await setup([idea("i2", { addedByEmail: PARTNER, addedByName: "Partner" })]);
  const res = await call(env, "PATCH", {
    workspaceId: WORKSPACE_ID,
    id: "i2",
    reactions: [{ by: ME, label: "Saving this for later" }],
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.idea.reactions[0].id, "save_for_later");
  assert.equal(data.idea.reactions[0].tone, "positive");
  assert.ok(data.reactionCatalog.some((option) => option.id === "save_for_later"));
});
