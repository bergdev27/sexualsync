// Double-blind hardening: one test per probe vector a partner could use to read
// the other's answers (or their "no"s) out of a reveal game, plus Health's
// opt-in counts. Drives the REAL handlers for both partners.
//
// Vectors covered:
//   - single-card / tiny rounds (minimum batch)                 quiz, GL, Pile
//   - edit-and-diff after a reveal (answers frozen per round)    quiz, GL
//   - rapid re-reveal of the same set (cooldown)                 quiz, GL
//   - "partner answered at" timestamps                           quiz, GL, Blind Reveal
//   - non-match leaks (scores, counts, partner misses)           quiz, GL, Pile
//   - Health volume without consent, withdrawn Asks, plans       Health

import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest as quizRequest, publicQuiz } from "../../functions/api/sex-quiz.js";
import { onRequest as glRequest } from "../../functions/api/green-lights.js";
import { onRequest as healthRequest, buildResponse as buildHealthResponse, sourceEventsFromRequests } from "../../functions/api/dashboard/health.js";
import { onRequest as profileRequest } from "../../functions/api/profile.js";
import { publicReveal } from "../../functions/api/blind-reveals.js";
import { MIN_ROUND_ANSWERS, REVEAL_COOLDOWN_MS } from "../../functions/api/_reveal_round.js";
import { mutatePlatformState } from "../../functions/api/_workspaces.js";
import { mutateKey, readKey } from "../../functions/api/_state.js";
import { makeSessionToken, makeStateEnv } from "./helpers.mjs";

const ME = "me@example.test";
const PARTNER = "jordan@example.test";
const WS = "w1";
const SECRET = "reveal-hardening-test-secret-1234567890";
const QUIZ_STORE = "sexualsync-sex-quiz";
const GL_STORE = "sexualsync-green-lights";
const QUIZ_KEY = `sexQuiz:${WS}`;
const GL_KEY = `greenLights:${WS}`;

const member = (email, role, displayName) => ({ email, role, status: "active", displayName });
const COUPLE = [member(ME, "owner", "Me"), member(PARTNER, "partner", "Jordan")];
const workspace = { id: WS, name: "Room", displayName: "Room", status: "active", productMode: "couples", members: COUPLE, settings: {} };

async function setup() {
  const e = makeStateEnv();
  e.APP_SESSION_SECRET = SECRET;
  e.PUBLIC_SIGNUPS_OPEN = "1";
  await mutatePlatformState(e, () => ({
    profiles: COUPLE.map((m, i) => ({ id: `p${i + 1}`, email: m.email, displayName: m.displayName, settings: {} })),
    workspaces: [workspace],
    invites: [],
  }));
  return e;
}

async function cookieFor(email) {
  const now = Math.floor(Date.now() / 1000);
  const token = await makeSessionToken(SECRET, { sid: `t-${email}`, provider: "email", email, name: email, iat: now, exp: now + 3600 });
  return `sxs-session=${encodeURIComponent(token)}`;
}

async function call(handler, e, email, { method = "POST", path = "/api/game", body } = {}) {
  const res = await handler({
    request: new Request(`https://app.example.test${path}${method === "GET" ? `?workspaceId=${WS}` : ""}`, {
      method,
      headers: { "content-type": "application/json", cookie: await cookieFor(email) },
      ...(body ? { body: JSON.stringify({ workspaceId: WS, ...body }) } : {}),
    }),
    env: e,
  });
  return { status: res.status, body: await res.json() };
}

// A full-size quiz round: `into` on the listed cards, pass on the rest.
function quizRatings(intoIds, total = MIN_ROUND_ANSWERS + 2) {
  const ratings = {};
  for (let i = 0; i < total; i += 1) ratings[`card${i}`] = { interest: intoIds.includes(`card${i}`) ? "into" : "pass" };
  return ratings;
}
function glAnswers(overrides = {}, total = MIN_ROUND_ANSWERS + 2) {
  const answers = {};
  for (let i = 0; i < total; i += 1) answers[`q${i}`] = { value: "good" };
  return { ...answers, ...overrides };
}

// Pretend the last reveal happened long enough ago that the cooldown is over.
async function expireCooldown(e, store, key) {
  await mutateKey(e, store, key, (current) => ({
    value: { ...current, lastRevealedAt: new Date(Date.now() - REVEAL_COOLDOWN_MS - 60_000).toISOString() },
  }));
}

// ---------- Sex Quiz ----------

test("quiz: a round smaller than the minimum batch is refused", async () => {
  const e = await setup();
  const one = await call(quizRequest, e, ME, { body: { action: "submit", ratings: { card0: { interest: "into" } } } });
  assert.equal(one.status, 400, "a single-card round would be a yes/no oracle");
  const short = await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings([], MIN_ROUND_ANSWERS - 1) } });
  assert.equal(short.status, 400);
  const ok = await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings([]) } });
  assert.equal(ok.status, 200);
});

test("quiz: no score and no partner timestamps in any view", async () => {
  const e = await setup();
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  const blind = await call(quizRequest, e, ME, { method: "GET" });
  for (const field of ["syncScore", "updatedAt", "revealedAt"]) assert.equal(field in blind.body, false, `${field} not exposed`);
  assert.equal(blind.body.mySubmittedAt, "", "nothing about when the partner answered");
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card1", "card2"]) } });
  const open = await call(quizRequest, e, ME, { method: "GET" });
  assert.equal(open.body.status, "revealed");
  assert.deepEqual(open.body.matches.map((m) => m.cardId), ["card1"]);
  for (const field of ["syncScore", "updatedAt", "revealedAt"]) assert.equal(field in open.body, false, `${field} not exposed after reveal`);
  assert.ok(!JSON.stringify(open.body).includes(open.body.partnerName ? "jordan@example.test" : "@@"), "no partner email in the payload");
});

test("quiz: editing after a reveal freezes the old round and needs both to lock in again", async () => {
  const e = await setup();
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  assert.equal((await call(quizRequest, e, ME, { method: "GET" })).body.status, "revealed");

  // Probe: flip one card and re-submit, hoping the partner's old answers
  // re-reveal against the new set immediately.
  const probe = await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card1", "card2"]) } });
  assert.equal(probe.body.status, "open", "a new round, not an instant re-reveal");
  assert.equal(probe.body.partnerSubmitted, false, "the partner's old submit does not count for the new round");
  assert.deepEqual(probe.body.matches, [], "nothing new is revealed");

  // The partner keeps their answers as a draft and can re-confirm them.
  const partnerSeat = await call(quizRequest, e, PARTNER, { method: "GET" });
  assert.equal(partnerSeat.body.mySubmitted, false);
  assert.equal(Object.keys(partnerSeat.body.myRatings).length, MIN_ROUND_ANSWERS + 2, "their answers are kept for them");

  // A one-card change can't ride on a one-tap "keep mine": the partner is told
  // and goes back through their answers.
  assert.equal(partnerSeat.body.partnerChangedCount, 1);
  assert.equal(partnerSeat.body.reanswerRequired, true);
  const keep = await call(quizRequest, e, PARTNER, { body: { action: "confirm" } });
  assert.equal(keep.status, 409);
  assert.equal(keep.body.mySubmitted, false);

  // Both in again, but inside the cooldown: still closed, with an opening time.
  const confirmed = await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: partnerSeat.body.myRatings } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "open", "cooldown holds the re-reveal");
  assert.ok(confirmed.body.revealOpensAt, "says when it opens");
  assert.deepEqual(confirmed.body.matches, []);

  // After the cooldown the new round reveals.
  await expireCooldown(e, QUIZ_STORE, QUIZ_KEY);
  const later = await call(quizRequest, e, ME, { method: "GET" });
  assert.equal(later.body.status, "revealed");
  assert.deepEqual(later.body.matches.map((m) => m.cardId), ["card1"]);
});

test("quiz: retake after a reveal also starts a fresh round and resets full-deck consent", async () => {
  const e = await setup();
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  await call(quizRequest, e, ME, { body: { action: "full_reveal", on: true } });
  await call(quizRequest, e, PARTNER, { body: { action: "full_reveal", on: true } });
  assert.ok((await call(quizRequest, e, ME, { method: "GET" })).body.partnerRatings, "mutual opt-in opens the deck");

  await call(quizRequest, e, ME, { body: { action: "retake" } });
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card3"]) } });
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  await expireCooldown(e, QUIZ_STORE, QUIZ_KEY);
  const view = await call(quizRequest, e, ME, { method: "GET" });
  assert.equal(view.body.status, "revealed");
  assert.equal(view.body.partnerRatings, null, "full-deck consent does not carry into a new round");
  const stored = await readKey(e, QUIZ_STORE, QUIZ_KEY);
  assert.equal(publicQuiz(stored, workspace, ME).fullRevealOpen, false);
});

test("quiz: one partner's full-deck opt-in is invisible to the other until it's mutual", async () => {
  const e = await setup();
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: quizRatings(["card1"]) } });
  const before = await call(quizRequest, e, PARTNER, { method: "GET" });
  await call(quizRequest, e, ME, { body: { action: "full_reveal", on: true } });
  const after = await call(quizRequest, e, PARTNER, { method: "GET" });
  assert.equal("fullRevealPartner" in after.body, false, "no partner opt-in field at all");
  assert.equal(after.body.fullRevealOpen, false);
  assert.deepEqual(after.body, before.body, "the partner's view is byte-identical before and after my opt-in");
  // Mutual: open for both, and the full deck comes with it.
  const open = await call(quizRequest, e, PARTNER, { body: { action: "full_reveal", on: true } });
  assert.equal(open.body.fullRevealOpen, true);
  assert.ok(open.body.partnerRatings);
  assert.equal((await call(quizRequest, e, ME, { method: "GET" })).body.fullRevealOpen, true);
});

// ---------- Green Lights ----------

test("GL: minimum batch, and the reveal returns agreements only", async () => {
  const e = await setup();
  const one = await call(glRequest, e, ME, { body: { action: "submit", answers: { q0: { value: "no" } } } });
  assert.equal(one.status, 400, "a one-card round is refused");

  await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers({ q1: { value: "no" }, q2: { value: "depends" } }) } });
  const res = await call(glRequest, e, PARTNER, { body: { action: "submit", answers: glAnswers({ q1: { value: "good", note: "private why" }, q2: { value: "depends" } }) } });
  assert.equal(res.body.status, "revealed");
  const mine = await call(glRequest, e, ME, { method: "GET" });
  assert.equal(mine.body.partnerAnswers.q1, undefined, "a difference is not sent");
  assert.ok(!JSON.stringify(mine.body).includes("private why"), "a note on a differing answer stays private");
  assert.deepEqual(mine.body.partnerAnswers.q2, { value: "depends" }, "a shared answer is sent");
  for (const field of ["syncScore", "updatedAt", "revealedAt", "comparePartner"]) assert.equal(field in mine.body, false, `${field} not exposed`);
  assert.equal(mine.body.compareOpen, false);
});

test("GL: the differences open only when BOTH opt in to compare", async () => {
  const e = await setup();
  await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers({ q1: { value: "no" } }) } });
  await call(glRequest, e, PARTNER, { body: { action: "submit", answers: glAnswers({ q1: { value: "good" } }) } });

  const meIn = await call(glRequest, e, ME, { body: { action: "compare", on: true } });
  assert.equal(meIn.body.compareMine, true);
  assert.equal(meIn.body.compareOpen, false, "one opt-in opens nothing");
  assert.equal(meIn.body.partnerAnswers.q1, undefined);
  // The partner cannot tell whether I opted in (no visible yes/no either way).
  const partnerSeat = await call(glRequest, e, PARTNER, { method: "GET" });
  assert.equal(partnerSeat.body.compareOpen, false);
  assert.equal("comparePartner" in partnerSeat.body, false);

  await call(glRequest, e, PARTNER, { body: { action: "compare", on: true } });
  const open = await call(glRequest, e, ME, { method: "GET" });
  assert.equal(open.body.compareOpen, true);
  assert.deepEqual(open.body.partnerAnswers.q1, { value: "good" }, "now the difference is visible to both");
});

test("GL: editing after a reveal starts a new round with a cooldown", async () => {
  const e = await setup();
  await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers() } });
  await call(glRequest, e, PARTNER, { body: { action: "submit", answers: glAnswers() } });
  const probe = await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers({ q3: { value: "no" } }) } });
  assert.equal(probe.body.status, "open");
  assert.deepEqual(probe.body.partnerAnswers, {}, "nothing reveals against the edited set");
  assert.equal((await call(glRequest, e, PARTNER, { body: { action: "confirm" } })).status, 409, "a one-card change needs a fresh look");
  const confirmed = await call(glRequest, e, PARTNER, { body: { action: "submit", answers: glAnswers() } });
  assert.equal(confirmed.body.status, "open");
  assert.ok(confirmed.body.revealOpensAt);
  await expireCooldown(e, GL_STORE, GL_KEY);
  const later = await call(glRequest, e, ME, { method: "GET" });
  assert.equal(later.body.status, "revealed");
  assert.equal(later.body.partnerAnswers.q3, undefined, "the changed card is a difference, so it stays private");
});

test("GL: a single-card probe can't ride a one-tap confirm; a bigger change shows its count", async () => {
  const e = await setup();
  const mine = glAnswers({ q0: { value: "no" } });
  const theirs = glAnswers({ q0: { value: "yes" } });
  await call(glRequest, e, ME, { body: { action: "submit", answers: mine } });
  await call(glRequest, e, PARTNER, { body: { action: "submit", answers: theirs } });

  // The probe: flip ONLY q0 and resubmit.
  await call(glRequest, e, ME, { body: { action: "submit", answers: { ...mine, q0: { value: "yes" } } } });
  const seat = await call(glRequest, e, PARTNER, { method: "GET" });
  assert.equal(seat.body.partnerChangedCount, 1, "told how many of their answers changed");
  assert.equal(seat.body.reanswerRequired, true);
  const mineView = await call(glRequest, e, ME, { method: "GET" });
  assert.equal(mineView.body.partnerChangedCount, null, "the prober's own view says nothing");
  const keep = await call(glRequest, e, PARTNER, { body: { action: "confirm" } });
  assert.equal(keep.status, 409);
  assert.match(keep.body.error, /Look over yours/);
  assert.equal((await readKey(e, GL_STORE, GL_KEY)).entries[PARTNER].round, 1, "no lock-in was recorded");

  // A change of SMALL_CHANGE_LIMIT or more still shows its count, and keeping
  // your answers stays one tap.
  const e2 = await setup();
  await call(glRequest, e2, ME, { body: { action: "submit", answers: glAnswers() } });
  await call(glRequest, e2, PARTNER, { body: { action: "submit", answers: glAnswers() } });
  const many = glAnswers({ q0: { value: "no" }, q1: { value: "no" }, q2: { value: "no" }, q3: { value: "no" }, q4: { value: "no" } });
  await call(glRequest, e2, ME, { body: { action: "submit", answers: many } });
  const seat2 = await call(glRequest, e2, PARTNER, { method: "GET" });
  assert.equal(seat2.body.partnerChangedCount, 5);
  assert.equal(seat2.body.reanswerRequired, false);
  assert.equal((await call(glRequest, e2, PARTNER, { body: { action: "confirm" } })).status, 200);

  // Re-submitting the same answers (no change) can be kept with one tap too.
  const e3 = await setup();
  await call(glRequest, e3, ME, { body: { action: "submit", answers: glAnswers() } });
  await call(glRequest, e3, PARTNER, { body: { action: "submit", answers: glAnswers() } });
  await call(glRequest, e3, ME, { body: { action: "submit", answers: glAnswers() } });
  const seat3 = await call(glRequest, e3, PARTNER, { method: "GET" });
  assert.equal(seat3.body.partnerChangedCount, 0);
  assert.equal((await call(glRequest, e3, PARTNER, { body: { action: "confirm" } })).status, 200);
});

test("quiz: a role-only flip counts as a change and needs a fresh look", async () => {
  const e = await setup();
  const base = quizRatings(["card1"]);
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: base } });
  await call(quizRequest, e, PARTNER, { body: { action: "submit", ratings: base } });
  await call(quizRequest, e, ME, { body: { action: "submit", ratings: { ...base, card1: { interest: "into", role: "give" } } } });
  const seat = await call(quizRequest, e, PARTNER, { method: "GET" });
  assert.equal(seat.body.partnerChangedCount, 1);
  assert.equal(seat.body.reanswerRequired, true);
  assert.equal((await call(quizRequest, e, PARTNER, { body: { action: "confirm" } })).status, 409);
});

test("GL: Words I like stay overlap-only, with or without compare", async () => {
  const e = await setup();
  const words = (mine) => mine
    ? {
      "wd-call-baby": { value: "yes", note: "mine" },
      "wd-call-slut": { value: "yes" },
      "wd-use-beg": { value: "pass" },
      "wd-use-names": { value: "pass" },
    }
    : {
      "wd-call-baby": { value: "yes", note: "say it slow" },
      "wd-call-slut": { value: "pass" },
      "wd-use-beg": { value: "pass" },
      "wd-use-names": { value: "yes" },
    };
  await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers({ q1: { value: "no" }, ...words(true) }) } });
  await call(glRequest, e, PARTNER, { body: { action: "submit", answers: glAnswers({ q1: { value: "good" }, ...words(false) }) } });

  const wordKeys = (answers) => Object.keys(answers).filter((id) => id.startsWith("wd-")).sort();
  const before = await call(glRequest, e, ME, { method: "GET" });
  assert.equal(before.body.status, "revealed");
  assert.deepEqual(wordKeys(before.body.partnerAnswers), ["wd-call-baby"], "only the shared yes; two passes are not an agreement to reveal");
  assert.deepEqual(before.body.partnerAnswers["wd-call-baby"], { value: "yes" }, "no note on a word card");

  await call(glRequest, e, ME, { body: { action: "compare", on: true } });
  await call(glRequest, e, PARTNER, { body: { action: "compare", on: true } });
  for (const seat of [ME, PARTNER]) {
    const open = await call(glRequest, e, seat, { method: "GET" });
    assert.equal(open.body.compareOpen, true);
    assert.ok(open.body.partnerAnswers.q1, "compare opens the regular differences");
    assert.deepEqual(wordKeys(open.body.partnerAnswers), ["wd-call-baby"], "compare never opens a word pass or a one-sided yes");
    assert.deepEqual(open.body.partnerAnswers["wd-call-baby"], { value: "yes" });
  }
});

test("GL: Words I like count toward the round minimum like any answered card", async () => {
  const e = await setup();
  const words = { "wd-call-baby": { value: "yes" }, "wd-use-beg": { value: "pass" } };
  const short = await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers(words, MIN_ROUND_ANSWERS - 3) } });
  assert.equal(short.status, 400, "one card short of the minimum");
  const enough = await call(glRequest, e, ME, { body: { action: "submit", answers: glAnswers(words, MIN_ROUND_ANSWERS - 2) } });
  assert.equal(enough.status, 200, "word cards fill out the minimum batch");
  assert.equal(enough.body.mySubmitted, true);
});

// ---------- Blind Reveal ----------

test("Blind Reveal: no partner answer timestamps before or after the reveal", () => {
  const base = {
    id: "b1", workspaceId: WS, prompt: "Tell me one thing", createdByEmail: ME,
    createdAt: "2026-05-23T00:00:00.000Z", updatedAt: "2026-05-23T00:30:00.000Z", revealedAt: "", archivedAt: "",
  };
  const partnerEntry = { email: PARTNER, name: "Jordan", text: "Theirs", createdAt: "2026-05-23T00:30:00.000Z", updatedAt: "2026-05-23T00:30:00.000Z" };
  const open = publicReveal({ ...base, status: "open", entries: { [PARTNER]: partnerEntry } }, workspace, ME);
  assert.notEqual(open.updatedAt, "2026-05-23T00:30:00.000Z", "the partner's submit time does not show through updatedAt");
  assert.equal(open.partnerSubmitted, true, "only the fact they answered, which the reveal needs");
  const mineEntry = { email: ME, name: "Me", text: "Mine", createdAt: "2026-05-23T00:10:00.000Z", updatedAt: "2026-05-23T00:10:00.000Z" };
  const revealed = publicReveal({ ...base, status: "revealed", revealedAt: "2026-05-23T00:30:00.000Z", entries: { [ME]: mineEntry, [PARTNER]: partnerEntry } }, workspace, ME);
  const theirs = revealed.entries.find((entry) => entry.email === PARTNER);
  assert.equal("createdAt" in theirs || "updatedAt" in theirs, false, "partner entry has no timestamps");
  const own = revealed.entries.find((entry) => entry.email === ME);
  assert.equal(own.updatedAt, "2026-05-23T00:10:00.000Z", "my own entry keeps its time");
});

// ---------- Health ----------

function approved(id, extra = {}) {
  const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id, workspaceId: WS, status: "reviewed", requesterEmail: ME, requesterName: "Me", reviewerName: "Jordan",
    decisions: [{ label: "Kiss", decision: "Yes" }, { label: "Massage", decision: "Yes" }],
    createdAt: at, updatedAt: at, reviewedAt: at, ...extra,
  };
}

test("Health: moments by default, no volume, no days-since, no who-asked-more", async () => {
  const e = await setup();
  const res = await call(healthRequest, e, ME, { method: "GET", path: "/api/dashboard/health" });
  assert.equal(res.status, 200);
  assert.equal(res.body.showCounts, false);
  for (const field of ["totals", "rhythm", "topActs", "insights"]) assert.equal(field in res.body, false, `${field} hidden until opted in`);
  assert.ok(Array.isArray(res.body.events) && Array.isArray(res.body.keepsShowingUp) && Array.isArray(res.body.firsts));
  assert.ok(!JSON.stringify(res.body).includes("daysSince"), "no days-since anywhere");
});

test("Health: counts are a private per-person opt-in", async () => {
  const e = await setup();
  const turnOn = await call(profileRequest, e, ME, { path: "/api/profile", body: { action: "update_profile", healthShowCounts: true } });
  assert.equal(turnOn.status, 200);
  const mine = await call(healthRequest, e, ME, { method: "GET", path: "/api/dashboard/health" });
  assert.equal(mine.body.showCounts, true);
  assert.ok(mine.body.totals && Array.isArray(mine.body.rhythm), "I opted in, I see counts");
  const theirs = await call(healthRequest, e, PARTNER, { method: "GET", path: "/api/dashboard/health" });
  assert.equal(theirs.body.showCounts, false, "my choice does not turn counts on for my partner");
  assert.equal("totals" in theirs.body, false);
  const partnerProfile = await call(profileRequest, e, PARTNER, { method: "GET", path: "/api/profile" });
  assert.ok(!JSON.stringify(partnerProfile.body).includes("healthShowCounts\":true"), "my setting is not visible from the partner's profile");
});

test("Health: withdrawn or cleared Asks and future plans never count", () => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const range = { id: "all", label: "All time", days: null, from: "", to: new Date().toISOString() };
  const requests = [
    approved("a1"),
    approved("a2", { withdrawnAt: past }),
    approved("a3", { status: "withdrawn" }),
    approved("a4", { clearedAt: past }),
    approved("a5", { plannedFor: future }),
    approved("a6", { plannedFor: past }),
    // The legacy stamp for a withdrawal: passedAt on an archived Ask.
    approved("a7", { status: "archived", passedAt: past }),
  ];
  const body = buildHealthResponse(WS, range, sourceEventsFromRequests({ requests }), new Map(), { showCounts: true });
  assert.deepEqual(body.events.map((event) => event.sourceId).sort(), ["a1", "a6"], "only consented Asks whose time has come count");
  assert.equal(body.totals.sexEvents, 2);
  assert.deepEqual(body.keepsShowingUp.map((act) => act.label).sort(), ["Kiss", "Massage"], "acts that came back, by name only");
  assert.equal("count" in body.keepsShowingUp[0], false);
});
