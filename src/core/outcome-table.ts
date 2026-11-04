/**
 * Precomputed outcome table (design section 6, with the correction from the
 * issue feedback: rows above effective skill 16 are identical, so the table
 * holds skills 3 to 16 and clamps above 16).
 *
 * For every (effective skill S, 3d total T) the outcome is fixed by the rules
 * in rules/success-rolls.md (R2, R5, R6, R7):
 * - 3 or 4 always succeeds; 17 or 18 always fails; otherwise T <= S succeeds.
 * - Critical success: 3 or 4 always; 5 at S >= 15; 6 at S >= 16.
 * - Critical failure: 18 always; 17 at S <= 15; any T at least 10 over S.
 *
 * Why clamping at 16 is exact: the critical-success window stops growing at
 * S = 16 (3-6), the 10-over rule cannot trigger past S = 8 on 3d, and 17 is an
 * ordinary failure for every S >= 16. So rows 16, 17, 18, ... are identical.
 */

export const OUTCOME_SUCCESS = 1;
export const OUTCOME_CRITICAL_SUCCESS = 2;
export const OUTCOME_CRITICAL_FAILURE = 4;

export const MIN_ROLLABLE_SKILL = 3;
export const TABLE_MAX_SKILL = 16;
export const MIN_TOTAL = 3;
export const MAX_TOTAL = 18;

const ROWS = TABLE_MAX_SKILL - MIN_ROLLABLE_SKILL + 1; // 14
const COLS = MAX_TOTAL - MIN_TOTAL + 1; // 16

/** OUTCOME[(S - 3) * 16 + (T - 3)] — 224 bytes. */
export const OUTCOME: Uint8Array = buildOutcomeTable();

function computeOutcome(skill: number, total: number): number {
  let bits = 0;
  const success = total <= 4 ? true : total >= 17 ? false : total <= skill;
  if (success) bits |= OUTCOME_SUCCESS;
  if (total <= 4 || (total === 5 && skill >= 15) || (total === 6 && skill >= 16)) {
    bits |= OUTCOME_CRITICAL_SUCCESS;
  }
  if (total === 18 || (total === 17 && skill <= 15) || total - skill >= 10) {
    bits |= OUTCOME_CRITICAL_FAILURE;
  }
  return bits;
}

function buildOutcomeTable(): Uint8Array {
  const table = new Uint8Array(ROWS * COLS);
  for (let s = MIN_ROLLABLE_SKILL; s <= TABLE_MAX_SKILL; s++) {
    for (let t = MIN_TOTAL; t <= MAX_TOTAL; t++) {
      table[(s - MIN_ROLLABLE_SKILL) * COLS + (t - MIN_TOTAL)] = computeOutcome(s, t);
    }
  }
  return table;
}

/**
 * Outcome bits for (S, T). Caller guarantees S >= MIN_ROLLABLE_SKILL
 * (the low-skill check happens before dice are thrown) and 3 <= T <= 18.
 */
export function outcomeBits(skill: number, total: number): number {
  const s = skill > TABLE_MAX_SKILL ? TABLE_MAX_SKILL : skill;
  return OUTCOME[(s - MIN_ROLLABLE_SKILL) * COLS + (total - MIN_TOTAL)];
}
