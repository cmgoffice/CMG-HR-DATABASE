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

/**
 * วิธีที่เอกสารรายการนี้จะ "ครบ" ได้:
 * - "employee_upload" (ค่าเริ่มต้น): พนักงาน/HR ต้องสแกน/ถ่ายรูปเอกสารจริงแล้วอัปโหลดเข้าระบบ
 * - "generated_by_system": เป็นแค่แบบฟอร์มเปล่า (template) ที่ระบบ/HR กรอก-สร้างให้เองตอนจบขั้นตอน
 *   (เช่น "ใบคำร้องขอมีบัตรผ่านบุคคล" ที่สร้างจากปุ่ม "ใบขอออกบัตร" ในหน้ารอบอบรม) — ไม่ต้องรอพนักงานอัปโหลด
 *   และไม่นับเป็น "เอกสารขาด" ในการแจ้งเตือน
 */
export type ProjectDocumentFulfillmentType = "employee_upload" | "generated_by_system";

export interface ProjectDocumentRequirement {
  docType: string; // ตรงกับ value ใน documentTypeCatalog
  label: string; // snapshot ชื่อไว้แสดงผล เผื่อ catalog เปลี่ยนชื่อภายหลัง
  appliesTo: ProjectDocumentAppliesTo;
  /** ไฟล์แบบฟอร์มเปล่า (template) ที่เป็นของโครงการนี้โดยเฉพาะ — ถ้าไม่มี ให้ใช้ default ของบริษัทแทน (ดู documentTypeCatalog.defaultTemplates) */
  templateUrl?: string;
  templateFileName?: string;
  templateUploadedAt?: number;
  /** ดูคำอธิบาย ProjectDocumentFulfillmentType — ไม่ระบุ = ถือเป็น "employee_upload" (ของเดิม) */
  fulfillmentType?: ProjectDocumentFulfillmentType;
  /**
   * รายการที่มี altGroupId เดียวกัน = เป็น "ทางเลือก" ของกันและกัน (เลือกอย่างใดอย่างหนึ่งก็พอ ไม่ต้องมีครบทุกข้อ)
   * เช่น "ประกันสังคม ม.33/ม.40" หรือ "ประกันอุบัติเหตุ (กรณีไม่มีประกันสังคม)" หรือ "ประกันกลุ่ม (กรณีไม่มีประกันสังคม)"
   * มีไฟล์แนบของข้อใดข้อหนึ่งในกลุ่มนี้ก็ถือว่า "ครบ" ทั้งกลุ่มแล้ว ไม่ถูกนับเป็นเอกสารขาดอีก 2 รายการที่เหลือ
   */
  altGroupId?: string;
}

export const PROJECT_REQUIRED_DOCUMENTS_FIELD = "required_documents";

/**
 * true = CMG เป็นคนออกบัตรผ่านเข้าโครงการนี้เอง (เรื่องการ "ทำบัตรจริง" เท่านั้น — ไม่เกี่ยวกับปุ่ม
 * "ใบขอออกบัตร"/accessBadgeRequestPdf.ts ซึ่งเป็นแค่เอกสารขอที่ใช้ได้ทุกโครงการไม่ว่าใครเป็นคนออกบัตรจริง)
 * false/ไม่ระบุ = โครงการ/ผู้ว่าจ้างเป็นคนทำบัตรให้เอง หลังอบรมผ่านแล้วรอรับบัตรจริงกลับมา ให้ Safety/Admin
 * แนบรูปบัตร/กรอกเลขบัตรรายคนเพื่อปิดรอบอบรมนั้น ๆ แทน (ดู TrainingBatchPage.tsx)
 */
export const PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD = "issues_own_access_badge";

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
      const fulfillmentType: ProjectDocumentFulfillmentType =
        source.fulfillmentType === "generated_by_system" ? "generated_by_system" : "employee_upload";
      const altGroupId = String(source.altGroupId || "").trim();
      return {
        docType,
        label: label || docType,
        appliesTo,
        fulfillmentType,
        ...(altGroupId ? { altGroupId } : {}),
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

/**
 * "หน่วย" เอกสาร 1 รายการที่ใช้ตรวจความครบ — ปกติคือรายการเดี่ยว ๆ (options มี 1 ตัว)
 * แต่ถ้าเป็นกลุ่มทางเลือก (altGroupId เดียวกัน) จะรวมเป็นหน่วยเดียว options มีหลายตัว
 * ให้เลือก "อย่างใดอย่างหนึ่ง" ในนั้นก็ถือว่าครบทั้งหน่วย — ไม่นับว่าขาดอีก options ที่เหลือ
 */
export interface RequirementUnit {
  key: string; // altGroupId หรือ docType (ถ้าเป็นรายการเดี่ยว)
  label: string; // ชื่อเดี่ยว หรือรวมชื่อทุกทางเลือกด้วย " หรือ " ถ้าเป็นกลุ่ม
  options: ProjectDocumentRequirement[];
}

/** รวมรายการที่มี altGroupId เดียวกันเข้าเป็นหน่วยเดียว ส่วนรายการเดี่ยว ๆ ก็เป็นหน่วยของตัวเอง */
export const groupRequirements = (requirements: ProjectDocumentRequirement[]): RequirementUnit[] => {
  const groups = new Map<string, ProjectDocumentRequirement[]>();
  const units: RequirementUnit[] = [];
  requirements.forEach((req) => {
    if (req.altGroupId) {
      const arr = groups.get(req.altGroupId) || [];
      arr.push(req);
      groups.set(req.altGroupId, arr);
    } else {
      units.push({ key: req.docType, label: req.label, options: [req] });
    }
  });
  groups.forEach((options, groupId) => {
    units.push({ key: groupId, label: options.map((o) => o.label).join(" หรือ "), options });
  });
  return units;
};

export interface DocumentCompletenessResult {
  complete: boolean;
  missing: RequirementUnit[];
}

/** ตรวจว่าพนักงานมีเอกสารตามที่โครงการกำหนดครบหรือไม่ (เทียบ attachments[].docType)
 * กลุ่มทางเลือก (altGroupId เดียวกัน) ถือว่าครบถ้ามีไฟล์ของข้อใดข้อหนึ่งในกลุ่มนั้น */
export const checkProjectDocumentCompleteness = (
  attachments: Array<{ docType?: string }> | undefined,
  requirements: ProjectDocumentRequirement[],
  isMigrant: boolean
): DocumentCompletenessResult => {
  if (requirements.length === 0) {
    // ไม่มีการตั้งค่าเอกสารบังคับของโครงการนี้เลย — ใช้กติกาเดิม (มีไฟล์แนบอย่างน้อย 1 ไฟล์)
    return { complete: (attachments || []).length > 0, missing: [] };
  }
  // รายการแบบ "generated_by_system" (เช่น ใบคำร้องขอมีบัตรผ่านบุคคล ที่สร้างจากระบบตอนจบ ไม่ใช่เอกสารที่
  // พนักงานต้องอัปโหลด) ไม่ถูกนับเป็น "เอกสารขาด" — ตัดออกจากการตรวจความครบ
  const applicable = getApplicableRequirements(requirements, isMigrant).filter(
    (req) => req.fulfillmentType !== "generated_by_system"
  );
  if (applicable.length === 0) {
    // ทุกรายการที่บังคับใช้กับคนนี้เป็นแบบ generated_by_system (หรือไม่มีรายการที่บังคับใช้กับคนนี้เลย) — ถือว่าครบ
    return { complete: true, missing: [] };
  }
  const haveTypes = new Set((attachments || []).map((a) => String(a?.docType || "").trim()));
  const units = groupRequirements(applicable);
  const missing = units.filter((unit) => !unit.options.some((opt) => haveTypes.has(opt.docType)));
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
