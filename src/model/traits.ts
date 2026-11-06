/**
 * Advantages, disadvantages, social traits, languages and quirks (Lite pp. 6-12),
 * plus their improvement costs and hooks into existing systems (p. 17).
 *
 * The catalog stores printed costs, not inferred scene facts. Conditional effects
 * take explicit context: recognition, hearing, attraction, darkness, off-hand use,
 * and similar facts come from whoever is running the scene.
 */

import type { Character } from "./attribute.ts";
import { ATTRIBUTE_DEFS, attributeCost } from "./attribute.ts";
import { WEALTH_LEVELS } from "./equipment.ts";
import type { SkillDef } from "./skill.ts";
import type { DiceSource } from "../core/dice.ts";
import { resolve } from "../core/success-roll.ts";
import type { Modifier, RollResult } from "../core/types.ts";

export interface TraitVariantDef {
  id: string;
  label: string;
  points?: number;
  costPerLevel?: number;
  minLevel?: number;
  maxLevel?: number;
  /** Reaction modifier when this variant's condition is explicitly present. */
  reaction?: number;
}

export interface TraitDef {
  id: string;
  name: string;
  page: number;
  kind: "advantage" | "disadvantage" | "social";
  points?: number;
  costPerLevel?: number;
  minLevel?: number;
  maxLevel?: number;
  nonzero?: boolean;
  variants?: readonly TraitVariantDef[];
  /** Separate records are allowed when their variant or note differs. */
  multiple?: boolean;
  noteRequired?: boolean;
  /** The GM may price a specifically described custom variant. */
  customPoints?: "negative" | "positive-or-negative";
  selfControl?: boolean;
  handoff?: string;
}

export interface TraitRecord {
  traitId: string;
  variant?: string;
  level?: number;
  /** Used only for an explicitly GM-priced custom variant. */
  points?: number;
  note?: string;
}

const fixed = (
  id: string,
  name: string,
  page: number,
  points: number,
  kind: TraitDef["kind"] = points < 0 ? "disadvantage" : "advantage",
  extra: Partial<TraitDef> = {},
): TraitDef => ({ id, name, page, points, kind, ...extra });

const leveled = (
  id: string,
  name: string,
  page: number,
  costPerLevel: number,
  minLevel = 1,
  maxLevel?: number,
  kind: TraitDef["kind"] = costPerLevel < 0 ? "disadvantage" : "advantage",
  extra: Partial<TraitDef> = {},
): TraitDef => ({ id, name, page, costPerLevel, minLevel, maxLevel, kind, ...extra });

const variant = (
  id: string,
  name: string,
  page: number,
  kind: TraitDef["kind"],
  variants: readonly TraitVariantDef[],
  extra: Partial<TraitDef> = {},
): TraitDef => ({ id, name, page, kind, variants, ...extra });

const v = (id: string, label: string, points: number, reaction?: number): TraitVariantDef => ({
  id, label, points, ...(reaction === undefined ? {} : { reaction }),
});

/** Every advantage/disadvantage entry and listed variant printed on Lite pp. 6-12. */
export const TRAIT_DEFS: readonly TraitDef[] = [
  variant("appearance", "Appearance", 6, "social", [
    v("hideous", "Hideous", -16, -4),
    v("ugly", "Ugly", -8, -2),
    v("unattractive", "Unattractive", -4, -1),
    v("average", "Average", 0, 0),
    v("attractive", "Attractive", 4, 1),
    v("handsome", "Handsome/Beautiful", 12),
    v("very-handsome", "Very Handsome/Beautiful", 16),
  ]),
  leveled("charisma", "Charisma", 7, 5),
  leveled("odious-personal-habit", "Odious Personal Habit", 7, -5, 1, 3, "disadvantage", {
    multiple: true, noteRequired: true,
  }),
  fixed("voice", "Voice", 7, 10),
  leveled("low-tl", "Low TL", 7, -5, 1, undefined, "disadvantage"),
  leveled("high-tl", "High TL", 7, 5),
  leveled("reputation", "Reputation", 8, 5, -4, 4, "social", {
    nonzero: true, multiple: true, noteRequired: true,
  }),
  leveled("status", "Status", 8, 5, -2, 8, "social", { nonzero: true }),

  leveled("acute-hearing", "Acute Hearing", 8, 2),
  leveled("acute-taste-smell", "Acute Taste and Smell", 8, 2),
  leveled("acute-touch", "Acute Touch", 8, 2),
  leveled("acute-vision", "Acute Vision", 8, 2),
  fixed("ambidexterity", "Ambidexterity", 8, 5),
  fixed("animal-empathy", "Animal Empathy", 8, 5, "advantage", {
    handoff: "GM rolls IQ on meeting an animal; Influence skills may be used on animals.",
  }),
  fixed("catfall", "Catfall", 8, 10, "advantage", {
    handoff: "Fall resolution subtracts 5 yards; a successful DX roll halves damage when free to twist.",
  }),
  fixed("combat-reflexes", "Combat Reflexes", 8, 15),
  fixed("danger-sense", "Danger Sense", 9, 15),
  fixed("daredevil", "Daredevil", 9, 15),
  fixed("empathy", "Empathy", 9, 15, "advantage", {
    handoff: "GM rolls IQ on first meeting or reunion, and supplies truthful or misleading feelings.",
  }),
  fixed("enhanced-block", "Enhanced Block", 9, 5),
  fixed("enhanced-dodge", "Enhanced Dodge", 9, 15),
  variant("enhanced-parry", "Enhanced Parry", 9, "advantage", [
    v("bare-hands", "Bare hands", 5),
    v("one-skill", "One Melee Weapon skill", 5),
    v("all", "All parries", 10),
  ], { multiple: true }),
  leveled("fearlessness", "Fearlessness", 9, 2),
  variant("flexibility", "Flexibility", 9, "advantage", [
    v("flexibility", "Flexibility", 5),
    v("double-jointed", "Double-Jointed", 15),
  ]),
  leveled("hard-to-kill", "Hard to Kill", 9, 2),
  fixed("high-pain-threshold", "High Pain Threshold", 9, 10),
  variant("jumper", "Jumper", 9, "advantage", [
    v("time", "Time", 100),
    v("world", "World", 100),
  ], { multiple: true, handoff: "Destination, concentration, FP cost and arrival require the world/GM layer." }),
  fixed("language-talent", "Language Talent", 9, 10),
  variant("luck", "Luck", 9, "advantage", [
    v("luck", "Luck", 15),
    v("extraordinary", "Extraordinary Luck", 30),
    v("ridiculous", "Ridiculous Luck", 60),
  ], { handoff: "Real-time reroll intervals and immediate declarations belong to the session layer." }),
  leveled("night-vision", "Night Vision", 9, 1, 1, 9),
  fixed("perfect-balance", "Perfect Balance", 10, 15),
  variant("resistant", "Resistant", 10, "advantage", [
    v("disease-3", "Resistant to Disease +3", 3),
    v("disease-8", "Resistant to Disease +8", 5),
    v("poison-3", "Resistant to Poison +3", 5),
  ], { multiple: true, handoff: "Disease/poison HT resistance is a handoff until those hazards exist." }),
  variant("talent", "Talent", 10, "advantage", [
    { id: "artificer", label: "Artificer", costPerLevel: 10, minLevel: 1, maxLevel: 4 },
    { id: "outdoorsman", label: "Outdoorsman", costPerLevel: 10, minLevel: 1, maxLevel: 4 },
    { id: "smooth-operator", label: "Smooth Operator", costPerLevel: 15, minLevel: 1, maxLevel: 4 },
  ], { multiple: true }),

  variant("bad-sight", "Bad Sight", 10, "disadvantage", [
    v("correctable", "Correctable", -10),
    v("uncorrectable", "Not correctable", -25),
  ]),
  fixed("bad-temper", "Bad Temper", 10, -10, "disadvantage", { selfControl: true }),
  fixed("bloodlust", "Bloodlust", 10, -10, "disadvantage", { selfControl: true }),
  variant("code-of-honor", "Code of Honor", 10, "disadvantage", [
    v("informal-peers", "Informal, peers only", -5),
    v("formal-peers", "Formal, peers only", -10),
    v("informal-always", "Informal, all the time", -10),
    v("formal-always", "Formal, all the time or suicide if broken", -15),
  ], { multiple: true, noteRequired: true }),
  fixed("curious", "Curious", 11, -5, "disadvantage", { selfControl: true }),
  variant("delusions", "Delusions", 11, "disadvantage", [
    v("minor", "Minor", -5, -1),
    v("major", "Major", -10, -2),
    v("severe", "Severe", -15, -3),
  ], { multiple: true, noteRequired: true }),
  fixed("gluttony", "Gluttony", 11, -5, "disadvantage", { selfControl: true }),
  fixed("greed", "Greed", 11, -15, "disadvantage", { selfControl: true }),
  fixed("hard-of-hearing", "Hard of Hearing", 11, -10),
  fixed("honesty", "Honesty", 11, -10, "disadvantage", { selfControl: true }),
  fixed("impulsiveness", "Impulsiveness", 11, -10, "disadvantage", { selfControl: true }),
  variant("intolerance", "Intolerance", 11, "disadvantage", [
    v("total", "Total Intolerance", -10),
    v("common", "One commonly encountered group", -5),
    v("uncommon-4", "One specific group", -4),
    v("uncommon-3", "One specific group", -3),
    v("uncommon-2", "One specific group", -2),
    v("rare", "One rarely encountered group", -1),
  ], { multiple: true, noteRequired: true,
    handoff: "The bearer's -3 for Total Intolerance and victims' -1 to -5 reactions are explicit scene/GM inputs." }),
  fixed("jealousy", "Jealousy", 11, -10),
  fixed("lecherousness", "Lecherousness", 11, -15, "disadvantage", { selfControl: true }),
  variant("obsession", "Obsession", 11, "disadvantage", [
    v("short-term", "Short-term goal", -5),
    v("long-term", "Long-term goal", -10),
  ], { multiple: true, noteRequired: true, selfControl: true }),
  fixed("overconfidence", "Overconfidence", 11, -5, "disadvantage", { selfControl: true }),
  variant("pacifism", "Pacifism", 12, "disadvantage", [
    v("reluctant-killer", "Reluctant Killer", -5),
    v("cannot-harm-innocents", "Cannot Harm Innocents", -10),
  ]),
  variant("phobia", "Phobia", 12, "disadvantage", [
    v("blood", "Blood (Hemophobia)", -10),
    v("darkness", "Darkness (Scotophobia)", -15),
    v("heights", "Heights (Acrophobia)", -10),
    v("number-13", "Number 13 (Triskaidekaphobia)", -5),
    v("spiders", "Spiders (Arachnophobia)", -5),
    { id: "custom", label: "Custom phobia (GM-priced)" },
  ], { multiple: true, noteRequired: true, customPoints: "negative", selfControl: true }),
  variant("sense-of-duty", "Sense of Duty", 12, "disadvantage", [
    v("individual", "Individual", -2),
    v("small-group", "Small Group", -5),
    v("large-group", "Large Group", -10),
    v("entire-race", "Entire Race", -15),
    v("every-living-being", "Every Living Being", -20),
  ], { multiple: true, noteRequired: true }),
  fixed("truthfulness", "Truthfulness", 12, -5, "disadvantage", { selfControl: true }),
  fixed("unluckiness", "Unluckiness", 12, -10, "disadvantage", {
    handoff: "The GM chooses one adverse event per play session; no automatic timer or event is invented.",
  }),
  variant("vow", "Vow", 12, "disadvantage", [
    v("minor", "Minor Vow", -5),
    v("major", "Major Vow", -10),
    v("great", "Great Vow", -15),
  ], { multiple: true, noteRequired: true }),
];

export function normalizeTraitWord(word: string): string {
  return word.trim().toLowerCase().replace(/[/_]+/g, " ").replace(/\s+/g, " ").replace(/ /g, "-");
}

export function findTraitDef(idOrName: string): TraitDef | null {
  const id = normalizeTraitWord(idOrName);
  return TRAIT_DEFS.find((d) => d.id === id || normalizeTraitWord(d.name) === id) ?? null;
}

export function getTraitDef(id: string): TraitDef {
  const def = findTraitDef(id);
  if (!def) throw new Error(`Unknown trait "${id}". Use: traits [word]`);
  return def;
}

function findVariant(def: TraitDef, id?: string): TraitVariantDef | null {
  if (!def.variants) return null;
  if (!id) return null;
  const wanted = normalizeTraitWord(id);
  return def.variants.find((entry) => entry.id === wanted || normalizeTraitWord(entry.label) === wanted) ?? null;
}

function validateWholeLevel(level: number | undefined, min: number, max: number | undefined, nonzero: boolean | undefined): void {
  if (level === undefined || !Number.isInteger(level) || level < min || (max !== undefined && level > max) || (nonzero && level === 0)) {
    const range = `${min}${max === undefined ? " or more" : ` to ${max}`}${nonzero ? ", excluding 0" : ""}`;
    throw new Error(`Trait level must be a whole number: ${range}.`);
  }
}

/** Validate a record against its printed fixed cost, variant or level ladder. */
export function validateTraitRecord(record: TraitRecord): void {
  const def = getTraitDef(record.traitId);
  const selected = findVariant(def, record.variant);
  if (def.variants && !selected) {
    throw new Error(`${def.name} needs a variant: ${def.variants.map((entry) => entry.id).join(", ")}.`);
  }
  if (!def.variants && record.variant) throw new Error(`${def.name} has no variants; omit "${record.variant}".`);
  if (def.noteRequired && !record.note?.trim()) {
    throw new Error(`${def.name} needs a note describing its specific subject, belief, group, oath, or behavior.`);
  }
  if (def.id === "enhanced-parry" && record.variant === "one-skill" && !record.note?.trim()) {
    throw new Error("Enhanced Parry (one-skill) needs the Lite skill id as its note, for example: broadsword.");
  }
  const custom = selected && selected.points === undefined && selected.costPerLevel === undefined;
  if (custom) {
    if (!def.customPoints || record.points === undefined || !Number.isInteger(record.points) || record.points === 0 ||
      (def.customPoints === "negative" && record.points >= 0)) {
      throw new Error(`Custom ${def.name} needs an explicit ${def.customPoints === "negative" ? "negative " : ""}whole-number GM point cost.`);
    }
    return;
  }
  if (record.points !== undefined) throw new Error("Do not type points for a printed fixed/variant/level cost; give the printed variant or level instead.");
  const costPerLevel = selected?.costPerLevel ?? def.costPerLevel;
  if (costPerLevel !== undefined) {
    validateWholeLevel(record.level, selected?.minLevel ?? def.minLevel ?? 1, selected?.maxLevel ?? def.maxLevel, def.nonzero);
  } else if (record.level !== undefined) {
    throw new Error(`${def.name} has a fixed cost; omit its level.`);
  }
}

export function traitCost(record: TraitRecord): number {
  validateTraitRecord(record);
  const def = getTraitDef(record.traitId);
  const selected = findVariant(def, record.variant);
  if (selected && selected.points === undefined && selected.costPerLevel === undefined) return record.points!;
  const perLevel = selected?.costPerLevel ?? def.costPerLevel;
  if (perLevel !== undefined) return perLevel * record.level!;
  return selected?.points ?? def.points!;
}

function sameTrait(a: TraitRecord, b: TraitRecord): boolean {
  if (a.traitId !== b.traitId) return false;
  // Appearance, Luck, Status and similar traits have one record whose variant
  // or level can improve. Truly repeatable traits distinguish variant + note.
  if (!getTraitDef(a.traitId).multiple) return true;
  return (a.variant ?? "") === (b.variant ?? "") &&
    (a.note ?? "").trim().toLowerCase() === (b.note ?? "").trim().toLowerCase();
}

export function hasTrait(character: Character, traitId: string, variant?: string): boolean {
  return (character.traits ?? []).some((record) => record.traitId === traitId && (!variant || record.variant === variant));
}

export function traitLevel(character: Character, traitId: string, variant?: string): number {
  return (character.traits ?? [])
    .filter((record) => record.traitId === traitId && (!variant || record.variant === variant))
    .reduce((sum, record) => sum + (record.level ?? 0), 0);
}

export function disadvantagePoints(character: Character): number {
  let total = 0;
  for (const def of ATTRIBUTE_DEFS) total += Math.min(0, attributeCost(def.id, character.attributes[def.id]));
  if (character.wealthLevel) total += Math.min(0, WEALTH_LEVELS[character.wealthLevel]?.points ?? 0);
  for (const trait of character.traits ?? []) total += Math.min(0, traitCost(trait));
  for (const language of character.languages ?? []) total += Math.min(0, languagePoints(language));
  total -= (character.quirks ?? []).length;
  return total;
}

export function assertDisadvantageLimit(character: Character): void {
  if (character.disadvantageLimit === undefined) return;
  const total = disadvantagePoints(character);
  if (Math.abs(total) > character.disadvantageLimit) {
    throw new Error(
      `Disadvantages total ${total}, exceeding the GM limit of -${character.disadvantageLimit}. ` +
        `Remove a disadvantage or raise the limit explicitly with: limit ${Math.abs(total)}.`,
    );
  }
}

export function addTrait(character: Character, record: TraitRecord): number {
  const normalized = { ...record, traitId: getTraitDef(record.traitId).id };
  const cost = traitCost(normalized);
  const def = getTraitDef(normalized.traitId);
  if (hasTrait(character, "acute-hearing") && normalized.traitId === "hard-of-hearing" ||
    normalized.traitId === "acute-hearing" && hasTrait(character, "hard-of-hearing")) {
    throw new Error("Negated disadvantage: Acute Hearing and Hard of Hearing cannot be taken together (p. 10).");
  }
  character.traits ??= [];
  if (character.traits.some((existing) => sameTrait(existing, normalized))) {
    throw new Error(`${def.name}${normalized.variant ? ` (${normalized.variant})` : ""} is already on the sheet.`);
  }
  character.traits.push(normalized);
  try {
    assertDisadvantageLimit(character);
  } catch (error) {
    character.traits.pop();
    throw error;
  }
  return cost;
}

export function removeTrait(character: Character, traitId: string, variant?: string, note?: string): TraitRecord {
  const wanted: TraitRecord = { traitId, variant, note };
  const index = (character.traits ?? []).findIndex((record) => sameTrait(record, wanted));
  if (index < 0) throw new Error(`No matching ${getTraitDef(traitId).name} record to buy off.`);
  return character.traits!.splice(index, 1)[0];
}

export function addQuirk(character: Character, text: string): void {
  if (!text.trim()) throw new Error("A quirk needs a short description, for example: quirk Insists on payment in gold.");
  character.quirks ??= [];
  if (character.quirks.some((q) => q.toLowerCase() === text.trim().toLowerCase())) throw new Error("That quirk is already on the sheet.");
  if (character.quirks.length >= 5) throw new Error("Lite allows at most five quirks (p. 12). Buy one off for 1 point before adding another.");
  character.quirks.push(text.trim());
  try { assertDisadvantageLimit(character); } catch (error) { character.quirks.pop(); throw error; }
}

export function buyOffQuirk(character: Character, text: string): void {
  const index = (character.quirks ?? []).findIndex((q) => q.toLowerCase() === text.trim().toLowerCase());
  if (index < 0) throw new Error(`No quirk matching "${text}". See: sheet`);
  character.quirks!.splice(index, 1);
}

export type Comprehension = 0 | 1 | 2 | 3;
export interface LanguageRecord {
  name: string;
  /** 0 None, 1 Broken, 2 Accented, 3 Native. */
  spoken: Comprehension;
  written: Comprehension;
  /** The one free native language; spoken must be Native, written may be reduced. */
  native?: boolean;
}

const COMPREHENSION_COST = [0, 1, 2, 3] as const;
export const COMPREHENSION_NAMES = ["None", "Broken", "Accented", "Native"] as const;

export function comprehensionLevel(word: string | number): Comprehension {
  if (typeof word === "number" && Number.isInteger(word) && word >= 0 && word <= 3) return word as Comprehension;
  const index = COMPREHENSION_NAMES.findIndex((name) => name.toLowerCase() === String(word).toLowerCase());
  if (index < 0) throw new Error("Comprehension is None/0, Broken/1, Accented/2, or Native/3.");
  return index as Comprehension;
}

export function languagePoints(language: LanguageRecord): number {
  if (language.native) return language.written - 3;
  return COMPREHENSION_COST[language.spoken] + COMPREHENSION_COST[language.written];
}

export function validateLanguage(character: Character, language: LanguageRecord, replacing?: LanguageRecord): void {
  if (!language.name.trim()) throw new Error("Language needs a name.");
  comprehensionLevel(language.spoken);
  comprehensionLevel(language.written);
  if (language.native && language.spoken !== 3) throw new Error("The free native language must have Native spoken comprehension; only literacy may be reduced (p. 7).");
  if (!language.native && language.spoken === 0 && language.written === 0) throw new Error("A non-native language needs spoken or written comprehension above None.");
  const others = (character.languages ?? []).filter((entry) => entry !== replacing && entry.name.toLowerCase() !== language.name.toLowerCase());
  if (others.length !== (character.languages ?? []).filter((entry) => entry !== replacing).length) {
    throw new Error(`${language.name} is already on the sheet.`);
  }
  if (language.native && others.some((entry) => entry.native)) throw new Error("Only the first native spoken/written language is free; additional languages use normal costs (p. 7).");
}

export function addLanguage(character: Character, language: LanguageRecord): number {
  validateLanguage(character, language);
  character.languages ??= [];
  character.languages.push(language);
  try { assertDisadvantageLimit(character); } catch (error) { character.languages.pop(); throw error; }
  return languagePoints(language);
}

export function languageGainCost(character: Character, next: LanguageRecord): number | string {
  const current = (character.languages ?? []).find((entry) => entry.name.toLowerCase() === next.name.toLowerCase());
  try {
    validateLanguage(character, next, current);
    const candidate = { ...character, languages: (character.languages ?? []).filter((entry) => entry !== current).concat(next) };
    assertDisadvantageLimit(candidate);
  } catch (error) { return (error as Error).message; }
  const cost = languagePoints(next) - (current ? languagePoints(current) : 0);
  if (cost <= 0) return "Language improvement must increase its point cost. Use creation-time language to make a free-form correction instead.";
  return cost;
}

/** Language Talent raises effective comprehension one level only when it is above None (p. 9). */
export function effectiveComprehension(character: Character, language: LanguageRecord, aspect: "spoken" | "written"): Comprehension {
  const actual = language[aspect];
  if (!hasTrait(character, "language-talent") || actual === 0) return actual;
  return Math.min(3, actual + 1) as Comprehension;
}

/** New advantages normally allowed in play (p. 17); languages use languageGainCost. */
export function traitGainCost(character: Character, next: TraitRecord, gmApproved = false): number | string {
  try {
    next = { ...next, traitId: getTraitDef(next.traitId).id };
    traitCost(next);
  } catch (error) { return (error as Error).message; }
  const current = (character.traits ?? []).find((record) => sameTrait(record, next));
  const positive = traitCost(next) > 0;
  if (positive && !["combat-reflexes", "status"].includes(next.traitId) && !gmApproved) {
    return `${getTraitDef(next.traitId).name} is not a normal in-play purchase (p. 17). If the GM approves, repeat with: ... gm`;
  }
  const difference = traitCost(next) - (current ? traitCost(current) : 0);
  if (difference <= 0) return "Improvement must cost more than the current trait. Use buyoff for a disadvantage or add for a creation-time correction.";
  if (!current) {
    try { addTrait(character, next); character.traits!.pop(); } catch (error) { return (error as Error).message; }
  }
  return difference;
}

/** Apply a validated gain after the caller has checked and debited unspent points. */
export function applyTraitGain(character: Character, next: TraitRecord): void {
  const current = (character.traits ?? []).find((record) => sameTrait(record, next));
  if (current) Object.assign(current, next);
  else addTrait(character, next);
}

export interface SkillUseContext {
  speaking?: boolean;
  deception?: boolean;
  unnecessaryRisk?: boolean;
  listeningImportant?: boolean;
  language?: string;
  languageAspect?: "spoken" | "written";
}

const INFLUENCE_SKILLS = new Set(["diplomacy", "fast-talk", "intimidation", "savoir-faire", "sex-appeal", "streetwise"]);
const TALENT_SKILLS: Record<string, readonly string[]> = {
  artificer: ["armoury", "electronics-repair", "engineer", "mechanic"],
  outdoorsman: ["camouflage", "naturalist", "navigation", "survival", "tracking"],
  "smooth-operator": [...INFLUENCE_SKILLS, "acting", "carousing", "leadership", "public-speaking"],
};

/** Printed unconditional skill bonuses plus explicitly supplied conditional uses. */
export function traitSkillBonus(character: Character, skill: SkillDef, context: SkillUseContext = {}): number {
  let bonus = 0;
  const charisma = traitLevel(character, "charisma");
  if (skill.id === "leadership" || skill.id === "public-speaking" || INFLUENCE_SKILLS.has(skill.id)) bonus += charisma;
  if (hasTrait(character, "voice") && context.speaking) bonus += 2;
  if (hasTrait(character, "daredevil") && context.unnecessaryRisk) bonus += 1;
  if (hasTrait(character, "hard-of-hearing") && context.listeningImportant) bonus -= 4;
  const flexibility = (character.traits ?? []).find((record) => record.traitId === "flexibility");
  if (flexibility && (skill.id === "climbing" || skill.id === "escape")) bonus += flexibility.variant === "double-jointed" ? 5 : 3;
  if (hasTrait(character, "perfect-balance") && (skill.id === "acrobatics" || skill.id === "climbing")) bonus += 1;
  if (hasTrait(character, "truthfulness") && (skill.id === "fast-talk" || (skill.id === "acting" && context.deception))) bonus -= 5;
  for (const talent of (character.traits ?? []).filter((record) => record.traitId === "talent")) {
    if (talent.variant && TALENT_SKILLS[talent.variant]?.includes(skill.id)) bonus += talent.level ?? 0;
  }
  if (context.language) {
    const language = (character.languages ?? []).find((entry) => entry.name.toLowerCase() === context.language!.toLowerCase());
    if (language) {
      const effective = effectiveComprehension(character, language, context.languageAspect ?? "spoken");
      bonus += effective === 1 ? -3 : effective === 2 ? -1 : 0;
    }
  }
  return bonus;
}

export interface ReactionContext {
  recognized?: boolean;
  heard?: boolean;
  activeInteraction?: boolean;
  defer?: boolean;
  attracted?: boolean;
  noticed?: boolean;
  naive?: boolean;
  experienced?: boolean;
}

/** Conditional reaction modifiers (pp. 6-12); nothing is a universal standing modifier. */
export function traitReactionModifier(character: Character, context: ReactionContext = {}): number {
  let total = 0;
  for (const trait of character.traits ?? []) {
    const def = getTraitDef(trait.traitId);
    const selected = findVariant(def, trait.variant);
    switch (trait.traitId) {
      case "appearance":
        if (trait.variant === "handsome") total += context.attracted ? 4 : 2;
        else if (trait.variant === "very-handsome") total += context.attracted ? 6 : 2;
        else total += selected?.reaction ?? 0;
        break;
      case "charisma": if (context.activeInteraction) total += trait.level ?? 0; break;
      case "odious-personal-habit": if (context.noticed) total -= trait.level ?? 0; break;
      case "voice": if (context.heard) total += 2; break;
      case "reputation": if (context.recognized) total += trait.level ?? 0; break;
      case "status": if (context.defer && (trait.level ?? 0) > 0) total += trait.level ?? 0; break;
      case "delusions": if (context.noticed) total += selected?.reaction ?? 0; break;
      // Intolerance's exact -1 to -5 victim reaction is a GM ruling, supplied
      // as an ordinary typed reaction modifier rather than inferred from cost.
      case "overconfidence":
        if (context.naive) total += 2;
        if (context.experienced) total -= 2;
        break;
    }
  }
  return total;
}

export type Sense = "vision" | "hearing" | "taste-smell" | "touch" | "danger";

export function senseTraitModifier(character: Character, sense: Sense, darknessPenalty = 0): number {
  if (sense === "danger") return 0;
  const acuteId = sense === "taste-smell" ? "acute-taste-smell" : `acute-${sense}`;
  let modifier = traitLevel(character, acuteId);
  if (sense === "vision") {
    if (hasTrait(character, "bad-sight")) modifier -= 6;
    modifier += Math.min(Math.max(darknessPenalty, 0), traitLevel(character, "night-vision"));
  }
  if (sense === "hearing" && hasTrait(character, "hard-of-hearing")) modifier -= 4;
  return modifier;
}

export interface AttackTraitContext {
  offHand?: boolean;
  /** Positive magnitude of the darkness penalty, before Night Vision. */
  darknessPenalty?: number;
  targetPerson?: boolean;
  deadlyAttack?: boolean;
  targetFaceUnseen?: boolean;
}

/** Attack modifiers whose scene facts are explicit (pp. 5, 9, 10, 12). */
export function attackTraitModifiers(character: Character, context: AttackTraitContext = {}): Modifier[] {
  const mods: Modifier[] = [];
  if (context.offHand && !hasTrait(character, "ambidexterity")) mods.push({ label: "off hand", value: -4 });
  if (hasTrait(character, "bad-sight")) mods.push({ label: "Bad Sight", value: -2 });
  const darkness = Math.max(0, context.darknessPenalty ?? 0);
  const uncanceled = Math.max(0, darkness - traitLevel(character, "night-vision"));
  if (uncanceled > 0) mods.push({ label: "darkness after Night Vision", value: -uncanceled });
  if (hasTrait(character, "pacifism", "reluctant-killer") && context.targetPerson && context.deadlyAttack) {
    mods.push({ label: "Reluctant Killer", value: context.targetFaceUnseen ? -2 : -4 });
  }
  return mods;
}

/** +1 per Combat Reflexes, plus the appropriate Enhanced Defense (pp. 8-9). */
export function activeDefenseBonus(character: Character, choice: "dodge" | "block" | "parry", parrySkillId?: string): number {
  let bonus = hasTrait(character, "combat-reflexes") ? 1 : 0;
  if (choice === "dodge" && hasTrait(character, "enhanced-dodge")) bonus += 1;
  if (choice === "block" && hasTrait(character, "enhanced-block")) bonus += 1;
  if (choice === "parry") {
    for (const trait of (character.traits ?? []).filter((record) => record.traitId === "enhanced-parry")) {
      if (trait.variant === "all" ||
        trait.variant === "bare-hands" && (parrySkillId === "brawling" || parrySkillId === "karate") ||
        trait.variant === "one-skill" && trait.note === parrySkillId) {
        bonus += 1;
        break; // Enhanced Parry does not stack into a +2 from overlapping scopes.
      }
    }
  }
  return bonus;
}

/** A self-control roll is optional roleplaying assistance; target is always 12 plus explicit situation modifiers. */
export function selfControlRoll(character: Character, traitId: string, modifier: number, dice: DiceSource): RollResult {
  const record = (character.traits ?? []).find((trait) => trait.traitId === getTraitDef(traitId).id);
  if (!record) throw new Error(`${getTraitDef(traitId).name} is not on the sheet.`);
  if (!getTraitDef(record.traitId).selfControl) throw new Error(`${getTraitDef(record.traitId).name} has no self-control roll in Lite.`);
  return resolve({
    baseSkill: 12,
    modifiers: modifier === 0 ? [] : [{ label: "self-control situation", value: modifier }],
  }, dice);
}

export function personalTL(character: Character, campaignTL: number): number {
  return campaignTL + traitLevel(character, "high-tl") - traitLevel(character, "low-tl");
}
