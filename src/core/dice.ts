/**
 * Dice sources (design section 5). The engine never calls Math.random;
 * every roll comes from a DiceSource the caller passes in.
 *
 * Ideas (seeded and scripted streams) were noted from gurps-combat-engine,
 * which has no license; no code was copied. This implementation is original.
 */

export interface DiceSource {
  /** One six-sided die, 1 to 6. */
  d6(): number;
  /** Three six-sided dice added together, 3 to 18. */
  roll3d(): number;
}

/** Largest multiple of 6 below 2^32; draws at or above this are rejected. */
const REJECT_AT = 4294967292; // Math.floor(2 ** 32 / 6) * 6

/** mulberry32: one 32-bit state word, a few integer ops per draw. */
export class SeededDice implements DiceSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Saveable state: one integer. */
  getState(): number {
    return this.state >>> 0;
  }

  /** Resume a saved run exactly where it left off. */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  private next32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  d6(): number {
    // Rejection sampling keeps the result unbiased.
    let x = this.next32();
    while (x >= REJECT_AT) x = this.next32();
    return (x % 6) + 1;
  }

  roll3d(): number {
    // Per-die values are not kept: no GURPS mechanic needs them, and the
    // caller asked the engine to track totals only.
    return this.d6() + this.d6() + this.d6();
  }

  /**
   * Child streams for parallel runs: split(n) derives n independent seeded
   * streams from the current state, so results do not depend on thread timing.
   * Split once, before the run; the parent stream is unchanged.
   */
  split(count: number): SeededDice[] {
    const out: SeededDice[] = [];
    for (let i = 0; i < count; i++) {
      // splitmix32 mix of (state, i) gives each worker a well-separated seed.
      let z = (this.state + Math.imul(i + 1, 0x9e3779b9)) >>> 0;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      z = (z ^ (z >>> 15)) >>> 0;
      out.push(new SeededDice(z));
    }
    return out;
  }
}

/**
 * Tests feed exact totals. values are consumed one per roll3d(); a value must
 * be a valid 3d total (3 to 18). Running out of values is an error.
 */
export class ScriptedDice implements DiceSource {
  private readonly values: readonly number[];
  private index = 0;

  constructor(values: readonly number[]) {
    this.values = values;
  }

  /** How many scripted values have not been consumed yet. */
  get remaining(): number {
    return this.values.length - this.index;
  }

  private next(): number {
    if (this.index >= this.values.length) {
      throw new Error("ScriptedDice: ran out of scripted values");
    }
    return this.values[this.index++];
  }

  d6(): number {
    const v = this.next();
    if (!Number.isInteger(v) || v < 1 || v > 6) {
      throw new Error(`ScriptedDice: d6 value must be 1 to 6, got ${v}`);
    }
    return v;
  }

  roll3d(): number {
    const v = this.next();
    if (!Number.isInteger(v) || v < 3 || v > 18) {
      throw new Error(`ScriptedDice: roll3d total must be 3 to 18, got ${v}`);
    }
    return v;
  }
}

/** Real dice for solo play when no seed is given. Unbiased via crypto random. */
export class SystemDice implements DiceSource {
  d6(): number {
    // globalThis.crypto is available in all supported Node versions and browsers.
    const buf = new Uint32Array(1);
    let x: number;
    do {
      globalThis.crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= REJECT_AT);
    return (x % 6) + 1;
  }

  roll3d(): number {
    return this.d6() + this.d6() + this.d6();
  }
}
