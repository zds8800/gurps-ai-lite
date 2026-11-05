/**
 * Injury effects (issue #23; Lite pp. 29-30): what a wound does beyond the
 * HP loss — shock, reeling, major wounds, knockdown and stunning,
 * consciousness at 0 HP or less, and the death-check thresholds.
 *
 * Recovery (natural healing, first aid, the half-hourly mortal-wound rolls,
 * waking up) is a later slice; a mortally wounded combatant here is simply
 * incapacitated, and any later failed death check kills them (p. 30).
 */

import type { Character } from "../model/attribute.ts";
import { hitPoints } from "../model/secondary.ts";
import type { DiceSource } from "../core/dice.ts";
import { resolve } from "../core/success-roll.ts";
import type { RollResult } from "../core/types.ts";
import type { Combatant } from "./attack.ts";

/** The injury state ladder (pp. 29-30). Anything past "stunned" cannot act. */
export type Condition = "ok" | "stunned" | "unconscious" | "mortally-wounded" | "dead";

/**
 * Shock (p. 30): injury reduces DX and IQ by the HP lost, to a maximum
 * penalty of -4, on the victim's next turn only. Successive injuries before
 * that turn stack, still capped at -4 ("a maximum penalty of -4, regardless
 * of your injuries").
 */
export function shockPenalty(current: number, injury: number): number {
  return Math.min(Math.max(current + injury, 0), 4);
}

/** A major wound (p. 30): any single injury greater than half your HP. */
export function isMajorWound(maxHp: number, injury: number): boolean {
  return injury > maxHp / 2;
}

/** Reeling (p. 29): less than 1/3 of your HP left. */
export function isReeling(maxHp: number, hp: number): boolean {
  return hp < maxHp / 3;
}

/** While reeling, Move and Dodge are halved, rounding up (p. 29). */
export function reelingDodge(dodge: number): number {
  return Math.ceil(dodge / 2);
}

/**
 * The negative-HP death thresholds (p. 30) newly crossed by dropping from
 * hpBefore to hpAfter: 1 for -1xHP, 2 for -2xHP, and so on, lowest first.
 */
export function deathThresholdsCrossed(maxHp: number, hpBefore: number, hpAfter: number): number[] {
  const crossed: number[] = [];
  for (let k = 1; -k * maxHp >= hpAfter; k++) {
    if (hpBefore > -k * maxHp) crossed.push(k);
  }
  return crossed;
}

/** One HT roll to avoid death, at a negative multiple of HP (p. 30). */
export interface DeathCheck {
  /** Which multiple was crossed: 1 for -1xHP, 2 for -2xHP, ... */
  multiple: number;
  roll: RollResult;
  outcome: "survived" | "mortal" | "died";
}

/** Everything one wound set in motion, for the CLI to narrate. */
export interface InjuryEffects {
  /** The victim's shock penalty after this injury (p. 30). 0 if none. */
  shockAfter: number;
  majorWound: boolean;
  /** The HT roll against knockdown and stunning, if a major wound happened. */
  knockdownRoll: RollResult | null;
  deathChecks: DeathCheck[];
  /** Reached -5xHP: dead with no roll (p. 30). */
  diedInstantly: boolean;
  conditionAfter: Condition;
}

/**
 * Apply one wound to a combatant (pp. 29-30): subtract the HP, set shock,
 * roll for knockdown and stunning on a major wound, and roll to avoid death
 * at each newly crossed negative multiple of HP. Mutates the combatant.
 *
 * Dice order: the knockdown HT roll (if any), then one HT roll per crossed
 * death threshold, stopping at the first that does not succeed.
 */
export function applyInjury(victim: Combatant, injury: number, dice: DiceSource): InjuryEffects {
  const maxHp = hitPoints(victim.character);
  const hpBefore = victim.hp;
  victim.hp -= injury;
  const hpAfter = victim.hp;

  if (injury > 0) victim.shock = shockPenalty(victim.shock, injury);

  let majorWound = false;
  let knockdownRoll: RollResult | null = null;
  const deathChecks: DeathCheck[] = [];
  let diedInstantly = false;

  if (victim.condition !== "dead" && injury > 0) {
    // Major wound: HT roll or be stunned and knocked down; failure by 5+
    // or a critical failure knocks you out (p. 30).
    if (
      (victim.condition === "ok" || victim.condition === "stunned") &&
      isMajorWound(maxHp, injury)
    ) {
      majorWound = true;
      knockdownRoll = resolve({ baseSkill: victim.character.attributes.HT }, dice);
      if (!knockdownRoll.success) {
        victim.condition =
          knockdownRoll.critical === "failure" || knockdownRoll.margin >= 5
            ? "unconscious"
            : "stunned";
      }
    }

    // Death (p. 30): at -5xHP there is no roll; otherwise roll HT at each
    // newly crossed negative multiple of HP.
    if (hpAfter <= -5 * maxHp) {
      diedInstantly = true;
      victim.condition = "dead";
    } else {
      for (const multiple of deathThresholdsCrossed(maxHp, hpBefore, hpAfter)) {
        const roll = resolve({ baseSkill: victim.character.attributes.HT }, dice);
        let outcome: DeathCheck["outcome"];
        if (roll.success) {
          outcome = "survived";
        } else if (roll.critical !== "failure" && roll.margin <= 2) {
          // Failure by only 1 or 2: a mortal wound (p. 30). Failing a second
          // death check while mortally wounded kills you.
          outcome = victim.condition === "mortally-wounded" ? "died" : "mortal";
        } else {
          outcome = "died";
        }
        if (outcome === "mortal") victim.condition = "mortally-wounded";
        if (outcome === "died") victim.condition = "dead";
        deathChecks.push({ multiple, roll, outcome });
        if (outcome !== "survived") break;
      }
    }
  }

  return {
    shockAfter: victim.shock,
    majorWound,
    knockdownRoll,
    deathChecks,
    diedInstantly,
    conditionAfter: victim.condition,
  };
}

/**
 * Staying conscious at 0 HP or less (p. 29): a HT roll at -1 per full
 * multiple of HP below zero, required on any turn the combatant acts or
 * defends. Failure sets them unconscious. (A Do Nothing turn with no
 * defense rolls needs no roll — callers simply don't ask.)
 */
export function consciousnessCheck(
  combatant: Combatant,
  dice: DiceSource,
): { roll: RollResult; modifier: number; stayedConscious: boolean } {
  const maxHp = hitPoints(combatant.character);
  const modifier = -Math.floor(Math.abs(Math.min(combatant.hp, 0)) / maxHp);
  const roll = resolve(
    {
      baseSkill: combatant.character.attributes.HT,
      modifiers: modifier === 0 ? [] : [{ label: "HP below zero", value: modifier }],
    },
    dice,
  );
  if (!roll.success) combatant.condition = "unconscious";
  return { roll, modifier, stayedConscious: roll.success };
}

/**
 * The end-of-turn HT roll to shake off stun (p. 30). On a success the
 * combatant recovers and can act normally on later turns.
 */
export function stunRecovery(combatant: Combatant, dice: DiceSource): RollResult {
  const roll = resolve({ baseSkill: combatant.character.attributes.HT }, dice);
  if (roll.success && combatant.condition === "stunned") combatant.condition = "ok";
  return roll;
}

/** Whether the combatant can take a maneuver at all (pp. 29-30). */
export function canAct(combatant: Combatant): boolean {
  return combatant.condition === "ok" || combatant.condition === "stunned";
}
