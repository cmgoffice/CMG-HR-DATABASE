export const EMPLOYEE_FOLLOW_UP_COLLECTION = "employee_follow_ups";
export const FOLLOW_UP_POLICY_COLLECTION = "settings";
export const FOLLOW_UP_POLICY_DOC_ID = "employee_follow_up_policy";

export type RiskSeverity = "normal" | "watch" | "risk" | "high" | "critical";

export type RiskRuleKey =
  | "consecutive_absence"
  | "total_absence"
  | "absence_rate"
  | "monday_friday_pattern"
  | "missing_attendance"
  | "wrong_project_pattern";

export type FollowUpStatus =
  | "pending"
  | "proposed"
  | "in_progress"
  | "awaiting_hrm_review"
  | "approved_pending_execution"
  | "awaiting_document_review"
  | "approved_pending_issue"
  | "document_issued"
  | "no_action"
  | "closed";
export type FollowUpWarningRound = 0 | 1 | 2 | 3;
export type FollowUpEscalationState = "none" | "hrm_review_required" | "termination_consideration";
export type FollowUpCloseState = "resolved" | "monitoring_complete" | "no_action" | "terminated" | "other";
export type FollowUpHrmReviewStatus = "not_requested" | "pending" | "approved" | "commented";
export type FollowUpDocumentReviewStatus = "not_prepared" | "pending" | "approved" | "commented";

export type FollowUpActionType =
  | "status_updated"
  | "hrm_approved"
  | "hrm_commented"
  | "document_submitted"
  | "document_approved"
  | "document_commented"
  | "proposed_action"
  | "document_issued"
  | "verbal_warning"
  | "written_warning"
  | "written_warning_round_1"
  | "written_warning_round_2"
  | "written_warning_round_3"
  | "suspension_3_days"
  | "suspension_5_days"
  | "suspension_7_days"
  | "termination"
  | "no_action_with_reason"
  | "closed";

export type FollowUpActionKind = "warning" | "suspension" | "termination";

export type FollowUpRequesterRole = "HR" | "Admin Site";

export interface FollowUpDocumentRecord {
  id: string;
  templateKey: "warning_memo" | "warning_letter" | "termination_notice";
  templateLabel: string;
  generatedAt: number;
  generatedByUid: string;
  generatedByName: string;
  usedSignatureOfUid?: string;
  usedSignatureOfName?: string;
  actionType?: FollowUpActionType;
}

export interface FollowUpDocumentDraft {
  incidentDate?: string;
  incidentTime?: string;
  facts: string;
  violatedRule?: string;
  suspensionStartDate?: string;
  suspensionEndDate?: string;
  terminationDate?: string;
  employmentStartDate?: string;
  lastWorkDate?: string;
  absenceStartDate?: string;
  preparedAt: number;
  preparedByUid: string;
  preparedByName: string;
}

export interface FollowUpIssueSnapshot {
  key: RiskRuleKey;
  label: string;
  reason: string;
}

export interface FollowUpRiskSeed {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  employeeType: string;
  projectName: string;
  projectNames: string[];
  totalScore: number;
  severity: RiskSeverity;
  evaluatedFrom: string;
  evaluatedTo: string;
  latestIncidentDate?: string;
  rules: FollowUpIssueSnapshot[];
}

export interface FollowUpActorSnapshot {
  uid: string;
  name: string;
  role: string;
}

export interface FollowUpActionEvent {
  id: string;
  type: FollowUpActionType;
  label: string;
  actionKind?: FollowUpActionKind;
  status?: FollowUpStatus;
  hrmReviewStatus?: FollowUpHrmReviewStatus;
  note?: string;
  reason?: string;
  warningRound: FollowUpWarningRound;
  nextFollowUpDate?: string;
  suspensionDays?: number;
  warningValidityDays?: number;
  closeReason?: string;
  closeState?: FollowUpCloseState;
  escalationState?: FollowUpEscalationState;
  actedAt: number;
  actedByUid: string;
  actedByName: string;
  actedByRole: string;
}

export interface EmployeeFollowUpCase {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  employeeType: string;
  projectName: string;
  projectNames: string[];
  issueType: RiskRuleKey;
  issueLabel: string;
  issueReason: string;
  sourceRiskRuleKeys: RiskRuleKey[];
  sourceRiskReasons: string[];
  riskScoreSnapshot: number;
  severitySnapshot: RiskSeverity;
  status: FollowUpStatus;
  ownerUid?: string;
  ownerName?: string;
  ownerRole?: string;
  warningRound: FollowUpWarningRound;
  actions: FollowUpActionEvent[];
  noActionReason?: string;
  closeReason?: string;
  closeState?: FollowUpCloseState;
  escalationState?: FollowUpEscalationState;
  hrmReviewStatus?: FollowUpHrmReviewStatus;
  hrmReviewComment?: string;
  hrmReviewedAt?: number;
  hrmReviewedByUid?: string;
  hrmReviewedByName?: string;
  hrmReviewedByRole?: string;
  documentDraft?: FollowUpDocumentDraft;
  documentReviewStatus?: FollowUpDocumentReviewStatus;
  documentReviewComment?: string;
  documentReviewedAt?: number;
  documentReviewedByUid?: string;
  documentReviewedByName?: string;
  // ข้อเสนอที่ยังไม่ได้ดำเนินการจริง (proposed -> รอ HRM อนุมัติ -> HR ดำเนินการจริงใน executeApprovedAction)
  pendingActionType?: FollowUpActionType;
  pendingActionNote?: string;
  pendingActionNextFollowUpDate?: string;
  pendingActionProposedAt?: number;
  pendingActionProposedByUid?: string;
  pendingActionProposedByName?: string;
  pendingActionProposedByRole?: string;
  // ผู้ขอ/ผู้รับเรื่องเดิม (รองรับช่องทางคู่ขนานจาก Admin Site)
  requestedByRole?: FollowUpRequesterRole;
  requestedProject?: string;
  claimedByUid?: string;
  claimedByName?: string;
  claimedByRole?: FollowUpRequesterRole;
  claimedProject?: string;
  documents?: FollowUpDocumentRecord[];
  nextFollowUpDate?: string;
  latestIncidentDate?: string;
  lastActionAt?: number;
  createdAt: number;
  updatedAt: number;
  createdByUid: string;
  createdByName: string;
  createdByRole: string;
  updatedByUid: string;
  updatedByName: string;
  updatedByRole: string;
}

export interface FollowUpDisciplinaryActionOption {
  type: FollowUpActionType;
  label: string;
  actionKind: FollowUpActionKind;
  enabled: boolean;
  suspensionDays?: number;
  warningRoundIncrement?: 0 | 1;
  warningValidityDays?: number;
  defaultEscalationState?: FollowUpEscalationState;
  notes?: string[];
}

export interface FollowUpPolicyConfig {
  primaryLanguage: "th";
  maxSuspensionDays: number;
  warningLetterValidityDays: number;
  allowNonSequentialEscalation: boolean;
  allowSeriousOffenseFastTrack: boolean;
  actionOptions: FollowUpDisciplinaryActionOption[];
  advisoryNotes: string[];
}

export const FOLLOW_UP_OPERATOR_ROLES = ["HR", "HRM"] as const;
export const FOLLOW_UP_FIRST_STAGE_ROLES = ["HR"] as const;
export const FOLLOW_UP_VIEWER_ROLES = ["MasterAdmin", "MD", "GM", "PD", "HR", "HRM"] as const;
export const FOLLOW_UP_ESCALATION_ROLES = ["HRM"] as const;
export const FOLLOW_UP_HRM_REVIEW_ROLES = ["HRM"] as const;
// Admin Site เห็นแท็บ "การติดตามพนักงาน" ได้แบบจำกัดขอบเขตเฉพาะโครงการของตัวเอง
// และเสนอ (propose) การดำเนินการได้เหมือน HR แต่ไม่สามารถอนุมัติ/ดำเนินการจริง/ออกเอกสารได้
export const FOLLOW_UP_ADMIN_SITE_ROLES = ["Admin Site"] as const;

const hasAnyFollowUpRole = (roles: readonly string[] | undefined | null, allowedRoles: readonly string[]): boolean =>
  !!roles && roles.some((role) => allowedRoles.includes(role));

export const canViewFollowUpModule = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_VIEWER_ROLES);

export const canManageFollowUpModule = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_OPERATOR_ROLES);

export const canManageFollowUpFirstStage = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_FIRST_STAGE_ROLES);

export const canInterpretFollowUpEscalation = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_ESCALATION_ROLES);

export const canReviewFollowUpByHRM = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_HRM_REVIEW_ROLES);

export const canRequestFollowUpAsAdminSite = (roles: readonly string[] | undefined | null): boolean =>
  hasAnyFollowUpRole(roles, FOLLOW_UP_ADMIN_SITE_ROLES);

// ผู้ที่ "เสนอการดำเนินการ" ได้ (ขั้นแรกสุดของ Flow ใหม่) คือ HR หรือ Admin Site (ภายในโครงการของตน)
export const canProposeFollowUpAction = (roles: readonly string[] | undefined | null): boolean =>
  canManageFollowUpFirstStage(roles) || canRequestFollowUpAsAdminSite(roles);

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "รอดำเนินการ",
  proposed: "HR เสนอการดำเนินการ",
  in_progress: "กำลังติดตาม (ค่าเดิม)",
  awaiting_hrm_review: "รอ HRM พิจารณา",
  approved_pending_execution: "HRM อนุมัติแล้ว รอ HR จัดทำเอกสาร",
  awaiting_document_review: "รอ HRM อนุมัติเอกสาร",
  approved_pending_issue: "HRM อนุมัติเอกสารแล้ว รอ HR ออกเอกสาร",
  document_issued: "ออกเอกสารแล้ว รอปิดเคส",
  no_action: "ไม่ต้องดำเนินการ",
  closed: "ติดตามเสร็จสิ้น",
};

export const FOLLOW_UP_ACTION_LABELS: Record<FollowUpActionType, string> = {
  status_updated: "อัปเดตสถานะ",
  hrm_approved: "HRM อนุมัติ",
  hrm_commented: "HRM ให้ความเห็น",
  document_submitted: "ส่งร่างเอกสารให้ HRM",
  document_approved: "HRM อนุมัติเอกสาร",
  document_commented: "HRM ส่งแก้ไขเอกสาร",
  proposed_action: "เสนอการดำเนินการ",
  document_issued: "ออกเอกสารประกอบการดำเนินการ",
  verbal_warning: "เตือนวาจา",
  written_warning: "ออกหนังสือเตือน",
  written_warning_round_1: "หนังสือเตือนครั้งที่ 1",
  written_warning_round_2: "หนังสือเตือนครั้งที่ 2",
  written_warning_round_3: "หนังสือเตือนครั้งที่ 3",
  suspension_3_days: "พักงาน 3 วัน",
  suspension_5_days: "พักงาน 5 วัน",
  suspension_7_days: "พักงาน 7 วัน",
  termination: "พ้นสภาพพนักงาน",
  no_action_with_reason: "ไม่ดำเนินการ",
  closed: "ปิดเคส",
};

export const FOLLOW_UP_CLOSE_STATE_LABELS: Record<FollowUpCloseState, string> = {
  resolved: "แก้ไขแล้ว",
  monitoring_complete: "ติดตามครบแล้ว",
  no_action: "ไม่ดำเนินการ",
  terminated: "พ้นสภาพพนักงาน",
  other: "อื่นๆ",
};

export const FOLLOW_UP_ESCALATION_LABELS: Record<FollowUpEscalationState, string> = {
  none: "ปกติ",
  hrm_review_required: "รอ HRM ตีความ",
  termination_consideration: "พิจารณายุติสัญญา",
};

export const FOLLOW_UP_HRM_REVIEW_LABELS: Record<FollowUpHrmReviewStatus, string> = {
  not_requested: "ยังไม่ส่ง HRM",
  pending: "รอ HRM อนุมัติ/ความเห็น",
  approved: "HRM อนุมัติแล้ว",
  commented: "HRM มีความเห็นกลับ",
};

export const FOLLOW_UP_STATUS_OPTIONS: Array<{ value: FollowUpStatus; label: string }> = [
  { value: "pending", label: FOLLOW_UP_STATUS_LABELS.pending },
  { value: "proposed", label: FOLLOW_UP_STATUS_LABELS.proposed },
  { value: "awaiting_hrm_review", label: FOLLOW_UP_STATUS_LABELS.awaiting_hrm_review },
  { value: "approved_pending_execution", label: FOLLOW_UP_STATUS_LABELS.approved_pending_execution },
  { value: "awaiting_document_review", label: FOLLOW_UP_STATUS_LABELS.awaiting_document_review },
  { value: "approved_pending_issue", label: FOLLOW_UP_STATUS_LABELS.approved_pending_issue },
  { value: "document_issued", label: FOLLOW_UP_STATUS_LABELS.document_issued },
  { value: "no_action", label: FOLLOW_UP_STATUS_LABELS.no_action },
  { value: "closed", label: FOLLOW_UP_STATUS_LABELS.closed },
];

export const FOLLOW_UP_CLOSE_STATE_OPTIONS: Array<{ value: FollowUpCloseState; label: string }> = [
  { value: "resolved", label: FOLLOW_UP_CLOSE_STATE_LABELS.resolved },
  { value: "monitoring_complete", label: FOLLOW_UP_CLOSE_STATE_LABELS.monitoring_complete },
  { value: "terminated", label: FOLLOW_UP_CLOSE_STATE_LABELS.terminated },
  { value: "other", label: FOLLOW_UP_CLOSE_STATE_LABELS.other },
];

export const FOLLOW_UP_ESCALATION_OPTIONS: Array<{ value: FollowUpEscalationState; label: string }> = [
  { value: "none", label: FOLLOW_UP_ESCALATION_LABELS.none },
  { value: "hrm_review_required", label: FOLLOW_UP_ESCALATION_LABELS.hrm_review_required },
  { value: "termination_consideration", label: FOLLOW_UP_ESCALATION_LABELS.termination_consideration },
];

export const FOLLOW_UP_HRM_REVIEW_OPTIONS: Array<{
  value: Exclude<FollowUpHrmReviewStatus, "not_requested" | "pending">;
  label: string;
}> = [
  { value: "approved", label: FOLLOW_UP_HRM_REVIEW_LABELS.approved },
  { value: "commented", label: FOLLOW_UP_HRM_REVIEW_LABELS.commented },
];

export const DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS: FollowUpDisciplinaryActionOption[] = [
  {
    type: "verbal_warning",
    label: FOLLOW_UP_ACTION_LABELS.verbal_warning,
    actionKind: "warning",
    enabled: true,
    warningRoundIncrement: 0,
    notes: ["ใช้สำหรับกรณีเริ่มต้นหรือพฤติกรรมที่ยังไม่ถึงขั้นออกหนังสือเตือน"],
  },
  {
    type: "written_warning",
    label: FOLLOW_UP_ACTION_LABELS.written_warning,
    actionKind: "warning",
    enabled: true,
    warningRoundIncrement: 1,
    warningValidityDays: 365,
    notes: ["ใช้บันทึกหนังสือเตือน โดยมีผลตามนโยบาย 1 ปี", "ระบบนับรอบเตือนได้สูงสุด 3 ครั้งต่อประเด็น"],
  },
  {
    type: "suspension_3_days",
    label: FOLLOW_UP_ACTION_LABELS.suspension_3_days,
    actionKind: "suspension",
    enabled: true,
    suspensionDays: 3,
    defaultEscalationState: "hrm_review_required",
    notes: ["เป็นการพักงานชั่วคราวภายในเพดานไม่เกิน 7 วัน"],
  },
  {
    type: "suspension_5_days",
    label: FOLLOW_UP_ACTION_LABELS.suspension_5_days,
    actionKind: "suspension",
    enabled: true,
    suspensionDays: 5,
    defaultEscalationState: "hrm_review_required",
    notes: ["เป็นการพักงานชั่วคราวภายในเพดานไม่เกิน 7 วัน"],
  },
  {
    type: "suspension_7_days",
    label: FOLLOW_UP_ACTION_LABELS.suspension_7_days,
    actionKind: "suspension",
    enabled: true,
    suspensionDays: 7,
    defaultEscalationState: "hrm_review_required",
    notes: ["เป็นการพักงานชั่วคราวสูงสุดตามนโยบาย MVP ปัจจุบัน"],
  },
  {
    type: "termination",
    label: FOLLOW_UP_ACTION_LABELS.termination,
    actionKind: "termination",
    enabled: true,
    defaultEscalationState: "termination_consideration",
    notes: ["รองรับการบันทึกมาตรการพ้นสภาพพนักงานในข้อมูลกลางและลำดับการดำเนินการ", "กรณีร้ายแรงอาจยกระดับได้โดยไม่ต้องผ่านทุกขั้นแบบลำดับตายตัว"],
  },
];

export const DEFAULT_FOLLOW_UP_POLICY_CONFIG: FollowUpPolicyConfig = {
  primaryLanguage: "th",
  maxSuspensionDays: 7,
  warningLetterValidityDays: 365,
  allowNonSequentialEscalation: true,
  allowSeriousOffenseFastTrack: true,
  actionOptions: DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS,
  advisoryNotes: [
    "หนังสือเตือนมีผล 1 ปีตามนโยบายที่ใช้เป็นฐานใน MVP นี้",
    "การพักงานชั่วคราวต้องไม่เกิน 7 วัน",
    "เส้นทางการยกระดับไม่จำเป็นต้องเรียงลำดับเสมอไป กรณีร้ายแรงอาจข้ามขั้นได้",
    "MVP นี้ยังไม่สร้างเอกสารหนังสือเตือนหรือหนังสือพ้นสภาพโดยอัตโนมัติ",
  ],
};

export const FOLLOW_UP_ISSUE_LABELS: Record<RiskRuleKey, string> = {
  consecutive_absence: "ขาดงานต่อเนื่อง",
  total_absence: "ขาดงานสะสม",
  absence_rate: "อัตราขาดงานสูง",
  monday_friday_pattern: "รูปแบบขาดวันจันทร์/ศุกร์",
  missing_attendance: "ค้างลงเวลา",
  wrong_project_pattern: "ลงผิดโครงการ",
};

export const getFollowUpDocId = (employeeId: string, issueType: RiskRuleKey): string =>
  `${sanitizeFollowUpKey(employeeId)}__${issueType}`;

export const sanitizeFollowUpKey = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[\/\s]+/g, "-")
    .replace(/__+/g, "-") || "NA";

export const findFollowUpCase = (
  cases: EmployeeFollowUpCase[],
  employeeId: string,
  issueType: RiskRuleKey
): EmployeeFollowUpCase | undefined => cases.find((item) => item.employeeId === employeeId && item.issueType === issueType);

export const getInitialEscalationState = (
  warningRound: FollowUpWarningRound,
  currentState?: FollowUpEscalationState
): FollowUpEscalationState => {
  if (currentState === "termination_consideration") return currentState;
  if (warningRound >= 3) return "hrm_review_required";
  return "none";
};

export const issueLabelFromKey = (key: RiskRuleKey): string => FOLLOW_UP_ISSUE_LABELS[key] || key;

export const getFollowUpActionOption = (
  policy: FollowUpPolicyConfig,
  actionType: FollowUpActionType
): FollowUpDisciplinaryActionOption | undefined => policy.actionOptions.find((item) => item.type === actionType);

export const getNextWarningRoundForAction = (
  actionType: FollowUpActionType,
  currentRound: FollowUpWarningRound
): FollowUpWarningRound => {
  if (actionType === "written_warning") return currentRound < 3 ? ((currentRound + 1) as FollowUpWarningRound) : 3;
  if (actionType === "written_warning_round_1") return 1;
  if (actionType === "written_warning_round_2") return 2;
  if (actionType === "written_warning_round_3") return 3;
  return currentRound;
};

/**
 * "อัตราขาดงานสูง" (absence_rate) is only an advisory/trend signal, not a
 * lawful basis on its own for formal disciplinary action under Thai labor
 * law (unlike consecutive/total absence). While a case's issue type is
 * absence_rate, only the softest action (verbal warning) is allowed; formal
 * written warnings, suspension, and termination require the case to have
 * escalated to a stronger issue type (e.g. consecutive/total absence).
 *
 * NOTE: absence_rate and monday_friday_pattern are currently also excluded
 * from being seeded into the follow-up queue at all (they're dashboard-only
 * watch signals - see EMPLOYEE_FOLLOW_UP_EXCLUDED_ISSUE_KEYS in
 * ManpowerDashboard.tsx), so this restriction mainly guards against any
 * future/manual case creation with these issue types.
 */
export const WATCH_ONLY_ISSUE_TYPES: readonly RiskRuleKey[] = ["absence_rate", "monday_friday_pattern"];

export const isWatchOnlyIssueType = (issueType?: RiskRuleKey): boolean =>
  !!issueType && WATCH_ONLY_ISSUE_TYPES.includes(issueType);

export const canSelectFollowUpAction = (
  policy: FollowUpPolicyConfig,
  actionType: FollowUpActionType,
  currentRound: FollowUpWarningRound,
  issueType?: RiskRuleKey
): boolean => {
  const option = getFollowUpActionOption(policy, actionType);
  if (option && option.enabled === false) return false;
  if (isWatchOnlyIssueType(issueType) && actionType !== "verbal_warning") return false;
  if (actionType === "written_warning") return currentRound < 3;
  if (actionType === "written_warning_round_1") return currentRound === 0;
  if (actionType === "written_warning_round_2") return currentRound === 1;
  if (actionType === "written_warning_round_3") return currentRound === 2;
  return true;
};

export const isFollowUpOpenStatus = (status: FollowUpStatus): boolean =>
  status === "pending" ||
  status === "proposed" ||
  status === "in_progress" ||
  status === "awaiting_hrm_review" ||
  status === "approved_pending_execution" ||
  status === "awaiting_document_review" ||
  status === "approved_pending_issue" ||
  status === "document_issued";

export const isFollowUpProcessedStatus = (status: FollowUpStatus): boolean =>
  status === "no_action" || status === "closed";

/**
 * ขั้นที่ 1 ของ Flow ใหม่: HR หรือ Admin Site "เสนอ" การดำเนินการ (ยังไม่มีผลจริง เช่น ยังไม่นับรอบหนังสือเตือน)
 * แล้วส่งตรงเข้าสู่ "รอ HRM พิจารณา" ทันที
 */
export const proposeAction = (
  baseCase: EmployeeFollowUpCase,
  actionType: FollowUpActionType,
  note: string,
  nextFollowUpDate: string,
  actor: FollowUpActorSnapshot,
  now: number,
  requestContext?: { requestedByRole: FollowUpRequesterRole; requestedProject?: string }
): EmployeeFollowUpCase => {
  const event: FollowUpActionEvent = {
    id: `${baseCase.id}-${now}`,
    type: "proposed_action",
    label: `เสนอ: ${FOLLOW_UP_ACTION_LABELS[actionType]}`,
    status: "awaiting_hrm_review",
    hrmReviewStatus: "pending",
    note: note.trim() || undefined,
    warningRound: baseCase.warningRound,
    nextFollowUpDate: nextFollowUpDate || undefined,
    actedAt: now,
    actedByUid: actor.uid,
    actedByName: actor.name,
    actedByRole: actor.role,
  };
  return {
    ...baseCase,
    status: "awaiting_hrm_review",
    pendingActionType: actionType,
    pendingActionNote: note.trim(),
    pendingActionNextFollowUpDate: nextFollowUpDate || "",
    pendingActionProposedAt: now,
    pendingActionProposedByUid: actor.uid,
    pendingActionProposedByName: actor.name,
    pendingActionProposedByRole: actor.role,
    requestedByRole: requestContext?.requestedByRole || baseCase.requestedByRole || "HR",
    requestedProject: requestContext?.requestedProject || baseCase.requestedProject,
    claimedByUid: requestContext ? actor.uid : baseCase.claimedByUid,
    claimedByName: requestContext ? actor.name : baseCase.claimedByName,
    claimedByRole: requestContext?.requestedByRole || baseCase.claimedByRole,
    claimedProject: requestContext?.requestedProject || baseCase.claimedProject,
    hrmReviewStatus: "pending",
    hrmReviewComment: "",
    documentDraft: undefined,
    documentReviewStatus: "not_prepared",
    documentReviewComment: "",
    documentReviewedAt: 0,
    documentReviewedByUid: "",
    documentReviewedByName: "",
    actions: [...(baseCase.actions || []), event],
    lastActionAt: now,
    updatedAt: now,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    updatedByRole: actor.role,
  };
};

/**
 * ขั้นที่ 3 ของ Flow ใหม่ (หลัง HRM อนุมัติแล้ว): HR ดำเนินการจริงตามข้อเสนอที่อนุมัติ
 * เป็นจุดที่ warningRound / escalationState / suspensionDays ฯลฯ ถูกบันทึกผลจริง
 * (ย้ายมาจากตรรกะเดิมของ applyAction) แล้วเปลี่ยนสถานะเป็น document_issued เพื่อรอออกเอกสาร/ปิดเคส
 */
export const executeApprovedAction = (
  baseCase: EmployeeFollowUpCase,
  policyConfig: FollowUpPolicyConfig,
  actor: FollowUpActorSnapshot,
  now: number
): EmployeeFollowUpCase => {
  const actionType = baseCase.pendingActionType;
  if (!actionType) {
    // เคสเก่าที่ย้ายมาจาก flow เดิม (สถานะ "in_progress" ที่มี action บันทึกไว้แล้วจริง) จะไม่มี pendingActionType
    // เพราะไม่เคยผ่านขั้นเสนอ/อนุมัติแบบใหม่ ในกรณีนี้ให้ใช้ผลการดำเนินการล่าสุดที่เคยบันทึกไว้จริงแล้ว
    // เพื่อเปิดขั้นออกเอกสารต่อได้เลย โดยไม่สร้างรายการดำเนินการซ้ำหรือเพิ่มรอบหนังสือเตือนซ้ำ
    const legacyEvent = [...(baseCase.actions || [])]
      .reverse()
      .find(
        (event) =>
          event.type !== "document_issued" &&
          event.type !== "document_submitted" &&
          event.type !== "document_approved" &&
          event.type !== "document_commented" &&
          event.type !== "hrm_approved" &&
          event.type !== "hrm_commented" &&
          event.type !== "proposed_action" &&
          event.type !== "status_updated"
      );
    if (!legacyEvent) return baseCase;
    return {
      ...baseCase,
      status: "document_issued",
      lastActionAt: now,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedByRole: actor.role,
    };
  }
  const actionOption = getFollowUpActionOption(policyConfig, actionType);
  const warningRound = getNextWarningRoundForAction(actionType, baseCase.warningRound);
  const isTerminationAction = actionType === "termination";
  const escalationState =
    actionOption?.defaultEscalationState ||
    (warningRound >= 3 ? getInitialEscalationState(warningRound, baseCase.escalationState) : "none");
  const closeState: FollowUpCloseState | undefined = isTerminationAction ? "terminated" : undefined;

  const event: FollowUpActionEvent = {
    id: `${baseCase.id}-${now}`,
    type: actionType,
    label: FOLLOW_UP_ACTION_LABELS[actionType],
    actionKind: actionOption?.actionKind,
    status: "document_issued",
    note: baseCase.pendingActionNote || undefined,
    warningRound,
    nextFollowUpDate: isTerminationAction ? undefined : baseCase.pendingActionNextFollowUpDate || undefined,
    suspensionDays: actionOption?.suspensionDays,
    warningValidityDays: actionOption?.warningValidityDays,
    closeState,
    escalationState,
    actedAt: now,
    actedByUid: actor.uid,
    actedByName: actor.name,
    actedByRole: actor.role,
  };

  return {
    ...baseCase,
    status: "document_issued",
    warningRound,
    noActionReason: "",
    closeReason: "",
    closeState: undefined,
    escalationState,
    nextFollowUpDate: isTerminationAction ? "" : baseCase.pendingActionNextFollowUpDate || baseCase.nextFollowUpDate || "",
    pendingActionType: undefined,
    pendingActionNote: undefined,
    pendingActionNextFollowUpDate: undefined,
    pendingActionProposedAt: undefined,
    pendingActionProposedByUid: undefined,
    pendingActionProposedByName: undefined,
    pendingActionProposedByRole: undefined,
    actions: [...(baseCase.actions || []), event],
    lastActionAt: now,
    updatedAt: now,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    updatedByRole: actor.role,
  };
};

/**
 * ทางออกฉุกเฉินสำหรับเคสที่ค้างอยู่กลาง Flow (เช่น ข้อมูลเก่าที่ย้ายมาไม่ครบ หรือกดผิดขั้นตอน)
 * รีเซ็ตกลับไปที่ "รอเสนอการดำเนินการ" (pending) ล้างข้อเสนอ/ผลการพิจารณา HRM ที่ค้างอยู่ทั้งหมด
 * แต่ยังเก็บประวัติการดำเนินการเดิมไว้ในบันทึก ไม่ลบทิ้ง เพื่อให้เริ่มกระบวนการเสนอใหม่ได้สะอาด
 */
export const resetFollowUpToPending = (
  baseCase: EmployeeFollowUpCase,
  actor: FollowUpActorSnapshot,
  now: number
): EmployeeFollowUpCase => {
  const event: FollowUpActionEvent = {
    id: `${baseCase.id}-${now}`,
    type: "status_updated",
    label: "รีเซ็ตกระบวนการกลับไปเริ่มต้นใหม่",
    status: "pending",
    warningRound: baseCase.warningRound,
    actedAt: now,
    actedByUid: actor.uid,
    actedByName: actor.name,
    actedByRole: actor.role,
  };
  return {
    ...baseCase,
    status: "pending",
    pendingActionType: undefined,
    pendingActionNote: undefined,
    pendingActionNextFollowUpDate: undefined,
    pendingActionProposedAt: undefined,
    pendingActionProposedByUid: undefined,
    pendingActionProposedByName: undefined,
    pendingActionProposedByRole: undefined,
    hrmReviewStatus: "not_requested",
    hrmReviewComment: "",
    hrmReviewedAt: 0,
    hrmReviewedByUid: "",
    hrmReviewedByName: "",
    hrmReviewedByRole: "",
    documentDraft: undefined,
    documentReviewStatus: "not_prepared",
    documentReviewComment: "",
    documentReviewedAt: 0,
    documentReviewedByUid: "",
    documentReviewedByName: "",
    noActionReason: "",
    closeReason: "",
    closeState: undefined,
    actions: [...(baseCase.actions || []), event],
    lastActionAt: now,
    updatedAt: now,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    updatedByRole: actor.role,
  };
};

export const getDefaultHrmReviewStatus = (item: Partial<EmployeeFollowUpCase>): FollowUpHrmReviewStatus => {
  if (item.hrmReviewStatus && item.hrmReviewStatus !== "not_requested") return item.hrmReviewStatus;
  if (item.status === "awaiting_hrm_review") return "pending";
  if (
    item.status === "closed" ||
    item.status === "no_action" ||
      item.status === "approved_pending_execution" ||
      item.status === "awaiting_document_review" ||
      item.status === "approved_pending_issue" ||
      item.status === "document_issued"
  )
    return "approved";
  const actions = item.actions || [];
  const explicitReview = [...actions]
    .reverse()
    .find((action) => action.hrmReviewStatus === "approved" || action.hrmReviewStatus === "commented");
  if (explicitReview?.hrmReviewStatus) return explicitReview.hrmReviewStatus;
  return "not_requested";
};

/**
 * Migration (ทำเป็น runtime normalization ครั้งเดียว ไม่ backfill ข้อมูลจริงใน Firestore):
 * เคสเก่าที่ค้างอยู่สถานะ "in_progress" (มาจาก Flow เดิมที่ HR กด "ดำเนินการ" ครั้งเดียวจบ ไม่มีขั้นเสนอ/อนุมัติ)
 * จะถูกแปลงเป็นสถานะใหม่ดังนี้:
 *  - ถ้ามีการบันทึก action มาก่อนแล้ว (เคยดำเนินการจริง) -> "approved_pending_execution" เพื่อให้ HR
 *    กลับมาเดินหน้าต่อที่ขั้นออกเอกสารป็นทางการ (เอกสารยังไม่เคยถูกสร้างในระบบเดิม)
 *  - ถ้ายังไม่มี action ใดๆ -> "proposed" (เทียบเท่ากับเพิ่งเริ่มเสนอการดำเนินการ)
 * สถานะ "awaiting_hrm_review" คงเดิมตามที่ตกลงไว้ในแผน
 */
const migrateLegacyStatus = (item: EmployeeFollowUpCase): FollowUpStatus => {
  if (item.status === "closed" && item.closeState === "no_action") return "no_action";
  if ((item.status as string) === "in_progress") {
    return (item.actions || []).length > 0 ? "approved_pending_execution" : "proposed";
  }
  return item.status;
};

export const normalizeFollowUpCase = (item: EmployeeFollowUpCase): EmployeeFollowUpCase => {
  const normalizedStatus = migrateLegacyStatus(item);
  return {
    ...item,
    status: normalizedStatus,
    escalationState: item.escalationState || getInitialEscalationState(item.warningRound),
    hrmReviewStatus: getDefaultHrmReviewStatus(item),
    hrmReviewComment: item.hrmReviewComment || "",
    hrmReviewedAt: Number(item.hrmReviewedAt || 0),
    hrmReviewedByUid: item.hrmReviewedByUid || "",
    hrmReviewedByName: item.hrmReviewedByName || "",
    hrmReviewedByRole: item.hrmReviewedByRole || "",
    requestedByRole: item.requestedByRole || "HR",
    documents: item.documents || [],
    documentReviewStatus: item.documentReviewStatus || "not_prepared",
    documentReviewComment: item.documentReviewComment || "",
    documentReviewedAt: Number(item.documentReviewedAt || 0),
    documentReviewedByUid: item.documentReviewedByUid || "",
    documentReviewedByName: item.documentReviewedByName || "",
  };
};

export const normalizeFollowUpPolicyConfig = (value: unknown): FollowUpPolicyConfig => {
  if (!value || typeof value !== "object") return DEFAULT_FOLLOW_UP_POLICY_CONFIG;
  const source = value as Partial<FollowUpPolicyConfig> & { actionOptions?: unknown; advisoryNotes?: unknown };
  const rawActionOptions: Partial<FollowUpDisciplinaryActionOption>[] = Array.isArray(source.actionOptions)
    ? source.actionOptions.filter((item) => !!item && typeof item === "object") as Partial<FollowUpDisciplinaryActionOption>[]
    : [];
  const actionOptions = rawActionOptions.length > 0
    ? DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS.map((defaultOption) => {
        const matched = rawActionOptions.find((item) => item.type === defaultOption.type);
        const matchedNotes = matched?.notes;
        const suspensionDays = Number(matched?.suspensionDays ?? defaultOption.suspensionDays ?? 0);
        return {
          ...defaultOption,
          ...matched,
          label: String(matched?.label || defaultOption.label),
          enabled: matched?.enabled ?? defaultOption.enabled,
          suspensionDays:
            defaultOption.actionKind === "suspension"
              ? Math.min(
                  Number(source.maxSuspensionDays || DEFAULT_FOLLOW_UP_POLICY_CONFIG.maxSuspensionDays),
                  suspensionDays || defaultOption.suspensionDays || DEFAULT_FOLLOW_UP_POLICY_CONFIG.maxSuspensionDays
                )
              : matched?.suspensionDays ?? defaultOption.suspensionDays,
          warningValidityDays: Number(
            matched?.warningValidityDays ||
              defaultOption.warningValidityDays ||
              source.warningLetterValidityDays ||
              DEFAULT_FOLLOW_UP_POLICY_CONFIG.warningLetterValidityDays
          ),
          notes: Array.isArray(matchedNotes) ? matchedNotes.map((note) => String(note)) : defaultOption.notes,
        };
      })
    : DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS;

  return {
    primaryLanguage: "th",
    maxSuspensionDays: Math.min(
      7,
      Number(source.maxSuspensionDays || DEFAULT_FOLLOW_UP_POLICY_CONFIG.maxSuspensionDays) || 7
    ),
    warningLetterValidityDays:
      Number(source.warningLetterValidityDays || DEFAULT_FOLLOW_UP_POLICY_CONFIG.warningLetterValidityDays) || 365,
    allowNonSequentialEscalation:
      source.allowNonSequentialEscalation ?? DEFAULT_FOLLOW_UP_POLICY_CONFIG.allowNonSequentialEscalation,
    allowSeriousOffenseFastTrack:
      source.allowSeriousOffenseFastTrack ?? DEFAULT_FOLLOW_UP_POLICY_CONFIG.allowSeriousOffenseFastTrack,
    actionOptions,
    advisoryNotes: Array.isArray(source.advisoryNotes)
      ? source.advisoryNotes.map((note) => String(note))
      : DEFAULT_FOLLOW_UP_POLICY_CONFIG.advisoryNotes,
  };
};

export const buildFollowUpCaseFromRiskSeed = (
  seed: FollowUpRiskSeed,
  issueKey: RiskRuleKey,
  actor: FollowUpActorSnapshot,
  now: number,
  overrides: Partial<EmployeeFollowUpCase> = {}
): EmployeeFollowUpCase => {
  const issue = seed.rules.find((item) => item.key === issueKey);
  if (!issue) {
    throw new Error(`Follow-up issue "${issueKey}" not found for employee "${seed.employeeId}"`);
  }

  return {
    id: getFollowUpDocId(seed.employeeId, issue.key),
    employeeId: seed.employeeId,
    employeeCode: seed.employeeCode,
    employeeName: seed.employeeName,
    position: seed.position,
    employeeType: seed.employeeType,
    projectName: seed.projectName,
    projectNames: seed.projectNames,
    issueType: issue.key,
    issueLabel: issue.label,
    issueReason: issue.reason,
    sourceRiskRuleKeys: seed.rules.map((item) => item.key),
    sourceRiskReasons: seed.rules.map((item) => item.reason),
    riskScoreSnapshot: seed.totalScore,
    severitySnapshot: seed.severity,
    status: "pending",
    ownerUid: "",
    ownerName: "",
    ownerRole: "",
    warningRound: 0,
    actions: [],
    noActionReason: "",
    closeReason: "",
    closeState: undefined,
    escalationState: "none",
    hrmReviewStatus: "not_requested",
    hrmReviewComment: "",
    hrmReviewedAt: 0,
    hrmReviewedByUid: "",
    hrmReviewedByName: "",
    hrmReviewedByRole: "",
    documentReviewStatus: "not_prepared",
    documentReviewComment: "",
    documentReviewedAt: 0,
    documentReviewedByUid: "",
    documentReviewedByName: "",
    nextFollowUpDate: "",
    latestIncidentDate: seed.latestIncidentDate,
    lastActionAt: 0,
    createdAt: now,
    updatedAt: now,
    createdByUid: actor.uid,
    createdByName: actor.name,
    createdByRole: actor.role,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    updatedByRole: actor.role,
    ...overrides,
  };
};
