/** Deterministic execution helpers for the LLGM's two house-rule primitives. */

import type { DiceSource } from "../core/dice.ts";
import { resolve } from "../core/success-roll.ts";
import type { RollResult } from "../core/types.ts";
import type {
  MarginOutcome,
  SavedHouseRule,
  SkillCheckHouseRule,
  SkillCheckRuling,
} from "./contract.ts";

/** Select the highest declared threshold reached by this side of the result. */
export function selectMarginOutcome(
  ruling: SkillCheckRuling,
  result: RollResult,
): MarginOutcome | null {
  if (result.status !== "rolled" || result.margin === null) return null;
  let selected: MarginOutcome | null = null;
  for (const outcome of ruling.outcomes ?? []) {
    if (
      outcome.success === result.success &&
      outcome.minimumMargin <= result.margin &&
      (selected === null || outcome.minimumMargin > selected.minimumMargin)
    ) {
      selected = outcome;
    }
  }
  return selected;
}

export interface SkillCheckResolution {
  roll: RollResult;
  outcome: MarginOutcome | null;
}

/** Resolve a saved skill-check case through the ordinary success-roll engine. */
export function resolveSkillCheckRuling(
  houseRule: SkillCheckHouseRule,
  baseSkill: number | null,
  dice: DiceSource,
): SkillCheckResolution {
  const roll = resolve(
    {
      baseSkill,
      modifiers: [{ label: houseRule.exampleCase, value: houseRule.ruling.modifier }],
      explain: true,
    },
    dice,
  );
  return { roll, outcome: selectMarginOutcome(houseRule.ruling, roll) };
}

export interface PostDrDamage {
  /** Modified post-DR damage; ordinary wounding and final rounding remain the combat pipeline's job. */
  damage: number;
  appliedRuleIds: string[];
}

/**
 * Apply only accepted multipliers matching both target and damage tag. Proposed,
 * rejected, superseded, and unrelated rules cannot affect the result.
 */
export function applyAcceptedDamageMultipliers(
  penetratingDamage: number,
  target: string,
  damageTag: string,
  rules: readonly SavedHouseRule[],
): PostDrDamage {
  if (!Number.isFinite(penetratingDamage) || penetratingDamage < 0) {
    throw new Error("Penetrating damage must be a finite number, 0 or more.");
  }
  let damage = penetratingDamage;
  const appliedRuleIds: string[] = [];
  for (const rule of rules) {
    if (rule.status !== "accepted" || rule.ruling.type !== "damage_multiplier") continue;
    const ruling = rule.ruling;
    if (ruling.target !== target || ruling.damageTag !== damageTag) continue;
    damage *= ruling.multiplier;
    appliedRuleIds.push(rule.id);
  }
  return { damage, appliedRuleIds };
}
