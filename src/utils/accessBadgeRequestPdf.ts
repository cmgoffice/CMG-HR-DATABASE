// Auto-fill PDF ของ "ใบรายคน" (แบบฟอร์มคำร้องขอมีบัตรผ่านบุคคล / Access Badge Request)
// ใช้วิธี "overlay" เขียนทับบนไฟล์ฟอร์มต้นฉบับจริง (เก็บข้อความกฎระเบียบ/ยินยอม 4 ภาษาไว้ครบ ไม่ต้อง redraw)
// รวมทุกคนในรอบเป็น PDF ไฟล์เดียว คนละ 1 หน้า เรียงลำดับเดียวกับรายชื่อบนใบปะหน้า
// (รายเดือน -> DC -> SP -> SC แล้วตามเลขรหัส) เว้นช่องลายเซ็น/วันที่ไว้ให้เซ็นสดหลังพิมพ์
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import { sarabunLatinRegularUrl } from "./thaiFonts";
import type { TrainingBatch, TrainingEnrollment, HealthCheckRecord } from "../components/trainingBatchConfig";
import { CONGENITAL_DISEASE_OPTIONS, sortEnrollmentsByEmployeeType } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const TEMPLATE_URL = asset("/templates/training/access-badge-request.pdf");

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

const byteCache = new Map<string, Uint8Array>();
const loadBytesCached = async (url: string): Promise<Uint8Array> => {
  if (!byteCache.has(url)) byteCache.set(url, await fetchBytes(url));
  return byteCache.get(url)!;
};

interface PdfFontSet {
  thai: PDFFont;
  latin: PDFFont;
}

const TEXT_COLOR = rgb(0.05, 0.05, 0.15);

const fontForCharacter = (fonts: PdfFontSet, character: string): PDFFont =>
  /[\u0E00-\u0E7F]/.test(character) ? fonts.thai : fonts.latin;

const textWidth = (fonts: PdfFontSet, text: string, size: number): number =>
  Array.from(text).reduce((width, character) => width + fontForCharacter(fonts, character).widthOfTextAtSize(character, size), 0);

const drawText = (page: PDFPage, fonts: PdfFontSet, text: string, options: { x: number; y: number; size: number }) => {
  let x = options.x;
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

/** ลดขนาดฟอนต์ลงอัตโนมัติจนข้อความพอดีกับความกว้างที่กำหนด (ไม่ตัดคำ) แล้ววาด */
const drawFitted = (page: PDFPage, fonts: PdfFontSet, text: string, options: { x: number; y: number; maxWidth: number; maxSize: number; minSize?: number }) => {
  if (!text) return;
  const minSize = options.minSize ?? 6;
  let size = options.maxSize;
  while (size > minSize && textWidth(fonts, text, size) > options.maxWidth) size -= 0.5;
  drawText(page, fonts, text, { x: options.x, y: options.y, size });
};

const drawCheckMark = (page: PDFPage, options: { x: number; y: number }) => {
  page.drawText("X", { x: options.x + 1, y: options.y + 1, size: 7, color: rgb(0.75, 0, 0) });
};

/** พิกัดฟิลด์บนฟอร์ม (อ้างอิงจากพิกัดจริงที่ดึงด้วย pdfjs-dist จากไฟล์ต้นฉบับ A4 595.32x841.92) */
const FIELD = {
  name: { x: 333, y: 725.3 },
  position: { x: 333, y: 706.0 },
  company: { x: 333, y: 686.7 },
  maleBox: { x: 390.91, y: 663.82 },
  femaleBox: { x: 469.18, y: 663.82 },
  blood: { x: 513, y: 665.3 },
  dobDay: { x: 330, y: 639.0, maxWidth: 32 },
  dobMonth: { x: 369, y: 639.0, maxWidth: 35 },
  dobYear: { x: 411, y: 639.0, maxWidth: 33 },
  religion: { x: 510, y: 622.4 },
  nationality: { x: 333, y: 598.1 },
  homeAddress: { x: 333, y: 578.8 },
  homeAddressLine2: { x: 330, y: 559.5 },
  presentAddress: { x: 333, y: 540.3 },
  idCardNo: { x: 333, y: 501.6 },
  telephone: { x: 341, y: 472.6 },
  healthStatus: { x: 333, y: 453.3 },
  diseaseHighBP: { x: 322.27, y: 401.35 },
  diseaseDiabetes: { x: 322.27, y: 372.77 },
  diseaseHeart: { x: 322.27, y: 356.09 },
  diseaseNothing: { x: 322.27, y: 339.41 },
  diseaseOther: { x: 417.79, y: 339.41 },
  note: { x: 192, y: 317.8, maxWidth: 365 },
};
const VALUE_MAX_WIDTH = 228; // ความกว้างที่เหลือจากจุดเริ่ม value ถึงขอบขวาของฟอร์ม (~x=564)

const loadPdfWithFonts = async (): Promise<{ outDoc: PDFDocument; templateDoc: PDFDocument; fonts: PdfFontSet }> => {
  const [regularBytes, latinRegularBytes, templateBytes] = await Promise.all([
    loadBytesCached(FONT_REGULAR_URL),
    loadBytesCached(sarabunLatinRegularUrl),
    loadBytesCached(TEMPLATE_URL),
  ]);
  const outDoc = await PDFDocument.create();
  outDoc.registerFontkit(fontkit as any);
  const fonts = {
    thai: await outDoc.embedFont(regularBytes, { subset: true }),
    latin: await outDoc.embedFont(latinRegularBytes, { subset: true }),
  };
  const templateDoc = await PDFDocument.load(templateBytes);
  return { outDoc, templateDoc, fonts };
};

const buildAddress = (emp: EmployeeRow | undefined): string => {
  if (!emp) return "";
  const parts = [
    emp.ที่อยู่บรรทัด_1,
    emp.ที่อยู่บรรทัด_2,
    emp.ที่อยู่บรรทัด_3,
    emp.แขวงตำบล ? `ต.${emp.แขวงตำบล}` : "",
    emp.เขตอำเภอ ? `อ.${emp.เขตอำเภอ}` : "",
    emp.จังหวัด ? `จ.${emp.จังหวัด}` : "",
    emp.ไปรษณีย์,
    emp.ประเทศ && emp.ประเทศ !== "ไทย" ? emp.ประเทศ : "",
  ];
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(" ");
};

const parseThaiDob = (iso?: string): { day: string; month: string; year: string } => {
  if (!iso) return { day: "", month: "", year: "" };
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "", month: "", year: "" };
  return { day: String(date.getDate()), month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
};

/** แปลงรายการโรคประจำตัวที่เลือกไว้ (ตาม CONGENITAL_DISEASE_OPTIONS) ให้ตรงกับ checkbox 4 ช่องของฟอร์มจริง
 * (High Blood Pressure / Diabetes / Heart disease / Nothing) ส่วนโรคอื่นที่ไม่มีช่องตรง ๆ จะรวมไปติ๊ก "Other" + ใส่ชื่อโรคในช่อง Note */
const mapDiseasesToFormCheckboxes = (
  diseases: string[],
  otherDetail: string
): { highBP: boolean; diabetes: boolean; heart: boolean; nothing: boolean; other: boolean; noteText: string } => {
  const has = (d: string) => diseases.includes(d);
  const highBP = has("โรคความดันโลหิตสูง");
  const diabetes = has("โรคเบาหวาน");
  const heart = has("โรคหัวใจ");
  const extras = diseases.filter(
    (d) => !["โรคความดันโลหิตสูง", "โรคเบาหวาน", "โรคหัวใจ"].includes(d)
  );
  const other = extras.length > 0;
  const nothing = diseases.length === 0;
  const extraLabels = extras.filter((d) => d !== "อื่นๆ");
  const noteParts = [...extraLabels];
  if (extras.includes("อื่นๆ") && otherDetail) noteParts.push(otherDetail);
  return { highBP, diabetes, heart, nothing, other, noteText: noteParts.join(", ") };
};

const drawPersonPage = (
  page: PDFPage,
  fonts: PdfFontSet,
  batch: TrainingBatch,
  en: TrainingEnrollment,
  emp: EmployeeRow | undefined,
  healthRecord: HealthCheckRecord | undefined
) => {
  // ชื่อ-ตำแหน่ง-บริษัท (Company เป็น CMG เสมอ ตามนโยบายเดียวกับใบปะหน้า เพราะทุกคนมาทำงานผ่าน CMG)
  drawFitted(page, fonts, en.employeeName || "", { ...FIELD.name, maxWidth: VALUE_MAX_WIDTH, maxSize: 10 });
  drawFitted(page, fonts, en.position || "", { ...FIELD.position, maxWidth: VALUE_MAX_WIDTH, maxSize: 10 });
  drawFitted(page, fonts, "CMG Engineering & Construction", { ...FIELD.company, maxWidth: VALUE_MAX_WIDTH, maxSize: 9 });

  // เพศ (checkbox) + กรุ๊ปเลือด
  const genderText = (en.gender || "").trim();
  if (genderText === "ชาย" || /^male$/i.test(genderText)) drawCheckMark(page, FIELD.maleBox);
  else if (genderText === "หญิง" || /^female$/i.test(genderText)) drawCheckMark(page, FIELD.femaleBox);
  drawFitted(page, fonts, emp?.กรุ๊ปเลือด || "", { ...FIELD.blood, maxWidth: 48, maxSize: 9 });

  // วันเดือนปีเกิด (ค.ศ.) + ศาสนา
  const dob = parseThaiDob(emp?.วันเกิดปีเดือนวัน_คศ);
  drawFitted(page, fonts, dob.day, { ...FIELD.dobDay, maxSize: 9 });
  drawFitted(page, fonts, dob.month, { ...FIELD.dobMonth, maxSize: 9 });
  drawFitted(page, fonts, dob.year, { ...FIELD.dobYear, maxSize: 9 });
  drawFitted(page, fonts, emp?.ศาสนา || "", { ...FIELD.religion, maxWidth: 45, maxSize: 9 });

  // สัญชาติ / ที่อยู่ตามบัตร / ที่อยู่ปัจจุบัน / เลขบัตร / โทรศัพท์
  drawFitted(page, fonts, en.nationality || "", { ...FIELD.nationality, maxWidth: VALUE_MAX_WIDTH, maxSize: 9 });
  const address = buildAddress(emp);
  drawFitted(page, fonts, address, { ...FIELD.homeAddress, maxWidth: VALUE_MAX_WIDTH, maxSize: 8 });
  drawFitted(page, fonts, address, { ...FIELD.presentAddress, maxWidth: VALUE_MAX_WIDTH, maxSize: 8 });
  drawFitted(page, fonts, en.idCardNumber || "", { ...FIELD.idCardNo, maxWidth: VALUE_MAX_WIDTH, maxSize: 9 });
  drawFitted(page, fonts, emp?.โทรศัพท์ || "", { ...FIELD.telephone, maxWidth: VALUE_MAX_WIDTH - 10, maxSize: 9 });

  // ผลตรวจสุขภาพ (ดึงจากผลตรวจล่าสุดในระบบ)
  const healthText = healthRecord ? (healthRecord.result === "fit" ? "ผ่านเกณฑ์สุขภาพ / Fit" : "ไม่ผ่านเกณฑ์สุขภาพ / Unfit") : "ยังไม่มีผลตรวจในระบบ";
  drawFitted(page, fonts, healthText, { ...FIELD.healthStatus, maxWidth: VALUE_MAX_WIDTH, maxSize: 8.5 });

  // โรคประจำตัว (checkbox ตามที่ HR ติ๊กไว้ในตารางรายชื่อ)
  const diseases = en.healthCheck?.congenitalDiseases || [];
  const { highBP, diabetes, heart, nothing, other, noteText } = mapDiseasesToFormCheckboxes(diseases, en.healthCheck?.otherDetail || "");
  if (highBP) drawCheckMark(page, FIELD.diseaseHighBP);
  if (diabetes) drawCheckMark(page, FIELD.diseaseDiabetes);
  if (heart) drawCheckMark(page, FIELD.diseaseHeart);
  if (nothing) drawCheckMark(page, FIELD.diseaseNothing);
  if (other) drawCheckMark(page, FIELD.diseaseOther);
  if (noteText) drawFitted(page, fonts, noteText, { ...FIELD.note, maxSize: 8 });
};

export const generateAccessBadgeRequestPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  healthByEmployeeId: Map<string, HealthCheckRecord>
): Promise<Uint8Array> => {
  const { outDoc, templateDoc, fonts } = await loadPdfWithFonts();
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const ordered = sortEnrollmentsByEmployeeType(enrollments, employees);

  for (const en of ordered) {
    const [copiedPage] = await outDoc.copyPages(templateDoc, [0]);
    outDoc.addPage(copiedPage);
    drawPersonPage(copiedPage, fonts, batch, en, employeeById.get(en.employeeId), healthByEmployeeId.get(en.employeeId));
  }

  return outDoc.save();
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

export const generateAndDownloadAccessBadgeRequestPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  healthByEmployeeId: Map<string, HealthCheckRecord>
): Promise<void> => {
  const bytes = await generateAccessBadgeRequestPdf(batch, enrollments, employees, healthByEmployeeId);
  downloadBlob(bytes, `ใบรายคน_Access Badge Request_${batch.project}_${batch.date || ""}.pdf`);
};

export const generateAndPreviewAccessBadgeRequestPdf = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  healthByEmployeeId: Map<string, HealthCheckRecord>
): Promise<void> => {
  const bytes = await generateAccessBadgeRequestPdf(batch, enrollments, employees, healthByEmployeeId);
  openPdfInNewTab(bytes);
};

// re-export เผื่อไฟล์อื่นอยากใช้รายการโรคประจำตัวชุดเดียวกัน (ไม่ให้พิมพ์ผิดซ้ำที่อื่น)
export { CONGENITAL_DISEASE_OPTIONS };
