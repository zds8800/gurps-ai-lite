# GURPS Lite world model: design (draft 1, for review)

Status: design only. Nothing is built. Kimi reads this, gives feedback (speed and cost first), builds only what looks settled, and asks questions about the rest. See section 12 for how we run that.

Rules sources: [rules success-rolls.md](rules%20success-rolls.md), [rules attributes-and-skills.md](rules%20attributes-and-skills.md), [tests success-roll-cases.md](tests%20success-roll-cases.md). Research source: the approved research brief (you approved it, so this file builds on it). Page numbers (p. N) are GURPS 4th Edition Lite pages.

## 1. Purpose and limits

A hard-coded TypeScript model of GURPS 4e Lite. It starts with ordinary success rolls and skill tests only. It serves two users at once: a person playing solo at a text prompt, and a program running millions of rolls in a loop. The same objects serve both.

**Nothing in this engine calls an LLM or uses RAG at runtime.** Every rule is code or a data table written from the Lite PDF. An AI can use the engine by calling it like any other library. The engine never asks a model anything.

Out of scope for now: combat, the hex board, anything beyond Lite. See section 11.

## 2. The objects

Five objects, all plain data (no methods that hide state), so they print, save and compare easily. Field names follow the GCS skill record where we have seen it (section 8).

### Attribute

One of ST, DX, IQ, HT, plus the two derived traits Will and Perception (p. 5, 6).

| Field | Type | Notes |
|---|---|---|
| id | "ST" , "DX", "IQ", "HT", "Will", "Per" | Stable key. |
| name | string | Display name. |
| base | number | 10 for the four basics (p. 4). |
| level | number | Current score. Can be 1 or higher (p. 4). |
| costPerLevel | number | ST and HT 10, DX and IQ 20 (pp. 4, 5). Null for derived. |
| derivedFrom | id or null | Will and Per are IQ (pp. 5, 6). Offsets are zero in Lite. |

Link: a Character owns its attributes; a Skill points at one attribute id.

### Skill

A skill definition (from the table) is separate from a skill a character has.

SkillDef (shared, read only, lives in the rules module):

| Field | Type | Notes |
|---|---|---|
| id | string | e.g. "lockpicking". |
| name | string | Display name. |
| attribute | Attribute id | Controlling attribute. This is the "difficulty" attribute half in GCS. |
| difficulty | "E" , "A", "H" | Lite has only Easy, Average and Hard (p. 13). No Very Hard. |
| defaults | Default[] | A Default is { from: Attribute id, penalty: number } (pp. 13, 15, 17). Some break the general rule (Throwing DX-3, Sex Appeal HT-3, Physician IQ-7). |
| tags | string[] | "combat" is parked for later. |
| page | number | Lite page for the entry. |

SkillRecord (belongs to one Character):

| Field | Type | Notes |
|---|---|---|
| skillId | string | Points at a SkillDef. |
| points | number | Points spent. 0 means the character has only the default. |
| specialization | string or null | Same name as in GCS. |
| bonus | number | Flat bonus from the sheet, default 0. |

### Character

| Field | Type | Notes |
|---|---|---|
| id, name | string | |
| attributes | Record of Attribute id to number | Just the four basic levels. Will and Per are computed. |
| skills | SkillRecord[] | |
| modifiers | Modifier[] | Standing modifiers, such as the off-hand -4 (pp. 5, 6). Each has a label, a value and tags. |
| pointTotal | number (computed) | From attribute costs plus skill points. |

### SuccessRoll (the request)

What someone asks the engine to do. Everything is explicit so a roll can be replayed.

| Field | Type | Notes |
|---|---|---|
| kind | "skill", "attribute", "raw" | Skill test, attribute test, or a bare target number. |
| characterId | string or null | Null for raw. |
| skillId / attributeId | string or null | The thing tested. |
| modifiers | Modifier[] | Situation modifiers for this roll. Cumulative (p. 2). |
| isDefense | boolean | Only defense rolls may go below effective skill 3 (pp. 2, 28). Stays false in the thin slice, since defense is combat. |

### RollResult (the answer)

| Field | Type | Notes |
|---|---|---|
| request | SuccessRoll | Link back to what was asked. |
| status | "rolled" , "not-allowed" | See the low-skill rule in section 4. |
| effectiveSkill | number | Base plus modifiers (R3). |
| dice | [n, n, n] | The three dice. |
| total | number | 3 to 18. |
| success | boolean | |
| critical | "none", "success", "failure" | |
| margin | number | Effective skill minus total. Positive on success, negative on failure (p. 2). |
| trace | string[] | Optional reasons, built only when asked (see section 6). |

Links: RollResult holds its SuccessRoll; SuccessRoll names a Character and one Skill or Attribute; Skill points at an Attribute; Character owns Attributes and SkillRecords.

## 3. Effective skill and defaults

Effective skill = base skill + sum of modifiers (R3, p. 2).

Base skill for a SkillRecord:

1. If points > 0: controlling attribute level + relative level from the Skill Cost Table (p. 13). Relative level by difficulty: Easy starts at attribute+0 for 1 point, Average at -1, Hard at -2; 2 points adds +1; 4 points adds +2 (the printed table in the attributes file, section 4). Levels past what the table prints use the engine note "each extra +1 costs 4 more points", marked as an assumption, not a Lite rule.
2. If points = 0: use the best default the character can use. A default is attribute level + penalty (Easy -4, Average -5, Hard -6 by the general rule, p. 13, with the listed exceptions). Take the highest default. If the skill has no default, the character cannot attempt it ("not-allowed", reason "no default").
3. Skill-to-skill defaults: Lite lists none, so the Default type only has attribute sources for now. The type leaves room for a skill source later.

The GCS formula (CalculateSkillLevel in skill.go) matches this shape: attribute level, plus the difficulty's base relative level, plus a step for points (1 point base, 2 or 3 points +1, 4 or more +1 plus floor(points/4)), then bonuses. We use the Lite table as the authority and GCS as a cross-check. The difference above 4 points (GCS adds floor(points/4); our table row for 8 points will be tested against it) is an open question in section 10.

Everything in this section is a pure function of numbers. No search, no allocation.

## 4. The success roll, step by step

Order of checks for a roll with effective skill S and dice total T (R1 to R7):

1. If S is below 3 and the roll is not a defense: status "not-allowed", no dice thrown (p. 2: "You may not attempt a success roll if your effective skill is less than 3 unless you are attempting a defense roll").
2. Throw 3d. T is 3 to 18.
3. T of 3 or 4: success and critical success, always. T of 17 or 18: failure, always (pp. 2, 12).
4. Otherwise success if T is at or under S.
5. Critical success: T 3 or 4; T 5 if S is 15 or more; T 6 if S is 16 or more.
6. Critical failure: T 18; T 17 if S is 15 or less; any T that is 10 or more over S.
7. Margin = S minus T.

### Your question: skill 1 or 2

You said a score of 1 or 2 should mean "only succeeds on a critical success". I checked the PDF (p. 2 and p. 28), and the book says something a little different:

- Attributes can be as low as 1 (p. 4). That part you have right.
- For an ordinary skill or attribute test, an effective skill below 3 means you may not attempt the roll at all. It is not "roll and hope for a critical". So the engine returns "not-allowed" with no dice.
- Defense rolls are the exception. On p. 28: a defense roll of 3 or 4 always succeeds "even if your effective defense score was only 1 or 2". That matches your instinct, but only for defense, which is combat and is parked.

Proposal: build the book's rule. Keep a switch in the rules module, `lowSkillMode`: "book" (not allowed, default) or "crit-only" (a 1 or 2 may roll and only 3 or 4 succeed). The switch is a house rule and is labelled as one. Question 1 in section 10 asks you to confirm.

Note the overlap in the book: at S 3, a roll of 3 or 4 succeeds, 5 is a plain failure unless it hits "10 over" (it does not). At S below 8, "10 over" can make a roll of 13 or more a critical failure; the test file covers this.

## 5. Seedable dice source

The engine never calls Math.random. It takes a DiceSource.

```ts
interface DiceSource {
  d6(): number;            // 1 to 6
  roll3d(): number;        // 3 to 18, fast path
}
```

Three implementations:

- **SeededDice(seed)**: a small 32-bit generator (mulberry32 or xoshiro128, both a few integer operations). Same seed gives the same sequence on any machine, so a simulation loop repeats exactly. It keeps one integer of state, so it can be saved and restored mid-run (`getState()` / `setState()`).
- **ScriptedDice(values[])**: returns a fixed list of dice, for tests. This is how the test cases pin an exact roll (the research found the same idea in gurps-combat-engine, which we read and do not copy because it has no license).
- **SystemDice**: wraps crypto random for real play when no seed is given.

Each die uses the top bits of the generator and rejection to avoid bias. For speed, `roll3d()` draws one 32-bit number and splits it into three dice (rejecting the few values that would bias a six-sided split).

Simulation loop:

```ts
const dice = new SeededDice(12345);
let wins = 0;
for (let i = 0; i < 1_000_000; i++) {
  if (rollFast(table, dice) & SUCCESS) wins++;
}
```

The seed is the only input to randomness. Log the seed with the results and anyone can rerun the loop. Child streams for parallel runs: `dice.split(n)` gives each worker its own seeded stream so runs do not depend on thread timing.

## 6. Fast and cheap at scale

The rules for one roll are a lookup. For each effective skill S from 3 to a cap, the outcome of each total T from 3 to 18 is fixed. So:

- **Outcome table.** At startup, build `OUTCOME[S][T]`, a Uint8Array packing success, critical success and critical failure into bits. S above the cap (for example 25) clamps to the 25 row, since higher skill changes nothing past 16 for crits and 18 for success. Memory is under 1 KB.
- **Hot path.** `rollFast(S, dice)` returns one small integer: the outcome bits plus the margin packed in. No object, no string, no array is created. A million rolls is a million table lookups and three dice.
- **Full path.** `resolve(request)` builds the RollResult object for text play and for logs. Strings in `trace` are built only if `explain: true`.
- **Closed-form odds.** For "what are my chances", skip rolling: the 3d distribution has 16 totals, and `successChance(S)` sums table entries. A 216-entry count table is precomputed once.
- **No hidden cost.** No JSON parsing per roll, no regular expressions, no lookups by string name inside loops. Skill and attribute ids are resolved to indexes once when a Character is loaded.
- **Batch API.** `rollMany(S, n, dice, histogram)` fills a typed array and returns counts, for simulations that only need totals.

These are our guesses about where cost sits. Kimi is asked to confirm them or point at something better (section 12).

## 7. Plain text solo interface

A command loop in `cli/solo.ts`. It reads a line, matches a fixed verb with plain string rules, and calls the engine. No language model and no fuzzy parsing.

Commands:

| Command | What it does |
|---|---|
| `new <name>` | Start a character at 10 in everything. |
| `set <ST/DX/IQ/HT> <n>` | Set a basic attribute. |
| `learn <skill> <points>` | Add a skill with points. |
| `sheet` | Print attributes, skills with effective levels, point total. |
| `test <skill or attribute> [+n or -n ...]` | Make a success roll with optional modifiers. |
| `odds <skill> [mods]` | Print the chance of success, no roll. |
| `seed <n>` | Seed the dice so a session repeats. |
| `skills [word]` | List skills from the Lite table. |
| `help`, `quit` | |

Sample exchange:

```
> seed 42
Dice seeded with 42.
> new Mara
Mara created. ST 10 DX 10 IQ 10 HT 10. 0 points spent.
> set DX 12
DX 12 (cost 40 points).
> learn lockpicking 2
Lockpicking (IQ, Average) at 2 points: IQ 10 + 1 = 11.
> test lockpicking -2
Lockpicking 11, modifier -2, effective skill 9.
Rolled 3d: 4 + 3 + 5 = 12.
Failure by 3. (margin -3)
> test lockpicking
Lockpicking 11. Rolled 3d: 2 + 3 + 4 = 9.
Success by 2. (margin +2)
> test lockpicking -9
Effective skill 2 is below 3. You may not attempt this roll (p. 2).
> odds lockpicking
Effective skill 11: 62.5% success, 1.9% critical success, 1.9% critical failure.
```

The odds line is worked from the 216 outcomes of 3d: 135 totals are 11 or under (62.5%). Critical success at skill 11 is a 3 or 4 (4 outcomes, 1.9%). Critical failure is a 17 or 18 (4 outcomes, 1.9%), because 17 counts at skill 15 or less.

Same commands can be fed from a file, so an AI or a script can play the same game.

## 8. How the GCS and calculator research shapes this

- **GCS skill record.** GCS stores a skill with a difficulty field (attribute plus level), points, specialization, defaults, prereqs, tech_level, weapons and features. We use the same words for `difficulty`, `points`, `specialization` and `defaults`, so a later .gcs importer is mostly renaming. We did not read a real .gcs file, so the wrapper and attribute storage are unknown; the importer waits on that.
- **GCS skill level formula.** Used as a cross-check on section 3 (see the 8 point question).
- **Licenses.** GCS code is MPL-2.0 and we write our own TypeScript with credit, not copied files. gurps-combat-engine has no license, so we copy ideas (seeded and scripted dice, tagged modifiers, plain-data results), not code. rpg-logic's critical thresholds do not match Lite, so it is a warning.
- **Calculator.** gurpscalculator.com is a behaviour check only. We could not read its skill or roll output, so it is not yet a test source. Only Collision and Fall Damage was visible, which is outside this slice.
- **Test style.** Table-driven tests with scripted dice, as in the research. The 98 named cases and the 288 pair grid in the tests file are the first suite.

## 9. Modular for later rules

The engine core knows only: attributes, a target number, dice, modifiers, and a result. Everything GURPS-specific sits in a **rules module** that registers itself:

```ts
interface RulesModule {
  id: string;                       // "lite-core"
  attributes?: AttributeDef[];
  skills?: SkillDef[];
  difficulties?: DifficultyDef[];
  modifierTags?: string[];
  resolvers?: Resolver[];           // success roll, later contests
  commands?: Command[];             // text commands it adds
  requires?: string[];              // other module ids
}
```

`lite-core` is the first module. A later module (Quick Contest, combat, a different book) adds data and resolvers without editing the core. Modules are plain TypeScript objects, loaded in order, like the plugin idea in the Morrowind and OpenMW construction set. Ids are namespaced ("lite-core:lockpicking") so modules do not collide. A module can override an earlier one's entry only by saying so.

## 10. Questions for you (and for Kimi)

1. **Low skill.** Build the book rule (below 3 is not allowed) with an optional crit-only switch? Or crit-only as the default?
2. **8 points and up.** Lite prints the cost table only so far. Use the "+1 per 4 points" reading, which matches GCS, and label it an assumption?
3. **Modifiers.** The book has no cap. Leave uncapped?
4. **Margin on a 3 or 4 that exceeds skill, or a 17 or 18 under skill.** The book is unclear. Report the arithmetic margin and flag it?
5. **Critical effects.** The book leaves them to the GM. Report the flag only, no effect table?
6. **Retries and secret rolls.** Skip in the thin slice?
7. **Quick Contest.** Next module after plain tests?

## 11. Left for later

- Combat: attacks, defenses, damage, maneuvers, hit locations, turn order.
- The hex board and any graphics.
- Quick Contests and other contests.
- Technology Level rules (p. 7), which we have not read.
- Advantages, disadvantages, spells and equipment.
- A .gcs importer and exporter.
- Skill-to-skill defaults (Lite lists none).
- Anything outside GURPS Lite. Check the Lite PDF's line on not incorporating the game into another product for distribution before we publish.

## 12. How we work with Kimi

Kimi does not build from this draft. The plan, by email to gurpsaiagent@gmail.com, with Kimi posting threads on the board:

1. **Draft 1** (this file): Kimi reads it and the three rules and test files. Kimi replies with feedback on speed and cost at scale (section 6 first), and flags anything that will be slow, wasteful or hard to test.
2. **Draft 2**: we fold in that feedback and your answers to section 10. Kimi replies again, and starts building only the parts that look settled (likely the dice sources, the outcome table and the test runner), and asks questions about what still needs refinement.
3. **Draft 3**: one more round on what is left (likely the text interface and module loader). Then Kimi builds the rest.

You approve every merge. Nothing is sent to Kimi until you say so.
