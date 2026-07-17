import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, getFirestore, onSnapshot, setDoc, deleteField } from "firebase/firestore";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  canInterpretFollowUpEscalation,
  canManageFollowUpFirstStage,
  canManageFollowUpModule,
  canProposeFollowUpAction,
  canRequestFollowUpAsAdminSite,
  canReviewFollowUpByHRM,
  canViewFollowUpModule,
  DEFAULT_FOLLOW_UP_POLICY_CONFIG,
  EMPLOYEE_FOLLOW_UP_COLLECTION,
  EmployeeFollowUpCase,
  executeApprovedAction,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_CLOSE_STATE_LABELS,
  FOLLOW_UP_CLOSE_STATE_OPTIONS,
  FOLLOW_UP_ESCALATION_LABELS,
  FOLLOW_UP_ESCALATION_OPTIONS,
  FOLLOW_UP_HRM_REVIEW_LABELS,
  FOLLOW_UP_HRM_REVIEW_OPTIONS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_OPTIONS,
  FollowUpActionEvent,
  FollowUpActionType,
  FollowUpActorSnapshot,
  FollowUpCloseState,
  FollowUpDisciplinaryActionOption,
  FollowUpDocumentRecord,
  FollowUpEscalationState,
  FollowUpHrmReviewStatus,
  FollowUpPolicyConfig,
  FollowUpRiskSeed,
  FollowUpStatus,
  buildFollowUpCaseFromRiskSeed,
  canSelectFollowUpAction,
  getDefaultHrmReviewStatus,
  getFollowUpActionOption,
  getFollowUpDocId,
  getInitialEscalationState,
  isFollowUpProcessedStatus,
  isWatchOnlyIssueType,
  normalizeFollowUpCase,
  proposeAction,
} from "./employeeFollowUpConfig";
import {
  FOLLOW_UP_TEMPLATE_LABELS,
  FollowUpTemplateKey,
  generateAndDownloadFollowUpDocument,
  resolveFollowUpTemplateKeys,
} from "../utils/followUpDocuments";
import { uploadUserSignature } from "../utils/signatureStorage";

interface AppUser {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string[];
  status?: string;
  assignedProjects?: string[];
  signatureImageUrl?: string;
}

const normalizeProjectKey = (value: string): string => String(value || "").trim().split(" - ")[0].trim().toLowerCase();

/** เทียบโครงการแบบ fuzzy โดยอ้างอิงจากเลขที่โครงการ (ก่อนขีด " - ") เพื่อรองรับข้อมูลที่บันทึกไม่ตรงรูปแบบกัน */
const isProjectAssigned = (assignedProjects: string[] | undefined, projectName: string | undefined): boolean => {
  if (!projectName) return false;
  const target = normalizeProjectKey(projectName);
  if (!target) return false;
  return (assignedProjects || []).some((project) => normalizeProjectKey(project) === target);
};

interface FollowUpLaunchContext {
  seed: FollowUpRiskSeed;
  preferredIssueKey?: FollowUpRiskSeed["rules"][number]["key"];
  requestedAt: number;
}

interface WarningActionDraft {
  type: FollowUpDisciplinaryActionOption["type"];
  note: string;
  nextFollowUpDate: string;
}

interface StatusDraft {
  status: FollowUpStatus;
  note: string;
  reason: string;
  nextFollowUpDate: string;
  closeReason: string;
  closeState: FollowUpCloseState;
}

interface HrmReviewDraft {
  status: Exclude<FollowUpHrmReviewStatus, "not_requested" | "pending">;
  comment: string;
}

interface FollowUpQueueItem extends EmployeeFollowUpCase {
  source: "persisted" | "detected";
  isSynthetic: boolean;
  isCurrentlyDetected: boolean;
  detectionWindowLabel?: string;
}

const SYSTEM_ACTOR: FollowUpActorSnapshot = {
  uid: "system",
  name: "ระบบตรวจจับ",
  role: "system",
};

const emptyWarningActionDraft = (type: FollowUpDisciplinaryActionOption["type"]): WarningActionDraft => ({
  type,
  note: "",
  nextFollowUpDate: "",
});

const buildStatusDraft = (item: FollowUpQueueItem): StatusDraft => ({
  status: item.status,
  note: "",
  reason: item.noActionReason || "",
  nextFollowUpDate: item.nextFollowUpDate || "",
  closeReason: item.closeReason || "",
  closeState: item.closeState && item.closeState !== "no_action" ? item.closeState : "resolved",
});

const formatDate = (value?: string): string => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH");
};

const formatDateTime = (value?: number): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
};

const userName = (user?: AppUser | null): string =>
  user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.uid : "-";

const roleText = (roles?: string[]): string => {
  if (!roles || roles.length === 0) return "-";
  if (roles.includes("HRM")) return "HRM";
  if (roles.includes("HR")) return "HR";
  return roles[0];
};

const statusBadgeClass: Record<FollowUpStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  proposed: "border-sky-200 bg-sky-50 text-sky-700",
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  awaiting_hrm_review: "border-violet-200 bg-violet-50 text-violet-700",
  approved_pending_execution: "border-indigo-200 bg-indigo-50 text-indigo-700",
  document_issued: "border-teal-200 bg-teal-50 text-teal-700",
  no_action: "border-slate-200 bg-slate-100 text-slate-700",
  closed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const escalationBadgeClass: Record<FollowUpEscalationState, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  hrm_review_required: "border-orange-200 bg-orange-50 text-orange-700",
  termination_consideration: "border-rose-200 bg-rose-50 text-rose-700",
};

const severityBadgeClass: Record<FollowUpRiskSeed["severity"], string> = {
  normal: "border-slate-200 bg-slate-50 text-slate-600",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  risk: "border-orange-200 bg-orange-50 text-orange-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
  critical: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
};

const warningRoundLabel = (round: EmployeeFollowUpCase["warningRound"]): string =>
  round === 0 ? "ยังไม่ออกหนังสือเตือน" : `หนังสือเตือนครั้งที่ ${round}`;

const queueStatusRank: Record<FollowUpStatus, number> = {
  pending: 0,
  proposed: 1,
  awaiting_hrm_review: 2,
  approved_pending_execution: 3,
  document_issued: 4,
  in_progress: 2,
  no_action: 5,
  closed: 6,
};

const hrmReviewBadgeClass: Record<FollowUpHrmReviewStatus, string> = {
  not_requested: "border-slate-200 bg-slate-50 text-slate-500",
  pending: "border-violet-200 bg-violet-50 text-violet-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  commented: "border-orange-200 bg-orange-50 text-orange-700",
};

const getWorkflowLabel = (item: Pick<FollowUpQueueItem, "hrmReviewStatus" | "status">): string => {
  if (item.hrmReviewStatus === "commented") return "HRM ส่งความเห็นกลับ ให้ผู้เสนอทบทวนใหม่";
  if (item.status === "awaiting_hrm_review") return "รอ HRM พิจารณา";
  if (item.status === "approved_pending_execution") return "HRM อนุมัติแล้ว รอ HR ดำเนินการ+ออกเอกสาร";
  if (item.status === "document_issued") return "ออกเอกสารแล้ว รอ HRM ปิดเคส";
  if (item.status === "closed") return "ปิดเคสแล้ว";
  if (item.status === "no_action") return "ไม่ต้องดำเนินการ";
  if (item.status === "proposed") return "เสนอการดำเนินการแล้ว";
  if (item.status === "in_progress") return "ค่าเดิม (ก่อนย้าย flow ใหม่)";
  return "รอเสนอการดำเนินการ";
};

// แท็บตามขั้นตอนของ Flow ใหม่ (เสนอ → HRM พิจารณา → ดำเนินการ → ออกเอกสาร) เพื่อให้แต่ละบทบาทหาเคสของตัวเองได้ง่ายขึ้น
type StageFilter = "all" | "to_propose" | "hrm_review" | "to_execute" | "to_document";

const STAGE_STATUS_MAP: Record<Exclude<StageFilter, "all">, FollowUpStatus[]> = {
  to_propose: ["pending", "proposed"],
  hrm_review: ["awaiting_hrm_review"],
  to_execute: ["approved_pending_execution"],
  to_document: ["document_issued"],
};

const shouldShowInQueue = (item: FollowUpQueueItem): boolean =>
  item.isCurrentlyDetected ||
  item.status === "pending" ||
  item.status === "proposed" ||
  item.status === "in_progress" ||
  item.status === "awaiting_hrm_review" ||
  item.status === "approved_pending_execution" ||
  item.status === "document_issued";

const shouldShowInBacklog = (item: FollowUpQueueItem): boolean =>
  !item.isSynthetic &&
  !item.isCurrentlyDetected &&
  isFollowUpProcessedStatus(item.status) &&
  item.hrmReviewStatus !== "pending" &&
  item.hrmReviewStatus !== "commented";

const createNextHrmReviewFields = (
  baseCase: EmployeeFollowUpCase,
  actorRole: string,
  submitToHrm = false
): Pick<
  EmployeeFollowUpCase,
  "hrmReviewStatus" | "hrmReviewComment" | "hrmReviewedAt" | "hrmReviewedByUid" | "hrmReviewedByName" | "hrmReviewedByRole"
> => {
  if (submitToHrm) {
    return {
      hrmReviewStatus: "pending",
      hrmReviewComment: "",
      hrmReviewedAt: 0,
      hrmReviewedByUid: "",
      hrmReviewedByName: "",
      hrmReviewedByRole: "",
    };
  }
  if (actorRole === "HR") {
    return {
      hrmReviewStatus: "not_requested",
      hrmReviewComment: baseCase.hrmReviewComment || "",
      hrmReviewedAt: baseCase.hrmReviewedAt || 0,
      hrmReviewedByUid: baseCase.hrmReviewedByUid || "",
      hrmReviewedByName: baseCase.hrmReviewedByName || "",
      hrmReviewedByRole: baseCase.hrmReviewedByRole || "",
    };
  }
  return {
    hrmReviewStatus: baseCase.hrmReviewStatus || "not_requested",
    hrmReviewComment: baseCase.hrmReviewComment || "",
    hrmReviewedAt: baseCase.hrmReviewedAt || 0,
    hrmReviewedByUid: baseCase.hrmReviewedByUid || "",
    hrmReviewedByName: baseCase.hrmReviewedByName || "",
    hrmReviewedByRole: baseCase.hrmReviewedByRole || "",
  };
};

const summarizeTopGroups = (items: string[]): Array<{ key: string; count: number }> =>
  Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "th"))
    .slice(0, 3);

const toPersistedCase = (
  item: FollowUpQueueItem,
  actor: FollowUpActorSnapshot,
  now: number
): EmployeeFollowUpCase => ({
  id: item.id,
  employeeId: item.employeeId,
  employeeCode: item.employeeCode,
  employeeName: item.employeeName,
  position: item.position,
  employeeType: item.employeeType,
  projectName: item.projectName,
  projectNames: item.projectNames,
  issueType: item.issueType,
  issueLabel: item.issueLabel,
  issueReason: item.issueReason,
  sourceRiskRuleKeys: item.sourceRiskRuleKeys,
  sourceRiskReasons: item.sourceRiskReasons,
  riskScoreSnapshot: item.riskScoreSnapshot,
  severitySnapshot: item.severitySnapshot,
  status: item.status,
  ownerUid: item.ownerUid || "",
  ownerName: item.ownerName || "",
  ownerRole: item.ownerRole || "",
  warningRound: item.warningRound,
  actions: item.actions || [],
  noActionReason: item.noActionReason || "",
  closeReason: item.closeReason || "",
  closeState: item.closeState,
  escalationState: item.escalationState || getInitialEscalationState(item.warningRound),
  hrmReviewStatus: item.hrmReviewStatus || "not_requested",
  hrmReviewComment: item.hrmReviewComment || "",
  hrmReviewedAt: item.hrmReviewedAt || 0,
  hrmReviewedByUid: item.hrmReviewedByUid || "",
  hrmReviewedByName: item.hrmReviewedByName || "",
  hrmReviewedByRole: item.hrmReviewedByRole || "",
  nextFollowUpDate: item.nextFollowUpDate || "",
  latestIncidentDate: item.latestIncidentDate,
  lastActionAt: item.lastActionAt || 0,
  createdAt: item.createdAt || now,
  updatedAt: item.updatedAt || now,
  createdByUid: item.createdByUid || actor.uid,
  createdByName: item.createdByName || actor.name,
  createdByRole: item.createdByRole || actor.role,
  updatedByUid: item.updatedByUid || actor.uid,
  updatedByName: item.updatedByName || actor.name,
  updatedByRole: item.updatedByRole || actor.role,
  pendingActionType: item.pendingActionType,
  pendingActionNote: item.pendingActionNote || "",
  pendingActionNextFollowUpDate: item.pendingActionNextFollowUpDate || "",
  pendingActionProposedAt: item.pendingActionProposedAt || 0,
  pendingActionProposedByUid: item.pendingActionProposedByUid || "",
  pendingActionProposedByName: item.pendingActionProposedByName || "",
  pendingActionProposedByRole: item.pendingActionProposedByRole || "",
  requestedByRole: item.requestedByRole,
  requestedProject: item.requestedProject || "",
  claimedByUid: item.claimedByUid || "",
  claimedByName: item.claimedByName || "",
  claimedByRole: item.claimedByRole,
  claimedProject: item.claimedProject || "",
  documents: item.documents || [],
});

export const EmployeeFollowUpTab = ({
  view = "queue",
  cases,
  detectedRiskSeeds,
  policyConfig = DEFAULT_FOLLOW_UP_POLICY_CONFIG,
  pendingLaunch,
  onPendingLaunchHandled,
}: {
  view?: "queue" | "backlog";
  cases: EmployeeFollowUpCase[];
  detectedRiskSeeds: FollowUpRiskSeed[];
  policyConfig?: FollowUpPolicyConfig;
  pendingLaunch: FollowUpLaunchContext | null;
  onPendingLaunchHandled: () => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();

  const roles = userProfile?.role || [];
  const canRequestAsAdminSite = canRequestFollowUpAsAdminSite(roles);
  const canView = canViewFollowUpModule(roles) || canRequestAsAdminSite;
  const canManage = canManageFollowUpModule(roles);
  const canManageFirstStage = canManageFollowUpFirstStage(roles);
  const canPropose = canProposeFollowUpAction(roles);
  const canReviewByHrm = canReviewFollowUpByHRM(roles);
  const canInterpretEscalation = canInterpretFollowUpEscalation(roles);
  const actorName =
    `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() || firebaseUser?.email || "unknown";
  const actorRole = roleText(roles);
  const actor: FollowUpActorSnapshot | null = firebaseUser
    ? { uid: firebaseUser.uid, name: actorName, role: actorRole }
    : null;
  // Admin Site เห็น/ดำเนินการได้เฉพาะเคสในโครงการที่ตนได้รับมอบหมายเท่านั้น (ไม่เห็นข้อมูลข้ามโครงการ)
  const isAdminSiteOnly = canRequestAsAdminSite && !canManage;
  const myAssignedProjects = userProfile?.assignedProjects || [];

  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FollowUpStatus>("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const defaultStageAppliedRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState("all");
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<StatusDraft | null>(null);
  const [actionDraft, setActionDraft] = useState<WarningActionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState("");
  const [escalationDraft, setEscalationDraft] = useState<FollowUpEscalationState>("none");
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2600);
  };
  const [hrmReviewDraft, setHrmReviewDraft] = useState<HrmReviewDraft>({
    status: "approved",
    comment: "",
  });
  const enabledActionOptions = useMemo(
    () => policyConfig.actionOptions.filter((option) => option.enabled),
    [policyConfig.actionOptions]
  );

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "users"), (snap) => {
      setUsers(snap.docs.map((item) => ({ uid: item.id, ...(item.data() as any) } as AppUser)));
    });
    return () => unsub();
  }, [db]);

  const operatorUsers = useMemo(
    () =>
      users
        .filter((user) => user.status === "approved")
        .filter((user) => (user.role || []).some((role) => role === "HR" || role === "HRM"))
        .sort((a, b) => userName(a).localeCompare(userName(b), "th")),
    [users]
  );

  const detectedIssueMap = useMemo(() => {
    const map = new Map<
      string,
      {
        seed: FollowUpRiskSeed;
        issue: FollowUpRiskSeed["rules"][number];
      }
    >();
    detectedRiskSeeds.forEach((seed) => {
      seed.rules.forEach((issue) => {
        map.set(getFollowUpDocId(seed.employeeId, issue.key), { seed, issue });
      });
    });
    return map;
  }, [detectedRiskSeeds]);

  const queueItems = useMemo(() => {
    const items = new Map<string, FollowUpQueueItem>();

    cases.forEach((item) => {
      const detected = detectedIssueMap.get(item.id);
      const normalizedItem: EmployeeFollowUpCase = {
        ...normalizeFollowUpCase(item),
        actions: item.actions || [],
        projectNames: item.projectNames || [],
        sourceRiskRuleKeys: item.sourceRiskRuleKeys || [],
        sourceRiskReasons: item.sourceRiskReasons || [],
      };
      const merged: EmployeeFollowUpCase = detected
        ? {
            ...normalizedItem,
            position: detected.seed.position || normalizedItem.position,
            employeeType: detected.seed.employeeType || normalizedItem.employeeType,
            projectName: detected.seed.projectName || normalizedItem.projectName,
            projectNames:
              detected.seed.projectNames.length > 0 ? detected.seed.projectNames : normalizedItem.projectNames,
            issueLabel: detected.issue.label,
            issueReason: detected.issue.reason,
            sourceRiskRuleKeys: detected.seed.rules.map((rule) => rule.key),
            sourceRiskReasons: detected.seed.rules.map((rule) => rule.reason),
            riskScoreSnapshot: detected.seed.totalScore,
            severitySnapshot: detected.seed.severity,
            latestIncidentDate: detected.seed.latestIncidentDate || normalizedItem.latestIncidentDate,
          }
        : normalizedItem;

      items.set(item.id, {
        ...merged,
        source: "persisted",
        isSynthetic: false,
        isCurrentlyDetected: !!detected,
        detectionWindowLabel: detected
          ? `${formatDate(detected.seed.evaluatedFrom)} - ${formatDate(detected.seed.evaluatedTo)}`
          : undefined,
      });
    });

    detectedIssueMap.forEach(({ seed, issue }, id) => {
      if (items.has(id)) return;
      const synthetic = buildFollowUpCaseFromRiskSeed(seed, issue.key, SYSTEM_ACTOR, 0, {
        createdAt: 0,
        updatedAt: 0,
        lastActionAt: 0,
        createdByUid: "",
        createdByName: "",
        createdByRole: "",
        updatedByUid: "",
        updatedByName: "",
        updatedByRole: "",
      });
      items.set(id, {
        ...synthetic,
        source: "detected",
        isSynthetic: true,
        isCurrentlyDetected: true,
        detectionWindowLabel: `${formatDate(seed.evaluatedFrom)} - ${formatDate(seed.evaluatedTo)}`,
      });
    });

    const all = Array.from(items.values());
    // Admin Site เห็นเฉพาะเคสของพนักงานในโครงการที่ตนได้รับมอบหมายเท่านั้น (จำกัดขอบเขตเหมือนหน้าอื่นๆ ของระบบ)
    if (!isAdminSiteOnly) return all;
    return all.filter((item) => isProjectAssigned(myAssignedProjects, item.projectName));
  }, [cases, detectedIssueMap, isAdminSiteOnly, myAssignedProjects]);

  const projectOptions = useMemo(
    () =>
      Array.from(new Set(queueItems.map((item) => item.projectName).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    [queueItems]
  );

  const employeeTypeOptions = useMemo(
    () =>
      Array.from(new Set(queueItems.map((item) => item.employeeType).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    [queueItems]
  );

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...queueItems]
      .filter((item) => (view === "queue" ? shouldShowInQueue(item) : shouldShowInBacklog(item)))
      .filter((item) =>
        view === "queue" && stageFilter !== "all" ? STAGE_STATUS_MAP[stageFilter].includes(item.status) : true
      )
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => (ownerFilter === "all" ? true : (item.ownerUid || "") === ownerFilter))
      .filter((item) => (projectFilter === "all" ? true : item.projectName === projectFilter))
      .filter((item) => (employeeTypeFilter === "all" ? true : (item.employeeType || "") === employeeTypeFilter))
      .filter((item) => {
        if (!q) return true;
        return [
          item.employeeName,
          item.employeeCode,
          item.projectName,
          item.employeeType,
          item.issueLabel,
          item.ownerName || "",
          item.issueReason,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) =>
          Number(b.hrmReviewStatus === "commented") - Number(a.hrmReviewStatus === "commented") ||
          Number(b.hrmReviewStatus === "pending") - Number(a.hrmReviewStatus === "pending") ||
          Number(b.isCurrentlyDetected) - Number(a.isCurrentlyDetected) ||
          queueStatusRank[a.status] - queueStatusRank[b.status] ||
          (b.lastActionAt || b.updatedAt || 0) - (a.lastActionAt || a.updatedAt || 0) ||
          b.riskScoreSnapshot - a.riskScoreSnapshot
      );
  }, [employeeTypeFilter, ownerFilter, projectFilter, queueItems, search, stageFilter, statusFilter, view]);

  const pendingLaunchPreferredId = useMemo(() => {
    if (!pendingLaunch) return "";
    if (pendingLaunch.preferredIssueKey) {
      return getFollowUpDocId(pendingLaunch.seed.employeeId, pendingLaunch.preferredIssueKey);
    }
    return (
      pendingLaunch.seed.rules
        .map((rule) => getFollowUpDocId(pendingLaunch.seed.employeeId, rule.key))
        .find((id) => queueItems.some((item) => item.id === id)) || ""
    );
  }, [pendingLaunch, queueItems]);

  const selectedCase = queueItems.find((item) => item.id === selectedCaseId);

  useEffect(() => {
    if (!pendingLaunchPreferredId) return;
    setSelectedCaseId(pendingLaunchPreferredId);
    setIsCaseModalOpen(true);
  }, [pendingLaunchPreferredId]);

  // เปิดหน้ามาให้ตรงกับขั้นตอนที่บทบาทนั้นต้องทำก่อน เพื่อลดการไล่หาเคสเอง (ตั้งค่าเริ่มต้นครั้งเดียวหลังโหลดโปรไฟล์)
  useEffect(() => {
    if (defaultStageAppliedRef.current) return;
    if (!userProfile) return;
    defaultStageAppliedRef.current = true;
    if (canReviewByHrm) setStageFilter("hrm_review");
    else if (canPropose) setStageFilter("to_propose");
  }, [userProfile, canReviewByHrm, canPropose]);

  useEffect(() => {
    if (selectedCase) {
      setOwnerDraft(selectedCase.ownerUid || "");
      setEscalationDraft(selectedCase.escalationState || getInitialEscalationState(selectedCase.warningRound));
      setStatusDraft(buildStatusDraft(selectedCase));
      setHrmReviewDraft({
        status: selectedCase.hrmReviewStatus === "commented" ? "commented" : "approved",
        comment: selectedCase.hrmReviewComment || "",
      });
    } else {
      setOwnerDraft("");
      setEscalationDraft("none");
      setStatusDraft(null);
      setActionDraft(null);
      setHrmReviewDraft({ status: "approved", comment: "" });
    }
  }, [
    selectedCase?.id,
    selectedCase?.status,
    selectedCase?.ownerUid,
    selectedCase?.warningRound,
    selectedCase?.nextFollowUpDate,
    selectedCase?.closeReason,
    selectedCase?.noActionReason,
    selectedCase?.closeState,
    selectedCase?.escalationState,
    selectedCase?.hrmReviewStatus,
    selectedCase?.hrmReviewComment,
  ]);

  useEffect(() => {
    if (!isCaseModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (actionDraft) {
        setActionDraft(null);
        return;
      }
      setIsCaseModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionDraft, isCaseModalOpen]);

  useEffect(() => {
    if (!isCaseModalOpen && !actionDraft) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [actionDraft, isCaseModalOpen]);

  const summary = useMemo(() => {
    const scopedItems = queueItems.filter((item) => (view === "queue" ? shouldShowInQueue(item) : shouldShowInBacklog(item)));
    const total = scopedItems.length;
    const pending = scopedItems.filter((item) => item.status === "pending").length;
    const toPropose = scopedItems.filter((item) => item.status === "pending" || item.status === "proposed").length;
    const inProgress = scopedItems.filter((item) => item.status === "in_progress").length;
    const noAction = scopedItems.filter((item) => item.status === "no_action").length;
    const closed = scopedItems.filter((item) => item.status === "closed").length;
    const escalation = scopedItems.filter((item) => item.warningRound >= 3 || item.escalationState !== "none").length;
    const waitingHrm = scopedItems.filter((item) => item.status === "awaiting_hrm_review").length;
    const approvedPendingExecution = scopedItems.filter((item) => item.status === "approved_pending_execution").length;
    const documentIssued = scopedItems.filter((item) => item.status === "document_issued").length;
    const hrmCommented = scopedItems.filter((item) => item.hrmReviewStatus === "commented").length;
    const hrmApproved = scopedItems.filter((item) => item.hrmReviewStatus === "approved").length;
    const topProjects = summarizeTopGroups(scopedItems.map((item) => item.projectName || "ไม่ระบุโครงการ"));
    const topOwners = summarizeTopGroups(scopedItems.map((item) => item.ownerName || "ยังไม่ระบุผู้รับผิดชอบ"));
    const workflowMix = summarizeTopGroups(scopedItems.map((item) => getWorkflowLabel(item)));
    const actionMix = summarizeTopGroups(
      scopedItems.map((item) => item.actions[item.actions.length - 1]?.label || FOLLOW_UP_STATUS_LABELS[item.status])
    );
    const escalationMix = summarizeTopGroups(
      scopedItems.map((item) =>
        item.escalationState && item.escalationState !== "none"
          ? FOLLOW_UP_ESCALATION_LABELS[item.escalationState]
          : "ปกติ"
      )
    );
    const closeMix = summarizeTopGroups(
      scopedItems
        .map((item) =>
          item.status === "closed"
            ? FOLLOW_UP_CLOSE_STATE_LABELS[item.closeState || "resolved"]
            : item.status === "no_action"
              ? FOLLOW_UP_STATUS_LABELS.no_action
              : ""
        )
        .filter(Boolean)
    );
    return {
      total,
      pending,
      toPropose,
      inProgress,
      noAction,
      closed,
      escalation,
      waitingHrm,
      approvedPendingExecution,
      documentIssued,
      hrmCommented,
      hrmApproved,
      topProjects,
      topOwners,
      workflowMix,
      actionMix,
      escalationMix,
      closeMix,
    };
  }, [queueItems, view]);

  const logActivity = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: firebaseUser?.email ?? "anonymous",
        module: "Risk Monitoring",
        action,
        details,
        createdAt: Date.now(),
      });
    } catch {
      // ignore activity log failures
    }
  };

  // Helper to deep remove undefined values
  const stripUndefined = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  };

  const persistCase = async (nextCase: EmployeeFollowUpCase, action: string, details: string) => {
    // Convert undefined values to deleteField() at the root to properly remove fields,
    // and deep strip undefined from nested objects/arrays to prevent Firestore errors.
    const firestoreData = Object.fromEntries(
      Object.entries(nextCase).map(([key, value]) => [
        key,
        value === undefined ? deleteField() : stripUndefined(value),
      ])
    );
    await setDoc(doc(db, "CMG-HR-Database", "root", EMPLOYEE_FOLLOW_UP_COLLECTION, nextCase.id), firestoreData, { merge: true });
    await logActivity(action, details);
  };

  const materializeSelectedCase = (item: FollowUpQueueItem, now: number): EmployeeFollowUpCase | null => {
    if (!actor) return null;
    if (item.isSynthetic) {
      const detected = detectedIssueMap.get(item.id);
      if (!detected) return null;
      return buildFollowUpCaseFromRiskSeed(detected.seed, detected.issue.key, actor, now, {
        status: item.status,
        ownerUid: item.ownerUid || "",
        ownerName: item.ownerName || "",
        ownerRole: item.ownerRole || "",
        warningRound: item.warningRound,
        actions: item.actions || [],
        noActionReason: item.noActionReason || "",
        closeReason: item.closeReason || "",
        closeState: item.closeState,
        escalationState: item.escalationState || getInitialEscalationState(item.warningRound),
        hrmReviewStatus: item.hrmReviewStatus || "not_requested",
        hrmReviewComment: item.hrmReviewComment || "",
        hrmReviewedAt: item.hrmReviewedAt || 0,
        hrmReviewedByUid: item.hrmReviewedByUid || "",
        hrmReviewedByName: item.hrmReviewedByName || "",
        hrmReviewedByRole: item.hrmReviewedByRole || "",
        nextFollowUpDate: item.nextFollowUpDate || "",
        latestIncidentDate: item.latestIncidentDate,
        lastActionAt: item.lastActionAt || 0,
      });
    }
    return toPersistedCase(item, actor, now);
  };

  const saveOwner = async () => {
    if (!canManage || !selectedCase || !actor) return;
    const owner = operatorUsers.find((user) => user.uid === ownerDraft);
    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }

    const nextCase: EmployeeFollowUpCase = {
      ...baseCase,
      ownerUid: owner?.uid || "",
      ownerName: owner ? userName(owner) : "",
      ownerRole: owner ? roleText(owner.role) : "",
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedByRole: actor.role,
    };

    setBusy(true);
    try {
      await persistCase(
        nextCase,
        "อัปเดตผู้รับผิดชอบรายการติดตาม",
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel} · ${
          nextCase.ownerName || "ยังไม่ระบุ"
        }`
      );
      showToast("บันทึกผู้รับผิดชอบแล้ว");
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async (overrideDraft?: StatusDraft) => {
    const draft = overrideDraft || statusDraft;
    if (!canManage || !selectedCase || !draft || !actor) return;
    if ((draft.status === "closed" || draft.status === "no_action") && !canReviewByHrm) {
      window.alert("การปิดเคสหรือระบุว่าไม่ต้องดำเนินการ ต้องให้ HRM เป็นผู้สรุปผลสุดท้าย");
      return;
    }
    if (
      canReviewByHrm &&
      selectedCase.status === "awaiting_hrm_review" &&
      (draft.status === "pending" || draft.status === "in_progress")
    ) {
      window.alert("หาก HRM ต้องการส่งเคสกลับให้ HR ดำเนินการต่อ กรุณาใช้ส่วน 'ขั้น HRM อนุมัติ / ให้ความเห็น'");
      return;
    }
    if (draft.status === "awaiting_hrm_review" && !canManageFirstStage && !canReviewByHrm) {
      window.alert("เฉพาะ HR หรือ HRM เท่านั้นที่ส่งเคสเข้าสู่ขั้นรอ HRM พิจารณา");
      return;
    }

    if (draft.status === "no_action" && !draft.reason.trim()) {
      window.alert("กรุณาระบุเหตุผลสำหรับสถานะไม่ต้องดำเนินการ");
      return;
    }
    if (draft.status === "closed" && !draft.closeReason.trim()) {
      window.alert("กรุณาระบุเหตุผลการปิดติดตาม");
      return;
    }

    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }

    const nextStatus = draft.status;
    const noActionReason = nextStatus === "no_action" ? draft.reason.trim() : "";
    const closeReason = nextStatus === "closed" ? draft.closeReason.trim() : "";
    const closeState =
      nextStatus === "no_action" ? "no_action" : nextStatus === "closed" ? draft.closeState : undefined;
    const nextFollowUpDate =
      nextStatus === "pending" || nextStatus === "in_progress" ? draft.nextFollowUpDate || "" : "";
    const escalationState =
      baseCase.escalationState && baseCase.escalationState !== "none"
        ? baseCase.escalationState
        : baseCase.warningRound >= 3
          ? baseCase.escalationState || getInitialEscalationState(baseCase.warningRound)
          : "none";
    const nextHrmReview =
      nextStatus === "closed" || nextStatus === "no_action"
        ? {
            hrmReviewStatus: "approved" as const,
            hrmReviewComment: draft.note.trim() || baseCase.hrmReviewComment || "",
            hrmReviewedAt: now,
            hrmReviewedByUid: actor.uid,
            hrmReviewedByName: actor.name,
            hrmReviewedByRole: actor.role,
          }
        : createNextHrmReviewFields(baseCase, actor.role, nextStatus === "awaiting_hrm_review");

    const event: FollowUpActionEvent = {
      id: `${baseCase.id}-${now}`,
      type:
        nextStatus === "closed"
          ? "closed"
          : nextStatus === "no_action"
            ? "no_action_with_reason"
            : "status_updated",
      label:
        nextStatus === "closed"
          ? FOLLOW_UP_ACTION_LABELS.closed
          : nextStatus === "no_action"
            ? FOLLOW_UP_ACTION_LABELS.no_action_with_reason
            : nextStatus === "awaiting_hrm_review"
              ? "ส่งต่อให้ HRM พิจารณา"
            : `ตั้งสถานะ: ${FOLLOW_UP_STATUS_LABELS[nextStatus]}`,
      status: nextStatus,
      hrmReviewStatus: nextHrmReview.hrmReviewStatus,
      note: draft.note.trim() || undefined,
      reason: nextStatus === "no_action" ? noActionReason : undefined,
      warningRound: baseCase.warningRound,
      nextFollowUpDate: nextFollowUpDate || undefined,
      closeReason: nextStatus === "closed" ? closeReason : undefined,
      closeState,
      escalationState,
      actedAt: now,
      actedByUid: actor.uid,
      actedByName: actor.name,
      actedByRole: actor.role,
    };

    const nextCase: EmployeeFollowUpCase = {
      ...baseCase,
      status: nextStatus,
      noActionReason,
      closeReason,
      closeState,
      escalationState,
      nextFollowUpDate,
      ...nextHrmReview,
      actions: [...(baseCase.actions || []), event],
      lastActionAt: now,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedByRole: actor.role,
    };

    setBusy(true);
    try {
      await persistCase(
        nextCase,
        "อัปเดตสถานะรายการติดตาม",
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel} · ${
          FOLLOW_UP_STATUS_LABELS[nextStatus]
        }`
      );
      showToast("บันทึกสถานะแล้ว");
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  // ทางลัดสำหรับ HRM: "ไม่ต้องดำเนินการ" และ "ปิดเคส" โดยไม่ต้องเปิดฟอร์มจัดการสถานะแบบเต็ม
  const quickNoAction = () => {
    if (!selectedCase || !canReviewByHrm) return;
    const reason = window.prompt("เหตุผลที่ไม่ต้องดำเนินการ:", "");
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("กรุณาระบุเหตุผลสำหรับสถานะไม่ต้องดำเนินการ");
      return;
    }
    void saveStatus({
      status: "no_action",
      note: "",
      reason: reason.trim(),
      nextFollowUpDate: "",
      closeReason: "",
      closeState: "no_action",
    });
  };

  const quickClose = (closeState: FollowUpCloseState) => {
    if (!selectedCase || !canReviewByHrm) return;
    const reason = window.prompt(`เหตุผลการปิดติดตาม (${FOLLOW_UP_CLOSE_STATE_LABELS[closeState]}):`, "");
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("กรุณาระบุเหตุผลการปิดติดตาม");
      return;
    }
    void saveStatus({
      status: "closed",
      note: "",
      reason: "",
      nextFollowUpDate: "",
      closeReason: reason.trim(),
      closeState,
    });
  };

  const saveEscalation = async () => {
    if (!selectedCase || !actor || !canInterpretEscalation) return;
    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }
    const nextCase: EmployeeFollowUpCase = {
      ...baseCase,
      escalationState: escalationDraft,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedByRole: actor.role,
    };
    setBusy(true);
    try {
      await persistCase(
        nextCase,
        "อัปเดตสถานะยกระดับรายการติดตาม",
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel} · ${
          FOLLOW_UP_ESCALATION_LABELS[escalationDraft]
        }`
      );
      showToast("บันทึกสถานะยกระดับแล้ว");
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  const saveHrmReview = async () => {
    if (!selectedCase || !actor || !canReviewByHrm) return;
    if (hrmReviewDraft.status === "commented" && !hrmReviewDraft.comment.trim()) {
      window.alert("กรุณาระบุความเห็นของ HRM");
      return;
    }

    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }

    const reviewComment = hrmReviewDraft.comment.trim();
    const event: FollowUpActionEvent = {
      id: `${baseCase.id}-${now}`,
      type: hrmReviewDraft.status === "approved" ? "hrm_approved" : "hrm_commented",
      label:
        hrmReviewDraft.status === "approved"
          ? FOLLOW_UP_ACTION_LABELS.hrm_approved
          : FOLLOW_UP_ACTION_LABELS.hrm_commented,
      status: baseCase.status,
      hrmReviewStatus: hrmReviewDraft.status,
      note: reviewComment || undefined,
      warningRound: baseCase.warningRound,
      nextFollowUpDate: baseCase.nextFollowUpDate || undefined,
      closeReason: baseCase.closeReason || undefined,
      closeState: baseCase.closeState,
      escalationState: baseCase.escalationState,
      actedAt: now,
      actedByUid: actor.uid,
      actedByName: actor.name,
      actedByRole: actor.role,
    };

    const nextCase: EmployeeFollowUpCase = {
      ...baseCase,
      status: hrmReviewDraft.status === "commented" ? "proposed" : "approved_pending_execution",
      hrmReviewStatus: hrmReviewDraft.status,
      hrmReviewComment: reviewComment,
      hrmReviewedAt: now,
      hrmReviewedByUid: actor.uid,
      hrmReviewedByName: actor.name,
      hrmReviewedByRole: actor.role,
      actions: [...(baseCase.actions || []), event],
      lastActionAt: now,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedByRole: actor.role,
    };

    setBusy(true);
    try {
      await persistCase(
        nextCase,
        hrmReviewDraft.status === "approved" ? "HRM อนุมัติรายการติดตาม" : "HRM ส่งความเห็นกลับรายการติดตาม",
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel} · ${
          FOLLOW_UP_HRM_REVIEW_LABELS[hrmReviewDraft.status]
        }`
      );
      showToast(
        hrmReviewDraft.status === "approved" ? "HRM อนุมัติแล้ว" : "ส่งความเห็นกลับให้ HR แล้ว"
      );
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  const openActionModal = (type: WarningActionDraft["type"]) => {
    if (!selectedCase) return;
    const draft = emptyWarningActionDraft(type);
    draft.nextFollowUpDate = selectedCase.nextFollowUpDate || "";
    setActionDraft(draft);
  };

  const [docBusyKey, setDocBusyKey] = useState<string>("");
  const [signatureBusy, setSignatureBusy] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  const openCaseModal = (caseId: string) => {
    setSelectedCaseId(caseId);
    setIsCaseModalOpen(true);
    setShowHistory(false);
  };

  const closeCaseModal = () => {
    setActionDraft(null);
    setIsCaseModalOpen(false);
  };

  // ขั้นที่ 1: เสนอการดำเนินการ (HR หรือ Admin Site) — ยังไม่มีผลจริง ส่งตรงเข้าสู่ "รอ HRM พิจารณา"
  const submitProposal = async () => {
    if (!actionDraft || !selectedCase || !actor || !canPropose) return;
    if (isAdminSiteOnly && !isProjectAssigned(myAssignedProjects, selectedCase.projectName)) return;
    if (!canSelectFollowUpAction(policyConfig, actionDraft.type, selectedCase.warningRound, selectedCase.issueType)) return;

    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }

    const nextCase = proposeAction(
      baseCase,
      actionDraft.type,
      actionDraft.note,
      actionDraft.nextFollowUpDate,
      actor,
      now,
      isAdminSiteOnly ? { requestedByRole: "Admin Site", requestedProject: selectedCase.projectName } : undefined
    );

    setBusy(true);
    try {
      await persistCase(
        nextCase,
        `เสนอการดำเนินการ: ${FOLLOW_UP_ACTION_LABELS[actionDraft.type]}`,
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel}`
      );
      showToast(`ส่งข้อเสนอ "${FOLLOW_UP_ACTION_LABELS[actionDraft.type]}" ให้ HRM พิจารณาแล้ว`);
      setActionDraft(null);
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  // ขั้นที่ 3: HR ดำเนินการจริงตามที่ HRM อนุมัติแล้ว (บันทึกรอบหนังสือเตือน/สถานะยกระดับจริง) แล้วเข้าสู่ขั้นออกเอกสาร
  const executeApproved = async () => {
    if (!selectedCase || !actor || !canManageFirstStage) return;
    if (selectedCase.status !== "approved_pending_execution") return;
    const now = Date.now();
    const baseCase = materializeSelectedCase(selectedCase, now);
    if (!baseCase) {
      window.alert("ไม่สามารถบันทึกรายการนี้ได้ เนื่องจากไม่พบข้อมูลความเสี่ยงต้นทาง");
      return;
    }
    const actionLabel = baseCase.pendingActionType ? FOLLOW_UP_ACTION_LABELS[baseCase.pendingActionType] : "การดำเนินการ";
    const nextCase = executeApprovedAction(baseCase, policyConfig, actor, now);

    setBusy(true);
    try {
      await persistCase(
        nextCase,
        `ดำเนินการตามที่อนุมัติ: ${actionLabel}`,
        `${selectedCase.employeeName} (${selectedCase.employeeCode}) · ${selectedCase.issueLabel}`
      );
      showToast(`ดำเนินการ "${actionLabel}" แล้ว พร้อมออกเอกสาร`);
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setBusy(false);
    }
  };

  const findSigner = (uid?: string, name?: string): { uid: string; name: string; signatureImageUrl?: string } => {
    const match = uid ? users.find((user) => user.uid === uid) : undefined;
    return {
      uid: uid || "",
      name: match ? userName(match) : name || "",
      signatureImageUrl: match?.signatureImageUrl,
    };
  };

  // เหตุการณ์ล่าสุดที่บันทึกผลจริงจาก executeApprovedAction (type = ประเภทการดำเนินการจริง ไม่ใช่ "document_issued")
  const lastExecutedEvent = (item: EmployeeFollowUpCase) =>
    [...(item.actions || [])].reverse().find((event) => event.type !== "document_issued" && event.type !== "hrm_approved" && event.type !== "hrm_commented" && event.type !== "proposed_action" && event.type !== "status_updated");

  const generateDocument = async (templateKey: FollowUpTemplateKey) => {
    if (!selectedCase || !actor) return;
    const executedEvent = lastExecutedEvent(selectedCase);
    const actionType = executedEvent?.type as FollowUpActionType | undefined;
    if (!actionType) {
      window.alert("ไม่พบข้อมูลการดำเนินการที่อนุมัติแล้วสำหรับออกเอกสาร");
      return;
    }
    const preparer = findSigner(actor.uid, actor.name);
    const approver = findSigner(selectedCase.hrmReviewedByUid, selectedCase.hrmReviewedByName);

    setDocBusyKey(templateKey);
    try {
      const docRecord = await generateAndDownloadFollowUpDocument(templateKey, {
        followUpCase: selectedCase,
        actionType,
        note: executedEvent?.note,
        suspensionTotalDays: executedEvent?.suspensionDays,
        terminationDate: actionType === "termination" ? Date.now().toString().slice(0, 10) : undefined,
        incidentDate: selectedCase.latestIncidentDate,
        warningRound: executedEvent?.warningRound,
        preparer,
        approver,
      });

      const now = Date.now();
      const baseCase = materializeSelectedCase(selectedCase, now);
      if (baseCase) {
        const event: FollowUpActionEvent = {
          id: `${baseCase.id}-${now}`,
          type: "document_issued",
          label: `ออกเอกสาร: ${FOLLOW_UP_TEMPLATE_LABELS[templateKey]}`,
          warningRound: baseCase.warningRound,
          actedAt: now,
          actedByUid: actor.uid,
          actedByName: actor.name,
          actedByRole: actor.role,
        };
        const nextCase: EmployeeFollowUpCase = {
          ...baseCase,
          documents: [...(baseCase.documents || []), docRecord],
          actions: [...(baseCase.actions || []), event],
          lastActionAt: now,
          updatedAt: now,
          updatedByUid: actor.uid,
          updatedByName: actor.name,
          updatedByRole: actor.role,
        };
        await persistCase(nextCase, "ออกเอกสาร", `${FOLLOW_UP_TEMPLATE_LABELS[templateKey]}`);
      }
      showToast(`ดาวน์โหลด ${FOLLOW_UP_TEMPLATE_LABELS[templateKey]} แล้ว`);
    } catch (error) {
      window.alert(`สร้างเอกสารไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setDocBusyKey("");
    }
  };

  const handleSignatureUpload = async (file: File) => {
    if (!firebaseUser) return;
    setSignatureBusy(true);
    try {
      await uploadUserSignature(firebaseUser.uid, file);
      showToast("อัปโหลดลายเซ็นแล้ว");
    } catch (error) {
      window.alert(`อัปโหลดลายเซ็นไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setSignatureBusy(false);
      if (signatureInputRef.current) signatureInputRef.current.value = "";
    }
  };

  const isBacklogView = view === "backlog";
  const pageTitle = isBacklogView ? "Backlog การติดตามพนักงาน" : "การติดตามพนักงาน";
  const pageDescription = isBacklogView ? "เคสที่ดำเนินการเสร็จแล้ว / ไม่อยู่ในรอบความเสี่ยงปัจจุบัน" : "";
  const emptyMessage = isBacklogView
    ? "ยังไม่พบรายการ backlog ในเงื่อนไขที่เลือก"
    : "ยังไม่พบรายการติดตามในเงื่อนไขที่เลือก";
  const tableTitle = isBacklogView ? "รายการ backlog" : "รายการติดตาม";

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="text-base font-black text-slate-900">ไม่มีสิทธิ์เข้าดูคิวติดตามพนักงาน</div>
        <div className="mt-2 text-sm text-slate-500">
          หน้านี้เปิดให้ดูได้สำหรับ PD, MasterAdmin, MD, GM, HR และ HRM เท่านั้น
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div className="fixed right-4 top-4 z-[200] flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-lg">
          <CheckCircle2 size={16} className="text-emerald-600" />
          {toastMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-black text-slate-900">{pageTitle}</h3>
          {pageDescription && <p className="text-xs text-slate-400">{pageDescription}</p>}
        </div>
        {canManage && (
          <button
            type="button"
            disabled={signatureBusy}
            onClick={() => signatureInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="ใช้ฝังลายเซ็นอัตโนมัติในเอกสารที่คุณเป็นผู้อนุมัติ/จัดทำ"
          >
            {signatureBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : userProfile?.signatureImageUrl ? (
              <img src={userProfile.signatureImageUrl} alt="" className="h-4 w-8 rounded object-contain" />
            ) : (
              <Upload size={13} />
            )}
            {userProfile?.signatureImageUrl ? "เปลี่ยนลายเซ็น" : "อัปโหลดลายเซ็น"}
          </button>
        )}
        <input
          ref={signatureInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleSignatureUpload(file);
          }}
        />
      </div>

      {!isBacklogView && pendingLaunch && (
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-fuchsia-900">
                <ShieldAlert size={16} />
                เปิดจาก Risk Monitoring
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {pendingLaunch.seed.employeeName} ({pendingLaunch.seed.employeeCode}) · {pendingLaunch.seed.projectName || "-"}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className={`rounded-full border px-2 py-0.5 ${severityBadgeClass[pendingLaunch.seed.severity]}`}>
                  ความเสี่ยง {pendingLaunch.seed.severity} · {pendingLaunch.seed.totalScore}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                  ช่วงวิเคราะห์ {formatDate(pendingLaunch.seed.evaluatedFrom)} - {formatDate(pendingLaunch.seed.evaluatedTo)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onPendingLaunchHandled}
              className="rounded-lg border border-fuchsia-200 bg-white px-3 py-1.5 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
            >
              ซ่อนแผงนี้
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendingLaunch.seed.rules.map((rule) => {
              const queueId = getFollowUpDocId(pendingLaunch.seed.employeeId, rule.key);
              const queueItem = queueItems.find((item) => item.id === queueId);
              const highlighted = pendingLaunch.preferredIssueKey === rule.key;
              return (
                <div
                  key={`${pendingLaunch.seed.employeeId}-${rule.key}`}
                  className={`rounded-xl border bg-white p-3 ${
                    highlighted ? "border-fuchsia-300 ring-2 ring-fuchsia-200" : "border-fuchsia-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{rule.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{rule.reason}</div>
                    </div>
                    {queueItem ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          statusBadgeClass[queueItem.status]
                        }`}
                      >
                        {FOLLOW_UP_STATUS_LABELS[queueItem.status]}
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        กำลังโหลด
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-500">
                      {queueItem
                        ? queueItem.isSynthetic
                          ? "รอการบันทึกสถานะแรก"
                          : warningRoundLabel(queueItem.warningRound)
                        : "กำลังสร้างแถวคิวจากความเสี่ยง"}
                    </div>
                    <button
                      type="button"
                      disabled={!queueItem}
                      onClick={() => queueItem && openCaseModal(queueItem.id)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      เปิดรายการ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isBacklogView ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            <SummaryCard label="ทั้งหมดใน Backlog" value={summary.total} tone="slate" />
            <SummaryCard label="ติดตามเสร็จสิ้น" value={summary.closed} tone="emerald" />
            <SummaryCard label="ไม่ต้องดำเนินการ" value={summary.noAction} tone="slate" />
            <SummaryCard label="HRM อนุมัติแล้ว" value={summary.hrmApproved} tone="sky" />
            <SummaryCard label="เคสยกระดับ" value={summary.escalation} tone="rose" />
          </div>

          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            <CompactGroupSummary
              title="สรุปผลลัพธ์ใน Backlog"
              items={summary.closeMix}
              emptyText="ยังไม่มีผลลัพธ์ย้อนหลัง"
            />
            <CompactGroupSummary
              title="โครงการที่มี backlog มากสุด"
              items={summary.topProjects}
              emptyText="ยังไม่มีข้อมูลโครงการ"
            />
            <CompactGroupSummary
              title="ผู้รับผิดชอบที่เกี่ยวข้อง"
              items={summary.topOwners}
              emptyText="ยังไม่มีผู้รับผิดชอบ"
            />
            <CompactGroupSummary
              title="สถานะงาน / Workflow"
              items={summary.workflowMix}
              emptyText="ยังไม่มี workflow"
            />
            <CompactGroupSummary
              title="การดำเนินการล่าสุด"
              items={summary.actionMix}
              emptyText="ยังไม่มีประวัติการดำเนินการ"
            />
            <CompactGroupSummary
              title="ภาพรวมการยกระดับ"
              items={summary.escalationMix}
              emptyText="ยังไม่มีข้อมูลการยกระดับ"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
          <StageTabButton
            label="ทั้งหมด"
            count={summary.total}
            tone="slate"
            active={stageFilter === "all"}
            onClick={() => setStageFilter("all")}
          />
          <StageTabButton
            label="① ต้องเสนอ"
            count={summary.toPropose}
            tone="amber"
            active={stageFilter === "to_propose"}
            onClick={() => setStageFilter("to_propose")}
          />
          <StageTabButton
            label="② รอ HRM พิจารณา"
            count={summary.waitingHrm}
            tone="violet"
            active={stageFilter === "hrm_review"}
            onClick={() => setStageFilter("hrm_review")}
          />
          <StageTabButton
            label="③ รอดำเนินการ"
            count={summary.approvedPendingExecution}
            tone="sky"
            active={stageFilter === "to_execute"}
            onClick={() => setStageFilter("to_execute")}
          />
          <StageTabButton
            label="④ รอออกเอกสาร"
            count={summary.documentIssued}
            tone="emerald"
            active={stageFilter === "to_document"}
            onClick={() => setStageFilter("to_document")}
          />
          {summary.escalation > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
              เคสยกระดับ {summary.escalation}
            </span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr),repeat(4,minmax(0,170px))]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ รหัส ประเด็น หรือผู้รับผิดชอบ"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | FollowUpStatus)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">ทุกสถานะ</option>
            {FOLLOW_UP_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={employeeTypeFilter}
            onChange={(e) => setEmployeeTypeFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">ทุกประเภทพนักงาน</option>
            {employeeTypeOptions.map((employeeType) => (
              <option key={employeeType} value={employeeType}>
                {employeeType}
              </option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">ทุกผู้รับผิดชอบ</option>
            {operatorUsers.map((user) => (
              <option key={user.uid} value={user.uid}>
                {userName(user)}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">ทุกโครงการ</option>
            {projectOptions.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-800">{tableTitle}</div>
              <div className="text-xs text-slate-500">{filteredCases.length} รายการตามตัวกรองปัจจุบัน</div>
            </div>
            <div className="text-[11px] font-medium text-slate-400">คลิกที่แถวเพื่อเปิดหน้าต่างจัดการเคส</div>
          </div>
        </div>
        {filteredCases.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">{emptyMessage}</div>
        ) : (
          <div className="max-h-[720px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">พนักงาน</th>
                  <th className="px-3 py-2 text-left font-semibold">ประเด็น</th>
                  <th className="px-3 py-2 text-left font-semibold">ผู้รับผิดชอบ</th>
                  <th className="px-3 py-2 text-center font-semibold">สถานะ / Workflow</th>
                  <th className="px-3 py-2 text-center font-semibold">แหล่งที่มา</th>
                  <th className="px-3 py-2 text-center font-semibold">หนังสือเตือนล่าสุด</th>
                  <th className="px-3 py-2 text-center font-semibold">อัปเดตล่าสุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openCaseModal(item.id)}
                    className={`cursor-pointer transition-colors hover:bg-sky-50 ${
                      selectedCaseId === item.id ? "bg-sky-50/70" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{item.employeeName}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.employeeCode} · {item.projectName || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{item.issueLabel}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.issueReason}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <div>{item.ownerName || "-"}</div>
                      <div className="text-[11px] text-slate-500">{item.ownerRole || "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${
                            statusBadgeClass[item.status]
                          }`}
                        >
                          {FOLLOW_UP_STATUS_LABELS[item.status]}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            hrmReviewBadgeClass[item.hrmReviewStatus || "not_requested"]
                          }`}
                        >
                          {getWorkflowLabel(item)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] text-slate-500">
                      <div>{item.isSynthetic ? "ยังไม่บันทึก" : "มีเอกสารติดตาม"}</div>
                      <div>
                        {item.isCurrentlyDetected ? "ตรวจพบจาก Risk ปัจจุบัน" : isBacklogView ? "ย้ายเข้า backlog แล้ว" : "จากเคสเดิม"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700">{warningRoundLabel(item.warningRound)}</td>
                    <td className="px-3 py-2 text-center text-[11px] text-slate-500">
                      {item.isSynthetic ? "รอการบันทึก" : formatDateTime(item.lastActionAt || item.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCaseModalOpen && selectedCase && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-2 sm:p-4"
          onClick={closeCaseModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-case-modal-title"
            className="flex h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:h-[min(92vh,920px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div id="follow-up-case-modal-title" className="text-lg font-black text-slate-900">
                    {selectedCase.employeeName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedCase.employeeCode} · {selectedCase.position || "-"} · {selectedCase.employeeType || "-"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{selectedCase.projectNames.join(", ") || "-"}</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass[selectedCase.status]}`}
                    >
                      {FOLLOW_UP_STATUS_LABELS[selectedCase.status]}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        hrmReviewBadgeClass[selectedCase.hrmReviewStatus || "not_requested"]
                      }`}
                    >
                      {FOLLOW_UP_HRM_REVIEW_LABELS[selectedCase.hrmReviewStatus || "not_requested"]}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        escalationBadgeClass[selectedCase.escalationState || "none"]
                      }`}
                    >
                      {FOLLOW_UP_ESCALATION_LABELS[selectedCase.escalationState || "none"]}
                    </span>
                    {selectedCase.isCurrentlyDetected && (
                      <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold text-fuchsia-700">
                        ตรวจพบจาก Risk ปัจจุบัน
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={closeCaseModal}
                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="ปิดหน้าต่างรายละเอียด"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              {selectedCase.isSynthetic && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  รายการนี้มาจากความเสี่ยงที่ตรวจพบและยังไม่มีเอกสารติดตามใน Firestore จนกว่าจะมีการบันทึกผู้รับผิดชอบ
                  สถานะ หรือการดำเนินการครั้งแรก
                </div>
              )}
              {selectedCase.isCurrentlyDetected &&
                (selectedCase.status === "closed" || selectedCase.status === "no_action") && (
                  <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm text-fuchsia-900">
                    ระบบยังตรวจพบประเด็นนี้ในรอบวิเคราะห์ปัจจุบัน แม้เคยปิดเคสหรือเคยระบุว่าไม่ต้องดำเนินการไว้ก่อนหน้า
                    ควรทบทวนสถานะและกำหนดแผนติดตามล่าสุดอีกครั้ง
                  </div>
                )}

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <ShieldAlert size={14} className="text-sky-600" />
                      ประเด็น
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{selectedCase.issueLabel}</div>
                    {selectedCase.issueReason && (
                      <div className="mt-0.5 text-xs text-slate-500">{selectedCase.issueReason}</div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Briefcase size={14} className="text-sky-600" />
                      ภาพรวมความเสี่ยง
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {selectedCase.severitySnapshot} · {selectedCase.riskScoreSnapshot}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      ล่าสุด {formatDate(selectedCase.latestIncidentDate)}
                      {selectedCase.detectionWindowLabel ? ` · ช่วงวิเคราะห์ ${selectedCase.detectionWindowLabel}` : ""}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">
                    Workflow: <span className="font-semibold text-slate-800">{getWorkflowLabel(selectedCase)}</span>
                  </span>
                  <span className="text-slate-500">
                    รอบเตือนล่าสุด:{" "}
                    <span className="font-semibold text-slate-800">{warningRoundLabel(selectedCase.warningRound)}</span>
                  </span>
                  {selectedCase.nextFollowUpDate && (
                    <span className="text-slate-500">
                      วันติดตามถัดไป:{" "}
                      <span className="font-semibold text-slate-800">{formatDate(selectedCase.nextFollowUpDate)}</span>
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <UserCircle2 size={14} className="text-slate-400" />
                    <select
                      value={ownerDraft}
                      onChange={(e) => setOwnerDraft(e.target.value)}
                      disabled={!canManage || busy}
                      className="h-8 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
                    >
                      <option value="">ยังไม่ระบุผู้รับผิดชอบ</option>
                      {operatorUsers.map((user) => (
                        <option key={user.uid} value={user.uid}>
                          {userName(user)} ({roleText(user.role)})
                        </option>
                      ))}
                    </select>
                    {ownerDraft !== (selectedCase.ownerUid || "") && (
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => void saveOwner()}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        บันทึก
                      </button>
                    )}
                  </span>
                </div>
              </div>

              {(() => {
                // แสดงเฉพาะตอนที่เกี่ยวข้องกับขั้นตอนปัจจุบันจริงๆ เท่านั้น เพื่อไม่ให้การ์ดค้างอยู่หลังผ่านขั้นนั้นไปแล้ว
                // HRM: เห็นเมื่อถึงตาตัวเองต้องตัดสิน (awaiting_hrm_review) เท่านั้น
                // ผู้เสนอ (HR/Admin Site): เห็นเฉพาะตอนมีผลตอบกลับที่ยังไม่ได้แก้ไขต่อ (commented ขณะสถานะยังเป็น proposed)
                const showHrmReviewPanel = canReviewByHrm
                  ? selectedCase.status === "awaiting_hrm_review"
                  : selectedCase.status === "proposed" && selectedCase.hrmReviewStatus === "commented";
                if (!showHrmReviewPanel) return null;
                return (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-violet-700" />
                      <div className="text-sm font-bold text-violet-900">
                        {canReviewByHrm ? "ขั้น HRM อนุมัติ / ให้ความเห็น" : "ผลการพิจารณาจาก HRM"}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-800">
                          สถานะล่าสุด: {FOLLOW_UP_HRM_REVIEW_LABELS[selectedCase.hrmReviewStatus || "not_requested"]}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {canReviewByHrm
                            ? "HR เสนอการดำเนินการแล้ว รอ HRM ตัดสินอนุมัติหรือส่งความเห็นกลับ"
                            : "HRM ส่งความเห็นกลับแล้ว กรุณาทบทวนแล้วเสนอการดำเนินการใหม่อีกครั้งด้านล่าง"}
                        </div>
                        {selectedCase.hrmReviewComment && (
                          <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
                            <div className="font-semibold">ความเห็นล่าสุดจาก HRM</div>
                            <div className="mt-1 whitespace-pre-wrap">{selectedCase.hrmReviewComment}</div>
                          </div>
                        )}
                        {selectedCase.hrmReviewedAt ? (
                          <div className="mt-2 text-[11px] text-slate-500">
                            ล่าสุดโดย {selectedCase.hrmReviewedByName || "-"} ({selectedCase.hrmReviewedByRole || "-"}) ·{" "}
                            {formatDateTime(selectedCase.hrmReviewedAt)}
                          </div>
                        ) : null}
                      </div>

                      {canReviewByHrm ? (
                        <>
                          <div className="grid gap-3 md:grid-cols-[minmax(0,180px),minmax(0,1fr),auto]">
                            <select
                              value={hrmReviewDraft.status}
                              onChange={(e) =>
                                setHrmReviewDraft((prev) => ({
                                  ...prev,
                                  status: e.target.value as HrmReviewDraft["status"],
                                }))
                              }
                              disabled={busy}
                              className="h-10 rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-violet-100 disabled:bg-violet-50"
                            >
                              {FOLLOW_UP_HRM_REVIEW_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <textarea
                              rows={2}
                              value={hrmReviewDraft.comment}
                              onChange={(e) =>
                                setHrmReviewDraft((prev) => ({
                                  ...prev,
                                  comment: e.target.value,
                                }))
                              }
                              placeholder="ความเห็นจาก HRM (ถ้าเลือกให้ความเห็น แนะนำให้ระบุสิ่งที่ HR ต้องกลับไปทบทวน)"
                              disabled={busy}
                              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 disabled:bg-violet-50"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveHrmReview()}
                              className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                            >
                              บันทึกผล HRM
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] text-violet-700">
                              อนุมัติแล้วเคสจะไปขั้น "รอดำเนินการ" อัตโนมัติ · ปิดเคสได้จากขั้นออกเอกสารด้านล่างสุด
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={quickNoAction}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                            >
                              ไม่ต้องดำเนินการ
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-violet-700">
                          ส่วนนี้แสดงเฉพาะผลการพิจารณาของ HRM ให้ทราบเท่านั้น เฉพาะ HRM เท่านั้นที่อนุมัติหรือให้ความเห็นได้
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {(selectedCase.warningRound >= 3 || (selectedCase.escalationState || "none") !== "none") && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 text-rose-600" />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-rose-900">เคสนี้อยู่ในช่วงยกระดับการดำเนินการ</div>
                      <div className="mt-1 text-xs text-rose-700">
                        HRM สามารถใช้ส่วนนี้เพื่อตีความสถานะยกระดับได้ ทั้งกรณีหนังสือเตือนครบ 3 ครั้ง และกรณีร้ายแรงที่ต้องข้ามขั้นเร็วขึ้น
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
                        <select
                          value={escalationDraft}
                          onChange={(e) => setEscalationDraft(e.target.value as FollowUpEscalationState)}
                          disabled={!canInterpretEscalation || busy}
                          className="h-10 rounded-xl border border-rose-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-rose-50"
                        >
                          {FOLLOW_UP_ESCALATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!canInterpretEscalation || busy}
                          onClick={() => void saveEscalation()}
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          บันทึกสถานะยกระดับ
                        </button>
                      </div>
                      {!canInterpretEscalation && (
                        <div className="mt-2 text-[11px] text-rose-600">เฉพาะ HRM เท่านั้นที่เปลี่ยนสถานะยกระดับได้</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(selectedCase.noActionReason || selectedCase.closeReason || selectedCase.closeState) && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-bold text-slate-800">ผลการจัดการล่าสุด</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {selectedCase.status === "no_action" && selectedCase.noActionReason && (
                      <div>
                        <span className="font-semibold">เหตุผลไม่ต้องดำเนินการ:</span> {selectedCase.noActionReason}
                      </div>
                    )}
                    {selectedCase.closeState && selectedCase.status === "closed" && (
                      <div>
                        <span className="font-semibold">รูปแบบการปิดติดตาม:</span>{" "}
                        {FOLLOW_UP_CLOSE_STATE_LABELS[selectedCase.closeState]}
                      </div>
                    )}
                    {selectedCase.closeReason && selectedCase.status === "closed" && (
                      <div>
                        <span className="font-semibold">เหตุผลปิดติดตาม:</span> {selectedCase.closeReason}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList size={16} className="text-sky-600" />
                    <div className="text-sm font-bold text-slate-800">
                      ลำดับการดำเนินการ{selectedCase.actions.length > 0 ? ` (${selectedCase.actions.length})` : ""}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-sky-700">{showHistory ? "ซ่อน ▲" : "แสดง ▼"}</span>
                </button>
                {showHistory &&
                  (selectedCase.actions.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
                      {selectedCase.isSynthetic
                        ? "ยังไม่มีการบันทึกใดๆ รายการนี้จะถูกสร้างเป็นเอกสารเมื่อมีการบันทึกครั้งแรก"
                        : "ยังไม่มีการบันทึกการดำเนินการในรายการนี้"}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                    {[...selectedCase.actions].sort((a, b) => b.actedAt - a.actedAt).map((event) => (
                      <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{event.label}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {event.actedByName} ({event.actedByRole}) · {formatDateTime(event.actedAt)}
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {event.status && (
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  statusBadgeClass[event.status]
                                }`}
                              >
                                {FOLLOW_UP_STATUS_LABELS[event.status]}
                              </span>
                            )}
                            {event.hrmReviewStatus && event.hrmReviewStatus !== "not_requested" && (
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  hrmReviewBadgeClass[event.hrmReviewStatus]
                                }`}
                              >
                                {FOLLOW_UP_HRM_REVIEW_LABELS[event.hrmReviewStatus]}
                              </span>
                            )}
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {warningRoundLabel(event.warningRound)}
                            </span>
                          </div>
                        </div>
                        {(
                          event.note ||
                          event.reason ||
                          event.closeReason ||
                          event.nextFollowUpDate ||
                          event.closeState ||
                          event.suspensionDays ||
                          event.warningValidityDays
                        ) && (
                          <div className="mt-3 space-y-1 text-sm text-slate-700">
                            {event.note && <div>{event.note}</div>}
                            {event.reason && <div>เหตุผล: {event.reason}</div>}
                            {event.suspensionDays && <div>ระยะเวลาพักงาน: {event.suspensionDays} วัน</div>}
                            {event.warningValidityDays && <div>อายุผลของหนังสือเตือน: {event.warningValidityDays} วัน</div>}
                            {event.closeState && <div>รูปแบบปิดติดตาม: {FOLLOW_UP_CLOSE_STATE_LABELS[event.closeState]}</div>}
                            {event.closeReason && <div>เหตุผลปิดติดตาม: {event.closeReason}</div>}
                            {event.nextFollowUpDate && <div>ติดตามถัดไป: {formatDate(event.nextFollowUpDate)}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  ))}
              </div>
            </div>

            {selectedCase.claimedByRole === "Admin Site" && !isAdminSiteOnly && (
              <div className="mx-4 mb-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 sm:mx-5">
                กำลังดำเนินการโดย Admin Site ({selectedCase.claimedByName || "ไม่ระบุชื่อ"}
                {selectedCase.claimedProject ? ` · ${selectedCase.claimedProject}` : ""}) — เพื่อไม่ให้ซ้ำซ้อน
                กรุณาตรวจสอบก่อนดำเนินการเพิ่มเติม
              </div>
            )}

            {canPropose &&
              (selectedCase.status === "pending" || selectedCase.status === "proposed") &&
              (!isAdminSiteOnly || isProjectAssigned(myAssignedProjects, selectedCase.projectName)) && (
                <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-800">
                      {isAdminSiteOnly ? "ขอออกใบเตือน (ส่งให้ HRM พิจารณา)" : "เสนอการดำเนินการ (ส่งให้ HRM พิจารณา)"}
                    </div>
                    {canReviewByHrm && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={quickNoAction}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                      >
                        ไม่ต้องดำเนินการ
                      </button>
                    )}
                  </div>
                  {isWatchOnlyIssueType(selectedCase.issueType) && (
                    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ประเด็นนี้เป็นเพียงสัญญาณเฝ้าระวัง (pattern/อัตรา) ไม่ใช่ฐานตามกฎหมายที่ออกหนังสือเตือนเป็นลายลักษณ์อักษรได้ด้วยตัวเอง จึงอนุญาตให้เตือนวาจาเท่านั้น
                      จนกว่าจะพบเงื่อนไขขาดต่อเนื่องหรือขาดสะสมร่วมด้วย
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {enabledActionOptions.map((option) => (
                      <button
                        key={option.type}
                        type="button"
                        disabled={
                          busy ||
                          !canSelectFollowUpAction(policyConfig, option.type, selectedCase.warningRound, selectedCase.issueType)
                        }
                        onClick={() => openActionModal(option.type)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    เมื่อเลือกและยืนยันข้อเสนอแล้ว ระบบจะส่งเคสให้ HRM พิจารณาอนุมัติทันที ยังไม่มีผลจริงจนกว่า HRM จะอนุมัติ
                  </div>
                </div>
              )}

            {canManageFirstStage && selectedCase.status === "approved_pending_execution" && (
              <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                <div className="mb-2 text-sm font-bold text-indigo-900">ดำเนินการตามที่ HRM อนุมัติ</div>
                <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                  ข้อเสนอ: {selectedCase.pendingActionType ? FOLLOW_UP_ACTION_LABELS[selectedCase.pendingActionType] : "-"}
                  {selectedCase.pendingActionNote ? ` · ${selectedCase.pendingActionNote}` : ""}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void executeApproved()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  ดำเนินการและเปิดขั้นออกเอกสาร
                </button>
              </div>
            )}

            {(canManageFirstStage || canReviewByHrm) && selectedCase.status === "document_issued" && (
              <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                <div className="mb-2 text-sm font-bold text-teal-900">ออกเอกสารประกอบการดำเนินการ</div>
                <div className="mb-3 text-xs text-slate-500">
                  ระบบจะสร้าง PDF ตามฟอร์มจริงของบริษัท พร้อมฝังลายเซ็นดิจิทัลของผู้อนุมัติ/ผู้จัดทำ (ถ้ามี) — ช่องเซ็นของพนักงานและพยานต้องเซ็นสดเสมอ
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const executedEvent = lastExecutedEvent(selectedCase);
                    const actionType = executedEvent?.type as FollowUpActionType | undefined;
                    const templateKeys = actionType
                      ? resolveFollowUpTemplateKeys(actionType, selectedCase.issueType)
                      : [];
                    return templateKeys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        disabled={!!docBusyKey || busy}
                        onClick={() => void generateDocument(key)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                      >
                        {docBusyKey === key ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        ดาวน์โหลด {FOLLOW_UP_TEMPLATE_LABELS[key]}
                      </button>
                    ));
                  })()}
                </div>
                {selectedCase.documents && selectedCase.documents.length > 0 && (
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    {selectedCase.documents.map((doc) => (
                      <div key={doc.id}>
                        สร้างแล้ว: {doc.templateLabel} · {doc.generatedByName} · {formatDateTime(doc.generatedAt)}
                      </div>
                    ))}
                  </div>
                )}
                {canReviewByHrm ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-1.5 text-[11px] font-semibold text-slate-500">
                      หลังพนักงานเซ็นรับทราบแล้ว ปิดเคส:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FOLLOW_UP_CLOSE_STATE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={busy}
                          onClick={() => quickClose(option.value)}
                          className="rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                        >
                          ปิดเคส: {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-slate-500">
                    หลังพิมพ์ให้พนักงานเซ็นรับทราบเรียบร้อยแล้ว ให้ HRM เป็นผู้ปิดเคส
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {actionDraft && selectedCase && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3" onClick={() => setActionDraft(null)}>
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div>
                <div className="text-base font-bold text-slate-900">{FOLLOW_UP_ACTION_LABELS[actionDraft.type]}</div>
                <div className="text-xs text-slate-500">
                  {selectedCase.employeeName} · {selectedCase.issueLabel}
                </div>
              </div>
              <button type="button" onClick={() => setActionDraft(null)} className="text-slate-400 hover:text-rose-500">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              {(() => {
                const actionOption = getFollowUpActionOption(policyConfig, actionDraft.type);
                if (!actionOption) return null;
                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-800">เงื่อนไขนโยบายที่อ้างอิง</div>
                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                      {actionOption.warningValidityDays ? (
                        <div>หนังสือเตือนมีผล {actionOption.warningValidityDays} วัน</div>
                      ) : null}
                      {actionOption.suspensionDays ? (
                        <div>
                          การพักงานรายการนี้ {actionOption.suspensionDays} วัน และเพดานชั่วคราวรวมในรุ่น MVP ไม่เกิน{" "}
                          {policyConfig.maxSuspensionDays} วัน
                        </div>
                      ) : null}
                      {actionOption.notes?.map((note) => (
                        <div key={note}>- {note}</div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">บันทึกเพิ่มเติม</label>
                <textarea
                  rows={3}
                  value={actionDraft.note}
                  onChange={(e) => setActionDraft((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>

              {actionDraft.type !== "termination" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">วันติดตามถัดไป</label>
                  <input
                    type="date"
                    value={actionDraft.nextFollowUpDate}
                    onChange={(e) => setActionDraft((prev) => (prev ? { ...prev, nextFollowUpDate: e.target.value } : prev))}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-4">
              <button
                type="button"
                onClick={() => setActionDraft(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitProposal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                ส่งข้อเสนอให้ HRM พิจารณา
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "sky" | "emerald" | "rose";
  onClick?: () => void;
  active?: boolean;
}) => {
  const toneClass: Record<typeof tone, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border px-2 py-1.5 text-left ${toneClass[tone]} ${
        onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5" : ""
      } ${active ? "ring-2 ring-offset-1 ring-current" : ""}`}
    >
      <div className="text-[10px] font-semibold opacity-80 leading-tight">{label}</div>
      <div className="mt-0.5 text-base font-black leading-tight">{value}</div>
    </Component>
  );
};

const StageTabButton = ({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: "slate" | "amber" | "violet" | "sky" | "emerald";
  active: boolean;
  onClick: () => void;
}) => {
  const activeToneClass: Record<typeof tone, string> = {
    slate: "border-slate-500 bg-slate-600 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
    violet: "border-violet-500 bg-violet-600 text-white",
    sky: "border-sky-500 bg-sky-600 text-white",
    emerald: "border-emerald-500 bg-emerald-600 text-white",
  };
  const idleToneClass: Record<typeof tone, string> = {
    slate: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    amber: "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
    violet: "border-violet-200 bg-white text-violet-700 hover:bg-violet-50",
    sky: "border-sky-200 bg-white text-sky-700 hover:bg-sky-50",
    emerald: "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? activeToneClass[tone] : idleToneClass[tone]
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
          active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"
        }`}
      >
        {count}
      </span>
    </button>
  );
};

const CompactGroupSummary = ({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
  emptyText: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="text-xs font-black text-slate-900">{title}</div>
    {items.length === 0 ? (
      <div className="mt-2 text-xs text-slate-400">{emptyText}</div>
    ) : (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <div key={item.key} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
            <span className="font-semibold">{item.key}</span> <span className="text-slate-500">{item.count} รายการ</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const StatBox = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
  </div>
);

const InfoBox = ({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  note?: string;
}) => (
  <div className="rounded-xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
      <Icon size={16} className="text-sky-600" />
      {title}
    </div>
    <div className="mt-2 text-sm font-semibold text-slate-800">{value}</div>
    {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
  </div>
);
