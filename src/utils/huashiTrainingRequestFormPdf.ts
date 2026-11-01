// Auto-fill PDF ของ "ใบปะหน้า" เฉพาะโครงการ HUASHI Building B (J-078) — ใช้วิธี "overlay" เขียนทับ
// บนไฟล์ฟอร์มต้นฉบับจริงของลูกค้า "Training Request Form rev.0.pdf" ทุกอย่าง (สี/เส้นตาราง/โลโก้
// HUASHI/ป้ายข้อความ) คงเดิมเป๊ะเพราะใช้หน้าเพจจริงจากไฟล์ต้นฉบับเป็นพื้นหลัง ไม่ได้วาดขึ้นใหม่
// (พิกัดคอลัมน์/แถวด้านล่างยังใช้วัดตำแหน่งที่จะเขียนทับข้อมูลให้ตรงช่องเป๊ะ — วัดจากไฟล์จริงด้วย pdfjs-dist)
// หน้าเพจเดิมมี 2 หน้า (หน้า 2 มีแค่ 4 แถวว่างและไม่มีโลโก้) — ใช้แค่หน้า 1 (20 แถว มีโลโก้ครบ) เป็นแม่แบบ
// แล้ว copy ซ้ำเองถ้าคนในรอบเกิน 20 คน เพื่อให้ทุกหน้าหน้าตาเหมือนกันและมีโลโก้ครบทุกหน้า
// ต่างจากใบปะหน้าแบบทั่วไปตรงที่มีคอลัมน์ "Identity verification document" แยกย่อย 4 ช่อง
// (Passport+Visa / Pink card / Permit Verification Pending / No Work Permit) สำหรับแรงงานต่างด้าว
// ซึ่งคำนวณอัตโนมัติจากข้อมูลเอกสารแรงงานต่างด้าวที่มีอยู่แล้วในระบบ (migrant_documents)
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import sarabunLatinRegularUrl from "@fontsource/sarabun/files/sarabun-latin-400-normal.woff";
import sarabunLatinBoldUrl from "@fontsource/sarabun/files/sarabun-latin-600-normal.woff";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";
import { isMigrantNationality } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

// โครงการที่ใช้แบบฟอร์มนี้ — จับคู่แบบ "มีคำนี้อยู่ใน batch.project" (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
// ครอบคลุมทั้งกรณี batch.project เก็บเป็น "PRJ-2026-J-078 - HUASHI Building B" หรือรหัสสั้น
const HUASHI_PROJECT_MATCH_KEYWORDS = ["J-078", "J078", "HUASHI"];

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
const PAGE_WIDTH = 841.68;
const PAGE_HEIGHT = 595.2;
// พิกัดซ้าย/ขวาของป้ายข้อมูลหัวฟอร์ม (Course/Date/Trainer ฯลฯ) — วัดจากไฟล์ต้นฉบับ
const FIELD_LEFT = 47.52;
const FIELD_RIGHT = 818.6;
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

const fitSizeForText = (fonts: PdfFontSet, text: string, maxWidth: number, maxSize: number, minSize = 6): number => {
  let size = maxSize;
  while (size > minSize && textWidth(fonts, text, size) > maxWidth) size -= 0.5;
  return size;
};

const drawFittedCellText = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; width: number; y: number; maxSize: number; align?: "left" | "center" }
) => {
  if (!text) return;
  const maxW = options.width - 6;
  const size = fitSizeForText(fonts, text, maxW, options.maxSize);
  const display = textWidth(fonts, text, size) <= maxW ? text : fitText(fonts, text, maxW, size);
  drawText(page, fonts, display, {
    x: options.align === "center" ? options.x + options.width / 2 : options.x + 3,
    y: options.y,
    size,
    align: options.align,
  });
};

const drawCheckMark = (page: PDFPage, x: number, y: number) => {
  page.drawText("X", { x, y, size: 10, color: CHECK_COLOR });
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
// ---------------------------------------------------------------------------
type IdVerificationCategory = "passport_visa" | "pink_card" | "pending" | "no_permit";

const resolveIdVerificationCategory = (emp: EmployeeRow | undefined): IdVerificationCategory | null => {
  const docs = (emp as unknown as { migrant_documents?: Record<string, { docNumber?: string } | undefined> } | undefined)
    ?.migrant_documents;
  const has = (key: string): boolean => !!docs?.[key]?.docNumber;
  if (has("passport") && has("visa")) return "passport_visa";
  if (has("permit_card")) return "pink_card";
  if (has("work_permit")) return "pending";
  return "no_permit";
};

// ---------------------------------------------------------------------------
// ตาราง — ขอบเขต/ความกว้างคอลัมน์วัดมาจากเส้นตารางจริงในไฟล์ PDF ต้นฉบับ (pdfjs operator list)
// หมายเหตุ: คอลัมน์ "Name" กับ "Last name" ในต้นฉบับไม่มีเส้นแบ่งกั้นระหว่างกันจริง ๆ (ใช้ซี
// ลล์กว้างเดียวแบ่งด้วยตำแหน่งป้ายชื่อหัวตารางเท่านั้น) — ในการวาดจึงแบ่งพื้นที่ครึ่งหนึ่งเอง
// ---------------------------------------------------------------------------
const TABLE_LEFT = 17.8;
const TABLE_RIGHT = 818.6;
const TABLE_WIDTH = TABLE_RIGHT - TABLE_LEFT;
// เส้นแบ่งคอลัมน์จริงจากไฟล์ต้นฉบับ (11 เส้น รวมขอบซ้าย/ขวา = 10 คอลัมน์ที่มีเส้นกั้น)
const COL_BOUNDS = [17.8, 45.6, 147.9, 294.1, 409.3, 479.2, 530.5, 583.9, 637.1, 690.4, 743.7, 818.6];
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

// ความสูงแถว วัดจากเส้นตารางจริง: ตัวตารางข้อมูล 20 แถว x 18pt ต่อหน้า
const ROWS_PER_PAGE = 20;
const ROW_HEIGHT = 18;

interface RowValues {
  no: string;
  idCard: string;
  name: string;
  lastName: string;
  company: string;
  position: string;
  ethnicity: string;
  idVerification: IdVerificationCategory | null;
}

// เขียนทับข้อมูล 1 แถวลงบนตารางที่มีอยู่แล้วในไฟล์ต้นฉบับ (ไม่ต้องวาดเส้น/กรอบเองเพราะพื้นหลังมีอยู่แล้ว)
const drawTableRow = (page: PDFPage, regular: PdfFontSet, topY: number, values: RowValues): number => {
  const cellTextY = topY - ROW_HEIGHT + 6;
  const checkCenterY = topY - ROW_HEIGHT / 2 - 3.5;

  COLS.forEach((col) => {
    switch (col.key) {
      case "no":
        drawFittedCellText(page, regular, values.no, { x: col.x, width: col.width, y: cellTextY, maxSize: 8, align: "center" });
        break;
      case "idCard":
        drawFittedCellText(page, regular, values.idCard, { x: col.x, width: col.width, y: cellTextY, maxSize: 8, align: "center" });
        break;
      case "nameLast": {
        // ไม่มีเส้นกั้นในต้นฉบับ — แบ่งพื้นที่ครึ่งซ้าย/ขวาเองสำหรับ Name / Last name
        const halfW = col.width / 2;
        drawFittedCellText(page, regular, values.name, { x: col.x, width: halfW, y: cellTextY, maxSize: 8 });
        drawFittedCellText(page, regular, values.lastName, { x: col.x + halfW, width: halfW, y: cellTextY, maxSize: 8 });
        break;
      }
      case "company":
        drawFittedCellText(page, regular, values.company, { x: col.x, width: col.width, y: cellTextY, maxSize: 8 });
        break;
      case "position":
        drawFittedCellText(page, regular, values.position, { x: col.x, width: col.width, y: cellTextY, maxSize: 8 });
        break;
      case "ethnicity":
        drawFittedCellText(page, regular, values.ethnicity, { x: col.x, width: col.width, y: cellTextY, maxSize: 8, align: "center" });
        break;
      case "passportVisa":
        if (values.idVerification === "passport_visa") drawCheckMark(page, col.x + col.width / 2 - 3, checkCenterY);
        break;
      case "pinkCard":
        if (values.idVerification === "pink_card") drawCheckMark(page, col.x + col.width / 2 - 3, checkCenterY);
        break;
      case "pending":
        if (values.idVerification === "pending") drawCheckMark(page, col.x + col.width / 2 - 3, checkCenterY);
        break;
      case "noPermit":
        if (values.idVerification === "no_permit") drawCheckMark(page, col.x + col.width / 2 - 3, checkCenterY);
        break;
      // signature: เว้นว่างไว้ให้เซ็นชื่อหน้างาน
    }
  });
  return topY - ROW_HEIGHT;
};

// ตำแหน่ง y ของแต่ละแถวฟิลด์ข้อมูล (Course / Date-Time-Location-Total / Trainer-Phone) วัดจากไฟล์ต้นฉบับจริง
const FIELD_ROW_Y = { course: 489.58, dateRow: 470.83, trainerRow: 452.11 };
// จุดเริ่ม x ของแต่ละฟิลด์ในแถว (วัดจากตำแหน่งป้ายจริงในไฟล์ต้นฉบับ)
const DATE_ROW_X = [FIELD_LEFT, 295.99, 532.46, 692.35, TABLE_RIGHT];
const TRAINER_ROW_X = [FIELD_LEFT, 539.42, TABLE_RIGHT];

// ตำแหน่ง x ที่ตัว ":" ของแต่ละป้ายจบในไฟล์ต้นฉบับจริง (วัดจาก pdfjs text content) — ค่าที่กรอกจะเริ่มวาง
// ถัดจากจุดนี้ไปเล็กน้อย ป้ายชื่อเอง "ไม่ต้องวาดซ้ำ" เพราะมีอยู่แล้วในไฟล์ต้นฉบับ (พื้นหลัง overlay)
const VALUE_START_X = { course: 122, date: 118, time: 344, location: 640, total: 750, trainer: 119 };

const drawHeaderFields = (page: PDFPage, regular: PdfFontSet, _bold: PdfFontSet, batch: TrainingBatch, total: number): void => {
  const value = (text: string, x: number, maxWidth: number, y: number) => {
    if (!text) return;
    drawFittedCellText(page, regular, text, { x: x - 3, width: maxWidth + 3, y, maxSize: 9.5 });
  };

  value(batch.courseName || "", VALUE_START_X.course, FIELD_RIGHT - VALUE_START_X.course, FIELD_ROW_Y.course);

  value(batch.date || "", VALUE_START_X.date, DATE_ROW_X[1] - VALUE_START_X.date - 6, FIELD_ROW_Y.dateRow);
  value(batch.timeSlot || "", VALUE_START_X.time, DATE_ROW_X[2] - VALUE_START_X.time - 6, FIELD_ROW_Y.dateRow);
  value(batch.location || "", VALUE_START_X.location, DATE_ROW_X[3] - VALUE_START_X.location - 6, FIELD_ROW_Y.dateRow);
  value(String(total), VALUE_START_X.total, DATE_ROW_X[4] - VALUE_START_X.total - 6, FIELD_ROW_Y.dateRow);

  value(batch.trainer || "", VALUE_START_X.trainer, TRAINER_ROW_X[1] - VALUE_START_X.trainer - 10, FIELD_ROW_Y.trainerRow);
};

// y ขอบบนของ "แถวข้อมูลคนแรก" ในตาราง (ใต้หัวตาราง 2 แถวแล้ว) วัดจากไฟล์ต้นฉบับจริง — คงที่ทุกหน้า
const TABLE_TOP_Y = 382.5;

export const generateHuashiTrainingRequestFormPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[]
): Promise<Uint8Array> => {
  const { pdfDoc, regular, bold } = await loadPdfWithFonts();
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const pages = Math.max(1, Math.ceil(enrollments.length / ROWS_PER_PAGE));

  // pdfDoc ตอนนี้มีแค่หน้า 1 ของต้นฉบับ (มีโลโก้+ตารางเปล่าพร้อมอยู่แล้ว) — ถ้าคนเกิน 20 คน
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
        idVerification: migrant ? resolveIdVerificationCategory(emp) : null,
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
