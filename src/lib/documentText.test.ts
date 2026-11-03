import { test } from "node:test";
import assert from "node:assert/strict";
import { documentTextOf, sanitizeDocumentHtml } from "./documentText.ts";

test("the words of a document survive sanitising", () => {
  const html = "<p>Eleza <b>uadilifu</b> wa Hadith.</p><p>Jibu kwa ufupi.</p>";
  const clean = sanitizeDocumentHtml(html);
  assert.match(clean, /Eleza/);
  assert.match(clean, /uadilifu/);
  assert.match(clean, /<b>/);
});

test("a script tag and its body are removed, not just hidden", () => {
  const clean = sanitizeDocumentHtml('<p>Salama</p><script>alert("x")</script>');
  assert.equal(clean.includes("script"), false);
  assert.equal(clean.includes("alert"), false);
  assert.match(clean, /Salama/);
});

test("an inline event handler never survives", () => {
  const clean = sanitizeDocumentHtml('<p onclick="steal()">Habari</p><img src="x" onerror="x()">');
  assert.equal(/on\w+=/i.test(clean), false);
  assert.equal(clean.includes("steal"), false);
});

test("an iframe, a style block and a form are dropped whole", () => {
  const clean = sanitizeDocumentHtml(
    '<style>p{color:red}</style><iframe src="https://evil.example"></iframe><form><input></form><p>Ndani</p>',
  );
  assert.equal(clean.includes("iframe"), false);
  assert.equal(clean.includes("color:red"), false);
  assert.equal(clean.includes("form"), false);
  assert.equal(clean.includes("input"), false);
  assert.match(clean, /Ndani/);
});

test("a javascript: link target is refused while real markup stays", () => {
  const clean = sanitizeDocumentHtml('<a href="javascript:alert(1)">bofya</a>');
  // An anchor is not on the allow-list, so it becomes its text.
  assert.equal(clean.includes("javascript"), false);
  assert.match(clean, /bofya/);
});

test("a table keeps its cells and their spans", () => {
  const clean = sanitizeDocumentHtml(
    '<table><tr><td colspan="2">Jumla</td><td>7</td></tr></table>',
  );
  assert.match(clean, /<table>/);
  assert.match(clean, /<td colspan="2">/);
  assert.match(clean, /Jumla/);
});

test("a heading and a list keep their shape", () => {
  const clean = sanitizeDocumentHtml("<h2>Swali</h2><ul><li>Moja</li><li>Mbili</li></ul>");
  assert.match(clean, /<h2>Swali<\/h2>/);
  assert.match(clean, /<ul>/);
  assert.match(clean, /<li>Moja<\/li>/);
});

test("an unknown tag is dropped but its words are kept", () => {
  const clean = sanitizeDocumentHtml("<marquee>Habari</marquee>");
  assert.equal(clean.includes("marquee"), false);
  assert.match(clean, /Habari/);
});

test("the plain text of a document reads as one line", () => {
  const text = documentTextOf("<h1>Swali</h1><p>Eleza &amp; jibu</p><p>Kwa ufupi</p>");
  assert.equal(text, "Swali Eleza & jibu Kwa ufupi");
});

test("an empty document sanitises to an empty string", () => {
  assert.equal(sanitizeDocumentHtml(""), "");
  assert.equal(sanitizeDocumentHtml("<script>x()</script>"), "");
  assert.equal(documentTextOf(""), "");
});
