/**
 * The module loader (design section 9). The engine core knows nothing about
 * GURPS; a rules module registers data (attributes, skills, and later
 * resolvers and commands). Modules are plain TypeScript objects, loaded in
 * order, like the plugin idea in the Morrowind/OpenMW construction set.
 *
 * Ids are namespaced on registration ("lite-core:lockpicking") so modules do
 * not collide. A module can replace an earlier module's entry only by naming
 * it in its `overrides` list.
 */

import type { AttributeDef } from "../model/attribute.ts";
import type { SkillDef } from "../model/skill.ts";

export interface RulesModule {
  id: string;
  attributes?: readonly AttributeDef[];
  skills?: readonly SkillDef[];
  /** Namespaced ids from earlier modules this module deliberately replaces. */
  overrides?: readonly string[];
}

export class Registry {
  private readonly attributes = new Map<string, AttributeDef>();
  private readonly skills = new Map<string, SkillDef>();

  load(module: RulesModule): void {
    const overrides = new Set(module.overrides ?? []);
    for (const attr of module.attributes ?? []) {
      const key = `${module.id}:${attr.id}`;
      if (this.attributes.has(key)) {
        throw new Error(`Module "${module.id}" redefines its own attribute "${attr.id}"`);
      }
      this.attributes.set(key, attr);
    }
    for (const skill of module.skills ?? []) {
      const key = skill.id.includes(":") ? skill.id : `${module.id}:${skill.id}`;
      if (this.skills.has(key) && !overrides.has(key)) {
        throw new Error(
          `Skill "${key}" is already registered. To replace it deliberately, ` +
            `list "${key}" in the module's overrides.`,
        );
      }
      this.skills.set(key, skill);
    }
  }

  /**
   * Look up a skill by namespaced id ("lite-core:lockpicking") or by bare id
   * ("lockpicking") when it is unambiguous across modules.
   */
  skill(ref: string): SkillDef | undefined {
    if (ref.includes(":")) return this.skills.get(ref);
    const matches = [...this.skills.entries()].filter(([key]) => key.endsWith(`:${ref}`));
    if (matches.length > 1) {
      const ids = matches.map(([k]) => k).join(", ");
      throw new Error(`Skill "${ref}" is ambiguous across modules: ${ids}. Use a namespaced id.`);
    }
    return matches[0]?.[1];
  }

  attribute(ref: string): AttributeDef | undefined {
    if (ref.includes(":")) return this.attributes.get(ref);
    const matches = [...this.attributes.entries()].filter(([k]) => k.endsWith(`:${ref}`));
    if (matches.length > 1) {
      const ids = matches.map(([k]) => k).join(", ");
      throw new Error(`Attribute "${ref}" is ambiguous across modules: ${ids}.`);
    }
    return matches[0]?.[1];
  }

  /** All registered skills, namespaced id first. */
  listSkills(): { id: string; skill: SkillDef }[] {
    return [...this.skills.entries()].map(([key, skill]) => ({ id: key, skill }));
  }
}
