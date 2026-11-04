/**
 * SeededDice determinism (acceptance check: a fixed seed gives the same
 * sequence on every run, and a saved state resumes it).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { SeededDice } from "../src/index.ts";

test("a fixed seed repeats the same sequence", () => {
  const a = new SeededDice(12345);
  const b = new SeededDice(12345);
  for (let i = 0; i < 1000; i++) {
    assert.equal(a.roll3d(), b.roll3d());
  }
});

test("getState/setState resumes a run exactly", () => {
  const run = new SeededDice(999);
  const expected: number[] = [];
  for (let i = 0; i < 150; i++) expected.push(run.roll3d());

  const interrupted = new SeededDice(999);
  const actual: number[] = [];
  for (let i = 0; i < 100; i++) actual.push(interrupted.roll3d());
  const saved = interrupted.getState();

  const resumed = new SeededDice(0);
  resumed.setState(saved);
  for (let i = 0; i < 50; i++) actual.push(resumed.roll3d());

  assert.deepEqual(actual, expected);
});

test("split streams are deterministic and independent", () => {
  const a1 = new SeededDice(42).split(4).map((d) => d.roll3d());
  const a2 = new SeededDice(42).split(4).map((d) => d.roll3d());
  assert.deepEqual(a1, a2);
  assert.equal(new Set(a1).size > 1, true);
});

test("every total stays inside 3 to 18 and every d6 inside 1 to 6", () => {
  const dice = new SeededDice(7);
  for (let i = 0; i < 10000; i++) {
    const t = dice.roll3d();
    assert.ok(t >= 3 && t <= 18, `total ${t} out of range`);
    const d = dice.d6();
    assert.ok(d >= 1 && d <= 6, `d6 ${d} out of range`);
  }
});
