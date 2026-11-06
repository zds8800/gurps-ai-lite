/**
 * Character improvement tests (issue #41; Lite p. 17): bonus points recorded
 * as unspent, attribute improvement at the point-cost difference, skill
 * improvement at the difference in point totals, and refusals that show the
 * numbers when the balance is short or the cost is not printed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { attributeImprovementCost, skillImprovementCost } from "../src/model/improvement.ts";
import { makeCharacter, pointTotal } from "../src/model/attribute.ts";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

test("cost functions: attribute and skill differences (pp. 13, 17)", () => {
  const c = makeCharacter("m", "M");
  assert.equal(attributeImprovementCost(c, "ST", 12), 20); // 2 levels x 10
  assert.equal(attributeImprovementCost(c, "DX", 11), 20); // 1 level x 20
  assert.equal(typeof attributeImprovementCost(c, "ST", 10), "string"); // no improvement
  assert.equal(typeof attributeImprovementCost(c, "ST", 8), "string"); // lowering is not improving
  assert.equal(typeof attributeImprovementCost(c, "ST", 0), "string");

  const state = makeSoloState();
  const stealth = state.registry.skill("stealth")!;
  c.skills.push({ skillId: "stealth", points: 1, specialization: null });
  assert.equal(skillImprovementCost(c, stealth, 4), 3); // 1 -> 4 costs 3
  assert.equal(skillImprovementCost(c, stealth, 8), 7);
  assert.equal(typeof skillImprovementCost(c, stealth, 3), "string"); // unprinted cost
  assert.equal(typeof skillImprovementCost(c, stealth, 1), "string"); // no improvement
  const karate = state.registry.skill("karate")!;
  assert.equal(skillImprovementCost(c, karate, 4), 4); // new skill: full cost
});

test("award records unspent points; the sheet shows the balance (p. 17)", () => {
  const out = session(["new M", "award 3", "award 2", "sheet"]);
  assert.deepEqual(out[2], "3 bonus points awarded. M has 3 unspent (p. 17).");
  assert.deepEqual(out[3], "2 bonus points awarded. M has 5 unspent (p. 17).");
  assert.ok(out.some((l) => l === "Unspent points: 5 (award/improve, p. 17)."), out.join("\n"));
  // The balance is not itself points spent: the point total stays 0.
  assert.ok(out.some((l) => l.startsWith("Point total: 0")), out.join("\n"));
});

test("improving an attribute spends the difference and secondary traits follow (pp. 6, 17)", () => {
  const out = session(["new M", "award 20", "improve ST 12", "sheet"]);
  assert.deepEqual(out[3], "ST 10 to 12 (cost 20 points). 0 unspent left.");
  assert.ok(out.some((l) => l.includes("ST 12")), out.join("\n"));
  assert.ok(out.some((l) => l.startsWith("Point total: 20")), out.join("\n"));
});

test("improving a skill spends the difference; a new skill costs its full price", () => {
  const out = session([
    "new M",
    "learn brawling 1",
    "award 3",
    "improve brawling 4",
    "sheet",
  ]);
  assert.deepEqual(out[4], "Brawling 1 to 4 points (cost 3 points). 0 unspent left.");
  // Brawling is DX/Easy: 4 points is DX+2 (p. 13), on DX 10 = 12.
  assert.ok(out.some((l) => l.includes("Brawling (DX/E) 4 points: level 12")), out.join("\n"));

  const fresh = session(["new M", "award 4", "improve stealth 4"]);
  assert.deepEqual(fresh.at(-1), "Stealth 0 to 4 points (cost 4 points). 0 unspent left.");
});

test("spending beyond the balance is refused with the numbers (p. 17)", () => {
  const out = session(["new M", "award 2", "improve ST 12", "improve brawling 4"]);
  assert.deepEqual(
    out[3],
    "ST 10 to 12 costs 20 points; M has 2 unspent. (The GM awards points with: award <n>, p. 17.)",
  );
  assert.deepEqual(
    out[4],
    "Brawling 0 to 4 points costs 4 points; M has 2 unspent. (The GM awards points with: award <n>, p. 17.)",
  );
  // A failed improvement spends nothing.
  const sheet = session(["new M", "award 2", "improve ST 12", "sheet"]);
  assert.ok(sheet.some((l) => l === "Unspent points: 2 (award/improve, p. 17)."));
});

test("unprinted costs keep the round-up/round-down explanation (p. 13)", () => {
  const out = session(["new M", "award 5", "improve stealth 3"]);
  const last = out.at(-1)!;
  assert.ok(last.includes("not a purchasable cost"), last);
  assert.ok(last.includes("round-down"), last);
});

test("improvement is validated: lowering is refused, bad usage is plain", () => {
  const out = session([
    "new M",
    "learn stealth 4",
    "award 9",
    "improve stealth 2",
    "improve ST 10",
    "improve nosuchskill 4",
    "improve",
  ]);
  assert.deepEqual(out[4], "Stealth is already at 4 points. Improving means a higher point total (p. 17).");
  assert.deepEqual(out[5], "ST is already 10. Improving means a higher score (p. 17).");
  assert.ok(out[6].startsWith("Unknown skill"));
  assert.deepEqual(out[7], "Usage: improve <ST/DX/IQ/HT> <level> or improve <skill> <points>  (p. 17)");
});

test("pointTotal counts improved attributes and skills but not the unspent balance", () => {
  const c = makeCharacter("m", "M");
  c.unspentPoints = 7;
  c.attributes.ST = 12;
  c.skills.push({ skillId: "brawling", points: 4, specialization: null });
  assert.equal(pointTotal(c), 24); // 20 for ST 12, 4 for the skill; the 7 unspent are not spent
});
