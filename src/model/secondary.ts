/**
 * Secondary characteristics (Lite p. 6): the values that follow directly from
 * the four basic attributes, and the ST damage table. Pure functions.
 */

import type { Character } from "./attribute.ts";
import type { DicePool } from "../core/dice-pool.ts";

/** HP equal to ST (p. 6). */
export function hitPoints(c: Character): number {
  return c.attributes.ST;
}

/** FP equal to HT (p. 6). */
export function fatiguePoints(c: Character): number {
  return c.attributes.HT;
}

/** Basic Speed = (HT + DX) / 4, not rounded (p. 6). */
export function basicSpeed(c: Character): number {
  return (c.attributes.HT + c.attributes.DX) / 4;
}

/** Basic Move = Basic Speed, fractions dropped (p. 6). */
export function basicMove(c: Character): number {
  return Math.floor(basicSpeed(c));
}

/** Dodge = Basic Speed + 3, fractions dropped, less encumbrance (pp. 6, 28). */
export function dodgeScore(c: Character, encumbranceLevel = 0): number {
  return Math.floor(basicSpeed(c)) + 3 - encumbranceLevel;
}

/**
 * The Damage Table (p. 6), ST 1 to 20: [thrust, swing] in dice+adds.
 * The printed table stops at 20; higher ST is a GM or LLGM call (see the
 * feature plan, Discussion #17), so strengthDamage throws there.
 */
const DAMAGE_TABLE: readonly (readonly [DicePool, DicePool])[] = [
  [{ dice: 1, adds: -6 }, { dice: 1, adds: -5 }], // ST 1
  [{ dice: 1, adds: -6 }, { dice: 1, adds: -5 }], // ST 2
  [{ dice: 1, adds: -5 }, { dice: 1, adds: -4 }], // ST 3
  [{ dice: 1, adds: -5 }, { dice: 1, adds: -4 }], // ST 4
  [{ dice: 1, adds: -4 }, { dice: 1, adds: -3 }], // ST 5
  [{ dice: 1, adds: -4 }, { dice: 1, adds: -3 }], // ST 6
  [{ dice: 1, adds: -3 }, { dice: 1, adds: -2 }], // ST 7
  [{ dice: 1, adds: -3 }, { dice: 1, adds: -2 }], // ST 8
  [{ dice: 1, adds: -2 }, { dice: 1, adds: -1 }], // ST 9
  [{ dice: 1, adds: -2 }, { dice: 1, adds: 0 }], // ST 10
  [{ dice: 1, adds: -1 }, { dice: 1, adds: 1 }], // ST 11
  [{ dice: 1, adds: -1 }, { dice: 1, adds: 2 }], // ST 12
  [{ dice: 1, adds: 0 }, { dice: 2, adds: -1 }], // ST 13
  [{ dice: 1, adds: 0 }, { dice: 2, adds: 0 }], // ST 14
  [{ dice: 1, adds: 1 }, { dice: 2, adds: 1 }], // ST 15
  [{ dice: 1, adds: 1 }, { dice: 2, adds: 2 }], // ST 16
  [{ dice: 1, adds: 2 }, { dice: 3, adds: -1 }], // ST 17
  [{ dice: 1, adds: 2 }, { dice: 3, adds: 0 }], // ST 18
  [{ dice: 2, adds: -1 }, { dice: 3, adds: 1 }], // ST 19
  [{ dice: 2, adds: -1 }, { dice: 3, adds: 2 }], // ST 20
];

/** Thrust or swing damage for a ST score, from the printed table (p. 6). */
export function strengthDamage(st: number, kind: "thrust" | "swing"): DicePool {
  if (!Number.isInteger(st) || st < 1 || st > DAMAGE_TABLE.length) {
    throw new Error(
      `The Lite Damage Table covers ST 1 to ${DAMAGE_TABLE.length} (p. 6); ST ${st} is a GM or LLGM call.`,
    );
  }
  const row = DAMAGE_TABLE[st - 1];
  return { ...row[kind === "thrust" ? 0 : 1] };
}
