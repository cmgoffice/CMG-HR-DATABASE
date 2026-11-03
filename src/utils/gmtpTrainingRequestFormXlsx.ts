// Auto-fill "ใบปะหน้า" (Training Request Form) เฉพาะโครงการ GMTP (J-074 / Gulf MTP LNG Terminal
// Project) — ต่างจาก HUASHI (J-078) ตรงที่ไฟล์ต้นฉบับของลูกค้าเป็น Excel (.xlsx) ไม่ใช่ PDF และมี
// 2 เวอร์ชันแยกภาษาคนละไฟล์ (ไทย/เมียนมา) จึงใช้วิธี "แก้ไขเฉพาะค่าในเซลล์ข้อมูล" โดยตรงบน XML ภายใน
// ไฟล์ .xlsx ต้นฉบับ (ไม่ผ่าน parser ของไลบรารี xlsx ทั่วไป) เพื่อให้โลโก้/สี/เส้นตาราง/รูปภาพที่ฝังอยู่ในไฟล์
// (xl/drawings, xl/media) คงเดิมเป๊ะทุกอย่าง เหมือนกับที่ huashiTrainingRequestFormPdf.ts ใช้วิธี "overlay"
// เขียนทับบน PDF จริงของลูกค้า (ถ้าใช้ไลบรารี xlsx อ่าน-เขียนไฟล์ใหม่ทั้งไฟล์ รูปภาพ/โลโก้ที่ฝังไว้จะหายไปทันที)
import JSZip from "jszip";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

// โครงการที่ใช้แบบฟอร์มนี้ — จับคู่แบบ "มีคำนี้อยู่ใน batch.project" (ไม่สนตัวพิมพ์เล็ก/ใหญ่) เหมือนกับ
// isHuashiTrainingRequestProject ใน huashiTrainingRequestFormPdf.ts
const GMTP_PROJECT_MATCH_KEYWORDS = ["J-074", "J074", "GMTP"];

export function isGmtpTrainingRequestProject(project: string | undefined | null): boolean {
  const value = String(project || "").toUpperCase();
  if (!value) return false;
  return GMTP_PROJECT_MATCH_KEYWORDS.some((kw) => value.includes(kw.toUpperCase()));
}

export interface GmtpRequestorInfo {
  requestorName: string;
  requestorPosition: string;
  requestorMobile: string;
  requestorEmail: string;
}

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const TEMPLATE_URL: Record<"th" | "mm", string> = {
  th: asset("/templates/training/gmtp-training-request-form-th.xlsx"),
  mm: asset("/templates/training/gmtp-training-request-form-mm.xlsx"),
};

// ชื่อไฟล์ภายใน .xlsx (เทียบจากโครงสร้างจริงที่แกะดูแล้ว) — ไฟล์ไทยมี 2 ชีตข้อมูล (SHE 1 / SHE (2)) รองรับ
// ได้ถึง 30 คน (ชีตละ 15 แถว) ส่วนไฟล์เมียนมามีชีตข้อมูลเดียว (In) รองรับ 15 คน และชีตรูปถ่ายคนละชื่อไฟล์
const SHEET_PATHS: Record<"th" | "mm", { data: string[]; photos: string }> = {
  th: { data: ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"], photos: "xl/worksheets/sheet3.xml" },
  mm: { data: ["xl/worksheets/sheet1.xml"], photos: "xl/worksheets/sheet2.xml" },
};

const ROWS_PER_SHEET = 15;
const DATA_FIRST_ROW = 12; // แถวแรกของตารางรายชื่อ (แถว 1-11 เป็นหัวฟอร์ม/ป้ายหัวตาราง)
const PHOTOS_FIRST_ROW = 3;
const PHOTOS_MAX_ROWS = 26;

const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดไฟล์แบบฟอร์มไม่สำเร็จ (${res.status}): ${url}`);
  return res.arrayBuffer();
};

const escapeXml = (text: string): string =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type CellContent = { type: "text"; value: string } | { type: "num"; value: number } | { type: "blank" };

/** เขียนทับค่าในเซลล์เดียว (ตาม address เช่น "C4") โดยคง attribute อื่น ๆ (เช่น s="..." = style เดิม) ไว้ครบ
 * ไม่แตะ element <c> ตัวอื่นเลย — ถ้าไม่เจอ address นี้ในชีต (แถวไม่มีจริง) จะคืน xml เดิมโดยไม่มี error */
const setCell = (xml: string, addr: string, content: CellContent): string => {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  if (!re.test(xml)) return xml;
  return xml.replace(re, (_match, attrs: string) => {
    const baseAttrs = String(attrs || "").replace(/\s*t="[^"]*"/g, "");
    if (content.type === "blank") return `<c r="${addr}"${baseAttrs}/>`;
    if (content.type === "num") return `<c r="${addr}"${baseAttrs}><v>${content.value}</v></c>`;
    return `<c r="${addr}"${baseAttrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(content.value)}</t></is></c>`;
  });
};

const text = (xml: string, addr: string, value: string | undefined): string =>
  setCell(xml, addr, { type: "text", value: value || "" });

const num = (xml: string, addr: string, value: number | undefined): string =>
  value === undefined || Number.isNaN(value) ? setCell(xml, addr, { type: "blank" }) : setCell(xml, addr, { type: "num", value });

// Excel เก็บวันที่เป็นเลขลำดับวันนับจาก 1899-12-30 (ชดเชย bug ปี 1900 ของ Excel ไปในตัวแล้ว ตามสูตรที่ใช้กันทั่วไป)
const excelSerialFromIso = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((d.getTime() - epoch) / 86400000);
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
  ];
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(" ");
};

const buildEnglishName = (emp: EmployeeRow | undefined, fallback: string): string => {
  const en = `${emp?.ชื่ออังกฤษ || ""} ${emp?.นามสกุลอังกฤษ || ""}`.trim();
  return en || fallback;
};

const translateGender = (gender: string | undefined): string => {
  const g = String(gender || "").trim();
  if (g === "ชาย") return "Male";
  if (g === "หญิง") return "Female";
  return g;
};

// ชื่อบริษัทในตารางรายชื่อ (คอลัมน์ "Company") กำหนดตายตัวตามสัญชาติของโครงการนี้โดยเฉพาะ — ไทย = CAZ-CMG,
// เมียนมา/สัญชาติอื่น = CMG (ยืนยันกับ HR แล้วว่าใช้กฎนี้ไปก่อนจนกว่าจะแจ้งเปลี่ยน ไม่ได้ดึงจากฐานข้อมูลจริง)
const isThaiNationality = (nationality: string | undefined): boolean => {
  const value = String(nationality || "").trim().toLowerCase();
  return value === "thai" || value === "ไทย";
};

const resolveGmtpCompanyLabel = (nationality: string | undefined): string => (isThaiNationality(nationality) ? "CAZ-CMG" : "CMG");

// ที่อยู่ของแรงงานเมียนมาในใบปะหน้า GMTP ใช้ที่พัก/แคมป์ที่บริษัทจัดให้เสมอ (ไม่ใช่ที่อยู่ตามทะเบียนบ้านจริงที่
// เมียนมาซึ่งเก็บไว้ในโปรไฟล์พนักงาน) ยืนยันกับ HR แล้วว่าใช้ที่อยู่คงที่นี้ไปก่อนจนกว่าจะแจ้งเปลี่ยน
const GMTP_MYANMAR_CAMP_ADDRESS = "27 ซอยหนองน้ำเย็น ต.เนินพระ อ.เมือง จ.ระยอง";

const resolveGmtpAddress = (emp: EmployeeRow | undefined, nationality: string | undefined): string =>
  isThaiNationality(nationality) ? buildAddress(emp) : GMTP_MYANMAR_CAMP_ADDRESS;

/** เขียนข้อมูลหัวฟอร์ม (A1 GENERAL INFO + A2 REQUESTOR INFO) ลงในชีตข้อมูล 1 ชีต — ต้องเขียนซ้ำทุกชีต
 * เพราะไฟล์ต้นฉบับมีหัวฟอร์มซ้ำกันทุกหน้า/ทุกชีต (เหมือนโลโก้ที่ต้องมีครบทุกหน้าของ HUASHI) */
const writeHeaderFields = (
  xml: string,
  batch: TrainingBatch,
  languageLabel: string,
  requestor: GmtpRequestorInfo
): string => {
  let out = xml;
  out = text(out, "C4", batch.courseName || "");
  out = text(out, "C5", languageLabel);
  out = num(out, "M5", excelSerialFromIso(batch.date));
  out = text(out, "C7", requestor.requestorName || "");
  out = text(out, "M7", "CMG");
  out = text(out, "C8", requestor.requestorPosition || "");
  out = text(out, "M8", requestor.requestorEmail || "");
  out = text(out, "C9", requestor.requestorMobile || "");
  return out;
};

interface RowValues {
  no: number;
  nameEn: string;
  nameTh: string;
  section: string;
  position: string;
  idCard: string;
  company: string;
  nationality: string;
  dobSerial: number | undefined;
  address: string;
  gender: string;
}

const writeDataRow = (xml: string, rowIndex: number, values: RowValues | null): string => {
  const r = rowIndex;
  let out = xml;
  if (!values) {
    ["A", "B", "C", "D", "E", "H", "I", "K", "L", "M", "N"].forEach((col) => {
      out = setCell(out, `${col}${r}`, { type: "blank" });
    });
    return out;
  }
  out = num(out, `A${r}`, values.no);
  out = text(out, `B${r}`, values.nameEn);
  out = text(out, `C${r}`, values.nameTh);
  out = text(out, `D${r}`, values.section);
  out = text(out, `E${r}`, values.position);
  out = text(out, `H${r}`, values.idCard);
  out = text(out, `I${r}`, values.company);
  out = text(out, `K${r}`, values.nationality);
  out = num(out, `L${r}`, values.dobSerial);
  out = text(out, `M${r}`, values.address);
  out = text(out, `N${r}`, values.gender);
  return out;
};

const writePhotosRow = (xml: string, rowIndex: number, values: { no: number; nameEn: string; position: string; blood: string } | null): string => {
  const r = rowIndex;
  let out = xml;
  if (!values) {
    ["A", "B", "C", "D"].forEach((col) => {
      out = setCell(out, `${col}${r}`, { type: "blank" });
    });
    return out;
  }
  out = num(out, `A${r}`, values.no);
  out = text(out, `B${r}`, values.nameEn);
  out = text(out, `C${r}`, values.position);
  out = text(out, `D${r}`, values.blood);
  return out;
};

export const generateGmtpTrainingRequestFormXlsx = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  language: "th" | "mm",
  requestor: GmtpRequestorInfo
): Promise<Uint8Array> => {
  const templateBytes = await fetchBytes(TEMPLATE_URL[language]);
  const zip = await JSZip.loadAsync(templateBytes);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // GMTP แยกใบปะหน้าเป็น 2 เวอร์ชันตามสัญชาติ (คนละไฟล์ ไม่ปนกัน) — ใบไทยใช้คนที่ language === "th",
  // ใบเมียนมาใช้คนที่ language === "mm"
  const filtered = enrollments.filter((en) => en.language === language);
  const sheetPaths = SHEET_PATHS[language];
  const maxCapacity = sheetPaths.data.length * ROWS_PER_SHEET;
  if (filtered.length > maxCapacity) {
    throw new Error(
      `รอบนี้มีคนภาษา${language === "th" ? "ไทย" : "เมียนมา"}ทั้งหมด ${filtered.length} คน เกินความสามารถของไฟล์แบบฟอร์ม (${maxCapacity} คน/ไฟล์) กรุณาแยกส่งออกเป็นหลายรอบ`
    );
  }

  const languageLabel = language === "th" ? "THAI" : "Myanmar";

  for (let sheetIdx = 0; sheetIdx < sheetPaths.data.length; sheetIdx += 1) {
    const path = sheetPaths.data[sheetIdx];
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async("text");
    xml = writeHeaderFields(xml, batch, languageLabel, requestor);

    for (let i = 0; i < ROWS_PER_SHEET; i += 1) {
      const globalIndex = sheetIdx * ROWS_PER_SHEET + i;
      const en = filtered[globalIndex];
      const rowNum = DATA_FIRST_ROW + i;
      if (!en) {
        xml = writeDataRow(xml, rowNum, null);
        continue;
      }
      const emp = employeeById.get(en.employeeId);
      xml = writeDataRow(xml, rowNum, {
        no: globalIndex + 1,
        nameEn: buildEnglishName(emp, en.employeeName),
        nameTh: en.employeeName,
        section: emp?.แผนก || "",
        position: en.position || "",
        idCard: en.idCardNumber || "",
        company: resolveGmtpCompanyLabel(en.nationality),
        nationality: en.nationality || "",
        dobSerial: excelSerialFromIso(emp?.วันเกิดปีเดือนวัน_คศ),
        address: resolveGmtpAddress(emp, en.nationality),
        gender: translateGender(en.gender),
      });
    }
    zip.file(path, xml);
  }

  // ชีต "Photos" — เติมให้แค่ชื่อ/ตำแหน่ง/กรุ๊ปเลือด (ข้อความ) ส่วนรูปถ่ายจริงยังต้องให้ HR แปะเองหลังดาวน์โหลด
  // (ไฟล์รูปในระบบยังไม่ได้เชื่อมต่อให้ฝังอัตโนมัติ) ตามที่พี่บอกว่า "ไฟล์รูปไม่ปริ้น" อยู่แล้วจึงไม่กระทบขั้นตอนพิมพ์
  const photosFile = zip.file(sheetPaths.photos);
  if (photosFile) {
    let xml = await photosFile.async("text");
    for (let i = 0; i < PHOTOS_MAX_ROWS; i += 1) {
      const en = filtered[i];
      const rowNum = PHOTOS_FIRST_ROW + i;
      if (!en) {
        xml = writePhotosRow(xml, rowNum, null);
        continue;
      }
      const emp = employeeById.get(en.employeeId);
      xml = writePhotosRow(xml, rowNum, {
        no: i + 1,
        nameEn: buildEnglishName(emp, en.employeeName),
        position: en.position || "",
        blood: emp?.กรุ๊ปเลือด || "",
      });
    }
    zip.file(sheetPaths.photos, xml);
  }

  return zip.generateAsync({ type: "uint8array" });
};

const downloadBlob = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const generateAndDownloadGmtpTrainingRequestFormXlsx = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  language: "th" | "mm",
  requestor: GmtpRequestorInfo
): Promise<void> => {
  const bytes = await generateGmtpTrainingRequestFormXlsx(batch, enrollments, employees, language, requestor);
  const label = language === "th" ? "Thai" : "Myanmar";
  downloadBlob(bytes, `GMTP_Training_Request_Form_${label}_${batch.date || ""}.xlsx`);
};

/** จำนวนคนแยกตามภาษา — ใช้ซ่อน/แสดงปุ่มดาวน์โหลดแต่ละเวอร์ชันในหน้ารอบอบรม (ไม่ต้องกดดาวน์โหลดไฟล์ที่ไม่มีคนเลย) */
export const countGmtpEnrollmentsByLanguage = (enrollments: TrainingEnrollment[]): { th: number; mm: number } => {
  let th = 0;
  let mm = 0;
  enrollments.forEach((en) => {
    if (en.language === "th") th += 1;
    else if (en.language === "mm") mm += 1;
  });
  return { th, mm };
};