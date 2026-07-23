export const EMPLOYEE_TRANSFERS_COLLECTION = "employee_transfers";
export const CURRENT_PROJECT_FIELD = "โครงการปัจจุบัน";
export const PROJECT_STATUS_FIELD = "สถานะโครงการ";
export const OPEN_TRANSFER_STORAGE_KEY = "cmg_open_project_transfer";

export type TransferType = "ย้ายโครงการ" | "ไปช่วยงาน (สังกัดโครงการเดิม)";

export type TransferStatus =
  | "awaiting_pm_cm"
  | "awaiting_pd"
  | "awaiting_hrm"
  | "preparing"
  | "awaiting_safety"
  | "closed"
  | "rejected"
  | "cancelled";

export type TransferActionType =
  | "submitted"
  | "approved_pm_cm"
  | "approved_pd"
  | "approved_hrm"
  | "rejected"
  | "cancelled"
  | "checklist_updated"
  | "sent_to_safety"
  | "training_recorded"
  | "card_issued"
  | "note";

export type ChecklistItemStatus = "pending" | "done" | "not_needed";

export type TransferDocumentType =
  | "บัตรประชาชน"
  | "ประกันสังคม"
  | "ประกันสุขภาพ"
  | "ใบรับรองแพทย์"
  | "อื่นๆ";

export const TRANSFER_DOCUMENT_TYPES: TransferDocumentType[] = [
  "บัตรประชาชน",
  "ประกันสังคม",
  "ประกันสุขภาพ",
  "ใบรับรองแพทย์",
  "อื่นๆ",
];

export interface TransferActor {
  uid: string;
  name: string;
  role: string;
}

export interface TransferActionEvent {
  id: string;
  type: TransferActionType;
  label: string;
  status?: TransferStatus;
  note?: string;
  actedAt: number;
  actedByUid: string;
  actedByName: string;
  actedByRole: string;
}

export interface TransferCardInfo {
  issuedDate?: string;
  cardNo?: string;
  issuedByUid?: string;
  issuedByName?: string;
}

export interface TransferChecklistDocument {
  id: string;
  type: TransferDocumentType;
  label?: string;
  url: string;
  fileName?: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedAt: number;
}

export interface TransferHealthCheck {
  required: boolean;
  status: ChecklistItemStatus;
  date?: string;
  note?: string;
}

export interface TransferTrainingCheck {
  required: boolean;
  status: ChecklistItemStatus;
  plannedDate?: string;
  completedDate?: string;
  note?: string;
}

export interface TransferChecklist {
  healthCheck: TransferHealthCheck;
  training: TransferTrainingCheck;
  documents: TransferChecklistDocument[];
  note?: string;
  updatedAt?: number;
  updatedByUid?: string;
  updatedByName?: string;
}

export interface EmployeeTransfer {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  employeeType: string;
  /** ชื่อชุดแรงงาน ณ วันยื่น (ถ้ามี) */
  laborGroupName?: string;
  /** รหัสชุดคำขอเมื่อยื่นพร้อมกันหลายคนจากชุดเดียวกัน */
  batchId?: string;
  fromProjects: string[];
  toProject: string;
  transferType: TransferType;
  effectiveDate?: string;
  reason?: string;
  status: TransferStatus;
  approverPmCmUid: string;
  approverPmCmName: string;
  approverPmCmRole: string;
  actions: TransferActionEvent[];
  checklist?: TransferChecklist;
  card?: TransferCardInfo;
  createdByUid: string;
  createdByName: string;
  createdByRole: string;
  createdAt: number;
  updatedAt: number;
  lastActionAt?: number;
  closedAt?: number;
  sentToSafetyAt?: number;
}

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  awaiting_pm_cm: "รอ PM/CM อนุมัติ",
  awaiting_pd: "รอ PD อนุมัติ",
  awaiting_hrm: "รอ HRM อนุมัติ",
  preparing: "เตรียมเข้าโครงการ",
  awaiting_safety: "รอ Safety ดำเนินการ",
  closed: "ได้บัตรแล้ว / ปิดงาน",
  rejected: "ตีกลับ",
  cancelled: "ยกเลิก",
};

export const TRANSFER_STATUS_COLORS: Record<TransferStatus, string> = {
  awaiting_pm_cm: "bg-amber-100 text-amber-800",
  awaiting_pd: "bg-orange-100 text-orange-800",
  awaiting_hrm: "bg-blue-100 text-blue-800",
  preparing: "bg-violet-100 text-violet-800",
  awaiting_safety: "bg-cyan-100 text-cyan-800",
  closed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-100 text-slate-600",
};

export const TRANSFER_TYPES: TransferType[] = ["ย้ายโครงการ", "ไปช่วยงาน (สังกัดโครงการเดิม)"];

/** ค่าเดิมที่เคยบันทึกไว้ (รองรับคำขอเก่าในฐานข้อมูล) */
const LEGACY_FULL_TRANSFER_TYPES = new Set<string>(["ย้ายขาด", "ย้ายโครงการ"]);

export const isFullProjectTransfer = (transferType: string | undefined | null): boolean =>
  LEGACY_FULL_TRANSFER_TYPES.has(String(transferType || "").trim());

export const ACTIVE_TRANSFER_STATUSES: TransferStatus[] = [
  "awaiting_pm_cm",
  "awaiting_pd",
  "awaiting_hrm",
  "preparing",
  "awaiting_safety",
];

export const emptyChecklist = (): TransferChecklist => ({
  healthCheck: { required: false, status: "not_needed" },
  training: { required: false, status: "not_needed" },
  documents: [],
});

export const ensureChecklist = (checklist?: TransferChecklist | null): TransferChecklist => {
  const base = emptyChecklist();
  if (!checklist) return base;
  return {
    healthCheck: {
      required: !!checklist.healthCheck?.required,
      status: checklist.healthCheck?.status || (checklist.healthCheck?.required ? "pending" : "not_needed"),
      date: checklist.healthCheck?.date,
      note: checklist.healthCheck?.note,
    },
    training: {
      required: !!checklist.training?.required,
      status: checklist.training?.status || (checklist.training?.required ? "pending" : "not_needed"),
      plannedDate: checklist.training?.plannedDate,
      completedDate: checklist.training?.completedDate,
      note: checklist.training?.note,
    },
    documents: Array.isArray(checklist.documents) ? checklist.documents : [],
    note: checklist.note,
    updatedAt: checklist.updatedAt,
    updatedByUid: checklist.updatedByUid,
    updatedByName: checklist.updatedByName,
  };
};

/** พร้อมส่ง Safety หรือยัง — ถ้าต้องตรวจสุขภาพ/อบรม ต้องระบุสถานะให้ชัด และถ้า required ต้องไม่ค้าง pending */
export const isChecklistReadyToSend = (checklist?: TransferChecklist | null): { ok: boolean; reason?: string } => {
  const c = ensureChecklist(checklist);
  if (c.healthCheck.required && c.healthCheck.status === "pending") {
    return { ok: false, reason: "ยังไม่ได้บันทึกผลตรวจสุขภาพ (หรือเปลี่ยนเป็นไม่ต้องตรวจ)" };
  }
  if (c.training.required && !c.training.plannedDate && c.training.status === "pending") {
    return { ok: false, reason: "กรุณาระบุวันอบรมที่วางแผนไว้ก่อนส่ง Safety" };
  }
  return { ok: true };
};

export const parseProjectList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (value != null && String(value).trim() !== "") {
    return [String(value).trim()];
  }
  return [];
};

export const normalizeProjectKey = (value: string | undefined | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const beforeDash = raw.split(" - ")[0]?.trim() || raw;
  return beforeDash.toLowerCase();
};

export const projectsOverlap = (a: string[], b: string[]): boolean => {
  const keys = new Set(a.map(normalizeProjectKey).filter(Boolean));
  return b.some((p) => keys.has(normalizeProjectKey(p)));
};

export const employeeDisplayName = (emp: {
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  [key: string]: unknown;
}): string => {
  const parts = [emp.ชื่อต้น, emp.ชื่อตัว, emp.ชื่อสกุล]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return parts.join(" ") || "-";
};

export const makeActionEvent = (
  type: TransferActionType,
  label: string,
  actor: TransferActor,
  extras?: Partial<TransferActionEvent>
): TransferActionEvent => {
  const event: TransferActionEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    actedAt: Date.now(),
    actedByUid: actor.uid,
    actedByName: actor.name,
    actedByRole: actor.role,
  };
  if (extras?.status !== undefined) event.status = extras.status;
  if (extras?.note !== undefined && extras.note !== "") event.note = extras.note;
  return event;
};

/** Firestore ห้ามเขียนค่า undefined — ตัดออกก่อน addDoc/updateDoc */
export const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (val === undefined) return;
      out[key] = stripUndefinedDeep(val);
    });
    return out as unknown as T;
  }
  return value;
};

/** เตรียม checklist สำหรับเขียน Firestore (ตัด undefined ออกทั้งก้อน) */
export const sanitizeChecklistForWrite = (checklist?: TransferChecklist | null): TransferChecklist =>
  stripUndefinedDeep(ensureChecklist(checklist));

/**
 * คำนวณค่าฟิลด์โครงการที่จะเขียนกลับไปที่เอกสารพนักงานเมื่อได้บัตรแล้ว
 * - ย้ายโครงการ: ถอดโครงการเดิม ใส่โครงการใหม่, ตั้งโครงการปัจจุบัน = ใหม่
 * - ไปช่วยงาน: คงโครงการเดิม + เพิ่มใหม่, ตั้งโครงการปัจจุบัน = ใหม่
 */
export const computeEmployeeProjectUpdate = (
  currentStatusProjects: string[],
  fromProjects: string[],
  toProject: string,
  transferType: TransferType | string
): { สถานะโครงการ: string[]; โครงการปัจจุบัน: string } => {
  const toKey = normalizeProjectKey(toProject);
  const fromKeys = new Set(fromProjects.map(normalizeProjectKey).filter(Boolean));

  let nextStatus: string[];
  if (isFullProjectTransfer(transferType)) {
    const kept = currentStatusProjects.filter((p) => !fromKeys.has(normalizeProjectKey(p)));
    const withoutTarget = kept.filter((p) => normalizeProjectKey(p) !== toKey);
    nextStatus = [...withoutTarget, toProject];
  } else {
    const alreadyHasTarget = currentStatusProjects.some((p) => normalizeProjectKey(p) === toKey);
    nextStatus = alreadyHasTarget ? [...currentStatusProjects] : [...currentStatusProjects, toProject];
  }

  return {
    สถานะโครงการ: nextStatus,
    โครงการปัจจุบัน: toProject,
  };
};

export const canSubmitTransfer = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "HR", "Admin Site", "HRM"].includes(r));

export const canApprovePmCm = (
  transfer: EmployeeTransfer,
  uid: string | undefined,
  roles: string[] | undefined | null
): boolean => {
  if (transfer.status !== "awaiting_pm_cm") return false;
  if (roles?.includes("MasterAdmin")) return true;
  return !!uid && transfer.approverPmCmUid === uid;
};

export const canApprovePd = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "PD"].includes(r));

export const canApproveHrm = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "HRM"].includes(r));

/** แก้ checklist / แนบเอกสาร ในขั้นเตรียมเข้าโครงการ */
export const canEditChecklist = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "HR", "Admin Site", "HRM"].includes(r));

export const canSendToSafety = (roles: string[] | undefined | null): boolean =>
  canEditChecklist(roles);

/** Safety (และ HR สำรอง) บันทึกอบรม / ออกบัตร ในขั้น awaiting_safety */
export const canActAsSafety = (roles: string[] | undefined | null): boolean =>
  !!roles && roles.some((r) => ["MasterAdmin", "Safety", "HR", "HRM"].includes(r));

export const canIssueCard = (roles: string[] | undefined | null): boolean =>
  canActAsSafety(roles);

export const canCancelTransfer = (
  transfer: EmployeeTransfer,
  uid: string | undefined,
  roles: string[] | undefined | null
): boolean => {
  if (!ACTIVE_TRANSFER_STATUSES.includes(transfer.status)) return false;
  if (roles?.includes("MasterAdmin") || roles?.includes("HRM")) return true;
  return !!uid && transfer.createdByUid === uid;
};
