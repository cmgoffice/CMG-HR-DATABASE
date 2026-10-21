import React, { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  Clock,
  Loader2,
  ShieldAlert,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { DonutChart, RankedBarChart, TrendLineChart, DonutDatum, RankedBarDatum, TrendPoint } from "./DashboardCharts";
import { MetricCard, SectionCard, HorizontalBreakdown } from "./DashboardUI";
import { useOvertimeLimits } from "../hooks/useOvertimeLimits";
import { getMonthlyTier, OT_COLOR_CLASSES } from "../config/overtimeLimits";
import { resolveEmployeeStartDate } from "../utils/employeeDates";
import {
  SAFETY_CORRECTIVE_ACTION_STATUS_LABELS,
  STANDARD_WORK_HOURS_PER_DAY,
} from "./safetyDashboardConfig";
import { EmployeeTransfer, EMPLOYEE_TRANSFERS_COLLECTION } from "./projectTransferConfig";

// ---------------------------------------------------------------------------
// HR–Safety Dashboard — Phase 1 (อนุมัติแล้ว): "Workforce & Exposure" เท่านั้น
//
// หลักการสำคัญ: ใช้ข้อมูลที่มีอยู่แล้วในระบบทั้งหมด (attendance / overtime /
// employee_data / employee_transfers / settings/overtime_limits) แบบ
// read-only ไม่มีการเขียนข้อมูลใดๆ จาก component นี้ และไม่แก้ schema เดิม
//
// Man-hour เป็น "ค่าประมาณ" จาก man-day (สถานะ "มา") × ชั่วโมงมาตรฐาน/วัน
// (ยืนยันแล้ว = 8 ชม.) + ชั่วโมง OT จริงจาก overtime collection เนื่องจาก
// ระบบ attendance เดิมไม่ได้เก็บเวลาเข้า-ออกงานจริงเป็นชั่วโมง (ดู Data Gap #2
// ในรายงานวิเคราะห์) — ทุกจุดที่แสดงค่านี้ต้องมี label/tooltip บอกว่าเป็นค่า
// ประมาณการเสมอ ห้ามแสดงเหมือนเป็น "verified actual hours"
//
// ส่วน "Safety Incident & Prevention" ยังไม่มีข้อมูลเชื่อมต่อจริง (อยู่ใน
// Excel แยกของฝ่าย Safety) — แสดงเป็น placeholder พร้อมคำอธิบาย ตามคำสั่ง
// "ทำระบบไว้ รอใส่ข้อมูลทีหลัง" (ดู safetyDashboardConfig.ts สำหรับ schema
// ที่เตรียมไว้ล่วงหน้าสำหรับ Phase 2)
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string; // "Staff" | "Worker" | "Subcontract" | "Supply Contract"
  สถานะโครงการ?: string | string[];
  start_date?: string;
  resignation_date?: string;
  [key: string]: any;
}

interface AttendanceEntry {
  status: string;
  recordedAt: number;
  project?: string;
}

interface OvertimeEntry {
  hours: string;
  type?: string;
  recordedAt: number;
  project?: string;
}

interface ProjectRecord {
  id: string;
  project_no?: string;
  project_name?: string;
}

const NO_PROJECT = "ไม่ระบุโครงการ";
const NO_LABOR_GROUP = "ไม่ระบุกลุ่มงาน";

const parseProjectList = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const projectListIncludes = (projects: string[], target: string): boolean =>
  projects.some((p) => String(p || "").trim() === String(target || "").trim());

const monthKeyFromDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const daysInMonthKey = (monthKey: string): string[] => {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  const count = new Date(y, m, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= count; d++) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
};

/** แสดงวันที่แบบย่อ พ.ศ. เช่น "1 ต.ค. 2569" สำหรับ label ช่วงวันที่ที่เลือก */
const formatThaiDateShort = (dateStr?: string): string => {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const thaiMonths = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
};

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** รายชื่อ monthKey ("YYYY-MM") ทั้ง 12 เดือนของปี (ค.ศ.) ที่ระบุ */
const monthKeysOfYear = (year: number): string[] =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

const lastDateOfMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CHART_COLORS = ["#0ea5e9", "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#64748b", "#ec4899"];

const EmptyDataNote = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
    {message}
  </div>
);

export const SafetyDashboardTab = ({
  activeEmployees,
  canSeeAllProjects,
  assignedProjects,
  selectedDates,
  startDate,
  endDate,
}: {
  activeEmployees: Employee[];
  canSeeAllProjects: boolean;
  assignedProjects: string[];
  /** ช่วงวันที่ที่เลือกจาก header หลัก (วันนี้/เมื่อวาน/เดือนนี้/กำหนดเอง) ใช้คำนวณ Workforce & Exposure Summary */
  selectedDates: string[];
  startDate: string;
  endDate: string;
}) => {
  const db = getFirestore();
  const { limits: otLimits, loading: otLimitsLoading } = useOvertimeLimits();

  const [loading, setLoading] = useState(true);
  const [attendanceByDate, setAttendanceByDate] = useState<Record<string, Record<string, AttendanceEntry>>>({});
  const [overtimeByDate, setOvertimeByDate] = useState<Record<string, Record<string, OvertimeEntry>>>({});
  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);

  const [yearValue, setYearValue] = useState<number>(new Date().getFullYear());
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [laborGroupFilter, setLaborGroupFilter] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    const attendanceRef = collection(db, "CMG-HR-Database", "root", "attendance");
    const overtimeRef = collection(db, "CMG-HR-Database", "root", "overtime");
    const projectRef = collection(db, "CMG-HR-Database", "root", "projects");
    const employeeRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    const transfersRef = collection(db, "CMG-HR-Database", "root", EMPLOYEE_TRANSFERS_COLLECTION);

    const unsubAttendance = onSnapshot(attendanceRef, (snapshot) => {
      const next: Record<string, Record<string, AttendanceEntry>> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const records: Record<string, AttendanceEntry> = {};
        if (data.records) {
          Object.entries(data.records).forEach(([empId, val]) => {
            if (typeof val === "string") records[empId] = { status: val, recordedAt: 0 };
            else if (val && typeof val === "object") records[empId] = val as AttendanceEntry;
          });
        }
        next[docSnap.id] = records;
      });
      setAttendanceByDate(next);
      setLoading(false);
    }, () => setLoading(false));

    const unsubOvertime = onSnapshot(overtimeRef, (snapshot) => {
      const next: Record<string, Record<string, OvertimeEntry>> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const records: Record<string, OvertimeEntry> = {};
        if (data.records) {
          Object.entries(data.records).forEach(([empId, val]) => {
            if (val && typeof val === "object") records[empId] = val as OvertimeEntry;
          });
        }
        next[docSnap.id] = records;
      });
      setOvertimeByDate(next);
    });

    const unsubProjects = onSnapshot(projectRef, (snapshot) => {
      setProjectRecords(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProjectRecord)));
    });

    const unsubEmployees = onSnapshot(employeeRef, (snapshot) => {
      let list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Employee));
      if (!canSeeAllProjects) {
        list = list.filter((emp) =>
          parseProjectList(emp.สถานะโครงการ).some((project) => projectListIncludes(assignedProjects, project))
        );
      }
      setAllEmployees(list);
    });

    const unsubTransfers = onSnapshot(transfersRef, (snapshot) => {
      setTransfers(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as EmployeeTransfer)));
    });

    return () => {
      unsubAttendance();
      unsubOvertime();
      unsubProjects();
      unsubEmployees();
      unsubTransfers();
    };
  }, [db, canSeeAllProjects, assignedProjects.join("|")]);

  // ช่วงวันที่ที่ใช้คำนวณ Workforce & Exposure Summary / Workforce Movement มาจาก header หลัก
  // (วันนี้/เมื่อวาน/เดือนนี้/กำหนดเอง) ส่วน "สถิติประจำปี" ด้านล่างยังคงใช้ตัวเลือกปีของตัวเอง
  const rangeStart = selectedDates[0];
  const rangeEnd = selectedDates[selectedDates.length - 1];
  const rangeLabel = useMemo(() => {
    if (!rangeStart || !rangeEnd) return "";
    if (rangeStart === rangeEnd) return formatThaiDateShort(rangeStart);
    return `${formatThaiDateShort(rangeStart)} – ${formatThaiDateShort(rangeEnd)}`;
  }, [rangeStart, rangeEnd]);

  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    projectRecords.forEach((p) => {
      const no = String(p.project_no || "").trim();
      const name = String(p.project_name || "").trim();
      const full = no && name ? `${no} - ${name}` : name || no;
      if (full) names.add(full);
    });
    activeEmployees.forEach((emp) => parseProjectList(emp.สถานะโครงการ).forEach((p) => names.add(p)));
    return Array.from(names).sort();
  }, [projectRecords, activeEmployees]);

  const laborGroupOptions = ["Staff", "Worker", "Subcontract", "Supply Contract"];

  // scope employees ตามฟิลเตอร์โครงการ/กลุ่มงานที่เลือก (เฉพาะพนักงานสถานะทำงาน)
  const scopedEmployees = useMemo(() => {
    return activeEmployees.filter((emp) => {
      if (projectFilter !== "all" && !parseProjectList(emp.สถานะโครงการ).includes(projectFilter)) return false;
      if (laborGroupFilter !== "all" && String(emp.สถานะกลุ่มงาน || "").trim() !== laborGroupFilter) return false;
      return true;
    });
  }, [activeEmployees, projectFilter, laborGroupFilter]);

  const scopedEmployeeIds = useMemo(() => new Set(scopedEmployees.map((e) => e.id)), [scopedEmployees]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    activeEmployees.forEach((e) => map.set(e.id, e));
    return map;
  }, [activeEmployees]);

  // ใช้ allEmployees (ไม่กรองเฉพาะ "ทำงาน") สำหรับสถิติย้อนหลัง/ประจำปี เพื่อให้นับ
  // man-hours ของพนักงานที่ลาออกไปแล้วระหว่างปีได้ถูกต้อง (ไม่ใช่แค่คนที่ยังทำงานอยู่วันนี้)
  const allEmployeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    allEmployees.forEach((e) => map.set(e.id, e));
    return map;
  }, [allEmployees]);

  const hasResignationDates = useMemo(() => allEmployees.some((e) => !!e.resignation_date), [allEmployees]);

  const passesScopeFilters = (emp: Employee | undefined, project: string): boolean => {
    if (laborGroupFilter !== "all" && String(emp?.สถานะกลุ่มงาน || "").trim() !== laborGroupFilter) return false;
    if (projectFilter !== "all" && project !== projectFilter) return false;
    return true;
  };

  // ---------- Man-hours & OT (Workforce & Exposure) ----------
  const exposureData = useMemo(() => {
    let regularManDays = 0;
    let otHoursTotal = 0;
    const manHoursByProject: Record<string, number> = {};
    const manDaysByLaborGroup: Record<string, number> = {};
    const otHoursByEmployee: Record<string, number> = {};

    selectedDates.forEach((date) => {
      const attRecords = attendanceByDate[date] || {};
      Object.entries(attRecords).forEach(([empId, entry]) => {
        if (!scopedEmployeeIds.has(empId)) return;
        if (entry.status !== "มา") return;
        regularManDays += 1;
        const emp = employeeById.get(empId);
        const project = entry.project || parseProjectList(emp?.สถานะโครงการ)[0] || NO_PROJECT;
        manHoursByProject[project] = (manHoursByProject[project] || 0) + STANDARD_WORK_HOURS_PER_DAY;
        const laborGroup = String(emp?.สถานะกลุ่มงาน || "").trim() || NO_LABOR_GROUP;
        manDaysByLaborGroup[laborGroup] = (manDaysByLaborGroup[laborGroup] || 0) + 1;
      });

      const otRecords = overtimeByDate[date] || {};
      Object.entries(otRecords).forEach(([empId, entry]) => {
        if (!scopedEmployeeIds.has(empId)) return;
        const hours = parseFloat(entry.hours);
        if (!Number.isFinite(hours) || hours <= 0) return;
        otHoursTotal += hours;
        const emp = employeeById.get(empId);
        const project = entry.project || parseProjectList(emp?.สถานะโครงการ)[0] || NO_PROJECT;
        manHoursByProject[project] = (manHoursByProject[project] || 0) + hours;
        otHoursByEmployee[empId] = (otHoursByEmployee[empId] || 0) + hours;
      });
    });

    const regularHours = regularManDays * STANDARD_WORK_HOURS_PER_DAY;
    const totalManHours = regularHours + otHoursTotal;

    return {
      regularManDays,
      regularHours,
      otHoursTotal,
      totalManHours,
      manHoursByProject,
      manDaysByLaborGroup,
      otHoursByEmployee,
    };
  }, [selectedDates, attendanceByDate, overtimeByDate, scopedEmployeeIds, employeeById]);

  const manHoursByProjectChart: RankedBarDatum[] = useMemo(() => {
    return Object.entries(exposureData.manHoursByProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({
        name: name.length > 16 ? `${name.slice(0, 14)}…` : name,
        fullName: name,
        value: Math.round(value),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [exposureData.manHoursByProject]);

  const manHoursByLaborGroupChart: DonutDatum[] = useMemo(() => {
    return Object.entries(exposureData.manDaysByLaborGroup)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value: value * STANDARD_WORK_HOURS_PER_DAY, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [exposureData.manDaysByLaborGroup]);

  // ---------- OT Tier distribution (fatigue signal) ----------
  const otTierBreakdown = useMemo(() => {
    const tiers = otLimits.monthlyTiers;
    const counts: Record<string, number> = {};
    tiers.forEach((t) => (counts[t.id] = 0));
    scopedEmployees.forEach((emp) => {
      const hours = exposureData.otHoursByEmployee[emp.id] || 0;
      const tier = getMonthlyTier(hours, tiers);
      if (tier) counts[tier.id] = (counts[tier.id] || 0) + 1;
    });
    return tiers.map((t) => ({ tier: t, count: counts[t.id] || 0 }));
  }, [otLimits.monthlyTiers, scopedEmployees, exposureData.otHoursByEmployee]);

  const watchTierEmployeeCount = useMemo(
    () => otTierBreakdown.filter((row) => row.tier.id !== "normal").reduce((sum, row) => sum + row.count, 0),
    [otTierBreakdown]
  );

  // ---------- Workforce Movement ----------
  const movementData = useMemo(() => {
    const inRange = (d?: string | null): boolean => !!d && !!rangeStart && !!rangeEnd && d >= rangeStart && d <= rangeEnd;
    const newHires = allEmployees.filter((e) => inRange(resolveEmployeeStartDate(e)));
    const exits = hasResignationDates ? allEmployees.filter((e) => inRange(e.resignation_date)) : [];
    const transfersInRange = transfers.filter((t) => inRange(t.effectiveDate));
    return { newHires, exits, hasResignationDates, transfersInRange };
  }, [allEmployees, transfers, rangeStart, rangeEnd, hasResignationDates]);

  // ---------- สถิติประจำปี (Annual Overview) ----------
  // ใช้ตัวกรองโครงการ/ประเภทแรงงานชุดเดียวกับด้านบน แต่คำนวณรายเดือนตลอดทั้งปีที่เลือก
  // NOTE: โครงการ/กลุ่มงานของพนักงานที่ลาออกไปแล้วใช้ค่า field ปัจจุบันในฐานข้อมูล
  // (ระบบไม่ได้เก็บประวัติสังกัดโครงการ/กลุ่มงานรายวันย้อนหลัง) — man-hours ยังอิง
  // entry.project ที่บันทึกจริงตอนลงเวลา/OT ของวันนั้นเป็นหลัก จึงแม่นยำกว่า
  const annualMonthKeys = useMemo(() => monthKeysOfYear(yearValue), [yearValue]);

  const annualData = useMemo(() => {
    const monthly = annualMonthKeys.map((mKey) => {
      const dates = daysInMonthKey(mKey);
      let regularManDays = 0;
      let otHours = 0;

      dates.forEach((date) => {
        const attRecords = attendanceByDate[date] || {};
        Object.entries(attRecords).forEach(([empId, entry]) => {
          if (entry.status !== "มา") return;
          const emp = allEmployeeById.get(empId);
          const project = entry.project || parseProjectList(emp?.สถานะโครงการ)[0] || NO_PROJECT;
          if (!passesScopeFilters(emp, project)) return;
          regularManDays += 1;
        });

        const otRecords = overtimeByDate[date] || {};
        Object.entries(otRecords).forEach(([empId, entry]) => {
          const hours = parseFloat(entry.hours);
          if (!Number.isFinite(hours) || hours <= 0) return;
          const emp = allEmployeeById.get(empId);
          const project = entry.project || parseProjectList(emp?.สถานะโครงการ)[0] || NO_PROJECT;
          if (!passesScopeFilters(emp, project)) return;
          otHours += hours;
        });
      });

      const regularHours = regularManDays * STANDARD_WORK_HOURS_PER_DAY;
      const totalManHours = regularHours + otHours;

      const monthEndStr = lastDateOfMonth(mKey);
      const headcount = allEmployees.filter((e) => {
        if (laborGroupFilter !== "all" && String(e.สถานะกลุ่มงาน || "").trim() !== laborGroupFilter) return false;
        if (projectFilter !== "all" && !parseProjectList(e.สถานะโครงการ).includes(projectFilter)) return false;
        const startDate = resolveEmployeeStartDate(e);
        if (!startDate || startDate > monthEndStr) return false;
        if (e.resignation_date && e.resignation_date <= monthEndStr) return false;
        return true;
      }).length;

      const newHiresCount = allEmployees.filter(
        (e) => monthKeyFromDate(resolveEmployeeStartDate(e) || undefined) === mKey
      ).length;
      const exitsCount = hasResignationDates
        ? allEmployees.filter((e) => monthKeyFromDate(e.resignation_date) === mKey).length
        : null;
      const transfersCount = transfers.filter((t) => {
        if (monthKeyFromDate(t.effectiveDate) !== mKey) return false;
        if (projectFilter === "all") return true;
        return t.toProject === projectFilter || (Array.isArray(t.fromProjects) && t.fromProjects.includes(projectFilter));
      }).length;

      const [, m] = mKey.split("-").map((n) => parseInt(n, 10));
      return {
        monthKey: mKey,
        label: THAI_MONTHS_SHORT[m - 1],
        totalManHours,
        otHours,
        regularHours,
        headcount,
        newHiresCount,
        exitsCount,
        transfersCount,
      };
    });

    const totals = monthly.reduce(
      (acc, row) => ({
        totalManHours: acc.totalManHours + row.totalManHours,
        otHours: acc.otHours + row.otHours,
        newHiresCount: acc.newHiresCount + row.newHiresCount,
        exitsCount: row.exitsCount == null ? acc.exitsCount : acc.exitsCount + row.exitsCount,
        transfersCount: acc.transfersCount + row.transfersCount,
        headcountSum: acc.headcountSum + row.headcount,
      }),
      { totalManHours: 0, otHours: 0, newHiresCount: 0, exitsCount: 0, transfersCount: 0, headcountSum: 0 }
    );
    const avgHeadcount = monthly.length > 0 ? Math.round(totals.headcountSum / monthly.length) : 0;

    return { monthly, totals, avgHeadcount };
  }, [
    annualMonthKeys,
    attendanceByDate,
    overtimeByDate,
    allEmployees,
    allEmployeeById,
    transfers,
    hasResignationDates,
    projectFilter,
    laborGroupFilter,
  ]);

  const manHoursTrend: TrendPoint[] = useMemo(
    () => annualData.monthly.map((row) => ({ label: row.label, value: Math.round(row.totalManHours), meta: `OT ${Math.round(row.otHours)} ชม.` })),
    [annualData.monthly]
  );

  const headcountTrend: TrendPoint[] = useMemo(
    () => annualData.monthly.map((row) => ({ label: row.label, value: row.headcount })),
    [annualData.monthly]
  );

  const otRatioTrend: TrendPoint[] = useMemo(
    () =>
      annualData.monthly.map((row) => ({
        label: row.label,
        value: row.totalManHours > 0 ? Math.round((row.otHours / row.totalManHours) * 1000) / 10 : 0,
      })),
    [annualData.monthly]
  );

  if (loading || otLimitsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูล Safety Dashboard...
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2 lg:p-4 lg:space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-slate-200 p-2">
        <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5">
          <Calendar size={13} className="text-slate-400" />
          <span className="text-xs font-black text-slate-800">{rangeLabel || "เลือกช่วงวันที่ด้านบน"}</span>
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none"
        >
          <option value="all">ทุกโครงการ</option>
          {projectOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={laborGroupFilter}
          onChange={(e) => setLaborGroupFilter(e.target.value)}
          className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none"
        >
          <option value="all">ทุกประเภทแรงงาน</option>
          {laborGroupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <span className="text-[10px] text-slate-400 ml-auto">
          ข้อมูล ณ ปัจจุบัน (real-time) — Man-hour เป็นค่าประมาณการ ดู tooltip แต่ละการ์ด
        </span>
      </div>

      {/* A. Workforce Exposure Summary */}
      <SectionCard
        title="Workforce & Exposure Summary"
        subtitle={`สรุปชั่วโมงทำงาน/กำลังคน ช่วง ${rangeLabel}`}
        tooltip={
          <span>
            Man-hour (ประมาณการ) = จำนวนวันที่มาทำงาน (&quot;มา&quot;) × {STANDARD_WORK_HOURS_PER_DAY} ชม./วัน + ชั่วโมง OT จริง
            <br />
            ไม่ใช่ &quot;verified actual hours&quot; เพราะระบบเดิมไม่ได้เก็บเวลาเข้า-ออกงานจริง — ใช้เป็นค่าประมาณการเพื่อดู trend/สัดส่วน เท่านั้น
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            title="Man-hours รวม (ประมาณการ)"
            value={exposureData.totalManHours.toLocaleString()}
            subvalue="ชม. (ปกติ + OT)"
            icon={Clock}
            accent="text-slate-900"
            tooltip="ตัวหารที่ควรใช้คำนวณ LTIFR/TRIR เมื่อมีข้อมูลอุบัติเหตุจริงแล้ว ต้องยืนยันนิยามกับบริษัทก่อนใช้จริง"
          />
          <MetricCard
            title="กำลังคนในขอบเขตที่เลือก"
            value={scopedEmployees.length}
            subvalue="คน (สถานะทำงาน)"
            icon={Users}
            accent="text-sky-700"
          />
          <MetricCard
            title="ชั่วโมง OT รวม"
            value={exposureData.otHoursTotal.toLocaleString()}
            subvalue={
              exposureData.totalManHours > 0
                ? `${((exposureData.otHoursTotal / exposureData.totalManHours) * 100).toFixed(1)}% ของ man-hours รวม`
                : "0%"
            }
            icon={ArrowLeftRight}
            accent="text-amber-700"
          />
          <MetricCard
            title="พนักงานเข้าเกณฑ์เฝ้าระวัง OT"
            value={watchTierEmployeeCount}
            subvalue="คน (เกิน tier ปกติ เดือนนี้)"
            icon={AlertTriangle}
            accent="text-rose-700"
            tooltip="ใช้เพดาน OT ที่ HR ตั้งค่าไว้แล้วที่หน้า ลง Overtime / settings/overtime_limits"
          />
        </div>
      </SectionCard>

      {/* B. Man-hours by Project / Labor Group */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
        <SectionCard title="Man-hours แยกตามโครงการ" subtitle="Top 8 โครงการ (ปกติ + OT)" tooltip="ใช้ field project ที่บันทึกตอนลงเวลา/OT รายวัน">
          {manHoursByProjectChart.length === 0 ? (
            <EmptyDataNote message="ยังไม่มีข้อมูลการลงเวลาในเดือนนี้" />
          ) : (
            <RankedBarChart data={manHoursByProjectChart} maxValue={Math.max(...manHoursByProjectChart.map((d) => d.value), 1)} valueLabel="Man-hours" />
          )}
        </SectionCard>
        <SectionCard title="Man-hours แยกตามประเภทแรงงาน" subtitle="Staff / Worker / Subcontract / Supply Contract" tooltip="ใช้ field สถานะกลุ่มงาน ของพนักงาน (ไม่รวม OT แยกราย group ในกราฟนี้)">
          {manHoursByLaborGroupChart.length === 0 ? (
            <EmptyDataNote message="ยังไม่มีข้อมูลในเดือนนี้" />
          ) : (
            <DonutChart data={manHoursByLaborGroupChart} centerValue={exposureData.regularHours.toLocaleString()} centerSub="ชม.ปกติรวม" unit="ชม." />
          )}
        </SectionCard>
      </div>

      {/* C. OT Fatigue Signal */}
      <SectionCard
        title="สัญญาณ OT สะสม / Fatigue Risk"
        subtitle="จำนวนพนักงานแยกตามระดับเพดาน OT สะสมต่อเดือน"
        tooltip="Threshold กำหนดโดย HR ไว้แล้วที่หน้า ลง Overtime (settings/overtime_limits) ไม่ได้เป็นค่าที่ระบบกำหนดเอง — เพดานนี้เป็นรายเดือน แนะนำให้เลือกช่วงวันที่ตรงกับ 1 เดือนปฏิทินด้านบน เพื่อให้เทียบค่าได้แม่นยำ"
      >
        <HorizontalBreakdown
          items={otTierBreakdown.map((row) => ({ label: row.tier.label, value: row.count }))}
          total={scopedEmployees.length}
          accent="bg-amber-400"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {otTierBreakdown.map((row) => {
            const colors = OT_COLOR_CLASSES[row.tier.colorKey];
            return (
              <span
                key={row.tier.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.border} ${colors.text}`}
                title={row.tier.action}
              >
                {row.tier.label}: {row.count} คน
              </span>
            );
          })}
        </div>
      </SectionCard>

      {/* D. Workforce Movement */}
      <SectionCard
        title="Workforce Movement"
        subtitle={`การเข้า-ออก-ย้ายโครงการ ช่วง ${rangeLabel}`}
        tooltip="พนักงานใหม่ใช้ start_date, ย้ายโครงการใช้ effectiveDate จาก employee_transfers (ตามวันที่งานจริง ไม่ใช่สังกัดปัจจุบัน)"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricCard title="พนักงานใหม่" value={movementData.newHires.length} subvalue="เริ่มงานในช่วงนี้" icon={UserPlus} accent="text-emerald-700" />
          <MetricCard
            title="พนักงานออก"
            value={movementData.hasResignationDates ? movementData.exits.length : "-"}
            subvalue={movementData.hasResignationDates ? "ออกในช่วงนี้" : "ยังไม่มีข้อมูลวันที่ลาออก"}
            icon={UserMinus}
            accent="text-rose-700"
          />
          <MetricCard title="ย้ายโครงการ" value={movementData.transfersInRange.length} subvalue="มีผลในช่วงนี้ (employee_transfers)" icon={ArrowLeftRight} accent="text-sky-700" />
        </div>
      </SectionCard>

      {/* E. สถิติประจำปี (Annual Overview) */}
      <SectionCard
        title="สถิติประจำปี (Annual Overview)"
        subtitle="แนวโน้มรายเดือนตลอดทั้งปี ตามตัวกรองโครงการ/ประเภทแรงงานด้านบน"
        tooltip="คำนวณจากข้อมูลเดียวกับด้านบน แต่รวมพนักงานที่ลาออกไปแล้วระหว่างปีด้วย เพื่อไม่ให้ man-hours ย้อนหลังตกหล่น"
        headerAction={
          <div className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-1">
            <button
              type="button"
              onClick={() => setYearValue((y) => y - 1)}
              className="px-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded"
            >
              ◀
            </button>
            <span className="px-2 text-xs font-black text-slate-800">{yearValue + 543}</span>
            <button
              type="button"
              onClick={() => setYearValue((y) => y + 1)}
              className="px-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded"
            >
              ▶
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <MetricCard title="Man-hours รวม (ปี)" value={Math.round(annualData.totals.totalManHours).toLocaleString()} subvalue="ชม. (ปกติ + OT)" icon={Clock} accent="text-slate-900" />
          <MetricCard title="OT รวม (ปี)" value={Math.round(annualData.totals.otHours).toLocaleString()} subvalue="ชม." icon={ArrowLeftRight} accent="text-amber-700" />
          <MetricCard title="กำลังคนเฉลี่ย" value={annualData.avgHeadcount} subvalue="คน/เดือน" icon={Users} accent="text-sky-700" />
          <MetricCard title="พนักงานใหม่ (ปี)" value={annualData.totals.newHiresCount} subvalue="คน" icon={UserPlus} accent="text-emerald-700" />
          <MetricCard
            title="พนักงานออก (ปี)"
            value={hasResignationDates ? annualData.totals.exitsCount : "-"}
            subvalue={hasResignationDates ? "คน" : "ไม่มีข้อมูลวันที่ลาออก"}
            icon={UserMinus}
            accent="text-rose-700"
          />
          <MetricCard title="ย้ายโครงการ (ปี)" value={annualData.totals.transfersCount} subvalue="ครั้ง" icon={ArrowLeftRight} accent="text-violet-700" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Man-hours รายเดือน (ประมาณการ)</div>
            <TrendLineChart data={manHoursTrend} unit=" ชม." domain={[0, Math.max(100, ...manHoursTrend.map((t) => t.value || 0))]} color="#0ea5e9" valueLabel="Man-hours" height={180} />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">สัดส่วน OT ต่อ Man-hours รายเดือน</div>
            <TrendLineChart data={otRatioTrend} unit="%" domain={[0, Math.max(10, ...otRatioTrend.map((t) => t.value || 0))]} color="#f59e0b" valueLabel="OT Ratio" height={180} />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">กำลังคน ณ สิ้นเดือน</div>
            <TrendLineChart data={headcountTrend} unit=" คน" domain={[0, Math.max(10, ...headcountTrend.map((t) => t.value || 0))]} color="#10b981" valueLabel="Headcount" height={180} />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1 pr-2 text-left font-bold">เดือน</th>
                <th className="py-1 px-2 text-right font-bold">Man-hours</th>
                <th className="py-1 px-2 text-right font-bold">OT (ชม.)</th>
                <th className="py-1 px-2 text-right font-bold">กำลังคน</th>
                <th className="py-1 px-2 text-right font-bold">เข้าใหม่</th>
                <th className="py-1 px-2 text-right font-bold">ออก</th>
                <th className="py-1 pl-2 text-right font-bold">ย้ายโครงการ</th>
              </tr>
            </thead>
            <tbody>
              {annualData.monthly.map((row) => (
                <tr key={row.monthKey} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-2 font-semibold text-slate-700">{row.label}</td>
                  <td className="py-1 px-2 text-right text-slate-600">{Math.round(row.totalManHours).toLocaleString()}</td>
                  <td className="py-1 px-2 text-right text-slate-600">{Math.round(row.otHours).toLocaleString()}</td>
                  <td className="py-1 px-2 text-right text-slate-600">{row.headcount}</td>
                  <td className="py-1 px-2 text-right text-emerald-700">{row.newHiresCount}</td>
                  <td className="py-1 px-2 text-right text-rose-700">{row.exitsCount == null ? "-" : row.exitsCount}</td>
                  <td className="py-1 pl-2 text-right text-sky-700">{row.transfersCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* F. Safety Incident & Prevention — PLACEHOLDER (Phase 2) */}
      <SectionCard
        title="Safety Incident & Prevention"
        subtitle="LTI / TRIR / Near-miss / Corrective Action"
        tooltip="ยังไม่เชื่อมต่อข้อมูลจริง — ข้อมูลอุบัติเหตุปัจจุบันอยู่ในไฟล์ Excel แยกของฝ่าย Safety นอกระบบนี้"
      >
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center">
          <ShieldAlert className="mx-auto mb-2 text-amber-500" size={28} />
          <div className="text-sm font-bold text-amber-800">ยังไม่มีข้อมูล / ยังไม่เชื่อมต่อ</div>
          <div className="mt-1 text-xs text-amber-700">
            เตรียมโครงสร้างข้อมูล (type/field) ไว้แล้วใน <code className="rounded bg-amber-100 px-1">safetyDashboardConfig.ts</code> สำหรับ LTI,
            Lost Workdays, Near-miss, Corrective Action — พร้อมเชื่อมต่อเมื่อได้รับไฟล์ Excel ตัวอย่างจากฝ่าย Safety
            และยืนยันนิยาม LTI/Recordable Case + ฐานคำนวณ (1,000,000 หรือ 200,000 ชั่วโมง) แล้ว
          </div>
          <div className="mt-2 text-[10px] text-amber-600">
            สถานะ corrective action ที่เตรียมรองรับ: {Object.values(SAFETY_CORRECTIVE_ACTION_STATUS_LABELS).join(" / ")}
          </div>
        </div>
      </SectionCard>
    </div>
  );
};
