import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LocalLlgmGame } from "../apps/llgm-local/game.ts";
import { OllamaClient } from "../apps/llgm-local/protocol.ts";
import { formatTrace } from "../apps/llgm-local/trace.ts";
import type { ChatClient, OllamaMessage } from "../apps/llgm-local/protocol.ts";
import { ScriptedDice } from "../src/core/dice.ts";

const fixtures = JSON.parse(
  readFileSync(new URL("fixtures/llgm-rulings.json", import.meta.url), "utf8"),
) as { corridor: unknown; silver: unknown };

class FakeClient implements ChatClient {
  private index = 0;
  private readonly responses: OllamaMessage[];
  constructor(responses: OllamaMessage[]) {
    this.responses = responses;
  }
  async chat(): Promise<OllamaMessage> {
    const response = this.responses[this.index];
    this.index += 1;
    if (!response) throw new Error("FakeClient ran out of responses.");
    return response;
  }
}

test("the flat tool loop saves a ruling, resolves real dice, and returns only final narration", async () => {
  const client = new FakeClient([
    {
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "save_house_rule",
          arguments: {
            scope: "this_attempt",
            exampleCase: "Breaking through wooden slats with a baton",
            rulingType: "skill_check",
            skill: "baton",
            modifier: -2,
            outcomes: [{ success: true, minimumMargin: 0, effect: "The slats break and the service corridor becomes accessible." }],
          },
        },
      }],
    },
    {
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "resolve_skill_check", arguments: { actor: "adrian", rulingId: "ruling-001" } } }],
    },
    { role: "assistant", content: "The slats break and the corridor opens." },
  ]);
  const game = new LocalLlgmGame(client, new ScriptedDice([10]));
  const narration = await game.runTurn("I break through the slats with my baton.");

  assert.equal(narration, "The slats break and the corridor opens.");
  assert.equal(game.rules.length, 1);
  assert.equal(game.rules[0].status, "accepted");
  const result = game.journal.find((entry) => entry.tool === "resolve_skill_check")?.result as Record<string, unknown>;
  assert.equal(result.effectiveSkill, 11);
  assert.equal(result.total, 10);
  assert.equal(result.margin, 1);
  assert.equal(result.outcome, "The slats break and the service corridor becomes accessible.");
  const trace = formatTrace(game.journal);
  assert.match(trace, /Formula: 13 - 2 = 11/);
  assert.match(trace, /Roll: 10; success by 1/);
  assert.match(trace, /Outcome: The slats break and the service corridor becomes accessible\./);
});

test("malformed model proposals return a correctable error and save nothing", () => {
  const game = new LocalLlgmGame(new FakeClient([]));
  const result = game.dispatch({
    function: {
      name: "save_house_rule",
      arguments: { type: "house_rule", scope: "this_attempt", exampleCase: "Bad", ruling: { type: "skill_check", skill: "baton", modifier: "-2" } },
    },
  }) as Record<string, unknown>;
  assert.match(String(result.error), /ruling.modifier/);
  assert.equal(game.rules.length, 0);
});

test("NPC statements are claims, not established facts", () => {
  const game = new LocalLlgmGame(new FakeClient([]));
  const result = game.dispatch({
    function: { name: "record_claim", arguments: { speaker: "Miranda", text: "I was never in the gallery." } },
  }) as Record<string, unknown>;
  assert.equal(result.factEstablished, false);
  assert.deepEqual(game.claims, [{ speaker: "Miranda", text: "I was never in the gallery." }]);
  assert.equal(game.facts.length, 0);
});

test("the gateway applies accepted silver vulnerability after DR", () => {
  const game = new LocalLlgmGame(new FakeClient([]));
  game.dispatch({ function: { name: "save_house_rule", arguments: fixtures.silver } });
  const result = game.dispatch({
    function: { name: "resolve_damage", arguments: { target: "knight-1", damageTag: "silver", basicDamage: 8, dr: 3 } },
  }) as Record<string, unknown>;
  assert.equal(result.penetratingDamage, 5);
  assert.equal(result.damage, 10);
  assert.deepEqual(result.appliedRuleIds, ["ruling-001"]);
});

test("Ollama protocol uses localhost chat with thinking disabled", async () => {
  let requestedUrl = "";
  let body: Record<string, unknown> = {};
  const client = new OllamaClient("qwen3:8b", "http://localhost:11434", async (input, init) => {
    requestedUrl = String(input);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ message: { role: "assistant", content: "Final answer" } }), { status: 200 });
  });
  const message = await client.chat([{ role: "user", content: "Hello" }], []);
  assert.equal(message.content, "Final answer");
  assert.equal(requestedUrl, "http://localhost:11434/api/chat");
  assert.equal(body.model, "qwen3:8b");
  assert.equal(body.think, false);
  assert.equal(body.stream, false);
  assert.throws(() => new OllamaClient("remote", "https://example.com"), /only permits a local http endpoint/);
});
