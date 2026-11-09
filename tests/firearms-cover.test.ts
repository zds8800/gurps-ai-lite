/**
 * Firearms regression scenario (issue #51): cover DR, target speed/range,
 * and thrown-weapon parry modifiers from Lite pp. 27-29.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";
import { attackExchange, defenseScore, makeCombatant, narrate, thrownParryPenalty } from "../src/combat/attack.ts";
import { speedToYardsPerSecond } from "../src/combat/ranged.ts";
import { ScriptedDice } from "../src/core/dice.ts";
import { makeCharacter } from "../src/model/attribute.ts";
import type { Character } from "../src/model/attribute.ts";
import { Registry } from "../src/modules/loader.ts";
import { LITE_CORE } from "../src/modules/lite-core/index.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((line) => runCommand(state, line));
}

function fighter(name: string): Character {
  const c = makeCharacter(name.toLowerCase(), name);
  c.skills.push({ skillId: "broadsword", points: 4, specialization: null });
  return c;
}

test("Lite converts mph to half as many yards/second and accepts explicit yd/s", () => {
  assert.equal(speedToYardsPerSecond(30, "mph"), 15);
  assert.equal(speedToYardsPerSecond(31, "mph"), 15.5);
  assert.equal(speedToYardsPerSecond(15), 15);
  assert.equal(speedToYardsPerSecond(15, "yards/second"), 15);
  assert.throws(() => speedToYardsPerSecond(30, "km/h"), /Bad speed unit/);
  assert.throws(() => speedToYardsPerSecond(-1, "mph"), /Bad speed/);
});

test("a shot adds target speed to range, but Max and 1/2D still use actual distance", () => {
  const out = session([
    "seed 5",
    "fight",
    // Brawling 11 + 5 = 16. Range 20 + 30 mph/2 = 35 yd: -8, effective 8.
    // Actual range 20 equals the typed 1/2D and Max, so the shot is legal and halved.
    "shoot brawling dmg 1d+2 cr rng 20 half 20 max 20 speed 30 mph vs none +5",
  ]);
  assert.ok(out.some((l) => l.includes("target speed 30 mph = 15 yd/s")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("(effective 8):")), out.join("\n"));
  assert.ok(!out.some((l) => l.includes("beyond Max range")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("halved: at or past 1/2D range")), out.join("\n"));
});

test("cover DR adds to armor DR and is visible in the hit narration (p. 29)", () => {
  const defender = makeCombatant(fighter("Defender"));
  const outcome = attackExchange(
    {
      attacker: makeCombatant(fighter("Attacker")),
      attackSkill: 14,
      damage: { dice: 1, adds: 2 },
      damageType: "cr",
      defender,
      defense: "none",
      dr: 2,
      coverDR: 5,
    },
    new Registry(),
    new ScriptedDice([10, 5]),
  );
  assert.equal(outcome.basicDamage, 7);
  assert.equal(outcome.damageResistance, 7);
  assert.equal(outcome.coverDRApplied, 5);
  assert.equal(outcome.penetrating, 0);
  assert.equal(outcome.injury, 0);
  const text = narrate(outcome, { attacker: "Attacker", defender: "Defender", attackLabel: "test gun", defense: "none" }).join("\n");
  assert.ok(text.includes("cover DR 5 (total DR 7)"), text);
});

test("the checked-in firearms script resolves cover, mph conversion, and cover clearing", () => {
  const script = readFileSync(new URL("fixtures/firearms-cover.txt", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const out = session(script);
  assert.ok(out.includes("Edge Case has cover DR 5; it adds to armor DR against hits (p. 29)."), out.join("\n"));
  assert.ok(out.some((l) => l.includes("target speed 30 mph = 15 yd/s")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("(effective 11):")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("cover DR 5 (total DR 5)")), out.join("\n"));
  assert.ok(out.includes("Edge Case has no cover."), out.join("\n"));
  assert.ok(!out.some((l) => l.startsWith("Unknown command")), out.join("\n"));
});

test("thrown parries are -1, or -2 at 1 lb. or less; melee parries are unchanged", () => {
  const r = new Registry();
  r.load(LITE_CORE);
  const c = fighter("Defender"); // Broadsword 11: ordinary Parry 8.
  assert.equal(thrownParryPenalty(), 0);
  assert.equal(thrownParryPenalty(4), -1);
  assert.equal(thrownParryPenalty(1), -2);
  assert.equal(thrownParryPenalty(0.5), -2);
  assert.equal(defenseScore(r, c, "parry", { parrySkillId: "broadsword" }), 8);
  assert.equal(defenseScore(r, c, "parry", { parrySkillId: "broadsword", thrownWeaponWeight: 4 }), 7);
  assert.equal(defenseScore(r, c, "parry", { parrySkillId: "broadsword", thrownWeaponWeight: 1 }), 6);
});

test("real thrown-weapon weights apply -2 to a knife and -1 to a throwing axe in the CLI", () => {
  const knife = session([
    "seed 5",
    "fight",
    "buy large knife",
    "foedefend parry",
    "shoot edge thrown-knife rng 3",
  ]);
  assert.ok(knife.some((l) => l.includes("Edge Case defends: parry 6 (-2: small thrown weapon)")), knife.join("\n"));

  const axe = session([
    "seed 5",
    "fight",
    "buy throwing axe",
    "foedefend parry",
    "shoot edge thrown-axe-mace rng 3 +5",
  ]);
  assert.ok(axe.some((l) => l.includes("Edge Case defends: parry 7 (-1: thrown weapon)")), axe.join("\n"));
});
