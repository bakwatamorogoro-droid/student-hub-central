import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import { genderLabel, type SeminarReport } from "@/lib/groupAssignment";
import {
  ALL_MARKS_HEADERS,
  GROUP_MARKS_HEADERS,
  allMarksRows,
  allMarksTable,
  groupMarksTable,
  type AllMarksRow,
  type GroupMark,
  type GroupMarksRow,
  type MarkRosterPerson,
} from "@/lib/assignmentMarks";

export type ExportKind = "xlsx" | "docx" | "pdf";

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

/** A safe file-name fragment: the group label is "SEMINA 3 · GROUP 5 · WANAUME". */
const slug = (value: string) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "alama";
const GAP = " ";

/** One flat row per group, which is what a spreadsheet wants. */
export function groupRows(reports: SeminarReport[]) {
  const rows: Record<string, string | number>[] = [];
  for (const r of reports) {
    for (const cell of [...r.male, ...r.female]) {
      rows.push({
        Semina: r.semina,
        Jinsia: genderLabel(cell.gender),
        Group: cell.group,
        "Idadi Iliyopo": cell.count,
        "Nafasi Zilizobaki": cell.free,
        Ukubwa: cell.size,
        Hali: cell.complete ? "IMEKAMILIKA" : "HAIJAKAMILIKA",
        Wanachama: cell.members.map((m) => `${m.full_name} (${m.reg_no})`).join("; "),
      });
    }
  }
  return rows;
}

/** One row per student, so the owner can sort and filter by any column. */
export function memberRows(reports: SeminarReport[]) {
  const rows: Record<string, string | number>[] = [];
  for (const r of reports) {
    for (const cell of [...r.male, ...r.female]) {
      for (const m of cell.members) {
        rows.push({
          Semina: r.semina,
          Jinsia: genderLabel(cell.gender),
          Group: cell.group,
          "Reg Namba": m.reg_no,
          Jina: m.full_name,
        });
      }
    }
  }
  return rows;
}

function buildWorkbook(reports: SeminarReport[]) {
  const wb = XLSX.utils.book_new();

  const summary = XLSX.utils.json_to_sheet(
    reports.map((r) => ({
      Semina: r.semina,
      "Magroup Yaliyokamilika": r.completeGroups,
      "Jumla ya Magroup": r.totalGroups,
      Wanaume: r.maleCount,
      Wanawake: r.femaleCount,
      "Jumla ya Wanafunzi": r.totalStudents,
      "Jinsia Haijulikani": r.unknownGender.length,
    })),
  );
  XLSX.utils.book_append_sheet(wb, summary, "Muhtasari");

  const groups = XLSX.utils.json_to_sheet(groupRows(reports));
  XLSX.utils.book_append_sheet(wb, groups, "Magroup");

  const members = XLSX.utils.json_to_sheet(memberRows(reports));
  XLSX.utils.book_append_sheet(wb, members, "Wanafunzi");

  const unknown = reports.flatMap((r) =>
    r.unknownGender.map((m) => ({ Semina: r.semina, "Reg Namba": m.reg_no, Jina: m.full_name })),
  );
  if (unknown.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unknown), "Jinsia Haijulikani");
  }

  return wb;
}

function exportXlsx(reports: SeminarReport[]) {
  XLSX.writeFile(buildWorkbook(reports), `magroup-na-semina-${stamp()}.xlsx`);
}

function exportCsv(reports: SeminarReport[]) {
  const ws = XLSX.utils.json_to_sheet(groupRows(reports));
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `magroup-na-semina-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function headerCell(text: string) {
  return new TableCell({
    width: { size: 14, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function bodyCell(text: string) {
  return new TableCell({ children: [new Paragraph(text)] });
}

async function exportDocx(reports: SeminarReport[]) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "Magroup na Semina", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun(
          `Imezalishwa: ${new Date().toLocaleString("sw-TZ")}${GAP}·${GAP}Semina ${reports.length}${GAP}·${GAP}Group 11 kwa kila jinsia${GAP}·${GAP}Wanafunzi 8 kwa group`,
        ),
      ],
    }),
  ];

  for (const r of reports) {
    children.push(
      new Paragraph({ text: r.semina, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [
          new TextRun(
            `Magroup yaliyokamilika: ${r.completeGroups}/${r.totalGroups}${GAP}·${GAP}Wanaume: ${r.maleCount}${GAP}·${GAP}Wanawake: ${r.femaleCount}${GAP}·${GAP}Jumla: ${r.totalStudents}`,
          ),
        ],
      }),
    );

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Jinsia"),
            headerCell("Group"),
            headerCell("Idadi"),
            headerCell("Hali"),
            headerCell("Wanachama"),
          ],
        }),
        ...[...r.male, ...r.female].map(
          (cell) =>
            new TableRow({
              children: [
                bodyCell(genderLabel(cell.gender)),
                bodyCell(cell.group),
                bodyCell(`${cell.count}/${cell.size}`),
                bodyCell(cell.complete ? "Ime-kamilika" : `Inahitaji ${cell.free}`),
                bodyCell(cell.members.map((m) => `${m.full_name} (${m.reg_no})`).join(", ") || "—"),
              ],
            }),
        ),
      ],
    });
    children.push(table, new Paragraph(""));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `magroup-na-semina-${stamp()}.docx`);
}

function exportPdf(reports: SeminarReport[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Magroup na Semina", 14, 15);
  doc.setFontSize(9);
  doc.text(
    `Imezalishwa: ${new Date().toLocaleString("sw-TZ")}  ·  Group 11 kwa kila jinsia  ·  Wanafunzi 8 kwa group`,
    14,
    21,
  );

  autoTable(doc, {
    startY: 26,
    head: [["Semina", "Jinsia", "Group", "Idadi", "Hali", "Wanachama"]],
    body: groupRows(reports).map((r) => [
      String(r.Semina),
      String(r.Jinsia),
      String(r.Group),
      `${r["Idadi Iliyopo"]}/${r.Ukubwa}`,
      String(r.Hali),
      String(r.Wanachama),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [16, 122, 87] },
    columnStyles: { 5: { cellWidth: 110 } },
  });

  const unknown = reports.flatMap((r) =>
    r.unknownGender.map((m) => [r.semina, m.reg_no, m.full_name]),
  );
  if (unknown.length) {
    const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    autoTable(doc, {
      startY: (after?.finalY ?? 26) + 8,
      head: [["Semina", "Reg Namba", "Jina — jinsia haijulikani"]],
      body: unknown,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [180, 120, 20] },
    });
  }

  doc.save(`magroup-na-semina-${stamp()}.pdf`);
}

export async function exportGroups(reports: SeminarReport[], kind: ExportKind): Promise<void> {
  if (kind === "xlsx") return exportXlsx(reports);
  if (kind === "docx") return exportDocx(reports);
  return exportPdf(reports);
}

export function exportGroupsCsv(reports: SeminarReport[]): void {
  exportCsv(reports);
}

/* -------------------------------------------------------------------------- */
/* Marks export — "Alama za Kazi"                                             */
/* -------------------------------------------------------------------------- */

/**
 * The owner asked for two things the group export does not cover:
 *
 * 1. Mark a group's work (the pen and the mark live on the admin screen).
 * 2. Export the marks to Excel, Word and PDF — one group at a time, or every
 *    group at once. When every group is exported, the sheet shows **only** the
 *    student's name, registration number, course and marks, because that is the
 *    list the owner hands back to the class.
 *
 * `allMarksRows` already produces that four-column shape; this file only turns
 * those rows into a file. The single-group export keeps the group label and the
 * group's mark in the heading so the owner can see which work was marked.
 */

const MARKS_TITLE = "Alama za Kazi — Kazi za Kufanya";
const MARKS_SUBTITLE =
  "Jina, Reg Namba, Kozi na Alama. Alama zilizowekwa na mwalimu kwa kazi za group.";

function exportMarksXlsx(rows: AllMarksRow[], title: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...ALL_MARKS_HEADERS] });
  ws["!cols"] = [{ wch: 20 }, { wch: 32 }, { wch: 44 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Alama");
  XLSX.writeFile(wb, `${slug(title)}-alama-${stamp()}.xlsx`);
}

function writeMarksCsv(rows: AllMarksRow[], title: string) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...ALL_MARKS_HEADERS] });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(title)}-alama-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportMarksDocx(rows: AllMarksRow[], title: string) {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ALL_MARKS_HEADERS.map((h) => headerCell(h)),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              bodyCell(r["Reg Namba"]),
              bodyCell(r.Jina),
              bodyCell(r.Kozi),
              bodyCell(r.Alama),
              bodyCell(r["Daraja (Grade)"]),
            ],
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: MARKS_TITLE, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun(
                `${title}${GAP}·${GAP}Wanafunzi ${rows.length}${GAP}·${GAP}${MARKS_SUBTITLE}`,
              ),
            ],
          }),
          new Paragraph(""),
          table,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${slug(title)}-alama-${stamp()}.docx`);
}

function exportMarksPdf(rows: AllMarksRow[], title: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(MARKS_TITLE, 14, 15);
  doc.setFontSize(9);
  doc.text(
    `${title}  ·  Imezalishwa: ${new Date().toLocaleString("sw-TZ")}  ·  Wanafunzi ${rows.length}`,
    14,
    21,
  );
  autoTable(doc, {
    startY: 26,
    head: [[...ALL_MARKS_HEADERS]],
    body: allMarksTable(rows),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [16, 122, 87] },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 70 }, 2: { cellWidth: 90 } },
  });
  doc.save(`${slug(title)}-alama-${stamp()}.pdf`);
}

/** The group's own mark, in the same four-column shape, for a one-group export. */
export function marksRowsForGroup(
  roster: MarkRosterPerson[],
  mark: GroupMark | null,
): AllMarksRow[] {
  return allMarksRows(roster, mark ? [mark] : []);
}

export type MarksExportKind = ExportKind;

/**
 * Writes the marks out.
 *
 * `title` is what names the file and heads the document — the group label for one
 * group, or "Magroup Yote" for everyone.
 */
export async function exportMarks(
  rows: AllMarksRow[],
  kind: MarksExportKind,
  title = "Magroup Yote",
): Promise<void> {
  if (kind === "xlsx") return exportMarksXlsx(rows, title);
  if (kind === "docx") return exportMarksDocx(rows, title);
  return exportMarksPdf(rows, title);
}

export function exportMarksCsv(rows: AllMarksRow[], title = "Magroup Yote"): void {
  writeMarksCsv(rows, title);
}

/* -------------------------------------------------------------------------- */
/* Per-group marks export — "Alama za Group"                                  */
/* -------------------------------------------------------------------------- */

/**
 * The owner's second request: the admin finishes marking, then either downloads
 * everyone at once, or ticks the groups they want and downloads those alone —
 * each with its own students and its own mark.
 *
 * This is the per-group shape, not the flat "everyone" shape: the group, the
 * seminar and the gender are carried on every line so a sheet that holds three
 * groups is still readable on its own. `groupMarksRows` builds those rows; this
 * section only turns them into a file.
 */

const GROUP_MARKS_TITLE = "Alama za Kazi — Kazi za Kufanya (kwa Group)";
const GROUP_MARKS_SUBTITLE =
  "Kila group na wanafunzi wake, kozi na alama zake. Alama zilizowekwa na mwalimu.";

function exportGroupMarksXlsx(rows: GroupMarksRow[], title: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...GROUP_MARKS_HEADERS] });
  ws["!cols"] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 20 },
    { wch: 32 },
    { wch: 44 },
    { wch: 10 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Alama");
  XLSX.writeFile(wb, `${slug(title)}-alama-group-${stamp()}.xlsx`);
}

function writeGroupMarksCsv(rows: GroupMarksRow[], title: string) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...GROUP_MARKS_HEADERS] });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(title)}-alama-group-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportGroupMarksDocx(rows: GroupMarksRow[], title: string) {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: GROUP_MARKS_HEADERS.map((h) => headerCell(h)),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              bodyCell(r.Group),
              bodyCell(r.Semina),
              bodyCell(r.Jinsia),
              bodyCell(r["Reg Namba"]),
              bodyCell(r.Jina),
              bodyCell(r.Kozi),
              bodyCell(r.Alama),
              bodyCell(r["Daraja (Grade)"]),
            ],
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: GROUP_MARKS_TITLE, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun(
                `${title}${GAP}·${GAP}Wanafunzi ${rows.length}${GAP}·${GAP}${GROUP_MARKS_SUBTITLE}`,
              ),
            ],
          }),
          new Paragraph(""),
          table,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${slug(title)}-alama-group-${stamp()}.docx`);
}

function exportGroupMarksPdf(rows: GroupMarksRow[], title: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(GROUP_MARKS_TITLE, 14, 15);
  doc.setFontSize(9);
  doc.text(
    `${title}  ·  Imezalishwa: ${new Date().toLocaleString("sw-TZ")}  ·  Wanafunzi ${rows.length}`,
    14,
    21,
  );
  autoTable(doc, {
    startY: 26,
    head: [[...GROUP_MARKS_HEADERS]],
    body: groupMarksTable(rows),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [16, 122, 87] },
    columnStyles: { 3: { cellWidth: 32 }, 4: { cellWidth: 55 }, 5: { cellWidth: 70 } },
  });
  doc.save(`${slug(title)}-alama-group-${stamp()}.pdf`);
}

/**
 * Writes the per-group marks out.
 *
 * `title` names the file and heads the document — one group's label, or a
 * summary such as "Magroup 5 yaliyochaguliwa" for a hand-picked set.
 */
export async function exportGroupMarks(
  rows: GroupMarksRow[],
  kind: MarksExportKind,
  title = "Magroup Yote",
): Promise<void> {
  if (kind === "xlsx") return exportGroupMarksXlsx(rows, title);
  if (kind === "docx") return exportGroupMarksDocx(rows, title);
  return exportGroupMarksPdf(rows, title);
}

export function exportGroupMarksCsv(rows: GroupMarksRow[], title = "Magroup Yote"): void {
  writeGroupMarksCsv(rows, title);
}
