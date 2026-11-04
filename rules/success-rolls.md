# Success rolls (GURPS 4th Edition Lite)

Source: GURPS 4th Edition Lite PDF on the project. Page numbers are the printed page numbers in the book (the PDF has the same numbering as its page index). Quotes are word for word from the book. Nothing here comes from other GURPS books. Anything the book does not say is listed under "Open questions" at the end, not filled in.

Items marked **[derived]** are worked out from a quoted rule with no new content, so you can check the arithmetic.

---

## R1. The dice (p. 2)

- GURPS uses six-sided dice only. (p. 2, The Basics: "GURPS uses six-sided dice only.")
- A success roll is three dice added together. (p. 2, What to Roll: "roll three dice to determine the outcome. This is called a success roll." Later text writes it as "roll 3d".)
- Range of one roll **[derived]**: 3 to 18.
- The book names three basic mechanics: success rolls, reaction rolls and damage rolls. (p. 2) Only success rolls are covered in this file.

## R2. When a roll succeeds (p. 2)

- Roll 3d and compare it to the number that governs the action, most often a skill or an attribute. The task succeeds if the total "is less than or equal to" that number. Otherwise it fails. (p. 2, What to Roll)
- Example in the book: rolling against ST 12, a roll of 12 or less succeeds. (p. 2)
- A higher target number makes the roll easier. (p. 2)
- Skills use the same test: "If the number you roll is less than or equal to your modified score for that skill, you succeed!" (p. 12, Skills)

## R3. Base skill, modifiers and effective skill (p. 2)

- Base skill: "your actual level in a skill, as recorded on your character sheet." (p. 2)
- Effective skill: "your base skill plus or minus any modifiers for that task." (p. 2)
- Modifiers change the target number, not the dice total. Bonuses improve the odds and penalties reduce them. (p. 2, Modifiers)
- Modifiers are cumulative unless the rules say otherwise. (p. 2)
- Book examples (p. 2), base Lockpicking 9:
  - In the dark, -5: effective skill 4.
  - Primitive lock, +10: effective skill 19.
  - Both: 9 - 5 + 10 = 14.
- Minimum to roll: "You may not attempt a success roll if your effective skill is less than 3 unless you are attempting a defense roll (p. 28)." (p. 2)
- Pseudo-formula **[derived]**: effective skill = base skill + sum of all modifiers.

## R4. Margin of success and margin of failure (p. 2)

- Success: roll is less than or equal to effective skill. Margin of success = effective skill minus the roll. Example: effective skill 18, roll 12, margin of success 6. (p. 2)
- Failure: roll is greater than effective skill. Margin of failure = the roll minus effective skill. Example: effective skill 9, roll 12, margin of failure 3. (p. 2)
- "Many rules use margin of success or failure to calculate results that matter in play, so be sure to note it when you roll." (p. 2) The engine should always return the margin.
- Examples of the margin in use: Quick Contest and Margin of Victory (p. 3); a failed Hold Breath-style check that counts seconds by margin of failure (p. 24, "seconds equal to the margin of your failure, plus 2d"); knockdown fails to unconsciousness on a failure by 5 or more (p. 30). These belong to later slices.

## R5. Automatic success and automatic failure (p. 2, p. 12)

- "Regardless of the score you are rolling against, a roll of 3 or 4 is always a success, while a roll of 17 or 18 is always a failure." (p. 2)
- Skills page repeats the failure half: "a roll of 17 or 18 is an automatic failure." (p. 12)
- Attack rolls repeat the success half: "No matter what your skill, a roll of 3 or 4 always hits, and is a critical hit." (p. 27, attacks, shown for context only)
- Order of checks **[derived]**: a roll of 3 or 4 succeeds, a roll of 17 or 18 fails, and any other roll is compared to effective skill.
- Book example of why this matters: effective skill 19 does not guarantee success, because 17 and 18 still fail. (p. 2, "Not quite - see Critical Success and Failure")

## R6. Critical success (p. 2)

- A roll of 3 or 4 is always a critical success.
- A roll of 5 is a critical success if effective skill is 15 or more.
- A roll of 6 is a critical success if effective skill is 16 or more.
- Effect: "the GM determines what happens. It is always something good! The lower the roll, the better the 'bonus' he gives you." (p. 2)
- Attack rolls state the same thresholds in different words: skill 15 means 5 or less is a critical hit, skill 16 or more means 6 or less. (p. 27, context only)

## R7. Critical failure (p. 2, continued on p. 3)

- A roll of 18 is always a critical failure.
- A roll of 17 is a critical failure if effective skill is 15 or less. Otherwise it is an ordinary failure.
- Any roll 10 or more greater than effective skill is a critical failure: "16 on a skill of 6, 15 on a skill of 5, and so on."
- Effect: "the GM determines what happens. It is always something bad - the higher the roll, the worse the result." (p. 3)

## R8. Threshold table by effective skill **[derived]**

Built only from R5, R6 and R7. "Crit fail by 10" means roll is at least skill + 10. Effective skill below 3 cannot be rolled (R3) except for defense rolls.

| Effective skill | Auto success | Critical success on | Critical failure on | Auto failure |
|---|---|---|---|---|
| 3 | 3, 4 | 3, 4 | 13 or more (by 10), 18 | 17, 18 |
| 4 | 3, 4 | 3, 4 | 14 or more, 18 | 17, 18 |
| 5 | 3, 4 | 3, 4 | 15 or more | 17, 18 |
| 6 | 3, 4 | 3, 4 | 16 or more | 17, 18 |
| 7 | 3, 4 | 3, 4 | 17, 18 | 17, 18 |
| 8 to 14 | 3, 4 | 3, 4 | 18 (17 also, since skill is 15 or less) | 17, 18 |
| 15 | 3, 4 | 3, 4, 5 | 17, 18 | 17, 18 |
| 16 and up | 3, 4 | 3, 4, 5, 6 | 18 only | 17, 18 |

Notes on the table: for skills 8 to 14 and 15 the critical failures are 17 and 18, and 16 or more is a failure by 10 only for skills 6 or lower. At skill 16 and up, a 17 is an ordinary failure. The skill 5 and skill 6 rows also include 17 and 18 by the 15-or-less rule, so those rows read "15 or more", "16 or more" with 17 and 18 inside the range. The skill 7 row follows from 17 being 10 over 7.

## R9. Reference test cases from the book's own examples (pp. 2)

| Effective skill | Roll | Expected result |
|---|---|---|
| 18 | 12 | Success, margin of success 6 |
| 9 | 12 | Failure, margin of failure 3 |
| 4 | any | Effective skill 9 - 5 (dark Lockpicking) |
| 19 | 17 or 18 | Failure (automatic) |
| 14 | n/a | 9 - 5 + 10 (both Lockpicking modifiers) |

(Rows with "n/a" or "any" test effective skill arithmetic, not a roll.)

---

## Open questions (the book leaves these unsaid)

1. **Critical success and failure effects.** The book says only "the GM determines what happens" (p. 2, p. 3). Lite names a few special cases (for example Forgery on p. 14 and Climbing on p. 22) but has no general table. Decision: does the engine return only a flag, or also a severity such as the roll value and margin?
2. **Margin on an automatic result.** A roll of 3 or 4 always succeeds and 17 or 18 always fails, but the book does not say what the margin is when the arithmetic disagrees. Example: effective skill 3 and roll 4 (an automatic success whose margin would be -1), or effective skill 19 and roll 17 (an automatic failure whose margin would be -2). Decision: report the raw difference, or clamp to 0?
3. **Effective skill of exactly 3 and rolls of 3 or 4.** The book allows a roll at effective skill 3 and says 4 always succeeds. Whether a 4 at skill 3 is also "a success by margin -1" is not stated (same as question 2).
4. **Effective skill below 3.** The book forbids the roll except for defense rolls (p. 2). It does not say what happens to a character who would otherwise have to roll, or whether the 3 and 4 automatic success still applies when the roll is barred. Decision: return a "cannot attempt" result, and when does a defense override apply (defense is outside the first slice)?
5. **Ceiling or floor on modifiers.** The book says modifiers are cumulative (p. 2) but gives no cap on effective skill and no rule for fractions. Decision: accept any integer.
6. **Overlap of the critical rules.** The book lists the 10-over rule and the 17 rule separately. Where both apply, the result is the same (critical failure), so the engine needs no priority. Nothing is unclear here, but a test should confirm it.
7. **Who rolls and secrecy.** The GM may roll secretly when the character would not know the result (p. 2). The book gives no mechanical rule. Decision: does the engine record a "hidden" flag on a roll?
8. **Repeated attempts.** The GM uses "common sense" (p. 3). No limits or penalties for retrying are given. Decision: leave out of the engine, or let the caller decide?
9. **When to roll.** The book gives guidance (p. 2), not rules. Decision: keep out of the engine.
10. **Dice notation.** The book writes "3d" in rules and "three dice" in prose, and never says "3d6". The engine can use 3d6 as the name, and the file treats "3d" as 3d6 because the book says only six-sided dice are used (p. 2).
11. **Contests (p. 3).** Quick and Regular Contests use margins but are not in this slice. Decision: add them as the next step after plain tests, or leave until later?
12. **Scope.** Reaction rolls (p. 3) and damage rolls are separate mechanics and are not covered here.

## Could not fill

- Nothing from outside the book was needed. No other books or websites were used.
