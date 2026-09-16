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

export type MigrantDocumentTypeKey = "passport" | "work_permit" | "visa" | "border_pass";

export interface MigrantDocumentTypeDef {
  key: MigrantDocumentTypeKey;
  label: string;
  shortLabel: string;
}

export const MIGRANT_DOCUMENT_TYPES: MigrantDocumentTypeDef[] = [
  { key: "passport", label: "หนังสือเดินทาง (Passport)", shortLabel: "พาสปอร์ต" },
  { key: "work_permit", label: "ใบอนุญาตทำงาน (Work Permit)", shortLabel: "Work Permit" },
  { key: "visa", label: "วีซ่า (Visa)", shortLabel: "วีซ่า" },
  { key: "border_pass", label: "บัตรผ่านแดน (Border Pass)", shortLabel: "Border Pass" },
];

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
  docType: MigrantDocumentTypeKey;
  fileName: string;
  fileUrl: string;
  uploadedBy?: string;
  uploadedAt?: number;
}

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

export function overallWorkerStatus(summaries: WorkerDocumentSummary[]): {
  completeness: DocumentCompleteness | "mixed";
  urgency: UrgencyLevel;
} {
  const anyIncomplete = summaries.some((s) => s.completeness !== "complete");
  const anyMissingOrAwaiting = summaries.some((s) => s.completeness !== "complete");
  const worstUrgency = summaries
    .filter((s) => s.completeness === "complete")
    .reduce<UrgencyLevel>((worst, s) => (URGENCY_META[s.urgency].order < URGENCY_META[worst].order ? s.urgency : worst), "none");

  const completeness: DocumentCompleteness | "mixed" = summaries.every((s) => s.completeness === "complete")
    ? "complete"
    : summaries.every((s) => s.completeness === "missing")
    ? "missing"
    : anyMissingOrAwaiting
    ? "mixed"
    : "complete";

  return { completeness: anyIncomplete ? completeness : "complete", urgency: worstUrgency };
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
