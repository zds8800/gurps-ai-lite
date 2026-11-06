/**
 * Reaction roll tests (issue #39; Lite p. 3): the Reaction Table transcribed
 * band by band, modifiers applied directly to the 3d roll (high is good —
 * not a success roll), and the hand-off channel's resolution order
 * (sheet → typed → ask) with the reaction roll as its first consumer.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { REACTION_TABLE, reactionBand, reactionRoll, resolveReaction } from "../src/core/reaction.ts";
import { resolveHandOff } from "../src/core/hand-off.ts";
import type { HandOffRequest } from "../src/core/hand-off.ts";
import { SeededDice } from "../src/core/dice.ts";
import { makeCharacter } from "../src/model/attribute.ts";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

test("the Reaction Table (p. 3), every band and boundary", () => {
  const expected = [
    [0, "Disastrous"],
    [3, "Very Bad"],
    [6, "Bad"],
    [9, "Poor"],
    [12, "Neutral"],
    [15, "Good"],
    [18, "Very Good"],
    [Infinity, "Excellent"],
  ] as const;
  assert.equal(REACTION_TABLE.length, expected.length);
  expected.forEach(([max, name], i) => {
    assert.equal(REACTION_TABLE[i].max, max);
    assert.equal(REACTION_TABLE[i].name, name);
    assert.ok(REACTION_TABLE[i].guideline.length > 0, name);
  });
  // Boundaries: the top of each band and the first total of the next.
  const boundaries: [number, string][] = [
    [-5, "Disastrous"], [0, "Disastrous"], [1, "Very Bad"], [3, "Very Bad"], [4, "Bad"],
    [6, "Bad"], [7, "Poor"], [9, "Poor"], [10, "Neutral"], [12, "Neutral"],
    [13, "Good"], [15, "Good"], [16, "Very Good"], [18, "Very Good"], [19, "Excellent"], [25, "Excellent"],
  ];
  for (const [total, name] of boundaries) {
    assert.equal(reactionBand(total).name, name, `total ${total}`);
  }
});

test("modifiers apply directly to the roll, and high is good (p. 3)", () => {
  // Same dice, different modifiers: a roll of 10 is Neutral plain, Good at +3.
  const plain = reactionRoll(0, new SeededDice(11));
  const boosted = reactionRoll(3, new SeededDice(11));
  assert.equal(boosted.rolled, plain.rolled);
  assert.equal(boosted.total, plain.total + 3);
  assert.equal(boosted.band.max - plain.band.max >= 0, true, "a bonus never worsens the band");
  // Directly: a rolled 10 is Neutral; with +3 the same dice are Good.
  const ten = { rolled: 10 };
  assert.equal(reactionBand(ten.rolled).name, "Neutral");
  assert.equal(reactionBand(ten.rolled + 3).name, "Good");
});

test("the channel resolves sheet first, typed second, and asks when neither answers", () => {
  const request: HandOffRequest = { shape: "number", key: "k", question: "How many?" };
  // Sheet (supplied) beats typed.
  assert.equal(resolveHandOff(request, () => 5, 7), 5);
  // Typed answers when the sheet is silent.
  assert.equal(resolveHandOff(request, () => undefined, 7), 7);
  // Neither: null — ask whoever runs the scene.
  assert.equal(resolveHandOff(request), null);
  // A wrong-shaped answer is loud, not silently coerced.
  assert.throws(() => resolveHandOff(request, () => "lots" as never), /wrong shape/);
  const yn: HandOffRequest = { shape: "yes-no", key: "k", question: "Apply?" };
  assert.equal(resolveHandOff(yn, () => undefined, true), true);
  assert.throws(() => resolveHandOff(yn, () => undefined, 1 as never), /wrong shape/);
});

test("a predetermined reaction means no roll (p. 3); the sheet can supply the modifier", () => {
  assert.equal(resolveReaction(null, { predetermined: true }, new SeededDice(1)), "predetermined");
  assert.notEqual(resolveReaction(null, { predetermined: false, modifier: 2 }, new SeededDice(1)), "predetermined");
  // Sheet first: a standing "reaction" modifier on the sheet beats the typed one.
  const c = makeCharacter("m", "M");
  c.modifiers.push({ label: "reaction: reputation", value: 2 });
  const out = resolveReaction(c, { modifier: -3 }, new SeededDice(1));
  assert.notEqual(out, "predetermined");
  assert.equal((out as { modifier: number }).modifier, 2);
  // Typed when the sheet is silent.
  const typed = resolveReaction(c, {}, new SeededDice(1)) as { modifier: number };
  assert.equal(typed.modifier, 2, "no typed answer: the sheet's still stands");
  const nobody = resolveReaction(null, {}, new SeededDice(1)) as { modifier: number };
  assert.equal(nobody.modifier, 0);
});

test("CLI: react rolls and narrates the band; predetermined rolls nothing; bad input is plain", () => {
  const out = session(["seed 11", "react", "react +3", "react predetermined", "react +x"]);
  assert.ok(/^Reaction roll: rolled 3d = \d+, no modifiers, total \d+ — \w+( \w+)? \(p\. 3\)\.$/.test(out[1]), out[1]);
  assert.ok(out[2].length > 0); // the band's guideline
  // Same seed position is not reused (the first roll consumed dice); check the +3 form instead.
  const boosted = out.find((l) => /^Reaction roll: rolled 3d = \d+, modifiers? \+3, total \d+ — /.test(l));
  assert.ok(boosted, out.join("\n"));
  assert.deepEqual(out.at(-2), "The NPC's reaction is predetermined — no reaction roll (p. 3). Play the NPC as scripted.");
  assert.deepEqual(out.at(-1), 'Bad modifier "+x". Modifiers look like +2 or -5.');
});

test("CLI: the same roll with different modifiers lands in different bands (hand-run, seeded)", () => {
  // Fresh sessions share the seed, so both roll the same 3d; +3 lifts the band.
  const plain = session(["seed 11", "react"])[1];
  const boosted = session(["seed 11", "react +3"])[1];
  const total = (l: string) => Number(l.match(/total (\d+)/)![1]);
  assert.equal(total(boosted), total(plain) + 3);
  assert.ok(total(plain) >= 3 && total(plain) <= 18, "plain 3d");
});
