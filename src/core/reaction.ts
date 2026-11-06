/**
 * Reaction rolls (issue #39; Lite p. 3). A reaction roll is 3d plus reaction
 * modifiers applied directly to the roll — not a success roll: no target
 * number, and high is good. The total is read on the Reaction Table.
 *
 * This is the pilot consumer of the hand-off channel (hand-off.ts): whether
 * the NPC's reaction is predetermined is a yes/no ruling, and the reaction
 * modifiers are numbers — both arrive from outside the roll itself.
 */

import type { Character } from "../model/attribute.ts";
import { traitReactionModifier } from "../model/traits.ts";
import type { ReactionContext } from "../model/traits.ts";
import { rollDicePool } from "./dice-pool.ts";
import type { DiceSource } from "./dice.ts";
import { resolveHandOff } from "./hand-off.ts";
import type { HandOffRequest } from "./hand-off.ts";

/** What a reaction roll needs from outside (p. 3). */
export const REACTION_REQUESTS = {
  /** "When the PCs meet an NPC whose reaction to them is not predetermined..." (p. 3). */
  predetermined: {
    shape: "yes-no",
    key: "reaction.predetermined",
    question: "Is this NPC's reaction to the characters predetermined?",
  },
  /** "Reaction modifiers apply directly to the die roll" (p. 3). */
  modifier: {
    shape: "number",
    key: "reaction.modifier",
    question: "What reaction modifiers apply (appearance, behavior, biases)?",
  },
} as const satisfies Record<string, HandOffRequest>;

/** One band of the Reaction Table (p. 3): totals up to and including `max`. */
export interface ReactionBand {
  max: number;
  name: string;
  /** The table's own guideline, first sentence. */
  guideline: string;
}

/** The Reaction Table (p. 3), transcribed as printed. */
export const REACTION_TABLE: readonly ReactionBand[] = [
  { max: 0, name: "Disastrous", guideline: "The NPC hates the characters and will act in their worst interest." },
  { max: 3, name: "Very Bad", guideline: "The NPC dislikes the characters and will act against them if it's convenient to do so." },
  { max: 6, name: "Bad", guideline: "The NPC cares nothing for the characters and will act against them if he can profit by doing so." },
  { max: 9, name: "Poor", guideline: "The NPC is unimpressed." },
  { max: 12, name: "Neutral", guideline: "The NPC ignores the characters as much as possible." },
  { max: 15, name: "Good", guideline: "The NPC likes the characters and will be helpful within normal, everyday limits." },
  { max: 18, name: "Very Good", guideline: "The NPC thinks highly of the characters and will be quite helpful and friendly." },
  { max: Infinity, name: "Excellent", guideline: "The NPC is extremely impressed by the characters, and will act in their best interests at all times, within the limits of his own ability." },
];

export function reactionBand(total: number): ReactionBand {
  return REACTION_TABLE.find((band) => total <= band.max)!;
}

export interface ReactionOutcome {
  /** The raw 3d total, before modifiers. */
  rolled: number;
  /** Sum of the reaction modifiers, applied directly to the roll (p. 3). */
  modifier: number;
  total: number;
  band: ReactionBand;
}

/** Roll 3d, apply the modifiers directly, read the band (p. 3). */
export function reactionRoll(modifier: number, dice: DiceSource): ReactionOutcome {
  const rolled = rollDicePool({ dice: 3, adds: 0 }, dice);
  const total = rolled + modifier;
  return { rolled, modifier, total, band: reactionBand(total) };
}

/**
 * The sheet's answers to the reaction requests (resolution order: sheet
 * first, issue #39). Standing modifiers whose label mentions "reaction"
 * supply the base modifier. Trait bonuses are added separately by
 * resolveReaction because their recognition/hearing/interaction context matters.
 */
export function reactionSheetAnswers(character: Character | null): (key: string) => number | undefined {
  return (key: string) => {
    if (key !== REACTION_REQUESTS.modifier.key || !character) return undefined;
    const mods = character.modifiers.filter((m) => m.label.toLowerCase().includes("reaction"));
    if (mods.length === 0) return undefined;
    return mods.reduce((sum, m) => sum + m.value, 0);
  };
}

/**
 * A reaction roll through the channel: a predetermined reaction means no
 * roll at all (p. 3); otherwise the modifier is the sheet's answer, else the
 * typed one, else zero.
 */
export function resolveReaction(
  character: Character | null,
  typed: { predetermined?: boolean; modifier?: number; context?: ReactionContext },
  dice: DiceSource,
): ReactionOutcome | "predetermined" {
  const sheet = reactionSheetAnswers(character);
  const predetermined = resolveHandOff(REACTION_REQUESTS.predetermined, sheet, typed.predetermined);
  if (predetermined === true) return "predetermined";
  const base = resolveHandOff(REACTION_REQUESTS.modifier, sheet, typed.modifier) ?? 0;
  const traits = character ? traitReactionModifier(character, typed.context) : 0;
  return reactionRoll((base as number) + traits, dice);
}
