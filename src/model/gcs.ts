/**
 * .gcs importer (issue #13): loads a GCS 5 character sheet (JSON) into the
 * engine's Character model — the four basic attributes and the skill records.
 *
 * The field names and file shape follow GCS (GURPS Character Sheet) by
 * Richard A. Wilkes, https://github.com/richardwilkes/gcs, which is MPL-2.0
 * licensed. The format is used as a reference only; no GCS code or data
 * files are copied into this project.
 *
 * What the importer reads from a sheet:
 * - profile.name -> Character.name
 * - attributes[] -> ST/DX/IQ/HT as 10 + "adj" (the Lite base, p. 4).
 *   Secondary entries (hp, will, per, fp, basic_speed ...) are derived in
 *   Lite and ignored quietly.
 * - skills[] -> SkillRecords, recursing into containers. Anything that is
 *   not a plain Lite skill — containers, techniques, Very Hard or wildcard
 *   skills, names not in the Lite list, ambiguous names — is reported in
 *   the notes, never silently dropped.
 *
 * Point totals then agree with pointTotal() wherever the Lite rules cover
 * them (attributes and skills; traits and equipment are out of scope).
 */

import { ATTRIBUTE_BASE } from "./attribute.ts";
import type { AttributeId, Character } from "./attribute.ts";
import type { SkillRecord } from "./skill.ts";
import { pointsToRelativeLevel } from "./skill.ts";
import type { SkillDef } from "./skill.ts";
import type { Registry } from "../modules/loader.ts";

/** The imported character plus one note line per thing that needed a ruling. */
export interface GcsImport {
  character: Character;
  notes: string[];
}

const ATTRIBUTE_IDS: readonly AttributeId[] = ["ST", "DX", "IQ", "HT"];
const LITE_DIFFICULTY_KEYS = new Set(["e", "a", "h"]); // Lite has no Very Hard or wildcard (p. 13)

/** Lowercase, single-spaced, and without the "/TL" marker, for matching. */
function norm(text: string): string {
  return text.replace(/\/TL$/i, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The names a Lite skill answers to: its full name, and the part after "Family: ". */
function aliases(def: SkillDef): string[] {
  const full = norm(def.name);
  const names = [full];
  const split = full.indexOf(": ");
  if (split >= 0) names.push(full.slice(split + 2));
  return names;
}

type SkillMatch =
  | { kind: "found"; def: SkillDef }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "unknown" };

/** Find the Lite skill a GCS row means. "Thrown Weapon" + "Knife" resolves as "Thrown Weapon: Knife". */
function matchSkill(registry: Registry, name: string, specialization: string | null): SkillMatch {
  const candidates = specialization ? [`${norm(name)}: ${norm(specialization)}`, norm(name)] : [norm(name)];
  for (const candidate of candidates) {
    const hits = registry.listSkills().filter(({ skill }) => aliases(skill).includes(candidate));
    if (hits.length === 1) return { kind: "found", def: hits[0].skill };
    if (hits.length > 1) return { kind: "ambiguous", names: hits.map(({ skill }) => skill.name) };
  }
  return { kind: "unknown" };
}

/** GCS node kind: modern sheets key it off the id's first letter, legacy ones off "type". */
function nodeKind(node: Record<string, unknown>): "skill" | "container" | "technique" | "other" {
  const id = typeof node.id === "string" ? node.id : "";
  const type = typeof node.type === "string" ? node.type : "";
  if (id.startsWith("s")) return "skill";
  if (id.startsWith("S")) return "container";
  if (id.startsWith("q")) return "technique";
  if (type === "skill_container") return "container";
  if (type === "technique") return "technique";
  if (type === "skill" || Array.isArray(node.children)) return Array.isArray(node.children) ? "container" : "skill";
  return "skill";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Import one parsed .gcs sheet. Throws only when the value is not a GCS
 * character at all; every per-row problem becomes a note instead.
 */
export function importGcsSheet(json: unknown, registry: Registry): GcsImport {
  if (!isRecord(json) || (!Array.isArray(json.attributes) && !Array.isArray(json.skills))) {
    throw new Error(
      "Not a GCS character sheet: expected a JSON object with \"attributes\" and \"skills\" lists " +
        "(GCS 5 sheets; older GCS 4 XML files must be re-saved by GCS 5 first).",
    );
  }

  const notes: string[] = [];
  const profile = isRecord(json.profile) ? json.profile : {};
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "Unnamed";

  // --- Attributes: value is 10 + adj (Lite p. 4); missing entries stay at 10. ---
  const attributes: Record<AttributeId, number> = { ST: 10, DX: 10, IQ: 10, HT: 10 };
  const rows = Array.isArray(json.attributes) ? json.attributes.filter(isRecord) : [];
  for (const id of ATTRIBUTE_IDS) {
    const row = rows.find((r) => typeof r.attr_id === "string" && r.attr_id.toLowerCase() === id.toLowerCase());
    if (!row) {
      notes.push(`${id} is not listed in the file; using the base ${ATTRIBUTE_BASE}.`);
      continue;
    }
    const adj = asNumber(row.adj) ?? 0;
    if (!Number.isInteger(adj)) notes.push(`${id} adjustment ${adj} is not a whole number; rounding to the nearest whole level.`);
    attributes[id] = ATTRIBUTE_BASE + Math.round(adj);
  }

  // --- Skills: walk the list, flattening containers, one note per ruling. ---
  const skills: SkillRecord[] = [];
  const walk = (nodes: unknown[]): void => {
    for (const raw of nodes) {
      if (!isRecord(raw)) continue;
      const nodeName = typeof raw.name === "string" ? raw.name : "(unnamed)";
      const kind = nodeKind(raw);
      if (kind === "container") {
        notes.push(`"${nodeName}" is a grouping folder; its contents were loaded without the folder.`);
        walk(Array.isArray(raw.children) ? raw.children : []);
        continue;
      }
      if (kind === "technique") {
        notes.push(`"${nodeName}" is a technique; Lite has no techniques (p. 13), so it was left off.`);
        continue;
      }

      const difficultyText = typeof raw.difficulty === "string" ? raw.difficulty : "";
      const diffKey = difficultyText.split("/")[1]?.toLowerCase() ?? "";
      if (difficultyText && !LITE_DIFFICULTY_KEYS.has(diffKey)) {
        notes.push(`"${nodeName}" is ${difficultyText.toUpperCase()}; Lite has only Easy, Average and Hard skills (p. 13), so it was left off.`);
        continue;
      }

      const specialization =
        typeof raw.specialization === "string" && raw.specialization.trim() ? raw.specialization.trim() : null;
      const match = matchSkill(registry, nodeName, specialization);
      if (match.kind === "unknown") {
        notes.push(`"${nodeName}" is not in the Lite skill list (pp. 13-17); left off the sheet.`);
        continue;
      }
      if (match.kind === "ambiguous") {
        notes.push(
          `"${nodeName}" matches several Lite skills (${match.names.join("; ")}); left off — ` +
            `name it with its family in GCS (for example "Thrown Weapon" with speciality "Knife").`,
        );
        continue;
      }

      const points = asNumber(raw.points) ?? 0;
      if (points !== 0 && !Number.isInteger(points)) {
        notes.push(`"${nodeName}" has ${points} points; GURPS skill points are whole numbers. Kept as written.`);
      } else if (points > 0) {
        try {
          pointsToRelativeLevel(points, match.def.difficulty);
        } catch (error) {
          notes.push(`"${nodeName}": ${(error as Error).message}`);
        }
      }
      skills.push({ skillId: match.def.id, points, specialization });
    }
  };
  walk(Array.isArray(json.skills) ? json.skills : []);

  const id = typeof json.id === "string" ? json.id : name.toLowerCase().replace(/\s+/g, "-");
  return { character: { id, name, attributes, skills, modifiers: [] }, notes };
}
