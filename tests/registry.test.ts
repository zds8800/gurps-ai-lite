/**
 * Module loader tests: namespacing, bare-id lookup, collision protection and
 * declared overrides.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { LITE_CORE, Registry } from "../src/index.ts";

test("lite-core registers namespaced skills and attributes", () => {
  const registry = new Registry();
  registry.load(LITE_CORE);
  assert.equal(registry.skill("lite-core:lockpicking")?.name, "Lockpicking/TL");
  assert.equal(registry.skill("lockpicking")?.name, "Lockpicking/TL"); // bare id, unambiguous
  assert.equal(registry.attribute("ST")?.costPerLevel, 10);
  assert.equal(registry.listSkills().length, LITE_CORE.skills.length);
});

test("a second module cannot silently replace an entry", () => {
  const registry = new Registry();
  registry.load(LITE_CORE);
  const intruder = {
    id: "house-rules",
    skills: [{ id: "lite-core:lockpicking", name: "Lockpicking (house)", attribute: "IQ" as const, difficulty: "A" as const, defaults: [], tl: false, combat: false, page: 15 }],
  };
  assert.throws(() => registry.load(intruder), /overrides/);
});

test("a declared override replaces the entry", () => {
  const registry = new Registry();
  registry.load(LITE_CORE);
  registry.load({
    id: "house-rules",
    overrides: ["lite-core:lockpicking"],
    skills: [{ id: "lite-core:lockpicking", name: "Lockpicking (house)", attribute: "IQ" as const, difficulty: "E" as const, defaults: [], tl: false, combat: false, page: 15 }],
  });
  assert.equal(registry.skill("lockpicking")?.difficulty, "E");
});

test("ambiguous bare ids are reported, namespaced ids stay exact", () => {
  const registry = new Registry();
  registry.load(LITE_CORE);
  registry.load({
    id: "other-book",
    skills: [{ id: "lockpicking", name: "Lockpicking (other)", attribute: "IQ" as const, difficulty: "A" as const, defaults: [], tl: false, combat: false, page: 1 }],
  });
  assert.throws(() => registry.skill("lockpicking"), /ambiguous/);
  assert.equal(registry.skill("other-book:lockpicking")?.name, "Lockpicking (other)");
  assert.equal(registry.skill("lite-core:lockpicking")?.name, "Lockpicking/TL");
});
