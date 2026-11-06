/**
 * Attributes and the character shell (design section 2; rules in
 * rules/attributes-and-skills.md sections 1 and 4). Plain data, no hidden state.
 */

import type { Modifier } from "../core/types.ts";
import type { SkillRecord } from "./skill.ts";
import { WEALTH_LEVELS } from "./equipment.ts";

export type AttributeId = "ST" | "DX" | "IQ" | "HT";

export interface AttributeDef {
  id: AttributeId;
  name: string;
  /** Character points per level above 10; negative below 10 (p. 4). */
  costPerLevel: number;
}

/** The four basic attributes (Lite pp. 4-5). Will and Per are derived, not stored. */
export const ATTRIBUTE_DEFS: readonly AttributeDef[] = [
  { id: "ST", name: "Strength", costPerLevel: 10 },
  { id: "DX", name: "Dexterity", costPerLevel: 20 },
  { id: "IQ", name: "Intelligence", costPerLevel: 20 },
  { id: "HT", name: "Health", costPerLevel: 10 },
];

export const ATTRIBUTE_BASE = 10;

/** Point cost of one attribute at the given level: (level - 10) x cost per level. */
export function attributeCost(id: AttributeId, level: number): number {
  const def = ATTRIBUTE_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown attribute: ${id}`);
  return (level - ATTRIBUTE_BASE) * def.costPerLevel;
}

/** Will and Perception equal IQ in Lite (p. 6) and are computed, never stored. */
export function derivedTraits(attributes: Record<AttributeId, number>): { Will: number; Per: number } {
  return { Will: attributes.IQ, Per: attributes.IQ };
}

/** A piece of owned gear, named as printed in the Lite tables (pp. 18-22). */
export interface EquipmentItem {
  name: string;
  /** Crossbows have their own ST for range and damage (p. 20); set at purchase. */
  st?: number;
}

/** A character: the four basic attribute levels, skill records, standing modifiers. */
export interface Character {
  id: string;
  name: string;
  /** Just the four basic levels. Will and Per are derived from IQ. */
  attributes: Record<AttributeId, number>;
  skills: SkillRecord[];
  /** Standing modifiers, such as the off-hand -4 (pp. 5-6). */
  modifiers: Modifier[];
  /** Wealth level (p. 8); the CLI prices purchases against it. Default average. */
  wealthLevel?: string;
  /** Bonus character points awarded but not yet spent (p. 17). */
  unspentPoints?: number;
  /** Money on hand in $ (starting wealth by TL, p. 18, times the level's multiplier). */
  money?: number;
  /** Owned gear (pp. 18-22). */
  equipment?: EquipmentItem[];
  /** Worn armor: its DR reduces penetrating damage (p. 29). */
  wornArmor?: string;
  /** Ready weapons and shield: combat draws their table stats (pp. 19-22, 28). */
  readyMelee?: string;
  readyRanged?: string;
  readyShield?: string;
}

/** New character at 10 in everything (the CLI's `new <name>`). */
export function makeCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    attributes: { ST: ATTRIBUTE_BASE, DX: ATTRIBUTE_BASE, IQ: ATTRIBUTE_BASE, HT: ATTRIBUTE_BASE },
    skills: [],
    modifiers: [],
  };
}

/** Total character points: attribute costs, skill points, and the Wealth level's points (pp. 4, 8, 13, 17). */
export function pointTotal(character: Character): number {
  let total = 0;
  for (const def of ATTRIBUTE_DEFS) {
    total += attributeCost(def.id, character.attributes[def.id]);
  }
  for (const record of character.skills) {
    total += record.points;
  }
  if (character.wealthLevel) {
    const level = WEALTH_LEVELS[character.wealthLevel];
    if (!level) throw new Error(`Unknown wealth level "${character.wealthLevel}".`);
    total += level.points;
  }
  return total;
}
