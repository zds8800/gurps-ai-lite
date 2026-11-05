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
import { pathToFileURL } from "node:url";
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
import { SeededDice, SystemDice } from "../core/dice.ts";
import { parseDicePool, formatDicePool } from "../core/dice-pool.ts";
import { strengthDamage } from "../model/secondary.ts";
import {
  attackExchange,
  bestDefense,
  defenseScore,
  makeCombatant,
  narrate,
  turnOrder,
} from "../combat/attack.ts";
import type { Combatant, DamageType, DefenseChoice } from "../combat/attack.ts";
import type { DiceSource } from "../core/dice.ts";
import type { Modifier } from "../core/types.ts";

/** A side's standing defense choice; "best" auto-picks the highest available score. */
type DefensePolicy = DefenseChoice | "best";

export interface SoloState {
  registry: Registry;
  character: Character | null;
  dice: DiceSource;
  /** Set by the foe command: both combatants (HP tracked) and their defense policies. */
  combat: { you: Combatant; foe: Combatant; youDefense: DefensePolicy; foeDefense: DefensePolicy } | null;
}

export function makeSoloState(): SoloState {
  const registry = new Registry();
  registry.load(LITE_CORE);
  return { registry, character: null, dice: new SystemDice(), combat: null };
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
): string[] {
  const skillWords: string[] = [];
  const modTokens: string[] = [];
  let damage: { poolText: string; type: string } | null = null;
  let defenseOverride: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t.toLowerCase() === "dmg") {
      damage = { poolText: args[i + 1] ?? "", type: (args[i + 2] ?? "").toLowerCase() };
      i += 2;
    } else if (t.toLowerCase() === "vs") {
      defenseOverride = (args[i + 1] ?? "").toLowerCase();
      i += 1;
    } else if (/^[+-]\d+$/.test(t)) {
      modTokens.push(t);
    } else {
      skillWords.push(t);
    }
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

  // Damage: explicit "dmg 2d+1 cut", or an unarmed punch (thr-1 cr, p. 26).
  let pool;
  let type: DamageType;
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
  } else if (found.id === "brawling" || found.id === "karate") {
    const thrust = strengthDamage(attacker.character.attributes.ST, "thrust");
    pool = { dice: thrust.dice, adds: thrust.adds - 1 }; // punch: thr-1 cr (p. 26)
    type = "cr";
  } else {
    return [
      `Give the weapon's damage: ... dmg 2d+1 cut. A punch needs no weapon: use brawling or karate (thr-1 cr, p. 26).`,
    ];
  }

  // The defender's choice: one-off "vs" override, else their standing policy.
  const parrySkillId = combatantParrySkill(state, defender);
  let choice: DefenseChoice;
  if (defenseOverride !== null) {
    if (!["dodge", "block", "parry", "none"].includes(defenseOverride)) {
      return [`Bad defense "${defenseOverride}". Use dodge, block, parry or none (p. 28).`];
    }
    choice = defenseOverride as DefenseChoice;
  } else if (defensePolicy === "best") {
    const best = bestDefense(state.registry, defender.character, { parrySkillId });
    if (!best) return [`${defender.character.name} has no active defense available.`];
    choice = best.choice;
  } else {
    choice = defensePolicy;
  }
  if (
    choice !== "none" &&
    defenseScore(state.registry, defender.character, choice, { parrySkillId }) === null
  ) {
    return [
      `${defender.character.name} cannot ${choice} — ${choice === "block" ? "no usable Shield skill" : "no usable parry skill"} (p. 28). ` +
        `Set another defense with ${defender === state.combat?.you ? "defend" : "foedefend"}.`,
    ];
  }

  const outcome = attackExchange(
    {
      attacker,
      attackSkill: base,
      attackModifiers: mods,
      damage: pool,
      damageType: type,
      defender,
      defense: choice,
      defenseContext: { parrySkillId },
    },
    state.registry,
    state.dice,
  );
  return narrate(outcome, {
    attacker: attacker.character.name,
    defender: defender.character.name,
    attackLabel: `${displayName(found)} (${formatDicePool(pool)} ${type})`,
    defense: choice,
  });
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
      state.combat = null;
      const a = state.character.attributes;
      return [`${name} created. ST ${a.ST} DX ${a.DX} IQ ${a.IQ} HT ${a.HT}. 0 points spent.`];
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
        state.combat = {
          you: makeCombatant(state.character),
          foe: makeCombatant(result.character),
          youDefense: "best",
          foeDefense: "best",
        };
        const order = turnOrder([state.combat.you, state.combat.foe]);
        const lines = [
          `${result.character.name} loaded as your foe (HP ${state.combat.foe.hp}).`,
          `Turn order by Basic Speed (p. 24): ${order.map((c) => c.character.name).join(", ")}.`,
        ];
        lines.push(...result.notes.map((note) => `Note: ${note}`));
        return lines;
      } catch (error) {
        return [(error as Error).message];
      }
    }

    case "order": {
      if (!state.combat) return ["No fight yet. Use: foe <path to .gcs file>"];
      const order = turnOrder([state.combat.you, state.combat.foe]);
      return [
        `Turn order by Basic Speed (p. 24): ${order.map((c) => c.character.name).join(", ")}.`,
        `HP: ${state.combat.you.character.name} ${state.combat.you.hp}, ${state.combat.foe.character.name} ${state.combat.foe.hp}.`,
        `Defenses: ${state.combat.you.character.name} ${state.combat.youDefense}, ${state.combat.foe.character.name} ${state.combat.foeDefense}.`,
      ];
    }

    case "attack": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return runExchange(state, state.combat.you, state.combat.foe, args, state.combat.foeDefense);
    }

    case "foeattack": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      return runExchange(state, state.combat.foe, state.combat.you, args, state.combat.youDefense);
    }

    case "defend":
    case "foedefend": {
      if (!state.combat) return ["No fight yet. Load yourself (new/load) and a foe: foe <file>."];
      const raw = (args[0] ?? "").toLowerCase();
      if (!["dodge", "block", "parry", "none", "best"].includes(raw)) {
        return [`Usage: ${cmd} <dodge|block|parry|none|best>`];
      }
      const policy = raw as DefensePolicy;
      const side = cmd === "defend" ? "you" : "foe";
      const combatant = state.combat[side];
      const name = combatant.character.name;
      if (policy === "dodge" || policy === "block" || policy === "parry") {
        const score = defenseScore(state.registry, combatant.character, policy, {
          parrySkillId: combatantParrySkill(state, combatant),
        });
        if (score === null) {
          return [
            `${name} cannot ${policy} — ${policy === "block" ? "no usable Shield skill" : "no usable parry skill"} (p. 28).`,
          ];
        }
        state.combat[side === "you" ? "youDefense" : "foeDefense"] = policy;
        return [`${name} will ${policy} (${policy} ${score}) until you change it.`];
      }
      state.combat[side === "you" ? "youDefense" : "foeDefense"] = policy;
      return [
        policy === "best"
          ? `${name} will use the best available defense each time.`
          : `${name} will not defend.`,
      ];
    }

    case "help":
      return [
        "Commands:",
        "  new <name>            Start a character at 10 in everything.",
        "  load <path>           Load a character from a .gcs file (GCS 5).",
        "  set <ST/DX/IQ/HT> <n> Set a basic attribute.",
        "  learn <skill> <points>  Add a skill with points (printed costs only: 1, 2, 4, 8, ...).",
        "  sheet                 Print attributes, skills and point total.",
        "  test <skill or attribute> [+n or -n ...]  Make a success roll.",
        "  contest <skill or attribute> [mods] vs <number>  Quick Contest against an opponent's effective skill.",
        "  formula <skill>       Explain a skill: attribute, difficulty, default, costs, your level.",
        "  odds <skill> [mods]   Print the chance of success, no roll.",
        "  foe <path>            Load an opponent from a .gcs file and start a fight.",
        "  order                 Show turn order, current HP and defense choices.",
        "  attack <skill> [dmg 2d+1 cut] [vs dodge|block|parry|none] [mods]  Attack your foe.",
        "  foeattack <skill> [dmg ...] [mods]  Your foe attacks you.",
        "  defend / foedefend <dodge|block|parry|none|best>  Set a side's standing defense.",
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
