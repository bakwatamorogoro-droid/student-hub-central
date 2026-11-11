import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  GRADIENT_DIRECTION,
  GRADIENT_UTILITIES,
  directionsUsedIn,
  plainDirectionFor,
} from "./gradientCompat.ts";

const srcDir = fileURLToPath(new URL("..", import.meta.url));
const styles = readFileSync(join(srcDir, "styles.css"), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("styles.css restates the direction for every gradient utility", () => {
  for (const [utility, direction] of Object.entries(GRADIENT_DIRECTION)) {
    const rule = new RegExp(
      `\\.${utility}\\s*\\{\\s*--tw-gradient-position:\\s*${direction}\\s*;\\s*\\}`,
    );
    assert.match(styles, rule, `no plain-direction fallback for .${utility}`);
  }
});

test("styles.css restates the gradient stop positions", () => {
  // Without `@property` these have no initial value, so every `var()` in
  // `--tw-gradient-stops` resolves to invalid and the gradient never paints.
  assert.match(styles, /--tw-gradient-from-position:\s*0%/);
  assert.match(styles, /--tw-gradient-via-position:\s*50%/);
  assert.match(styles, /--tw-gradient-to-position:\s*100%/);
});

test("the fallback is gated on the feature it replaces, not on a browser name", () => {
  assert.match(styles, /@supports\s+not\s*\(\s*background-image:\s*linear-gradient\([^)]*in oklab/);
});

test("the fallback comes after Tailwind, so it wins the cascade", () => {
  const tailwind = styles.indexOf('@import "tailwindcss"');
  const fallback = styles.indexOf("@supports not (background-image");
  assert.notEqual(tailwind, -1, "the Tailwind import is missing");
  assert.notEqual(fallback, -1, "the fallback block is missing");
  assert.ok(fallback > tailwind, "an earlier fallback would be overridden by Tailwind");
});

test("every gradient direction used in the app has a fallback", () => {
  const used = sourceFiles(srcDir)
    .filter((file) => !file.endsWith("gradientCompat.test.ts"))
    .flatMap((file) => directionsUsedIn(readFileSync(file, "utf8")));
  const missing = [...new Set(used)].filter((utility) => !(utility in GRADIENT_DIRECTION));
  assert.deepEqual(missing, [], `directions with no fallback: ${missing.join(", ")}`);
  assert.ok(used.length > 0, "expected the app to use at least one gradient");
});

test("a non-direction utility has no direction", () => {
  assert.equal(plainDirectionFor("bg-gradient-to-diagonal"), null);
  assert.equal(plainDirectionFor("from-primary"), null);
  assert.equal(GRADIENT_UTILITIES.length, 8);
});
