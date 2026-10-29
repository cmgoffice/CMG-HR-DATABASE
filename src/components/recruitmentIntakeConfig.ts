import { UserRole } from "../auth/AuthContext";

// ---------------------------------------------------------------------------
// Recruitment intake (รายชื่อรอเพิ่มจาก Recruitment)
//
// ระบบ Recruitment เขียนผู้สมัครที่ผ่านสัมภาษณ์ + จ้างงานสำเร็จ (หรือพนักงาน
// ที่โยกย้ายภายใน) ลง collection นี้ของฐานข้อมูล HR (cmg-hr-database) โดยตรง
//
// Firestore path (ของจริง มีข้อมูลอยู่แล้ว): CMG-HR-Database/root/recruitment_pending_employees
//
// ⚠️ ห้ามอ่าน/เขียนจาก collection ชื่อ `pendingEmployees` หรือ `pending_employees`
// (ชื่อร่างเดิมที่ยังไม่มีการ sync ข้อมูลจริงเข้ามา — เลิกใช้แล้ว)
//
// Document ID ของแต่ละใบ = hiringPacketId (เดียวกับ field recruitmentSourceId
// ในเอกสาร) หน้านี้เป็นหน้า "ดูอย่างเดียว" ยังไม่มีปุ่มอนุมัติ/นำเข้า/ปฏิเสธ/ลบ
// และยังไม่เขียนอะไรลง employee_data
// ---------------------------------------------------------------------------

export const RECRUITMENT_PENDING_EMPLOYEES_COLLECTION = "recruitment_pending_employees";

/** รูปแบบ benefit entry ที่ฝั่ง Recruitment ส่งมา เช่น {"period":"day","amount":"30","label":"ค่าเดินทาง"} */
export interface RecruitmentBenefit {
  period?: string;
  amount?: string | number;
  label?: string;
}

/** source ที่รู้จักแล้ว (ใช้แยกประเภทการแสดงผล) ค่าที่ไม่ตรงกับ 2 ค่านี้ (เช่น "online")
 * จะถูกจัดไว้ในกลุ่ม "อื่น ๆ" เพื่อไม่ให้ข้อมูลหายไปจากหน้าจอ */
export type RecruitmentSource = "external" | "internal_transfer" | string;

export interface RecruitmentPendingEmployee {
  id: string; // = hiringPacketId
  hiringPacketId?: string;
  recruitmentSourceId?: string;
  requestId?: string;
  candidateId?: string;

  // ชื่อ
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;

  // ข้อมูลงาน
  ตำแหน่ง?: string;
  แผนก?: string;
  โครงการ?: string;
  สถานะกลุ่มงาน?: string;
  วันเริ่มงาน?: string;

  // ข้อมูลติดต่อ/ส่วนตัว
  โทรศัพท์?: string;
  เพศ?: string;
  สัญชาติ?: string;
  วันเกิด?: string;
  เลขบัตรประชาชน?: string;

  // ค่าตอบแทน
  payType?: string;
  salaryAmount?: number | string;
  benefits?: RecruitmentBenefit[];

  // ที่มา / metadata
  source?: RecruitmentSource;
  รหัสพนักงานเดิม?: string | null;
  createdAt?: { seconds: number; nanoseconds: number } | number | null;
  createdByUid?: string;
  createdByName?: string;

  [key: string]: unknown;
}

export const buildFullName = (c: Pick<RecruitmentPendingEmployee, "ชื่อต้น" | "ชื่อตัว" | "ชื่อสกุล">) =>
  [c.ชื่อต้น, c.ชื่อตัว, c.ชื่อสกุล]
    .map((p) => (p || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .trim() || "(ไม่ระบุชื่อ)";

/** จัดกลุ่มตาม source: external -> พนักงานใหม่, internal_transfer -> โยกย้ายภายใน, อื่น ๆ -> other */
export type RecruitmentSourceGroup = "external" | "internal_transfer" | "other";

export const getSourceGroup = (source: RecruitmentSource | undefined): RecruitmentSourceGroup => {
  if (source === "external") return "external";
  if (source === "internal_transfer") return "internal_transfer";
  return "other";
};

export const SOURCE_GROUP_META: Record<RecruitmentSourceGroup, { label: string; className: string }> = {
  external: { label: "พนักงานใหม่", className: "bg-blue-50 text-blue-700 border-blue-200" },
  internal_transfer: { label: "โยกย้ายภายใน", className: "bg-purple-50 text-purple-700 border-purple-200" },
  other: { label: "อื่น ๆ", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

/** แปลง Firestore Timestamp (หรือ number/undefined) เป็น Date เพื่อแสดงผล */
export const toDateSafe = (value: RecruitmentPendingEmployee["createdAt"]): Date | null => {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  }
  return null;
};

// Role อนุญาตให้เห็นหน้านี้
export const RECRUITMENT_INTAKE_VIEW_ROLES: UserRole[] = ["MasterAdmin", "HRM", "HR"];

export const canViewRecruitmentIntake = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => (RECRUITMENT_INTAKE_VIEW_ROLES as string[]).includes(r));
