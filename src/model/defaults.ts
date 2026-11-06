/**
 * Default skill levels and base skill resolution (design section 3; rules in
 * rules/attributes-and-skills.md section 5). Pure functions of numbers.
 */

import type { AttributeId, Character } from "./attribute.ts";
import { pointsToRelativeLevel } from "./skill.ts";
import type { InvalidPointsMode, SkillDef } from "./skill.ts";
import { traitSkillBonus } from "./traits.ts";
import type { SkillUseContext } from "./traits.ts";

/**
 * Best usable default for an untrained character, or null when the skill has
 * none ("Default: None", e.g. Karate p. 15) — the roll is then not allowed.
 *
 * Rule of 20 (p. 13): when a default is worked from a basic attribute above
 * 20, treat the attribute as 20.
 */
export function defaultLevel(
  attributes: Record<AttributeId, number>,
  skill: SkillDef,
): number | null {
  if (skill.defaults.length === 0) return null;
  let best: number | null = null;
  for (const d of skill.defaults) {
    const level = Math.min(attributes[d.from], 20) + d.penalty;
    if (best === null || level > best) best = level;
  }
  return best;
}

/**
 * Base skill for one character and one skill definition:
 * trained level when the character has points in the skill (trained beats
 * default, p. 13), otherwise the best default, otherwise null.
 *
 * Invalid point totals follow the buy-as-written ruling; mode is forwarded
 * to pointsToRelativeLevel ("error" unless the caller chooses rounding).
 */
export function baseSkillLevel(
  character: Character,
  skill: SkillDef,
  mode: InvalidPointsMode = "error",
  context: SkillUseContext = {},
): number | null {
  // Match on skillId alone: the importer resolves a family skill's record to
  // the specialty-specific definition (e.g. "Thrown Weapon: Knife"), so the
  // record's specialization is display text, not part of the match (issue #36).
  const record = character.skills.find((r) => r.skillId === skill.id);
  const traitBonus = traitSkillBonus(character, skill, context);
  if (record && record.points > 0) {
    const relative = pointsToRelativeLevel(record.points, skill.difficulty, mode);
    return character.attributes[skill.attribute] + relative + (record.bonus ?? 0) + traitBonus;
  }
  const level = defaultLevel(character.attributes, skill);
  return level === null ? null : level + traitBonus;
}
