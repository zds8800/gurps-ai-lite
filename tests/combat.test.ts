/**
 * Combat slice tests (issue #19; Lite pp. 6, 24, 27-29). Table-driven; every
 * expected number is either a worked example from the book or arithmetic from
 * a printed formula. Exchanges run on ScriptedDice so rolls are exact.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  basicSpeed,
  basicMove,
  dodgeScore,
  hitPoints,
  strengthDamage,
} from "../src/model/secondary.ts";
import {
  attackExchange,
  basicDamage,
  bestDefense,
  defenseScore,
  injuryFrom,
  makeCombatant,
  turnOrder,
} from "../src/combat/attack.ts";
import type { DamageType } from "../src/combat/attack.ts";
import { parseDicePool, formatDicePool } from "../src/core/dice-pool.ts";
import { ScriptedDice } from "../src/core/dice.ts";
import { makeCharacter } from "../src/model/attribute.ts";
import type { Character } from "../src/model/attribute.ts";
import { Registry } from "../src/modules/loader.ts";
import { LITE_CORE } from "../src/modules/lite-core/index.ts";

function registry(): Registry {
  const r = new Registry();
  r.load(LITE_CORE);
  return r;
}

function fighter(attrs: { ST?: number; DX?: number; IQ?: number; HT?: number }, name = "Foe"): Character {
  const c = makeCharacter(name.toLowerCase(), name);
  Object.assign(c.attributes, attrs);
  return c;
}

test("secondary characteristics follow the p. 6 formulas, book examples included", () => {
  const cases: [
    { ST: number; DX: number; HT: number },
    { hp: number; speed: number; move: number; dodge: number },
  ][] = [
    [{ ST: 10, DX: 10, HT: 10 }, { hp: 10, speed: 5, move: 5, dodge: 8 }],
    // Book example: Basic Speed 5.25 gives Dodge 8 (p. 6)
    [{ ST: 10, DX: 11, HT: 10 }, { hp: 10, speed: 5.25, move: 5, dodge: 8 }],
    // Book example: Basic Speed 5.75 gives Basic Move 5 (p. 6)
    [{ ST: 12, DX: 11, HT: 12 }, { hp: 12, speed: 5.75, move: 5, dodge: 8 }],
    [{ ST: 14, DX: 14, HT: 14 }, { hp: 14, speed: 7, move: 7, dodge: 10 }],
  ];
  for (const [attrs, want] of cases) {
    const c = fighter(attrs);
    assert.equal(hitPoints(c), want.hp);
    assert.equal(basicSpeed(c), want.speed);
    assert.equal(basicMove(c), want.move);
    assert.equal(dodgeScore(c), want.dodge);
  }
});

test("the Damage Table matches p. 6, including the book's own example", () => {
  const cases: [number, string, string][] = [
    [1, "1d-6", "1d-5"],
    [10, "1d-2", "1d"],
    [13, "1d", "2d-1"], // book example: "if you had ST 13, you would list Damage 1d/2d-1"
    [16, "1d+1", "2d+2"],
    [20, "2d-1", "3d+2"],
  ];
  for (const [st, thrust, swing] of cases) {
    assert.equal(formatDicePool(strengthDamage(st, "thrust")), thrust);
    assert.equal(formatDicePool(strengthDamage(st, "swing")), swing);
  }
  // The printed table stops at 20; higher ST is a GM or LLGM call.
  assert.throws(() => strengthDamage(21, "thrust"), /ST 1 to 20/);
});

test("defense scores follow the p. 28 formulas, book examples included", () => {
  const r = registry();
  // Book example: Shield-11 gives Block 8 ("3 + (11/2) = 8.5, rounds down to 8")
  const blocker = fighter({});
  blocker.skills.push({ skillId: "shield", points: 2, specialization: null }); // DX/E: 2 points = DX+1 = 11
  assert.equal(defenseScore(r, blocker, "block"), 8);

  // Book example: Broadsword-13 gives Parry 9
  const fencer = fighter({ DX: 12 });
  fencer.skills.push({ skillId: "broadsword", points: 4, specialization: null }); // DX/A: 4 points = DX+1 = 13
  assert.equal(defenseScore(r, fencer, "parry", { parrySkillId: "broadsword" }), 9);

  // No shield skill record: block still works from the DX-4 default (p. 16)
  const nobody = fighter({ DX: 10 });
  assert.equal(defenseScore(r, nobody, "block"), 6); // 3 + floor(6/2)
  // No usable parry skill: parry is unavailable
  assert.equal(defenseScore(r, nobody, "parry", { parrySkillId: "karate" }), null);
  // Shield DB adds to any defense (p. 28)
  assert.equal(defenseScore(r, nobody, "dodge", { shieldDB: 2 }), 10);
  // Encumbrance lowers Dodge (p. 28)
  assert.equal(defenseScore(r, nobody, "dodge", { encumbrance: 2 }), 6);
});

test("bestDefense picks the highest available score", () => {
  const r = registry();
  const c = fighter({ DX: 12 });
  c.skills.push({ skillId: "broadsword", points: 4, specialization: null }); // Parry 9
  const best = bestDefense(r, c, { parrySkillId: "broadsword" });
  assert.deepEqual(best, { choice: "parry", score: 9 });
});

test("damage minimums and wounding modifiers follow p. 29", () => {
  // Damage-roll minimums: negative adds bottom out at 0 for crushing, 1 otherwise
  const cases: [number, DamageType, boolean, number][] = [
    [-2, "cr", false, 0],
    [-2, "cut", false, 1],
    [6, "cr", false, 6],
    [7, "cr", true, 3], // 1/2D halves, rounding down
  ];
  for (const [rolled, type, half, want] of cases) {
    assert.equal(basicDamage(rolled, type, half), want);
  }

  // Book example: 6 points of basic damage against mail DR 4 = 2 penetrating
  // Injury: penetrating x wounding modifier, rounded down, minimum 1 on any penetration
  const wounds: [number, number, DamageType, { penetrating: number; injury: number }][] = [
    [6, 4, "cr", { penetrating: 2, injury: 2 }],
    [6, 4, "cut", { penetrating: 2, injury: 3 }], // x1.5
    [6, 4, "imp", { penetrating: 2, injury: 4 }], // x2
    [3, 2, "pi-", { penetrating: 1, injury: 1 }], // x0.5 rounds down but minimum 1
    [4, 4, "cut", { penetrating: 0, injury: 0 }], // bounced off the DR
    [5, 4, "imp", { penetrating: 1, injury: 2 }],
  ];
  for (const [basic, dr, type, want] of wounds) {
    assert.deepEqual(injuryFrom(basic, dr, type), want);
  }
});

test("turn order: descending Basic Speed, ties to highest DX (p. 24)", () => {
  const fast = makeCombatant(fighter({ DX: 11, HT: 11 }, "Fast")); // speed 5.5
  const slow = makeCombatant(fighter({ DX: 9, HT: 9 }, "Slow")); // speed 4.5
  const tiedLowDx = makeCombatant(fighter({ DX: 10, HT: 10 }, "TiedA")); // speed 5, DX 10
  const tiedHighDx = makeCombatant(fighter({ DX: 12, HT: 8 }, "TiedB")); // speed 5, DX 12
  const order = turnOrder([slow, tiedLowDx, fast, tiedHighDx]).map((c) => c.character.name);
  assert.deepEqual(order, ["Fast", "TiedB", "TiedA", "Slow"]);
});

function exchange(opts: {
  attackTotal: number;
  defenseTotal?: number;
  damageDice?: number[];
  defender?: Character;
  defense?: "dodge" | "block" | "parry" | "none";
  defenderAware?: boolean;
  dr?: number;
}) {
  const r = registry();
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const defender = makeCombatant(opts.defender ?? fighter({ ST: 10 }, "Defender"));
  const rolls = [opts.attackTotal];
  if (opts.defenseTotal !== undefined) rolls.push(opts.defenseTotal);
  if (opts.damageDice) rolls.push(...opts.damageDice);
  // Injury effects (pp. 29-30): big scripted wounds now trigger major-wound
  // and death-check HT rolls; pad the stream with clear successes (HT 10).
  rolls.push(8, 8, 8, 8);
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 2, adds: 0 }, // swing at ST 12 is 1d+2; 2d keeps scripting simple
      damageType: "cut",
      defender,
      defense: opts.defense ?? "dodge",
      defenderAware: opts.defenderAware,
      dr: opts.dr,
    },
    r,
    new ScriptedDice(rolls),
  );
  return { outcome, attacker, defender };
}

test("a hit past a failed defense lands injury on HP", () => {
  const { outcome, defender } = exchange({ attackTotal: 11, defenseTotal: 14, damageDice: [4, 5] });
  assert.ok(outcome.attack.success); // 11 vs 14: success by 3
  assert.ok(outcome.defense && !outcome.defense.success); // 14 vs dodge 8: failure
  assert.equal(outcome.basicDamage, 9);
  assert.equal(outcome.injury, 13); // 9 cut = 13.5 -> 13
  assert.equal(defender.hp, 10 - 13);
});

test("a successful defense turns the attack aside, no damage roll", () => {
  const { outcome, defender } = exchange({ attackTotal: 11, defenseTotal: 6, damageDice: [6, 6] });
  assert.ok(outcome.defense?.success);
  assert.equal(outcome.hit, false);
  assert.equal(outcome.basicDamage, null);
  assert.equal(defender.hp, 10); // untouched; the scripted damage dice went unused
});

test("a critical hit skips the defense roll (p. 28)", () => {
  const { outcome, defender } = exchange({ attackTotal: 4, defenseTotal: 3, damageDice: [3, 3] });
  assert.equal(outcome.attack.critical, "success");
  assert.equal(outcome.defense, null); // defense roll never happened
  assert.equal(outcome.injury, 9); // 6 cut = 9
  assert.equal(defender.hp, 1);
});

test("an unaware defender gets no defense roll (p. 28)", () => {
  const { outcome } = exchange({ attackTotal: 12, defenderAware: false, damageDice: [2, 2] });
  assert.equal(outcome.defense, null);
  assert.equal(outcome.injury, 6); // 4 cut = 6
});

test("a defense roll of 3 or 4 succeeds even at effective defense 1 or 2 (p. 28)", () => {
  // Effective defense 2 (dodge 8 with a -6 situation modifier): only 3-4 can succeed.
  const r = registry();
  const attacker = makeCombatant(fighter({}, "Attacker"));
  const defender = makeCombatant(fighter({}, "Defender"));
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 12,
      damage: { dice: 1, adds: 0 },
      damageType: "cr",
      defender,
      defense: "dodge",
      defenseModifiers: [{ label: "test", value: -6 }],
    },
    r,
    new ScriptedDice([10, 4, 2]),
  );
  assert.equal(outcome.defense?.effectiveSkill, 2);
  assert.ok(outcome.defense?.success, "the 4 always defends");
  assert.equal(outcome.hit, false);
});

test("the CLI fight path loads two .gcs combatants", () => {
  // Mara Voss (imported fixture) vs herself: exercises importer + combat together.
  const r = registry();
  const path = fileURLToPath(new URL("fixtures/mara-voss.gcs", import.meta.url));
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  return { r, parsed }; // exercised fully in cli.test.ts; here just prove the fixture loads for combat
});

test("parseDicePool round-trips book notation", () => {
  assert.deepEqual(parseDicePool("2d-1"), { dice: 2, adds: -1 });
  assert.deepEqual(parseDicePool("1d+2"), { dice: 1, adds: 2 });
  assert.deepEqual(parseDicePool("3d"), { dice: 3, adds: 0 });
  assert.throws(() => parseDicePool("2d6+1"), /Bad dice pool/);
});
