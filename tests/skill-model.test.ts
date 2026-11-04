/**
 * Model-layer tests: the printed cost ladder, buy-as-written validation with
 * round-up/round-down, defaults with the Rule of 20, and the section F cases
 * (T077-T098) driven end-to-end through character + skill -> resolve().
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  baseSkillLevel,
  findSkill,
  makeCharacter,
  pointsToRelativeLevel,
  pointTotal,
  derivedTraits,
  resolve,
  ScriptedDice,
} from "../src/index.ts";
import type { AttributeId, Character, Critical, SkillDef } from "../src/index.ts";

function skill(id: string): SkillDef {
  const s = findSkill(id);
  assert.ok(s, `skill ${id} missing from the Lite list`);
  return s;
}

function character(attrs: Partial<Record<AttributeId, number>>): Character {
  const c = makeCharacter("t", "Tester");
  Object.assign(c.attributes, attrs);
  return c;
}

test("points-to-level matches the printed table (p. 13)", () => {
  const easy: [number, number][] = [[1, 0], [2, 1], [4, 2], [8, 3], [12, 4], [16, 5]];
  const average: [number, number][] = [[1, -1], [2, 0], [4, 1], [8, 2], [12, 3], [16, 4]];
  const hard: [number, number][] = [[1, -2], [2, -1], [4, 0], [8, 1], [12, 2], [16, 3]];
  for (const [pts, rel] of easy) assert.equal(pointsToRelativeLevel(pts, "E"), rel);
  for (const [pts, rel] of average) assert.equal(pointsToRelativeLevel(pts, "A"), rel);
  for (const [pts, rel] of hard) assert.equal(pointsToRelativeLevel(pts, "H"), rel);
});

test("buy as written: unprinted totals are rejected with the valid choices named", () => {
  assert.throws(
    () => pointsToRelativeLevel(3, "A"),
    (e: Error) =>
      e.message.includes("not a purchasable cost") &&
      e.message.includes("2 points (Attribute+0)") &&
      e.message.includes("4 points (Attribute+1)") &&
      e.message.includes('"round-down"') &&
      e.message.includes('"round-up"'),
  );
  assert.throws(() => pointsToRelativeLevel(0, "E"), /positive whole number/);
});

test("round-down and round-up pick the nearest printed rung", () => {
  assert.equal(pointsToRelativeLevel(3, "A", "round-down"), 0);
  assert.equal(pointsToRelativeLevel(3, "A", "round-up"), 1);
  assert.equal(pointsToRelativeLevel(5, "E", "round-down"), 2); // 4 points -> Attr+2
  assert.equal(pointsToRelativeLevel(5, "E", "round-up"), 3); // 8 points -> Attr+3
});

test("attribute costs and point total", () => {
  const c = character({ ST: 12, DX: 11 });
  c.skills.push({ skillId: "stealth", points: 2, specialization: null });
  assert.equal(pointTotal(c), 20 + 20 + 2); // ST 12 = 20, DX 11 = 20, skill = 2
  assert.deepEqual(derivedTraits(c.attributes), { Will: 10, Per: 10 });
});

interface FCase {
  tid: string;
  attrs: Partial<Record<AttributeId, number>>;
  skillId: string;
  points?: number;
  mods?: number[];
  expectedSkill: number | null; // null: no usable skill at all
  roll: number;
  success?: boolean;
  critical?: Critical;
  margin?: number;
}

// Section F of tests/success-roll-cases.md, with the inputs the tables name.
const F_CASES: FCase[] = [
  { tid: "T077", attrs: { IQ: 12 }, skillId: "lockpicking", expectedSkill: 7, roll: 7, success: true, critical: "none", margin: 0 },
  { tid: "T078", attrs: { IQ: 12 }, skillId: "lockpicking", expectedSkill: 7, roll: 8, success: false, critical: "none", margin: 1 },
  { tid: "T079", attrs: { DX: 12 }, skillId: "acrobatics", expectedSkill: 6, roll: 6, success: true, critical: "none", margin: 0 },
  { tid: "T080", attrs: { IQ: 10 }, skillId: "area-knowledge", expectedSkill: 6, roll: 6, success: true, critical: "none", margin: 0 },
  { tid: "T081", attrs: { DX: 10 }, skillId: "acrobatics", expectedSkill: 4, roll: 4, success: true, critical: "success", margin: 0 },
  { tid: "T082", attrs: { DX: 10 }, skillId: "acrobatics", mods: [-2], expectedSkill: 4, roll: 3 }, // effective 2: cannot attempt
  { tid: "T083", attrs: { IQ: 10 }, skillId: "lockpicking", mods: [10], expectedSkill: 5, roll: 5, success: true, critical: "success", margin: 10 },
  { tid: "T084", attrs: { IQ: 8 }, skillId: "diplomacy", expectedSkill: 2, roll: 3 }, // cannot attempt
  { tid: "T085", attrs: { IQ: 9 }, skillId: "diplomacy", expectedSkill: 3, roll: 3, success: true, critical: "success", margin: 0 },
  { tid: "T086", attrs: { IQ: 25 }, skillId: "lockpicking", expectedSkill: 15, roll: 5, success: true, critical: "success", margin: 10 },
  { tid: "T087", attrs: { IQ: 25 }, skillId: "lockpicking", expectedSkill: 15, roll: 16, success: false, critical: "none", margin: 1 },
  { tid: "T088", attrs: { DX: 12 }, skillId: "broadsword", expectedSkill: 7, roll: 7, success: true, critical: "none", margin: 0 },
  { tid: "T089", attrs: { DX: 12 }, skillId: "knife", expectedSkill: 8, roll: 9, success: false, critical: "none", margin: 1 },
  { tid: "T090", attrs: { DX: 12 }, skillId: "flail", expectedSkill: 6, roll: 6, success: true, critical: "none", margin: 0 },
  { tid: "T091", attrs: { HT: 10 }, skillId: "sex-appeal", expectedSkill: 7, roll: 7, success: true, critical: "none", margin: 0 },
  { tid: "T092", attrs: { DX: 10 }, skillId: "throwing", expectedSkill: 7, roll: 8, success: false, critical: "none", margin: 1 },
  { tid: "T093", attrs: { IQ: 12 }, skillId: "physician", expectedSkill: 5, roll: 5, success: true, critical: "none", margin: 0 },
  { tid: "T094", attrs: { DX: 12 }, skillId: "stealth", points: 2, expectedSkill: 12, roll: 12, success: true, critical: "none", margin: 0 },
  { tid: "T095", attrs: { DX: 14 }, skillId: "karate", expectedSkill: null, roll: 10 },
  { tid: "T096", attrs: { DX: 14 }, skillId: "brawling", expectedSkill: null, roll: 10 },
  { tid: "T097", attrs: { IQ: 14 }, skillId: "computer-programming", expectedSkill: null, roll: 10 },
  { tid: "T098", attrs: { IQ: 14 }, skillId: "engineer", expectedSkill: null, roll: 10 },
];

for (const c of F_CASES) {
  test(`${c.tid} (${c.skillId})`, () => {
    const char = character(c.attrs);
    if (c.points !== undefined) {
      char.skills.push({ skillId: c.skillId, points: c.points, specialization: null });
    }
    const base = baseSkillLevel(char, skill(c.skillId));
    assert.equal(base, c.expectedSkill, "base/default skill");

    const dice = new ScriptedDice([c.roll]);
    const result = resolve(
      { baseSkill: base, modifiers: (c.mods ?? []).map((v) => ({ label: "test", value: v })) },
      dice,
    );

    const effective = (c.expectedSkill ?? 0) + (c.mods ?? []).reduce((a, b) => a + b, 0);
    if (c.expectedSkill === null || effective < 3) {
      assert.equal(result.status, "not-allowed");
      assert.equal(result.total, null);
      assert.equal(dice.remaining, 1, "no dice thrown");
      return;
    }
    assert.equal(result.status, "rolled");
    assert.equal(result.effectiveSkill, effective);
    assert.equal(result.success, c.success);
    assert.equal(result.critical, c.critical);
    assert.equal(result.margin, c.margin);
  });
}
