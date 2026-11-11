import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { unwrapCascadeLayers } from "./cssLayers.ts";

const srcDir = fileURLToPath(new URL("..", import.meta.url));

test("a layer block is flattened, keeping its rules and order", () => {
  const css = "@layer base{a{color:red}}@layer utilities{b{color:blue}}";
  assert.equal(unwrapCascadeLayers(css), "a{color:red}b{color:blue}");
});

test("the layer order statement is dropped, not the rules after it", () => {
  const css = "@layer theme, base, components, utilities;@layer base{a{color:red}}";
  assert.equal(unwrapCascadeLayers(css), "a{color:red}");
});

test("rules outside any layer are left exactly as they were", () => {
  const css = ":root{--a:1}@layer base{a{color:red}}.x{margin:0}";
  assert.equal(unwrapCascadeLayers(css), ":root{--a:1}a{color:red}.x{margin:0}");
});

test("a nested at-rule keeps its own block, only the layer wrapper goes", () => {
  const css = "@layer base{@media (min-width:40rem){a{color:red}}}";
  assert.equal(unwrapCascadeLayers(css), "@media (min-width:40rem){a{color:red}}");
});

test("a nested layer is flattened too", () => {
  const css = "@layer utilities{@layer inner{a{color:red}}}";
  assert.equal(unwrapCascadeLayers(css), "a{color:red}");
});

test("a brace inside a string does not unbalance the scan", () => {
  const css = '@layer base{a{content:"}"}b{content:"{"}}';
  assert.equal(unwrapCascadeLayers(css), 'a{content:"}"}b{content:"{"}');
});

test("a brace inside a comment does not unbalance the scan", () => {
  const css = "@layer base{/* } */a{color:red}}";
  assert.equal(unwrapCascadeLayers(css), "/* } */a{color:red}");
});

test("a layer name in a comment is not treated as a layer", () => {
  const css = "/* @layer x{ */a{color:red}";
  assert.equal(unwrapCascadeLayers(css), "/* @layer x{ */a{color:red}");
});

test("a data URI with braces survives intact", () => {
  const css = '@layer base{a{background:url("data:image/svg+xml,%3Csvg%3E{}%3C/svg%3E")}}';
  assert.equal(
    unwrapCascadeLayers(css),
    'a{background:url("data:image/svg+xml,%3Csvg%3E{}%3C/svg%3E")}',
  );
});

test("@property, @supports and @keyframes are untouched", () => {
  const css =
    '@property --x{syntax:"*";inherits:false}@supports (color:red){@layer base{a{color:red}}}@keyframes k{to{opacity:1}}';
  assert.equal(
    unwrapCascadeLayers(css),
    '@property --x{syntax:"*";inherits:false}@supports (color:red){a{color:red}}@keyframes k{to{opacity:1}}',
  );
});

test("the palette in :root survives with the utilities that use it", () => {
  const css = ":root{--primary:#006eaf}@layer utilities{.text-primary{color:var(--primary)}}";
  assert.equal(
    unwrapCascadeLayers(css),
    ":root{--primary:#006eaf}.text-primary{color:var(--primary)}",
  );
});

test("the real built stylesheet has no @layer left and keeps every rule", () => {
  const assets = globSync("dist/assets/*.css", { cwd: join(srcDir, "..") });
  if (assets.length === 0) return; // no build on disk: nothing to assert
  for (const asset of assets) {
    const raw = readFileSync(join(srcDir, "..", asset), "utf8");
    const flat = unwrapCascadeLayers(raw);
    assert.equal(flat.includes("@layer"), false, `${asset} still contains @layer`);
    // Flattening must not lose declarations, only the two wrapper characters.
    const declarations = (text: string) => (text.match(/[a-z-]+\s*:/g) ?? []).length;
    assert.equal(declarations(flat), declarations(raw), `${asset} lost declarations`);
  }
});
