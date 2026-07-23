import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Inbox,
  Search,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, UserRole } from "../auth/AuthContext";
import {
  ACTIVE_TRANSFER_STATUSES,
  canActAsSafety,
  canApproveHrm,
  canApprovePd,
  canApprovePmCm,
  canEditChecklist,
  EMPLOYEE_TRANSFERS_COLLECTION,
  EmployeeTransfer,
  OPEN_TRANSFER_STORAGE_KEY,
  projectsOverlap,
  TRANSFER_STATUS_COLORS,
  TRANSFER_STATUS_LABELS,
} from "./projectTransferConfig";
import {
  canManageFollowUpFirstStage,
  canManageFollowUpModule,
  canProposeFollowUpAction,
  canReviewFollowUpByHRM,
  EMPLOYEE_FOLLOW_UP_COLLECTION,
  EmployeeFollowUpCase,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FollowUpStatus,
  normalizeFollowUpCase,
} from "./employeeFollowUpConfig";
import {
  assignmentId,
  canActTier,
  EvalAssignment,
  EvalRound,
  EvalTier,
  monthLabelTh,
  TIER_LABELS,
} from "./evaluationConfig";

// deep-link storage key เดียวกับที่ NotificationBell / RiskMonitoringPage ใช้อยู่
const OPEN_FOLLOW_UP_CASE_STORAGE_KEY = "cmg_open_follow_up_case";

// role ที่เห็นแท็บ "ภาพรวมทั้งหมด" (ตามที่ตกลง: HRM + PD + MD + GM และ MasterAdmin เสมอ)
const OVERVIEW_ROLES: UserRole[] = ["MasterAdmin", "MD", "GM", "PD", "HRM"];

type ApprovalModuleKey = "project_transfer" | "follow_up" | "evaluation" | "user_approval";

const MODULE_LABELS: Record<ApprovalModuleKey, string> = {
  project_transfer: "ย้ายโครงการ",
  follow_up: "ติดตามพนักงาน",
  evaluation: "ประเมินผล",
  user_approval: "ผู้ใช้ใหม่",
};

const MODULE_BADGE_COLORS: Record<ApprovalModuleKey, string> = {
  project_transfer: "bg-sky-100 text-sky-800",
  follow_up: "bg-rose-100 text-rose-800",
  evaluation: "bg-violet-100 text-violet-800",
  user_approval: "bg-slate-200 text-slate-700",
};

interface ApprovalItem {
  key: string;
  module: ApprovalModuleKey;
  caseId: string;
  /** ชื่อหลักของรายการ เช่น ชื่อพนักงาน / ชุดที่ประเมิน */
  title: string;
  /** รายละเอียดสั้น เช่น โครงการต้นทาง → ปลายทาง, ประเด็น */
  detail: string;
  stageLabel: string;
  stageColor: string;
  /** ค้างอยู่กับใคร (role หรือชื่อบุคคล) */
  waitingOn: string;
  /** เวลาเข้าสู่ขั้นปัจจุบัน (ใช้คำนวณจำนวนวันค้าง) */
  pendingSince?: number;
  /** ผู้ใช้ปัจจุบันเป็นคนที่ต้องกดในขั้นนี้หรือไม่ */
  mine: boolean;
  /** ป้ายบอกว่ารายการนี้รอ "อนุมัติ" หรือรอ "ดำเนินการ" */
  actionLabel: string;
}

interface AppUserLite {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  position?: string;
  role?: string[];
  createdAt?: { toMillis?: () => number };
}

const userDisplayName = (u: AppUserLite | undefined): string =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.uid : "-";

const daysSince = (ts?: number): number | null => {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
};

const agingClass = (days: number | null): string => {
  if (days === null) return "text-slate-400";
  if (days >= 7) return "text-rose-600 font-bold";
  if (days >= 3) return "text-amber-600 font-semibold";
  return "text-slate-500";
};

// สถานะ follow-up ที่ยังค้างอยู่ในสายพานเสนอ→อนุมัติ→ออกเอกสาร→ปิดเคส
// ("pending" = เคสที่เปิดแล้วแต่ยังไม่มีใครเสนอการดำเนินการ — เป็นงานค้างของ HR/Admin Site)
// ("in_progress" เป็นค่าเดิมในฐานข้อมูล จะถูก normalize เป็นสถานะใหม่ก่อนใช้)
const FOLLOW_UP_PIPELINE_STATUSES: FollowUpStatus[] = [
  "pending",
  "proposed",
  "in_progress",
  "awaiting_hrm_review",
  "approved_pending_execution",
  "awaiting_document_review",
  "approved_pending_issue",
  "document_issued",
];

const FOLLOW_UP_STAGE_COLORS: Partial<Record<FollowUpStatus, string>> = {
  pending: "bg-amber-100 text-amber-800",
  proposed: "bg-amber-100 text-amber-800",
  awaiting_hrm_review: "bg-blue-100 text-blue-800",
  approved_pending_execution: "bg-violet-100 text-violet-800",
  awaiting_document_review: "bg-blue-100 text-blue-800",
  approved_pending_issue: "bg-violet-100 text-violet-800",
  document_issued: "bg-cyan-100 text-cyan-800",
};

const EVAL_TIER_COLORS: Record<EvalTier, string> = {
  1: "bg-amber-100 text-amber-800",
  2: "bg-orange-100 text-orange-800",
  3: "bg-blue-100 text-blue-800",
  4: "bg-violet-100 text-violet-800",
};

export const ApprovalCenterPage = ({
  setActiveModule,
}: {
  setActiveModule: (id: string) => void;
}) => {
  const { firebaseUser, userProfile, hasRole } = useAuth();
  const db = getFirestore();

  const uid = firebaseUser?.uid || "";
  const roles = useMemo(() => userProfile?.role || [], [userProfile?.role]);
  const assignedProjects = useMemo(
    () => userProfile?.assignedProjects || [],
    [userProfile?.assignedProjects]
  );
  const isMasterAdmin = roles.includes("MasterAdmin");
  const canSeeOverview = hasRole(OVERVIEW_ROLES);
  // Admin Site ที่ไม่มี role ระดับบริหาร: เห็นเฉพาะรายการในโครงการที่ตนดูแล
  const isProjectScopedOnly =
    roles.includes("Admin Site") &&
    !roles.some((r) => ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"].includes(r));

  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);
  const [followUps, setFollowUps] = useState<EmployeeFollowUpCase[]>([]);
  const [rounds, setRounds] = useState<EvalRound[]>([]);
  const [assignments, setAssignments] = useState<EvalAssignment[]>([]);
  const [users, setUsers] = useState<AppUserLite[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AppUserLite[]>([]);
  const [loadedSources, setLoadedSources] = useState<Set<string>>(new Set());

  const markLoaded = (source: string) =>
    setLoadedSources((prev) => {
      if (prev.has(source)) return prev;
      const next = new Set(prev);
      next.add(source);
      return next;
    });

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION),
      where("status", "in", ACTIVE_TRANSFER_STATUSES)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTransfers(snap.docs.map((d) => ({ ...(d.data() as EmployeeTransfer), id: d.id })));
      markLoaded("transfers");
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", EMPLOYEE_FOLLOW_UP_COLLECTION),
      where("status", "in", FOLLOW_UP_PIPELINE_STATUSES)
    );
    const unsub = onSnapshot(q, (snap) => {
      setFollowUps(
        snap.docs.map((d) =>
          normalizeFollowUpCase({ ...(d.data() as EmployeeFollowUpCase), id: d.id })
        )
      );
      markLoaded("followUps");
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", "evaluation_rounds"),
      where("closed", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setRounds(snap.docs.map((d) => ({ ...(d.data() as EvalRound), id: d.id })));
      markLoaded("rounds");
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "CMG-HR-Database", "root", "evaluation_assignments"),
      (snap) => {
        setAssignments(snap.docs.map((d) => ({ ...(d.data() as EvalAssignment), id: d.id })));
        markLoaded("assignments");
      }
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", "users"),
      where("status", "==", "approved")
    );
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ ...(d.data() as AppUserLite), uid: d.id })));
      markLoaded("users");
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    if (!isMasterAdmin) {
      setPendingUsers([]);
      return;
    }
    const q = query(
      collection(db, "CMG-HR-Database", "root", "users"),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingUsers(snap.docs.map((d) => ({ ...(d.data() as AppUserLite), uid: d.id })));
    });
    return () => unsub();
  }, [db, isMasterAdmin]);

  const loading = loadedSources.size < 5;

  const usersByUid = useMemo(() => {
    const map: Record<string, AppUserLite> = {};
    users.forEach((u) => {
      map[u.uid] = u;
    });
    return map;
  }, [users]);

  // ---------- แปลงข้อมูลแต่ละเรื่องเป็นรายการกลาง ----------

  const transferItems = useMemo<ApprovalItem[]>(() => {
    return transfers.map((t) => {
      let waitingOn = "-";
      let mine = false;
      let actionLabel = "รออนุมัติ";
      switch (t.status) {
        case "awaiting_pm_cm":
          waitingOn = `${t.approverPmCmName} (${t.approverPmCmRole || "PM/CM"})`;
          mine = canApprovePmCm(t, uid, roles);
          break;
        case "awaiting_pd":
          waitingOn = "PD";
          mine = canApprovePd(roles);
          break;
        case "awaiting_hrm":
          waitingOn = "HRM";
          mine = canApproveHrm(roles);
          break;
        case "preparing":
          waitingOn = "HR / Admin Site";
          actionLabel = "รอดำเนินการ";
          mine =
            canEditChecklist(roles) &&
            (!isProjectScopedOnly ||
              projectsOverlap(assignedProjects, [...(t.fromProjects || []), t.toProject]));
          break;
        case "awaiting_safety":
          waitingOn = "Safety";
          actionLabel = "รอดำเนินการ";
          mine = canActAsSafety(roles);
          break;
        default:
          break;
      }
      return {
        key: `transfer-${t.id}`,
        module: "project_transfer" as const,
        caseId: t.id,
        title: `${t.employeeName} (${t.employeeCode})`,
        detail: `${(t.fromProjects || []).join(", ") || "-"} → ${t.toProject} · ${t.transferType}`,
        stageLabel: TRANSFER_STATUS_LABELS[t.status],
        stageColor: TRANSFER_STATUS_COLORS[t.status],
        waitingOn,
        pendingSince: t.lastActionAt || t.updatedAt || t.createdAt,
        mine,
        actionLabel,
      };
    });
  }, [transfers, uid, roles, isProjectScopedOnly, assignedProjects]);

  const followUpItems = useMemo<ApprovalItem[]>(() => {
    // Admin Site เสนอการดำเนินการได้เฉพาะเคสในโครงการที่ตนดูแล (เหมือนใน EmployeeFollowUpTab)
    const inMyProjects = (c: EmployeeFollowUpCase): boolean =>
      !isProjectScopedOnly ||
      projectsOverlap(assignedProjects, c.projectNames?.length ? c.projectNames : [c.projectName]);
    return followUps
      .filter((c) => FOLLOW_UP_PIPELINE_STATUSES.includes(c.status) && c.status !== "in_progress")
      .map((c) => {
        let waitingOn = "-";
        let mine = false;
        let actionLabel = "รอดำเนินการ";
        switch (c.status) {
          case "pending":
            waitingOn = "HR / Admin Site";
            actionLabel = "รอเสนอการดำเนินการ";
            mine = canProposeFollowUpAction(roles) && inMyProjects(c);
            break;
          case "proposed":
            waitingOn = "HR / Admin Site";
            actionLabel = "รอเสนอการดำเนินการ";
            mine = canProposeFollowUpAction(roles) && inMyProjects(c);
            break;
          case "awaiting_hrm_review":
            waitingOn = "HRM";
            actionLabel = "รออนุมัติ";
            mine = canReviewFollowUpByHRM(roles);
            break;
          case "approved_pending_execution":
            waitingOn = "HR";
            mine = canManageFollowUpFirstStage(roles);
            break;
          case "awaiting_document_review":
            waitingOn = "HRM";
            actionLabel = "รออนุมัติ";
            mine = canReviewFollowUpByHRM(roles);
            break;
          case "approved_pending_issue":
            waitingOn = "HR";
            mine = canManageFollowUpFirstStage(roles);
            break;
          case "document_issued":
            waitingOn = "HR / HRM";
            mine = canManageFollowUpModule(roles);
            break;
          default:
            break;
        }
        const proposedLabel = c.pendingActionType
          ? ` · เสนอ: ${FOLLOW_UP_ACTION_LABELS[c.pendingActionType]}`
          : "";
        return {
          key: `followup-${c.id}`,
          module: "follow_up" as const,
          caseId: c.id,
          title: `${c.employeeName} (${c.employeeCode})`,
          detail: `${c.issueLabel}${proposedLabel} · ${c.projectName || "-"}`,
          stageLabel: FOLLOW_UP_STATUS_LABELS[c.status],
          stageColor: FOLLOW_UP_STAGE_COLORS[c.status] || "bg-slate-100 text-slate-600",
          waitingOn,
          pendingSince: c.lastActionAt || c.updatedAt || c.createdAt,
          mine,
          actionLabel,
        };
      });
  }, [followUps, roles, isProjectScopedOnly, assignedProjects]);

  const evaluationItems = useMemo<ApprovalItem[]>(() => {
    return rounds.map((r) => {
      const tier = r.currentTier;
      const assignment = assignments.find((a) => a.id === assignmentId(r.project, r.group));
      let waitingOn = "-";
      let mine = false;
      if (tier === 1 || tier === 2) {
        const uids = (tier === 1 ? assignment?.tier1Uids : assignment?.tier2Uids) || [];
        waitingOn =
          uids.length > 0
            ? uids.map((id) => userDisplayName(usersByUid[id])).join(", ")
            : "ยังไม่ได้มอบหมาย";
        mine = uids.includes(uid);
      } else if (tier === 3) {
        waitingOn = "HR / HRM";
        mine = canActTier(roles, 3);
      } else {
        waitingOn = "PD";
        mine = canActTier(roles, 4);
      }
      return {
        key: `eval-${r.id}`,
        module: "evaluation" as const,
        caseId: r.id,
        title: `${r.project} · ${r.group}`,
        detail: `รอบประเมิน ${monthLabelTh(r.period)}`,
        stageLabel: TIER_LABELS[tier],
        stageColor: EVAL_TIER_COLORS[tier],
        waitingOn,
        pendingSince: r.updatedAt,
        mine,
        actionLabel: tier === 4 ? "รออนุมัติ" : "รอดำเนินการ",
      };
    });
  }, [rounds, assignments, usersByUid, uid, roles]);

  const userApprovalItems = useMemo<ApprovalItem[]>(() => {
    return pendingUsers.map((u) => ({
      key: `user-${u.uid}`,
      module: "user_approval" as const,
      caseId: u.uid,
      title: userDisplayName(u),
      detail: `${u.email || "-"}${u.position ? ` · ${u.position}` : ""}`,
      stageLabel: "รออนุมัติผู้ใช้ใหม่",
      stageColor: "bg-amber-100 text-amber-800",
      waitingOn: "MasterAdmin",
      pendingSince: u.createdAt?.toMillis?.(),
      mine: isMasterAdmin,
      actionLabel: "รออนุมัติ",
    }));
  }, [pendingUsers, isMasterAdmin]);

  const allItems = useMemo(
    () =>
      [...transferItems, ...followUpItems, ...evaluationItems, ...userApprovalItems].sort(
        (a, b) => (a.pendingSince || Number.MAX_SAFE_INTEGER) - (b.pendingSince || Number.MAX_SAFE_INTEGER)
      ),
    [transferItems, followUpItems, evaluationItems, userApprovalItems]
  );

  const myItems = useMemo(() => allItems.filter((item) => item.mine), [allItems]);

  // ---------- UI state ----------
  const [tab, setTab] = useState<"mine" | "overview">("mine");
  const [moduleFilter, setModuleFilter] = useState<"all" | ApprovalModuleKey>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  // รายการที่ค้างนานจนต้องตามจี้ผู้อนุมัติ/ผู้ดำเนินการ (>= 3 วัน)
  // ขอบเขต: role ที่เห็นภาพรวมนับจากทุกรายการ, role อื่นนับเฉพาะของตัวเอง
  const urgentScopeItems = canSeeOverview ? allItems : myItems;
  const urgentItems = useMemo(
    () => urgentScopeItems.filter((item) => (daysSince(item.pendingSince) ?? 0) >= 3),
    [urgentScopeItems]
  );
  const criticalCount = useMemo(
    () => urgentItems.filter((item) => (daysSince(item.pendingSince) ?? 0) >= 7).length,
    [urgentItems]
  );

  const focusUrgent = () => {
    setOverdueOnly(true);
    if (canSeeOverview) setTab("overview");
    setModuleFilter("all");
  };

  const activeList = tab === "overview" && canSeeOverview ? allItems : myItems;
  const filteredList = useMemo(() => {
    let list = activeList;
    if (moduleFilter !== "all") list = list.filter((item) => item.module === moduleFilter);
    if (overdueOnly) list = list.filter((item) => (daysSince(item.pendingSince) ?? 0) >= 3);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(term) ||
          item.detail.toLowerCase().includes(term) ||
          item.waitingOn.toLowerCase().includes(term) ||
          item.stageLabel.toLowerCase().includes(term)
      );
    }
    return list;
  }, [activeList, moduleFilter, overdueOnly, search]);

  const countByModule = (list: ApprovalItem[], moduleKey: ApprovalModuleKey): number =>
    list.filter((item) => item.module === moduleKey).length;

  const openItem = (item: ApprovalItem) => {
    if (item.module === "project_transfer") {
      sessionStorage.setItem(OPEN_TRANSFER_STORAGE_KEY, item.caseId);
      setActiveModule("project_transfer");
      return;
    }
    if (item.module === "follow_up") {
      sessionStorage.setItem(OPEN_FOLLOW_UP_CASE_STORAGE_KEY, item.caseId);
      setActiveModule("risk_monitoring");
      return;
    }
    if (item.module === "evaluation") {
      setActiveModule("evaluation");
      return;
    }
    setActiveModule("users_data");
  };

  const summaryCards: Array<{
    moduleKey: ApprovalModuleKey;
    icon: LucideIcon;
  }> = [
    { moduleKey: "project_transfer", icon: ArrowLeftRight },
    { moduleKey: "follow_up", icon: AlertCircle },
    { moduleKey: "evaluation", icon: ClipboardList },
    { moduleKey: "user_approval", icon: UserCog },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* สรุปยอด */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-blue-700">
            <Inbox size={18} />
            <span className="text-xs font-semibold">รอฉันดำเนินการ</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-800">{myItems.length}</div>
          {canSeeOverview && (
            <div className="text-[11px] text-blue-600">จากทั้งหมด {allItems.length} รายการ</div>
          )}
        </div>

        {/* เตือนรายการค้างนาน ต้องตามจี้ผู้อนุมัติ/ผู้ดำเนินการ */}
        <button
          type="button"
          onClick={focusUrgent}
          disabled={urgentItems.length === 0}
          title={urgentItems.length > 0 ? "คลิกเพื่อดูเฉพาะรายการค้างเกิน 3 วัน" : undefined}
          className={`rounded-xl border p-3 text-left transition-colors ${
            urgentItems.length > 0
              ? "border-rose-300 bg-rose-50 hover:bg-rose-100 cursor-pointer"
              : "border-slate-200 bg-white cursor-default"
          }`}
        >
          <div
            className={`flex items-center gap-2 ${
              urgentItems.length > 0 ? "text-rose-700" : "text-slate-500"
            }`}
          >
            <AlertTriangle size={18} />
            <span className="text-xs font-semibold">ต้องติดตามด่วน</span>
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${
              urgentItems.length > 0 ? "text-rose-700" : "text-slate-400"
            }`}
          >
            {urgentItems.length}
          </div>
          <div className={`text-[11px] ${urgentItems.length > 0 ? "text-rose-600" : "text-slate-400"}`}>
            {urgentItems.length === 0
              ? "ไม่มีรายการค้างเกิน 3 วัน"
              : criticalCount > 0
                ? `ค้างเกิน 3 วัน · เกิน 7 วัน ${criticalCount} รายการ`
                : "ค้างเกิน 3 วัน ควรตามผู้อนุมัติ"}
          </div>
        </button>
        {summaryCards.map(({ moduleKey, icon: Icon }) => {
          const mineCount = countByModule(myItems, moduleKey);
          const totalCount = countByModule(allItems, moduleKey);
          if (moduleKey === "user_approval" && !isMasterAdmin) return null;
          return (
            <div key={moduleKey} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-slate-600">
                <Icon size={18} />
                <span className="text-xs font-semibold">{MODULE_LABELS[moduleKey]}</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{mineCount}</div>
              {canSeeOverview && (
                <div className="text-[11px] text-slate-400">ทั้งหมด {totalCount} รายการ</div>
              )}
            </div>
          );
        })}
      </div>

      {/* แท็บ + ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              tab === "mine" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            รอฉันดำเนินการ ({myItems.length})
          </button>
          {canSeeOverview && (
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                tab === "overview" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              ภาพรวมทั้งหมด ({allItems.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setModuleFilter("all")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              moduleFilter === "all"
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            ทุกเรื่อง
          </button>
          {(Object.keys(MODULE_LABELS) as ApprovalModuleKey[]).map((moduleKey) => {
            if (moduleKey === "user_approval" && !isMasterAdmin) return null;
            return (
              <button
                key={moduleKey}
                type="button"
                onClick={() => setModuleFilter(moduleKey)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  moduleFilter === moduleKey
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {MODULE_LABELS[moduleKey]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              overdueOnly
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-white text-rose-600 border-rose-200 hover:bg-rose-50"
            }`}
          >
            <AlertTriangle size={11} />
            ค้างเกิน 3 วัน
          </button>
        </div>

        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / โครงการ / ขั้นตอน..."
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* รายการ */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : filteredList.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={28} />
            <div className="text-sm font-semibold text-slate-600">
              {tab === "mine" ? "ไม่มีรายการที่รอคุณดำเนินการ" : "ไม่มีรายการค้างอยู่"}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">เรื่อง</th>
                  <th className="px-3 py-2 font-semibold">รายการ</th>
                  <th className="px-3 py-2 font-semibold">ขั้นตอนปัจจุบัน</th>
                  <th className="px-3 py-2 font-semibold">ค้างอยู่กับ</th>
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">ค้างมา (วัน)</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((item) => {
                  const days = daysSince(item.pendingSince);
                  return (
                    <tr
                      key={item.key}
                      onClick={() => openItem(item)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${MODULE_BADGE_COLORS[item.module]}`}
                        >
                          {MODULE_LABELS[item.module]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-800">{item.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{item.detail}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${item.stageColor}`}
                        >
                          {item.stageLabel}
                        </span>
                        <div className="mt-0.5 text-[10px] text-slate-400">{item.actionLabel}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{item.waitingOn}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${agingClass(days)}`}>
                        {days === null ? "-" : days === 0 ? "วันนี้" : `${days} วัน`}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                          เปิดดู <ExternalLink size={11} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        คลิกรายการเพื่อไปยังหน้าอนุมัติ/ดำเนินการของเรื่องนั้นโดยตรง · รายการเรียงจากค้างนานที่สุดก่อน
        · สีจำนวนวัน: เกิน 3 วัน = เหลือง, เกิน 7 วัน = แดง
      </p>
    </div>
  );
};
