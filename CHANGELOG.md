# Changelog

User-visible changes to Sexualsync. Self-hosters on Docker update with
`docker compose pull && docker compose up -d`; from a source clone, `git pull`
and a rebuild (see `docs/self-host/`).

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
