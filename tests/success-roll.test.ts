/**
 * Table-driven runner for the 98 approved cases in tests/cases.json
 * (sections A to F of tests/success-roll-cases.md). ScriptedDice feeds each
 * case's 3d total, so no real dice are involved.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve, ScriptedDice } from "../src/index.ts";
import type { Critical } from "../src/index.ts";

interface Case {
  id: string;
  effectiveSkill: number | null;
  roll: number | null;
  attempt: boolean;
  success?: boolean;
  critical?: string;
  margin?: number;
}

const cases = JSON.parse(
  readFileSync(new URL("./cases.json", import.meta.url), "utf-8"),
) as Case[];

const CRITICAL_MAP: Record<string, Critical> = {
  none: "none",
  "critical success": "success",
  "critical failure": "failure",
};

test("cases.json holds all 98 approved cases", () => {
  assert.equal(cases.length, 98);
});

for (const c of cases) {
  test(c.id, () => {
    const scripted = new ScriptedDice(c.roll === null ? [] : [c.roll]);
    const result = resolve({ baseSkill: c.effectiveSkill }, scripted);

    if (!c.attempt) {
      // CANNOT ATTEMPT: refused, and no dice were thrown.
      assert.equal(result.status, "not-allowed");
      assert.equal(result.total, null);
      assert.equal(result.success, false);
      assert.equal(result.critical, "none");
      assert.equal(result.margin, null);
      assert.equal(scripted.remaining, c.roll === null ? 0 : 1);
      return;
    }

    assert.equal(result.status, "rolled");
    assert.equal(result.total, c.roll);
    assert.equal(result.success, c.success);
    assert.equal(result.critical, CRITICAL_MAP[c.critical ?? "none"]);
    assert.equal(result.margin, c.margin);
    assert.equal(scripted.remaining, 0);
  });
}
