/**
 * Themes in a Kink's own words, for two jobs:
 *
 * 1. Normalization tags ("how common is this"). Only themes a published study
 *    actually measured get a tag, each with its source below. Unknown themes
 *    get nothing: we never guess and never invent a percentage. People who
 *    think their fantasies are unusual feel more guilt and shame about them
 *    (Lehmiller, Psychology Today 2018), so an honest "this is common" is cheap
 *    and useful when it's true.
 *
 * 2. Risk. Some themes (other people, pain) are worth talking through before
 *    they become an Ask. What predicts holding a fantasy back is perceived risk
 *    to the relationship (Kimberley, Jones & Elliott 2025), and group sex was
 *    the one fantasy that often fell short of expectations once acted on
 *    (Lehmiller's survey of 4,000+ Americans, Psychology Today 2018).
 *
 * Matching is a plain keyword pass over the decrypted text on this device;
 * nothing here is sent anywhere.
 */

export type NormThemeId = "power" | "stranger" | "swinging" | "kink";

export interface NormTag {
  id: NormThemeId;
  /** Short line on the card. */
  label: string;
  /** Anchor on the /inspiration/why explainer. */
  anchor: string;
}

// Sources (all as reported in the research the app's copy is built on):
// - Joyal, Cossette & Lapierre 2015, J Sex Med, 1,516 adults rating 55
//   fantasies: "very few statistically unusual sexual fantasies"; being
//   dominated was more common among women than men; sex with a stranger was
//   fantasized about by just under half of women and over 70% of men;
//   swinging by 42% of men and 18% of women. (PsyPost; Pacific Standard.)
// - Wismeijer & van Assen 2013, J Sex Med, 902 BDSM practitioners vs 434
//   controls: practitioners were less neurotic, less rejection-sensitive and
//   higher in well-being; the authors frame BDSM as recreational leisure. The
//   control group was not population-representative.
const NORM_TAGS: Record<NormThemeId, NormTag> = {
  // Joyal et al. 2015: being dominated was a common fantasy, more so for women.
  power: { id: "power", label: "Power play is a common fantasy", anchor: "power" },
  // Joyal et al. 2015: just under half of women and over 70% of men.
  stranger: { id: "stranger", label: "Shared by over 70% of men and just under half of women in one study", anchor: "stranger" },
  // Joyal et al. 2015: 42% of men and 18% of women.
  swinging: { id: "swinging", label: "Shared by 42% of men and 18% of women in one study", anchor: "swinging" },
  // Wismeijer & van Assen 2013: consensual kink as leisure, not pathology.
  kink: { id: "kink", label: "Consensual kink is play", anchor: "kink" },
};

const NORM_PATTERNS: Array<[NormThemeId, RegExp]> = [
  ["swinging", /\b(swing(ing|ers?)?|swap(ping)? partners|partner swap|another couple|other couple)\b/i],
  ["stranger", /\b(strangers?|someone (i|we) (don'?t|do not) know|anonymous)\b/i],
  ["power", /\b(dominat\w*|submi(t|ssive|ssion)\w*|tie (me|you|us) up|tied up|restrain\w*|pin(ned)? (me|you) down|hands pinned|obey|in control of me|take control|order me|blindfold\w*|bondage)\b/i],
  ["kink", /\b(kink\w*|bdsm|spank\w*|flogg?\w*|whip\w*|collar(ed)?|leash|impact play|crop|paddl\w*)\b/i],
];

/** The single most specific tag for this text, or null when we don't know. */
export function normTagFor(text: string): NormTag | null {
  const value = String(text || "");
  for (const [id, pattern] of NORM_PATTERNS) {
    if (pattern.test(value)) return NORM_TAGS[id];
  }
  return null;
}

export type RiskThemeId = "others" | "pain";

// Themes that get a gentle "talk first" step before becoming an Ask.
const RISK_PATTERNS: Array<[RiskThemeId, RegExp]> = [
  ["others", /\b(threesome|foursome|group|orgy|gang ?bang|swing(ing|ers?)?|swap(ping)?|another (man|woman|guy|girl|couple|person)|someone else|other (people|men|women|guys|girls)|open (relationship|marriage)|cuck\w*|hotwif\w*|share you|watch(ing)? (you|me) with|bring (someone|somebody|a third)|a third)\b/i],
  ["pain", /\b(pain|hurt|choke?|choking|slap\w*|bruis\w*|blood|needle|cane|caning|whip\w*|flogg?\w*|impact|nipple clamps?|wax play|breath play)\b/i],
];

export function riskThemesFor(text: string): RiskThemeId[] {
  const value = String(text || "");
  return RISK_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([id]) => id);
}

export function isHighRisk(text: string): boolean {
  return riskThemesFor(text).length > 0;
}

export const INTENT_LABELS: Record<"fantasy" | "talk" | "try", string> = {
  fantasy: "Just a fantasy",
  talk: "Want to talk about it",
  try: "Want to try it",
};
