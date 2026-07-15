import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  Info,
  Loader2,
  Lock,
  Search,
  Sparkles,
  TrendingUp,
  Users2,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getPageGuide } from "../config/pageGuides";
import { InfoTooltip } from "./InfoTooltip";
import { PageGuideButton, PageGuideModal } from "./PageGuideModal";
import {
  ALL_TIERS,
  ASSIGNER_ROLES,
  DEFAULT_EVAL_CRITERIA,
  EVALUATED_EMPLOYEE_TYPES,
  EvalAssignment,
  EvalCriterion,
  EvalRound,
  EvalScoreRecord,
  EvalScores,
  EvalSettings,
  EvalTier,
  FinalPersonScore,
  MIN_RATERS,
  PROBATION_DAYS,
  TIER_LABELS,
  TierStatus,
  UNSCOPED_ROLES,
  assignmentId,
  canActTier,
  computeEvalTotal,
  defaultEvalSettings,
  emptyRound,
  emptyScores,
  evalActionFlag,
  finalPersonScore,
  gradeColor,
  gradeFromTotal,
  isEvalComplete,
  monthLabelTh,
  monthsSinceGoLive,
  roundId,
  scoreId,
  suggestDisciplineScore,
  suggestJobMatchingScore,
  tiersForRoles,
  DisciplineStat,
} from "./evaluationConfig";

// ---------- Local types ----------
interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  employee_type?: string;
  start_date?: string;
  ชื่อชุด?: string;
  [key: string]: any;
}

interface AttendanceEntry {
  status: string;
  isLate?: boolean;
  lateMinutes?: number;
}

interface ProjectRecord {
  id: string;
  project_no?: string;
  project_name?: string;
  required_role_plan?: string;
  required_role_plan_baseline?: Array<{ position?: string; required?: number | string }>;
  [key: string]: any;
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

const NO_GROUP = "(ไม่ระบุชุด)";
const NO_PROJECT = "(ไม่ระบุโครงการ)";

// ---------- Small helpers ----------
const formatDateInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateInput(d);
};

const enumerateDates = (startDate: string, endDate: string): string[] => {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const parseProjectList = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const getEmployeeName = (emp: Employee): string =>
  `${emp["ชื่อตัว"] || ""} ${emp["ชื่อสกุล"] || ""}`.trim() || String(emp.รหัสพนักงาน || "-");

const userName = (u?: AppUser | null): string =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.uid : "-";

const normalizeEmployeeType = (emp: Employee): string => {
  const t = String(emp.employee_type || "").toLowerCase().trim();
  const g = String(emp.สถานะกลุ่มงาน || "").toLowerCase().trim();
  if (t.includes("indirect")) return "Staff Monthly";
  if (t.includes("teamleader")) {
    if (g === "staff") return "DC Daily - Staff";
    if (g === "worker") return "DC Daily - Worker";
    return "DC Daily";
  }
  if (t.includes("supply") || t.includes("supplydc")) return "Supply manpower";
  if (t.includes("sub")) return "Sub contractor";
  if (g === "staff") return "Staff Monthly";
  if (g.includes("supply")) return "Supply manpower";
  if (g.includes("sub")) return "Sub contractor";
  if (g.includes("worker")) return "DC Daily - Worker";
  return "ไม่ระบุ";
};

const projectPositions = (projects: ProjectRecord[]): string[] => {
  const set = new Set<string>();
  projects.forEach((p) => {
    if (Array.isArray(p.required_role_plan_baseline)) {
      p.required_role_plan_baseline.forEach((row) => {
        const pos = String(row?.position || "").trim();
        if (pos) set.add(pos);
      });
    }
    if (typeof p.required_role_plan === "string") {
      p.required_role_plan.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^(.+?)\s*[:=]\s*\d/);
        if (m && m[1].trim()) set.add(m[1].trim());
      });
    }
  });
  return Array.from(set);
};

const monthWindow = (periodKey: string): { start: string; end: string } => {
  const [y, m] = periodKey.split("-").map((n) => parseInt(n, 10));
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const today = formatDateInput(new Date());
  const end = formatDateInput(last);
  return { start: formatDateInput(first), end: end > today ? today : end };
};

// ช่วงเวลาของพนักงานต่อ "รอบ" ที่ระบุ (ใช้ร่วมกันทั้ง worklist และสรุปผล)
const windowForPeriod = (emp: Employee, period: string): { start: string; end: string } | null => {
  if (period === "PROBATION") {
    if (!emp.start_date) return null;
    return { start: emp.start_date, end: addDays(emp.start_date, PROBATION_DAYS - 1) };
  }
  if (!period) return null;
  return monthWindow(period);
};

// พนักงานอยู่ในรอบนี้หรือไม่ (เข้าเงื่อนไขทดลองงาน / เริ่มงานก่อนสิ้นเดือน)
const isMemberInPeriod = (emp: Employee, period: string): boolean => {
  const win = windowForPeriod(emp, period);
  if (!win) return false;
  const today = formatDateInput(new Date());
  if (period === "PROBATION") {
    const daysSince = Math.floor((new Date(`${today}T00:00:00`).getTime() - new Date(`${win.start}T00:00:00`).getTime()) / 86400000);
    return daysSince >= 0 && daysSince <= 45;
  }
  if (emp.start_date && emp.start_date > win.end) return false;
  return true;
};

// สถานะรอบแบบสั้น (สำหรับสรุปผล)
const roundStatusText = (round: EvalRound | null): string => {
  if (!round) return "ยังไม่เริ่ม";
  if (round.closed) return "ปิดรอบ (สมบูรณ์)";
  return `กำลังดำเนินการ · อยู่ที่ Tier ${round.currentTier}`;
};

// จัดหมวด flag จากคะแนนรวม
const flagBucket = (total: number): "pass" | "develop" | "watch" =>
  total >= 75 ? "pass" : total >= 65 ? "develop" : "watch";

const csvEscape = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ==================================================================
export const EvaluationPage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile, hasRole, firebaseUser } = useAuth();
  const db = getFirestore();

  const myRoles = userProfile?.role || [];
  const myUid = firebaseUser?.uid || "";
  const canSeeAllProjects = hasRole([...UNSCOPED_ROLES] as any);
  const canAssign = hasRole([...ASSIGNER_ROLES] as any);
  const myAssignedProjects = useMemo(() => userProfile?.assignedProjects || [], [userProfile]);

  const [tab, setTab] = useState<"evaluate" | "assign" | "summary">("evaluate");
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [attendanceByDate, setAttendanceByDate] = useState<Record<string, Record<string, AttendanceEntry>>>({});
  const [dayOffs, setDayOffs] = useState<Record<string, string>>({});
  const [criteria, setCriteria] = useState<EvalCriterion[]>(DEFAULT_EVAL_CRITERIA);
  const [settings, setSettings] = useState<EvalSettings>(defaultEvalSettings());
  const [assignments, setAssignments] = useState<EvalAssignment[]>([]);
  const [rounds, setRounds] = useState<EvalRound[]>([]);
  const [scores, setScores] = useState<EvalScoreRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  const periodOptions = useMemo(() => {
    const months = monthsSinceGoLive(settings.goLiveMonth).map((key) => ({ key, label: monthLabelTh(key) }));
    return [...months, { key: "PROBATION", label: monthLabelTh("PROBATION") }];
  }, [settings.goLiveMonth]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<GroupRow | null>(null);
  const [showPageGuide, setShowPageGuide] = useState(false);
  const pageGuide = getPageGuide("evaluation-page");

  useEffect(() => {
    if (!selectedPeriod && periodOptions.length > 0) setSelectedPeriod(periodOptions[0].key);
  }, [periodOptions, selectedPeriod]);

  const filteredProjectOptions = useMemo(() => {
    if (canSeeAllProjects) return projectOptions;
    const assigned = userProfile?.assignedProjects || [];
    return projectOptions.filter((p) => assigned.includes(p));
  }, [canSeeAllProjects, projectOptions, userProfile]);

  // ---------- Data listeners ----------
  useEffect(() => {
    setLoading(true);
    const base = ["CMG-HR-Database", "root"] as const;
    const unsubEmp = onSnapshot(collection(db, base[0], base[1], "employee_data"), (snap) => {
      // ดึงพนักงานในขอบเขตประเมินทั้งหมด — การมองเห็น/สิทธิ์คุมที่ระดับ "ชุด" (groupRows)
      // เพราะ Tier 1/2 อิงการมอบหมาย (assignment) ไม่ใช่ role/assignedProjects
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Employee))
        .filter((e) => e["สถานะพนักงาน"] === "ทำงาน")
        .filter((e) => EVALUATED_EMPLOYEE_TYPES.has(normalizeEmployeeType(e)));
      setEmployees(list);
      setLoading(false);
    });

    const unsubAtt = onSnapshot(collection(db, base[0], base[1], "attendance"), (snap) => {
      const next: Record<string, Record<string, AttendanceEntry>> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const records: Record<string, AttendanceEntry> = {};
        if (data.records) {
          Object.entries(data.records).forEach(([empId, val]) => {
            if (typeof val === "string") records[empId] = { status: val };
            else if (val && typeof val === "object") records[empId] = val as AttendanceEntry;
          });
        }
        next[d.id] = records;
      });
      setAttendanceByDate(next);
    });

    const unsubProj = onSnapshot(collection(db, base[0], base[1], "projects"), (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectRecord)));
    });
    const unsubDayOff = onSnapshot(collection(db, base[0], base[1], "day_offs"), (snap) => {
      const next: Record<string, string> = {};
      snap.docs.forEach((d) => (next[d.id] = String(d.data().name || "")));
      setDayOffs(next);
    });
    const unsubAssign = onSnapshot(collection(db, base[0], base[1], "evaluation_assignments"), (snap) => {
      setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvalAssignment)));
    });
    const unsubRounds = onSnapshot(collection(db, base[0], base[1], "evaluation_rounds"), (snap) => {
      setRounds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvalRound)));
    });
    const unsubScores = onSnapshot(collection(db, base[0], base[1], "evaluation_scores"), (snap) => {
      setScores(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvalScoreRecord)));
    });
    const unsubUsers = onSnapshot(collection(db, base[0], base[1], "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) } as AppUser)));
    });

    const criteriaRef = doc(db, base[0], base[1], "evaluation_config", "criteria");
    const unsubCriteria = onSnapshot(criteriaRef, (d) => {
      const data = d.data();
      if (data && Array.isArray(data.criteria) && data.criteria.length > 0) setCriteria(data.criteria as EvalCriterion[]);
      else {
        setCriteria(DEFAULT_EVAL_CRITERIA);
        setDoc(criteriaRef, { criteria: DEFAULT_EVAL_CRITERIA, updatedAt: Date.now() }).catch(() => {});
      }
    });
    const settingsRef = doc(db, base[0], base[1], "evaluation_config", "settings");
    const unsubSettings = onSnapshot(settingsRef, (d) => {
      const data = d.data();
      if (data && typeof data.goLiveMonth === "string") {
        setSettings({
          goLiveMonth: data.goLiveMonth,
          probationDays: Number(data.probationDays) || PROBATION_DAYS,
          minRaters: Number(data.minRaters) || 1,
          updatedAt: data.updatedAt,
        });
      } else {
        const seed = defaultEvalSettings();
        setSettings(seed);
        setDoc(settingsRef, { ...seed, updatedAt: Date.now() }).catch(() => {});
      }
    });

    return () => {
      unsubEmp();
      unsubAtt();
      unsubProj();
      unsubDayOff();
      unsubAssign();
      unsubRounds();
      unsubScores();
      unsubUsers();
      unsubCriteria();
      unsubSettings();
    };
  }, [db]);

  const planPositions = useMemo(() => projectPositions(projects), [projects]);

  const disciplineStatFor = (empId: string, start: string, end: string): DisciplineStat => {
    const stat: DisciplineStat = { workDays: 0, present: 0, late: 0, absent: 0, leave: 0, notRecorded: 0 };
    const today = formatDateInput(new Date());
    enumerateDates(start, end)
      .filter((dte) => !dayOffs[dte] && dte <= today)
      .forEach((dte) => {
        stat.workDays++;
        const entry = attendanceByDate[dte]?.[empId];
        if (!entry) return void stat.notRecorded++;
        if (entry.status === "มา") {
          stat.present++;
          if (entry.isLate || Number(entry.lateMinutes) > 0) stat.late++;
        } else if (entry.status === "ไม่มา") stat.absent++;
        else if (entry.status === "ลา") stat.leave++;
        else stat.notRecorded++;
      });
    return stat;
  };

  const periodType: "probation_14d" | "monthly" = selectedPeriod === "PROBATION" ? "probation_14d" : "monthly";

  const windowForEmployee = (emp: Employee): { start: string; end: string } | null =>
    windowForPeriod(emp, selectedPeriod);

  // ---------- Build group rows ----------
  const groupRows = useMemo<GroupRow[]>(() => {
    if (!selectedPeriod) return [];
    const today = formatDateInput(new Date());
    const map = new Map<string, GroupRow>();

    employees.forEach((emp) => {
      const win = windowForEmployee(emp);
      if (!win) return;
      if (selectedPeriod === "PROBATION") {
        const daysSince = Math.floor((new Date(`${today}T00:00:00`).getTime() - new Date(`${win.start}T00:00:00`).getTime()) / 86400000);
        if (daysSince < 0 || daysSince > 45) return;
      } else if (emp.start_date && emp.start_date > win.end) return;

      const project = parseProjectList(emp.สถานะโครงการ)[0] || NO_PROJECT;
      const group = String(emp["ชื่อชุด"] || "").trim() || NO_GROUP;
      const key = `${project}|||${group}`;
      if (!map.has(key)) {
        map.set(key, { key, project, group, members: [], round: null as any });
      }
      map.get(key)!.members.push(emp);
    });

    const list: GroupRow[] = [];
    map.forEach((row) => {
      const rid = roundId(row.project, row.group, selectedPeriod);
      const round = rounds.find((r) => r.id === rid) || emptyRound(row.project, row.group, selectedPeriod, periodType);
      const assignment = assignments.find((a) => a.id === assignmentId(row.project, row.group)) || null;

      // per-member final scores
      let scored = 0;
      let sum = 0;
      row.members.forEach((m) => {
        const recs = scores.filter((s) => s.project === row.project && s.group === row.group && s.period === selectedPeriod && s.employeeId === m.id);
        const fin = finalPersonScore(recs);
        if (fin) {
          scored++;
          sum += fin.total;
        }
      });
      // จำนวนผู้ประเมิน Tier 1 ที่ "ส่งครบทุกคน" (นับตาม uid ที่ไม่ซ้ำ)
      const t1ByUid = new Map<string, EvalScoreRecord[]>();
      scores
        .filter((s) => s.project === row.project && s.group === row.group && s.period === selectedPeriod && s.tier === 1 && s.status === "submitted")
        .forEach((s) => {
          const arr = t1ByUid.get(s.evaluatorUid) || [];
          arr.push(s);
          t1ByUid.set(s.evaluatorUid, arr);
        });
      let tier1Submitters = 0;
      t1ByUid.forEach((recs) => {
        const complete = row.members.every((m) => {
          const r = recs.find((x) => x.employeeId === m.id);
          return !!r && isEvalComplete(r.scores, criteria);
        });
        if (complete) tier1Submitters++;
      });
      row.round = round;
      row.assignment = assignment;
      row.scoredCount = scored;
      row.tier1Submitters = tier1Submitters;
      row.groupAvg = scored > 0 ? Math.round((sum / scored) * 10) / 10 : null;

      // สิทธิ์แบบ hybrid: Tier 1/2 = assignment, Tier 3/4 = role
      const isTier1Assigned = !!assignment?.tier1Uids?.includes(myUid);
      const isTier2Assigned = !!assignment?.tier2Uids?.includes(myUid);
      let actionable = false;
      let actionTier: EvalTier | null = null;
      if (!round.closed) {
        const t = round.currentTier;
        if (t === 1 && isTier1Assigned) { actionable = true; actionTier = 1; }
        else if (t === 2 && isTier2Assigned) { actionable = true; actionTier = 2; }
        else if (t === 3 && canActTier(myRoles, 3)) { actionable = true; actionTier = 3; }
        else if (t === 4 && canActTier(myRoles, 4)) { actionable = true; actionTier = 4; }
      }
      row.actionable = actionable;
      row.actionTier = actionTier;

      // การมองเห็น: ถูก assign (T1/T2) เห็นเสมอ; role องค์กร/ผู้มอบหมายเห็นตาม scope โครงการ
      const inMyProjects = canSeeAllProjects || myAssignedProjects.includes(row.project);
      const assignedHere = isTier1Assigned || isTier2Assigned;
      row.visible = assignedHere || ((canSeeAllProjects || canAssign) && inMyProjects);

      list.push(row);
    });

    return list
      .filter((r) => r.visible)
      .filter((r) => (projectFilter === "all" ? true : r.project === projectFilter))
      .filter((r) => (scopeFilter === "mine" ? r.actionable : true))
      .filter((r) => (search.trim() === "" ? true : r.group.toLowerCase().includes(search.toLowerCase()) || r.project.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => {
        if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
        if (a.project !== b.project) return a.project.localeCompare(b.project, "th");
        return a.group.localeCompare(b.group, "th");
      });
  }, [employees, rounds, scores, assignments, criteria, selectedPeriod, projectFilter, scopeFilter, search, myRoles, myUid, canSeeAllProjects, canAssign, myAssignedProjects, periodType]);

  const summary = useMemo(() => {
    const total = groupRows.length;
    const mine = groupRows.filter((r) => r.actionable).length;
    const closed = groupRows.filter((r) => r.round.closed).length;
    return { total, mine, closed };
  }, [groupRows]);

  // ถูกมอบหมายเป็น Tier 1/2 ที่ชุดใด ๆ หรือไม่ (ใช้กับสิทธิ์เห็นแท็บสรุปผล)
  const amAssignedSomewhere = useMemo(
    () => assignments.some((a) => (a.tier1Uids || []).includes(myUid) || (a.tier2Uids || []).includes(myUid)),
    [assignments, myUid]
  );
  const canSeeSummary = canSeeAllProjects || canAssign || amAssignedSomewhere;

  // สิทธิ์ที่แสดงบน badge: Tier 3/4 มาจาก role, Tier 1/2 มาจากการถูก assign
  const myTierBadge = useMemo(() => {
    const set = tiersForRoles(myRoles);
    assignments.forEach((a) => {
      if ((a.tier1Uids || []).includes(myUid)) set.add(1);
      if ((a.tier2Uids || []).includes(myUid)) set.add(2);
    });
    return Array.from(set).sort();
  }, [myRoles, assignments, myUid]);

  // ---------- Write helpers ----------
  const logActivity = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: firebaseUser?.email ?? "anonymous",
        module: "Evaluation",
        action,
        details,
        createdAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
  };

  const persistRound = async (round: EvalRound) => {
    await setDoc(doc(db, "CMG-HR-Database", "root", "evaluation_rounds", round.id), { ...round, updatedAt: Date.now() }, { merge: true });
  };

  return (
    <div className="p-3 lg:p-5 space-y-3 lg:space-y-4">
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="text-indigo-600" size={20} />
            <h2 className="text-base lg:text-lg font-bold text-slate-800">ประเมินผลพนักงาน</h2>
            <InfoTooltip content="ประเมินแบบ 4 ชั้น (tier) ทำต่อเนื่องกัน: Tier 1 ผู้ได้รับมอบหมายให้คะแนนรายคน (ต้อง ≥2 คน) → Tier 2 ผู้ได้รับมอบหมายตรวจระดับชุด → Tier 3 HR → Tier 4 PD ปิดรอบ ครบทุก tier รอบจึงสมบูรณ์ คะแนนสุดท้าย = เฉลี่ย Tier 1 เว้นแต่ tier สูงกว่า override รายคน" />
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            สิทธิ์ของคุณ: {myTierBadge.length > 0 ? myTierBadge.map((t) => `Tier ${t}`).join(", ") : "ดูอย่างเดียว"}
          </span>
        </div>
        <PageGuideButton onClick={() => setShowPageGuide(true)} />
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabButton active={tab === "evaluate"} onClick={() => setTab("evaluate")} label="ประเมิน" />
        {canAssign && <TabButton active={tab === "assign"} onClick={() => setTab("assign")} label="มอบหมายชุด" />}
        {canSeeSummary && <TabButton active={tab === "summary"} onClick={() => setTab("summary")} label="สรุปผล" />}
      </div>

      {tab === "summary" ? (
        <SummaryTab
          employees={employees}
          scores={scores}
          rounds={rounds}
          assignments={assignments}
          criteria={criteria}
          periodOptions={periodOptions}
          projectOptions={filteredProjectOptions}
          canSeeAllProjects={canSeeAllProjects}
          canAssign={canAssign}
          myAssignedProjects={myAssignedProjects}
          myUid={myUid}
          onExport={logActivity}
        />
      ) : tab === "assign" ? (
        <AssignmentTab
          projectOptions={filteredProjectOptions}
          employees={employees}
          assignments={assignments}
          users={users}
          onSaved={logActivity}
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <SummaryCard label="ชุดในรอบนี้" value={summary.total} tone="slate" />
            <SummaryCard label="ถึงคิวคุณ" value={summary.mine} tone="amber" />
            <SummaryCard label="ปิดรอบแล้ว" value={summary.closed} tone="emerald" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 lg:p-3">
            <FilterSelect label="รอบ" value={selectedPeriod} onChange={setSelectedPeriod}
              options={periodOptions.map((p) => ({ value: p.key, label: p.label }))} />
            <FilterSelect label="โครงการ" value={projectFilter} onChange={setProjectFilter}
              options={[{ value: "all", label: "ทั้งหมด" }, ...filteredProjectOptions.map((p) => ({ value: p, label: p }))]} />
            <FilterSelect label="แสดง" value={scopeFilter} onChange={(v) => setScopeFilter(v as any)}
              options={[{ value: "mine", label: "ถึงคิวฉัน" }, { value: "all", label: "ทั้งหมดที่เห็น" }]} />
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชุด / โครงการ"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>

          {/* Group list */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-slate-400"><Loader2 className="animate-spin" size={22} /> กำลังโหลด...</div>
            ) : groupRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                {scopeFilter === "mine" ? "ไม่มีชุดที่ถึงคิวคุณในรอบนี้ (ลองเลือก \"ทั้งหมดที่เห็น\")" : "ไม่มีชุดงานในรอบ/เงื่อนไขนี้"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">ชุดแรงงาน / โครงการ</th>
                      <th className="px-3 py-2 text-center font-semibold">สมาชิก</th>
                      <th className="px-3 py-2 text-center font-semibold">ความคืบหน้า Tier</th>
                      <th className="px-3 py-2 text-center font-semibold">คะแนนเฉลี่ยชุด</th>
                      <th className="px-3 py-2 text-center font-semibold">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupRows.map((r) => {
                      const grade = r.groupAvg != null ? gradeFromTotal(r.groupAvg) : null;
                      return (
                        <tr key={r.key} className={`hover:bg-indigo-50/40 ${r.actionable ? "bg-amber-50/40" : ""}`}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800">{r.group}</div>
                            <div className="text-[11px] text-slate-400">{r.project}</div>
                          </td>
                          <td className="px-3 py-2 text-center text-slate-700">{r.members.length}</td>
                          <td className="px-3 py-2">
                            <TierProgress round={r.round} />
                            {!r.round.closed && r.round.currentTier === 1 && (
                              <div className={`mt-1 text-center text-[10px] font-semibold ${(r.tier1Submitters || 0) >= MIN_RATERS ? "text-emerald-600" : "text-amber-600"}`}>
                                ผู้ประเมิน Tier 1: {r.tier1Submitters || 0}/{MIN_RATERS}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.groupAvg != null && grade ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-bold text-slate-800">{r.groupAvg}</span>
                                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(grade)}`}>{grade}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => setOpenGroup(r)}
                              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                r.actionable ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {r.actionable ? (r.actionTier === 1 ? "ให้คะแนน" : "ตรวจ/อนุมัติ") : "ดู"}
                              <ChevronRight size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {openGroup && selectedPeriod && (
        <GroupModal
          row={openGroup}
          period={selectedPeriod}
          periodType={periodType}
          criteria={criteria}
          planPositions={planPositions}
          scores={scores}
          myUid={myUid}
          myName={userName({ uid: myUid, firstName: userProfile?.firstName, lastName: userProfile?.lastName })}
          myRole={myRoles[0] || ""}
          getDisciplineStat={(empId) => {
            const emp = openGroup.members.find((m) => m.id === empId);
            const win = emp ? windowForEmployee(emp) : null;
            return win ? disciplineStatFor(empId, win.start, win.end) : null;
          }}
          onClose={() => setOpenGroup(null)}
          persistRound={persistRound}
          log={logActivity}
        />
      )}

      <PageGuideModal
        open={showPageGuide}
        guide={pageGuide}
        onClose={() => setShowPageGuide(false)}
      />
    </div>
  );
};

// ---------- Row type ----------
interface GroupRow {
  key: string;
  project: string;
  group: string;
  members: Employee[];
  round: EvalRound;
  assignment?: EvalAssignment | null;
  scoredCount?: number;
  tier1Submitters?: number;
  groupAvg?: number | null;
  actionable?: boolean;
  actionTier?: EvalTier | null;
  visible?: boolean;
}

// ---------- Small UI ----------
const TabButton = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
  >
    {label}
  </button>
);

const SummaryCard = ({ label, value, tone }: { label: string; value: number; tone: "slate" | "amber" | "emerald" }) => {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-xl lg:text-2xl font-bold">{value}</div>
    </div>
  );
};

const FilterSelect = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
    <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const TierProgress = ({ round }: { round: EvalRound }) => (
  <div className="flex items-center justify-center gap-1">
    {ALL_TIERS.map((t) => {
      const st = round.tierStatus[t];
      const isCurrent = !round.closed && round.currentTier === t;
      const cls =
        st === "done" ? "bg-emerald-500 text-white border-emerald-500"
          : isCurrent ? "bg-amber-100 text-amber-700 border-amber-400"
            : "bg-slate-100 text-slate-400 border-slate-200";
      return (
        <div key={t} className="flex items-center gap-1" title={TIER_LABELS[t]}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${cls}`}>{t}</span>
          {t < 4 && <span className="text-slate-300 text-[9px]">›</span>}
        </div>
      );
    })}
    {round.closed && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">ปิดรอบ</span>}
  </div>
);

// ================= Assignment tab =================
const AssignmentTab = ({
  projectOptions, employees, assignments, users, onSaved,
}: {
  projectOptions: string[];
  employees: Employee[];
  assignments: EvalAssignment[];
  users: AppUser[];
  onSaved: (action: string, details: string) => void;
}) => {
  const { firebaseUser } = useAuth();
  const db = getFirestore();
  const [projectSel, setProjectSel] = useState<string>(projectOptions[0] || "");
  const [pickerFor, setPickerFor] = useState<{ group: string; tier: 1 | 2 } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  useEffect(() => {
    if (!projectSel && projectOptions.length > 0) setProjectSel(projectOptions[0]);
  }, [projectOptions, projectSel]);

  // ล้างคำค้นทุกครั้งที่เปิด/ปิด picker
  useEffect(() => {
    setPickerSearch("");
  }, [pickerFor]);

  // เลือกได้จากผู้ใช้ทุกคน (เรียงคนที่อนุมัติแล้วขึ้นก่อน) — ไม่กรองตาม role
  const selectableUsers = useMemo(() => {
    const rank = (u: AppUser) => (u.status === "approved" ? 0 : u.status === "pending" ? 1 : 2);
    return [...users].sort(
      (a, b) => rank(a) - rank(b) || userName(a).localeCompare(userName(b), "th")
    );
  }, [users]);
  const userById = useMemo(() => {
    const m = new Map<string, AppUser>();
    users.forEach((u) => m.set(u.uid, u));
    return m;
  }, [users]);

  // groups within selected project
  const groups = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      const proj = parseProjectList(e.สถานะโครงการ)[0] || NO_PROJECT;
      if (proj !== projectSel) return;
      const g = String(e["ชื่อชุด"] || "").trim() || NO_GROUP;
      set.add(g);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [employees, projectSel]);

  const assignmentFor = (group: string): EvalAssignment | undefined =>
    assignments.find((a) => a.id === assignmentId(projectSel, group));

  const toggleAssignee = async (group: string, tier: 1 | 2, uid: string) => {
    const id = assignmentId(projectSel, group);
    const existing = assignmentFor(group);
    const t1 = existing?.tier1Uids || [];
    const t2 = existing?.tier2Uids || [];
    const cur = tier === 1 ? t1 : t2;
    const nextList = cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid];
    const rec: EvalAssignment = {
      id, project: projectSel, group,
      tier1Uids: tier === 1 ? nextList : t1,
      tier2Uids: tier === 2 ? nextList : t2,
      updatedBy: firebaseUser?.email || "", updatedAt: Date.now(),
    };
    await setDoc(doc(db, "CMG-HR-Database", "root", "evaluation_assignments", id), rec, { merge: true });
    const u = userById.get(uid);
    onSaved(
      "มอบหมายชุด",
      `${projectSel} · ${group} · Tier ${tier} · ${cur.includes(uid) ? "ถอด" : "เพิ่ม"} ${userName(u)}`
    );
  };

  const roleText = (u?: AppUser): string => (u?.role || []).join(", ") || "Staff";
  const tier1Guide = "แนะนำให้เลือก Supervisor หรือ Admin Site ของชุดนั้น และควรมีอย่างน้อย 2 คน";
  const tier2Guide = "แนะนำให้เลือก PM หรือ CM ของโครงการ เพื่อทบทวนผลระดับชุดและ override รายคนเมื่อจำเป็น";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 lg:p-3">
        <FilterSelect label="โครงการ" value={projectSel} onChange={setProjectSel}
          options={projectOptions.map((p) => ({ value: p, label: p }))} />
        <span className="text-[11px] text-slate-500 flex items-center gap-1"><Info size={12} /> เลือกผู้ประเมินและผู้ตรวจของแต่ละชุด โดยเลือกได้จากผู้ใช้ที่อนุมัติแล้วในระบบ</span>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-slate-700">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 shrink-0 text-sky-600" size={14} />
          <div className="space-y-1">
            <div className="font-semibold text-slate-800">คำแนะนำการมอบหมายผู้ประเมิน</div>
            <div><b>Tier 1:</b> เลือก Supervisor หรือ Admin Site ของชุดนั้น เพื่อประเมินรายบุคคล และควรมีอย่างน้อย 2 คน</div>
            <div><b>Tier 2:</b> เลือก PM หรือ CM ของโครงการ เพื่อทบทวนผลระดับชุด และ override รายคนเมื่อจำเป็น</div>
          </div>
        </div>
      </div>

      {selectableUsers.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-center gap-2">
          <AlertCircle size={14} /> ยังไม่มีผู้ใช้ในระบบ — สร้าง/อนุมัติผู้ใช้ได้ที่หน้าจัดการผู้ใช้
        </div>
      )}

      <div className="space-y-2">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">ไม่มีชุดแรงงานในโครงการนี้</div>
        ) : groups.map((g) => {
          const a = assignmentFor(g);
          const t1 = a?.tier1Uids || [];
          const t2 = a?.tier2Uids || [];
          const memberCount = employees.filter((e) => (parseProjectList(e.สถานะโครงการ)[0] || NO_PROJECT) === projectSel && (String(e["ชื่อชุด"] || "").trim() || NO_GROUP) === g).length;
          return (
            <div key={g} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <Users2 size={15} className="text-indigo-500" />
                <span className="font-semibold text-slate-800 text-sm">{g}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{memberCount} คน</span>
              </div>

              {/* Tier 1 */}
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    Tier 1 · ให้คะแนนรายคน
                    <InfoTooltip content={tier1Guide} iconSize={12} />
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t1.length >= MIN_RATERS ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {t1.length}/{MIN_RATERS} คน
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <InfoTooltip content={tier1Guide} iconSize={12} />
                    <button onClick={() => setPickerFor({ group: g, tier: 1 })}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">
                      + เลือกผู้ประเมิน
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t1.length === 0 ? <span className="text-[11px] text-slate-400">ยังไม่ได้เลือก</span> :
                    t1.map((uid) => (
                      <span key={uid} className="inline-flex items-center gap-1 rounded-full border border-indigo-500 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {userName(userById.get(uid))}
                        <button onClick={() => toggleAssignee(g, 1, uid)} className="text-indigo-400 hover:text-rose-500"><X size={12} /></button>
                      </span>
                    ))}
                </div>
              </div>

              {/* Tier 2 */}
              <div className="mt-2 border-t border-slate-100 pt-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    Tier 2 · ตรวจระดับชุด
                    <InfoTooltip content={tier2Guide} iconSize={12} />
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{t2.length} คน</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <InfoTooltip content={tier2Guide} iconSize={12} />
                    <button onClick={() => setPickerFor({ group: g, tier: 2 })}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                      + เลือกผู้ตรวจ
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t2.length === 0 ? <span className="text-[11px] text-slate-400">ยังไม่ได้เลือก</span> :
                    t2.map((uid) => (
                      <span key={uid} className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {userName(userById.get(uid))}
                        <button onClick={() => toggleAssignee(g, 2, uid)} className="text-emerald-400 hover:text-rose-500"><X size={12} /></button>
                      </span>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* user picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3" onClick={() => setPickerFor(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800">เลือกผู้ใช้ · {pickerFor.group}</h4>
                <p className="text-[11px] text-slate-500">Tier {pickerFor.tier} — {pickerFor.tier === 1 ? "ให้คะแนนรายคน (ต้อง ≥2 คน)" : "ตรวจระดับชุด"}</p>
              </div>
              <button onClick={() => setPickerFor(null)} className="text-slate-400 hover:text-rose-500"><X size={20} /></button>
            </div>
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <Search size={14} className="text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="พิมพ์ค้นหาชื่อ / อีเมล / ตำแหน่ง"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                {pickerSearch && (
                  <button onClick={() => setPickerSearch("")} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {(() => {
                const q = pickerSearch.trim().toLowerCase();
                const list = selectableUsers.filter((u) =>
                  !q ||
                  userName(u).toLowerCase().includes(q) ||
                  (u.email || "").toLowerCase().includes(q) ||
                  roleText(u).toLowerCase().includes(q)
                );
                if (selectableUsers.length === 0) {
                  return <div className="p-6 text-center text-sm text-slate-400">ไม่มีผู้ใช้ในระบบ</div>;
                }
                if (list.length === 0) {
                  return <div className="p-6 text-center text-sm text-slate-400">ไม่พบผู้ใช้ที่ตรงกับ “{pickerSearch}”</div>;
                }
                return list.map((u) => {
                  const cur = pickerFor.tier === 1 ? (assignmentFor(pickerFor.group)?.tier1Uids || []) : (assignmentFor(pickerFor.group)?.tier2Uids || []);
                  const on = cur.includes(u.uid);
                  const statusPill = u.status === "approved"
                    ? { cls: "bg-emerald-100 text-emerald-700", label: "อนุมัติ" }
                    : u.status === "pending"
                      ? { cls: "bg-amber-100 text-amber-700", label: "รออนุมัติ" }
                      : { cls: "bg-slate-100 text-slate-500", label: u.status || "อื่นๆ" };
                  return (
                    <button key={u.uid} onClick={() => toggleAssignee(pickerFor.group, pickerFor.tier, u.uid)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded border shrink-0 ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-transparent"}`}>
                        <CheckCircle2 size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-800 truncate">{userName(u)}</div>
                        <div className="text-[11px] text-slate-400 truncate">{u.email || u.uid} · {roleText(u)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusPill.cls}`}>{statusPill.label}</span>
                    </button>
                  );
                });
              })()}
            </div>
            <div className="border-t border-slate-200 px-4 py-3 flex justify-end">
              <button onClick={() => setPickerFor(null)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">เสร็จสิ้น</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= Group modal (tier work) =================
const GroupModal = ({
  row, period, periodType, criteria, planPositions, scores, myUid, myName, myRole,
  getDisciplineStat, onClose, persistRound, log,
}: {
  row: GroupRow;
  period: string;
  periodType: "probation_14d" | "monthly";
  criteria: EvalCriterion[];
  planPositions: string[];
  scores: EvalScoreRecord[];
  myUid: string;
  myName: string;
  myRole: string;
  getDisciplineStat: (empId: string) => DisciplineStat | null;
  onClose: () => void;
  persistRound: (round: EvalRound) => Promise<void>;
  log: (action: string, details: string) => void;
}) => {
  const db = getFirestore();
  const round = row.round;
  const actTier: EvalTier | null = row.actionTier ?? null;
  const isTier1 = actTier === 1;
  const [editing, setEditing] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  const recsFor = (empId: string) =>
    scores.filter((s) => s.project === row.project && s.group === row.group && s.period === period && s.employeeId === empId);

  const myTier1For = (empId: string): EvalScoreRecord | undefined =>
    recsFor(empId).find((s) => s.tier === 1 && s.evaluatorUid === myUid);

  // uid ของผู้ประเมิน Tier 1 ที่ส่งครบทุกคนแล้ว (ไม่ซ้ำ)
  const tier1SubmitterUids = useMemo(() => {
    const byUid = new Map<string, EvalScoreRecord[]>();
    scores
      .filter((s) => s.project === row.project && s.group === row.group && s.period === period && s.tier === 1 && s.status === "submitted")
      .forEach((s) => {
        const a = byUid.get(s.evaluatorUid) || [];
        a.push(s);
        byUid.set(s.evaluatorUid, a);
      });
    const set = new Set<string>();
    byUid.forEach((recs, uid) => {
      const complete = row.members.every((m) => {
        const r = recs.find((x) => x.employeeId === m.id);
        return !!r && isEvalComplete(r.scores, criteria);
      });
      if (complete) set.add(uid);
    });
    return set;
  }, [scores, row, period, criteria]);

  const saveScore = async (member: Employee, tier: EvalTier, scores_: EvalScores, comment: string, isOverride: boolean, status: "draft" | "submitted") => {
    const id = scoreId(row.project, row.group, period, member.id, tier, myUid);
    const total = computeEvalTotal(scores_, criteria);
    const disc = getDisciplineStat(member.id);
    const rec: EvalScoreRecord = {
      id, project: row.project, group: row.group, period, periodType,
      employeeId: member.id, employeeName: getEmployeeName(member), position: String(member.ตำแหน่ง || ""),
      employeeType: normalizeEmployeeType(member),
      tier, evaluatorUid: myUid, evaluatorName: myName, evaluatorRole: myRole,
      scores: scores_, total, grade: gradeFromTotal(total), isOverride,
      comment: comment.trim(),
      disciplineSuggested: disc ? suggestDisciplineScore(disc) : 0,
      jobMatchingSuggested: suggestJobMatchingScore(String(member.ตำแหน่ง || ""), planPositions),
      status, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await setDoc(doc(db, "CMG-HR-Database", "root", "evaluation_scores", id), rec, { merge: true });
  };

  // Tier 1 submit: require current user scored (complete) every member
  const submitTier1 = async () => {
    const missing = row.members.filter((m) => {
      const r = myTier1For(m.id);
      return !r || !isEvalComplete(r.scores, criteria);
    });
    if (missing.length > 0) {
      window.alert(`ต้องให้คะแนนครบทุกคนก่อนส่ง (ยังขาด ${missing.length} คน)`);
      return;
    }
    setBusy(true);
    try {
      // set all my tier1 records to submitted
      for (const m of row.members) {
        const r = myTier1For(m.id)!;
        await saveScore(m, 1, r.scores, r.comment || "", false, "submitted");
      }
      // ต้องมีผู้ประเมิน Tier 1 ที่ส่งครบ ≥ MIN_RATERS (distinct) จึงจะไป Tier 2
      const distinct = new Set<string>(tier1SubmitterUids);
      distinct.add(myUid);
      const enough = distinct.size >= MIN_RATERS;
      const t1Status: TierStatus = enough ? "done" : "in-progress";
      const next: EvalRound = {
        ...round,
        tierStatus: { ...round.tierStatus, 1: t1Status },
        currentTier: enough ? 2 : 1,
        actors: { ...(round.actors || {}), 1: myName },
      };
      await persistRound(next);
      log(
        enough ? "ส่ง Tier 1 (ครบ ≥2 คน → เปิด Tier 2)" : "ส่ง Tier 1 (รอผู้ประเมินอีก 1 คน)",
        `${row.project} · ${row.group} · รอบ ${monthLabelTh(period)} · ผู้ส่ง ${distinct.size}/${MIN_RATERS}`
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const approveTier = async (tier: EvalTier) => {
    setBusy(true);
    try {
      const isLast = tier === 4;
      const next: EvalRound = {
        ...round,
        tierStatus: { ...round.tierStatus, [tier]: "done" as const },
        currentTier: (isLast ? 4 : ((tier + 1) as EvalTier)),
        closed: isLast ? true : round.closed,
        actors: { ...(round.actors || {}), [tier]: myName },
      };
      await persistRound(next);
      log(isLast ? "ปิดรอบประเมิน" : `อนุมัติ Tier ${tier}`, `${row.project} · ${row.group} · รอบ ${monthLabelTh(period)}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const submitOverride = async (member: Employee, scores_: EvalScores, comment: string) => {
    if (!actTier || actTier === 1) return;
    setBusy(true);
    try {
      await saveScore(member, actTier, scores_, comment, true, "submitted");
      log(`ปรับคะแนน (Tier ${actTier})`, `${row.project} · ${row.group} · ${getEmployeeName(member)}`);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">{row.group}</h3>
            <p className="text-[11px] text-slate-500">{row.project} · รอบ {monthLabelTh(period)} · {row.members.length} คน</p>
            <div className="mt-1"><TierProgress round={round} /></div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* status banner */}
          {!row.actionable && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500">
              <Lock size={13} />
              {round.closed
                ? "รอบนี้ปิดแล้ว — ดูผลได้อย่างเดียว"
                : `ขณะนี้อยู่ที่ ${TIER_LABELS[round.currentTier]} — ยังไม่ถึงคิว/สิทธิ์ของคุณ`}
            </div>
          )}

          {isTier1 ? (
            <>
              <div className={`mb-3 flex items-center gap-2 rounded-lg border p-2.5 text-xs ${tier1SubmitterUids.size >= MIN_RATERS ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                <Info size={13} />
                <span>
                  ผู้ประเมิน Tier 1 ที่ส่งครบแล้ว {tier1SubmitterUids.size}/{MIN_RATERS} คน
                  {tier1SubmitterUids.size < MIN_RATERS && " — ต้องมีผู้ประเมินที่ได้รับมอบหมายอย่างน้อย 2 คนส่งครบ จึงจะไป Tier 2 ได้"}
                </span>
              </div>
              <Tier1List
                members={row.members}
                criteria={criteria}
                myTier1For={myTier1For}
                onEdit={setEditing}
              />
            </>
          ) : (
            <TierReviewList
              members={row.members}
              recsFor={recsFor}
              actionable={!!row.actionable}
              actTier={actTier}
              onOverride={setEditing}
            />
          )}
        </div>

        {/* footer actions */}
        {row.actionable && (
          <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-2">
            {isTier1 ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">
                  {tier1SubmitterUids.size >= MIN_RATERS ? "ครบ 2 คนแล้ว — ส่งเพื่อไป Tier 2" : "ส่งของคุณแล้วรอผู้ประเมินอีก 1 คน"}
                </span>
                <button onClick={submitTier1} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {busy ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} ส่งคะแนน Tier 1 ของฉัน
                </button>
              </div>
            ) : (
              <button onClick={() => approveTier(actTier as EvalTier)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                {actTier === 4 ? "อนุมัติและปิดรอบ" : "อนุมัติทั้งชุด"}
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <PersonScoreEditor
          member={editing}
          criteria={criteria}
          disciplineStat={getDisciplineStat(editing.id)}
          planPositions={planPositions}
          initial={
            isTier1
              ? (myTier1For(editing.id)?.scores || null)
              : (finalPersonScore(recsFor(editing.id))?.scores || null)
          }
          initialComment={isTier1 ? (myTier1For(editing.id)?.comment || "") : ""}
          tierLabel={isTier1 ? "Tier 1 · ให้คะแนน" : `Tier ${actTier} · ปรับคะแนน (override)`}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (sc, cm) => {
            if (isTier1) {
              await saveScore(editing, 1, sc, cm, false, "draft");
              setEditing(null);
            } else {
              await submitOverride(editing, sc, cm);
            }
          }}
        />
      )}
    </div>
  );
};

// Tier 1 member list
const Tier1List = ({
  members, criteria, myTier1For, onEdit,
}: {
  members: Employee[];
  criteria: EvalCriterion[];
  myTier1For: (empId: string) => EvalScoreRecord | undefined;
  onEdit: (m: Employee) => void;
}) => (
  <div className="space-y-1.5">
    <p className="text-[11px] text-slate-400">ให้คะแนนสมาชิกทุกคน (5 ด้าน 1–5) แล้วกด "ส่ง Tier 1 ทั้งชุด"</p>
    {members.map((m) => {
      const rec = myTier1For(m.id);
      const done = rec && isEvalComplete(rec.scores, criteria);
      const grade = rec ? gradeFromTotal(rec.total) : null;
      return (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate">{getEmployeeName(m)}</div>
            <div className="text-[11px] text-slate-400 truncate">{m.รหัสพนักงาน} · {m.ตำแหน่ง || "-"}</div>
          </div>
          <div className="flex items-center gap-2">
            {rec ? (
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700 text-sm">{rec.total}</span>
                {grade && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(grade)}`}>{grade}</span>}
              </span>
            ) : (
              <span className="text-[11px] text-rose-500">ยังไม่ให้คะแนน</span>
            )}
            <button onClick={() => onEdit(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${done ? "border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
              {done ? "แก้ไข" : "ให้คะแนน"}
            </button>
          </div>
        </div>
      );
    })}
  </div>
);

// Tier 2-4 review list
const TierReviewList = ({
  members, recsFor, actionable, actTier, onOverride,
}: {
  members: Employee[];
  recsFor: (empId: string) => EvalScoreRecord[];
  actionable: boolean;
  actTier: EvalTier | null;
  onOverride: (m: Employee) => void;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-sm">
      <thead className="bg-slate-50 text-slate-600 text-xs">
        <tr>
          <th className="px-3 py-2 text-left font-semibold">สมาชิก</th>
          <th className="px-3 py-2 text-center font-semibold">คะแนนปัจจุบัน</th>
          <th className="px-3 py-2 text-center font-semibold">ที่มา</th>
          {actionable && <th className="px-3 py-2 text-center font-semibold">ปรับ</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {members.map((m) => {
          const fin: FinalPersonScore | null = finalPersonScore(recsFor(m.id));
          return (
            <tr key={m.id} className="hover:bg-slate-50/60">
              <td className="px-3 py-2">
                <div className="font-semibold text-slate-800 truncate">{getEmployeeName(m)}</div>
                <div className="text-[11px] text-slate-400 truncate">{m.รหัสพนักงาน} · {m.ตำแหน่ง || "-"}</div>
              </td>
              <td className="px-3 py-2 text-center">
                {fin ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="font-bold text-slate-800">{fin.total}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(fin.grade)}`}>{fin.grade}</span>
                  </div>
                ) : <span className="text-slate-300">— (ยังไม่มี Tier 1)</span>}
              </td>
              <td className="px-3 py-2 text-center text-[11px] text-slate-500">
                {fin ? (fin.isOverride ? `override T${fin.sourceTier}` : "เฉลี่ย T1") : "—"}
              </td>
              {actionable && (
                <td className="px-3 py-2 text-center">
                  <button onClick={() => onOverride(m)} disabled={!fin}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40">
                    ปรับ
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
    {actionable && actTier && (
      <p className="mt-2 text-[11px] text-slate-400">
        กด "ปรับ" เพื่อ override รายคน (คะแนนจาก Tier {actTier} จะแทนที่) หรือกด "อนุมัติ" ด้านล่างเพื่อผ่านทั้งชุดตามคะแนนปัจจุบัน
      </p>
    )}
  </div>
);

// ================= Person score editor =================
const PersonScoreEditor = ({
  member, criteria, disciplineStat, planPositions, initial, initialComment, tierLabel, busy, onCancel, onSave,
}: {
  member: Employee;
  criteria: EvalCriterion[];
  disciplineStat: DisciplineStat | null;
  planPositions: string[];
  initial: EvalScores | null;
  initialComment: string;
  tierLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (scores: EvalScores, comment: string) => void;
}) => {
  const [scores, setScores] = useState<EvalScores>(initial ? { ...initial } : emptyScores());
  const [comment, setComment] = useState(initialComment);
  const disciplineSuggested = disciplineStat ? suggestDisciplineScore(disciplineStat) : 0;
  const jobMatchingSuggested = suggestJobMatchingScore(String(member.ตำแหน่ง || ""), planPositions);
  const total = useMemo(() => computeEvalTotal(scores, criteria), [scores, criteria]);
  const grade = gradeFromTotal(total);
  const flag = evalActionFlag(total);
  const complete = isEvalComplete(scores, criteria);
  const setScore = (k: keyof EvalScores, v: number) => setScores((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h4 className="text-base font-bold text-slate-800">{getEmployeeName(member)}</h4>
            <p className="text-[11px] text-slate-500">{member.รหัสพนักงาน} · {member.ตำแหน่ง || "-"} · {tierLabel}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-rose-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {criteria.map((c) => {
            const suggested = c.autoSuggest === "attendance" ? disciplineSuggested : c.autoSuggest === "jobMatching" ? jobMatchingSuggested : 0;
            const current = scores[c.key] || 0;
            return (
              <div key={c.key} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-800 text-sm">{c.label}</span>
                  <span className="text-[11px] text-slate-400">({c.labelEn})</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{c.weight}%</span>
                  <InfoTooltip content={
                    <div className="space-y-1">
                      <div className="font-semibold">{c.label} — เกณฑ์</div>
                      {[5, 4, 3, 2, 1].map((lvl) => <div key={lvl}><b>{lvl}</b> = {c.anchors[lvl]}</div>)}
                    </div>
                  } />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{c.description}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button key={lvl} onClick={() => setScore(c.key, lvl)}
                      className={`h-8 w-8 rounded-lg border text-sm font-bold ${current === lvl ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300"}`}>
                      {lvl}
                    </button>
                  ))}
                  {suggested > 0 && (
                    <button onClick={() => setScore(c.key, suggested)}
                      className="ml-1 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
                      <Sparkles size={12} /> แนะนำ {suggested}
                    </button>
                  )}
                </div>
                {current > 0 && <p className="mt-1.5 text-[11px] text-slate-600"><b>ระดับ {current}:</b> {c.anchors[current]}</p>}
                {c.autoSuggest === "attendance" && disciplineStat && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                    <Info size={11} /> ลงเวลา {disciplineStat.workDays} วัน: มา {disciplineStat.present} · สาย {disciplineStat.late} · ขาด {disciplineStat.absent} · ลา {disciplineStat.leave} · ไม่ลงเวลา {disciplineStat.notRecorded}
                  </p>
                )}
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="text-xs font-semibold text-slate-600">ความคิดเห็น</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-slate-800">{total}<span className="text-sm text-slate-400">/100</span></div>
            <span className={`rounded-lg border px-2 py-1 text-sm font-bold ${gradeColor(grade)}`}>{grade}</span>
            <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${flag.className}`}>{flag.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => onSave(scores, comment)} disabled={busy || !complete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} บันทึก
            </button>
          </div>
        </div>
        {!complete && <p className="px-4 pb-3 -mt-1 text-[11px] text-amber-600 flex items-center gap-1"><AlertCircle size={12} /> ให้คะแนนครบทั้ง 5 ด้านก่อนบันทึก</p>}
      </div>
    </div>
  );
};

// ================= Summary / reporting tab =================
interface SummaryPersonRow {
  emp: Employee;
  project: string;
  group: string;
  type: string;
  fin: FinalPersonScore | null;
  round: EvalRound | null;
}

const finalSourceText = (fin: FinalPersonScore): string =>
  fin.isOverride ? `override Tier ${fin.sourceTier}` : "เฉลี่ย Tier 1";

const flagPill = (total: number) => {
  const f = evalActionFlag(total);
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${f.className}`}>{f.label}</span>;
};

const SummaryTab = ({
  employees, scores, rounds, assignments, criteria, periodOptions,
  projectOptions, canSeeAllProjects, canAssign, myAssignedProjects, myUid, onExport,
}: {
  employees: Employee[];
  scores: EvalScoreRecord[];
  rounds: EvalRound[];
  assignments: EvalAssignment[];
  criteria: EvalCriterion[];
  periodOptions: { key: string; label: string }[];
  projectOptions: string[];
  canSeeAllProjects: boolean;
  canAssign: boolean;
  myAssignedProjects: string[];
  myUid: string;
  onExport: (action: string, details: string) => void;
}) => {
  const [period, setPeriod] = useState<string>(periodOptions[0]?.key || "");
  const [projectF, setProjectF] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [groupF, setGroupF] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openPerson, setOpenPerson] = useState<SummaryPersonRow | null>(null);

  useEffect(() => {
    if (!period && periodOptions.length > 0) setPeriod(periodOptions[0].key);
  }, [periodOptions, period]);

  const groupVisible = (project: string, group: string): boolean => {
    const a = assignments.find((x) => x.id === assignmentId(project, group));
    const assignedHere = !!a && ((a.tier1Uids || []).includes(myUid) || (a.tier2Uids || []).includes(myUid));
    const inScope = canSeeAllProjects || myAssignedProjects.includes(project);
    return assignedHere || ((canSeeAllProjects || canAssign) && inScope);
  };

  const rows = useMemo<SummaryPersonRow[]>(() => {
    if (!period) return [];
    const list: SummaryPersonRow[] = [];
    employees.forEach((emp) => {
      if (!isMemberInPeriod(emp, period)) return;
      const project = parseProjectList(emp.สถานะโครงการ)[0] || NO_PROJECT;
      const group = String(emp["ชื่อชุด"] || "").trim() || NO_GROUP;
      if (!groupVisible(project, group)) return;
      const type = normalizeEmployeeType(emp);
      const recs = scores.filter((s) => s.project === project && s.group === group && s.period === period && s.employeeId === emp.id);
      const fin = finalPersonScore(recs);
      const round = rounds.find((r) => r.id === roundId(project, group, period)) || null;
      list.push({ emp, project, group, type, fin, round });
    });
    const q = search.trim().toLowerCase();
    return list
      .filter((r) => (projectF === "all" ? true : r.project === projectF))
      .filter((r) => (typeF === "all" ? true : r.type === typeF))
      .filter((r) => (groupF === "all" ? true : r.group === groupF))
      .filter((r) => (q === "" ? true : getEmployeeName(r.emp).toLowerCase().includes(q) || String(r.emp.รหัสพนักงาน || "").toLowerCase().includes(q) || r.group.toLowerCase().includes(q)));
  }, [employees, scores, rounds, assignments, period, projectF, typeF, groupF, search, canSeeAllProjects, canAssign, myAssignedProjects, myUid]);

  const typeOptions = useMemo(() => Array.from(EVALUATED_EMPLOYEE_TYPES), []);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (!isMemberInPeriod(emp, period)) return;
      const project = parseProjectList(emp.สถานะโครงการ)[0] || NO_PROJECT;
      const group = String(emp["ชื่อชุด"] || "").trim() || NO_GROUP;
      if (!groupVisible(project, group)) return;
      if (projectF !== "all" && project !== projectF) return;
      set.add(group);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [employees, period, projectF, assignments, canSeeAllProjects, canAssign, myAssignedProjects, myUid]);

  const groupRollup = useMemo(() => {
    const map = new Map<string, { project: string; group: string; members: SummaryPersonRow[] }>();
    rows.forEach((r) => {
      const key = `${r.project}|||${r.group}`;
      if (!map.has(key)) map.set(key, { project: r.project, group: r.group, members: [] });
      map.get(key)!.members.push(r);
    });
    const arr = Array.from(map.entries()).map(([key, g]) => {
      const scored = g.members.filter((m) => m.fin);
      const avg = scored.length ? Math.round((scored.reduce((s, m) => s + m.fin!.total, 0) / scored.length) * 10) / 10 : null;
      const dist = { pass: 0, develop: 0, watch: 0 };
      scored.forEach((m) => { dist[flagBucket(m.fin!.total)] += 1; });
      return { key, project: g.project, group: g.group, members: g.members, memberCount: g.members.length, scoredCount: scored.length, avg, dist };
    });
    arr.sort((a, b) => {
      if (a.dist.watch !== b.dist.watch) return b.dist.watch - a.dist.watch;
      const av = a.avg == null ? 999 : a.avg;
      const bv = b.avg == null ? 999 : b.avg;
      return av - bv;
    });
    return arr;
  }, [rows]);

  const ranking = useMemo(
    () => [...rows].sort((a, b) => (b.fin ? b.fin.total : -1) - (a.fin ? a.fin.total : -1)),
    [rows]
  );

  const scoredTotal = rows.filter((r) => r.fin).length;
  const watchTotal = rows.filter((r) => r.fin && r.fin.total < 65).length;

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  const exportCsv = () => {
    const headers = ["period", "project", "group", "employeeId", "name", "employeeType", ...criteria.map((c) => c.key), "total", "grade", "flag", "finalSource", "roundStatus"];
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      const fin = r.fin;
      const flag = fin ? evalActionFlag(fin.total).label : "-";
      const src = fin ? finalSourceText(fin) : "-";
      const cols: unknown[] = [
        monthLabelTh(period), r.project, r.group, r.emp.รหัสพนักงาน || r.emp.id, getEmployeeName(r.emp), r.type,
        ...criteria.map((c) => (fin ? fin.scores[c.key] : "")),
        fin ? fin.total : "", fin ? fin.grade : "", flag, src, roundStatusText(r.round),
      ];
      lines.push(cols.map(csvEscape).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const projTag = projectF === "all" ? "all" : projectF;
    a.href = url;
    a.download = `evaluation-${period}-${projTag}.csv`.replace(/[\\/:*?"<>|]+/g, "-");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onExport("ส่งออก CSV สรุปผล", `รอบ ${monthLabelTh(period)} · โครงการ ${projTag} · ${rows.length} รายการ`);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 lg:p-3">
        <FilterSelect label="รอบ" value={period} onChange={setPeriod}
          options={periodOptions.map((p) => ({ value: p.key, label: p.label }))} />
        <FilterSelect label="โครงการ" value={projectF} onChange={(v) => { setProjectF(v); setGroupF("all"); }}
          options={[{ value: "all", label: "ทั้งหมด" }, ...projectOptions.map((p) => ({ value: p, label: p }))]} />
        <FilterSelect label="ประเภท" value={typeF} onChange={setTypeF}
          options={[{ value: "all", label: "ทั้งหมด" }, ...typeOptions.map((t) => ({ value: t, label: t }))]} />
        <FilterSelect label="ชุด" value={groupF} onChange={setGroupF}
          options={[{ value: "all", label: "ทั้งหมด" }, ...groupOptions.map((g) => ({ value: g, label: g }))]} />
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชุด"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
        </div>
        <button onClick={exportCsv} disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
          <Download size={14} /> ส่งออก CSV
        </button>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <SummaryCard label="รายชื่อในรอบนี้" value={rows.length} tone="slate" />
        <SummaryCard label="มีคะแนนแล้ว" value={scoredTotal} tone="emerald" />
        <SummaryCard label="เฝ้าระวัง (<65)" value={watchTotal} tone="amber" />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">ไม่มีข้อมูลในรอบ/เงื่อนไขนี้</div>
      ) : (
        <>
          {/* Roll-up by group */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Users2 size={15} className="text-indigo-500" />
              <span className="text-sm font-bold text-slate-800">สรุปตามชุดแรงงาน</span>
              <span className="text-[11px] text-slate-400">(เรียงกลุ่มที่ต้องสนใจก่อน)</span>
              <span className="ml-auto text-[11px] text-slate-400">รอบ {monthLabelTh(period)}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {groupRollup.map((g) => {
                const isOpen = expanded.has(g.key);
                const grade = g.avg != null ? gradeFromTotal(g.avg) : null;
                return (
                  <div key={g.key}>
                    <button onClick={() => toggleGroup(g.key)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                      {isOpen ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">{g.group}</div>
                        <div className="text-[11px] text-slate-400 truncate">{g.project} · {g.memberCount} คน · ให้คะแนนแล้ว {g.scoredCount}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="hidden sm:flex items-center gap-1 text-[10px] font-semibold">
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">ผ่าน {g.dist.pass}</span>
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">พัฒนา {g.dist.develop}</span>
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">เฝ้าระวัง {g.dist.watch}</span>
                        </div>
                        {g.avg != null && grade ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{g.avg}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(grade)}`}>{grade}</span>
                          </div>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="bg-slate-50/60 px-3 pb-2">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] text-sm">
                            <thead className="text-slate-500 text-[11px]">
                              <tr>
                                <th className="px-2 py-1.5 text-left font-semibold">สมาชิก</th>
                                <th className="px-2 py-1.5 text-center font-semibold">คะแนน</th>
                                <th className="px-2 py-1.5 text-center font-semibold">เกรด</th>
                                <th className="px-2 py-1.5 text-center font-semibold">ผล</th>
                                <th className="px-2 py-1.5 text-center font-semibold">ที่มา</th>
                                <th className="px-2 py-1.5 text-center font-semibold"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.members.map((m) => (
                                <tr key={m.emp.id} className={`border-t border-slate-100 ${m.fin && m.fin.total < 65 ? "bg-rose-50/50" : ""}`}>
                                  <td className="px-2 py-1.5">
                                    <div className="font-medium text-slate-700 truncate">{getEmployeeName(m.emp)}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{m.emp.รหัสพนักงาน} · {m.emp.ตำแหน่ง || "-"}</div>
                                  </td>
                                  <td className="px-2 py-1.5 text-center font-bold text-slate-800">{m.fin ? m.fin.total : "—"}</td>
                                  <td className="px-2 py-1.5 text-center">{m.fin ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(m.fin.grade)}`}>{m.fin.grade}</span> : "—"}</td>
                                  <td className="px-2 py-1.5 text-center">{m.fin ? flagPill(m.fin.total) : "—"}</td>
                                  <td className="px-2 py-1.5 text-center text-[10px] text-slate-500">{m.fin ? finalSourceText(m.fin) : "—"}</td>
                                  <td className="px-2 py-1.5 text-center">
                                    <button onClick={() => setOpenPerson(m)} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold">ประวัติ</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking by person */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <TrendingUp size={15} className="text-indigo-500" />
              <span className="text-sm font-bold text-slate-800">จัดอันดับรายบุคคล</span>
              <span className="text-[11px] text-slate-400">(คะแนนสูง → ต่ำ · คลิกเพื่อดูประวัติ)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">ชื่อ</th>
                    <th className="px-3 py-2 text-left font-semibold">ชุด / โครงการ</th>
                    <th className="px-3 py-2 text-center font-semibold">คะแนน</th>
                    <th className="px-3 py-2 text-center font-semibold">เกรด</th>
                    <th className="px-3 py-2 text-center font-semibold">ผล</th>
                    <th className="px-3 py-2 text-left font-semibold">สถานะรอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranking.map((r, i) => {
                    const watch = r.fin && r.fin.total < 65;
                    return (
                      <tr key={r.emp.id} onClick={() => setOpenPerson(r)}
                        className={`cursor-pointer hover:bg-indigo-50/40 ${watch ? "bg-rose-50/50" : ""}`}>
                        <td className="px-3 py-2 text-center text-slate-400">{r.fin ? i + 1 : "—"}</td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800 truncate">{getEmployeeName(r.emp)}</div>
                          <div className="text-[11px] text-slate-400 truncate">{r.emp.รหัสพนักงาน} · {r.type}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-slate-700 truncate">{r.group}</div>
                          <div className="text-[11px] text-slate-400 truncate">{r.project}</div>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-slate-800">{r.fin ? r.fin.total : "—"}</td>
                        <td className="px-3 py-2 text-center">{r.fin ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(r.fin.grade)}`}>{r.fin.grade}</span> : "—"}</td>
                        <td className="px-3 py-2 text-center">{r.fin ? flagPill(r.fin.total) : "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-600">{roundStatusText(r.round)}</span>
                            {!(r.round && r.round.closed) && r.fin && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">ชั่วคราว</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {openPerson && (
        <PersonHistoryModal
          row={openPerson}
          scores={scores}
          criteria={criteria}
          periodOptions={periodOptions}
          selectedPeriod={period}
          onClose={() => setOpenPerson(null)}
        />
      )}
    </div>
  );
};

// ---- per-person history modal ----
const PersonHistoryModal = ({
  row, scores, criteria, periodOptions, selectedPeriod, onClose,
}: {
  row: SummaryPersonRow;
  scores: EvalScoreRecord[];
  criteria: EvalCriterion[];
  periodOptions: { key: string; label: string }[];
  selectedPeriod: string;
  onClose: () => void;
}) => {
  const history = useMemo(
    () =>
      periodOptions.map((p) => {
        const recs = scores.filter((s) => s.project === row.project && s.group === row.group && s.period === p.key && s.employeeId === row.emp.id);
        return { key: p.key, label: p.label, fin: finalPersonScore(recs) };
      }),
    [scores, row, periodOptions]
  );
  // แสดงจากเก่า → ใหม่ เพื่อให้ดูเป็นเทรนด์
  const timeline = useMemo(() => [...history].reverse(), [history]);
  const current = history.find((h) => h.key === selectedPeriod)?.fin || row.fin;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h4 className="text-base font-bold text-slate-800">{getEmployeeName(row.emp)}</h4>
            <p className="text-[11px] text-slate-500">{row.emp.รหัสพนักงาน} · {row.emp.ตำแหน่ง || "-"} · {row.group} · {row.project}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Mini trend across periods */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><TrendingUp size={13} /> แนวโน้มคะแนนแต่ละรอบ</div>
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3" style={{ minHeight: 120 }}>
              {timeline.map((h) => {
                const val = h.fin ? h.fin.total : 0;
                const heightPct = Math.max(4, Math.round((val / 100) * 100));
                const isCurrent = h.key === selectedPeriod;
                const barColor = !h.fin ? "bg-slate-200" : val >= 75 ? "bg-emerald-500" : val >= 65 ? "bg-amber-500" : "bg-rose-500";
                return (
                  <div key={h.key} className="flex flex-1 flex-col items-center gap-1" title={`${h.label}: ${h.fin ? h.fin.total : "ยังไม่มีคะแนน"}`}>
                    <span className="text-[10px] font-bold text-slate-700">{h.fin ? h.fin.total : "—"}</span>
                    <div className="flex h-16 w-full items-end justify-center">
                      <div className={`w-6 rounded-t ${barColor} ${isCurrent ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`} style={{ height: `${heightPct}%` }} />
                    </div>
                    <span className={`text-center text-[9px] leading-tight ${isCurrent ? "font-bold text-indigo-600" : "text-slate-400"}`}>{h.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> ผ่าน ≥75</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> ต้องพัฒนา 65–74</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" /> เฝ้าระวัง &lt;65</span>
            </div>
          </div>

          {/* Criteria breakdown for selected period */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">รายละเอียด 5 ด้าน · รอบ {monthLabelTh(selectedPeriod)}</div>
            {current ? (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-800">{current.total}<span className="text-sm text-slate-400">/100</span></span>
                  <span className={`rounded border px-2 py-0.5 text-xs font-bold ${gradeColor(current.grade)}`}>{current.grade}</span>
                  {flagPill(current.total)}
                  <span className="ml-auto text-[10px] text-slate-400">{finalSourceText(current)}</span>
                </div>
                {criteria.map((c) => {
                  const v = Number(current.scores[c.key]) || 0;
                  return (
                    <div key={c.key} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 truncate text-xs text-slate-600">{c.label} <span className="text-slate-400">({c.weight}%)</span></span>
                      <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                        <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${(v / 5) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{v}/5</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4 text-center text-sm text-slate-400">ยังไม่มีคะแนนในรอบนี้</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
