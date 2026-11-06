/**
 * Equipment CLI tests (issue #35): wealth as the purchase budget, buying and
 * readying gear, and combat drawing damage, range and Accuracy from the
 * equipped weapon's table row instead of hand-typed values. The data rows
 * themselves are verified in equipment.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { makeSoloState, runCommand } from "../src/cli/solo.ts";

function session(lines: string[]): string[] {
  const state = makeSoloState();
  return lines.flatMap((l) => runCommand(state, l));
}

test("wealth sets the purchase budget; overspending is refused with the numbers (pp. 8, 18)", () => {
  const out = session(["new M", "buy plate", "wealth struggling", "buy broadsword", "buy plate"]);
  // New character: average wealth at TL3, $1,000 (p. 18). Plate is $4,040.
  assert.deepEqual(out[1], "Average wealth: $1,000 at TL3 (change with tl/wealth; buy gear with buy).");
  assert.deepEqual(
    out[2],
    "Plate costs $4,040; M has $1,000 left. (Wealth: average at TL3 — change with wealth, p. 8.)",
  );
  // Struggling is half starting wealth and -10 points (p. 8).
  assert.deepEqual(out[3], "M is now struggling (-10 points): $500 at TL3 (pp. 8, 18).");
  assert.deepEqual(out[4], "Bought Broadsword for $500. $0 left.");
  assert.deepEqual(out[5], "Broadsword readied.");
  assert.deepEqual(
    out[6],
    "Plate costs $4,040; M has $0 left. (Wealth: struggling at TL3 — change with wealth, p. 8.)",
  );
  // The wealth level's points count toward the point total (p. 8).
  const sheet = session(["new M", "wealth struggling", "sheet"]);
  assert.ok(sheet.some((l) => l === "Wealth: struggling (-10 points), $500 on hand at TL3 (pp. 8, 18)."));
  assert.ok(sheet.some((l) => l.startsWith("Point total: -10")));
});

test("the TL gate refuses high-tech purchases (p. 19)", () => {
  const out = session(["new M", "buy auto pistol, 9mm", "tl 8", "buy auto pistol, 9mm"]);
  assert.deepEqual(
    out[2],
    "Auto Pistol, 9mm is TL6; the campaign is TL3. You may only buy weapons of your TL or less, unless you have the High TL trait (p. 19).",
  );
  assert.deepEqual(out[3], "Tech level 8. Average starting wealth: $20,000 (p. 18).");
  assert.deepEqual(out[4], "M's money set to $20,000 (average).");
  assert.deepEqual(out[5], "Bought Auto Pistol, 9mm for $350. $19,650 left.");
  assert.deepEqual(out[6], "Auto Pistol, 9mm readied (Acc 2).");
});

test("you cannot wear or ready what you do not own", () => {
  const out = session(["new M", "wear mail", "ready rapier"]);
  assert.deepEqual(out[2], "M does not own Mail. Buy it first: buy mail");
  assert.deepEqual(out[3], "M does not own a Rapier. Buy it first: buy rapier");
});

test("a ready melee weapon supplies its table damage; mode picks the printed line (pp. 20-21)", () => {
  const out = session([
    "seed 3",
    "fight",
    "buy broadsword",
    "attack edge broadsword",
    "attack edge broadsword mode thrust",
  ]);
  // Mara ST 10: sw 1d, thr 1d-2 (p. 6); Broadsword is sw+1 cut or thr+1 cr (p. 20).
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Broadsword (swing) (1d+1 cut)")),
    out.join("\n"),
  );
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Broadsword (thrust) (1d-1 cr)")),
    out.join("\n"),
  );
  // A bad mode says what the weapon's lines are.
  const bad = session(["fight", "buy broadsword", "attack edge broadsword mode poke"]);
  assert.ok(
    bad.some((l) => l === 'Broadsword has no "poke" mode. Modes: swing, thrust.'),
    bad.join("\n"),
  );
});

test("minimum ST: lacking ST penalizes skill, and damage ST caps at triple the minimum (p. 20)", () => {
  // Edge Case stands still (defend none). Axe needs ST 11; M has ST 8: -3.
  const out = session([
    "seed 4",
    "new M",
    "set ST 8",
    "learn axe-mace 2",
    "buy axe",
    "foe tests/fixtures/edge-case.gcs",
    "attack edge axe-mace",
  ]);
  // Axe/Mace at 2 points is DX+0 = 10; -3 for ST gives effective 7 (p. 20).
  // ST 8 swing is 1d-2 (p. 6), so sw+2 is 1d.
  assert.ok(out.some((l) => l.startsWith("M attacks with Axe (1d cut) (effective 7):")), out.join("\n"));

  // Large knife min ST 6, so damage ST caps at 18 even at ST 20 (p. 20):
  // swing at ST 18 is 3d, so sw-2 is 3d-2, not the 3d+2-2 of uncapped ST 20.
  const capped = session([
    "seed 4",
    "new M",
    "set ST 20",
    "learn knife 2",
    "buy large knife",
    "foe tests/fixtures/edge-case.gcs",
    "attack edge knife mode swing",
  ]);
  assert.ok(
    capped.some((l) => l.startsWith("M attacks with Large Knife (swing) (3d-2 cut)")),
    capped.join("\n"),
  );
});

test("worn armor's DR reduces penetrating damage; a ready shield's DB aids defenses (pp. 18-19)", () => {
  const out = session([
    "seed 7",
    "fight",
    "buy leather armor",
    "buy small shield",
    "defend dodge",
    "foeattack broadsword dmg 1d+1 cut vs none",
  ]);
  assert.ok(out.some((l) => l === "Leather Armor worn (DR 2)."), out.join("\n"));
  // Mara's dodge is 8; the small shield's DB 1 makes 9 (p. 19).
  assert.ok(out.some((l) => l === "Mara Voss will dodge (dodge 9) until you change it."), out.join("\n"));
  // The hit line shows the DR 2 coming off the basic damage (p. 29).
  const hit = out.find((l) => /Hit for \d+ basic damage/.test(l));
  assert.ok(hit, out.join("\n"));
  const basic = Number(hit!.match(/Hit for (\d+) basic damage/)![1]);
  const penetrating = Number(hit!.match(/(\d+) penetrates/)![1]);
  assert.equal(penetrating, Math.max(0, basic - 2));
});

test("a ready thrown weapon supplies damage, 1/2D and Max; beyond Max is refused (pp. 21, 27)", () => {
  const out = session([
    "seed 5",
    "fight",
    "buy large knife",
    "shoot edge thrown-knife rng 16",
    "shoot edge thrown-knife rng 3",
  ]);
  assert.ok(out.some((l) => l === "Large Knife (thrown) readied (Acc 0)."), out.join("\n"));
  // Max is x1.5 ST 10 = 15 yd (p. 21).
  assert.ok(out.some((l) => l === "Edge Case is beyond Max range: 16 yd > 15 yd (p. 27)."), out.join("\n"));
  // thr at ST 10 is 1d-2, +0 (p. 21); rng 3 yd is -1 (p. 28) on Thrown Weapon (Knife) 12.
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Large Knife (thrown) (1d-2 imp, rng 3 yd) (effective 11):")),
    out.join("\n"),
  );
});

test("aim takes the ready weapon's Acc; a scope adds +1 per second up to its bonus (pp. 19-20, 25-27)", () => {
  const out = session([
    "seed 9",
    "fight",
    "tl 8",
    "wealth comfortable",
    "buy sniper rifle, .338",
    "learn guns 4",
    "aim edge",
    "aim edge",
    "shoot edge guns rng 50",
  ]);
  assert.ok(
    out.some(
      (l) =>
        l ===
        "Mara Voss aims with the Sniper Rifle, .338 at Edge Case (Acc 6, scope +1): +7 on their next ranged attack against them (pp. 25-27).",
    ),
    out.join("\n"),
  );
  assert.ok(
    out.some((l) => l.includes("(Acc 6, scope +2, 2 seconds of aim): +9 on their next ranged attack")),
    out.join("\n"),
  );
  // Guns at 4 points (DX/Easy) on DX 11 is 13; aim +9 (Acc 6, scope 2, extra 1), range 50 yd is -8,
  // and Mara is ST 10 against the rifle's min ST 11 (-1, p. 20): 13 + 9 - 8 - 1 = 13.
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Sniper Rifle, .338 (9d+1 pi, rng 50 yd) (effective 13):")),
    out.join("\n"),
  );
});

test("the aim bonus only applies with the weapon aimed with (pp. 25-26)", () => {
  const out = session([
    "seed 9",
    "fight",
    "tl 8",
    "wealth comfortable",
    "buy sniper rifle, .338",
    "buy auto pistol, 9mm",
    "learn guns 4",
    "aim edge",
    "ready auto pistol, 9mm",
    "shoot edge guns rng 50",
  ]);
  // Readying the pistol drops the sniper aim: Guns 13, range -8, no aim bonus.
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Auto Pistol, 9mm (2d+2 pi, rng 50 yd) (effective 5):")),
    out.join("\n"),
  );
});

test("a crossbow's own ST drives its damage and range (p. 20)", () => {
  const out = session([
    "seed 2",
    "fight",
    "buy crossbow st 12",
    "learn crossbow 2",
    "shoot edge crossbow rng 30",
  ]);
  assert.ok(out.some((l) => l === "Bought Crossbow for $150 (weapon ST 12). $850 left."), out.join("\n"));
  // ST 12 thrust is 1d-1, +4 imp (p. 21); range x20/x25 of ST 12 = 240/300.
  // Crossbow at 2 points (DX/Easy) on DX 11 is 12; rng 30 yd is -7: effective 5.
  assert.ok(
    out.some((l) => l.startsWith("Mara Voss attacks with Crossbow (1d+3 imp, rng 30 yd) (effective 5):")),
    out.join("\n"),
  );
  const far = session(["fight", "buy crossbow st 12", "learn crossbow 2", "shoot edge crossbow rng 301"]);
  assert.ok(far.some((l) => l === "Edge Case is beyond Max range: 301 yd > 300 yd (p. 27)."), far.join("\n"));
});
