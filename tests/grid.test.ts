/**
 * The 288-pair grid: every effective skill 3 to 20 against every 3d total
 * 3 to 18. The approved grid in section H of tests/success-roll-cases.md is
 * the oracle — this test parses the markdown table and checks the engine's
 * hot path against it, so the engine is tested against the approved text,
 * not against a re-implementation of the rules.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PACK_CRITICAL_FAILURE,
  PACK_CRITICAL_SUCCESS,
  PACK_SUCCESS,
  packTotal,
  rollFast,
  ScriptedDice,
} from "../src/index.ts";

interface GridRow {
  skill: number;
  total: number;
  success: boolean;
  critical: "none" | "success" | "failure";
  margin: number;
}

function parseGrid(): GridRow[] {
  const text = readFileSync(new URL("./success-roll-cases.md", import.meta.url), "utf-8");
  const section = text.split(/^## H\./m)[1]?.split(/^## /m)[0];
  assert.ok(section, "section H not found in tests/success-roll-cases.md");
  const rows: GridRow[] = [];
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    // Row shape: '', skill, total, result, critical, margin text, ''
    if (cells.length !== 7 || cells[0] !== "" || !/^\d+$/.test(cells[1])) continue;
    const skill = Number(cells[1]);
    const total = Number(cells[2]);
    const success = cells[3] === "SUCCESS";
    const critical =
      cells[4] === "critical success"
        ? ("success" as const)
        : cells[4] === "critical failure"
          ? ("failure" as const)
          : ("none" as const);
    const marginMatch = cells[5].match(/margin of (?:success|failure) (-?\d+)/);
    assert.ok(marginMatch, `cannot parse margin in row: ${line}`);
    rows.push({ skill, total, success, critical, margin: Number(marginMatch[1]) });
  }
  return rows;
}

const grid = parseGrid();

test("section H holds 288 approved pairs", () => {
  assert.equal(grid.length, 288);
});

test("hot path matches the approved grid on every pair", () => {
  const dice = new ScriptedDice(grid.map((r) => r.total));
  for (const row of grid) {
    const packed = rollFast(row.skill, dice);
    const total = packTotal(packed);
    const success = (packed & PACK_SUCCESS) !== 0;
    const critSuccess = (packed & PACK_CRITICAL_SUCCESS) !== 0;
    const critFailure = (packed & PACK_CRITICAL_FAILURE) !== 0;
    const margin = success ? row.skill - total : total - row.skill;

    const label = `skill ${row.skill}, roll ${row.total}`;
    assert.equal(total, row.total, label);
    assert.equal(success, row.success, label);
    assert.equal(critSuccess, row.critical === "success", label);
    assert.equal(critFailure, row.critical === "failure", label);
    assert.equal(margin, row.margin, label);

    // Invariant from the issue: no total is ever both a critical success
    // and a critical failure.
    assert.ok(!(critSuccess && critFailure), label);
  }
  assert.equal(dice.remaining, 0);
});
