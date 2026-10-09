// One-shot handoff from a reveal (a match, an overlap, a shared answer) into the
// Ask composer. The matched act names ride in sessionStorage, not the URL, so
// they never land in browser history or sync to other devices. The composer
// preselects any act whose name matches and carries the rest into the note.

export type AskSeedSource = "quiz" | "green-lights" | "pile" | "blind-reveal" | "lights-them-up";

export interface AskSeed {
  source: AskSeedSource;
  acts: string[];
  note: string;
}

const KEY = "ss:ask-seed";
export const ASK_SEED_HREF = "/ask?seed=1";

const SOURCE_LABEL: Record<AskSeedSource, string> = {
  quiz: "our Sex Quiz",
  "green-lights": "Green Lights",
  pile: "The Pile",
  "blind-reveal": "a Blind Reveal",
  "lights-them-up": "what lights you up",
};

export function askSeedSourceLabel(source: AskSeedSource): string {
  return SOURCE_LABEL[source] || "a reveal";
}

// Returns false when storage is unavailable, so the caller can fall back.
export function storeAskSeed(seed: AskSeed): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      source: seed.source,
      acts: seed.acts.map((act) => String(act || "").trim()).filter(Boolean).slice(0, 12),
      note: String(seed.note || "").slice(0, 600),
    }));
    return true;
  } catch {
    return false;
  }
}

// Read once and clear.
export function consumeAskSeed(): AskSeed | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AskSeed>;
    const acts = Array.isArray(parsed.acts) ? parsed.acts.map((act) => String(act || "").trim()).filter(Boolean).slice(0, 12) : [];
    const source = (parsed.source && parsed.source in SOURCE_LABEL ? parsed.source : "quiz") as AskSeedSource;
    return { source, acts, note: String(parsed.note || "").slice(0, 600) };
  } catch {
    return null;
  }
}

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*\s*)+/u;

// Act names compare without their leading emoji and case.
export function actKey(label: string): string {
  return String(label || "").replace(LEADING_EMOJI, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Split seeded names into act ids to preselect and names with no matching act.
export function matchSeedActs<T extends { id: string; label: string }>(
  seedActs: string[],
  acts: T[],
): { ids: string[]; unmatched: string[] } {
  const byKey = new Map(acts.map((act) => [actKey(act.label), act.id]));
  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const name of seedActs) {
    const id = byKey.get(actKey(name));
    if (id) {
      if (!ids.includes(id)) ids.push(id);
    } else if (!unmatched.includes(name)) {
      unmatched.push(name);
    }
  }
  return { ids, unmatched };
}

// Seeded names with no Act in the library (a quiz card like "Long, filthy
// makeouts") become Acts of their own for this Ask, picked, so a reveal can be
// sent in one go. They live only in the composer: an Ask carries its Acts by
// name, so nothing is added to the library unless the person adds it.
export const SEEDED_ACT_PREFIX = "seeded-";

export function seededActsFor(
  unmatched: string[],
  workspaceId: string,
): Array<{
  id: string; workspaceId: string; label: string; icon: string; tags: string[];
  comfort: Record<string, never>; source: "custom"; addedByEmail: string; addedByName: string;
  approvedByEmail: string; approvedByName: string; createdAt: string; updatedAt: string;
}> {
  const seen = new Set<string>();
  const out = [];
  for (const name of unmatched) {
    const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const key = actKey(label);
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${SEEDED_ACT_PREFIX}${out.length}-${key.replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
      workspaceId,
      label,
      icon: "",
      tags: [],
      comfort: {},
      source: "custom" as const,
      addedByEmail: "",
      addedByName: "",
      approvedByEmail: "",
      approvedByName: "",
      createdAt: "",
      updatedAt: "",
    });
  }
  return out;
}

// The note the composer starts with: anything the act grid can't express.
export function seededNote(seed: AskSeed, unmatched: string[]): string {
  if (seed.note) return seed.note;
  if (!unmatched.length) return "";
  return `From ${askSeedSourceLabel(seed.source)}: ${unmatched.join(", ")}`;
}
