import html2canvas from "html2canvas";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import {
  formatStakeholdersForExport,
  JobDescription,
  migrateResponsibilityStakeholders,
} from "../components/jobDescriptionConfig";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const xmlText = (value: string) => escapeXml(value).replace(/\r/g, "").replace(/\n/g, "&#10;");

const clean = (value: unknown): string => String(value ?? "").replace(/\t+/g, " ").replace(/\r/g, "").trim();

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const categoryLabel = (raw: string): string => {
  const text = clean(raw);
  if (/^soft/i.test(text)) return "Soft Skills\n(ทักษะการทำงานร่วมกัน)";
  if (/^hard/i.test(text)) return "Hard Skills\n(ทักษะวิชาชีพ)";
  return text;
};

const signatureBlock = (name: string): string => {
  const lines = "ลงชื่อ: ....................................................\nวันที่: ........./........./.........";
  return name ? `${name}\n${lines}` : `\n${lines}`;
};

export interface JobDescriptionExportInput {
  job: JobDescription;
  employeeName?: string;
}

interface ExportSkill {
  category: string;
  skill: string;
  expected: number | null;
  actual: number | null;
  gap: number | null;
  idp: string;
}

interface ExportModel {
  fileBase: string;
  jobTitle: string;
  jobCode: string;
  department: string;
  jobLevel: string;
  reportsTo: string;
  preparedDate: string;
  jobPurpose: string;
  scopeNote: string;
  responsibilities: { task: string; kpi: string; raci: string; stakeholders: string }[];
  education: string;
  experience: string;
  knowledgeSkills: string;
  additionalQualifications: string;
  preparerName: string;
  approverName: string;
  acknowledgedName: string;
  employeeName: string;
  skills: ExportSkill[];
  averageExpected: number | null;
}

export const buildJobDescriptionExportModel = ({ job, employeeName }: JobDescriptionExportInput): ExportModel => {
  const title = clean(job.jobTitle) || "JD";
  const skills = (job.skillMatrix || [])
    .filter((row) => clean(row.skill))
    .map((row, index) => {
      const expected = asNumber(row.expectedLevel);
      const actual = asNumber(row.actualLevel);
      return {
        category: categoryLabel(String(row.category || "")),
        skill: `${index + 1}. ${clean(row.skill).replace(/^\d+\.\s*/, "")}`,
        expected,
        actual,
        gap: expected !== null && actual !== null ? actual - expected : null,
        idp: clean(row.idpMethod),
      };
    });
  const expectedValues = skills.map((row) => row.expected).filter((value): value is number => value !== null);
  const acknowledgedName = clean(job.employeeName) || clean(employeeName) || clean(job.acknowledgerName) || clean(job.candidateName);

  return {
    fileBase: `JD_${title.replace(/[^\w\u0E00-\u0E7F]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "JD"}`,
    jobTitle: title,
    jobCode: clean(job.jobCode),
    department: clean(job.department),
    jobLevel: clean(job.jobLevel),
    reportsTo: clean(job.reportsTo),
    preparedDate: clean(job.preparedDate),
    jobPurpose: clean(job.jobPurpose),
    scopeNote: clean(job.scopeNote),
    responsibilities: (job.responsibilities || [])
      .filter((row) => clean(row.task))
      .map((row) => ({
        task: clean(row.task),
        kpi: clean(row.kpi),
        raci: clean(row.raci).toUpperCase(),
        stakeholders: formatStakeholdersForExport(migrateResponsibilityStakeholders(row)),
      })),
    education: clean(job.education),
    experience: clean(job.experience),
    knowledgeSkills: clean(job.knowledgeSkills),
    additionalQualifications: clean(job.additionalQualifications),
    preparerName: clean(job.preparerName),
    approverName: clean(job.approverName),
    acknowledgedName,
    employeeName: acknowledgedName,
    skills,
    averageExpected: expectedValues.length
      ? Math.round((expectedValues.reduce((sum, value) => sum + value, 0) / expectedValues.length) * 100) / 100
      : null,
  };
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Tahoma"/></font>
<font><b/><color rgb="FF1B365D"/><sz val="11"/><name val="Tahoma"/></font>
<font><b/><color rgb="FF1A202C"/><sz val="10"/><name val="Tahoma"/></font>
<font><color rgb="FF1A202C"/><sz val="10"/><name val="Tahoma"/></font>
<font><i/><color rgb="FF4A5568"/><sz val="9"/><name val="Tahoma"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Tahoma"/></font>
<font><b/><color rgb="FF1B365D"/><sz val="10"/><name val="Tahoma"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B365D"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEBF3FA"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDF2F7"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7FAFC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2C5282"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="medium"><color rgb="FF1B365D"/></left><right style="thin"><color rgb="FFCBD5E0"/></right><top style="thin"><color rgb="FFCBD5E0"/></top><bottom style="thin"><color rgb="FFCBD5E0"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E0"/></left><right style="thin"><color rgb="FFCBD5E0"/></right><top style="thin"><color rgb="FFCBD5E0"/></top><bottom style="thin"><color rgb="FFCBD5E0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="2" fontId="7" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

interface XCell {
  value?: string | number;
  style: number;
  formula?: string;
}

interface XRow {
  height?: number;
  cells: (XCell | null)[];
}

const columnName = (index: number): string => {
  let n = index;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const cellXml = (ref: string, cell: XCell | null): string => {
  if (!cell) return "";
  if (cell.formula) {
    const cached = typeof cell.value === "number" ? `<v>${cell.value}</v>` : "";
    return `<c r="${ref}" s="${cell.style}"><f>${escapeXml(cell.formula)}</f>${cached}</c>`;
  }
  if (typeof cell.value === "number") return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`;
  if (!cell.value) return `<c r="${ref}" s="${cell.style}"/>`;
  return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(String(cell.value))}</t></is></c>`;
};

const textHeight = (value: string, width: number, min: number): number => {
  const perLine = Math.max(12, Math.floor(width * 0.95));
  const lines = (value || " ").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return Math.max(min, Math.min(220, lines * 15 + 12));
};

const fill = (style: number, columns: number, value?: string | number): (XCell | null)[] =>
  Array.from({ length: columns }, (_, index) => ({ style, value: index === 0 ? value : undefined }));

const worksheetXml = (tabColor: string, widths: number[], rows: XRow[], merges: string[]): string => {
  const lastCol = columnName(widths.length);
  const lastRow = rows.length;
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetData = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 1;
      const cells = row.cells
        .map((cell, cellIndex) => cellXml(`${columnName(cellIndex + 1)}${r}`, cell))
        .join("");
      const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      return `<row r="${r}"${height}>${cells}</row>`;
    })
    .join("");
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><tabColor rgb="${tabColor}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${sheetData}</sheetData>
${mergeXml}
<printOptions horizontalCentered="1"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;C&amp;8CMG Engineering &amp; Construction  ·  หน้า &amp;P / &amp;N</oddFooter></headerFooter>
</worksheet>`;
};

const buildWorkbookSheets = (model: ExportModel): { jd: string; skill: string } => {
  const zebra = (index: number) => index % 2 === 1;
  const jdRows: XRow[] = [
    { height: 34, cells: fill(1, 5, "คำบรรยายลักษณะงาน (JOB DESCRIPTION) และตารางกำหนดบทบาทหน้าที่ (JOB MATRIX)") },
    { cells: [] },
    { height: 24, cells: fill(2, 5, "ส่วนที่ 1: ข้อมูลทั่วไปของตำแหน่งงาน (Job Identification)") },
    { height: textHeight(`${model.jobTitle} ${model.jobCode}`, 30, 23), cells: [
      { style: 3, value: "ชื่อตำแหน่ง (Job Title):" }, { style: 3 }, { style: 4, value: model.jobTitle }, { style: 3, value: "รหัสตำแหน่ง (Job Code):" }, { style: 4, value: model.jobCode },
    ] },
    { height: textHeight(`${model.department} ${model.jobLevel}`, 28, 28), cells: [
      { style: 3, value: "แผนก/ฝ่าย (Department):" }, { style: 3 }, { style: 4, value: model.department }, { style: 3, value: "ระดับตำแหน่ง (Job Level):" }, { style: 4, value: model.jobLevel },
    ] },
    { height: textHeight(`${model.reportsTo} ${model.preparedDate}`, 28, 28), cells: [
      { style: 3, value: "รายงานตรงต่อ (Reports To):" }, { style: 3 }, { style: 4, value: model.reportsTo }, { style: 3, value: "วันที่จัดทำ/ทบทวน:" }, { style: 4, value: model.preparedDate },
    ] },
    { height: textHeight(model.jobPurpose, 80, 40), cells: [
      { style: 3, value: "วัตถุประสงค์หลักของตำแหน่ง (Job Purpose):" }, { style: 3 }, { style: 4, value: model.jobPurpose }, { style: 4 }, { style: 4 },
    ] },
    { height: textHeight(model.scopeNote, 80, 48), cells: [
      { style: 3, value: "ขอบเขตความรับผิดชอบ (Scope Note):" }, { style: 3 }, { style: 5, value: model.scopeNote }, { style: 5 }, { style: 5 },
    ] },
    { cells: [] },
    { height: 24, cells: fill(2, 5, "ส่วนที่ 2: หน้าที่ความรับผิดชอบหลักและ Job Matrix (RACI)") },
    { height: 22, cells: fill(6, 5, "คำอธิบาย RACI:  R = Responsible (ผู้ปฏิบัติงานหลัก)  |  A = Accountable (ผู้อนุมัติ/รับผิดชอบสูงสุด)  |  C = Consulted (ผู้ให้คำปรึกษา/ตรวจสอบ)  |  I = Informed (ผู้รับทราบผล)") },
    { height: 32, cells: [
      { style: 7, value: "ลำดับ" },
      { style: 7, value: "หน้าที่ความรับผิดชอบหลัก (Key Responsibilities)" },
      { style: 7, value: "ตัวชี้วัดความสำเร็จ (KPIs)" },
      { style: 7, value: "บทบาท\n(RACI)" },
      { style: 7, value: "ผู้เกี่ยวข้องร่วม (ในทีม / ต่างแผนก)" },
    ] },
  ];
  model.responsibilities.forEach((row, index) => {
    const alt = zebra(index);
    jdRows.push({
      height: textHeight([row.task, row.kpi, row.stakeholders].sort((a, b) => b.length - a.length)[0] || "", 32, 48),
      cells: [
        { style: alt ? 9 : 8, value: index + 1 },
        { style: alt ? 10 : 4, value: row.task },
        { style: alt ? 10 : 4, value: row.kpi },
        { style: alt ? 9 : 8, value: row.raci },
        { style: alt ? 10 : 4, value: row.stakeholders },
      ],
    });
  });
  const specStart = jdRows.length + 2;
  jdRows.push(
    { cells: [] },
    { height: 24, cells: fill(2, 5, "ส่วนที่ 3: คุณสมบัติพื้นฐานของผู้ดำรงตำแหน่ง (Job Specification)") },
    { height: textHeight(model.education, 80, 28), cells: [{ style: 3, value: "วุฒิการศึกษา (Education):" }, { style: 3 }, { style: 4, value: model.education }, { style: 4 }, { style: 4 }] },
    { height: textHeight(model.experience, 80, 24), cells: [{ style: 3, value: "ประสบการณ์ทำงาน (Experience):" }, { style: 3 }, { style: 4, value: model.experience }, { style: 4 }, { style: 4 }] },
    { height: textHeight(model.knowledgeSkills, 80, 36), cells: [{ style: 3, value: "ความรู้และทักษะเฉพาะทาง:" }, { style: 3 }, { style: 4, value: model.knowledgeSkills }, { style: 4 }, { style: 4 }] },
    { height: textHeight(model.additionalQualifications, 80, 24), cells: [{ style: 3, value: "คุณสมบัติเพิ่มเติม (ถ้ามี):" }, { style: 3 }, { style: 4, value: model.additionalQualifications }, { style: 4 }, { style: 4 }] },
    { cells: [] },
    { height: 24, cells: fill(2, 5, "ส่วนที่ 4: การอนุมัติและลงนามรับทราบ (Approval & Acknowledgment)") },
    { height: 22, cells: [
      { style: 7, value: "ผู้จัดทำ (หัวหน้าแผนก / HR)" }, { style: 7 },
      { style: 7, value: "ผู้อนุมัติ (ผู้จัดการฝ่าย / ผู้บริหาร)" }, { style: 7 },
      { style: 7, value: "ผู้รับทราบ (ผู้ดำรงตำแหน่ง)" },
    ] },
    { height: 64, cells: [
      { style: 4, value: signatureBlock(model.preparerName) }, { style: 4 },
      { style: 4, value: signatureBlock(model.approverName) }, { style: 4 },
      { style: 4, value: signatureBlock(model.acknowledgedName) },
    ] }
  );
  const approvalHeader = jdRows.length - 1;
  const approvalBody = jdRows.length;
  const jdMerges = [
    "A1:E1", "A3:E3", "A4:B4", "A5:B5", "A6:B6", "A7:B7", "C7:E7", "A8:B8", "C8:E8", "A10:E10", "A11:E11",
    `A${specStart}:E${specStart}`,
    `A${specStart + 1}:B${specStart + 1}`, `C${specStart + 1}:E${specStart + 1}`,
    `A${specStart + 2}:B${specStart + 2}`, `C${specStart + 2}:E${specStart + 2}`,
    `A${specStart + 3}:B${specStart + 3}`, `C${specStart + 3}:E${specStart + 3}`,
    `A${specStart + 4}:B${specStart + 4}`, `C${specStart + 4}:E${specStart + 4}`,
    `A${specStart + 6}:E${specStart + 6}`,
    `A${approvalHeader}:B${approvalHeader}`, `C${approvalHeader}:D${approvalHeader}`,
    `A${approvalBody}:B${approvalBody}`, `C${approvalBody}:D${approvalBody}`,
  ];

  const skillRows: XRow[] = [
    { height: 34, cells: fill(1, 6, "ตารางประเมินทักษะและความสามารถตามตำแหน่งงาน (SKILL MATRIX)") },
    { cells: [] },
    { height: 24, cells: [
      { style: 3, value: "ตำแหน่งงาน (Job Title):" }, { style: 4, value: model.jobTitle }, { style: 4 },
      { style: 3, value: "ชื่อพนักงาน:" }, { style: 4, value: model.employeeName }, { style: 4 },
    ] },
    { cells: [] },
    { height: 24, cells: fill(2, 6, "เกณฑ์ระดับความชำนาญ (Proficiency Level Criteria)") },
    { height: 22, cells: [{ style: 3, value: "Level 1 (Basic)" }, { style: 4, value: "มีความรู้พื้นฐาน เข้าใจขั้นตอนการทำงาน สามารถปฏิบัติงานได้ภายใต้การแนะนำดูแล" }, { style: 4 }, { style: 4 }, { style: 4 }, { style: 4 }] },
    { height: 22, cells: [{ style: 3, value: "Level 2 (Intermediate)" }, { style: 4, value: "ปฏิบัติงานได้ด้วยตนเองตามมาตรฐาน แก้ไขปัญหาเฉพาะหน้าทั่วไปได้ถูกต้อง" }, { style: 4 }, { style: 4 }, { style: 4 }, { style: 4 }] },
    { height: 22, cells: [{ style: 3, value: "Level 3 (Advanced)" }, { style: 4, value: "เชี่ยวชาญ วิเคราะห์และปรับปรุงกระบวนการทำงานได้ แก้ปัญหาซับซ้อนและสอนงานผู้อื่นได้" }, { style: 4 }, { style: 4 }, { style: 4 }, { style: 4 }] },
    { height: 22, cells: [{ style: 3, value: "Level 4 (Expert)" }, { style: 4, value: "วางระบบ กำหนดกลยุทธ์ และสร้างมาตรฐานใหม่ให้แก่องค์กรได้" }, { style: 4 }, { style: 4 }, { style: 4 }, { style: 4 }] },
    { cells: [] },
    { height: 32, cells: [
      { style: 7, value: "หมวดหมู่ทักษะ\n(Skill Category)" },
      { style: 7, value: "รายชื่อทักษะ / สมรรถนะ (Skill / Competency)" },
      { style: 7, value: "ระดับคาดหวัง\n(Expected)" },
      { style: 7, value: "ระดับประเมินจริง\n(Actual)" },
      { style: 7, value: "ส่วนต่าง\n(Gap)" },
      { style: 7, value: "วิธีการประเมิน / แนวทางพัฒนา (IDP)" },
    ] },
  ];
  const firstSkillRow = skillRows.length + 1;
  model.skills.forEach((row, index) => {
    const alt = zebra(index);
    const level = (value: number | null) => ({ style: alt ? 9 : 8, ...(value === null ? {} : { value }) });
    skillRows.push({
      height: textHeight([row.skill, row.idp, row.category].sort((a, b) => b.length - a.length)[0] || "", 40, 48),
      cells: [
        { style: alt ? 12 : 11, value: row.category },
        { style: alt ? 10 : 4, value: row.skill },
        level(row.expected),
        level(row.actual),
        level(row.gap),
        { style: alt ? 10 : 4, value: row.idp },
      ],
    });
  });
  const lastSkillRow = Math.max(firstSkillRow, skillRows.length);
  const averageRow = skillRows.length + 1;
  skillRows.push({
    height: 26,
    cells: [
      { style: 13, value: "คะแนนเฉลี่ยรวม (Average Skill Score)" }, { style: 13 },
      model.skills.length
        ? { style: 14, value: model.averageExpected ?? 0, formula: `AVERAGE(C${firstSkillRow}:C${lastSkillRow})` }
        : { style: 15 },
      { style: 15 }, { style: 15 },
      { style: 5, value: "ค่าติดลบ (-) หมายถึงทักษะที่ควรได้รับการพัฒนาเพิ่มเติม" },
    ],
  });
  const skillMerges = [
    "A1:F1", "B3:C3", "E3:F3", "A5:F5", "B6:F6", "B7:F7", "B8:F8", "B9:F9",
    `A${averageRow}:B${averageRow}`,
  ];

  return {
    jd: worksheetXml("FF1B365D", [8, 44, 34, 26, 32], jdRows, jdMerges),
    skill: worksheetXml("FF2C5282", [24, 46, 16, 16, 12, 36], skillRows, skillMerges),
  };
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const buildJobDescriptionXlsxBytes = async (input: JobDescriptionExportInput): Promise<{ bytes: Uint8Array; filename: string }> => {
  const model = buildJobDescriptionExportModel(input);
  const sheets = buildWorkbookSheets(model);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CMG HR Database</Application></Properties>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(model.fileBase)}</dc:title></cp:coreProperties>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="1_JD_and_Job_Matrix" sheetId="1" r:id="rId1"/>
<sheet name="2_Skill_Matrix" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file("xl/styles.xml", STYLES_XML);
  zip.file("xl/worksheets/sheet1.xml", sheets.jd);
  zip.file("xl/worksheets/sheet2.xml", sheets.skill);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return { bytes, filename: `${model.fileBase}.xlsx` };
};

export const downloadJobDescriptionXlsx = async (input: JobDescriptionExportInput): Promise<void> => {
  const { bytes, filename } = await buildJobDescriptionXlsxBytes(input);
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), filename);
};

const PAGE_W = 1123;
const PAGE_H = 794;

const css = {
  title: "background:#1B365D;color:#fff;font-weight:700;font-size:16px;text-align:center;padding:10px 8px;line-height:1.35;",
  section: "background:#EBF3FA;color:#1B365D;font-weight:700;font-size:12px;padding:6px 8px;border:1px solid #CBD5E0;border-left:3px solid #1B365D;line-height:1.35;",
  label: "background:#EDF2F7;color:#1A202C;font-weight:700;font-size:11px;padding:6px 8px;border:1px solid #CBD5E0;line-height:1.35;",
  value: "background:#fff;color:#1A202C;font-size:11px;padding:6px 8px;border:1px solid #CBD5E0;line-height:1.35;",
  note: "background:#F7FAFC;color:#4A5568;font-style:italic;font-size:10px;padding:6px 8px;border:1px solid #CBD5E0;line-height:1.35;",
  legend: "color:#4A5568;font-style:italic;font-size:10px;padding:6px 2px 8px;line-height:1.4;",
  header: "background:#2C5282;color:#fff;font-weight:700;font-size:11px;text-align:center;padding:6px 6px;border:1px solid #CBD5E0;line-height:1.3;",
  center: "text-align:center;color:#1B365D;font-weight:700;",
  alt: "background:#F7FAFC;",
  averageLabel: "background:#EBF3FA;color:#1B365D;font-weight:700;font-size:11px;text-align:right;padding:6px 8px;border:1px solid #CBD5E0;",
  averageValue: "background:#EBF3FA;color:#1B365D;font-weight:700;font-size:11px;text-align:center;padding:6px 8px;border:1px solid #CBD5E0;",
};

const addRow = (parent: HTMLElement, columns: string, cells: { text: string; style: string; span?: number }[], sheetStart = false) => {
  const row = document.createElement("div");
  row.style.cssText = `display:grid;grid-template-columns:${columns};align-items:stretch;`;
  if (sheetStart) row.dataset.sheetStart = "1";
  cells.forEach((cell) => {
    const node = document.createElement("div");
    node.style.cssText = `${cell.style}white-space:pre-wrap;overflow-wrap:break-word;min-width:0;`;
    if (cell.span) node.style.gridColumn = `span ${cell.span}`;
    node.textContent = cell.text;
    row.appendChild(node);
  });
  parent.appendChild(row);
};

const renderBlocks = (model: ExportModel): HTMLElement => {
  const host = document.createElement("div");
  host.style.cssText = `width:${PAGE_W - 52}px;font-family:Tahoma,"Sarabun",sans-serif;color:#1A202C;background:#fff;`;
  const jd = "minmax(0,8fr) minmax(0,44fr) minmax(0,34fr) minmax(0,26fr) minmax(0,32fr)";
  const skill = "minmax(0,24fr) minmax(0,46fr) minmax(0,16fr) minmax(0,16fr) minmax(0,12fr) minmax(0,36fr)";
  const gap = () => {
    const node = document.createElement("div");
    node.style.height = "10px";
    host.appendChild(node);
  };
  addRow(host, jd, [{ text: "คำบรรยายลักษณะงาน (JOB DESCRIPTION) และตารางกำหนดบทบาทหน้าที่ (JOB MATRIX)", style: css.title, span: 5 }], true);
  gap();
  addRow(host, jd, [{ text: "ส่วนที่ 1: ข้อมูลทั่วไปของตำแหน่งงาน (Job Identification)", style: css.section, span: 5 }]);
  addRow(host, jd, [
    { text: "ชื่อตำแหน่ง (Job Title):", style: css.label, span: 2 }, { text: model.jobTitle, style: css.value },
    { text: "รหัสตำแหน่ง (Job Code):", style: css.label }, { text: model.jobCode, style: css.value },
  ]);
  addRow(host, jd, [
    { text: "แผนก/ฝ่าย (Department):", style: css.label, span: 2 }, { text: model.department, style: css.value },
    { text: "ระดับตำแหน่ง (Job Level):", style: css.label }, { text: model.jobLevel, style: css.value },
  ]);
  addRow(host, jd, [
    { text: "รายงานตรงต่อ (Reports To):", style: css.label, span: 2 }, { text: model.reportsTo, style: css.value },
    { text: "วันที่จัดทำ/ทบทวน:", style: css.label }, { text: model.preparedDate, style: css.value },
  ]);
  addRow(host, jd, [
    { text: "วัตถุประสงค์หลักของตำแหน่ง (Job Purpose):", style: css.label, span: 2 },
    { text: model.jobPurpose, style: css.value, span: 3 },
  ]);
  addRow(host, jd, [
    { text: "ขอบเขตความรับผิดชอบ (Scope Note):", style: css.label, span: 2 },
    { text: model.scopeNote, style: css.note, span: 3 },
  ]);
  gap();
  addRow(host, jd, [{ text: "ส่วนที่ 2: หน้าที่ความรับผิดชอบหลักและ Job Matrix (RACI)", style: css.section, span: 5 }]);
  addRow(host, jd, [{ text: "คำอธิบาย RACI:  R = Responsible (ผู้ปฏิบัติงานหลัก)  |  A = Accountable (ผู้อนุมัติ/รับผิดชอบสูงสุด)  |  C = Consulted (ผู้ให้คำปรึกษา/ตรวจสอบ)  |  I = Informed (ผู้รับทราบผล)", style: css.legend, span: 5 }]);
  addRow(host, jd, [
    { text: "ลำดับ", style: css.header },
    { text: "หน้าที่ความรับผิดชอบหลัก (Key Responsibilities)", style: css.header },
    { text: "ตัวชี้วัดความสำเร็จ (KPIs)", style: css.header },
    { text: "บทบาท\n(RACI)", style: css.header },
    { text: "ผู้เกี่ยวข้องร่วม (ในทีม / ต่างแผนก)", style: css.header },
  ]);
  model.responsibilities.forEach((row, index) => {
    const alt = index % 2 === 1 ? css.alt : "";
    addRow(host, jd, [
      { text: String(index + 1), style: `${css.value}${css.center}${alt}` },
      { text: row.task, style: `${css.value}${alt}` },
      { text: row.kpi, style: `${css.value}${alt}` },
      { text: row.raci, style: `${css.value}${css.center}${alt}` },
      { text: row.stakeholders, style: `${css.value}${alt}` },
    ]);
  });
  gap();
  addRow(host, jd, [{ text: "ส่วนที่ 3: คุณสมบัติพื้นฐานของผู้ดำรงตำแหน่ง (Job Specification)", style: css.section, span: 5 }]);
  addRow(host, jd, [{ text: "วุฒิการศึกษา (Education):", style: css.label, span: 2 }, { text: model.education, style: css.value, span: 3 }]);
  addRow(host, jd, [{ text: "ประสบการณ์ทำงาน (Experience):", style: css.label, span: 2 }, { text: model.experience, style: css.value, span: 3 }]);
  addRow(host, jd, [{ text: "ความรู้และทักษะเฉพาะทาง:", style: css.label, span: 2 }, { text: model.knowledgeSkills, style: css.value, span: 3 }]);
  addRow(host, jd, [{ text: "คุณสมบัติเพิ่มเติม (ถ้ามี):", style: css.label, span: 2 }, { text: model.additionalQualifications, style: css.value, span: 3 }]);
  gap();
  addRow(host, jd, [{ text: "ส่วนที่ 4: การอนุมัติและลงนามรับทราบ (Approval & Acknowledgment)", style: css.section, span: 5 }]);
  addRow(host, "1fr 1fr 1fr", [
    { text: "ผู้จัดทำ (หัวหน้าแผนก / HR)", style: css.header },
    { text: "ผู้อนุมัติ (ผู้จัดการฝ่าย / ผู้บริหาร)", style: css.header },
    { text: "ผู้รับทราบ (ผู้ดำรงตำแหน่ง)", style: css.header },
  ]);
  addRow(host, "1fr 1fr 1fr", [
    { text: signatureBlock(model.preparerName), style: `${css.value}min-height:72px;` },
    { text: signatureBlock(model.approverName), style: `${css.value}min-height:72px;` },
    { text: signatureBlock(model.acknowledgedName), style: `${css.value}min-height:72px;` },
  ]);

  addRow(host, skill, [{ text: "ตารางประเมินทักษะและความสามารถตามตำแหน่งงาน (SKILL MATRIX)", style: css.title, span: 6 }], true);
  gap();
  addRow(host, skill, [
    { text: "ตำแหน่งงาน (Job Title):", style: css.label }, { text: model.jobTitle, style: css.value, span: 2 },
    { text: "ชื่อพนักงาน:", style: css.label }, { text: model.employeeName, style: css.value, span: 2 },
  ]);
  gap();
  addRow(host, skill, [{ text: "เกณฑ์ระดับความชำนาญ (Proficiency Level Criteria)", style: css.section, span: 6 }]);
  [
    ["Level 1 (Basic)", "มีความรู้พื้นฐาน เข้าใจขั้นตอนการทำงาน สามารถปฏิบัติงานได้ภายใต้การแนะนำดูแล"],
    ["Level 2 (Intermediate)", "ปฏิบัติงานได้ด้วยตนเองตามมาตรฐาน แก้ไขปัญหาเฉพาะหน้าทั่วไปได้ถูกต้อง"],
    ["Level 3 (Advanced)", "เชี่ยวชาญ วิเคราะห์และปรับปรุงกระบวนการทำงานได้ แก้ปัญหาซับซ้อนและสอนงานผู้อื่นได้"],
    ["Level 4 (Expert)", "วางระบบ กำหนดกลยุทธ์ และสร้างมาตรฐานใหม่ให้แก่องค์กรได้"],
  ].forEach(([label, detail]) => {
    addRow(host, skill, [{ text: label, style: css.label }, { text: detail, style: css.value, span: 5 }]);
  });
  gap();
  addRow(host, skill, [
    { text: "หมวดหมู่ทักษะ\n(Skill Category)", style: css.header },
    { text: "รายชื่อทักษะ / สมรรถนะ (Skill / Competency)", style: css.header },
    { text: "ระดับคาดหวัง\n(Expected)", style: css.header },
    { text: "ระดับประเมินจริง\n(Actual)", style: css.header },
    { text: "ส่วนต่าง\n(Gap)", style: css.header },
    { text: "วิธีการประเมิน / แนวทางพัฒนา (IDP)", style: css.header },
  ]);
  model.skills.forEach((row, index) => {
    const alt = index % 2 === 1 ? css.alt : "";
    const level = (value: number | null) => (value === null ? "" : String(value));
    addRow(host, skill, [
      { text: row.category, style: `${css.value}font-weight:700;${alt}` },
      { text: row.skill, style: `${css.value}${alt}` },
      { text: level(row.expected), style: `${css.value}${css.center}${alt}` },
      { text: level(row.actual), style: `${css.value}${css.center}${alt}` },
      { text: level(row.gap), style: `${css.value}${css.center}${alt}` },
      { text: row.idp, style: `${css.value}${alt}` },
    ]);
  });
  addRow(host, skill, [
    { text: "คะแนนเฉลี่ยรวม (Average Skill Score)", style: css.averageLabel, span: 2 },
    { text: model.averageExpected === null ? "" : model.averageExpected.toFixed(2), style: css.averageValue },
    { text: "", style: css.averageValue },
    { text: "", style: css.averageValue },
    { text: "ค่าติดลบ (-) หมายถึงทักษะที่ควรได้รับการพัฒนาเพิ่มเติม", style: css.note },
  ]);
  return host;
};

export const downloadJobDescriptionPdf = async (input: JobDescriptionExportInput): Promise<void> => {
  const model = buildJobDescriptionExportModel(input);
  const measure = renderBlocks(model);
  const sandbox = document.createElement("div");
  sandbox.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W - 52}px;background:#fff;`;
  sandbox.appendChild(measure);
  document.body.appendChild(sandbox);

  const contentHeight = PAGE_H - 58;
  const pages: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  let used = 0;
  Array.from(measure.children).forEach((node) => {
    const block = node as HTMLElement;
    const height = block.offsetHeight;
    const startsSheet = block.dataset.sheetStart === "1";
    if ((startsSheet && current.length) || (current.length && used + height > contentHeight)) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += height;
  });
  if (current.length) pages.push(current);

  const pageNodes = pages.map((blocks, index) => {
    const page = document.createElement("div");
    page.style.cssText = `width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:22px 26px 34px;background:#fff;position:relative;font-family:Tahoma,"Sarabun",sans-serif;`;
    const content = document.createElement("div");
    blocks.forEach((block) => content.appendChild(block));
    const footer = document.createElement("div");
    footer.style.cssText = "position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:11px;color:#4A5568;";
    footer.textContent = `CMG Engineering & Construction  ·  หน้า ${index + 1} / ${pages.length}`;
    page.appendChild(content);
    page.appendChild(footer);
    return page;
  });
  sandbox.innerHTML = "";
  pageNodes.forEach((page) => sandbox.appendChild(page));

  try {
    const pdf = await PDFDocument.create();
    for (const pageNode of pageNodes) {
      const canvas = await html2canvas(pageNode, { backgroundColor: "#ffffff", scale: 2, logging: false });
      const png = await pdf.embedPng(canvas.toDataURL("image/png"));
      const page = pdf.addPage([841.89, 595.28]);
      page.drawImage(png, { x: 0, y: 0, width: 841.89, height: 595.28 });
    }
    const bytes = await pdf.save();
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${model.fileBase}.pdf`);
  } finally {
    sandbox.remove();
  }
};
