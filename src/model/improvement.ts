/**
 * Character improvement (issue #41; Lite p. 17). Bonus character points are
 * recorded as unspent and spent "the same way as during character creation":
 * improving a basic attribute costs the point-cost difference between the
 * old and new scores, and improving a skill costs the difference between
 * its current and new point totals. Only printed, purchasable skill costs
 * are accepted — the same ladder as creation (p. 13).
 *
 * Pure cost functions; the CLI applies the change and debits the balance.
 * Advantage purchases and disadvantage buy-offs live in traits.ts (issue #45).
 */

import type { AttributeId, Character } from "./attribute.ts";
import { attributeCost } from "./attribute.ts";
import type { SkillDef } from "./skill.ts";
import { pointsToRelativeLevel } from "./skill.ts";

/** Cost to improve one basic attribute, or a refusal string (p. 17). */
export function attributeImprovementCost(
  character: Character,
  attr: AttributeId,
  newLevel: number,
): number | string {
  const current = character.attributes[attr];
  if (!Number.isInteger(newLevel) || newLevel < 1) {
    return `Bad level "${newLevel}". Attributes are whole numbers, 1 or more (p. 4).`;
  }
  if (newLevel <= current) {
    return `${attr} is already ${current}. Improving means a higher score (p. 17).`;
  }
  return attributeCost(attr, newLevel) - attributeCost(attr, current);
}

/** Cost to raise (or start) a skill at a new point total, or a refusal string (pp. 13, 17). */
export function skillImprovementCost(
  character: Character,
  def: SkillDef,
  newPoints: number,
): number | string {
  if (!Number.isInteger(newPoints) || newPoints < 1) {
    return `Bad points "${newPoints}". Give the skill's new point total as a whole number, 1 or more.`;
  }
  const current = character.skills.find((r) => r.skillId === def.id)?.points ?? 0;
  if (newPoints <= current) {
    return `${def.name} is already at ${current} points. Improving means a higher point total (p. 17).`;
  }
  try {
    // The new total must be a printed, purchasable cost (p. 13); the error
    // already explains the nearest valid costs and the round-up/down option.
    pointsToRelativeLevel(newPoints, def.difficulty);
  } catch (error) {
    return (error as Error).message;
  }
  return newPoints - current;
}
