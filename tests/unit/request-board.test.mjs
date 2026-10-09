// Handler-level tests for the requests-store conversion. Runs the real
// request-board onRequest against a CAS-backed env via the local-preview
// identity, with a two-partner workspace seeded so requests can be sent.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { onRequest as board, readRequestBoardForWorkspace } from "../../functions/api/request-board.js";
import { mutatePlatformState } from "../../functions/api/_workspaces.js";
import { mutateKey, readKey } from "../../functions/api/_state.js";
import { makeSessionToken, makeStateEnv } from "./helpers.mjs";

const ME = "local-preview@example.test";
const PARTNER = "partner@example.test";
const THIRD = "third@example.test";
const APP_SESSION_SECRET = "request-board-test-session-secret-123456";
const REQ_STORE = "sexualsync-request-board";
const WORKSPACE_ID = "w1";
// C3 — requests are keyed per workspace. Tests seed and read back the
// per-workspace key (`requests:${WORKSPACE_ID}`); the runtime writes only there.
const REQ_KEY = `requests:${WORKSPACE_ID}`;

async function setup(requests = [], extraMembers = []) {
  const e = makeStateEnv();
  e.ALLOW_LOCAL_PREVIEW = "1";
  const members = [
    { email: ME, role: "owner", status: "active", displayName: "Me" },
    { email: PARTNER, role: "partner", status: "active", displayName: "Partner" },
    ...extraMembers,
  ];
  await mutatePlatformState(e, () => ({
    profiles: members.map((member, index) => ({
      id: `p${index + 1}`,
      email: member.email,
      displayName: member.displayName,
    })),
    workspaces: [{
      id: "w1", name: "Room", displayName: "Room", status: "active", productMode: "couples",
      members,
      settings: {},
    }],
    invites: [],
  }));
  if (requests.length) await mutateKey(e, REQ_STORE, REQ_KEY, () => ({ value: requests }));
  return e;
}

const NOW = new Date().toISOString();
const req = (id, overrides = {}) => ({
  id, workspaceId: "w1", status: "sent",
  requesterEmail: ME, reviewerEmail: PARTNER, requester: "Me", reviewer: "Partner",
  categories: ["Massage"], timing: "Tonight", filming: "No", decisions: [], counters: [],
  createdAt: NOW, updatedAt: NOW, sentAt: NOW,
  ...overrides,
});

const call = (e, method, body, headers = {}) => board({
  request: new Request("http://localhost/api/request-board", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }),
  env: e,
});

async function callAs(e, email, method, body) {
  e.APP_SESSION_SECRET = APP_SESSION_SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(APP_SESSION_SECRET, {
    sid: `test-${email}`,
    provider: "email",
    email,
    name: email,
    iat: now,
    exp: now + 3600,
  });
  return board({
    request: new Request("https://app.example.test/api/request-board", {
      method,
      headers: {
        "content-type": "application/json",
        cookie: `sxs-session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify(body),
    }),
    env: e,
  });
}

async function readRequests(e) {
  return (await readKey(e, REQ_STORE, REQ_KEY)) || [];
}

async function readTokens(e) {
  return (await readKey(e, "sexualsync-review-tokens", "tokens")) || [];
}

test("sending a new request creates it as pending with a review token", async () => {
  const e = await setup();
  const res = await call(e, "POST", { workspaceId: "w1", categories: ["Massage"], timing: "Tonight", status: "sent" });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.request.status, "pending");
  assert.ok(body.reviewToken && body.reviewToken.token, "a review token is minted");
  assert.match(body.reviewToken.reviewUrl, /^http:\/\/localhost\/review\?token=/);

  const stored = await readRequests(e);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "pending");
});

test("replaying a queued Ask create with the same idempotency key does not duplicate or re-notify", async () => {
  const e = await setup();
  const body = { workspaceId: "w1", categories: ["Massage"], timing: "Tonight", status: "sent" };
  const headers = { "idempotency-key": "queued-ask-create-1" };

  const first = await call(e, "POST", body, headers);
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.request.status, "pending");
  assert.ok(firstBody.reviewToken?.token);

  const second = await call(e, "POST", body, headers);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.emailResult?.reason, "idempotent-replay");
  assert.equal(secondBody.reviewToken, null);

  const stored = await readRequests(e);
  assert.equal(stored.length, 1, "only one Ask is stored");
  assert.equal(stored[0].id, firstBody.request.id);
  assert.equal(stored[0].reviewTokenId, firstBody.request.reviewTokenId);

  const tokens = await readTokens(e);
  assert.equal(tokens.length, 1, "only the original review token exists");
});

test("archiving a request transitions it to archived", async () => {
  const e = await setup([req("r1")]);
  const res = await call(e, "PATCH", { id: "r1", action: "archive", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").status, "archived");
});

test("either partner can withdraw an agreed request (change of plans) without a pass or cancel record", async () => {
  const yesDecision = { label: "Massage", decision: "Yes", targetType: "act" };
  const e = await setup([
    req("mine", { status: "on_deck", decisions: [yesDecision] }),
    req("theirs", {
      status: "on_deck",
      requesterEmail: PARTNER,
      reviewerEmail: ME,
      requester: "Partner",
      reviewer: "Me",
      decisions: [yesDecision],
    }),
  ]);

  // "withdraw" is the action; "pass" is the legacy name older clients send.
  const mine = await call(e, "PATCH", { id: "mine", action: "withdraw", workspaceId: "w1" });
  const theirs = await call(e, "PATCH", { id: "theirs", action: "pass", workspaceId: "w1" });

  assert.equal(mine.status, 200);
  assert.equal(theirs.status, 200);
  const stored = await readRequests(e);
  for (const id of ["mine", "theirs"]) {
    const row = stored.find((r) => r.id === id);
    assert.equal(row.status, "archived");
    assert.equal(row.withdrawnByEmail, ME);
    assert.ok(row.withdrawnAt);
    assert.equal(row.passedAt, undefined, "a withdrawal is never recorded as a pass");
    assert.equal(row.passedByEmail, undefined);
    assert.equal(row.archivedAt, undefined, "a withdrawal is not recorded as an archive/cancel");
  }
  const audit = (await readKey(e, "sexualsync-audit", "workspace-w1")) || [];
  const types = audit.map((event) => event?.type);
  assert.ok(types.includes("request_plans_changed"));
  assert.ok(!types.includes("request_archived"), "no archive/cancel audit row for a change of plans");

  // The activity row is the warm "Change of plans", not a pass or a cancel.
  const { readActivity } = await import("../../functions/api/_activity.js");
  let items = [];
  for (let i = 0; i < 20 && !items.length; i += 1) {
    items = ((await readActivity(e, "w1", PARTNER))?.items || []).filter((item) => item.entityId === "mine");
    if (!items.length) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(items[0]?.action, "withdrawn");
  assert.equal(items[0]?.label, "Change of plans");
  // Like a mood match, it has no actor: it never says which of you took it back.
  assert.equal(items[0]?.actorEmail, "");
  assert.doesNotMatch(items[0]?.label, /Me|Partner/);

  // Health reads the board through the same reader (and migration) it uses in
  // production: a withdrawn yes is never a moment.
  const { sourceEventsFromRequests } = await import("../../functions/api/dashboard/health.js");
  const healthBoard = await readRequestBoardForWorkspace(e, "w1", { expireInMemory: false });
  assert.equal(healthBoard.requests.filter((row) => row.withdrawnAt).length, 2, "withdrawnAt survives the read path");
  assert.deepEqual(sourceEventsFromRequests(healthBoard), [], "Health skips withdrawn Asks");
  assert.equal(
    sourceEventsFromRequests({ requests: stored.map(({ withdrawnAt, withdrawnByEmail, withdrawnByName, ...row }) => ({ ...row, status: "on_deck" })) }).length,
    2,
    "the same Asks count once nothing was withdrawn",
  );
});

test("only an agreed Ask can be withdrawn, and a plan is cleared with it", async () => {
  const yesDecision = { label: "Massage", decision: "Yes", targetType: "act" };
  const planned = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const e = await setup([
    req("agreed", { status: "on_deck", decisions: [yesDecision], plannedFor: planned, plannedByEmail: ME }),
    req("open", { status: "sent" }),
  ]);
  const open = await call(e, "PATCH", { id: "open", action: "withdraw", workspaceId: "w1" });
  assert.equal(open.status, 409);
  const res = await call(e, "PATCH", { id: "agreed", action: "withdraw", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const stored = (await readRequests(e)).find((r) => r.id === "agreed");
  assert.equal(stored.plannedFor, undefined);
  assert.equal(stored.plannedByEmail, undefined);
});

test("a withdrawn Ask can't be restored by either partner; withdrawnAt is never wiped", async () => {
  const yesDecision = { label: "Massage", decision: "Yes", targetType: "act" };
  const e = await setup([req("a1", { status: "reviewed", decisions: [yesDecision], reviewedAt: NOW, reviewedByEmail: PARTNER })]);
  // The reviewer (who said yes) changes plans.
  const withdrawn = await callAs(e, PARTNER, "PATCH", { id: "a1", action: "withdraw", workspaceId: "w1" });
  assert.equal(withdrawn.status, 200);
  // Neither the asker nor the withdrawer can bring that yes back.
  for (const email of [ME, PARTNER]) {
    for (const action of ["restore", "on_deck"]) {
      const res = await callAs(e, email, "PATCH", { id: "a1", action, workspaceId: "w1" });
      assert.equal(res.status, 409, `${email} ${action}`);
      const body = await res.json();
      assert.equal(body.error, "This one was set aside. Ask again instead.");
      assert.equal(body.withdrawn, true);
    }
  }
  const stored = (await readRequests(e)).find((r) => r.id === "a1");
  assert.equal(stored.status, "archived");
  assert.ok(stored.withdrawnAt, "withdrawnAt survives a refused restore");
  assert.equal(stored.restoredAt, undefined);

  // Who changed plans stays with them: the other partner's rows don't name them.
  const theirView = await (await getBoardAs(e, ME)).json();
  const theirRow = theirView.requests.find((r) => r.id === "a1");
  assert.ok(theirRow.withdrawnAt);
  assert.equal(theirRow.withdrawnByEmail, undefined);
  assert.equal(theirRow.withdrawnByName, undefined);
  const ownView = await (await getBoardAs(e, PARTNER)).json();
  assert.equal(ownView.requests.find((r) => r.id === "a1").withdrawnByEmail, PARTNER);
});

test("a legacy withdrawal (archived + passedAt with a yes) can't be restored; a plain archive still can", async () => {
  const yesDecision = { label: "Massage", decision: "Yes", targetType: "act" };
  const e = await setup([
    req("legacy", { status: "archived", decisions: [yesDecision], passedAt: NOW }),
    req("archived", { status: "archived", decisions: [yesDecision], archivedAt: NOW }),
  ]);
  const legacy = await call(e, "PATCH", { id: "legacy", action: "restore", workspaceId: "w1" });
  assert.equal(legacy.status, 409);
  const plain = await call(e, "PATCH", { id: "archived", action: "restore", workspaceId: "w1" });
  assert.equal(plain.status, 200);
  assert.equal((await plain.json()).request.status, "on_deck");
});

test("an active workspace member who is not requester or reviewer cannot change an Ask status", async () => {
  const yesDecision = { label: "Massage", decision: "Yes", targetType: "act" };
  const e = await setup(
    [req("r1", { status: "on_deck", decisions: [yesDecision] })],
    [{ email: THIRD, role: "partner", status: "active", displayName: "Third" }],
  );

  const res = await callAs(e, THIRD, "PATCH", { id: "r1", action: "completed", workspaceId: "w1" });

  assert.equal(res.status, 403);
  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").status, "on_deck");
  assert.equal(stored.find((r) => r.id === "r1").completedByEmail, undefined);
});

test("an agreed request can be completed and moves to history", async () => {
  const e = await setup([req("r1", {
    status: "on_deck",
    decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }],
  })]);

  const res = await call(e, "PATCH", { id: "r1", action: "completed", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "completed");
  assert.equal(body.activeRequests.find((r) => r.id === "r1"), undefined);
  assert.equal(body.history.find((r) => r.id === "r1").status, "completed");

  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").completedByEmail, ME);
});

test("revoking a pending request removes it (PATCH action=revoke)", async () => {
  const e = await setup([req("r1", { status: "pending" })]);
  const res = await call(e, "PATCH", { id: "r1", action: "revoke", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1"), undefined);
});

test("revoking prunes the legacy global key so the board read can't resurrect it", async () => {
  // Regression: a pre-migration request that lives ONLY under the legacy global
  // "requests" key (not the per-workspace key). writeRequestsAtomic removes it
  // from the per-workspace key, but readRequests falls back to the legacy key
  // for any id it doesn't find there — so without an explicit legacy prune the
  // revoked Ask reappears on the next board load.
  const e = await setup(); // per-workspace key intentionally empty
  await mutateKey(e, REQ_STORE, "requests", () => ({ value: [req("r1", { status: "pending" })] }));

  const res = await call(e, "PATCH", { id: "r1", action: "revoke", workspaceId: "w1" });
  assert.equal(res.status, 200);

  const legacy = (await readKey(e, REQ_STORE, "requests")) || [];
  assert.equal(legacy.find((r) => r.id === "r1"), undefined, "legacy copy is pruned");

  const boardAfter = await readRequestBoardForWorkspace(e, "w1");
  assert.equal(boardAfter.requests.find((r) => r.id === "r1"), undefined, "request does not resurrect on board read");
});

test("assigned reviewer can reply to a sent request from Ask detail", async () => {
  const e = await setup([req("r1", {
    requesterEmail: PARTNER,
    reviewerEmail: ME,
    requester: "Partner",
    reviewer: "Me",
  })]);

  const res = await call(e, "PATCH", {
    id: "r1",
    action: "reply",
    workspaceId: "w1",
    decisions: [
      { label: "Counter option 1", decision: "Counter", counter: "Cuddle first", targetType: "act" },
      { label: "Timing: Tonight", decision: "Counter", counter: "Tomorrow", targetType: "timing" },
    ],
    note: "Slow start."
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "reviewed");
  assert.equal(body.request.decisions[0].decision, "Counter");
  assert.equal(body.request.counters[0].counter, "Cuddle first");
  assert.equal(body.request.counters[1].counter, "Tomorrow");
  assert.equal(body.request.feedback, "Slow start.");

  const stored = await readRequests(e);
  const reviewed = stored.find((r) => r.id === "r1");
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.reviewedByEmail, ME);
});

test("assigned reviewer can pass a sent request from Ask detail", async () => {
  const e = await setup([req("r1", {
    requesterEmail: PARTNER,
    reviewerEmail: ME,
    requester: "Partner",
    reviewer: "Me",
  })]);

  const res = await call(e, "PATCH", {
    id: "r1",
    action: "reply",
    workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "No" }],
    note: "Not tonight."
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "reviewed");
  assert.equal(body.request.decisions[0].decision, "No");
  assert.deepEqual(body.request.counters, []);
  assert.equal(body.request.feedback, "Not tonight.");

  // The activity feed names the pass instead of a generic "Ask reviewed".
  const { readActivity } = await import("../../functions/api/_activity.js");
  let items = [];
  for (let i = 0; i < 20 && !items.length; i += 1) {
    items = ((await readActivity(e, "w1", PARTNER))?.items || []).filter((item) => item.entityId === "r1");
    if (!items.length) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(items[0]?.action, "passed");
  // A plain pass still reads warm for the asker: never a bare "passed".
  assert.equal(items[0]?.label, "Me passed for now. No reason needed");
  assert.equal(body.request.passNote, undefined);
  assert.equal(body.request.rainCheckAt, undefined);
});

test("a pass can carry an allowlisted reassurance, and a rain check stores a resurface time", async () => {
  const e = await setup([
    req("r1", { requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me" }),
    req("r2", { requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me" }),
    req("r3", { requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me" }),
  ]);
  const rainCheckAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const warm = await call(e, "PATCH", {
    id: "r1", action: "reply", workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "No", targetType: "act" }],
    passNote: "still_want",
  });
  assert.equal(warm.status, 200);
  const warmBody = await warm.json();
  assert.equal(warmBody.request.passNote, "still_want");
  assert.equal(warmBody.request.rainCheckAt, undefined);

  const rain = await call(e, "PATCH", {
    id: "r2", action: "reply", workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "No", targetType: "act" }],
    passNote: "this_weekend",
    rainCheckAt,
  });
  const rainBody = await rain.json();
  assert.equal(rainBody.request.passNote, "this_weekend");
  assert.equal(rainBody.request.rainCheckAt, rainCheckAt);

  // Free text is never accepted as a note, and a note never rides on a yes.
  const junk = await call(e, "PATCH", {
    id: "r3", action: "reply", workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }],
    passNote: "still_want",
  });
  const junkBody = await junk.json();
  assert.equal(junkBody.request.passNote, undefined);

  const { readActivity } = await import("../../functions/api/_activity.js");
  let items = [];
  for (let i = 0; i < 20 && items.length < 2; i += 1) {
    items = ((await readActivity(e, "w1", PARTNER))?.items || []).filter((item) => item.entityId === "r1" || item.entityId === "r2");
    if (items.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const byId = Object.fromEntries(items.map((item) => [item.entityId, item]));
  assert.equal(byId.r1?.action, "passed_still_want");
  assert.equal(byId.r1?.label, "Not tonight, but Me still wants you");
  assert.equal(byId.r2?.action, "passed_this_weekend");
});

test("a garbled pass note or out-of-range rain check is cleaned, not stored", async () => {
  const { passReplyFields } = await import("../../functions/api/request-board.js");
  const no = [{ label: "Massage", decision: "No", targetType: "act" }];
  const now = Date.parse("2026-05-23T01:00:00Z");
  assert.deepEqual(passReplyFields({ passNote: "<script>" }, no, now), {});
  assert.deepEqual(passReplyFields({ passNote: "love_asked" }, no, now), { passNote: "love_asked" });
  // A rain check far in the future (or in the past) falls back to the server default window.
  const far = passReplyFields({ passNote: "next_week", rainCheckAt: "2027-01-01T00:00:00Z" }, no, now);
  assert.equal(far.rainCheckAt, new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString());
  assert.deepEqual(passReplyFields({ passNote: "still_want" }, [{ label: "Massage", decision: "Counter", counter: "Kiss", targetType: "act" }], now), {});
});

test("the same Ask can't be re-sent for a week after a pass; a rain check opens it early", async () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const passed = req("passed", {
    status: "reviewed",
    categories: ["Massage", "Kiss"],
    decisions: [
      { label: "Massage", decision: "No", targetType: "act" },
      { label: "Kiss", decision: "No", targetType: "act" },
    ],
    reviewedAt: twoDaysAgo,
    sentAt: twoDaysAgo,
    createdAt: twoDaysAgo,
    timing: "Next week",
  });
  const e = await setup([passed]);
  const blocked = await call(e, "POST", { workspaceId: "w1", categories: ["kiss", "Massage"], timing: "Tonight", filming: "No" });
  assert.equal(blocked.status, 409);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.cooldown?.requestId, "passed");
  assert.ok(Date.parse(blockedBody.cooldown.until) > Date.now());
  assert.doesNotMatch(blockedBody.error, /error|denied|rejected/i);

  // A different set of Acts is fine.
  const other = await call(e, "POST", { workspaceId: "w1", categories: ["Massage"], timing: "Tonight", filming: "No" });
  assert.equal(other.status, 201);

  // A rain check that has already arrived lifts the cooldown for that Ask.
  const e2 = await setup([{ ...passed, passNote: "this_weekend", rainCheckAt: new Date(Date.now() - 60 * 1000).toISOString() }]);
  const reopened = await call(e2, "POST", { workspaceId: "w1", categories: ["Massage", "Kiss"], timing: "Tonight", filming: "No" });
  assert.equal(reopened.status, 201);
});

const passedMassage = () => req("passed", {
  status: "reviewed",
  decisions: [{ label: "Massage", decision: "No", targetType: "act" }],
  reviewedAt: NOW,
  reviewedByEmail: PARTNER,
});

test("with a rain check, the Ask opens at exactly the rain-check time, even a little past the week", async () => {
  const rainCheckAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString();
  const e = await setup([{ ...passedMassage(), passNote: "next_week", rainCheckAt }]);
  const res = await call(e, "POST", { workspaceId: "w1", categories: ["Massage"], timing: "Tonight" });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).cooldown.until, rainCheckAt, "the same instant the rain-check copy shows");
});

test("the re-ask cooldown also holds when a saved draft is sent", async () => {
  const e = await setup([passedMassage()]);
  const draft = await call(e, "POST", { workspaceId: "w1", categories: ["Massage"], timing: "Tonight", status: "draft" });
  assert.equal(draft.status, 201, "saving a draft is fine");
  const draftId = (await draft.json()).request.id;
  const send = await call(e, "POST", { workspaceId: "w1", id: draftId, categories: ["Massage"], timing: "Tonight", status: "sent" });
  assert.equal(send.status, 409);
  assert.ok((await send.json()).cooldown);
  assert.equal((await readRequests(e)).find((r) => r.id === draftId).status, "draft");
});

test("sending a draft is a real send: pending, sentAt, a review link, one 'sent' event", async () => {
  const e = await setup();
  const draft = await call(e, "POST", { workspaceId: "w1", categories: ["Kiss"], timing: "Tonight", status: "draft" });
  const draftBody = await draft.json();
  assert.equal(draftBody.request.status, "draft");
  assert.equal(draftBody.request.sentAt, undefined);
  assert.equal((await readTokens(e)).length, 0, "a draft mints no review link");
  const send = await call(e, "POST", { workspaceId: "w1", id: draftBody.request.id, status: "sent" });
  assert.equal(send.status, 200);
  const sent = await send.json();
  assert.equal(sent.request.status, "pending");
  assert.ok(sent.request.sentAt);
  assert.ok(sent.request.reviewTokenId);
  assert.ok(sent.reviewToken?.token);
  assert.equal((await readTokens(e)).length, 1);
});

test("re-wording an open Ask to a set that's resting is held by the cooldown", async () => {
  const e = await setup([passedMassage(), req("open", { categories: ["Kiss"], status: "pending" })]);
  const res = await call(e, "POST", { workspaceId: "w1", id: "open", categories: ["Massage"] });
  assert.equal(res.status, 409);
  assert.deepEqual((await readRequests(e)).find((r) => r.id === "open").categories, ["Kiss"]);
});

test("editing an Ask that's already out never re-mints a link or re-notifies", async () => {
  const e = await setup();
  const created = await (await call(e, "POST", { workspaceId: "w1", categories: ["Kiss"], timing: "Tonight", status: "sent" })).json();
  assert.equal((await readTokens(e)).length, 1);
  const edit = await call(e, "POST", { workspaceId: "w1", id: created.request.id, note: "Slowly" });
  assert.equal(edit.status, 200);
  const body = await edit.json();
  assert.equal(body.reviewToken, null);
  assert.equal(body.request.sentAt, created.request.sentAt);
  assert.equal((await readTokens(e)).length, 1);
});

test("the asker can't answer their own Ask through the edit path", async () => {
  const yes = [{ label: "Massage", decision: "Yes", targetType: "act" }];
  const e = await setup([req("open", { status: "pending" })]);
  for (const status of ["on_deck", "completed", "maybe", "expired", "reviewed"]) {
    const res = await call(e, "POST", { workspaceId: "w1", id: "open", status, decisions: yes });
    assert.equal(res.status, 403, status);
  }
  // Decisions in an asker's payload are ignored even on an allowed edit.
  const edit = await call(e, "POST", { workspaceId: "w1", id: "open", status: "sent", decisions: yes });
  assert.equal(edit.status, 200);
  const stored = (await readRequests(e)).find((r) => r.id === "open");
  assert.deepEqual(stored.decisions, []);
  assert.equal(stored.status, "sent");
});

test("a maybe can't be re-sent or re-worded by the asker", async () => {
  const e = await setup([req("m1", { status: "maybe", maybeAt: NOW })]);
  for (const body of [{ status: "sent" }, { categories: ["Kiss"] }, { note: "please?" }]) {
    const res = await call(e, "POST", { workspaceId: "w1", id: "m1", ...body });
    assert.equal(res.status, 409, JSON.stringify(body));
  }
  const stored = (await readRequests(e)).find((r) => r.id === "m1");
  assert.equal(stored.status, "maybe");
  assert.deepEqual(stored.categories, ["Massage"]);
});

test("the requester can set aside a rain-check suggestion; nothing is broadcast", async () => {
  const e = await setup([req("r1", {
    status: "reviewed",
    decisions: [{ label: "Massage", decision: "No", targetType: "act" }],
    reviewedAt: NOW,
    passNote: "next_week",
    rainCheckAt: new Date(Date.now() + 60 * 1000).toISOString(),
  })]);
  const res = await call(e, "PATCH", { id: "r1", action: "dismiss_rain_check", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const stored = (await readRequests(e)).find((r) => r.id === "r1");
  assert.ok(stored.rainCheckDismissedAt);
  const { readActivity } = await import("../../functions/api/_activity.js");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const items = ((await readActivity(e, "w1", PARTNER))?.items || []).filter((item) => item.entityId === "r1");
  assert.equal(items.length, 0);
});

async function getBoardAs(e, email) {
  e.APP_SESSION_SECRET = APP_SESSION_SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(APP_SESSION_SECRET, {
    sid: `test-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600,
  });
  return board({
    request: new Request("https://app.example.test/api/request-board?workspaceId=w1", {
      headers: { cookie: `sxs-session=${encodeURIComponent(token)}` },
    }),
    env: e,
  });
}

test("the asker's private bookkeeping (rain check set aside, nudge count) never reaches the reviewer", async () => {
  const e = await setup([req("r1", {
    status: "reviewed",
    decisions: [{ label: "Massage", decision: "No", targetType: "act" }],
    reviewedAt: NOW,
    reviewedByEmail: PARTNER,
    passNote: "next_week",
    rainCheckAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    lastReminderAt: NOW,
    reminderCount: 1,
  })]);
  const dismiss = await callAs(e, ME, "PATCH", { id: "r1", action: "dismiss_rain_check", workspaceId: "w1" });
  assert.equal(dismiss.status, 200);
  assert.ok((await dismiss.json()).request.rainCheckDismissedAt, "the asker still sees their own choice");

  const theirs = await (await getBoardAs(e, PARTNER)).json();
  for (const row of [...theirs.requests, ...theirs.activeRequests, ...theirs.history].filter((r) => r.id === "r1")) {
    assert.equal(row.rainCheckDismissedAt, undefined);
    assert.equal(row.lastReminderAt, undefined);
    assert.equal(row.reminderCount, undefined);
    assert.equal(row.rainCheckAt !== undefined, true, "the reviewer's own rain check stays visible");
  }
  const mine = await (await getBoardAs(e, ME)).json();
  const myRow = mine.requests.find((r) => r.id === "r1");
  assert.ok(myRow.rainCheckDismissedAt);
  assert.equal(myRow.reminderCount, 1);

  // A write response by the reviewer is projected for the reviewer too.
  const write = await callAs(e, PARTNER, "PATCH", { id: "r1", action: "archive", workspaceId: "w1" });
  const writeBody = await write.json();
  assert.equal(writeBody.request.rainCheckDismissedAt, undefined);
  assert.equal(writeBody.requests.find((r) => r.id === "r1").rainCheckDismissedAt, undefined);

  // The shared readers (Sexboard, bootstrap) project when given a viewer.
  const shared = await readRequestBoardForWorkspace(e, "w1", { workspaceIds: ["w1"], viewerEmail: PARTNER });
  assert.equal(shared.requests.find((r) => r.id === "r1").rainCheckDismissedAt, undefined);
  const serverSide = await readRequestBoardForWorkspace(e, "w1", { workspaceIds: ["w1"] });
  assert.ok(serverSide.requests.find((r) => r.id === "r1").rainCheckDismissedAt, "server-only readers see full rows");
});

test("one manual nudge per Ask, ever: not right after sending, not after a maybe, never twice", async () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const e = await setup([
    req("fresh", { status: "sent" }),
    req("old", { status: "sent", sentAt: fiveHoursAgo, createdAt: fiveHoursAgo }),
    req("maybe", { status: "maybe", sentAt: fiveHoursAgo, createdAt: fiveHoursAgo, maybeAt: NOW }),
  ]);
  const fresh = await call(e, "PATCH", { id: "fresh", action: "remind", workspaceId: "w1" });
  assert.equal(fresh.status, 409);
  assert.ok((await fresh.json()).availableAt);
  const maybe = await call(e, "PATCH", { id: "maybe", action: "remind", workspaceId: "w1" });
  assert.equal(maybe.status, 409);

  const first = await call(e, "PATCH", { id: "old", action: "remind", workspaceId: "w1" });
  assert.equal(first.status, 200);
  const second = await call(e, "PATCH", { id: "old", action: "remind", workspaceId: "w1" });
  assert.equal(second.status, 409);
  const stored = (await readRequests(e)).find((r) => r.id === "old");
  assert.equal(stored.reminderCount, 1);
});

test("reading the board never sends an automatic reminder", async () => {
  const dayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r1", { status: "sent", sentAt: dayAgo, createdAt: dayAgo, timing: "Next week" })]);
  const waits = [];
  const res = await board({
    request: new Request("http://localhost/api/request-board?workspaceId=w1", { method: "GET" }),
    env: e,
    waitUntil: (promise) => waits.push(promise),
  });
  assert.equal(res.status, 200);
  await Promise.all(waits);
  const stored = (await readRequests(e)).find((r) => r.id === "r1");
  assert.equal(stored.lastReminderAt, undefined);
  assert.equal(stored.reminderCount, undefined);
});

test("requester cannot use the direct reply action for their own sent request", async () => {
  const e = await setup([req("r1")]);
  const res = await call(e, "PATCH", {
    id: "r1",
    action: "reply",
    workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "Yes" }]
  });
  assert.equal(res.status, 403);
});

test("reviewer can mark a sent Ask as maybe; it stays repliable and stamps maybeAt not reviewedAt", async () => {
  const e = await setup([req("r1", {
    requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me",
  })]);

  const res = await call(e, "PATCH", { id: "r1", action: "maybe", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "maybe");
  assert.equal(body.request.maybeByEmail, ME);
  assert.ok(body.request.maybeAt);
  // A maybe is NOT a final answer — no reviewedAt/decisions, so it still reads
  // as unanswered and stays available to convert.
  assert.equal(body.request.reviewedAt, undefined);
  assert.deepEqual(body.request.decisions, []);
  // Still surfaced as active (not history).
  assert.equal(body.activeRequests.some((r) => r.id === "r1"), true);

  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").status, "maybe");
});

test("requester cannot mark their own Ask as maybe", async () => {
  const e = await setup([req("r1")]); // ME is requester, PARTNER reviewer
  const res = await call(e, "PATCH", { id: "r1", action: "maybe", workspaceId: "w1" });
  assert.equal(res.status, 403);
});

test("cannot mark an already-reviewed Ask as maybe", async () => {
  const e = await setup([req("r1", {
    requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me",
    status: "reviewed", reviewedByEmail: ME, reviewedAt: NOW,
    decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }],
  })]);
  const res = await call(e, "PATCH", { id: "r1", action: "maybe", workspaceId: "w1" });
  assert.equal(res.status, 409);
});

test("a maybe can be converted to a real answer via reply (Decide now)", async () => {
  const e = await setup([req("r1", {
    requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me",
    status: "maybe", maybeByEmail: ME, maybeAt: NOW,
  })]);

  const res = await call(e, "PATCH", {
    id: "r1", action: "reply", workspaceId: "w1",
    decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }],
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "reviewed");
  assert.equal(body.request.decisions[0].decision, "Yes");
  assert.equal(body.request.reviewedByEmail, ME);
});

test("GET expires a maybe once its timing window passes", async () => {
  const oldSentAt = "2026-04-01T06:30:00.000Z";
  const now = "2026-06-06T15:00:00.000Z";
  const e = await setup([req("r-maybe-old", {
    requesterEmail: PARTNER, reviewerEmail: ME, requester: "Partner", reviewer: "Me",
    status: "maybe", timing: "Tomorrow",
    sentAt: oldSentAt, createdAt: oldSentAt, updatedAt: "2026-06-06T14:00:00.000Z",
    maybeByEmail: ME, maybeAt: "2026-04-01T07:00:00.000Z",
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.some((r) => r.id === "r-maybe-old"), false);
    const expired = (await readRequests(e)).find((r) => r.id === "r-maybe-old");
    assert.equal(expired.status, "expired");
    assert.equal(expired.expiredReason, "unanswered_stale");
  } finally {
    mock.timers.reset();
  }
});

// THE core race: two different requests edited at once must both survive.
// Without the CAS coordinator, one blind write clobbers the other.
test("concurrent edits to different requests do NOT lose updates", async () => {
  const e = await setup([req("r1"), req("r2")]);

  const [a, b] = await Promise.all([
    call(e, "PATCH", { id: "r1", action: "archive", workspaceId: "w1" }),
    call(e, "PATCH", { id: "r2", action: "archive", workspaceId: "w1" }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);

  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").status, "archived");
  assert.equal(stored.find((r) => r.id === "r2").status, "archived", "both archives must persist");
});

test("auto-expire on GET expires an agreed request past its timing window", async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r1", {
    status: "on_deck",
    sentAt: threeDaysAgo,
    createdAt: threeDaysAgo,
    decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }],
  })]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  assert.equal(res.status, 200);

  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r1").status, "expired");
});

test("pending Tomorrow request stays active through its response grace", async () => {
  const twoNightsAgo = "2026-06-05T06:30:00.000Z"; // Jun 4 11:30pm Los Angeles
  const morningAfterTomorrow = "2026-06-06T15:00:00.000Z"; // Jun 6 8:00am Los Angeles
  const e = await setup([req("r-pending-tomorrow", {
    status: "pending",
    timing: "Tomorrow",
    sentAt: twoNightsAgo,
    createdAt: twoNightsAgo,
    updatedAt: twoNightsAgo,
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(morningAfterTomorrow) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.find((r) => r.id === "r-pending-tomorrow")?.status, "pending");

    const stored = await readRequests(e);
    assert.equal(stored.find((r) => r.id === "r-pending-tomorrow").status, "pending");
  } finally {
    mock.timers.reset();
  }
});

test("pending Tonight request expires by the next afternoon", async () => {
  const yesterdayAfternoon = "2026-06-07T23:52:00.000Z"; // Jun 7 4:52pm Los Angeles
  const nextMorning = "2026-06-08T15:00:00.000Z"; // Jun 8 8:00am Los Angeles
  const nextAfternoon = "2026-06-08T21:52:00.000Z"; // Jun 8 2:52pm Los Angeles
  const e = await setup([req("r-pending-tonight-next-day", {
    status: "pending",
    timing: "Tonight",
    sentAt: yesterdayAfternoon,
    createdAt: yesterdayAfternoon,
    updatedAt: yesterdayAfternoon,
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(nextMorning) });
  try {
    const morningRes = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(morningRes.status, 200);
    const morningBody = await morningRes.json();
    assert.equal(morningBody.activeRequests.find((r) => r.id === "r-pending-tonight-next-day")?.status, "pending");
  } finally {
    mock.timers.reset();
  }

  mock.timers.enable({ apis: ["Date"], now: new Date(nextAfternoon) });
  try {
    const afternoonRes = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(afternoonRes.status, 200);
    const afternoonBody = await afternoonRes.json();
    assert.equal(afternoonBody.activeRequests.some((r) => r.id === "r-pending-tonight-next-day"), false);
    assert.equal(afternoonBody.history.find((r) => r.id === "r-pending-tonight-next-day")?.expiredReason, "unanswered_stale");
  } finally {
    mock.timers.reset();
  }
});

test("GET expires an unanswered Tonight request after its response grace", async () => {
  const twoNightsAgo = "2026-06-05T06:30:00.000Z"; // Jun 4 11:30pm Los Angeles
  const twoDaysLater = "2026-06-07T15:00:00.000Z"; // Jun 7 8:00am Los Angeles
  const e = await setup([req("r-stale-tonight", {
    status: "pending",
    timing: "Tonight",
    sentAt: twoNightsAgo,
    createdAt: twoNightsAgo,
    updatedAt: twoNightsAgo,
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(twoDaysLater) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.some((r) => r.id === "r-stale-tonight"), false);
    assert.equal(body.history.find((r) => r.id === "r-stale-tonight")?.expiredReason, "unanswered_stale");

    const stored = await readRequests(e);
    const expired = stored.find((r) => r.id === "r-stale-tonight");
    assert.equal(expired.status, "expired");
    assert.equal(expired.expiredReason, "unanswered_stale");
  } finally {
    mock.timers.reset();
  }
});

test("GET restores a prematurely expired unanswered Tomorrow request", async () => {
  const twoNightsAgo = "2026-06-05T06:30:00.000Z"; // Jun 4 11:30pm Los Angeles
  const morningAfterTomorrow = "2026-06-06T15:00:00.000Z"; // Jun 6 8:00am Los Angeles
  const e = await setup([req("r-restore-pending", {
    status: "expired",
    timing: "Tomorrow",
    sentAt: twoNightsAgo,
    createdAt: twoNightsAgo,
    updatedAt: twoNightsAgo,
    expiredAt: morningAfterTomorrow,
    expiredReason: "timing_window_passed",
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(morningAfterTomorrow) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.find((r) => r.id === "r-restore-pending")?.status, "pending");
    assert.equal(body.history.some((r) => r.id === "r-restore-pending"), false);

    const stored = await readRequests(e);
    const restored = stored.find((r) => r.id === "r-restore-pending");
    assert.equal(restored.status, "pending");
    assert.equal(restored.expiredAt, undefined);
    assert.equal(restored.expiredReason, undefined);
  } finally {
    mock.timers.reset();
  }
});

test("GET does not restore an old unanswered expired request", async () => {
  const oldSentAt = "2026-04-01T06:30:00.000Z";
  const oldExpiredAt = "2026-04-03T07:00:00.000Z";
  const now = "2026-06-06T15:00:00.000Z";
  const e = await setup([req("r-old-expired", {
    status: "expired",
    timing: "Tomorrow",
    sentAt: oldSentAt,
    createdAt: oldSentAt,
    updatedAt: oldExpiredAt,
    expiredAt: oldExpiredAt,
    expiredReason: "timing_window_passed",
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.some((r) => r.id === "r-old-expired"), false);
    assert.equal(body.history.find((r) => r.id === "r-old-expired")?.status, "expired");

    const stored = await readRequests(e);
    assert.equal(stored.find((r) => r.id === "r-old-expired").status, "expired");
  } finally {
    mock.timers.reset();
  }
});

test("GET expires an old unanswered pending request as stale", async () => {
  const oldSentAt = "2026-04-01T06:30:00.000Z";
  const now = "2026-06-06T15:00:00.000Z";
  const e = await setup([req("r-old-pending", {
    status: "pending",
    timing: "Tomorrow",
    sentAt: oldSentAt,
    createdAt: oldSentAt,
    updatedAt: "2026-06-06T14:00:00.000Z",
  })]);

  mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  try {
    const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activeRequests.some((r) => r.id === "r-old-pending"), false);
    assert.equal(body.history.find((r) => r.id === "r-old-pending")?.expiredReason, "unanswered_stale");

    const stored = await readRequests(e);
    const expired = stored.find((r) => r.id === "r-old-pending");
    assert.equal(expired.status, "expired");
    assert.equal(expired.expiredReason, "unanswered_stale");
  } finally {
    mock.timers.reset();
  }
});

test("accepted Tomorrow timing counter stays active when it becomes tonight", async () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r-counter", {
    status: "on_deck",
    timing: "Tomorrow",
    sentAt: twoDaysAgo,
    createdAt: twoDaysAgo,
    reviewedAt: yesterday,
    counterAcceptedAt: yesterday,
    acceptedCounters: [{ label: "Tomorrow", targetType: "timing" }],
    acceptedTimingCounter: { label: "Tomorrow", targetType: "timing" },
  })]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "r-counter")?.status, "on_deck");
  assert.equal(body.history.some((r) => r.id === "r-counter"), false);

  const stored = await readRequests(e);
  assert.equal(stored.find((r) => r.id === "r-counter").status, "on_deck");
});

test("GET restores a previously expired accepted Tomorrow timing counter", async () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r-restore", {
    status: "expired",
    timing: "Tomorrow",
    sentAt: twoDaysAgo,
    createdAt: twoDaysAgo,
    reviewedAt: yesterday,
    counterAcceptedAt: yesterday,
    acceptedCounters: [{ label: "Tomorrow", targetType: "timing" }],
    acceptedTimingCounter: { label: "Tomorrow", targetType: "timing" },
    expiredAt: new Date().toISOString(),
    expiredReason: "timing_window_passed",
  })]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "r-restore")?.status, "on_deck");
  assert.equal(body.history.some((r) => r.id === "r-restore"), false);

  const stored = await readRequests(e);
  const restored = stored.find((r) => r.id === "r-restore");
  assert.equal(restored.status, "on_deck");
  assert.equal(restored.expiredAt, undefined);
  assert.equal(restored.expiredReason, undefined);
});

test("GET restores an encrypted accepted counter expired by the old tonight window", async () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const encryptedBox = {
    __sxsRoomEncrypted: true,
    version: "sxs-room-e2ee-v1",
    algorithm: "AES-GCM",
    iv: "aXY=",
    ciphertext: "Y291Y2gtaGVhZA==",
  };
  const e = await setup([req("r-encrypted-restore", {
    status: "expired",
    timing: "Tonight",
    sentAt: twoDaysAgo,
    createdAt: twoDaysAgo,
    reviewedAt: yesterday,
    counterAcceptedAt: yesterday,
    decisions: [{ label: "Encrypted content", decision: "Counter", targetType: "timing" }],
    encryptedReply: encryptedBox,
    expiredAt: new Date().toISOString(),
    expiredReason: "timing_window_passed",
  })]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "r-encrypted-restore")?.status, "on_deck");

  const stored = await readRequests(e);
  const restored = stored.find((r) => r.id === "r-encrypted-restore");
  assert.equal(restored.status, "on_deck");
  assert.equal(restored.expiredAt, undefined);
  assert.equal(restored.expiredReason, undefined);
});

test("participants can manually restore an expired Ask to Sexboard", async () => {
  const e = await setup([req("r-manual-restore", {
    status: "expired",
    expiredAt: new Date().toISOString(),
    expiredReason: "timing_window_passed",
  })]);

  const res = await call(e, "PATCH", { workspaceId: "w1", id: "r-manual-restore", action: "restore" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, "on_deck");
  assert.equal(body.request.expiredAt, undefined);
  assert.equal(body.activeRequests.find((r) => r.id === "r-manual-restore")?.status, "on_deck");
});

test("a manually restored Ask survives the next board read (does not re-expire)", async () => {
  // Regression: `restore` clears expiredAt and stamps restoredAt, but the timing
  // anchor ignored restoredAt — so an Ask whose ORIGINAL send is already past its
  // timing window re-expired on the very next GET (the restore button looked dead
  // for timing-expired Asks). A manual restore must open a fresh timing window.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r-restore-flap", {
    status: "expired",
    timing: "Tonight",
    sentAt: fiveDaysAgo,
    createdAt: fiveDaysAgo,
    reviewedAt: fiveDaysAgo,
    expiredAt: fiveDaysAgo,
    expiredReason: "timing_window_passed",
  })]);

  const restoreRes = await call(e, "PATCH", { workspaceId: "w1", id: "r-restore-flap", action: "restore" });
  assert.equal(restoreRes.status, 200);
  assert.equal((await restoreRes.json()).request.status, "on_deck");

  // The flap only surfaced on the NEXT board read, where timing expiry recomputes.
  const getRes = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  assert.equal(getRes.status, 200);
  const after = await getRes.json();
  assert.equal(
    after.activeRequests.find((r) => r.id === "r-restore-flap")?.status,
    "on_deck",
    "restored Ask must stay on_deck, not re-expire against its stale original anchor"
  );
  assert.equal(after.history.some((r) => r.id === "r-restore-flap"), false);

  const stored = await readRequests(e);
  const restored = stored.find((r) => r.id === "r-restore-flap");
  assert.equal(restored.status, "on_deck");
  assert.equal(restored.expiredAt, undefined);
});

test("a counter accepted after a manual restore keeps a coherent timing anchor", async () => {
  // accept_counter stamps restoredAt == counterAcceptedAt, so the later-of
  // anchor logic must never see the two disagree. Pin that invariant.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r-restore-then-counter", {
    status: "expired",
    timing: "Tomorrow",
    sentAt: threeDaysAgo,
    createdAt: threeDaysAgo,
    reviewedAt: threeDaysAgo,
    decisions: [{ label: "Massage", decision: "Counter", counter: "Slow massage", targetType: "act" }],
    counters: [{ label: "Massage", counter: "Slow massage", targetType: "act" }],
    expiredAt: threeDaysAgo,
    expiredReason: "timing_window_passed",
  })]);

  const restoreRes = await call(e, "PATCH", { workspaceId: "w1", id: "r-restore-then-counter", action: "restore" });
  assert.equal(restoreRes.status, 200);

  const acceptRes = await call(e, "PATCH", { workspaceId: "w1", id: "r-restore-then-counter", action: "accept_counter" });
  assert.equal(acceptRes.status, 200);
  const accepted = (await acceptRes.json()).request;
  assert.equal(accepted.status, "on_deck");
  assert.equal(accepted.restoredAt, accepted.counterAcceptedAt, "accept_counter must keep restoredAt == counterAcceptedAt");

  // Survives the next read with the fresh counter-accepted window.
  const getRes = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  const after = await getRes.json();
  assert.equal(after.activeRequests.find((r) => r.id === "r-restore-then-counter")?.status, "on_deck");
});

// --- Room-encrypted (E2EE) Asks: the timing field is a placeholder ---

// Shape accepted by cleanRoomEncryptedBox — content is opaque to the server.
const E2EE_BOX = {
  __sxsRoomEncrypted: true,
  version: "sxs-room-e2ee-v1",
  algorithm: "AES-GCM",
  iv: "aXZpdml2aXZpdg==",
  ciphertext: "Y2lwaGVydGV4dA==",
};

test("an unanswered E2EE Ask is not staled on the placeholder Tonight clock", async () => {
  // Regression: encrypted Asks always submit timing:"Tonight" (the real timing
  // is inside the encrypted payload). The next-day-noon unanswered fast path
  // must not fire on the placeholder — a real "Next week" Ask would die in a day.
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([req("r-e2ee-pending", {
    status: "pending",
    timing: "Tonight",
    categories: ["[Encrypted Ask]"],
    encryptedPayload: E2EE_BOX,
    sentAt: twoDaysAgo,
    createdAt: twoDaysAgo,
  })]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "r-e2ee-pending")?.status, "pending",
    "placeholder-timing E2EE Ask must not expire as unanswered_stale in a day");
});

test("a reviewed E2EE Ask gets the most generous timing window, then expires", async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([
    req("r-e2ee-fresh", {
      status: "on_deck",
      timing: "Tonight",
      categories: ["[Encrypted Ask]"],
      encryptedPayload: E2EE_BOX,
      sentAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      reviewedAt: threeDaysAgo,
    }),
    req("r-e2ee-old", {
      status: "on_deck",
      timing: "Tonight",
      categories: ["[Encrypted Ask]"],
      encryptedPayload: E2EE_BOX,
      sentAt: tenDaysAgo,
      createdAt: tenDaysAgo,
      reviewedAt: tenDaysAgo,
    }),
  ]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "r-e2ee-fresh")?.status, "on_deck",
    "3-day-old E2EE Ask survives (padded to the Next week window)");
  const old = body.history.find((r) => r.id === "r-e2ee-old");
  assert.equal(old?.status, "expired", "the padded window still ends — 10-day-old E2EE Ask expires");
});

// ── "Plan it" (match moment) ────────────────────────────────────────────────
const YES_ACT = { label: "Massage", decision: "Yes", targetType: "act" };
const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

test("either participant can plan an approved Ask; status is unchanged", async () => {
  const e = await setup([req("r1", { status: "on_deck", decisions: [YES_ACT] })]);
  const plannedFor = hoursFromNow(30);

  const res = await callAs(e, PARTNER, "PATCH", { id: "r1", action: "plan", plannedFor, workspaceId: "w1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.plannedFor, plannedFor);
  assert.equal(body.request.status, "on_deck");
  assert.equal(body.request.plannedByEmail, PARTNER);
  assert.ok(body.activeRequests.find((r) => r.id === "r1"), "a planned Ask stays on the active board");

  const stored = (await readRequests(e)).find((r) => r.id === "r1");
  assert.equal(stored.plannedFor, plannedFor);
  assert.equal(stored.status, "on_deck");
});

test("an empty plannedFor clears the plan", async () => {
  const e = await setup([req("r1", {
    status: "on_deck",
    decisions: [YES_ACT],
    plannedFor: hoursFromNow(20),
    plannedAt: NOW,
    plannedByEmail: ME,
    plannedByName: "Me",
  })]);
  const res = await call(e, "PATCH", { id: "r1", action: "plan", plannedFor: "", workspaceId: "w1" });
  assert.equal(res.status, 200);
  const stored = (await readRequests(e)).find((r) => r.id === "r1");
  assert.equal(stored.plannedFor, undefined);
  assert.equal(stored.plannedByEmail, undefined);
});

test("planning and clearing a plan each leave an audit row with the planned time only", async () => {
  const e = await setup([req("r1", { status: "on_deck", decisions: [YES_ACT] })]);
  const plannedFor = hoursFromNow(30);
  assert.equal((await callAs(e, PARTNER, "PATCH", { id: "r1", action: "plan", plannedFor, workspaceId: "w1" })).status, 200);
  assert.equal((await callAs(e, PARTNER, "PATCH", { id: "r1", action: "plan", plannedFor: "", workspaceId: "w1" })).status, 200);

  const audit = (await readKey(e, "sexualsync-audit", "workspace-w1")) || [];
  const [unplanned, planned] = audit.filter((row) => row.type === "request_planned" || row.type === "request_unplanned");
  assert.equal(planned?.type, "request_planned");
  assert.equal(planned.entityId, "r1");
  assert.equal(planned.actorEmail, PARTNER);
  assert.deepEqual(planned.metadata, { plannedFor });
  assert.equal(unplanned?.type, "request_unplanned");
  assert.deepEqual(unplanned.metadata, {}, "a cleared plan records no time");
});

test("only an approved Ask can be planned", async () => {
  const e = await setup([
    req("pending", { status: "sent" }),
    req("countered", {
      status: "reviewed",
      decisions: [{ label: "Massage", decision: "Counter", counter: "Kissing", targetType: "act" }],
    }),
  ]);
  const plannedFor = hoursFromNow(4);
  const pending = await call(e, "PATCH", { id: "pending", action: "plan", plannedFor, workspaceId: "w1" });
  const countered = await call(e, "PATCH", { id: "countered", action: "plan", plannedFor, workspaceId: "w1" });
  assert.equal(pending.status, 409);
  assert.equal(countered.status, 409);
  const stored = await readRequests(e);
  assert.ok(stored.every((r) => !r.plannedFor));
});

test("plan rejects garbage, far-future and past times", async () => {
  const e = await setup([req("r1", { status: "on_deck", decisions: [YES_ACT] })]);
  for (const plannedFor of ["not a date", hoursFromNow(24 * 90), hoursFromNow(-24)]) {
    const res = await call(e, "PATCH", { id: "r1", action: "plan", plannedFor, workspaceId: "w1" });
    assert.equal(res.status, 400, `expected 400 for ${plannedFor}`);
  }
  assert.equal((await readRequests(e)).find((r) => r.id === "r1").plannedFor, undefined);
});

test("a non-participant member cannot plan an Ask", async () => {
  const e = await setup(
    [req("r1", { status: "on_deck", decisions: [YES_ACT] })],
    [{ email: THIRD, role: "partner", status: "active", displayName: "Third" }],
  );
  const res = await callAs(e, THIRD, "PATCH", { id: "r1", action: "plan", plannedFor: hoursFromNow(5), workspaceId: "w1" });
  assert.equal(res.status, 403);
});

test("a plan keeps a Tonight Ask alive past its timing window until the planned day ends", async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const e = await setup([
    req("planned", {
      status: "on_deck",
      decisions: [YES_ACT],
      sentAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      plannedFor: hoursFromNow(48),
    }),
    req("unplanned", {
      status: "on_deck",
      decisions: [YES_ACT],
      sentAt: threeDaysAgo,
      createdAt: threeDaysAgo,
    }),
    req("plan-passed", {
      status: "on_deck",
      decisions: [YES_ACT],
      sentAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      plannedFor: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ]);

  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  const body = await res.json();
  assert.equal(body.activeRequests.find((r) => r.id === "planned")?.status, "on_deck");
  assert.equal(body.history.find((r) => r.id === "unplanned")?.status, "expired");
  assert.equal(body.history.find((r) => r.id === "plan-passed")?.status, "expired",
    "a plan only extends the window through its own day");
});

test("migrate drops an invalid stored plannedFor", async () => {
  const e = await setup([req("r1", { status: "on_deck", decisions: [YES_ACT], plannedFor: "soon-ish", plannedByEmail: ME })]);
  const res = await board({ request: new Request("http://localhost/api/request-board?workspaceId=w1"), env: e });
  const body = await res.json();
  const row = body.activeRequests.find((r) => r.id === "r1");
  assert.equal(row.plannedFor, undefined);
  assert.equal(row.plannedByEmail, undefined);
});

test("a yes reply reads warmly in activity (\"Partner said yes\"); a counter stays neutral", async () => {
  const { readActivity } = await import("../../functions/api/_activity.js");
  const { reviewActivityAction } = await import("../../functions/api/request-board.js");
  const e = await setup([req("y1", { reviewerEmail: PARTNER }), req("c1", { reviewerEmail: PARTNER })]);
  const yes = await callAs(e, PARTNER, "PATCH", { id: "y1", action: "reply", workspaceId: "w1", decisions: [{ label: "Massage", decision: "Yes", targetType: "act" }] });
  assert.equal(yes.status, 200);
  let items = [];
  for (let i = 0; i < 20 && !items.length; i += 1) {
    items = ((await readActivity(e, "w1", ME))?.items || []).filter((item) => item.entityId === "y1");
    if (!items.length) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(items[0]?.action, "said_yes");
  assert.match(items[0]?.label, /said yes$/);
  assert.equal(reviewActivityAction([{ label: "Massage", decision: "Counter", counter: "Kiss", targetType: "act" }]), "reviewed");
  assert.equal(reviewActivityAction([{ label: "Massage", decision: "Yes", targetType: "act" }, { label: "Kiss", decision: "No", targetType: "act" }]), "said_yes");
});
