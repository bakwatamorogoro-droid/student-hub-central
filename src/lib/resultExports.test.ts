import { test } from "node:test";
import assert from "node:assert/strict";

import JSZip from "jszip";
import * as XLSX from "xlsx";

import { resultRows } from "./resultRows.ts";
import {
  RESULT_HEADERS,
  resultCsv,
  resultDocxBlob,
  resultPdf,
  resultWorkbook,
} from "./resultExports.ts";

const rows = resultRows([
  { reg_no: "IS/2024/002", score: 88, students: { full_name: "Zainab Ally" } },
  { reg_no: "IS/2024/001", score: 71, students: { full_name: "Amina Juma" } },
  { reg_no: "IS/2024/003", score: null, students: { full_name: "Bakari Mussa" } },
]);

const meta = { title: "TEST 1", subtitle: "ASSESSMENT TEST 2", date: "25/11/2026" };

/** The text jspdf wrote, read straight out of the uncompressed content stream. */
function pdfText(doc: ReturnType<typeof resultPdf>): string {
  const raw = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const tokens = [...raw.matchAll(/\((.*?)\)\s*Tj/g)].map((m) => m[1]);
  return tokens.join("\n");
}

test("the three columns are the whole contract, in every format", () => {
  assert.deepEqual([...RESULT_HEADERS], ["Jina", "Reg Namba", "Alama"]);
});

test("the spreadsheet holds a name, a registration number and a mark per student", () => {
  const wb = resultWorkbook(rows, meta);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });

  assert.deepEqual(grid[4], ["Jina", "Reg Namba", "Alama"]);
  assert.deepEqual(grid.slice(5), [
    ["Amina Juma", "IS/2024/001", "71"],
    ["Bakari Mussa", "IS/2024/003", ""],
    ["Zainab Ally", "IS/2024/002", "88"],
  ]);
});

test("the spreadsheet has no column for phone, course, GPS or submission time", () => {
  const wb = resultWorkbook(rows, meta);
  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
  });
  const widest = Math.max(...grid.map((r) => r.length));
  assert.equal(widest, 3);
  const flat = grid.flat().join(" ");
  for (const banned of ["Simu", "Kozi", "Semina", "GPS", "Imetumwa"]) {
    assert.ok(!flat.includes(banned), `${banned} leaked into the sheet`);
  }
});

test("the CSV is header plus rows, nothing else", () => {
  assert.equal(
    resultCsv(rows),
    [
      "Jina,Reg Namba,Alama",
      "Amina Juma,IS/2024/001,71",
      "Bakari Mussa,IS/2024/003,",
      "Zainab Ally,IS/2024/002,88",
    ].join("\n"),
  );
});

test("the PDF prints the three headings and the three rows", () => {
  const text = pdfText(resultPdf(rows, meta));
  for (const value of [
    "Jina",
    "Reg Namba",
    "Alama",
    "Amina Juma",
    "IS/2024/001",
    "71",
    "Zainab Ally",
    "88",
  ]) {
    assert.ok(text.includes(value), `missing ${value}`);
  }
  for (const banned of ["Simu", "Kozi", "GPS"]) {
    assert.ok(!text.includes(banned), `${banned} leaked into the PDF`);
  }
});

test("the PDF is one portrait A4 page for a small class", () => {
  const doc = resultPdf(rows, meta);
  assert.equal(doc.getNumberOfPages(), 1);
  // jspdf stores A4 in points, so the millimetre figures come back fractional.
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 297) < 0.01);
});

test("the Word table has three cells in every row", async () => {
  const blob = await resultDocxBlob(rows, meta);
  // `docx` writes the archive with jszip, which it brings along as a dependency.
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const xml = await zip.file("word/document.xml")!.async("string");

  const tableRows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
  assert.equal(tableRows.length, 4, "header plus three students");
  for (const row of tableRows) {
    assert.equal((row.match(/<w:tc>/g) ?? []).length, 3);
  }
  for (const value of ["Jina", "Reg Namba", "Alama", "Amina Juma", "Zainab Ally"]) {
    assert.ok(xml.includes(value), `missing ${value}`);
  }
  for (const banned of ["Simu", "Kozi", "GPS"]) {
    assert.ok(!xml.includes(banned), `${banned} leaked into the Word file`);
  }
});

test("the Word file repeats the test name and page number on every page", async () => {
  const blob = await resultDocxBlob(rows, meta);
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const footer = Object.keys(zip.files).find((n) => /^word\/footer\d*\.xml$/.test(n));
  assert.ok(footer, "no footer part in the archive");
  const xml = await zip.file(footer)!.async("string");

  assert.ok(xml.includes("TEST 1"), "footer does not name the test");
  assert.ok(xml.includes("Ukurasa"), "footer does not label the page number");
  // The page number must be the live PAGE field, not a fixed "1" typed in.
  assert.ok(xml.includes("PAGE"), "footer page number is not a field");
});
