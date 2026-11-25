/**
 * Builds the four result downloads the admin hands to a class.
 *
 * Every format carries the same three columns — name, registration number,
 * mark — in the same alphabetical order, and nothing else about anybody. The
 * builders live here rather than inside the page so the artifacts themselves can
 * be generated and read back in a test, which is the only way to know a
 * spreadsheet really has three columns.
 */
import * as XLSX from "xlsx";
// The named export exists in both the browser and the node build; the default
// export is the class in one and `{ jsPDF }` in the other.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import type { ResultRow } from "@/lib/resultRows";

export const RESULT_HEADERS = ["Jina", "Reg Namba", "Alama"] as const;

export type ResultMeta = {
  /** "TEST 1" — the label the admin uses for the exam. */
  title: string;
  /** The exam's full title, shown under the label. */
  subtitle?: string;
  /** Pre-formatted date line, so the builders stay free of locale settings. */
  date: string;
};

const HEADER_FILL = "0F4C3A";
const ZEBRA_FILL = "F4F8F6";
const BORDER_COLOR = "D6E3DD";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };

export function resultSheet(rows: ResultRow[], meta: ResultMeta): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([
    [meta.title],
    [meta.subtitle || ""],
    [`${rows.length} wanafunzi · ${meta.date}`],
    [],
    [...RESULT_HEADERS],
    ...rows.map((r) => [r.Jina, r["Reg Namba"], r.Alama]),
  ]);
  ws["!cols"] = [{ wch: 36 }, { wch: 20 }, { wch: 11 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
  ];
  ws["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 17 }, { hpt: 6 }];
  // Anchored to the header row, not A1, so the title block above it does not
  // become a filter dropdown of its own.
  ws["!autofilter"] = { ref: `A5:C${4 + rows.length}` };
  return ws;
}

export function resultWorkbook(rows: ResultRow[], meta: ResultMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resultSheet(rows, meta), meta.title);
  return wb;
}

/**
 * The spreadsheet as bytes. The caller owns the download, so the page never has
 * to import a spreadsheet library of its own — writing the workbook with the
 * plain `xlsx` package would silently drop the styling.
 */
export function resultXlsx(rows: ResultRow[], meta: ResultMeta): ArrayBuffer {
  return XLSX.write(resultWorkbook(rows, meta), {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
}

/** Plain CSV, three columns, no title block — the shape other tools expect. */
export function resultCsv(rows: ResultRow[]): string {
  return XLSX.utils.sheet_to_csv(
    XLSX.utils.aoa_to_sheet([
      [...RESULT_HEADERS],
      ...rows.map((r) => [r.Jina, r["Reg Namba"], r.Alama]),
    ]),
  );
}

export function resultPdf(rows: ResultRow[], meta: ResultMeta): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 76, 58);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(meta.title, 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(meta.subtitle || "", 120), 14, 19);
  doc.setFontSize(8);
  doc.text(`${rows.length} wanafunzi`, pageWidth - 14, 13, { align: "right" });
  doc.text(meta.date, pageWidth - 14, 19, { align: "right" });

  doc.setTextColor(20, 20, 20);
  autoTable(doc, {
    startY: 36,
    head: [[...RESULT_HEADERS]],
    body: rows.map((r) => [r.Jina, r["Reg Namba"], r.Alama]),
    margin: { left: 14, right: 14, bottom: 18 },
    tableWidth: 182,
    styles: { fontSize: 9.5, cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 } },
    headStyles: { fillColor: [15, 76, 58], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 248, 246] },
    columnStyles: {
      0: { cellWidth: 104 },
      1: { cellWidth: 50 },
      2: { cellWidth: 28, halign: "center", fontStyle: "bold" },
    },
    didDrawPage: () => {
      // Only the document's own facts at the foot — never another student's
      // details, which is what the owner asked to keep out of the sheet.
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 128);
      doc.text(
        doc.splitTextToSize(`${meta.title} — ${meta.subtitle || ""}`.trim(), 150),
        14,
        height - 10,
      );
      doc.text(`Ukurasa ${doc.getNumberOfPages()}`, pageWidth - 14, height - 10, {
        align: "right",
      });
    },
  });
  return doc;
}

export function resultDocument(rows: ResultRow[], meta: ResultMeta): Document {
  const cell = (
    text: string,
    opts: { bold?: boolean; fill?: string; align?: "left" | "center" } = {},
  ) =>
    new TableCell({
      shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [
        new Paragraph({
          alignment: opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: opts.bold, size: 20 })],
        }),
      ],
    });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
      insideHorizontal: BORDER,
      insideVertical: BORDER,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: RESULT_HEADERS.map((h) =>
          cell(h, { bold: true, fill: HEADER_FILL, align: h === "Alama" ? "center" : "left" }),
        ),
      }),
      ...rows.map(
        (r, i) =>
          new TableRow({
            children: RESULT_HEADERS.map((h) =>
              cell(String(r[h] ?? ""), {
                fill: i % 2 === 1 ? ZEBRA_FILL : undefined,
                align: h === "Alama" ? "center" : "left",
              }),
            ),
          }),
      ),
    ],
  });

  // The same two facts the PDF repeats at the foot of every page: which test
  // this is, and which page of it the reader is holding.
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        children: [
          new TextRun({
            text: `${meta.title} — ${meta.subtitle || ""}`.trim(),
            size: 16,
            color: "7A8582",
          }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({ text: "Ukurasa ", size: 16, color: "7A8582" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "7A8582" }),
        ],
      }),
    ],
  });

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        footers: { default: footer },
        children: [
          new Paragraph({
            children: [new TextRun({ text: meta.title, bold: true, size: 36, color: HEADER_FILL })],
          }),
          new Paragraph({
            children: [new TextRun({ text: meta.subtitle || "", size: 22, color: "55605C" })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${rows.length} wanafunzi · ${meta.date}`,
                size: 18,
                color: "7A8582",
              }),
            ],
            spacing: { after: 220 },
          }),
          table,
        ],
      },
    ],
  });
}

export async function resultDocxBlob(rows: ResultRow[], meta: ResultMeta): Promise<Blob> {
  return Packer.toBlob(resultDocument(rows, meta));
}
