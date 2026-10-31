import { UserRole } from "../auth/AuthContext";

// ---------------------------------------------------------------------------
// ระบบส่งพนักงานอบรมก่อนเข้างาน (Safety Induction Training)
//
// Phase 1 (ไฟล์นี้ + TrainingBatchPage.tsx): จัดการ "รอบอบรม" (training_batches)
// และ "รายชื่อคนในรอบ" (training_enrollments) เท่านั้น — ยังไม่รวมการสร้าง PDF
// (ใบสรุป / ใบขอออกบัตร) และ Template Mapping Studio ซึ่งจะทำเป็น Phase ถัดไป
//
// ใช้ได้ทุกโครงการ (ไม่ผูกกับ J78 เพียงโครงการเดียว) — ฟอร์ม/เทมเพลตของแต่ละ
// โครงการจะผูกกับ "โครงการ" (project) ที่เลือกตอนสร้างรอบ
// ---------------------------------------------------------------------------

// Firestore: CMG-HR-Database/root/<collection>
export const TRAINING_BATCHES_COLLECTION = "training_batches";
export const TRAINING_ENROLLMENTS_COLLECTION = "training_enrollments";

export const TRAINING_MODULE_KEY = "training_batches";

// ---------------------------------------------------------------------------
// สิทธิ์การเข้าถึง — HR/Safety/Admin Site มีสิทธิ์เท่ากันในการสร้างรอบ/เลือกคน/
// ปิดรอบ ตามที่ตกลงกันไว้ (HR หรือ Safety คนใดก็ได้เป็นผู้ finalize)
// ---------------------------------------------------------------------------
export const TRAINING_MANAGE_ROLES: UserRole[] = ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR", "Safety", "Admin Site"];
export const TRAINING_VIEW_ROLES: UserRole[] = [...TRAINING_MANAGE_ROLES, "PM", "CM"];

export function canManageTrainingBatches(roles: string[] | undefined | null): boolean {
  const list = roles || [];
  return list.some((r) => (TRAINING_MANAGE_ROLES as string[]).includes(r));
}

export function canViewTrainingBatches(roles: string[] | undefined | null): boolean {
  const list = roles || [];
  return list.some((r) => (TRAINING_VIEW_ROLES as string[]).includes(r));
}

// ---------------------------------------------------------------------------
// ภาษาที่ใช้กรอกเอกสาร (ใบขอออกบัตร รองรับ ไทย/อังกฤษ/เมียนมา ตามแบบฟอร์มจริง)
// ---------------------------------------------------------------------------
export type TrainingLanguage = "th" | "en" | "mm";

export const TRAINING_LANGUAGE_OPTIONS: Array<{ value: TrainingLanguage; label: string }> = [
  { value: "th", label: "ไทย" },
  { value: "en", label: "English" },
  { value: "mm", label: "မြန်မာ (เมียนมา)" },
];

// ---------------------------------------------------------------------------
// รอบอบรม (Training Batch)
// ---------------------------------------------------------------------------
export type TrainingBatchStatus = "planned" | "in_progress" | "completed" | "cancelled";

export const TRAINING_BATCH_STATUS_META: Record<TrainingBatchStatus, { label: string; badge: string }> = {
  planned: { label: "เตรียมรอบ", badge: "bg-sky-50 text-sky-700 border border-sky-200" },
  in_progress: { label: "กำลังอบรม", badge: "bg-amber-50 text-amber-700 border border-amber-200" },
  completed: { label: "เสร็จสิ้น", badge: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  cancelled: { label: "ยกเลิก", badge: "bg-gray-100 text-gray-500 border border-gray-200" },
};

export interface TrainingBatch {
  id: string;
  project: string;
  courseName: string;
  date: string; // yyyy-mm-dd
  timeSlot: string; // เช่น "08:00-12:00"
  location: string;
  trainer: string;
  capacity?: number;
  status: TrainingBatchStatus;
  note?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const DEFAULT_TRAINING_COURSE_OPTIONS: string[] = [
  "อบรมความปลอดภัยก่อนเข้าทำงาน (Safety Induction)",
  "อบรมทบทวนความปลอดภัยประจำปี",
  "อบรมงานที่มีความเสี่ยงสูง (Working at Height)",
  "อบรมงานไฟฟ้า",
  "อื่นๆ (ระบุ)",
];

// ---------------------------------------------------------------------------
// รายชื่อคนในรอบอบรม (Training Enrollment)
// ---------------------------------------------------------------------------
export type TrainingEnrollmentStatus =
  | "registered" // ลงทะเบียนรอเข้าอบรม
  | "attended" // เข้าร่วมอบรมแล้ว รอผลสอบ/ประเมิน
  | "absent" // ขาดอบรม
  | "passed" // ผ่านการอบรม
  | "failed"; // ไม่ผ่านการอบรม

export const TRAINING_ENROLLMENT_STATUS_META: Record<TrainingEnrollmentStatus, { label: string; badge: string }> = {
  registered: { label: "ลงทะเบียนแล้ว", badge: "bg-slate-100 text-slate-600 border border-slate-200" },
  attended: { label: "เข้าร่วมอบรมแล้ว", badge: "bg-sky-50 text-sky-700 border border-sky-200" },
  absent: { label: "ขาดอบรม", badge: "bg-gray-200 text-gray-600 border border-gray-300" },
  passed: { label: "ผ่าน", badge: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  failed: { label: "ไม่ผ่าน", badge: "bg-red-50 text-red-600 border border-red-200" },
};

// สถานะสุขภาพ ให้กรอกเป็นรายครั้ง (ต่อรอบอบรม) ตามที่ตกลงไว้ — ไม่เก็บถาวรในโปรไฟล์พนักงาน
export type HealthCheckStatus = "fit" | "unfit" | "not_checked";

export const HEALTH_CHECK_STATUS_OPTIONS: Array<{ value: HealthCheckStatus; label: string }> = [
  { value: "not_checked", label: "ยังไม่ตรวจ" },
  { value: "fit", label: "ผ่านเกณฑ์สุขภาพ" },
  { value: "unfit", label: "ไม่ผ่านเกณฑ์สุขภาพ" },
];

// รายการโรคประจำตัว อ้างอิงจากแบบฟอร์มใบขอออกบัตร (Access Badge Request)
export const CONGENITAL_DISEASE_OPTIONS: string[] = [
  "โรคหัวใจ",
  "โรคความดันโลหิตสูง",
  "โรคเบาหวาน",
  "โรคลมชัก/ลมบ้าหมู",
  "โรคภูมิแพ้รุนแรง",
  "โรคไต",
  "วัณโรค",
  "อื่นๆ",
];

export interface TrainingHealthCheck {
  status: HealthCheckStatus;
  congenitalDiseases?: string[];
  otherDetail?: string;
}

// สแนปช็อตความครบถ้วนของเอกสาร ณ ตอนที่เพิ่มเข้ารอบอบรม (ไว้ตรวจสอบย้อนหลังได้ว่าตอนส่งอบรม
// เอกสารครบหรือไม่ แม้ภายหลังสถานะเอกสารจริงจะเปลี่ยนไปแล้ว)
export interface TrainingDocumentSnapshot {
  isMigrant: boolean;
  documentsComplete: boolean;
  note?: string;
  checkedAt: number;
}

export interface TrainingEnrollment {
  id: string;
  batchId: string;
  project: string;
  employeeId: string;
  employeeCode?: string;
  employeeName: string;
  position?: string;
  company?: string;
  nationality?: string;
  language: TrainingLanguage;
  healthCheck?: TrainingHealthCheck;
  documentSnapshot?: TrainingDocumentSnapshot;
  badgeRequestFileUrl?: string; // ไฟล์สแกนใบขอออกบัตรที่เซ็นแล้ว (print_sign_scan)
  status: TrainingEnrollmentStatus;
  resultNote?: string;
  enrolledByUid?: string;
  enrolledByName?: string;
  enrolledAt?: number;
  updatedAt?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ชื่อเต็มพนักงาน รองรับทั้ง 2 รูปแบบฟิลด์คำนำหน้าที่ใช้อยู่ในระบบ
// (Indirect ใช้ "ชื่อต้น", Direct_* ใช้ "คำนำหน้าชื่อ")
export function buildEmployeeFullName(e: {
  คำนำหน้าชื่อ?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
}): string {
  return `${e.คำนำหน้าชื่อ || e.ชื่อต้น || ""}${e.ชื่อตัว || ""} ${e.ชื่อสกุล || ""}`.trim() || "(ไม่ระบุชื่อ)";
}

const THAI_NATIONALITY_ALIASES = ["ไทย", "thai", "thailand"];

export function isMigrantNationality(nationality: unknown): boolean {
  const value = String(nationality || "").trim();
  if (!value) return false;
  return !THAI_NATIONALITY_ALIASES.includes(value.toLowerCase());
}

// ดึงรายชื่อโครงการของพนักงาน 1 คน ให้ครอบคลุมฟิลด์เก่า/ใหม่ที่ใช้อยู่ในระบบ (โครงการ,
// โครงการปัจจุบัน, สถานะโครงการ[]) เพื่อให้กรองคนตามโครงการได้ครบไม่ว่าโมดูลต้นทางจะเขียนฟิลด์ไหน
export function employeeProjectNames(e: {
  โครงการ?: string;
  โครงการปัจจุบัน?: string;
  สถานะโครงการ?: string | string[];
}): string[] {
  const names = new Set<string>();
  if (e.โครงการ) names.add(e.โครงการ);
  if (e.โครงการปัจจุบัน) names.add(e.โครงการปัจจุบัน);
  const statusList = Array.isArray(e.สถานะโครงการ) ? e.สถานะโครงการ : e.สถานะโครงการ ? [e.สถานะโครงการ] : [];
  statusList.forEach((p) => p && names.add(p));
  return Array.from(names);
}

export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}
