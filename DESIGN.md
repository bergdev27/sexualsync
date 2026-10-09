---
name: Sexualsync
description: A private, dark, candle-lit room for two. Wine surfaces, cream type, one rose accent.
colors:
  bg: "#170a10"
  bg-tilt: "#1c0c14"
  surface: "#23111a"
  surface-2: "#2c1622"
  surface-3: "#341a28"
  hairline: "rgba(243, 220, 217, 0.08)"
  hairline-strong: "rgba(243, 220, 217, 0.14)"
  cream: "#f3dcd9"
  cream-muted: "rgba(243, 220, 217, 0.65)"
  cream-faint: "rgba(243, 220, 217, 0.6)"
  cream-ghost: "rgba(243, 220, 217, 0.18)"
  ink: "#170a10"
  accent: "#e9a8b3"
  accent-soft: "#d39ba9"
  accent-deep: "#b87989"
  accent-fog: "rgba(233, 168, 179, 0.28)"
  accent-mist: "rgba(233, 168, 179, 0.12)"
  gold: "#d9a441"
  no: "#c98a82"
  yes: "#a8c9a0"
typography:
  display-moment:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "128px"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  display-xl:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "72px"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.015em"
  display-lg:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "48px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  display:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.005em"
  headline-sm:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
  caption:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
  numeric:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: "\"tnum\" 1"
rounded:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "44px"
  button-primary-disabled:
    backgroundColor: "rgba(243, 220, 217, 0.16)"
    textColor: "rgba(243, 220, 217, 0.44)"
    rounded: "{rounded.pill}"
  button-cta:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
    width: "100%"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-primary:
    backgroundColor: "{colors.accent-mist}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-warn:
    backgroundColor: "rgba(217, 164, 65, 0.18)"
    textColor: "{colors.gold}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-no:
    backgroundColor: "rgba(201, 138, 130, 0.14)"
    textColor: "{colors.no}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  act-chip:
    backgroundColor: "rgba(243, 220, 217, 0.04)"
    textColor: "{colors.cream}"
    rounded: "{rounded.md}"
    padding: "10px 13px"
    height: "44px"
  act-chip-picked:
    backgroundColor: "{colors.accent-mist}"
    textColor: "{colors.cream}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "44px"
  tab:
    textColor: "{colors.cream-faint}"
    typography: "{typography.caption}"
    height: "48px"
  tab-active:
    textColor: "{colors.cream}"
  sticky-action:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "4px"
    height: "58px"
  back-control:
    backgroundColor: "rgba(233, 168, 179, 0.14)"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    size: "44px"
  done-pill:
    backgroundColor: "{colors.accent-mist}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chat-bubble-mine:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 14px"
  chat-bubble-theirs:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 14px"
---

# Design System: Sexualsync

<!--
How to read this file. It documents the shipped system (web/src/app/globals.css
and the per-route sheets beside each page, polish-shared.css,
web/tailwind.config.ts, brand/tokens/) and records the v2 target rules that later redesign phases implement. Where today's code and the
v2 target differ, the frontmatter states the TARGET and the prose labels the
incumbent value as "Incumbent". Phase 03 introduces the named tokens marked
"(to introduce)". The brand palette, fonts and motifs are not up for change.
-->

## Overview

**Creative North Star: "The Candlelit Notebook"**

A private notebook two people share, opened late, in a dark room. The surfaces are deep wine and oxblood, close to black but warm. The text is cream, like paper in low light. One rose accent does the emotional work: the send button, the live state, the thing waiting for you. Gold is held back for "talk first" and warnings. Everything else stays quiet so that the couple's own words, and the occasional emoji, carry the screen.

The typography carries the intimacy. A high-contrast italic serif (Cormorant Garamond) sets titles and the big reveal moments, and a neutral humanist sans (Geist) handles everything you read or tap. The ribbon/infinity motif (the Sync Wave mark, two interlaced strokes) is the one recurring ornament. It shows up in the wordmark, the Home tab icon, splash and reveal moments, and it breathes slowly when something is live.

The interface is an operating tool, not a marketing page. It is used one-handed, at arm's length, in bed. Density is moderate, the primary action lives in the thumb zone, and nothing decorative should compete with the next tap. The landing page at `/` is the one persuasive surface. It may be more expressive, but it uses the same palette and type.

Rejected: adult-site visual language (neon, high-contrast red, thumbnail walls), dating-app patterns (swipe stacks, match animations, percentages), wellness pastel, and gamification (streaks, badges, scores). Light mode is not a goal.

**Key Characteristics:**
- Dark only: wine-black canvas with tonal surface layers instead of borders
- Cream text in three strengths, never below the faint floor
- A single rose accent, plus gold for caution
- Italic display serif for titles and moments; sans for all working text
- Pill-shaped actions pinned to the thumb zone
- Slow ambient atmosphere behind the content, never on top of it

## Colors

A warm monochrome of wine and cream with one rose accent and a sparing gold.

### Primary
- **Rose** (accent): primary buttons, the active tab icon, picked acts, your own chat bubbles, unread dots, links, focus rings and anything live. Contrast on the canvas is 9.9:1, and wine-black ink on rose is 9.9:1.
- **Dusk Rose** (accent-soft): secondary accent and hover tone on rose elements.
- **Pressed Rose** (accent-deep): pressed state, the far end of the own-bubble gradient, and "they want your take" moments. Ink on it is 5.6:1.
- **Rose Fog** (accent-fog) and **Rose Mist** (accent-mist): glow under the primary button, picked-state fills, and selected chip backgrounds. They are never used as text.

### Secondary
- **Candle Gold** (gold): Talk First and Soft Limit warnings, "on deck", caution chips, and the Blind Reveal accent. Contrast on the canvas is 8.6:1. Gold is a signal, so it never decorates.

### Tertiary
- **Faded Clay** (no): passes, declines and Hard No chips. It is muted on purpose so a no never reads as an alarm.
- **Sage** (yes): rare, for explicit "approved / ok" affordances only.

### Neutral
- **Wine Black** (bg): the canvas, the theme-color, and the text color on rose (`ink`).
- **Wine Tilt** (bg-tilt): a slightly lifted canvas used in gradients.
- **Oxblood** (surface), **Raised Oxblood** (surface-2), **Deep Plum** (surface-3): the three tonal layers for cards, raised controls and their bubbles. Depth comes from these steps, not from borders.
- **Cream** (cream): primary text and headings (14.8:1 on the canvas).
- **Cream Muted** (cream-muted, 0.65): body copy and secondary text (6.6:1).
- **Cream Faint** (cream-faint, 0.6): meta text, timestamps, placeholders and inactive tab labels (5.8:1 on the canvas, 5.2:1 on surface-3). This is the floor.
- **Cream Ghost** (cream-ghost, 0.18): decorative only. Use it for dividers and disabled fills, never for text.
- **Hairline** / **Hairline Strong** (0.08 / 0.14): inset 1px rings (`box-shadow: inset 0 0 0 1px`) on chips, ghost buttons and act chips.

### Named Rules
**The One Rose Rule.** Rose marks what is yours to act on or what is live. If two things on a screen are rose, ask which one is the next tap and quiet the other.

**The Cream Floor Rule.** No information-bearing text is set below cream at 0.56 alpha (4.77:1 on the deepest surface). Use `--cream-faint` (0.6). Hard-coded cream alphas of 0.32 to 0.5 for text are bugs. `brand/tokens/brand-tokens.css` still lists a stale 0.32 `--ss-cream-faint` and a 0.45 `--ss-soft-no`; the app overrides both, and neither may be used for text. Disabled controls (cream 0.42 to 0.44 on a 0.16 fill) are the only exemption.

**The Signal-Not-Paint Rule.** Gold, clay and sage only ever mean a state. They never fill a hero, tint a section or decorate.

## Typography

**Display Font:** Cormorant Garamond (with EB Garamond, Georgia, serif), weights 400 to 700, italic and roman, self-hosted via `next/font`
**Body Font:** Geist (with -apple-system, BlinkMacSystemFont, system-ui), weights 300 to 600
**Numeric Font:** JetBrains Mono (with IBM Plex Mono, ui-monospace), weights 400 and 500

**Character:** A literary italic serif against a plain, modern sans. The serif says this is personal and a bit romantic. The sans keeps the working parts calm and legible in the dark.

### Hierarchy (v2 target ramp)
The ramp is fixed at 12 / 13 / 15 / 17 / 20 / 24 / 30 / 38 px, plus display sizes 48 / 72 / 128 px. Every font size in product UI comes from this list. Tokens to introduce in phase 03: `--fs-12`, `--fs-13`, `--fs-15`, `--fs-17`, `--fs-20`, `--fs-24`, `--fs-30`, `--fs-38`, `--fs-48`, `--fs-72`, `--fs-128`, with Tailwind `fontSize` keys to match.

- **Display moment** (Cormorant 500 italic, 128px / 72px, 0.9 to 0.95): the single-word reveal ("yes.") and full-screen magic moments only.
- **Display** (Cormorant 500 to 600 italic, 38px / 48px, 1.0): landing hero, splash and sign-in titles.
- **Headline** (Cormorant 500 italic, 30px, 1.1): top-level screen titles (Sexboard, Play, Sext, Us).
- **Headline small** (Cormorant 500 italic, 24px, 1.15): section titles, card titles on reveal screens, sheet titles.
- **Title** (Geist 600, 20px, 1.25): drill-down screen titles when a serif would be too ornate, dialog titles.
- **Body large** (Geist 400, 17px, 1.45): Ask notes and longer reading text in Inspiration. Keep lines to about 65ch.
- **Body** (Geist 400, 15px, 1.5): default UI text, chat messages, buttons, inputs, list rows.
- **Label** (Geist 500, 13px, 1.35): chips, field labels, tab labels, secondary metadata.
- **Caption** (Geist 500, 12px, 1.35): timestamps, hints and helper text. 12px is the floor for any text that carries information.
- **Numeric** (JetBrains Mono 500, 12 to 13px, tabular figures): counts, timers, health stats and chat timestamps, where columns of numbers need to align. Nothing else.

**Incumbent.** Today the app uses 36 distinct sizes and half of them are under 13px. The mono eyebrow is 10px, uppercase, tracked 0.18em, in cream-faint. Tab labels are 10px, the unread badge is 8px mono at weight 900, and there are many 9 / 9.5 / 11 / 12.5 / 13.5px one-offs. Screen titles use the Tailwind `display-lg` (32px) italic. Tailwind's `xs` is pinned to 13px. All of these converge on the ramp above.

### Named Rules
**The Twelve Floor Rule.** Text that tells the user something is at least 12px. 11px is allowed only for purely decorative text that a screen reader skips and that nobody needs to read.

**The Serif Threshold Rule.** Cormorant only appears at 18px or larger. Below that its hairlines disappear in low light, so use Geist.

**The Mono Is For Numbers Rule.** JetBrains Mono is for numerals and timestamps that benefit from tabular alignment. It is not a label style and is never set as uppercase scaffolding.

**The Sentence Case Rule.** UI labels, buttons, tabs, chips and headings use sentence case ("Mark done", "Talk first"). Uppercase is reserved for acronyms.

**The One Kicker Rule.** Screens do not get a default eyebrow above the title. One deliberate kicker style is allowed, used sparingly: Geist 13px, weight 500, sentence case, rose or cream-muted, no tracking. Use it only where the line adds information the title cannot carry, such as "From Alex · 2h ago" above an Ask.

## Layout

**Column.** A single centered column capped at 440px (`max-w-app`), designed at 390px and checked at 360 and 430. Wider mobile viewports get the same centred column (desktop user agents see the product site, not the app). The side gutter is 20px (`px-5`), and cards inside the column inset to the same edge.

**Spacing.** A 4px base: 4 / 8 / 12 / 16 / 20 / 24 / 28 / 32, extended with 40 and 48 for section breaks. These exist today as `--ss-space-1..8` in `brand/tokens/brand-tokens.css` but are not consumed by the app. Phase 03 introduces `--space-1` to `--space-12` in `globals.css` and stops new code using raw pixel gaps. Default rhythm: 8px inside a control group, 12 to 16px between related blocks, 24 to 32px between sections.

**Safe areas.** The shell insets for the notch (`--safe-area-top`) and the home indicator (`--safe-area-bottom`). The tab bar and sticky action both sit above the home indicator.

**Bottom chrome stack.** The tab bar reserves `--tabbar-height` (88px including the safe area). The sticky action floats `--sticky-action-gap` (24px, enough to clear the raised Ask disc) above it at `--sticky-action-height` (58px). Main content reserves `--shell-bottom-room` so the last item can scroll clear of both. When the tab bar is hidden (`.app-shell-no-tabbar`) the sticky action drops to the safe-area edge. When the keyboard is up, the tab bar slides away and the sticky action lifts by `--kb-inset`.

**Scroll padding (v2).** Focused inputs and focus rings must never hide under the fixed chrome. Set `scroll-padding-bottom` on the scroller to `--shell-bottom-room`.

**Z-index scale (to introduce in phase 03).** Today's values are scattered (1, 2, 40, 45, 60 to 62, 79, 80, 120, 1000, 9999, 10000). Replace them with named layers:

| Token | Value | Use |
|---|---|---|
| `--z-raised` | 1 | Local stacking inside a component |
| `--z-sticky` | 10 | In-flow sticky headers and filters |
| `--z-tabbar` | 40 | Bottom tab bar |
| `--z-sticky-action` | 45 | Pinned primary action |
| `--z-toast` | 60 | Live activity toasts |
| `--z-pill` | 70 | Install / update pills |
| `--z-overlay` | 80 | Backdrops, reaction menus |
| `--z-sheet` | 90 | Bottom sheets, settings sheet |
| `--z-dialog` | 100 | Confirm dialogs |
| `--z-lightbox` | 110 | Full-screen media viewers |
| `--z-feedback` | 120 | Full-screen non-interactive effects (send pulse) |
| `--z-skip-link` | 130 | Skip link when focused |

### Named Rules
**The Thumb Zone Rule.** A screen with one primary action pins it with `StickyAction`, above the tab bar or the safe area. The user never scrolls to find Send.

**The Tab Bar Visibility Rule.** The tab bar is shown on browse screens (Home, Play, Sext, Us and their lists). It is hidden on focused task flows: replying to an Ask, every game runner (Sex Quiz, Green Lights, The Pile, Blind Reveal), the Shelf, the Vault and Mutual. Visibility is decided per route by `AppShell hideTabBar`, never by scroll position.

## Elevation & Depth

Depth is tonal first. The canvas, surface, surface-2 and surface-3 steps separate layers, and a 1px inset hairline ring defines edges instead of a border. Shadows are soft and dark and used sparingly: a faint top highlight plus a long low shadow under cards, and a rose glow under the primary action so it reads as lit from within. Behind everything sits the atmosphere: two oversized radial blooms (rose at the top, deep wine at the bottom) and a 5% grain overlay. These make the black feel warm rather than dead.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 0 rgb(243 220 217 / 0.04), 0 10px 28px -18px rgb(0 0 0 / 0.42)`): resting cards.
- **Primary glow** (`box-shadow: 0 8px 24px var(--accent-fog), inset 0 1px 0 rgba(255,255,255,0.16)`): primary and CTA buttons only.
- **Floating panel** (`box-shadow: 0 14px 40px rgba(0,0,0,0.34), 0 0 24px var(--accent-fog), var(--ring-hairline)`): the sticky action panel.
- **Own bubble lift** (`box-shadow: 0 4px 16px rgb(233 168 179 / 0.26)`): your chat bubbles.
- **Hairline ring** (`box-shadow: inset 0 0 0 1px var(--hairline)`): chips, ghost buttons and act chips. The accent ring variant marks picked state.

### Named Rules
**The No Nested Cards Rule.** A card never sits inside a card. Inside a card, group with spacing, a hairline divider, or a surface-2 row, and never with another bordered, shadowed container.

**The Still Chrome Rule.** Persistent chrome (tab bar, sticky action, headers) gets no decorative `backdrop-filter` blur. Use an opaque or near-opaque fill (surface at 0.96, or the existing dark gradient) instead. *Incumbent:* the tab bar uses `blur(14px)` and the sticky action panel `blur(16px)`; v2 removes both. Blur stays acceptable on transient full-screen overlays such as lightboxes.

**The Background Stays Behind Rule.** The atmosphere is fixed to the viewport (not document height), uses gradient falloff instead of `filter: blur`, pauses its drift when the page is hidden, and is static under `prefers-reduced-motion`. *Incumbent:* blurred blooms drift on infinite 28s and 34s loops across the full document height.

## Shapes

Soft and rounded, never sharp. Actions are full pills (999px). Act chips and inputs are gently rounded rectangles (16px and 12px), and cards are 20px. Chat bubbles are 20px.

The radius scale is `--r-xs` 8px, `--r-sm` 12px, `--r-md` 16px, `--r-lg` 20px and `--r-pill` 999px. *Incumbent:* `--r-xl` duplicates 20px, and one-off 14, 18, 22, 24 and 28px radii are scattered through `globals.css`. These fold into the scale. Phase 03 makes the scale global (it currently lives on `.surface`).

Circles are reserved for the back control, avatars/initials, the unread badge and the brand dot. The ribbon/infinity stroke is the only organic shape. It is drawn as two parallel cubic waves (the second at 45% opacity) and is never boxed.

### Named Rules
**The No Side Stripe Rule.** No coloured `border-left` or `border-right` accents on cards, list rows or callouts. Signal state with a chip, an icon, or the surface tint. (Three incumbent instances in `globals.css` get removed.)

## Components

### Buttons
Tactile, lit pills that give under the thumb.
- **Shape:** full pill (999px), minimum height 44px.
- **Primary:** rose fill, wine-black text, Geist 15px semibold, with the primary glow. `.btn-primary` is the inline size (12px by 20px) and `.cta-primary` the full-width thumb-zone size (16px by 24px).
- **Press:** scales to 0.97 on `:active` over 120ms ease-out, then springs back with the overshoot curve. This press-and-release is the one place the spring belongs.
- **Ghost:** surface fill with a hairline ring and cream text. Use it for secondary actions beside a primary.
- **Disabled:** a flat cream 0.16 fill with 0.44 text and no glow. It never just fades.
- **Focus:** a visible rose ring (`--ring-accent`) on `:focus-visible`.

### Chips
- **Style:** pill, 13px label, surface fill with a hairline ring, cream-muted text.
- **State variants:** `chip-primary` (rose on mist) for yours or live, `chip-warn` (gold) for Talk First, Soft Limit and on deck, `chip-no` (clay) for passes and Hard No.
- **Act chips:** the Ask picker. A 16px-radius rectangle, 44px tall, with emoji plus name, and a rose ring with mist fill when picked. Selectable chips expose `aria-pressed` (or are radios in a group). *Incumbent gap:* most chips carry no ARIA state. The act grid must not reorder under the finger while the user is picking.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** surface, with surface-2 for raised rows inside.
- **Shadow Strategy:** the Card shadow from Elevation & Depth.
- **Border:** a 1px hairline (`border-line`).
- **Internal Padding:** 16 to 24px.
- **Empty and error states** (`States.tsx`) are centered cards with a 18px+ serif title, a muted body line and one action. Errors always offer a retry. Loading is a skeleton that matches the final card shape, never a bare spinner.

### Inputs / Fields
- **Style:** surface fill, 1px hairline, 12px radius, 44px minimum height, 15px text. Placeholders use cream-faint (0.6) and never anything lower.
- **Focus:** the border shifts to rose with no glow.
- **Labels:** every input has a visible label or an `aria-label`. *Incumbent gap:* three inputs are unlabeled.

### Navigation

**Tab bar (shipped in v2).** Five slots: **Home · Play · + Ask · Sext · Us** (`components/TabBar.tsx`). Four are a 22px stroke icon over a 12px label, inactive in cream-faint and active in cream with a rose icon. Ask is the centre slot: a 52px rose disc with an ink plus, raised 30px so it breaks the bar's top edge, ringed in the bar's own fill, with its "Ask" label on the same baseline as the others. It's part of the bar, not a floating button over content. The bar is near-opaque with no blur (see The Still Chrome Rule). Unread counts show as a rose pill badge with a matching sr-only "N unread". The incumbent had six equal columns (Sexboard, Ask, Sext, Inspiration, Reveals, Space) with 10px labels.

**Which tab lights up.** Home covers `/sexboard` (and `/tonight`). Play covers `/games/*` plus `/inspiration/*`, `/ideas/*` and `/shelf`. Ask covers `/ask`. Sext covers `/chat`. Us covers `/space/*` and `/limits`. Activity badges follow the same map (`ACTIVITY_RESOURCE_TAB` in `lib/activity.ts`): Asks and mood matches badge Home; Kinks, the Shelf, The Pile and Blind Reveal badge Play; the Vault badges Us. The PWA icon badge is a separate needs-you count and does not use this map.

**Play hub.** One screen, two sections, no segmented control. *Reveals* comes first: games waiting on you (your turn, or both answers in) float to the top as full art tiles, and the rest sit as compact rows in a single list whose second line is their status ("Waiting on Jordan", "In progress · 12 of 40") or, for an untouched game, a one-line description. A room that hasn't started anything gets one full tile (Sex Quiz) as the place to begin. *Inspiration* follows: today's prompt as a serif quote that opens the composer, then rows for Kinks, fantasies & confessions, the Shelf, and Watch and read. Those rows are pointers only. The composer, library and source links live once, on `/inspiration`, which is a drill-down with "‹ Play".

**Us and the Settings sheet.** Us holds what the couple shares, as two short lists: *Together* (Limits, Acts library, Health, Private Vault, Private notes, each with a live summary) and *Privacy and help* (Privacy & data, Quick tour), then the version chip. Everything that configures the app lives in a Settings sheet opened from a 44px gear in the Us header: a native `<dialog>` (focus trapped, Escape and backdrop close it, focus returns to the gear), up to 94dvh tall with its own scroll and a safe-area bottom inset. Order: Notifications, Privacy toggles, Room encryption, Account, Feedback, Early access note, Ko-fi link. `/space?settings=1` opens it directly.

**Notification presets.** Three radio presets over the per-device push tags, plus "Customize" to show every tag as its own switch. *Everything* turns every tag on (the default). *Only what needs me* keeps Sexts, new Asks, Ask replies and reminders, Pile starts, Quiz and Green Lights turns, and mood matches, and drops Kink nudges, Pile countdowns and Blind Reveal ready. *Quiet* keeps only new Asks and mood matches. When the switches match no preset, no radio is checked and Customize reads "your own mix". Presets write the same preference map the server already filters on.

**Header pattern (one per screen type).**
- **Top-level tab screens** (Home, Play, Sext, Us) get a serif headline and no back control.
- **Drill-down screens** (an Ask's detail, a kink entry, a section of Us such as Limits, Health or the Vault) get a 44px circular chevron back control in rose on a 0.14 rose fill, followed by the parent's name ("‹ Play"). The control links to the parent route, not `history.back()`. *Incumbent:* a 30px chevron sits inline with the eyebrow; it grows to 44px and the eyebrow goes.
- **Modal-style flows** (reply, compose, settings sheet, game runners) get a "Done" pill (44px tall, rose on mist, sentence case) at the top right. There is no chevron.

The incumbent has seven different back/close patterns. They all converge on these three.

### Naming glossary
Surfaces and their canonical UI names. Routes are internal and can differ.

| v2 name (UI) | Route | Incumbent label | Notes |
|---|---|---|---|
| **Home** | `/sexboard` | Sexboard | The tab and the screen-reader route name say "Home". The screen keeps "Sexboard" as its headline. |
| **Ask** | `/ask`, `/ask-detail`, `/review` | Ask | Centre slot (the + disc). A sent request is an "Ask", never a "request" in the UI. |
| **Sext** | `/chat` | Sext | Always "Sext" in UI, never "Chat". |
| **Play** | `/games` | Reveals | Headline "Play". Holds the four games under a "Reveals" section heading, and Inspiration. Game runners' back control reads "‹ Play". Never "Games" in the UI. |
| **Reveals** | (section of Play) | Reveals | The double-blind games as a group: Sex Quiz, Green Lights, The Pile, Blind Reveal. A section name, not a tab. |
| **Inspiration** | `/inspiration`, `/ideas`, `/inspiration/shelf` | Inspiration | A drill-down inside Play ("‹ Play"). "Ideas" is retired as a UI label, including the home-screen shortcut. The Shelf keeps its name. |
| **Us** | `/space` | Space | Headline "Us". The couple's room: limits, acts, notes, health, Vault, privacy. Its drill-downs read "‹ Us"; "Open Us" on empty states. Settings open as a sheet from the gear. |
| **Settings** | `/space?settings=1` | (part of Space) | The sheet over Us. Notifications, privacy toggles, Room encryption, account, feedback. |

Field names: the Ask's time field is **Timing** on both compose and reply (incumbent: "Cadence" on compose, "Counter time" on reply). Raw status codes (`IDLE`, `sent`, `on_deck`) are never shown; show human labels such as "Waiting on them", "On deck" and "Done".

### Sticky action
`StickyAction` wraps the screen's one primary action in a floating pill panel (58px, surface at 0.96, floating-panel shadow, 4px inner padding). It sits 24px above the tab bar (clear of the raised Ask disc), or at the safe area when the bar is hidden, and lifts with the keyboard.

### Chat bubbles (Sext)
Yours are a rose-to-pressed-rose gradient with ink text and a soft rose lift. Theirs are surface-3 with cream text and a hairline ring. Both are 20px radius with 9px by 14px padding, and message text is body size (15px). Timestamps and day dividers use the caption or numeric style at cream-faint or stronger.

### Brand wordmark and the ribbon
The split wordmark "sexual · sync": Cormorant italic, "sexual" in cream, "sync" in rose, a small rose dot between them, and the two-stroke Sync Wave ribbon in front with a soft rose drop-glow. It appears on the landing page, splash, sign-in and the Home header. The ribbon also serves as the Home tab icon, and it breathes (opacity 0.78 to 1, scale 0.995 to 1.012, 6.4s) only while something is live.

### Motion
**Durations.** State transitions run 150 to 250ms with ease-out curves (`--ease-settle` `cubic-bezier(0.22, 1, 0.36, 1)` or `--ease-enter` `cubic-bezier(0.16, 1, 0.3, 1)`). Exits run faster than entrances (`--ease-exit`, about 160ms). A tap response is 120ms. *Incumbent:* `--dur-state` 320ms, `--dur-route` 520ms and `--dur-enter` 460ms all exceed the target. Phase 03 retunes them to roughly 200ms, 240ms and 240ms.

**Spring.** `--ease-spring` / `--ease-press` (`cubic-bezier(0.34, 1.56, 0.64, 1)`) is for small "pop" feedback only: a button release, a chip pick, a bubble arriving, a badge count. It never animates layout, height, position of content blocks, or route changes.

**Ambient loops.** Every infinite animation (atmosphere drift, ribbon breath, skeleton shimmer, loader signal) has a `prefers-reduced-motion: reduce` override that stops it, and pauses when the document is hidden.

## Do's and Don'ts

### Do:
- **Do** keep the canvas wine-black (#170a10) and build depth with the surface, surface-2 and surface-3 steps plus hairline rings.
- **Do** use rose for the single next action or the live state on a screen, and gold only for Talk First, Soft Limit, on deck and caution.
- **Do** set every font size from the 12 / 13 / 15 / 17 / 20 / 24 / 30 / 38 ramp (48 / 72 / 128 for display moments).
- **Do** use Cormorant italic for titles and moments at 18px or larger, and Geist for everything you read or tap.
- **Do** use sentence case for every UI label, button, tab and chip.
- **Do** pin the primary action with `StickyAction` in the thumb zone.
- **Do** make every touch target at least 44 by 44px, including back controls, prev/next arrows and chip remove buttons.
- **Do** keep text at 4.5:1 or better: cream-faint (0.6) is the floor, never a hard-coded cream alpha below 0.56.
- **Do** use one header pattern per screen type: no back control on top-level tabs, a 44px chevron plus parent label on drill-downs, a "Done" pill on modal-style flows.
- **Do** hide the tab bar on focused task flows (reply, game runners, Shelf, Vault, Mutual) and show it on browse screens.
- **Do** keep state transitions at 150 to 250ms with ease-out, give every infinite animation a reduced-motion override, and pause it when the page is hidden.
- **Do** use the canonical names: Home, Play, Ask, Sext, Us, Inspiration, Timing.
- **Do** expose selection state on chips with `aria-pressed` or radio semantics, and label every input.

### Don't:
- **Don't** add a light theme or light surfaces.
- **Don't** put a mono, uppercase, wide-tracked eyebrow above titles by default. If a kicker earns its place, use the one sanctioned style (Geist 13px sentence case).
- **Don't** set information-bearing text below 12px, or Cormorant below 18px.
- **Don't** use JetBrains Mono for labels; it is for numerals and timestamps only.
- **Don't** use side-stripe borders (`border-left` / `border-right` accents) on cards, rows or callouts.
- **Don't** nest a card inside a card.
- **Don't** put decorative `backdrop-filter` blur on the tab bar, sticky action or headers.
- **Don't** use the spring/overshoot curve on layout, route changes or anything larger than a small pop.
- **Don't** reorder a list or grid while the user's finger is on it.
- **Don't** use adult-site visual language (neon, high-contrast red, thumbnail walls), dating-app swipe or match patterns, wellness pastels, or gamification (streaks, badges, scores).
- **Don't** show raw status codes (`IDLE`, `sent`) or use retired names (Reveals, Games, Chat, Ideas, Space, Cadence) in UI copy.
- **Don't** hard-code z-index values. Use the named layer scale once phase 03 lands it.
