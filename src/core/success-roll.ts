/**
 * The success roll itself (design section 4; order of checks per
 * tests/success-roll-cases.md). Two paths:
 *
 * - rollFast(): the hot path for simulation loops. One packed integer out,
 *   no object, no string, no array created.
 * - resolve(): the full path for text play and logs. Builds a RollResult;
 *   trace strings only when explain: true.
 */

import type { DiceSource } from "./dice.ts";
import {
  MIN_ROLLABLE_SKILL,
  OUTCOME_CRITICAL_FAILURE,
  OUTCOME_CRITICAL_SUCCESS,
  OUTCOME_SUCCESS,
  outcomeBits,
} from "./outcome-table.ts";
import type { Critical, Modifier, RollRequest, RollResult } from "./types.ts";

/* Packed-int layout for rollFast: bits 0-4 total, then outcome bits. */
export const PACK_SUCCESS = 1 << 5;
export const PACK_CRITICAL_SUCCESS = 1 << 6;
export const PACK_CRITICAL_FAILURE = 1 << 7;

export function packTotal(packed: number): number {
  return packed & 31;
}

/**
 * Hot path. Requires effective skill >= 3 (the low-skill check is the caller's
 * job, before any dice are drawn). Returns total and outcome bits in one int;
 * the margin is one subtraction at the call site (skill - total on success,
 * total - skill on failure), so uncapped skills (D5) cost nothing here.
 */
export function rollFast(skill: number, dice: DiceSource): number {
  const total = dice.roll3d();
  return (outcomeBits(skill, total) << 5) | total;
}

function sumModifiers(modifiers: readonly Modifier[] | undefined): number {
  if (!modifiers || modifiers.length === 0) return 0;
  let sum = 0;
  for (const m of modifiers) sum += m.value;
  return sum;
}

/** Full path: resolve one request into a RollResult. */
export function resolve(request: RollRequest, dice: DiceSource): RollResult {
  const trace: string[] | undefined = request.explain ? [] : undefined;
  const modifiers = request.modifiers ?? [];
  const lowSkillMode = request.lowSkillMode ?? "book";

  if (request.baseSkill === null) {
    trace?.push("No usable skill or default: the roll may not be attempted.");
    return {
      request,
      status: "not-allowed",
      effectiveSkill: null,
      total: null,
      success: false,
      critical: "none",
      margin: null,
      trace,
    };
  }

  const modSum = sumModifiers(modifiers);
  const effectiveSkill = request.baseSkill + modSum;
  trace?.push(
    `Base skill ${request.baseSkill}` +
      (modSum !== 0 ? ` with modifiers ${formatSigned(modSum)}` : "") +
      ` gives effective skill ${effectiveSkill}.`,
  );

  if (effectiveSkill < MIN_ROLLABLE_SKILL && lowSkillMode === "book") {
    trace?.push(
      `Effective skill ${effectiveSkill} is below ${MIN_ROLLABLE_SKILL}: ` +
        "you may not attempt a success roll (Lite p. 2).",
    );
    return {
      request,
      status: "not-allowed",
      effectiveSkill,
      total: null,
      success: false,
      critical: "none",
      margin: null,
      trace,
    };
  }

  // House rule (D4, labelled as such): "crit-only" lets skill 1 or 2 roll;
  // only a 3 or 4 succeeds. Crit-failure checks still apply normally.
  const critOnly = effectiveSkill < MIN_ROLLABLE_SKILL;
  const total = dice.roll3d();

  let success: boolean;
  let critical: Critical;
  if (critOnly) {
    success = total <= 4;
    critical =
      total <= 4
        ? "success"
        : total === 18 || total === 17 || total - effectiveSkill >= 10
          ? "failure"
          : "none";
    trace?.push(
      `House rule crit-only: effective skill ${effectiveSkill} rolls; only 3 or 4 succeeds.`,
    );
  } else {
    const bits = outcomeBits(effectiveSkill, total);
    success = (bits & OUTCOME_SUCCESS) !== 0;
    critical =
      (bits & OUTCOME_CRITICAL_SUCCESS) !== 0
        ? "success"
        : (bits & OUTCOME_CRITICAL_FAILURE) !== 0
          ? "failure"
          : "none";
  }

  // Margin convention per the approved cases (and D2): margin of success is
  // skill - total, margin of failure is total - skill; negative margins appear
  // only when an automatic result contradicts the arithmetic.
  const margin = success ? effectiveSkill - total : total - effectiveSkill;
  trace?.push(
    `Rolled ${total} against effective skill ${effectiveSkill}: ` +
      (success ? `success by ${margin}` : `failure by ${margin}`) +
      (critical === "none" ? "." : ` (${critical}).`),
  );

  return {
    request,
    status: "rolled",
    effectiveSkill,
    total,
    success,
    critical,
    margin,
    trace,
  };
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
