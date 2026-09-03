import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as pwaHandoff } from "../../functions/api/auth/pwa-handoff.js";
import {
  createAppSessionToken,
  verifyAppSession,
} from "../../functions/api/_app_session.js";
import { makeKvEnv } from "./helpers.mjs";

const SESSION_SECRET = "pwa-handoff-test-session-secret-32+";
const EMAIL = "browser-user@example.test";

function call(env, payload, cookie = "") {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return pwaHandoff({
    request: new Request("https://sexualsync.example/api/auth/pwa-handoff", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
    env,
  });
}

function sessionCookieFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const match = values.join(",").match(/sxs-session=([^;,]+)/);
  return match ? `sxs-session=${match[1]}` : "";
}

test("Safari can approve a one-time session handoff to an existing PWA", async () => {
  const env = makeKvEnv();
  delete env.ALLOW_LOCAL_PREVIEW;
  env.APP_SESSION_SECRET = SESSION_SECRET;
  env.PRIVATE_PREVIEW_ALLOWED_EMAILS = EMAIL;

  const started = await call(env, { action: "start", returnTo: "/chat?from=push" });
  assert.equal(started.status, 201);
  const handoff = await started.json();
  assert.ok(handoff.id);
  assert.ok(handoff.secret);

  const pending = await call(env, { action: "redeem", id: handoff.id, secret: handoff.secret });
  assert.equal(pending.status, 202);

  const browserToken = await createAppSessionToken(env, { email: EMAIL, provider: "google" });
  const approved = await call(
    env,
    { action: "approve", id: handoff.id, secret: handoff.secret },
    `sxs-session=${encodeURIComponent(browserToken)}`,
  );
  assert.equal(approved.status, 200);

  const redeemed = await call(env, {
    action: "redeem",
    id: handoff.id,
    secret: handoff.secret,
    returnTo: "/chat?from=push",
  });
  assert.equal(redeemed.status, 200);
  assert.match(redeemed.headers.get("set-cookie") || "", /sxs-session=/);
  const body = await redeemed.json();
  assert.equal(body.returnTo, "/chat?from=push");

  const pwaCookie = sessionCookieFrom(redeemed);
  assert.ok(pwaCookie, "redeem must mint a PWA session cookie");
  const session = await verifyAppSession(new Request("https://sexualsync.example/chat", {
    headers: { cookie: pwaCookie },
  }), env);
  assert.equal(session?.email, EMAIL);

  const replay = await call(env, { action: "redeem", id: handoff.id, secret: handoff.secret });
  assert.equal(replay.status, 400, "handoff grant must be one-time");
});

test("wrong handoff secret cannot approve or redeem a session", async () => {
  const env = makeKvEnv();
  delete env.ALLOW_LOCAL_PREVIEW;
  env.APP_SESSION_SECRET = SESSION_SECRET;
  env.PRIVATE_PREVIEW_ALLOWED_EMAILS = EMAIL;

  const started = await call(env, { action: "start", returnTo: "/sexboard" });
  const handoff = await started.json();
  const browserToken = await createAppSessionToken(env, { email: EMAIL, provider: "google" });
  const approved = await call(
    env,
    { action: "approve", id: handoff.id, secret: "wrong-secret" },
    `sxs-session=${encodeURIComponent(browserToken)}`,
  );
  assert.equal(approved.status, 400);

  const redeemed = await call(env, { action: "redeem", id: handoff.id, secret: "wrong-secret" });
  assert.equal(redeemed.status, 400);
});
