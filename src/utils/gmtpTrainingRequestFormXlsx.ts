// Auto-fill "ใบปะหน้า" (Training Request Form) เฉพาะโครงการ GMTP (J-074 / Gulf MTP LNG Terminal
// Project) — ต่างจาก HUASHI (J-078) ตรงที่ไฟล์ต้นฉบับของลูกค้าเป็น Excel (.xlsx) ไม่ใช่ PDF และมี
// 2 เวอร์ชันแยกภาษาคนละไฟล์ (ไทย/เมียนมา) จึงใช้วิธี "แก้ไขเฉพาะค่าในเซลล์ข้อมูล" โดยตรงบน XML ภายใน
// ไฟล์ .xlsx ต้นฉบับ (ไม่ผ่าน parser ของไลบรารี xlsx ทั่วไป) เพื่อให้โลโก้/สี/เส้นตาราง/รูปภาพที่ฝังอยู่ในไฟล์
// (xl/drawings, xl/media) คงเดิมเป๊ะทุกอย่าง เหมือนกับที่ huashiTrainingRequestFormPdf.ts ใช้วิธี "overlay"
// เขียนทับบน PDF จริงของลูกค้า (ถ้าใช้ไลบรารี xlsx อ่าน-เขียนไฟล์ใหม่ทั้งไฟล์ รูปภาพ/โลโก้ที่ฝังไว้จะหายไปทันที)
import JSZip from "jszip";
import { resolveEmployeeDateOfBirth } from "./employeeDates";
import { GMTP_MATRIX_COURSES, getGmtpCourseEnrollments, getGmtpMatrixCourse, resolveGmtpMatrixRole, gmtpDocumentRequirements } from "../components/gmtpTrainingMatrix";
import { groupRequirements, getApplicableRequirements } from "../components/projectDocumentConfig";
import type { ProjectDocumentRequirement } from "../components/projectDocumentConfig";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

// โครงการที่ใช้แบบฟอร์มนี้ — จับคู่แบบ "มีคำนี้อยู่ใน batch.project" (ไม่สนตัวพิมพ์เล็ก/ใหญ่) เหมือนกับ
// isHuashiTrainingRequestProject ใน huashiTrainingRequestFormPdf.ts
const GMTP_PROJECT_MATCH_KEYWORDS = ["J-074", "J074", "J74", "GMTP"];

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

// ไฟล์ไทยมี 2 ชีตข้อมูล (15 และ 11 คน) ส่วนไฟล์เมียนมามีชีตข้อมูลเดียว (10 คน)
// ตำแหน่งส่วนยืนยันอบรมต่างกันในแต่ละชีต ต้องเว้นไว้จากตารางรายชื่อ
const SHEET_PATHS: Record<"th" | "mm", { data: string[]; photos: string }> = {
  th: { data: ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"], photos: "xl/worksheets/sheet3.xml" },
  mm: { data: ["xl/worksheets/sheet1.xml"], photos: "xl/worksheets/sheet2.xml" },
};

const SHEET_LAYOUTS = {
  th: [{ rows: 15, confirmationRow: 28 }, { rows: 11, confirmationRow: 24 }],
  mm: [{ rows: 10, confirmationRow: 23 }],
};
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

const resolveNationality = (en: TrainingEnrollment, emp?: EmployeeRow): string =>
  String(emp?.สัญชาติ || en.nationality || "").trim();

const resolveGmtpGroup = (nationality: string): "th" | "mm" | null => {
  if (isThaiNationality(nationality)) return "th";
  if (["พม่า", "เมียนมา", "เมียนมาร์", "myanmar", "burmese", "burma"].includes(nationality.toLowerCase())) return "mm";
  return null;
};

const displayDate = (iso: string | undefined): string => {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

// ที่อยู่ของแรงงานเมียนมาในใบปะหน้า GMTP ใช้ที่พัก/แคมป์ที่บริษัทจัดให้เสมอ (ไม่ใช่ที่อยู่ตามทะเบียนบ้านจริงที่
// เมียนมาซึ่งเก็บไว้ในโปรไฟล์พนักงาน) ยืนยันกับ HR แล้วว่าใช้ที่อยู่คงที่นี้ไปก่อนจนกว่าจะแจ้งเปลี่ยน
const GMTP_MYANMAR_CAMP_ADDRESS = "27 ซอยหนองน้ำเย็น ต.เนินพระ อ.เมือง จ.ระยอง";

const resolveGmtpAddress = (emp: EmployeeRow | undefined, nationality: string | undefined): string =>
  isThaiNationality(nationality) ? buildAddress(emp) : GMTP_MYANMAR_CAMP_ADDRESS;

// ลำดับการแสดงรายชื่อในใบปะหน้า/ใบรูปถ่าย: รหัสรายเดือน -> รหัส DC -> รหัส SP -> รหัส SC
// (คนที่หา employee_type ไม่พบในฐานข้อมูลให้ต่อท้ายสุด ไม่กระทบคนที่จัดประเภทได้แล้ว)
// ภายในกลุ่มเดียวกัน เรียงเลขรหัสพนักงานน้อยไปมาก (ใครไม่มีเลขรหัสให้ต่อท้ายกลุ่ม)
const EMPLOYEE_TYPE_SORT_ORDER = ["Indirect", "Direct_TeamLeader", "Direct_SupplyDC", "Direct_SubContractor"];
const codeNumber = (code: string | undefined): number => {
  const digits = String(code || "").match(/\d+/g)?.join("") || "";
  return digits ? Number(digits) : Infinity;
};
const sortEnrollmentsByEmployeeType = (enrollments: TrainingEnrollment[], employees: EmployeeRow[]): TrainingEnrollment[] => {
  const employeeTypeById = new Map(employees.map((employee) => [employee.id, employee.employee_type || ""]));
  const rank = (en: TrainingEnrollment): number => {
    const idx = EMPLOYEE_TYPE_SORT_ORDER.indexOf(employeeTypeById.get(en.employeeId) || "");
    return idx === -1 ? EMPLOYEE_TYPE_SORT_ORDER.length : idx;
  };
  return [...enrollments]
    .map((en, index) => ({ en, index, rank: rank(en), code: codeNumber(en.employeeCode) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.code !== b.code ? a.code - b.code : a.index - b.index))
    .map((item) => item.en);
};

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
  out = text(out, "M5", "");
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

const embedGmtpPhotos = async (zip: JSZip, language: "th" | "mm", people: TrainingEnrollment[], employees: Map<string, EmployeeRow>, warnings: string[]): Promise<void> => {
  const drawing = language === "th" ? "drawing3" : "drawing2";
  const drawingRelsPath = `xl/drawings/_rels/${drawing}.xml.rels`;
  const originalRels = await zip.file(drawingRelsPath)?.async("text") || "";
  const originalImages = (originalRels.match(/Target="\.\.\/media\/[^"]+"/g) || []).map((target) => target.replace('Target="../media/', "").replace(/"$/, ""));
  const anchors: string[] = [];
  const relationships: string[] = [];
  for (const [index, en] of Array.from(people.entries())) {
    const photo = employees.get(en.employeeId)?.attachments?.find((item) => item.url && /photo|รูปถ่าย/i.test(item.docType || ""));
    if (!photo?.url) {
      warnings.push(`${en.employeeName} — ยังไม่มีรูปถ่ายทำบัตร`);
      continue;
    }
    const response = await fetch(photo.url);
    if (!response.ok) throw new Error(`โหลดรูปถ่ายไม่สำเร็จ: ${en.employeeName}`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const extension = bytes[0] === 0x89 && bytes[1] === 0x50 ? "png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "jpeg" : "";
    if (!extension) throw new Error(`รูปถ่ายของ ${en.employeeName} ต้องเป็น PNG หรือ JPEG`);
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(76 / bitmap.width, 110 / bitmap.height);
    const cx = Math.round(bitmap.width * scale * 9525);
    const cy = Math.round(bitmap.height * scale * 9525);
    bitmap.close();
    const id = index + 1;
    const imageName = `gmtp_photo_${id}.${extension}`;
    zip.file(`xl/media/${imageName}`, bytes);
    relationships.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imageName}"/>`);
    anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>${index + PHOTOS_FIRST_ROW - 1}</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${escapeXml(en.employeeName)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
  }
  zip.file(`xl/drawings/${drawing}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`);
  zip.file(drawingRelsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`);
  const allRels = (await Promise.all(zip.filter((path) => path.endsWith(".rels")).map((file) => file.async("text")))).join("\n");
  originalImages.forEach((name) => {
    if (!allRels.includes(`media/${name}"`)) zip.remove(`xl/media/${name}`);
  });
  let contentTypes = await zip.file("[Content_Types].xml")!.async("text");
  for (const [extension, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"]]) {
    if (!contentTypes.includes(`Extension="${extension}"`)) contentTypes = contentTypes.replace("</Types>", `<Default Extension="${extension}" ContentType="${mime}"/></Types>`);
  }
  zip.file("[Content_Types].xml", contentTypes);
};

export const generateGmtpTrainingRequestFormXlsx = async (
  batch: TrainingBatch,
  enrollments: TrainingEnrollment[],
  employees: EmployeeRow[],
  language: "th" | "mm",
  requestor: GmtpRequestorInfo,
  warnings: string[] = []
): Promise<Uint8Array> => {
  if (!getGmtpMatrixCourse(batch.courseName)) {
    throw new Error("กรุณาเลือกชื่อคอร์สจาก Training Matrix 74 ในปุ่มแก้ไขข้อมูลใบปะหน้า / ชื่อคอร์สก่อนดาวน์โหลด");
  }
  const templateBytes = await fetchBytes(TEMPLATE_URL[language]);
  const zip = await JSZip.loadAsync(templateBytes);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // แยกตามสัญชาติปัจจุบันของพนักงาน โดยใช้ข้อมูลตอนลงทะเบียนเมื่อไม่มีข้อมูลพนักงาน
  const unresolved = enrollments.filter((en) => !resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId))));
  if (unresolved.length) throw new Error(`กรุณาตรวจสัญชาติไทย/เมียนมาในข้อมูลพนักงาน: ${unresolved.map((en) => en.employeeName).join(", ")}`);
  const filtered = sortEnrollmentsByEmployeeType(
    enrollments.filter((en) => resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId))) === language),
    employees
  );
  const missingRoles = filtered.filter((en) => !resolveGmtpMatrixRole(en.position, en.matrixRole));
  if (missingRoles.length) throw new Error(`กรุณาจับคู่ตำแหน่งตาม Training Matrix 74: ${missingRoles.map((en) => en.employeeName).join(", ")}`);
  const sheetPaths = SHEET_PATHS[language];
  const layouts = SHEET_LAYOUTS[language];
  const maxCapacity = layouts.reduce((total, layout) => total + layout.rows, 0);
  if (filtered.length > maxCapacity) {
    throw new Error(
      `รอบนี้มีคนภาษา${language === "th" ? "ไทย" : "เมียนมา"}ทั้งหมด ${filtered.length} คน เกินความสามารถของไฟล์แบบฟอร์ม (${maxCapacity} คน/ไฟล์) กรุณาแยกส่งออกเป็นหลายรอบ`
    );
  }

  const languageLabel = language === "th" ? "THAI" : "Myanmar";

  let offset = 0;
  for (let sheetIdx = 0; sheetIdx < sheetPaths.data.length; sheetIdx += 1) {
    const path = sheetPaths.data[sheetIdx];
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async("text");
    xml = writeHeaderFields(xml, batch, languageLabel, requestor);
    const layout = layouts[sheetIdx];
    const footer = layout.confirmationRow;
    xml = text(xml, `C${footer}`, batch.gmtpConfirmedBy || "");
    xml = text(xml, `K${footer}`, displayDate(batch.gmtpConfirmedDate));
    xml = text(xml, `C${footer + 1}`, batch.trainer || "");
    xml = text(xml, `K${footer + 1}`, "");
    xml = text(xml, `C${footer + 2}`, batch.location || "");
    xml = text(xml, `K${footer + 2}`, batch.timeSlot || "");

    for (let i = 0; i < layout.rows; i += 1) {
      const globalIndex = offset + i;
      const en = filtered[globalIndex];
      const rowNum = DATA_FIRST_ROW + i;
      xml = text(xml, `O${rowNum}`, "");
      xml = text(xml, `P${rowNum}`, "");
      if (!en) {
        xml = writeDataRow(xml, rowNum, null);
        continue;
      }
      const emp = employeeById.get(en.employeeId);
      const nationality = resolveNationality(en, emp);
      xml = writeDataRow(xml, rowNum, {
        no: globalIndex + 1,
        nameEn: buildEnglishName(emp, en.employeeName),
        nameTh: en.employeeName,
        section: emp?.แผนก || "",
        position: resolveGmtpMatrixRole(en.position, en.matrixRole),
        idCard: en.idCardNumber || "",
        company: resolveGmtpCompanyLabel(nationality),
        nationality,
        dobSerial: excelSerialFromIso(resolveEmployeeDateOfBirth(emp) || undefined),
        address: resolveGmtpAddress(emp, nationality),
        gender: translateGender(en.gender),
      });
    }
    zip.file(path, xml);
    offset += layout.rows;
  }

  // Photos uses the same people and order as the cover sheets. Photos remain digital for card production.
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
        position: resolveGmtpMatrixRole(en.position, en.matrixRole),
        blood: emp?.กรุ๊ปเลือด || "",
      });
    }
    zip.file(sheetPaths.photos, xml);
  }

  await embedGmtpPhotos(zip, language, filtered, employeeById, warnings);
  return zip.generateAsync({ type: "uint8array" });
};

const downloadBlob = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: filename.endsWith(".zip") ? "application/zip" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

/** จำนวนคนแยกตามสัญชาติ สำหรับปุ่มดาวน์โหลดใบไทยและใบเมียนมา */
export const countGmtpEnrollmentsByLanguage = (enrollments: TrainingEnrollment[], employees: EmployeeRow[] = []): { th: number; mm: number } => {
  const employeeById = new Map(employees.map((emp) => [emp.id, emp]));
  let th = 0;
  let mm = 0;
  enrollments.forEach((en) => {
    const group = resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId)));
    if (group === "th") th += 1;
    else if (group === "mm") mm += 1;
  });
  return { th, mm };
};

export const generateGmtpRoundFiles = async (
  batch: TrainingBatch, enrollments: TrainingEnrollment[], employees: EmployeeRow[],
  requestor: GmtpRequestorInfo, courseName?: string, language?: "th" | "mm", warnings: string[] = []
): Promise<Array<{ name: string; bytes: Uint8Array }>> => {
  const employeeById = new Map(employees.map((emp) => [emp.id, emp]));
  const incomplete = enrollments.filter((en) => !resolveGmtpMatrixRole(en.position, en.matrixRole)
    || !resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId))));
  if (incomplete.length) throw new Error(`กรุณาตรวจสัญชาติและจับคู่ตำแหน่งตาม Matrix ให้ครบ: ${incomplete.map((en) => en.employeeName).join(", ")}`);
  const courses = courseName ? GMTP_MATRIX_COURSES.filter((course) => course.name === courseName) : GMTP_MATRIX_COURSES;
  const languages: Array<"th" | "mm"> = language ? [language] : ["th", "mm"];
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const course of courses) {
    const courseEnrollments = getGmtpCourseEnrollments(enrollments, course.name);
    for (const lang of languages) {
      const people = sortEnrollmentsByEmployeeType(
        courseEnrollments.filter((en) => resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId))) === lang),
        employees
      );
      const capacity = SHEET_LAYOUTS[lang].reduce((total, layout) => total + layout.rows, 0);
      for (let offset = 0; offset < people.length; offset += capacity) {
        const bytes = await generateGmtpTrainingRequestFormXlsx({ ...batch, courseName: course.name }, people.slice(offset, offset + capacity), employees, lang, requestor, warnings);
        const safeName = course.name.replace(/[\\/:*?"<>|]/g, "_");
        files.push({ name: `${String(course.id).padStart(2, "0")}_${safeName}_${lang === "th" ? "Thai" : "Myanmar"}_${batch.date}_${Math.floor(offset / capacity) + 1}.xlsx`, bytes });
      }
    }
  }
  return files;
};

export const downloadGmtpRoundForms = async (
  batch: TrainingBatch, enrollments: TrainingEnrollment[], employees: EmployeeRow[],
  requestor: GmtpRequestorInfo, courseName?: string, language?: "th" | "mm",
  requirements: ProjectDocumentRequirement[] = [],
  healthFiles: Map<string, { fileUrl?: string; fileName?: string }> = new Map()
): Promise<void> => {
  const missing: string[] = [];
  const files = await generateGmtpRoundFiles(batch, enrollments, employees, requestor, courseName, language, missing);
  if (!files.length) throw new Error("ยังไม่มีผู้เข้าอบรมตามตำแหน่งใน Matrix สำหรับคอร์สนี้");
  const zip = new JSZip();
  const employeeById = new Map(employees.map((emp) => [emp.id, emp]));
  const downloads = new Map<string, ArrayBuffer>();
  const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, "_").replace(/^[. ]+|[. ]+$/g, "") || "document";
  for (const file of files) {
    const course = GMTP_MATRIX_COURSES.find((item) => file.name.startsWith(`${String(item.id).padStart(2, "0")}_`))!;
    const lang = file.name.includes("_Thai_") ? "th" : "mm";
    const page = Number(file.name.match(/_(\d+)\.xlsx$/)?.[1] || 1);
    const capacity = SHEET_LAYOUTS[lang].reduce((total, layout) => total + layout.rows, 0);
    const people = getGmtpCourseEnrollments(enrollments, course.name)
      .filter((en) => resolveGmtpGroup(resolveNationality(en, employeeById.get(en.employeeId))) === lang)
      .slice((page - 1) * capacity, page * capacity);
    const folder = file.name.replace(/\.xlsx$/, "");
    zip.file(`${folder}/00_${file.name}`, file.bytes);
    for (const [index, en] of Array.from(people.entries())) {
      const emp = employeeById.get(en.employeeId);
      const health = healthFiles.get(en.employeeId);
      const attachments = [...(emp?.attachments || [])];
      const applicable = getApplicableRequirements(gmtpDocumentRequirements(requirements, course.name, resolveGmtpMatrixRole(en.position, en.matrixRole)), !isThaiNationality(resolveNationality(en, emp)))
        .filter((req) => req.fulfillmentType !== "generated_by_system");
      const units = groupRequirements(applicable).sort((a, b) =>
        Math.min(...a.options.map((req) => applicable.indexOf(req))) - Math.min(...b.options.map((req) => applicable.indexOf(req))));
      for (const [docIndex, unit] of Array.from(units.entries())) {
        let attachment = attachments.find((item) => item.url && unit.options.some((req) => req.docType === item.docType));
        if (!attachment && health?.fileUrl && unit.options.some((req) => /health_cert|medical|รับรองแพทย์/i.test(`${req.docType} ${req.label}`))) {
          attachment = { url: health.fileUrl, name: health.fileName || "medical.pdf" };
        }
        if (!attachment?.url) {
          missing.push(`${en.employeeName} — ${unit.label} (${course.name})`);
          continue;
        }
        let bytes = downloads.get(attachment.url);
        if (!bytes) {
          const response = await fetch(attachment.url);
          if (!response.ok) throw new Error(`ดาวน์โหลดเอกสารไม่สำเร็จ: ${en.employeeName} — ${unit.label}`);
          bytes = await response.arrayBuffer();
          downloads.set(attachment.url, bytes);
        }
        const personFolder = `${String(index + 1).padStart(2, "0")}_${safeName(en.employeeName)}_${safeName(en.employeeId)}`;
        const photo = unit.options.some((req) => /photo|รูปถ่าย/i.test(`${req.docType} ${req.label}`));
        zip.file(`${folder}/${personFolder}/${String(docIndex + 1).padStart(2, "0")}_${photo ? "รูปถ่าย_ไฟล์ส่งทำบัตร_" : ""}${safeName(attachment.name || `${unit.label}.pdf`)}`, bytes);
      }
    }
  }
  if (missing.length) zip.file("รายการเอกสารที่ต้องติดตาม.txt", `\uFEFFชุดนี้รวมเฉพาะเอกสารที่มี กรุณาติดตามรายการต่อไปนี้\n\n${Array.from(new Set(missing)).join("\n")}`);
  downloadBlob(await zip.generateAsync({ type: "uint8array" }), `GMTP_Training_Submission_${batch.date}.zip`);
  if (missing.length) window.alert(`ดาวน์โหลดชุดเอกสารที่มีแล้ว แต่เอกสารยังไม่ครบ:\n${Array.from(new Set(missing)).join("\n")}\n\nมีรายการนี้แนบใน ZIP ด้วย`);
};
