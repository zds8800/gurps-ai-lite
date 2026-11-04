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
import { pathToFileURL } from "node:url";
import { makeCharacter, pointTotal } from "../model/attribute.ts";
import type { AttributeId, Character } from "../model/attribute.ts";
import { baseSkillLevel } from "../model/defaults.ts";
import { pointsToRelativeLevel } from "../model/skill.ts";
import type { SkillDef } from "../model/skill.ts";
import { Registry } from "../modules/loader.ts";
import { LITE_CORE } from "../modules/lite-core/index.ts";
import { rollOdds } from "../core/odds.ts";
import { resolve } from "../core/success-roll.ts";
import { SeededDice, SystemDice } from "../core/dice.ts";
import type { DiceSource } from "../core/dice.ts";
import type { Modifier } from "../core/types.ts";

export interface SoloState {
  registry: Registry;
  character: Character | null;
  dice: DiceSource;
}

export function makeSoloState(): SoloState {
  const registry = new Registry();
  registry.load(LITE_CORE);
  return { registry, character: null, dice: new SystemDice() };
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
      const a = state.character.attributes;
      return [`${name} created. ST ${a.ST} DX ${a.DX} IQ ${a.IQ} HT ${a.HT}. 0 points spent.`];
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
          const level = baseSkillLevel(c, def);
          lines.push(`  ${displayName(def)} (${def.attribute}/${def.difficulty}) ${record.points} points: level ${level}.`);
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
        base = baseSkillLevel(state.character, found);
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

    case "help":
      return [
        "Commands:",
        "  new <name>            Start a character at 10 in everything.",
        "  set <ST/DX/IQ/HT> <n> Set a basic attribute.",
        "  learn <skill> <points>  Add a skill with points (printed costs only: 1, 2, 4, 8, ...).",
        "  sheet                 Print attributes, skills and point total.",
        "  test <skill or attribute> [+n or -n ...]  Make a success roll.",
        "  odds <skill> [mods]   Print the chance of success, no roll.",
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
