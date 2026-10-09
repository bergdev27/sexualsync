"use client";

/**
 * Per-person desire settings: how spicy the prompts get, and how explicit the
 * app talks to you. Both live on your own profile and are never shown to your
 * partner.
 *
 * Why per person: self-chosen explicit language can feel empowering, but the
 * effect depends on choosing the word for yourself (Galinsky et al. 2013,
 * Psychological Science; Klysing et al. 2024 found reclaimed labels judged
 * more offensive when applied by others). So the filthier register is opt-in
 * per person and only changes copy addressed to that person.
 *
 * Why a prompt ceiling and a low-to-high order: what predicts holding a
 * fantasy back is the perceived risk of sharing it, not its category
 * (Kimberley, Jones & Elliott 2025). Prompts start with likes and favorite
 * memories and climb from there, and each person decides how far they go.
 *
 * The curated copy that follows the voice setting (keep this list short and
 * explicit; not every string in the app):
 *  - Home greeting (sexboard/page.tsx `greeting`)
 *  - Inspiration header, composer placeholder, empty library
 *    (inspiration/page.tsx)
 *  - Sext empty thread (chat/page.tsx)
 */

import { useEffect, useState } from "react";
import { getProfileCached, PROFILE_STALE_EVENT, subscribeProfile } from "./profile-cache";
import type { ProfileResponse } from "./types";

export type SpiceCeiling = "mild" | "spicy" | "filthy";
export type ExplicitVoice = "gentle" | "standard" | "filthy";

// Defaults keep the app exactly as it was for everyone who never touches
// these: every prompt (now ordered mild first) and the current voice.
export const DEFAULT_SPICE: SpiceCeiling = "filthy";
export const DEFAULT_VOICE: ExplicitVoice = "standard";

const SPICE_RANK: Record<SpiceCeiling, number> = { mild: 0, spicy: 1, filthy: 2 };

export function readSpice(value: unknown): SpiceCeiling {
  return value === "mild" || value === "spicy" || value === "filthy" ? value : DEFAULT_SPICE;
}

export function readVoice(value: unknown): ExplicitVoice {
  return value === "gentle" || value === "standard" || value === "filthy" ? value : DEFAULT_VOICE;
}

export function withinCeiling(tier: SpiceCeiling, ceiling: SpiceCeiling): boolean {
  return SPICE_RANK[tier] <= SPICE_RANK[ceiling];
}

export interface DesireSettings {
  spice: SpiceCeiling;
  voice: ExplicitVoice;
  loaded: boolean;
}

function fromProfile(profile: ProfileResponse | null | undefined): DesireSettings {
  const settings = profile?.profile?.settings || {};
  return { spice: readSpice(settings.promptSpice), voice: readVoice(settings.explicitVoice), loaded: Boolean(profile) };
}

/** Your own spice ceiling + voice, kept fresh when Settings changes them. */
export function useDesireSettings(): DesireSettings {
  const [state, setState] = useState<DesireSettings>({ spice: DEFAULT_SPICE, voice: DEFAULT_VOICE, loaded: false });
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getProfileCached().then((profile) => { if (!cancelled) setState(fromProfile(profile)); }).catch(() => {});
    };
    load();
    const unsubscribe = subscribeProfile((profile) => { if (!cancelled) setState(fromProfile(profile)); });
    // The cache drops on this event; refetch so a change made in Settings
    // shows up without a reload.
    const onStale = () => window.setTimeout(load, 0);
    window.addEventListener(PROFILE_STALE_EVENT, onStale);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(PROFILE_STALE_EVENT, onStale);
    };
  }, []);
  return state;
}

/** Pick the line for this person's voice. `standard` is the app as it was. */
export function voiced(voice: ExplicitVoice, lines: { gentle: string; standard: string; filthy: string }): string {
  return lines[voice] || lines.standard;
}

// ---------- Prompt ladder ----------

export interface LadderPrompt {
  text: string;
  tier: SpiceCeiling;
}

/**
 * Composer starter stems, low risk to high. Likes, memories and affirmation
 * first; wants next; explicit asks last. Partner-directed stems mix wanting
 * with affirmation ("I want you because..."), which tracked satisfaction better
 * than explicit talk alone in the erotic-talk literature the research cites.
 */
export const STARTER_LADDER: LadderPrompt[] = [
  { text: "I love it when you ", tier: "mild" },
  { text: "My favorite memory of us is ", tier: "mild" },
  { text: "I want you because ", tier: "mild" },
  { text: "My favorite thing about your body is ", tier: "mild" },
  { text: "Next time, ", tier: "mild" },
  { text: "I keep thinking about ", tier: "spicy" },
  { text: "I want to try ", tier: "spicy" },
  { text: "What if we ", tier: "spicy" },
  { text: "It turns me on when ", tier: "spicy" },
  { text: "I've never told you ", tier: "spicy" },
  { text: "I want you to ", tier: "spicy" },
  { text: "Fuck me like ", tier: "filthy" },
  { text: "Tie me up and ", tier: "filthy" },
];

/**
 * Three stems for the composer row, one per rung up to the ceiling, shown in
 * order (mild first). Random within a rung so the row doesn't go stale.
 */
export function pickStarterLadder(ceiling: SpiceCeiling, count = 3, random: () => number = Math.random): string[] {
  const tiers: SpiceCeiling[] = ceiling === "mild"
    ? ["mild", "mild", "mild"]
    : ceiling === "spicy"
      ? ["mild", "spicy", "spicy"]
      : ["mild", "spicy", "filthy"];
  const used = new Set<string>();
  const picked: string[] = [];
  for (const tier of tiers.slice(0, count)) {
    const pool = STARTER_LADDER.filter((prompt) => prompt.tier === tier && !used.has(prompt.text));
    if (!pool.length) continue;
    const choice = pool[Math.floor(random() * pool.length)].text;
    used.add(choice);
    picked.push(choice);
  }
  return picked;
}

/** "Today's prompt", ordered low to high. The day walks up the ladder. */
export const DAILY_LADDER: LadderPrompt[] = [
  { text: "What's one thing they did that you still think about?", tier: "mild" },
  { text: "Tell them the moment you wanted them most this week.", tier: "mild" },
  { text: "What do you love about the way they touch you?", tier: "mild" },
  { text: "Name the fantasy that would feel easier if they admitted one too.", tier: "spicy" },
  { text: "What want have you been editing in your head instead of saying plainly?", tier: "spicy" },
  { text: "Write the version of it that would make you feel relieved to be known.", tier: "spicy" },
  { text: "Say the filthiest thing you'd let them do to you tonight.", tier: "filthy" },
  { text: "What would you beg for if you knew they'd say yes?", tier: "filthy" },
];

export function dailyPromptFor(ceiling: SpiceCeiling, now = new Date()): string {
  const ladder = DAILY_LADDER.filter((prompt) => withinCeiling(prompt.tier, ceiling));
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  return ladder[((day % ladder.length) + ladder.length) % ladder.length].text;
}

/**
 * Sext prompt chips: the partner is the subject (fantasizing about your
 * partner raised desire for them in Birnbaum et al. 2019), wanting mixed
 * with affirmation.
 */
export const SEXT_PROMPTS: LadderPrompt[] = [
  { text: "My favorite thing about your body is ", tier: "mild" },
  { text: "I want you because ", tier: "mild" },
  { text: "I keep replaying the time you ", tier: "mild" },
  { text: "Tell me one thing you'd do to me tonight.", tier: "spicy" },
  { text: "Tonight I want to ", tier: "spicy" },
  { text: "I can't stop thinking about your ", tier: "filthy" },
];

export function sextPromptsFor(ceiling: SpiceCeiling): string[] {
  return SEXT_PROMPTS.filter((prompt) => withinCeiling(prompt.tier, ceiling)).map((prompt) => prompt.text);
}
