import type { JournalEntry } from "./game.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTool(entry: JournalEntry): string {
  const heading = `[tool] ${entry.tool ?? entry.text}`;
  const result = entry.result;
  if (entry.tool === "resolve_skill_check" && isRecord(result)
      && typeof result.baseSkill === "number" && typeof result.modifier === "number"
      && typeof result.effectiveSkill === "number" && typeof result.total === "number"
      && typeof result.success === "boolean" && typeof result.margin === "number") {
    const sign = result.modifier < 0 ? "-" : "+";
    const outcome = result.success ? `success by ${result.margin}` : `failure by ${result.margin}`;
    return `${heading}\n  Formula: ${result.baseSkill} ${sign} ${Math.abs(result.modifier)} = ${result.effectiveSkill}`
      + `\n  Roll: ${result.total}; ${outcome}; critical: ${String(result.critical)}`
      + `\n  Outcome: ${String(result.outcome)}`;
  }
  return `${heading}\n${JSON.stringify(result, null, 2)}`;
}

/** Human-readable engine/tool evidence for the requested journal entries. */
export function formatTrace(entries: readonly JournalEntry[]): string {
  if (entries.length === 0) return "(No turns to trace yet.)";
  return entries.map((entry) => {
    if (entry.kind === "tool") return formatTool(entry);
    if (entry.kind === "player") return `[player] ${entry.text}`;
    return `[narration] ${entry.text}`;
  }).join("\n\n");
}
