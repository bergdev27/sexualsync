"use client";

import { useEffect, useRef, useState } from "react";
import "@/app/product-site.css";

// The desktop face of the product. The app itself is mobile-only; this page's
// one job is to show what the room is like and route visitors to the only way
// in — running their own copy. Screenshots must stay a subset of the ones the
// deck references (scripts/build.mjs copies exactly that set into dist/).
const GITHUB_URL = "https://github.com/Aiml3ss/sexualsync";
const PRESENTATION_URL = "/presentation.html";

const GALLERY: { src: string; alt: string; name: string; cap: string }[] = [
  { src: "/docs/screenshots/share/03-sexboard-home.png", alt: "The Sexboard home screen", name: "Sexboard", cap: "The home view" },
  { src: "/docs/screenshots/share/07-new-ask.png", alt: "Composing a new Ask", name: "New Ask", cap: "Acts, timing, note" },
  { src: "/docs/screenshots/share/05-ask-detail.png", alt: "An Ask as the partner receives it", name: "Ask, received", cap: "Yes, counter, or pass" },
  { src: "/docs/screenshots/share/08-inspiration.png", alt: "The Inspiration surface", name: "Inspiration", cap: "Fantasies, before plans" },
  { src: "/docs/screenshots/share/10-shelf.png", alt: "The Shelf of saved finds", name: "Shelf", cap: "Hidden until revealed" },
  { src: "/docs/screenshots/share/13-pile-revealed.png", alt: "A revealed Pile round", name: "Pile, revealed", cap: "Only the matches" },
  { src: "/docs/screenshots/share/15-limits.png", alt: "The Limits list", name: "Limits", cap: "The shape of yes" },
  { src: "/docs/screenshots/share/18-private-vault.png", alt: "The encrypted private Vault", name: "Vault", cap: "Passphrase-locked" },
  { src: "/docs/screenshots/share/17-health.png", alt: "The health rhythm view", name: "Health", cap: "Your rhythm, in numbers" },
];

const HOUSE: { label: string; title: string; body: string }[] = [
  { label: "Asks", title: "Make the request.", body: "Pick the acts, the timing, whether to film, add a note. Send it. Get a yes, a counter, or a pass." },
  { label: "Acts", title: "A shared library.", body: "Start with built-ins, add the words that fit you both. Asks pull from this — what you call things is yours." },
  { label: "Limits", title: "Lines that stay visible.", body: "Hard no, talk-first, soft, yes-with-conditions. Asks warn or block before anything sends." },
  { label: "Inspiration", title: "Fantasies, before plans.", body: "A kink, a scene, a what-if. Posting it is your interest signal; their “me too” makes it mutual." },
  { label: "The Shelf", title: "Save what catches you.", body: "Links, passages, clips from elsewhere. Items open hidden until your partner chooses to reveal them." },
  { label: "The Vault", title: "For the two of you only.", body: "Clips, titles, comments — encrypted in the browser with a passphrase the server never sees." },
  { label: "The Pile", title: "Find the overlap.", body: "Both drop acts in private. Nothing reveals until both lock in. Only the matches surface." },
  { label: "Blind Reveal", title: "Answer first, see second.", body: "One prompt, both answer in private. Neither opens until both are in." },
  { label: "Sext", title: "The direct channel.", body: "A two-person thread. Photos and GIFs encrypt in your browser before they upload." },
  { label: "Sex Quiz", title: "Compare the yeses.", body: "Both answer the same deck alone. The result shows only where you already agree." },
  { label: "Green Lights", title: "What's on the table.", body: "A standing yes / curious / not-now list, filled in private. The overlap becomes a shared menu." },
  { label: "Sexboard", title: "One glance.", body: "Active Asks, partner activity, game status, anything waiting on you. The room, summarized." },
];

function WaveSigil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path pathLength={1} d="M 12,50 C 22,30 38,30 50,50 C 62,70 78,70 88,50" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
      <path pathLength={1} d="M 12,62 C 22,42 38,42 50,62 C 62,82 78,82 88,62" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function Wordmark() {
  return (
    <>
      <svg width="26" height="13" viewBox="0 0 100 50" fill="none" aria-hidden="true">
        <path d="M 12,25 C 22,15 38,15 50,25 C 62,35 78,35 88,25" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M 12,33 C 22,23 38,23 50,33 C 62,43 78,43 88,33" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
      </svg>
      <em>sexual</em>
      <span className="ps-wordmark-dot" aria-hidden="true" />
      <em className="ps-wordmark-sync">sync</em>
    </>
  );
}

// One shared IntersectionObserver drives every [data-reveal] on the page.
function useReveals(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("ps-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("ps-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

// Pointer parallax for the hero phone stack — same demand-driven rAF pattern
// as the access gate: the loop runs only while values are still chasing.
function useHeroParallax(stageRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceQuery.matches;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const settle = () => {
      tx = 0; ty = 0; cx = 0; cy = 0;
      stage.style.setProperty("--px", "0");
      stage.style.setProperty("--py", "0");
    };
    const onMotionChange = () => {
      reduced = reduceQuery.matches;
      if (reduced) settle();
    };
    const tick = () => {
      if (!reduced) {
        cx += (tx - cx) * 0.07;
        cy += (ty - cy) * 0.07;
        stage.style.setProperty("--px", cx.toFixed(3));
        stage.style.setProperty("--py", cy.toFixed(3));
        if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001) {
          raf = requestAnimationFrame(tick);
          return;
        }
      }
      raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onMove = (event: PointerEvent) => {
      if (reduced) return;
      const rect = stage.getBoundingClientRect();
      tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      kick();
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", settle);
    reduceQuery.addEventListener("change", onMotionChange);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", settle);
      reduceQuery.removeEventListener("change", onMotionChange);
      cancelAnimationFrame(raf);
    };
  }, [stageRef]);
}

// The signature interaction: the visitor plays partner B. Their side of the
// demo pile stays sealed until the visitor locks in — the product's consent
// mechanic, acted out on the page.
function PileDemo() {
  const [revealed, setRevealed] = useState(false);

  const yours: { act: string; match: boolean }[] = [
    { act: "shower together", match: true },
    { act: "fingered during the movie", match: true },
    { act: "go down on me, slow", match: false },
    { act: "anal — lots of warm-up", match: false },
  ];

  return (
    <div aria-label="A demonstration of how a Pile round reveals">
      <div className={`ps-pile${revealed ? " ps-revealed" : ""}`}>
        <div className="ps-pile-side">
          <div className="ps-pile-who">
            <span className="ps-mono">Your pile</span>
            <span className={`ps-pile-state${revealed ? " ps-pile-state-locked" : ""}`}>
              {revealed ? "Locked ✓" : "Drafting…"}
            </span>
          </div>
          <div className="ps-pile-stack">
            {yours.map((entry, index) => (
              <div
                key={entry.act}
                className={`ps-pile-act ${entry.match ? "ps-pile-act-match" : "ps-pile-act-miss"}`}
                style={{ "--pd": `${index * 120}ms` } as React.CSSProperties}
              >
                {entry.act}
                {!entry.match && <span className="ps-pile-act-tag">stays yours</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="ps-pile-side">
          <div className="ps-pile-who">
            <span className="ps-mono">Their pile</span>
            <span className="ps-pile-state ps-pile-state-locked">Locked &#10003;</span>
          </div>
          <div className="ps-pile-stack">
            <div className="ps-pile-act ps-pile-act-match ps-pile-act-veiled" style={{ "--pd": "60ms" } as React.CSSProperties}>
              {revealed ? "shower together" : "private"}
            </div>
            <div className="ps-pile-act ps-pile-act-match ps-pile-act-veiled" style={{ "--pd": "180ms" } as React.CSSProperties}>
              {revealed ? "fingered during the movie" : "private"}
            </div>
            <div className="ps-pile-act ps-pile-act-hidden">private</div>
            <div className="ps-pile-act ps-pile-act-hidden">private</div>
          </div>
        </div>
      </div>

      <div className="ps-pile-lockrow" aria-live="polite">
        {revealed ? (
          <div className="ps-pile-result ps-pile-result-enter">
            <p className="ps-mono">2 match &middot; the rest stay private</p>
            <p>
              Their other drops <strong>never surface</strong>. Yours stay yours. Nobody has to
              admit to wanting something the other didn&rsquo;t want.
            </p>
            <button type="button" className="ps-pile-replay" onClick={() => setRevealed(false)}>
              Run it again
            </button>
          </div>
        ) : (
          <button type="button" className="ps-pile-lock" onClick={() => setRevealed(true)}>
            Lock in your side
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProductSite() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [navSolid, setNavSolid] = useState(false);

  useReveals(rootRef);
  useHeroParallax(stageRef);

  useEffect(() => {
    setReady(true);
    const onScroll = () => setNavSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`ps-root${ready ? " ps-ready" : ""}`} ref={rootRef}>
      <div className="ps-atmosphere" aria-hidden="true" />
      <div className="ps-grain" aria-hidden="true" />

      <header className={`ps-nav${navSolid ? " ps-nav-solid" : ""}`}>
        <a className="ps-wordmark" href="#top" aria-label="Sexualsync — back to top">
          <Wordmark />
        </a>
        <nav className="ps-nav-links" aria-label="Sections">
          <a href="#room">The room</a>
          <a href="#ask">The Ask</a>
          <a href="#games">The games</a>
          <a href="#privacy">Privacy</a>
          <a className="ps-nav-cta" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GithubMark size={15} />
            <span>Self-host it</span>
          </a>
        </nav>
      </header>

      <main id="top">
        {/* ------------------------------------------------------- hero */}
        <section className="ps-section ps-hero-section" aria-labelledby="ps-hero-title">
          <div className="ps-wrap ps-hero">
            <div className="ps-hero-copy">
              <WaveSigil className="ps-hero-sigil" />
              <p className="ps-eyebrow">A private room for two &middot; self-hosted &middot; 18+</p>
              <h1 className="ps-display" id="ps-hero-title">
                Get curious.
                <br />
                <span className="ps-accent">Get in sync.</span>
              </h1>
              <p className="ps-lede ps-hero-lede">
                A room for exactly two people — to ask clearly, trade fantasies, keep limits
                visible, and find the yes you already share.
              </p>
              <p className="ps-body ps-hero-stance">
                There is no sign-up and no service to join. <strong>You run Sexualsync on your
                own server</strong> — the room belongs to the two of you, hardware included.
              </p>
              <div className="ps-hero-actions">
                <a className="ps-cta ps-cta-primary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GithubMark />
                  <span>Self-host it on GitHub</span>
                </a>
                <a className="ps-cta ps-cta-ghost" href={PRESENTATION_URL}>
                  View presentation
                </a>
              </div>
              <p className="ps-mono ps-hero-foot">
                <span>Open source</span>
                <span className="ps-sep">&middot;</span>
                <span>No feed, no profiles</span>
                <span className="ps-sep">&middot;</span>
                <span>Mobile app — desktop stops here</span>
              </p>
            </div>

            <div className="ps-hero-stage" ref={stageRef} aria-hidden="true">
              <div className="ps-hero-glow" />
              <div className="ps-phone ps-hero-phone-side ps-hero-phone-left">
                <img src="/docs/screenshots/share/05-ask-detail.png" alt="" loading="lazy" decoding="async" />
              </div>
              <div className="ps-phone ps-hero-phone">
                <img src="/docs/screenshots/share/03-sexboard-home.png" alt="" decoding="async" />
              </div>
              <div className="ps-phone ps-hero-phone-side ps-hero-phone-right">
                <img src="/docs/screenshots/share/13-pile-revealed.png" alt="" loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- premise */}
        <section className="ps-section ps-premise" aria-labelledby="ps-premise-title">
          <div className="ps-wrap">
            <p className="ps-eyebrow" data-reveal>The premise</p>
            <h2 className="ps-display" id="ps-premise-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
              Some things are easier to <span className="ps-accent">type</span> than say.
            </h2>
            <p className="ps-body" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
              Not because you don&rsquo;t want to talk — because the cold start is hard. The first
              sentence is the expensive one. Sexualsync removes the cold start: write the ask,
              set the timing, and let the room hold it until your partner is ready to answer.
              No pressure to respond on the spot. No watching their face while they decide.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- room */}
        <section className="ps-section ps-room" id="room" aria-labelledby="ps-room-title">
          <div className="ps-wrap">
            <p className="ps-eyebrow" data-reveal>The shape</p>
            <h2 className="ps-display" id="ps-room-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
              One room. <span className="ps-accent">Two people.</span> Nothing else.
            </h2>

            <div className="ps-room-visual" data-reveal style={{ "--d": "220ms" } as React.CSSProperties}>
              <div className="ps-room-person" aria-hidden="true"><em>A</em></div>
              <div className="ps-room-core">private room</div>
              <div className="ps-room-person" aria-hidden="true"><em>B</em></div>
            </div>

            <div className="ps-room-nots" data-reveal style={{ "--d": "330ms" } as React.CSSProperties}>
              <span className="ps-room-not">No feed</span>
              <span className="ps-room-not">No profiles</span>
              <span className="ps-room-not">No discovery</span>
              <span className="ps-room-not">No audience</span>
            </div>

            <p className="ps-body" data-reveal style={{ "--d": "420ms" } as React.CSSProperties}>
              One partner sets up the room and sends an invite link; the other accepts. From then
              on, the room is the only place any of this exists. The product has no concept of a
              public you — <strong>it only knows the two people who belong inside</strong>.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------- the ask */}
        <section className="ps-section" id="ask" aria-labelledby="ps-ask-title">
          <div className="ps-wrap">
            <div className="ps-ask">
              <div className="ps-ask-copy">
                <p className="ps-eyebrow" data-reveal>The core move</p>
                <h2 className="ps-display" id="ps-ask-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
                  An Ask says it <span className="ps-accent">for you</span>.
                </h2>
                <div className="ps-callouts">
                  <div className="ps-callout" data-reveal style={{ "--d": "180ms" } as React.CSSProperties}>
                    <span className="ps-callout-dot" aria-hidden="true" />
                    <div>
                      <strong>The acts</strong>
                      <p>Pulled from your shared library. Whatever the two of you call it is what shows up here.</p>
                    </div>
                  </div>
                  <div className="ps-callout" data-reveal style={{ "--d": "260ms" } as React.CSSProperties}>
                    <span className="ps-callout-dot" aria-hidden="true" />
                    <div>
                      <strong>The when</strong>
                      <p>Timing is a first-class field. &ldquo;Tonight&rdquo; and &ldquo;this weekend&rdquo; lead to very different yeses.</p>
                    </div>
                  </div>
                  <div className="ps-callout" data-reveal style={{ "--d": "340ms" } as React.CSSProperties}>
                    <span className="ps-callout-dot" aria-hidden="true" />
                    <div>
                      <strong>The note</strong>
                      <p>Optional — and often where the real asking happens. The words that wouldn&rsquo;t come out in person.</p>
                    </div>
                  </div>
                  <div className="ps-callout" data-reveal style={{ "--d": "420ms" } as React.CSSProperties}>
                    <span className="ps-callout-dot" aria-hidden="true" />
                    <div>
                      <strong>The answer</strong>
                      <p>Three paths: yes, counter, or pass. No path is the wrong path — a pass is information, not a wound.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ps-ask-card" data-reveal style={{ "--d": "160ms" } as React.CSSProperties}>
                <div className="ps-ask-head">
                  <span className="ps-mono">Jules &rarr; you</span>
                  <span className="ps-ask-chip">Tonight</span>
                </div>
                <p className="ps-ask-acts">Slow kissing, shower together, candlelit makeout</p>
                <div className="ps-ask-pills">
                  <span className="ps-ask-pill">Tonight</span>
                  <span className="ps-ask-pill">Filming: no</span>
                  <span className="ps-ask-pill">3 acts</span>
                </div>
                <p className="ps-ask-note">&ldquo;Slow, playful, no rush. I&rsquo;ve been thinking about this all week.&rdquo;</p>
                <div className="ps-ask-actions" aria-hidden="true">
                  <span className="ps-ask-btn ps-ask-btn-yes">Yes</span>
                  <span className="ps-ask-btn ps-ask-btn-counter">Counter</span>
                  <span className="ps-ask-btn">Pass</span>
                  <span className="ps-ask-btn ps-ask-btn-tell">Tell me later</span>
                </div>
              </div>
            </div>

            <div className="ps-flow" data-reveal>
              <div className="ps-flow-step">
                <span className="ps-flow-num">1</span>
                <h4>Draft</h4>
                <p>Acts, timing, filming preference, an optional note.</p>
              </div>
              <div className="ps-flow-step">
                <span className="ps-flow-num">2</span>
                <h4>Limit check</h4>
                <p>Crosses a saved limit? The app warns — or blocks — before send.</p>
              </div>
              <div className="ps-flow-step">
                <span className="ps-flow-num">3</span>
                <h4>Encrypt &amp; store</h4>
                <p>Encrypted at rest. Opaque to anyone outside the room.</p>
              </div>
              <div className="ps-flow-step">
                <span className="ps-flow-num">4</span>
                <h4>Quiet ping</h4>
                <p>The lock screen stays generic. No body copy ever leaks.</p>
              </div>
              <div className="ps-flow-step">
                <span className="ps-flow-num">5</span>
                <h4>Answer</h4>
                <p>Yes, counter, or pass — whenever they&rsquo;re ready.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ games */}
        <section className="ps-section ps-games" id="games" aria-labelledby="ps-games-title">
          <div className="ps-wrap">
            <div className="ps-games-head">
              <p className="ps-eyebrow" data-reveal>The games</p>
              <h2 className="ps-display" id="ps-games-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
                Neither of you <span className="ps-accent">goes first</span>.
              </h2>
              <p className="ps-lede" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
                Every game runs on one rule: answers stay sealed until both sides lock&nbsp;in.
                Only the overlap surfaces. Try it below — you&rsquo;re&nbsp;partner&nbsp;B.
              </p>
            </div>

            <div data-reveal style={{ "--d": "150ms" } as React.CSSProperties}>
              <PileDemo />
            </div>

            <div className="ps-game-trio">
              <div className="ps-game-card" data-reveal>
                <p className="ps-mono">Sex Quiz</p>
                <h3>A shared deck.</h3>
                <p>Both work through the same questions in private. The result surfaces only the acts you both said yes to.</p>
              </div>
              <div className="ps-game-card" data-reveal style={{ "--d": "110ms" } as React.CSSProperties}>
                <p className="ps-mono">Green Lights</p>
                <h3>A standing menu.</h3>
                <p>Yes, curious, or not now — marked on your own. Where the lists overlap becomes a menu you can both act on.</p>
              </div>
              <div className="ps-game-card" data-reveal style={{ "--d": "220ms" } as React.CSSProperties}>
                <p className="ps-mono">Blind Reveal</p>
                <h3>One prompt, two answers.</h3>
                <p>A single question, answered separately. Neither reply opens until both are in — no answer sways the other.</p>
              </div>
            </div>

            <p className="ps-lede ps-games-rule" data-reveal>
              A one-sided want stays private. <span className="ps-accent">Forever.</span>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ house */}
        <section className="ps-section ps-house" aria-labelledby="ps-house-title">
          <div className="ps-wrap">
            <p className="ps-eyebrow" data-reveal>What&rsquo;s inside</p>
            <h2 className="ps-display" id="ps-house-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
              Twelve pieces. <span className="ps-accent">One house.</span>
            </h2>
            <p className="ps-body ps-house-sub" data-reveal style={{ "--d": "180ms" } as React.CSSProperties}>
              Each piece is built around a different conversation that&rsquo;s hard to start.
              They&rsquo;re separate on purpose — different rooms of the same house.
            </p>

            <div className="ps-house-grid" data-reveal style={{ "--d": "240ms" } as React.CSSProperties}>
              {HOUSE.map((piece) => (
                <div className="ps-house-cell" key={piece.label}>
                  <p className="ps-mono">{piece.label}</p>
                  <h3>{piece.title}</h3>
                  <p>{piece.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- limits */}
        <section className="ps-section" aria-labelledby="ps-limits-title">
          <div className="ps-wrap ps-limits">
            <div className="ps-limits-copy">
              <p className="ps-eyebrow" data-reveal>Built-in safety</p>
              <h2 className="ps-display" id="ps-limits-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
                Limits are part of the <span className="ps-accent">grammar</span>.
              </h2>
              <p className="ps-body" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
                A limit isn&rsquo;t a setting buried in preferences. It lives next to the Acts
                library, and <strong>every Ask is checked against it before it can send</strong>.
                The app holds the line so neither of you has to.
              </p>
            </div>

            <div className="ps-limit-rows">
              <div className="ps-limit-row ps-limit-hard" data-reveal>
                <p className="ps-limit-level">Hard no</p>
                <p><em>&ldquo;filming — hard no.&rdquo;</em> Any Ask that turns filming on is blocked at draft time. Edit it, or it doesn&rsquo;t send.</p>
              </div>
              <div className="ps-limit-row ps-limit-talk" data-reveal style={{ "--d": "100ms" } as React.CSSProperties}>
                <p className="ps-limit-level">Talk first</p>
                <p><em>&ldquo;anal — talk first.&rdquo;</em> The Ask sends, but carries a badge: this one needs a real conversation before tonight.</p>
              </div>
              <div className="ps-limit-row ps-limit-soft" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
                <p className="ps-limit-level">Soft limit</p>
                <p><em>&ldquo;anything before 8am — soft.&rdquo;</em> A warning at send. The drafter has to acknowledge it to go through.</p>
              </div>
              <div className="ps-limit-row ps-limit-yes" data-reveal style={{ "--d": "300ms" } as React.CSSProperties}>
                <p className="ps-limit-level">Yes, with conditions</p>
                <p><em>&ldquo;rough — lots of warm-up, never first.&rdquo;</em> The conditions surface inline on every relevant Ask, so they stay in front.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- privacy */}
        <section className="ps-section ps-privacy" id="privacy" aria-labelledby="ps-privacy-title">
          <div className="ps-wrap">
            <div className="ps-privacy-head">
              <p className="ps-eyebrow" data-reveal>Under the hood</p>
              <h2 className="ps-display" id="ps-privacy-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
                Discreet on the outside. <span className="ps-accent">Encrypted underneath.</span>
              </h2>
            </div>

            <div className="ps-privacy-grid">
              <div className="ps-privacy-stack">
                <div className="ps-privacy-layer" data-reveal>
                  <span className="ps-mono">The surface</span>
                  <p><strong>Designed not to leak.</strong> Push notifications, emails, and activity labels stay generic. The lock screen never spoils what&rsquo;s inside.</p>
                </div>
                <div className="ps-privacy-layer" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
                  <span className="ps-mono">Access</span>
                  <p><strong>Two people, server-checked.</strong> No public routes into a room. Membership is verified before any data comes back.</p>
                </div>
                <div className="ps-privacy-layer" data-reveal style={{ "--d": "180ms" } as React.CSSProperties}>
                  <span className="ps-mono">At rest</span>
                  <p><strong>Room data is encrypted before it lands.</strong> Asks, Acts, Limits, Inspiration, Shelf, activity — ciphertext in storage, not contents.</p>
                </div>
                <div className="ps-privacy-layer" data-reveal style={{ "--d": "270ms" } as React.CSSProperties}>
                  <span className="ps-mono">End to end</span>
                  <p><strong>The Vault and Sext media encrypt in your browser</strong>, with keys the server never holds. A database breach reads nothing.</p>
                </div>
                <div className="ps-privacy-layer" data-reveal style={{ "--d": "360ms" } as React.CSSProperties}>
                  <span className="ps-mono">Your control</span>
                  <p><strong>Export, sign out, delete.</strong> Full JSON export on demand. Room deletion runs on a scheduled purge with an undo window.</p>
                </div>
              </div>

              <div className="ps-lockscreen">
                <div className="ps-notif" data-reveal role="img" aria-label="Example lock-screen notification: generic text that reveals nothing">
                  <span className="ps-notif-icon" aria-hidden="true">
                    <svg width="20" height="10" viewBox="0 0 100 50" fill="none">
                      <path d="M 12,25 C 22,15 38,15 50,25 C 62,35 78,35 88,25" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div className="ps-notif-body">
                    <div className="ps-notif-top">
                      <span className="ps-notif-app">Sexualsync</span>
                      <span className="ps-notif-time">now</span>
                    </div>
                    <p className="ps-notif-text">Something in your room is waiting on you.</p>
                  </div>
                </div>
                <p className="ps-lockscreen-cap" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
                  This is all a lock screen ever says. The ask itself lives only inside.
                </p>
                <div className="ps-phone ps-privacy-shot" data-reveal style={{ "--d": "220ms" } as React.CSSProperties}>
                  <img src="/docs/screenshots/share/21-privacy-data.png" alt="The in-app privacy and data controls" loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- gallery */}
        <section className="ps-section ps-gallery" aria-labelledby="ps-gallery-title">
          <div className="ps-gallery-head">
            <p className="ps-eyebrow" data-reveal>From inside</p>
            <h2 className="ps-display" id="ps-gallery-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
              The room, <span className="ps-accent">screen by screen</span>.
            </h2>
          </div>
          <div className="ps-marquee">
            {[0, 1].map((copy) => (
              <div className="ps-marquee-half" key={copy} aria-hidden={copy === 1 || undefined}>
                {GALLERY.map((shot) => (
                  <figure className="ps-marquee-item" key={`${copy}-${shot.src}`}>
                    <div className="ps-phone">
                      <img src={shot.src} alt={copy === 0 ? shot.alt : ""} loading="lazy" decoding="async" />
                    </div>
                    <figcaption className="ps-marquee-cap">
                      <strong>{shot.name}</strong>
                      <span>{shot.cap}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- selfhost */}
        <section className="ps-section ps-selfhost" id="selfhost" aria-labelledby="ps-selfhost-title">
          <div className="ps-wrap">
            <p className="ps-eyebrow" data-reveal>The only way in</p>
            <h2 className="ps-display" id="ps-selfhost-title" data-reveal style={{ "--d": "90ms" } as React.CSSProperties}>
              There is no sign&#8209;up.
              <br />
              <span className="ps-accent">There never will be.</span>
            </h2>
            <p className="ps-lede ps-selfhost-lede" data-reveal style={{ "--d": "200ms" } as React.CSSProperties}>
              Sexualsync isn&rsquo;t a service you join. It&rsquo;s software you run.
            </p>
            <p className="ps-body ps-selfhost-body" data-reveal style={{ "--d": "290ms" } as React.CSSProperties}>
              Clone it, point it at your own server, and everything — the room, the media, the
              keys, the database — lives on hardware you control. <strong>Your data never
              touches anyone else&rsquo;s computer.</strong> The code is public; the rooms are not.
            </p>

            <div className="ps-terminal" data-reveal style={{ "--d": "360ms" } as React.CSSProperties}>
              <div className="ps-terminal-bar" aria-hidden="true">
                <i /><i /><i />
                <span className="ps-terminal-title">your-server ~ %</span>
              </div>
              <pre>
                <code>
                  <span className="ps-t-prompt">$ </span>git clone https://github.com/Aiml3ss/sexualsync.git{"\n"}
                  <span className="ps-t-prompt">$ </span>cd sexualsync{"\n"}
                  <span className="ps-t-prompt">$ </span>docker compose up --build{"\n"}
                  <span className="ps-t-comment"># the room is yours &rarr; http://localhost:8788</span>
                </code>
              </pre>
            </div>

            <div className="ps-selfhost-actions" data-reveal style={{ "--d": "420ms" } as React.CSSProperties}>
              <a className="ps-cta ps-cta-primary" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GithubMark />
                <span>Get the code on GitHub</span>
              </a>
              <a className="ps-cta ps-cta-ghost" href={PRESENTATION_URL}>
                View presentation
              </a>
            </div>

            <p className="ps-selfhost-fine" data-reveal style={{ "--d": "480ms" } as React.CSSProperties}>
              Open source under the PolyForm Noncommercial license — free to run for the two of
              you, not to resell. And sexualsync.io itself? That&rsquo;s the maintainers&rsquo; own
              room: a private instance of this same public code. You can&rsquo;t join it — you can
              have your own.
            </p>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="ps-footer">
        <WaveSigil className="ps-footer-sigil" />
        <p className="ps-footer-line">
          Say it without <span className="ps-accent">saying it.</span>
        </p>
        <nav className="ps-footer-links" aria-label="Legal and project links">
          <a href="/privacy.html">Privacy</a>
          <span className="ps-sep" aria-hidden="true">&middot;</span>
          <a href="/terms.html">Terms</a>
          <span className="ps-sep" aria-hidden="true">&middot;</span>
          <a href="/report.html">Report</a>
          <span className="ps-sep" aria-hidden="true">&middot;</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <span className="ps-sep" aria-hidden="true">&middot;</span>
          <a href={PRESENTATION_URL}>Presentation</a>
        </nav>
        <p className="ps-mono ps-footer-fine">Sexualsync &middot; open source &middot; self-hosted &middot; 18+</p>
      </footer>
    </div>
  );
}
