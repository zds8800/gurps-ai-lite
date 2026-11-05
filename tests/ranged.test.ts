/**
 * Ranged attacks (issue #29; Lite pp. 27-28): the Size and Speed/Range
 * table as printed in Lite, the Max-range refusal, 1/2D halving, and the
 * ranged maneuver modifiers (ranged All-Out Attack is a flat +1 with no
 * options, p. 27; ranged Move and Attack is -4 with no skill cap, p. 25).
 */

import assert from "node:assert";
import test from "node:test";

import { attackExchange, makeCombatant } from "../src/combat/attack.ts";
import { atHalfDamage, outOfRange, rangeModifier } from "../src/combat/ranged.ts";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";
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

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

test("the Size and Speed/Range table matches the rows Lite prints (p. 28)", () => {
  // Lite's simplified table: no 7 yd / -3 row.
  const rows: [yards: number, modifier: number][] = [
    [1 / 3, 0], // 1 ft
    [1, 0],
    [2, 0],
    [3, -1],
    [5, -2],
    [10, -4],
    [15, -5],
    [20, -6],
    [30, -7],
    [50, -8],
    [70, -9],
    [100, -10],
  ];
  for (const [yards, mod] of rows) {
    assert.equal(rangeModifier(yards), mod, `${yards} yd`);
  }
});

test("a distance between rows uses the next row up (p. 28)", () => {
  assert.equal(rangeModifier(0), 0);
  assert.equal(rangeModifier(4), -2); // past 3, so the 5 yd row
  assert.equal(rangeModifier(7), -4); // no 7 yd row in Lite: the 10 yd row
  assert.equal(rangeModifier(12), -5);
});

test("past 100 yd the table's own decade pattern continues (p. 28)", () => {
  assert.equal(rangeModifier(150), -11);
  assert.equal(rangeModifier(200), -12);
  assert.equal(rangeModifier(300), -13);
  assert.equal(rangeModifier(500), -14);
  assert.equal(rangeModifier(700), -15);
  assert.equal(rangeModifier(1000), -16);
  assert.equal(rangeModifier(1500), -17);
});

test("a negative range is rejected", () => {
  assert.throws(() => rangeModifier(-1), /Bad range/);
});

test("Max range refuses the shot; 1/2D halves at or past it (p. 27)", () => {
  assert.equal(outOfRange({ range: 100, half: 20, max: 100 }), false);
  assert.equal(outOfRange({ range: 101, half: 20, max: 100 }), true);
  assert.equal(atHalfDamage({ range: 19, half: 20, max: 100 }), false);
  assert.equal(atHalfDamage({ range: 20, half: 20, max: 100 }), true);
});

test("at or past 1/2D range, basic damage halves, rounding down (p. 27)", () => {
  const defender = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Defender"));
  // Attack 10 hits vs dodge 8 failing on 12; damage 1d+2 cr rolls a 5:
  // 7 halved is 3. No major wound (3 is not over half of 10 HP).
  const outcome = attackExchange(
    {
      attacker: makeCombatant(fighter({ ST: 12 }, "Attacker")),
      attackSkill: 14,
      damage: { dice: 1, adds: 2 },
      damageType: "cr",
      defender,
      defense: "dodge",
      halfDamage: true,
    },
    registry(),
    new ScriptedDice([10, 12, 5]),
  );
  assert.equal(outcome.hit, true);
  assert.equal(outcome.basicDamage, 3);
  assert.equal(outcome.halfDamageApplied, true);
  assert.equal(outcome.injury, 3);
});

test("a critical hit's maximum damage is also halved past 1/2D (pp. 27, 29)", () => {
  const defender = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Defender"));
  // Roll of 3: no defense roll, no damage roll; 1d+2 max is 8, halved to 4.
  const outcome = attackExchange(
    {
      attacker: makeCombatant(fighter({ ST: 12 }, "Attacker")),
      attackSkill: 14,
      damage: { dice: 1, adds: 2 },
      damageType: "cr",
      defender,
      defense: "dodge",
      halfDamage: true,
    },
    registry(),
    new ScriptedDice([3]),
  );
  assert.equal(outcome.maxDamageCrit, true);
  assert.equal(outcome.basicDamage, 4);
  assert.equal(outcome.halfDamageApplied, true);
});

test("shoot applies the range table modifier and shows the range (pp. 27-28)", () => {
  // Mara has Brawling at DX+0 = 11; 12 yd is -5, so effective 6.
  const out = session(["seed 7", "fight", "shoot brawling dmg 1d+2 imp rng 12 half 20 max 100"]);
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Brawling (1d+2 imp, rng 12 yd) (effective 6):")),
    out.join("\n"),
  );
});

test("a shot beyond Max range is refused with the numbers (p. 27)", () => {
  const out = session(["fight", "shoot brawling dmg 1d+2 imp rng 150 half 20 max 100"]);
  assert.deepEqual(out.slice(-1), ["Edge Case is beyond Max range: 150 yd > 100 yd (p. 27)."]);
});

test("shoot requires the range stats; rng/half/max are rejected on melee attacks", () => {
  const missing = session(["fight", "shoot brawling dmg 1d+2 imp"]);
  assert.deepEqual(missing.slice(-1), [
    "Usage: shoot <skill> dmg <pool> <type> rng <yards> half <1/2D> max <Max> [allout|moveattack] [vs ...] [mods]  (p. 27).",
  ]);
  const melee = session(["fight", "attack brawling rng 5"]);
  assert.deepEqual(melee.slice(-1), [
    "rng/half/max are for ranged attacks: use shoot <skill> dmg <pool> <type> rng <yards> half <1/2D> max <Max> (p. 27).",
  ]);
});

test("ranged All-Out Attack is a flat +1 with no options (p. 27)", () => {
  // Brawling 11, +1 all-out, 0 at 2 yd: effective 12.
  const out = session(["seed 7", "fight", "shoot brawling dmg 1d+2 imp rng 2 half 20 max 100 allout", "order"]);
  assert.ok(out.some((l) => l.includes("(effective 12):")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("Mara Voss all-out attack (ranged, +1)")), out.join("\n"));
});

test("ranged Move and Attack is -4 and the melee skill cap of 9 does not apply (p. 25)", () => {
  // Brawling 11, -4 move and attack, +3 command-line mod: 10. A melee
  // Move and Attack would cap the adjusted skill at 9.
  const out = session(["seed 7", "fight", "shoot brawling dmg 1d+2 imp rng 2 half 20 max 100 moveattack +3"]);
  assert.ok(out.some((l) => l.includes("(effective 10):")), out.join("\n"));
});

test("a hit past 1/2D says the damage was halved (p. 27)", () => {
  const out = session([
    "seed 5",
    "fight",
    "shoot brawling dmg 1d+2 cr rng 5 half 3 max 100 vs none",
  ]);
  assert.ok(out.some((l) => l.includes("(halved: at or past 1/2D range, p. 27)")), out.join("\n"));
});

test("foeshoot runs the same exchange for the foe", () => {
  // Edge Case has Broadsword (DX/A) at 4 points = DX+1 = 11; 5 yd is -2,
  // so effective 9.
  const out = session(["seed 7", "fight", "foeshoot broadsword dmg 1d+1 cut rng 5 half 10 max 20"]);
  assert.ok(
    out.some((l) => l.startsWith("Edge Case attacks with Melee Weapon: Broadsword (1d+1 cut, rng 5 yd) (effective 9):")),
    out.join("\n"),
  );
});
