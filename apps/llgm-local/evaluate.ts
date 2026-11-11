/** Live local-model behavior checks: npm run llgm:eval -- qwen3:8b */

import { ScriptedDice } from "../../src/core/dice.ts";
import { LocalLlgmGame } from "./game.ts";
import { OllamaClient } from "./protocol.ts";

interface EvaluationCase {
  name: string;
  prompt: string;
  dice: number[];
  verify: (game: LocalLlgmGame) => string[];
}

function toolResult(game: LocalLlgmGame, name: string): Record<string, unknown> | null {
  const entry = game.journal.find((item) => item.tool === name && typeof item.result === "object" && item.result !== null);
  if (!entry) return null;
  const result = entry.result as Record<string, unknown>;
  return typeof result.error === "string" ? null : result;
}

const CASES: EvaluationCase[] = [
  {
    name: "Baton-2 corridor",
    prompt: "There is a service corridor behind this wall. I smash through its wooden slats with my baton. Make and save the appropriate Baton-2 ruling, then resolve my check through the engine.",
    dice: [10],
    verify(game) {
      const rule = game.rules.find((r) => r.ruling.type === "skill_check" && r.ruling.skill.toLowerCase() === "baton");
      const result = toolResult(game, "resolve_skill_check");
      const errors: string[] = [];
      if (!rule || rule.ruling.type !== "skill_check" || rule.ruling.modifier !== -2) errors.push("no accepted Baton-2 house rule");
      if (result?.effectiveSkill !== 11 || result?.total !== 10 || result?.margin !== 1) errors.push("engine result is not effective 11, roll 10, margin 1");
      return errors;
    },
  },
  {
    name: "Silver vulnerability after DR",
    prompt: "Establish this house rule for the campaign: knight-1 takes double damage from silver after DR. Then resolve a silver hit on knight-1 that has 8 basic damage against DR 3.",
    dice: [],
    verify(game) {
      const rule = game.rules.find((r) => r.ruling.type === "damage_multiplier" && r.ruling.target === "knight-1");
      const result = toolResult(game, "resolve_damage");
      const errors: string[] = [];
      if (!rule || rule.ruling.type !== "damage_multiplier" || rule.ruling.multiplier !== 2 || rule.ruling.stage !== "after_DR") {
        errors.push("no accepted x2 after-DR silver rule");
      }
      if (result?.penetratingDamage !== 5 || result?.damage !== 10) errors.push("damage did not resolve as 5 penetrating then 10 modified");
      return errors;
    },
  },
  {
    name: "Unconstrained action needs no roll",
    prompt: "In my familiar, empty office, I walk over to my usual chair and sit down. Nothing unusual or threatening is happening.",
    dice: [],
    verify(game) {
      return game.journal.some((entry) => entry.tool === "resolve_skill_check") ? ["a skill check was requested without stakes"] : [];
    },
  },
  {
    name: "NPC claim does not become objective fact",
    prompt: "Miranda says, 'I was never in the gallery.' Record her statement appropriately. It may or may not be true.",
    dice: [],
    verify(game) {
      const errors: string[] = [];
      if (!game.claims.some((claim) => claim.speaker.toLowerCase().includes("miranda"))) errors.push("Miranda's statement was not recorded as a claim");
      if (game.facts.length > 0) errors.push("the claim was also established as an objective fact");
      return errors;
    },
  },
  {
    name: "Degree-dependent outcome uses returned margin",
    prompt: "I break wooden slats with my baton. Save a this-attempt Baton-2 house rule whose outcomes are declared now: success by 3 or more splinters the slats immediately; any other success breaks them after a few blows; failure means they hold. Then resolve my check.",
    dice: [7],
    verify(game) {
      const rule = game.rules.find((r) => r.ruling.type === "skill_check" && r.ruling.skill.toLowerCase() === "baton");
      const result = toolResult(game, "resolve_skill_check");
      const errors: string[] = [];
      if (!rule || rule.ruling.type !== "skill_check") return ["no Baton skill-check rule"];
      const high = rule.ruling.outcomes?.find((outcome) => outcome.success && outcome.minimumMargin >= 3);
      if (!high) errors.push("no predeclared success-by-3 outcome");
      if (result?.margin !== 4) errors.push("scripted roll did not return success by 4");
      if (high && result?.outcome !== high.effect) errors.push("the returned margin did not select the high-success outcome");
      return errors;
    },
  },
];

async function main(): Promise<void> {
  const model = process.argv[2] ?? "qwen3:8b";
  const client = new OllamaClient(model, process.env.OLLAMA_URL ?? "http://localhost:11434");
  const failures: string[] = [];
  console.log(`Live LLGM evaluation: ${model} (thinking disabled)`);

  for (const testCase of CASES) {
    const game = new LocalLlgmGame(client, new ScriptedDice(testCase.dice));
    process.stdout.write(`\n${testCase.name} ... `);
    try {
      await game.runTurn(testCase.prompt);
      const errors = testCase.verify(game);
      const tools = game.journal.filter((entry) => entry.kind === "tool").map((entry) => entry.tool).join(" -> ") || "no tools";
      if (errors.length === 0) {
        console.log(`PASS (${tools})`);
      } else {
        console.log(`FAIL: ${errors.join("; ")} (${tools})`);
        failures.push(`${testCase.name}: ${errors.join("; ")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`ERROR: ${message}`);
      failures.push(`${testCase.name}: ${message}`);
    }
  }

  console.log(`\n${CASES.length - failures.length}/${CASES.length} live cases passed.`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
