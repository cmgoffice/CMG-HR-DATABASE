import { HiringAttachment } from "./recruitmentIntakeConfig";
import { generatePublicToken } from "./trainingBatchConfig";

// ---------------------------------------------------------------------------
// ลิงก์สาธารณะสำหรับผู้รับเหมา / Supply manpower (แนบเอกสารให้ครบ แล้ว (ถ้ามีรอบ
// อบรมเปิดอยู่) ส่งเข้ารอบอบรมได้เลย) — แยกต่อ "บริษัทผู้รับเหมา" เสมอ (1 โครงการ/
// 1 รอบอบรม อาจมีหลายบริษัทผู้รับเหมาเข้าร่วม แต่ละบริษัทควรเห็นเฉพาะทีมของตัวเอง)
//
// 2 รูปแบบการใช้งาน (ใช้โครงสร้างเดียวกัน แยกกันที่มี batchId หรือไม่):
//   1) ผูกกับรอบอบรม (batchId มีค่า) — ของเดิม สร้างจากหน้ารายละเอียดรอบอบรม
//      ใช้ครั้งเดียวจบ (แนบเอกสาร + ส่งเข้ารอบนั้นเลย)
//   2) "เก็บเอกสารล่วงหน้า" (ไม่มี batchId) — ผูกแค่โครงการ + บริษัทผู้รับเหมา
//      สร้างได้โดยไม่ต้องรอเปิดรอบอบรม ใช้ซ้ำได้เรื่อยๆ ให้ผู้รับเหมาทยอยแนบเอกสาร
//      ของทีมงานเตรียมไว้ล่วงหน้า พอ HR เปิดรอบอบรมจริงค่อยเลือกคนที่เอกสารครบแล้ว
//      เข้ารอบได้ทันที (หน้า public จะไม่มีปุ่ม "ส่งเข้ารอบ" เพราะยังไม่มีรอบให้ส่ง)
//   ทั้ง 2 แบบ "ไม่มี" ฟอร์มเพิ่มชื่อใหม่ — HR ต้องเพิ่มชื่อพนักงานเข้าระบบ
//   (employee_data) ก่อนเสมอ แล้วค่อยเลือกชื่อตอนสร้างลิงก์ ผู้รับเหมาทำได้แค่
//   แนบเอกสารให้คนที่อยู่ในรายชื่อที่เลือกไว้เท่านั้น
//
// Firestore path: CMG-HR-Database/root/training_contractor_links/{token}
//   (ใช้ token เป็น document id โดยตรง เพื่อให้หน้า public เปิดดูได้ด้วย getDoc เดียว
//    โดยไม่ต้อง query ทั้ง collection)
// ---------------------------------------------------------------------------

export const TRAINING_CONTRACTOR_LINKS_COLLECTION = "training_contractor_links";

// employee_type 2 กลุ่มที่ใช้ flow นี้ (อ้างอิงค่าจาก EMPLOYEE_TYPE_OPTIONS/recruitmentIntakeConfig.ts)
export const CONTRACTOR_EMPLOYEE_TYPES = ["Direct_SupplyDC", "Direct_SubContractor"] as const;
export type ContractorEmployeeType = (typeof CONTRACTOR_EMPLOYEE_TYPES)[number];

export const CONTRACTOR_EMPLOYEE_TYPE_LABELS: Record<ContractorEmployeeType, string> = {
  Direct_SupplyDC: "Supply manpower",
  Direct_SubContractor: "Sub contractor",
};

// "invited" (ของเดิม/default เมื่อไม่มีค่า) = HR เลือกรายชื่อพนักงานที่มีอยู่แล้วในระบบไว้ล่วงหน้า
//   ผู้รับเหมาเข้ามาแค่แนบเอกสารให้คนในรายชื่อนั้น
// "self_entry" = สำหรับผู้รับเหมา/Supply manpower ที่ "ยังไม่มีชื่ออยู่ในระบบเลย" — หน้า public จะมี
//   ฟอร์มให้กรอกชื่อ+ข้อมูลส่วนตัว+แนบเอกสารเอง (เก็บฟิลด์ชุดเดียวกับที่มาจากระบบ Recruitment) แล้วส่งเข้า
//   recruitment_pending_employees ด้วย source="contractor_new" ให้ HR ไปกด "เพิ่มเข้าระบบ" ต่อที่หน้า
//   "รายชื่อรอเพิ่ม" (RecruitmentIntakePage) เหมือนรายชื่อที่มาจาก Recruitment ทุกประการ
export type ContractorLinkMode = "invited" | "self_entry";

export interface TrainingContractorLink {
  id: string; // = token
  // ไม่มีค่า/undefined = ลิงก์ "เก็บเอกสารล่วงหน้า" ยังไม่ผูกรอบอบรมใดๆ (ดูหมายเหตุด้านบน)
  batchId?: string;
  project: string;
  company: string; // ตรงกับฟิลด์ "แผนก" ของพนักงานกลุ่มนี้ (ใช้เป็นชื่อบริษัทผู้รับเหมา)
  employeeType: ContractorEmployeeType | "";
  // ไม่มีค่า/undefined = "invited" (ของเดิม) — ดูความหมายแต่ละโหมดด้านบน
  mode?: ContractorLinkMode;
  // รายชื่อพนักงาน (employee doc id) ที่ HR เลือกไว้ล่วงหน้าตอนสร้างลิงก์ — ผู้รับเหมาจะเห็น "เฉพาะ"
  // ชื่อในรายการนี้ (ชื่ออื่นที่ไม่อยู่ในนี้ต้องใช้ฟอร์ม "เพิ่มชื่อใหม่" ส่งให้ HR อนุมัติเท่านั้น)
  // ไม่มีค่า/undefined = ลิงก์เก่าก่อนมีฟีเจอร์นี้ (fallback แสดงพนักงานทุกคนที่ตรงบริษัท+โครงการ)
  // ไม่ใช้เลยเมื่อ mode === "self_entry"
  invitedEmployeeIds?: string[];
  createdAt: number;
  createdByUid?: string;
  createdByName?: string;
}

export const buildContractorPortalUrl = (token: string): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/contractor/${token}`;
};

export const createContractorLinkToken = (): string => generatePublicToken();

/** slug ชื่อบริษัทผู้รับเหมา ใช้ขึ้นต้น candidateKey ตอนอัปโหลดเอกสาร (โหมด self_entry) เพื่อให้
 * โฟลเดอร์ Drive ของคนที่สมัครผ่านลิงก์เดียวกันแยกกลุ่มตามชื่อบริษัทผู้รับเหมาได้ชัดเจน
 * (แต่ละคนยังได้โฟลเดอร์ของตัวเอง เพราะต่อท้ายด้วย doc id เสมอ ไม่ใช่โฟลเดอร์รวม) */
export const slugifyContractorCompany = (company: string): string =>
  company
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "") || "contractor";

// ---------------------------------------------------------------------------
// รายชื่อใหม่ที่ผู้รับเหมากรอกเองผ่านลิงก์ (ยังไม่มีในระบบ employee_data) — ต้องรอ
// HR ตรวจสอบ/อนุมัติก่อน ถึงจะกลายเป็นพนักงานจริงและถูกเพิ่มเข้ารอบอบรม
//
// Firestore path: CMG-HR-Database/root/training_pending_members/{autoId}
// ---------------------------------------------------------------------------

export const TRAINING_PENDING_MEMBERS_COLLECTION = "training_pending_members";

export type PendingMemberStatus = "pending" | "approved" | "rejected";

export interface TrainingPendingMember {
  id: string;
  batchId: string;
  project: string;
  company: string;
  employeeType: ContractorEmployeeType | "";
  fullName: string;
  position?: string;
  nationality?: string;
  idCardNumber?: string;
  gender?: string;
  attachments: HiringAttachment[];
  status: PendingMemberStatus;
  submittedAt: number;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  reviewNote?: string;
  // เติมหลัง HR อนุมัติแล้ว — รหัสพนักงานที่สร้างขึ้นจริงใน employee_data
  approvedEmployeeId?: string;
}

export const PENDING_MEMBER_STATUS_META: Record<PendingMemberStatus, { label: string; cls: string }> = {
  pending: { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  rejected: { label: "ปฏิเสธ", cls: "bg-rose-50 text-rose-700 border border-rose-200" },
};
