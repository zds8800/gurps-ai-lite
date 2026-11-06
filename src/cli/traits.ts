/** CLI commands for the Lite trait catalog and its improvement/sense rolls. */

import type { SoloState } from "./solo.ts";
import { resolve } from "../core/success-roll.ts";
import {
  TRAIT_DEFS,
  addLanguage,
  addQuirk,
  addTrait,
  applyTraitGain,
  buyOffQuirk,
  comprehensionLevel,
  COMPREHENSION_NAMES,
  disadvantagePoints,
  effectiveComprehension,
  findTraitDef,
  getTraitDef,
  languageGainCost,
  languagePoints,
  normalizeTraitWord,
  personalTL,
  removeTrait,
  selfControlRoll,
  senseTraitModifier,
  traitCost,
  traitGainCost,
  validateTraitRecord,
} from "../model/traits.ts";
import type { LanguageRecord, Sense, TraitDef, TraitRecord } from "../model/traits.ts";

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function noCharacter(state: SoloState): string[] | null {
  return state.character ? null : ["No character yet. Use: new <name>"];
}

interface ParsedTrait {
  record: TraitRecord;
  rest: string[];
  gm: boolean;
}

/** Match a printed name or stable id, allowing spaces, then variant/level/note/points/gm. */
function parseTrait(args: string[], allowGm = false): ParsedTrait | string {
  let def: TraitDef | null = null;
  let used = 0;
  for (let len = Math.min(args.length, 5); len >= 1; len--) {
    const candidate = findTraitDef(args.slice(0, len).join(" "));
    if (candidate) { def = candidate; used = len; break; }
  }
  if (!def) return `Unknown trait "${args.join(" ")}". Browse: traits [word]`;
  const rest = args.slice(used);
  const record: TraitRecord = { traitId: def.id };
  const noteIndex = rest.findIndex((token) => token.toLowerCase() === "note");
  const pointsIndex = rest.findIndex((token) => token.toLowerCase() === "points");
  const gmIndex = allowGm ? rest.findIndex((token) => token.toLowerCase() === "gm") : -1;
  const markers = [noteIndex, pointsIndex, gmIndex].filter((index) => index >= 0);
  const positionalEnd = markers.length ? Math.min(...markers) : rest.length;
  const positional = rest.slice(0, positionalEnd);
  if (def.variants && positional.length) {
    const wanted = normalizeTraitWord(positional[0]);
    const selected = def.variants.find((entry) => entry.id === wanted || normalizeTraitWord(entry.label) === wanted);
    if (!selected) return `${def.name} variants: ${def.variants.map((entry) => entry.id).join(", ")}.`;
    record.variant = selected.id;
    positional.shift();
  }
  if (positional.length) {
    const level = Number(positional.shift());
    if (!Number.isInteger(level)) return `Bad trait level "${args[used] ?? ""}". Give a whole-number level, then any note/points/gm flag.`;
    record.level = level;
  }
  if (positional.length) return `Unexpected trait arguments: ${positional.join(" ")}. Use: note <description>, points <n>${allowGm ? ", gm" : ""}.`;
  if (noteIndex >= 0) {
    const end = [pointsIndex, gmIndex].filter((index) => index > noteIndex).sort((a, b) => a - b)[0] ?? rest.length;
    record.note = rest.slice(noteIndex + 1, end).join(" ").trim();
  }
  if (pointsIndex >= 0) {
    record.points = Number(rest[pointsIndex + 1]);
    if (!Number.isInteger(record.points)) return `Bad custom point cost "${rest[pointsIndex + 1] ?? ""}".`;
  }
  try { validateTraitRecord(record); } catch (error) { return (error as Error).message; }
  return { record, rest, gm: gmIndex >= 0 };
}

function parseLanguage(args: string[]): LanguageRecord | string {
  const tokens = [...args];
  let native = false;
  if (tokens.length >= 4 && tokens.at(-1)!.toLowerCase() === "native") {
    // A trailing fourth token is the free-native flag only when the two before
    // it are valid comprehension levels (language English native native native).
    try {
      comprehensionLevel(tokens.at(-2)!);
      comprehensionLevel(tokens.at(-3)!);
      native = true;
      tokens.pop();
    } catch { /* the final Native is a comprehension level, not the flag */ }
  }
  if (tokens.length < 3) return "Usage: language <name> <none|broken|accented|native> <none|broken|accented|native> [native]";
  const writtenRaw = tokens.pop()!;
  const spokenRaw = tokens.pop()!;
  const name = tokens.join(" ").trim();
  try {
    return { name, spoken: comprehensionLevel(spokenRaw), written: comprehensionLevel(writtenRaw), ...(native ? { native: true } : {}) };
  } catch (error) { return (error as Error).message; }
}

function spend(state: SoloState, cost: number, what: string): string | null {
  const c = state.character!;
  const unspent = c.unspentPoints ?? 0;
  if (cost > unspent) return `${what} costs ${cost} points; ${c.name} has ${unspent} unspent. Award more with: award <n>.`;
  c.unspentPoints = unspent - cost;
  return null;
}

function traitDescription(record: TraitRecord): string {
  const def = getTraitDef(record.traitId);
  const selected = def.variants?.find((entry) => entry.id === record.variant);
  return `${def.name}${selected ? ` (${selected.label})` : ""}${record.level !== undefined ? ` ${record.level}` : ""}${record.note ? ` — ${record.note}` : ""}`;
}

export function traitSheetLines(state: SoloState): string[] {
  const c = state.character!;
  const lines: string[] = [];
  for (const trait of c.traits ?? []) lines.push(`  ${traitDescription(trait)} [${traitCost(trait)}]`);
  for (const language of c.languages ?? []) {
    const effective = (aspect: "spoken" | "written") => COMPREHENSION_NAMES[effectiveComprehension(c, language, aspect)];
    const actual = `spoken ${COMPREHENSION_NAMES[language.spoken]}, written ${COMPREHENSION_NAMES[language.written]}`;
    const boosted = effective("spoken") !== COMPREHENSION_NAMES[language.spoken] || effective("written") !== COMPREHENSION_NAMES[language.written]
      ? `; effective ${effective("spoken")}/${effective("written")} with Language Talent` : "";
    lines.push(`  Language: ${language.name}${language.native ? " (native)" : ""} — ${actual}${boosted} [${languagePoints(language)}]`);
  }
  for (const quirk of c.quirks ?? []) lines.push(`  Quirk: ${quirk} [-1]`);
  lines.push(`Personal TL: ${personalTL(c, state.tl)} (campaign TL${state.tl}).`);
  lines.push(`Disadvantages: ${disadvantagePoints(c)}${c.disadvantageLimit === undefined ? "; no GM limit set" : `; limit -${c.disadvantageLimit}`}.`);
  return lines;
}

export function runTraitCommand(state: SoloState, cmd: string, args: string[]): string[] {
  if (cmd === "traits") {
    const word = args.join(" ").toLowerCase();
    const shown = TRAIT_DEFS.filter((def) => !word || def.id.includes(word) || def.name.toLowerCase().includes(word));
    if (!shown.length) return [`No traits matching "${word}".`];
    return shown.map((def) => {
      const cost = def.variants
        ? def.variants.map((entry) => `${entry.id} ${entry.points ?? (entry.costPerLevel === undefined ? "GM-priced" : `${entry.costPerLevel}/level`)}`).join(", ")
        : `${def.points ?? `${def.costPerLevel}/level`}`;
      return `${def.id} — ${def.name}, ${cost} points, p. ${def.page}${def.selfControl ? ", self-control 12" : ""}${def.handoff ? `; handoff: ${def.handoff}` : ""}`;
    });
  }

  const missing = noCharacter(state);
  if (missing) return missing;
  const c = state.character!;

  switch (cmd) {
    case "add": {
      const parsed = parseTrait(args);
      if (typeof parsed === "string") return [parsed];
      try {
        const cost = addTrait(c, parsed.record);
        return [`Added ${traitDescription(parsed.record)} [${cost}]. Disadvantages now ${disadvantagePoints(c)}.`];
      } catch (error) { return [(error as Error).message]; }
    }

    case "language": {
      const parsed = parseLanguage(args);
      if (typeof parsed === "string") return [parsed];
      try {
        const cost = addLanguage(c, parsed);
        return [`Language added: ${parsed.name} [${cost}].`];
      } catch (error) { return [(error as Error).message]; }
    }

    case "quirk": {
      if (!args.length) return (c.quirks ?? []).length ? c.quirks!.map((q) => `Quirk: ${q} [-1]`) : ["No quirks. Add one: quirk <description> (up to five, -1 each)."];
      try {
        addQuirk(c, args.join(" "));
        return [`Quirk added [-1]. ${c.quirks!.length}/5 quirks; disadvantages ${disadvantagePoints(c)}.`];
      } catch (error) { return [(error as Error).message]; }
    }

    case "limit": {
      if (args[0]?.toLowerCase() === "none") {
        c.disadvantageLimit = undefined;
        return ["GM disadvantage limit removed; disadvantages are still shown on the sheet."];
      }
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 0) return ["Usage: limit <0 or more|none>  (GM-supplied cap; 50% of starting points is only a rule of thumb)."];
      if (Math.abs(disadvantagePoints(c)) > n) return [`Cannot set limit -${n}: current disadvantages total ${disadvantagePoints(c)}. Remove traits first or choose a higher limit.`];
      c.disadvantageLimit = n;
      return [`GM disadvantage limit set to -${n}. Current total: ${disadvantagePoints(c)}.`];
    }

    case "gain": {
      if (args[0]?.toLowerCase() === "language") {
        const parsed = parseLanguage(args.slice(1));
        if (typeof parsed === "string") return [parsed];
        const cost = languageGainCost(c, parsed);
        if (typeof cost === "string") return [cost];
        const refusal = spend(state, cost, `Language ${parsed.name}`);
        if (refusal) return [refusal];
        c.languages = (c.languages ?? []).filter((entry) => entry.name.toLowerCase() !== parsed.name.toLowerCase()).concat(parsed);
        return [`Language ${parsed.name} improved [cost ${cost}]. ${c.unspentPoints ?? 0} unspent left.`];
      }
      const parsed = parseTrait(args, true);
      if (typeof parsed === "string") return [parsed];
      const cost = traitGainCost(c, parsed.record, parsed.gm);
      if (typeof cost === "string") return [cost];
      const what = traitDescription(parsed.record);
      const refusal = spend(state, cost, what);
      if (refusal) return [refusal];
      applyTraitGain(c, parsed.record);
      return [`Gained ${what} [cost ${cost}]. ${c.unspentPoints ?? 0} unspent left.`];
    }

    case "buyoff": {
      if (args[0]?.toLowerCase() === "quirk") {
        const text = args.slice(1).join(" ");
        const refusal = spend(state, 1, `Buying off quirk "${text}"`);
        if (refusal) return [refusal];
        try { buyOffQuirk(c, text); } catch (error) {
          c.unspentPoints = (c.unspentPoints ?? 0) + 1;
          return [(error as Error).message];
        }
        return [`Quirk bought off for 1 point. ${c.unspentPoints ?? 0} unspent left.`];
      }
      const parsed = parseTrait(args);
      if (typeof parsed === "string") return [parsed];
      try {
        const existing = (c.traits ?? []).find((record) => record.traitId === parsed.record.traitId &&
          (record.variant ?? "") === (parsed.record.variant ?? "") && (!getTraitDef(record.traitId).multiple || (record.note ?? "") === (parsed.record.note ?? "")));
        if (!existing) return [`No matching ${getTraitDef(parsed.record.traitId).name} record to buy off.`];
        const cost = -traitCost(existing);
        if (cost <= 0) return [`${traitDescription(existing)} is not a disadvantage; buying it off would cost nothing and is not supported.`];
        const refusal = spend(state, cost, `Buying off ${traitDescription(existing)}`);
        if (refusal) return [refusal];
        removeTrait(c, existing.traitId, existing.variant, existing.note);
        return [`Bought off ${traitDescription(existing)} for ${cost} points. ${c.unspentPoints ?? 0} unspent left.`];
      } catch (error) { return [(error as Error).message]; }
    }

    case "selfcontrol": {
      const modTokens = args.filter((token) => /^[+-]\d+$/.test(token));
      const parsed = parseTrait(args.filter((token) => !/^[+-]\d+$/.test(token)));
      if (typeof parsed === "string") return [parsed];
      const mods = modTokens.reduce((sum, token) => sum + Number(token), 0);
      try {
        const result = selfControlRoll(c, parsed.record.traitId, mods, state.dice);
        return [
          `${getTraitDef(parsed.record.traitId).name} self-control: target 12${mods ? ` ${signed(mods)}` : ""}, effective ${result.effectiveSkill}; rolled ${result.total} — ${result.success ? "success; you shrug it off" : "failure; the disadvantage takes effect"} (p. 10).`,
          "Rolling is optional: you may always choose to give in willingly.",
        ];
      } catch (error) { return [(error as Error).message]; }
    }

    case "sense": {
      const sense = (args.shift() ?? "").toLowerCase() as Sense;
      if (!["vision", "hearing", "taste-smell", "touch", "danger"].includes(sense)) {
        return ["Usage: sense <vision|hearing|taste-smell|touch|danger> [darkness <0-9>] [+n or -n ...]"];
      }
      if (sense === "danger" && !(c.traits ?? []).some((trait) => trait.traitId === "danger-sense")) {
        return [`${c.name} does not have Danger Sense; no secret Perception warning roll (p. 9).`];
      }
      let darkness = 0;
      const mods: number[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i].toLowerCase() === "darkness") {
          darkness = Number(args[++i]);
          if (!Number.isInteger(darkness) || darkness < 0 || darkness > 9) return ["Darkness penalty is a whole-number magnitude from 0 to 9."];
          mods.push(-darkness);
        } else if (/^[+-]\d+$/.test(args[i])) mods.push(Number(args[i]));
        else return [`Bad sense argument "${args[i]}". Use darkness <0-9> or signed modifiers.`];
      }
      const traitMod = senseTraitModifier(c, sense, darkness);
      const base = c.attributes.IQ;
      const effective = base + traitMod + mods.reduce((sum, n) => sum + n, 0);
      const result = resolve({ baseSkill: base + traitMod, modifiers: mods.map((value) => ({ label: "sense situation", value })) }, state.dice);
      if (result.status === "not-allowed") return [`Effective Perception ${effective} is below 3; no roll is allowed (p. 2).`];
      return [
        `${sense === "danger" ? "Danger Sense" : `${sense} sense`}: Per ${base}${traitMod ? ` ${signed(traitMod)} from traits` : ""}${mods.length ? ` ${signed(mods.reduce((a, b) => a + b, 0))} situation` : ""}, effective ${effective}.`,
        `Rolled 3d: ${result.total} — ${result.success ? `success by ${result.margin}` : `failure by ${result.margin}`}.`,
      ];
    }
  }
  return [`Unknown trait command "${cmd}".`];
}
