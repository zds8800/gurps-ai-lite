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

test("equipment imports ownership, quantities and every ready/worn slot without changing points (issue #47)", () => {
  const { character, notes } = importGcsSheet(loadFixture("equipped-duelist.gcs"), registry());
  assert.deepEqual(notes, []);
  assert.deepEqual(
    character.equipment?.map((item) => item.name),
    ["Broadsword", "Small Shield", "Leather Armor", "Large Knife", "Large Knife", "Auto Pistol, 9mm"],
  );
  assert.equal(character.readyMelee, "Broadsword");
  assert.equal(character.readyRanged, "Auto Pistol, 9mm");
  assert.equal(character.readyShield, "Small Shield");
  assert.equal(character.wornArmor, "Leather Armor");
  assert.equal(pointTotal(character), 94); // equipment is bought with money, not character points
});

test("equipment containers, unknown items and competing equipped slots are all explicit", () => {
  const { character, notes } = importGcsSheet({
    profile: { name: "Gear Edge" },
    attributes: [],
    skills: [],
    equipment: [
      {
        id: "E1",
        name: "Duel Kit",
        children: [
          { id: "e1", name: "Rapier", equipped: true },
          { id: "e2", name: "Broadsword", equipped: true },
          { id: "e3", name: "Small Shield", equipped: false },
          { id: "e4", name: "Vibroblade", equipped: true },
        ],
      },
      { id: "e5", name: "Small Shield", equipped: true },
      { id: "e6", name: "Medium Shield", equipped: true },
      { id: "e7", name: "Leather Armor", equipped: true },
      { id: "e8", name: "Mail", equipped: true },
    ],
  }, registry());
  assert.deepEqual(notes.slice(4), [
    '"Duel Kit" is an equipment grouping folder; its contents were loaded without the folder.',
    '"Broadsword" is equipped, but "Rapier" already occupies the ready melee weapon slot; ' +
      '"Broadsword" remains owned but is not readied/worn.',
    '"Vibroblade" is not in the Lite equipment tables (pp. 18-22); left off the sheet.',
    '"Medium Shield" is equipped, but "Small Shield" already occupies the ready shield slot; ' +
      '"Medium Shield" remains owned but is not readied/worn.',
    '"Mail" is equipped, but "Leather Armor" already occupies the worn armor slot; ' +
      '"Mail" remains owned but is not readied/worn.',
  ]);
  assert.equal(character.readyMelee, "Rapier");
  assert.equal(character.readyRanged, undefined);
  assert.equal(character.readyShield, "Small Shield");
  assert.equal(character.wornArmor, "Leather Armor");
  assert.equal(character.equipment?.filter((item) => item.name === "Small Shield").length, 2);
  assert.ok(character.equipment?.some((item) => item.name === "Broadsword"));
  assert.ok(character.equipment?.some((item) => item.name === "Medium Shield"));
  assert.ok(character.equipment?.some((item) => item.name === "Mail"));
  assert.ok(!character.equipment?.some((item) => item.name === "Vibroblade"));
  assert.equal(pointTotal(character), 0);
});

test("a bow's own ST imports, while an invalid quantity is reported and skipped", () => {
  const { character, notes } = importGcsSheet({
    attributes: [],
    skills: [],
    equipment: [
      { name: "Short Bow", quantity: 1, equipped: true, strength: 12 },
      { name: "Rapier", quantity: 1.5, equipped: true },
    ],
  }, registry());
  assert.deepEqual(character.equipment, [{ name: "Short Bow", st: 12 }]);
  assert.equal(character.readyRanged, "Short Bow");
  assert.equal(character.readyMelee, undefined);
  assert.equal(
    notes[4],
    '"Rapier" has invalid quantity 1.5; expected a non-negative whole number. Left off.',
  );
});
