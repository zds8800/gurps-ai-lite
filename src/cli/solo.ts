/**
 * Plain text solo interface (design section 7). A command loop over fixed
 * verbs with plain string rules — no language model, no fuzzy parsing.
 * The same commands can be fed from a file (pipe stdin) so a script or an
 * AI can play the same game.
 *
 * Per the owner ruling on issue #8, rolls print totals only; no GURPS
 * mechanic uses per-die values.
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeCharacter, pointTotal } from "../model/attribute.ts";
import type { AttributeId, Character } from "../model/attribute.ts";
import { baseSkillLevel } from "../model/defaults.ts";
import { importGcsSheet } from "../model/gcs.ts";
import { pointsToRelativeLevel } from "../model/skill.ts";
import type { SkillDef } from "../model/skill.ts";
import { Registry } from "../modules/loader.ts";
import { LITE_CORE } from "../modules/lite-core/index.ts";
import { rollOdds } from "../core/odds.ts";
import { resolve } from "../core/success-roll.ts";
import { quickContest } from "../core/quick-contest.ts";
import { resolveReaction } from "../core/reaction.ts";
import { SeededDice, SystemDice } from "../core/dice.ts";
import { parseDicePool, formatDicePool } from "../core/dice-pool.ts";
import { strengthDamage, hitPoints } from "../model/secondary.ts";
import {
  attackExchange,
  bestDefense,
  defenseScore,
  makeCombatant,
  maneuverName,
  narrate,
  turnOrder,
} from "../combat/attack.ts";
import { consciousnessCheck, isReeling, stunRecovery } from "../combat/injury.ts";
import { atHalfDamage, outOfRange, rangeModifier } from "../combat/ranged.ts";
import type { RangeStats } from "../combat/ranged.ts";
import {
  ARMOR_TABLE,
  findArmor,
  findMeleeWeapon,
  findMeleeWeaponForSkill,
  findRangedWeapon,
  findShield,
  MELEE_WEAPON_TABLE,
  RANGED_WEAPON_TABLE,
  SHIELD_TABLE,
  startingWealth,
  WEALTH_LEVELS,
} from "../model/equipment.ts";
import type { MeleeWeapon, RangedWeapon, WeaponDamage } from "../model/equipment.ts";
import type { Combatant, DamageType, DefenseChoice, Maneuver } from "../combat/attack.ts";
import type { DiceSource } from "../core/dice.ts";
import type { Modifier } from "../core/types.ts";

/** A side's standing defense choice; "best" auto-picks the highest available score. */
type DefensePolicy = DefenseChoice | "best";

/** One fighter in the combat roster, with their standing defense policy. */
interface Fighter {
  combatant: Combatant;
  policy: DefensePolicy;
  /**
   * Aim in progress (pp. 25-26): the target, the weapon's Accuracy (and a
   * built-in scope's separate bonus, pp. 19-20), the readied weapon aimed
   * with, seconds spent, and bracing. Spent by the next Attack or All-Out
   * Attack; the bonus applies only against the aimed target, with that weapon.
   */
  aim?: { target: Combatant; acc: number; scopeBonus: number; weapon: string | null; seconds: number; braced: boolean };
}

export interface SoloState {
  registry: Registry;
  character: Character | null;
  dice: DiceSource;
  /** Campaign tech level (p. 7): gates purchases and sets starting wealth (p. 18). */
  tl: number;
  /**
   * The fight (issue #31): a roster, not two sides. `you` is the loaded
   * character; `npcs` are everyone else. HP, shock, condition, maneuver and
   * the once-per-turn Block/Parry counts live on each Combatant; the defense
   * policy is per-fighter. turnIndex is informational, moved by `next`.
   */
  combat: { you: Fighter; npcs: Fighter[]; turnIndex: number } | null;
}

export function makeSoloState(): SoloState {
  const registry = new Registry();
  registry.load(LITE_CORE);
  return { registry, character: null, dice: new SystemDice(), combat: null, tl: 3 };
}

const ATTRIBUTE_IDS = ["ST", "DX", "IQ", "HT"] as const;
const DIFFICULTY_NAME = { E: "Easy", A: "Average", H: "Hard" } as const;

function displayName(skill: SkillDef): string {
  return skill.name.replace(/\/TL$/, "");
}

function findSkillRef(state: SoloState, word: string): SkillDef | string {
  const byId = state.registry.skill(word.toLowerCase());
  if (byId) return byId;
  const matches = state.registry
    .listSkills()
    .filter(({ skill }) => skill.name.toLowerCase() === word.toLowerCase());
  if (matches.length === 1) return matches[0].skill;
  if (matches.length > 1) return `"${word}" matches several skills; use the id (see: skills ${word}).`;
  return `Unknown skill "${word}". Try: skills ${word}`;
}

function parseModifiers(tokens: string[]): Modifier[] | string {
  const mods: Modifier[] = [];
  for (const t of tokens) {
    if (!/^[+-]\d+$/.test(t)) {
      return `Bad modifier "${t}". Modifiers look like +2 or -5.`;
    }
    mods.push({ label: "command line", value: Number(t) });
  }
  return mods;
}

function formatMods(mods: Modifier[]): string {
  if (mods.length === 0) return "";
  const parts = mods.map((m) => (m.value >= 0 ? `+${m.value}` : `${m.value}`));
  return `, modifier${mods.length > 1 ? "s" : ""} ${parts.join(" ")}`;
}

/** Relative level with an explicit sign, e.g. +0, -1, +2. */
function relSigned(rel: number): string {
  return rel >= 0 ? `+${rel}` : `${rel}`;
}

/** The combat skill a combatant parries with: their first trained combat skill, if any. */
function combatantParrySkill(state: SoloState, combatant: Combatant): string | undefined {
  return combatant.character.skills.find((r) => {
    const def = state.registry.skill(r.skillId);
    return def?.combat && r.points > 0;
  })?.skillId;
}

// ---- Equipment helpers (issue #35; Lite pp. 18-22) ----

/** The character's ready melee weapon usable with this skill, if any. */
function readyMeleeFor(character: Character, skillId: string): MeleeWeapon | null {
  if (!character.readyMelee) return null;
  const w = findMeleeWeaponForSkill(character.readyMelee, skillId);
  return w !== null && w.skillId === skillId ? w : null;
}

/**
 * The character's ready ranged weapon usable with this skill: the readied
 * ranged weapon, or the readied melee weapon's thrown row (p. 21 notes).
 */
function readyRangedFor(character: Character, skillId: string): RangedWeapon | null {
  for (const name of [character.readyRanged, character.readyMelee]) {
    if (!name) continue;
    const w = findRangedWeapon(name) ?? findRangedWeapon(`${name} (thrown)`);
    if (w && w.skillId === skillId) return w;
  }
  return null;
}

/** The character's own copy of a ranged weapon (crossbows/bows carry their own ST, p. 20). */
function ownedRanged(character: Character, w: RangedWeapon) {
  const base = w.name.replace(/ \(thrown\)$/, "").toLowerCase();
  return character.equipment?.find((e) => e.name.toLowerCase() === base) ?? null;
}

/** The ST a weapon's damage and range are computed from (pp. 19-20). */
function weaponST(character: Character, w: RangedWeapon): number {
  return w.usesOwnST ? (ownedRanged(character, w)?.st ?? w.minST) : character.attributes.ST;
}

/** The DR a character's worn armor gives (p. 18), and a ready shield's DB (p. 19). */
function wornDR(character: Character): number {
  return character.wornArmor ? (findArmor(character.wornArmor)?.dr ?? 0) : 0;
}
function readyShieldDB(character: Character): number {
  return character.readyShield ? (findShield(character.readyShield)?.db ?? 0) : 0;
}

/** Format dollars the way the book does: $4,040. */
function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** Pick one of a weapon's printed modes ("swing", "thrust", "two hands"); default is the first row. */
function pickMode(w: MeleeWeapon, modeWord: string | null): WeaponDamage | string {
  if (modeWord === null) return w.modes[0];
  const m = w.modes.find((md) => (md.label ?? "").toLowerCase().includes(modeWord));
  if (!m) {
    return `${w.name} has no "${modeWord}" mode. Modes: ${w.modes.map((md) => md.label ?? "standard").join(", ")}.`;
  }
  return m;
}

/** Every fighter in the fight, you first. */
function allFighters(combat: NonNullable<SoloState["combat"]>): Fighter[] {
  return [combat.you, ...combat.npcs];
}

/**
 * Match leading command words against fighter names, longest first, in whole
 * words ("edge" matches "Edge Case"). Returns the fighter and the remaining
 * words, an error string on an ambiguous match, or null when nothing matches.
 */
function matchFighter(
  fighters: Fighter[],
  words: string[],
  exclude?: Fighter,
): { fighter: Fighter; rest: string[] } | string | null {
  const pool = exclude ? fighters.filter((f) => f !== exclude) : fighters;
  for (let len = Math.min(words.length, 4); len >= 1; len--) {
    const candidate = words.slice(0, len).join(" ").toLowerCase();
    const matches = pool.filter((f) => {
      const n = f.combatant.character.name.toLowerCase();
      return n === candidate || n.startsWith(candidate + " ");
    });
    if (matches.length === 1) return { fighter: matches[0], rest: words.slice(len) };
    if (matches.length > 1)
      return `"${words.slice(0, len).join(" ")}" matches several fighters: ${matches.map((f) => f.combatant.character.name).join(", ")}.`;
  }
  return null;
}

/** The legacy foe… commands address the one opponent; with more, say so. */
function soleNpc(state: SoloState): Fighter | string {
  if (!state.combat) return "No fight yet. Load yourself (new/load) and a foe: foe <file>.";
  if (state.combat.npcs.length !== 1)
    return "Several fighters are in play — name one: npc <name> <attack|shoot|allout|moveattack|aim|defend|alloutdefense|donothing> ...";
  return state.combat.npcs[0];
}

/** Your attack target: the named fighter, or the only opponent (issue #31). */
function resolveTarget(state: SoloState, args: string[]): { target: Fighter; rest: string[] } | string[] {
  const combat = state.combat!;
  const m = matchFighter(combat.npcs, args);
  if (typeof m === "string") return [m];
  if (m) return { target: m.fighter, rest: m.rest };
  if (combat.npcs.length === 1) return { target: combat.npcs[0], rest: args };
  return [
    `Attack whom? Name the target first — fighters: ${combat.npcs.map((f) => f.combatant.character.name).join(", ")}.`,
  ];
}

/** Set a fighter's standing defense (p. 28); shared by defend and npc. */
function setDefensePolicy(state: SoloState, fighter: Fighter, raw: string, cmd: string): string[] {
  const policy = raw.toLowerCase();
  if (!["dodge", "block", "parry", "none", "best"].includes(policy)) {
    return [`Usage: ${cmd} <dodge|block|parry|none|best>`];
  }
  const name = fighter.combatant.character.name;
  if (policy === "dodge" || policy === "block" || policy === "parry") {
    const score = defenseScore(state.registry, fighter.combatant.character, policy as DefenseChoice, {
      parrySkillId: combatantParrySkill(state, fighter.combatant),
      shieldDB: readyShieldDB(fighter.combatant.character),
      reeling: isReeling(hitPoints(fighter.combatant.character), fighter.combatant.hp),
    });
    if (score === null) {
      return [
        `${name} cannot ${policy} — ${policy === "block" ? "no usable Shield skill" : "no usable parry skill"} (p. 28).`,
      ];
    }
    fighter.policy = policy as DefensePolicy;
    return [`${name} will ${policy} (${policy} ${score}) until you change it.`];
  }
  fighter.policy = policy as DefensePolicy;
  return [
    policy === "best"
      ? `${name} will use the best available defense each time.`
      : `${name} will not defend.`,
  ];
}

/** The pp. 29-30 gates on taking any turn; returns the refusal lines, or null if they may act. */
function actionGates(state: SoloState, combatant: Combatant): string[] | null {
  const name = combatant.character.name;
  if (combatant.condition === "dead") return [`${name} is dead.`];
  if (combatant.condition === "unconscious") return [`${name} is unconscious and cannot act (p. 30).`];
  if (combatant.condition === "mortally-wounded")
    return [`${name} is mortally wounded and incapacitated (p. 30).`];
  if (combatant.condition === "stunned") return stunnedTurn(state, combatant);
  return null;
}

/**
 * Taking a turn (p. 25): the maneuver is set and stays in effect until the
 * combatant's next turn; the once-per-turn Block and Parry counts (p. 28)
 * reset.
 */
function takeTurn(combatant: Combatant, maneuver: Maneuver): void {
  combatant.maneuver = maneuver;
  combatant.blocksUsed = 0;
  combatant.parriesUsed = 0;
}

/** A stunned combatant's forced Do Nothing turn (p. 30), with the recovery roll. */
function stunnedTurn(state: SoloState, combatant: Combatant): string[] {
  takeTurn(combatant, { kind: "do-nothing" });
  // Shock (p. 30) lasts "on your next turn only", so this turn spends it.
  combatant.shock = 0;
  const roll = stunRecovery(combatant, state.dice);
  const name = combatant.character.name;
  const first = `${name} is stunned and must Do Nothing this turn (p. 30).`;
  return roll.success
    ? [first, `At the end of the turn, HT roll: rolled ${roll.total} — success by ${roll.margin}. ${name} shakes off the stun.`]
    : [first, `At the end of the turn, HT roll: rolled ${roll.total} — failure by ${roll.margin}. ${name} stays stunned.`];
}

/** All-Out Defense for one fighter (p. 25); shared by alloutdefense and npc. */
function takeAllOutDefense(state: SoloState, fighter: Fighter, args: string[], cmd: string): string[] {
  const combatant = fighter.combatant;
  const name = combatant.character.name;
  const gates = actionGates(state, combatant);
  if (gates) return gates;
  const sub = (args[0] ?? "").toLowerCase();
  if (sub === "double") {
    takeTurn(combatant, { kind: "all-out-defense", option: "double" });
    return [
      `${name} takes All-Out Defense (double): if a defense fails, a second, different one follows (p. 25). ` +
        `This lasts until their next turn.`,
    ];
  }
  if (sub === "increased") {
    const which = (args[1] ?? "").toLowerCase();
    if (!["dodge", "block", "parry"].includes(which)) {
      return [`Usage: ${cmd} increased <dodge|block|parry>  (All-Out Defense, p. 25)`];
    }
    const parrySkillId = combatantParrySkill(state, combatant);
    const score = defenseScore(state.registry, combatant.character, which as DefenseChoice, {
      parrySkillId,
      reeling: isReeling(hitPoints(combatant.character), combatant.hp),
    });
    if (score === null) {
      return [`${name} cannot ${which} — no usable defense there (p. 28).`];
    }
    takeTurn(combatant, { kind: "all-out-defense", option: "increased", defense: which as "dodge" | "block" | "parry" });
    return [`${name} takes All-Out Defense: +2 to ${which} (${which} ${score + 2}) until their next turn (p. 25).`];
  }
  return [`Usage: ${cmd} <increased dodge|block|parry | double>  (All-Out Defense, p. 25)`];
}

/** Do Nothing for one fighter (p. 25); shared by donothing and npc. */
function doNothingTurn(state: SoloState, fighter: Fighter): string[] {
  const gates = actionGates(state, fighter.combatant);
  if (gates) return gates;
  // Do Nothing (p. 25): no roll to stay conscious even at 0 HP or less,
  // per the p. 29 exception.
  takeTurn(fighter.combatant, { kind: "do-nothing" });
  return [`${fighter.combatant.character.name} does nothing this turn.`];
}

/**
 * The bonus a spent aim is worth (p. 27 table): Acc, +1 at 2 seconds, +2 at
 * 3+, +1 braced, plus a built-in scope's separate bonus of +1 per second of
 * aim, up to the scope's own bonus (pp. 19-20).
 */
function aimBonus(aim: { acc: number; scopeBonus: number; seconds: number; braced: boolean }): number {
  return (
    aim.acc +
    (aim.seconds >= 3 ? 2 : aim.seconds >= 2 ? 1 : 0) +
    Math.min(aim.seconds, aim.scopeBonus) +
    (aim.braced ? 1 : 0)
  );
}

/**
 * The Aim maneuver (pp. 25-26): aim [<target>] [acc <n>] [braced]. Without
 * "acc", the ready ranged weapon's Accuracy is used (p. 19). Aiming again at
 * the same target with the same weapon adds a second of aim (extra aim: +1 at
 * 2 seconds, +2 at 3+). The bonus applies to the next ranged Attack or
 * All-Out Attack against that target, with that weapon.
 */
function aimTurn(state: SoloState, fighter: Fighter, args: string[]): string[] {
  const combat = state.combat!;
  const name = fighter.combatant.character.name;
  const gates = actionGates(state, fighter.combatant);
  if (gates) return gates;
  const all = allFighters(combat);
  const m = matchFighter(all, args, fighter);
  if (typeof m === "string") return [m];
  let target: Fighter;
  let rest: string[];
  if (m) {
    target = m.fighter;
    rest = m.rest;
  } else if (fighter === combat.you && combat.npcs.length === 1) {
    target = combat.npcs[0];
    rest = args;
  } else if (fighter !== combat.you) {
    target = combat.you;
    rest = args;
  } else {
    return [`Aim at whom? Name the target — fighters: ${combat.npcs.map((f) => f.combatant.character.name).join(", ")}.`];
  }
  const character = fighter.combatant.character;
  const readyRanged = character.readyRanged ? findRangedWeapon(character.readyRanged) : null;
  let acc: number | null = null;
  let braced = false;
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i].toLowerCase();
    if (t === "acc") {
      acc = Number(rest[i + 1]);
      if (!Number.isInteger(acc) || acc < 1)
        return [`Bad Acc "${rest[i + 1] ?? ""}". Accuracy is a whole number, 1 or more.`];
      i += 1;
    } else if (t === "braced") {
      braced = true;
    } else {
      return ["Usage: aim [<target>] [acc <n>] [braced]  (Aim, pp. 25-26; without acc, the ready weapon's Acc)"];
    }
  }
  if (acc === null) {
    if (!readyRanged) {
      return [
        `No Acc given and ${name} has no ranged weapon readied. ` +
          `Ready one (ready <weapon>) or give the Acc: aim [<target>] acc <n> [braced].`,
      ];
    }
    acc = readyRanged.acc;
  }
  const scopeBonus = readyRanged?.scopeBonus ?? 0;
  const weapon = character.readyRanged ?? null;
  const prev = fighter.aim;
  const continuing = prev !== undefined && prev.target === target.combatant && prev.acc === acc && prev.weapon === weapon;
  const seconds = continuing ? prev.seconds + 1 : 1;
  fighter.aim = { target: target.combatant, acc, scopeBonus, weapon, seconds, braced: braced || (continuing && prev.braced) };
  takeTurn(fighter.combatant, { kind: "aim" });
  const extraText = seconds === 1 ? "" : `, ${seconds} seconds of aim`;
  const bracedText = fighter.aim.braced ? ", braced" : "";
  const scopeText = scopeBonus > 0 ? `, scope +${Math.min(seconds, scopeBonus)}` : "";
  const weaponText = weapon ? ` with the ${weapon}` : "";
  return [
    `${name} aims${weaponText} at ${target.combatant.character.name} (Acc ${acc}${scopeText}${extraText}${bracedText}): ` +
      `+${aimBonus(fighter.aim)} on their next ranged attack against them (pp. 25-27).`,
  ];
}

/** How an attack command's maneuver shapes the exchange (p. 25). */
interface ExchangeOptions {
  maneuver?: Maneuver;
  /** Flat attack modifier from the maneuver: +4 Determined, -4 Move and Attack. */
  bonus?: { label: string; value: number };
  /** All-Out Attack (Strong): +2 damage, or +1 per die if better (p. 25). */
  strong?: boolean;
  /** All-Out Attack (Double): two attacks against the same foe (p. 25). */
  double?: boolean;
  /** Move and Attack: melee adjusted skill cannot exceed 9 (p. 25). */
  capMelee9?: boolean;
  /** Ranged attack (shoot, p. 27): parse rng/half/max and ranged maneuver tokens. */
  ranged?: boolean;
}

/**
 * One attack exchange, either direction (issue #21): `attack` is you against
 * the foe, `foeattack` is the foe against you. The defender's policy (set by
 * defend/foedefend) picks the defense; a `vs` token on the command overrides
 * it once. Syntax: <skill> [dmg 2d+1 cut] [vs dodge|block|parry|none] [mods].
 */
function runExchange(
  state: SoloState,
  attacker: Combatant,
  defender: Combatant,
  args: string[],
  defensePolicy: DefensePolicy,
  opts: ExchangeOptions,
): string[] {
  // Who can act at all (pp. 29-30): the injury gates come before anything else.
  const attackerName = attacker.character.name;
  if (attacker.condition === "dead") return [`${attackerName} is dead.`];
  if (attacker.condition === "unconscious") return [`${attackerName} is unconscious and cannot act (p. 30).`];
  if (attacker.condition === "mortally-wounded")
    return [`${attackerName} is mortally wounded and incapacitated (p. 30).`];
  if (attacker.condition === "stunned") return stunnedTurn(state, attacker);
  if (defender.condition === "dead") return [`${defender.character.name} is already dead.`];

  // 0 HP or less (p. 29): choosing any maneuver but Do Nothing takes a HT
  // roll to stay conscious.
  const prefix: string[] = [];
  if (attacker.hp <= 0) {
    const check = consciousnessCheck(attacker, state.dice);
    const modText = check.modifier === 0 ? "" : ` (${check.modifier} for HP below zero)`;
    if (!check.stayedConscious) {
      return [
        `${attackerName}, at 0 HP or less, rolls vs HT${modText} to stay conscious: ` +
          `rolled ${check.roll.total} — failure by ${check.roll.margin}. ${attackerName} falls unconscious (p. 29).`,
      ];
    }
    prefix.push(
      `${attackerName}, at 0 HP or less, rolls vs HT${modText} to stay conscious: ` +
        `rolled ${check.roll.total} — success by ${check.roll.margin}.`,
    );
  }

  const skillWords: string[] = [];
  const modTokens: string[] = [];
  let damage: { poolText: string; type: string } | null = null;
  let defenseOverride: string | null = null;
  let modeWord: string | null = null;
  let range: Partial<Record<"rng" | "half" | "max", number>> = {};
  let rangedManeuver: "allout" | "moveattack" | null = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t.toLowerCase() === "dmg") {
      damage = { poolText: args[i + 1] ?? "", type: (args[i + 2] ?? "").toLowerCase() };
      i += 2;
    } else if (t.toLowerCase() === "vs") {
      defenseOverride = (args[i + 1] ?? "").toLowerCase();
      i += 1;
    } else if (t.toLowerCase() === "mode") {
      modeWord = (args[i + 1] ?? "").toLowerCase();
      if (!modeWord) return ["Usage: ... mode <swing|thrust|two hands>  (a weapon's printed table lines, pp. 20-21)"];
      i += 1;
    } else if (["rng", "half", "max"].includes(t.toLowerCase())) {
      const value = Number(args[i + 1]);
      if (!Number.isFinite(value) || value < 0) return [`Bad ${t} value "${args[i + 1] ?? ""}". Give yards as a number, 0 or more.`];
      range[t.toLowerCase() as "rng" | "half" | "max"] = value;
      i += 1;
    } else if (["allout", "moveattack"].includes(t.toLowerCase())) {
      if (!opts.ranged) return [`"${t}" as a flag is only for shoot; melee uses the ${t} command with its own options (p. 25).`];
      rangedManeuver = t.toLowerCase() as "allout" | "moveattack";
    } else if (/^[+-]\d+$/.test(t)) {
      modTokens.push(t);
    } else {
      skillWords.push(t);
    }
  }
  if (!opts.ranged && (range.rng !== undefined || range.half !== undefined || range.max !== undefined)) {
    return [`rng/half/max are for ranged attacks: use shoot <skill> [dmg <pool> <type>] rng <yards> [half <1/2D> max <Max>] (p. 27).`];
  }
  const found = findSkillRef(state, skillWords.join(" "));
  if (typeof found === "string") return [found];
  const mods = parseModifiers(modTokens);
  if (typeof mods === "string") return [mods];

  let base: number | null;
  try {
    base = baseSkillLevel(attacker.character, found);
  } catch (error) {
    return [(error as Error).message];
  }
  if (base === null) return [`${displayName(found)} has no default (p. 13). ${attacker.character.name} cannot attempt it untrained.`];

  // Damage: explicit "dmg 2d+1 cut" wins; otherwise the ready weapon whose
  // table row matches the skill supplies damage (and, for ranged weapons,
  // 1/2D and Max) from the printed tables (pp. 19-22). Unarmed brawling or
  // karate is a punch (thr-1 cr, p. 26).
  let pool;
  let type: DamageType;
  let weaponLabel: string | null = null;
  let weaponHalfMax: { half: number; max: number } | null = null;
  const meleeWeapon = opts.ranged ? null : readyMeleeFor(attacker.character, found.id);
  const rangedWeapon = opts.ranged ? readyRangedFor(attacker.character, found.id) : null;
  if (damage) {
    try {
      pool = parseDicePool(damage.poolText);
    } catch (error) {
      return [(error as Error).message];
    }
    if (!["cr", "cut", "imp", "pi-", "pi", "pi+"].includes(damage.type)) {
      return [`Bad damage type "${damage.type}". Use cr, cut, imp, pi-, pi or pi+ (p. 29).`];
    }
    type = damage.type as DamageType;
  } else if (meleeWeapon) {
    const mode = pickMode(meleeWeapon, modeWord);
    if (typeof mode === "string") return [mode];
    const minST = meleeWeapon.minST;
    const rawST = attacker.character.attributes.ST;
    if (minST !== null && rawST < minST) {
      // -1 to weapon skill per point of ST lacked (p. 20).
      mods.push({ label: `ST below ${meleeWeapon.name}'s minimum ${minST}`, value: -(minST - rawST) });
    }
    // Effective ST for damage cannot exceed triple the weapon's minimum ST (p. 20).
    const effST = minST !== null ? Math.min(rawST, 3 * minST) : rawST;
    let sd;
    try {
      sd = strengthDamage(effST, mode.base === "sw" ? "swing" : "thrust");
    } catch (error) {
      return [(error as Error).message];
    }
    pool = { dice: sd.dice, adds: sd.adds + mode.adds };
    type = mode.type;
    weaponLabel = meleeWeapon.name + (mode.label ? ` (${mode.label})` : "");
  } else if (rangedWeapon) {
    const w = rangedWeapon;
    const rawST = attacker.character.attributes.ST;
    if (rawST < w.minST) {
      mods.push({ label: `ST below ${w.name}'s minimum ${w.minST}`, value: -(w.minST - rawST) }); // p. 20
    }
    if (w.damage.base === null) {
      // Firearms: fixed dice plus adds (p. 19).
      pool = { dice: w.damage.dice!, adds: w.damage.adds };
    } else {
      let sd;
      try {
        sd = strengthDamage(weaponST(attacker.character, w), w.damage.base === "sw" ? "swing" : "thrust");
      } catch (error) {
        return [(error as Error).message];
      }
      pool = { dice: sd.dice, adds: sd.adds + w.damage.adds };
    }
    type = w.damage.type;
    weaponLabel = w.name;
    const stForRange = weaponST(attacker.character, w);
    weaponHalfMax =
      "half" in w.range
        ? { half: w.range.half, max: w.range.max }
        : { half: w.range.halfPerST * stForRange, max: w.range.maxPerST * stForRange };
  } else if (!opts.ranged && (found.id === "brawling" || found.id === "karate")) {
    const thrust = strengthDamage(attacker.character.attributes.ST, "thrust");
    pool = { dice: thrust.dice, adds: thrust.adds - 1 }; // punch: thr-1 cr (p. 26)
    type = "cr";
  } else {
    return [
      `Give the weapon's damage (... dmg 2d+1 cut), or ready a weapon that uses ${displayName(found)} (buy/ready). ` +
        `A punch needs no weapon: use brawling or karate (thr-1 cr, p. 26).`,
    ];
  }

  // The defender's choice: one-off "vs" override, else their standing policy.
  // A downed defender (unconscious, mortally wounded) gets no defense (p. 30).
  const defenderDown = defender.condition === "unconscious" || defender.condition === "mortally-wounded";
  const parrySkillId = combatantParrySkill(state, defender);
  const shieldDB = readyShieldDB(defender.character); // p. 19: DB aids all active defenses
  const reeling = isReeling(hitPoints(defender.character), defender.hp);
  let choice: DefenseChoice;
  if (defenderDown) {
    choice = "none";
  } else if (defenseOverride !== null) {
    if (!["dodge", "block", "parry", "none"].includes(defenseOverride)) {
      return [`Bad defense "${defenseOverride}". Use dodge, block, parry or none (p. 28).`];
    }
    choice = defenseOverride as DefenseChoice;
  } else if (defensePolicy === "best") {
    const best = bestDefense(state.registry, defender.character, { parrySkillId, shieldDB, reeling });
    if (!best) return [`${defender.character.name} has no active defense available.`];
    choice = best.choice;
  } else {
    choice = defensePolicy;
  }
  if (
    choice !== "none" &&
    defenseScore(state.registry, defender.character, choice, { parrySkillId, shieldDB, reeling }) === null
  ) {
    const df = state.combat && allFighters(state.combat).find((f) => f.combatant === defender);
    const hint =
      df && state.combat && df === state.combat.you
        ? "defend"
        : df
          ? `npc ${df.combatant.character.name.toLowerCase()} defend`
          : "defend";
    return [
      `${defender.character.name} cannot ${choice} — ${choice === "block" ? "no usable Shield skill" : "no usable parry skill"} (p. 28). ` +
        `Set another defense with ${hint}.`,
    ];
  }

  // Ranged (p. 27): Max range refusal, the Size and Speed/Range table
  // modifier (p. 28), and 1/2D halving. The distance (rng) is always a scene
  // fact; 1/2D and Max come from the ready weapon's table row unless typed.
  let stats: RangeStats | null = null;
  if (opts.ranged) {
    if (range.rng === undefined) {
      return [
        `How far is the target? shoot <skill> rng <yards>` +
          (weaponHalfMax ? "" : ` half <1/2D> max <Max>`) +
          ` — or ready a ranged weapon to use its table stats (p. 27).`,
      ];
    }
    const half = range.half ?? weaponHalfMax?.half;
    const max = range.max ?? weaponHalfMax?.max;
    if (half === undefined || max === undefined) {
      return [`Give the weapon's 1/2D and Max (... half <1/2D> max <Max>), or ready a ranged weapon (p. 27).`];
    }
    stats = { range: range.rng, half, max };
    if (outOfRange(stats)) {
      return [`${defender.character.name} is beyond Max range: ${stats.range} yd > ${stats.max} yd (p. 27).`];
    }
  }

  // Maneuver effects on the attack (p. 25): flat bonuses, the Strong damage
  // boost, and the Move and Attack cap of 9 on adjusted melee skill.
  const maneuverMods: Modifier[] = [...mods];
  if (opts.bonus) maneuverMods.push(opts.bonus);
  let maneuver = opts.maneuver ?? { kind: "attack" } as Maneuver;
  let capMelee9 = opts.capMelee9 ?? false;
  if (opts.ranged && rangedManeuver === "allout") {
    // Ranged All-Out Attack is a single attack at +1 (p. 27) — no options.
    maneuver = { kind: "all-out-attack", option: "determined", ranged: true };
    maneuverMods.push({ label: "all-out attack (ranged)", value: 1 });
  } else if (opts.ranged && rangedManeuver === "moveattack") {
    // Ranged Move and Attack: -4, and the skill cap does not apply (p. 25).
    maneuver = { kind: "move-and-attack" };
    maneuverMods.push({ label: "move and attack", value: -4 });
    capMelee9 = false;
  }
  if (stats) {
    maneuverMods.push({ label: `range ${stats.range} yd`, value: rangeModifier(stats.range) });
  }
  // Aim (pp. 25-27): a ranged Attack or All-Out Attack against the aimed
  // target gets Acc plus extra-aim and braced bonuses. Any attack spends the
  // aim; Move and Attack is not one of the maneuvers that benefits (p. 25).
  let aimToSpend: Fighter | null = null;
  if (state.combat) {
    const af = allFighters(state.combat).find((f) => f.combatant === attacker);
    if (af?.aim) {
      aimToSpend = af;
      // The bonus applies only against the aimed target, with the weapon
      // aimed with (pp. 25-26).
      if (
        opts.ranged &&
        rangedManeuver !== "moveattack" &&
        af.aim.target === defender &&
        af.aim.weapon === (attacker.character.readyRanged ?? null)
      ) {
        const a = af.aim;
        const parts = [`Acc ${a.acc}`];
        if (a.seconds >= 2) parts.push(`extra aim +${a.seconds >= 3 ? 2 : 1}`);
        if (a.scopeBonus > 0) parts.push(`scope +${Math.min(a.seconds, a.scopeBonus)}`);
        if (a.braced) parts.push("braced +1");
        maneuverMods.push({ label: `aim (${parts.join(", ")})`, value: aimBonus(a) });
      }
    }
  }
  const modSum = maneuverMods.reduce((s, m) => s + m.value, 0);
  if (capMelee9) {
    // "Your adjusted skill cannot exceed 9." Shock (engine-side) also counts,
    // so cap the base such that base + mods - shock <= 9.
    base = Math.min(base, 9 - modSum + attacker.shock);
  }
  const effectivePreview = base + modSum - attacker.shock;
  if (effectivePreview < 3) {
    return [`Effective skill ${effectivePreview} is below 3. You may not attempt this roll (p. 2).`];
  }
  if (opts.strong) {
    // +2 damage, or +1 per die if that would be better (melee, ST-based, p. 25).
    pool = { ...pool, adds: pool.adds + Math.max(2, pool.dice) };
  }

  // The turn is taken now that the exchange is real: maneuver set, the
  // once-per-turn Block and Parry counts reset (pp. 25, 28). Attacking
  // spends any aim in progress (pp. 25-26).
  takeTurn(attacker, maneuver);
  if (aimToSpend) aimToSpend.aim = undefined;

  const runOnce = () =>
    attackExchange(
      {
        attacker,
        attackSkill: base,
        attackModifiers: maneuverMods,
        damage: pool,
        damageType: type,
        defender,
        defense: choice,
        defenseContext: { parrySkillId, shieldDB },
        dr: wornDR(defender.character),
        halfDamage: stats !== null && atHalfDamage(stats),
      },
      state.registry,
      state.dice,
    );
  const names = {
    attacker: attacker.character.name,
    defender: defender.character.name,
    attackLabel:
      `${weaponLabel ?? displayName(found)} (${formatDicePool(pool)} ${type}` +
      (stats ? `, rng ${stats.range} yd` : "") +
      ")",
    defense: choice,
  };
  const lines = [...prefix, ...narrate(runOnce(), names)];
  if (opts.double) {
    lines.push("Second attack (All-Out Attack: double, p. 25):");
    lines.push(...narrate(runOnce(), names));
  }
  return lines;
}

/** Run one command line. Returns the lines to print. */
export function runCommand(state: SoloState, line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const [verb, ...args] = trimmed.split(/\s+/);
  const cmd = verbAlias(verb.toLowerCase());

  switch (cmd) {
    case "new": {
      const name = args.join(" ").trim();
      if (!name) return ["Usage: new <name>"];
      state.character = makeCharacter(name.toLowerCase(), name);
      state.character.wealthLevel = "average";
      state.character.money = startingWealth(state.tl);
      state.combat = null;
      const a = state.character.attributes;
      return [
        `${name} created. ST ${a.ST} DX ${a.DX} IQ ${a.IQ} HT ${a.HT}. 0 points spent.`,
        `Average wealth: ${formatMoney(state.character.money)} at TL${state.tl} (change with tl/wealth; buy gear with buy).`,
      ];
    }

    case "load": {
      const file = args.join(" ").trim();
      if (!file) return ["Usage: load <path to .gcs file>"];
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        return [`Cannot load "${file}" — unreadable or not JSON. GCS 5 sheets are JSON; re-save GCS 4 XML files in GCS 5 first.`];
      }
      try {
        const result = importGcsSheet(parsed, state.registry);
        state.character = result.character;
        state.character.wealthLevel ??= "average";
        state.character.money ??= startingWealth(state.tl);
        state.combat = null;
        const c = result.character;
        const lines = [
          `${c.name} loaded from file. ST ${c.attributes.ST} DX ${c.attributes.DX} IQ ${c.attributes.IQ} HT ${c.attributes.HT}. ` +
            `${c.skills.length} skills, ${pointTotal(c)} points.`,
        ];
        lines.push(...result.notes.map((note) => `Note: ${note}`));
        return lines;
      } catch (error) {
        return [(error as Error).message];
      }
    }

    case "set": {
      if (!state.character) return ["No character yet. Use: new <name>"];
      const [attrRaw, valueRaw] = args;
      const attr = attrRaw?.toUpperCase() as AttributeId;
      if (!ATTRIBUTE_IDS.includes(attr)) return [`Unknown attribute "${attrRaw}". Use ST, DX, IQ or HT.`];
      const value = Number(valueRaw);
      if (!Number.isInteger(value) || value < 1) return [`Bad level "${valueRaw}". Attributes are whole numbers, 1 or more (p. 4).`];
      state.character.attributes[attr] = value;
      const cost = (value - 10) * state.registry.attribute(attr)!.costPerLevel;
      return [`${attr} ${value} (cost ${cost} points).`];
    }

    case "learn": {
      if (!state.character) return ["No character yet. Use: new <name>"];
      const pointsRaw = args[args.length - 1];
      const skillWord = args.slice(0, -1).join(" ");
      const points = Number(pointsRaw);
      if (!skillWord || !Number.isInteger(points)) return ["Usage: learn <skill> <points>"];
      const found = findSkillRef(state, skillWord);
      if (typeof found === "string") return [found];
      let relative: number;
      try {
        relative = pointsToRelativeLevel(points, found.difficulty);
      } catch (e) {
        return [(e as Error).message];
      }
      const existing = state.character.skills.find((r) => r.skillId === found.id);
      if (existing) existing.points = points;
      else state.character.skills.push({ skillId: found.id, points, specialization: null });
      const attrLevel = state.character.attributes[found.attribute];
      const relText = relative >= 0 ? `+ ${relative}` : `- ${-relative}`;
      return [
        `${displayName(found)} (${found.attribute}, ${DIFFICULTY_NAME[found.difficulty]}) at ${points} points: ` +
          `${found.attribute} ${attrLevel} ${relText} = ${attrLevel + relative}.`,
      ];
    }

    case "formula": {
      const word = args.join(" ").trim();
      if (!word) return ["Usage: formula <skill>"];
      const attr = word.toUpperCase() as AttributeId;
      if (ATTRIBUTE_IDS.includes(attr)) {
        return [`${attr} is a basic attribute: its level is just its score (p. 4). Skills based on it add a relative level.`];
      }
      const found = findSkillRef(state, word);
      if (typeof found === "string") return [found];

      const diffName = DIFFICULTY_NAME[found.difficulty];
      const lines = [`${displayName(found)} (${found.attribute}, ${diffName}), Lite p. ${found.page}.`];
      if (found.defaults.length === 0) {
        lines.push("Default: none — you cannot attempt this skill untrained (p. 13).");
      } else {
        lines.push(`Default: ${found.defaults.map((d) => `${d.from}${d.penalty}`).join(", ")} (p. 13).`);
      }
      // Printed cost ladder (p. 13): 1, 2, 4, 8 points, then +4 per extra level.
      const rungs = [1, 2, 4, 8].map(
        (pts) => `${pts} = ${found.attribute}${relSigned(pointsToRelativeLevel(pts, found.difficulty))}`,
      );
      lines.push(`Costs (points = level): ${rungs.join(", ")}, then +4 points per extra level.`);

      if (state.character) {
        const c = state.character;
        const record = c.skills.find((r) => r.skillId === found.id);
        const attrLevel = c.attributes[found.attribute];
        if (record && record.points > 0) {
          try {
            const rel = pointsToRelativeLevel(record.points, found.difficulty);
            lines.push(
              `${c.name} (${found.attribute} ${attrLevel}): trained at ${record.points} points, ` +
                `${found.attribute}${relSigned(rel)} = level ${attrLevel + rel}.`,
            );
          } catch (error) {
            lines.push(`${c.name}: ${(error as Error).message}`);
          }
        } else if (found.defaults.length > 0) {
          const level = baseSkillLevel(c, found);
          lines.push(
            `${c.name} (${found.attribute} ${attrLevel}): untrained, default ${found.defaults[0].from}${found.defaults[0].penalty} = level ${level}.`,
          );
        }
      }
      return lines;
    }

    case "tl": {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 12) return ["Usage: tl <0-12>  (tech level, p. 7; starting wealth table, p. 18)"];
      state.tl = n;
      const lines = [`Tech level ${state.tl}. Average starting wealth: ${formatMoney(startingWealth(n))} (p. 18).`];
      const c = state.character;
      if (c && (c.equipment ?? []).length === 0) {
        c.money = startingWealth(n, c.wealthLevel ?? "average");
        lines.push(`${c.name}'s money set to ${formatMoney(c.money)} (${c.wealthLevel ?? "average"}).`);
      } else if (c) {
        lines.push(`${c.name} keeps their ${formatMoney(c.money ?? 0)}; the TL gate applies to new purchases (p. 19).`);
      }
      return lines;
    }

    case "wealth": {
      const c = state.character;
      if (!c) return ["No character yet. Use: new <name>"];
      const level = args.join(" ").toLowerCase();
      if (!level) return [`Usage: wealth <level>. Levels: ${Object.keys(WEALTH_LEVELS).join(", ")} (p. 8).`];
      const wl = WEALTH_LEVELS[level];
      if (!wl) return [`Unknown wealth level "${level}". Levels: ${Object.keys(WEALTH_LEVELS).join(", ")} (p. 8).`];
      c.wealthLevel = level;
      c.money = startingWealth(state.tl, level);
      return [
        `${c.name} is now ${level} (${wl.points} points): ${formatMoney(c.money)} at TL${state.tl} (pp. 8, 18).` +
          ((c.equipment ?? []).length > 0 ? " Money reset; owned gear kept." : ""),
      ];
    }

    case "buy": {
      const c = state.character;
      if (!c) return ["No character yet. Use: new <name>"];
      const tokens = [...args];
      let st: number | null = null;
      const stIdx = tokens.findIndex((t) => t.toLowerCase() === "st");
      if (stIdx !== -1) {
        st = Number(tokens[stIdx + 1]);
        if (!Number.isInteger(st) || st < 1)
          return [`Bad ST "${tokens[stIdx + 1] ?? ""}". A bow or crossbow's own ST is a whole number, 1 or more (p. 20).`];
        tokens.splice(stIdx, 2);
      }
      const itemName = tokens.join(" ").trim();
      if (!itemName) return ["Usage: buy <item> [st <n>]  (pp. 18-22; browse with: armory)"];
      const armor = findArmor(itemName);
      const shield = findShield(itemName);
      const melee = findMeleeWeapon(itemName);
      const ranged = findRangedWeapon(itemName) ?? (melee?.throwable ? findRangedWeapon(`${melee.name} (thrown)`) : null);
      const found = armor ?? shield ?? melee ?? ranged;
      if (!found) return [`"${itemName}" is not in the Lite equipment tables (pp. 18-22). Browse: armory ${itemName}`];
      const itemTL = armor || shield ? 0 : (found as MeleeWeapon | RangedWeapon).tl; // the armor/shield tables print no TL
      if (itemTL > state.tl) {
        return [
          `${found.name} is TL${itemTL}; the campaign is TL${state.tl}. ` +
            `You may only buy weapons of your TL or less, unless you have the High TL trait (p. 19).`,
        ];
      }
      const money = c.money ?? 0;
      if (found.cost > money) {
        return [
          `${found.name} costs ${formatMoney(found.cost)}; ${c.name} has ${formatMoney(money)} left. ` +
            `(Wealth: ${c.wealthLevel ?? "average"} at TL${state.tl} — change with wealth, p. 8.)`,
        ];
      }
      c.money = money - found.cost;
      c.equipment = c.equipment ?? [];
      const item: { name: string; st?: number } = { name: melee?.name ?? found.name };
      if (ranged?.usesOwnST) item.st = st ?? ranged.minST; // bows/crossbows carry their own ST (p. 20)
      c.equipment.push(item);
      const lines = [
        `Bought ${item.name} for ${formatMoney(found.cost)}${item.st !== undefined ? ` (weapon ST ${item.st})` : ""}. ${formatMoney(c.money)} left.`,
      ];
      if (armor && !c.wornArmor) {
        c.wornArmor = armor.name;
        lines.push(`${armor.name} worn (DR ${armor.dr}).`);
      }
      if (shield && !c.readyShield) {
        c.readyShield = shield.name;
        lines.push(`${shield.name} readied (DB ${shield.db} to all active defenses, p. 19).`);
      }
      if (melee && !c.readyMelee) {
        c.readyMelee = melee.name;
        lines.push(`${melee.name} readied.`);
      }
      if (ranged && !c.readyRanged) {
        c.readyRanged = ranged.name;
        lines.push(`${ranged.name} readied (Acc ${ranged.acc}${ranged.scopeBonus ? `+${ranged.scopeBonus} scope` : ""}).`);
      }
      return lines;
    }

    case "wear": {
      const c = state.character;
      if (!c) return ["No character yet. Use: new <name>"];
      const itemName = args.join(" ").trim();
      if (itemName.toLowerCase() === "none") {
        c.wornArmor = undefined;
        return [`${c.name} takes off their armor.`];
      }
      const armor = itemName ? findArmor(itemName) : null;
      if (!armor) return [`Usage: wear <armor|none>. Armor: ${ARMOR_TABLE.map((a) => a.name).join(", ")} (p. 18).`];
      if (!(c.equipment ?? []).some((e) => e.name === armor.name)) {
        return [`${c.name} does not own ${armor.name}. Buy it first: buy ${armor.name.toLowerCase()}`];
      }
      c.wornArmor = armor.name;
      return [`${c.name} wears ${armor.name} (DR ${armor.dr}).`];
    }

    case "ready": {
      const c = state.character;
      if (!c) return ["No character yet. Use: new <name>"];
      const itemName = args.join(" ").trim();
      if (itemName.toLowerCase() === "none") {
        c.readyMelee = undefined;
        c.readyRanged = undefined;
        return [`${c.name} readies no weapon — a punch is thr-1 cr (p. 26). Shield stays readied.`];
      }
      if (!itemName) return ["Usage: ready <weapon or shield|none>"];
      const owned = (c.equipment ?? []).find((e) => e.name.toLowerCase() === itemName.toLowerCase());
      if (!owned) {
        const known = findMeleeWeapon(itemName) ?? findRangedWeapon(itemName) ?? findShield(itemName);
        return known
          ? [`${c.name} does not own a ${known.name}. Buy it first: buy ${itemName}`]
          : [`"${itemName}" is not in the Lite equipment tables (pp. 18-22). Browse: armory ${itemName}`];
      }
      const melee = findMeleeWeapon(owned.name);
      const ranged = findRangedWeapon(owned.name) ?? findRangedWeapon(`${owned.name} (thrown)`);
      const shield = findShield(owned.name);
      if (!melee && !ranged && !shield) return [`${owned.name} is not a weapon or shield.`];
      const lines: string[] = [];
      if (melee) c.readyMelee = melee.name;
      if (ranged) c.readyRanged = ranged.name;
      if (shield) {
        c.readyShield = shield.name;
        lines.push(`${c.name} readies ${shield.name} (DB ${shield.db} to all active defenses, p. 19).`);
      } else if (melee && ranged) {
        lines.push(`${c.name} readies ${melee.name} — melee, and thrown (Acc ${ranged.acc}).`);
      } else if (melee) {
        lines.push(`${c.name} readies ${melee.name}.`);
      } else if (ranged) {
        lines.push(`${c.name} readies ${ranged.name} (Acc ${ranged.acc}${ranged.scopeBonus ? `+${ranged.scopeBonus} scope` : ""}).`);
      }
      return lines;
    }

    case "armory": {
      const word = args.join(" ").toLowerCase();
      const match = (n: string) => !word || n.toLowerCase().includes(word);
      const dmgMode = (m: WeaponDamage) =>
        `${m.base}${m.adds > 0 ? `+${m.adds}` : m.adds < 0 ? `${m.adds}` : ""} ${m.type}`;
      const lines: string[] = [`Campaign TL${state.tl} — items above your TL cannot be bought (p. 19).`];
      const armors = ARMOR_TABLE.filter((a) => match(a.name));
      if (armors.length) lines.push("Armor (p. 18):", ...armors.map((a) => `  ${a.name} — DR ${a.dr}, ${formatMoney(a.cost)}, ${a.weight} lb`));
      const shields = SHIELD_TABLE.filter((s) => match(s.name));
      if (shields.length) lines.push("Shields (p. 19):", ...shields.map((s) => `  ${s.name} — DB ${s.db}, ${formatMoney(s.cost)}, ${s.weight} lb`));
      const melees = MELEE_WEAPON_TABLE.filter((w) => match(w.name));
      if (melees.length)
        lines.push(
          "Melee weapons (pp. 20-21):",
          ...melees.map(
            (w) =>
              `  ${w.name} (TL${w.tl}, ${w.skillId}) ${w.modes.map(dmgMode).join(" or ")} — ` +
              `${formatMoney(w.cost)}, ${w.weight} lb, min ST ${w.minST ?? "–"}${w.grip}`,
          ),
        );
      const rangeds = RANGED_WEAPON_TABLE.filter((w) => match(w.name));
      if (rangeds.length)
        lines.push(
          "Ranged weapons (pp. 21-22):",
          ...rangeds.map((w) => {
            const dmg =
              w.damage.base === null
                ? `${w.damage.dice}d${w.damage.adds > 0 ? `+${w.damage.adds}` : w.damage.adds < 0 ? `${w.damage.adds}` : ""} ${w.damage.type}`
                : dmgMode(w.damage);
            const rng = "half" in w.range ? `${w.range.half}/${w.range.max}` : `x${w.range.halfPerST}/x${w.range.maxPerST}`;
            return (
              `  ${w.name} (TL${w.tl}, ${w.skillId}) ${dmg}, Acc ${w.acc}${w.scopeBonus ? `+${w.scopeBonus}` : ""}, ` +
              `range ${rng} — ${formatMoney(w.cost)}, ${w.weight} lb, min ST ${w.minST}${w.grip}`
            );
          }),
        );
      if (lines.length === 1) return [`Nothing matching "${word}" in the Lite equipment tables (pp. 18-22).`];
      return lines;
    }

    case "sheet": {
      if (!state.character) return ["No character yet. Use: new <name>"];
      const c = state.character;
      const lines = [
        `${c.name}: ST ${c.attributes.ST}, DX ${c.attributes.DX}, IQ ${c.attributes.IQ}, HT ${c.attributes.HT} ` +
          `(Will ${c.attributes.IQ}, Per ${c.attributes.IQ}).`,
      ];
      if (c.skills.length === 0) {
        lines.push("No skills learned.");
      } else {
        for (const record of c.skills) {
          const def = state.registry.skill(record.skillId);
          if (!def) continue;
          let levelText: string;
          try {
            levelText = `level ${baseSkillLevel(c, def)}`;
          } catch (error) {
            levelText = (error as Error).message;
          }
          lines.push(`  ${displayName(def)} (${def.attribute}/${def.difficulty}) ${record.points} points: ${levelText}`);
        }
      }
      const level = c.wealthLevel ?? "average";
      lines.push(`Wealth: ${level} (${WEALTH_LEVELS[level].points} points), ${formatMoney(c.money ?? 0)} on hand at TL${state.tl} (pp. 8, 18).`);
      const gear = c.equipment ?? [];
      if (gear.length > 0) {
        lines.push(`Equipment: ${gear.map((e) => e.name + (e.st !== undefined ? ` (ST ${e.st})` : "")).join(", ")}.`);
        if (c.wornArmor) {
          const a = findArmor(c.wornArmor);
          lines.push(`  Worn: ${c.wornArmor}${a ? ` (DR ${a.dr})` : ""}.`);
        }
        const ready: string[] = [];
        if (c.readyMelee) ready.push(c.readyMelee);
        if (c.readyRanged && c.readyRanged !== `${c.readyMelee} (thrown)`) ready.push(c.readyRanged);
        if (c.readyShield) {
          const s = findShield(c.readyShield);
          ready.push(`${c.readyShield}${s ? ` (DB ${s.db})` : ""}`);
        }
        if (ready.length > 0) lines.push(`  Readied: ${ready.join(", ")}.`);
      }
      lines.push(`Point total: ${pointTotal(c)}.`);
      return lines;
    }

    case "test":
    case "odds": {
      if (!state.character) return ["No character yet. Use: new <name>"];
      const tokens: string[] = [];
      const modTokens: string[] = [];
      // Anything starting with + or - is meant as a modifier; parseModifiers
      // validates the shape so a malformed one gets a clear message.
      for (const a of args) (/^[+-]/.test(a) ? modTokens : tokens).push(a);
      const target = tokens.join(" ");
      if (!target) return [`Usage: ${cmd} <skill or attribute> [+n or -n ...]`];
      const mods = parseModifiers(modTokens);
      if (typeof mods === "string") return [mods];

      // Attribute test (ST/DX/IQ/HT) or skill test.
      const attr = target.toUpperCase() as AttributeId;
      let base: number | null;
      let label: string;
      if (ATTRIBUTE_IDS.includes(attr)) {
        base = state.character.attributes[attr];
        label = attr;
      } else {
        const found = findSkillRef(state, target);
        if (typeof found === "string") return [found];
        try {
          base = baseSkillLevel(state.character, found);
        } catch (error) {
          return [(error as Error).message];
        }
        label = displayName(found);
      }

      if (base === null) {
        return [`${label} has no default (p. 13). You cannot attempt it untrained.`];
      }
      const modSum = mods.reduce((s, m) => s + m.value, 0);
      const effective = base + modSum;

      if (cmd === "odds") {
        if (effective < 3) {
          return [`Effective skill ${effective} is below 3. You may not attempt this roll (p. 2).`];
        }
        const o = rollOdds(effective);
        const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
        return [
          `Effective skill ${effective}: ${pct(o.successChance)} success, ` +
            `${pct(o.criticalSuccessChance)} critical success, ${pct(o.criticalFailureChance)} critical failure.`,
        ];
      }

      const result = resolve({ baseSkill: base, modifiers: mods }, state.dice);
      if (result.status === "not-allowed") {
        return [`Effective skill ${effective} is below 3. You may not attempt this roll (p. 2).`];
      }
      const lines = [
        `${label} ${base}${formatMods(mods)}, effective skill ${effective}.`,
        `Rolled 3d: ${result.total}.`,
      ];
      const margin = result.margin!;
      const criticalText =
        result.critical === "success" ? " Critical success!" : result.critical === "failure" ? " Critical failure!" : "";
      if (result.success) {
        lines.push(margin >= 0 ? `Success by ${margin}.${criticalText}` : `Success (margin ${margin}, automatic result).${criticalText}`);
      } else {
        lines.push(margin >= 0 ? `Failure by ${margin}.${criticalText}` : `Failure (margin ${margin}, automatic result).${criticalText}`);
      }
      return lines;
    }

    case "contest": {
      if (!state.character) return ["No character yet. Use: new <name>"];
      // contest <skill or attribute> [+n or -n ...] vs <opponent's effective skill>
      const joined = args.join(" ");
      const vs = joined.split(/\s+vs\s+/i);
      if (vs.length !== 2) return ["Usage: contest <skill or attribute> [+n or -n ...] vs <number>"];
      const leftTokens: string[] = [];
      const leftMods: string[] = [];
      for (const t of vs[0].split(/\s+/).filter(Boolean)) (/^[+-]/.test(t) ? leftMods : leftTokens).push(t);
      const mods = parseModifiers(leftMods);
      if (typeof mods === "string") return [mods];
      const target = leftTokens.join(" ");
      if (!target) return ["Usage: contest <skill or attribute> [+n or -n ...] vs <number>"];

      const attr = target.toUpperCase() as AttributeId;
      let base: number | null;
      let label: string;
      if (ATTRIBUTE_IDS.includes(attr)) {
        base = state.character.attributes[attr];
        label = attr;
      } else {
        const found = findSkillRef(state, target);
        if (typeof found === "string") return [found];
        try {
          base = baseSkillLevel(state.character, found);
        } catch (error) {
          return [(error as Error).message];
        }
        label = displayName(found);
      }
      const opponent = Number(vs[1]);
      if (!Number.isInteger(opponent)) return [`Bad opponent skill "${vs[1]}". Give their effective skill as a number.`];
      if (base === null) return [`${label} has no default (p. 13). You cannot attempt it untrained.`];

      const result = quickContest(
        { baseSkill: base, modifiers: mods, label },
        { baseSkill: opponent, label: "opponent" },
        state.dice,
      );
      const modSum = mods.reduce((s, m) => s + m.value, 0);
      const lines = [`${label} ${base + modSum} vs ${opponent}.`];
      const sideLine = (who: string, r: typeof result.a): string => {
        if (r.status !== "rolled") return `${who} cannot attempt the roll (p. 2).`;
        const crit = r.critical === "none" ? "" : ` (${r.critical})`;
        return `${who} rolled 3d: ${r.total} — ${r.success ? `success by ${r.margin}` : `failure by ${r.margin}`}${crit}.`;
      };
      lines.push(sideLine("You", result.a), sideLine("They", result.b));
      if (result.winner === null) lines.push("Nobody won.");
      else if (result.winner === "a") lines.push(`You win, margin of victory ${result.marginOfVictory}.`);
      else lines.push(`They win, margin of victory ${result.marginOfVictory}.`);
      return lines;
    }

    case "react": {
      // Reaction roll (p. 3): 3d plus modifiers applied directly, high is
      // good. "predetermined" answers the channel's yes/no — then no roll.
      const predetermined = args.some((a) => a.toLowerCase() === "predetermined");
      const modTokens = args.filter((a) => a.toLowerCase() !== "predetermined");
      const mods = parseModifiers(modTokens);
      if (typeof mods === "string") return [mods];
      const typedSum = mods.reduce((s, m) => s + m.value, 0);
      let result;
      try {
        result = resolveReaction(
          state.character,
          { predetermined: predetermined || undefined, modifier: mods.length > 0 ? typedSum : undefined },
          state.dice,
        );
      } catch (error) {
        return [(error as Error).message];
      }
      if (result === "predetermined") {
        return ["The NPC's reaction is predetermined — no reaction roll (p. 3). Play the NPC as scripted."];
      }
      const modText =
        result.modifier === 0
          ? ", no modifiers"
          : `, modifier${result.modifier === 1 || result.modifier === -1 ? "" : "s"} ${result.modifier > 0 ? "+" : ""}${result.modifier}`;
      return [
        `Reaction roll: rolled 3d = ${result.rolled}${modText}, total ${result.total} — ${result.band.name} (p. 3).`,
        result.band.guideline,
        "(The GM keeps this roll secret from the players, p. 3.)",
      ];
    }

    case "seed": {
      const seed = Number(args[0]);
      if (!Number.isInteger(seed)) return ["Usage: seed <n>"];
      state.dice = new SeededDice(seed);
      return [`Dice seeded with ${seed}.`];
    }

    case "skills": {
      const word = args.join(" ").toLowerCase();
      const all = state.registry.listSkills();
      const shown = word
        ? all.filter(({ skill }) => skill.name.toLowerCase().includes(word) || skill.id.includes(word))
        : all;
      if (shown.length === 0) return [`No skills matching "${word}".`];
      return shown.map(
        ({ id, skill }) =>
          `${id.replace(/^lite-core:/, "")} — ${displayName(skill)} (${skill.attribute}/${skill.difficulty}), ` +
          `default ${skill.defaults.length ? skill.defaults.map((d) => `${d.from}${d.penalty}`).join(", ") : "none"}, p. ${skill.page}.`,
      );
    }

    case "foe": {
      if (!state.character) return ["No character yet. Use: new <name> or load <file> first."];
      const file = args.join(" ").trim();
      if (!file) return ["Usage: foe <path to .gcs file>"];
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        return [`Cannot load "${file}" — unreadable or not JSON.`];
      }
      try {
        const result = importGcsSheet(parsed, state.registry);
        const name = result.character.name;
        if (
          state.combat &&
          allFighters(state.combat).some((f) => f.combatant.character.name.toLowerCase() === name.toLowerCase())
        ) {
          return [`A fighter named ${name} is already in the fight. Rename the sheet and load again.`];
        }
        const fighter: Fighter = { combatant: makeCombatant(result.character), policy: "best" };
        const lines: string[] = [];
        if (!state.combat) {
          state.combat = {
            you: { combatant: makeCombatant(state.character), policy: "best" },
            npcs: [fighter],
            turnIndex: 0,
          };
          lines.push(`${name} loaded as your foe (HP ${fighter.combatant.hp}).`);
        } else {
          state.combat.npcs.push(fighter);
          lines.push(`${name} joins the fight (HP ${fighter.combatant.hp}).`);
        }
        const order = turnOrder(allFighters(state.combat).map((f) => f.combatant));
        lines.push(`Turn order by Basic Speed (p. 24): ${order.map((c) => c.character.name).join(", ")}.`);
        lines.push(...result.notes.map((note) => `Note: ${note}`));
        return lines;
      } catch (error) {
        return [(error as Error).message];
      }
    }

    case "fight": {
      // Owner shortcut (issue #25): a demo fight in one word — Mara Voss vs
      // the edge-case sheet. Paths resolve against this file, not the
      // terminal's working directory. Re-running it restarts the fight.
      const fixture = (name: string) =>
        fileURLToPath(new URL(`../../tests/fixtures/${name}`, import.meta.url));
      let mara: unknown;
      let edge: unknown;
      try {
        mara = JSON.parse(readFileSync(fixture("mara-voss.gcs"), "utf-8"));
        edge = JSON.parse(readFileSync(fixture("edge-case.gcs"), "utf-8"));
      } catch {
        return ["The demo sheets (tests/fixtures/mara-voss.gcs, edge-case.gcs) are missing from this copy."];
      }
      try {
        const you = importGcsSheet(mara, state.registry);
        const foe = importGcsSheet(edge, state.registry);
        state.character = you.character;
        state.character.wealthLevel ??= "average";
        state.character.money ??= startingWealth(state.tl);
        state.combat = {
          you: { combatant: makeCombatant(you.character), policy: "best" },
          npcs: [{ combatant: makeCombatant(foe.character), policy: "best" }],
          turnIndex: 0,
        };
        const order = turnOrder(allFighters(state.combat).map((f) => f.combatant));
        const lines = [
          `Demo fight: ${you.character.name} vs ${foe.character.name}.`,
          `Turn order by Basic Speed (p. 24): ${order.map((c) => c.character.name).join(", ")}.`,
          "Try: attack brawling, foeattack broadsword dmg 1d+1 cut, defend dodge, order.",
        ];
        lines.push(...you.notes.map((note) => `Note: ${note}`));
        lines.push(...foe.notes.map((note) => `Note: ${note}`));
        return lines;
      } catch (error) {
        return [(error as Error).message];
      }
    }

    case "order": {
      if (!state.combat) return ["No fight yet. Use: foe <path to .gcs file>"];
      const all = allFighters(state.combat);
      const ordered = turnOrder(all.map((f) => f.combatant));
      const current = ordered[state.combat.turnIndex % ordered.length];
      const hp = (c: Combatant) =>
        `${c.character.name} ${c.hp}` + (c.condition === "ok" ? "" : ` (${c.condition})`);
      return [
        `Turn order by Basic Speed (p. 24): ${ordered.map((c) => c.character.name).join(", ")} — ${current.character.name} to act.`,
        `HP: ${all.map((f) => hp(f.combatant)).join(", ")}.`,
        `Defenses: ${all.map((f) => `${f.combatant.character.name} ${f.policy}`).join(", ")}.`,
        `Maneuvers: ${all.map((f) => `${f.combatant.character.name} ${maneuverName(f.combatant.maneuver)}`).join(", ")}.`,
      ];
    }

    case "next": {
      if (!state.combat) return ["No fight yet. Use: foe <path to .gcs file>"];
      const ordered = turnOrder(allFighters(state.combat).map((f) => f.combatant));
      state.combat.turnIndex = (state.combat.turnIndex + 1) % ordered.length;
      return [`It is now ${ordered[state.combat.turnIndex].character.name}'s turn (p. 24).`];
    }

    case "attack": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const t = resolveTarget(state, args);
      if (Array.isArray(t)) return t;
      return runExchange(state, state.combat.you.combatant, t.target.combatant, t.rest, t.target.policy, {
        maneuver: { kind: "attack" },
      });
    }

    case "foeattack": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return runExchange(state, npc.combatant, state.combat!.you.combatant, args, state.combat!.you.policy, {
        maneuver: { kind: "attack" },
      });
    }

    case "allout": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const option = (args[0] ?? "").toLowerCase();
      if (!["determined", "double", "strong"].includes(option)) {
        return [`Usage: allout <determined|double|strong> [<target>] <skill> [dmg 2d+1 cut] [vs ...] [mods]  (All-Out Attack, p. 25)`];
      }
      const t = resolveTarget(state, args.slice(1));
      if (Array.isArray(t)) return t;
      return runExchange(state, state.combat.you.combatant, t.target.combatant, t.rest, t.target.policy, {
        maneuver: { kind: "all-out-attack", option: option as "determined" | "double" | "strong" },
        bonus: option === "determined" ? { label: "all-out attack (determined)", value: 4 } : undefined,
        strong: option === "strong",
        double: option === "double",
      });
    }

    case "foeallout": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      const option = (args[0] ?? "").toLowerCase();
      if (!["determined", "double", "strong"].includes(option)) {
        return [`Usage: foeallout <determined|double|strong> <skill> [dmg 2d+1 cut] [vs ...] [mods]  (All-Out Attack, p. 25)`];
      }
      return runExchange(state, npc.combatant, state.combat!.you.combatant, args.slice(1), state.combat!.you.policy, {
        maneuver: { kind: "all-out-attack", option: option as "determined" | "double" | "strong" },
        bonus: option === "determined" ? { label: "all-out attack (determined)", value: 4 } : undefined,
        strong: option === "strong",
        double: option === "double",
      });
    }

    case "moveattack": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const t = resolveTarget(state, args);
      if (Array.isArray(t)) return t;
      return runExchange(state, state.combat.you.combatant, t.target.combatant, t.rest, t.target.policy, {
        maneuver: { kind: "move-and-attack" },
        bonus: { label: "move and attack", value: -4 },
        capMelee9: true,
      });
    }

    case "foemoveattack": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return runExchange(state, npc.combatant, state.combat!.you.combatant, args, state.combat!.you.policy, {
        maneuver: { kind: "move-and-attack" },
        bonus: { label: "move and attack", value: -4 },
        capMelee9: true,
      });
    }

    case "shoot": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const t = resolveTarget(state, args);
      if (Array.isArray(t)) return t;
      return runExchange(state, state.combat.you.combatant, t.target.combatant, t.rest, t.target.policy, {
        ranged: true,
      });
    }

    case "foeshoot": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return runExchange(state, npc.combatant, state.combat!.you.combatant, args, state.combat!.you.policy, {
        ranged: true,
      });
    }

    case "npc": {
      // Any fighter acts (issue #31): npc <name> <verb> [<target>] [...].
      // The target defaults to you; name one to aim elsewhere.
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const all = allFighters(state.combat);
      const m = matchFighter(all, args);
      if (m === null)
        return [
          `No fighter named "${args.join(" ")}". Fighters: ${all.map((f) => f.combatant.character.name).join(", ")}.`,
        ];
      if (typeof m === "string") return [m];
      const actor = m.fighter;
      const [verbRaw, ...rest] = m.rest;
      const verb = (verbRaw ?? "").toLowerCase();
      if (verb === "attack" || verb === "shoot" || verb === "moveattack" || verb === "allout") {
        let restArgs = rest;
        let opts: ExchangeOptions;
        if (verb === "allout") {
          const option = (rest[0] ?? "").toLowerCase();
          if (!["determined", "double", "strong"].includes(option)) {
            return [`Usage: npc <name> allout <determined|double|strong> [<target>] <skill> [...]  (All-Out Attack, p. 25)`];
          }
          restArgs = rest.slice(1);
          opts = {
            maneuver: { kind: "all-out-attack", option: option as "determined" | "double" | "strong" },
            bonus: option === "determined" ? { label: "all-out attack (determined)", value: 4 } : undefined,
            strong: option === "strong",
            double: option === "double",
          };
        } else if (verb === "shoot") {
          opts = { ranged: true };
        } else if (verb === "moveattack") {
          opts = {
            maneuver: { kind: "move-and-attack" },
            bonus: { label: "move and attack", value: -4 },
            capMelee9: true,
          };
        } else {
          opts = { maneuver: { kind: "attack" } };
        }
        let target = state.combat.you;
        const tm = matchFighter(all, restArgs, actor);
        if (typeof tm === "string") return [tm];
        if (tm) {
          target = tm.fighter;
          restArgs = tm.rest;
        }
        return runExchange(state, actor.combatant, target.combatant, restArgs, target.policy, opts);
      }
      if (verb === "defend") return setDefensePolicy(state, actor, (rest[0] ?? "").toLowerCase(), "npc <name> defend");
      if (verb === "aim") return aimTurn(state, actor, rest);
      if (verb === "alloutdefense") return takeAllOutDefense(state, actor, rest, "npc <name> alloutdefense");
      if (verb === "donothing") return doNothingTurn(state, actor);
      return [`Usage: npc <name> <attack|shoot|allout|moveattack|aim|defend|alloutdefense|donothing> ...`];
    }

    case "alloutdefense": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return takeAllOutDefense(state, state.combat.you, args, "alloutdefense");
    }

    case "foealloutdefense": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return takeAllOutDefense(state, npc, args, "foealloutdefense");
    }

    case "aim": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return aimTurn(state, state.combat.you, args);
    }

    case "donothing": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return doNothingTurn(state, state.combat.you);
    }

    case "foedonothing": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return doNothingTurn(state, npc);
    }

    case "defend": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return setDefensePolicy(state, state.combat.you, (args[0] ?? "").toLowerCase(), "defend");
    }

    case "foedefend": {
      const npc = soleNpc(state);
      if (typeof npc === "string") return [npc];
      return setDefensePolicy(state, npc, (args[0] ?? "").toLowerCase(), "foedefend");
    }

    case "help":
      return [
        "Commands:",
        "  new <name>            Start a character at 10 in everything.",
        "  load <path>           Load a character from a .gcs file (GCS 5).",
        "  set <ST/DX/IQ/HT> <n> Set a basic attribute.",
        "  learn <skill> <points>  Add a skill with points (printed costs only: 1, 2, 4, 8, ...).",
        "  tl <0-12>             Set the campaign tech level (gates purchases; sets starting wealth, pp. 7, 18).",
        "  wealth <level>        Set wealth level and reset money: dead broke ... filthy rich (p. 8).",
        "  armory [word]         Browse the armor, shield and weapon tables (pp. 18-22).",
        "  buy <item> [st <n>]   Buy equipment with your money; bows/crossbows take their own ST (p. 20).",
        "  wear <armor|none>     Wear armor; its DR reduces penetrating damage (pp. 18, 29).",
        "  ready <item|none>     Ready a weapon or shield; combat then uses its table stats (pp. 19-22).",
        "  sheet                 Print attributes, skills, wealth, gear and point total.",
        "  test <skill or attribute> [+n or -n ...]  Make a success roll.",
        "  contest <skill or attribute> [mods] vs <number>  Quick Contest against an opponent's effective skill.",
        "  react [predetermined] [+n or -n ...]  Reaction roll: 3d plus modifiers, read on the Reaction Table (p. 3).",
        "  formula <skill>       Explain a skill: attribute, difficulty, default, costs, your level.",
        "  odds <skill> [mods]   Print the chance of success, no roll.",
        "  foe <path>            Load an opponent from a .gcs file; repeat to add more fighters.",
        "  fight                 Demo fight in one word: Mara Voss vs the edge-case sheet (restarts it too).",
        "  order                 Turn order (…to act), HP, conditions, defenses and maneuvers for every fighter.",
        "  next                  Advance to the next fighter's turn (p. 24).",
        "  attack [<target>] <skill> [dmg 2d+1 cut] [mode swing|thrust|two hands] [vs dodge|block|parry|none] [mods]  Attack; a ready weapon supplies its table damage.",
        "  shoot [<target>] <skill> rng <yd> [dmg <pool> <type> half <1/2D> max <Max>] [allout|moveattack] [vs ...] [mods]  Ranged attack; a ready weapon supplies damage, 1/2D and Max (pp. 27-28).",
        "  aim [<target>] [acc <n>] [braced]  Aim with the ready weapon's Acc: +Acc on your next shot at that target, +1/+2 for extra seconds, +1 braced, scope +1/second (pp. 19-20, 25-27).",
        "  allout <determined|double|strong> [<target>] <skill> [...]  All-Out Attack: +4, two attacks, or +2 damage; no defense till next turn (p. 25).",
        "  moveattack [<target>] <skill> [...]  Move and Attack: -4, melee skill capped at 9, no parry till next turn (p. 25).",
        "  alloutdefense <increased dodge|block|parry | double>  All-Out Defense (p. 25).",
        "  donothing             Do Nothing this turn (p. 25).",
        "  defend <dodge|block|parry|none|best>  Set your standing defense.",
        "  npc <name> <attack|shoot|allout|moveattack|aim|defend|alloutdefense|donothing> [...]  A fighter acts; target defaults to you.",
        "  foeattack / foeshoot / foedefend / ...  Shorthand for the one opponent; with several, use npc.",
        "  seed <n>              Seed the dice so a session repeats.",
        "  skills [word]         List skills from the Lite table.",
        "  help, quit",
      ];

    case "quit":
      return ["__QUIT__"];

    default:
      return [`Unknown command "${verb}". Type help.`];
  }
}

function verbAlias(verb: string): string {
  return verb === "q" || verb === "exit" ? "quit" : verb;
}

/** Interactive loop. Commands can also be piped: node solo.ts < commands.txt */
export function main(): void {
  const state = makeSoloState();
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  console.log("GURPS.ai Lite — success rolls and skill tests. Type help.");
  rl.prompt();
  rl.on("line", (line) => {
    const out = runCommand(state, line);
    if (out.includes("__QUIT__")) {
      rl.close();
      return;
    }
    for (const l of out) console.log(l);
    rl.prompt();
  });
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
