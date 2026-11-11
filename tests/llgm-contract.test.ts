import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ScriptedDice } from "../src/core/dice.ts";
import {
  LLGM_SYSTEM_PROMPT,
  parseHouseRuleCase,
} from "../src/llgm/contract.ts";
import type { SavedHouseRule } from "../src/llgm/contract.ts";
import {
  applyAcceptedDamageMultipliers,
  resolveSkillCheckRuling,
} from "../src/llgm/rulings.ts";

const fixtures = JSON.parse(
  readFileSync(new URL("fixtures/llgm-rulings.json", import.meta.url), "utf8"),
) as { corridor: unknown; silver: unknown };

test("the LLGM constitution includes outcome authority, stakes, and margins", () => {
  assert.ok(LLGM_SYSTEM_PROMPT.includes("Do not declare mechanical outcomes yourself; narrate engine results."));
  assert.ok(LLGM_SYSTEM_PROMPT.includes("Do not request a roll without a constraint, threat, or dramatic stake."));
  assert.ok(LLGM_SYSTEM_PROMPT.includes("Use margins of success and failure to scale consequences when degrees"));
  assert.ok(LLGM_SYSTEM_PROMPT.includes("specify any margin-dependent outcomes before"));
  assert.ok(LLGM_SYSTEM_PROMPT.includes("PC and NPC claims are not automatically"));
});

test("the Baton-2 corridor case uses the real margin engine and predeclared outcomes", () => {
  const parsed = parseHouseRuleCase(fixtures.corridor);
  if (parsed.ruling.type !== "skill_check") assert.fail("corridor must be a skill-check case");

  const resolution = resolveSkillCheckRuling(parsed, 13, new ScriptedDice([10, 7]));
  assert.equal(resolution.roll.effectiveSkill, 11);
  assert.equal(resolution.roll.total, 10);
  assert.equal(resolution.roll.success, true);
  assert.equal(resolution.roll.margin, 1);
  assert.equal(resolution.outcome?.effect, "The slats break and the service corridor becomes accessible.");

  // The second scripted roll succeeds by 4, selecting the higher threshold
  // declared before either roll rather than inventing a consequence afterward.
  const degrees = resolveSkillCheckRuling(parsed, 13, new ScriptedDice([7]));
  assert.equal(degrees.roll.margin, 4);
  assert.equal(
    degrees.outcome?.effect,
    "The slats splinter at once, opening immediate access to the service corridor.",
  );
});

test("accepted silver vulnerability multiplies post-DR damage only for its target and tag", () => {
  const parsed = parseHouseRuleCase(fixtures.silver);
  if (parsed.ruling.type !== "damage_multiplier") assert.fail("silver must be a damage-multiplier case");
  const accepted: SavedHouseRule = { ...parsed, id: "ruling-002", status: "accepted" };

  // 8 basic damage - DR 3 = 5 penetrating; silver vulnerability x2 = 10.
  assert.deepEqual(
    applyAcceptedDamageMultipliers(8 - 3, "knight-1", "silver", [accepted]),
    { damage: 10, appliedRuleIds: ["ruling-002"] },
  );
  assert.deepEqual(
    applyAcceptedDamageMultipliers(5, "knight-2", "silver", [accepted]),
    { damage: 5, appliedRuleIds: [] },
  );
  assert.deepEqual(
    applyAcceptedDamageMultipliers(5, "knight-1", "steel", [accepted]),
    { damage: 5, appliedRuleIds: [] },
  );
  const proposed: SavedHouseRule = { ...parsed, id: "ruling-003", status: "proposed" };
  assert.deepEqual(
    applyAcceptedDamageMultipliers(5, "knight-1", "silver", [proposed]),
    { damage: 5, appliedRuleIds: [] },
  );
});

test("runtime validation rejects malformed model proposals", () => {
  assert.throws(() => parseHouseRuleCase(null), /root must be an object/);
  assert.throws(() => parseHouseRuleCase({ type: "house_rule", scope: "forever" }), /scope/);
  assert.throws(() => parseHouseRuleCase({
    type: "house_rule",
    scope: "this_attempt",
    exampleCase: "Bad modifier",
    ruling: { type: "skill_check", skill: "baton", modifier: "-2" },
  }), /ruling.modifier/);
  assert.throws(() => parseHouseRuleCase({
    type: "house_rule",
    scope: "this_campaign",
    exampleCase: "Bad multiplier",
    ruling: { type: "damage_multiplier", target: "knight-1", damageTag: "silver", multiplier: -2, stage: "after_DR" },
  }), /multiplier must be greater than zero/);
  assert.throws(() => parseHouseRuleCase({
    type: "house_rule",
    scope: "this_attempt",
    exampleCase: "Bad margin",
    ruling: {
      type: "skill_check",
      skill: "baton",
      modifier: -2,
      outcomes: [{ success: true, minimumMargin: -1, effect: "Invalid" }],
    },
  }), /minimumMargin must be a nonnegative integer/);
});
