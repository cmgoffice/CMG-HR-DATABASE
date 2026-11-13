// Auto-fill PDF ของ "ใบปะหน้า" เฉพาะโครงการ HUASHI Building B (J-078) — ใช้วิธี "overlay" เขียนทับ
// บนไฟล์ฟอร์มต้นฉบับจริงของลูกค้า ทุกอย่าง (สี/เส้นตาราง/โลโก้ HUASHI/ป้ายข้อความ) คงเดิมเป๊ะเพราะใช้
// หน้าเพจจริงจากไฟล์ต้นฉบับเป็นพื้นหลัง ไม่ได้วาดขึ้นใหม่
// เทมเพลตปัจจุบันคือ "Training Request Form rev.0 edit 1" ที่ขยายช่องชื่อ-นามสกุลให้กว้างขึ้น
// (คอลัมน์ Name+Last name ~204pt, ยังไม่มีเส้นกั้นกลาง — แบ่งครึ่งตามตำแหน่งหัวตาราง) และเหลือ 21 แถว/หน้า
// พิกัดวัดจากเส้นตารางจริงในไฟล์ (pdfjs operator list) — ตัวอักษรจัดกึ่งกลางช่อง ทั้งหัวฟอร์มและตาราง
// ตำแหน่งที่ยาวเกินหนึ่งบรรทัดจะตัดเป็น 2 บรรทัดในแถวเดียวกัน แทนการตัดด้วย "…"
// ต่างจากใบปะหน้าแบบทั่วไปตรงที่มีคอลัมน์ "Identity verification document" แยกย่อย 4 ช่อง
// (Passport+Visa / Pink card / Permit Verification Pending / No Work Permit) สำหรับแรงงานต่างด้าว
// ซึ่งคำนวณอัตโนมัติจากข้อมูลเอกสารแรงงานต่างด้าวที่มีอยู่แล้วในระบบ (migrant_documents)
import { LineCapStyle, PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import { sarabunLatinRegularUrl, sarabunLatinBoldUrl } from "./thaiFonts";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";
import { isMigrantNationality, sortEnrollmentsByEmployeeType } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

// โครงการที่ใช้แบบฟอร์มนี้ — จับคู่แบบ "มีคำนี้อยู่ใน batch.project" (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
// ครอบคลุมทั้งกรณี batch.project เก็บเป็น "PRJ-2026-J-078 - HUASHI Building B" หรือรหัสสั้น
const HUASHI_PROJECT_MATCH_KEYWORDS = ["J-078", "J078", "J78", "HUASHI"];

export function isHuashiTrainingRequestProject(project: string | undefined | null): boolean {
  const value = String(project || "").toUpperCase();
  if (!value) return false;
  return HUASHI_PROJECT_MATCH_KEYWORDS.some((kw) => value.includes(kw.toUpperCase()));
}

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const FONT_BOLD_URL = asset("/fonts/sarabun-thai-600-normal.woff");
const TEMPLATE_URL = asset("/templates/training/huashi-training-request-form.pdf");

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

// แนวนอน (Landscape) — ขนาดหน้าตรงกับไฟล์ต้นฉบับจริงเป๊ะ (วัดจาก mediaBox ของ PDF ที่ลูกค้าส่งมา)
const PAGE_HEIGHT = 595.2;
const TEXT_COLOR = rgb(0.05, 0.05, 0.15);
const CHECK_COLOR = rgb(0.75, 0, 0);

const fontForCharacter = (fonts: PdfFontSet, character: string): PDFFont =>
  /[\u0E00-\u0E7F]/.test(character) ? fonts.thai : fonts.latin;

const textWidth = (fonts: PdfFontSet, text: string, size: number): number =>
  Array.from(text).reduce((width, character) => width + fontForCharacter(fonts, character).widthOfTextAtSize(character, size), 0);

const drawText = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; y: number; size: number; align?: "left" | "center"; color?: ReturnType<typeof rgb> }
) => {
  let x = options.x;
  if (options.align === "center") {
    x = options.x - textWidth(fonts, text, options.size) / 2;
  }
  let run = "";
  let runFont: PDFFont | undefined;
  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, { x, y: options.y, size: options.size, font: runFont, color: options.color || TEXT_COLOR });
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

const fitText = (fonts: PdfFontSet, text: string, maxWidth: number, size: number): string => {
  if (textWidth(fonts, text, size) <= maxWidth) return text;
  let cut = text.length;
  while (cut > 0 && textWidth(fonts, text.slice(0, cut) + "…", size) > maxWidth) cut -= 1;
  return text.slice(0, cut) + "…";
};

// เครื่องหมายติ๊กเอกสาร — วาดเป็นเส้นตรง 2 เส้นต่อกันเป็นรูปเครื่องหมายถูก (✓) เอง ไม่ใช้ font วาดตัวอักษร
// เพราะฟอนต์มาตรฐาน (Helvetica/WinAnsiEncoding) ที่ pdf-lib ใช้เป็นค่าเริ่มต้นเวลาไม่ระบุ font ให้ drawText
// ไม่มี glyph ของเครื่องหมายถูกจริง ๆ (ตัวที่เคยใช้คือกากบาด "X" ซึ่งลูกค้าขอเปลี่ยน) — วาดด้วยเส้นจึงได้ผลลัพธ์
// แน่นอนเหมือนกันทุกเครื่อง ไม่ขึ้นกับว่าฟอนต์รองรับอักขระนี้หรือไม่ — (cx, cy) คือจุดกึ่งกลางของเครื่องหมาย
const drawCheckMark = (page: PDFPage, cx: number, cy: number) => {
  const thickness = 1.4;
  const left = { x: cx - 3.4, y: cy + 0.4 };
  const bottom = { x: cx - 0.8, y: cy - 2.6 };
  const right = { x: cx + 4.0, y: cy + 3.4 };
  page.drawLine({ start: left, end: bottom, thickness, color: CHECK_COLOR, lineCap: LineCapStyle.Round });
  page.drawLine({ start: bottom, end: right, thickness, color: CHECK_COLOR, lineCap: LineCapStyle.Round });
};

// โหลดไฟล์ฟอร์มต้นฉบับจริงของลูกค้ามาเป็นพื้นหลัง (เก็บสี/เส้นตาราง/โลโก้ไว้ครบ) แล้วฝังฟอนต์ไทยลงในเอกสารนี้โดยตรง
// (ไม่สร้างเอกสารใหม่) เพื่อให้วาดทับ (overlay) ข้อมูลลงบนหน้าเพจจริงได้
const loadPdfWithFonts = async (): Promise<{ pdfDoc: PDFDocument; regular: PdfFontSet; bold: PdfFontSet }> => {
  const [templateBytes, regularBytes, boldBytes, latinRegularBytes, latinBoldBytes] = await Promise.all([
    loadFontBytes(TEMPLATE_URL),
    loadFontBytes(FONT_REGULAR_URL),
    loadFontBytes(FONT_BOLD_URL),
    loadFontBytes(sarabunLatinRegularUrl),
    loadFontBytes(sarabunLatinBoldUrl),
  ]);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit as any);
  const regular = {
    thai: await pdfDoc.embedFont(regularBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinRegularBytes, { subset: true }),
  };
  const bold = {
    thai: await pdfDoc.embedFont(boldBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinBoldBytes, { subset: true }),
  };
  // หน้า 2 ของต้นฉบับมีแค่ 4 แถวว่างและไม่มีโลโก้ (ไม่สม่ำเสมอกับหน้า 1) — ตัดทิ้ง จะ copy หน้า 1 ซ้ำเองแทนถ้าคนเกิน 20
  while (pdfDoc.getPageCount() > 1) pdfDoc.removePage(1);
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

// ---------------------------------------------------------------------------
// คำนวณสถานะ "เอกสารยืนยันตัวตน" ของแรงงานต่างด้าว จากข้อมูล migrant_documents ที่มีอยู่แล้ว
// ในระบบ (ดู src/components/migrantWorkerConfig.ts) — คนไทยไม่ต้องกรอกช่องนี้ (null)
// ติ๊กได้มากกว่า 1 ช่องต่อแถว ตามตัวอย่างฟอร์มจริง: "Passport+Visa" เป็นแกนเอกสารยืนยันตัวตน
// แยกอิสระจากแกนสถานะใบอนุญาตทำงาน (Pink card / Permit Verification Pending / No Work Permit)
// คนที่ไม่มีข้อมูล migrant_documents เลย (ยังไม่กรอก) จะไม่ติ๊กช่องไหนเลย ไม่ใช่ติ๊ก "No Work Permit" ทันที
// ---------------------------------------------------------------------------
interface IdVerificationFlags {
  passportVisa: boolean;
  pinkCard: boolean;
  pending: boolean;
  noPermit: boolean;
}

const resolveIdVerificationFlags = (emp: EmployeeRow | undefined): IdVerificationFlags | null => {
  const docs = (emp as unknown as { migrant_documents?: Record<string, { docNumber?: string } | undefined> } | undefined)
    ?.migrant_documents;
  if (!docs) return null;
  const has = (key: string): boolean => !!docs[key]?.docNumber;
  const hasAnyWorkAuthDoc = has("permit_card") || has("work_permit");
  return {
    passportVisa: has("passport") && has("visa"),
    pinkCard: has("permit_card"),
    pending: has("work_permit") && !has("permit_card"),
    noPermit: !hasAnyWorkAuthDoc,
  };
};

// ---------------------------------------------------------------------------
// ตาราง — ขอบซ้ายของเส้นตั้งแต่ละเส้น วัดจากไฟล์ "rev.0 edit 1" (เส้นหนา 0.72pt)
// ขอบขวาสุดคือปลายเส้นแนวตั้งเส้นสุดท้าย
// Name กับ Last name ยังไม่มีเส้นกั้น — แบ่งที่กึ่งกลางระหว่างหัวคอลัมน์ทั้งสอง
// (หัว "Name" อยู่ราว x=191, หัว "Last name" อยู่ราว x=293)
// ---------------------------------------------------------------------------
const TABLE_RIGHT = 823.92;
const COL_BOUNDS = [17.04, 44.64, 139.22, 343.3, 404.28, 488.3, 542.54, 594.65, 646.73, 698.83, 750.94, 823.92];
const NAME_LAST_SPLIT_X = 241.95;
const COLS = [
  { key: "no", label: "No", x: COL_BOUNDS[0], width: COL_BOUNDS[1] - COL_BOUNDS[0] },
  { key: "idCard", label: "ID Card", x: COL_BOUNDS[1], width: COL_BOUNDS[2] - COL_BOUNDS[1] },
  { key: "nameLast", label: "Name / Last name", x: COL_BOUNDS[2], width: COL_BOUNDS[3] - COL_BOUNDS[2] },
  { key: "company", label: "Company", x: COL_BOUNDS[3], width: COL_BOUNDS[4] - COL_BOUNDS[3] },
  { key: "position", label: "Position", x: COL_BOUNDS[4], width: COL_BOUNDS[5] - COL_BOUNDS[4] },
  { key: "ethnicity", label: "Ethnicity", x: COL_BOUNDS[5], width: COL_BOUNDS[6] - COL_BOUNDS[5] },
  { key: "passportVisa", label: "Passport+Visa", x: COL_BOUNDS[6], width: COL_BOUNDS[7] - COL_BOUNDS[6] },
  { key: "pinkCard", label: "Pink card", x: COL_BOUNDS[7], width: COL_BOUNDS[8] - COL_BOUNDS[7] },
  { key: "pending", label: "Permit Verification Pending", x: COL_BOUNDS[8], width: COL_BOUNDS[9] - COL_BOUNDS[8] },
  { key: "noPermit", label: "No Work Permit", x: COL_BOUNDS[9], width: COL_BOUNDS[10] - COL_BOUNDS[9] },
  { key: "signature", label: "Signature", x: COL_BOUNDS[10], width: COL_BOUNDS[11] - COL_BOUNDS[10] },
] as const;

// เส้นนอนของตารางข้อมูล: เส้นบนแถวแรกอยู่ที่ y=388.97 เส้นล่างสุดอยู่ที่ y=20.90 รวม 21 แถว
const ROWS_PER_PAGE = 21;
const ROW_HEIGHT = (388.97 - 20.9) / ROWS_PER_PAGE;
const ROW_STROKE = 0.72;
const CELL_FONT_SIZE = 8;
const POSITION_FONT_SIZE = 6.5;
const POSITION_LINE_GAP = 7.2;

interface RowValues {
  no: string;
  idCard: string;
  name: string;
  lastName: string;
  company: string;
  position: string;
  ethnicity: string;
  idVerification: IdVerificationFlags | null;
}

// ขอบบนของช่องข้อมูล (ด้านล่างของเส้นบน) และกึ่งกลางช่อง — ใช้จัดตัวอักษรให้อยู่กลางแถว
const rowCenterY = (topY: number): number => topY - (ROW_HEIGHT - ROW_STROKE) / 2;

const baselineForSize = (centerY: number, size: number): number => centerY - size * 0.32;

// แบ่งข้อความเป็น 2 บรรทัดให้แต่ละบรรทัดกว้างไม่เกินช่อง เลือกจุดตัดที่สมดุลที่สุด
// (เว้นวรรค, /, -) ถ้าไม่มีจุดตัดที่พอดีจะตัดตามความกว้างแล้วใส่ "…" ที่บรรทัดที่ยังล้น
const splitIntoTwoLines = (fonts: PdfFontSet, text: string, maxWidth: number, size: number): [string, string] | null => {
  if (textWidth(fonts, text, size) <= maxWidth) return null;
  const breaks: number[] = [];
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (ch === " " || ch === "/" || ch === "-" || prev === "/" || prev === "-") breaks.push(i);
  }
  let best: [string, string] | null = null;
  let bestScore = Infinity;
  breaks.forEach((index) => {
    const left = text.slice(0, index).trim();
    const right = text.slice(index).trim();
    if (!left || !right) return;
    const leftWidth = textWidth(fonts, left, size);
    const rightWidth = textWidth(fonts, right, size);
    if (leftWidth <= maxWidth && rightWidth <= maxWidth) {
      const score = Math.abs(leftWidth - rightWidth);
      if (score < bestScore) {
        bestScore = score;
        best = [left, right];
      }
    }
  });
  if (best) return best;
  let cut = text.length - 1;
  while (cut > 1 && textWidth(fonts, text.slice(0, cut).trim(), size) > maxWidth) cut -= 1;
  const left = text.slice(0, cut).trim();
  const right = text.slice(cut).trim();
  if (!left || !right) return [fitText(fonts, text, maxWidth, size), ""];
  return [left, textWidth(fonts, right, size) <= maxWidth ? right : fitText(fonts, right, maxWidth, size)];
};

const drawCenteredCell = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  box: { x: number; width: number },
  baseline: number,
  size: number
) => {
  if (!text) return;
  const maxW = Math.max(4, box.width - 4);
  const display = textWidth(fonts, text, size) <= maxW ? text : fitText(fonts, text, maxW, size);
  drawText(page, fonts, display, { x: box.x + box.width / 2, y: baseline, size, align: "center" });
};

const drawPositionCell = (page: PDFPage, fonts: PdfFontSet, text: string, box: { x: number; width: number }, topY: number) => {
  if (!text) return;
  const maxW = Math.max(4, box.width - 4);
  const center = rowCenterY(topY);
  if (textWidth(fonts, text, CELL_FONT_SIZE) <= maxW) {
    drawCenteredCell(page, fonts, text, box, baselineForSize(center, CELL_FONT_SIZE), CELL_FONT_SIZE);
    return;
  }
  const lines = splitIntoTwoLines(fonts, text, maxW, POSITION_FONT_SIZE);
  if (!lines) {
    drawCenteredCell(page, fonts, text, box, baselineForSize(center, POSITION_FONT_SIZE), POSITION_FONT_SIZE);
    return;
  }
  const mid = baselineForSize(center, POSITION_FONT_SIZE);
  drawCenteredCell(page, fonts, lines[0], box, mid + POSITION_LINE_GAP / 2, POSITION_FONT_SIZE);
  if (lines[1]) drawCenteredCell(page, fonts, lines[1], box, mid - POSITION_LINE_GAP / 2, POSITION_FONT_SIZE);
};

// เขียนทับข้อมูล 1 แถวลงบนตารางที่มีอยู่แล้วในไฟล์ต้นฉบับ (ไม่ต้องวาดเส้น/กรอบเองเพราะพื้นหลังมีอยู่แล้ว)
const drawTableRow = (page: PDFPage, regular: PdfFontSet, topY: number, values: RowValues): number => {
  const baseline = baselineForSize(rowCenterY(topY), CELL_FONT_SIZE);
  const checkCenterY = rowCenterY(topY);

  COLS.forEach((col) => {
    switch (col.key) {
      case "no":
      case "idCard":
      case "ethnicity":
        drawCenteredCell(page, regular, values[col.key], col, baseline, CELL_FONT_SIZE);
        break;
      case "nameLast": {
        const nameBox = { x: col.x, width: NAME_LAST_SPLIT_X - col.x };
        const lastBox = { x: NAME_LAST_SPLIT_X, width: col.x + col.width - NAME_LAST_SPLIT_X };
        drawCenteredCell(page, regular, values.name, nameBox, baseline, CELL_FONT_SIZE);
        drawCenteredCell(page, regular, values.lastName, lastBox, baseline, CELL_FONT_SIZE);
        break;
      }
      case "company": {
        // คอลัมน์ Company แคบ (~60pt) ชื่อเต็ม "CMG Engineering & Construction" ไม่พอดีช่อง
        // ย่อเหลือ "CMG" เฉพาะตอนวาดลงใบนี้ ไม่แก้ค่าต้นทางเพื่อไม่กระทบใบอื่น
        const companyDisplay = values.company.trim().toUpperCase().startsWith("CMG") ? "CMG" : values.company;
        drawCenteredCell(page, regular, companyDisplay, col, baseline, CELL_FONT_SIZE);
        break;
      }
      case "position":
        drawPositionCell(page, regular, values.position, col, topY);
        break;
      case "passportVisa":
        if (values.idVerification?.passportVisa) drawCheckMark(page, col.x + col.width / 2, checkCenterY);
        break;
      case "pinkCard":
        if (values.idVerification?.pinkCard) drawCheckMark(page, col.x + col.width / 2, checkCenterY);
        break;
      case "pending":
        if (values.idVerification?.pending) drawCheckMark(page, col.x + col.width / 2, checkCenterY);
        break;
      case "noPermit":
        if (values.idVerification?.noPermit) drawCheckMark(page, col.x + col.width / 2, checkCenterY);
        break;
      // signature: เว้นว่างไว้ให้เซ็นชื่อหน้างาน
    }
  });
  return topY - ROW_HEIGHT;
};

// เส้นใต้ช่องหัวฟอร์ม (วัดจากไฟล์ rev.0 edit 1) — ตัวอักษรจัดกึ่งกลางเส้นใต้แต่ละช่อง
// baseline ใช้ระดับเดียวกับป้ายที่พิมพ์ไว้แล้วบนฟอร์ม เพื่อให้ค่าที่กรอกอยู่แถวเดียวกับป้าย
const HEADER_BASELINE = { course: 492.94, dateRow: 474.91, trainerRow: 456.91 };
const HEADER_BOX = {
  course: { x: 139.46, width: 684.22 },
  date: { x: 139.58, width: 343.66 - 139.58 },
  time: { x: 404.64, width: 488.66 - 404.64 },
  location: { x: 595.01, width: 699.19 - 595.01 },
  total: { x: 751.3, width: 823.56 - 751.3 },
  trainer: { x: 139.46, width: 349.32 },
};

const drawHeaderValue = (page: PDFPage, fonts: PdfFontSet, text: string, box: { x: number; width: number }, y: number) => {
  if (!text) return;
  const maxW = Math.max(8, box.width - 6);
  let size = 9;
  while (size > 7 && textWidth(fonts, text, size) > maxW) size -= 0.25;
  drawCenteredCell(page, fonts, text, box, y, size);
};

const drawHeaderFields = (page: PDFPage, regular: PdfFontSet, _bold: PdfFontSet, batch: TrainingBatch, total: number): void => {
  drawHeaderValue(page, regular, batch.courseName || "", HEADER_BOX.course, HEADER_BASELINE.course);
  drawHeaderValue(page, regular, batch.date || "", HEADER_BOX.date, HEADER_BASELINE.dateRow);
  drawHeaderValue(page, regular, batch.timeSlot || "", HEADER_BOX.time, HEADER_BASELINE.dateRow);
  drawHeaderValue(page, regular, batch.location || "", HEADER_BOX.location, HEADER_BASELINE.dateRow);
  drawHeaderValue(page, regular, String(total), HEADER_BOX.total, HEADER_BASELINE.dateRow);
  drawHeaderValue(page, regular, batch.trainer || "", HEADER_BOX.trainer, HEADER_BASELINE.trainerRow);
};

// ขอบบนของช่องแถวข้อมูลคนแรก (ด้านล่างของเส้นหัวตาราง) — คงที่ทุกหน้า
const TABLE_TOP_Y = 388.97;

export const generateHuashiTrainingRequestFormPdf = async (
  batch: TrainingBatch,
  enrollmentsInput: TrainingEnrollment[],
  employees: EmployeeRow[]
): Promise<Uint8Array> => {
  const { pdfDoc, regular, bold } = await loadPdfWithFonts();
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const enrollments = sortEnrollmentsByEmployeeType(enrollmentsInput, employees);
  const pages = Math.max(1, Math.ceil(enrollments.length / ROWS_PER_PAGE));

  // pdfDoc ตอนนี้มีแค่หน้า 1 ของต้นฉบับ (มีโลโก้+ตารางเปล่าพร้อมอยู่แล้ว) — ถ้าคนเกิน 21 คน
  // ให้ copy หน้าเดิมซ้ำเพิ่ม เพื่อให้ทุกหน้ามีโลโก้/สี/เส้นตารางเหมือนต้นฉบับครบทุกหน้า
  for (let p = 1; p < pages; p += 1) {
    const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [0]);
    pdfDoc.addPage(copiedPage);
  }

  for (let p = 0; p < pages; p += 1) {
    const page = pdfDoc.getPage(p);
    if (pages > 1) {
      drawText(page, regular, `หน้า ${p + 1}/${pages}`, { x: TABLE_RIGHT - 40, y: PAGE_HEIGHT - 16, size: 8 });
    }
    drawHeaderFields(page, regular, bold, batch, enrollments.length);
    let y = TABLE_TOP_Y;

    const pageEnrollments = enrollments.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    for (let i = 0; i < ROWS_PER_PAGE; i += 1) {
      const en = pageEnrollments[i];
      if (!en) {
        y = drawTableRow(page, regular, y, { no: "", idCard: "", name: "", lastName: "", company: "", position: "", ethnicity: "", idVerification: null });
        continue;
      }
      const emp = employeeById.get(en.employeeId);
      const firstName = en.employeeFirstName || "";
      const idx = firstName ? en.employeeName.indexOf(firstName) : -1;
      const namePart = idx >= 0 ? en.employeeName.slice(0, idx + firstName.length).trim() : en.employeeName;
      const lastNamePart = idx >= 0 ? en.employeeName.slice(idx + firstName.length).trim() : "";
      const migrant = isMigrantNationality(en.nationality);
      y = drawTableRow(page, regular, y, {
        no: String(p * ROWS_PER_PAGE + i + 1),
        idCard: en.idCardNumber || "",
        name: namePart,
        lastName: lastNamePart,
        company: en.company || "",
        position: en.position || "",
        ethnicity: en.nationality || "",
        idVerification: migrant ? resolveIdVerificationFlags(emp) : null,
      });
    }
  }

  return pdfDoc.save();
};

export const generateAndDownloadHuashiTrainingRequestFormPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[]
): Promise<void> => {
  const bytes = await generateHuashiTrainingRequestFormPdf(batch, enrollments, employees);
  downloadBlob(bytes, `Training_Request_Form_HUASHI_${batch.date || ""}.pdf`);
};

export const generateAndPreviewHuashiTrainingRequestFormPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[]
): Promise<void> => {
  const bytes = await generateHuashiTrainingRequestFormPdf(batch, enrollments, employees);
  openPdfInNewTab(bytes);
};
