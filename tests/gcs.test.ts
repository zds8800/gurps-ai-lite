/**
 * .gcs importer tests (issue #13). Table-driven over two committed fixtures:
 * mara-voss.gcs is an original character written in the real GCS 5 file
 * format; edge-case.gcs is a synthetic sheet packed with the odd shapes the
 * importer must report rather than drop silently.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importGcsSheet } from "../src/model/gcs.ts";
import { baseSkillLevel } from "../src/model/defaults.ts";
import { pointTotal } from "../src/model/attribute.ts";
import { Registry } from "../src/modules/loader.ts";
import { LITE_CORE } from "../src/modules/lite-core/index.ts";

function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf-8"));
}

function registry(): Registry {
  const r = new Registry();
  r.load(LITE_CORE);
  return r;
}

test("a real-format sheet loads into a Character with attributes and skill records", () => {
  const { character, notes } = importGcsSheet(loadFixture("mara-voss.gcs"), registry());
  assert.equal(character.name, "Mara Voss");
  assert.deepEqual(character.attributes, { ST: 10, DX: 11, IQ: 12, HT: 11 });
  assert.deepEqual(
    character.skills.map((r) => `${r.skillId}:${r.points}:${r.specialization ?? ""}`),
    [
      "stealth:4:",
      "lockpicking:2:",
      "brawling:1:",
      "thrown-knife:2:Knife",
      "fast-talk:1:",
      "interrogation:8:",
      "area-knowledge:1:Docks District",
    ],
  );
  assert.deepEqual(notes, []); // a clean sheet imports clean
});

test("point totals from the file agree with pointTotal where Lite covers them", () => {
  const cases: [string, number][] = [
    // mara: ST+0 DX+1 IQ+2 HT+1 = 0+20+40+10; skills 4+2+1+2+1+8+1 = 19 -> 89
    ["mara-voss.gcs", 89],
    // edge: ST-2 IQ+1 = -20+20; imported skills 4+3+0.5+2 = 9.5 -> 9.5
    ["edge-case.gcs", 9.5],
  ];
  for (const [fixture, expected] of cases) {
    const { character } = importGcsSheet(loadFixture(fixture), registry());
    assert.equal(pointTotal(character), expected, fixture);
  }
});

test("the imported character is playable: levels come out of the model", () => {
  const { character } = importGcsSheet(loadFixture("mara-voss.gcs"), registry());
  const r = registry();
  const level = (id: string) => baseSkillLevel(character, r.skill(id)!);
  assert.equal(level("stealth"), 12); // DX 11 + 1 (4 points, Average)
  assert.equal(level("interrogation"), 14); // IQ 12 + 2 (8 points, Average)
  assert.equal(level("lockpicking"), 12); // IQ 12 + 0 (2 points, Average)
  assert.equal(level("brawling"), 11); // DX 11 + 0 (1 point, Easy)
});

test("every edge-case ruling is reported in the notes, in order", () => {
  const { notes } = importGcsSheet(loadFixture("edge-case.gcs"), registry());
  assert.deepEqual(notes, [
    "HT is not listed in the file; using the base 10.",
    '"Combat Skills" is a grouping folder; its contents were loaded without the folder.',
    '"Kicking" is a technique; Lite has no techniques (p. 13), so it was left off.',
    '"Computer Hacking" is IQ/VH; Lite has only Easy, Average and Hard skills (p. 13), so it was left off.',
    '"Skiing" is not in the Lite skill list (pp. 13-17); left off the sheet.',
    '"Knife" matches several Lite skills (Melee Weapon: Knife; Thrown Weapon: Knife); left off — ' +
      'name it with its family in GCS (for example "Thrown Weapon" with speciality "Knife").',
    '"Stealth": 3 points is not a purchasable cost for an Average skill ' +
      "(Lite p. 13 prints 1, 2, 4, 8, then +4 per extra level). Nearest valid: " +
      "2 points (Attribute+0) or 4 points (Attribute+1). Fix the sheet to one of those, " +
      'or pass "round-down" / "round-up" to choose automatically.',
    '"Acting" has 0.5 points; GURPS skill points are whole numbers. Kept as written.',
  ]);
});

test("the edge-case sheet still imports what it can", () => {
  const { character } = importGcsSheet(loadFixture("edge-case.gcs"), registry());
  assert.equal(character.name, "Edge Case");
  assert.deepEqual(character.attributes, { ST: 8, DX: 10, IQ: 11, HT: 10 });
  assert.deepEqual(
    character.skills.map((r) => `${r.skillId}:${r.points}`),
    ["broadsword:4", "stealth:3", "acting:0.5", "shadowing:2"],
  );
});

test("a non-GCS value is rejected outright", () => {
  assert.throws(() => importGcsSheet({ hello: "world" }, registry()), /Not a GCS character sheet/);
  assert.throws(() => importGcsSheet("nope", registry()), /Not a GCS character sheet/);
});
