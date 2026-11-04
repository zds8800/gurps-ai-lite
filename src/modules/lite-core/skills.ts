/**
 * The GURPS 4th Edition Lite skill list as data (rules/attributes-and-skills.md
 * section 6, pp. 13-17). Family rows (Melee Weapon, Missile Weapon, Thrown
 * Weapon, Vehicle Skills) are represented by their sub-skills, each a plain
 * skill with the family default; the family headers themselves are not usable
 * skills. Vehicle skills carry only their DX default for now — the book's
 * "motor vehicles also default to IQ at similar penalties" (p. 17) is noted
 * in the rules file but not precise enough to encode yet.
 */

import type { SkillDef } from "../../model/skill.ts";

function def(
  id: string,
  name: string,
  attribute: SkillDef["attribute"],
  difficulty: SkillDef["difficulty"],
  defaultPenalty: number | null,
  page: number,
  flags: { tl?: boolean; combat?: boolean } = {},
): SkillDef {
  return {
    id,
    name,
    attribute,
    difficulty,
    defaults: defaultPenalty === null ? [] : [{ from: attribute, penalty: defaultPenalty }],
    tl: flags.tl ?? false,
    combat: flags.combat ?? false,
    page,
  };
}

export const LITE_SKILLS: readonly SkillDef[] = [
  // --- Main list (pp. 13-17) ---
  def("acrobatics", "Acrobatics", "DX", "H", -6, 13),
  def("acting", "Acting", "IQ", "A", -5, 13),
  def("animal-handling", "Animal Handling", "IQ", "A", -5, 14),
  def("area-knowledge", "Area Knowledge", "IQ", "E", -4, 14),
  def("armoury", "Armoury/TL", "IQ", "A", -5, 14, { tl: true }),
  def("brawling", "Brawling", "DX", "E", null, 14, { combat: true }),
  def("camouflage", "Camouflage", "IQ", "E", -4, 14),
  def("carousing", "Carousing", "HT", "E", -4, 14),
  def("climbing", "Climbing", "DX", "A", -5, 14),
  def("computer-operation", "Computer Operation/TL", "IQ", "E", -4, 14, { tl: true }),
  def("computer-programming", "Computer Programming/TL", "IQ", "H", null, 14, { tl: true }),
  def("crewman", "Crewman/TL", "IQ", "E", -4, 14, { tl: true }),
  def("criminology", "Criminology/TL", "IQ", "A", -5, 14, { tl: true }),
  def("diagnosis", "Diagnosis/TL", "IQ", "H", -6, 14, { tl: true }),
  def("disguise", "Disguise/TL", "IQ", "A", -5, 14, { tl: true }),
  def("electronics-operation", "Electronics Operation/TL", "IQ", "A", -5, 14, { tl: true }),
  def("electronics-repair", "Electronics Repair/TL", "IQ", "A", -5, 14, { tl: true }),
  def("engineer", "Engineer/TL", "IQ", "H", null, 14, { tl: true }),
  def("environment-suit", "Environment Suit/TL", "DX", "A", -5, 14, { tl: true }),
  def("escape", "Escape", "DX", "H", -6, 14),
  def("explosives", "Explosives/TL", "IQ", "A", -5, 14, { tl: true }),
  def("first-aid", "First Aid/TL", "IQ", "E", -4, 14, { tl: true }),
  def("forgery", "Forgery/TL", "IQ", "H", -6, 14, { tl: true }),
  def("gambling", "Gambling", "IQ", "A", -5, 14),
  def("hiking", "Hiking", "HT", "A", -5, 14),
  def("holdout", "Holdout", "IQ", "A", -5, 15),
  def("humanities", "Humanities", "IQ", "H", -6, 15),
  def("diplomacy", "Influence: Diplomacy", "IQ", "H", -6, 15),
  def("fast-talk", "Influence: Fast-Talk", "IQ", "A", -5, 15),
  def("intimidation", "Influence: Intimidation", "IQ", "A", -5, 15),
  def("savoir-faire", "Influence: Savoir-Faire", "IQ", "E", -4, 15),
  def("sex-appeal", "Influence: Sex Appeal", "HT", "A", -3, 15),
  def("streetwise", "Influence: Streetwise", "IQ", "A", -5, 15),
  def("interrogation", "Interrogation", "IQ", "A", -5, 15),
  def("jumping", "Jumping", "DX", "E", null, 15),
  def("karate", "Karate", "DX", "H", null, 15, { combat: true }),
  def("law", "Law", "IQ", "H", -6, 15),
  def("leadership", "Leadership", "IQ", "A", -5, 15),
  def("lockpicking", "Lockpicking/TL", "IQ", "A", -5, 15, { tl: true }),
  def("mathematics", "Mathematics/TL", "IQ", "H", -6, 15, { tl: true }),
  def("mechanic", "Mechanic/TL", "IQ", "A", -5, 15, { tl: true }),
  def("merchant", "Merchant", "IQ", "A", -5, 15),
  def("natural-sciences", "Natural Sciences/TL", "IQ", "H", -6, 16, { tl: true }),
  def("naturalist", "Naturalist", "IQ", "H", -6, 16),
  def("navigation", "Navigation/TL", "IQ", "A", -5, 16, { tl: true }),
  def("observation", "Observation", "IQ", "A", -5, 16),
  def("occultism", "Occultism", "IQ", "A", -5, 16),
  def("photography", "Photography/TL", "IQ", "A", -5, 16, { tl: true }),
  def("physician", "Physician/TL", "IQ", "H", -7, 16, { tl: true }),
  def("pickpocket", "Pickpocket", "DX", "H", -6, 16),
  def("public-speaking", "Public Speaking", "IQ", "A", -5, 16),
  def("research", "Research/TL", "IQ", "A", -5, 16, { tl: true }),
  def("riding", "Riding", "DX", "A", -5, 16),
  def("scrounging", "Scrounging", "IQ", "E", -4, 16),
  def("search", "Search", "IQ", "A", -5, 16),
  def("shadowing", "Shadowing", "IQ", "A", -5, 16),
  def("shield", "Shield", "DX", "E", -4, 16, { combat: true }),
  def("social-sciences", "Social Sciences", "IQ", "H", -6, 16),
  def("smuggling", "Smuggling", "IQ", "A", -5, 16),
  def("stealth", "Stealth", "DX", "A", -5, 17),
  def("survival", "Survival", "IQ", "A", -5, 17),
  def("swimming", "Swimming", "HT", "E", -4, 17),
  def("tactics", "Tactics", "IQ", "H", -6, 17),
  def("throwing", "Throwing", "DX", "A", -3, 17),
  def("tracking", "Tracking", "IQ", "A", -5, 17),
  def("traps", "Traps/TL", "IQ", "A", -5, 17, { tl: true }),
  def("writing", "Writing", "IQ", "A", -5, 17),

  // --- Melee Weapon sub-skills (p. 15, combat; defaults DX-4 E, DX-5 A, DX-6 H) ---
  def("rapier", "Melee Weapon: Rapier", "DX", "A", -5, 15, { combat: true }),
  def("smallsword", "Melee Weapon: Smallsword", "DX", "A", -5, 15, { combat: true }),
  def("flail", "Melee Weapon: Flail", "DX", "H", -6, 15, { combat: true }),
  def("axe-mace", "Melee Weapon: Axe/Mace", "DX", "A", -5, 15, { combat: true }),
  def("polearm", "Melee Weapon: Polearm", "DX", "A", -5, 15, { combat: true }),
  def("spear", "Melee Weapon: Spear", "DX", "A", -5, 15, { combat: true }),
  def("staff", "Melee Weapon: Staff", "DX", "A", -5, 15, { combat: true }),
  def("broadsword", "Melee Weapon: Broadsword", "DX", "A", -5, 15, { combat: true }),
  def("shortsword", "Melee Weapon: Shortsword", "DX", "A", -5, 15, { combat: true }),
  def("two-handed-sword", "Melee Weapon: Two-Handed Sword", "DX", "A", -5, 15, { combat: true }),
  def("knife", "Melee Weapon: Knife", "DX", "E", -4, 15, { combat: true }),

  // --- Missile Weapon sub-skills (pp. 15-16, combat) ---
  def("gunner", "Missile Weapon: Gunner", "DX", "E", -4, 15, { combat: true }),
  def("guns", "Missile Weapon: Guns", "DX", "E", -4, 16, { combat: true }),
  def("flamethrower", "Missile Weapon: Flamethrower", "DX", "E", -4, 16, { combat: true }),
  def("blowpipe", "Missile Weapon: Blowpipe", "DX", "H", -6, 16, { combat: true }),
  def("bow", "Missile Weapon: Bow", "DX", "A", -5, 16, { combat: true }),
  def("crossbow", "Missile Weapon: Crossbow", "DX", "E", -4, 16, { combat: true }),

  // --- Thrown Weapon sub-skills (p. 17, combat; all Easy, DX-4) ---
  def("thrown-axe-mace", "Thrown Weapon: Axe/Mace", "DX", "E", -4, 17, { combat: true }),
  def("thrown-knife", "Thrown Weapon: Knife", "DX", "E", -4, 17, { combat: true }),
  def("thrown-shuriken", "Thrown Weapon: Shuriken", "DX", "E", -4, 17, { combat: true }),
  def("thrown-spear", "Thrown Weapon: Spear", "DX", "E", -4, 17, { combat: true }),

  // --- Vehicle Skills sub-skills (p. 17) ---
  def("bicycling", "Vehicle: Bicycling", "DX", "E", -4, 17),
  def("boating", "Vehicle: Boating", "DX", "A", -5, 17),
  def("driving", "Vehicle: Driving", "DX", "A", -5, 17),
  def("piloting", "Vehicle: Piloting", "DX", "A", -5, 17),
  def("submarine", "Vehicle: Submarine", "DX", "A", -5, 17),
];

export function findSkill(id: string): SkillDef | undefined {
  return LITE_SKILLS.find((s) => s.id === id);
}
