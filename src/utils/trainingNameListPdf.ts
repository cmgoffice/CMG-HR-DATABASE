// Auto-fill PDF ของ "ใบปะหน้า" (Training Name List) — ใช้ layout ตามแบบฟอร์มต้นฉบับ (Training Name List.docx):
// COURSE / DATE / TIME / LOCATION / TRAINER ตามด้วยตาราง No./Name/Company/Position/Signature/Remark (เว้นช่องเซ็นชื่อ/หมายเหตุให้กรอกมือ)
// และท้ายตาราง Management/Staff/Worker/Total + ช่องลงชื่อวิทยากร
import { PDFDocument, PDFFont, PDFPage, PageSizes, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import sarabunLatinRegularUrl from "@fontsource/sarabun/files/sarabun-latin-400-normal.woff";
import sarabunLatinBoldUrl from "@fontsource/sarabun/files/sarabun-latin-600-normal.woff";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const FONT_BOLD_URL = asset("/fonts/sarabun-thai-600-normal.woff");

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

const fontCache = new Map<string, Uint8Array>();
const loadFontBytes = async (url: string): Promise<Uint8Array> => {
  if (!fontCache.has(url)) fontCache.set(url, await fetchBytes(url));
  return fontCache.get(url)!;
};

interface PdfFontSet {
  thai: PDFFont;
  latin: PDFFont;
}

const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN_X = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TEXT_COLOR = rgb(0.05, 0.05, 0.15);
const LINE_COLOR = rgb(0.2, 0.2, 0.25);

const fontForCharacter = (fonts: PdfFontSet, character: string): PDFFont =>
  /[\u0E00-\u0E7F]/.test(character) ? fonts.thai : fonts.latin;

const textWidth = (fonts: PdfFontSet, text: string, size: number): number =>
  Array.from(text).reduce((width, character) => width + fontForCharacter(fonts, character).widthOfTextAtSize(character, size), 0);

const drawText = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; y: number; size: number; align?: "left" | "center" }
) => {
  let x = options.x;
  if (options.align === "center") {
    x = options.x - textWidth(fonts, text, options.size) / 2;
  }
  let run = "";
  let runFont: PDFFont | undefined;
  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, { x, y: options.y, size: options.size, font: runFont, color: TEXT_COLOR });
    x += runFont.widthOfTextAtSize(run, options.size);
    run = "";
  };
  for (const character of Array.from(text)) {
    const characterFont = fontForCharacter(fonts, character);
    if (runFont && characterFont !== runFont) flush();
    runFont = characterFont;
    run += character;
  }
  flush();
};

/** ตัดข้อความให้พอดีกับความกว้าง maxWidth (ตัดท้ายด้วย … ถ้ายาวเกิน) ใช้กับเซลล์ตารางที่มีพื้นที่จำกัด */
const fitText = (fonts: PdfFontSet, text: string, maxWidth: number, size: number): string => {
  if (textWidth(fonts, text, size) <= maxWidth) return text;
  let cut = text.length;
  while (cut > 0 && textWidth(fonts, text.slice(0, cut) + "…", size) > maxWidth) cut -= 1;
  return text.slice(0, cut) + "…";
};

/** หาขนาดตัวอักษรที่เล็กที่สุดเท่าที่จำเป็นเพื่อให้ข้อความแสดงครบ (ไม่ตัด …) ภายในความกว้างที่กำหนด
 * ลดขนาดลงทีละ 0.5pt จนกว่าจะพอดี โดยไม่เล็กกว่า minSize — ถ้าเล็กสุดแล้วยังไม่พอดีค่อยตัดด้วย fitText เป็นทางสุดท้าย */
const fitSizeForText = (fonts: PdfFontSet, text: string, maxWidth: number, maxSize: number, minSize = 6): number => {
  let size = maxSize;
  while (size > minSize && textWidth(fonts, text, size) > maxWidth) size -= 0.5;
  return size;
};

/** วาดข้อความในเซลล์โดยลดขนาดฟอนต์อัตโนมัติให้เห็นชื่อ/ข้อความครบโดยไม่ตัดคำ (ตัดด้วย … เฉพาะกรณีเล็กสุดแล้วยังไม่พอดีจริง ๆ) */
const drawFittedCellText = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; width: number; y: number; maxSize: number; align?: "left" | "center" }
) => {
  if (!text) return;
  const maxW = options.width - 10;
  const size = fitSizeForText(fonts, text, maxW, options.maxSize);
  const display = textWidth(fonts, text, size) <= maxW ? text : fitText(fonts, text, maxW, size);
  drawText(page, fonts, display, {
    x: options.align === "center" ? options.x + options.width / 2 : options.x + 5,
    y: options.y,
    size,
    align: options.align,
  });
};

const loadPdfWithFonts = async (): Promise<{ pdfDoc: PDFDocument; regular: PdfFontSet; bold: PdfFontSet }> => {
  const [regularBytes, boldBytes, latinRegularBytes, latinBoldBytes] = await Promise.all([
    loadFontBytes(FONT_REGULAR_URL),
    loadFontBytes(FONT_BOLD_URL),
    loadFontBytes(sarabunLatinRegularUrl),
    loadFontBytes(sarabunLatinBoldUrl),
  ]);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit as any);
  const regular = {
    thai: await pdfDoc.embedFont(regularBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinRegularBytes, { subset: true }),
  };
  const bold = {
    thai: await pdfDoc.embedFont(boldBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinBoldBytes, { subset: true }),
  };
  return { pdfDoc, regular, bold };
};

const downloadBlob = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const openPdfInNewTab = (bytes: Uint8Array) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = "preview.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// คอลัมน์ตาราง: ลำดับ, ชื่อ-สกุล, บริษัท, ตำแหน่ง, ลงชื่อ (เว้นว่าง), หมายเหตุ (เว้นว่าง)
const COLS = [
  { key: "no", label: "No.", width: 26 },
  { key: "name", label: "Name", width: 135 },
  { key: "company", label: "Company", width: 140 },
  { key: "position", label: "Position", width: 85 },
  { key: "signature", label: "Signature", width: 65 },
  { key: "remark", label: "Remark", width: 0 }, // คำนวณที่เหลือทีหลัง
];
COLS[COLS.length - 1].width = CONTENT_WIDTH - COLS.slice(0, -1).reduce((s, c) => s + c.width, 0);

const ROWS_PER_PAGE = 15;
const ROW_HEIGHT = 24;
const HEADER_ROW_HEIGHT = 22;

const drawTableHeaderRow = (page: PDFPage, bold: PdfFontSet, topY: number): number => {
  let x = MARGIN_X;
  page.drawRectangle({
    x: MARGIN_X,
    y: topY - HEADER_ROW_HEIGHT,
    width: CONTENT_WIDTH,
    height: HEADER_ROW_HEIGHT,
    color: rgb(0.9, 0.92, 0.96),
    borderColor: LINE_COLOR,
    borderWidth: 0.8,
  });
  COLS.forEach((col) => {
    page.drawLine({
      start: { x, y: topY },
      end: { x, y: topY - HEADER_ROW_HEIGHT },
      thickness: 0.8,
      color: LINE_COLOR,
    });
    drawText(page, bold, col.label, { x: x + col.width / 2, y: topY - HEADER_ROW_HEIGHT + 7, size: 9.5, align: "center" });
    x += col.width;
  });
  page.drawLine({ start: { x, y: topY }, end: { x, y: topY - HEADER_ROW_HEIGHT }, thickness: 0.8, color: LINE_COLOR });
  return topY - HEADER_ROW_HEIGHT;
};

const drawTableRow = (
  page: PDFPage,
  regular: PdfFontSet,
  topY: number,
  values: { no: string; name: string; company: string; position: string }
): number => {
  let x = MARGIN_X;
  page.drawRectangle({
    x: MARGIN_X,
    y: topY - ROW_HEIGHT,
    width: CONTENT_WIDTH,
    height: ROW_HEIGHT,
    borderColor: LINE_COLOR,
    borderWidth: 0.8,
  });
  const cellTextY = topY - ROW_HEIGHT + 8;
  COLS.forEach((col) => {
    page.drawLine({ start: { x, y: topY }, end: { x, y: topY - ROW_HEIGHT }, thickness: 0.8, color: LINE_COLOR });
    if (col.key === "no") {
      drawFittedCellText(page, regular, values.no, { x, width: col.width, y: cellTextY, maxSize: 9.5, align: "center" });
    } else if (col.key === "name") {
      drawFittedCellText(page, regular, values.name, { x, width: col.width, y: cellTextY, maxSize: 9.5 });
    } else if (col.key === "company") {
      drawFittedCellText(page, regular, values.company, { x, width: col.width, y: cellTextY, maxSize: 9.5 });
    } else if (col.key === "position") {
      drawFittedCellText(page, regular, values.position, { x, width: col.width, y: cellTextY, maxSize: 9.5 });
    }
    // signature / remark เว้นว่างไว้ให้กรอกด้วยมือ
    x += col.width;
  });
  page.drawLine({ start: { x, y: topY }, end: { x, y: topY - ROW_HEIGHT }, thickness: 0.8, color: LINE_COLOR });
  return topY - ROW_HEIGHT;
};

const drawHeaderFields = (
  page: PDFPage,
  regular: PdfFontSet,
  bold: PdfFontSet,
  batch: TrainingBatch,
  topY: number
): number => {
  let y = topY;
  const title = "TRAINING NAME LIST";
  drawText(page, bold, title, { x: PAGE_WIDTH / 2, y, size: 14, align: "center" });
  y -= 24;

  const fieldLine = (label: string, value: string, yy: number) => {
    drawText(page, bold, `${label} :`, { x: MARGIN_X, y: yy, size: 10.5 });
    const labelW = textWidth(bold, `${label} :`, 10.5);
    const valueX = MARGIN_X + labelW + 6;
    if (value) {
      drawText(page, regular, value, { x: valueX, y: yy, size: 10.5 });
    } else {
      page.drawLine({ start: { x: valueX, y: yy - 2 }, end: { x: PAGE_WIDTH - MARGIN_X, y: yy - 2 }, thickness: 0.7, color: LINE_COLOR });
    }
  };

  fieldLine("COURSE", batch.courseName || "", y);
  y -= 18;
  fieldLine("DATE", batch.date || "", y);
  y -= 18;
  fieldLine("TIME", batch.timeSlot || "", y);
  y -= 18;
  fieldLine("LOCATION", batch.location || "", y);
  y -= 18;
  fieldLine("TRAINER", batch.trainer || "", y);
  y -= 22;
  return y;
};

const drawFooterSummary = (page: PDFPage, regular: PdfFontSet, bold: PdfFontSet, y: number, total: number): number => {
  const boxW = CONTENT_WIDTH / 4;
  const boxH = 30;
  const labels = ["Management", "Staff", "Worker", "Total"];
  const values = ["", "", "", String(total)];
  labels.forEach((label, idx) => {
    const x = MARGIN_X + idx * boxW;
    page.drawRectangle({ x, y: y - boxH, width: boxW, height: boxH, borderColor: LINE_COLOR, borderWidth: 0.8 });
    drawText(page, bold, label, { x: x + boxW / 2, y: y - 12, size: 9, align: "center" });
    drawText(page, regular, values[idx], { x: x + boxW / 2, y: y - 25, size: 9.5, align: "center" });
  });
  return y - boxH - 26;
};

const drawTrainerSignature = (page: PDFPage, regular: PdfFontSet, bold: PdfFontSet, y: number, trainer: string) => {
  drawText(page, bold, "TRAINER Signature :", { x: MARGIN_X, y, size: 10.5 });
  const labelW = textWidth(bold, "TRAINER Signature :", 10.5);
  page.drawLine({ start: { x: MARGIN_X + labelW + 8, y: y - 2 }, end: { x: MARGIN_X + 260, y: y - 2 }, thickness: 0.7, color: LINE_COLOR });
  if (trainer) {
    drawText(page, regular, `( ${trainer} )`, { x: MARGIN_X + labelW + 12, y: y - 16, size: 9 });
  }
};

export const generateTrainingNameListPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[]
): Promise<Uint8Array> => {
  const { pdfDoc, regular, bold } = await loadPdfWithFonts();
  const pages = Math.max(1, Math.ceil(enrollments.length / ROWS_PER_PAGE));

  for (let p = 0; p < pages; p += 1) {
    const page = pdfDoc.addPage(PageSizes.A4);
    let y = PAGE_HEIGHT - MARGIN_X;
    y = drawHeaderFields(page, regular, bold, batch, y);
    if (pages > 1) {
      drawText(page, regular, `หน้า ${p + 1}/${pages}`, { x: PAGE_WIDTH - MARGIN_X - 40, y: PAGE_HEIGHT - MARGIN_X + 2, size: 9 });
    }

    y = drawTableHeaderRow(page, bold, y);
    const pageEnrollments = enrollments.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    // วาดให้ครบ 15 แถวเสมอต่อหน้า (เหมือนแบบฟอร์มต้นฉบับ) แถวที่เกินจำนวนคนจริงจะเว้นว่างไว้สำหรับเพิ่มชื่อหน้างาน
    for (let i = 0; i < ROWS_PER_PAGE; i += 1) {
      const en = pageEnrollments[i];
      y = drawTableRow(page, regular, y, {
        no: String(p * ROWS_PER_PAGE + i + 1),
        name: en?.employeeName || "",
        company: en?.company || "",
        position: en?.position || "",
      });
    }

    y -= 14;
    if (p === pages - 1) {
      y = drawFooterSummary(page, regular, bold, y, enrollments.length);
      drawTrainerSignature(page, regular, bold, y, batch.trainer || "");
    }
  }

  return pdfDoc.save();
};

export const generateAndDownloadTrainingNameListPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[]
): Promise<void> => {
  const bytes = await generateTrainingNameListPdf(batch, enrollments);
  downloadBlob(bytes, `ใบปะหน้ารายชื่อเข้าอบรม_${batch.project}_${batch.date || ""}.pdf`);
};

export const generateAndPreviewTrainingNameListPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[]
): Promise<void> => {
  const bytes = await generateTrainingNameListPdf(batch, enrollments);
  openPdfInNewTab(bytes);
};
