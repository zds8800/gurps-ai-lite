/**
 * Dice+adds pools (Lite p. 4: "4d+2" means roll 4 dice and add 2). Used for
 * damage rolls (p. 29). Plain data; rolling goes through a DiceSource.
 */

import type { DiceSource } from "./dice.ts";

/** A pool of six-sided dice plus a flat add, e.g. 2d-1. */
export interface DicePool {
  dice: number;
  adds: number;
}

/** Parse "2d-1", "1d", "1d+2" (also "2D-1"). Throws on anything else. */
export function parseDicePool(text: string): DicePool {
  const m = /^(\d+)[dD]([+-]\d+)?$/.exec(text.trim());
  if (!m) {
    throw new Error(`Bad dice pool "${text}". Use dice+adds form: 2d, 1d-2, 1d+2 (Lite p. 4).`);
  }
  return { dice: Number(m[1]), adds: m[2] ? Number(m[2]) : 0 };
}

/** Print a pool the way the book does: 2d, 1d-2, 1d+2. */
export function formatDicePool(pool: DicePool): string {
  if (pool.adds === 0) return `${pool.dice}d`;
  return `${pool.dice}d${pool.adds > 0 ? "+" : ""}${pool.adds}`;
}

/** Roll the pool: the dice summed, plus the adds. May go negative; callers apply minimums. */
export function rollDicePool(pool: DicePool, source: DiceSource): number {
  let total = pool.adds;
  for (let i = 0; i < pool.dice; i++) total += source.d6();
  return total;
}
