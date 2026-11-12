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

/** ผลประเมินสัมภาษณ์ (FM-HR-005/00) ที่ฝั่ง Recruitment เขียนลง staging doc
 * ชื่อฟิลด์ตรงกับที่ `pushPendingEmployee` ส่งมา — ดู hrMasterDatabaseHelpers.js */
export interface InterviewEvaluationInterviewer {
  ชื่อ?: string;
  ตำแหน่ง?: string;
  คะแนนรวม?: number | null;
  ความเห็น?: string;
}

export interface InterviewEvaluationBackground {
  education?: string;
  experience?: string;
  workHistory?: string;
}

export interface InterviewEvaluation {
  วันที่สัมภาษณ์?: string;
  รูปแบบการสัมภาษณ์?: string;
  คะแนนรวม?: number | null;
  ผลการประเมิน?: string;
  ความคิดเห็นรวม?: string;
  เงินเดือนที่คาดหวัง?: number | string | null;
  เงินเดือนที่ต่อรองได้?: number | string | null;
  หมายเหตุเงินเดือน?: string;
  ตรวจสอบประวัติ?: InterviewEvaluationBackground;
  ผู้สัมภาษณ์?: InterviewEvaluationInterviewer[];
}

/** object จริงจาก Recruitment เท่านั้น — null (รายวัน) และค่าที่ไม่มีฟิลด์ไม่นับ */
export const isInterviewEvaluation = (value: unknown): value is InterviewEvaluation =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** รูปแบบ benefit entry ที่ฝั่ง Recruitment ส่งมา เช่น {"period":"day","amount":"30","label":"ค่าเดินทาง"} */
export interface RecruitmentBenefit {
  period?: string;
  amount?: string | number;
  label?: string;
}

/** source ที่รู้จักแล้ว (ใช้แยกประเภทการแสดงผล) ค่าที่ไม่ตรงกับค่าที่รู้จัก (เช่น "online")
 * จะถูกจัดไว้ในกลุ่ม "อื่น ๆ" เพื่อไม่ให้ข้อมูลหายไปจากหน้าจอ
 * "contractor_new" = ผู้รับเหมา/Supply manpower ที่กรอกชื่อตัวเองผ่านลิงก์สาธารณะ
 * (ลิงก์ "เก็บเอกสารล่วงหน้า" โหมด self_entry ใน contractorPortalConfig.ts) — คนละ pipeline
 * กับระบบ Recruitment แต่เก็บลง collection เดียวกันนี้เพื่อให้ HR บริหารจัดการที่เดียว */
export type RecruitmentSource = "external" | "internal_transfer" | "contractor_new" | string;

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
  // ชื่อชุด/ทีมแรงงานย่อย (สำหรับ Worker/Supply Contract/Subcontract) — ฝั่ง Recruitment
  // ส่งค่านี้มาด้วยเมื่อมีการจัดทีมไว้แล้วตั้งแต่ตอนสมัคร/จ้างงาน
  ชื่อชุด?: string;

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

  // ผลประเมินสัมภาษณ์ FM-HR-005/00 ที่ฝั่ง Recruitment แนบมาตอน GM อนุมัติ
  // (พนักงานรายเดือน Group A เท่านั้น — แรงงานรายวันส่งมาเป็น null, รายการเก่าก่อนฟีเจอร์นี้จะไม่มีฟิลด์)
  ผลประเมินสัมภาษณ์?: InterviewEvaluation | null;
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
  intakeStatus?: "no_show";
  noShowReason?: string;
  noShowAt?: number;
  noShowByUid?: string;
  noShowByName?: string;
  importedEmployeeId?: string; // รหัสพนักงานที่สร้างใน employee_data แล้ว (เซ็ตตอน HR กดนำเข้า)

  // ---- เฉพาะ source === "contractor_new" (กรอกเองผ่านลิงก์สาธารณะผู้รับเหมา) ----
  contractorCompany?: string; // ชื่อบริษัทผู้รับเหมาที่ HR กำหนดตอนสร้างลิงก์
  contractorLinkId?: string; // อ้างอิงกลับไปที่ training_contractor_links/{token}

  [key: string]: unknown;
}

export const buildFullName = (c: Pick<RecruitmentPendingEmployee, "ชื่อต้น" | "ชื่อตัว" | "ชื่อสกุล">) =>
  [c.ชื่อต้น, c.ชื่อตัว, c.ชื่อสกุล]
    .map((p) => (p || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .trim() || "(ไม่ระบุชื่อ)";

/** จัดกลุ่มตาม source: external -> พนักงานใหม่, internal_transfer -> โยกย้ายภายใน,
 * contractor_new -> ผู้รับเหมากรอกเอง, อื่น ๆ -> other */
export type RecruitmentSourceGroup = "external" | "internal_transfer" | "contractor" | "other";

export const getSourceGroup = (source: RecruitmentSource | undefined): RecruitmentSourceGroup => {
  if (source === "external") return "external";
  if (source === "internal_transfer") return "internal_transfer";
  if (source === "contractor_new") return "contractor";
  return "other";
};

export const SOURCE_GROUP_META: Record<RecruitmentSourceGroup, { label: string; className: string }> = {
  external: { label: "พนักงานใหม่", className: "bg-blue-50 text-blue-700 border-blue-200" },
  internal_transfer: { label: "โยกย้ายภายใน", className: "bg-purple-50 text-purple-700 border-purple-200" },
  contractor: { label: "ผู้รับเหมา (กรอกเอง)", className: "bg-sky-50 text-sky-700 border-sky-200" },
  other: { label: "อื่น ๆ", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ---------------------------------------------------------------------------
// สถานะ "รอเพิ่มเข้าระบบ" (เอาไว้เป็นตัวกรอง/แท็บหลักของหน้านี้ — ค่า default ที่ควรแสดงก่อน
// คือ "pending" เสมอ เพราะเป็นงานที่ HR ต้องตามทำต่อ)
// ---------------------------------------------------------------------------
export type IntakeStatusFilter = "pending" | "imported" | "no_show";

export const getIntakeStatus = (c: Pick<RecruitmentPendingEmployee, "importedEmployeeId" | "intakeStatus">): IntakeStatusFilter => {
  if (c.intakeStatus === "no_show") return "no_show";
  if (c.importedEmployeeId) return "imported";
  return "pending";
};

export const INTAKE_STATUS_META: Record<IntakeStatusFilter, { label: string; className: string }> = {
  pending: { label: "รอเพิ่มเข้าระบบ", className: "bg-amber-50 text-amber-700 border-amber-200" },
  imported: { label: "เพิ่มแล้ว", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  no_show: { label: "ไม่มาเริ่มงาน", className: "bg-red-50 text-red-700 border-red-200" },
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

/** แปลงค่า "วันเกิด"/"วันเริ่มงาน" ที่มาจาก Recruitment (string หลายรูปแบบ หรือ Firestore Timestamp)
 * ให้เป็นรูปแบบ "YYYY-MM-DD" ที่ <input type="date"> ต้องใช้เป๊ะ ๆ ไม่งั้น browser จะเมินค่าที่ไม่ตรง
 * รูปแบบแล้วแสดงเป็นช่องว่างเฉย ๆ (ดูเหมือนข้อมูลหายไปจากฟอร์ม ทั้งที่จริง ๆ มีอยู่ แค่รูปแบบไม่ตรง)
 * คืนค่า "" ถ้าแปลงไม่ได้จริง ๆ (ให้ HR กรอกเอง) */
export const normalizeDateForInput = (
  value: string | { seconds: number; nanoseconds: number } | number | null | undefined
): string => {
  if (!value) return "";
  if (typeof value === "object" || typeof value === "number") {
    const d = toDateSafe(value as RecruitmentPendingEmployee["createdAt"]);
    return d ? d.toISOString().slice(0, 10) : "";
  }
  const raw = value.toString().trim();
  if (!raw) return "";

  // เป็นรูปแบบ ISO อยู่แล้ว เช่น "1995-08-15" (อาจมี time ต่อท้าย)
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // รูปแบบไทยที่พบบ่อย "15/08/1995" หรือ "15-08-1995" (วัน/เดือน/ปี)
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch;
    let y = parseInt(yRaw, 10);
    // ปี พ.ศ. (เช่น 2538) จะมากกว่าปี ค.ศ.เสมอมาก ๆ -> แปลงเป็น ค.ศ. ก่อนใช้งาน
    if (y > 2400) y -= 543;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // สุดท้ายลองให้ JS Date parse เอง (เช่น "Aug 15, 1995")
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
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
  { value: "Indirect", label: "Staff Monthly" },
  { value: "Direct_TeamLeader", label: "DC Daily/Staff Daily" },
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
  // แยกจาก "สำเนาบัตรประชาชน" ทั่วไปโดยเจตนา — อันนี้ใช้เฉพาะตอนส่งเอกสารเข้าอบรม/เข้าโครงการที่ต้องมี
  // ลายเซ็นรับรองสำเนาถูกต้องจากเจ้าของบัตรกำกับด้วย (สำเนาที่เก็บไว้ตอนรับเข้าทำงานทั่วไปมักยังไม่มีลายเซ็นนี้)
  { value: "id_card_certified", label: "สำเนาบัตรประชาชน (เซ็นสำเนาถูกต้อง)" },
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

// ---------------------------------------------------------------------------
// จับคู่ "โครงการ"/"ตำแหน่ง" อิสระที่มาจาก Recruitment ให้ตรงกับตัวเลือกจริงในระบบ
// (collection "projects" / "position_labor") เพื่อให้ฟอร์มเพิ่มเข้าระบบใน
// RecruitmentIntakePage ใช้เป็น <select> จากระบบแทนช่องพิมพ์อิสระ — ส่วนใหญ่ควรตรงเป๊ะ
// ถ้าไม่ตรงเป๊ะ ให้เลือกตัวที่ใกล้เคียงที่สุดแทน (ด้วย Levenshtein distance) แล้วเตือน HR
// ให้ตรวจสอบอีกครั้งก่อนบันทึก
// ---------------------------------------------------------------------------

const normalizeForMatch = (value: string): string =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** ระยะห่างแบบ Levenshtein (จำนวนตัวอักษรที่ต้องแก้ไขให้ string หนึ่งกลายเป็นอีก string) */
const levenshteinDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
};

export interface ClosestOptionMatch {
  value: string; // ตัวเลือกที่เลือกให้ ("" ถ้าไม่มีค่าต้นทางหรือไม่มีตัวเลือกให้เลือกเลย)
  exact: boolean; // true = ตรงเป๊ะ (ไม่ต้องเตือน HR ให้ตรวจสอบซ้ำ)
}

/** หาตัวเลือกจาก `options` ที่ตรง/ใกล้เคียงกับ `rawValue` มากที่สุด
 * - ตรงเป๊ะ (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง) -> ใช้เลย
 * - ตัวเลือกรูปแบบ "รหัส - ชื่อ" (เช่น โครงการ) -> ลองเทียบเฉพาะส่วนรหัส หรือเฉพาะส่วนชื่อด้วย
 * - มีส่วนใดส่วนหนึ่งเป็น substring ของกันและกัน -> ถือว่าใกล้เคียงพอ
 * - สุดท้ายเลือกตัวที่ระยะ Levenshtein (เทียบสัดส่วนความยาว) น้อยที่สุด เพื่อให้ได้ "ใกล้เคียงที่สุด"
 *   เสมอเมื่อมีตัวเลือกให้เลือก (ไม่ปล่อยว่าง) */
export const pickClosestOption = (
  rawValue: string | undefined | null,
  options: string[]
): ClosestOptionMatch => {
  const value = (rawValue || "").toString().trim();
  if (options.length === 0) return { value: "", exact: !value };
  if (!value) return { value: "", exact: true };

  const normValue = normalizeForMatch(value);

  const exactOpt = options.find((o) => normalizeForMatch(o) === normValue);
  if (exactOpt) return { value: exactOpt, exact: true };

  const partOpt = options.find((o) =>
    o.split(" - ").some((part) => normalizeForMatch(part) === normValue)
  );
  if (partOpt) return { value: partOpt, exact: true };

  const containsOpt = options.find((o) => {
    const normOpt = normalizeForMatch(o);
    return normOpt.includes(normValue) || normValue.includes(normOpt);
  });
  if (containsOpt) return { value: containsOpt, exact: false };

  let best = options[0];
  let bestScore = Infinity;
  options.forEach((o) => {
    const normOpt = normalizeForMatch(o);
    const dist = levenshteinDistance(normValue, normOpt);
    const score = dist / Math.max(normValue.length, normOpt.length, 1);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  });
  return { value: best, exact: false };
};
