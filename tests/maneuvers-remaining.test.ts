/**
 * Remaining Lite maneuvers (issue #43): Change Posture and its table (p. 25),
 * Ready including two-handed weapons and Shots (pp. 19-20, 26), and
 * Concentrate with its Will-3 distraction check (p. 26).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { makeSoloState, runCommand } from "../src/cli/solo.ts";
import { ScriptedDice } from "../src/core/dice.ts";
import { parseShots } from "../src/model/equipment.ts";
import { parsePosture, POSTURE_TABLE, postureChangeError } from "../src/combat/posture.ts";

function demo() {
  const state = makeSoloState();
  runCommand(state, "fight");
  return state;
}

test("the Posture Table matches p. 25, including every modifier boundary", () => {
  assert.deepEqual(POSTURE_TABLE, {
    standing: { attack: 0, defense: 0, target: 0, movement: "Normal; may sprint" },
    crouching: { attack: -2, defense: 0, target: -2, movement: "2/3" },
    kneeling: { attack: -2, defense: -2, target: -2, movement: "1/3" },
    crawling: { attack: -4, defense: -3, target: -2, movement: "1/3" },
    sitting: { attack: -2, defense: -2, target: -2, movement: "None" },
    lying: { attack: -4, defense: -3, target: -2, movement: "1 yard/second" },
  });
  assert.equal(parsePosture("prone"), "lying");
  assert.equal(parsePosture("lying down"), "lying");
  assert.equal(parsePosture("crouch"), "crouching");
  assert.equal(parsePosture("standing"), "standing");
  assert.equal(parsePosture("floating"), null);
});

test("kneeling gives the attacker -2 to melee and the defender -2 to active defense", () => {
  const attacker = demo();
  const posture = runCommand(attacker, "posture kneeling");
  assert.ok(posture[0].includes("melee attack -2, active defense -2, ranged target -2"));
  attacker.dice = new ScriptedDice([18]);
  const attack = runCommand(attacker, "attack edge brawling dmg 1d-3 cr vs none");
  assert.ok(attack[0].includes("(effective 9)"), attack.join("\n")); // Brawling 11 - 2
  assert.equal(attacker.combat!.you.combatant.maneuver.kind, "attack");
  assert.ok(runCommand(attacker, "order").some((l) => l.includes("Mara Voss kneeling")));

  const defender = demo();
  runCommand(defender, "npc edge posture kneeling");
  defender.dice = new ScriptedDice([10, 3]);
  const defense = runCommand(defender, "attack edge brawling dmg 1d-3 cr");
  assert.ok(defense.some((l) => l.startsWith("Edge Case defends: dodge 6,")), defense.join("\n")); // Dodge 8 - 2
});

test("a crouching ranged target is -2 to hit, without changing its defense score", () => {
  const state = demo();
  runCommand(state, "npc edge posture crouching");
  state.dice = new ScriptedDice([18]);
  const out = runCommand(state, "shoot edge thrown-knife dmg 1d imp rng 5 half 10 max 20 vs none");
  // Thrown Knife 12, range 5 yd -2, crouching target -2.
  assert.ok(out[0].includes("(effective 8)"), out.join("\n"));
  assert.equal(POSTURE_TABLE.crouching.defense, 0);
});

test("lying cannot rise directly to standing; knockdown leaves the victim lying", () => {
  const state = demo();
  runCommand(state, "posture lying");
  const refusal = runCommand(state, "posture standing");
  assert.ok(refusal[0].includes("cannot stand up directly"));
  assert.ok(refusal[0].includes("crawling, kneeling or sitting"));
  assert.equal(state.combat!.you.combatant.posture, "lying");
  runCommand(state, "posture kneeling");
  assert.equal(state.combat!.you.combatant.posture, "kneeling");
  assert.equal(postureChangeError("lying", "standing") !== null, true);
  assert.equal(postureChangeError("kneeling", "standing"), null);

  const wounded = demo();
  runCommand(wounded, "defend dodge");
  wounded.dice = new ScriptedDice([10, 11, 4, 13]); // hit, failed Dodge, 4 basic, failed major-wound HT
  runCommand(wounded, "foeattack broadsword dmg 1d+1 cut");
  assert.equal(wounded.combat!.you.combatant.condition, "stunned");
  assert.equal(wounded.combat!.you.combatant.posture, "lying");
});

test("the Shots column parses full, individual and thrown reloads exactly", () => {
  assert.deepEqual(parseShots("8+1(3)"), { count: 9, reloadSeconds: 3, perShot: false, thrown: false });
  assert.deepEqual(parseShots("2(3i)"), { count: 2, reloadSeconds: 3, perShot: true, thrown: false });
  assert.deepEqual(parseShots("T(1)"), { count: 1, reloadSeconds: 1, perShot: false, thrown: true });
  assert.equal(parseShots("not shots"), null);
});

test("a double-dagger weapon is unready after attacking until Ready; 1.5x ST removes that penalty", () => {
  const state = demo();
  runCommand(state, "buy poleaxe"); // min ST 12, double-dagger; Mara has ST 10
  state.dice = new ScriptedDice([18]);
  runCommand(state, "attack edge polearm vs none");
  assert.equal(state.combat!.you.combatant.meleeUnready, "Poleaxe");
  const refusal = runCommand(state, "attack edge polearm vs none");
  assert.ok(refusal[0].includes("unready after your last attack"));
  const ready = runCommand(state, "ready");
  assert.ok(ready[0].includes("readies the Poleaxe again"));
  assert.equal(state.combat!.you.combatant.meleeUnready, undefined);
  assert.equal(state.combat!.you.combatant.maneuver.kind, "ready");

  const strong = demo();
  runCommand(strong, "set ST 18"); // ceil(1.5 x 12): no double-dagger unready penalty
  runCommand(strong, "buy poleaxe");
  strong.dice = new ScriptedDice([18]);
  runCommand(strong, "attack edge polearm vs none");
  assert.equal(strong.combat!.you.combatant.meleeUnready, undefined);
});

test("a shield and two-handed weapon give the ST 1.5x/2x choices and a clear fix", () => {
  const state = demo();
  runCommand(state, "buy quarterstaff"); // dagger, min ST 7
  runCommand(state, "buy small shield");
  const refusal = runCommand(state, "attack edge staff vs none");
  assert.ok(refusal[0].includes("ST 11 (unready after attacking) or ST 14 (no penalty)"), refusal.join("\n"));
  assert.ok(refusal[0].includes("ready shield none"));

  runCommand(state, "set ST 11");
  state.dice = new ScriptedDice([18]);
  runCommand(state, "attack edge staff vs none");
  assert.equal(state.combat!.you.combatant.meleeUnready, "Quarterstaff");

  const noShield = demo();
  runCommand(noShield, "buy quarterstaff");
  runCommand(noShield, "buy small shield");
  runCommand(noShield, "ready shield none");
  assert.equal(noShield.character!.readyShield, undefined);
  noShield.dice = new ScriptedDice([18]);
  runCommand(noShield, "attack edge staff vs none");
  assert.equal(noShield.combat!.you.combatant.meleeUnready, undefined);
});

test("shots decrement, an empty gun refuses the shot, and (3) reloads all shots after three Ready turns", () => {
  const state = demo();
  runCommand(state, "tl 8");
  runCommand(state, "buy auto pistol, 9mm"); // 8+1(3): 9 shots, 3 seconds for a full reload
  state.dice = new ScriptedDice([18]);
  runCommand(state, "shoot edge guns rng 10 vs none");
  assert.equal(state.combat!.you.combatant.shotsLeft, 8);

  state.combat!.you.combatant.shotsLeft = 0;
  const empty = runCommand(state, "shoot edge guns rng 10 vs none");
  assert.ok(empty[0].includes("empty"));
  assert.ok(empty[0].includes("3 Ready seconds"));
  assert.equal(state.combat!.you.combatant.shotsLeft, 0);

  assert.ok(runCommand(state, "ready")[0].includes("2 second(s) remain"));
  assert.ok(runCommand(state, "ready")[0].includes("1 second(s) remain"));
  assert.ok(runCommand(state, "ready")[0].includes("9 shots ready"));
  assert.equal(state.combat!.you.combatant.shotsLeft, 9);
  assert.equal(state.combat!.you.combatant.readyTask, undefined);
});

test("(3i) reloads one shot per three Ready turns, then continues to the next", () => {
  const state = demo();
  runCommand(state, "tl 8");
  runCommand(state, "buy derringer, .41"); // 2(3i)
  state.combat!.you.combatant.shotsLeft = 0;
  runCommand(state, "ready");
  runCommand(state, "ready");
  const first = runCommand(state, "ready");
  assert.ok(first[0].includes("1/2 ready"));
  assert.equal(state.combat!.you.combatant.shotsLeft, 1);
  assert.equal(state.combat!.you.combatant.readyTask?.secondsLeft, 3);
  runCommand(state, "ready");
  runCommand(state, "ready");
  const second = runCommand(state, "ready");
  assert.ok(second[0].includes("2/2 shots ready"));
  assert.equal(state.combat!.you.combatant.shotsLeft, 2);
  assert.equal(state.combat!.you.combatant.readyTask, undefined);
});

test("T(1): a thrown weapon leaves your hand after the attack", () => {
  const state = demo();
  runCommand(state, "buy large knife");
  assert.equal(state.character!.readyMelee, "Large Knife");
  assert.equal(state.character!.readyRanged, "Large Knife (thrown)");
  state.dice = new ScriptedDice([18]);
  runCommand(state, "shoot edge thrown-knife rng 5 vs none");
  assert.equal(state.character!.readyMelee, undefined);
  assert.equal(state.character!.readyRanged, undefined);
  assert.equal(state.combat!.you.combatant.shotsLeft, null);
});

test("Concentrate takes the stated seconds and rolls only when the task finishes", () => {
  const state = demo();
  const begin = runCommand(state, "concentrate IQ secs 3");
  assert.ok(begin[0].includes("2 second(s) remain"));
  assert.equal(state.combat!.you.combatant.concentration?.secondsLeft, 2);
  state.dice = new ScriptedDice([9]);
  assert.ok(runCommand(state, "concentrate")[0].includes("1 second(s) remain"));
  assert.equal(state.dice.remaining, 1);
  const finish = runCommand(state, "concentrate");
  assert.ok(finish.some((l) => l === "Rolled 3d: 9."));
  assert.ok(finish.some((l) => l.includes("Success by 3. Concentration complete."))); // Mara IQ 12
  assert.equal(state.combat!.you.combatant.concentration, undefined);
  assert.equal(state.dice.remaining, 0);
});

test("an active defense forces Will-3; failure loses the Concentrate task", () => {
  const state = demo();
  runCommand(state, "concentrate IQ secs 3");
  runCommand(state, "defend dodge");
  state.dice = new ScriptedDice([10, 8, 18]); // attack hits skill, Dodge succeeds, Will-3 fails
  const out = runCommand(state, "foeattack broadsword dmg 1d+1 cut");
  assert.ok(out.some((l) => l.includes("The attack is turned aside.")));
  assert.ok(out.some((l) => l.includes("Will-3 (effective 9), rolled 18 — failure by 9")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("concentration is lost and the task must start over")));
  assert.equal(state.combat!.you.combatant.concentration, undefined);
  assert.equal(state.dice.remaining, 0);

  const holds = demo();
  runCommand(holds, "concentrate IQ secs 3");
  runCommand(holds, "defend dodge");
  holds.dice = new ScriptedDice([10, 8, 9]);
  const held = runCommand(holds, "foeattack broadsword dmg 1d+1 cut");
  assert.ok(held.some((l) => l.includes("concentration holds")));
  assert.equal(holds.combat!.you.combatant.concentration?.secondsLeft, 2);
});

test("another maneuver abandons multi-second Concentrate or Ready work", () => {
  const state = demo();
  runCommand(state, "concentrate IQ secs 3");
  runCommand(state, "posture kneeling");
  assert.equal(state.combat!.you.combatant.concentration, undefined);

  runCommand(state, "tl 8");
  runCommand(state, "buy auto pistol, 9mm");
  state.combat!.you.combatant.shotsLeft = 0;
  runCommand(state, "ready");
  assert.equal(state.combat!.you.combatant.readyTask?.secondsLeft, 2);
  runCommand(state, "donothing");
  assert.equal(state.combat!.you.combatant.readyTask, undefined);
});
