# Test cases: success rolls and skill tests (GURPS 4th Edition Lite)

Every case here is something the TypeScript engine must pass. The sources are the GURPS Lite PDF on the project and the two rules files, rules success-rolls.md and rules attributes-and-skills.md. Page numbers are printed Lite page numbers. Nothing comes from outside the book.

## How to read a case

- Dice (3d) is the total of the three dice, 3 to 18. Tests feed this total in as a scripted roll, so no real dice are involved.
- Effective skill is base skill plus all modifiers, or the default level when the character has no training.
- Result, Critical and Margin are the expected outputs. Margin of success is effective skill minus the roll. Margin of failure is the roll minus effective skill.
- Cases from the book's own text are in section A. The book prints the effective skill and the dice result in some of them, and where only the skill is printed, the roll is ours and the page column says so.
- "CANNOT ATTEMPT" means the engine refuses the roll because effective skill is below 3 (p. 2).

## Order of checks the expected results assume

1. Effective skill below 3: cannot attempt (defense rolls are outside this slice).
2. Roll 3 or 4: success. Roll 17 or 18: failure. Otherwise success if roll is at most effective skill (p. 2).
3. Critical success: roll 3 or 4; roll 5 at skill 15 or more; roll 6 at skill 16 or more (p. 2).
4. Critical failure: roll 18; roll 17 at skill 15 or less; any roll 10 or more over effective skill (pp. 2 to 3).
5. Margin: the plain difference, as in decision D2 below.

## Decisions the book leaves open (these cases follow the choices below)

The book does not settle these, and they match the open questions in rules success-rolls.md. If you choose differently, only the cases named here change.

- **D2, margin on an automatic result.** The margin is the raw difference. Roll 4 at skill 3 is a success with margin -1, and roll 17 at skill 19 is a failure with margin -2. Every case with a negative margin carries the tag (D2).
- **D4, effective skill below 3.** The engine returns "cannot attempt". The book bars the roll (p. 2) and says nothing more. Affects section E and two cases in section F.
- **D5, no cap on modifiers.** Any whole number is accepted, so skill 29 is allowed.
- A critical result is reported as a flag. The book leaves the effect to the GM (pp. 2 and 3).
- A roll is never both a critical success and a critical failure. The script that generated the grid in section H checked this for every row.

## A. Worked examples from the book

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T001 | ST 12 test, roll 12 | ST 12, no modifiers | 12 | 12 | SUCCESS | none | margin of success 0 | p. 2, What to Roll ("a roll of 12 or less succeeds"); Book example |
| T002 | ST 12 test, roll 13 | ST 12, no modifiers | 12 | 13 | FAILURE | none | margin of failure 1 | p. 2, What to Roll; Implied by the same example: only 12 or less succeeds |
| T003 | Margin of success example | effective skill 18 | 18 | 12 | SUCCESS | none | margin of success 6 | p. 2, Degree of Success or Failure; Book example: "margin of success is 6" |
| T004 | Margin of failure example | effective skill 9 | 9 | 12 | FAILURE | none | margin of failure 3 | p. 2, Degree of Success or Failure; Book example: "margin of failure is 3" |
| T005 | Lockpicking 9 in the dark: effective skill 4, roll 4 | base 9, modifier -5 (dark) = 4 | 4 | 4 | SUCCESS | critical success | margin of success 0 | p. 2, Modifiers; Book gives effective skill 4; the roll is ours |
| T006 | Lockpicking 9 in the dark: roll 5 | base 9, modifier -5 = 4 | 4 | 5 | FAILURE | none | margin of failure 1 | p. 2, Modifiers; Roll is ours |
| T007 | Primitive lock +10: effective skill 19, roll 16 | base 9, modifier +10 = 19 | 19 | 16 | SUCCESS | none | margin of success 3 | p. 2, Modifiers; Book gives effective skill 19; the roll is ours |
| T008 | Primitive lock +10: roll 17 still fails | base 9, modifier +10 = 19 | 19 | 17 | FAILURE | none | margin of failure -2 (raw difference, D2) | p. 2, Modifiers ("Not quite"), p. 2 Critical Failure; Book: success is not assured at 19. 17 is an automatic failure; margin is the raw difference (decision D2) |
| T009 | Primitive lock +10: roll 18 critical failure | base 9, modifier +10 = 19 | 19 | 18 | FAILURE | critical failure | margin of failure -1 (raw difference, D2) | p. 2, Modifiers and Critical Success and Failure; 18 is always a critical failure |
| T010 | Primitive lock in the dark: effective skill 14, roll 14 | base 9, modifiers -5 and +10 = 14 | 14 | 14 | SUCCESS | none | margin of success 0 | p. 2, Modifiers (cumulative); Book gives effective skill 14; the roll is ours |
| T011 | Primitive lock in the dark: roll 15 | base 9, modifiers -5 and +10 = 14 | 14 | 15 | FAILURE | none | margin of failure 1 | p. 2, Modifiers (cumulative); Roll is ours |
| T012 | Critical failure by 10: 16 on skill 6 | effective skill 6 | 6 | 16 | FAILURE | critical failure | margin of failure 10 | p. 3, Critical Success and Failure; Book example: "16 on a skill of 6" |
| T013 | Critical failure by 10: 15 on skill 5 | effective skill 5 | 5 | 15 | FAILURE | critical failure | margin of failure 10 | p. 3, Critical Success and Failure; Book example: "15 on a skill of 5" |
| T014 | Shortsword-17 skill test, roll 17 | Shortsword skill level 17 | 17 | 17 | FAILURE | none | margin of failure 0 | p. 12, Skills ("Shortsword-17"); The book names the skill level only. 17 is an automatic failure even at skill 17 |
| T015 | Shortsword-17, roll 16 | Shortsword skill level 17 | 17 | 16 | SUCCESS | none | margin of success 1 | p. 12, Skills; Roll is ours |

## B. Rolls of 3, 4, 17 and 18

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T016 | Roll 3 at average skill 10 | effective skill 10 | 10 | 3 | SUCCESS | critical success | margin of success 7 | p. 2, What to Roll and Critical Success |
| T017 | Roll 4 at average skill 10 | effective skill 10 | 10 | 4 | SUCCESS | critical success | margin of success 6 | p. 2, What to Roll and Critical Success |
| T018 | Roll 17 at average skill 10 | effective skill 10 | 10 | 17 | FAILURE | critical failure | margin of failure 7 | p. 2, What to Roll and Critical Failure |
| T019 | Roll 18 at average skill 10 | effective skill 10 | 10 | 18 | FAILURE | critical failure | margin of failure 8 | p. 2, What to Roll and Critical Failure |
| T020 | Roll 3 at skill 3 | effective skill 3 | 3 | 3 | SUCCESS | critical success | margin of success 0 | p. 2, Critical Success; p. 2 minimum skill 3 |
| T021 | Roll 4 at skill 3 (automatic success above the target) | effective skill 3 | 3 | 4 | SUCCESS | critical success | margin of success -1 (raw difference, D2) | p. 2, What to Roll; Margin is -1 under decision D2 |
| T022 | Roll 5 at skill 3 | effective skill 3 | 3 | 5 | FAILURE | none | margin of failure 2 | p. 2, Degree of Success or Failure |
| T023 | Roll 3 at skill 20 | effective skill 20 | 20 | 3 | SUCCESS | critical success | margin of success 17 | p. 2, Critical Success |
| T024 | Roll 4 at skill 20 | effective skill 20 | 20 | 4 | SUCCESS | critical success | margin of success 16 | p. 2, Critical Success |
| T025 | Roll 17 at skill 20 | effective skill 20 | 20 | 17 | FAILURE | none | margin of failure -3 (raw difference, D2) | p. 2, What to Roll and Critical Failure (17 is ordinary above skill 15); Automatic failure, not critical, margin -3 (D2) |
| T026 | Roll 18 at skill 20 | effective skill 20 | 20 | 18 | FAILURE | critical failure | margin of failure -2 (raw difference, D2) | p. 2, Critical Failure |
| T027 | Roll 17 at skill 16 (ordinary failure) | effective skill 16 | 16 | 17 | FAILURE | none | margin of failure 1 | p. 2, Critical Failure |
| T028 | Roll 17 at skill 15 (critical failure) | effective skill 15 | 15 | 17 | FAILURE | critical failure | margin of failure 2 | p. 2, Critical Failure ("15 or less") |
| T029 | Roll 17 at skill 14 | effective skill 14 | 14 | 17 | FAILURE | critical failure | margin of failure 3 | p. 2, Critical Failure |
| T030 | Roll 17 at skill 3 | effective skill 3 | 3 | 17 | FAILURE | critical failure | margin of failure 14 | p. 2, Critical Failure (also 10 or more over) |
| T031 | Roll 7 at skill 4: not a roll of 3 or 4 | effective skill 4 | 4 | 7 | FAILURE | none | margin of failure 3 | p. 2 |

## C. Skill 15, 16 and higher (where the critical range changes)

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T032 | Skill 14, roll 5 | effective skill 14 | 14 | 5 | SUCCESS | none | margin of success 9 | p. 2, Critical Success (5 needs skill 15+) |
| T033 | Skill 15, roll 5 | effective skill 15 | 15 | 5 | SUCCESS | critical success | margin of success 10 | p. 2, Critical Success |
| T034 | Skill 14, roll 6 | effective skill 14 | 14 | 6 | SUCCESS | none | margin of success 8 | p. 2 |
| T035 | Skill 15, roll 6 | effective skill 15 | 15 | 6 | SUCCESS | none | margin of success 9 | p. 2 (6 needs skill 16+) |
| T036 | Skill 16, roll 6 | effective skill 16 | 16 | 6 | SUCCESS | critical success | margin of success 10 | p. 2 |
| T037 | Skill 16, roll 5 | effective skill 16 | 16 | 5 | SUCCESS | critical success | margin of success 11 | p. 2 |
| T038 | Skill 16, roll 7 | effective skill 16 | 16 | 7 | SUCCESS | none | margin of success 9 | p. 2 |
| T039 | Skill 25, roll 6 | effective skill 25 | 25 | 6 | SUCCESS | critical success | margin of success 19 | p. 2; no cap on skill |
| T040 | Skill 25, roll 7 | effective skill 25 | 25 | 7 | SUCCESS | none | margin of success 18 | p. 2 |
| T041 | Skill 25, roll 18 | effective skill 25 | 25 | 18 | FAILURE | critical failure | margin of failure -7 (raw difference, D2) | p. 2 |
| T042 | Skill 25, roll 17 | effective skill 25 | 25 | 17 | FAILURE | none | margin of failure -8 (raw difference, D2) | p. 2 |
| T043 | Skill 15, roll 18 | effective skill 15 | 15 | 18 | FAILURE | critical failure | margin of failure 3 | p. 2 |
| T044 | Skill 18, roll 5 | effective skill 18 | 18 | 5 | SUCCESS | critical success | margin of success 13 | p. 2 |
| T045 | Skill 18, roll 6 | effective skill 18 | 18 | 6 | SUCCESS | critical success | margin of success 12 | p. 2 |
| T046 | Skill 16, roll 16 | effective skill 16 | 16 | 16 | SUCCESS | none | margin of success 0 | p. 2 |
| T047 | Skill 16, roll 15 | effective skill 16 | 16 | 15 | SUCCESS | none | margin of success 1 | p. 2 |

## D. Very low skill and the failure-by-10 rule

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T048 | Skill 3, roll 13 | effective skill 3 | 3 | 13 | FAILURE | critical failure | margin of failure 10 | p. 3, 10-over rule: 13 is 10 over skill 3 |
| T049 | Skill 3, roll 12 | effective skill 3 | 3 | 12 | FAILURE | none | margin of failure 9 | p. 3 |
| T050 | Skill 3, roll 16 | effective skill 3 | 3 | 16 | FAILURE | critical failure | margin of failure 13 | p. 3 |
| T051 | Skill 4, roll 14 | effective skill 4 | 4 | 14 | FAILURE | critical failure | margin of failure 10 | p. 3 |
| T052 | Skill 4, roll 13 | effective skill 4 | 4 | 13 | FAILURE | none | margin of failure 9 | p. 3 |
| T053 | Skill 5, roll 14 | effective skill 5 | 5 | 14 | FAILURE | none | margin of failure 9 | p. 3 |
| T054 | Skill 5, roll 15 | effective skill 5 | 5 | 15 | FAILURE | critical failure | margin of failure 10 | p. 3 (book example) |
| T055 | Skill 6, roll 15 | effective skill 6 | 6 | 15 | FAILURE | none | margin of failure 9 | p. 3 |
| T056 | Skill 6, roll 16 | effective skill 6 | 6 | 16 | FAILURE | critical failure | margin of failure 10 | p. 3 (book example) |
| T057 | Skill 7, roll 16 | effective skill 7 | 7 | 16 | FAILURE | none | margin of failure 9 | p. 3 |
| T058 | Skill 7, roll 17 | effective skill 7 | 7 | 17 | FAILURE | critical failure | margin of failure 10 | p. 3 |
| T059 | Skill 8, roll 18 | effective skill 8 | 8 | 18 | FAILURE | critical failure | margin of failure 10 | p. 3 |
| T060 | Skill 3, roll 18 | effective skill 3 | 3 | 18 | FAILURE | critical failure | margin of failure 15 | p. 3 |
| T061 | Skill 10, roll 16 | effective skill 10 | 10 | 16 | FAILURE | none | margin of failure 6 | p. 2 |

## E. Modifiers

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T062 | Lockpicking 9, -5 dark, +10 primitive, then -4 haste | base 9, modifiers -5, +10, -4 = 10 | 10 | 10 | SUCCESS | none | margin of success 0 | p. 2 Modifiers, cumulative; Last modifier is ours, to test stacking of three |
| T063 | Heavy penalty leaves skill exactly 3 | base 12, modifiers -9 = 3 | 3 | 3 | SUCCESS | critical success | margin of success 0 | p. 2 minimum skill 3 |
| T064 | Heavy penalty leaves skill exactly 3, roll 4 | base 12, modifiers -9 = 3 | 3 | 4 | SUCCESS | critical success | margin of success -1 (raw difference, D2) | p. 2 |
| T065 | Penalty pushes skill to 2 | base 9, modifier -7 = 2 | 2 | 3 | CANNOT ATTEMPT | n/a | n/a | p. 2 ("You may not attempt a success roll if your effective skill is less than 3"); Even a roll of 3 is not rolled. Decision D4: return cannot attempt |
| T066 | Penalty pushes skill to 0 | base 9, modifier -9 = 0 | 0 | 4 | CANNOT ATTEMPT | n/a | n/a | p. 2; Decision D4 |
| T067 | Penalty pushes skill below 0 | base 9, modifiers -5, -10 = -6 | -6 | 3 | CANNOT ATTEMPT | n/a | n/a | p. 2; Decision D4 |
| T068 | Huge bonus raises skill to 29 | base 9, modifier +20 = 29 | 29 | 6 | SUCCESS | critical success | margin of success 23 | p. 2; no cap on modifiers; Decision D5 |
| T069 | Huge bonus, roll 17 | base 9, modifier +20 = 29 | 29 | 17 | FAILURE | none | margin of failure -12 (raw difference, D2) | p. 2 |
| T070 | Huge bonus, roll 18 | base 9, modifier +20 = 29 | 29 | 18 | FAILURE | critical failure | margin of failure -11 (raw difference, D2) | p. 2 |
| T071 | Modifier of zero | base 9, modifier 0 = 9 | 9 | 9 | SUCCESS | none | margin of success 0 | p. 2 |
| T072 | Off-hand penalty -4 on a skill roll | base 12, modifier -4 (off hand, p. 5/6 in the attribute rules) = 8 | 8 | 8 | SUCCESS | none | margin of success 0 | attributes rules file; Lite p. 5-6; Modifier source is the attributes rules file |
| T073 | Bonus crosses the critical threshold | base 12, modifier +3 = 15, roll 5 | 15 | 5 | SUCCESS | critical success | margin of success 10 | p. 2 Critical Success; Without the bonus (skill 12) roll 5 is a plain success. See next case |
| T074 | Same roll without the bonus | base 12, no modifier | 12 | 5 | SUCCESS | none | margin of success 7 | p. 2 Critical Success |
| T075 | Penalty drops below the critical threshold | base 16, modifier -2 = 14, roll 6 | 14 | 6 | SUCCESS | none | margin of success 8 | p. 2 Critical Success; Base 16 would crit on 6; effective 14 does not |
| T076 | Penalty drops skill 16 to 15: 17 becomes critical | base 16, modifier -1 = 15, roll 17 | 15 | 17 | FAILURE | critical failure | margin of failure 2 | p. 2 Critical Failure; Uses effective, not base, skill |

## F. Defaults

Defaults come from the rules in rules attributes-and-skills.md. The roll uses the default level as the effective skill.

| ID | Case | Inputs | Effective skill | Dice (3d) | Result | Critical | Margin | Page or rule |
|---|---|---|---|---|---|---|---|---|
| T077 | Lockpicking default at IQ 12 | IQ 12, no training, Lockpicking (IQ/A) default IQ-5 = 7 | 7 | 7 | SUCCESS | none | margin of success 0 | p. 13 (default levels); p. 15 Lockpicking; Default |
| T078 | Lockpicking default, one over | IQ 12, Lockpicking default = 7 | 7 | 8 | FAILURE | none | margin of failure 1 | p. 13; p. 15 |
| T079 | Acrobatics default at DX 12 | DX 12, Acrobatics (DX/H) default DX-6 = 6 | 6 | 6 | SUCCESS | none | margin of success 0 | p. 13 Acrobatics; Hard skill |
| T080 | Area Knowledge default at IQ 10 | IQ 10, Area Knowledge (IQ/E) default IQ-4 = 6 | 6 | 6 | SUCCESS | none | margin of success 0 | p. 14 Area Knowledge; Easy skill |
| T081 | Default at the edge: DX 10 Acrobatics, -6 = 4 | DX 10, Acrobatics default DX-6 = 4 | 4 | 4 | SUCCESS | critical success | margin of success 0 | p. 13 |
| T082 | Default plus modifier falls below 3 | DX 10, Acrobatics default 4, modifier -2 = 2 | 2 | 3 | CANNOT ATTEMPT | n/a | n/a | p. 13, p. 2; Cannot attempt |
| T083 | Default plus bonus | IQ 10, Lockpicking default 5, modifier +10 (primitive lock) = 15 | 15 | 5 | SUCCESS | critical success | margin of success 10 | p. 13, p. 2; Roll of 5 at effective 15 is a critical success |
| T084 | Hard skill default, low attribute | IQ 8, Diplomacy (IQ/H) default IQ-6 = 2 | 2 | 3 | CANNOT ATTEMPT | n/a | n/a | p. 15 Influence Skills; Cannot attempt |
| T085 | Hard skill default, attribute 9 | IQ 9, Diplomacy default IQ-6 = 3 | 3 | 3 | SUCCESS | critical success | margin of success 0 | p. 15 Influence Skills |
| T086 | Rule of 20: IQ 25, Lockpicking default | IQ 25 treated as 20; default 20-5 = 15 | 15 | 5 | SUCCESS | critical success | margin of success 10 | p. 13 The Rule of 20; Roll of 5 at 15 is a critical success |
| T087 | Rule of 20: without the rule the default would be 20 | IQ 25 treated as 20; default 15, roll 16 | 15 | 16 | FAILURE | none | margin of failure 1 | p. 13 The Rule of 20 |
| T088 | Melee weapon family default, Average | DX 12, Broadsword (A) default DX-5 = 7 | 7 | 7 | SUCCESS | none | margin of success 0 | p. 15 Melee Weapon; Combat skill used only as a plain skill test |
| T089 | Melee weapon family default, Easy | DX 12, Knife (E) default DX-4 = 8 | 8 | 9 | FAILURE | none | margin of failure 1 | p. 15 Melee Weapon |
| T090 | Melee weapon family default, Hard | DX 12, Flail (H) default DX-6 = 6 | 6 | 6 | SUCCESS | none | margin of success 0 | p. 15 Melee Weapon |
| T091 | Exception to the general rule: Sex Appeal | HT 10, Sex Appeal (HT/A) default HT-3 = 7 | 7 | 7 | SUCCESS | none | margin of success 0 | p. 15 Influence Skills; Average skill but -3, not -5 |
| T092 | Exception: Throwing | DX 10, Throwing (DX/A) default DX-3 = 7 | 7 | 8 | FAILURE | none | margin of failure 1 | p. 17 Throwing |
| T093 | Exception: Physician | IQ 12, Physician (IQ/H) default IQ-7 = 5 | 5 | 5 | SUCCESS | none | margin of success 0 | p. 16 Physician; Hard skill with -7 |
| T094 | Trained skill beats default | DX 12, Stealth (DX/A) trained at DX+0 = 12, not the default 7 | 12 | 12 | SUCCESS | none | margin of success 0 | p. 13, p. 17 Stealth; Engine uses trained level when the character has the skill |
| T095 | Karate has no default | DX 14, Karate (DX/H), untrained | none | any | CANNOT ATTEMPT | n/a | n/a | p. 15 Karate ("Default: None"); the skill cannot be used without training |
| T096 | Brawling has no default | DX 14, Brawling (DX/E), untrained | none | any | CANNOT ATTEMPT | n/a | n/a | p. 14 Brawling ("Default: None"); the skill cannot be used without training |
| T097 | Computer Programming has no default | IQ 14, untrained | none | any | CANNOT ATTEMPT | n/a | n/a | p. 14 Computer Programming; the skill cannot be used without training |
| T098 | Engineer has no default | IQ 14, untrained | none | any | CANNOT ATTEMPT | n/a | n/a | p. 14 Engineer; the skill cannot be used without training |

## G. Threshold summary

Worked out from the order of checks above and checked against the full grid in section H. At skill 3 a roll of 13 or more is a critical failure under the 10-over rule. From skill 7 up, 17 is already a critical failure on its own, so the 10-over rule adds nothing new.

| Effective skill | Critical success on | Critical failure on | Automatic failure on |
|---|---|---|---|
| 3 | 3, 4 | 13, 14, 15, 16, 17, 18 | 17, 18 |
| 4 | 3, 4 | 14, 15, 16, 17, 18 | 17, 18 |
| 5 | 3, 4 | 15, 16, 17, 18 | 17, 18 |
| 6 | 3, 4 | 16, 17, 18 | 17, 18 |
| 7 | 3, 4 | 17, 18 | 17, 18 |
| 8 | 3, 4 | 17, 18 | 17, 18 |
| 14 | 3, 4 | 17, 18 | 17, 18 |
| 15 | 3, 4, 5 | 17, 18 | 17, 18 |
| 16 | 3, 4, 5, 6 | 18 | 17, 18 |
| 17 | 3, 4, 5, 6 | 18 | 17, 18 |
| 18 | 3, 4, 5, 6 | 18 | 17, 18 |
| 20 | 3, 4, 5, 6 | 18 | 17, 18 |

## H. Full grid, effective skill 3 to 20, every roll 3 to 18

288 rows, one for every combination, generated from the same order of checks. Use it as a table-driven test. Skills above 20 behave like skill 20 for rolls 3 to 18 except the 10-over rule never applies, so it is covered by section C.

| Effective skill | Roll | Result | Critical | Margin |
|---|---|---|---|---|
| 3 | 3 | SUCCESS | critical success | margin of success 0 |
| 3 | 4 | SUCCESS | critical success | margin of success -1 (raw difference, D2) |
| 3 | 5 | FAILURE | none | margin of failure 2 |
| 3 | 6 | FAILURE | none | margin of failure 3 |
| 3 | 7 | FAILURE | none | margin of failure 4 |
| 3 | 8 | FAILURE | none | margin of failure 5 |
| 3 | 9 | FAILURE | none | margin of failure 6 |
| 3 | 10 | FAILURE | none | margin of failure 7 |
| 3 | 11 | FAILURE | none | margin of failure 8 |
| 3 | 12 | FAILURE | none | margin of failure 9 |
| 3 | 13 | FAILURE | critical failure | margin of failure 10 |
| 3 | 14 | FAILURE | critical failure | margin of failure 11 |
| 3 | 15 | FAILURE | critical failure | margin of failure 12 |
| 3 | 16 | FAILURE | critical failure | margin of failure 13 |
| 3 | 17 | FAILURE | critical failure | margin of failure 14 |
| 3 | 18 | FAILURE | critical failure | margin of failure 15 |
| 4 | 3 | SUCCESS | critical success | margin of success 1 |
| 4 | 4 | SUCCESS | critical success | margin of success 0 |
| 4 | 5 | FAILURE | none | margin of failure 1 |
| 4 | 6 | FAILURE | none | margin of failure 2 |
| 4 | 7 | FAILURE | none | margin of failure 3 |
| 4 | 8 | FAILURE | none | margin of failure 4 |
| 4 | 9 | FAILURE | none | margin of failure 5 |
| 4 | 10 | FAILURE | none | margin of failure 6 |
| 4 | 11 | FAILURE | none | margin of failure 7 |
| 4 | 12 | FAILURE | none | margin of failure 8 |
| 4 | 13 | FAILURE | none | margin of failure 9 |
| 4 | 14 | FAILURE | critical failure | margin of failure 10 |
| 4 | 15 | FAILURE | critical failure | margin of failure 11 |
| 4 | 16 | FAILURE | critical failure | margin of failure 12 |
| 4 | 17 | FAILURE | critical failure | margin of failure 13 |
| 4 | 18 | FAILURE | critical failure | margin of failure 14 |
| 5 | 3 | SUCCESS | critical success | margin of success 2 |
| 5 | 4 | SUCCESS | critical success | margin of success 1 |
| 5 | 5 | SUCCESS | none | margin of success 0 |
| 5 | 6 | FAILURE | none | margin of failure 1 |
| 5 | 7 | FAILURE | none | margin of failure 2 |
| 5 | 8 | FAILURE | none | margin of failure 3 |
| 5 | 9 | FAILURE | none | margin of failure 4 |
| 5 | 10 | FAILURE | none | margin of failure 5 |
| 5 | 11 | FAILURE | none | margin of failure 6 |
| 5 | 12 | FAILURE | none | margin of failure 7 |
| 5 | 13 | FAILURE | none | margin of failure 8 |
| 5 | 14 | FAILURE | none | margin of failure 9 |
| 5 | 15 | FAILURE | critical failure | margin of failure 10 |
| 5 | 16 | FAILURE | critical failure | margin of failure 11 |
| 5 | 17 | FAILURE | critical failure | margin of failure 12 |
| 5 | 18 | FAILURE | critical failure | margin of failure 13 |
| 6 | 3 | SUCCESS | critical success | margin of success 3 |
| 6 | 4 | SUCCESS | critical success | margin of success 2 |
| 6 | 5 | SUCCESS | none | margin of success 1 |
| 6 | 6 | SUCCESS | none | margin of success 0 |
| 6 | 7 | FAILURE | none | margin of failure 1 |
| 6 | 8 | FAILURE | none | margin of failure 2 |
| 6 | 9 | FAILURE | none | margin of failure 3 |
| 6 | 10 | FAILURE | none | margin of failure 4 |
| 6 | 11 | FAILURE | none | margin of failure 5 |
| 6 | 12 | FAILURE | none | margin of failure 6 |
| 6 | 13 | FAILURE | none | margin of failure 7 |
| 6 | 14 | FAILURE | none | margin of failure 8 |
| 6 | 15 | FAILURE | none | margin of failure 9 |
| 6 | 16 | FAILURE | critical failure | margin of failure 10 |
| 6 | 17 | FAILURE | critical failure | margin of failure 11 |
| 6 | 18 | FAILURE | critical failure | margin of failure 12 |
| 7 | 3 | SUCCESS | critical success | margin of success 4 |
| 7 | 4 | SUCCESS | critical success | margin of success 3 |
| 7 | 5 | SUCCESS | none | margin of success 2 |
| 7 | 6 | SUCCESS | none | margin of success 1 |
| 7 | 7 | SUCCESS | none | margin of success 0 |
| 7 | 8 | FAILURE | none | margin of failure 1 |
| 7 | 9 | FAILURE | none | margin of failure 2 |
| 7 | 10 | FAILURE | none | margin of failure 3 |
| 7 | 11 | FAILURE | none | margin of failure 4 |
| 7 | 12 | FAILURE | none | margin of failure 5 |
| 7 | 13 | FAILURE | none | margin of failure 6 |
| 7 | 14 | FAILURE | none | margin of failure 7 |
| 7 | 15 | FAILURE | none | margin of failure 8 |
| 7 | 16 | FAILURE | none | margin of failure 9 |
| 7 | 17 | FAILURE | critical failure | margin of failure 10 |
| 7 | 18 | FAILURE | critical failure | margin of failure 11 |
| 8 | 3 | SUCCESS | critical success | margin of success 5 |
| 8 | 4 | SUCCESS | critical success | margin of success 4 |
| 8 | 5 | SUCCESS | none | margin of success 3 |
| 8 | 6 | SUCCESS | none | margin of success 2 |
| 8 | 7 | SUCCESS | none | margin of success 1 |
| 8 | 8 | SUCCESS | none | margin of success 0 |
| 8 | 9 | FAILURE | none | margin of failure 1 |
| 8 | 10 | FAILURE | none | margin of failure 2 |
| 8 | 11 | FAILURE | none | margin of failure 3 |
| 8 | 12 | FAILURE | none | margin of failure 4 |
| 8 | 13 | FAILURE | none | margin of failure 5 |
| 8 | 14 | FAILURE | none | margin of failure 6 |
| 8 | 15 | FAILURE | none | margin of failure 7 |
| 8 | 16 | FAILURE | none | margin of failure 8 |
| 8 | 17 | FAILURE | critical failure | margin of failure 9 |
| 8 | 18 | FAILURE | critical failure | margin of failure 10 |
| 9 | 3 | SUCCESS | critical success | margin of success 6 |
| 9 | 4 | SUCCESS | critical success | margin of success 5 |
| 9 | 5 | SUCCESS | none | margin of success 4 |
| 9 | 6 | SUCCESS | none | margin of success 3 |
| 9 | 7 | SUCCESS | none | margin of success 2 |
| 9 | 8 | SUCCESS | none | margin of success 1 |
| 9 | 9 | SUCCESS | none | margin of success 0 |
| 9 | 10 | FAILURE | none | margin of failure 1 |
| 9 | 11 | FAILURE | none | margin of failure 2 |
| 9 | 12 | FAILURE | none | margin of failure 3 |
| 9 | 13 | FAILURE | none | margin of failure 4 |
| 9 | 14 | FAILURE | none | margin of failure 5 |
| 9 | 15 | FAILURE | none | margin of failure 6 |
| 9 | 16 | FAILURE | none | margin of failure 7 |
| 9 | 17 | FAILURE | critical failure | margin of failure 8 |
| 9 | 18 | FAILURE | critical failure | margin of failure 9 |
| 10 | 3 | SUCCESS | critical success | margin of success 7 |
| 10 | 4 | SUCCESS | critical success | margin of success 6 |
| 10 | 5 | SUCCESS | none | margin of success 5 |
| 10 | 6 | SUCCESS | none | margin of success 4 |
| 10 | 7 | SUCCESS | none | margin of success 3 |
| 10 | 8 | SUCCESS | none | margin of success 2 |
| 10 | 9 | SUCCESS | none | margin of success 1 |
| 10 | 10 | SUCCESS | none | margin of success 0 |
| 10 | 11 | FAILURE | none | margin of failure 1 |
| 10 | 12 | FAILURE | none | margin of failure 2 |
| 10 | 13 | FAILURE | none | margin of failure 3 |
| 10 | 14 | FAILURE | none | margin of failure 4 |
| 10 | 15 | FAILURE | none | margin of failure 5 |
| 10 | 16 | FAILURE | none | margin of failure 6 |
| 10 | 17 | FAILURE | critical failure | margin of failure 7 |
| 10 | 18 | FAILURE | critical failure | margin of failure 8 |
| 11 | 3 | SUCCESS | critical success | margin of success 8 |
| 11 | 4 | SUCCESS | critical success | margin of success 7 |
| 11 | 5 | SUCCESS | none | margin of success 6 |
| 11 | 6 | SUCCESS | none | margin of success 5 |
| 11 | 7 | SUCCESS | none | margin of success 4 |
| 11 | 8 | SUCCESS | none | margin of success 3 |
| 11 | 9 | SUCCESS | none | margin of success 2 |
| 11 | 10 | SUCCESS | none | margin of success 1 |
| 11 | 11 | SUCCESS | none | margin of success 0 |
| 11 | 12 | FAILURE | none | margin of failure 1 |
| 11 | 13 | FAILURE | none | margin of failure 2 |
| 11 | 14 | FAILURE | none | margin of failure 3 |
| 11 | 15 | FAILURE | none | margin of failure 4 |
| 11 | 16 | FAILURE | none | margin of failure 5 |
| 11 | 17 | FAILURE | critical failure | margin of failure 6 |
| 11 | 18 | FAILURE | critical failure | margin of failure 7 |
| 12 | 3 | SUCCESS | critical success | margin of success 9 |
| 12 | 4 | SUCCESS | critical success | margin of success 8 |
| 12 | 5 | SUCCESS | none | margin of success 7 |
| 12 | 6 | SUCCESS | none | margin of success 6 |
| 12 | 7 | SUCCESS | none | margin of success 5 |
| 12 | 8 | SUCCESS | none | margin of success 4 |
| 12 | 9 | SUCCESS | none | margin of success 3 |
| 12 | 10 | SUCCESS | none | margin of success 2 |
| 12 | 11 | SUCCESS | none | margin of success 1 |
| 12 | 12 | SUCCESS | none | margin of success 0 |
| 12 | 13 | FAILURE | none | margin of failure 1 |
| 12 | 14 | FAILURE | none | margin of failure 2 |
| 12 | 15 | FAILURE | none | margin of failure 3 |
| 12 | 16 | FAILURE | none | margin of failure 4 |
| 12 | 17 | FAILURE | critical failure | margin of failure 5 |
| 12 | 18 | FAILURE | critical failure | margin of failure 6 |
| 13 | 3 | SUCCESS | critical success | margin of success 10 |
| 13 | 4 | SUCCESS | critical success | margin of success 9 |
| 13 | 5 | SUCCESS | none | margin of success 8 |
| 13 | 6 | SUCCESS | none | margin of success 7 |
| 13 | 7 | SUCCESS | none | margin of success 6 |
| 13 | 8 | SUCCESS | none | margin of success 5 |
| 13 | 9 | SUCCESS | none | margin of success 4 |
| 13 | 10 | SUCCESS | none | margin of success 3 |
| 13 | 11 | SUCCESS | none | margin of success 2 |
| 13 | 12 | SUCCESS | none | margin of success 1 |
| 13 | 13 | SUCCESS | none | margin of success 0 |
| 13 | 14 | FAILURE | none | margin of failure 1 |
| 13 | 15 | FAILURE | none | margin of failure 2 |
| 13 | 16 | FAILURE | none | margin of failure 3 |
| 13 | 17 | FAILURE | critical failure | margin of failure 4 |
| 13 | 18 | FAILURE | critical failure | margin of failure 5 |
| 14 | 3 | SUCCESS | critical success | margin of success 11 |
| 14 | 4 | SUCCESS | critical success | margin of success 10 |
| 14 | 5 | SUCCESS | none | margin of success 9 |
| 14 | 6 | SUCCESS | none | margin of success 8 |
| 14 | 7 | SUCCESS | none | margin of success 7 |
| 14 | 8 | SUCCESS | none | margin of success 6 |
| 14 | 9 | SUCCESS | none | margin of success 5 |
| 14 | 10 | SUCCESS | none | margin of success 4 |
| 14 | 11 | SUCCESS | none | margin of success 3 |
| 14 | 12 | SUCCESS | none | margin of success 2 |
| 14 | 13 | SUCCESS | none | margin of success 1 |
| 14 | 14 | SUCCESS | none | margin of success 0 |
| 14 | 15 | FAILURE | none | margin of failure 1 |
| 14 | 16 | FAILURE | none | margin of failure 2 |
| 14 | 17 | FAILURE | critical failure | margin of failure 3 |
| 14 | 18 | FAILURE | critical failure | margin of failure 4 |
| 15 | 3 | SUCCESS | critical success | margin of success 12 |
| 15 | 4 | SUCCESS | critical success | margin of success 11 |
| 15 | 5 | SUCCESS | critical success | margin of success 10 |
| 15 | 6 | SUCCESS | none | margin of success 9 |
| 15 | 7 | SUCCESS | none | margin of success 8 |
| 15 | 8 | SUCCESS | none | margin of success 7 |
| 15 | 9 | SUCCESS | none | margin of success 6 |
| 15 | 10 | SUCCESS | none | margin of success 5 |
| 15 | 11 | SUCCESS | none | margin of success 4 |
| 15 | 12 | SUCCESS | none | margin of success 3 |
| 15 | 13 | SUCCESS | none | margin of success 2 |
| 15 | 14 | SUCCESS | none | margin of success 1 |
| 15 | 15 | SUCCESS | none | margin of success 0 |
| 15 | 16 | FAILURE | none | margin of failure 1 |
| 15 | 17 | FAILURE | critical failure | margin of failure 2 |
| 15 | 18 | FAILURE | critical failure | margin of failure 3 |
| 16 | 3 | SUCCESS | critical success | margin of success 13 |
| 16 | 4 | SUCCESS | critical success | margin of success 12 |
| 16 | 5 | SUCCESS | critical success | margin of success 11 |
| 16 | 6 | SUCCESS | critical success | margin of success 10 |
| 16 | 7 | SUCCESS | none | margin of success 9 |
| 16 | 8 | SUCCESS | none | margin of success 8 |
| 16 | 9 | SUCCESS | none | margin of success 7 |
| 16 | 10 | SUCCESS | none | margin of success 6 |
| 16 | 11 | SUCCESS | none | margin of success 5 |
| 16 | 12 | SUCCESS | none | margin of success 4 |
| 16 | 13 | SUCCESS | none | margin of success 3 |
| 16 | 14 | SUCCESS | none | margin of success 2 |
| 16 | 15 | SUCCESS | none | margin of success 1 |
| 16 | 16 | SUCCESS | none | margin of success 0 |
| 16 | 17 | FAILURE | none | margin of failure 1 |
| 16 | 18 | FAILURE | critical failure | margin of failure 2 |
| 17 | 3 | SUCCESS | critical success | margin of success 14 |
| 17 | 4 | SUCCESS | critical success | margin of success 13 |
| 17 | 5 | SUCCESS | critical success | margin of success 12 |
| 17 | 6 | SUCCESS | critical success | margin of success 11 |
| 17 | 7 | SUCCESS | none | margin of success 10 |
| 17 | 8 | SUCCESS | none | margin of success 9 |
| 17 | 9 | SUCCESS | none | margin of success 8 |
| 17 | 10 | SUCCESS | none | margin of success 7 |
| 17 | 11 | SUCCESS | none | margin of success 6 |
| 17 | 12 | SUCCESS | none | margin of success 5 |
| 17 | 13 | SUCCESS | none | margin of success 4 |
| 17 | 14 | SUCCESS | none | margin of success 3 |
| 17 | 15 | SUCCESS | none | margin of success 2 |
| 17 | 16 | SUCCESS | none | margin of success 1 |
| 17 | 17 | FAILURE | none | margin of failure 0 |
| 17 | 18 | FAILURE | critical failure | margin of failure 1 |
| 18 | 3 | SUCCESS | critical success | margin of success 15 |
| 18 | 4 | SUCCESS | critical success | margin of success 14 |
| 18 | 5 | SUCCESS | critical success | margin of success 13 |
| 18 | 6 | SUCCESS | critical success | margin of success 12 |
| 18 | 7 | SUCCESS | none | margin of success 11 |
| 18 | 8 | SUCCESS | none | margin of success 10 |
| 18 | 9 | SUCCESS | none | margin of success 9 |
| 18 | 10 | SUCCESS | none | margin of success 8 |
| 18 | 11 | SUCCESS | none | margin of success 7 |
| 18 | 12 | SUCCESS | none | margin of success 6 |
| 18 | 13 | SUCCESS | none | margin of success 5 |
| 18 | 14 | SUCCESS | none | margin of success 4 |
| 18 | 15 | SUCCESS | none | margin of success 3 |
| 18 | 16 | SUCCESS | none | margin of success 2 |
| 18 | 17 | FAILURE | none | margin of failure -1 (raw difference, D2) |
| 18 | 18 | FAILURE | critical failure | margin of failure 0 |
| 19 | 3 | SUCCESS | critical success | margin of success 16 |
| 19 | 4 | SUCCESS | critical success | margin of success 15 |
| 19 | 5 | SUCCESS | critical success | margin of success 14 |
| 19 | 6 | SUCCESS | critical success | margin of success 13 |
| 19 | 7 | SUCCESS | none | margin of success 12 |
| 19 | 8 | SUCCESS | none | margin of success 11 |
| 19 | 9 | SUCCESS | none | margin of success 10 |
| 19 | 10 | SUCCESS | none | margin of success 9 |
| 19 | 11 | SUCCESS | none | margin of success 8 |
| 19 | 12 | SUCCESS | none | margin of success 7 |
| 19 | 13 | SUCCESS | none | margin of success 6 |
| 19 | 14 | SUCCESS | none | margin of success 5 |
| 19 | 15 | SUCCESS | none | margin of success 4 |
| 19 | 16 | SUCCESS | none | margin of success 3 |
| 19 | 17 | FAILURE | none | margin of failure -2 (raw difference, D2) |
| 19 | 18 | FAILURE | critical failure | margin of failure -1 (raw difference, D2) |
| 20 | 3 | SUCCESS | critical success | margin of success 17 |
| 20 | 4 | SUCCESS | critical success | margin of success 16 |
| 20 | 5 | SUCCESS | critical success | margin of success 15 |
| 20 | 6 | SUCCESS | critical success | margin of success 14 |
| 20 | 7 | SUCCESS | none | margin of success 13 |
| 20 | 8 | SUCCESS | none | margin of success 12 |
| 20 | 9 | SUCCESS | none | margin of success 11 |
| 20 | 10 | SUCCESS | none | margin of success 10 |
| 20 | 11 | SUCCESS | none | margin of success 9 |
| 20 | 12 | SUCCESS | none | margin of success 8 |
| 20 | 13 | SUCCESS | none | margin of success 7 |
| 20 | 14 | SUCCESS | none | margin of success 6 |
| 20 | 15 | SUCCESS | none | margin of success 5 |
| 20 | 16 | SUCCESS | none | margin of success 4 |
| 20 | 17 | FAILURE | none | margin of failure -3 (raw difference, D2) |
| 20 | 18 | FAILURE | critical failure | margin of failure -2 (raw difference, D2) |

## I. Machine-readable list of section A to F cases

For a table-driven test, load this list and compare the engine's output.

```json
[
 {
  "id": "T001",
  "effectiveSkill": 12,
  "roll": 12,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T002",
  "effectiveSkill": 12,
  "roll": 13,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T003",
  "effectiveSkill": 18,
  "roll": 12,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 6
 },
 {
  "id": "T004",
  "effectiveSkill": 9,
  "roll": 12,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 3
 },
 {
  "id": "T005",
  "effectiveSkill": 4,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 0
 },
 {
  "id": "T006",
  "effectiveSkill": 4,
  "roll": 5,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T007",
  "effectiveSkill": 19,
  "roll": 16,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 3
 },
 {
  "id": "T008",
  "effectiveSkill": 19,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": -2
 },
 {
  "id": "T009",
  "effectiveSkill": 19,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": -1
 },
 {
  "id": "T010",
  "effectiveSkill": 14,
  "roll": 14,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T011",
  "effectiveSkill": 14,
  "roll": 15,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T012",
  "effectiveSkill": 6,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T013",
  "effectiveSkill": 5,
  "roll": 15,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T014",
  "effectiveSkill": 17,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T015",
  "effectiveSkill": 17,
  "roll": 16,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T016",
  "effectiveSkill": 10,
  "roll": 3,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 7
 },
 {
  "id": "T017",
  "effectiveSkill": 10,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 6
 },
 {
  "id": "T018",
  "effectiveSkill": 10,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 7
 },
 {
  "id": "T019",
  "effectiveSkill": 10,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 8
 },
 {
  "id": "T020",
  "effectiveSkill": 3,
  "roll": 3,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 0
 },
 {
  "id": "T021",
  "effectiveSkill": 3,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": -1
 },
 {
  "id": "T022",
  "effectiveSkill": 3,
  "roll": 5,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 2
 },
 {
  "id": "T023",
  "effectiveSkill": 20,
  "roll": 3,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 17
 },
 {
  "id": "T024",
  "effectiveSkill": 20,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 16
 },
 {
  "id": "T025",
  "effectiveSkill": 20,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": -3
 },
 {
  "id": "T026",
  "effectiveSkill": 20,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": -2
 },
 {
  "id": "T027",
  "effectiveSkill": 16,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T028",
  "effectiveSkill": 15,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 2
 },
 {
  "id": "T029",
  "effectiveSkill": 14,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 3
 },
 {
  "id": "T030",
  "effectiveSkill": 3,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 14
 },
 {
  "id": "T031",
  "effectiveSkill": 4,
  "roll": 7,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 3
 },
 {
  "id": "T032",
  "effectiveSkill": 14,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T033",
  "effectiveSkill": 15,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 10
 },
 {
  "id": "T034",
  "effectiveSkill": 14,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 8
 },
 {
  "id": "T035",
  "effectiveSkill": 15,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T036",
  "effectiveSkill": 16,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 10
 },
 {
  "id": "T037",
  "effectiveSkill": 16,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 11
 },
 {
  "id": "T038",
  "effectiveSkill": 16,
  "roll": 7,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T039",
  "effectiveSkill": 25,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 19
 },
 {
  "id": "T040",
  "effectiveSkill": 25,
  "roll": 7,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 18
 },
 {
  "id": "T041",
  "effectiveSkill": 25,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": -7
 },
 {
  "id": "T042",
  "effectiveSkill": 25,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": -8
 },
 {
  "id": "T043",
  "effectiveSkill": 15,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 3
 },
 {
  "id": "T044",
  "effectiveSkill": 18,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 13
 },
 {
  "id": "T045",
  "effectiveSkill": 18,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 12
 },
 {
  "id": "T046",
  "effectiveSkill": 16,
  "roll": 16,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T047",
  "effectiveSkill": 16,
  "roll": 15,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T048",
  "effectiveSkill": 3,
  "roll": 13,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T049",
  "effectiveSkill": 3,
  "roll": 12,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T050",
  "effectiveSkill": 3,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 13
 },
 {
  "id": "T051",
  "effectiveSkill": 4,
  "roll": 14,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T052",
  "effectiveSkill": 4,
  "roll": 13,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T053",
  "effectiveSkill": 5,
  "roll": 14,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T054",
  "effectiveSkill": 5,
  "roll": 15,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T055",
  "effectiveSkill": 6,
  "roll": 15,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T056",
  "effectiveSkill": 6,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T057",
  "effectiveSkill": 7,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 9
 },
 {
  "id": "T058",
  "effectiveSkill": 7,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T059",
  "effectiveSkill": 8,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 10
 },
 {
  "id": "T060",
  "effectiveSkill": 3,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 15
 },
 {
  "id": "T061",
  "effectiveSkill": 10,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 6
 },
 {
  "id": "T062",
  "effectiveSkill": 10,
  "roll": 10,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T063",
  "effectiveSkill": 3,
  "roll": 3,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 0
 },
 {
  "id": "T064",
  "effectiveSkill": 3,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": -1
 },
 {
  "id": "T065",
  "effectiveSkill": 2,
  "roll": 3,
  "attempt": false
 },
 {
  "id": "T066",
  "effectiveSkill": 0,
  "roll": 4,
  "attempt": false
 },
 {
  "id": "T067",
  "effectiveSkill": -6,
  "roll": 3,
  "attempt": false
 },
 {
  "id": "T068",
  "effectiveSkill": 29,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 23
 },
 {
  "id": "T069",
  "effectiveSkill": 29,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": -12
 },
 {
  "id": "T070",
  "effectiveSkill": 29,
  "roll": 18,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": -11
 },
 {
  "id": "T071",
  "effectiveSkill": 9,
  "roll": 9,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T072",
  "effectiveSkill": 8,
  "roll": 8,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T073",
  "effectiveSkill": 15,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 10
 },
 {
  "id": "T074",
  "effectiveSkill": 12,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 7
 },
 {
  "id": "T075",
  "effectiveSkill": 14,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 8
 },
 {
  "id": "T076",
  "effectiveSkill": 15,
  "roll": 17,
  "attempt": true,
  "success": false,
  "critical": "critical failure",
  "margin": 2
 },
 {
  "id": "T077",
  "effectiveSkill": 7,
  "roll": 7,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T078",
  "effectiveSkill": 7,
  "roll": 8,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T079",
  "effectiveSkill": 6,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T080",
  "effectiveSkill": 6,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T081",
  "effectiveSkill": 4,
  "roll": 4,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 0
 },
 {
  "id": "T082",
  "effectiveSkill": 2,
  "roll": 3,
  "attempt": false
 },
 {
  "id": "T083",
  "effectiveSkill": 15,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 10
 },
 {
  "id": "T084",
  "effectiveSkill": 2,
  "roll": 3,
  "attempt": false
 },
 {
  "id": "T085",
  "effectiveSkill": 3,
  "roll": 3,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 0
 },
 {
  "id": "T086",
  "effectiveSkill": 15,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "critical success",
  "margin": 10
 },
 {
  "id": "T087",
  "effectiveSkill": 15,
  "roll": 16,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T088",
  "effectiveSkill": 7,
  "roll": 7,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T089",
  "effectiveSkill": 8,
  "roll": 9,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T090",
  "effectiveSkill": 6,
  "roll": 6,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T091",
  "effectiveSkill": 7,
  "roll": 7,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T092",
  "effectiveSkill": 7,
  "roll": 8,
  "attempt": true,
  "success": false,
  "critical": "none",
  "margin": 1
 },
 {
  "id": "T093",
  "effectiveSkill": 5,
  "roll": 5,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 },
 {
  "id": "T094",
  "effectiveSkill": 12,
  "roll": 12,
  "attempt": true,
  "success": true,
  "critical": "none",
  "margin": 0
 }
]
```

## Could not fill

- Defense rolls (p. 2 and p. 28 exception to the minimum skill of 3): not tested, because combat is outside the first slice.
- The effects of critical results: the book leaves them to the GM, so no case checks an effect, only the flag.
- No case uses 3d6 notation from the book, because the book writes only "3d".
