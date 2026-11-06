/**
 * Equipment (issue #35; Lite pp. 18-22): the armor, shield and weapon tables
 * transcribed exactly as printed, plus wealth levels (p. 8) and starting
 * wealth by tech level (p. 18). Data only — lookup helpers, no combat logic.
 *
 * Every row is asserted number-for-number in tests/equipment.test.ts.
 */

import type { DamageType } from "../combat/attack.ts";

// ---- Wealth (p. 8) and starting wealth by TL (p. 18) ----

export interface WealthLevel {
  /** Multiplier on starting wealth; Dead Broke owns nothing. */
  multiplier: number;
  /** Character-point cost of the level (p. 8). */
  points: number;
}

export const WEALTH_LEVELS: Record<string, WealthLevel> = {
  "dead broke": { multiplier: 0, points: -25 },
  poor: { multiplier: 1 / 5, points: -15 },
  struggling: { multiplier: 1 / 2, points: -10 },
  average: { multiplier: 1, points: 0 },
  comfortable: { multiplier: 2, points: 10 },
  wealthy: { multiplier: 5, points: 20 },
  "very wealthy": { multiplier: 20, points: 30 },
  "filthy rich": { multiplier: 100, points: 50 },
};

/** Suggested starting wealth in $ by tech level (p. 18); index 12 covers TL12+. */
export const STARTING_WEALTH_BY_TL: readonly number[] = [
  250, // TL0 Stone Age
  500, // TL1 Bronze Age
  750, // TL2 Iron Age
  1000, // TL3 Medieval
  2000, // TL4 Age of Sail
  5000, // TL5 Industrial Revolution
  10000, // TL6 Mechanized Age
  15000, // TL7 Nuclear Age
  20000, // TL8 Digital Age
  30000, // TL9 Microtech Age
  50000, // TL10 Robotic Age
  75000, // TL11 Age of Exotic Matter
  100000, // TL12+ whatever the GM likes
];

/** Starting wealth for a TL and wealth level (pp. 8, 18). */
export function startingWealth(tl: number, wealthLevel = "average"): number {
  const level = WEALTH_LEVELS[wealthLevel];
  if (!level) throw new Error(`Unknown wealth level "${wealthLevel}".`);
  const base = STARTING_WEALTH_BY_TL[Math.min(Math.max(tl, 0), 12)];
  return Math.floor(base * level.multiplier);
}

// ---- Armor (p. 18) ----

export interface Armor {
  name: string;
  dr: number;
  cost: number;
  weight: number;
}

export const ARMOR_TABLE: readonly Armor[] = [
  { name: "Cloth Armor", dr: 1, cost: 150, weight: 12 },
  { name: "Leather Armor", dr: 2, cost: 340, weight: 19.5 },
  { name: "Light Scale", dr: 3, cost: 610, weight: 49 },
  { name: "Mail", dr: 4, cost: 645, weight: 58 },
  { name: "Steel Laminate", dr: 5, cost: 1360, weight: 64 },
  { name: "Plate", dr: 6, cost: 4040, weight: 89.5 },
  { name: "Flak Jacket", dr: 7, cost: 500, weight: 20 },
  { name: "Ballistic Vest", dr: 8, cost: 400, weight: 2 },
  { name: "Tactical Vest", dr: 12, cost: 900, weight: 9 },
];

// ---- Shields (p. 19) ----

export interface Shield {
  name: string;
  /** Defense Bonus: added to all active defense rolls from the front (p. 19). */
  db: number;
  cost: number;
  weight: number;
}

export const SHIELD_TABLE: readonly Shield[] = [
  { name: "Small Shield", db: 1, cost: 40, weight: 8 },
  { name: "Medium Shield", db: 2, cost: 60, weight: 15 },
  { name: "Large Shield", db: 3, cost: 90, weight: 25 },
];

// ---- Melee weapons (pp. 20-21) ----

/**
 * A weapon's damage expression: "thr"/"sw" plus adds for muscle-powered
 * weapons (p. 19), or fixed dice+adds for firearms. The "or" lines of the
 * printed table (swing vs thrust, one hand vs two) are separate labeled
 * modes of one weapon.
 */
export interface WeaponDamage {
  /** "thr"/"sw" for muscle-powered weapons (p. 19); null for firearms. */
  base: "thr" | "sw" | null;
  /** Fixed dice for firearms (e.g. 2d+2); unused for muscle-powered. */
  dice?: number;
  adds: number;
  type: DamageType;
  /** The printed table line this mode is: "swing", "thrust", "two hands". */
  label?: string;
}

export interface MeleeWeapon {
  name: string;
  tl: number;
  /** Lite skill id used to wield it. */
  skillId: string;
  modes: WeaponDamage[];
  cost: number;
  weight: number;
  /** Minimum ST to use properly (p. 20); "-" in the table becomes null. */
  minST: number | null;
  /** † two-handed; ‡ two-handed and unready after attacking (p. 20). */
  grip: "" | "†" | "‡";
  /** Footnote [1]: can be thrown — see the ranged table (p. 21). */
  throwable: boolean;
}

export const MELEE_WEAPON_TABLE: readonly MeleeWeapon[] = [
  // AXE/MACE (DX-5)
  { name: "Axe", tl: 0, skillId: "axe-mace", modes: [{ base: "sw", adds: 2, type: "cut" }], cost: 50, weight: 4, minST: 11, grip: "", throwable: false },
  { name: "Mace", tl: 2, skillId: "axe-mace", modes: [{ base: "sw", adds: 3, type: "cr" }], cost: 50, weight: 5, minST: 12, grip: "", throwable: false },
  // BRAWLING, KARATE, or DX
  { name: "Punch", tl: -1, skillId: "brawling", modes: [{ base: "thr", adds: -1, type: "cr" }], cost: 0, weight: 0, minST: null, grip: "", throwable: false },
  { name: "Brass Knuckles", tl: 1, skillId: "brawling", modes: [{ base: "thr", adds: 0, type: "cr" }], cost: 10, weight: 0.25, minST: null, grip: "", throwable: false },
  // BROADSWORD (DX-5)
  {
    name: "Broadsword", tl: 2, skillId: "broadsword",
    modes: [
      { base: "sw", adds: 1, type: "cut", label: "swing" },
      { base: "thr", adds: 1, type: "cr", label: "thrust" },
    ],
    cost: 500, weight: 3, minST: 10, grip: "", throwable: false,
  },
  {
    name: "Thrusting Broadsword", tl: 2, skillId: "broadsword",
    modes: [
      { base: "sw", adds: 1, type: "cut", label: "swing" },
      { base: "thr", adds: 2, type: "imp", label: "thrust" },
    ],
    cost: 600, weight: 3, minST: 10, grip: "", throwable: false,
  },
  // KNIFE (DX-4)
  {
    name: "Large Knife", tl: 0, skillId: "knife",
    modes: [
      { base: "sw", adds: -2, type: "cut", label: "swing" },
      { base: "thr", adds: 0, type: "imp", label: "thrust" },
    ],
    cost: 40, weight: 1, minST: 6, grip: "", throwable: true,
  },
  // POLEARM (DX-5)
  {
    name: "Poleaxe", tl: 3, skillId: "polearm",
    modes: [
      { base: "sw", adds: 4, type: "cut", label: "swing" },
      { base: "sw", adds: 4, type: "cr", label: "swing (crushing)" },
    ],
    cost: 120, weight: 10, minST: 12, grip: "‡", throwable: false,
  },
  // RAPIER (DX-5)
  { name: "Rapier", tl: 4, skillId: "rapier", modes: [{ base: "thr", adds: 1, type: "imp" }], cost: 500, weight: 2.75, minST: 9, grip: "", throwable: false },
  // SHORTSWORD (DX-5)
  {
    name: "Shortsword", tl: 2, skillId: "shortsword",
    modes: [
      { base: "sw", adds: 0, type: "cut", label: "swing" },
      { base: "thr", adds: 0, type: "imp", label: "thrust" },
    ],
    cost: 400, weight: 2, minST: 8, grip: "", throwable: false,
  },
  // SPEAR (DX-5)
  {
    name: "Spear", tl: 0, skillId: "spear",
    modes: [
      { base: "thr", adds: 2, type: "imp", label: "one hand" },
      { base: "thr", adds: 3, type: "imp", label: "two hands" },
    ],
    cost: 40, weight: 4, minST: 9, grip: "", throwable: true,
  },
  // STAFF (DX-5)
  {
    name: "Quarterstaff", tl: 0, skillId: "staff",
    modes: [
      { base: "sw", adds: 2, type: "cr", label: "swing" },
      { base: "thr", adds: 2, type: "cr", label: "thrust" },
    ],
    cost: 10, weight: 4, minST: 7, grip: "†", throwable: false,
  },
  // TWO-HANDED SWORD (DX-5) — the quarterstaff appears under both skills,
  // with different thrust damage and minimum ST (p. 21).
  {
    name: "Quarterstaff", tl: 0, skillId: "two-handed-sword",
    modes: [
      { base: "sw", adds: 2, type: "cr", label: "swing" },
      { base: "thr", adds: 1, type: "cr", label: "thrust" },
    ],
    cost: 10, weight: 4, minST: 9, grip: "†", throwable: false,
  },
  {
    name: "Thrusting Greatsword", tl: 3, skillId: "two-handed-sword",
    modes: [
      { base: "sw", adds: 3, type: "cut", label: "swing" },
      { base: "thr", adds: 3, type: "imp", label: "thrust" },
    ],
    cost: 900, weight: 7, minST: 12, grip: "†", throwable: false,
  },
];

// ---- Muscle-powered ranged weapons (p. 21) and firearms (pp. 21-22) ----

export interface RangedWeapon {
  name: string;
  tl: number;
  /** Lite skill id used to fire/throw it. */
  skillId: string;
  damage: WeaponDamage;
  /**
   * Accuracy: added to skill after one turn of Aim (p. 19). A built-in
   * scope's bonus appears as a separate number (pp. 19-20): "6+3".
   */
  acc: number;
  scopeBonus: number;
  /**
   * Range in yards: fixed numbers, or multiples of the wielder's ST
   * ("x15/x20" — p. 20; crossbows use the weapon's own ST).
   */
  range: { half: number; max: number } | { halfPerST: number; maxPerST: number };
  /** Loaded weight; the number after the slash is one full reload (p. 20). */
  weight: number;
  reloadWeight: number;
  rof: string;
  shots: string;
  cost: number;
  minST: number;
  /** † two-handed; B† bipod attached (p. 20). */
  grip: "" | "†" | "B†";
  /** Crossbows, prodds and bows: range and damage use the weapon's own ST, set at purchase (p. 20). */
  usesOwnST: boolean;
}

export const RANGED_WEAPON_TABLE: readonly RangedWeapon[] = [
  // BOW (DX-5)
  {
    name: "Longbow", tl: 0, skillId: "bow", damage: { base: "thr", adds: 2, type: "imp" },
    acc: 3, scopeBonus: 0, range: { halfPerST: 15, maxPerST: 20 },
    weight: 3, reloadWeight: 0.1, rof: "1", shots: "1(2)", cost: 200, minST: 11, grip: "†", usesOwnST: true,
  },
  {
    name: "Short Bow", tl: 0, skillId: "bow", damage: { base: "thr", adds: 0, type: "imp" },
    acc: 1, scopeBonus: 0, range: { halfPerST: 10, maxPerST: 15 },
    weight: 2, reloadWeight: 0.1, rof: "1", shots: "1(2)", cost: 50, minST: 7, grip: "†", usesOwnST: true,
  },
  // CROSSBOW (DX-4)
  {
    name: "Crossbow", tl: 2, skillId: "crossbow", damage: { base: "thr", adds: 4, type: "imp" },
    acc: 4, scopeBonus: 0, range: { halfPerST: 20, maxPerST: 25 },
    weight: 6, reloadWeight: 0.06, rof: "1", shots: "1(4)", cost: 150, minST: 7, grip: "†", usesOwnST: true,
  },
  // THROWN WEAPON (AXE/MACE) (DX-4)
  {
    name: "Throwing Axe", tl: 0, skillId: "thrown-axe-mace", damage: { base: "sw", adds: 2, type: "cut" },
    acc: 2, scopeBonus: 0, range: { halfPerST: 1, maxPerST: 1.5 },
    weight: 4, reloadWeight: 0, rof: "1", shots: "T(1)", cost: 60, minST: 11, grip: "", usesOwnST: false,
  },
  // THROWN WEAPON (KNIFE) (DX-4)
  {
    name: "Large Knife (thrown)", tl: 0, skillId: "thrown-knife", damage: { base: "thr", adds: 0, type: "imp" },
    acc: 0, scopeBonus: 0, range: { halfPerST: 0.8, maxPerST: 1.5 },
    weight: 1, reloadWeight: 0, rof: "1", shots: "T(1)", cost: 40, minST: 6, grip: "", usesOwnST: false,
  },
  // THROWN WEAPON (SPEAR) (DX-4)
  {
    name: "Spear (thrown)", tl: 0, skillId: "thrown-spear", damage: { base: "thr", adds: 3, type: "imp" },
    acc: 2, scopeBonus: 0, range: { halfPerST: 1, maxPerST: 1.5 },
    weight: 4, reloadWeight: 0, rof: "1", shots: "T(1)", cost: 40, minST: 9, grip: "", usesOwnST: false,
  },
  // GUNS (PISTOL) (DX-4)
  {
    name: "Derringer, .41", tl: 5, skillId: "guns", damage: { base: null, dice: 1, adds: 0, type: "pi+" },
    acc: 1, scopeBonus: 0, range: { half: 80, max: 650 },
    weight: 0.5, reloadWeight: 0.1, rof: "1", shots: "2(3i)", cost: 100, minST: 9, grip: "", usesOwnST: false,
  },
  {
    name: "Auto Pistol, 9mm", tl: 6, skillId: "guns", damage: { base: null, dice: 2, adds: 2, type: "pi" },
    acc: 2, scopeBonus: 0, range: { half: 150, max: 1850 },
    weight: 2.4, reloadWeight: 0.4, rof: "3", shots: "8+1(3)", cost: 350, minST: 9, grip: "", usesOwnST: false,
  },
  {
    name: "Revolver, .357", tl: 7, skillId: "guns", damage: { base: null, dice: 3, adds: -1, type: "pi" },
    acc: 2, scopeBonus: 0, range: { half: 185, max: 2000 },
    weight: 3, reloadWeight: 0.21, rof: "3", shots: "6(3i)", cost: 500, minST: 10, grip: "", usesOwnST: false,
  },
  {
    name: "Auto Pistol, .44M", tl: 8, skillId: "guns", damage: { base: null, dice: 3, adds: 0, type: "pi+" },
    acc: 2, scopeBonus: 0, range: { half: 230, max: 2500 },
    weight: 4.5, reloadWeight: 0.6, rof: "3", shots: "9+1(3)", cost: 750, minST: 12, grip: "", usesOwnST: false,
  },
  // GUNS (RIFLE) (DX-4)
  {
    name: "Lever-Action Carbine, .30", tl: 5, skillId: "guns", damage: { base: null, dice: 5, adds: 0, type: "pi" },
    acc: 4, scopeBonus: 0, range: { half: 450, max: 3000 },
    weight: 7, reloadWeight: 0.3, rof: "1", shots: "6+1(3i)", cost: 300, minST: 10, grip: "†", usesOwnST: false,
  },
  {
    name: "Self-Loading Rifle, 7.62mm", tl: 6, skillId: "guns", damage: { base: null, dice: 7, adds: 0, type: "pi" },
    acc: 5, scopeBonus: 0, range: { half: 1000, max: 4200 },
    weight: 10, reloadWeight: 0.5, rof: "3", shots: "8(3)", cost: 600, minST: 10, grip: "†", usesOwnST: false,
  },
  {
    name: "Sniper Rifle, .338", tl: 8, skillId: "guns", damage: { base: null, dice: 9, adds: 1, type: "pi" },
    acc: 6, scopeBonus: 3, range: { half: 1500, max: 5500 },
    weight: 17.5, reloadWeight: 0.8, rof: "1", shots: "4+1(3)", cost: 5600, minST: 11, grip: "B†", usesOwnST: false,
  },
  // GUNS (SHOTGUN) (DX-4)
  {
    name: "Pump Shotgun, 12G", tl: 6, skillId: "guns", damage: { base: null, dice: 1, adds: 1, type: "pi-" },
    acc: 3, scopeBonus: 0, range: { half: 50, max: 125 },
    weight: 8, reloadWeight: 0.7, rof: "2x9", shots: "5(3i)", cost: 240, minST: 10, grip: "†", usesOwnST: false,
  },
];

// ---- Lookup helpers ----

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findArmor(name: string): Armor | null {
  return ARMOR_TABLE.find((a) => norm(a.name) === norm(name)) ?? null;
}

export function findShield(name: string): Shield | null {
  return SHIELD_TABLE.find((s) => norm(s.name) === norm(name)) ?? null;
}

export function findMeleeWeapon(name: string): MeleeWeapon | null {
  return MELEE_WEAPON_TABLE.find((w) => norm(w.name) === norm(name)) ?? null;
}

/**
 * The quarterstaff is printed under both Staff and Two-Handed Sword with
 * different rows (p. 21); pick the entry for the skill being used, falling
 * back to the first entry of that name.
 */
export function findMeleeWeaponForSkill(name: string, skillId: string): MeleeWeapon | null {
  const named = MELEE_WEAPON_TABLE.filter((w) => norm(w.name) === norm(name));
  return named.find((w) => w.skillId === skillId) ?? named[0] ?? null;
}

export function findRangedWeapon(name: string): RangedWeapon | null {
  return RANGED_WEAPON_TABLE.find((w) => norm(w.name) === norm(name)) ?? null;
}
