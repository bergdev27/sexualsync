// Shared round rules for the double-blind deck games (Sex Quiz, Green Lights).
//
// A reveal is only as private as it is hard to game. Four rules keep a
// partner's answers from being probed out one card at a time:
//
//   1. Minimum batch. A submit must cover at least MIN_ROUND_ANSWERS cards, so
//      a one-card round can't turn the reveal into a yes/no oracle.
//   2. Answers freeze per round. Once a round has revealed, changing anything
//      (re-rating, topping up new cards, retaking) starts a NEW round, and the
//      new round only reveals after BOTH partners lock in again. A partner's
//      old submit never silently counts toward a reveal of someone else's
//      edited answers.
//   3. Cooldown. A new round can't reveal sooner than REVEAL_COOLDOWN_MS after
//      the previous reveal, so the same set can't be re-revealed in a tight
//      edit-and-diff loop.
//   4. Small edits need a fresh look (see SMALL_CHANGE_LIMIT below).
//
// Reveal time is derived, not stamped on read: it is the later of the last
// submit in this round and the previous reveal + cooldown. That keeps reads
// side-effect free and makes the cooldown hold even if the "revealed" state
// was never written back.
//
// Shared product code (Cloudflare + self-host): Web-standard only.

export const MIN_ROUND_ANSWERS = 10;
export const REVEAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function recordRound(record) {
  const round = Number(record?.round);
  return Number.isInteger(round) && round > 0 ? round : 1;
}

function entryRound(entry) {
  const round = Number(entry?.round);
  return Number.isInteger(round) && round > 0 ? round : 1;
}

// An entry counts toward the reveal only if it was submitted in THIS round.
export function entrySubmittedInRound(entry, record) {
  return Boolean(entry?.submittedAt) && entryRound(entry) === recordRound(record);
}

function timeOf(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

// Resolve the reveal state for `record` at `now`, given the required member
// emails. Returns a record with status "revealed" + revealedAt, or status
// "open" + revealOpensAt (empty unless both are in and the cooldown is running).
export function resolveRoundReveal(record, required, now) {
  if (!record || required.length < 2) return record;
  const entries = record.entries || {};
  const allIn = required.every((email) => entrySubmittedInRound(entries[email], record));
  if (!allIn) return { ...record, status: "open", revealedAt: "", revealOpensAt: "" };
  if (record.status === "revealed" && record.revealedAt) return { ...record, revealOpensAt: "" };
  const lastSubmit = Math.max(...required.map((email) => timeOf(entries[email]?.submittedAt)));
  const previous = timeOf(record.lastRevealedAt);
  const opensAt = Math.max(lastSubmit, previous ? previous + REVEAL_COOLDOWN_MS : 0);
  if (timeOf(now) < opensAt) {
    return { ...record, status: "open", revealedAt: "", revealOpensAt: new Date(opensAt).toISOString() };
  }
  return { ...record, status: "revealed", revealedAt: new Date(opensAt).toISOString(), revealOpensAt: "" };
}

// Start the next round from an already-resolved record. Only bumps when the
// current round has revealed; an unrevealed round stays open so a partner can
// still fix their own answers before anyone has seen anything. Every opt-in
// that depended on the old answers (full reveal / compare) is cleared, so both
// partners consent afresh to whatever they submit next.
//
// `signaturesOf(entry)` (optional) maps an entry to { cardId: comparable
// string }. When given, each partner's revealed answers are snapshotted so the
// next round can say how many of them changed (rule 4 below).
export function nextRoundFrom(record, signaturesOf) {
  if (record?.status !== "revealed") return record;
  const next = {
    ...record,
    round: recordRound(record) + 1,
    status: "open",
    lastRevealedAt: record.revealedAt || record.lastRevealedAt || "",
    revealedAt: "",
    revealOpensAt: "",
    fullReveal: {},
  };
  if (typeof signaturesOf === "function") {
    const snapshot = {};
    for (const [email, entry] of Object.entries(record.entries || {})) {
      snapshot[email] = signaturesOf(entry);
    }
    next.revealedSnapshot = snapshot;
  }
  return next;
}

//   4. Small edits need a fresh look. A round that differs from the last
//      reveal by only a handful of the other partner's answers is exactly the
//      shape of a probe (flip one card, keep the rest, watch the reveal). So
//      when you're asked into a new round you're told how many of their
//      answers changed, and if it's fewer than SMALL_CHANGE_LIMIT you can't
//      one-tap "keep mine": you go back through your own answers and lock in
//      again. A bigger change still shows its count before you confirm. This
//      is the least friction that stops a one-card probe from riding on a
//      reflexive tap; it can't stop a partner who changes many cards on
//      purpose, which the count makes visible instead.
export const SMALL_CHANGE_LIMIT = 5;

// Keep the stored snapshot to plain { email: { cardId: string } }.
export function cleanRevealedSnapshot(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [email, cards] of Object.entries(raw)) {
    if (!email || !cards || typeof cards !== "object") continue;
    const clean = {};
    for (const [cardId, sig] of Object.entries(cards)) {
      if (cardId && typeof sig === "string") clean[cardId.slice(0, 120)] = sig.slice(0, 80);
    }
    out[String(email).toLowerCase()] = clean;
  }
  return out;
}

// How many cards in `email`'s current answers differ from what they had at the
// last reveal (changed, added or dropped). null when there's no earlier reveal
// to compare with.
export function changedSinceReveal(record, email, signaturesOf) {
  const before = record?.revealedSnapshot?.[email];
  const entry = record?.entries?.[email];
  if (!before || !entry || typeof signaturesOf !== "function") return null;
  const now = signaturesOf(entry);
  const ids = new Set([...Object.keys(before), ...Object.keys(now)]);
  let changed = 0;
  for (const id of ids) if (before[id] !== now[id]) changed += 1;
  return changed;
}

// What the viewer is told when a new round is waiting on them: the partner's
// change count since the last reveal, and whether "keep my answers" is off the
// table (a small change). Only while the partner is in and the viewer isn't.
export function partnerChangeNotice(record, me, partnerEmail, signaturesOf) {
  const none = { partnerChangedCount: null, reanswerRequired: false };
  if (!record || recordRound(record) < 2 || !partnerEmail) return none;
  if (!entrySubmittedInRound(record.entries?.[partnerEmail], record)) return none;
  if (entrySubmittedInRound(record.entries?.[me], record)) return none;
  const count = changedSinceReveal(record, partnerEmail, signaturesOf);
  if (count === null) return none;
  return { partnerChangedCount: count, reanswerRequired: count > 0 && count < SMALL_CHANGE_LIMIT };
}
