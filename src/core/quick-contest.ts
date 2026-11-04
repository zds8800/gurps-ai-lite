/**
 * Quick Contests (Lite p. 3): two success rolls compared.
 *
 * The book's four rulings (quoted in rules/attributes-and-skills.md, section 2):
 * if one side succeeds and the other fails, the succeeder wins; if both
 * succeed, the larger margin of success wins; if both fail, the smaller
 * margin of failure wins; a tie means nobody won.
 *
 * Open decisions (see issue #12, pending verification against the Lite PDF):
 * - QC1: a side that cannot attempt (effective skill below 3, or no default)
 *   cannot win. If the other side rolls and succeeds, it wins; otherwise
 *   nobody won. The book bars the roll entirely and does not cover contests.
 * - QC2: critical results stay flags on each side's roll; they do not
 *   override the four rulings.
 * - Margin of victory follows the standard reading: winner's margin of
 *   success plus loser's margin of failure when exactly one side fails; the
 *   difference of margins when both succeed or both fail.
 */

import type { DiceSource } from "./dice.ts";
import { resolve } from "./success-roll.ts";
import type { Modifier, RollResult } from "./types.ts";

export interface Contestant {
  /** Base skill or attribute level; null means no usable skill (no default). */
  baseSkill: number | null;
  modifiers?: Modifier[];
  /** Display label, e.g. a character or skill name. */
  label?: string;
}

export type ContestWinner = "a" | "b" | null;

export interface QuickContestResult {
  a: RollResult;
  b: RollResult;
  /** Which side won, or null when nobody won (tie, or no successful roll). */
  winner: ContestWinner;
  /** The winner's margin of victory; null when nobody won. */
  marginOfVictory: number | null;
}

export function quickContest(
  a: Contestant,
  b: Contestant,
  dice: DiceSource,
): QuickContestResult {
  const resultA = resolve({ baseSkill: a.baseSkill, modifiers: a.modifiers }, dice);
  const resultB = resolve({ baseSkill: b.baseSkill, modifiers: b.modifiers }, dice);

  // QC1: a side that could not attempt cannot win.
  const aOut = resultA.status !== "rolled";
  const bOut = resultB.status !== "rolled";
  if (aOut || bOut) {
    const other = aOut ? resultB : resultA;
    const winner: ContestWinner = other.status === "rolled" && other.success ? (aOut ? "b" : "a") : null;
    // Only one side rolled: its margin of success is the margin of victory.
    return { a: resultA, b: resultB, winner, marginOfVictory: winner === null ? null : other.margin };
  }

  const aWon = resultA.success;
  const bWon = resultB.success;

  if (aWon && !bWon) {
    // Winner's margin of success plus loser's margin of failure.
    return { a: resultA, b: resultB, winner: "a", marginOfVictory: resultA.margin! + resultB.margin! };
  }
  if (bWon && !aWon) {
    return { a: resultA, b: resultB, winner: "b", marginOfVictory: resultB.margin! + resultA.margin! };
  }
  if (aWon && bWon) {
    // Larger margin of success wins; equal margins tie.
    if (resultA.margin! === resultB.margin!) {
      return { a: resultA, b: resultB, winner: null, marginOfVictory: null };
    }
    const winner: ContestWinner = resultA.margin! > resultB.margin! ? "a" : "b";
    return {
      a: resultA,
      b: resultB,
      winner,
      marginOfVictory: Math.abs(resultA.margin! - resultB.margin!),
    };
  }
  // Both failed: the smaller margin of failure wins; equal margins tie.
  if (resultA.margin! === resultB.margin!) {
    return { a: resultA, b: resultB, winner: null, marginOfVictory: null };
  }
  const winner: ContestWinner = resultA.margin! < resultB.margin! ? "a" : "b";
  return {
    a: resultA,
    b: resultB,
    winner,
    marginOfVictory: Math.abs(resultA.margin! - resultB.margin!),
  };
}
