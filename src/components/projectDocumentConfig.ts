// ---------------------------------------------------------------------------
// เอกสารที่จำเป็นต่อโครงการ (Project-specific required documents)
//
// แต่ละโครงการกำหนดรายการประเภทเอกสาร (อ้างอิง documentTypeCatalog) ที่ "ควรมี"
// ก่อนส่งพนักงานเข้าอบรม/เข้าไซต์งาน โดยเลือกได้ว่าบังคับใช้กับใคร (ทุกคน /
// เฉพาะคนไทย / เฉพาะแรงงานต่างด้าว) เก็บไว้ใน field `required_documents`
// ของเอกสารโครงการ (CMG-HR-Database/root/projects/{id})
//
// การตรวจสอบนี้เป็นแบบ "แจ้งเตือนเท่านั้น" (warn only) — ไม่บล็อกการเลือกพนักงาน
// เข้ารอบอบรม ให้ HR/Safety เป็นผู้ตัดสินใจเองหน้างาน
// ---------------------------------------------------------------------------

export type ProjectDocumentAppliesTo = "all" | "thai" | "migrant";

export const PROJECT_DOCUMENT_APPLIES_TO_OPTIONS: Array<{ value: ProjectDocumentAppliesTo; label: string }> = [
  { value: "all", label: "ทุกคน" },
  { value: "thai", label: "เฉพาะคนไทย" },
  { value: "migrant", label: "เฉพาะแรงงานต่างด้าว" },
];

export interface ProjectDocumentRequirement {
  docType: string; // ตรงกับ value ใน documentTypeCatalog
  label: string; // snapshot ชื่อไว้แสดงผล เผื่อ catalog เปลี่ยนชื่อภายหลัง
  appliesTo: ProjectDocumentAppliesTo;
  /** ไฟล์แบบฟอร์มเปล่า (template) ที่เป็นของโครงการนี้โดยเฉพาะ — ถ้าไม่มี ให้ใช้ default ของบริษัทแทน (ดู documentTypeCatalog.defaultTemplates) */
  templateUrl?: string;
  templateFileName?: string;
  templateUploadedAt?: number;
}

export const PROJECT_REQUIRED_DOCUMENTS_FIELD = "required_documents";

export const normalizeProjectDocumentRequirements = (value: unknown): ProjectDocumentRequirement[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ProjectDocumentRequirement | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const docType = String(source.docType || "").trim();
      const label = String(source.label || "").trim();
      const appliesToRaw = String(source.appliesTo || "all");
      const appliesTo: ProjectDocumentAppliesTo =
        appliesToRaw === "thai" || appliesToRaw === "migrant" ? appliesToRaw : "all";
      if (!docType) return null;
      const templateUrl = String(source.templateUrl || "").trim();
      const templateFileName = String(source.templateFileName || "").trim();
      const templateUploadedAt = Number(source.templateUploadedAt || 0);
      return {
        docType,
        label: label || docType,
        appliesTo,
        ...(templateUrl ? { templateUrl, templateFileName, templateUploadedAt } : {}),
      };
    })
    .filter((row): row is ProjectDocumentRequirement => row !== null);
};

/**
 * หาแบบฟอร์ม (template) ที่ควรใช้จริงของเอกสารนี้: ใช้ของโครงการเองถ้ามี ไม่งั้น fallback ไป
 * ใช้ default ของบริษัท (ตั้งค่าได้ที่หน้าเอกสารที่จำเป็นของโครงการ เช่นกัน)
 */
export const resolveDocumentTemplate = (
  requirement: Pick<ProjectDocumentRequirement, "docType" | "templateUrl" | "templateFileName">,
  defaultTemplates: Record<string, { url: string; fileName: string }>
): { url: string; fileName: string; source: "project" | "default" } | null => {
  if (requirement.templateUrl) {
    return {
      url: requirement.templateUrl,
      fileName: requirement.templateFileName || "แบบฟอร์มของโครงการนี้",
      source: "project",
    };
  }
  const fallback = defaultTemplates[requirement.docType];
  if (fallback) {
    return { url: fallback.url, fileName: fallback.fileName, source: "default" };
  }
  return null;
};

/** กรองเฉพาะรายการที่บังคับใช้กับพนักงานคนนี้ (ตามสัญชาติ) */
export const getApplicableRequirements = (
  requirements: ProjectDocumentRequirement[],
  isMigrant: boolean
): ProjectDocumentRequirement[] =>
  requirements.filter((req) => req.appliesTo === "all" || (isMigrant ? req.appliesTo === "migrant" : req.appliesTo === "thai"));

export interface DocumentCompletenessResult {
  complete: boolean;
  missing: ProjectDocumentRequirement[];
}

/** ตรวจว่าพนักงานมีเอกสารตามที่โครงการกำหนดครบหรือไม่ (เทียบ attachments[].docType) */
export const checkProjectDocumentCompleteness = (
  attachments: Array<{ docType?: string }> | undefined,
  requirements: ProjectDocumentRequirement[],
  isMigrant: boolean
): DocumentCompletenessResult => {
  const applicable = getApplicableRequirements(requirements, isMigrant);
  if (applicable.length === 0) {
    // ไม่มีการตั้งค่าเอกสารบังคับของโครงการนี้ — ใช้กติกาเดิม (มีไฟล์แนบอย่างน้อย 1 ไฟล์)
    return { complete: (attachments || []).length > 0, missing: [] };
  }
  const haveTypes = new Set((attachments || []).map((a) => String(a?.docType || "").trim()));
  const missing = applicable.filter((req) => !haveTypes.has(req.docType));
  return { complete: missing.length === 0, missing };
};

/**
 * สร้างรหัสโครงการแบบย่อ (legacy) จาก project_no เช่น "PRJ-2026-J-074" -> "J74"
 * ใช้จับคู่กับข้อมูลพนักงานเก่าที่กรอกโครงการเป็นรหัสสั้นแบบนี้ไว้ (เช่น J74, J02B, J61)
 * กติกา: ตัดเลข 0 นำหน้าออก 1 ตัว เฉพาะกรณีเป็นเลขล้วน 3 หลัก (เช่น "074" -> "74")
 * ถ้ามีตัวอักษรต่อท้ายหรือเป็นเลข 2 หลักอยู่แล้ว จะคงรูปเดิมไว้ (เช่น "02B" -> "02B", "061" -> "61")
 */
const buildLegacyProjectCode = (projectNo: string): string | null => {
  const match = projectNo.match(/J-?(\d+[A-Za-z]*)\s*$/i);
  if (!match) return null;
  const captured = match[1];
  const digitLetterMatch = captured.match(/^(\d+)([A-Za-z]*)$/);
  if (!digitLetterMatch) return null;
  let [, digits, letters] = digitLetterMatch;
  if (digits.length === 3 && digits[0] === "0") digits = digits.slice(1);
  return `J${digits}${letters}`;
};

/** รวม project_no / project_name ของโครงการให้ match กับค่าที่เก็บใน batch.project ("J-001 - ชื่อโครงการ") */
export const buildProjectDisplayKeys = (data: { project_no?: unknown; project_name?: unknown }): string[] => {
  const projectNo = String(data.project_no || "").trim();
  const projectName = String(data.project_name || "").trim();
  const keys = new Set<string>();
  if (projectNo && projectName) keys.add(`${projectNo} - ${projectName}`);
  if (projectNo) keys.add(projectNo);
  if (projectNo) {
    const legacyCode = buildLegacyProjectCode(projectNo);
    if (legacyCode) keys.add(legacyCode);
  }
  return Array.from(keys);
};

/**
 * สร้างกลุ่มชื่อเรียกโครงการ (alias) จากรายการโครงการทั้งหมด เพื่อใช้จับคู่ชื่อโครงการที่เก็บต่างรูปแบบกัน
 * เช่น พนักงานบางคนกรอก "J74" (รหัสสั้นแบบเก่า) แต่ batch/link ใช้ "PRJ-2026-J-074 - Building GMTP"
 */
export const buildProjectAliasGroups = (
  projectsList: Array<{ project_no?: unknown; project_name?: unknown }>
): string[][] => {
  return projectsList.map((p) => buildProjectDisplayKeys(p)).filter((keys) => keys.length > 1);
};

/** เทียบว่าชื่อโครงการ 2 ค่าหมายถึงโครงการเดียวกันหรือไม่ (ตรงกันตรงๆ หรืออยู่ในกลุ่ม alias เดียวกัน) */
export const isSameProjectName = (
  nameA: string | undefined | null,
  nameB: string | undefined | null,
  aliasGroups: string[][]
): boolean => {
  const a = String(nameA || "").trim();
  const b = String(nameB || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return aliasGroups.some((group) => group.includes(a) && group.includes(b));
};
