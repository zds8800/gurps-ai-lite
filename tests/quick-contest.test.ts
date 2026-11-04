/**
 * Quick Contest tests (issue #12). Table-driven with ScriptedDice, one pair
 * of scripted totals per case. Cases follow the four rulings of Lite p. 3 as
 * quoted in rules/attributes-and-skills.md section 2, plus the QC1/QC2
 * decisions named on the issue.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { quickContest, ScriptedDice } from "../src/index.ts";

interface ContestCase {
  id: string;
  note: string;
  skillA: number | null;
  rollA: number | null; // null: side A never rolls (cannot attempt)
  skillB: number | null;
  rollB: number | null;
  winner: "a" | "b" | null;
  mov: number | null;
}

const CASES: ContestCase[] = [
  // Rule 1: one succeeds, one fails -> the succeeder wins.
  // MoV = winner's margin of success + loser's margin of failure.
  { id: "Q01", note: "Interrogation 12 (roll 11) vs Will 10 (roll 13): interrogator wins 1+3", skillA: 12, rollA: 11, skillB: 10, rollB: 13, winner: "a", mov: 4 },
  { id: "Q02", note: "same, sides swapped", skillA: 10, rollA: 13, skillB: 12, rollB: 11, winner: "b", mov: 4 },

  // Rule 2: both succeed -> larger margin of success; MoV is the difference.
  { id: "Q03", note: "MoS 5 vs MoS 3", skillA: 15, rollA: 10, skillB: 12, rollB: 9, winner: "a", mov: 2 },
  { id: "Q04", note: "MoS 3 vs MoS 5", skillA: 12, rollA: 9, skillB: 15, rollB: 10, winner: "b", mov: 2 },

  // Rule 3: both fail -> smaller margin of failure; MoV is the difference.
  { id: "Q05", note: "MoF 1 vs MoF 4", skillA: 10, rollA: 11, skillB: 10, rollB: 14, winner: "a", mov: 3 },
  { id: "Q06", note: "MoF 4 vs MoF 1", skillA: 10, rollA: 14, skillB: 10, rollB: 11, winner: "b", mov: 3 },

  // Rule 4: a tie means nobody won.
  { id: "Q07", note: "both succeed by 2", skillA: 12, rollA: 10, skillB: 15, rollB: 13, winner: null, mov: null },
  { id: "Q08", note: "both fail by 2", skillA: 12, rollA: 14, skillB: 15, rollB: 17, winner: null, mov: null },

  // QC2: a critical success is a flag, not an automatic win.
  { id: "Q09", note: "crit success MoS 10 vs plain success MoS 10 -> tie", skillA: 16, rollA: 6, skillB: 17, rollB: 7, winner: null, mov: null },
  { id: "Q10", note: "crit success MoS 3 vs plain success MoS 5 -> the plain success wins", skillA: 15, rollA: 12, skillB: 12, rollB: 7, winner: "b", mov: 2 },

  // D2 anomalies flow through the margins.
  { id: "Q11", note: "auto-success margin -1 vs MoS 5", skillA: 3, rollA: 4, skillB: 15, rollB: 10, winner: "b", mov: 6 },
  { id: "Q12", note: "auto-failure margin -2 vs MoF 6 (both fail, smaller MoF wins)", skillA: 19, rollA: 17, skillB: 10, rollB: 16, winner: "a", mov: 8 },

  // QC1: a side that cannot attempt cannot win.
  { id: "Q13", note: "A cannot attempt (skill 2), B succeeds -> B wins by its MoS", skillA: 2, rollA: null, skillB: 10, rollB: 8, winner: "b", mov: 2 },
  { id: "Q14", note: "A cannot attempt, B fails -> nobody won", skillA: 2, rollA: null, skillB: 10, rollB: 14, winner: null, mov: null },
  { id: "Q15", note: "neither can attempt -> nobody won, no dice thrown", skillA: 2, rollA: null, skillB: null, rollB: null, winner: null, mov: null },
];

for (const c of CASES) {
  test(`${c.id} ${c.note}`, () => {
    const scripted = new ScriptedDice([c.rollA, c.rollB].filter((r): r is number => r !== null));
    const result = quickContest({ baseSkill: c.skillA }, { baseSkill: c.skillB }, scripted);
    assert.equal(result.winner, c.winner, "winner");
    assert.equal(result.marginOfVictory, c.mov, "margin of victory");
    assert.equal(scripted.remaining, 0, "exactly the scripted dice were consumed");
  });
}

test("critical flags still ride on each side's roll", () => {
  const result = quickContest({ baseSkill: 16 }, { baseSkill: 17 }, new ScriptedDice([6, 7]));
  assert.equal(result.a.critical, "success");
  assert.equal(result.b.critical, "none");
  assert.equal(result.winner, null); // QC2: the flag did not decide it
});
