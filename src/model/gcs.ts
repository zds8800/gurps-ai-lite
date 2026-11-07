/**
 * .gcs importer (issue #13): loads a GCS 5 character sheet (JSON) into the
 * engine's Character model — attributes, skill records, and Lite equipment.
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
 * - equipment[] -> owned Lite gear, recursing into containers. GCS's
 *   "equipped" flag readies weapons and shields and wears armor. Unknown
 *   items and competing ready/worn slots are reported in the notes.
 *
 * Point totals then agree with pointTotal() wherever the Lite rules cover
 * them (attributes, skills and Wealth; owned equipment has no point cost).
 * Traits remain out of scope.
 */

import { ATTRIBUTE_BASE } from "./attribute.ts";
import type { AttributeId, Character, EquipmentItem } from "./attribute.ts";
import { findArmor, findMeleeWeapon, findRangedWeapon, findShield } from "./equipment.ts";
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

/** Equipment containers use an uppercase E id; ordinary equipment uses lowercase e. */
function equipmentNodeKind(node: Record<string, unknown>): "equipment" | "container" {
  const id = typeof node.id === "string" ? node.id : "";
  const type = typeof node.type === "string" ? node.type : "";
  if (id.startsWith("E") || type === "equipment_container") return "container";
  if (type === "equipment" || Array.isArray(node.children)) {
    return Array.isArray(node.children) ? "container" : "equipment";
  }
  return "equipment";
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

  // --- Equipment: own every Lite item; "equipped" controls ready/worn state. ---
  const equipment: EquipmentItem[] = [];
  let readyMelee: string | undefined;
  let readyRanged: string | undefined;
  let readyShield: string | undefined;
  let wornArmor: string | undefined;

  const claimSlot = (slot: string, current: string | undefined, itemName: string): boolean => {
    if (current && current !== itemName) {
      notes.push(
        `"${itemName}" is equipped, but "${current}" already occupies the ${slot} slot; ` +
          `"${itemName}" remains owned but is not readied/worn.`,
      );
      return false;
    }
    return true;
  };

  const walkEquipment = (nodes: unknown[]): void => {
    for (const raw of nodes) {
      if (!isRecord(raw)) continue;
      const nodeName = typeof raw.name === "string" ? raw.name : "(unnamed)";
      if (equipmentNodeKind(raw) === "container") {
        notes.push(`"${nodeName}" is an equipment grouping folder; its contents were loaded without the folder.`);
        walkEquipment(Array.isArray(raw.children) ? raw.children : []);
        continue;
      }

      const armor = findArmor(nodeName);
      const shield = findShield(nodeName);
      const melee = findMeleeWeapon(nodeName);
      const ranged = melee ? null : findRangedWeapon(nodeName);
      const found = armor ?? shield ?? melee ?? ranged;
      if (!found) {
        notes.push(`"${nodeName}" is not in the Lite equipment tables (pp. 18-22); left off the sheet.`);
        continue;
      }

      const quantityValue = raw.quantity ?? 1;
      const quantity = asNumber(quantityValue);
      if (quantity === null || !Number.isInteger(quantity) || quantity < 0) {
        notes.push(`"${nodeName}" has invalid quantity ${JSON.stringify(quantityValue)}; expected a non-negative whole number. Left off.`);
        continue;
      }
      if (quantity === 0) continue;

      const item: EquipmentItem = { name: found.name };
      const rawST = raw.st ?? raw.strength;
      const ownST = asNumber(rawST);
      if (rawST !== undefined && (ownST === null || !Number.isInteger(ownST) || ownST < 1)) {
        notes.push(`"${nodeName}" has invalid weapon ST ${JSON.stringify(rawST)}; expected a positive whole number. ST was left unset.`);
      } else if (ranged?.usesOwnST && ownST !== null) {
        item.st = ownST;
      }
      for (let i = 0; i < quantity; i++) equipment.push({ ...item });

      if (raw.equipped !== true) continue;
      if (armor && claimSlot("worn armor", wornArmor, armor.name)) wornArmor = armor.name;
      if (shield && claimSlot("ready shield", readyShield, shield.name)) readyShield = shield.name;
      if (melee) {
        if (claimSlot("ready melee weapon", readyMelee, melee.name)) readyMelee = melee.name;
        const thrown = findRangedWeapon(`${melee.name} (thrown)`);
        if (thrown && claimSlot("ready ranged weapon", readyRanged, thrown.name)) readyRanged = thrown.name;
      }
      if (ranged && claimSlot("ready ranged weapon", readyRanged, ranged.name)) readyRanged = ranged.name;
    }
  };
  walkEquipment(Array.isArray(json.equipment) ? json.equipment : []);

  const id = typeof json.id === "string" ? json.id : name.toLowerCase().replace(/\s+/g, "-");
  const character: Character = { id, name, attributes, skills, modifiers: [], equipment };
  if (readyMelee) character.readyMelee = readyMelee;
  if (readyRanged) character.readyRanged = readyRanged;
  if (readyShield) character.readyShield = readyShield;
  if (wornArmor) character.wornArmor = wornArmor;
  return { character, notes };
}
