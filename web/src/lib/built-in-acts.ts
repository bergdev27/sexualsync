import type { Act } from "./types";

// A no-goal touch Act borrowed from sensate focus, the classic touch exercise
// from sex therapy (research rec #16; Avery-Clark et al. 2019 review its
// clinical use, with thin modern outcome data, so no claims are made in copy).
// It gives the partner whose desire is responsive a low-stakes way in: fifteen
// minutes of touch, and nothing has to happen after. Mirrored server-side in
// functions/api/pile.js BUILT_IN_PILE_ACT_LABELS.
export const SLOW_TOUCH_ACT_LABEL = "🪶 Slow touch, no finish line";
export const SLOW_TOUCH_ACT_HINT = "Fifteen minutes of slow touching, taking turns. No finish line, and nothing has to happen after.";

export const BUILT_IN_ACT_LABELS = [
  "💆 Sensual massage",
  "👅 Tongue Lashing",
  "💋 Mutual oral",
  "🍆 Penetration",
  "🐢 Slow positions",
  "🔥 Active positions",
  "🤠 Cowgirl or reverse",
  "🍑 From behind",
  "🧍 Standing or wall",
  "👑 On Top",
  "🛋️ Couch",
  "🎁 Toys or accessories",
  "💬 Dirty talk",
  "🔗 Kink",
  "⛓️ Light restraint",
  "🤗 Cuddling",
  "✋ Mutual Masturbation",
  "🪑 Face Sitting",
  "🎭 Roleplay",
  // Appended (never inserted) so every earlier built-in keeps its index-based id.
  SLOW_TOUCH_ACT_LABEL,
];

export function combineBuiltInAndSavedActs(savedActs: Act[], workspaceId: string) {
  const saved = savedActs.map((act) => ({ ...act, source: act.source || "custom" }));
  const savedLabels = new Set(saved.map((act) => act.label.toLowerCase()));
  const builtIns = BUILT_IN_ACT_LABELS
    .filter((label) => !savedLabels.has(label.toLowerCase()))
    .map((label, index) => builtInAct(label, index, workspaceId));

  return [...saved, ...builtIns];
}

function builtInAct(label: string, index: number, workspaceId: string): Act {
  return {
    id: `built-in-${index}-${slug(label)}`,
    workspaceId,
    label,
    icon: "",
    tags: ["soft"],
    comfort: {},
    source: "built_in",
    addedByEmail: "",
    addedByName: "Sexualsync",
    approvedByEmail: "",
    approvedByName: "",
    createdAt: "",
    updatedAt: "",
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "act";
}
