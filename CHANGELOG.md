# Changelog

User-visible changes to Sexualsync. Self-hosters on Docker update with
`docker compose pull && docker compose up -d`; from a source clone, `git pull`
and a rebuild (see `docs/self-host/`).

## 2.1.0

Built from research on what raises desire in long-term couples and what
quietly kills it. Short version: lower the stakes and lust follows.

### Saying yes, no and maybe

- **Pass warmly.** Pass is still one tap and never needs a reason. You can add
  "Not tonight, I still want you", "Love that you asked", or a rain check
  ("Ask me this weekend"). The person who asked never sees a cold "Passed".
- **Rain checks** come back to the asker as a gentle "Try this again?" on Home
  at the time you picked. It's their call; nothing re-sends on its own.
- **No nagging.** No automatic reminders. One manual nudge per Ask, ever, and
  never after a pass or a maybe. The same Acts rest for a week after a pass.
  No "Seen" receipts.
- **Quiet hours** for notifications on each device. Your partner can't tell.
- **Change of plans.** Either of you can take back a yes or clear a plan with
  no blame and no record of a cancel.
- **Slow touch, no finish line** is a new built-in Act for a low-key way in.

### Desire

- **"I'm horny" has a second mode: "Open to being seduced."** For the many
  people whose wanting shows up once things start. Horny + open is a match
  too, and it reads right from each side.
- **Plan it** says what the research says: planned sex is as good as the
  spontaneous kind, and the waiting is half the fun. Send a teaser after you
  plan.

### Reveals and Health

- **No scores.** The quiz "% in sync" and Green Lights tallies are gone. You
  see what you both want, not how you rate as a couple.
- **Every match can become an Ask** (or a plan) in one tap.
- **"What lights them up"** shows what you both matched on that your partner
  especially wants, as an offer, never a to-do list.
- **Stronger double-blind.** Reveal rounds need real answers, can't be
  re-run every few minutes, and never show a partner's misses, timestamps or
  progress. Green Lights shows where you agree; differences open only if you
  both choose to compare. The Pile needs two drops from each of you.
- **Health** shows moments, favorites and firsts. Counts and the rhythm chart
  are a private opt-in for each of you.

### Saying it out loud

- **Warm one-tap replies** on kinks and sexts ("Into it", "Tell me more",
  "Saving this for later"). Nothing demands a reply.
- **Label what you share:** just a fantasy, want to talk about it, or want to
  try it. Riskier themes get a "talk first?" step before they become an Ask.
- **How common is this?** Some fantasies carry a short, sourced note, with a
  "Why we say this" page.
- **Your voice** in Settings: how spicy prompts get and how filthy the app
  talks to you. Each of you sets your own.
- **Sext prompts** like "I want you because…" and "Tell me one thing you'd do
  to me tonight."
- **Words I like:** new Green Lights cards for the words you like being called
  and using. Only the ones you both said yes to are revealed.
- **The Shelf** leads with "Send to" and "Watch together". Private saves stay
  private; if you both save the same thing, it shows as "You both saved this".

## 2.0.2

### Changed

- The mood light is now **I'm horny**: same double-blind switch on Home, more
  direct words. A match reads "You're both horny."

### Fixed

- History in Inspiration (the kinks, fantasies and confessions library, the
  Shelf and kink detail) showed "last week" for anything older than a week.
  Older items now show their date.

## 2.0.1

### Self-hosting

- Run the published image with Docker Compose, no clone needed: download
  `docker-compose.yml` and run `docker compose up -d`. Images for amd64 and
  arm64 are published to `ghcr.io/bergdev27/sexualsync` for every release.
  Update with `docker compose pull && docker compose up -d`.
- Building from source moves to the `docker-compose.build.yml` override.

## 2.0.0

A redesign of the whole app. Same room, same data, and nothing to migrate:
your Asks, games, limits, Shelf, Vault and messages carry straight over.

### Navigation

- Five tabs instead of six: **Home**, **Play**, **Ask**, **Sext** and **Us**.
  Ask is the raised + in the middle of the tab bar, so a new Ask is always one
  tap away.
- **Home** (the Sexboard) leads with what needs you, what you're waiting on,
  and what you've planned, then partner activity.
- **Play** brings the four reveal games (Sex Quiz, Green Lights, The Pile,
  Blind Reveal) and Inspiration together on one screen. Games waiting on you
  float to the top.
- **Us** replaces Space. It holds what the two of you share (Limits, the acts
  library, Health, the Vault, private notes) plus Privacy & data and the
  quick tour. Everything that configures the app moved into a **Settings**
  sheet opened from the gear on Us.
- Every screen uses one of three headers: a title on the tabs, a back control
  with the parent's name on drill-downs, and a Done pill on focused flows. The
  tab bar hides while you answer an Ask, play a game, or use the Shelf.

### New

- **Mood light** on Home. Switch it on for a while; your partner only finds
  out if theirs is on at the same time.
- **Answering an Ask** happens on one focused card: yes to all, maybe, pass,
  or counter with something else. A short undo window catches a mis-tap.
- **The match moment**: when you both say yes, the result gets its own
  screen, and either of you can plan it for a time.
- **Notification presets** in Settings: Everything, Only what needs me, or
  Quiet, with every switch still available under Customize.

### Better

- The app shell opens even offline, screens show what they last loaded right
  away, and they catch up when the connection returns. Failed loads always
  offer a retry, and a screen that crashes shows a way back instead of a
  blank page.
- The send button on Ask stays in reach above the tab bar instead of below
  the fold.
- Larger, consistent text (12px is the floor), stronger contrast on muted
  text, visible keyboard focus, labelled inputs, and 44px touch targets.
- Calmer motion: the background stays still, loops pause when the app is in
  the background, and reduced-motion settings are respected everywhere.
- Lighter pages: each screen downloads only its own styles (about half the
  CSS it used to), landing screenshots are small WebP files, and the brand
  fonts ship with the app instead of coming from a font service.
- Consistent naming throughout: Home, Play, Ask, Sext, Us, Inspiration and
  Timing.
