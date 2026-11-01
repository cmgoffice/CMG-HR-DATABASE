import { HiringAttachment } from "./recruitmentIntakeConfig";
import { generatePublicToken } from "./trainingBatchConfig";

// ---------------------------------------------------------------------------
// ลิงก์สาธารณะสำหรับผู้รับเหมา / Supply manpower (กรอกรายชื่อทีมงาน + แนบเอกสาร
// ก่อนส่งเข้ารอบอบรม) — แยกต่อ "รอบอบรม + บริษัทผู้รับเหมา" เพราะ 1 รอบอบรม
// อาจมีหลายบริษัทผู้รับเหมาเข้าร่วม และแต่ละบริษัทควรเห็นเฉพาะทีมของตัวเอง
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

export interface TrainingContractorLink {
  id: string; // = token
  batchId: string;
  project: string;
  company: string; // ตรงกับฟิลด์ "แผนก" ของพนักงานกลุ่มนี้ (ใช้เป็นชื่อบริษัทผู้รับเหมา)
  employeeType: ContractorEmployeeType | "";
  // รายชื่อพนักงาน (employee doc id) ที่ HR เลือกไว้ล่วงหน้าตอนสร้างลิงก์ — ผู้รับเหมาจะเห็น "เฉพาะ"
  // ชื่อในรายการนี้ (ชื่ออื่นที่ไม่อยู่ในนี้ต้องใช้ฟอร์ม "เพิ่มชื่อใหม่" ส่งให้ HR อนุมัติเท่านั้น)
  // ไม่มีค่า/undefined = ลิงก์เก่าก่อนมีฟีเจอร์นี้ (fallback แสดงพนักงานทุกคนที่ตรงบริษัท+โครงการ)
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
