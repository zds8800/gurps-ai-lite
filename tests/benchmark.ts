/**
 * Simulation-loop benchmark (acceptance check: a loop runs without creating
 * a result object per roll, and rolls per second are reported).
 *
 * Run with: npm run bench
 */

import { PACK_SUCCESS, packTotal, rollFast, SeededDice } from "../src/index.ts";

const ROLLS = 5_000_000;
const SKILL = 11;

const dice = new SeededDice(12345);
let wins = 0;
const histogram = new Uint32Array(19); // index by total

const start = performance.now();
for (let i = 0; i < ROLLS; i++) {
  const packed = rollFast(SKILL, dice); // one int out; no objects created
  histogram[packTotal(packed)]++;
  if (packed & PACK_SUCCESS) wins++;
}
const elapsedMs = performance.now() - start;

const perSecond = Math.round((ROLLS / elapsedMs) * 1000);
console.log(`rolls:            ${ROLLS.toLocaleString("en-US")}`);
console.log(`effective skill:  ${SKILL}`);
console.log(`elapsed:          ${elapsedMs.toFixed(1)} ms`);
console.log(`rolls per second: ${perSecond.toLocaleString("en-US")}`);
console.log(`successes:        ${wins.toLocaleString("en-US")} (${((wins / ROLLS) * 100).toFixed(2)}%)`);
console.log(`totals histogram: ${Array.from(histogram.slice(3)).join(", ")}`);
