/**
 * The combat slice (issue #19; Lite pp. 24-29): turn order, one attack roll,
 * one active defense roll, and damage applied to HP.
 *
 * Scope is deliberately narrow: the plain Attack maneuver only, defenses are
 * Dodge/Block/Parry per the p. 28 formulas, damage follows p. 29. Position,
 * reach, range and awareness are handed in as inputs (the "scene fact" /
 * yes-no shapes from Discussion #17), never invented. Other maneuvers, Aim
 * and ranged-specific rules, shock and knockdown are later slices.
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

/** A character in a fight, with current HP tracked separately from the sheet. */
export interface Combatant {
  character: Character;
  /** Current HP; starts at ST (p. 6) and drops as injury lands. */
  hp: number;
}

export function makeCombatant(character: Character): Combatant {
  return { character, hp: hitPoints(character) };
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
    case "dodge":
      return dodgeScore(defender, context.encumbrance ?? 0) + shieldDB;
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
  /** Null when no defense roll happened (critical hit, unaware, or "none"). */
  defense: RollResult | null;
  defenseScoreUsed: number | null;
  hit: boolean;
  /** Basic damage rolled, after minimums and any 1/2D halving; null on a miss. */
  basicDamage: number | null;
  penetrating: number | null;
  injury: number | null;
  defenderHpAfter: number;
}

/**
 * Resolve one attack: the attack roll, the defense roll if any, and damage.
 * On a hit the defender's HP drops (the Combatant is mutated). A critical
 * hit skips the defense roll (p. 28).
 */
export function attackExchange(
  setup: AttackSetup,
  registry: Registry,
  dice: DiceSource,
): AttackOutcome {
  const attack = resolve(
    { baseSkill: setup.attackSkill, modifiers: setup.attackModifiers },
    dice,
  );

  const defenderAware = setup.defenderAware ?? true;
  const critHit = attack.critical === "success";
  const mayDefend =
    attack.success && !critHit && defenderAware && setup.defense !== "none";

  let defense: RollResult | null = null;
  let score: number | null = null;
  if (mayDefend) {
    score = defenseScore(registry, setup.defender.character, setup.defense, setup.defenseContext);
    if (score !== null) {
      defense = resolve(
        {
          baseSkill: score,
          modifiers: setup.defenseModifiers,
          // Book rule, not the house rule: a defense roll of 3 or 4 always
          // succeeds even at effective defense 1 or 2 (p. 28) — the same
          // mechanics as "crit-only" mode.
          lowSkillMode: "crit-only",
        },
        dice,
      );
    }
  }

  const hit = attack.success && (defense === null || !defense.success);
  let basic: number | null = null;
  let penetrating: number | null = null;
  let injury: number | null = null;
  if (hit) {
    basic = basicDamage(rollDicePool(setup.damage, dice), setup.damageType, setup.halfDamage);
    const result = injuryFrom(basic, setup.dr ?? 0, setup.damageType);
    penetrating = result.penetrating;
    injury = result.injury;
    setup.defender.hp -= injury;
  }

  return {
    attack,
    defense,
    defenseScoreUsed: score,
    hit,
    basicDamage: basic,
    penetrating,
    injury,
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
  } else if (defense === null) {
    lines.push(
      names.defense === "none"
        ? `${names.defender} does not defend.`
        : `${names.defender} cannot defend (unaware, or the defense is not available).`,
    );
  } else {
    lines.push(
      `${names.defender} defends: ${names.defense} ${outcome.defenseScoreUsed}, ` +
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
  return lines;
}

/** Format a dice pool plus type the way the book lists it: "1d-1 cr". */
export function formatDamage(pool: DicePool, type: DamageType): string {
  return `${formatDicePool(pool)} ${type}`;
}
