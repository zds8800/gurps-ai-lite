/**
 * Aim and Accuracy (issue #33; Lite pp. 25-27): the Aim maneuver adds the
 * weapon's Acc to the next ranged Attack or All-Out Attack against the same
 * target, with +1 for a second second of aim, +2 for three or more, and +1
 * braced. Any attack spends the aim.
 */

import assert from "node:assert";
import test from "node:test";

import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

/** Mara (you) plus Edge Case and Thug, seeded. */
function threeWay(seed = 7): string[] {
  return [
    `seed ${seed}`,
    "load tests/fixtures/mara-voss.gcs",
    "foe tests/fixtures/edge-case.gcs",
    "foe tests/fixtures/thug.gcs",
  ];
}

test("aim then a shot at the aimed target adds the weapon's Acc (pp. 25-27)", () => {
  // Mara Brawling 11, 12 yd is -5, Acc 3: effective 9.
  const out = session(["seed 7", "fight", "aim edge acc 3", "shoot brawling dmg 1d+2 cr rng 12 half 20 max 100"]);
  assert.ok(
    out.some((l) => l === "Mara Voss aims at Edge Case (Acc 3): +3 on their next ranged attack against them (pp. 25-27)."),
    out.join("\n"),
  );
  assert.ok(out.some((l) => l.includes("(effective 9):")), out.join("\n"));
});

test("extra seconds of aim add +1 at two seconds, +2 at three (p. 27)", () => {
  const two = session(["seed 7", "fight", "aim edge acc 3", "aim edge acc 3", "shoot brawling dmg 1d+2 cr rng 2 half 20 max 100"]);
  assert.ok(
    two.some((l) => l === "Mara Voss aims at Edge Case (Acc 3, 2 seconds of aim): +4 on their next ranged attack against them (pp. 25-27)."),
    two.join("\n"),
  );
  assert.ok(two.some((l) => l.includes("(effective 15):")), two.join("\n"));

  const three = session([
    "seed 7", "fight", "aim edge acc 3", "aim edge acc 3", "aim edge acc 3",
    "shoot brawling dmg 1d+2 cr rng 2 half 20 max 100",
  ]);
  assert.ok(
    three.some((l) => l === "Mara Voss aims at Edge Case (Acc 3, 3 seconds of aim): +5 on their next ranged attack against them (pp. 25-27)."),
    three.join("\n"),
  );
  assert.ok(three.some((l) => l.includes("(effective 16):")), three.join("\n"));
});

test("bracing adds +1 on top of Acc (p. 27)", () => {
  const out = session(["seed 7", "fight", "aim edge acc 2 braced", "shoot brawling dmg 1d+2 cr rng 2 half 20 max 100"]);
  assert.ok(
    out.some((l) => l === "Mara Voss aims at Edge Case (Acc 2, braced): +3 on their next ranged attack against them (pp. 25-27)."),
    out.join("\n"),
  );
  assert.ok(out.some((l) => l.includes("(effective 14):")), out.join("\n"));
});

test("shooting a different target gets no bonus and spends the aim (pp. 25-26)", () => {
  const out = session([
    ...threeWay(),
    "aim edge acc 3",
    "shoot thug brawling dmg 1d+2 cr rng 2 half 20 max 100", // no bonus: not the aimed target
    "shoot edge brawling dmg 1d+2 cr rng 2 half 20 max 100", // aim already spent
  ]);
  const attacks = out.filter((l) => l.includes("attacks with Brawling"));
  assert.ok(attacks.length === 2 && attacks.every((l) => l.includes("(effective 11):")), out.join("\n"));
});

test("a melee attack after aiming gets no Acc bonus and spends the aim", () => {
  const out = session(["seed 7", "fight", "aim edge acc 3", "attack brawling"]);
  assert.ok(out.some((l) => l.includes("Brawling (1d-3 cr) (effective 11):")), out.join("\n"));
});

test("Move and Attack does not benefit from aim (p. 25)", () => {
  const out = session(["seed 7", "fight", "aim edge acc 3", "shoot brawling dmg 1d+2 cr rng 2 half 20 max 100 moveattack"]);
  assert.ok(out.some((l) => l.includes("(effective 7):")), out.join("\n"));
});

test("npc fighters can aim and get the bonus on their shot", () => {
  const out = session([
    ...threeWay(),
    "npc edge aim mara acc 2",
    "npc edge shoot broadsword dmg 1d+1 cut rng 5 half 10 max 20",
    "order",
  ]);
  assert.ok(
    out.some((l) => l === "Edge Case aims at Mara Voss (Acc 2): +2 on their next ranged attack against them (pp. 25-27)."),
    out.join("\n"),
  );
  // Broadsword 11, 5 yd is -2, Acc 2: effective 11.
  assert.ok(out.some((l) => l.includes("(effective 11):")), out.join("\n"));
  assert.ok(out.some((l) => l.includes("Edge Case aim")), out.join("\n"));
});

test("aim needs its Acc; bad input is refused plainly", () => {
  const out = session(["fight", "aim edge", "aim edge acc 0"]);
  assert.deepEqual(out.slice(-2), [
    "Usage: aim [<target>] acc <n> [braced]  (Aim, pp. 25-26)",
    'Bad Acc "0". Accuracy is a whole number, 1 or more.',
  ]);
});
