/**
 * Ranged attacks (issue #29; Lite pp. 27-28): the Size and Speed/Range
 * table as printed in Lite, plus the Max-range and 1/2D checks.
 */

/**
 * The range modifier for a distance in yards, from Lite's Size and
 * Speed/Range Table (p. 28), which prints: 0 at up to 2 yd, then -1 at 3,
 * -2 at 5, -4 at 10, -5 at 15, -6 at 20, -7 at 30, -8 at 50, -9 at 70,
 * -10 at 100. (Lite's simplified table has no 7 yd / -3 row.) A distance
 * between rows uses the next row up. Past 100 yd the printed rows' own
 * decade pattern continues: -1 more at x1.5, x2, x3, x5, x7, x10.
 */
const ROWS: [limitYards: number, modifier: number][] = [
  [1 / 3, 0], // 1 ft
  [1, 0],
  [2, 0],
  [3, -1],
  [5, -2],
  [10, -4],
  [15, -5],
  [20, -6],
  [30, -7],
  [50, -8],
  [70, -9],
  [100, -10],
];

export function rangeModifier(yards: number): number {
  if (!(yards >= 0)) throw new Error(`Bad range "${yards}". Give the distance in yards, 0 or more.`);
  for (const [limit, mod] of ROWS) {
    if (yards <= limit) return mod;
  }
  // Past the printed table (p. 28): continue its decade pattern.
  let base = 100;
  let mod = -10;
  for (;;) {
    for (const factor of [1.5, 2, 3, 5, 7, 10]) {
      mod -= 1;
      if (yards <= base * factor) return mod;
    }
    base *= 10;
  }
}

/** A ranged weapon's range stats (p. 27), handed in — no equipment model yet. */
export interface RangeStats {
  /** Distance to the target in yards. */
  range: number;
  /** Half Damage (1/2D) range in yards: at or beyond it, damage halves. */
  half: number;
  /** Maximum range in yards; beyond it the shot is impossible. */
  max: number;
}

/** Plain refusal text when the target is beyond Max range (p. 27). */
export function outOfRange(stats: RangeStats): boolean {
  return stats.range > stats.max;
}

/** At or beyond 1/2D range, basic damage is halved, rounding down (p. 27). */
export function atHalfDamage(stats: RangeStats): boolean {
  return stats.range >= stats.half;
}
