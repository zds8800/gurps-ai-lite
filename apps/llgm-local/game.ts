/**
 * A deliberately small LLGM loop. The model interprets and narrates; this
 * gateway owns rule identity, acceptance, claims, facts, and engine execution.
 */

import { SystemDice } from "../../src/core/dice.ts";
import type { DiceSource } from "../../src/core/dice.ts";
import {
  HOUSE_RULE_SCOPES,
  LLGM_SYSTEM_PROMPT,
  parseHouseRuleCase,
} from "../../src/llgm/contract.ts";
import type { SavedHouseRule } from "../../src/llgm/contract.ts";
import {
  applyAcceptedDamageMultipliers,
  resolveSkillCheckRuling,
} from "../../src/llgm/rulings.ts";
import type {
  ChatClient,
  OllamaMessage,
  OllamaToolCall,
  ToolDefinition,
} from "./protocol.ts";

const ACTORS: Record<string, Record<string, number>> = {
  adrian: { baton: 13, observation: 12, stealth: 12, guns: 12 },
};

export interface Claim {
  speaker: string;
  text: string;
}

export interface JournalEntry {
  kind: "player" | "tool" | "narration";
  text: string;
  tool?: string;
  result?: unknown;
}

const outcomeSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["success", "minimumMargin", "effect"],
    properties: {
      success: { type: "boolean", description: "Which side of the roll this outcome belongs to." },
      minimumMargin: { type: "integer", minimum: 0, description: "Lowest success/failure margin selecting this outcome." },
      effect: { type: "string", description: "Consequence declared before the roll." },
    },
  },
};

export const LLGM_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "lookup_skill",
      description: "Look up an actor's authoritative sheet skill. Do not guess a level.",
      parameters: {
        type: "object",
        required: ["actor", "skill"],
        properties: {
          actor: { type: "string", enum: ["adrian"] },
          skill: { type: "string", description: "For example baton, observation, stealth, or guns." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_house_rule",
      description: "Save an example case and its ruling. Use flat arguments. The application assigns type, stage, ID, and acceptance. Save a requested rule successfully before resolving it.",
      parameters: {
        type: "object",
        required: ["scope", "exampleCase", "rulingType"],
        properties: {
          scope: { type: "string", enum: HOUSE_RULE_SCOPES },
          exampleCase: { type: "string", description: "A reusable example describing this ruling." },
          rulingType: { type: "string", enum: ["skill_check", "damage_multiplier"] },
          skill: { type: "string", description: "Required for skill_check, such as baton." },
          modifier: { type: "integer", description: "Required signed modifier for skill_check. A penalty such as Baton-2 means -2, never 0 or 2." },
          outcomes: outcomeSchema,
          target: { type: "string", description: "Required for damage_multiplier, such as knight-1." },
          damageTag: { type: "string", description: "Required for damage_multiplier, such as silver." },
          multiplier: { type: "number", exclusiveMinimum: 0, description: "Required for damage_multiplier. Double damage means 2." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_skill_check",
      description: "Resolve an accepted skill-check house rule through the engine. Never invent the roll, margin, or ruling ID.",
      parameters: {
        type: "object",
        required: ["actor", "rulingId"],
        properties: {
          actor: { type: "string", enum: ["adrian"] },
          rulingId: { type: "string", description: "The exact ID returned by save_house_rule, such as ruling-001." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_damage",
      description: "Resolve supplied basic damage against DR, then apply accepted matching post-DR house rules.",
      parameters: {
        type: "object",
        required: ["target", "damageTag", "basicDamage", "dr"],
        properties: {
          target: { type: "string" },
          damageTag: { type: "string", description: "The attack's material or damage tag, such as silver." },
          basicDamage: { type: "number", minimum: 0 },
          dr: { type: "number", minimum: 0 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "establish_fact",
      description: "Establish an objective scene fact judged true by the GM. Never use this merely for a character's claim.",
      parameters: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_claim",
      description: "Record something a PC or NPC said without establishing its content as an objective fact.",
      parameters: {
        type: "object",
        required: ["speaker", "text"],
        properties: {
          speaker: { type: "string" },
          text: { type: "string" },
        },
      },
    },
  },
];

function asArgs(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a nonempty string.`);
  return value;
}

function nonnegativeNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a finite number, 0 or more.`);
  }
  return value;
}

const LOCAL_TOOL_PROTOCOL = `Local tool protocol:
- Follow each tool schema exactly. A written penalty such as Baton-2 means modifier -2.
- Save a requested ruling before resolving it, using the exact returned ruling ID.
- If a tool returns an error, correct the call; never invent a successful result.
- Narrate only returned mechanical results. Never calculate or substitute an outcome yourself.`;

export class LocalLlgmGame {
  private readonly messages: OllamaMessage[] = [
    { role: "system", content: `${LLGM_SYSTEM_PROMPT}\n\n${LOCAL_TOOL_PROTOCOL}` },
  ];
  private readonly savedRules: SavedHouseRule[] = [];
  private readonly establishedFacts: string[] = [];
  private readonly recordedClaims: Claim[] = [];
  private readonly entries: JournalEntry[] = [];
  private readonly client: ChatClient;
  private readonly dice: DiceSource;
  private nextRuleId = 1;

  constructor(client: ChatClient, dice: DiceSource = new SystemDice()) {
    this.client = client;
    this.dice = dice;
  }

  get rules(): readonly SavedHouseRule[] { return this.savedRules; }
  get facts(): readonly string[] { return this.establishedFacts; }
  get claims(): readonly Claim[] { return this.recordedClaims; }
  get journal(): readonly JournalEntry[] { return this.entries; }

  async runTurn(input: string): Promise<string> {
    this.messages.push({ role: "user", content: input });
    this.entries.push({ kind: "player", text: input });

    for (let round = 0; round < 6; round += 1) {
      const response = await this.client.chat(this.messages, LLGM_TOOLS);
      const calls = response.tool_calls ?? [];
      this.messages.push({ role: "assistant", content: response.content, tool_calls: calls });

      if (calls.length === 0) {
        const narration = response.content.trim() || "(The LLGM returned no narration.)";
        this.entries.push({ kind: "narration", text: narration });
        return narration;
      }

      for (const call of calls) {
        const result = this.dispatch(call);
        this.entries.push({ kind: "tool", text: call.function.name, tool: call.function.name, result });
        this.messages.push({
          role: "tool",
          tool_name: call.function.name,
          content: JSON.stringify(result),
        });
      }
    }
    throw new Error("The LLGM exceeded six tool rounds without finishing its response.");
  }

  /** Execute one model tool request, returning a model-correctable error instead of throwing. */
  dispatch(call: OllamaToolCall): unknown {
    try {
      const args = asArgs(call.function.arguments);
      switch (call.function.name) {
        case "lookup_skill": return this.lookupSkill(args);
        case "save_house_rule": return this.saveHouseRule(args);
        case "resolve_skill_check": return this.resolveSkillCheck(args);
        case "resolve_damage": return this.resolveDamage(args);
        case "establish_fact": {
          const fact = requiredString(args, "text");
          this.establishedFacts.push(fact);
          return { status: "accepted", fact };
        }
        case "record_claim": {
          const claim = { speaker: requiredString(args, "speaker"), text: requiredString(args, "text") };
          this.recordedClaims.push(claim);
          return { status: "recorded_claim", claim, factEstablished: false };
        }
        default: return { error: `Unknown tool "${call.function.name}".` };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private lookupSkill(args: Record<string, unknown>): unknown {
    const actor = requiredString(args, "actor").toLowerCase();
    const skill = requiredString(args, "skill").toLowerCase();
    const baseSkill = ACTORS[actor]?.[skill];
    if (baseSkill === undefined) return { error: `${actor} has no demo-sheet entry for ${skill}.` };
    return { actor, skill, baseSkill };
  }

  private saveHouseRule(args: Record<string, unknown>): SavedHouseRule {
    // The wire format is flat for small local models. Accept the contract's
    // nested shape too, then restore the constant fields owned by this gateway.
    const nested = typeof args.ruling === "object" && args.ruling !== null && !Array.isArray(args.ruling)
      ? args.ruling as Record<string, unknown>
      : args;
    const rulingType = args.rulingType ?? nested.type;
    const ruling = rulingType === "damage_multiplier"
      ? {
          type: rulingType,
          target: nested.target,
          damageTag: nested.damageTag,
          multiplier: nested.multiplier,
          stage: "after_DR",
        }
      : {
          type: rulingType,
          skill: nested.skill,
          modifier: nested.modifier,
          outcomes: nested.outcomes,
        };
    const proposal = parseHouseRuleCase({
      type: "house_rule",
      scope: args.scope,
      exampleCase: args.exampleCase,
      ruling,
    });
    const saved = {
      ...proposal,
      id: `ruling-${String(this.nextRuleId).padStart(3, "0")}`,
      status: "accepted",
    } as SavedHouseRule;
    this.nextRuleId += 1;
    this.savedRules.push(saved);
    return saved;
  }

  private resolveSkillCheck(args: Record<string, unknown>): unknown {
    const actor = requiredString(args, "actor").toLowerCase();
    const rulingId = requiredString(args, "rulingId");
    const rule = this.savedRules.find((r) => r.id === rulingId && r.status === "accepted");
    if (!rule || rule.ruling.type !== "skill_check") {
      return { error: `${rulingId} is not an accepted skill-check house rule.` };
    }
    const baseSkill = ACTORS[actor]?.[rule.ruling.skill.toLowerCase()];
    if (baseSkill === undefined) {
      return { error: `${actor} has no demo-sheet entry for ${rule.ruling.skill}.` };
    }
    const resolution = resolveSkillCheckRuling(rule, baseSkill, this.dice);
    return {
      actor,
      rulingId,
      skill: rule.ruling.skill,
      baseSkill,
      modifier: rule.ruling.modifier,
      effectiveSkill: resolution.roll.effectiveSkill,
      total: resolution.roll.total,
      success: resolution.roll.success,
      critical: resolution.roll.critical,
      margin: resolution.roll.margin,
      outcome: resolution.outcome?.effect ?? null,
    };
  }

  private resolveDamage(args: Record<string, unknown>): unknown {
    const target = requiredString(args, "target");
    const damageTag = requiredString(args, "damageTag");
    const basicDamage = nonnegativeNumber(args, "basicDamage");
    const dr = nonnegativeNumber(args, "dr");
    const penetratingDamage = Math.max(0, basicDamage - dr);
    const result = applyAcceptedDamageMultipliers(penetratingDamage, target, damageTag, this.savedRules);
    return { basicDamage, dr, penetratingDamage, ...result };
  }
}
