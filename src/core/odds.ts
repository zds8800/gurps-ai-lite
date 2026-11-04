/**
 * Closed-form odds from the 3d distribution (design section 6). Sixteen
 * multiplicities describe all 216 ordered outcomes of 3d; odds calls never
 * touch the dice.
 */

import {
  MAX_TOTAL,
  MIN_TOTAL,
  OUTCOME_CRITICAL_FAILURE,
  OUTCOME_CRITICAL_SUCCESS,
  OUTCOME_SUCCESS,
  outcomeBits,
} from "./outcome-table.ts";

/** Number of ordered 3d outcomes producing each total 3..18. Sums to 216. */
export const TOTAL_COUNTS: readonly number[] = [
  1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1,
];

export const TOTAL_OUTCOMES = 216;

export interface Odds {
  /** Ordered outcomes (out of 216) that succeed. */
  successCount: number;
  criticalSuccessCount: number;
  criticalFailureCount: number;
  successChance: number;
  criticalSuccessChance: number;
  criticalFailureChance: number;
}

/** Exact odds for one effective skill. S below 3 cannot be rolled: all zeros. */
export function rollOdds(skill: number): Odds {
  if (skill < 3) {
    return {
      successCount: 0,
      criticalSuccessCount: 0,
      criticalFailureCount: 0,
      successChance: 0,
      criticalSuccessChance: 0,
      criticalFailureChance: 0,
    };
  }
  let successCount = 0;
  let criticalSuccessCount = 0;
  let criticalFailureCount = 0;
  for (let t = MIN_TOTAL; t <= MAX_TOTAL; t++) {
    const bits = outcomeBits(skill, t);
    const count = TOTAL_COUNTS[t - MIN_TOTAL];
    if (bits & OUTCOME_SUCCESS) successCount += count;
    if (bits & OUTCOME_CRITICAL_SUCCESS) criticalSuccessCount += count;
    if (bits & OUTCOME_CRITICAL_FAILURE) criticalFailureCount += count;
  }
  return {
    successCount,
    criticalSuccessCount,
    criticalFailureCount,
    successChance: successCount / TOTAL_OUTCOMES,
    criticalSuccessChance: criticalSuccessCount / TOTAL_OUTCOMES,
    criticalFailureChance: criticalFailureCount / TOTAL_OUTCOMES,
  };
}

/** Just the chance of success, as a fraction 0..1. */
export function successChance(skill: number): number {
  return rollOdds(skill).successChance;
}
