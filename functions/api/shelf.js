// Inspiration Shelf endpoint.
//
//   GET    /api/shelf?workspaceId=…           → { items: [...] }
//   POST   /api/shelf      { content, title? }→ { item, items }
//   PATCH  /api/shelf      { id, title?, reaction? } → { item, items }
//   DELETE /api/shelf      { id }             → { items }
//
// "content" on POST can be either a URL or a passage of text — we detect
// which and route to the right tile shape. RedGifs URLs get a poster +
// embed URL; other URLs are stored as link tiles; plain text becomes a
// passage tile.

import { getStore } from "./_kv.js";
import { mutateKey } from "./_state.js";
import {
  getAuthenticatedIdentity,
  jsonResponse,
  normalizeEmail,
} from "./_auth.js";
import {
  authorizeWorkspaceAccess,
  workspaceIdFromRequest,
  workspaceIdFromPayload,
} from "./_workspaces.js";
import { appendAudit } from "./_audit.js";
import { parseShelfInput, sourceLabel } from "./_shelf.js";
import { redgifsDirectUrl } from "./_redgifs.js";
import { broadcastFocusRoomEvent, broadcastRoomEvent } from "./_live_room.js";
import { cleanRoomEncryptedBox } from "./_e2ee.js";

const STORE_NAME    = "sexualsync-shelf";
const MAX_ITEMS     = 60;
const MAX_TITLE_LEN = 300;
const SHELF_REACTIONS = [
  { id: "think", emoji: "🤔", label: "Thinking", caption: "{name} is thinking it over.", tone: "positive" },
  { id: "fire", emoji: "🔥", label: "Hot", caption: "{name} says it is hot.", tone: "positive" },
  { id: "drool", emoji: "🤤", label: "Want this", caption: "{name} wants this.", tone: "positive" },
  { id: "wrecked", emoji: "🥵", label: "Wrecked", caption: "{name} is wrecked.", tone: "positive" },
  // Warm and costless: liked it, not right now. Nothing follows from it.
  { id: "later", emoji: "🔖", label: "Saving for later", caption: "{name} is saving this for later.", tone: "positive" },
  { id: "pass", emoji: "😅", label: "Not for me", caption: "Not {name}'s vibe — try another.", tone: "pass" }
];
const SHELF_REACTION_ALIASES = {
  heart: "drool",
  love: "drool",
  maybe: "think",
  curious: "think",
  no: "pass",
  hot: "fire",
  wrecked: "wrecked"
};
const VALID_REACTIONS = new Set(SHELF_REACTIONS.map((reaction) => reaction.id));
const SHELF_REACTION_CATALOG = SHELF_REACTIONS.map(({ id, emoji, label, caption, tone }) => ({ id, emoji, label, caption, tone }));
const SHELF_URL = "/?tab=backlog&shelf=1";

// How a save is shared. "send" (the default, and every save before this field
// existed) and "together" are visible to both partners; "together" adds a
// "watch this with me" framing. "private" is a save-for-me: invisible to the
// partner (no tile, no count, no activity) UNLESS the partner saves the same
// thing too, at which point it becomes a mutual find both of them see.
const SHARE_MODES = new Set(["send", "together", "private"]);
const MATCH_KEY_RE = /^sxs-bi-v1:[A-Za-z0-9_-]{16,128}$/;

// A client-computed blind index for an encrypted item, or "" if malformed.
export function cleanShelfMatchKey(value) {
  const key = String(value || "").trim().slice(0, 160);
  return MATCH_KEY_RE.test(key) ? key : "";
}

export function cleanShareMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  return SHARE_MODES.has(raw) ? raw : "send";
}

function isPrivateUnmatched(item) {
  return item?.share === "private" && !item?.mutualAt;
}

// Visible to this viewer: everything shared, their own private saves, and
// private saves that became mutual. A partner's unmatched private save is
// never returned, counted, or broadcast.
export function visibleShelfItems(items, actorEmail) {
  const actor = normalizeEmail(actorEmail);
  return (Array.isArray(items) ? items : []).filter((item) => (
    !isPrivateUnmatched(item) || normalizeEmail(item?.addedByEmail) === actor
  ));
}

function normalizeMatchUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `url:${host}${path}${url.search}`;
  } catch {
    return "";
  }
}

// Server-side match key for a plaintext item. Encrypted items carry a
// client-computed blind index instead (the server never sees the link).
export function derivedMatchKey(item) {
  if (!item) return "";
  if (item.type === "encrypted") return cleanShort(item.matchKey, 160);
  if (item.type === "gif" && item.sourceId) return `gif:${item.source || ""}:${String(item.sourceId).toLowerCase()}`;
  if (item.type === "passage") {
    const text = String(item.passageText || "").replace(/\s+/g, " ").trim().toLowerCase();
    return text ? `text:${text}` : "";
  }
  return normalizeMatchUrl(item.sourceUrl);
}

function shelfKey(workspaceId) { return `shelf:${workspaceId}`; }
function cleanShort(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanPassage(value, max) {
  return String(value || "").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function roomE2eeRequired(workspace) {
  return Boolean(workspace?.settings?.roomE2eeEnabled);
}

function activityDayStamp(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function shelfRevealActivityId(itemId, actorEmail, now = new Date()) {
  return [
    "shelf",
    "revealed",
    cleanShort(itemId, 80),
    normalizeEmail(actorEmail),
    activityDayStamp(now),
  ].join(":");
}

function normalizeReaction(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return SHELF_REACTION_ALIASES[raw] || (VALID_REACTIONS.has(raw) ? raw : "");
}

function cleanReactions(value) {
  if (!value || typeof value !== "object") return {};
  const result = {};
  Object.entries(value).forEach(([email, reaction]) => {
    const normalized = normalizeEmail(email);
    const cleanReaction = normalizeReaction(reaction);
    if (normalized && cleanReaction) result[normalized] = cleanReaction;
  });
  return result;
}

async function readShelf(env, workspaceId) {
  try {
    const v = await getStore(env, STORE_NAME).get(shelfKey(workspaceId), { type: "json" });
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// Atomic read-modify-write for the per-workspace shelf list. Routes through the
// StateStore DO CAS coordinator when STATE is bound; otherwise falls back to
// plain KV RMW with the same shape. The transform receives the current items
// list and returns one of:
//   undefined / null              → no write, result is the current list
//   { error: { status, message } }→ no write, result.error propagates
//   { value: newItems, ...extra } → write the (capped) list; result is
//                                    { items: <capped>, ...extra }
async function mutateShelf(env, workspaceId, transform) {
  return mutateKey(env, STORE_NAME, shelfKey(workspaceId), (current) => {
    const items = Array.isArray(current) ? current : [];
    const out = transform(items);
    if (!out) return { value: items, result: { items }, write: false };
    if (out.error) return { value: items, result: out, write: false };
    if (!out.value) return { value: items, result: { ...out, items }, write: false };
    const capped = out.value.slice(0, MAX_ITEMS);
    return { value: capped, result: { ...out, items: capped } };
  });
}

// RedGifs backfill — populate videoHdUrl/videoSdUrl on RedGifs items that
// were saved before the API integration shipped. Runs lazily on GET via
// waitUntil so the user's first response isn't blocked. Capped per request
// to respect the RedGifs API rate limit; retries failed items every 24h.
const MIGRATION_BATCH_SIZE = 5;
const MIGRATION_RETRY_MS = 24 * 60 * 60 * 1000;

function shouldBackfillRedgifsItem(item) {
  if (!item || item.type !== "gif" || item.source !== "redgifs") return false;
  if (!redgifsLookupIds(item).length) return false;
  if (item.videoHdUrl || item.videoSdUrl) return false;
  // If we already tried recently and failed, hold off so we don't spin.
  if (item.redgifsMigrationAttemptedAt) {
    const last = new Date(item.redgifsMigrationAttemptedAt).getTime();
    if (Number.isFinite(last) && (Date.now() - last) < MIGRATION_RETRY_MS) return false;
  }
  return true;
}

function redgifsIdCandidates(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return [];
  const segment = raw.split(/[/?#]/)[0].replace(/[^a-z0-9-]/g, "");
  if (!segment) return [];
  const candidates = [];
  if (/^[a-z0-9]+$/.test(segment)) candidates.push(segment);
  const parts = segment.split("-").filter(Boolean);
  if (parts.length > 1) {
    candidates.push(parts[parts.length - 1]);
    candidates.push(segment.replace(/-/g, ""));
  }
  return candidates.filter(Boolean);
}

function redgifsLookupIds(item) {
  const candidates = [];
  const add = (value) => {
    for (const id of redgifsIdCandidates(value)) {
      if (!candidates.includes(id)) candidates.push(id);
    }
  };
  add(item?.sourceId);
  const source = `${item?.sourceUrl || ""} ${item?.embedUrl || ""}`;
  for (const match of source.matchAll(/redgifs\.com\/(?:watch\/|ifr\/|[a-z]+\/)([a-z0-9-]+)/ig)) {
    add(match[1]);
  }
  for (const match of source.matchAll(/(?:media|thumbs\d*)\.redgifs\.com\/([a-z0-9]+)/ig)) {
    add(match[1]);
  }
  return candidates;
}

function shouldResolveRedgifsItem(item) {
  return Boolean(
    item
      && item.type === "gif"
      && item.source === "redgifs"
      && redgifsLookupIds(item).length
      && !item.videoHdUrl
      && !item.videoSdUrl
  );
}

async function resolveRedgifsDirectUrlForItem(env, workspaceId, item) {
  if (!shouldResolveRedgifsItem(item)) return null;
  const lookupIds = redgifsLookupIds(item);
  let lookupId = "";
  let direct = null;
  for (const candidate of lookupIds) {
    direct = await redgifsDirectUrl(env, candidate);
    if (direct && (direct.hd || direct.sd)) {
      lookupId = candidate;
      break;
    }
  }
  if (!direct || (!direct.hd && !direct.sd)) return null;
  const now = new Date().toISOString();
  return mutateShelf(env, workspaceId, (fresh) => {
    let updatedItem = null;
    let mutated = false;
    const next = fresh.map((row) => {
      if (row.id !== item.id) return row;
      mutated = true;
      updatedItem = {
        ...row,
        sourceId: row.sourceId || lookupId,
        redgifsMigrationAttemptedAt: now,
        videoHdUrl: direct.hd || row.videoHdUrl || "",
        videoSdUrl: direct.sd || row.videoSdUrl || "",
        posterUrl: direct.poster || row.posterUrl || "",
      };
      return updatedItem;
    });
    return mutated ? { value: next, item: updatedItem } : undefined;
  });
}

async function backfillRedgifsDirectUrls(env, workspaceId, candidates) {
  if (!candidates.length) return;
  // Pre-fetch all direct URLs first — outside any read/write transaction —
  // then atomically apply the updates so a concurrent save/edit isn't clobbered.
  const results = [];
  for (const it of candidates) {
    try {
      let direct = null;
      let sourceId = "";
      for (const candidate of redgifsLookupIds(it)) {
        direct = await redgifsDirectUrl(env, candidate);
        if (direct && (direct.hd || direct.sd)) {
          sourceId = candidate;
          break;
        }
      }
      results.push({ id: it.id, sourceId: sourceId || it.sourceId, direct });
    } catch {
      results.push({ id: it.id, sourceId: it.sourceId, direct: null });
    }
  }
  if (!results.length) return;
  const now = new Date().toISOString();
  try {
    await mutateShelf(env, workspaceId, (fresh) => {
      if (!fresh.length) return { value: fresh };
      let mutated = false;
      const next = fresh.map((row) => {
        const update = results.find((r) => r.id === row.id);
        if (!update) return row;
        mutated = true;
        const direct = update.direct;
        const patched = { ...row, redgifsMigrationAttemptedAt: now };
        if (direct && (direct.hd || direct.sd)) {
          patched.sourceId = update.sourceId || row.sourceId || "";
          patched.videoHdUrl = direct.hd || "";
          patched.videoSdUrl = direct.sd || "";
          if (direct.poster) patched.posterUrl = direct.poster;
        }
        return patched;
      });
      return mutated ? { value: next } : undefined;
    });
  } catch {
    // Best-effort backfill — leaving these for a future call is fine.
  }
}

function scheduleRedgifsBackfill(context, env, workspaceId, items) {
  const candidates = items.filter(shouldBackfillRedgifsItem).slice(0, MIGRATION_BATCH_SIZE);
  if (!candidates.length) return;
  const task = backfillRedgifsDirectUrls(env, workspaceId, candidates).catch(() => {});
  if (typeof context.waitUntil === "function") {
    context.waitUntil(task);
  }
  // No await — caller's response goes out immediately. The next GET will
  // see the populated fields.
}

// Who a mutual find belongs to: both savers. Older mutual rows without the list
// fall back to the original saver plus the partner who matched it.
function shelfMembers(item) {
  if (!item?.mutualAt) return [normalizeEmail(item?.addedByEmail)].filter(Boolean);
  const list = Array.isArray(item.savedByEmails) && item.savedByEmails.length
    ? item.savedByEmails
    : [item.addedByEmail, item.mutualWithEmail];
  return [...new Set(list.map(normalizeEmail).filter(Boolean))];
}

// Public-facing item shape — same as stored, but make sure shape is stable
// for the client. A mutual find is attributed to both of you and dated when it
// matched: it never says which of you saved it privately first, or when.
function publicItem(item, viewerEmail = "") {
  const mutual = Boolean(item.mutualAt);
  const viewer = normalizeEmail(viewerEmail);
  const out = {
    id: item.id,
    type: item.type,
    source: item.source || null,
    sourceLabel: item.type === "encrypted" ? "" : sourceLabel(item.source),
    sourceUrl: item.sourceUrl || "",
    embedUrl: item.embedUrl || "",
    posterUrl: item.posterUrl || "",
    // RedGifs API integration — direct video URLs let the client render
    // its own <video> with custom (creator-anonymized) chrome.
    videoHdUrl: item.videoHdUrl || "",
    videoSdUrl: item.videoSdUrl || "",
    passageText: item.passageText || "",
    title: item.title || "",
    addedByEmail: mutual
      ? (shelfMembers(item).includes(viewer) ? viewer : "")
      : item.addedByEmail || "",
    addedByName: mutual ? "" : item.addedByName || "",
    addedAt: mutual ? item.mutualAt : item.addedAt || "",
    reactions: cleanReactions(item.reactions),
    share: mutual ? "together" : item.share === "private" || item.share === "together" ? item.share : "send",
    mutual,
  };
  const encryptedContent = cleanRoomEncryptedBox(item.encryptedContent, 60000);
  const encryptedTitle = cleanRoomEncryptedBox(item.encryptedTitle, 12000);
  if (encryptedContent) out.encryptedContent = encryptedContent;
  if (encryptedTitle) out.encryptedTitle = encryptedTitle;
  return out;
}

// The saver owns an item; a mutual find is owned by both savers.
function ownsItem(item, actorEmail) {
  const actor = normalizeEmail(actorEmail);
  return Boolean(actor) && shelfMembers(item).includes(actor);
}

export async function onRequest(context) {
  const identity = await getAuthenticatedIdentity(context);
  if (!identity.ok) return identity.response;

  const env = context.env;
  const method = context.request.method.toUpperCase();
  let payload = {};
  if (method !== "GET") {
    try { payload = await context.request.json(); }
    catch { return jsonResponse(400, { error: "Invalid JSON." }); }
  }

  const workspaceId = workspaceIdFromRequest(context.request) || workspaceIdFromPayload(payload);
  const access = await authorizeWorkspaceAccess(context, identity, workspaceId);
  if (!access.ok) return access.response;
  const ws = access.workspace;
  const actorEmail = normalizeEmail(identity.email);
  const actorName  = identity.displayName
    || ws.members?.find((m) => normalizeEmail(m.email) === actorEmail)?.displayName
    || "";
  const view = (item) => publicItem(item, actorEmail);

  if (method === "GET") {
    const items = await readShelf(env, ws.id);
    // Lazily backfill RedGifs direct URLs for items saved before the API
    // integration shipped. Runs in waitUntil after the response goes out.
    scheduleRedgifsBackfill(context, env, ws.id, items);
    return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, items: visibleShelfItems(items, actorEmail).map(view) });
  }

  if (method === "POST") {
    const encryptedContent = cleanRoomEncryptedBox(payload.encryptedContent, 60000);
    const encryptedTitle = cleanRoomEncryptedBox(payload.encryptedTitle, 12000);
    if (roomE2eeRequired(ws) && !encryptedContent) {
      return jsonResponse(400, { error: "Room Encryption requires encrypted Shelf content." });
    }
    if (roomE2eeRequired(ws) && cleanShort(payload.title, MAX_TITLE_LEN) && !encryptedTitle) {
      return jsonResponse(400, { error: "Room Encryption requires encrypted Shelf titles." });
    }
    const draft = encryptedContent
      ? { kind: "encrypted", source: null, sourceUrl: "", sourceId: "", embedUrl: "", posterUrl: "" }
      : parseShelfInput(payload.content);
    if (!draft) return jsonResponse(400, { error: "Paste a link or a passage of text." });

    // RedGifs API integration — include direct video URLs immediately so a
    // just-saved tile reveals through the same muted, chrome-free <video>
    // path as older RedGifs saves.
    let videoHdUrl = "";
    let videoSdUrl = "";
    let posterUrl = draft.posterUrl || "";
    if (draft.kind === "gif" && draft.source === "redgifs" && draft.sourceId) {
      try {
        const direct = await redgifsDirectUrl(env, draft.sourceId);
        if (direct) {
          videoHdUrl = direct.hd || "";
          videoSdUrl = direct.sd || "";
          // Prefer the API-provided poster (more reliable than the
          // guessed /media URL pattern from _shelf.js).
          if (direct.poster) posterUrl = direct.poster;
        }
      } catch {
        // Silent — background backfill will retry, and the client will avoid
        // sending users to the source page for RedGifs tiles.
      }
    }

    const now = new Date().toISOString();
    const base = {
      id: crypto.randomUUID(),
      type: draft.kind,
      source: draft.source || null,
      sourceUrl: draft.sourceUrl || "",
      sourceId: draft.sourceId || "",
      embedUrl: draft.embedUrl || "",
      posterUrl,
      videoHdUrl,
      videoSdUrl,
      passageText: encryptedContent
        ? "Encrypted shelf item"
        : draft.kind === "passage" ? cleanPassage(draft.passageText, 1200) : "",
      title: encryptedTitle ? "Encrypted title" : encryptedContent ? "" : cleanShort(payload.title, MAX_TITLE_LEN),
      addedByEmail: actorEmail,
      addedByName: actorName,
      addedAt: now,
      reactions: {},
    };
    const shareMode = cleanShareMode(payload.mode);
    if (shareMode !== "send") base.share = shareMode;
    if (encryptedContent) {
      const clientKey = cleanShort(payload.matchKey, 160);
      if (MATCH_KEY_RE.test(clientKey)) base.matchKey = clientKey;
    }
    if (encryptedContent) base.encryptedContent = encryptedContent;
    if (encryptedTitle) base.encryptedTitle = encryptedTitle;

    // Dupe-check + write run inside the CAS transform so a concurrent save
    // can't slip in a duplicate or clobber this one.
    let isDuplicate = false;
    let duplicateItem = null;
    let mutualItem = null;
    const baseMatchKey = derivedMatchKey(base);
    const casResult = await mutateShelf(env, ws.id, (current) => {
      // A partner's unmatched private save of the same thing turns into a
      // mutual find instead of a second tile. Checked before the dupe scan,
      // which only looks at what this viewer can already see, so a duplicate
      // response can never confirm a private save exists.
      if (baseMatchKey) {
        const idx = current.findIndex((it) => (
          isPrivateUnmatched(it)
          && !ownsItem(it, actorEmail)
          && derivedMatchKey(it) === baseMatchKey
        ));
        if (idx >= 0) {
          // Becomes a shared tile owned by both of you, dated now. The private
          // save's own timestamp is dropped so nothing says who saved first.
          mutualItem = {
            ...current[idx],
            share: "together",
            addedAt: now,
            mutualAt: now,
            mutualWithEmail: actorEmail,
            savedByEmails: [normalizeEmail(current[idx].addedByEmail), actorEmail].filter(Boolean),
          };
          return { value: current.map((it, i) => (i === idx ? mutualItem : it)) };
        }
      }
      const dupe = visibleShelfItems(current, actorEmail).find((it) => {
        if (encryptedContent) return false;
        if (draft.kind === "gif"     && it.type === "gif"     && it.sourceId === draft.sourceId) return true;
        if (draft.kind === "story"   && it.type === "story"   && it.sourceUrl === draft.sourceUrl) return true;
        if (draft.kind === "passage" && it.type === "passage" && (it.passageText || "").toLowerCase() === (draft.passageText || "").toLowerCase()) return true;
        return false;
      });
      if (dupe) {
        isDuplicate = true;
        duplicateItem = dupe;
        return { value: current };
      }
      return { value: [base, ...current] };
    });
    const next = casResult.items;
    const visibleNext = visibleShelfItems(next, actorEmail);
    if (mutualItem) {
      await appendAudit(env, ws.id, {
        type: "shelf_matched", actorEmail, actorName,
        entityType: "shelf", entityId: mutualItem.id,
      });
      broadcastRoomEvent(context, ws.id, {
        resource: "shelf",
        action: "matched",
        entityId: mutualItem.id,
        actorEmail,
        actorName,
      });
      return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, item: view(mutualItem), items: visibleNext.map(view), mutual: true });
    }
    if (isDuplicate) {
      return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, item: view(duplicateItem), items: visibleNext.map(view), duplicate: true });
    }
    // A save-for-me stays out of the shared activity feed and the audit trail;
    // only the saver's own list changes.
    if (shareMode !== "private") {
      await appendAudit(env, ws.id, {
        type: "shelf_added", actorEmail, actorName,
        entityType: "shelf", entityId: base.id,
      });
      broadcastRoomEvent(context, ws.id, {
        resource: "shelf",
        action: "added",
        entityId: base.id,
        actorEmail,
        actorName,
      });
    }
    if (draft.kind === "gif" && draft.source === "redgifs" && draft.sourceId && !videoHdUrl && !videoSdUrl) {
      scheduleRedgifsBackfill(context, env, ws.id, next);
    }
    return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, item: view(base), items: visibleNext.map(view) });
  }

  if (method === "PATCH") {
    const id = String(payload.id || "");
    if (!id) return jsonResponse(400, { error: "id required." });

    // "revealed" and "focused" are passive activity pings — broadcast only, no KV write.
    if (["revealed", "focused"].includes(cleanShort(payload.action, 40))) {
      const items = visibleShelfItems(await readShelf(env, ws.id), actorEmail);
      const item = items.find((it) => it.id === id);
      if (!item) return jsonResponse(404, { error: "Not found." });
      const now = new Date();
      if (isPrivateUnmatched(item)) {
        // Your own save-for-me: nothing to tell the partner about.
        return jsonResponse(200, {
          workspaceId: ws.id,
          reactionCatalog: SHELF_REACTION_CATALOG,
          item: view(item),
          items: items.map(view),
        });
      }
      if (cleanShort(payload.action, 40) === "focused") {
        const focus = await broadcastFocusRoomEvent(context, ws.id, {
          resource: "shelf",
          entityId: item.id,
          actorEmail,
          actorName,
          at: now.toISOString(),
        });
        return jsonResponse(200, {
          workspaceId: ws.id,
          reactionCatalog: SHELF_REACTION_CATALOG,
          item: view(item),
          items: items.map(view),
          ...focus,
        });
      }
      let responseItems = items;
      let responseItem = item;
      try {
        const resolved = await resolveRedgifsDirectUrlForItem(env, ws.id, item);
        if (resolved?.items?.length) {
          responseItems = visibleShelfItems(resolved.items, actorEmail);
          responseItem = resolved.item || resolved.items.find((it) => it.id === id) || item;
        }
      } catch {
        // Best effort: the reveal activity can still be recorded, and the
        // next reveal can retry resolving the direct video URL.
      }
      broadcastRoomEvent(context, ws.id, {
        id: shelfRevealActivityId(item.id, actorEmail, now),
        resource: "shelf",
        action: "revealed",
        entityId: item.id,
        actorEmail,
        actorName,
        at: now.toISOString(),
        passive: true,
        dedupe: "keep-first",
      });
      return jsonResponse(200, {
        workspaceId: ws.id,
        reactionCatalog: SHELF_REACTION_CATALOG,
        item: view(responseItem),
        items: responseItems.map(view),
        activityRecorded: true,
      });
    }

    const hasTitle = typeof payload.title === "string";
    const encryptedTitle = cleanRoomEncryptedBox(payload.encryptedTitle, 12000);
    const hasReaction = typeof payload.reaction === "string" || payload.reaction === null;
    if (roomE2eeRequired(ws) && hasTitle && cleanShort(payload.title, MAX_TITLE_LEN) && !encryptedTitle) {
      return jsonResponse(400, { error: "Room Encryption requires encrypted Shelf titles." });
    }
    let normalizedReaction = "";
    let clearReaction = false;
    if (hasReaction) {
      if (payload.reaction === null || payload.reaction === "") {
        clearReaction = true;
      } else {
        normalizedReaction = normalizeReaction(payload.reaction);
        if (!VALID_REACTIONS.has(normalizedReaction)) return jsonResponse(400, { error: "Unknown reaction." });
      }
    }

    let patchedPrivate = false;
    const casResult = await mutateShelf(env, ws.id, (current) => {
      const idx = current.findIndex((it) => it.id === id);
      if (idx < 0) return { error: { status: 404, message: "Not found." } };
      if (isPrivateUnmatched(current[idx]) && !ownsItem(current[idx], actorEmail)) {
        return { error: { status: 404, message: "Not found." } };
      }
      patchedPrivate = isPrivateUnmatched(current[idx]);
      const item = { ...current[idx] };
      if (hasTitle) {
        if (!ownsItem(item, actorEmail)) {
          return { error: { status: 403, message: "Only the saver can rename this." } };
        }
        item.title = encryptedTitle ? "Encrypted title" : cleanShort(payload.title, MAX_TITLE_LEN);
        if (encryptedTitle) item.encryptedTitle = encryptedTitle;
        else delete item.encryptedTitle;
      }
      if (hasReaction) {
        item.reactions = { ...(item.reactions || {}) };
        if (clearReaction) delete item.reactions[actorEmail];
        // Shelf reactions stay in partner Activity instead of interrupting
        // the author off-device.
        else item.reactions[actorEmail] = normalizedReaction;
      }
      const next = current.map((entry, i) => (i === idx ? item : entry));
      return { value: next };
    });
    if (casResult.error) return jsonResponse(casResult.error.status, { error: casResult.error.message });
    const item = casResult.items.find((it) => it.id === id);
    if (!patchedPrivate) {
      await appendAudit(env, ws.id, {
        type: "shelf_updated", actorEmail, actorName,
        entityType: "shelf", entityId: item.id,
      });
      broadcastRoomEvent(context, ws.id, {
        resource: "shelf",
        action: Object.prototype.hasOwnProperty.call(payload, "reaction") ? "reacted" : "updated",
        entityId: item.id,
        actorEmail,
        actorName,
      });
    }
    return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, item: view(item), items: visibleShelfItems(casResult.items, actorEmail).map(view) });
  }

  if (method === "DELETE") {
    const id = String(payload.id || "");
    if (!id) return jsonResponse(400, { error: "id required." });
    let removedItem = null;
    let keptForPartner = false;
    const casResult = await mutateShelf(env, ws.id, (current) => {
      const item = current.find((it) => it.id === id);
      if (!item || (isPrivateUnmatched(item) && !ownsItem(item, actorEmail))) {
        return { error: { status: 404, message: "Not found." } };
      }
      if (!ownsItem(item, actorEmail)) {
        return { error: { status: 403, message: "Only the saver can remove this." } };
      }
      removedItem = item;
      // A mutual find is both of yours: removing it takes it off YOUR Shelf
      // only. The other saver keeps it, back as their own save-for-me.
      const others = item.mutualAt ? shelfMembers(item).filter((email) => email !== actorEmail) : [];
      if (others.length) {
        keptForPartner = true;
        const keeper = others[0];
        const rest = { ...item };
        delete rest.mutualAt;
        delete rest.mutualWithEmail;
        delete rest.savedByEmails;
        const reactions = { ...(rest.reactions || {}) };
        delete reactions[actorEmail];
        const kept = {
          ...rest,
          share: "private",
          addedByEmail: keeper,
          addedByName: ws.members?.find((m) => normalizeEmail(m.email) === keeper)?.displayName || "",
          reactions,
        };
        return { value: current.map((it) => (it.id === id ? kept : it)) };
      }
      return { value: current.filter((it) => it.id !== id) };
    });
    if (casResult.error) return jsonResponse(casResult.error.status, { error: casResult.error.message });
    if (!keptForPartner && !isPrivateUnmatched(removedItem)) {
      await appendAudit(env, ws.id, {
        type: "shelf_deleted", actorEmail, actorName,
        entityType: "shelf", entityId: removedItem.id,
      });
      broadcastRoomEvent(context, ws.id, {
        resource: "shelf",
        action: "deleted",
        entityId: removedItem.id,
        actorEmail,
        actorName,
      });
    }
    return jsonResponse(200, { workspaceId: ws.id, reactionCatalog: SHELF_REACTION_CATALOG, items: visibleShelfItems(casResult.items, actorEmail).map(view) });
  }

  return jsonResponse(405, { error: "Method not allowed." });
}
