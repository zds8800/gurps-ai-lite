/**
 * The combat slice (issue #19; Lite pp. 24-29): turn order, one attack roll,
 * one active defense roll, and damage applied to HP. Issue #23 added the
 * injury effects of pp. 29-30 (reeling, shock, major wounds, stun,
 * consciousness, death checks); those rules live in injury.ts.
 *
 * Scope is deliberately narrow: the plain Attack maneuver only, defenses are
 * Dodge/Block/Parry per the p. 28 formulas, damage follows p. 29. Position,
 * reach, range and awareness are handed in as inputs (the "scene fact" /
 * yes-no shapes from Discussion #17), never invented. Other maneuvers, Aim
 * and ranged-specific rules are later slices.
 */

import type { Character } from "../model/attribute.ts";
import { baseSkillLevel } from "../model/defaults.ts";
import { hitPoints, basicSpeed, dodgeScore } from "../model/secondary.ts";
import type { Registry } from "../modules/loader.ts";
import type { DiceSource } from "../core/dice.ts";
import type { DicePool } from "../core/dice-pool.ts";
import { formatDicePool, rollDicePool } from "../core/dice-pool.ts";
import { resolve } from "../core/success-roll.ts";
import type { Modifier, RollResult } from "../core/types.ts";
import type { Condition, InjuryEffects } from "./injury.ts";
import { applyInjury, consciousnessCheck, isReeling, reelingDodge } from "./injury.ts";

/** A character in a fight, with current HP tracked separately from the sheet. */
export interface Combatant {
  character: Character;
  /** Current HP; starts at ST (p. 6) and drops as injury lands. */
  hp: number;
  /**
   * Shock (p. 30): a penalty to this combatant's next DX/IQ-based roll,
   * equal to the HP they just lost, capped at -4. Spent on their next turn.
   */
  shock: number;
  /** Injury state ladder (pp. 29-30). Anything past "stunned" cannot act. */
  condition: Condition;
}

export function makeCombatant(character: Character): Combatant {
  return { character, hp: hitPoints(character), shock: 0, condition: "ok" };
}

/**
 * Turn order (p. 24): descending Basic Speed; ties involving PCs go to the
 * highest DX. A tie still unbroken after DX is the GM's call (p. 24) — the
 * input order is kept and the caller should note it.
 */
export function turnOrder(combatants: readonly Combatant[]): Combatant[] {
  return combatants
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const speedDiff = basicSpeed(b.c.character) - basicSpeed(a.c.character);
      if (speedDiff !== 0) return speedDiff;
      const dxDiff = b.c.character.attributes.DX - a.c.character.attributes.DX;
      if (dxDiff !== 0) return dxDiff;
      return a.i - b.i; // still tied: GM decides (p. 24); keep input order
    })
    .map(({ c }) => c);
}

/** Damage types and their wounding modifiers (p. 29). Others (cr, pi) are x1. */
export type DamageType = "cr" | "cut" | "imp" | "pi-" | "pi" | "pi+";

const WOUNDING_MODIFIER: Record<DamageType, number> = {
  cr: 1,
  pi: 1,
  "pi-": 0.5,
  cut: 1.5,
  "pi+": 1.5,
  imp: 2,
};

export type DefenseChoice = "dodge" | "block" | "parry" | "none";

export interface DefenseContext {
  /** Encumbrance level of the defender (0-4); lowers Dodge (pp. 22, 28). */
  encumbrance?: number;
  /** Shield Defense Bonus, added to any defense from the front/shield side (p. 28). */
  shieldDB?: number;
  /** Skill the defender parries with (required for a parry). */
  parrySkillId?: string;
  /** Reeling (p. 29): below 1/3 HP, Dodge is halved (round up). */
  reeling?: boolean;
}

/**
 * The defender's score for one active defense, per the p. 28 formulas, or
 * null when that defense is not available (no Shield skill for a block, no
 * usable parry skill). "none" scores null.
 */
export function defenseScore(
  registry: Registry,
  defender: Character,
  choice: DefenseChoice,
  context: DefenseContext = {},
): number | null {
  const shieldDB = context.shieldDB ?? 0;
  switch (choice) {
    case "dodge": {
      const dodge = dodgeScore(defender, context.encumbrance ?? 0);
      return (context.reeling ? reelingDodge(dodge) : dodge) + shieldDB;
    }
    case "block": {
      const shield = registry.skill("shield");
      if (!shield) return null;
      const level = baseSkillLevel(defender, shield);
      if (level === null) return null;
      return 3 + Math.floor(level / 2) + shieldDB;
    }
    case "parry": {
      if (!context.parrySkillId) return null;
      const skill = registry.skill(context.parrySkillId);
      if (!skill) return null;
      const level = baseSkillLevel(defender, skill);
      if (level === null) return null;
      return 3 + Math.floor(level / 2) + shieldDB;
    }
    case "none":
      return null;
  }
}

/** The best defense the defender can actually take, for a CLI default. */
export function bestDefense(
  registry: Registry,
  defender: Character,
  context: DefenseContext = {},
): { choice: DefenseChoice; score: number } | null {
  let best: { choice: DefenseChoice; score: number } | null = null;
  for (const choice of ["dodge", "block", "parry"] as const) {
    const score = defenseScore(registry, defender, choice, context);
    if (score !== null && (best === null || score > best.score)) best = { choice, score };
  }
  return best;
}

/**
 * Basic damage after the roll minimums (p. 29): a negative modifier can't
 * take damage below 0 for crushing, below 1 for any other type. A ranged
 * attack at or past 1/2D range halves, rounding down.
 */
export function basicDamage(rolled: number, type: DamageType, halfDamage = false): number {
  const floor = type === "cr" ? 0 : 1;
  const basic = Math.max(rolled, floor);
  return halfDamage ? Math.floor(basic / 2) : basic;
}

/**
 * Penetrating damage and injury (p. 29): basic minus DR; penetrating damage
 * times the wounding modifier, fractions rounded down; any penetration
 * injures for at least 1 HP.
 */
export function injuryFrom(
  basic: number,
  dr: number,
  type: DamageType,
): { penetrating: number; injury: number } {
  const penetrating = Math.max(0, basic - dr);
  if (penetrating === 0) return { penetrating, injury: 0 };
  return { penetrating, injury: Math.max(1, Math.floor(penetrating * WOUNDING_MODIFIER[type])) };
}

/** Everything one attack exchange needs. Levels and facts are inputs. */
export interface AttackSetup {
  attacker: Combatant;
  /** Attacker's base level with the weapon or unarmed skill, from the model. */
  attackSkill: number;
  attackModifiers?: Modifier[];
  damage: DicePool;
  damageType: DamageType;
  defender: Combatant;
  /** The defense the defender attempts; "none" or an unaware defender skips the roll. */
  defense: DefenseChoice;
  defenderAware?: boolean;
  defenseModifiers?: Modifier[];
  /** Damage Resistance on the defender's side (armor, cover); default 0. */
  dr?: number;
  /** Ranged attack at or past 1/2D range: halve basic damage (p. 29). */
  halfDamage?: boolean;
  /** Defense computation inputs (encumbrance, shield, parry skill). */
  defenseContext?: DefenseContext;
}

export interface AttackOutcome {
  attack: RollResult;
  /** Shock penalty spent on this attack roll (p. 30), or null if none. */
  shockApplied: number | null;
  /** Null when no defense roll happened (critical hit, unaware, or "none"). */
  defense: RollResult | null;
  defenseScoreUsed: number | null;
  /** The defender's HT roll to stay conscious at 0 HP or less (p. 29), if required. */
  defenderConsciousness: { roll: RollResult; modifier: number; stayedConscious: boolean } | null;
  /** True when the defense rolled at -4 for stun (p. 30). */
  defenseStunned: boolean;
  hit: boolean;
  /** Basic damage rolled, after minimums and any 1/2D halving; null on a miss. */
  basicDamage: number | null;
  penetrating: number | null;
  injury: number | null;
  /** Shock, major-wound and death-check results of the hit (pp. 29-30); null on a miss. */
  injuryEffects: InjuryEffects | null;
  defenderHpAfter: number;
}

/**
 * Resolve one attack: the attack roll, the defense roll if any, and damage.
 * On a hit the defender's HP drops and the injury effects of pp. 29-30 play
 * out (the Combatant is mutated). A critical hit skips the defense roll
 * (p. 28). An unconscious, mortally wounded or dead defender gets no
 * defense; a defender at 0 HP or less must first stay conscious (p. 29).
 */
export function attackExchange(
  setup: AttackSetup,
  registry: Registry,
  dice: DiceSource,
): AttackOutcome {
  // Shock (p. 30): the attacker's DX/IQ rolls take the penalty this turn.
  const attackModifiers = [...(setup.attackModifiers ?? [])];
  let shockApplied: number | null = null;
  if (setup.attacker.shock > 0) {
    shockApplied = setup.attacker.shock;
    attackModifiers.push({ label: "shock", value: -setup.attacker.shock });
    setup.attacker.shock = 0;
  }
  const attack = resolve({ baseSkill: setup.attackSkill, modifiers: attackModifiers }, dice);

  const defenderAware = setup.defenderAware ?? true;
  const critHit = attack.critical === "success";
  const defenderDown =
    setup.defender.condition === "unconscious" ||
    setup.defender.condition === "mortally-wounded" ||
    setup.defender.condition === "dead";

  let defense: RollResult | null = null;
  let score: number | null = null;
  let defenderConsciousness: AttackOutcome["defenderConsciousness"] = null;
  let defenseStunned = false;
  const mayDefend =
    attack.success && !critHit && defenderAware && !defenderDown && setup.defense !== "none";
  if (mayDefend) {
    // 0 HP or less (p. 29): attempting a defense roll first takes a HT roll
    // to stay conscious.
    if (setup.defender.hp <= 0) {
      defenderConsciousness = consciousnessCheck(setup.defender, dice);
    }
    if (defenderConsciousness === null || defenderConsciousness.stayedConscious) {
      defenseStunned = setup.defender.condition === "stunned";
      score = defenseScore(registry, setup.defender.character, setup.defense, {
        ...setup.defenseContext,
        reeling: isReeling(hitPoints(setup.defender.character), setup.defender.hp),
      });
      if (score !== null) {
        const defenseModifiers = [...(setup.defenseModifiers ?? [])];
        if (defenseStunned) defenseModifiers.push({ label: "stunned", value: -4 }); // p. 30
        defense = resolve(
          {
            baseSkill: score,
            modifiers: defenseModifiers,
            // Book rule, not the house rule: a defense roll of 3 or 4 always
            // succeeds even at effective defense 1 or 2 (p. 28) — the same
            // mechanics as "crit-only" mode.
            lowSkillMode: "crit-only",
          },
          dice,
        );
      }
    }
  }

  const hit = attack.success && (defense === null || !defense.success);
  let basic: number | null = null;
  let penetrating: number | null = null;
  let injury: number | null = null;
  let injuryEffects: InjuryEffects | null = null;
  if (hit) {
    basic = basicDamage(rollDicePool(setup.damage, dice), setup.damageType, setup.halfDamage);
    const result = injuryFrom(basic, setup.dr ?? 0, setup.damageType);
    penetrating = result.penetrating;
    injury = result.injury;
    // HP loss, shock, major wounds and death checks (pp. 29-30).
    injuryEffects = applyInjury(setup.defender, injury, dice);
  }

  return {
    attack,
    shockApplied,
    defense,
    defenseScoreUsed: score,
    defenderConsciousness,
    defenseStunned,
    hit,
    basicDamage: basic,
    penetrating,
    injury,
    injuryEffects,
    defenderHpAfter: setup.defender.hp,
  };
}

/** One human-readable narration of an exchange, for the CLI. */
export function narrate(
  outcome: AttackOutcome,
  names: { attacker: string; defender: string; attackLabel: string; defense: DefenseChoice },
): string[] {
  const { attack, defense } = outcome;
  const lines: string[] = [];
  if (outcome.shockApplied !== null) {
    lines.push(`${names.attacker} is in shock: -${outcome.shockApplied} to this roll (p. 30).`);
  }
  const critText =
    attack.critical === "success" ? " Critical hit!" : attack.critical === "failure" ? " Critical failure!" : "";
  lines.push(
    `${names.attacker} attacks with ${names.attackLabel} (effective ${attack.effectiveSkill}): ` +
      `rolled ${attack.total} — ${attack.success ? `success by ${attack.margin}` : `failure by ${attack.margin}`}.${critText}`,
  );
  if (!attack.success) {
    lines.push("The attack misses.");
    return lines;
  }
  if (attack.critical === "success") {
    lines.push(`${names.defender} gets no defense roll against a critical hit (p. 28).`);
  } else if (outcome.defenderConsciousness !== null && !outcome.defenderConsciousness.stayedConscious) {
    const c = outcome.defenderConsciousness;
    const modText = c.modifier === 0 ? "" : ` (${c.modifier} for HP below zero)`;
    lines.push(
      `${names.defender}, at 0 HP or less, rolls vs HT${modText} to stay conscious: ` +
        `rolled ${c.roll.total} — failure by ${c.roll.margin}. ${names.defender} falls unconscious (p. 29).`,
    );
  } else if (defense === null) {
    lines.push(
      names.defense === "none"
        ? `${names.defender} does not defend.`
        : `${names.defender} cannot defend (unaware, down, or the defense is not available).`,
    );
  } else {
    if (outcome.defenderConsciousness !== null) {
      const c = outcome.defenderConsciousness;
      const modText = c.modifier === 0 ? "" : ` (${c.modifier} for HP below zero)`;
      lines.push(
        `${names.defender}, at 0 HP or less, rolls vs HT${modText} to stay conscious: ` +
          `rolled ${c.roll.total} — success by ${c.roll.margin}.`,
      );
    }
    const stunText = outcome.defenseStunned ? " (-4: stunned)" : "";
    lines.push(
      `${names.defender} defends: ${names.defense} ${outcome.defenseScoreUsed}${stunText}, ` +
        `rolled ${defense.total} — ${defense.success ? `success by ${defense.margin}` : `failure by ${defense.margin}`}.`,
    );
    if (defense.success) {
      lines.push("The attack is turned aside.");
      return lines;
    }
  }
  lines.push(
    `Hit for ${outcome.basicDamage} basic damage` +
      (outcome.penetrating !== null ? `; ${outcome.penetrating} penetrates` : "") +
      `; injury ${outcome.injury}. ${names.defender} is at HP ${outcome.defenderHpAfter}.`,
  );
  lines.push(...narrateInjury(outcome, names.defender));
  return lines;
}

/** The pp. 29-30 consequences of a hit: shock, major wounds, death checks. */
function narrateInjury(outcome: AttackOutcome, defender: string): string[] {
  const fx = outcome.injuryEffects;
  if (fx === null || outcome.injury === 0) return [];
  const lines: string[] = [];
  if (fx.shockAfter > 0) {
    lines.push(`${defender} is in shock: -${fx.shockAfter} to DX and IQ on their next turn (p. 30).`);
  }
  if (fx.majorWound && fx.knockdownRoll !== null) {
    const roll = fx.knockdownRoll;
    if (roll.success) {
      lines.push(`Major wound! ${defender} rolls vs HT: rolled ${roll.total} — success by ${roll.margin}; keeps fighting (p. 30).`);
    } else if (fx.conditionAfter === "unconscious") {
      lines.push(`Major wound! ${defender} rolls vs HT: rolled ${roll.total} — failure by ${roll.margin}. ${defender} is knocked unconscious (p. 30).`);
    } else {
      lines.push(`Major wound! ${defender} rolls vs HT: rolled ${roll.total} — failure by ${roll.margin}. ${defender} is stunned and knocked down (p. 30).`);
    }
  }
  for (const check of fx.deathChecks) {
    const at = `${defender} is at -${check.multiple}xHP and rolls vs HT or die: rolled ${check.roll.total} — `;
    if (check.outcome === "survived") {
      lines.push(`${at}success by ${check.roll.margin}. Still fighting (p. 30).`);
    } else if (check.outcome === "mortal") {
      lines.push(`${at}failure by ${check.roll.margin}. ${defender} is mortally wounded — incapacitated, and any later failed death roll is fatal (p. 30).`);
    } else {
      lines.push(`${at}failure by ${check.roll.margin}. ${defender} dies.`);
    }
  }
  if (fx.diedInstantly) {
    lines.push(`${defender} has reached -5xHP: death is immediate, no roll (p. 30). ${defender} dies.`);
  }
  return lines;
}

/** Format a dice pool plus type the way the book lists it: "1d-1 cr". */
export function formatDamage(pool: DicePool, type: DamageType): string {
  return `${formatDicePool(pool)} ${type}`;
}
