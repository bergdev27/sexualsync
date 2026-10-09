# Product

<!-- impeccable:product-schema 1 -->

<!--
Provenance: captured non-interactively for the v2 redesign program. Product
answers came from the program brief written on the maintainer's behalf; the
rest comes from repository evidence (README.md, docs/DESIGN_BRIEF.md,
brand/copy.md, docs/self-host/, web/src). Facts marked "(inferred)" rest on
repository evidence alone and have not been confirmed by a person.
-->

## Platform

web

Mobile PWA first. The app is designed at 390px wide, verified at 360 and 430, and installed to the iPhone Home Screen. A desktop browser (a non-mobile user agent) gets the product site instead of the app; a phone or tablet user agent at any width gets the app in the same centred 440px column.

## Users

Two consenting adults (18+) in an established relationship, sharing one private room. That is the whole audience of an install. There are no other roles apart from an optional operator/admin status page for whoever runs the instance.

Typical situation: evenings, low light, often in bed, holding an iPhone in one hand. Sometimes the partner is in the next room and the app is how the question gets asked. The person may be a little nervous about asking for something new, may be answering something their partner sent and feel pressure to answer "right", or may be curious and not ready to commit.

The job: say what you want, out loud or close to it, without the awkward pause. That means sending a concrete Ask, answering one honestly, finding the overlap in what you both want, and keeping the fantasies and limits that sit around those conversations somewhere private.

## Product Purpose

Sexualsync is a private room where a couple can explore sex together. Some things are easier to type than say. The product makes them sayable, gives the answer a shape (yes, maybe, a counter, a pass), and keeps everything inside the room.

Success looks like this: asking feels lighter than a cold conversation, saying no feels as available as saying yes, and the couple ends up with more things they actually do together.

## Positioning

The mechanism is structure plus privacy for exactly two people:

- An Ask is a concrete request for physical acts, with timing and a note. The partner answers per item rather than with a blanket yes/no, and can counter.
- Double-blind reveal games (Sex Quiz, Green Lights, The Pile, Blind Reveal) let each partner answer in private. Only what overlaps, or what both agree to reveal, comes back. Neither person has to go first.
- The room is self-hosted, single-couple, and has nothing social in it: no feed, discovery, profiles or followers.

## Operating Context

- **Installed PWA.** Most use is from the Home Screen icon, which is deliberately generic. The document title is "Private notes", the home-screen label is "Private", and share previews avoid naming the product category. Anyone glancing at the phone should learn nothing.
- **Two people, often asynchronous.** One partner sends, the other answers later. Realtime presence and push notifications connect them, and notification copy stays generic by default.
- **Short sessions, one hand.** Asks get sent from bed, from the couch, or from the next room. Reveal games are played side by side or apart.
- **Self-hosted.** One codebase runs on two runtimes (Cloudflare and a Node self-host edition). Each install serves one couple. There is no public hosted service and no signup product. See CLAUDE.md rule 6 and `docs/self-host/`.

## Capabilities and Constraints

Confirmed capabilities (README.md, web/src/app routes):

- **Sexboard (home).** Active Asks, partner activity, overlaps, and anything waiting on you.
- **Ask.** Choose acts from a shared, editable library, set timing (Tonight / Mid-day / Tomorrow / Next week), filming preference, and a note. The partner answers each item with Yes, Maybe, Let's chat, Counter or No. A Maybe stays answerable and resurfaces when its timing window arrives. Unanswered Asks expire.
- **Reveals.** Sex Quiz, Green Lights, The Pile and Blind Reveal are all double-blind.
- **Sext.** A private two-person chat. Images are encrypted in the browser before upload.
- **Inspiration.** A kinks/fantasies/confessions library, curated external links, and the Shelf (saved clips, passages and ideas).
- **Limits.** Hard No (blocks), Talk First and Soft Limit (warn), Yes With Conditions (note). Limits are checked before an Ask is sent.
- **Vault.** Private media encrypted in the browser with a passphrase the server never receives.
- **Health stats, notes, Room Encryption (optional E2EE), export, deletion, push.**

Constraints future work must respect:

- **Dark only.** Dark is the brand. There is no light mode, and none is planned.
- **Privacy is product behaviour.** Login gates all intimate content. Private API responses are `no-store`. Notifications and email stay generic. Discreet surfaces (title, icon, previews) must not out the product category.
- **Two runtimes, one UI.** `web/` builds once and is served by both editions. UI work must not depend on Cloudflare-only behaviour.
- **License.** PolyForm Noncommercial 1.0.0. Do not describe the product as a hosted service people can sign up for.
- **No fabricated social proof.** See Evidence on Hand.

Terminology (canonical product terms; surface and tab names live in DESIGN.md's naming glossary):

- **Ask**: a request for acts, sent to the partner. Prefer "Ask" over "request" in UI copy.
- **Counter**: an alternative act, timing or wording offered in place of the original.
- **Maybe**: a deferrable answer that stays open, not a soft no.
- **Reveal**: any double-blind game result.
- **Limit**: Hard No, Talk First, Soft Limit or Yes With Conditions.
- **Room**: the private space one couple shares.

## Brand Commitments

- **Name.** Sexualsync, one word, title case in prose. The mark is the split wordmark "sexual · sync" with a rose dot (`brand/wordmark/`) beside the Sync Wave ribbon (`brand/marks/`).
- **Tagline.** "Get curious. Get in sync." Always both sentences, in that order (`brand/copy.md`).
- **Voice.** Direct, adult and frank, and still kind. A little filthy, never judgmental. The product copy says the word rather than hiding behind asterisks: "Let the slut in you talk: no shame, no judgment, and nothing leaves this room unless you both want it." Emoji on acts and chips are part of the voice. The app never coaches, scolds or congratulates.
- **Mood.** Private, warm, frank, zero judgment. A private notebook the two of you share, not a porn site, a wellness app or a form builder (`docs/DESIGN_BRIEF.md`).
- **Discretion.** The generic outer identity ("Private notes", "Private") is a deliberate commitment, not a placeholder.
- **Visual identity.** Binding at the brand level: dark wine/oxblood surfaces, cream text, rose accent, Cormorant Garamond display serif, the ribbon/infinity motif. DESIGN.md documents the system.

## Evidence on Hand

- Real product screenshots: `docs/screenshots/share/` (used by the landing page and `presentation.html`).
- Brand assets: `brand/marks/` (Sync Wave mark, app icons 20 to 1024px), `brand/wordmark/`, `brand/tokens/`, approved strings in `brand/copy.md`.
- Product and design background: `docs/DESIGN_BRIEF.md` (parts of its font and IA notes are stale; the shipped code wins), `PRODUCT_BACKLOG.md`.
- Security and privacy documentation: `docs/e2ee-threat-model.md`, `docs/crypto-review-packet.md`, `SECURITY.md`.
- The repository contains no testimonials, user counts, reviews, press or pricing. Do not invent any.

## Product Principles

1. **Private by default.** Nothing feels exposed, indexable or loosely handled. When discretion and convenience conflict, discretion wins.
2. **Both partners author.** Neither is a passive recipient. Asks, limits, ideas and acts belong to the couple.
3. **No is as easy as yes.** Maybe, counter, pass and talk-first are core primitives, and none of them should read as rejection or as pressure.
4. **One hand, low light, short window.** The next action sits in the thumb zone and the screen asks for as little as possible.
5. **Frank, never shaming.** The copy can be explicit where the couple is. The interface stays calm and keeps out of the way.

## Accessibility & Inclusion

- WCAG 2.1 AA as the floor. Text contrast is at least 4.5:1 on every dark surface. The low-light, at-arm's-length use case makes this stricter in practice.
- Touch targets are at least 44×44px. Primary actions must be reachable one-handed.
- Honour `prefers-reduced-motion`. Ambient animation must never be required to understand state.
- Screen-reader support for route changes (focus moves to `#app-main`) and live state changes (inferred from `RouteAnnouncer`, `States.tsx`).
- Inclusive by design: the acts library and limits are user-editable so the couple's own words win over built-in vocabulary.
