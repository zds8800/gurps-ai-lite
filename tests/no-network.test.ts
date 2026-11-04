/**
 * No-network guard (acceptance check: the engine imports no LLM client, no
 * retrieval code and no network library). Scans every source file for
 * network/model access and asserts the package has zero runtime dependencies.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const BANNED: [RegExp, string][] = [
  [/from\s+["'](?:node:)?(?:http|https|http2|net|dns|tls|dgram|undici|axios|openai|anthropic|@anthropic-ai)[^"']*["']/, "network or LLM module import"],
  [/import\s*\(\s*["']https?/, "dynamic URL import"],
  [/\bfetch\s*\(/, "fetch call"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\brequire\s*\(/, "CommonJS require"],
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

test("engine source has no network, model or retrieval access", () => {
  const files = [...sourceFiles(SRC)];
  assert.ok(files.length > 0, "no source files found");
  for (const file of files) {
    const text = readFileSync(file, "utf-8");
    for (const [pattern, label] of BANNED) {
      assert.ok(!pattern.test(text), `${label} found in ${file}`);
    }
  }
});

test("package.json declares zero runtime dependencies", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
});
