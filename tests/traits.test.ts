/** Traits capstone (issue #45; Lite pp. 4-12, 17): exact catalog costs,
 * character state, improvement, and every hook into existing systems. */

import assert from "node:assert/strict";
import test from "node:test";

import { makeCharacter, pointTotal } from "../src/model/attribute.ts";
import {
  TRAIT_DEFS,
  activeDefenseBonus,
  addLanguage,
  addQuirk,
  addTrait,
  attackTraitModifiers,
  buyOffQuirk,
  disadvantagePoints,
  effectiveComprehension,
  hasTrait,
  languageGainCost,
  languagePoints,
  personalTL,
  selfControlRoll,
  senseTraitModifier,
  traitCost,
  traitGainCost,
  traitReactionModifier,
  traitSkillBonus,
} from "../src/model/traits.ts";
import type { TraitRecord } from "../src/model/traits.ts";
import { baseSkillLevel } from "../src/model/defaults.ts";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";
import { ScriptedDice } from "../src/core/dice.ts";
import { attackExchange, defenseScore, makeCombatant } from "../src/combat/attack.ts";
import { applyInjury } from "../src/combat/injury.ts";
import { resolveReaction } from "../src/core/reaction.ts";
import { Registry } from "../src/modules/loader.ts";
import { LITE_CORE } from "../src/modules/lite-core/index.ts";

const EXPECTED_IDS = [
  "appearance", "charisma", "odious-personal-habit", "voice", "low-tl", "high-tl", "reputation", "status",
  "acute-hearing", "acute-taste-smell", "acute-touch", "acute-vision", "ambidexterity", "animal-empathy",
  "catfall", "combat-reflexes", "danger-sense", "daredevil", "empathy", "enhanced-block", "enhanced-dodge",
  "enhanced-parry", "fearlessness", "flexibility", "hard-to-kill", "high-pain-threshold", "jumper",
  "language-talent", "luck", "night-vision", "perfect-balance", "resistant", "talent", "bad-sight",
  "bad-temper", "bloodlust", "code-of-honor", "curious", "delusions", "gluttony", "greed", "hard-of-hearing",
  "honesty", "impulsiveness", "intolerance", "jealousy", "lecherousness", "obsession", "overconfidence",
  "pacifism", "phobia", "sense-of-duty", "truthfulness", "unluckiness", "vow",
].sort();

const FIXED_AND_VARIANT_COSTS: [TraitRecord, number][] = [
  [{ traitId: "appearance", variant: "hideous" }, -16],
  [{ traitId: "appearance", variant: "ugly" }, -8],
  [{ traitId: "appearance", variant: "unattractive" }, -4],
  [{ traitId: "appearance", variant: "average" }, 0],
  [{ traitId: "appearance", variant: "attractive" }, 4],
  [{ traitId: "appearance", variant: "handsome" }, 12],
  [{ traitId: "appearance", variant: "very-handsome" }, 16],
  [{ traitId: "voice" }, 10], [{ traitId: "ambidexterity" }, 5], [{ traitId: "animal-empathy" }, 5],
  [{ traitId: "catfall" }, 10], [{ traitId: "combat-reflexes" }, 15], [{ traitId: "danger-sense" }, 15],
  [{ traitId: "daredevil" }, 15], [{ traitId: "empathy" }, 15], [{ traitId: "enhanced-block" }, 5],
  [{ traitId: "enhanced-dodge" }, 15],
  [{ traitId: "enhanced-parry", variant: "bare-hands" }, 5],
  [{ traitId: "enhanced-parry", variant: "one-skill", note: "broadsword" }, 5],
  [{ traitId: "enhanced-parry", variant: "all" }, 10],
  [{ traitId: "flexibility", variant: "flexibility" }, 5],
  [{ traitId: "flexibility", variant: "double-jointed" }, 15],
  [{ traitId: "high-pain-threshold" }, 10],
  [{ traitId: "jumper", variant: "time" }, 100], [{ traitId: "jumper", variant: "world" }, 100],
  [{ traitId: "language-talent" }, 10],
  [{ traitId: "luck", variant: "luck" }, 15], [{ traitId: "luck", variant: "extraordinary" }, 30],
  [{ traitId: "luck", variant: "ridiculous" }, 60], [{ traitId: "perfect-balance" }, 15],
  [{ traitId: "resistant", variant: "disease-3" }, 3], [{ traitId: "resistant", variant: "disease-8" }, 5],
  [{ traitId: "resistant", variant: "poison-3" }, 5],
  [{ traitId: "bad-sight", variant: "correctable" }, -10], [{ traitId: "bad-sight", variant: "uncorrectable" }, -25],
  [{ traitId: "bad-temper" }, -10], [{ traitId: "bloodlust" }, -10],
  [{ traitId: "code-of-honor", variant: "informal-peers", note: "Pirate's" }, -5],
  [{ traitId: "code-of-honor", variant: "formal-peers", note: "Gentleman's" }, -10],
  [{ traitId: "code-of-honor", variant: "informal-always", note: "Personal" }, -10],
  [{ traitId: "code-of-honor", variant: "formal-always", note: "Knight's" }, -15],
  [{ traitId: "curious" }, -5],
  [{ traitId: "delusions", variant: "minor", note: "Belief" }, -5],
  [{ traitId: "delusions", variant: "major", note: "Belief" }, -10],
  [{ traitId: "delusions", variant: "severe", note: "Belief" }, -15],
  [{ traitId: "gluttony" }, -5], [{ traitId: "greed" }, -15], [{ traitId: "hard-of-hearing" }, -10],
  [{ traitId: "honesty" }, -10], [{ traitId: "impulsiveness" }, -10],
  [{ traitId: "intolerance", variant: "total", note: "Others" }, -10],
  [{ traitId: "intolerance", variant: "common", note: "Group" }, -5],
  [{ traitId: "intolerance", variant: "uncommon-4", note: "Group" }, -4],
  [{ traitId: "intolerance", variant: "uncommon-3", note: "Group" }, -3],
  [{ traitId: "intolerance", variant: "uncommon-2", note: "Group" }, -2],
  [{ traitId: "intolerance", variant: "rare", note: "Group" }, -1],
  [{ traitId: "jealousy" }, -10], [{ traitId: "lecherousness" }, -15],
  [{ traitId: "obsession", variant: "short-term", note: "Goal" }, -5],
  [{ traitId: "obsession", variant: "long-term", note: "Goal" }, -10],
  [{ traitId: "overconfidence" }, -5],
  [{ traitId: "pacifism", variant: "reluctant-killer" }, -5],
  [{ traitId: "pacifism", variant: "cannot-harm-innocents" }, -10],
  [{ traitId: "phobia", variant: "blood", note: "Blood" }, -10],
  [{ traitId: "phobia", variant: "darkness", note: "Darkness" }, -15],
  [{ traitId: "phobia", variant: "heights", note: "Heights" }, -10],
  [{ traitId: "phobia", variant: "number-13", note: "13" }, -5],
  [{ traitId: "phobia", variant: "spiders", note: "Spiders" }, -5],
  [{ traitId: "sense-of-duty", variant: "individual", note: "Wingman" }, -2],
  [{ traitId: "sense-of-duty", variant: "small-group", note: "Friends" }, -5],
  [{ traitId: "sense-of-duty", variant: "large-group", note: "Nation" }, -10],
  [{ traitId: "sense-of-duty", variant: "entire-race", note: "Humanity" }, -15],
  [{ traitId: "sense-of-duty", variant: "every-living-being", note: "All" }, -20],
  [{ traitId: "truthfulness" }, -5], [{ traitId: "unluckiness" }, -10],
  [{ traitId: "vow", variant: "minor", note: "Vegetarianism" }, -5],
  [{ traitId: "vow", variant: "major", note: "No edged weapons" }, -10],
  [{ traitId: "vow", variant: "great", note: "Never refuse aid" }, -15],
];

function registry(): Registry {
  const r = new Registry();
  r.load(LITE_CORE);
  return r;
}

function session(lines: string[]): { state: ReturnType<typeof makeSoloState>; out: string[] } {
  const state = makeSoloState();
  return { state, out: lines.flatMap((line) => runCommand(state, line)) };
}

test("catalog covers every printed entry; every fixed and listed variant cost is exact", () => {
  assert.deepEqual(TRAIT_DEFS.map((def) => def.id).sort(), EXPECTED_IDS);
  for (const [record, cost] of FIXED_AND_VARIANT_COSTS) assert.equal(traitCost(record), cost, JSON.stringify(record));
});

test("every per-level trait uses its printed cost and bounds", () => {
  const cases: [TraitRecord, number][] = [
    [{ traitId: "charisma", level: 3 }, 15],
    [{ traitId: "odious-personal-habit", level: 2, note: "Spitting" }, -10],
    [{ traitId: "low-tl", level: 2 }, -10], [{ traitId: "high-tl", level: 2 }, 10],
    [{ traitId: "reputation", level: -3, note: "Notorious" }, -15],
    [{ traitId: "reputation", level: 4, note: "Famous" }, 20],
    [{ traitId: "status", level: -2 }, -10], [{ traitId: "status", level: 8 }, 40],
    [{ traitId: "acute-hearing", level: 3 }, 6], [{ traitId: "acute-taste-smell", level: 3 }, 6],
    [{ traitId: "acute-touch", level: 3 }, 6], [{ traitId: "acute-vision", level: 3 }, 6],
    [{ traitId: "fearlessness", level: 4 }, 8], [{ traitId: "hard-to-kill", level: 3 }, 6],
    [{ traitId: "night-vision", level: 9 }, 9],
    [{ traitId: "talent", variant: "artificer", level: 4 }, 40],
    [{ traitId: "talent", variant: "outdoorsman", level: 4 }, 40],
    [{ traitId: "talent", variant: "smooth-operator", level: 4 }, 60],
  ];
  for (const [record, cost] of cases) assert.equal(traitCost(record), cost, JSON.stringify(record));
  assert.throws(() => traitCost({ traitId: "night-vision", level: 10 }), /whole number/);
  assert.throws(() => traitCost({ traitId: "talent", variant: "artificer", level: 5 }), /whole number/);
  assert.throws(() => traitCost({ traitId: "status", level: 0 }), /excluding 0/);
  assert.throws(() => traitCost({ traitId: "reputation", level: 5, note: "Too much" }), /whole number/);
});

test("custom phobia retains an explicit GM price and note; printed records reject typed prices", () => {
  assert.equal(traitCost({ traitId: "phobia", variant: "custom", note: "Open water", points: -7 }), -7);
  assert.throws(() => traitCost({ traitId: "phobia", variant: "custom", note: "Open water", points: 7 }), /negative/);
  assert.throws(() => traitCost({ traitId: "phobia", variant: "custom", points: -7 }), /needs a note/);
  assert.throws(() => traitCost({ traitId: "voice", points: 10 }), /Do not type points/);
});

test("pointTotal includes attributes, skills, Wealth, traits, languages and quirks", () => {
  const c = makeCharacter("m", "M");
  c.attributes.ST = 12; // 20
  c.wealthLevel = "poor"; // -15
  c.skills.push({ skillId: "brawling", points: 4, specialization: null });
  addTrait(c, { traitId: "appearance", variant: "handsome" }); // 12
  addTrait(c, { traitId: "status", level: -2 }); // -10
  addLanguage(c, { name: "English", spoken: 3, written: 3, native: true }); // 0
  addQuirk(c, "Paid in gold"); // -1
  assert.equal(pointTotal(c), 10);
});

test("up to five quirks cost -1 each and buy off for one point through the budgeted CLI", () => {
  const c = makeCharacter("m", "M");
  for (let i = 1; i <= 5; i++) addQuirk(c, `Quirk ${i}`);
  assert.throws(() => addQuirk(c, "Sixth"), /at most five/);
  buyOffQuirk(c, "Quirk 3");
  assert.equal(c.quirks!.length, 4);
  const { state, out } = session(["new M", "quirk Paid in gold", "buyoff quirk Paid in gold"]);
  assert.ok(out.at(-1)!.includes("costs 1 points"), out.join("\n"));
  runCommand(state, "award 1");
  assert.ok(runCommand(state, "buyoff quirk Paid in gold")[0].includes("for 1 point"));
  assert.equal(state.character!.quirks!.length, 0);
  assert.equal(state.character!.unspentPoints, 0);
});

test("GM cap includes negative attributes, Wealth, Status, literacy, quirks and traits", () => {
  const c = makeCharacter("m", "M");
  c.disadvantageLimit = 50;
  c.attributes.ST = 8; // -20
  c.wealthLevel = "poor"; // -15
  addTrait(c, { traitId: "status", level: -2 }); // -10 => -45
  addQuirk(c, "Quirk"); // -46
  addLanguage(c, { name: "English", spoken: 3, written: 2, native: true }); // -47
  assert.equal(disadvantagePoints(c), -47);
  assert.throws(() => addTrait(c, { traitId: "bad-temper" }), /exceeding the GM limit/);
  assert.throws(() => addTrait(c, { traitId: "low-tl", level: 1 }), /exceeding the GM limit/);
  assert.equal(hasTrait(c, "bad-temper"), false, "failed additions roll back");
  assert.equal(disadvantagePoints(c), -47);
  const { out } = session(["new M", "limit 5", "set ST 8", "wealth poor"]);
  assert.ok(out.at(-2)!.includes("exceeding the GM limit"), out.join("\n"));
  assert.ok(out.at(-1)!.includes("exceeding the GM limit"), out.join("\n"));
});

test("Acute Hearing negates Hard of Hearing in either addition order", () => {
  const a = makeCharacter("a", "A");
  addTrait(a, { traitId: "acute-hearing", level: 1 });
  assert.throws(() => addTrait(a, { traitId: "hard-of-hearing" }), /Negated disadvantage/);
  const b = makeCharacter("b", "B");
  addTrait(b, { traitId: "hard-of-hearing" });
  assert.throws(() => addTrait(b, { traitId: "acute-hearing", level: 1 }), /Negated disadvantage/);
});

test("language spoken/written costs, free native literacy reductions and Language Talent are exact", () => {
  const c = makeCharacter("m", "M");
  addLanguage(c, { name: "English", spoken: 3, written: 3, native: true });
  assert.equal(languagePoints(c.languages![0]), 0);
  for (const [written, cost] of [[2, -1], [1, -2], [0, -3]] as const) {
    assert.equal(languagePoints({ name: "English", spoken: 3, written, native: true }), cost);
  }
  addLanguage(c, { name: "French", spoken: 1, written: 2 });
  assert.equal(languagePoints(c.languages![1]), 3);
  assert.throws(() => addLanguage(c, { name: "German", spoken: 3, written: 3, native: true }), /Only the first/);
  assert.throws(() => addLanguage(c, { name: "German", spoken: 0, written: 0 }), /above None/);
  assert.equal(effectiveComprehension(c, c.languages![1], "spoken"), 1);
  addTrait(c, { traitId: "language-talent" });
  assert.equal(effectiveComprehension(c, c.languages![1], "spoken"), 2);
  assert.equal(effectiveComprehension(c, c.languages![1], "written"), 3);
  assert.equal(effectiveComprehension(c, { name: "None", spoken: 0, written: 0 }, "spoken"), 0);
  assert.equal(languageGainCost(c, { name: "French", spoken: 2, written: 2 }), 1);
});

test("CLI trait/language/quirk creation appears on the sheet with the right total", () => {
  const { out } = session([
    "new M", "add appearance handsome", "language English native native native", "quirk Paid in gold", "sheet",
  ]);
  assert.ok(out.some((line) => line.includes("Appearance (Handsome/Beautiful) [12]")), out.join("\n"));
  assert.ok(out.some((line) => line.includes("Language: English (native)") && line.includes("[0]")), out.join("\n"));
  assert.ok(out.some((line) => line === "Point total: 11."), out.join("\n"));
});

test("gain enforces in-play approvals and unspent balances; buyoff refunds no points", () => {
  const state = makeSoloState();
  runCommand(state, "new M");
  runCommand(state, "add bad temper");
  const refused = runCommand(state, "gain combat reflexes");
  assert.ok(refused[0].includes("costs 15 points"), refused.join("\n"));
  assert.equal(hasTrait(state.character!, "combat-reflexes"), false, "failed purchase does not mutate");
  const out = [
    "award 50", "gain combat reflexes", "gain status 2", "gain night vision 2",
    "gain night vision 2 gm", "buyoff bad temper",
  ].flatMap((line) => runCommand(state, line));
  assert.ok(out[3].includes("not a normal in-play purchase"), out.join("\n"));
  assert.ok(out[4].includes("[cost 2]"), out.join("\n"));
  assert.ok(out[5].includes("for 10 points"), out.join("\n"));
  assert.equal(hasTrait(state.character!, "bad-temper"), false);
  assert.equal(state.character!.unspentPoints, 13);
  assert.equal(pointTotal(state.character!), 27);
});

test("language improvement spends only the cost difference", () => {
  const { state, out } = session([
    "new M", "language French broken accented", "award 3", "gain language French accented accented",
  ]);
  assert.ok(out.at(-1)!.includes("[cost 1]"), out.join("\n"));
  assert.equal(state.character!.unspentPoints, 2);
  assert.equal(languagePoints(state.character!.languages![0]), 4);
});

test("self-control rolls against 12: 12 succeeds, 13 fails, modifiers are explicit", () => {
  const c = makeCharacter("m", "M");
  addTrait(c, { traitId: "bad-temper" });
  assert.equal(selfControlRoll(c, "bad-temper", 0, new ScriptedDice([12])).success, true);
  assert.equal(selfControlRoll(c, "bad-temper", 0, new ScriptedDice([13])).success, false);
  const modified = selfControlRoll(c, "bad-temper", -5, new ScriptedDice([8]));
  assert.equal(modified.effectiveSkill, 7);
  assert.equal(modified.success, false);
  const { out } = session(["new M", "add bad temper", "selfcontrol bad temper -5"]);
  assert.ok(out.at(-2)!.includes("effective 7"), out.join("\n"));
  assert.equal(out.at(-1), "Rolling is optional: you may always choose to give in willingly.");
});

test("Combat Reflexes and every Enhanced Defense scope modify the existing defense formulas", () => {
  const r = registry();
  const c = makeCharacter("m", "M");
  c.skills.push({ skillId: "shield", points: 1, specialization: null });
  c.skills.push({ skillId: "broadsword", points: 1, specialization: null });
  assert.equal(defenseScore(r, c, "dodge"), 8);
  addTrait(c, { traitId: "combat-reflexes" });
  addTrait(c, { traitId: "enhanced-dodge" });
  addTrait(c, { traitId: "enhanced-block" });
  addTrait(c, { traitId: "enhanced-parry", variant: "one-skill", note: "broadsword" });
  assert.equal(defenseScore(r, c, "dodge"), 10);
  assert.equal(defenseScore(r, c, "block"), 10);
  assert.equal(defenseScore(r, c, "parry", { parrySkillId: "broadsword" }), 9);
  assert.equal(defenseScore(r, c, "parry", { parrySkillId: "brawling" }), null);
  addTrait(c, { traitId: "enhanced-parry", variant: "all" });
  assert.equal(activeDefenseBonus(c, "parry", "broadsword"), 2, "CR + one nonstacking Enhanced Parry");
});

test("High Pain Threshold removes shock and adds +3 to knockdown; Hard to Kill aids survival", () => {
  const hpt = makeCharacter("h", "H");
  addTrait(hpt, { traitId: "high-pain-threshold" });
  const victim = makeCombatant(hpt);
  const ordinary = applyInjury(victim, 3, new ScriptedDice([]));
  assert.equal(ordinary.shockAfter, 0);
  const major = applyInjury(victim, 6, new ScriptedDice([13]));
  assert.equal(major.knockdownRoll!.effectiveSkill, 13);
  assert.equal(major.knockdownRoll!.success, true);

  const tough = makeCharacter("t", "T");
  addTrait(tough, { traitId: "hard-to-kill", level: 2 });
  const dying = makeCombatant(tough);
  dying.hp = 2;
  const fx = applyInjury(dying, 13, new ScriptedDice([9, 12]));
  assert.equal(fx.deathChecks[0].roll.effectiveSkill, 12);
  assert.equal(fx.deathChecks[0].outcome, "survived");
  assert.equal(fx.deathChecks[0].hardToKillSave, true);
  assert.equal(dying.condition, "unconscious", "the bonus save causes the printed collapse");
  assert.equal(dying.posture, "lying");
});

test("Bad Sight, Ambidexterity, Night Vision and Reluctant Killer use explicit attack facts", () => {
  const c = makeCharacter("m", "M");
  addTrait(c, { traitId: "bad-sight", variant: "correctable" });
  addTrait(c, { traitId: "night-vision", level: 3 });
  addTrait(c, { traitId: "pacifism", variant: "reluctant-killer" });
  let mods = attackTraitModifiers(c, { offHand: true, darknessPenalty: 5, targetPerson: true, deadlyAttack: true });
  assert.deepEqual(mods.map((m) => m.value), [-4, -2, -2, -4]);
  addTrait(c, { traitId: "ambidexterity" });
  mods = attackTraitModifiers(c, { offHand: true, targetPerson: true, deadlyAttack: true, targetFaceUnseen: true });
  assert.deepEqual(mods.map((m) => m.value), [-2, -2]);
  const attacker = makeCombatant(c);
  const defender = makeCombatant(makeCharacter("d", "D"));
  const outcome = attackExchange({
    attacker, attackSkill: 12, damage: { dice: 1, adds: 0 }, damageType: "cr", defender, defense: "none",
  }, registry(), new ScriptedDice([12]));
  assert.equal(outcome.attack.effectiveSkill, 10);
  assert.equal(outcome.hit, false);
});

test("sense modifiers: Acute Senses, Bad Sight, Hard of Hearing and Night Vision", () => {
  const c = makeCharacter("m", "M");
  addTrait(c, { traitId: "acute-vision", level: 2 });
  addTrait(c, { traitId: "acute-hearing", level: 3 });
  addTrait(c, { traitId: "night-vision", level: 4 });
  assert.equal(senseTraitModifier(c, "vision"), 2);
  assert.equal(senseTraitModifier(c, "vision", 6), 6);
  assert.equal(senseTraitModifier(c, "hearing"), 3);
  addTrait(c, { traitId: "bad-sight", variant: "correctable" });
  assert.equal(senseTraitModifier(c, "vision"), -4);
  const deaf = makeCharacter("d", "D");
  addTrait(deaf, { traitId: "hard-of-hearing" });
  assert.equal(senseTraitModifier(deaf, "hearing"), -4);
});

test("named skill bonuses apply to trained and default use; conditional uses stay explicit", () => {
  const r = registry();
  const c = makeCharacter("m", "M");
  addTrait(c, { traitId: "charisma", level: 2 });
  addTrait(c, { traitId: "flexibility", variant: "double-jointed" });
  addTrait(c, { traitId: "perfect-balance" });
  addTrait(c, { traitId: "talent", variant: "outdoorsman", level: 2 });
  addTrait(c, { traitId: "voice" });
  addTrait(c, { traitId: "truthfulness" });
  addLanguage(c, { name: "French", spoken: 1, written: 1 });
  assert.equal(baseSkillLevel(c, r.skill("leadership")!), 7); // IQ-5 +2 Charisma
  assert.equal(baseSkillLevel(c, r.skill("climbing")!), 11); // DX-5 +5 +1
  assert.equal(baseSkillLevel(c, r.skill("acrobatics")!), 5); // DX-6 +1
  assert.equal(baseSkillLevel(c, r.skill("tracking")!), 7); // IQ-5 +2 Talent, even default
  assert.equal(baseSkillLevel(c, r.skill("public-speaking")!), 7); // no speaking flag yet
  assert.equal(baseSkillLevel(c, r.skill("public-speaking")!, "error", { speaking: true }), 9);
  assert.equal(baseSkillLevel(c, r.skill("fast-talk")!), 2); // IQ-5 +2 Charisma -5 Truthfulness
  assert.equal(baseSkillLevel(c, r.skill("acting")!, "error", { deception: true }), 0);
  assert.equal(baseSkillLevel(c, r.skill("acting")!, "error", { language: "French" }), 2); // Broken -3
});

test("reaction traits apply only under their printed recognition/hearing/interaction contexts", () => {
  const c = makeCharacter("m", "M");
  addTrait(c, { traitId: "appearance", variant: "handsome" });
  addTrait(c, { traitId: "charisma", level: 2 });
  addTrait(c, { traitId: "voice" });
  addTrait(c, { traitId: "reputation", level: 2, note: "Brave" });
  addTrait(c, { traitId: "status", level: 3 });
  addTrait(c, { traitId: "odious-personal-habit", level: 1, note: "Spitting" });
  addTrait(c, { traitId: "delusions", variant: "minor", note: "Belief" });
  assert.equal(traitReactionModifier(c), 2); // Handsome +2 from others; all conditional traits silent
  assert.equal(traitReactionModifier(c, { attracted: true }), 4);
  const full = traitReactionModifier(c, {
    attracted: true, activeInteraction: true, heard: true, recognized: true, defer: true, noticed: true,
  });
  assert.equal(full, 11); // 4 +2 +2 +2 +3 -1 -1
  const rolled = resolveReaction(c, { modifier: 1, context: { heard: true } }, new ScriptedDice([4, 3, 3]));
  assert.notEqual(rolled, "predetermined");
  assert.equal((rolled as { modifier: number }).modifier, 5); // Appearance +2, Voice +2, typed +1
  addTrait(c, { traitId: "intolerance", variant: "common", note: "Group" });
  assert.equal(traitReactionModifier(c, {}), 2, "cost does not invent the victim's -1 to -5 GM ruling");
});

test("personal TL drives the existing equipment gate in both directions", () => {
  const high = makeSoloState();
  runCommand(high, "new M");
  runCommand(high, "add high tl 3");
  assert.equal(personalTL(high.character!, high.tl), 6);
  assert.ok(runCommand(high, "buy auto pistol, 9mm")[0].startsWith("Bought Auto Pistol"));
  const low = makeSoloState();
  runCommand(low, "new M");
  runCommand(low, "add low tl 1");
  assert.equal(personalTL(low.character!, low.tl), 2);
  assert.ok(runCommand(low, "buy rapier")[0].includes("personal TL is 2"), "low TL refuses TL4 gear");
});

test("CLI sense and contextual reaction commands expose the computed modifiers", () => {
  const { out } = session([
    "new M", "add acute vision 2", "add night vision 3", "add voice", "seed 4",
    "sense vision darkness 5", "react heard",
  ]);
  assert.ok(out.some((line) => line.includes("Per 10 +5 from traits -5 situation, effective 10")), out.join("\n"));
  assert.ok(out.some((line) => line.includes("modifiers +2, total")), out.join("\n"));
});
