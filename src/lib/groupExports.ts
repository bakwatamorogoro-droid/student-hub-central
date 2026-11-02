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

export type ExportKind = "xlsx" | "docx" | "pdf";

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
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
