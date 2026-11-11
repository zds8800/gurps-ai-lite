/** Interactive localhost LLGM: npm run llgm:local -- qwen3:8b */

import { createInterface } from "node:readline";
import { LocalLlgmGame } from "./game.ts";
import { OllamaClient } from "./protocol.ts";
import { formatTrace } from "./trace.ts";

const model = process.argv[2] ?? "qwen3:8b";
const client = new OllamaClient(model, process.env.OLLAMA_URL ?? "http://localhost:11434");
const game = new LocalLlgmGame(client);
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "\nYou> " });

console.log(`Local GURPS LLGM using ${model}. Type trace to inspect the last turn, or quit to exit.`);
rl.prompt();

let quitting = false;
let lastTurnStart = 0;

rl.on("line", (line) => {
  const input = line.trim();
  if (["quit", "exit"].includes(input.toLowerCase())) {
    quitting = true;
    rl.close();
    return;
  }
  if (input.toLowerCase() === "trace") {
    console.log(`\n${formatTrace(game.journal.slice(lastTurnStart))}`);
    rl.prompt();
    return;
  }
  if (!input) {
    rl.prompt();
    return;
  }
  lastTurnStart = game.journal.length;
  rl.pause();
  void game.runTurn(input)
    .then((narration) => console.log(`\nLLGM> ${narration}`))
    .catch((error: unknown) => console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => {
      if (!quitting) {
        rl.resume();
        rl.prompt();
      }
    });
});
