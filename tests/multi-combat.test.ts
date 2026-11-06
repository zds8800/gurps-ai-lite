/**
 * Multiple combatants (issue #31): the fight is a roster, not two sides.
 * Loading several fighters, targeting by name, per-fighter defense policies,
 * the npc action dispatcher, and turn advancement.
 */

import assert from "node:assert";
import test from "node:test";

import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

/** Mara (you) plus Edge Case and Thug: a three-fighter roster. */
function threeWay(seed = 7): string[] {
  return [
    `seed ${seed}`,
    "load tests/fixtures/mara-voss.gcs",
    "foe tests/fixtures/edge-case.gcs",
    "foe tests/fixtures/thug.gcs",
  ];
}

test("loading a second foe adds them to the same fight", () => {
  const out = session([...threeWay(), "order"]);
  assert.ok(out.some((l) => l.startsWith("Edge Case loaded as your foe")));
  assert.ok(out.some((l) => l.startsWith("Thug joins the fight (HP 12)")));
  // Speed 5.5, 5.5 (DX tie, input order), 5.0; order marks who is to act.
  assert.ok(
    out.some((l) => l === "Turn order by Basic Speed (p. 24): Mara Voss, Thug, Edge Case — Mara Voss to act."),
    out.join("\n"),
  );
});

test("with several foes an untargeted attack asks whom", () => {
  const out = session([...threeWay(), "attack brawling"]);
  assert.deepEqual(out.at(-1), "Attack whom? Name the target first — fighters: Edge Case, Thug.");
});

test("attacks name their target; the target defends, not the bystander", () => {
  const out = session([...threeWay(), "attack thug brawling"]);
  assert.ok(out.some((l) => /^Mara Voss attacks with Brawling/.test(l)), out.join("\n"));
  assert.ok(out.some((l) => /^Thug defends: /.test(l)), out.join("\n"));
  assert.ok(!out.some((l) => /^Edge Case defends: /.test(l)), out.join("\n"));
});

test("npc <name> attack aims at you by default, or at a named fighter", () => {
  const atYou = session([...threeWay(), "npc edge attack broadsword dmg 1d+1 cut"]);
  assert.ok(atYou.some((l) => /^Edge Case attacks with Melee Weapon: Broadsword/.test(l)), atYou.join("\n"));
  assert.ok(atYou.some((l) => /^Mara Voss defends: /.test(l)), atYou.join("\n"));

  const atThug = session([...threeWay(), "npc edge attack thug broadsword dmg 1d+1 cut"]);
  assert.ok(atThug.some((l) => /^Edge Case attacks with Melee Weapon: Broadsword/.test(l)), atThug.join("\n"));
  assert.ok(atThug.some((l) => /^Thug defends: /.test(l)), atThug.join("\n"));
});

test("defense policies are per fighter", () => {
  const out = session([...threeWay(), "npc thug defend dodge", "attack thug brawling", "order"]);
  assert.ok(out.some((l) => l === "Thug will dodge (dodge 8) until you change it."), out.join("\n"));
  assert.ok(out.some((l) => /^Thug defends: dodge 8/.test(l)), out.join("\n"));
  assert.ok(out.some((l) => l === "Defenses: Mara Voss best, Edge Case best, Thug dodge."), out.join("\n"));
});

test("maneuver restrictions are per fighter: one all-out attacker, the other still defends", () => {
  const out = session([
    ...threeWay(3), // seed 3: Mara's punch at Edge Case connects
    "npc edge allout determined thug broadsword dmg 1d-2 cr", // tiny damage: no major wound
    "attack edge brawling",
    "attack thug brawling",
  ]);
  assert.ok(
    out.some((l) => l === "Edge Case cannot defend: all-out attack — no defense possible (pp. 28-29)."),
    out.join("\n"),
  );
  assert.ok(out.some((l) => /^Thug defends: /.test(l)), out.join("\n"));
});

test("the foe… shorthands say to use npc when several fighters are in play", () => {
  const out = session([...threeWay(), "foeattack brawling"]);
  assert.deepEqual(out.at(-1), "Several fighters are in play — name one: npc <name> <attack|shoot|allout|moveattack|aim|defend|alloutdefense|donothing> ...");
});

test("a fighter whose name is taken is refused", () => {
  const out = session([
    "load tests/fixtures/mara-voss.gcs",
    "foe tests/fixtures/edge-case.gcs",
    "foe tests/fixtures/edge-case.gcs",
  ]);
  assert.ok(out.some((l) => l === "A fighter named Edge Case is already in the fight. Rename the sheet and load again."));
});

test("next advances through every fighter in Basic Speed order and wraps (p. 24)", () => {
  const out = session([...threeWay(), "next", "next", "next"]);
  const turns = out.filter((l) => l.startsWith("It is now "));
  assert.deepEqual(turns, [
    "It is now Thug's turn (p. 24).",
    "It is now Edge Case's turn (p. 24).",
    "It is now Mara Voss's turn (p. 24).",
  ]);
});

test("no fighter by that name says who is in the fight", () => {
  const out = session([...threeWay(), "npc nobody attack brawling"]);
  assert.deepEqual(out.at(-1), 'No fighter named "nobody attack brawling". Fighters: Mara Voss, Edge Case, Thug.');
});
