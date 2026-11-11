/**
 * The LLGM's deliberately small contract. Model input and output remain plain
 * data: this module has no model client, network access, or genre ontology.
 */

export const LLGM_SYSTEM_PROMPT = `You are a GURPS GM.

Your core loop: describe the world, query the player, request actions
or rulings through tools when required, update the world from the
results, and repeat.

Look up rules with tools. Where no rule exists, make a ruling. Identify
rulings as house_rule and save the example case.

Do not declare mechanical outcomes yourself; narrate engine results.
Do not request a roll without a constraint, threat, or dramatic stake.
Use margins of success and failure to scale consequences when degrees
of success/failure matter; specify any margin-dependent outcomes before
requesting the roll.

You judge facts about the world. PC and NPC claims are not automatically
established facts.`;

export const HOUSE_RULE_SCOPES = ["this_attempt", "this_scene", "this_campaign"] as const;
export type HouseRuleScope = (typeof HOUSE_RULE_SCOPES)[number];

export const PROPOSAL_STATUSES = ["proposed", "accepted", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * The highest applicable minimumMargin wins for the returned success/failure
 * side. Outcomes are declared before the roll; margins are nonnegative on each
 * side, matching the engine's normal margin convention.
 */
export interface MarginOutcome {
  success: boolean;
  minimumMargin: number;
  effect: string;
}

export interface SkillCheckRuling {
  type: "skill_check";
  skill: string;
  modifier: number;
  outcomes?: MarginOutcome[];
}

export interface DamageMultiplierRuling {
  type: "damage_multiplier";
  target: string;
  damageTag: string;
  multiplier: number;
  stage: "after_DR";
}

interface HouseRuleBase {
  type: "house_rule";
  scope: HouseRuleScope;
  exampleCase: string;
}

export interface SkillCheckHouseRule extends HouseRuleBase {
  ruling: SkillCheckRuling;
}

export interface DamageMultiplierHouseRule extends HouseRuleBase {
  ruling: DamageMultiplierRuling;
}

/** An LLGM proposal. Acceptance and identity are assigned by the application. */
export type HouseRuleCase = SkillCheckHouseRule | DamageMultiplierHouseRule;

/** A proposal after the application has entered it in its rule journal. */
export type SavedHouseRule = HouseRuleCase & {
  id: string;
  status: ProposalStatus;
};

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid house_rule: ${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid house_rule: ${path}.${key} must be a nonempty string.`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid house_rule: ${path}.${key} must be a finite number.`);
  }
  return value;
}

function parseOutcomes(value: unknown): MarginOutcome[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Invalid house_rule: ruling.outcomes must be an array.");
  return value.map((item, index) => {
    const path = `ruling.outcomes[${index}]`;
    const record = asRecord(item, path);
    if (typeof record.success !== "boolean") {
      throw new Error(`Invalid house_rule: ${path}.success must be boolean.`);
    }
    const minimumMargin = numberField(record, "minimumMargin", path);
    if (!Number.isInteger(minimumMargin) || minimumMargin < 0) {
      throw new Error(`Invalid house_rule: ${path}.minimumMargin must be a nonnegative integer.`);
    }
    return {
      success: record.success,
      minimumMargin,
      effect: stringField(record, "effect", path),
    };
  });
}

/** Validate and copy an untrusted LLGM house-rule proposal. */
export function parseHouseRuleCase(value: unknown): HouseRuleCase {
  const record = asRecord(value, "root");
  if (record.type !== "house_rule") throw new Error('Invalid house_rule: root.type must be "house_rule".');
  if (typeof record.scope !== "string" || !HOUSE_RULE_SCOPES.includes(record.scope as HouseRuleScope)) {
    throw new Error(`Invalid house_rule: scope must be one of ${HOUSE_RULE_SCOPES.join(", ")}.`);
  }
  const base = {
    type: "house_rule" as const,
    scope: record.scope as HouseRuleScope,
    exampleCase: stringField(record, "exampleCase", "root"),
  };
  const ruling = asRecord(record.ruling, "ruling");

  if (ruling.type === "skill_check") {
    const modifier = numberField(ruling, "modifier", "ruling");
    if (!Number.isInteger(modifier)) throw new Error("Invalid house_rule: ruling.modifier must be an integer.");
    return {
      ...base,
      ruling: {
        type: "skill_check",
        skill: stringField(ruling, "skill", "ruling"),
        modifier,
        outcomes: parseOutcomes(ruling.outcomes),
      },
    };
  }

  if (ruling.type === "damage_multiplier") {
    const multiplier = numberField(ruling, "multiplier", "ruling");
    if (multiplier <= 0) throw new Error("Invalid house_rule: ruling.multiplier must be greater than zero.");
    if (ruling.stage !== "after_DR") throw new Error('Invalid house_rule: ruling.stage must be "after_DR".');
    return {
      ...base,
      ruling: {
        type: "damage_multiplier",
        target: stringField(ruling, "target", "ruling"),
        damageTag: stringField(ruling, "damageTag", "ruling"),
        multiplier,
        stage: "after_DR",
      },
    };
  }

  throw new Error('Invalid house_rule: ruling.type must be "skill_check" or "damage_multiplier".');
}
