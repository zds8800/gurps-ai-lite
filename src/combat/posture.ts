/**
 * Postures and the Posture Table (issue #43; Lite p. 25). The Attack column
 * modifies melee attacks only; Defense modifies all active defense rolls;
 * Target modifies rolls to hit the postured character with a ranged attack.
 * Movement effects are data only — there is no movement model.
 */

export type Posture = "standing" | "crouching" | "kneeling" | "crawling" | "sitting" | "lying";

export interface PostureRow {
  /** Melee attack modifier. */
  attack: number;
  /** Active defense modifier. */
  defense: number;
  /** Modifier to hit this character with a ranged attack. */
  target: number;
  /** The printed Movement column, as text (data only). */
  movement: string;
}

/** The Posture Table (p. 25), transcribed as printed. */
export const POSTURE_TABLE: Record<Posture, PostureRow> = {
  standing: { attack: 0, defense: 0, target: 0, movement: "Normal; may sprint" },
  crouching: { attack: -2, defense: 0, target: -2, movement: "2/3" },
  kneeling: { attack: -2, defense: -2, target: -2, movement: "1/3" },
  crawling: { attack: -4, defense: -3, target: -2, movement: "1/3" },
  sitting: { attack: -2, defense: -2, target: -2, movement: "None" },
  lying: { attack: -4, defense: -3, target: -2, movement: "1 yard/second" },
};

/** Lying down covers both printed postures: prone (face down) and face up. */
export function parsePosture(word: string): Posture | null {
  const w = word.toLowerCase();
  if (w === "lying" || w === "prone" || w === "lying down") return "lying";
  if (w === "crouch" || w === "crouching") return "crouching";
  if (["standing", "kneeling", "crawling", "sitting"].includes(w)) return w as Posture;
  return null;
}

/**
 * Change Posture (p. 25): any two postures in one maneuver, except that you
 * cannot stand up directly from lying — rise to crawling, kneeling or
 * sitting first. (Kneeling and standing also trade freely as a step, but
 * steps are not modeled.)
 */
export function postureChangeError(current: Posture, next: Posture): string | null {
  if (current === "lying" && next === "standing") {
    return (
      "You cannot stand up directly from a lying position (p. 25). " +
      "Take Change Posture to crawling, kneeling or sitting first, then stand next turn."
    );
  }
  return null;
}
