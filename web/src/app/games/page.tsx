"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState, LoadErrorState } from "@/components/States";
import {
  ApiUnauthorizedError,
  getBlindReveal,
  getGreenLights,
  getPile,
  getSexQuiz,
} from "@/lib/api";
import { getProfileCached } from "@/lib/profile-cache";
import { ACTIVITY_SUMMARY_EVENT, ACTIVITY_SUMMARY_KEY, type ActivitySummary } from "@/lib/activity";
import { fallbackPromptForToday } from "@/lib/inspiration-prompts";
import { computeGreenLightsReveal, GREEN_LIGHT_DECK } from "@/lib/green-lights-deck";
import { QUIZ_DECK } from "@/lib/quiz-deck";
import { loadRunnerDraft } from "@/lib/runner-draft";
import { partnerOf } from "@/lib/workspace";
import { getCachedResource, setCachedResource, useColdStart } from "@/lib/resource-cache";
import { useRecoverOnReconnect } from "@/lib/network-status";
import { useLiveRoomReload } from "@/lib/use-live-room";
import type {
  AuthInfo,
  BlindReveal,
  GreenLightsResponse,
  PileView,
  ProfileResponse,
  SexQuizResponse,
  Workspace,
} from "@/lib/types";
import "./games.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string; error?: unknown }
  | { kind: "unauthorized" }
  | { kind: "no-workspace"; auth: AuthInfo }
  | {
      kind: "ready";
      auth: AuthInfo;
      workspace: Workspace;
      pile: PileView | null;
      blindReveal: BlindReveal | null;
      quiz: SexQuizResponse | null;
      greenLights: GreenLightsResponse | null;
    };

export default function GamesPage() {
  const [state, setState] = useState<LoadState>(() => getCachedResource<LoadState>("games") ?? { kind: "loading" });
  useColdStart("games", setState);
  useEffect(() => { if (state.kind === "ready") setCachedResource("games", state); }, [state]);

  const mountedRef = useRef(true);
  const [loadFailed, setLoadFailed] = useState(false);
  async function load() {
    try {
      const profile: ProfileResponse = await getProfileCached();
      if (!mountedRef.current) return;
      if (!profile.activeWorkspace) {
        setState({ kind: "no-workspace", auth: profile.auth });
        return;
      }
      const [pile, reveal, quiz, greenLights] = await Promise.all([
        getPile(profile.activeWorkspace.id),
        getBlindReveal(profile.activeWorkspace.id),
        getSexQuiz(profile.activeWorkspace.id).catch(() => null),
        getGreenLights(profile.activeWorkspace.id).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setLoadFailed(false);
      setState({
        kind: "ready",
        auth: profile.auth,
        workspace: profile.activeWorkspace,
        pile: pile.pile,
        blindReveal: reveal.activeReveal,
        quiz,
        greenLights,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ApiUnauthorizedError) {
        setState({ kind: "unauthorized" });
        return;
      }
      // Keep tiles already on screen (cached); otherwise show the retry card.
      setLoadFailed(true);
      setState((current) => (current.kind === "ready"
        ? current
        : { kind: "error", message: error instanceof Error ? error.message : "", error }));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, []);

  useRecoverOnReconnect(load, loadFailed && state.kind === "ready");

  // A partner finishing a round flips its row ("Your turn" / "Ready to reveal")
  // while the hub is open.
  useLiveRoomReload({
    workspaceId: state.kind === "ready" ? state.workspace.id : "",
    actorEmail: state.kind === "ready" ? state.auth.email : "",
    resources: ["pile", "blind-reveals", "sex-quiz", "green-lights"],
    onReload: load,
  });

  return (
    <AppShell>
      <ScreenHeader
        showBrand={false}
        title="Play"
        subtitle="Nobody has to go first. You each answer in private, and only what you're both into comes back."
      />
      <Body state={state} onRetry={load} />
      {state.kind === "ready" && <InspirationEntries />}
    </AppShell>
  );
}

function Body({ state, onRetry }: { state: LoadState; onRetry: () => unknown }) {
  if (state.kind === "loading") return <GameTilesSkeleton />;
  if (state.kind === "unauthorized") {
    return (
      <ErrorState
        title="Session expired"
        body="Sign in again to play."
        action={<Link href="/" className="btn-ghost">Back to sign-in</Link>}
      />
    );
  }
  if (state.kind === "error") {
    return <LoadErrorState what="Play" error={state.error ?? state.message} onRetry={onRetry} />;
  }
  if (state.kind === "no-workspace") {
    return (
      <ErrorState
        title="No partner space yet"
        body="You need a shared room with your partner before anything here can open."
        action={<Link href="/space" className="btn-ghost">Open Us</Link>}
      />
    );
  }

  const pile = state.pile;
  const reveal = state.blindReveal;
  const partnerName = partnerOf(state.workspace, state.auth.email)?.displayName?.split(" ")[0] || "your partner";
  // Same-device drafts from the runners, so a half-answered deck reads as
  // "In progress" here instead of "New".
  const quizDraft = draftProgress(loadRunnerDraft<{ ratings?: Record<string, unknown> }>("sex-quiz", state.workspace.id)?.ratings, QUIZ_DECK.length);
  const glDraft = draftProgress(loadRunnerDraft<{ answers?: Record<string, unknown> }>("green-lights", state.workspace.id)?.answers, GREEN_LIGHT_DECK.length);
  const quiz = deckStatus(state.quiz, quizDraft, state.quiz?.partnerName || partnerName);
  const greenLights = deckStatus(state.greenLights, glDraft, state.greenLights?.partnerName || partnerName);

  // Every game in its fixed library order, each with an urgency rank:
  // 0 = waiting on you, 1 = under way or done, 2 = not started.
  const games: Array<{ id: string; rank: GameRank; render: (featured: boolean) => ReactNode }> = [
    {
      id: "quiz",
      rank: quiz.rank,
      render: (featured) => (
        <GameTile
          key="quiz"
          featured={featured}
          href="/games/sex-quiz"
          tone="quiz"
          status={quiz.label}
          statusActive={quiz.active}
          title="Sex Quiz"
          body="Rate every desire in private — the filthy ones especially. Your matches and top turn-ons open only once you've both finished."
          short="Rate every desire in private. Matches open when you both finish."
          meta={quizMeta(state.quiz, partnerName)}
          cta={quiz.cta}
        />
      ),
    },
    {
      id: "greenlights",
      rank: greenLights.rank,
      render: (featured) => (
        <GameTile
          key="greenlights"
          featured={featured}
          href="/games/green-lights"
          tone="greenlights"
          status={greenLights.label}
          statusActive={greenLights.active}
          title="Green Lights"
          body="Where you each stand on sex, autonomy, and limits. Answer in private; see what you're aligned on and what's worth a talk."
          short="Where you each stand on sex, autonomy, and limits."
          meta={greenLightsMeta(state.greenLights, partnerName)}
          cta={greenLights.cta}
        />
      ),
    },
    {
      id: "pile",
      rank: pileRank(pile),
      render: (featured) => (
        <GameTile
          key="pile"
          featured={featured}
          href="/games/pile"
          tone="pile"
          status={pileStatus(pile, partnerName)}
          statusActive={pileStatusActive(pile)}
          title="The Pile"
          body="Both drop what you're craving, in private. Whatever you both want survives the reveal — everything else vanishes."
          short="Both drop what you're craving. Only the overlap survives."
          meta={pileMeta(pile)}
          cta={pile ? (pile.isRevealed ? "Open" : "Continue") : "Start"}
        />
      ),
    },
    {
      id: "reveal",
      rank: blindRank(reveal),
      render: (featured) => (
        <GameTile
          key="reveal"
          featured={featured}
          href="/games/blind-reveal"
          tone="reveal"
          status={blindStatus(reveal, partnerName)}
          statusActive={blindStatusActive(reveal)}
          title="Blind Reveal"
          body="One question, two honest answers — neither opens till you've both locked in. Finally say the quiet part."
          short="One question, two answers, opened together."
          meta={blindMeta(reveal)}
          cta={reveal ? "Open" : "Start"}
        />
      ),
    },
  ];

  // Games waiting on you float up and get the full tile; the rest sit as
  // compact rows below in their usual order. A room that hasn't started any
  // game yet gets one full tile (the Sex Quiz) as the place to begin.
  const ordered = [...games].sort((a, b) => a.rank - b.rank);
  const yourTurn = ordered.filter((game) => game.rank === 0);
  const freshRoom = games.every((game) => game.rank === 2);
  const featured = yourTurn.length ? yourTurn : freshRoom ? [games[0]] : [];
  const featuredIds = new Set(featured.map((game) => game.id));
  const rest = ordered.filter((game) => !featuredIds.has(game.id));

  return (
    <div className="games-stage play-stage">
      <section className="play-section" aria-labelledby="play-reveals-heading">
        <div className="play-section-head">
          <h2 id="play-reveals-heading" className="play-section-title">Reveals</h2>
          {yourTurn.length > 0 && (
            <span className="play-section-note">{yourTurn.length === 1 ? "1 waiting on you" : `${yourTurn.length} waiting on you`}</span>
          )}
        </div>
        {featured.length > 0 && (
          <div className="games-list">{featured.map((game) => game.render(true))}</div>
        )}
        {rest.length > 0 && (
          <ul className="play-list" role="list">
            {rest.map((game) => <li key={game.id}>{game.render(false)}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

type GameRank = 0 | 1 | 2;

const ACTIVITY_PLAY_RESOURCES = ["fantasy-backlog", "shelf"] as const;

function useInspirationUnread() {
  const [summary, setSummary] = useState<ActivitySummary>({});
  useEffect(() => {
    try {
      // Hydration-safe: localStorage only exists on the client.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSummary(JSON.parse(window.localStorage.getItem(ACTIVITY_SUMMARY_KEY) || "{}") || {});
    } catch {}
    function onSummary(event: Event) {
      const detail = (event as CustomEvent<ActivitySummary>).detail;
      setSummary(detail && typeof detail === "object" ? detail : {});
    }
    window.addEventListener(ACTIVITY_SUMMARY_EVENT, onSummary);
    return () => window.removeEventListener(ACTIVITY_SUMMARY_EVENT, onSummary);
  }, []);
  return {
    kinks: Number(summary["fantasy-backlog"] || 0),
    shelf: Number(summary.shelf || 0),
    total: ACTIVITY_PLAY_RESOURCES.reduce((sum, key) => sum + Number(summary[key] || 0), 0),
  };
}

/**
 * Play's doorway into Inspiration. Pointers only: the prompt, composer,
 * shared library and source links all live on /inspiration (and the Shelf on
 * /inspiration/shelf), so nothing here duplicates what those screens hold.
 * Counts come from the last Inspiration snapshot and the activity summary,
 * so this section adds no request of its own.
 */
function InspirationEntries() {
  const unread = useInspirationUnread();
  const [snapshot, setSnapshot] = useState<{ prompt: string; shared: number | null }>({ prompt: "", shared: null });
  useEffect(() => {
    const cached = getCachedResource<{ kind?: string; promptText?: string; backlog?: { ideas?: unknown[] } }>("inspiration");
    // Client-only snapshot read (memory cache); keeps SSR output stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshot({
      prompt: (cached?.kind === "ready" && cached.promptText) || fallbackPromptForToday(),
      shared: cached?.kind === "ready" && Array.isArray(cached.backlog?.ideas) ? cached.backlog.ideas.length : null,
    });
  }, []);

  const kinksSub = unread.kinks
    ? `${unread.kinks} new since you last looked`
    : snapshot.shared !== null
      ? `${snapshot.shared} shared · see what lands`
      : "Share one and see what lands";

  return (
    <section className="play-stage play-inspo" aria-labelledby="play-inspo-heading">
      <div className="play-section-head">
        <h2 id="play-inspo-heading" className="play-section-title">Inspiration</h2>
      </div>
      <Link href="/inspiration#kink-compose" className="play-prompt pressable">
        <span className="play-prompt-label">Today&apos;s prompt</span>
        <span className="play-prompt-text">{snapshot.prompt || " "}</span>
        <span className="play-prompt-cta">Write yours <span aria-hidden="true">→</span></span>
      </Link>
      <ul className="play-list" role="list">
        <li>
          <PlayLink
            href="/inspiration?section=shared-kinks"
            mark="kinks"
            title="Kinks, fantasies & confessions"
            sub={kinksSub}
            unread={unread.kinks}
          />
        </li>
        <li>
          <PlayLink
            href="/inspiration/shelf"
            mark="shelf"
            title="The Shelf"
            sub={unread.shelf ? `${unread.shelf} new since you last looked` : "Saved clips, passages and ideas"}
            unread={unread.shelf}
          />
        </li>
        <li>
          <PlayLink
            href="/inspiration#sources"
            mark="sources"
            title="Watch and read"
            sub="Porn, erotica and your own clips"
          />
        </li>
      </ul>
    </section>
  );
}

function PlayLink({
  href,
  mark,
  title,
  sub,
  unread = 0,
}: {
  href: string;
  mark: PlayMarkKind;
  title: string;
  sub: string;
  unread?: number;
}) {
  return (
    <Link href={href} className="play-row pressable">
      <PlayMark kind={mark} />
      <span className="play-row-copy">
        <span className="play-row-title">{title}</span>
        <span className={`play-row-sub ${unread ? "is-live" : ""}`}>{sub}</span>
      </span>
      <span className="play-row-chev" aria-hidden="true">›</span>
    </Link>
  );
}

type PlayMarkKind = "quiz" | "greenlights" | "pile" | "reveal" | "kinks" | "shelf" | "sources";

/** Small stroke glyphs for the compact rows, one per destination. */
function PlayMark({ kind }: { kind: PlayMarkKind }) {
  const paths: Record<PlayMarkKind, ReactNode> = {
    quiz: <path d="M12 19c-4.2-3.1-7-5.6-7-8.6C5 8.1 6.7 6.5 8.7 6.5c1.4 0 2.6.8 3.3 2 .7-1.2 1.9-2 3.3-2 2 0 3.7 1.6 3.7 3.9 0 3-2.8 5.5-7 8.6Z" />,
    greenlights: (
      <>
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="12" cy="12" r="2.4" />
        <circle cx="18" cy="12" r="2.9" fill="currentColor" fillOpacity="0.3" />
      </>
    ),
    pile: (
      <>
        <rect x="4.5" y="6" width="11" height="13" rx="2" transform="rotate(-8 10 12.5)" />
        <rect x="8.5" y="5" width="11" height="13" rx="2" transform="rotate(6 14 11.5)" />
      </>
    ),
    reveal: (
      <>
        <path d="M12 4v16" />
        <path d="M4 9h5M4 12h4M4 15h5M15 9h5M16 12h4M15 15h5" />
      </>
    ),
    kinks: <path d="M12 3.5 13.6 10.4 20.5 12 13.6 13.6 12 20.5 10.4 13.6 3.5 12 10.4 10.4Z" />,
    shelf: (
      <>
        <path d="M4 19.5h16" />
        <rect x="5.5" y="7" width="3.5" height="12.5" rx="1" />
        <rect x="10.5" y="5" width="3.5" height="14.5" rx="1" />
        <path d="m15.6 8.2 3.3-.9 3 11.3-3.3.9z" />
      </>
    ),
    sources: (
      <>
        <path d="M14 5h5v5" />
        <path d="M19 5 11 13" />
        <path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
      </>
    ),
  };
  return (
    <span className={`play-mark play-mark-${kind}`} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
    </span>
  );
}

/** Loading placeholder shaped like Play: one full game tile, then compact rows. */
function GameTilesSkeleton() {
  return (
    <div className="games-stage play-stage" role="status" aria-live="polite" aria-label="Loading">
      <div className="games-list" aria-hidden="true">
        <div className="game-tile game-tile-skeleton">
          <div className="game-art" />
          <div className="game-body">
            <div className="skeleton-shimmer game-skeleton-status" />
            <div className="skeleton-shimmer game-skeleton-title" />
            <div className="skeleton-shimmer game-skeleton-line" />
            <div className="skeleton-shimmer game-skeleton-line is-short" />
            <div className="skeleton-shimmer game-skeleton-foot" />
          </div>
        </div>
      </div>
      <div className="play-list" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="play-row play-row-skeleton">
            <span className="play-mark skeleton-shimmer" />
            <span className="play-row-copy">
              <span className="skeleton-shimmer game-skeleton-title" />
              <span className="skeleton-shimmer game-skeleton-line is-short" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DeckProgress = { answered: number; total: number } | null;

function draftProgress(answers: Record<string, unknown> | undefined, total: number): DeckProgress {
  const answered = Object.keys(answers || {}).length;
  return answered > 0 ? { answered: Math.min(answered, total), total } : null;
}

// The status line on a double-blind deck tile (Sex Quiz, Green Lights), in
// words: whose turn it is, how far your own draft got, or that both are in.
// "partner finished" only ever shows because finishing is what the reveal
// waits on; it never says when they answered or how far they got.
function deckStatus(
  game: { status: "open" | "revealed"; mySubmitted: boolean; partnerSubmitted: boolean; revealOpensAt?: string } | null,
  draft: DeckProgress,
  partnerName: string,
): { label: string; active: boolean; cta: string; rank: GameRank } {
  if (game?.status === "revealed") return { label: "Revealed", active: true, cta: "Open", rank: 1 };
  if (game?.mySubmitted && game?.partnerSubmitted) {
    // Both in, but a new round waits out the re-reveal cooldown.
    if (game.revealOpensAt) return { label: `Both in · opens ${shortRevealTime(game.revealOpensAt)}`, active: true, cta: "Open", rank: 1 };
    return { label: "Ready to reveal", active: true, cta: "Open", rank: 1 };
  }
  if (game?.mySubmitted) return { label: `Waiting on ${partnerName}`, active: true, cta: "Open", rank: 1 };
  if (draft) {
    const turn = game?.partnerSubmitted ? `${partnerName} finished · ` : "";
    return { label: `${turn}In progress · ${draft.answered} of ${draft.total}`, active: true, cta: "Resume", rank: game?.partnerSubmitted ? 0 : 1 };
  }
  if (game?.partnerSubmitted) return { label: `Your turn — ${partnerName} finished`, active: true, cta: "Start", rank: 0 };
  return { label: "New", active: false, cta: "Start", rank: 2 };
}

// Urgency for The Pile: a Pile your partner started or dropped into is
// waiting on you; one you're both in (or that already opened) is under way.
function pileRank(pile: PileView | null): GameRank {
  if (!pile) return 2;
  if (pile.isRevealed) return 1;
  if ((pile.mine?.length || 0) > 0) return 1;
  return 0;
}

function blindRank(reveal: BlindReveal | null): GameRank {
  if (!reveal) return 2;
  if (reveal.status === "revealed") return 1;
  if (reveal.mySubmitted && !reveal.partnerSubmitted) return 1;
  return 0;
}

function quizMeta(quiz: SexQuizResponse | null, partnerName: string) {
  if (!quiz || !quiz.mySubmitted) return "Build your desire map";
  if (quiz.status === "revealed") return `${quiz.matches.length} matches open`;
  return `Opens when ${partnerName} finishes`;
}

function greenLightsMeta(gl: GreenLightsResponse | null, partnerName: string) {
  if (!gl || !gl.mySubmitted) return "Where you both stand";
  if (gl.status === "revealed") {
    // Agreements only. A count of differences would be a count of the
    // partner's "no"s by another name.
    const { greenLights, agreedLimits, sharedConcerns } = computeGreenLightsReveal(gl.myAnswers || {}, gl.partnerAnswers || {});
    const aligned = greenLights.length + agreedLimits.length + sharedConcerns.length;
    return `${aligned} on the same page`;
  }
  return `Opens when ${partnerName} finishes`;
}

function GameTile({
  featured = true,
  href,
  tone,
  status,
  statusActive,
  title,
  body,
  short,
  meta,
  cta,
}: {
  featured?: boolean;
  href: string;
  tone: "pile" | "reveal" | "quiz" | "greenlights";
  status: string;
  statusActive: boolean;
  title: string;
  body: string;
  short: string;
  meta: string;
  cta: string;
}) {
  if (!featured) {
    // Compact row: a game that isn't waiting on you. Its status line says
    // where it stands; an untouched game says what it is instead of "New".
    const fresh = status === "New";
    return (
      <Link href={href} className={`play-row play-row-game game-${tone} pressable`}>
        <PlayMark kind={tone} />
        <span className="play-row-copy">
          <span className="play-row-title">{title}</span>
          <span className={`play-row-sub ${!fresh && statusActive ? "is-live" : ""}`}>{fresh ? short : status}</span>
        </span>
        <span className="play-row-cta">{cta}<span aria-hidden="true"> ›</span></span>
      </Link>
    );
  }
  return (
    <Link href={href} className={`game-tile game-${tone} pressable`}>
      <div className={`game-art game-art-${tone}`} aria-hidden="true">
        {tone === "pile" ? (
          <>
            <span className="pile-glow" />
            <span className="pile-card pile-card-3" />
            <span className="pile-card pile-card-1" />
            <span className="pile-card pile-card-2">
              <span className="pile-card-pip" />
            </span>
          </>
        ) : tone === "quiz" ? (
          <svg className="quiz-art-svg" viewBox="0 0 200 110" fill="none">
            <defs>
              <radialGradient id="quizGrad" cx="50%" cy="42%" r="62%">
                <stop className="quiz-grad-a" offset="0%" />
                <stop className="quiz-grad-b" offset="100%" />
              </radialGradient>
            </defs>
            <path
              className="quiz-heart-fill"
              fill="url(#quizGrad)"
              d="M100 88 C 74 68 60 55 60 42 C 60 32 69 26 78 30 C 87 34 95 42 100 51 C 105 42 113 34 122 30 C 131 26 140 32 140 42 C 140 55 126 68 100 88 Z"
            />
            <path
              className="quiz-heart-line"
              pathLength={1}
              d="M100 88 C 74 68 60 55 60 42 C 60 32 69 26 78 30 C 87 34 95 42 100 51 C 105 42 113 34 122 30 C 131 26 140 32 140 42 C 140 55 126 68 100 88 Z"
            />
            <circle className="quiz-spark" cx="100" cy="55" r="3.4" />
            <g transform="translate(45 32)"><path className="quiz-sparkle s1" d="M0 -4.5 L1 -1 L4.5 0 L1 1 L0 4.5 L-1 1 L-4.5 0 L-1 -1 Z" /></g>
            <g transform="translate(158 30)"><path className="quiz-sparkle s2" d="M0 -3.6 L0.8 -0.8 L3.6 0 L0.8 0.8 L0 3.6 L-0.8 0.8 L-3.6 0 L-0.8 -0.8 Z" /></g>
            <g transform="translate(150 82)"><path className="quiz-sparkle s3" d="M0 -4 L0.9 -0.9 L4 0 L0.9 0.9 L0 4 L-0.9 0.9 L-4 0 L-0.9 -0.9 Z" /></g>
            <g transform="translate(48 80)"><path className="quiz-sparkle s4" d="M0 -3.2 L0.7 -0.7 L3.2 0 L0.7 0.7 L0 3.2 L-0.7 0.7 L-3.2 0 L-0.7 -0.7 Z" /></g>
          </svg>
        ) : tone === "greenlights" ? (
          <svg className="gl-art-svg" viewBox="0 0 200 110" fill="none">
            <circle className="gl-dot gl-red" cx="66" cy="55" r="11" />
            <circle className="gl-dot gl-amber" cx="100" cy="55" r="11" />
            <circle className="gl-halo" cx="138" cy="55" r="13" />
            <circle className="gl-dot gl-green" cx="138" cy="55" r="13" />
          </svg>
        ) : (
          <>
            <span className="reveal-half reveal-half-a">
              <span className="reveal-line rl-a" />
              <span className="reveal-line rl-b" />
              <span className="reveal-line rl-c" />
            </span>
            <span className="reveal-half reveal-half-b">
              <span className="reveal-line rr-a" />
              <span className="reveal-line rr-b" />
              <span className="reveal-line rr-c" />
            </span>
            <span className="reveal-seam" />
            <span className="reveal-pip" />
            <span className="reveal-pip-halo" />
          </>
        )}
      </div>
      <div className="game-body">
        <span className={`game-status ${statusActive ? "status-active" : "status-idle"}`}>
          {status}
        </span>
        <h3 className="game-title">{title}</h3>
        <p className="game-desc">{body}</p>
        <div className="game-foot">
          <span className="game-meta">{meta}</span>
          <span className="game-cta">{cta} →</span>
        </div>
      </div>
    </Link>
  );
}

function pileStatus(pile: PileView | null, partnerName: string) {
  if (!pile) return "New";
  if (pile.isRevealed) return pile.overlap?.length ? "Revealed · overlap found" : "Revealed";
  const mineIn = (pile.mine?.length || 0) > 0;
  if (mineIn && pile.partnerHasDropped) return `Both in · reveals ${shortRevealTime(pile.revealAt)}`;
  if (mineIn) return `Waiting on ${partnerName}`;
  if (pile.partnerHasDropped) return `Your turn — ${partnerName} dropped`;
  return "Your turn";
}

function pileStatusActive(pile: PileView | null) {
  return Boolean(pile && (!pile.isRevealed || pile.overlap?.length));
}

function pileMeta(pile: PileView | null) {
  if (!pile) return "No active pile";
  if (pile.isRevealed) return `${pile.overlap?.length || 0} overlaps`;
  return `Reveal ${shortRevealTime(pile.revealAt)}`;
}

function blindStatus(reveal: BlindReveal | null, partnerName: string) {
  if (!reveal) return "New";
  if (reveal.status === "revealed") return "Revealed";
  if (reveal.mySubmitted && reveal.partnerSubmitted) return "Ready to reveal";
  if (reveal.mySubmitted) return `Waiting on ${partnerName}`;
  if (reveal.partnerSubmitted) return `Your turn — ${partnerName} answered`;
  return "Your turn";
}

function blindStatusActive(reveal: BlindReveal | null) {
  return Boolean(reveal);
}

function blindMeta(reveal: BlindReveal | null) {
  if (!reveal) return "No active reveal";
  if (reveal.status === "revealed") return `${reveal.entries.length} answers open`;
  return `${reveal.submittedCount}/${reveal.requiredCount} locked in`;
}

function shortRevealTime(value: string) {
  if (!value) return "soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
