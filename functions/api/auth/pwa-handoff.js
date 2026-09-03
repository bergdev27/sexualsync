import {
  buildLaunchCookie,
  buildSessionCookie,
  createAppSessionToken,
  timingSafeEqual,
} from "../_app_session.js";
import { getAuthenticatedIdentity, jsonResponse, normalizeEmail } from "../_auth.js";
import { checkRateLimit, rateLimitResponse } from "../_rate_limit.js";
import { mutateKey } from "../_state.js";

const HANDOFF_STORE = "sexualsync-pwa-handoff";
const HANDOFF_KEY = "requests";
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const MAX_HANDOFFS = 200;
const GRANT_LABEL = "sxs-pwa-handoff-v1";

function clientIp(context) {
  return String(context.request.headers.get("cf-connecting-ip") || "").trim().toLowerCase() || "global";
}

function sameOriginPath(value) {
  if (!value) return "/sexboard";
  try {
    const url = new URL(value, "https://sexualsync.local");
    if (url.origin !== "https://sexualsync.local") return "/sexboard";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("/api/auth/")) return "/sexboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/sexboard";
  }
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncode(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function secretDigest(secret) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${GRANT_LABEL}\0${secret}`));
  return base64UrlEncode(bytes);
}

async function grantKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${GRANT_LABEL}:grant\0${secret}`));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function sealGrant(secret, id, claims) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${GRANT_LABEL}:${id}`) },
    await grantKey(secret),
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

async function openGrant(secret, id, sealed) {
  const [ivText, ciphertextText] = String(sealed || "").split(".");
  if (!ivText || !ciphertextText) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlDecode(ivText),
        additionalData: new TextEncoder().encode(`${GRANT_LABEL}:${id}`),
      },
      await grantKey(secret),
      base64UrlDecode(ciphertextText),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

function asRequests(value) {
  return Array.isArray(value) ? value : [];
}

function activeRequests(value, now = Date.now()) {
  return asRequests(value)
    .filter((record) => Number(record?.expiresAt || 0) > now)
    .slice(0, MAX_HANDOFFS);
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function applyRateLimit(context, action) {
  const limits = {
    start: { limit: 20, windowSeconds: 15 * 60 },
    approve: { limit: 30, windowSeconds: 15 * 60 },
    redeem: { limit: 180, windowSeconds: 15 * 60 },
  };
  const config = limits[action] || limits.start;
  const result = await checkRateLimit(context.env, {
    bucket: `pwa-handoff-${action}`,
    key: clientIp(context),
    ...config,
    failClosed: true,
  });
  return result.ok ? null : rateLimitResponse(result.retryAfter);
}

async function startHandoff(context, payload) {
  const limited = await applyRateLimit(context, "start");
  if (limited) return limited;

  const id = randomToken(18);
  const secret = randomToken(32);
  const now = Date.now();
  const returnTo = sameOriginPath(payload.returnTo);
  const record = {
    id,
    secretHash: await secretDigest(secret),
    createdAt: now,
    expiresAt: now + HANDOFF_TTL_MS,
    approvedAt: 0,
    grant: "",
  };

  await mutateKey(context.env, HANDOFF_STORE, HANDOFF_KEY, (current) => ({
    value: [record, ...activeRequests(current, now)].slice(0, MAX_HANDOFFS),
  }));

  return jsonResponse(201, {
    ok: true,
    id,
    secret,
    expiresAt: record.expiresAt,
    returnTo,
  });
}

async function approveHandoff(context, payload) {
  const limited = await applyRateLimit(context, "approve");
  if (limited) return limited;

  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;

  const id = String(payload.id || "").trim().slice(0, 120);
  const secret = String(payload.secret || "").trim().slice(0, 200);
  if (!id || !secret) return jsonResponse(400, { error: "This reconnect request is invalid or expired." });

  const expectedHash = await secretDigest(secret);
  const grant = await sealGrant(secret, id, {
    email: normalizeEmail(identity.email),
    provider: identity.provider === "email" || identity.provider === "local" ? identity.provider : "google",
  });
  const now = Date.now();
  const result = await mutateKey(context.env, HANDOFF_STORE, HANDOFF_KEY, (current) => {
    const requests = activeRequests(current, now);
    const index = requests.findIndex((record) => record?.id === id);
    if (index === -1 || !timingSafeEqual(requests[index]?.secretHash, expectedHash)) {
      return { value: requests, result: { ok: false } };
    }
    const record = requests[index];
    requests[index] = { ...record, approvedAt: now, grant };
    return { value: requests, result: { ok: true } };
  });

  if (!result?.ok) return jsonResponse(400, { error: "This reconnect request is invalid or expired." });
  return jsonResponse(200, { ok: true, approved: true });
}

async function redeemHandoff(context, payload) {
  const limited = await applyRateLimit(context, "redeem");
  if (limited) return limited;

  const id = String(payload.id || "").trim().slice(0, 120);
  const secret = String(payload.secret || "").trim().slice(0, 200);
  if (!id || !secret) return jsonResponse(400, { error: "This reconnect request is invalid or expired." });

  const expectedHash = await secretDigest(secret);
  const now = Date.now();
  const result = await mutateKey(context.env, HANDOFF_STORE, HANDOFF_KEY, (current) => {
    const requests = activeRequests(current, now);
    const index = requests.findIndex((record) => record?.id === id);
    if (index === -1 || !timingSafeEqual(requests[index]?.secretHash, expectedHash)) {
      return { value: requests, result: { status: "invalid" } };
    }
    const record = requests[index];
    if (!record.approvedAt || !record.grant) {
      return { value: requests, result: { status: "pending" } };
    }
    requests.splice(index, 1);
    return { value: requests, result: { status: "approved", record } };
  });

  if (result?.status === "pending") {
    return jsonResponse(202, { ok: true, pending: true });
  }
  if (result?.status !== "approved") {
    return jsonResponse(400, { error: "This reconnect request is invalid or expired." });
  }

  const claims = await openGrant(secret, id, result.record.grant);
  const email = normalizeEmail(claims?.email);
  if (!email) return jsonResponse(400, { error: "This reconnect request is invalid or expired." });

  const provider = claims.provider === "email" || claims.provider === "local" ? claims.provider : "google";
  const sessionToken = await createAppSessionToken(context.env, { email, provider });
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  headers.append("Set-Cookie", buildSessionCookie(sessionToken));
  headers.append("Set-Cookie", buildLaunchCookie());
  return new Response(JSON.stringify({
    ok: true,
    returnTo: sameOriginPath(payload.returnTo),
    provider,
  }), { status: 200, headers });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  const payload = await parseJson(context.request);
  const action = String(payload.action || "").trim().toLowerCase();
  if (action === "start") return startHandoff(context, payload);
  if (action === "approve") return approveHandoff(context, payload);
  if (action === "redeem") return redeemHandoff(context, payload);
  return jsonResponse(400, { error: "Unknown reconnect action." });
}
