/**
 * Table transcription tests (issue #35): every row of Lite's armor table
 * (p. 18), shield table (p. 19), melee weapon table (pp. 20-21),
 * muscle-powered ranged table (p. 21), pistol table (p. 21) and
 * rifle/shotgun table (p. 22), plus wealth levels (p. 8) and starting
 * wealth by TL (p. 18). Expected values below are transcribed straight from
 * the printed book and compared field-by-field against the data module.
 */

import assert from "node:assert";
import test from "node:test";

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
  STARTING_WEALTH_BY_TL,
  startingWealth,
  WEALTH_LEVELS,
} from "../src/model/equipment.ts";

test("armor table (p. 18), every row: DR, cost, weight", () => {
  const expected = [
    ["Cloth Armor", 1, 150, 12],
    ["Leather Armor", 2, 340, 19.5],
    ["Light Scale", 3, 610, 49],
    ["Mail", 4, 645, 58],
    ["Steel Laminate", 5, 1360, 64],
    ["Plate", 6, 4040, 89.5],
    ["Flak Jacket", 7, 500, 20],
    ["Ballistic Vest", 8, 400, 2],
    ["Tactical Vest", 12, 900, 9],
  ] as const;
  assert.equal(ARMOR_TABLE.length, expected.length);
  expected.forEach(([name, dr, cost, weight], i) => {
    assert.deepEqual(
      { name: ARMOR_TABLE[i].name, dr: ARMOR_TABLE[i].dr, cost: ARMOR_TABLE[i].cost, weight: ARMOR_TABLE[i].weight },
      { name, dr, cost, weight },
    );
  });
});

test("shield table (p. 19), every row: DB, cost, weight", () => {
  const expected = [
    ["Small Shield", 1, 40, 8],
    ["Medium Shield", 2, 60, 15],
    ["Large Shield", 3, 90, 25],
  ] as const;
  assert.equal(SHIELD_TABLE.length, expected.length);
  expected.forEach(([name, db, cost, weight], i) => {
    assert.deepEqual(
      { name: SHIELD_TABLE[i].name, db: SHIELD_TABLE[i].db, cost: SHIELD_TABLE[i].cost, weight: SHIELD_TABLE[i].weight },
      { name, db, cost, weight },
    );
  });
});

test("melee weapon table (pp. 20-21), every row including the 'or' lines", () => {
  const expected = [
    // name, tl, skillId, [[base, adds, type], ...modes in printed order], cost, weight, minST, grip, throwable
    ["Axe", 0, "axe-mace", [["sw", 2, "cut"]], 50, 4, 11, "", false],
    ["Mace", 2, "axe-mace", [["sw", 3, "cr"]], 50, 5, 12, "", false],
    ["Punch", -1, "brawling", [["thr", -1, "cr"]], 0, 0, null, "", false],
    ["Brass Knuckles", 1, "brawling", [["thr", 0, "cr"]], 10, 0.25, null, "", false],
    ["Broadsword", 2, "broadsword", [["sw", 1, "cut"], ["thr", 1, "cr"]], 500, 3, 10, "", false],
    ["Thrusting Broadsword", 2, "broadsword", [["sw", 1, "cut"], ["thr", 2, "imp"]], 600, 3, 10, "", false],
    ["Large Knife", 0, "knife", [["sw", -2, "cut"], ["thr", 0, "imp"]], 40, 1, 6, "", true],
    ["Poleaxe", 3, "polearm", [["sw", 4, "cut"], ["sw", 4, "cr"]], 120, 10, 12, "‡", false],
    ["Rapier", 4, "rapier", [["thr", 1, "imp"]], 500, 2.75, 9, "", false],
    ["Shortsword", 2, "shortsword", [["sw", 0, "cut"], ["thr", 0, "imp"]], 400, 2, 8, "", false],
    ["Spear", 0, "spear", [["thr", 2, "imp"], ["thr", 3, "imp"]], 40, 4, 9, "", true],
    ["Quarterstaff", 0, "staff", [["sw", 2, "cr"], ["thr", 2, "cr"]], 10, 4, 7, "†", false],
    // The quarterstaff is printed again under TWO-HANDED SWORD (p. 21).
    ["Quarterstaff", 0, "two-handed-sword", [["sw", 2, "cr"], ["thr", 1, "cr"]], 10, 4, 9, "†", false],
    ["Thrusting Greatsword", 3, "two-handed-sword", [["sw", 3, "cut"], ["thr", 3, "imp"]], 900, 7, 12, "†", false],
  ] as const;
  assert.equal(MELEE_WEAPON_TABLE.length, expected.length);
  expected.forEach(([name, tl, skillId, modes, cost, weight, minST, grip, throwable], i) => {
    const w = MELEE_WEAPON_TABLE[i];
    assert.deepEqual(
      {
        name: w.name, tl: w.tl, skillId: w.skillId,
        modes: w.modes.map((m) => [m.base, m.adds, m.type]),
        cost: w.cost, weight: w.weight, minST: w.minST, grip: w.grip, throwable: w.throwable,
      },
      { name, tl, skillId, modes, cost, weight, minST, grip, throwable },
      `row ${i}: ${name}`,
    );
  });
});

test("muscle-powered ranged table (p. 21): bows, crossbow, thrown weapons", () => {
  const expected = [
    // name, tl, skillId, [base, adds, type], acc, [halfPerST, maxPerST], weight, reloadWeight, rof, shots, cost, minST, grip, usesOwnST
    ["Longbow", 0, "bow", ["thr", 2, "imp"], 3, [15, 20], 3, 0.1, "1", "1(2)", 200, 11, "†", true],
    ["Short Bow", 0, "bow", ["thr", 0, "imp"], 1, [10, 15], 2, 0.1, "1", "1(2)", 50, 7, "†", true],
    ["Crossbow", 2, "crossbow", ["thr", 4, "imp"], 4, [20, 25], 6, 0.06, "1", "1(4)", 150, 7, "†", true],
    ["Throwing Axe", 0, "thrown-axe-mace", ["sw", 2, "cut"], 2, [1, 1.5], 4, 0, "1", "T(1)", 60, 11, "", false],
    ["Large Knife (thrown)", 0, "thrown-knife", ["thr", 0, "imp"], 0, [0.8, 1.5], 1, 0, "1", "T(1)", 40, 6, "", false],
    ["Spear (thrown)", 0, "thrown-spear", ["thr", 3, "imp"], 2, [1, 1.5], 4, 0, "1", "T(1)", 40, 9, "", false],
  ] as const;
  for (const [name, tl, skillId, dmg, acc, range, weight, reloadWeight, rof, shots, cost, minST, grip, usesOwnST] of expected) {
    const w = RANGED_WEAPON_TABLE.find((x) => x.name === name)!;
    assert.ok(w, name);
    assert.deepEqual(
      {
        tl: w.tl, skillId: w.skillId,
        damage: [w.damage.base, w.damage.adds, w.damage.type],
        acc: w.acc, range: [w.range.halfPerST, w.range.maxPerST],
        weight: w.weight, reloadWeight: w.reloadWeight, rof: w.rof, shots: w.shots,
        cost: w.cost, minST: w.minST, grip: w.grip, usesOwnST: w.usesOwnST,
      },
      { tl, skillId, damage: dmg, acc, range, weight, reloadWeight, rof, shots, cost, minST, grip, usesOwnST },
      name,
    );
  }
});

test("pistol and rifle/shotgun tables (pp. 21-22), every row", () => {
  const expected = [
    // name, tl, [dice, adds, type], acc, scope, [half, max] yards, weight, reload, rof, shots, minST, grip, cost
    ["Derringer, .41", 5, [1, 0, "pi+"], 1, 0, [80, 650], 0.5, 0.1, "1", "2(3i)", 9, "", 100],
    ["Auto Pistol, 9mm", 6, [2, 2, "pi"], 2, 0, [150, 1850], 2.4, 0.4, "3", "8+1(3)", 9, "", 350],
    ["Revolver, .357", 7, [3, -1, "pi"], 2, 0, [185, 2000], 3, 0.21, "3", "6(3i)", 10, "", 500],
    ["Auto Pistol, .44M", 8, [3, 0, "pi+"], 2, 0, [230, 2500], 4.5, 0.6, "3", "9+1(3)", 12, "", 750],
    ["Lever-Action Carbine, .30", 5, [5, 0, "pi"], 4, 0, [450, 3000], 7, 0.3, "1", "6+1(3i)", 10, "†", 300],
    ["Self-Loading Rifle, 7.62mm", 6, [7, 0, "pi"], 5, 0, [1000, 4200], 10, 0.5, "3", "8(3)", 10, "†", 600],
    ["Sniper Rifle, .338", 8, [9, 1, "pi"], 6, 3, [1500, 5500], 17.5, 0.8, "1", "4+1(3)", 11, "B†", 5600],
    ["Pump Shotgun, 12G", 6, [1, 1, "pi-"], 3, 0, [50, 125], 8, 0.7, "2x9", "5(3i)", 10, "†", 240],
  ] as const;
  for (const [name, tl, dmg, acc, scope, range, weight, reloadWeight, rof, shots, minST, grip, cost] of expected) {
    const w = RANGED_WEAPON_TABLE.find((x) => x.name === name)!;
    assert.ok(w, name);
    assert.deepEqual(
      {
        tl: w.tl,
        damage: [w.damage.dice, w.damage.adds, w.damage.type],
        acc: w.acc, scopeBonus: w.scopeBonus, range: [w.range.half, w.range.max],
        weight: w.weight, reloadWeight: w.reloadWeight, rof: w.rof, shots: w.shots,
        minST: w.minST, grip: w.grip, cost: w.cost,
      },
      { tl, damage: dmg, acc, scopeBonus: scope, range, weight, reloadWeight, rof, shots, minST, grip, cost },
      name,
    );
  }
});

test("wealth levels (p. 8) and starting wealth by TL (p. 18)", () => {
  assert.deepEqual(WEALTH_LEVELS, {
    "dead broke": { multiplier: 0, points: -25 },
    poor: { multiplier: 1 / 5, points: -15 },
    struggling: { multiplier: 1 / 2, points: -10 },
    average: { multiplier: 1, points: 0 },
    comfortable: { multiplier: 2, points: 10 },
    wealthy: { multiplier: 5, points: 20 },
    "very wealthy": { multiplier: 20, points: 30 },
    "filthy rich": { multiplier: 100, points: 50 },
  });
  assert.deepEqual([...STARTING_WEALTH_BY_TL], [
    250, 500, 750, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000,
  ]);
  // Combined: TL3 Average is $1,000; TL8 Struggling is $10,000; TL8 Wealthy $100,000.
  assert.equal(startingWealth(3), 1000);
  assert.equal(startingWealth(8, "struggling"), 10000);
  assert.equal(startingWealth(8, "wealthy"), 100000);
  assert.equal(startingWealth(3, "dead broke"), 0);
});

test("lookup helpers find items by name, case and whitespace tolerant", () => {
  assert.equal(findArmor("  PLATE ")?.dr, 6);
  assert.equal(findShield("medium shield")?.db, 2);
  assert.equal(findMeleeWeapon("thrusting broadsword")?.cost, 600);
  assert.equal(findRangedWeapon("sniper rifle, .338")?.acc, 6);
  assert.equal(findMeleeWeapon("halberd"), null); // not in Lite
});

test("the quarterstaff has a row per skill; lookup by skill picks the right one (p. 21)", () => {
  assert.equal(findMeleeWeaponForSkill("quarterstaff", "staff")?.minST, 7);
  assert.equal(findMeleeWeaponForSkill("quarterstaff", "two-handed-sword")?.minST, 9);
  assert.equal(findMeleeWeaponForSkill("quarterstaff", "two-handed-sword")?.modes[1].adds, 1);
  // Unknown skill falls back to the first row of that name.
  assert.equal(findMeleeWeaponForSkill("quarterstaff", "brawling")?.skillId, "staff");
});
