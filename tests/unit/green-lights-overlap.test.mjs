// "Words I like" cards reveal only overlaps: the server never hands the client
// a partner's pass, mismatch, or note on those cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { overlapOnlyPartnerAnswers } from "../../functions/api/green-lights.js";

test("regular cards pass through untouched", () => {
  const out = overlapOnlyPartnerAnswers({ "am-happy": { value: "agree" } }, { "am-happy": { value: "disagree", note: "n" } });
  assert.deepEqual(out, { "am-happy": { value: "disagree", note: "n" } });
});

test("a word both said yes to is revealed, without notes", () => {
  const out = overlapOnlyPartnerAnswers({ "wd-call-good": { value: "yes" } }, { "wd-call-good": { value: "yes", note: "say it slow" } });
  assert.deepEqual(out, { "wd-call-good": { value: "yes" } });
});

test("a pass or a one-sided yes is never revealed", () => {
  const out = overlapOnlyPartnerAnswers(
    { "wd-a": { value: "yes" }, "wd-b": { value: "pass" }, "wd-c": { value: "yes" } },
    { "wd-a": { value: "pass" }, "wd-b": { value: "yes" } },
  );
  assert.deepEqual(out, {});
});
