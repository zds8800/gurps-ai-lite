/** CLI discoverability: contextual alphabetical help and useful armory searches. */

import assert from "node:assert/strict";
import test from "node:test";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function commandNames(help: string[]): string[] {
  return help.filter((line) => line.startsWith("  ")).map((line) => line.trim().split(/\s+/)[0]);
}

test("non-combat help is alphabetical and omits combat-only commands", () => {
  const state = makeSoloState();
  const help = runCommand(state, "help");
  const names = commandNames(help);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  for (const command of ["armory", "foe", "load", "seed", "test"]) assert.ok(names.includes(command), command);
  for (const command of ["attack", "defend", "npc", "order"]) assert.ok(!names.includes(command), command);
});

test("combat help is alphabetical and omits shopping and creation commands", () => {
  const state = makeSoloState();
  runCommand(state, "new M");
  runCommand(state, "foe tests/fixtures/edge-case.gcs");
  const help = runCommand(state, "help");
  const names = commandNames(help);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  for (const command of ["attack", "cover", "defend", "npc", "order"]) assert.ok(names.includes(command), command);
  for (const command of ["armory", "buy", "load", "test"]) assert.ok(!names.includes(command), command);
});

test("armory searches weapon skill categories as well as names", () => {
  const state = makeSoloState();
  const out = runCommand(state, "armory gun").join("\n");
  for (const name of ["Auto Pistol", "Self-Loading Rifle", "Sniper Rifle", "Pump Shotgun"]) {
    assert.ok(out.includes(name), `${name}\n${out}`);
  }
});

test("armory accepts spaced and compact exact-TL queries", () => {
  const state = makeSoloState();
  const spaced = runCommand(state, "armory tl 6");
  const compact = runCommand(state, "armory tl6");
  assert.deepEqual(spaced, compact);
  const items = spaced.filter((line) => line.startsWith("  "));
  assert.ok(items.length > 0);
  for (const item of items) assert.ok(item.includes("(TL6"), item);
});

test("ordinary armory name searches still work", () => {
  const state = makeSoloState();
  const out = runCommand(state, "armory pistol").join("\n");
  assert.ok(out.includes("Auto Pistol"), out);
});
