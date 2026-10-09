"use client";

import { useEffect, useId, useRef } from "react";
import { AskHero } from "@/components/AskReplyCard";
import { splitActLabel } from "@/lib/act-label";
import { passOutcomeLine, passReassuranceFor, rainCheckWhen } from "@/lib/pass-reassurance";
import { planLabel } from "@/lib/plan-time";
import { useNow } from "@/lib/use-now";
import {
  activePlanDate,
  askStatusLabel,
  currentTimingLabel,
  replyDecisionLabel,
  requestCounterItems,
  requestedActDecisions,
  timingCopyForRequest,
  type AskViewer,
} from "@/lib/request-state";
import type { RequestRecord } from "@/lib/types";

/**
 * Read-only view of an Ask: one card with the Ask itself, then the reply
 * (labelled "Your reply" or "{partner}'s reply" from the viewer's side), with
 * any counter shown once, in human words.
 */
export default function AskSummaryCard({
  request,
  viewer,
  partnerName,
  when,
  autoFocus = false,
}: {
  request: RequestRecord;
  viewer: AskViewer;
  partnerName: string;
  when: string;
  autoFocus?: boolean;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useNow(60 * 1000);
  // A plan set on the match moment is the real time; the Ask's original
  // timing ("Tomorrow") only describes it until then.
  const planDate = activePlanDate(request, new Date(now));
  const mine = viewer === "requester";
  const status = askStatusLabel(request, { mine, partnerName });
  const actDecisions = requestedActDecisions(request);
  const counters = requestCounterItems(request);
  const actCounters = counters.filter((item) => item.targetType === "act");
  const timingCounter = counters.find((item) => item.targetType === "timing");
  const filmingCounter = counters.find((item) => item.targetType === "filming");
  const feedback = String(request.feedback || "").trim();
  const isMaybe = request.status === "maybe";
  const hasReply = actDecisions.length > 0 || counters.length > 0 || Boolean(feedback) || isMaybe;
  const replyHeading = mine ? `${partnerName}'s reply` : "Your reply";
  // One answer for every requested Act reads as one line, not the Acts again.
  const firstDecision = actDecisions[0]?.decision;
  const uniform = actDecisions.length > 0
    && actDecisions.length >= request.categories.length
    && actDecisions.every((item) => item.decision === firstDecision)
    && (firstDecision === "Yes" || firstDecision === "No");
  const many = actDecisions.length > 1;
  // A pass never reads as a bare "Passed." (research rec #2): it is for now,
  // owes no reason, and carries the reviewer's optional reassurance.
  const plainPass = uniform && firstDecision === "No" && counters.length === 0;
  const uniformVerdict = !uniform
    ? ""
    : firstDecision === "Yes"
      ? (many ? "Yes to all of it." : "Yes.")
      : passOutcomeLine(request, { mine, partnerName });
  const reassurance = plainPass ? passReassuranceFor(request.passNote) : null;
  const rainCheckDate = reassurance?.rainCheck && request.rainCheckAt ? new Date(request.rainCheckAt) : null;
  const withdrawn = Boolean(request.withdrawnAt) || (request.status === "archived" && Boolean(request.passedAt) && !plainPass);
  // Once a counter is accepted the Ask's own Acts/timing already reflect it.
  const originalTiming = request.counterAcceptedAt ? "" : currentTimingLabel(request).toLowerCase();

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const chipClass = status.tone === "yes" ? "chip chip-primary" : status.tone === "no" ? "chip chip-no" : "chip";

  return (
    <article className="reply-card reply-summary" aria-labelledby={headingId}>
      <AskHero
        headingId={headingId}
        headingRef={headingRef}
        kicker={mine ? `You asked ${partnerName}${when ? ` · ${when}` : ""}` : `From ${partnerName}${when ? ` · ${when}` : ""}`}
        heading={mine ? "You asked for" : `${partnerName} wanted`}
        categories={request.categories}
        chips={(
          <>
            <span className={chipClass} data-testid="ask-status">{status.label}</span>
            <span className="chip" data-testid="ask-timing-chip">{planDate ? planLabel(planDate, new Date(now)) : currentTimingLabel(request)}</span>
            <span className="chip">{request.filming === "Yes" ? "Filming ok" : "No filming"}</span>
          </>
        )}
        note={request.note}
        noteAuthor={mine ? "Your note" : `${partnerName}'s note`}
        limits={request.boundaryConflicts}
      />

      {hasReply && (
        <section className="reply-summary-reply" aria-labelledby={`${headingId}-reply`}>
          <h2 id={`${headingId}-reply`} className="reply-summary-title">{replyHeading}</h2>

          {isMaybe && (
            <p className="reply-summary-line">
              Maybe. {mine ? `${partnerName} is` : "You're"} deciding closer to {timingCopyForRequest(request)}.
            </p>
          )}

          {uniformVerdict && (
            <p className="reply-summary-verdict" data-testid="ask-reply-verdict">{uniformVerdict}</p>
          )}

          {reassurance && (!mine || reassurance.id === "love_asked") && (
            <figure className="reply-pass-figure" data-testid="ask-pass-quote">
              <blockquote className="reply-pass-quote">&ldquo;{reassurance.quote}&rdquo;</blockquote>
              <figcaption className="reply-note-label">{mine ? partnerName : "You added"}</figcaption>
            </figure>
          )}

          {rainCheckDate && !Number.isNaN(rainCheckDate.getTime()) && (
            <p className="reply-pass-rain" data-testid="ask-rain-check">
              {rainCheckDate.getTime() <= now
                ? (mine
                  ? `Rain check for ${rainCheckWhen(request)}. It's on Home now, and you decide.`
                  : `${partnerName} can bring it back now if they want to. Nothing is sent for you.`)
                : (mine
                  ? `Rain check for ${rainCheckWhen(request)}. It comes back to you on Home (${planLabel(rainCheckDate, new Date(now))}), and you decide.`
                  : `It comes back to ${partnerName} as a suggestion (${planLabel(rainCheckDate, new Date(now))}). Nothing is sent for you.`)}
            </p>
          )}

          {withdrawn && (
            <p className="reply-summary-line" data-testid="ask-withdrawn">
              Change of plans. It came off the Sexboard for both of you, and nothing is counted.
            </p>
          )}

          {actDecisions.length > 0 && !uniformVerdict && (
            <ul className="reply-summary-rows">
              {actDecisions.map((item, index) => {
                const { emoji, text } = splitActLabel(item.label);
                const word = replyDecisionLabel(item.decision);
                return (
                  <li key={`${item.label}-${index}`} className="reply-summary-row">
                    <span className="reply-summary-act">
                      {emoji && <span aria-hidden="true">{emoji}</span>}
                      <span>{text}</span>
                    </span>
                    <span className={item.decision === "Yes" ? "chip chip-primary" : item.decision === "No" ? "chip chip-no" : "chip"}>
                      {word}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {counters.length > 0 && (
            <div className="reply-summary-counter" data-testid="ask-counter">
              <h3 className="reply-summary-subtitle">
                {request.counterAcceptedAt ? "Counter, accepted" : "Countered with"}
              </h3>
              {actCounters.length > 0 && (
                <>
                  <ul className="reply-summary-rows" aria-label="Offered instead">
                    {actCounters.map((item, index) => {
                      const { emoji, text } = splitActLabel(item.label);
                      return (
                        <li key={`${item.label}-${index}`} className="reply-summary-row">
                          <span className="reply-summary-act">
                            {emoji && <span aria-hidden="true">{emoji}</span>}
                            <span>{text}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {timingCounter && (
                <p className="reply-summary-line">
                  {timingCounter.label}{originalTiming && originalTiming !== timingCounter.label.toLowerCase() ? ` instead of ${originalTiming}` : ""}
                </p>
              )}
              {filmingCounter && (
                <p className="reply-summary-line">Filming: {filmingCounter.label}</p>
              )}
            </div>
          )}

          {feedback && (
            <figure className="reply-note">
              <figcaption className="reply-note-label">{mine ? `${partnerName}'s note` : "Your note"}</figcaption>
              <blockquote className="reply-note-text">{feedback}</blockquote>
            </figure>
          )}
        </section>
      )}
    </article>
  );
}
