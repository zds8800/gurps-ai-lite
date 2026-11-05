/**
 * Maneuvers and their defense interactions (issue #27; Lite pp. 25, 27-29):
 * All-Out Attack, All-Out Defense, Move and Attack, the once-per-turn Block
 * and Parry limits, and maximum damage on a critical roll of 3.
 */

import assert from "node:assert";
import test from "node:test";

import {
  attackExchange,
  bestLegalDefense,
  defenseBlocked,
  makeCombatant,
} from "../src/combat/attack.ts";
import type { Combatant, DefenseChoice, Maneuver } from "../src/combat/attack.ts";
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

/** A defender with a trained parry (Brawling at DX+0) so all three defenses exist. */
function defender(opts: { maneuver?: Maneuver; dx?: number } = {}): Combatant {
  const c = makeCombatant(fighter({ ST: 10, DX: opts.dx ?? 10, HT: 10 }, "Defender"));
  c.character.skills.push({ skillId: "brawling", points: 1, specialization: null }); // DX+0
  if (opts.maneuver) c.maneuver = opts.maneuver;
  return c;
}

function exchange(opts: {
  attackTotal: number;
  defenseRolls?: number[];
  damageDice?: number[];
  defender?: Combatant;
  defense?: DefenseChoice;
}) {
  const r = registry();
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const def = opts.defender ?? defender();
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 1, adds: 2 }, // 1d+2: the book's max-damage example
      damageType: "cut",
      defender: def,
      defense: opts.defense ?? "dodge",
      defenseContext: { parrySkillId: "brawling" },
    },
    r,
    new ScriptedDice([opts.attackTotal, ...(opts.defenseRolls ?? []), ...(opts.damageDice ?? [])]),
  );
  return { outcome, attacker, defender: def };
}

test("a critical hit on a roll of 3 does maximum damage, no damage roll (p. 27)", () => {
  // Book example: "maximum damage for a 1d+2 blow would be 6+2, or 8 points."
  // Cut on 10 HP: injury 12, a major wound — the one scripted roll is its HT roll.
  const { outcome } = exchange({ attackTotal: 3, defenseRolls: [9] });
  assert.equal(outcome.maxDamageCrit, true);
  assert.equal(outcome.basicDamage, 8);
  assert.equal(outcome.penetrating, 8);
  assert.equal(outcome.injury, 12); // 8 x 1.5 cut
});

test("a critical hit on a 4 skips the defense but rolls damage normally (p. 27)", () => {
  // No defense roll happens, so the scripted order is: attack, damage die,
  // then the major-wound HT roll (injury 7 on 10 HP is a major wound).
  const { outcome } = exchange({ attackTotal: 4, damageDice: [3, 9] });
  assert.equal(outcome.maxDamageCrit, false);
  assert.equal(outcome.basicDamage, 5); // rolled 3 + 2
});

test("Block and Parry are once per turn; Dodge is not (p. 28)", () => {
  const def = defender();
  // First attack: parry works. Parry at DX 10 +0 = 3 + 5 = 8; rolled 6 succeeds.
  const first = exchange({ attackTotal: 10, defenseRolls: [6], defender: def, defense: "parry" });
  assert.equal(first.outcome.defenseChoiceUsed, "parry");
  assert.equal(first.outcome.hit, false);
  assert.equal(def.parriesUsed, 1);
  // Second attack in the same turn: parry is spent, so the defender falls
  // back to their best legal defense with the reason recorded.
  const second = exchange({ attackTotal: 10, defenseRolls: [6, 5], defender: def, defense: "parry" });
  assert.equal(second.outcome.defenseFallback, "already parried this turn");
  assert.equal(second.outcome.defenseChoiceUsed, "dodge");
  // A third attack: dodge again — dodge has no per-turn limit.
  const third = exchange({ attackTotal: 10, defenseRolls: [12, 6, 5], defender: def, defense: "dodge" });
  assert.equal(third.outcome.defenseFallback, null);
  assert.equal(third.outcome.defenseChoiceUsed, "dodge");
});

test("All-Out Attack leaves the attacker no defense at all (p. 29 table)", () => {
  const def = defender({ maneuver: { kind: "all-out-attack", option: "determined" } });
  // No defense roll; scripted: attack, damage die, major-wound HT roll.
  const { outcome } = exchange({ attackTotal: 10, defense: "dodge", damageDice: [4, 9], defender: def });
  assert.equal(outcome.defense, null);
  assert.equal(outcome.defenseFallback, "all-out attack — no defense possible");
  assert.equal(outcome.hit, true);
});

test("after Move and Attack you can dodge or block but cannot parry (pp. 25, 29)", () => {
  const def = defender({ maneuver: { kind: "move-and-attack" } });
  assert.equal(defenseBlocked(def, "parry"), "cannot parry after Move and Attack");
  assert.equal(defenseBlocked(def, "dodge"), null);
  assert.equal(defenseBlocked(def, "block"), null);
  const { outcome } = exchange({ attackTotal: 10, defense: "parry", defenseRolls: [6, 5], defender: def });
  assert.equal(outcome.defenseFallback, "cannot parry after Move and Attack");
  assert.equal(outcome.defenseChoiceUsed, "dodge");
});

test("All-Out Defense (Increased) adds +2 to the named defense (p. 25)", () => {
  const def = defender({ maneuver: { kind: "all-out-defense", option: "increased", defense: "dodge" } });
  // Dodge 8 + 2 = effective 10; a roll of 9 succeeds where plain dodge 8 fails.
  const { outcome } = exchange({ attackTotal: 10, defense: "dodge", defenseRolls: [9], defender: def });
  assert.equal(outcome.defenseIncreased, true);
  assert.equal(outcome.defense?.success, true);
  assert.equal(outcome.hit, false);
});

test("All-Out Defense (Double) allows a second, different defense when the first fails (p. 25)", () => {
  const def = defender({ maneuver: { kind: "all-out-defense", option: "double" } });
  // Dodge 8 fails on 12; the second defense is the best other one — block 6 or
  // parry 8; bestLegalDefense picks parry 8, which succeeds on a 7.
  const { outcome } = exchange({ attackTotal: 10, defense: "dodge", defenseRolls: [12, 7], defender: def });
  assert.equal(outcome.defense?.success, false);
  assert.equal(outcome.defense2?.choice, "parry");
  assert.equal(outcome.defense2?.roll.success, true);
  assert.equal(outcome.hit, false);
  assert.equal(def.parriesUsed, 1); // the second defense still counts (p. 28)
});

test("bestLegalDefense counts the Increased bonus and skips spent defenses", () => {
  const r = registry();
  const def = defender({ maneuver: { kind: "all-out-defense", option: "increased", defense: "block" } });
  // Block 6 + 2 = 8 ties dodge 8 and parry 8; parry (last, highest) wins ties
  // by order of evaluation only when strictly higher, so dodge 8 stands.
  const best = bestLegalDefense(r, def, { parrySkillId: "brawling" });
  assert.ok(best !== null && best.score === 8);
  def.parriesUsed = 1;
  def.blocksUsed = 1;
  const after = bestLegalDefense(r, def, { parrySkillId: "brawling" });
  assert.deepEqual(after, { choice: "dodge", score: 8 });
});
