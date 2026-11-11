# LLGM canonical actions and interaction scripts

Status: paper design only, for owner review. No GUI, production action router, remote provider, or new mechanical primitive is implemented by this document.

Related work: #53 (LLGM ruling contract), #55 and PR #56 (local Ollama adapter), and the owner's play traces on 2026-11-11.

## 1. Purpose

The local-model traces exposed three different problems that must not be collapsed into "the model failed to roll":

1. **Whether to resolve:** a natural follow-up action may be narrated without an engine call.
2. **Which resolver to use:** a ranged attack may be replaced by an invented generic skill-check house rule when no ranged tool is exposed.
3. **What inputs and narration are authoritative:** distance, speed, equipment, or other context may be dropped, and the narration may invent consequences absent from the engine result.

The answer is not one tool per rule or a second routing model. It is a small action gateway backed by deterministic resolvers. The LLGM interprets intent and narrates; it never executes formulas in prose.

This is also not a commitment to a graphical interface. Chat and possible controls are two input adapters for the same canonical actions. A text-only product can use the entire design below.

## 2. Genre-neutral foundation

The core interaction families are deliberately broader than combat:

- **Learn:** perceive, inspect, recall, ask, compare, infer, or discover.
- **Change position or arrangement:** move, approach, leave, ready, take, place, open, or otherwise alter the current situation.
- **Resolve conflict or uncertainty:** oppose someone, use a skill, fight, chase, persuade, or attempt an unscripted plan.

Combat is a major subset of conflict, not the frame for every scene. Social exchanges, investigations, puzzles, and exploration use the same separation of intent, action, resolution, and narration.

Genre and setting modules can later add entities, disclosures, rumors, clues, relationships, and other ontology. The base application needs only actors, current context, actions, facts, claims, and outcomes.

## 3. One canonical action plan

Chat and controls converge here:

```text
freeform player language ─┐
                          ├─> canonical action plan
context-sensitive control ─┘          │
                                      v
                           validation and rule registry
                                      │
                                      v
                           deterministic engine result
                                      │
                          authorized world-state update
                                      │
                                      v
                            narration and visible trace
```

A plan contains one or more explicit actions. Example:

```json
[
  {
    "action": "aim",
    "actor": "adrian",
    "subject": "pump_shotgun",
    "target": "rat",
    "seconds": 2
  },
  {
    "action": "ranged_attack",
    "actor": "adrian",
    "subject": "pump_shotgun",
    "target": "rat",
    "context": { "distance": 10, "targetSpeed": 1 }
  }
]
```

Fields name entities and context, not formulas. In particular, the LLGM does not supply `rangeModifier`, `damageMultiplier`, `accuracyBonus`, or a dice result for ordinary engine actions.

A result contains the mechanical evidence needed for narration and replay: action ID, accepted inputs, computed modifiers, rolls, margins, state changes, and any world disclosure authorized by the scenario. The trace displays this evidence on demand.

## 4. Registry and tool granularity

The registry describes action pipelines, not individual table rows:

```ts
interface ActionDefinition {
  id: string;
  required: string[];
  optional: string[];
  examples: string[];
  resolver: string; // Stable internal resolver ID, selected by code.
}
```

Speed/Range modifiers, the Damage Table, wounding modifiers, and individual defenses do not each need model-facing tools. They belong inside ranged, damage, and defense pipelines.

A useful initial conceptual vocabulary is:

- `inspect` — request visible or potentially discoverable information.
- `move` — change position or location when the current model supports it.
- `interact` — talk to or manipulate an entity without implicitly rolling.
- `skill_check` — use a sheet skill or attribute with declared context.
- `ready` — ready equipment or another legal combat subject.
- `aim` — aim a readied ranged weapon at a target.
- `melee_attack` and `ranged_attack` — enter the appropriate combat pipeline.
- `active_defense` — answer an attack with a legal defense.
- `contest` — resolve an applicable Quick Contest.

These are logical action types, not a claim that all are already exposed by the local adapter. The implementation should start with a few flat tools because small local models handled flat arguments more reliably than a large nested conditional schema. Internally, those tools can share one registry and gateway.

World-director operations remain separate: `establish_fact`, `record_claim`, and `save_house_rule` do not turn every player utterance into an engine action.

## 5. Clarifying questions and GURPS terms

GURPS terms can reveal a mechanical branch, but keywords alone do not execute a rule. The interpreter proposes a plan; the action definition identifies missing choices.

Ask a targeted question only when all of these hold:

1. A required choice is absent.
2. Different choices change the mechanics or the cost of the action.
3. Current context and the player's words do not already answer it.

Examples:

- "I shoot" does not trigger an Aim question.
- "I take aim and fire" can trigger one question about aim duration if duration matters and is unspecified.
- "I aim for two seconds and fire" needs no duration question.
- "Use Observation" is already a request to resolve Observation; do not ask "Would you like to use Observation?" again.

Never ask the player for ruling IDs, resolver IDs, or other internal identifiers. Do not ask for confirmation merely to make the model feel certain. An action preview and trace can make the plan visible without adding a confirmation loop.

## 6. Information without automatic dice

An Examine-style control requests information about the selected entity. It does not always mean Observation.

The current scene or adventure module can provide disclosure metadata:

```json
{
  "entity": "gallery_door",
  "visible": "The metal door is closed and its paint is peeling.",
  "disclosures": [
    {
      "id": "pressure_plate",
      "requires": { "skill": "observation" },
      "text": "A narrow pressure plate sits beneath the threshold."
    },
    {
      "id": "alarm_model",
      "requires": { "skill": "engineer" },
      "text": "The mechanism is a simple local alarm circuit."
    }
  ]
}
```

- Visible description requires no roll.
- Hidden sensory detail uses the stated sensory skill or attribute.
- Technical identification uses the stated knowledge or professional skill.
- Failure does not reveal hidden text or license invented details.
- Information unavailable to the character remains unavailable even after a roll unless the scenario says otherwise.

An adventure outline constrains facts, available entities, disclosures, objectives, and endings. It does not replace engine resolution or preordain a skill roll's result.

## 7. Ordinary rules versus house rules

An ordinary action uses its registered engine pipeline. The model must not create a house rule merely because the adapter has not yet exposed the appropriate resolver; missing tool coverage is an adapter defect to report and fix.

A house rule is appropriate when the situation genuinely lacks a covered mechanical path. It has an explicit scope and predeclared outcomes before its roll. A `this_attempt` ruling is not reused on a later attempt. The application assigns identity and acceptance, and the player never handles the ID.

Narration may describe only the returned mechanical outcome and disclosures authorized by the world state. It must not add dodging, awareness, injury, new NPCs, equipment, clues, or exits on its own.

## 8. Ten paper interaction scripts

The dice below are examples, not requests to hard-code play outcomes. "Control" describes a possible interface state; none of these controls is required by this design slice.

### 8.1 Ordinary visible description: no roll

**Player:** "Tell me more about the rusty door."

**Control:** The door is selected. Examine is available; Observation is not automatically started.

**Payload:**

```json
{ "action": "inspect", "actor": "adrian", "target": "rusty_door" }
```

**Rule path:** The inspector returns the door's visible description. No success roll and no hidden disclosure.

**Expected narration/trace:** "The metal door is closed, and rust runs down its outer face." Trace: `inspect -> visible description; no roll`.

### 8.2 Hidden sensory detail: Observation

**Player:** "I check the door for anything easy to miss."

**Control:** The door is selected. Examine offers Search; the player can also reach this through chat.

**Payload:**

```json
{ "action": "inspect", "actor": "adrian", "target": "rusty_door", "mode": "search" }
```

**Rule path:** Scene metadata selects Observation. The engine resolves Observation 12 with no unearned model modifier; scripted total 10 succeeds by 2. Success authorizes the pressure-plate disclosure.

**Expected narration/trace:** "A narrow pressure plate sits beneath the threshold." Trace: `Observation 12 + 0 = 12; roll 10; success by 2; disclosure pressure_plate`.

### 8.3 Technical identification: knowledge skill

**Player:** "Can I identify how this alarm circuit works?"

**Control:** The alarm is selected. Examine shows Identify because the scene supplies a technical disclosure.

**Payload:**

```json
{ "action": "inspect", "actor": "adrian", "target": "alarm_circuit", "mode": "identify" }
```

**Rule path:** Scene metadata selects the sheet's relevant Engineer specialty rather than Observation. For this example the sheet supplies effective Engineer 12; total 9 succeeds by 3 and authorizes the circuit-model disclosure.

**Expected narration/trace:** The narration explains only the technical information attached to that disclosure. Trace names Engineer, the formula, roll, margin, and disclosure ID. No extra weakness or bypass is invented.

### 8.4 "Shoot" versus "take aim and fire"

**Player A:** "I shoot the rat."

**Player B:** "I take aim with my shotgun and fire at the rat."

**Control:** Attack and Aim are separate actions. Selecting Aim exposes duration; selecting Fire alone does not.

**Payload A:**

```json
{ "action": "ranged_attack", "actor": "adrian", "subject": "pump_shotgun", "target": "rat" }
```

**Payload B, after any needed duration question:**

```json
[
  { "action": "aim", "actor": "adrian", "subject": "pump_shotgun", "target": "rat", "seconds": 2 },
  { "action": "ranged_attack", "actor": "adrian", "subject": "pump_shotgun", "target": "rat" }
]
```

**Rule path:** A enters ranged resolution without an aim bonus. B first establishes Aim, then the ranged pipeline applies the weapon's actual Acc and the two-second bonus from existing engine state.

**Expected narration/trace:** B's trace shows the Aim state and the source of its bonus. The model never supplies Acc. A does not silently receive it.

### 8.5 Attack without a readied weapon

**Player:** "I fire my shotgun at the guard." The shotgun is not ready.

**Control:** Fire is disabled with the reason "Shotgun is not ready"; Ready is available.

**Payload:** The interpreter cannot yet emit a legal attack. It asks one targeted question: "The shotgun is not ready. Ready it this turn?"

If accepted:

```json
{ "action": "ready", "actor": "adrian", "subject": "pump_shotgun" }
```

**Rule path:** Ready resolves without an attack roll. A later attack is a separate action under the combat turn rules.

**Expected narration/trace:** Adrian readies the shotgun. No shot, damage, ammo expenditure, or defensive reaction is narrated.

### 8.6 Moving ranged target

**Player:** "I shoot the rat 10 yards away, moving at 1 yard per second."

**Control:** The target and readied shotgun are selected; distance and speed can be edited in the action detail rather than typed as modifiers.

**Payload:**

```json
{
  "action": "ranged_attack",
  "actor": "adrian",
  "subject": "pump_shotgun",
  "target": "rat",
  "context": { "distance": 10, "targetSpeed": 1 }
}
```

**Rule path:** The existing ranged resolver computes the Speed/Range modifier, range limits, applicable aim and maneuver effects, attack roll, defense, damage, and ammo state from actual weapon and combat data.

**Expected narration/trace:** The trace shows distance, speed, computed modifiers, and each actual result. The narration does not say the rat dodged or became alert unless those results or state changes were returned.

### 8.7 Active-defense choice

**Player context:** A guard's resolved attack hits Mara unless she defends.

**Control:** A defense interrupt lists only currently legal choices with their computed scores and spent/unavailable reasons. Dodge, Parry, and Block are not three independent model tools.

**Player:** "Parry."

**Payload:**

```json
{ "action": "active_defense", "actor": "mara", "against": "attack-004", "defense": "parry" }
```

**Rule path:** The defense pipeline verifies legality and uses the existing defense formula and roll. The attack pipeline continues from that result.

**Expected narration/trace:** Trace identifies the defense, formula, roll, margin, and whether the attack continues to damage. An unavailable defense is refused with a reason, not silently replaced.

### 8.8 NPC statement: claim, not objective fact

**Player:** "I ask Miranda whether she entered the gallery. She answers, 'I was never in the gallery.'"

**Control:** Talk is available. Examine is unrelated; no dice icon appears merely because an NPC answered.

**Payload:**

```json
{ "action": "interact", "actor": "adrian", "target": "miranda", "mode": "talk", "topic": "entered_gallery" }
```

**Rule path:** Conversation proceeds without a success roll. The world journal records Miranda's answer as a claim with Miranda as speaker; `facts` remains unchanged.

**Expected narration/trace:** Miranda gives her answer. Trace: `record_claim; factEstablished: false`. A later Fast-Talk, Interrogation, or reaction attempt would be a separate mechanical action.

### 8.9 New ruling for prying after failed Baton

**Established state:** A metal rod exists in the scene. A previous Baton-2 `this_attempt` ruling failed and left a narrow gap.

**Player:** "I wedge the metal rod into the gap and pry the slat loose."

**Control:** No permanent Crowbar button is needed. Use Skill can show ST; chat can reach the same plan.

**Proposed ruling:** A new `this_attempt` ST-based skill-check ruling with outcomes declared before the roll. The old Baton ruling is not reused. For this example, ST 11 with modifier 0 is the proposed ruling, not a formula supplied as an ordinary GURPS rule.

**Resolution path:** The application validates and accepts the house rule, assigns its ID internally, and resolves ST 11 through the success-roll engine. Scripted total 10 succeeds by 1.

**Expected narration/trace:** `house_rule accepted -> ST 11 + 0 = 11; roll 10; success by 1; predeclared slat outcome`. The rod is not invented by the LLGM because its presence was already established.

### 8.10 Scene conclusion

**Established state:** The adventure outline's objective "recover the painting and secure the gallery" is complete.

**Player:** "I secure the scene and wait for the officers."

**Control:** The current objective is shown complete. Leave Scene or Continue is available only where the outline or current world state supplies a destination.

**Payload:** No combat or skill action is required. The application records the closing interaction and asks the world director for the authorized scene transition.

**Rule path:** Objective state and ending conditions are evaluated. No new mechanical roll is invented. A transition occurs only to an established destination or one chosen by the player.

**Expected narration/trace:** The scene closes with the painting and suspects secured. Trace: `objective complete -> scene ending reached`. The LLGM does not generate another corridor merely to continue asking "What next?"

## 9. Control real estate

Controls should be contextual rather than a permanent catalog of GURPS rules. A small exploration set might include Move, Examine, Interact, Use Skill, Inventory, and Journal. A combat set might include Attack, Aim, Ready, Move/Maneuver, Use Skill, and End Turn, with active defense appearing as an interrupt.

These labels are examples for testing, not approved visual design. The important constraint is that selecting an entity and a control emits the same canonical payload as a well-interpreted chat request. Unusual plans remain expressible in chat without adding permanent buttons for every possibility.

## 10. Questions for the owner

1. Should the canonical action plan always be visible before resolution in a compact preview, or appear only in the on-demand trace?
2. When a player says "take aim and fire" without a duration, should we ask about duration or use a declared one-second default?
3. Which controls deserve permanent space in exploration and combat after the ten scripts are reviewed?
4. Should an unsuccessful inspection ever offer a retry control, or should retries be governed entirely by the current scene and GM ruling?
5. Does the proposed `inspect` orchestration belong in the application layer, with disclosure metadata supplied by adventure modules, as assumed here?

## 11. Recommended implementation order after review

1. Turn the explicit/natural wording and dynamic-lever experiments into repeatable evaluations.
2. Add attribute-backed checks such as ST to the local adapter's sheet path.
3. Expose real ranged-attack resolution through the action gateway rather than generic house rules.
4. Implement the smallest adventure-outline disclosure and scene-ending fixture needed by the inspection and conclusion scripts.
5. Only then decide whether a graphical action bar improves the same canonical workflow.

No routing model is recommended at this stage. First make the available mechanical paths complete, explicit, and testable.
