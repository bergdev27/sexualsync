"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import AskReplyCard, { type ReplyDecisionPayload, type ReplyKind } from "@/components/AskReplyCard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState, SkeletonList } from "@/components/States";
import { mutualAskHref } from "@/lib/activity";
import { announce } from "@/lib/announce";
import { combineBuiltInAndSavedActs } from "@/lib/built-in-acts";
import {
  ApiUnauthorizedError,
  createAct,
  getActs,
  resolveReviewToken,
  submitReviewToken,
} from "@/lib/api";
import "../ask-reply.css";
import type {
  Act,
  ReviewTokenRequest,
  ReviewTokenResolveResponse,
} from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unauthorized"; token: string }
  | { kind: "ready"; token: string; data: ReviewTokenResolveResponse; acts: Act[] }
  | { kind: "submitted"; request: ReviewTokenRequest; reply: ReplyKind; partnerName: string };

export default function ReviewPage() {
  return (
    <Suspense fallback={<ReviewShell><SkeletonList count={3} /></ReviewShell>}>
      <ReviewFlow />
    </Suspense>
  );
}

function ReviewFlow() {
  const params = useSearchParams();
  const token = (params.get("token") || params.get("review") || "").trim();
  return <ReviewFlowForToken key={token || "missing"} token={token} />;
}

function ReviewFlowForToken({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>(() => (
    token
      ? { kind: "loading" }
      : { kind: "error", message: "This reply link is missing its private token." }
  ));

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      return () => { cancelled = true; };
    }
    resolveReviewToken(token)
      .then(async (data) => {
        const actsRes = await getActs(data.workspace.id);
        if (!cancelled) {
          setState({
            kind: "ready",
            token,
            data,
            acts: combineBuiltInAndSavedActs(actsRes.acts, data.workspace.id),
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiUnauthorizedError) {
          setState({ kind: "unauthorized", token });
          return;
        }
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "This reply link could not be opened.",
        });
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state.kind === "loading") return <ReviewShell><SkeletonList count={3} /></ReviewShell>;

  if (state.kind === "unauthorized") {
    const returnTo = `/review?token=${encodeURIComponent(state.token)}`;
    const signInUrl = `/api/auth/google?${new URLSearchParams({ returnTo }).toString()}`;
    return (
      <ReviewShell title="Ask from your partner" subtitle="Sign in to answer this Ask.">
        <ErrorState
          title="Sign in to reply"
          body="Use the same account this Ask was sent to."
          action={<a href={signInUrl} className="btn-primary">Continue with Google</a>}
        />
      </ReviewShell>
    );
  }

  if (state.kind === "error") {
    return (
      <ReviewShell title="Ask details">
        <ErrorState
          title="Reply link unavailable"
          body={state.message}
          action={<Link href="/sexboard" className="btn-ghost">Open Sexboard</Link>}
        />
      </ReviewShell>
    );
  }

  if (state.kind === "submitted") {
    return (
      <ReviewShell focused>
        <div className="review-stage">
          <SubmittedResult request={state.request} reply={state.reply} partnerName={state.partnerName} />
        </div>
      </ReviewShell>
    );
  }

  const request = state.data.request;
  const closed = !["pending", "sent"].includes(request.status);
  if (closed) {
    return (
      <ReviewShell title="Reply to Ask">
        <div className="review-stage">
          <ErrorState
            title="Already answered"
            body="This Ask is no longer waiting for a reply."
            action={<Link href="/sexboard" className="btn-ghost">Open Sexboard</Link>}
          />
        </div>
      </ReviewShell>
    );
  }

  return (
    <ReviewShell focused>
      <ReviewForm
        token={state.token}
        data={state.data}
        initialActs={state.acts}
        onSubmitted={(answered, reply) => setState({
          kind: "submitted",
          request: answered,
          reply,
          partnerName: request.requesterName || "Your partner",
        })}
      />
    </ReviewShell>
  );
}

function ReviewShell({
  children,
  title = "Ask details",
  subtitle,
  focused = false,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  // The reply card (or its result) carries the page heading.
  focused?: boolean;
}) {
  return (
    <AppShell>
      <ScreenHeader
        back={{ href: "/sexboard", label: "Sexboard" }}
        showBrand={false}
        title={focused ? undefined : title}
        subtitle={focused ? undefined : subtitle}
      />
      {children}
    </AppShell>
  );
}

const SUBMITTED_COPY: Record<ReplyKind, string> = {
  yes: "You said yes. It's on.",
  pass: "You passed. No reason needed.",
  maybe: "Saved as a maybe.",
  counter: "Your counter is with them now.",
};

function SubmittedResult({
  request,
  reply,
  partnerName,
}: {
  request: ReviewTokenRequest;
  reply: ReplyKind;
  partnerName: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const body = `${SUBMITTED_COPY[reply]} ${partnerName} can open it from the Sexboard.`;
  // Focus reads the title; the explanation goes through the app's one polite
  // announcer rather than a second live region.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    announce(body);
  }, [body]);
  return (
    <section className="reply-result" data-testid="ask-reply-result">
      <h1 ref={headingRef} tabIndex={-1} className="reply-result-title">Reply sent</h1>
      <p className="reply-result-body">{body}</p>
      <div className="reply-result-actions">
        {reply === "yes" ? (
          <>
            <Link href={mutualAskHref(request.id, request.categories || [], "")} className="cta-primary pressable">
              See the match
            </Link>
            <Link href="/sexboard" className="btn-ghost w-full">Open Sexboard</Link>
          </>
        ) : (
          <Link href="/sexboard" className="cta-primary pressable">Open Sexboard</Link>
        )}
      </div>
    </section>
  );
}

function ReviewForm({
  token,
  data,
  initialActs,
  onSubmitted,
}: {
  token: string;
  data: ReviewTokenResolveResponse;
  initialActs: Act[];
  onSubmitted: (request: ReviewTokenRequest, reply: ReplyKind) => void;
}) {
  const request = data.request;
  const [acts, setActs] = useState(initialActs);
  const partnerName = request.requesterName || "Your partner";

  async function createCounterAct(label: string) {
    const result = await createAct({
      workspaceId: data.workspace.id,
      label,
      myComfort: "curious",
    });
    setActs(combineBuiltInAndSavedActs(result.acts, data.workspace.id));
    return result.act;
  }

  // Throws on failure so the card keeps the answer on screen with the error.
  // The private link is single-use: the server consumes it on success.
  async function submit(decisions: ReplyDecisionPayload[], note: string, kind: ReplyKind) {
    const result = await submitReviewToken({
      token,
      workspaceId: data.workspace.id,
      decisions,
      note,
    });
    if (navigator.vibrate) navigator.vibrate(8);
    onSubmitted(result.request, kind);
  }

  return (
    <div className="review-stage reply-stage">
      <AskReplyCard
        partnerName={partnerName}
        kicker={`From ${partnerName} · private reply link`}
        categories={request.categories}
        timing={request.timing}
        filming={request.filming}
        note={request.note}
        acts={acts}
        // The reply link answers once; deferring needs the signed-in Ask view.
        allowMaybe={false}
        onCreateAct={createCounterAct}
        onSubmit={submit}
      />
    </div>
  );
}
