"use client";

import { useEffect, useId, useRef } from "react";
import { AskHero } from "@/components/AskReplyCard";
import { splitActLabel } from "@/lib/act-label";
import {
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
  const uniformVerdict = !uniform
    ? ""
    : firstDecision === "Yes"
      ? (many ? "Yes to all of it." : "Yes.")
      : (many ? "Passed on all of it." : "Passed.");
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
            <span className="chip">{currentTimingLabel(request)}</span>
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
