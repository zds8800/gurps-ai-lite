/** Public exports for the success-roll slice. */

export { SeededDice, ScriptedDice, SystemDice } from "./core/dice.ts";
export type { DiceSource } from "./core/dice.ts";
export {
  OUTCOME,
  OUTCOME_CRITICAL_FAILURE,
  OUTCOME_CRITICAL_SUCCESS,
  OUTCOME_SUCCESS,
  outcomeBits,
} from "./core/outcome-table.ts";
export {
  PACK_CRITICAL_FAILURE,
  PACK_CRITICAL_SUCCESS,
  PACK_SUCCESS,
  packTotal,
  resolve,
  rollFast,
} from "./core/success-roll.ts";
export { quickContest } from "./core/quick-contest.ts";
export type { Contestant, ContestWinner, QuickContestResult } from "./core/quick-contest.ts";
export { rollOdds, successChance, TOTAL_COUNTS, TOTAL_OUTCOMES } from "./core/odds.ts";
export type { Odds } from "./core/odds.ts";
export {
  ATTRIBUTE_BASE,
  ATTRIBUTE_DEFS,
  attributeCost,
  derivedTraits,
  makeCharacter,
  pointTotal,
} from "./model/attribute.ts";
export type { AttributeDef, AttributeId, Character } from "./model/attribute.ts";
export { pointsToRelativeLevel } from "./model/skill.ts";
export type {
  Default,
  Difficulty,
  InvalidPointsMode,
  SkillDef,
  SkillRecord,
} from "./model/skill.ts";
export { baseSkillLevel, defaultLevel } from "./model/defaults.ts";
export { importGcsSheet } from "./model/gcs.ts";
export type { GcsImport } from "./model/gcs.ts";
export {
  basicMove,
  basicSpeed,
  dodgeScore,
  fatiguePoints,
  hitPoints,
  strengthDamage,
} from "./model/secondary.ts";
export { formatDicePool, parseDicePool, rollDicePool } from "./core/dice-pool.ts";
export type { DicePool } from "./core/dice-pool.ts";
export {
  attackExchange,
  basicDamage,
  bestDefense,
  bestLegalDefense,
  defenseBlocked,
  defenseScore,
  injuryFrom,
  makeCombatant,
  maneuverName,
  turnOrder,
} from "./combat/attack.ts";
export type {
  AttackOutcome,
  AttackSetup,
  Combatant,
  DamageType,
  DefenseChoice,
  DefenseContext,
  Maneuver,
} from "./combat/attack.ts";
export {
  applyInjury,
  canAct,
  consciousnessCheck,
  deathThresholdsCrossed,
  isMajorWound,
  isReeling,
  reelingDodge,
  shockPenalty,
  stunRecovery,
} from "./combat/injury.ts";
export type { Condition, DeathCheck, InjuryEffects } from "./combat/injury.ts";
export { atHalfDamage, outOfRange, rangeModifier } from "./combat/ranged.ts";
export type { RangeStats } from "./combat/ranged.ts";
export { Registry } from "./modules/loader.ts";
export type { RulesModule } from "./modules/loader.ts";
export { findSkill, LITE_CORE, LITE_SKILLS } from "./modules/lite-core/index.ts";
export type {
  Critical,
  LowSkillMode,
  Modifier,
  RollRequest,
  RollResult,
  RollStatus,
} from "./core/types.ts";
