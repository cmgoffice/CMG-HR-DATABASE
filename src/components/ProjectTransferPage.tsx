import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  X,
  XCircle,
  History,
  FileText,
  CreditCard,
  ClipboardList,
  Upload,
  Trash2,
  ExternalLink,
  Shield,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Users,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { createNotifications } from "../utils/notifications";
import {
  ACTIVE_TRANSFER_STATUSES,
  CURRENT_PROJECT_FIELD,
  EMPLOYEE_TRANSFERS_COLLECTION,
  EmployeeTransfer,
  OPEN_TRANSFER_STORAGE_KEY,
  PROJECT_STATUS_FIELD,
  TRANSFER_DOCUMENT_TYPES,
  TRANSFER_STATUS_COLORS,
  TRANSFER_STATUS_LABELS,
  TRANSFER_TYPES,
  TransferChecklist,
  TransferDocumentType,
  TransferStatus,
  TransferType,
  canActAsSafety,
  canApproveHrm,
  canApprovePd,
  canApprovePmCm,
  canCancelTransfer,
  canEditChecklist,
  canIssueCard,
  canSendToSafety,
  canSubmitTransfer,
  computeEmployeeProjectUpdate,
  employeeDisplayName,
  emptyChecklist,
  ensureChecklist,
  isChecklistReadyToSend,
  isFullProjectTransfer,
  makeActionEvent,
  parseProjectList,
  projectsOverlap,
  sanitizeChecklistForWrite,
  stripUndefinedDeep,
} from "./projectTransferConfig";
import { uploadTransferAttachment, removeTransferAttachment } from "../utils/transferAttachments";

interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  สถานะพนักงาน?: string;
  สถานะโครงการ?: string | string[];
  โครงการปัจจุบัน?: string;
  ชื่อชุด?: string;
  employee_type?: string;
  [key: string]: unknown;
}

interface AppUser {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string[];
  status?: string;
  assignedProjects?: string[];
}

type TabKey = "requests" | "overview" | "history";

const formatDateTime = (ms?: number): string => {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const StatusBadge = ({ status }: { status: TransferStatus }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TRANSFER_STATUS_COLORS[status]}`}>
    {TRANSFER_STATUS_LABELS[status]}
  </span>
);

export const ProjectTransferPage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile, firebaseUser } = useAuth();
  const db = getFirestore();
  const uid = firebaseUser?.uid || "";
  const roles = userProfile?.role || [];
  const actorName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ") || userProfile?.email || "ผู้ใช้";
  const actorRole = roles[0] || "Staff";

  const [tab, setTab] = useState<TabKey>("requests");
  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [cardForm, setCardForm] = useState({ issuedDate: "", cardNo: "" });
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [checklistDraft, setChecklistDraft] = useState<TransferChecklist | null>(null);
  const [uploadingDocType, setUploadingDocType] = useState<TransferDocumentType | null>(null);
  const [otherDocLabel, setOtherDocLabel] = useState("");
  const [trainingCompleteDate, setTrainingCompleteDate] = useState("");
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [bulkActingBatchId, setBulkActingBatchId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [dayPopupKey, setDayPopupKey] = useState<string | null>(null);
  const [ganttRangeDays, setGanttRangeDays] = useState<14 | 30 | 60 | 90>(30);
  const [expandedGanttBatches, setExpandedGanttBatches] = useState<Record<string, boolean>>({});

  const [createForm, setCreateForm] = useState({
    selectMode: "group" as "group" | "person",
    laborGroupName: "",
    selectedEmployeeIds: [] as string[],
    employeeId: "",
    toProject: "",
    transferType: "ย้ายโครงการ" as TransferType,
    effectiveDate: "",
    reason: "",
    approverPmCmUid: "",
  });
  const [memberSearch, setMemberSearch] = useState("");

  const isAdminSiteOnly =
    roles.includes("Admin Site") &&
    !roles.some((r) => ["MasterAdmin", "HR", "HRM", "PD", "MD", "GM"].includes(r));
  const myAssignedProjects = userProfile?.assignedProjects || [];

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmployeeTransfer));
      rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      setTransfers(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "employee_data"), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const q = query(collection(db, "CMG-HR-Database", "root", "users"), where("status", "==", "approved"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const openId = sessionStorage.getItem(OPEN_TRANSFER_STORAGE_KEY);
    if (openId) {
      sessionStorage.removeItem(OPEN_TRANSFER_STORAGE_KEY);
      setSelectedId(openId);
      setTab("requests");
    }
  }, []);

  const pmCmApprovers = useMemo(
    () =>
      users.filter((u) => (u.role || []).some((r) => r === "PM" || r === "CM")),
    [users]
  );

  const filteredEmployees = useMemo(() => {
    let list = employees.filter((e) => {
      const status = String(e.สถานะพนักงาน || "").toLowerCase();
      return !status.includes("ลาออก") && !status.includes("พ้นสภาพ");
    });
    if (isAdminSiteOnly && myAssignedProjects.length > 0) {
      list = list.filter((e) =>
        projectsOverlap(parseProjectList(e.สถานะโครงการ), myAssignedProjects)
      );
    }
    return list;
  }, [employees, isAdminSiteOnly, myAssignedProjects]);

  const laborGroupOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        filteredEmployees
          .map((e) => String(e.ชื่อชุด || "").trim())
          .filter(Boolean)
      )
    );
    return names.sort((a, b) => a.localeCompare(b, "th"));
  }, [filteredEmployees]);

  const groupMembers = useMemo(() => {
    if (!createForm.laborGroupName) return [];
    const target = createForm.laborGroupName.trim();
    return filteredEmployees
      .filter((e) => String(e.ชื่อชุด || "").trim() === target)
      .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), "th"));
  }, [filteredEmployees, createForm.laborGroupName]);

  const visibleGroupMembers = useMemo(() => {
    if (!memberSearch.trim()) return groupMembers;
    const q = memberSearch.trim().toLowerCase();
    return groupMembers.filter((e) => {
      const name = employeeDisplayName(e).toLowerCase();
      const code = String(e.รหัสพนักงาน || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [groupMembers, memberSearch]);

  const selectedEmployeesForCreate = useMemo(() => {
    if (createForm.selectMode === "person") {
      const emp = filteredEmployees.find((e) => e.id === createForm.employeeId);
      return emp ? [emp] : [];
    }
    return groupMembers.filter((e) => createForm.selectedEmployeeIds.includes(e.id));
  }, [
    createForm.selectMode,
    createForm.employeeId,
    createForm.selectedEmployeeIds,
    filteredEmployees,
    groupMembers,
  ]);

  const selectLaborGroup = (groupName: string) => {
    const members = filteredEmployees.filter((e) => String(e.ชื่อชุด || "").trim() === groupName);
    setCreateForm((f) => ({
      ...f,
      laborGroupName: groupName,
      selectedEmployeeIds: members.map((m) => m.id),
    }));
    setMemberSearch("");
  };

  const toggleMember = (empId: string) => {
    setCreateForm((f) => {
      const has = f.selectedEmployeeIds.includes(empId);
      return {
        ...f,
        selectedEmployeeIds: has
          ? f.selectedEmployeeIds.filter((id) => id !== empId)
          : [...f.selectedEmployeeIds, empId],
      };
    });
  };

  const selectAllVisibleMembers = () => {
    const ids = new Set(createForm.selectedEmployeeIds);
    visibleGroupMembers.forEach((e) => ids.add(e.id));
    setCreateForm((f) => ({ ...f, selectedEmployeeIds: Array.from(ids) }));
  };

  const clearAllMembers = () => {
    setCreateForm((f) => ({ ...f, selectedEmployeeIds: [] }));
  };

  /** คำขอที่ผู้ใช้คนนี้มีสิทธิ์เห็น (scope ตาม role) — ยังไม่กรองสถานะ/ค้นหา */
  const scopedTransfers = useMemo(() => {
    let list = [...transfers];
    if (isAdminSiteOnly && myAssignedProjects.length > 0) {
      list = list.filter(
        (t) =>
          projectsOverlap(t.fromProjects || [], myAssignedProjects) ||
          projectsOverlap([t.toProject], myAssignedProjects) ||
          t.createdByUid === uid ||
          t.approverPmCmUid === uid
      );
    }
    // PM/CM ที่ไม่ใช่ admin เห็นคำขอที่ตัวเองต้องอนุมัติ + ที่ตัวเองเกี่ยวข้อง
    if (
      roles.some((r) => r === "PM" || r === "CM") &&
      !roles.some((r) => ["MasterAdmin", "HR", "HRM", "PD", "MD", "GM", "Admin Site", "Safety"].includes(r))
    ) {
      list = list.filter((t) => t.approverPmCmUid === uid || t.createdByUid === uid);
    }
    return list;
  }, [transfers, isAdminSiteOnly, myAssignedProjects, roles, uid]);

  const visibleTransfers = useMemo(() => {
    let list = [...scopedTransfers];
    if (statusFilter === "active") {
      list = list.filter((t) => ACTIVE_TRANSFER_STATUSES.includes(t.status));
    } else if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.employeeName.toLowerCase().includes(q) ||
          t.employeeCode.toLowerCase().includes(q) ||
          t.toProject.toLowerCase().includes(q) ||
          (t.fromProjects || []).some((p) => p.toLowerCase().includes(q))
      );
    }
    return list;
  }, [scopedTransfers, statusFilter, search]);

  type TransferRowGroup = { key: string; batchId?: string; items: EmployeeTransfer[] };

  const groupedTransferRows = useMemo<TransferRowGroup[]>(() => {
    const groups: TransferRowGroup[] = [];
    const indexByBatch = new Map<string, number>();
    for (const t of visibleTransfers) {
      if (t.batchId) {
        const idx = indexByBatch.get(t.batchId);
        if (idx !== undefined) {
          groups[idx].items.push(t);
        } else {
          indexByBatch.set(t.batchId, groups.length);
          groups.push({ key: t.batchId, batchId: t.batchId, items: [t] });
        }
      } else {
        groups.push({ key: t.id, items: [t] });
      }
    }
    return groups;
  }, [visibleTransfers]);

  const isBatchExpanded = (batchId: string) => expandedBatches[batchId] !== false;
  const toggleBatchExpanded = (batchId: string) =>
    setExpandedBatches((prev) => ({ ...prev, [batchId]: !isBatchExpanded(batchId) }));

  /** สถานะที่ผู้ใช้ปัจจุบันสามารถกดอนุมัติได้เลย ณ ตอนนี้ (ใช้กำหนดว่ารายการไหนอยู่ในกลุ่ม bulk approve ได้) */
  const canBulkApproveItem = (item: EmployeeTransfer): boolean => {
    if (item.status === "awaiting_pm_cm") return canApprovePmCm(item, uid, roles);
    if (item.status === "awaiting_pd") return canApprovePd(roles);
    if (item.status === "awaiting_hrm") return canApproveHrm(roles);
    return false;
  };

  const handleBulkApproveBatch = async (batchId: string) => {
    const items = transfers.filter((t) => t.batchId === batchId && canBulkApproveItem(t));
    if (items.length === 0) return;
    if (!window.confirm(`ยืนยันอนุมัติทั้งชุด ${items.length} คนที่ค้างอยู่ในขั้นของคุณ?`)) return;
    setBulkActingBatchId(batchId);
    try {
      for (const item of items) {
        if (item.status === "awaiting_pm_cm") await handleApprovePmCm(item);
        else if (item.status === "awaiting_pd") await handleApprovePd(item);
        else if (item.status === "awaiting_hrm") await handleApproveHrm(item);
      }
    } finally {
      setBulkActingBatchId(null);
    }
  };

  // ---------- ภาพรวม (Overview) ----------
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedTransfers.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [scopedTransfers]);

  type CalendarEventKind = "effective" | "training_planned" | "training_done" | "card";

  type CalendarEvent = {
    kind: CalendarEventKind;
    label: string;
    title: string;
    transferId: string;
    count: number;
  };

  /** ชื่อจริงไม่เอานามสกุล (ตัด token สุดท้ายออกเมื่อมีมากกว่า 1 คำ) */
  const firstNameOnly = (fullName: string): string => {
    const tokens = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return tokens[0] || "-";
    return tokens.slice(0, -1).join(" ");
  };

  const CALENDAR_KIND_PREFIX: Record<CalendarEventKind, string> = {
    effective: "มีผล",
    training_planned: "อบรม",
    training_done: "อบรมแล้ว",
    card: "ได้บัตร",
  };

  type RawCalendarEvent = { kind: CalendarEventKind; transfer: EmployeeTransfer };

  /** ทุก event ดิบต่อวัน (ไม่รวมชุด) — ใช้แสดงรายละเอียดเต็มในป็อบอัพเมื่อกดวัน */
  const calendarRawByDate = useMemo(() => {
    const rawByDate = new Map<string, RawCalendarEvent[]>();
    const push = (dateStr: string | undefined, ev: RawCalendarEvent) => {
      const key = String(dateStr || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      const arr = rawByDate.get(key) || [];
      arr.push(ev);
      rawByDate.set(key, arr);
    };
    scopedTransfers.forEach((t) => {
      if (t.status === "rejected" || t.status === "cancelled") return;
      push(t.effectiveDate, { kind: "effective", transfer: t });
      push(t.checklist?.training?.plannedDate, { kind: "training_planned", transfer: t });
      push(t.checklist?.training?.completedDate, { kind: "training_done", transfer: t });
      push(t.card?.issuedDate, { kind: "card", transfer: t });
    });
    return rawByDate;
  }, [scopedTransfers]);

  /** event ต่อวันแบบรวมชุด — ใช้แสดงเป็น chip เล็กๆ ในตารางปฏิทิน */
  const calendarEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    calendarRawByDate.forEach((events, dateKey) => {
      const groups = new Map<string, RawCalendarEvent[]>();
      events.forEach((ev) => {
        const groupKey = `${ev.kind}|${ev.transfer.batchId || ev.transfer.id}`;
        const arr = groups.get(groupKey) || [];
        arr.push(ev);
        groups.set(groupKey, arr);
      });
      const out: CalendarEvent[] = [];
      groups.forEach((items) => {
        const first = items[0];
        const prefix = CALENDAR_KIND_PREFIX[first.kind];
        const groupName = String(first.transfer.laborGroupName || "").trim();
        if (first.transfer.batchId && items.length > 1) {
          // ทั้งชุด (หรือหลายคนในชุด) ตรงกันวันนี้ — แสดงเป็นชื่อชุด
          const names = items.map((i) => firstNameOnly(i.transfer.employeeName)).join(", ");
          out.push({
            kind: first.kind,
            label: `${prefix}: ชุด ${groupName || "ยื่นพร้อมกัน"} (${items.length})`,
            title: `${prefix} ${items.length} คน → ${first.transfer.toProject}\n${names}`,
            transferId: first.transfer.id,
            count: items.length,
          });
        } else if (first.transfer.batchId) {
          // คนเดียวในชุดที่สถานะ/วันต่างจากคนอื่น — ใส่ชื่อชุดหน้าชื่อจริง
          const name = firstNameOnly(first.transfer.employeeName);
          out.push({
            kind: first.kind,
            label: `${prefix}: ${groupName ? `${groupName}·` : ""}${name}`,
            title: `${prefix}: ${first.transfer.employeeName} → ${first.transfer.toProject}`,
            transferId: first.transfer.id,
            count: 1,
          });
        } else {
          out.push({
            kind: first.kind,
            label: `${prefix}: ${firstNameOnly(first.transfer.employeeName)}`,
            title: `${prefix}: ${first.transfer.employeeName} → ${first.transfer.toProject}`,
            transferId: first.transfer.id,
            count: 1,
          });
        }
      });
      map.set(dateKey, out);
    });
    return map;
  }, [calendarRawByDate]);

  const calendarWeeks = useMemo(() => {
    const first = new Date(calMonth.year, calMonth.month, 1);
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const startPad = first.getDay(); // Sunday = 0
    const cells: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(
        `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      );
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [calMonth]);

  const recentActions = useMemo(() => {
    const rows: { transfer: EmployeeTransfer; action: EmployeeTransfer["actions"][number] }[] = [];
    scopedTransfers.forEach((t) => {
      (t.actions || []).forEach((a) => rows.push({ transfer: t, action: a }));
    });
    rows.sort((a, b) => (b.action.actedAt || 0) - (a.action.actedAt || 0));
    return rows.slice(0, 25);
  }, [scopedTransfers]);

  const openTransfer = (id: string) => {
    setSelectedId(id);
    setTab("requests");
  };

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const EVENT_STYLES: Record<CalendarEvent["kind"], string> = {
    effective: "bg-blue-100 text-blue-800",
    training_planned: "bg-amber-100 text-amber-800",
    training_done: "bg-teal-100 text-teal-800",
    card: "bg-emerald-100 text-emerald-800",
  };

  const dayPopupEvents = useMemo(() => {
    if (!dayPopupKey) return [];
    return calendarRawByDate.get(dayPopupKey) || [];
  }, [dayPopupKey, calendarRawByDate]);

  // ---------- Gantt ----------
  type TransferRowGroupGeneric = { key: string; batchId?: string; items: EmployeeTransfer[] };

  const groupByBatch = (list: EmployeeTransfer[]): TransferRowGroupGeneric[] => {
    const groups: TransferRowGroupGeneric[] = [];
    const indexByBatch = new Map<string, number>();
    for (const t of list) {
      if (t.batchId) {
        const idx = indexByBatch.get(t.batchId);
        if (idx !== undefined) groups[idx].items.push(t);
        else {
          indexByBatch.set(t.batchId, groups.length);
          groups.push({ key: t.batchId, batchId: t.batchId, items: [t] });
        }
      } else {
        groups.push({ key: t.id, items: [t] });
      }
    }
    return groups;
  };

  const STATUS_BAR_COLORS: Record<TransferStatus, string> = {
    awaiting_pm_cm: "bg-amber-400",
    awaiting_pd: "bg-orange-400",
    awaiting_hrm: "bg-blue-400",
    preparing: "bg-violet-400",
    awaiting_safety: "bg-cyan-500",
    closed: "bg-emerald-500",
    rejected: "bg-rose-400",
    cancelled: "bg-slate-300",
  };

  type StageSegment = { status: TransferStatus; start: number; end: number };

  const buildStageSegments = (t: EmployeeTransfer): StageSegment[] => {
    const events = (t.actions || [])
      .filter((a) => !!a.status)
      .map((a) => ({ status: a.status as TransferStatus, start: a.actedAt }))
      .sort((a, b) => a.start - b.start);
    if (events.length === 0) {
      return [{ status: t.status, start: t.createdAt, end: Date.now() }];
    }
    const isFinal = t.status === "closed" || t.status === "rejected" || t.status === "cancelled";
    return events.map((e, i) => ({
      status: e.status,
      start: e.start,
      end: i + 1 < events.length ? events[i + 1].start : isFinal ? t.closedAt || t.updatedAt || e.start : Date.now(),
    }));
  };

  const GANTT_RANGE_OPTIONS: Array<14 | 30 | 60 | 90> = [14, 30, 60, 90];

  const ganttWindow = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeMs = ganttRangeDays * dayMs;
    // เผื่อขอบซ้าย-ขวาไว้เล็กน้อย กันไม่ให้แท่งข้อมูล (โดยเฉพาะของวันนี้) ไปชิดริมจนดูเหมือนไม่มีข้อมูล
    const padding = Math.max(rangeMs * 0.06, dayMs);
    return { start: now - rangeMs - padding, end: now + padding };
  }, [ganttRangeDays]);

  const ganttGroups = useMemo(() => {
    // ไม่แสดงคำขอที่ถูกยกเลิก/ปฏิเสธแล้วใน Gantt chart (ไม่ใช่ pipeline ที่กำลังดำเนินการ)
    const eligible = scopedTransfers.filter((t) => t.status !== "cancelled" && t.status !== "rejected");
    const groups = groupByBatch(eligible);
    const inWindow = groups.filter((g) =>
      g.items.some(
        (t) =>
          ACTIVE_TRANSFER_STATUSES.includes(t.status) ||
          (t.updatedAt || t.createdAt) >= ganttWindow.start
      )
    );
    inWindow.sort((a, b) => {
      const aLatest = Math.max(...a.items.map((t) => t.updatedAt || t.createdAt || 0));
      const bLatest = Math.max(...b.items.map((t) => t.updatedAt || t.createdAt || 0));
      return bLatest - aLatest;
    });
    return inWindow;
  }, [scopedTransfers, ganttWindow]);

  const isGanttBatchExpanded = (batchId: string) => !!expandedGanttBatches[batchId];
  const toggleGanttBatchExpanded = (batchId: string) =>
    setExpandedGanttBatches((prev) => ({ ...prev, [batchId]: !isGanttBatchExpanded(batchId) }));

  const ganttTicks = useMemo(() => {
    const { start, end } = ganttWindow;
    const totalDays = Math.round((end - start) / (24 * 60 * 60 * 1000));
    const step = totalDays <= 14 ? 2 : totalDays <= 30 ? 5 : totalDays <= 60 ? 10 : 15;
    const ticks: { pct: number; label: string }[] = [];
    for (let d = 0; d <= totalDays; d += step) {
      const ts = start + d * 24 * 60 * 60 * 1000;
      ticks.push({
        pct: (d / totalDays) * 100,
        label: new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      });
    }
    return ticks;
  }, [ganttWindow]);

  const todayPct = useMemo(() => {
    const { start, end } = ganttWindow;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  }, [ganttWindow]);

  const renderGanttBar = (t: EmployeeTransfer) => {
    const segments = buildStageSegments(t);
    const { start: winStart, end: winEnd } = ganttWindow;
    const span = winEnd - winStart;
    return (
      <div className="relative h-6 flex-1 rounded bg-slate-50">
        {segments.map((seg, i) => {
          const segStart = Math.max(seg.start, winStart);
          const segEnd = Math.min(seg.end, winEnd);
          if (segEnd <= segStart) return null;
          const leftPct = ((segStart - winStart) / span) * 100;
          const widthPct = Math.max(((segEnd - segStart) / span) * 100, 0.6);
          return (
            <div
              key={i}
              title={`${TRANSFER_STATUS_LABELS[seg.status]} (${new Date(seg.start).toLocaleDateString("th-TH")} - ${new Date(Math.min(seg.end, Date.now())).toLocaleDateString("th-TH")})`}
              className={`absolute top-0.5 bottom-0.5 rounded-sm ${STATUS_BAR_COLORS[seg.status]} hover:opacity-80 cursor-pointer`}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              onClick={(e) => {
                e.stopPropagation();
                openTransfer(t.id);
              }}
            />
          );
        })}
      </div>
    );
  };

  const selected = useMemo(
    () => transfers.find((t) => t.id === selectedId) || null,
    [transfers, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setChecklistDraft(null);
      return;
    }
    if (selected.status === "preparing" || selected.status === "awaiting_safety" || selected.checklist) {
      setChecklistDraft(ensureChecklist(selected.checklist));
    } else {
      setChecklistDraft(null);
    }
    setTrainingCompleteDate(selected.checklist?.training?.completedDate || "");
  }, [selected?.id, selected?.status, selected?.updatedAt]);

  const historyRows = useMemo(() => {
    if (!historyEmployeeId) return [];
    return transfers
      .filter((t) => t.employeeId === historyEmployeeId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [transfers, historyEmployeeId]);

  const logActivity = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: userProfile?.email || actorName,
        module: "project_transfer",
        action,
        details,
        createdAt: Date.now(),
      });
    } catch {
      // fire-and-forget
    }
  };

  const notifyUidsByRoles = (targetRoles: string[]): string[] =>
    users
      .filter((u) => (u.role || []).some((r) => targetRoles.includes(r)))
      .map((u) => u.uid);

  const handleCreate = async () => {
    if (!canSubmitTransfer(roles)) return;
    const approver = pmCmApprovers.find((u) => u.uid === createForm.approverPmCmUid);
    const targets = selectedEmployeesForCreate;
    if (targets.length === 0 || !approver || !createForm.toProject) {
      alert("กรุณาเลือกพนักงานอย่างน้อย 1 คน โครงการปลายทาง และผู้อนุมัติ PM/CM ให้ครบ");
      return;
    }
    const approverRole = (approver.role || []).find((r) => r === "PM" || r === "CM") || "PM";
    const approverName = [approver.firstName, approver.lastName].filter(Boolean).join(" ") || approver.email || "ผู้อนุมัติ";
    const actor = { uid, name: actorName, role: actorRole };
    const now = Date.now();
    const batchId =
      targets.length > 1
        ? `batch-${now}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;
    const laborGroupName =
      createForm.selectMode === "group" && createForm.laborGroupName
        ? createForm.laborGroupName
        : undefined;

    setSaving(true);
    try {
      const createdIds: string[] = [];
      for (const emp of targets) {
        const fromProjects = parseProjectList(emp.สถานะโครงการ);
        const action = makeActionEvent("submitted", "ยื่นคำขอย้ายโครงการ", actor, {
          status: "awaiting_pm_cm",
          ...(createForm.reason.trim() ? { note: createForm.reason.trim() } : {}),
        });
        const groupName =
          laborGroupName || String(emp.ชื่อชุด || "").trim() || "";
        const payload = stripUndefinedDeep({
          employeeId: emp.id,
          employeeCode: String(emp.รหัสพนักงาน || ""),
          employeeName: employeeDisplayName(emp),
          position: String(emp.ตำแหน่ง || ""),
          employeeType: String(emp.employee_type || ""),
          ...(groupName ? { laborGroupName: groupName } : {}),
          ...(batchId ? { batchId } : {}),
          fromProjects,
          toProject: createForm.toProject,
          transferType: createForm.transferType,
          ...(createForm.effectiveDate ? { effectiveDate: createForm.effectiveDate } : {}),
          ...(createForm.reason.trim() ? { reason: createForm.reason.trim() } : {}),
          status: "awaiting_pm_cm" as const,
          approverPmCmUid: approver.uid,
          approverPmCmName: approverName,
          approverPmCmRole: approverRole,
          actions: [action],
          createdByUid: uid,
          createdByName: actorName,
          createdByRole: actorRole,
          createdAt: now,
          updatedAt: now,
          lastActionAt: now,
        });
        const ref = await addDoc(
          collection(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION),
          payload
        );
        createdIds.push(ref.id);
      }

      const summaryName =
        targets.length === 1
          ? targets[0]
            ? employeeDisplayName(targets[0])
            : "พนักงาน"
          : `${targets.length} คน${laborGroupName ? ` (ชุด ${laborGroupName})` : ""}`;

      void createNotifications(db, [approver.uid], {
        module: "project_transfer",
        type: "transfer_submitted",
        title: "มีคำขอย้ายโครงการรออนุมัติ",
        message: `${actorName} ยื่นคำขอย้าย ${summaryName} ไป ${createForm.toProject}`,
        caseId: createdIds[0] || "",
        createdByUid: uid,
        createdByName: actorName,
      });
      await logActivity(
        "ยื่นคำขอ",
        `ย้าย ${summaryName} → ${createForm.toProject}${batchId ? ` [${batchId}]` : ""}`
      );
      setShowCreate(false);
      setCreateForm({
        selectMode: "group",
        laborGroupName: "",
        selectedEmployeeIds: [],
        employeeId: "",
        toProject: "",
        transferType: "ย้ายโครงการ",
        effectiveDate: "",
        reason: "",
        approverPmCmUid: "",
      });
      setMemberSearch("");
      setSelectedId(createdIds[0] || null);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`บันทึกคำขอไม่สำเร็จ\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const applyStatusTransition = async (
    transfer: EmployeeTransfer,
    nextStatus: TransferStatus,
    actionType: Parameters<typeof makeActionEvent>[0],
    actionLabel: string,
    note?: string,
    extraFields?: Record<string, unknown>,
    notifyUids?: string[]
  ) => {
    const actor = { uid, name: actorName, role: actorRole };
    const action = makeActionEvent(actionType, actionLabel, actor, {
      status: nextStatus,
      note,
    });
    const now = Date.now();
    setSaving(true);
    try {
      await updateDoc(
        doc(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION, transfer.id),
        stripUndefinedDeep({
          status: nextStatus,
          actions: [...(transfer.actions || []), action],
          updatedAt: now,
          lastActionAt: now,
          ...(extraFields || {}),
        })
      );
      if (notifyUids && notifyUids.length > 0) {
        void createNotifications(db, notifyUids, {
          module: "project_transfer",
          type: "transfer_status_changed",
          title: actionLabel,
          message: `${transfer.employeeName}: ${TRANSFER_STATUS_LABELS[nextStatus]}${note ? ` — ${note}` : ""}`,
          caseId: transfer.id,
          createdByUid: uid,
          createdByName: actorName,
        });
      }
      await logActivity(actionLabel, `${transfer.employeeName} → ${TRANSFER_STATUS_LABELS[nextStatus]}`);
      setShowRejectBox(false);
      setRejectNote("");
    } catch (e) {
      console.error(e);
      alert("อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleApprovePmCm = async (transfer: EmployeeTransfer) => {
    if (!canApprovePmCm(transfer, uid, roles)) return;
    await applyStatusTransition(
      transfer,
      "awaiting_pd",
      "approved_pm_cm",
      "PM/CM อนุมัติ",
      undefined,
      undefined,
      notifyUidsByRoles(["PD", "MasterAdmin"])
    );
  };

  const handleApprovePd = async (transfer: EmployeeTransfer) => {
    if (!canApprovePd(roles) || transfer.status !== "awaiting_pd") return;
    await applyStatusTransition(
      transfer,
      "awaiting_hrm",
      "approved_pd",
      "PD อนุมัติ",
      undefined,
      undefined,
      notifyUidsByRoles(["HRM", "MasterAdmin"])
    );
  };

  const handleApproveHrm = async (transfer: EmployeeTransfer) => {
    if (!canApproveHrm(roles) || transfer.status !== "awaiting_hrm") return;
    await applyStatusTransition(
      transfer,
      "preparing",
      "approved_hrm",
      "HRM อนุมัติ — เข้าขั้นเตรียมเอกสาร/ตรวจสุขภาพ/อบรม",
      undefined,
      { checklist: sanitizeChecklistForWrite(transfer.checklist || emptyChecklist()) },
      [transfer.createdByUid, ...notifyUidsByRoles(["HR", "Admin Site"])]
    );
  };

  const saveChecklist = async (transfer: EmployeeTransfer, draft: TransferChecklist, withAction = true) => {
    if (!canEditChecklist(roles) || transfer.status !== "preparing") return;
    const actor = { uid, name: actorName, role: actorRole };
    const now = Date.now();
    const next = sanitizeChecklistForWrite({
      ...draft,
      updatedAt: now,
      updatedByUid: uid,
      updatedByName: actorName,
    });
    const actions = withAction
      ? [
          ...(transfer.actions || []),
          makeActionEvent("checklist_updated", "อัปเดต checklist เอกสาร/ตรวจสุขภาพ/อบรม", actor, {
            status: "preparing",
          }),
        ]
      : transfer.actions || [];
    setSaving(true);
    try {
      await updateDoc(
        doc(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION, transfer.id),
        stripUndefinedDeep({
          checklist: next,
          actions,
          updatedAt: now,
          lastActionAt: now,
        })
      );
      setChecklistDraft(ensureChecklist(next));
      await logActivity("อัปเดต checklist", transfer.employeeName);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`บันทึก checklist ไม่สำเร็จ\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocument = async (
    transfer: EmployeeTransfer,
    docType: TransferDocumentType,
    file: File
  ) => {
    if (!canEditChecklist(roles) || transfer.status !== "preparing") return;
    const draft = ensureChecklist(checklistDraft || transfer.checklist);
    setUploadingDocType(docType);
    try {
      const url = await uploadTransferAttachment(transfer.id, file);
      const nextDoc = stripUndefinedDeep({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: docType,
        ...(docType === "อื่นๆ" || otherDocLabel.trim()
          ? { label: otherDocLabel.trim() || "อื่นๆ" }
          : {}),
        url,
        fileName: file.name,
        uploadedByUid: uid,
        uploadedByName: actorName,
        uploadedAt: Date.now(),
      });
      const next: TransferChecklist = {
        ...draft,
        documents: [...draft.documents, nextDoc],
      };
      setChecklistDraft(next);
      setOtherDocLabel("");
      await saveChecklist(transfer, next, true);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`อัปโหลดเอกสารไม่สำเร็จ\n${msg}`);
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleRemoveDocument = async (transfer: EmployeeTransfer, docId: string) => {
    if (!canEditChecklist(roles) || transfer.status !== "preparing") return;
    const draft = ensureChecklist(checklistDraft || transfer.checklist);
    const target = draft.documents.find((d) => d.id === docId);
    const next: TransferChecklist = {
      ...draft,
      documents: draft.documents.filter((d) => d.id !== docId),
    };
    setChecklistDraft(next);
    if (target?.url) void removeTransferAttachment(target.url);
    await saveChecklist(transfer, next, true);
  };

  const handleSendToSafety = async (transfer: EmployeeTransfer) => {
    if (!canSendToSafety(roles) || transfer.status !== "preparing") return;
    const draft = ensureChecklist(checklistDraft || transfer.checklist);
    const ready = isChecklistReadyToSend(draft);
    if (!ready.ok) {
      alert(ready.reason || "checklist ยังไม่พร้อม");
      return;
    }
    const actor = { uid, name: actorName, role: actorRole };
    const now = Date.now();
    const action = makeActionEvent("sent_to_safety", "ส่งเรื่องให้ Safety ดำเนินการ", actor, {
      status: "awaiting_safety",
    });
    const checklist = sanitizeChecklistForWrite({
      ...draft,
      updatedAt: now,
      updatedByUid: uid,
      updatedByName: actorName,
    });
    setSaving(true);
    try {
      await updateDoc(
        doc(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION, transfer.id),
        stripUndefinedDeep({
          status: "awaiting_safety",
          checklist,
          actions: [...(transfer.actions || []), action],
          updatedAt: now,
          lastActionAt: now,
          sentToSafetyAt: now,
        })
      );
      void createNotifications(db, notifyUidsByRoles(["Safety", "MasterAdmin"]), {
        module: "project_transfer",
        type: "transfer_status_changed",
        title: "มีคำขอย้ายรอ Safety ดำเนินการ",
        message: `${transfer.employeeName} → ${transfer.toProject}`,
        caseId: transfer.id,
        createdByUid: uid,
        createdByName: actorName,
      });
      await logActivity("ส่ง Safety", `${transfer.employeeName} → ${transfer.toProject}`);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`ส่ง Safety ไม่สำเร็จ\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordTraining = async (transfer: EmployeeTransfer) => {
    if (!canActAsSafety(roles) || transfer.status !== "awaiting_safety") return;
    if (!trainingCompleteDate) {
      alert("กรุณาระบุวันที่อบรมเสร็จ");
      return;
    }
    const draft = ensureChecklist(checklistDraft || transfer.checklist);
    const next = sanitizeChecklistForWrite({
      ...draft,
      training: {
        ...draft.training,
        required: true,
        status: "done",
        completedDate: trainingCompleteDate,
      },
      updatedAt: Date.now(),
      updatedByUid: uid,
      updatedByName: actorName,
    });
    const actor = { uid, name: actorName, role: actorRole };
    const now = Date.now();
    const action = makeActionEvent("training_recorded", "บันทึกผลอบรมเข้าโครงการ", actor, {
      status: "awaiting_safety",
      note: `อบรมเมื่อ ${trainingCompleteDate}`,
    });
    setSaving(true);
    try {
      await updateDoc(
        doc(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION, transfer.id),
        stripUndefinedDeep({
          checklist: next,
          actions: [...(transfer.actions || []), action],
          updatedAt: now,
          lastActionAt: now,
        })
      );
      setChecklistDraft(ensureChecklist(next));
      await logActivity("บันทึกอบรม", `${transfer.employeeName} ${trainingCompleteDate}`);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`บันทึกผลอบรมไม่สำเร็จ\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (transfer: EmployeeTransfer) => {
    if (!rejectNote.trim()) {
      alert("กรุณาระบุเหตุผลที่ตีกลับ");
      return;
    }
    const canRejectNow =
      canApprovePmCm(transfer, uid, roles) ||
      (transfer.status === "awaiting_pd" && canApprovePd(roles)) ||
      (transfer.status === "awaiting_hrm" && canApproveHrm(roles));
    if (!canRejectNow) return;
    await applyStatusTransition(
      transfer,
      "rejected",
      "rejected",
      "ตีกลับคำขอ",
      rejectNote.trim(),
      undefined,
      [transfer.createdByUid]
    );
  };

  const handleCancel = async (transfer: EmployeeTransfer) => {
    if (!canCancelTransfer(transfer, uid, roles)) return;
    if (!window.confirm("ยืนยันยกเลิกคำขอย้ายนี้?")) return;
    await applyStatusTransition(
      transfer,
      "cancelled",
      "cancelled",
      "ยกเลิกคำขอ",
      undefined,
      undefined,
      [transfer.approverPmCmUid]
    );
  };

  const handleIssueCard = async (transfer: EmployeeTransfer) => {
    if (!canIssueCard(roles) || transfer.status !== "awaiting_safety") return;
    if (!cardForm.issuedDate) {
      alert("กรุณาระบุวันที่ได้ออกบัตร");
      return;
    }
    const draft = ensureChecklist(transfer.checklist);
    if (draft.training.required && draft.training.status !== "done") {
      if (!window.confirm("ยังไม่ได้บันทึกผลอบรม — ยืนยันออกบัตรและปิดงานเลยหรือไม่?")) return;
    }
    setSaving(true);
    try {
      const empRef = doc(db, "CMG-HR-Database", "root", "employee_data", transfer.employeeId);
      const empSnap = await getDoc(empRef);
      if (!empSnap.exists()) {
        alert("ไม่พบข้อมูลพนักงานในระบบ");
        setSaving(false);
        return;
      }
      const empData = empSnap.data() as Employee;
      const currentProjects = parseProjectList(empData[PROJECT_STATUS_FIELD]);
      const update = computeEmployeeProjectUpdate(
        currentProjects,
        transfer.fromProjects || [],
        transfer.toProject,
        transfer.transferType
      );

      await updateDoc(empRef, {
        [PROJECT_STATUS_FIELD]: update.สถานะโครงการ,
        [CURRENT_PROJECT_FIELD]: update.โครงการปัจจุบัน,
      });

      const actor = { uid, name: actorName, role: actorRole };
      const now = Date.now();
      const action = makeActionEvent("card_issued", "บันทึกได้บัตรเข้าโครงการ — ปิดงาน", actor, {
        status: "closed",
        note: cardForm.cardNo ? `เลขบัตร ${cardForm.cardNo}` : undefined,
      });

      await updateDoc(doc(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION, transfer.id), {
        status: "closed",
        actions: [...(transfer.actions || []), action],
        card: {
          issuedDate: cardForm.issuedDate,
          cardNo: cardForm.cardNo || undefined,
          issuedByUid: uid,
          issuedByName: actorName,
        },
        updatedAt: now,
        lastActionAt: now,
        closedAt: now,
      });

      void createNotifications(db, [transfer.createdByUid, transfer.approverPmCmUid], {
        module: "project_transfer",
        type: "transfer_closed",
        title: "ได้บัตรเข้าโครงการแล้ว",
        message: `${transfer.employeeName} เข้าโครงการ ${transfer.toProject} เรียบร้อย`,
        caseId: transfer.id,
        createdByUid: uid,
        createdByName: actorName,
      });
      await logActivity(
        "ได้บัตรเข้าโครงการ",
        `${transfer.employeeName} → ${transfer.toProject} (${transfer.transferType})`
      );
      setCardForm({ issuedDate: "", cardNo: "" });
    } catch (e) {
      console.error(e);
      alert("บันทึกการออกบัตรไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const selectedEmp = createForm.selectMode === "person" && createForm.employeeId
    ? employees.find((e) => e.id === createForm.employeeId)
    : null;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-blue-600" />
            ย้ายโครงการ
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            คำขออนุมัติย้าย / ไปช่วยงาน และประวัติการย้ายของพนักงาน
          </p>
        </div>
        {canSubmitTransfer(roles) && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            ยื่นคำขอย้าย
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            { key: "requests" as const, label: "รายการคำขอ", icon: FileText },
            { key: "overview" as const, label: "ภาพรวม", icon: CalendarDays },
            { key: "history" as const, label: "ประวัติการย้าย", icon: History },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={22} />
          กำลังโหลด...
        </div>
      ) : tab === "requests" ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[420px]">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ / รหัส / โครงการ"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="active">ค้างดำเนินการ</option>
                <option value="all">ทุกสถานะ</option>
                {Object.entries(TRANSFER_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {groupedTransferRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">ไม่มีคำขอในตัวกรองนี้</div>
              ) : (
                groupedTransferRows.map((group) => {
                  if (!group.batchId) {
                    const t = group.items[0];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${
                          selectedId === t.id ? "bg-blue-50" : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-800 truncate">{t.employeeName}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {t.employeeCode || "-"} · {t.transferType}
                              {t.laborGroupName ? ` · ชุด ${t.laborGroupName}` : ""}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5 truncate">→ {t.toProject}</div>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      </button>
                    );
                  }

                  const expanded = isBatchExpanded(group.batchId);
                  const bulkCount = group.items.filter((it) => canBulkApproveItem(it)).length;
                  const isBulking = bulkActingBatchId === group.batchId;
                  return (
                    <div key={group.key} className="bg-white">
                      <div className="flex items-center gap-1.5 px-2 py-2 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => toggleBatchExpanded(group.batchId!)}
                          className="p-1 text-slate-500 hover:bg-slate-200 rounded shrink-0"
                        >
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Users size={12} />
                            <span className="truncate">
                              {group.items[0].laborGroupName ? `ชุด ${group.items[0].laborGroupName}` : "ยื่นพร้อมกัน"}
                            </span>
                            <span className="text-slate-400 font-normal">· {group.items.length} คน</span>
                          </div>
                          <div className="text-xs text-slate-500 truncate">→ {group.items[0].toProject}</div>
                        </div>
                        {bulkCount > 0 && (
                          <button
                            type="button"
                            disabled={isBulking}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleBulkApproveBatch(group.batchId!);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                          >
                            {isBulking ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            อนุมัติทั้งชุด ({bulkCount})
                          </button>
                        )}
                      </div>
                      {expanded &&
                        group.items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedId(t.id)}
                            className={`w-full text-left pl-8 pr-3 py-2 hover:bg-slate-50 transition-colors border-t border-slate-100 ${
                              selectedId === t.id ? "bg-blue-50" : "bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-800 truncate">{t.employeeName}</div>
                                <div className="text-xs text-slate-500 truncate">{t.employeeCode || "-"}</div>
                              </div>
                              <StatusBadge status={t.status} />
                            </div>
                          </button>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-4 min-h-[320px]">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                เลือกคำขอจากรายการด้านซ้ายเพื่อดูรายละเอียด
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{selected.employeeName}</h3>
                    <p className="text-sm text-slate-500">
                      {selected.employeeCode || "-"} · {selected.position || "-"}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <InfoRow label="ประเภท" value={selected.transferType} />
                  <InfoRow label="วันที่มีผล (ระบุ)" value={selected.effectiveDate || "-"} />
                  <InfoRow label="ชื่อชุด" value={selected.laborGroupName || "-"} />
                  <InfoRow
                    label="จากโครงการ"
                    value={(selected.fromProjects || []).join(", ") || "-"}
                  />
                  <InfoRow label="ไปโครงการ" value={selected.toProject} />
                  <InfoRow
                    label="ผู้อนุมัติ PM/CM"
                    value={`${selected.approverPmCmName} (${selected.approverPmCmRole})`}
                  />
                  <InfoRow label="ผู้ยื่น" value={`${selected.createdByName} (${selected.createdByRole})`} />
                  <InfoRow label="เหตุผล" value={selected.reason || "-"} className="sm:col-span-2" />
                </div>

                {selected.card?.issuedDate && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    ได้บัตรเมื่อ {selected.card.issuedDate}
                    {selected.card.cardNo ? ` · เลขบัตร ${selected.card.cardNo}` : ""}
                    {selected.card.issuedByName ? ` · โดย ${selected.card.issuedByName}` : ""}
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                    ไทม์ไลน์การอนุมัติ
                  </h4>
                  <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
                    {(selected.actions || []).map((a) => (
                      <li key={a.id} className="text-sm">
                        <div className="font-medium text-slate-800">{a.label}</div>
                        <div className="text-xs text-slate-500">
                          {a.actedByName} ({a.actedByRole}) · {formatDateTime(a.actedAt)}
                        </div>
                        {a.note && <div className="text-xs text-slate-600 mt-0.5">{a.note}</div>}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  {canApprovePmCm(selected, uid, roles) && (
                    <ActionBtn
                      disabled={saving}
                      onClick={() => handleApprovePmCm(selected)}
                      variant="primary"
                      icon={<CheckCircle2 size={14} />}
                      label="PM/CM อนุมัติ"
                    />
                  )}
                  {selected.status === "awaiting_pd" && canApprovePd(roles) && (
                    <ActionBtn
                      disabled={saving}
                      onClick={() => handleApprovePd(selected)}
                      variant="primary"
                      icon={<CheckCircle2 size={14} />}
                      label="PD อนุมัติ"
                    />
                  )}
                  {selected.status === "awaiting_hrm" && canApproveHrm(roles) && (
                    <ActionBtn
                      disabled={saving}
                      onClick={() => handleApproveHrm(selected)}
                      variant="primary"
                      icon={<CheckCircle2 size={14} />}
                      label="HRM อนุมัติ"
                    />
                  )}
                  {(canApprovePmCm(selected, uid, roles) ||
                    (selected.status === "awaiting_pd" && canApprovePd(roles)) ||
                    (selected.status === "awaiting_hrm" && canApproveHrm(roles))) && (
                    <ActionBtn
                      disabled={saving}
                      onClick={() => setShowRejectBox((v) => !v)}
                      variant="danger"
                      icon={<XCircle size={14} />}
                      label="ตีกลับ"
                    />
                  )}
                  {canCancelTransfer(selected, uid, roles) && (
                    <ActionBtn
                      disabled={saving}
                      onClick={() => handleCancel(selected)}
                      variant="ghost"
                      label="ยกเลิกคำขอ"
                    />
                  )}
                </div>

                {showRejectBox && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      placeholder="เหตุผลที่ตีกลับ..."
                      className="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleReject(selected)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      ยืนยันตีกลับ
                    </button>
                  </div>
                )}

                {(selected.status === "preparing" || selected.status === "awaiting_safety" || selected.checklist) &&
                  checklistDraft && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 border-b border-slate-200 text-sm font-semibold text-slate-800">
                      <ClipboardList size={14} />
                      Checklist เข้าโครงการ
                      {selected.status === "preparing" && canEditChecklist(roles) && (
                        <span className="ml-auto text-xs font-normal text-slate-500">แก้ไขได้ในขั้นนี้</span>
                      )}
                    </div>
                    <div className="p-3 space-y-4">
                      {/* Health check */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ตรวจสุขภาพ</div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checklistDraft.healthCheck.required}
                            disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                            onChange={(e) => {
                              const required = e.target.checked;
                              setChecklistDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      healthCheck: {
                                        ...d.healthCheck,
                                        required,
                                        status: required ? "pending" : "not_needed",
                                      },
                                    }
                                  : d
                              );
                            }}
                          />
                          ต้องส่งตรวจสุขภาพ
                        </label>
                        {checklistDraft.healthCheck.required && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            <label className="text-xs text-slate-600">
                              สถานะ
                              <select
                                value={checklistDraft.healthCheck.status}
                                disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                                onChange={(e) =>
                                  setChecklistDraft((d) =>
                                    d
                                      ? {
                                          ...d,
                                          healthCheck: {
                                            ...d.healthCheck,
                                            status: e.target.value as TransferChecklist["healthCheck"]["status"],
                                          },
                                        }
                                      : d
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                              >
                                <option value="pending">รอดำเนินการ</option>
                                <option value="done">ตรวจแล้ว</option>
                                <option value="not_needed">ไม่ต้องตรวจ</option>
                              </select>
                            </label>
                            <label className="text-xs text-slate-600">
                              วันที่ตรวจ
                              <input
                                type="date"
                                value={checklistDraft.healthCheck.date || ""}
                                disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                                onChange={(e) =>
                                  setChecklistDraft((d) =>
                                    d
                                      ? { ...d, healthCheck: { ...d.healthCheck, date: e.target.value } }
                                      : d
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Training */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">อบรมเข้าโครงการ</div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checklistDraft.training.required}
                            disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                            onChange={(e) => {
                              const required = e.target.checked;
                              setChecklistDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      training: {
                                        ...d.training,
                                        required,
                                        status: required ? "pending" : "not_needed",
                                      },
                                    }
                                  : d
                              );
                            }}
                          />
                          ต้องส่งอบรมเข้าโครงการ
                        </label>
                        {checklistDraft.training.required && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            <label className="text-xs text-slate-600">
                              วันอบรมที่วางแผน
                              <input
                                type="date"
                                value={checklistDraft.training.plannedDate || ""}
                                disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                                onChange={(e) =>
                                  setChecklistDraft((d) =>
                                    d
                                      ? { ...d, training: { ...d.training, plannedDate: e.target.value } }
                                      : d
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                              />
                            </label>
                            <div className="text-xs text-slate-600">
                              สถานะอบรม
                              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
                                {checklistDraft.training.status === "done"
                                  ? `อบรมแล้ว${checklistDraft.training.completedDate ? ` (${checklistDraft.training.completedDate})` : ""}`
                                  : "รออบรม"}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Documents */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">เอกสารประกอบ</div>
                        {checklistDraft.documents.length > 0 && (
                          <ul className="space-y-1.5">
                            {checklistDraft.documents.map((docItem) => (
                              <li
                                key={docItem.id}
                                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-sm"
                              >
                                <span className="font-medium text-slate-700 shrink-0">
                                  {docItem.type === "อื่นๆ" && docItem.label ? docItem.label : docItem.type}
                                </span>
                                <a
                                  href={docItem.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 flex-1 truncate text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                  {docItem.fileName || "เปิดไฟล์"}
                                  <ExternalLink size={12} />
                                </a>
                                {selected.status === "preparing" && canEditChecklist(roles) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDocument(selected, docItem.id)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                    title="ลบ"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {selected.status === "preparing" && canEditChecklist(roles) && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {TRANSFER_DOCUMENT_TYPES.map((docType) => (
                                <label
                                  key={docType}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                                    uploadingDocType === docType
                                      ? "border-blue-300 bg-blue-50 text-blue-700"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {uploadingDocType === docType ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  {docType}
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*,.pdf"
                                    disabled={!!uploadingDocType}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = "";
                                      if (file) void handleUploadDocument(selected, docType, file);
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={otherDocLabel}
                              onChange={(e) => setOtherDocLabel(e.target.value)}
                              placeholder="ชื่อเอกสารเมื่อเลือกประเภท อื่นๆ (ถ้ามี)"
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                            />
                          </div>
                        )}
                      </div>

                      <label className="block text-xs text-slate-600">
                        หมายเหตุ checklist
                        <textarea
                          value={checklistDraft.note || ""}
                          disabled={selected.status !== "preparing" || !canEditChecklist(roles)}
                          onChange={(e) =>
                            setChecklistDraft((d) => (d ? { ...d, note: e.target.value } : d))
                          }
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                        />
                      </label>

                      {selected.status === "preparing" && canEditChecklist(roles) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => saveChecklist(selected, checklistDraft, true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                          >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            บันทึก checklist
                          </button>
                          {canSendToSafety(roles) && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSendToSafety(selected)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                            >
                              <Shield size={14} />
                              ส่ง Safety ดำเนินการ
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selected.status === "awaiting_safety" && canActAsSafety(roles) && (
                  <div className="space-y-3">
                    {checklistDraft?.training.required && checklistDraft.training.status !== "done" && (
                      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-cyan-900">
                          <Shield size={14} />
                          บันทึกผลอบรมเข้าโครงการ
                        </div>
                        {checklistDraft.training.plannedDate && (
                          <p className="text-xs text-cyan-800">
                            วันอบรมที่วางแผน: {checklistDraft.training.plannedDate}
                          </p>
                        )}
                        <label className="text-xs text-cyan-800 block max-w-xs">
                          วันที่อบรมเสร็จ
                          <input
                            type="date"
                            value={trainingCompleteDate}
                            onChange={(e) => setTrainingCompleteDate(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleRecordTraining(selected)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          บันทึกผลอบรม
                        </button>
                      </div>
                    )}

                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
                        <CreditCard size={14} />
                        บันทึกได้บัตรเข้าโครงการ (ปิดงาน + อัปเดตโครงการพนักงาน)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-xs text-violet-800">
                          วันที่ได้ออกบัตร
                          <input
                            type="date"
                            value={cardForm.issuedDate}
                            onChange={(e) => setCardForm((f) => ({ ...f, issuedDate: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="text-xs text-violet-800">
                          เลขบัตร (ถ้ามี)
                          <input
                            type="text"
                            value={cardForm.cardNo}
                            onChange={(e) => setCardForm((f) => ({ ...f, cardNo: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm"
                            placeholder="ไม่บังคับ"
                          />
                        </label>
                      </div>
                      <p className="text-xs text-violet-700">
                        ระบบจะตั้ง <strong>โครงการปัจจุบัน</strong> เป็น {selected.toProject}
                        {isFullProjectTransfer(selected.transferType)
                          ? " และถอดโครงการต้นทางออกจากสังกัด"
                          : " โดยยังคงโครงการเดิมไว้ในสังกัด"}
                      </p>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleIssueCard(selected)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        ยืนยันได้บัตรแล้ว
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : tab === "overview" ? (
        <div className="space-y-4">
          {/* สรุปจำนวนตามสถานะ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {(
              [
                "awaiting_pm_cm",
                "awaiting_pd",
                "awaiting_hrm",
                "preparing",
                "awaiting_safety",
                "closed",
              ] as TransferStatus[]
            ).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setTab("requests");
                }}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="text-2xl font-black text-slate-800">{statusCounts[st] || 0}</div>
                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TRANSFER_STATUS_COLORS[st]}`}>
                  {TRANSFER_STATUS_LABELS[st]}
                </div>
              </button>
            ))}
          </div>

          {/* ปฏิทิน (เต็มแถว) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <CalendarDays size={16} className="text-blue-600" />
                  ปฏิทินการย้าย/อบรม/ออกบัตร
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCalMonth((m) =>
                        m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }
                      )
                    }
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="min-w-[130px] text-center text-sm font-semibold text-slate-700">
                    {new Date(calMonth.year, calMonth.month, 1).toLocaleDateString("th-TH", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCalMonth((m) =>
                        m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }
                      )
                    }
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
                    }}
                    className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    วันนี้
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-500 mb-1">
                {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {calendarWeeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((dateKey, di) => {
                      if (!dateKey) return <div key={di} className="min-h-[72px] rounded-lg bg-slate-50/50" />;
                      const events = calendarEvents.get(dateKey) || [];
                      const dayNum = Number(dateKey.slice(-2));
                      const isToday = dateKey === todayKey;
                      return (
                        <button
                          key={di}
                          type="button"
                          onClick={() => events.length > 0 && setDayPopupKey(dateKey)}
                          className={`min-h-[72px] rounded-lg border p-1 text-left transition-colors ${
                            isToday ? "border-blue-400 bg-blue-50/50" : "border-slate-100 bg-white"
                          } ${events.length > 0 ? "hover:border-blue-300 hover:shadow-sm cursor-pointer" : "cursor-default"}`}
                        >
                          <div className={`text-[11px] font-semibold mb-0.5 ${isToday ? "text-blue-700" : "text-slate-500"}`}>
                            {dayNum}
                          </div>
                          <div className="space-y-0.5">
                            {events.slice(0, 4).map((ev, ei) => (
                              <div
                                key={ei}
                                title={ev.title}
                                className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${EVENT_STYLES[ev.kind]}`}
                              >
                                {ev.label}
                              </div>
                            ))}
                            {events.length > 4 && (
                              <div className="text-[10px] text-slate-400 px-1">+{events.length - 4} รายการ</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-medium">วันที่มีผล</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">วันอบรม (แผน)</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 font-medium">อบรมแล้ว</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 font-medium">ได้บัตร</span>
              </div>
            </div>

            {/* Gantt chart ระยะเวลาแต่ละขั้นตอนของคำขอย้าย */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <CalendarDays size={16} className="text-blue-600" />
                  Gantt Chart — ระยะเวลาการดำเนินการ
                </h3>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                  {GANTT_RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setGanttRangeDays(opt)}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        ganttRangeDays === opt ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {opt} วัน
                    </button>
                  ))}
                </div>
              </div>

              {ganttGroups.length === 0 ? (
                <div className="text-sm text-slate-400 py-8 text-center">ไม่มีคำขอในช่วงเวลานี้</div>
              ) : (
                <div>
                  <div>
                    {/* แกนวันที่ */}
                    <div className="relative mb-1 ml-56 h-5 border-b border-slate-200 text-[10px] text-slate-400">
                      {ganttTicks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute -translate-x-1/2"
                          style={{ left: `${tick.pct}%` }}
                        >
                          {tick.label}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      {ganttGroups.map((g) => {
                        const isBatch = !!g.batchId && g.items.length > 1;
                        const expanded = g.batchId ? isGanttBatchExpanded(g.batchId) : true;
                        const primary = g.items[0];
                        const groupLabel = isBatch
                          ? `ชุด ${primary.laborGroupName || "ยื่นพร้อมกัน"} (${g.items.length} คน)`
                          : primary.employeeName;
                        return (
                          <div key={g.key}>
                            <div className="flex min-h-[38px] items-center gap-2">
                              <button
                                type="button"
                                onClick={() => (isBatch && g.batchId ? toggleGanttBatchExpanded(g.batchId) : openTransfer(primary.id))}
                                className="flex w-56 shrink-0 flex-col items-start gap-0 overflow-hidden text-left hover:text-blue-700"
                                title={`${groupLabel} → ${primary.toProject}`}
                              >
                                <span className="flex w-full items-center gap-1 truncate text-xs font-medium text-slate-700">
                                  {isBatch && (expanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />)}
                                  <span className="truncate">{groupLabel}</span>
                                </span>
                                <span className="w-full truncate text-[10px] leading-tight text-slate-400">
                                  → {primary.toProject}
                                </span>
                              </button>
                              <div className="relative h-6 flex-1">
                                <div
                                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-300"
                                  style={{ left: `${todayPct}%` }}
                                />
                                {renderGanttBar(primary)}
                              </div>
                            </div>
                            {isBatch && expanded &&
                              g.items.slice(1).map((t) => (
                                <div key={t.id} className="mt-1 flex min-h-[38px] items-center gap-2">
                                  <span
                                    className="flex w-56 shrink-0 flex-col items-start gap-0 overflow-hidden pl-4 text-left"
                                    title={`${t.employeeName} → ${t.toProject}`}
                                  >
                                    <span className="w-full truncate text-xs text-slate-600">{t.employeeName}</span>
                                    <span className="w-full truncate text-[10px] leading-tight text-slate-400">
                                      → {t.toProject}
                                    </span>
                                  </span>
                                  <div className="relative h-6 flex-1">
                                    <div
                                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-300"
                                      style={{ left: `${todayPct}%` }}
                                    />
                                    {renderGanttBar(t)}
                                  </div>
                                </div>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {(Object.keys(TRANSFER_STATUS_LABELS) as TransferStatus[]).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-slate-600">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_BAR_COLORS[s]}`} />
                    {TRANSFER_STATUS_LABELS[s]}
                  </span>
                ))}
              </div>
            </div>

          {/* ไทม์ไลน์ความเคลื่อนไหวล่าสุด (ล่างสุด เต็มแถว) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3">
              <History size={16} className="text-blue-600" />
              ความเคลื่อนไหวล่าสุด
            </h3>
            {recentActions.length === 0 ? (
              <div className="text-sm text-slate-400 py-8 text-center">ยังไม่มีความเคลื่อนไหว</div>
            ) : (
              <ol className="space-y-3 border-l-2 border-slate-100 pl-3 max-h-[320px] overflow-y-auto">
                {recentActions.map(({ transfer: t, action: a }) => (
                  <li key={`${t.id}-${a.id}`}>
                    <button
                      type="button"
                      onClick={() => openTransfer(t.id)}
                      className="w-full text-left group"
                    >
                      <span className="text-sm font-medium text-slate-800 group-hover:text-blue-700">
                        {a.label}
                      </span>
                      <span className="text-xs text-slate-500"> — {t.employeeName} → {t.toProject}</span>
                      <span className="text-[11px] text-slate-400"> · {a.actedByName} · {formatDateTime(a.actedAt)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="max-w-md">
            <label className="text-sm font-medium text-slate-700">เลือกพนักงานเพื่อดูประวัติการย้าย</label>
            <select
              value={historyEmployeeId}
              onChange={(e) => setHistoryEmployeeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— เลือก —</option>
              {filteredEmployees
                .slice()
                .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), "th"))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeDisplayName(e)} ({e.รหัสพนักงาน || e.id})
                  </option>
                ))}
            </select>
          </div>

          {!historyEmployeeId ? (
            <div className="text-sm text-slate-400 py-8 text-center">เลือกพนักงานเพื่อดูเส้นทางการย้าย</div>
          ) : historyRows.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">ยังไม่มีประวัติการย้ายของพนักงานคนนี้</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">วันที่ยื่น</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2">จาก</th>
                    <th className="px-3 py-2">ไป</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2">วันได้บัตร</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyRows.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        setSelectedId(t.id);
                        setTab("requests");
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                      <td className="px-3 py-2">{t.transferType}</td>
                      <td className="px-3 py-2 max-w-[180px] truncate">{(t.fromProjects || []).join(", ") || "-"}</td>
                      <td className="px-3 py-2 max-w-[180px] truncate">{t.toProject}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-3 py-2">{t.card?.issuedDate || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {dayPopupKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDayPopupKey(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-800">
                รายการวันที่{" "}
                {new Date(dayPopupKey).toLocaleDateString("th-TH", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <button type="button" onClick={() => setDayPopupKey(null)} className="p-1 rounded hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {dayPopupEvents.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">ไม่มีรายการในวันนี้</div>
              ) : (
                dayPopupEvents.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${EVENT_STYLES[ev.kind]}`}>
                          {CALENDAR_KIND_PREFIX[ev.kind]}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-800">{ev.transfer.employeeName}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {ev.transfer.laborGroupName ? `ชุด ${ev.transfer.laborGroupName} · ` : ""}
                        {(ev.transfer.fromProjects || []).join(", ") || "-"} → {ev.transfer.toProject}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={ev.transfer.status} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDayPopupKey(null);
                        openTransfer(ev.transfer.id);
                      }}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                    >
                      <ExternalLink size={12} />
                      เปิดคำขอ
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-800">ยื่นคำขอย้ายโครงการ</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { key: "group" as const, label: "เลือกเป็นชุด" },
                    { key: "person" as const, label: "เลือกทีละคน" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setCreateForm((f) => ({
                        ...f,
                        selectMode: key,
                        laborGroupName: key === "group" ? f.laborGroupName : "",
                        selectedEmployeeIds: key === "group" ? f.selectedEmployeeIds : [],
                        employeeId: key === "person" ? f.employeeId : "",
                      }))
                    }
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      createForm.selectMode === key
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {createForm.selectMode === "group" ? (
                <>
                  <Field label="ชื่อชุด *">
                    <select
                      value={createForm.laborGroupName}
                      onChange={(e) => selectLaborGroup(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">— เลือกชุด —</option>
                      {laborGroupOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {createForm.laborGroupName && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200">
                        <div className="text-xs font-semibold text-slate-700">
                          สมาชิกในชุด · เลือก {createForm.selectedEmployeeIds.length}/{groupMembers.length} คน
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button type="button" onClick={selectAllVisibleMembers} className="text-blue-600 hover:underline">
                            เลือกทั้งหมด
                          </button>
                          <button type="button" onClick={clearAllMembers} className="text-slate-500 hover:underline">
                            เอาออกทั้งหมด
                          </button>
                        </div>
                      </div>
                      <div className="px-3 py-2 border-b border-slate-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="ค้นหาในชุดเพื่อติ๊กออก..."
                            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {visibleGroupMembers.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-slate-400">ไม่พบสมาชิก</div>
                        ) : (
                          visibleGroupMembers.map((e) => {
                            const checked = createForm.selectedEmployeeIds.includes(e.id);
                            return (
                              <label
                                key={e.id}
                                className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 ${
                                  checked ? "bg-white" : "bg-slate-50/80 opacity-70"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleMember(e.id)}
                                  className="mt-0.5 rounded border-slate-300"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-slate-800">
                                    {employeeDisplayName(e)}
                                  </span>
                                  <span className="block text-xs text-slate-500 truncate">
                                    {e.รหัสพนักงาน || "-"} · {e.ตำแหน่ง || "-"} ·{" "}
                                    {parseProjectList(e.สถานะโครงการ).join(", ") || "ไม่มีโครงการ"}
                                  </span>
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
                        ติ๊กออกคนที่ไม่ได้ย้าย — ระบบจะสร้างคำขอเฉพาะคนที่ยังติ๊กไว้
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Field label="พนักงาน *">
                    <select
                      value={createForm.employeeId}
                      onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">— เลือกพนักงาน —</option>
                      {filteredEmployees
                        .slice()
                        .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), "th"))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {employeeDisplayName(e)} ({e.รหัสพนักงาน || "-"})
                            {e.ชื่อชุด ? ` · ชุด ${e.ชื่อชุด}` : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {selectedEmp && (
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 space-y-0.5">
                      <div>
                        สังกัดปัจจุบัน:{" "}
                        {parseProjectList(selectedEmp.สถานะโครงการ).join(", ") || "-"}
                      </div>
                      <div>
                        โครงการปัจจุบัน (ตัวอยู่จริง):{" "}
                        {String(selectedEmp.โครงการปัจจุบัน || parseProjectList(selectedEmp.สถานะโครงการ)[0] || "-")}
                      </div>
                      {selectedEmp.ชื่อชุด && <div>ชื่อชุด: {String(selectedEmp.ชื่อชุด)}</div>}
                    </div>
                  )}
                </>
              )}

              <Field label="โครงการปลายทาง *">
                <select
                  value={createForm.toProject}
                  onChange={(e) => setCreateForm((f) => ({ ...f, toProject: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">— เลือกโครงการ —</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ประเภทการย้าย *">
                <select
                  value={createForm.transferType}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, transferType: e.target.value as TransferType }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {TRANSFER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="ผู้อนุมัติ PM/CM *">
                <select
                  value={createForm.approverPmCmUid}
                  onChange={(e) => setCreateForm((f) => ({ ...f, approverPmCmUid: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">— เลือกผู้อนุมัติ —</option>
                  {pmCmApprovers.map((u) => {
                    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                    const role = (u.role || []).filter((r) => r === "PM" || r === "CM").join("/");
                    return (
                      <option key={u.uid} value={u.uid}>
                        {name} ({role})
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="วันที่มีผล (ถ้าทราบ)">
                <input
                  type="date"
                  value={createForm.effectiveDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="เหตุผล / หมายเหตุ">
                <textarea
                  value={createForm.reason}
                  onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <div className="text-xs text-slate-500">
                จะยื่น {selectedEmployeesForCreate.length} คำขอ
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={saving || selectedEmployeesForCreate.length === 0}
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  ยื่นคำขอ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow = ({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className={className}>
    <div className="text-xs font-semibold text-slate-500">{label}</div>
    <div className="text-slate-800 mt-0.5 break-words">{value}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const ActionBtn = ({
  label,
  onClick,
  disabled,
  variant,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "danger" | "ghost";
  icon?: React.ReactNode;
}) => {
  const cls =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "danger"
        ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
};
