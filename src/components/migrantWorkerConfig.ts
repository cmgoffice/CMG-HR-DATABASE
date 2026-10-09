import { UserRole } from "../auth/AuthContext";

// ---------------------------------------------------------------------------
// ระบบจัดการแรงงานต่างด้าว (Migrant Worker Documents)
//
// หลักการสำคัญ: เอกสาร 1 ประเภท แยกเป็น 2 ส่วนเสมอ
//   1) "ข้อมูล" (เลขเอกสาร + วันหมดอายุ) -> เก็บที่ employee_data/{id}.migrant_documents[docType]
//   2) "ไฟล์สแกน" (ไฟล์แนบจริง) -> เก็บแยกใน collection MIGRANT_DOCUMENT_FILES_COLLECTION
//      อ้างอิงกลับไปที่ employeeId + docType เท่านั้น (ไม่ผูกกับ record ข้อมูล)
//
// ข้อมูลคนยังคงอยู่ใน employee_data เดิม (เชื่อมกับระบบเก่า/ทะเบียนพนักงานเดิมโดยตรง
// ไม่ได้แยกฐานข้อมูลคนใหม่) — โมดูลนี้เป็นเพียง "มุมมอง + ฟิลด์เพิ่ม" บนข้อมูลเดิม
// ---------------------------------------------------------------------------

export type MigrantDocumentTypeKey = "passport" | "work_permit" | "permit_card" | "ci_book" | "visa" | "border_pass";

// ระดับความสำคัญของเอกสาร ใช้กำหนดว่าจะนับเป็น "เอกสารไม่ครบ" หรือไม่:
//   - critical: ต้องมีอย่างน้อย 1 รายการในกลุ่มเดียวกัน (ดู MIGRANT_DOCUMENT_GROUPS) ไม่งั้นถือว่า "ยังทำงานไม่ได้"
//   - recommended: ควรมีอย่างน้อย 1 รายการในกลุ่มเดียวกัน แต่ไม่บังคับทุกโครงการ (เตือนแบบเบากว่า)
//   - supplementary: เก็บไว้เพื่อข้อมูล + แจ้งเตือนวันหมดอายุเท่านั้น ไม่นับว่า "ไม่ครบ" หากไม่มี
export type MigrantDocumentTier = "critical" | "recommended" | "supplementary";

export interface MigrantDocumentTypeDef {
  key: MigrantDocumentTypeKey;
  label: string;
  shortLabel: string;
  tier: MigrantDocumentTier;
  groupKey?: string; // เอกสารที่อยู่กลุ่มเดียวกัน นับแค่ "มีอย่างน้อย 1 อย่าง" ก็พอ
  hasQrCode?: boolean; // true เฉพาะ Permit Card — มีช่องแนบ QR Code เพิ่มเติมจากไฟล์เอกสารหลัก
}

export const MIGRANT_DOCUMENT_TYPES: MigrantDocumentTypeDef[] = [
  { key: "work_permit", label: "ใบอนุญาตทำงาน (Work Permit)", shortLabel: "Work Permit", tier: "critical", groupKey: "work_authorization" },
  { key: "permit_card", label: "บัตรอนุญาตทำงาน (Permit Card)", shortLabel: "Permit Card", tier: "critical", groupKey: "work_authorization", hasQrCode: true },
  { key: "passport", label: "หนังสือเดินทาง (Passport)", shortLabel: "พาสปอร์ต", tier: "recommended", groupKey: "identity_document" },
  { key: "ci_book", label: "เล่มประจำตัวคนซึ่งไม่มีสัญชาติไทย (CI)", shortLabel: "เล่ม CI", tier: "recommended", groupKey: "identity_document" },
  { key: "visa", label: "วีซ่า (Visa)", shortLabel: "วีซ่า", tier: "supplementary" },
  { key: "border_pass", label: "บัตรผ่านแดน (Border Pass)", shortLabel: "Border Pass", tier: "supplementary" },
];

export const DOCUMENT_TIER_META: Record<MigrantDocumentTier, { label: string; badge: string }> = {
  critical: { label: "เอกสารสำคัญ (ต้องมี)", badge: "bg-red-50 text-red-600 border border-red-200" },
  recommended: { label: "แนะนำให้มี", badge: "bg-amber-50 text-amber-600 border border-amber-200" },
  supplementary: { label: "ข้อมูลเสริม", badge: "bg-slate-100 text-slate-500 border border-slate-200" },
};

// กลุ่มเอกสารที่ถือว่า "มี" แล้วเมื่อมีสมาชิกอย่างน้อย 1 รายการครบ (ข้อมูล+ไฟล์)
export interface MigrantDocumentGroupDef {
  key: string;
  label: string;
  tier: "critical" | "recommended";
  memberKeys: MigrantDocumentTypeKey[];
}

export const MIGRANT_DOCUMENT_GROUPS: MigrantDocumentGroupDef[] = [
  {
    key: "work_authorization",
    label: "ใบอนุญาตทำงาน / บัตรอนุญาตทำงาน",
    tier: "critical",
    memberKeys: ["work_permit", "permit_card"],
  },
  {
    key: "identity_document",
    label: "หนังสือเดินทาง / เล่ม CI",
    tier: "recommended",
    memberKeys: ["passport", "ci_book"],
  },
];

// pseudo-key สำหรับไฟล์แนบ "QR Code" ของ Permit Card โดยเฉพาะ — เก็บแยกจากไฟล์เอกสารหลัก
// ไม่นับเป็นเอกสาร 1 ประเภทใน MIGRANT_DOCUMENT_TYPES (ไม่มีเลขที่/วันหมดอายุของตัวเอง)
export const PERMIT_CARD_QR_FILE_KEY = "permit_card_qr" as const;
export type MigrantDocumentFileKey = MigrantDocumentTypeKey | typeof PERMIT_CARD_QR_FILE_KEY;

// Firestore: CMG-HR-Database/root/<collection>
export const MIGRANT_DOCUMENT_FILES_COLLECTION = "migrant_worker_files";
export const MIGRANT_DOCUMENT_HISTORY_COLLECTION = "migrant_worker_history";

// Field name added onto the existing employee_data document.
export const MIGRANT_DOCUMENTS_FIELD = "migrant_documents";

export interface MigrantDocumentEntry {
  docNumber?: string;
  expiryDate?: string; // ISO yyyy-mm-dd
}

export type MigrantDocumentsMap = Partial<Record<MigrantDocumentTypeKey, MigrantDocumentEntry>>;

export interface MigrantDocumentFileRecord {
  id: string;
  employeeId: string;
  docType: MigrantDocumentFileKey;
  fileName: string;
  fileUrl: string;
  uploadedBy?: string;
  uploadedAt?: number;
}

// ---------------------------------------------------------------------------
// ประกัน — เก็บเป็นข้อมูลทั่วไปของแรงงาน (ไม่มีไฟล์/วันหมดอายุผูกด้วยในเวอร์ชันนี้)
// เลือกได้หลายอย่างพร้อมกัน (เช่น มีทั้งประกันสังคม + ประกันกลุ่ม)
// ---------------------------------------------------------------------------
export type MigrantInsuranceType = "social_security" | "group_insurance" | "other";

export const MIGRANT_INSURANCE_OPTIONS: Array<{ key: MigrantInsuranceType; label: string }> = [
  { key: "social_security", label: "ประกันสังคม" },
  { key: "group_insurance", label: "ประกันกลุ่ม" },
  { key: "other", label: "ประกันอื่นๆ" },
];

export interface MigrantInsuranceInfo {
  types?: MigrantInsuranceType[];
  otherDetail?: string;
}

export const MIGRANT_INSURANCE_FIELD = "migrant_insurance";

// ---------------------------------------------------------------------------
// บริษัทนายจ้าง — CMG หรือระบุชื่ออื่น (กรณีจ้างผ่านผู้รับเหมา/บริษัทจัดหางานอื่น)
// ---------------------------------------------------------------------------
export type MigrantEmployerType = "CMG" | "other";

export const MIGRANT_EMPLOYER_OPTIONS: Array<{ value: MigrantEmployerType; label: string }> = [
  { value: "CMG", label: "CMG" },
  { value: "other", label: "อื่นๆ (ระบุ)" },
];

export interface MigrantEmployerInfo {
  type?: MigrantEmployerType;
  otherDetail?: string;
}

export const MIGRANT_EMPLOYER_FIELD = "migrant_employer";

export interface MigrantWorkerHistoryRecord {
  id: string;
  employeeId: string;
  type: "data_update" | "file_upload" | "file_removed" | "renewal" | "onboarding" | "transfer" | "termination";
  docType?: MigrantDocumentTypeKey;
  detail: string;
  actor?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// สถานะความครบถ้วนของเอกสาร (ข้อมูล + ไฟล์)
// ---------------------------------------------------------------------------
export type DocumentCompleteness = "complete" | "awaiting_file" | "awaiting_data" | "missing";

export const COMPLETENESS_META: Record<DocumentCompleteness, { label: string; badge: string; dot: string }> = {
  complete: { label: "มีเอกสารครบ", badge: "bg-emerald-100 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" },
  awaiting_file: { label: "รอแนบไฟล์", badge: "bg-amber-100 text-amber-700 border border-amber-200", dot: "bg-amber-500" },
  awaiting_data: { label: "รอกรอกข้อมูล", badge: "bg-sky-100 text-sky-700 border border-sky-200", dot: "bg-sky-500" },
  missing: { label: "ไม่มีเอกสาร", badge: "bg-gray-100 text-gray-500 border border-gray-200", dot: "bg-gray-400" },
};

const hasDocData = (entry?: MigrantDocumentEntry): boolean =>
  !!entry && !!(entry.docNumber && entry.docNumber.trim()) && !!(entry.expiryDate && entry.expiryDate.trim());

export function computeDocumentCompleteness(entry: MigrantDocumentEntry | undefined, hasFile: boolean): DocumentCompleteness {
  const hasData = hasDocData(entry);
  if (hasData && hasFile) return "complete";
  if (hasData && !hasFile) return "awaiting_file";
  if (!hasData && hasFile) return "awaiting_data";
  return "missing";
}

// ---------------------------------------------------------------------------
// ความเร่งด่วนตามวันหมดอายุ (คำนวณเฉพาะเมื่อเอกสาร "ครบ" แล้วเท่านั้น)
// ---------------------------------------------------------------------------
export type UrgencyLevel = "expired" | "urgent" | "warning" | "watch" | "normal" | "none";

export const URGENCY_META: Record<UrgencyLevel, { label: string; badge: string; dot: string; order: number }> = {
  expired: { label: "หมดอายุแล้ว", badge: "bg-red-100 text-red-700 border border-red-300", dot: "bg-red-600", order: 0 },
  urgent: { label: "ด่วน (≤30 วัน)", badge: "bg-orange-100 text-orange-700 border border-orange-300", dot: "bg-orange-500", order: 1 },
  warning: { label: "แจ้งเตือน (≤60 วัน)", badge: "bg-amber-100 text-amber-700 border border-amber-200", dot: "bg-amber-500", order: 2 },
  watch: { label: "เฝ้าระวัง (≤90 วัน)", badge: "bg-yellow-100 text-yellow-700 border border-yellow-200", dot: "bg-yellow-400", order: 3 },
  normal: { label: "ปกติ", badge: "bg-emerald-100 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500", order: 4 },
  none: { label: "-", badge: "bg-gray-100 text-gray-500 border border-gray-200", dot: "bg-gray-300", order: 5 },
};

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeUrgency(expiryDate?: string): { level: UrgencyLevel; daysRemaining: number | null } {
  if (!expiryDate) return { level: "none", daysRemaining: null };
  const days = daysUntil(expiryDate);
  if (days === null) return { level: "none", daysRemaining: null };
  if (days < 0) return { level: "expired", daysRemaining: days };
  if (days <= 30) return { level: "urgent", daysRemaining: days };
  if (days <= 60) return { level: "warning", daysRemaining: days };
  if (days <= 90) return { level: "watch", daysRemaining: days };
  return { level: "normal", daysRemaining: days };
}

// รวมสถานะที่แย่ที่สุดของแรงงาน 1 คน จากเอกสารทุกประเภทที่ "ครบ" แล้ว
// ถ้ามีเอกสารที่ยังไม่ครบเลย (รอไฟล์/รอข้อมูล/ไม่มี) ก็ยังต้องสะท้อนใน worker-level status ด้วย
export interface WorkerDocumentSummary {
  docType: MigrantDocumentTypeKey;
  entry?: MigrantDocumentEntry;
  hasFile: boolean;
  completeness: DocumentCompleteness;
  urgency: UrgencyLevel;
  daysRemaining: number | null;
}

export function summarizeWorkerDocuments(
  documents: MigrantDocumentsMap | undefined,
  fileByType: Partial<Record<MigrantDocumentTypeKey, boolean>>
): WorkerDocumentSummary[] {
  return MIGRANT_DOCUMENT_TYPES.map(({ key }) => {
    const entry = documents?.[key];
    const hasFile = !!fileByType[key];
    const completeness = computeDocumentCompleteness(entry, hasFile);
    const { level, daysRemaining } = completeness === "complete" ? computeUrgency(entry?.expiryDate) : { level: "none" as UrgencyLevel, daysRemaining: null };
    return { docType: key, entry, hasFile, completeness, urgency: level, daysRemaining };
  });
}

// ---------------------------------------------------------------------------
// สถานะระดับ "กลุ่มเอกสาร" (critical/recommended) — ถือว่า "มี" แล้วถ้ามีสมาชิกอย่างน้อย 1 รายการครบ
// ---------------------------------------------------------------------------
export interface WorkerGroupStatus {
  groupKey: string;
  label: string;
  tier: "critical" | "recommended";
  satisfied: boolean;
  bestSummary?: WorkerDocumentSummary; // ตัวที่ดีที่สุด (เร่งด่วนน้อยที่สุด) ในกลุ่มที่ "ครบ" แล้ว ใช้แสดงวันหมดอายุ
}

export function summarizeWorkerGroups(summaries: WorkerDocumentSummary[]): WorkerGroupStatus[] {
  return MIGRANT_DOCUMENT_GROUPS.map((group) => {
    const members = summaries.filter((s) => group.memberKeys.includes(s.docType));
    const completeMembers = members.filter((s) => s.completeness === "complete");
    const best = completeMembers.reduce<WorkerDocumentSummary | undefined>((acc, s) => {
      if (!acc) return s;
      return URGENCY_META[s.urgency].order < URGENCY_META[acc.urgency].order ? s : acc;
    }, undefined);
    return { groupKey: group.key, label: group.label, tier: group.tier, satisfied: completeMembers.length > 0, bestSummary: best };
  });
}

// ---------------------------------------------------------------------------
// สรุปสถานะ "ภาพรวม" ของแรงงาน 1 คน สำหรับใช้แสดง badge/กรองในหน้า Overview, ทะเบียน, ติดตามเอกสาร
//   - canWork = false  -> ไม่มีทั้ง Work Permit และ Permit Card เลย = ยังทำงานไม่ได้ (ร้ายแรงสุด)
//   - hasIdentityDoc = false -> ไม่มีทั้ง Passport และเล่ม CI = ควรมีแต่ไม่บังคับ (เตือนแบบเบากว่า)
//   - worstUrgency = เร่งด่วนที่สุดจากเอกสารทุกประเภทที่ "ครบ" แล้ว (รวมเอกสารเสริมด้วย เพื่อแจ้งเตือนวันหมดอายุ)
// ---------------------------------------------------------------------------
export interface WorkerComplianceSummary {
  canWork: boolean;
  hasIdentityDoc: boolean;
  worstUrgency: UrgencyLevel;
  worstUrgencyDocType?: MigrantDocumentTypeKey;
}

export function computeWorkerCompliance(summaries: WorkerDocumentSummary[]): WorkerComplianceSummary {
  const groups = summarizeWorkerGroups(summaries);
  const critical = groups.find((g) => g.tier === "critical");
  const recommended = groups.find((g) => g.tier === "recommended");
  const worst = summaries
    .filter((s) => s.completeness === "complete")
    .reduce<{ urgency: UrgencyLevel; docType?: MigrantDocumentTypeKey }>(
      (acc, s) => (URGENCY_META[s.urgency].order < URGENCY_META[acc.urgency].order ? { urgency: s.urgency, docType: s.docType } : acc),
      { urgency: "none" }
    );
  return {
    canWork: critical?.satisfied ?? true,
    hasIdentityDoc: recommended?.satisfied ?? true,
    worstUrgency: worst.urgency,
    worstUrgencyDocType: worst.docType,
  };
}

export const CANNOT_WORK_META = { label: "ยังทำงานไม่ได้", badge: "bg-red-600 text-white border border-red-700", dot: "bg-white" };
export const MISSING_IDENTITY_META = { label: "ขาดเอกสารยืนยันตัวตน", badge: "bg-orange-100 text-orange-700 border border-orange-300", dot: "bg-orange-500" };

export interface WorkerBadge {
  key: string;
  label: string;
  badge: string;
  dot: string;
}

// ลำดับความสำคัญของ badge ที่แสดง: ยังทำงานไม่ได้ > ขาดเอกสารยืนยันตัวตน > เร่งด่วนตามวันหมดอายุ > ปกติ
export function getWorkerBadge(compliance: WorkerComplianceSummary): WorkerBadge {
  if (!compliance.canWork) return { key: "cannot_work", ...CANNOT_WORK_META };
  if (!compliance.hasIdentityDoc) return { key: "missing_identity", ...MISSING_IDENTITY_META };
  if (compliance.worstUrgency !== "none") {
    const meta = URGENCY_META[compliance.worstUrgency];
    return { key: compliance.worstUrgency, label: meta.label, badge: meta.badge, dot: meta.dot };
  }
  return { key: "normal", label: "ปกติ", badge: URGENCY_META.normal.badge, dot: URGENCY_META.normal.dot };
}

// เอกสารเสริม (supplementary) ไม่ต้องแสดงในแท็บ "ติดตามเอกสาร" หากยังไม่มีข้อมูลเลย
// (เก็บไว้เพื่อข้อมูล + แจ้งเตือนวันหมดอายุเท่านั้น ไม่ถือว่า "ไม่ครบ")
export function shouldShowInTracking(def: MigrantDocumentTypeDef, summary: WorkerDocumentSummary): boolean {
  if (def.tier !== "supplementary") return true;
  return summary.completeness !== "missing";
}

// ---------------------------------------------------------------------------
// ระบุว่าใครคือ "แรงงานต่างด้าว" — ใช้ฟิลด์ สัญชาติ เดิมของระบบ (เชื่อมกับระบบเก่าโดยตรง
// ไม่ต้องย้าย/คัดลอกข้อมูลคนใหม่) โดยไม่นับผู้ที่สัญชาติไทยหรือไม่ได้ระบุ
// ---------------------------------------------------------------------------
const THAI_NATIONALITY_ALIASES = ["ไทย", "thai", "thailand"];

export function isMigrantWorker(nationality: unknown): boolean {
  const value = String(nationality || "").trim();
  if (!value) return false;
  return !THAI_NATIONALITY_ALIASES.includes(value.toLowerCase());
}

// ---------------------------------------------------------------------------
// สิทธิ์การเข้าถึง — จัดการได้: MasterAdmin/MD/GM/PD/HRM/HR (เหมือน dfManagement เดิม)
// ดูได้อย่างเดียว: role อื่น ๆ ที่มองเห็นเมนูนี้ (Admin Site/Safety/PM/CM/Staff/Foreman)
// ---------------------------------------------------------------------------
export const MIGRANT_WORKER_MANAGE_ROLES: UserRole[] = ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"];
export const MIGRANT_WORKER_VIEW_ROLES: UserRole[] = [
  "MasterAdmin",
  "MD",
  "GM",
  "PD",
  "HRM",
  "HR",
  "Admin Site",
  "Safety",
  "PM",
  "CM",
];

export function canManageMigrantWorkers(roles: string[] | undefined | null): boolean {
  const list = roles || [];
  return list.some((r) => (MIGRANT_WORKER_MANAGE_ROLES as string[]).includes(r));
}

export function canViewMigrantWorkers(roles: string[] | undefined | null): boolean {
  const list = roles || [];
  return list.some((r) => (MIGRANT_WORKER_VIEW_ROLES as string[]).includes(r));
}

export const MIGRANT_WORKER_MODULE_KEY = "migrant_workers";
