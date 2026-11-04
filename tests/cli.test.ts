/**
 * Text-interface tests: runCommand is driven line by line, plus one end-to-end
 * run of the real CLI process with commands piped in (the "play from a file"
 * path from design section 7).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

test("the design's sample session, corrected to the approved cost table", () => {
  const out = session([
    "seed 42",
    "new Mara",
    "set DX 12",
    "learn lockpicking 2",
    "sheet",
    "odds lockpicking",
    "test lockpicking -2",
  ]);
  assert.deepEqual(out[0], "Dice seeded with 42.");
  assert.deepEqual(out[1], "Mara created. ST 10 DX 10 IQ 10 HT 10. 0 points spent.");
  assert.deepEqual(out[2], "DX 12 (cost 40 points).");
  // 2 points in an Average skill is Attribute+0 (p. 13), so IQ 10 -> 10.
  assert.deepEqual(out[3], "Lockpicking (IQ, Average) at 2 points: IQ 10 + 0 = 10.");
  assert.ok(out.some((l) => l.trim().startsWith("Lockpicking (IQ/A) 2 points: level 10")));
  assert.ok(out.some((l) => l.startsWith("Point total: 42")));
  assert.deepEqual(
    out.find((l) => l.startsWith("Effective skill 10")),
    "Effective skill 10: 50.0% success, 1.9% critical success, 1.9% critical failure.",
  );
  assert.ok(out.some((l) => l.startsWith("Lockpicking 10, modifier -2, effective skill 8.")));
  assert.ok(out.some((l) => l.startsWith("Rolled 3d: ")));
});

test("seeded sessions repeat exactly", () => {
  const a = session(["seed 7", "new A", "test ST", "test ST", "test ST"]);
  const b = session(["seed 7", "new A", "test ST", "test ST", "test ST"]);
  assert.deepEqual(a, b);
});

test("low skill is refused with the book's wording", () => {
  const out = session(["new M", "learn acrobatics 1", "test acrobatics -9"]);
  // 1 point in a Hard skill is Attribute-2, so DX 10 - 2 - 9 = -1.
  assert.deepEqual(out.at(-1), "Effective skill -1 is below 3. You may not attempt this roll (p. 2).");
});

test("unprinted point costs show the fix", () => {
  const out = session(["new M", "learn stealth 3"]);
  assert.ok(out.at(-1)!.includes("not a purchasable cost"));
  assert.ok(out.at(-1)!.includes("round-down"));
});

test("no-default skills cannot be attempted untrained", () => {
  const out = session(["new M", "test karate"]);
  assert.deepEqual(out.at(-1), "Karate has no default (p. 13). You cannot attempt it untrained.");
});

test("bad input gets a plain message, not a crash", () => {
  const out = session(["new M", "test", "test nosuchskill", "test ST +x", "set ZZ 5", "frobnicate"]);
  assert.deepEqual(out[1], "Usage: test <skill or attribute> [+n or -n ...]");
  assert.ok(out[2].startsWith("Unknown skill"));
  assert.deepEqual(out[3], 'Bad modifier "+x". Modifiers look like +2 or -5.');
  assert.deepEqual(out[4], 'Unknown attribute "ZZ". Use ST, DX, IQ or HT.');
  assert.deepEqual(out[5], 'Unknown command "frobnicate". Type help.');
});

test("contest command runs a Quick Contest against a target number", () => {
  const out = session(["seed 5", "new M", "learn stealth 4", "contest stealth vs 10"]);
  assert.ok(out.some((l) => l.startsWith("Stealth 11 vs 10.")));
  assert.ok(out.some((l) => l.startsWith("You rolled 3d: ")));
  assert.ok(out.some((l) => l.startsWith("They rolled 3d: ")));
  assert.ok(
    out.some((l) => /^(You win|They win|Nobody won)/.test(l)),
    "a contest verdict line",
  );
});

test("contest usage errors are plain", () => {
  const out = session(["new M", "contest stealth", "contest stealth vs abc"]);
  assert.deepEqual(out[1], "Usage: contest <skill or attribute> [+n or -n ...] vs <number>");
  assert.deepEqual(out[2], 'Bad opponent skill "abc". Give their effective skill as a number.');
});

test("formula explains a skill with a default", () => {
  const out = session(["formula interrogation"]);
  assert.deepEqual(out[0], "Interrogation (IQ, Average), Lite p. 15.");
  assert.deepEqual(out[1], "Default: IQ-5 (p. 13).");
  assert.deepEqual(out[2], "Costs (points = level): 1 = IQ-1, 2 = IQ+0, 4 = IQ+1, 8 = IQ+2, then +4 points per extra level.");
  assert.equal(out.length, 3); // no character loaded: no character line
});

test("formula reports no-default skills as untrainable by default", () => {
  const out = session(["formula karate"]);
  assert.deepEqual(out[1], "Default: none — you cannot attempt this skill untrained (p. 13).");
});

test("formula shows the loaded character's level, trained or default", () => {
  const out = session(["new Mara", "set IQ 12", "learn stealth 4", "formula stealth", "formula lockpicking"]);
  assert.deepEqual(
    out.at(-5), // last line of the stealth block (4 lines), before lockpicking's 4
    "Mara (DX 10): trained at 4 points, DX+1 = level 11.",
  );
  assert.deepEqual(
    out.at(-1),
    "Mara (IQ 12): untrained, default IQ-5 = level 7.",
  );
});

test("formula on an attribute gets a plain note", () => {
  const out = session(["formula ST"]);
  assert.deepEqual(out[0], "ST is a basic attribute: its level is just its score (p. 4). Skills based on it add a relative level.");
});

test("the CLI runs as a process with piped commands", () => {
  const soloPath = fileURLToPath(new URL("../src/cli/solo.ts", import.meta.url));
  const output = execFileSync(
    process.execPath,
    [soloPath],
    { input: "seed 42\nnew Mara\ntest ST\nquit\n", encoding: "utf-8" },
  );
  assert.ok(output.includes("Mara created."));
  assert.ok(output.includes("Rolled 3d: "));
});
