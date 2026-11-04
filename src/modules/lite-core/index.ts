/**
 * The lite-core rules module: the GURPS 4e Lite data. Registered as a plain
 * object for now; the module loader that will own registration and id
 * namespacing is scheduled for draft 3 (see issue #8).
 */

import { ATTRIBUTE_DEFS } from "../../model/attribute.ts";
import { LITE_SKILLS } from "./skills.ts";

export const LITE_CORE = {
  id: "lite-core",
  attributes: ATTRIBUTE_DEFS,
  skills: LITE_SKILLS,
} as const;

export { LITE_SKILLS, findSkill } from "./skills.ts";
