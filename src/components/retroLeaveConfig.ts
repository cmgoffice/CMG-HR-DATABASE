// ── คอนฟิกและ helper สำหรับ "คำร้องขอลาย้อนหลัง" (Retroactive Leave Request) ──
// ยื่นได้เฉพาะ Admin Site เมื่อช่องลงเวลาถูกล็อคเกิน 24 ชม.ไปแล้ว ต้องผ่านการอนุมัติ
// จาก HR-tier ก่อนระบบจะแก้ไข attendance record จริง (เลียนแบบ pattern จาก projectTransferConfig.ts)

export const RETRO_LEAVE_COLLECTION = "retro_leave_requests";
export const OPEN_RETRO_LEAVE_STORAGE_KEY = "cmg_open_retro_leave";

export type RetroLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type RetroLeaveActionType = "submitted" | "approved" | "rejected" | "cancelled";

export interface RetroLeaveActor {
  uid: string;
  name: string;
  role: string;
}

export interface RetroLeaveActionEvent {
  id: string;
  type: RetroLeaveActionType;
  note?: string;
  actedAt: number;
  actedByUid: string;
  actedByName: string;
  actedByRole: string;
}

export interface RetroLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  project: string;
  /** วันที่ที่ต้องการแก้ไข (YYYY-MM-DD) */
  dateStr: string;
  /** สถานะเดิมในตาราง ตอนยื่นคำร้อง (หลักฐาน) */
  currentStatus: string;
  /** สถานะใหม่ที่ต้องการ: "มา" | "ไม่มา" | "ลา" | "" (ล้างสถานะ) */
  requestedStatus: string;
  reason: string;
  status: RetroLeaveStatus;
  submittedByUid: string;
  submittedByName: string;
  submittedByRole: string;
  submittedAt: number;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  reviewNote?: string;
  actions: RetroLeaveActionEvent[];
}

export const RETRO_LEAVE_STATUS_LABELS: Record<RetroLeaveStatus, string> = {
  pending: "รอ HR อนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
};

export const RETRO_LEAVE_STATUS_COLORS: Record<RetroLeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-100 text-slate-600",
};

/**
 * สถานะที่เลือกยื่นคำร้องขอลาย้อนหลังได้ — ครบทุกสถานะที่เก็บจริงในตาราง attendance
 * (ไม่รวม "ขาดงาน" เพราะเป็นค่าที่ระบบคำนวณแสดงผลอัตโนมัติจาก "ไม่มา" เมื่อช่องถูกล็อคแล้ว
 * ไม่ใช่ค่าที่บันทึกแยกต่างหาก — เลือก "ไม่มา" แล้วระบบจะแสดงเป็น "ขาดงาน" เองหลังอนุมัติ)
 */
export const RETRO_LEAVE_REQUESTABLE_STATUSES: { value: string; label: string }[] = [
  { value: "มา", label: "มา" },
  { value: "ไม่มา", label: "ไม่มา (จะแสดงเป็น \"ขาดงาน\" หลังอนุมัติ)" },
  { value: "ลา", label: "ลา" },
  { value: "H", label: "H (วันหยุดพนักงาน)" },
  { value: "", label: "ล้างสถานะ (ว่าง)" },
];

/** ยื่นคำร้องได้เฉพาะ role Admin Site เท่านั้น */
export const canSubmitRetroLeave = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.includes("Admin Site");

/** อนุมัติ/ปฏิเสธคำร้องได้: HR-tier ทั้งหมด */
export const canApproveRetroLeave = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "HR", "HRM", "MD", "GM"].includes(r));

export const makeRetroLeaveAction = (
  type: RetroLeaveActionType,
  actor: RetroLeaveActor,
  note?: string
): RetroLeaveActionEvent => {
  const event: RetroLeaveActionEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    actedAt: Date.now(),
    actedByUid: actor.uid,
    actedByName: actor.name,
    actedByRole: actor.role,
  };
  if (note !== undefined && note !== "") event.note = note;
  return event;
};

/** เช็คว่า employeeId+dateStr นี้มีคำร้องที่ยัง pending อยู่หรือไม่ (ห้ามยื่นซ้ำ) */
export const hasPendingRetroLeaveRequest = (
  requests: RetroLeaveRequest[],
  employeeId: string,
  dateStr: string
): boolean =>
  requests.some((r) => r.employeeId === employeeId && r.dateStr === dateStr && r.status === "pending");

export const retroLeaveStatusLabel = (status: string): string => status || "ว่าง";
