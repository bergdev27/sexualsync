// staySignedInDays: a per-room window that lets an installed PWA skip the
// forced launch re-auth without ever weakening the server session. Drives the
// real profile handler against an in-memory KV.

import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as profile } from "../../functions/api/profile.js";
import { makeKvEnv, makeSessionToken } from "./helpers.mjs";

const SESSION_SECRET = "public-release-session-secret-32+";
const NOW = "2026-05-25T12:00:00.000Z";
const OWNER_EMAIL = "owner-stay@example.test";
const WORKSPACE_ID = "stay-signed-in-room";

function seedWorkspace(env, settings) {
  env.__map.set("sex-exploration-platform:profiles", JSON.stringify([]));
  env.__map.set("sex-exploration-platform:workspaces", JSON.stringify([{
    id: WORKSPACE_ID,
    name: "stay.example.test",
    displayName: "Stay room",
    createdByEmail: OWNER_EMAIL,
    createdAt: NOW,
    updatedAt: NOW,
    status: "active",
    productMode: "couples",
    members: [{
      email: OWNER_EMAIL,
      displayName: "Owner",
      role: "owner",
      status: "active",
      joinedAt: NOW
    }],
    settings
  }]));
  env.__map.set("sex-exploration-platform:invites", JSON.stringify([]));
}

async function settingsRequest(env, body, method) {
  env.APP_SESSION_SECRET = SESSION_SECRET;
  env.PRIVATE_PREVIEW_ALLOWED_EMAILS = OWNER_EMAIL;
  const token = await makeSessionToken(SESSION_SECRET, {
    email: OWNER_EMAIL,
    provider: "google",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const headers = new Headers();
  headers.set("cookie", `sxs-session=${encodeURIComponent(token)}`);
  if (body !== undefined && body !== null) headers.set("content-type", "application/json");
  return new Request("https://app.example.test/api/profile", {
    method: method || (body === undefined || body === null ? "GET" : "POST"),
    headers,
    body: body === undefined || body === null ? undefined : JSON.stringify({ action: "update_workspace", workspaceId: WORKSPACE_ID, ...body })
  });
}

async function storedSettings(env) {
  // The workspaces KV is encrypted at rest; read back through the API.
  const response = await profile({ request: await settingsRequest(env, null, "GET"), env });
  const body = await response.json();
  return body.activeWorkspace.settings;
}

test("staySignedInDays accepts an in-range integer and persists it", async () => {
  const env = makeKvEnv();
  seedWorkspace(env, { reauthOnLaunch: true });

  const response = await profile({ request: await settingsRequest(env, { staySignedInDays: 7 }), env });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.activeWorkspace.settings.staySignedInDays, 7);
  assert.equal((await storedSettings(env)).staySignedInDays, 7);
});

test("staySignedInDays rejects non-integers, negatives and out-of-range values", async () => {
  for (const bad of [1.5, -1, 31, "seven", "7", "", true, {}, []]) {
    const env = makeKvEnv();
    seedWorkspace(env, { reauthOnLaunch: true, staySignedInDays: 3 });

    const response = await profile({ request: await settingsRequest(env, { staySignedInDays: bad }), env });
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    const body = await response.json();
    assert.match(body.error, /integer between 0 and 30/);
    // A rejected write must leave the stored window untouched.
    assert.equal((await storedSettings(env)).staySignedInDays, 3);
  }
});

test("null is rejected but an omitted field leaves the window unchanged", async () => {
  const env = makeKvEnv();
  seedWorkspace(env, { reauthOnLaunch: true, staySignedInDays: 14 });

  const rejected = await profile({ request: await settingsRequest(env, { staySignedInDays: null }), env });
  assert.equal(rejected.status, 400);

  const untouched = await profile({
    request: await settingsRequest(env, { reauthOnLaunch: true }),
    env
  });
  assert.equal(untouched.status, 200);
  assert.equal((await storedSettings(env)).staySignedInDays, 14);
});

test("0 disables the window and is stored as 0, not dropped", async () => {
  const env = makeKvEnv();
  seedWorkspace(env, { reauthOnLaunch: true, staySignedInDays: 30 });

  const response = await profile({ request: await settingsRequest(env, { staySignedInDays: 0 }), env });
  assert.equal(response.status, 200);
  const stored = await storedSettings(env);
  assert.equal(stored.staySignedInDays, 0);
});
