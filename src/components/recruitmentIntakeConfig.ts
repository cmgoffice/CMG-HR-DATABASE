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
  อีเมล?: string;
  สถานภาพสมรส?: string;
  สถานะทางทหาร?: string;
  ระดับภาษาอังกฤษ?: string;

  // ที่อยู่ปัจจุบัน (เอกสารจ้างงาน — เพิ่มเข้ามาทีหลังใบสมัครเดิม)
  บ้านเลขที่?: string;
  หมู่?: string;
  ที่อยู่บรรทัด_1?: string; // string รวมที่ฝั่ง Recruitment ประกอบไว้แล้ว (เผื่อไว้/ไม่ได้ใช้โดยตรง)
  แขวงตำบล?: string;
  เขตอำเภอ?: string;
  จังหวัด?: string;
  ไปรษณีย์?: string;

  // ผู้ติดต่อฉุกเฉิน
  ผู้ติดต่อฉุกเฉิน_ชื่อ?: string;
  ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์?: string;
  ผู้ติดต่อฉุกเฉิน_โทร?: string;
  ผู้ติดต่อฉุกเฉิน_ที่อยู่?: string;

  // ประวัติส่วนตัวอื่น ๆ
  เคยถูกให้ออกจากงาน?: string; // "yes" | "no"
  รายละเอียดการถูกให้ออกจากงาน?: string;
  ญาติหรือเพื่อนในบริษัท?: string;
  บันทึกเพิ่มเติม?: string;

  // การศึกษาและประสบการณ์ทำงาน
  วุฒิการศึกษา?: string;
  สถาบันการศึกษา?: string;
  สาขา?: string;
  ประสบการณ์ทำงาน?: string;
  ไม่มีประสบการณ์ทำงาน?: boolean;
  ลักษณะงานที่เคยทำ?: string;
  ประวัติการทำงาน?: Array<{ company?: string; position?: string; duration?: string; notes?: string }>;

  // เอกสารรวม (PDF ใบสมัคร + เอกสารจ้างงานที่เซ็นแล้ว)
  fullPacketPdfUrl?: string;
  detailsSyncedAt?: { seconds: number; nanoseconds: number } | number | string | null;

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

// Role อนุญาตให้เห็นหน้านี้ และกดเพิ่มเข้าระบบ/แนบเอกสารได้ (สิทธิ์เดียวกัน)
export const RECRUITMENT_INTAKE_VIEW_ROLES: UserRole[] = ["MasterAdmin", "HRM", "HR"];

export const canViewRecruitmentIntake = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => (RECRUITMENT_INTAKE_VIEW_ROLES as string[]).includes(r));

export const canManageRecruitmentIntake = canViewRecruitmentIntake;

// ---------------------------------------------------------------------------
// ส่วนที่ 1: นำเข้าเป็นพนักงาน (employee_data)
// ---------------------------------------------------------------------------

// ตัวเลือก employee_type ที่ใช้ตรงกับที่โมดูลพนักงานอื่น ๆ ใช้อยู่จริง (เทียบจาก MODULE_CONFIG ใน App.tsx)
export const EMPLOYEE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "Indirect", label: "Staff Monthly (Indirect)" },
  { value: "Direct_TeamLeader", label: "DC Daily" },
  { value: "Direct_SupplyDC", label: "Supply manpower" },
  { value: "Direct_SubContractor", label: "Sub contractor" },
];

// สถานะกลุ่มงาน (สิ่งที่ระบบ Recruitment ส่งมาใน "สถานะกลุ่มงาน") -> employee_type เริ่มต้นที่ควรเลือกให้
export const EMPLOYEE_TYPE_BY_GROUP_STATUS: Record<string, string> = {
  Staff: "Indirect",
  Worker: "Direct_TeamLeader",
  "Supply Contract": "Direct_SupplyDC",
  Subcontract: "Direct_SubContractor",
};

// ทิศทางกลับกัน: employee_type ที่ HR เลือกในฟอร์ม -> สถานะกลุ่มงานที่จะเขียนลง employee_data
export const GROUP_STATUS_BY_EMPLOYEE_TYPE: Record<string, string> = {
  Indirect: "Staff",
  Direct_TeamLeader: "Worker",
  Direct_SupplyDC: "Supply Contract",
  Direct_SubContractor: "Subcontract",
};

// ---------------------------------------------------------------------------
// ส่วนที่ 2: เอกสารแนบรายคน (attachments)
// ---------------------------------------------------------------------------

/** รูปแบบ 1 รายการใน attachments array (เหมือนกันทุกที่ที่เก็บ ตามสเปคจากทีม Recruitment) */
export interface HiringAttachment {
  docType: string;
  name: string;
  url: string;
  uploadedAt?: string;
}

/** ประเภทเอกสารที่พบจริงในข้อมูล + ประเภทที่ใช้บ่อยสำหรับพนักงานทั่วไป (HR พิมพ์เองเพิ่มได้ ไม่บังคับเลือกจากลิสต์นี้) */
export const HIRING_DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "id_card", label: "สำเนาบัตรประชาชน" },
  { value: "photo", label: "รูปถ่าย" },
  { value: "house_reg", label: "สำเนาทะเบียนบ้าน" },
  { value: "education_cert", label: "สำเนาวุฒิการศึกษา" },
  { value: "full_packet_pdf", label: "เอกสารรวมทั้งชุด (PDF)" },
  { value: "employment_contract", label: "สัญญาจ้างงาน" },
  { value: "bank_book", label: "สำเนาสมุดบัญชีธนาคาร" },
  { value: "health_cert", label: "ใบรับรองแพทย์" },
  { value: "criminal_record", label: "หนังสือรับรองความประพฤติ" },
  { value: "resignation_letter", label: "หนังสือลาออก/เลิกจ้าง" },
  { value: "social_security_form", label: "แบบขึ้นทะเบียนประกันสังคม (สปส. 1-03)" },
  { value: "social_security_exit_form", label: "แบบแจ้งออกจากประกันสังคม (สปส. 6-09)" },
  { value: "social_security_cert", label: "หนังสือรับรองการเป็นผู้ประกันตน" },
];

export const HIRING_DOCS_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // ~10MB ตามสเปค
