/**
 * Skill definitions and per-character skill records (design section 2; rules
 * in rules/attributes-and-skills.md sections 3-4). Field names follow the GCS
 * skill record (difficulty, points, specialization, defaults) so a .gcs
 * importer can come later.
 */

import type { AttributeId } from "./attribute.ts";

/** Lite has Easy, Average and Hard only; there is no Very Hard in the book (p. 13). */
export type Difficulty = "E" | "A" | "H";

/** A way to use the skill untrained: attribute level plus penalty (pp. 13, 15, 17). */
export interface Default {
  from: AttributeId;
  /** Negative number, e.g. -5 for an Average skill. */
  penalty: number;
}

/** A skill as printed in the Lite skill list. Shared, read-only rules data. */
export interface SkillDef {
  /** Stable key, e.g. "lockpicking". Module namespacing arrives with the loader. */
  id: string;
  /** Display name as printed, e.g. "Lockpicking/TL". */
  name: string;
  attribute: AttributeId;
  difficulty: Difficulty;
  /** Empty means "Default: None" — the skill cannot be used untrained. */
  defaults: Default[];
  /** True for /TL skills (p. 13). Tech-level rules themselves are out of scope. */
  tl: boolean;
  /** Parked for the combat slice; combat skills work as plain skill tests. */
  combat: boolean;
  /** Lite page for the entry. */
  page: number;
}

/** A skill one character has. points 0 means "default only" (design section 2). */
export interface SkillRecord {
  skillId: string;
  points: number;
  /** Same name as in GCS; Lite does not use specializations. */
  specialization: string | null;
  /** Flat bonus from the sheet, default 0. Applies to trained levels only. */
  bonus?: number;
}

/** What to do with a point total that is not a printed cost. */
export type InvalidPointsMode = "error" | "round-down" | "round-up";

/**
 * The printed Skill Cost Table (p. 13), stored as one ladder shifted by
 * difficulty (an observation from the printed table): cost rung k is
 * 1, 2, 4, 8, then +4 points per extra level ("Extra +1", p. 13).
 * Easy starts at Attribute+0, Average at Attribute-1, Hard at Attribute-2.
 */
const DIFFICULTY_OFFSET: Record<Difficulty, number> = { E: 0, A: -1, H: -2 };

function costOfRung(rung: number): number {
  return rung <= 3 ? 2 ** rung : 4 * rung - 4;
}

/**
 * Relative skill level for a point total, per the printed table (p. 13).
 *
 * Owner ruling (issue #8): you buy as written — only printed costs are valid.
 * The default "error" mode rejects anything else with the valid choices named,
 * so the caller can fix the sheet; "round-down" / "round-up" pick the nearest
 * printed rung for tools that would rather normalise than reject.
 */
export function pointsToRelativeLevel(
  points: number,
  difficulty: Difficulty,
  mode: InvalidPointsMode = "error",
): number {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error(
      `Skill points must be a positive whole number, got ${points}. ` +
        `Use 0 on the record (or omit the record) for default-only use.`,
    );
  }
  for (let rung = 0; ; rung++) {
    const cost = costOfRung(rung);
    if (cost === points) return DIFFICULTY_OFFSET[difficulty] + rung;
    if (cost > points) {
      const label = (r: number) =>
        `${costOfRung(r)} points (Attribute${formatRel(DIFFICULTY_OFFSET[difficulty] + r)})`;
      if (mode === "round-down") return DIFFICULTY_OFFSET[difficulty] + (rung - 1);
      if (mode === "round-up") return DIFFICULTY_OFFSET[difficulty] + rung;
      throw new Error(
        `${points} points is not a purchasable cost for a ${difficultyName(difficulty)} skill ` +
          `(Lite p. 13 prints 1, 2, 4, 8, then +4 per extra level). Nearest valid: ` +
          `${label(rung - 1)} or ${label(rung)}. Fix the sheet to one of those, ` +
          `or pass "round-down" / "round-up" to choose automatically.`,
      );
    }
  }
}

function difficultyName(d: Difficulty): string {
  return d === "E" ? "Easy" : d === "A" ? "Average" : "Hard";
}

function formatRel(rel: number): string {
  return rel >= 0 ? `+${rel}` : `${rel}`;
}
