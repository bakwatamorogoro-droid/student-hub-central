import assert from "node:assert/strict";
import test from "node:test";

import { parseTutorSections } from "./tutorAiParse.ts";

test("parseTutorSections reads the three labelled sections", () => {
  const raw = [
    "MAELEZO: Zaka ni malipo ya lazima kutoka mali.",
    "MAMBO YA KUTAJA:",
    "- Ni wajibu kwa Mwislamu mwenye mali",
    "- Hupewa maskini na wafanyokosa",
    "TAHADHARI: Thibitisha kiasi na mwalimu wako.",
  ].join("\n");
  const s = parseTutorSections(raw);
  assert.equal(s.explanation, "Zaka ni malipo ya lazima kutoka mali.");
  assert.deepEqual(s.keyPoints, [
    "Ni wajibu kwa Mwislamu mwenye mali",
    "Hupewa maskini na wafanyokosa",
  ]);
  assert.equal(s.caveat, "Thibitisha kiasi na mwalimu wako.");
});

test("parseTutorSections accepts the English labels too", () => {
  const raw =
    "EXPLANATION: Tawhid is the oneness of God.\nKEY POINTS: One God; No partners\nNOTE: Ask your teacher.";
  const s = parseTutorSections(raw);
  assert.equal(s.explanation, "Tawhid is the oneness of God.");
  assert.deepEqual(s.keyPoints, ["One God", "No partners"]);
  assert.equal(s.caveat, "Ask your teacher.");
});

test("parseTutorSections treats an unlabelled reply as the explanation", () => {
  // The most common free-model failure: it ignores the format and writes prose.
  // That must still be readable rather than dropped.
  const s = parseTutorSections("Swala ni ibada ya kusimama mbele ya Mungu mara tano kwa siku.");
  assert.equal(s.explanation, "Swala ni ibada ya kusimama mbele ya Mungu mara tano kwa siku.");
  assert.deepEqual(s.keyPoints, []);
  assert.equal(s.caveat, null);
});

test("parseTutorSections reads markdown-decorated labels", () => {
  // Every free model wrote `**MAELEZO:**` rather than the bare label the prompt
  // asks for. Before this was handled, the whole reply arrived as one blob.
  const raw = [
    "**MAELEZO:**",
    "Ijtihad ni juhudi za kisheria kutoa hukumu.",
    "",
    "**MAMBO YA KUTAJA:**",
    "- Inahitaji ujuzi wa Kiarabu",
    "- Hutumia qiyas na maslahah",
    "",
    "**TAHADHARI:** Thibitisha na mwalimu wako.",
  ].join("\n");
  const s = parseTutorSections(raw);
  assert.equal(s.explanation, "Ijtihad ni juhudi za kisheria kutoa hukumu.");
  assert.deepEqual(s.keyPoints, ["Inahitaji ujuzi wa Kiarabu", "Hutumia qiyas na maslahah"]);
  assert.equal(s.caveat, "Thibitisha na mwalimu wako.");
});

test("parseTutorSections reads heading-style labels", () => {
  const raw = "## MAELEZO\nHijra ni kuhamia Madina.\n## MAMBO YA KUTAJA\n- 622\n- Kutoka Makka";
  const s = parseTutorSections(raw);
  assert.equal(s.explanation, "Hijra ni kuhamia Madina.");
  assert.deepEqual(s.keyPoints, ["622", "Kutoka Makka"]);
});

test("parseTutorSections does not treat an English word as a Swahili label", () => {
  // "NOTE" is a caveat label, but a sentence merely *containing* "note" is not.
  const s = parseTutorSections("NOTE: Angalia mwalimu wako.\nKumbuka kuwa Zaka ni wajibu.");
  assert.equal(s.caveat, "Angalia mwalimu wako. Kumbuka kuwa Zaka ni wajibu.");
});

test("parseTutorSections handles numbered key points", () => {
  const s = parseTutorSections("MAMBO YA KUTAJA:\n1. Nguzo ya kwanza\n2. Nguzo ya pili");
  assert.deepEqual(s.keyPoints, ["Nguzo ya kwanza", "Nguzo ya pili"]);
});

test("parseTutorSections splits semicolon-separated points", () => {
  const s = parseTutorSections("MAMBO YA KUTAJA: imani; ibada; maadili");
  assert.deepEqual(s.keyPoints, ["imani", "ibada", "maadili"]);
});

test("parseTutorSections joins multi-line explanations", () => {
  const s = parseTutorSections("MAELEZO: Mstari wa kwanza.\nMstari wa pili unaendelea.");
  assert.equal(s.explanation, "Mstari wa kwanza. Mstari wa pili unaendelea.");
});

test("parseTutorSections returns empty sections for blank input", () => {
  assert.deepEqual(parseTutorSections(""), { explanation: "", keyPoints: [], caveat: null });
  assert.deepEqual(parseTutorSections("   \n  "), { explanation: "", keyPoints: [], caveat: null });
});

test("parseTutorSections ignores a trailing empty caveat", () => {
  const s = parseTutorSections("MAELEZO: Jibu.\nTAHADHARI:");
  assert.equal(s.explanation, "Jibu.");
  assert.equal(s.caveat, null);
});
