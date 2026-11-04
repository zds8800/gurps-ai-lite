/** Shared types for the success-roll core. Plain data only, no hidden state. */

/** A labelled modifier to a target number. Cumulative (Lite p. 2). */
export interface Modifier {
  label: string;
  value: number;
  tags?: string[];
}

/** House-rule switch for effective skill 1-2 (decision D4). "book" is the default. */
export type LowSkillMode = "book" | "crit-only";

/** What the engine is asked to do for one success roll. */
export interface RollRequest {
  /**
   * The skill or attribute level on the sheet, before situation modifiers.
   * null means the character has no usable skill and no default (for example
   * Karate untrained, Lite p. 15): the roll is refused.
   */
  baseSkill: number | null;
  /** Situation modifiers for this roll. Cumulative, uncapped (D5). */
  modifiers?: Modifier[];
  /** House rule for effective skill 1-2. Defaults to "book" (may not attempt). */
  lowSkillMode?: LowSkillMode;
  /** Build human-readable trace lines. Off by default so the hot path stays cheap. */
  explain?: boolean;
}

export type RollStatus = "rolled" | "not-allowed";
export type Critical = "none" | "success" | "failure";

/** The answer to one success roll. */
export interface RollResult {
  request: RollRequest;
  status: RollStatus;
  /** Base skill plus modifiers. Null when there is no usable skill at all. */
  effectiveSkill: number | null;
  /** The three dice, when the source tracks them; null for scripted totals. */
  dice: [number, number, number] | null;
  /** 3d total, 3 to 18. Null when no dice were thrown. */
  total: number | null;
  success: boolean;
  critical: Critical;
  /**
   * Margin of success (effective skill - total) or margin of failure
   * (total - effective skill). Follows the approved cases: positive in
   * normal play, negative only for the D2 automatic-result anomalies.
   * Null when no dice were thrown.
   */
  margin: number | null;
  /** Reason lines, present only when the request set explain: true. */
  trace?: string[];
}
