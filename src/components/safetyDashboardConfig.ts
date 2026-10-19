// ---------------------------------------------------------------------------
// HR–Safety Dashboard: shared config, constants และ "schema พร้อมรับข้อมูล"
//
// สถานะปัจจุบัน (Phase 1 — อนุมัติแล้ว): แสดงเฉพาะฝั่ง Workforce & Exposure
// (man-hours, headcount, OT, workforce movement) จากข้อมูลที่มีอยู่จริงในระบบ
// (attendance / overtime / employee_data / employee_transfers / settings)
//
// ส่วน "Safety Incident & Prevention" (LTI/TRIR/Near-miss/Corrective action)
// ยังไม่มีแหล่งข้อมูลเชื่อมต่อจริง (ข้อมูลอยู่ใน Excel แยกต่างหากของฝ่าย Safety)
// ตามคำสั่ง: "ให้ทำระบบไว้ รอใส่ข้อมูลทีหลัง" — ไฟล์นี้จึงเตรียม TYPE +
// CONSTANTS ของโครงสร้างข้อมูลที่ "ควรจะเป็น" ไว้ล่วงหน้า เพื่อให้ Phase 2
// (เชื่อมข้อมูลจริง/ทำ import) ใช้ type เดียวกันได้ทันทีโดยไม่ต้องออกแบบใหม่
//
// ⚠️ ไฟล์นี้ "ไม่" เขียนหรืออ่านข้อมูลจาก Firestore ใดๆ ทั้งสิ้น (Firestore
// เป็น NoSQL แบบไม่บังคับ schema — collection ด้านล่างจะถูกสร้างจริงก็ต่อเมื่อ
// มีการเขียนเอกสารแรกใน Phase 2 เท่านั้น) จึงปลอดภัยต่อระบบเดิม 100%
// ---------------------------------------------------------------------------

// ── ค่าคงที่สำหรับคำนวณ Man-hour (Phase 1) ──────────────────────────────────
// ยืนยันกับ HR แล้วว่าใช้ชั่วโมงทำงานปกติ = 8 ชม./วัน เป็นค่ามาตรฐานเดียวทั้งองค์กร
// (ระบบ attendance เดิมเก็บเป็น "สถานะมา/ขาด/ลา" รายวัน ไม่มีเวลาเข้า-ออกจริง
// จึงต้องประมาณชั่วโมงปกติจากค่านี้ + ชั่วโมง OT จริงจาก overtime collection)
//
// NOTE: ถ้าอนาคตต้องการชั่วโมงทำงานปกติต่อโครงการที่ต่างกัน ให้ไปเพิ่ม field
// ใหม่ที่ projects (เช่น standard_work_hours_per_day) แล้วแก้ fallback ตรงนี้
// เป็นจุดเดียว — ยังไม่ทำใน Phase 1 เพื่อไม่แตะ schema เดิม
export const STANDARD_WORK_HOURS_PER_DAY = 8;

// ── Firestore paths ที่ "จอง" ไว้สำหรับ Phase 2 (ยังไม่มีการเขียนจริง) ──────
export const SAFETY_INCIDENTS_COLLECTION = "safety_incidents";
export const SAFETY_SETTINGS_DOC_ID = "safety_dashboard_settings"; // เก็บที่ settings/safety_dashboard_settings เช่นเดียวกับ overtime_limits

// ── Schema พร้อมใช้สำหรับ Phase 2: Safety Incident Register ────────────────
export type SafetyIncidentType =
  | "near_miss"
  | "unsafe_condition"
  | "unsafe_act"
  | "first_aid"
  | "medical_treatment"
  | "lost_time_injury"
  | "fatality";

export const SAFETY_INCIDENT_TYPE_LABELS: Record<SafetyIncidentType, string> = {
  near_miss: "เกือบเกิดอุบัติเหตุ (Near Miss)",
  unsafe_condition: "สภาพการทำงานไม่ปลอดภัย (Unsafe Condition)",
  unsafe_act: "การกระทำไม่ปลอดภัย (Unsafe Act)",
  first_aid: "ปฐมพยาบาล (First Aid Case)",
  medical_treatment: "รักษาพยาบาล (Medical Treatment Case)",
  lost_time_injury: "บาดเจ็บถึงขั้นหยุดงาน (Lost Time Injury)",
  fatality: "เสียชีวิต (Fatality)",
};

/** ประเภทที่นับเป็น "Recordable" ตามนิยามทั่วไป — ต้องให้บริษัทยืนยันนิยามจริงก่อนใช้คำนวณ TRIR */
export const DEFAULT_RECORDABLE_INCIDENT_TYPES: SafetyIncidentType[] = [
  "first_aid",
  "medical_treatment",
  "lost_time_injury",
  "fatality",
];

/** ประเภทที่นับเป็น LTI — ต้องให้บริษัทยืนยันนิยามจริงก่อนใช้คำนวณ LTIFR */
export const DEFAULT_LTI_INCIDENT_TYPES: SafetyIncidentType[] = ["lost_time_injury", "fatality"];

export type SafetyCorrectiveActionStatus = "open" | "in_progress" | "overdue" | "closed";

export const SAFETY_CORRECTIVE_ACTION_STATUS_LABELS: Record<SafetyCorrectiveActionStatus, string> = {
  open: "เปิดเรื่อง",
  in_progress: "กำลังดำเนินการ",
  overdue: "เลยกำหนด",
  closed: "ปิดเรื่องแล้ว",
};

/**
 * โครงสร้างข้อมูล 1 เหตุการณ์ด้าน Safety (Phase 2) — ออกแบบไว้ล่วงหน้าให้ตรงกับ
 * คอลัมน์ที่คาดว่าจะมีในไฟล์ Excel ของฝ่าย Safety (วันที่ / โครงการ / ประเภท /
 * LTI / lost workdays) เพื่อให้ขั้นตอน import (ใช้ pattern เดียวกับ
 * ColumnMappingModal ที่มีอยู่แล้วในระบบ) แม็พเข้าฟิลด์เหล่านี้ได้ทันที
 */
export interface SafetyIncidentRecord {
  id: string;
  /** วันที่เกิดเหตุจริง (ไม่ใช่วันที่บันทึกเข้าระบบ) ใช้ map สังกัดโครงการ ณ วันเกิดเหตุ ไม่ใช่สังกัดปัจจุบัน */
  incidentDate: string; // ISO yyyy-mm-dd
  projectName: string;
  /** รหัสพนักงานที่เกี่ยวข้อง (ถ้ามี/ถ้าเปิดเผยได้) — เว้นว่างได้สำหรับเหตุการณ์ระดับโครงการ เช่น near miss ทั่วไป */
  employeeId?: string;
  incidentType: SafetyIncidentType;
  description?: string;
  isLti: boolean;
  lostWorkdays?: number;
  returnToWorkDate?: string;
  correctiveActionStatus?: SafetyCorrectiveActionStatus;
  correctiveActionDueDate?: string;
  /** ที่มาของข้อมูล ณ ตอน import (ใช้ตรวจสอบย้อนกลับ/reconciliation ตามข้อกำหนดคุณภาพข้อมูลใน brief) */
  source: "safety_excel_import" | "manual_entry";
  recordedAt: number;
  recordedByUid: string;
  recordedByName: string;
}

// ── สูตรคำนวณ KPI (เตรียมไว้ล่วงหน้า — ใช้งานได้จริงเมื่อมี incident data) ──
// ⚠️ ห้ามใช้คำนวณจริงจนกว่าบริษัทจะยืนยันนิยาม LTI/Recordable Case และฐานต่อ
// ชั่วโมง (1,000,000 หรือ 200,000) ที่ใช้ — ดู "คำถามที่ต้องยืนยัน" ในรายงานวิเคราะห์
export const calcLtifr = (ltiCount: number, verifiedManHours: number, base: number = 1_000_000): number | null => {
  if (!Number.isFinite(verifiedManHours) || verifiedManHours <= 0) return null;
  return (ltiCount * base) / verifiedManHours;
};

export const calcTrir = (recordableCount: number, verifiedManHours: number, base: number = 200_000): number | null => {
  if (!Number.isFinite(verifiedManHours) || verifiedManHours <= 0) return null;
  return (recordableCount * base) / verifiedManHours;
};
