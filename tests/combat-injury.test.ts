/**
 * Injury effects (issue #23; Lite pp. 29-30). Every threshold and penalty is
 * a printed rule: reeling and the consciousness roll from p. 29; shock, major
 * wounds, knockdown/stunning, mortal wounds and death from p. 30.
 */

import assert from "node:assert";
import test from "node:test";

import {
  applyInjury,
  canAct,
  consciousnessCheck,
  deathThresholdsCrossed,
  isMajorWound,
  isReeling,
  reelingDodge,
  shockPenalty,
  stunRecovery,
} from "../src/combat/injury.ts";
import { attackExchange, defenseScore, makeCombatant } from "../src/combat/attack.ts";
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

test("shock is the HP lost, stacking to a cap of -4 (p. 30)", () => {
  assert.equal(shockPenalty(0, 2), 2);
  assert.equal(shockPenalty(0, 4), 4);
  assert.equal(shockPenalty(0, 6), 4); // capped
  assert.equal(shockPenalty(3, 3), 4); // successive injuries stack, still capped
  assert.equal(shockPenalty(2, 0), 2); // no injury, no change
});

test("a major wound is a single injury greater than half your HP (p. 30)", () => {
  assert.equal(isMajorWound(11, 6), true); // 6 > 5.5
  assert.equal(isMajorWound(11, 5), false);
  assert.equal(isMajorWound(10, 5), false); // "greater than", not "or equal"
  assert.equal(isMajorWound(10, 6), true);
});

test("reeling starts below 1/3 HP and halves Dodge, rounding up (p. 29)", () => {
  assert.equal(isReeling(11, 3), true); // 3 < 11/3
  assert.equal(isReeling(11, 4), false);
  assert.equal(isReeling(10, 3), true);
  assert.equal(isReeling(10, 4), false); // 4 is not less than 3.33...
  assert.equal(reelingDodge(8), 4);
  assert.equal(reelingDodge(9), 5); // round up
});

test("death thresholds are the newly crossed negative multiples of HP (p. 30)", () => {
  assert.deepEqual(deathThresholdsCrossed(11, 5, -10), []); // not yet at -11
  assert.deepEqual(deathThresholdsCrossed(11, 5, -11), [1]); // the book's own example: roll at -11 HP
  assert.deepEqual(deathThresholdsCrossed(11, -11, -25), [2]); // already rolled at -11
  assert.deepEqual(deathThresholdsCrossed(11, 5, -25), [1, 2]); // one blow crosses two
});

test("a major wound stuns on a failed HT roll, knocks out on failure by 5+ or a crit (p. 30)", () => {
  const cases: [number, "ok" | "stunned" | "unconscious"][] = [
    [9, "ok"], // success
    [11, "stunned"], // failure by 1
    [14, "stunned"], // failure by 4
    [15, "unconscious"], // failure by 5
    [17, "unconscious"], // critical failure
  ];
  for (const [htRoll, want] of cases) {
    const victim = makeCombatant(fighter({ ST: 10, HT: 10 }));
    const fx = applyInjury(victim, 6, new ScriptedDice([htRoll]));
    assert.equal(fx.majorWound, true);
    assert.equal(victim.condition, want, `HT roll ${htRoll}`);
    assert.equal(victim.hp, 4);
    assert.equal(victim.shock, 4); // 6 HP lost, capped
  }
});

test("an ordinary wound sets shock but rolls nothing (p. 30)", () => {
  const victim = makeCombatant(fighter({ ST: 10 }));
  const fx = applyInjury(victim, 3, new ScriptedDice([])); // no rolls to consume
  assert.equal(victim.hp, 7);
  assert.equal(victim.shock, 3);
  assert.equal(fx.majorWound, false);
  assert.equal(victim.condition, "ok");
});

test("at -1xHP you roll HT or die; failure by 1-2 is a mortal wound (p. 30)", () => {
  // Injury 13 is also a major wound, so the first scripted roll is the
  // knockdown HT roll; the second is the death check.
  // Success: fights on, still needs consciousness rolls each turn.
  const survivor = makeCombatant(fighter({ ST: 10, HT: 10 }));
  survivor.hp = 2;
  applyInjury(survivor, 13, new ScriptedDice([9, 9])); // hp -11, both HT rolls succeed
  assert.equal(survivor.hp, -11);
  assert.equal(survivor.condition, "ok");

  // Failure by 1 or 2: mortally wounded, incapacitated.
  const mortal = makeCombatant(fighter({ ST: 10, HT: 10 }));
  mortal.hp = 2;
  const fxM = applyInjury(mortal, 13, new ScriptedDice([9, 12])); // death check failure by 2
  assert.equal(fxM.deathChecks[0].outcome, "mortal");
  assert.equal(mortal.condition, "mortally-wounded");
  assert.equal(canAct(mortal), false);

  // Failure by 3 or more: dead.
  const dead = makeCombatant(fighter({ ST: 10, HT: 10 }));
  dead.hp = 2;
  const fxD = applyInjury(dead, 13, new ScriptedDice([9, 13])); // death check failure by 3
  assert.equal(fxD.deathChecks[0].outcome, "died");
  assert.equal(dead.condition, "dead");
});

test("a failed death check while mortally wounded kills (p. 30)", () => {
  const victim = makeCombatant(fighter({ ST: 10, HT: 10 }));
  victim.hp = 2;
  applyInjury(victim, 13, new ScriptedDice([9, 11])); // mortal wound (death check failure by 1)
  assert.equal(victim.condition, "mortally-wounded");
  // The next wound crosses -2xHP; any failure on the new death check kills.
  const fx = applyInjury(victim, 10, new ScriptedDice([11]));
  assert.equal(fx.deathChecks[0].multiple, 2);
  assert.equal(fx.deathChecks[0].outcome, "died");
  assert.equal(victim.condition, "dead");
});

test("at -5xHP death is immediate, no roll (p. 30)", () => {
  const victim = makeCombatant(fighter({ ST: 10, HT: 10 }));
  victim.hp = 2;
  const fx = applyInjury(victim, 60, new ScriptedDice([9])); // [9] is the major-wound roll; death needs none
  assert.equal(fx.diedInstantly, true);
  assert.equal(fx.deathChecks.length, 0);
  assert.equal(victim.condition, "dead");
});

test("the consciousness roll is -1 per full multiple of HP below zero (p. 29)", () => {
  // hp -2 with HP 10: no full multiple below zero, plain HT roll.
  const a = makeCombatant(fighter({ ST: 10, HT: 10 }));
  a.hp = -2;
  const ca = consciousnessCheck(a, new ScriptedDice([10]));
  assert.equal(ca.modifier, 0);
  assert.equal(ca.stayedConscious, true);
  assert.equal(a.condition, "ok");

  // hp -12 with HP 10: one full multiple below zero, HT-1.
  const b = makeCombatant(fighter({ ST: 10, HT: 10 }));
  b.hp = -12;
  const cb = consciousnessCheck(b, new ScriptedDice([10])); // 10 vs effective 9
  assert.equal(cb.modifier, -1);
  assert.equal(cb.stayedConscious, false);
  assert.equal(b.condition, "unconscious");
  assert.equal(canAct(b), false);
});

test("stun recovery: end-of-turn HT roll shakes it off (p. 30)", () => {
  const victim = makeCombatant(fighter({ ST: 10, HT: 10 }));
  victim.condition = "stunned";
  const fail = stunRecovery(victim, new ScriptedDice([14]));
  assert.equal(fail.success, false);
  assert.equal(victim.condition, "stunned");
  const ok = stunRecovery(victim, new ScriptedDice([9]));
  assert.equal(ok.success, true);
  assert.equal(victim.condition, "ok");
});

test("shock penalizes the attacker's next roll and is then spent (p. 30)", () => {
  const r = registry();
  const attacker = makeCombatant(fighter({ ST: 12, DX: 12 }, "Attacker"));
  attacker.shock = 3;
  const defender = makeCombatant(fighter({ ST: 10 }, "Defender"));
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 1, adds: 0 },
      damageType: "cr",
      defender,
      defense: "none",
    },
    r,
    new ScriptedDice([12, 3]), // attack total, then the damage die
  );
  assert.equal(outcome.shockApplied, 3);
  assert.equal(outcome.attack.effectiveSkill, 11); // 14 - 3 shock
  assert.equal(attacker.shock, 0); // spent
  // Shock does not touch active defenses (p. 30): the defender's own shock is irrelevant here.
});

test("a reeling defender's Dodge is halved, round up (p. 29)", () => {
  const r = registry();
  const defender = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Reeling"));
  defender.hp = 3; // less than 1/3 of 10
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 1, adds: 0 },
      damageType: "cr",
      defender,
      defense: "dodge",
    },
    r,
    new ScriptedDice([10, 5, 2]), // attack, defense, damage
  );
  assert.equal(outcome.defenseScoreUsed, 4); // dodge 8 halved
  // 5 would have beaten the full dodge 8; against the halved 4 it fails.
  assert.ok(outcome.defense && !outcome.defense.success);
  assert.equal(outcome.hit, true);
});

test("a stunned defender rolls at -4 (p. 30)", () => {
  const r = registry();
  const defender = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Stunned"));
  defender.condition = "stunned";
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 1, adds: 0 },
      damageType: "cr",
      defender,
      defense: "dodge",
    },
    r,
    new ScriptedDice([10, 6, 2]), // attack, defense, damage
  );
  assert.equal(outcome.defenseStunned, true);
  assert.equal(outcome.defenseScoreUsed, 8);
  // Dodge 8 at -4 = effective 4; rolled 6 fails, so the hit lands.
  assert.equal(outcome.defense?.success, false);
  assert.equal(outcome.hit, true);
});

test("a defender at 0 HP must stay conscious before defending (p. 29)", () => {
  const r = registry();
  const defender = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Shaky"));
  defender.hp = 0;
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const setup = {
    attacker,
    attackSkill: 14,
    damage: { dice: 1, adds: 0 },
    damageType: "cr" as const,
    defender,
    defense: "dodge" as const,
  };
  // Fails the HT roll: unconscious, no defense, the hit lands.
  const out1 = attackExchange(setup, r, new ScriptedDice([10, 14, 2]));
  assert.equal(out1.defenderConsciousness?.stayedConscious, false);
  assert.equal(out1.defense, null);
  assert.equal(defender.condition, "unconscious");

  // Passes the HT roll: defends — but at 0 HP they are also reeling (p. 29),
  // so dodge 8 is halved to 4.
  const defender2 = makeCombatant(fighter({ ST: 10, DX: 10, HT: 10 }, "Steady"));
  defender2.hp = 0;
  const out2 = attackExchange({ ...setup, defender: defender2 }, r, new ScriptedDice([10, 9, 4, 2]));
  assert.equal(out2.defenderConsciousness?.stayedConscious, true);
  assert.equal(out2.defenseScoreUsed, 4);
  assert.equal(out2.defense?.success, true); // 4 vs halved dodge 4
  assert.equal(out2.hit, false);
});

test("an unconscious defender gets no defense roll (p. 30)", () => {
  const r = registry();
  const defender = makeCombatant(fighter({ ST: 10 }, "Out"));
  defender.condition = "unconscious";
  const attacker = makeCombatant(fighter({ ST: 12 }, "Attacker"));
  const outcome = attackExchange(
    {
      attacker,
      attackSkill: 14,
      damage: { dice: 1, adds: 0 },
      damageType: "cr",
      defender,
      defense: "dodge",
    },
    r,
    new ScriptedDice([10, 2]), // attack, damage — no defense roll consumed
  );
  assert.equal(outcome.defense, null);
  assert.equal(outcome.hit, true);
});

test("defenseScore halves Dodge for a reeling defender when asked (p. 29)", () => {
  const r = registry();
  const c = fighter({ DX: 10, HT: 10 }); // dodge 8
  assert.equal(defenseScore(r, c, "dodge", { reeling: true }), 4);
  assert.equal(defenseScore(r, c, "dodge", { reeling: true, shieldDB: 2 }), 6); // DB still adds
});
