import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import html2canvas from "html2canvas";
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Loader2,
  RotateCw,
  Table2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getPageGuide } from "../config/pageGuides";
import { InfoTooltip } from "./InfoTooltip";
import { PageGuideButton, PageGuideModal } from "./PageGuideModal";
import { DonutChart, RankedBarChart, CoverageCompareChart, CoverageGaugeDonut } from "./DashboardCharts";
import {
  EmployeeFollowUpCase,
  FOLLOW_UP_STATUS_LABELS,
  FollowUpRiskSeed,
  RiskRuleKey,
  RiskSeverity,
  findFollowUpCase,
  isFollowUpOpenStatus,
} from "./employeeFollowUpConfig";
import {
  computeRiskTotalScore,
  DEFAULT_RISK_MONITORING_SETTINGS,
  deriveSeverityFromSettings,
  evaluateConfiguredRiskRules,
  getSeverityGuidance,
  getSeverityHex,
  getSeverityLabel,
  RiskMonitoringSettings,
} from "./riskMonitoringSettingsConfig";

interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  ชื่อต้น?: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  employee_type?: string;
  gender?: string;
  เพศ?: string;
  date_of_birth?: string;
  start_date?: string;
  employment_status_reason?: string;
  [key: string]: any;
}

interface AttendanceEntry {
  status: string;
  recordedAt: number;
  project?: string;
  checkInTime?: string;
  shiftStartTime?: string;
  lateMinutes?: number;
  isLate?: boolean;
}

interface OvertimeEntry {
  hours: string;
  type?: string;
  recordedAt: number;
  project?: string;
}

interface LaborGroupStats {
  employees: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  notRecorded: number;
  wrongProject: number;
  otHours: number;
}

interface BreakdownRow {
  key: string;
  label: string;
  employees: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  notRecorded: number;
  wrongProject: number;
  otHours: number;
  laborGroupStats: Record<string, LaborGroupStats>;
}

interface DailySummary {
  date: string;
  label: string;
  present: number;
  absent: number;
  leave: number;
  notRecorded: number;
  wrongProject: number;
  otHours: number;
}

interface ProjectExceptionRow {
  id: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  position: string;
  employeeType: string;
  flags: string[];
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  notRecordedDays: number;
  lateDays: number;
  wrongProjectDays: number;
  otHours: number;
}

type TimePreset = "today" | "yesterday" | "month" | "custom";
type DashboardMode = "hr" | "project";

interface RiskRuleResult {
  key: RiskRuleKey;
  label: string;
  triggered: boolean;
  score: number;
  severityImpact: RiskSeverity;
  reason: string;
  value?: number | string;
  scoreGroup: string;
}

interface RiskMetrics {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  notRecordedDays: number;
  wrongProjectDays: number;
  dayOffDays: number;
  lateDays: number;
  otHours: number;
  consecutiveAbsentDays: number;
  mondayAbsenceCount: number;
  fridayAbsenceCount: number;
  mondayFridayAbsenceCount: number;
  absenceRate: number;
  leaveRate: number;
  notRecordedRate: number;
  payCycleAbsentDays: number;
  payCycleWorkDays: number;
  payCycleAbsenceRate: number;
  latestIncidentDate?: string;
}

interface EmployeeRiskScore {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  projectNames: string[];
  primaryProject?: string;
  position?: string;
  employeeType?: string;
  metrics: RiskMetrics;
  rules: RiskRuleResult[];
  totalScore: number;
  severity: RiskSeverity;
  overrideSeverity?: RiskSeverity;
  topReasons: string[];
  recommendedAction?: string;
  evaluatedFrom: string;
  evaluatedTo: string;
  evaluatedAt: string;
}

interface ProjectRiskItem {
  project: string;
  headcount: number;
  absent: number;
  leave: number;
  notRecorded: number;
  absenceRate: number;
  leaveRate: number;
  missingRate: number;
  otHours: number;
  totalScore: number;
  severity: RiskSeverity;
  drivers: Array<{ label: string; points: number; detail: string }>;
  trend: DailySummary[];
  topContributors: Array<{
    employeeId: string;
    employeeCode: string;
    fullName: string;
    position: string;
    employeeType: string;
    contributionScore: number;
    flags: string[];
  }>;
  recommendedAction: string;
}

interface CoverageInsightRow {
  key: string;
  label: string;
  assignedHeadcount: number;
  scheduledSlots: number;
  present: number;
  gapSlots: number;
  coverageRate: number;
  otHours: number;
}

interface ProjectRecord {
  id: string;
  project_no?: string;
  project_name?: string;
  required_manpower?: number | string;
  required_role_plan?: string;
  required_role_plan_baseline?: Array<{ position?: string; required?: number | string }>;
  required_role_plan_adjustments?: Array<{
    id?: string;
    start_date?: string;
    end_date?: string;
    note?: string;
    rows?: Array<{ position?: string; delta?: number | string }>;
  }>;
  [key: string]: any;
}

interface CoverageTrendRow {
  date: string;
  label: string;
  present: number;
  required: number;
  coverageRate: number;
  gapHeadcount: number;
}

interface EmployeeAttendanceSummaryRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  projectNames: string[];
  position: string;
  employeeType: string;
  metrics: RiskMetrics;
  severity: RiskSeverity;
  totalScore: number;
  topReasons: string[];
  recommendedAction: string;
}

interface ProjectEmployeeStatusRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  employeeType: string;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  notRecordedDays: number;
  wrongProjectDays: number;
  otHours: number;
  flags: string[];
}

const formatProjectNo = (projectNo: string): string => {
  if (!projectNo || projectNo === "ไม่ระบุ") return projectNo;
  const cleanProjectNo = projectNo.includes(" - ") ? projectNo.split(" - ")[0] : projectNo;
  const parts = cleanProjectNo.split("-");
  if (parts.length >= 2) return parts.slice(-2).join("-");
  return cleanProjectNo;
};

const formatProjectOption = (project: Partial<ProjectRecord>): string => {
  const projectNo = String(project.project_no || "").trim();
  const projectName = String(project.project_name || "").trim();
  if (!projectNo) return projectName;
  return projectName ? `${projectNo} - ${projectName}` : projectNo;
};

const normalizeRoleKey = (value: string): string => value.trim().toLowerCase();

const parseStructuredRolePlanBaseline = (
  value: unknown,
  legacyValue?: unknown
): Record<string, { label: string; required: number }> => {
  if (Array.isArray(value) && value.length > 0) {
    const normalized = value.reduce<Record<string, { label: string; required: number }>>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const row = item as Record<string, unknown>;
      const label = String(row.position || "").trim();
      const required = safeNumber(row.required);
      if (!label || required <= 0) return acc;
      acc[normalizeRoleKey(label)] = { label, required };
      return acc;
    }, {});
    if (Object.keys(normalized).length > 0) return normalized;
  }
  return parseRequiredRolePlan(legacyValue);
};

const parseRequiredRolePlan = (value: unknown): Record<string, { label: string; required: number }> => {
  if (!value) return {};
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, { label: string; required: number }>>((acc, line) => {
      const match = line.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
      if (!match) return acc;
      const label = match[1].trim();
      const required = safeNumber(match[2]);
      if (!label || required <= 0) return acc;
      acc[normalizeRoleKey(label)] = { label, required };
      return acc;
    }, {});
};

const parseStructuredRolePlanAdjustments = (
  value: unknown
): Array<{ startDate: string; endDate: string; rows: Array<{ key: string; label: string; delta: number }> }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const startDate = String(source.start_date || "");
      const endDate = String(source.end_date || "");
      const rows = Array.isArray(source.rows)
        ? source.rows
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const rowSource = row as Record<string, unknown>;
              const label = String(rowSource.position || "").trim();
              const delta = safeNumber(rowSource.delta);
              if (!label || delta === 0) return null;
              return { key: normalizeRoleKey(label), label, delta };
            })
            .filter((row): row is { key: string; label: string; delta: number } => row !== null)
        : [];
      if (!startDate || !endDate || rows.length === 0) return null;
      return { startDate, endDate, rows };
    })
    .filter((item): item is { startDate: string; endDate: string; rows: Array<{ key: string; label: string; delta: number }> } => item !== null);
};

const getCoverageRiskTone = (coverageRate: number) => {
  if (coverageRate <= 0) {
    return {
      card: "border-red-300 bg-red-50",
      text: "text-red-800",
      subtext: "text-red-700",
      bar: "bg-red-600",
      track: "bg-red-100",
      emphasis: "bg-red-100 text-red-800",
    };
  }
  if (coverageRate < 0.85) {
    return {
      card: "border-rose-300 bg-rose-50",
      text: "text-rose-800",
      subtext: "text-rose-700",
      bar: "bg-rose-500",
      track: "bg-rose-100",
      emphasis: "bg-rose-100 text-rose-800",
    };
  }
  if (coverageRate < 0.95) {
    return {
      card: "border-amber-300 bg-amber-50",
      text: "text-amber-800",
      subtext: "text-amber-700",
      bar: "bg-amber-400",
      track: "bg-amber-100",
      emphasis: "bg-amber-100 text-amber-800",
    };
  }
  return {
    card: "border-emerald-200 bg-white",
    text: "text-slate-900",
    subtext: "text-slate-500",
    bar: "bg-emerald-500",
    track: "bg-slate-100",
    emphasis: "bg-emerald-50 text-emerald-800",
  };
};

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatThaiDate = (dateStr: string): string => {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

/**
 * Normalize project labels for matching. Employee master / CSV / fix scripts may
 * store either "PRJ-2026-001" or "PRJ-2026-001 - Head office 2026", while the
 * dashboard dropdown uses the full "project_no - project_name" form. Matching on
 * project_no (prefix before " - ") keeps both formats equivalent.
 */
const projectMatchKey = (value: string | undefined | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const separator = " - ";
  const idx = raw.indexOf(separator);
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim().toLowerCase();
};

const projectsMatch = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const keyA = projectMatchKey(a);
  const keyB = projectMatchKey(b);
  return !!keyA && !!keyB && keyA === keyB;
};

const employeeAssignedToProject = (
  empProjects: string | string[] | undefined,
  targetProject: string
): boolean => parseProjectList(empProjects).some((project) => projectsMatch(project, targetProject));

const extractProjectPosition = (
  empProjects: string | string[] | undefined,
  targetProject: string,
  defaultPosition: string
): string => {
  const projects = parseProjectList(empProjects);
  const matched = projects.find((p) => projectsMatch(p, targetProject));
  if (matched) {
    const match = matched.match(/\(([^)]+)\)$/);
    if (match) return match[1].trim();
  }
  return defaultPosition;
};

const projectListIncludes = (projects: string[], target: string): boolean =>
  projects.some((project) => projectsMatch(project, target));

const safeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPercent = (numerator: number, denominator: number): string => {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
};

const getEmployeeName = (emp: Employee): string => {
  return `${emp["ชื่อตัว"] || ""} ${emp["ชื่อสกุล"] || ""}`.trim() || String(emp.name || "-");
};

const getEmployeeTypeRaw = (emp: Employee): string => String(emp.employee_type || "").toLowerCase().trim();
const getWorkGroupRaw = (emp: Employee): string => String(emp.สถานะกลุ่มงาน || "").toLowerCase().trim();

const normalizeEmployeeType = (emp: Employee): string => {
  const employeeTypeRaw = getEmployeeTypeRaw(emp);
  const workGroupRaw = getWorkGroupRaw(emp);

  if (employeeTypeRaw.includes("indirect")) return "Staff Monthly";
  if (employeeTypeRaw.includes("teamleader")) {
    if (workGroupRaw === "staff") return "DC Daily - Staff";
    if (workGroupRaw === "worker") return "DC Daily - Worker";
    return "DC Daily";
  }
  if (employeeTypeRaw.includes("supply") || employeeTypeRaw.includes("supplydc")) return "Supply manpower";
  if (employeeTypeRaw.includes("sub")) return "Sub contractor";
  if (workGroupRaw === "staff") return "Staff Monthly";
  if (workGroupRaw.includes("supply")) return "Supply manpower";
  if (workGroupRaw.includes("sub")) return "Sub contractor";
  if (workGroupRaw.includes("worker")) return "Direct Worker";
  return "ไม่ระบุ";
};

const inferGender = (emp: Employee): string => {
  const explicit = String(emp.gender || emp.เพศ || "").trim().toLowerCase();
  if (explicit === "male" || explicit === "ชาย" || explicit === "m") return "ชาย";
  if (explicit === "female" || explicit === "หญิง" || explicit === "f") return "หญิง";

  const title = String(emp["ชื่อต้น"] || "").trim().toLowerCase();
  if (title === "นาย" || title === "mr.") return "ชาย";
  if (title === "นาง" || title === "นางสาว" || title === "mrs." || title === "ms.") return "หญิง";
  return "ไม่ระบุ";
};

const getAge = (dateOfBirth?: string): number | null => {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
};

const getTenureYears = (startDate?: string): number | null => {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return years >= 0 ? years : null;
};

const bucketAge = (age: number | null): string => {
  if (age == null) return "ไม่ระบุ";
  if (age < 25) return "ต่ำกว่า 25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
};

const bucketTenure = (tenureYears: number | null): string => {
  if (tenureYears == null) return "ไม่ระบุ";
  if (tenureYears < 1) return "ต่ำกว่า 1 ปี";
  if (tenureYears < 3) return "1-3 ปี";
  if (tenureYears < 5) return "3-5 ปี";
  return "มากกว่า 5 ปี";
};

const getTodayPresetRange = () => {
  const now = new Date();
  const today = formatDateInput(now);
  return { start: today, end: today };
};

const getYesterdayPresetRange = () => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const yesterday = formatDateInput(now);
  return { start: yesterday, end: yesterday };
};

const getMonthPresetRange = (referenceDateStr?: string) => {
  const ref = referenceDateStr ? new Date(`${referenceDateStr}T00:00:00`) : new Date();
  const base = Number.isNaN(ref.getTime()) ? new Date() : ref;
  return {
    start: formatDateInput(new Date(base.getFullYear(), base.getMonth(), 1)),
    end: formatDateInput(base),
  };
};

/**
 * Daily-wage/monthly employees are commonly paid twice a month (1-15 and
 * 16-end of month). Returns the pay-cycle window (start/end date strings)
 * that contains referenceDateStr, used to evaluate absence_rate against a
 * payroll-relevant window instead of an arbitrary/rolling report range.
 */
const getPayCycleRange = (referenceDateStr: string): { start: string; end: string; label: string } => {
  const ref = new Date(`${referenceDateStr}T00:00:00`);
  const base = Number.isNaN(ref.getTime()) ? new Date() : ref;
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  if (day <= 15) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month, 15);
    return { start: formatDateInput(start), end: formatDateInput(end), label: `${formatThaiDate(formatDateInput(start))} - ${formatThaiDate(formatDateInput(end))}` };
  }
  const start = new Date(year, month, 16);
  const end = new Date(year, month + 1, 0);
  return { start: formatDateInput(start), end: formatDateInput(end), label: `${formatThaiDate(formatDateInput(start))} - ${formatThaiDate(formatDateInput(end))}` };
};

const getTrailingStartDate = (endDateStr: string, days: number) => {
  const end = new Date(`${endDateStr}T00:00:00`);
  if (Number.isNaN(end.getTime())) return endDateStr;
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(days - 1, 0));
  return formatDateInput(start);
};

const severityRank: Record<RiskSeverity, number> = {
  normal: 0,
  watch: 1,
  risk: 2,
  high: 3,
  critical: 4,
};

const severityBadgeClass: Record<RiskSeverity, string> = {
  normal: "bg-slate-100 text-slate-700 border border-slate-200",
  watch: "bg-amber-50 text-amber-700 border border-amber-200",
  risk: "bg-orange-50 text-orange-700 border border-orange-200",
  high: "bg-rose-50 text-rose-700 border border-rose-200",
  critical: "bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200",
};

const formatShortThaiDate = (dateStr?: string): string => {
  if (!dateStr) return "-";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("th-TH", {
    month: "short",
    day: "numeric",
  });
};

/**
 * Rules sharing the same scoreGroup describe the same underlying incident
 * (e.g. ขาดต่อเนื่อง / ขาดสะสม / อัตราขาดสูง all come from the same absence
 * pattern). Collapse them into a single follow-up issue so HR isn't asked to
 * track 3 near-duplicate cases per employee for one event; the representative
 * rule (highest score in the group) is used as the case's key/label, while
 * every matched condition is still listed in the combined reason text.
 */
/**
 * absence_rate is evaluated against the current pay-cycle window rather than
 * the dashboard's selected report range. Append the cycle date range to its
 * reason text so the figure is self-explanatory wherever it's shown (chips,
 * Rule Breakdown), without requiring the user to open the methodology popup.
 */
const annotatePayCycleReason = (rules: RiskRuleResult[], payCycleLabel: string): RiskRuleResult[] =>
  rules.map((rule) =>
    rule.key === "absence_rate" ? { ...rule, reason: `${rule.reason} (รอบจ่ายค่าแรง ${payCycleLabel})` } : rule
  );

const consolidateRulesByScoreGroup = (rules: RiskRuleResult[]): RiskRuleResult[] => {
  const groups = new Map<string, RiskRuleResult[]>();
  rules.forEach((rule) => {
    const groupKey = rule.scoreGroup || rule.key;
    const list = groups.get(groupKey) || [];
    list.push(rule);
    groups.set(groupKey, list);
  });
  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return group[0];
    const representative = [...group].sort((a, b) => b.score - a.score)[0];
    return {
      ...representative,
      label: `${representative.label} (รวม ${group.length} เงื่อนไขที่เกี่ยวข้อง)`,
      reason: group.map((rule) => rule.reason).join(" · "),
    };
  });
};

/**
 * These rules are excluded from the employee follow-up queue entirely (no
 * case is created for them) and are shown only as warning signals on the
 * Dashboard / Risk Monitoring cards:
 * - wrong_project_pattern: logging attendance/project against the wrong
 *   project is typically a mistake by whoever logs it (e.g. Admin Site),
 *   not the employee's behavior.
 * - missing_attendance: unresolved/pending clock-in-out records are usually
 *   a timekeeping/device data-quality issue, not proof of employee absence.
 * - absence_rate: an aggregate rate derived from the same absence days
 *   already covered by ขาดต่อเนื่อง/ขาดสะสม; on its own it isn't a distinct
 *   legal basis for disciplinary action, so it's kept as a dashboard-only
 *   watch signal instead of generating a follow-up case.
 * - monday_friday_pattern: a behavioral pattern flag over the same absence
 *   days, not an independent violation; also kept as a dashboard-only
 *   watch signal.
 * All four still contribute to the risk score/dashboard as signals, just
 * not as employee tracking cases.
 */
const EMPLOYEE_FOLLOW_UP_EXCLUDED_ISSUE_KEYS: readonly RiskRuleKey[] = [
  "wrong_project_pattern",
  "missing_attendance",
  "absence_rate",
  "monday_friday_pattern",
];

const buildFollowUpRiskSeed = (risk: EmployeeRiskScore): FollowUpRiskSeed => ({
  employeeId: risk.employeeId,
  employeeCode: risk.employeeCode,
  employeeName: risk.fullName,
  position: risk.position || "-",
  employeeType: risk.employeeType || "-",
  projectName: risk.primaryProject || risk.projectNames[0] || "",
  projectNames: risk.projectNames,
  totalScore: risk.totalScore,
  severity: risk.severity,
  evaluatedFrom: risk.evaluatedFrom,
  evaluatedTo: risk.evaluatedTo,
  latestIncidentDate: risk.metrics.latestIncidentDate,
  rules: consolidateRulesByScoreGroup(
    risk.rules.filter((rule) => !EMPLOYEE_FOLLOW_UP_EXCLUDED_ISSUE_KEYS.includes(rule.key))
  ).map((rule) => ({
    key: rule.key,
    label: rule.label,
    reason: rule.reason,
  })),
});

const maxConsecutiveAbsence = (
  workDates: string[],
  attendanceByDate: Record<string, Record<string, AttendanceEntry>>,
  employeeId: string
): number => {
  let maxStreak = 0;
  let currentStreak = 0;
  workDates.forEach((date) => {
    if (attendanceByDate[date]?.[employeeId]?.status === "ไม่มา") {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });
  return maxStreak;
};

const evaluateRiskRules = (metrics: RiskMetrics, settings: RiskMonitoringSettings): RiskRuleResult[] =>
  evaluateConfiguredRiskRules(metrics, settings).map((rule) => ({
    ...rule,
    triggered: true,
  }));

const deriveSeverity = (
  score: number,
  rules: RiskRuleResult[],
  settings: RiskMonitoringSettings
): { severity: RiskSeverity; overrideSeverity?: RiskSeverity } => deriveSeverityFromSettings(score, rules, settings);

const MetricCard = ({
  title,
  value,
  subvalue,
  icon: Icon,
  accent,
  tooltip,
  onClick,
}: {
  title: string;
  value: string | number;
  subvalue?: string;
  icon: typeof Users;
  accent: string;
  tooltip?: React.ReactNode;
  onClick?: () => void;
}) => (
  <div
    className={`bg-white rounded-lg border border-slate-200 px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md" : ""}`}
    onClick={onClick}
    role={onClick ? "button" : undefined}
  >
    <div className="flex items-start justify-between gap-1.5 lg:gap-2">
      <div className="min-w-0">
        <div className="text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
          <span>{title}</span>
          {tooltip && <InfoTooltip content={tooltip} iconSize={11} />}
        </div>
        <div className={`mt-0.5 text-base lg:text-[22px] leading-none font-black ${accent}`}>{value}</div>
        {subvalue && <div className="mt-0.5 text-[9px] lg:text-[10px] leading-tight lg:leading-4 text-slate-500">{subvalue}</div>}
      </div>
      <div className="hidden lg:block rounded-md bg-slate-50 border border-slate-200 p-1">
        <Icon size={14} className={accent} />
      </div>
    </div>
  </div>
);

const SectionCard = ({
  title,
  subtitle,
  children,
  tooltip,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tooltip?: React.ReactNode;
  headerAction?: React.ReactNode;
}) => (
  <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-2.5 py-1.5 lg:px-3 lg:py-2 border-b border-slate-100">
      <div className="flex items-start justify-between gap-2 lg:gap-3">
        <div className="min-w-0">
          <h3 className="text-xs lg:text-[13px] font-black text-slate-900 inline-flex items-center gap-1.5">
            <span>{title}</span>
            {tooltip && <InfoTooltip content={tooltip} iconSize={13} />}
          </h3>
          {subtitle && <p className="mt-0.5 text-[10px] lg:text-[11px] leading-tight lg:leading-4 text-slate-500">{subtitle}</p>}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
    </div>
    <div className="p-2 lg:p-3">{children}</div>
  </section>
);

const DashboardModal = ({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-xs sm:text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ปิด
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
      </div>
    </div>
  );
};

const DashboardSidePanel = ({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-xs sm:text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ปิด
          </button>
        </div>
        <div className="h-[calc(100%-69px)] sm:h-[calc(100%-77px)] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
      </div>
    </div>
  );
};

const HorizontalBreakdown = ({
  items,
  total,
  accent,
  onItemClick,
  dense,
}: {
  items: Array<{ label: string; value: number }>;
  total: number;
  accent: string;
  onItemClick?: (item: { label: string; value: number }) => void;
  dense?: boolean;
}) => (
  <div className={dense ? "space-y-1" : "space-y-2"}>
    {items.map((item) => (
      <button
        key={item.label}
        type="button"
        onClick={() => onItemClick?.(item)}
        className={`block w-full text-left ${onItemClick ? `rounded-lg px-1 transition-colors hover:bg-slate-50 ${dense ? "py-0.5" : "py-1"}` : ""}`}
      >
        <div className={`flex items-center justify-between text-xs font-medium text-slate-700 ${dense ? "mb-0.5" : "mb-1"}`}>
          <span>{item.label}</span>
          <span>{item.value}</span>
        </div>
        <div className={`rounded-full bg-slate-100 overflow-hidden ${dense ? "h-2" : "h-2.5"}`}>
          <div
            className={`h-full rounded-full ${accent}`}
            style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
          />
        </div>
      </button>
    ))}
  </div>
);

const MiniTrendChart = ({
  rows,
  maxValue,
}: {
  rows: DailySummary[];
  maxValue: number;
}) => (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        มา
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-rose-400" />
        ขาด
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        ลา
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        ค้าง/ผิดโครงการ
      </span>
    </div>
    {rows.map((row) => (
      <div key={row.date} className="grid grid-cols-[88px_1fr_auto] gap-3 items-center">
        <div className="text-xs font-medium text-slate-600">{row.label}</div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
          <div className="bg-emerald-400" style={{ width: `${maxValue > 0 ? (row.present / maxValue) * 100 : 0}%` }} />
          <div className="bg-rose-400" style={{ width: `${maxValue > 0 ? (row.absent / maxValue) * 100 : 0}%` }} />
          <div className="bg-amber-400" style={{ width: `${maxValue > 0 ? (row.leave / maxValue) * 100 : 0}%` }} />
          <div className="bg-slate-400" style={{ width: `${maxValue > 0 ? ((row.notRecorded + row.wrongProject) / maxValue) * 100 : 0}%` }} />
        </div>
        <div className="text-xs font-bold text-slate-700">{row.present}</div>
      </div>
    ))}
  </div>
);

export const ManpowerDashboard = ({
  projectOptions,
  showOnlyRiskMonitoring = false,
  riskSettings = DEFAULT_RISK_MONITORING_SETTINGS,
  followUpCases = [],
  onOpenFollowUp,
  onFollowUpQueueSeedsChange,
}: {
  projectOptions: string[];
  showOnlyRiskMonitoring?: boolean;
  riskSettings?: RiskMonitoringSettings;
  followUpCases?: EmployeeFollowUpCase[];
  onOpenFollowUp?: (seed: FollowUpRiskSeed, preferredIssueKey?: RiskRuleKey) => void;
  onFollowUpQueueSeedsChange?: (seeds: FollowUpRiskSeed[]) => void;
}) => {
  const { userProfile, hasRole } = useAuth();
  const db = getFirestore();

  const canSeeAllProjects = hasRole(["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"]);
  const canSeeHrDashboard = hasRole(["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"]);
  const defaultTodayRange = getTodayPresetRange();
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(showOnlyRiskMonitoring ? "hr" : (canSeeHrDashboard ? "hr" : "project"));
  const [timePreset, setTimePreset] = useState<TimePreset>("today");
  const [startDate, setStartDate] = useState(defaultTodayRange.start);
  const [endDate, setEndDate] = useState(defaultTodayRange.end);
  const [selectedProject, setSelectedProject] = useState("");
  const [showRiskScoreGuide, setShowRiskScoreGuide] = useState(false);
  const [showPageGuide, setShowPageGuide] = useState(false);
  const [metricModal, setMetricModal] = useState<null | { key: string; title: string; subtitle?: string }>(null);
  const [sidePanel, setSidePanel] = useState<null | { key: string; title: string; subtitle?: string; selectedKey?: string }>(null);
  const [expandedTypeBreakdown, setExpandedTypeBreakdown] = useState<Set<string>>(new Set());
  const [expandedDepartmentBreakdown, setExpandedDepartmentBreakdown] = useState<Set<string>>(new Set());
  const [expandedPositionBreakdown, setExpandedPositionBreakdown] = useState<Set<string>>(new Set());
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [showLandscapeHint, setShowLandscapeHint] = useState(false);
  const [riskSeverityFilter, setRiskSeverityFilter] = useState<"all" | RiskSeverity>("all");
  const [riskProjectFilter, setRiskProjectFilter] = useState("all");
  const [riskEmployeeTypeFilter, setRiskEmployeeTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>([]);
  const [attendanceByDate, setAttendanceByDate] = useState<Record<string, Record<string, AttendanceEntry>>>({});
  const [overtimeByDate, setOvertimeByDate] = useState<Record<string, Record<string, OvertimeEntry>>>({});
  const [dayOffs, setDayOffs] = useState<Record<string, string>>({});
  const severityLabelMap = useMemo(
    () =>
      ({
        normal: getSeverityLabel("normal", riskSettings),
        watch: getSeverityLabel("watch", riskSettings),
        risk: getSeverityLabel("risk", riskSettings),
        high: getSeverityLabel("high", riskSettings),
        critical: getSeverityLabel("critical", riskSettings),
      }) as Record<RiskSeverity, string>,
    [riskSettings]
  );
  const severityHexMap = useMemo(
    () =>
      ({
        normal: getSeverityHex("normal", riskSettings),
        watch: getSeverityHex("watch", riskSettings),
        risk: getSeverityHex("risk", riskSettings),
        high: getSeverityHex("high", riskSettings),
        critical: getSeverityHex("critical", riskSettings),
      }) as Record<RiskSeverity, string>,
    [riskSettings]
  );

  const filteredProjectOptions = useMemo(() => {
    if (canSeeAllProjects) return projectOptions;
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => projectListIncludes(assignedProjects, project));
  }, [projectOptions, userProfile, canSeeAllProjects]);

  const followUpCaseCountByEmployee = useMemo(() => {
    const map: Record<string, { total: number; open: number }> = {};
    followUpCases.forEach((item) => {
      if (!map[item.employeeId]) map[item.employeeId] = { total: 0, open: 0 };
      map[item.employeeId].total += 1;
      if (isFollowUpOpenStatus(item.status)) map[item.employeeId].open += 1;
    });
    return map;
  }, [followUpCases]);

  useEffect(() => {
    if (!canSeeHrDashboard) setDashboardMode("project");
  }, [canSeeHrDashboard]);

  const applyTimePreset = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset === "today") {
      const range = getTodayPresetRange();
      setStartDate(range.start);
      setEndDate(range.end);
    } else if (preset === "yesterday") {
      const range = getYesterdayPresetRange();
      setStartDate(range.start);
      setEndDate(range.end);
    } else if (preset === "month") {
      const range = getMonthPresetRange();
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // แนะนำให้หมุนแนวนอนเมื่อเปิด Dashboard บนมือถือแนวตั้ง (แสดงครั้งเดียวต่อ session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isPortraitMobile = window.matchMedia("(max-width: 1023px) and (orientation: portrait)").matches;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("dashLandscapeHintDismissed") === "1";
    } catch {
      dismissed = false;
    }
    if (isPortraitMobile && !dismissed) setShowLandscapeHint(true);
  }, []);

  const dismissLandscapeHint = () => {
    setShowLandscapeHint(false);
    try {
      sessionStorage.setItem("dashLandscapeHintDismissed", "1");
    } catch {
      /* ignore */
    }
  };

  // ส่งออก Dashboard เป็นรูปภาพ โดยบังคับ render ด้วย viewport กว้างแบบ desktop
  const handleExportDashboard = async () => {
    const node = dashboardRef.current;
    if (!node || exporting) return;
    setExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const canvas = await html2canvas(node, {
        backgroundColor: "#f8fafc",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1440,
        windowHeight: Math.max(node.scrollHeight, 900),
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          // html2canvas ตัดตัวอักษรไทยด้านบนเมื่อ line-height แคบ (leading-none) — คลายให้กว้างขึ้นเฉพาะตอน export
          const style = clonedDoc.createElement("style");
          style.textContent = `
            [data-export-root] * { line-height: 1.5 !important; }
            [data-export-root] .leading-none,
            [data-export-root] .leading-tight,
            [data-export-root] .leading-4 { line-height: 1.5 !important; }
          `;
          clonedDoc.head.appendChild(style);
        },
      });
      const modeLabel = dashboardMode === "project" ? selectedProjectLabel : "HR";
      const safeLabel = String(modeLabel).replace(/[^\w\u0E00-\u0E7F]+/g, "_").slice(0, 40);
      const dateTag = startDate === endDate ? startDate : `${startDate}_${endDate}`;
      const link = document.createElement("a");
      link.download = `dashboard-${safeLabel}-${dateTag}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("export dashboard failed", error);
      window.alert("ส่งออกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (filteredProjectOptions.length === 0) return;
    if (!selectedProject || !filteredProjectOptions.includes(selectedProject)) {
      setSelectedProject(filteredProjectOptions[0]);
    }
  }, [filteredProjectOptions, selectedProject]);

  const hasAssignedProjects = useMemo(() => {
    if (canSeeAllProjects) return true;
    return filteredProjectOptions.length > 0;
  }, [canSeeAllProjects, filteredProjectOptions]);

  useEffect(() => {
    setLoading(true);
    const employeeRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    const projectRef = collection(db, "CMG-HR-Database", "root", "projects");
    const attendanceRef = collection(db, "CMG-HR-Database", "root", "attendance");
    const overtimeRef = collection(db, "CMG-HR-Database", "root", "overtime");
    const dayOffRef = collection(db, "CMG-HR-Database", "root", "day_offs");

    const unsubscribeEmployees = onSnapshot(
      employeeRef,
      (snapshot) => {
        let list = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Employee))
          .filter((emp) => emp["สถานะพนักงาน"] === "ทำงาน");

        if (!canSeeAllProjects) {
          const assignedProjects = userProfile?.assignedProjects || [];
          list = list.filter((emp) =>
            parseProjectList(emp.สถานะโครงการ).some((project) => projectListIncludes(assignedProjects, project))
          );
        }

        setEmployees(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to employees:", error);
        setLoading(false);
      }
    );

    const unsubscribeAttendance = onSnapshot(attendanceRef, (snapshot) => {
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
    });

    const unsubscribeProjects = onSnapshot(projectRef, (snapshot) => {
      const next = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProjectRecord));
      setProjectRecords(next);
    });

    const unsubscribeOvertime = onSnapshot(overtimeRef, (snapshot) => {
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

    const unsubscribeDayOffs = onSnapshot(dayOffRef, (snapshot) => {
      const next: Record<string, string> = {};
      snapshot.docs.forEach((docSnap) => {
        next[docSnap.id] = String(docSnap.data().name || "");
      });
      setDayOffs(next);
    });

    return () => {
      unsubscribeEmployees();
      unsubscribeProjects();
      unsubscribeAttendance();
      unsubscribeOvertime();
      unsubscribeDayOffs();
    };
  }, [db, canSeeAllProjects, userProfile]);

  const dateRange = useMemo(() => enumerateDates(startDate, endDate), [startDate, endDate]);
  const workDates = useMemo(() => dateRange.filter((date) => !dayOffs[date]), [dateRange, dayOffs]);
  // มองเป็นมุมมองวันเดียวเมื่อเลือก preset วันนี้/เมื่อวาน หรือ custom ที่วันเริ่ม = วันสิ้นสุด
  const isSingleDayView = timePreset === "today" || timePreset === "yesterday" || (timePreset === "custom" && startDate === endDate);
  const followUpStartDate = useMemo(
    () => (isSingleDayView ? getTrailingStartDate(endDate, 7) : startDate),
    [isSingleDayView, startDate, endDate]
  );
  const followUpDateRange = useMemo(() => enumerateDates(followUpStartDate, endDate), [followUpStartDate, endDate]);
  const followUpWorkDates = useMemo(() => followUpDateRange.filter((date) => !dayOffs[date]), [followUpDateRange, dayOffs]);
  const coverageTrendStartDate = useMemo(
    () => (isSingleDayView ? getMonthPresetRange(endDate).start : startDate),
    [isSingleDayView, startDate, endDate]
  );
  const coverageTrendDateRange = useMemo(() => enumerateDates(coverageTrendStartDate, endDate), [coverageTrendStartDate, endDate]);
  const coverageTrendWorkDates = useMemo(() => coverageTrendDateRange.filter((date) => !dayOffs[date]), [coverageTrendDateRange, dayOffs]);
  const todayReferenceDate = endDate;
  // อัตราขาดงานสูงใช้รอบจ่ายค่าแรง (1-15 / 16-สิ้นเดือน) เสมอ ไม่ผูกกับช่วงวันที่ที่เลือกดูรายงาน
  // เพื่อสะท้อนความเสี่ยงต่อรอบจ่ายค่าแรงจริง แยกต่างหากจากมุมมองรายวัน/รายเดือน/เมื่อวานของ dashboard
  const payCycleRange = useMemo(() => getPayCycleRange(todayReferenceDate), [todayReferenceDate]);
  const payCycleDateRange = useMemo(
    () => enumerateDates(payCycleRange.start, payCycleRange.end < todayReferenceDate ? payCycleRange.end : todayReferenceDate),
    [payCycleRange, todayReferenceDate]
  );
  const payCycleWorkDates = useMemo(() => payCycleDateRange.filter((date) => !dayOffs[date]), [payCycleDateRange, dayOffs]);
  const PAY_CYCLE_MIN_WORKDAYS = 3;

  const employeeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((emp) => {
      const key = normalizeEmployeeType(emp);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [employees]);

  const hrData = useMemo(() => {
    const scopeEmployees = employees;
    const genderCounts: Record<string, number> = {};
    const ageCounts: Record<string, number> = {};
    const tenureCounts: Record<string, number> = {};
    const projectCounts: Record<string, number> = {};
    const riskMetricsByEmployee: Record<string, RiskMetrics> = {};
    const followUpRiskMetricsByEmployee: Record<string, RiskMetrics> = {};
    const dailyTrend: DailySummary[] = [];
    const lateDataAvailable = workDates.some((date) =>
      Object.values(attendanceByDate[date] || {}).some(
        (entry) => !!entry.checkInTime || entry.isLate !== undefined || entry.lateMinutes !== undefined
      )
    );

    scopeEmployees.forEach((emp) => {
      const gender = inferGender(emp);
      const age = bucketAge(getAge(emp.date_of_birth));
      const tenure = bucketTenure(getTenureYears(emp.start_date));
      genderCounts[gender] = (genderCounts[gender] || 0) + 1;
      ageCounts[age] = (ageCounts[age] || 0) + 1;
      tenureCounts[tenure] = (tenureCounts[tenure] || 0) + 1;
      parseProjectList(emp.สถานะโครงการ).forEach((project) => {
        projectCounts[project] = (projectCounts[project] || 0) + 1;
      });
      riskMetricsByEmployee[emp.id] = {
        scheduledDays: workDates.length,
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        notRecordedDays: 0,
        wrongProjectDays: 0,
        dayOffDays: 0,
        lateDays: 0,
        otHours: 0,
        consecutiveAbsentDays: 0,
        mondayAbsenceCount: 0,
        fridayAbsenceCount: 0,
        mondayFridayAbsenceCount: 0,
        absenceRate: 0,
        leaveRate: 0,
        notRecordedRate: 0,
        payCycleAbsentDays: 0,
        payCycleWorkDays: payCycleWorkDates.length,
        payCycleAbsenceRate: 0,
      };
      followUpRiskMetricsByEmployee[emp.id] = {
        scheduledDays: followUpWorkDates.length,
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        notRecordedDays: 0,
        wrongProjectDays: 0,
        dayOffDays: 0,
        lateDays: 0,
        otHours: 0,
        consecutiveAbsentDays: 0,
        mondayAbsenceCount: 0,
        fridayAbsenceCount: 0,
        mondayFridayAbsenceCount: 0,
        absenceRate: 0,
        leaveRate: 0,
        notRecordedRate: 0,
        payCycleAbsentDays: 0,
        payCycleWorkDays: payCycleWorkDates.length,
        payCycleAbsenceRate: 0,
      };
    });

    let totalSlots = 0;
    let present = 0;
    let absent = 0;
    let leave = 0;
    let notRecorded = 0;
    let wrongProject = 0;
    let late = 0;
    let totalOtHours = 0;
    const otEmployees = new Set<string>();
    const todayAbsentLeaveRows: Array<{
      employeeId: string;
      employeeCode: string;
      fullName: string;
      position: string;
      employeeType: string;
      status: "ไม่มา" | "ลา";
      projectNames: string[];
    }> = [];

    const projectRiskMap: Record<string, { headcount: number; absent: number; leave: number; notRecorded: number; wrongProject: number; otHours: number; dayOff: number }> = {};
    const projectDailyStats: Record<string, Record<string, DailySummary>> = {};
    const followUpProjectRiskMap: Record<string, { headcount: number; absent: number; leave: number; notRecorded: number; wrongProject: number; otHours: number; dayOff: number }> = {};
    const followUpProjectDailyStats: Record<string, Record<string, DailySummary>> = {};
    Object.entries(projectCounts).forEach(([project, headcount]) => {
      projectRiskMap[project] = { headcount, absent: 0, leave: 0, notRecorded: 0, wrongProject: 0, otHours: 0, dayOff: 0 };
      projectDailyStats[project] = {};
      followUpProjectRiskMap[project] = { headcount, absent: 0, leave: 0, notRecorded: 0, wrongProject: 0, otHours: 0, dayOff: 0 };
      followUpProjectDailyStats[project] = {};
    });

    workDates.forEach((date) => {
      let dayPresent = 0;
      let dayAbsent = 0;
      let dayLeave = 0;
      let dayNotRecorded = 0;
      let dayWrongProject = 0;
      let dayOtHours = 0;

      scopeEmployees.forEach((emp) => {
        const assignedProjects = parseProjectList(emp.สถานะโครงการ);
        const attendance = attendanceByDate[date]?.[emp.id];
        const overtime = overtimeByDate[date]?.[emp.id];
        const otHours = safeNumber(overtime?.hours);
        const metrics = riskMetricsByEmployee[emp.id];

        assignedProjects.forEach((project) => {
          if (!projectDailyStats[project]) projectDailyStats[project] = {};
          if (!projectDailyStats[project][date]) {
            projectDailyStats[project][date] = {
              date,
              label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
              present: 0,
              absent: 0,
              leave: 0,
              notRecorded: 0,
              wrongProject: 0,
              otHours: 0,
            };
          }
        });

        totalSlots++;

        if (attendance?.status === "มา") {
          present++;
          dayPresent++;
          metrics.presentDays++;
          assignedProjects.forEach((project) => {
            if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].present++;
          });
          if (attendance.project && assignedProjects.length > 0 && !projectListIncludes(assignedProjects, attendance.project)) {
            wrongProject++;
            dayWrongProject++;
            metrics.wrongProjectDays++;
            metrics.latestIncidentDate = date;
            assignedProjects.forEach((project) => {
              if (projectRiskMap[project]) projectRiskMap[project].wrongProject++;
              if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].wrongProject++;
            });
          }
          const lateFlag = !!attendance.isLate || safeNumber(attendance.lateMinutes) > 0;
          if (lateFlag) {
            late++;
            metrics.lateDays++;
            metrics.latestIncidentDate = date;
          }
        } else if (attendance?.status === "ไม่มา") {
          absent++;
          dayAbsent++;
          metrics.absentDays++;
          metrics.latestIncidentDate = date;
          if (date === todayReferenceDate) {
            todayAbsentLeaveRows.push({
              employeeId: emp.id,
              employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
              fullName: getEmployeeName(emp),
              position: String(emp["ตำแหน่ง"] || "-"),
              employeeType: normalizeEmployeeType(emp),
              status: "ไม่มา",
              projectNames: assignedProjects,
            });
          }
          assignedProjects.forEach((project) => {
            if (projectRiskMap[project]) projectRiskMap[project].absent++;
            if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].absent++;
          });
        } else if (attendance?.status === "ลา") {
          leave++;
          dayLeave++;
          metrics.leaveDays++;
          metrics.latestIncidentDate = date;
          if (date === todayReferenceDate) {
            todayAbsentLeaveRows.push({
              employeeId: emp.id,
              employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
              fullName: getEmployeeName(emp),
              position: String(emp["ตำแหน่ง"] || "-"),
              employeeType: normalizeEmployeeType(emp),
              status: "ลา",
              projectNames: assignedProjects,
            });
          }
          assignedProjects.forEach((project) => {
            if (projectRiskMap[project]) projectRiskMap[project].leave++;
            if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].leave++;
          });
        } else if (attendance?.status === "H") {
          // วันหยุดพนักงาน (รายบุคคล) — ไม่นับขาด ไม่นับค้างลงเวลา และตัดออกจากตัวหารของอัตราต่างๆ
          metrics.dayOffDays++;
          assignedProjects.forEach((project) => {
            if (projectRiskMap[project]) projectRiskMap[project].dayOff++;
          });
        } else {
          notRecorded++;
          dayNotRecorded++;
          metrics.notRecordedDays++;
          metrics.latestIncidentDate = date;
          assignedProjects.forEach((project) => {
            if (projectRiskMap[project]) projectRiskMap[project].notRecorded++;
            if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].notRecorded++;
          });
        }

        if (otHours > 0) {
          totalOtHours += otHours;
          dayOtHours += otHours;
          metrics.otHours += otHours;
          otEmployees.add(emp.id);
          assignedProjects.forEach((project) => {
            if (projectRiskMap[project]) projectRiskMap[project].otHours += otHours;
            if (projectDailyStats[project]?.[date]) projectDailyStats[project][date].otHours += otHours;
          });
        }
      });

      dailyTrend.push({
        date,
        label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
        present: dayPresent,
        absent: dayAbsent,
        leave: dayLeave,
        notRecorded: dayNotRecorded,
        wrongProject: dayWrongProject,
        otHours: dayOtHours,
      });
    });

    followUpWorkDates.forEach((date) => {
      scopeEmployees.forEach((emp) => {
        const assignedProjects = parseProjectList(emp.สถานะโครงการ);
        const attendance = attendanceByDate[date]?.[emp.id];
        const overtime = overtimeByDate[date]?.[emp.id];
        const otHours = safeNumber(overtime?.hours);
        const metrics = followUpRiskMetricsByEmployee[emp.id];

        assignedProjects.forEach((project) => {
          if (!followUpProjectDailyStats[project]) followUpProjectDailyStats[project] = {};
          if (!followUpProjectDailyStats[project][date]) {
            followUpProjectDailyStats[project][date] = {
              date,
              label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
              present: 0,
              absent: 0,
              leave: 0,
              notRecorded: 0,
              wrongProject: 0,
              otHours: 0,
            };
          }
        });

        if (attendance?.status === "มา") {
          metrics.presentDays++;
          assignedProjects.forEach((project) => {
            if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].present++;
          });
          if (attendance.project && assignedProjects.length > 0 && !projectListIncludes(assignedProjects, attendance.project)) {
            metrics.wrongProjectDays++;
            metrics.latestIncidentDate = date;
            assignedProjects.forEach((project) => {
              if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].wrongProject++;
              if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].wrongProject++;
            });
          }
          const lateFlag = !!attendance.isLate || safeNumber(attendance.lateMinutes) > 0;
          if (lateFlag) {
            metrics.lateDays++;
            metrics.latestIncidentDate = date;
          }
        } else if (attendance?.status === "ไม่มา") {
          metrics.absentDays++;
          metrics.latestIncidentDate = date;
          assignedProjects.forEach((project) => {
            if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].absent++;
            if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].absent++;
          });
        } else if (attendance?.status === "ลา") {
          metrics.leaveDays++;
          metrics.latestIncidentDate = date;
          assignedProjects.forEach((project) => {
            if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].leave++;
            if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].leave++;
          });
        } else if (attendance?.status === "H") {
          // วันหยุดพนักงาน (รายบุคคล) — ไม่นับขาด ไม่นับค้างลงเวลา และตัดออกจากตัวหารของอัตราต่างๆ
          metrics.dayOffDays++;
          assignedProjects.forEach((project) => {
            if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].dayOff++;
          });
        } else {
          metrics.notRecordedDays++;
          metrics.latestIncidentDate = date;
          assignedProjects.forEach((project) => {
            if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].notRecorded++;
            if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].notRecorded++;
          });
        }

        if (otHours > 0) {
          metrics.otHours += otHours;
          assignedProjects.forEach((project) => {
            if (followUpProjectRiskMap[project]) followUpProjectRiskMap[project].otHours += otHours;
            if (followUpProjectDailyStats[project]?.[date]) followUpProjectDailyStats[project][date].otHours += otHours;
          });
        }
      });
    });

    scopeEmployees.forEach((emp) => {
      const metrics = riskMetricsByEmployee[emp.id];
      metrics.consecutiveAbsentDays = maxConsecutiveAbsence(workDates, attendanceByDate, emp.id);
      workDates.forEach((date) => {
        if (attendanceByDate[date]?.[emp.id]?.status === "ไม่มา") {
          const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
          if (dayOfWeek === 1) metrics.mondayAbsenceCount += 1;
          if (dayOfWeek === 5) metrics.fridayAbsenceCount += 1;
        }
      });
      metrics.mondayFridayAbsenceCount = metrics.mondayAbsenceCount + metrics.fridayAbsenceCount;
      // หักวันหยุดพนักงาน (H) ออกจากตัวหาร เพื่อไม่ให้อัตราขาด/ค้างลงเวลาถูกเจือจางด้วยวันที่ไม่ต้องมาทำงานอยู่แล้ว
      metrics.scheduledDays = Math.max(workDates.length - metrics.dayOffDays, 0);
      metrics.absenceRate = metrics.scheduledDays > 0 ? metrics.absentDays / metrics.scheduledDays : 0;
      metrics.leaveRate = metrics.scheduledDays > 0 ? metrics.leaveDays / metrics.scheduledDays : 0;
      metrics.notRecordedRate = metrics.scheduledDays > 0 ? metrics.notRecordedDays / metrics.scheduledDays : 0;
    });

    scopeEmployees.forEach((emp) => {
      const metrics = followUpRiskMetricsByEmployee[emp.id];
      metrics.consecutiveAbsentDays = maxConsecutiveAbsence(followUpWorkDates, attendanceByDate, emp.id);
      followUpWorkDates.forEach((date) => {
        if (attendanceByDate[date]?.[emp.id]?.status === "ไม่มา") {
          const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
          if (dayOfWeek === 1) metrics.mondayAbsenceCount += 1;
          if (dayOfWeek === 5) metrics.fridayAbsenceCount += 1;
        }
      });
      metrics.mondayFridayAbsenceCount = metrics.mondayAbsenceCount + metrics.fridayAbsenceCount;
      // หักวันหยุดพนักงาน (H) ออกจากตัวหาร เพื่อไม่ให้อัตราขาด/ค้างลงเวลาถูกเจือจางด้วยวันที่ไม่ต้องมาทำงานอยู่แล้ว
      metrics.scheduledDays = Math.max(followUpWorkDates.length - metrics.dayOffDays, 0);
      metrics.absenceRate = metrics.scheduledDays > 0 ? metrics.absentDays / metrics.scheduledDays : 0;
      metrics.leaveRate = metrics.scheduledDays > 0 ? metrics.leaveDays / metrics.scheduledDays : 0;
      metrics.notRecordedRate = metrics.scheduledDays > 0 ? metrics.notRecordedDays / metrics.scheduledDays : 0;
    });

    // อัตราขาดงานสูงใช้รอบจ่ายค่าแรงปัจจุบันเสมอ (ไม่ผูกกับ workDates/followUpWorkDates ของมุมมองที่เลือก)
    // ต้องมีวันทำงานผ่านไปแล้วอย่างน้อย PAY_CYCLE_MIN_WORKDAYS วันในรอบ เพื่อลดสัญญาณรบกวนช่วงต้นรอบ
    scopeEmployees.forEach((emp) => {
      const payCycleAbsentDays = payCycleWorkDates.reduce(
        (count, date) => (attendanceByDate[date]?.[emp.id]?.status === "ไม่มา" ? count + 1 : count),
        0
      );
      // วันที่เป็น "H" (วันหยุดพนักงาน) ในรอบจ่ายค่าแรง ให้ตัดออกจากตัวหารด้วยเช่นกัน
      const payCycleDayOffDays = payCycleWorkDates.reduce(
        (count, date) => (attendanceByDate[date]?.[emp.id]?.status === "H" ? count + 1 : count),
        0
      );
      const payCycleEffectiveWorkDays = Math.max(payCycleWorkDates.length - payCycleDayOffDays, 0);
      const payCycleAbsenceRate =
        payCycleWorkDates.length >= PAY_CYCLE_MIN_WORKDAYS && payCycleEffectiveWorkDays > 0
          ? payCycleAbsentDays / payCycleEffectiveWorkDays
          : 0;
      if (riskMetricsByEmployee[emp.id]) {
        riskMetricsByEmployee[emp.id].payCycleAbsentDays = payCycleAbsentDays;
        riskMetricsByEmployee[emp.id].payCycleWorkDays = payCycleWorkDates.length;
        riskMetricsByEmployee[emp.id].payCycleAbsenceRate = payCycleAbsenceRate;
      }
      if (followUpRiskMetricsByEmployee[emp.id]) {
        followUpRiskMetricsByEmployee[emp.id].payCycleAbsentDays = payCycleAbsentDays;
        followUpRiskMetricsByEmployee[emp.id].payCycleWorkDays = payCycleWorkDates.length;
        followUpRiskMetricsByEmployee[emp.id].payCycleAbsenceRate = payCycleAbsenceRate;
      }
    });

    const evaluatedAt = new Date().toISOString();
    const allRiskRows: EmployeeRiskScore[] = scopeEmployees
      .map((emp) => {
        const metrics = followUpRiskMetricsByEmployee[emp.id];
        const rules = annotatePayCycleReason(evaluateRiskRules(metrics, riskSettings), payCycleRange.label);
        const totalScore = computeRiskTotalScore(rules);
        const severityInfo = deriveSeverity(totalScore, rules, riskSettings);
        return {
          employeeId: emp.id,
          employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
          fullName: getEmployeeName(emp),
          projectNames: parseProjectList(emp.สถานะโครงการ),
          primaryProject: parseProjectList(emp.สถานะโครงการ)[0],
          position: String(emp["ตำแหน่ง"] || "-"),
          employeeType: normalizeEmployeeType(emp),
          metrics,
          rules,
          totalScore,
          severity: severityInfo.severity,
          overrideSeverity: severityInfo.overrideSeverity,
          topReasons: rules.map((rule) => rule.reason).slice(0, 3),
          recommendedAction: getSeverityGuidance(severityInfo.severity, riskSettings),
          evaluatedFrom: followUpStartDate,
          evaluatedTo: endDate,
          evaluatedAt,
        };
      });

    const employeeAttendanceRows: EmployeeAttendanceSummaryRow[] = scopeEmployees.map((emp) => {
      const metrics = riskMetricsByEmployee[emp.id];
      const rules = annotatePayCycleReason(evaluateRiskRules(metrics, riskSettings), payCycleRange.label);
      const totalScore = computeRiskTotalScore(rules);
      const severityInfo = deriveSeverity(totalScore, rules, riskSettings);
      return {
        employeeId: emp.id,
        employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
        fullName: getEmployeeName(emp),
        projectNames: parseProjectList(emp.สถานะโครงการ),
        position: String(emp["ตำแหน่ง"] || "-"),
        employeeType: normalizeEmployeeType(emp),
        metrics,
        severity: severityInfo.severity,
        totalScore,
        topReasons: rules.map((rule) => rule.reason).slice(0, 3),
        recommendedAction: getSeverityGuidance(severityInfo.severity, riskSettings),
      };
    });

    const riskEmployees: EmployeeRiskScore[] = allRiskRows
      .filter((risk) => risk.rules.length > 0)
      .sort((a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.totalScore - a.totalScore ||
        b.metrics.consecutiveAbsentDays - a.metrics.consecutiveAbsentDays ||
        String(b.metrics.latestIncidentDate || "").localeCompare(String(a.metrics.latestIncidentDate || "")) ||
        b.metrics.absentDays - a.metrics.absentDays ||
        b.metrics.notRecordedDays - a.metrics.notRecordedDays ||
        b.metrics.wrongProjectDays - a.metrics.wrongProjectDays
      );

    const riskEmployeesPreview = riskEmployees.slice(0, 10);

    const riskyProjects: ProjectRiskItem[] = Object.entries(projectRiskMap)
      .map(([project, stats]) => {
        const followUpStats = followUpProjectRiskMap[project] || stats;
        // หักวัน "H" (วันหยุดพนักงานรายบุคคล) สะสมของทุกคนในโครงการออกจากตัวหาร
        const slots = Math.max(followUpStats.headcount * Math.max(followUpWorkDates.length, 1) - followUpStats.dayOff, 0);
        const absenceRate = slots > 0 ? followUpStats.absent / slots : 0;
        const leaveRate = slots > 0 ? followUpStats.leave / slots : 0;
        const missingRate = slots > 0 ? followUpStats.notRecorded / slots : 0;
        const absencePoints = Math.round(absenceRate * 100);
        const missingPoints = Math.round(missingRate * 100);
        const leavePoints = Math.round(leaveRate * 50);
        const otPoints = Math.min(Math.round(followUpStats.otHours / 4), 20);
        const totalScore = Math.min(
          100,
          absencePoints + missingPoints + leavePoints + otPoints
        );
        const severityInfo = deriveSeverity(totalScore, [], riskSettings);
        const drivers = [
          { label: "ขาด", points: absencePoints, detail: `${Math.round(absenceRate * 100)}% | ${followUpStats.absent} employee-days` },
          { label: "ค้างลงเวลา", points: missingPoints, detail: `${Math.round(missingRate * 100)}% | ${followUpStats.notRecorded} employee-days` },
          { label: "ลา", points: leavePoints, detail: `${Math.round(leaveRate * 100)}% | ${followUpStats.leave} employee-days` },
          { label: "OT", points: otPoints, detail: `${followUpStats.otHours.toFixed(1)} ชม.` },
        ]
          .sort((a, b) => b.points - a.points);
        const trend = followUpWorkDates.map((date) => {
          const day = followUpProjectDailyStats[project]?.[date];
          return day || {
            date,
            label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
            present: 0,
            absent: 0,
            leave: 0,
            notRecorded: 0,
            wrongProject: 0,
            otHours: 0,
          };
        });
        const topContributors = allRiskRows
          .filter((risk) => risk.projectNames.includes(project))
          .map((risk) => {
            const flags: string[] = [];
            if (risk.metrics.absentDays > 0) flags.push(`ขาด ${risk.metrics.absentDays}`);
            if (risk.metrics.notRecordedDays > 0) flags.push(`ค้างลง ${risk.metrics.notRecordedDays}`);
            if (risk.metrics.leaveDays > 0) flags.push(`ลา ${risk.metrics.leaveDays}`);
            if (risk.metrics.wrongProjectDays > 0) flags.push(`ผิดโครงการ ${risk.metrics.wrongProjectDays}`);
            if (risk.metrics.otHours > 0) flags.push(`OT ${risk.metrics.otHours.toFixed(1)} ชม.`);
            const contributionScore =
              risk.metrics.absentDays * 5 +
              risk.metrics.notRecordedDays * 4 +
              risk.metrics.leaveDays * 2 +
              risk.metrics.wrongProjectDays * 3 +
              Math.round(risk.metrics.otHours);
            return {
              employeeId: risk.employeeId,
              employeeCode: risk.employeeCode,
              fullName: risk.fullName,
              position: risk.position || "-",
              employeeType: risk.employeeType || "-",
              contributionScore,
              flags,
            };
          })
          .filter((row) => row.flags.length > 0)
          .sort((a, b) => b.contributionScore - a.contributionScore)
          .slice(0, 5);
        const primaryDriver = drivers[0]?.label;
        const recommendedAction =
          primaryDriver === "ขาด"
            ? "เร่งตรวจสาเหตุการขาดและวางแผนทดแทนกำลังคนทันที"
            : primaryDriver === "ค้างลงเวลา"
              ? "ไล่ปิด attendance ที่ค้างก่อน เพื่อแยกปัญหาคนขาดจริงออกจากข้อมูลไม่ครบ"
              : primaryDriver === "ลา"
                ? "ตรวจรูปแบบการลาและวางแผน coverage สำรองล่วงหน้า"
                : primaryDriver === "OT"
                  ? "ทบทวนภาระงานและคนที่แบก OT ต่อเนื่องเพื่อลด dependency"
                  : "ติดตามร่วมกับหัวหน้างานและตรวจข้อมูลรายวันต่อเนื่อง";
        return {
          project,
          headcount: followUpStats.headcount,
          absent: followUpStats.absent,
          leave: followUpStats.leave,
          notRecorded: followUpStats.notRecorded,
          absenceRate,
          leaveRate,
          missingRate,
          otHours: followUpStats.otHours,
          totalScore,
          severity: severityInfo.severity,
          drivers,
          trend,
          topContributors,
          recommendedAction,
        };
      })
      .filter((row) => row.headcount > 0 && (row.absenceRate > 0 || row.leaveRate > 0 || row.missingRate > 0 || row.otHours > 0))
      .sort((a, b) => (b.absenceRate + b.missingRate) - (a.absenceRate + a.missingRate) || b.otHours - a.otHours);

    return {
      genderCounts,
      ageCounts,
      tenureCounts,
      projectCounts,
      dailyTrend,
      totalSlots,
      present,
      absent,
      leave,
      notRecorded,
      wrongProject,
      late,
      totalOtHours,
      otEmployees: otEmployees.size,
      riskEmployees,
      riskEmployeesPreview,
      employeeAttendanceRows,
      riskyProjects,
      lateDataAvailable,
      todayAbsentLeaveRows: todayAbsentLeaveRows.sort((a, b) => (a.status === b.status ? a.fullName.localeCompare(b.fullName, "th") : a.status === "ไม่มา" ? -1 : 1)),
    };
  }, [employees, workDates, followUpWorkDates, payCycleWorkDates, attendanceByDate, overtimeByDate, followUpStartDate, endDate, todayReferenceDate]);

  useEffect(() => {
    if (!onFollowUpQueueSeedsChange) return;
    onFollowUpQueueSeedsChange(hrData.riskEmployees.map((risk) => buildFollowUpRiskSeed(risk)));
  }, [hrData.riskEmployees, onFollowUpQueueSeedsChange]);

  const projectData = useMemo(() => {
    const scopedEmployees = selectedProject
      ? employees.filter((emp) => employeeAssignedToProject(emp.สถานะโครงการ, selectedProject))
      : [];
    const selectedProjectRecord =
      projectRecords.find((project) => formatProjectOption(project) === selectedProject) ||
      projectRecords.find((project) => projectsMatch(String(project.project_no || ""), selectedProject));
    const requiredManpower = Math.max(safeNumber(selectedProjectRecord?.required_manpower), 0);
    const requiredRolePlanBaseline = parseStructuredRolePlanBaseline(
      selectedProjectRecord?.required_role_plan_baseline,
      selectedProjectRecord?.required_role_plan
    );
    const requiredRolePlanAdjustments = parseStructuredRolePlanAdjustments(selectedProjectRecord?.required_role_plan_adjustments);
    const rolePlanKeys = new Set<string>([
      ...Object.keys(requiredRolePlanBaseline),
      ...requiredRolePlanAdjustments.flatMap((item) => item.rows.map((row) => row.key)),
    ]);
    const hasRequiredRolePlan = rolePlanKeys.size > 0;
    const hasRequiredManpower = requiredManpower > 0;

    const breakdownByType: Record<string, BreakdownRow> = {};
    const breakdownByPosition: Record<string, BreakdownRow> = {};
    const breakdownByDepartment: Record<string, BreakdownRow> = {};
    const projectGenderCounts: Record<string, number> = {};
    const exceptionMap: Record<string, ProjectExceptionRow> = {};
    const dailyTrend: DailySummary[] = [];
    const coverageTrend: CoverageTrendRow[] = [];
    const effectiveRolePlanByDate: Record<string, Record<string, { label: string; required: number }>> = {};

    const getRequiredForDate = (date: string) => {
      const effectiveRolePlanForDay = Array.from(rolePlanKeys).reduce<Record<string, { label: string; required: number }>>((acc, key) => {
        const baseline = requiredRolePlanBaseline[key];
        if (baseline) acc[key] = { ...baseline };
        return acc;
      }, {});
      requiredRolePlanAdjustments.forEach((adjustment) => {
        if (date < adjustment.startDate || date > adjustment.endDate) return;
        adjustment.rows.forEach((row) => {
          const current = effectiveRolePlanForDay[row.key] || { label: row.label, required: 0 };
          const nextRequired = Math.max(current.required + row.delta, 0);
          effectiveRolePlanForDay[row.key] = {
            label: current.label || row.label,
            required: nextRequired,
          };
        });
      });
      effectiveRolePlanByDate[date] = effectiveRolePlanForDay;
      const requiredForDayFromRolePlan = Object.values(effectiveRolePlanForDay).reduce((sum, row) => sum + row.required, 0);
      return hasRequiredManpower
        ? requiredManpower
        : hasRequiredRolePlan
          ? requiredForDayFromRolePlan
          : scopedEmployees.length;
    };

    const ensureRow = (bucket: Record<string, BreakdownRow>, label: string): BreakdownRow => {
      if (!bucket[label]) {
        bucket[label] = {
          key: label,
          label,
          employees: 0,
          present: 0,
          late: 0,
          absent: 0,
          leave: 0,
          notRecorded: 0,
          wrongProject: 0,
          otHours: 0,
          laborGroupStats: {},
        };
      }
      return bucket[label];
    };

    const ensureLaborGroup = (typeRow: BreakdownRow, groupName: string): LaborGroupStats => {
      if (!typeRow.laborGroupStats[groupName]) {
        typeRow.laborGroupStats[groupName] = { employees: 0, present: 0, late: 0, absent: 0, leave: 0, notRecorded: 0, wrongProject: 0, otHours: 0 };
      }
      return typeRow.laborGroupStats[groupName];
    };

    const LABOR_GROUP_TYPES = new Set(["Sub contractor", "Supply manpower", "DC Daily - Worker", "DC Daily"]);

    scopedEmployees.forEach((emp) => {
      const empType = normalizeEmployeeType(emp);
      const typeRow = ensureRow(breakdownByType, empType);
      if (LABOR_GROUP_TYPES.has(empType)) {
        const group = String(emp["ชื่อชุด"] || "").trim();
        if (group) ensureLaborGroup(typeRow, group).employees++;
      }
      const positionStr = selectedProject
        ? extractProjectPosition(emp.สถานะโครงการ, selectedProject, String(emp["ตำแหน่ง"] || "ไม่ระบุ"))
        : String(emp["ตำแหน่ง"] || "ไม่ระบุ");
      const positionRow = ensureRow(breakdownByPosition, positionStr || "ไม่ระบุ");
      const deptStr = String(emp["แผนก"] || "ไม่ระบุ");
      const deptRow = ensureRow(breakdownByDepartment, deptStr);
      typeRow.employees++;
      positionRow.employees++;
      deptRow.employees++;
      ensureLaborGroup(deptRow, positionStr || "ไม่ระบุ").employees++;
      const gender = inferGender(emp);
      projectGenderCounts[gender] = (projectGenderCounts[gender] || 0) + 1;
      exceptionMap[emp.id] = {
        id: emp.id,
        employeeId: emp.id,
        employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
        name: getEmployeeName(emp),
        position: positionStr || "-",
        employeeType: normalizeEmployeeType(emp),
        flags: [],
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        notRecordedDays: 0,
        lateDays: 0,
        wrongProjectDays: 0,
        otHours: 0,
      };
    });

    let totalSlots = 0;
    let present = 0;
    let absent = 0;
    let leave = 0;
    let notRecorded = 0;
    let wrongProject = 0;
    let totalOtHours = 0;
    let projectHasLateData = false;
    const otEmployees = new Set<string>();

    workDates.forEach((date) => {
      let dayPresent = 0;
      let dayAbsent = 0;
      let dayLeave = 0;
      let dayNotRecorded = 0;
      let dayWrongProject = 0;
      let dayOtHours = 0;

      scopedEmployees.forEach((emp) => {
        const attendance = attendanceByDate[date]?.[emp.id];
        const overtime = overtimeByDate[date]?.[emp.id];
        const empType = normalizeEmployeeType(emp);
        const typeRow = ensureRow(breakdownByType, empType);
        const positionStr = selectedProject
        ? extractProjectPosition(emp.สถานะโครงการ, selectedProject, String(emp["ตำแหน่ง"] || "ไม่ระบุ"))
        : String(emp["ตำแหน่ง"] || "ไม่ระบุ");
      const positionRow = ensureRow(breakdownByPosition, positionStr || "ไม่ระบุ");
      const deptStr = String(emp["แผนก"] || "ไม่ระบุ");
      const deptRow = ensureRow(breakdownByDepartment, deptStr);
        const employeeRisk = exceptionMap[emp.id];
        const counts = [typeRow, positionRow, deptRow];
        
        const laborGroupName = LABOR_GROUP_TYPES.has(empType) ? String(emp["ชื่อชุด"] || "").trim() : "";
        const groupStats = laborGroupName ? ensureLaborGroup(typeRow, laborGroupName) : null;
        const posGroupStats = ensureLaborGroup(deptRow, positionStr || "ไม่ระบุ");

        if (!!attendance?.checkInTime || attendance?.isLate !== undefined || attendance?.lateMinutes !== undefined) {
          projectHasLateData = true;
        }

        totalSlots++;

        const isWrongProject = attendance?.status === "มา" && !!attendance.project && !projectsMatch(attendance.project, selectedProject);
        const isPresent = attendance?.status === "มา" && (!attendance.project || projectsMatch(attendance.project, selectedProject));
        const otHours = safeNumber(overtime?.hours);
        const otMatchesProject = !overtime?.project || projectsMatch(overtime.project, selectedProject);

        if (isPresent) {
          present++;
          dayPresent++;
          counts.forEach((row) => { row.present++; });
          if (groupStats) groupStats.present++;
          if (posGroupStats) posGroupStats.present++;
          employeeRisk.presentDays++;
          const lateFlag = !!attendance?.isLate || safeNumber(attendance?.lateMinutes) > 0;
          if (lateFlag) {
            counts.forEach((row) => { row.late++; });
            if (posGroupStats) posGroupStats.late++;
            employeeRisk.lateDays++;
          }
        } else if (isWrongProject) {
          wrongProject++;
          dayWrongProject++;
          employeeRisk.wrongProjectDays++;
          counts.forEach((row) => { row.wrongProject++; });
          if (groupStats) groupStats.wrongProject++;
          if (posGroupStats) posGroupStats.wrongProject++;
        } else if (attendance?.status === "ไม่มา") {
          absent++;
          dayAbsent++;
          employeeRisk.absentDays++;
          counts.forEach((row) => { row.absent++; });
          if (groupStats) groupStats.absent++;
          if (posGroupStats) posGroupStats.absent++;
        } else if (attendance?.status === "ลา") {
          leave++;
          dayLeave++;
          employeeRisk.leaveDays++;
          counts.forEach((row) => { row.leave++; });
          if (groupStats) groupStats.leave++;
          if (posGroupStats) posGroupStats.leave++;
        } else if (attendance?.status === "H") {
          // วันหยุดพนักงาน (รายบุคคล) — ไม่นับในบัคเก็ตไหนเลย ทำให้ตัดออกจากตัวหาร (slots) ของตารางนี้โดยอัตโนมัติ
        } else {
          notRecorded++;
          dayNotRecorded++;
          employeeRisk.notRecordedDays++;
          counts.forEach((row) => { row.notRecorded++; });
          if (groupStats) groupStats.notRecorded++;
          if (posGroupStats) posGroupStats.notRecorded++;
        }

        if (otHours > 0 && otMatchesProject) {
          totalOtHours += otHours;
          dayOtHours += otHours;
          employeeRisk.otHours += otHours;
          otEmployees.add(emp.id);
          counts.forEach((row) => { row.otHours += otHours; });
          if (groupStats) groupStats.otHours += otHours;
          if (posGroupStats) posGroupStats.otHours += otHours;
        }
      });

      dailyTrend.push({
        date,
        label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
        present: dayPresent,
        absent: dayAbsent,
        leave: dayLeave,
        notRecorded: dayNotRecorded,
        wrongProject: dayWrongProject,
        otHours: dayOtHours,
      });
    });

    coverageTrendWorkDates.forEach((date) => {
      let dayPresent = 0;
      scopedEmployees.forEach((emp) => {
        const attendance = attendanceByDate[date]?.[emp.id];
        const isPresent = attendance?.status === "มา" && (!attendance.project || projectsMatch(attendance.project, selectedProject));
        if (isPresent) dayPresent++;
      });
      const requiredForDay = getRequiredForDate(date);
      coverageTrend.push({
        date,
        label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
        present: dayPresent,
        required: requiredForDay,
        coverageRate: requiredForDay > 0 ? dayPresent / requiredForDay : 0,
        gapHeadcount: Math.max(requiredForDay - dayPresent, 0),
      });
    });

    const buildProjectStatusRowsForDates = (dates: string[]) => {
      const localMap: Record<string, ProjectExceptionRow> = {};
      scopedEmployees.forEach((emp) => {
        const positionStr = selectedProject
          ? extractProjectPosition(emp.สถานะโครงการ, selectedProject, String(emp["ตำแหน่ง"] || "ไม่ระบุ"))
          : String(emp["ตำแหน่ง"] || "ไม่ระบุ");
        localMap[emp.id] = {
          id: emp.id,
          employeeId: emp.id,
          employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
          name: getEmployeeName(emp),
          position: positionStr || "-",
          employeeType: normalizeEmployeeType(emp),
          flags: [],
          presentDays: 0,
          absentDays: 0,
          leaveDays: 0,
          notRecordedDays: 0,
          lateDays: 0,
          wrongProjectDays: 0,
          otHours: 0,
        };
      });

      dates.forEach((date) => {
        scopedEmployees.forEach((emp) => {
          const attendance = attendanceByDate[date]?.[emp.id];
          const overtime = overtimeByDate[date]?.[emp.id];
          const row = localMap[emp.id];
          const isWrongProject = attendance?.status === "มา" && !!attendance.project && !projectsMatch(attendance.project, selectedProject);
          const isPresent = attendance?.status === "มา" && (!attendance.project || projectsMatch(attendance.project, selectedProject));
          const otHours = safeNumber(overtime?.hours);
          const otMatchesProject = !overtime?.project || projectsMatch(overtime.project, selectedProject);

          if (isPresent) {
            row.presentDays++;
            if (!!attendance?.isLate || safeNumber(attendance?.lateMinutes) > 0) row.lateDays++;
          } else if (isWrongProject) row.wrongProjectDays++;
          else if (attendance?.status === "ไม่มา") row.absentDays++;
          else if (attendance?.status === "ลา") row.leaveDays++;
          else if (attendance?.status === "H") { /* วันหยุดพนักงาน — ไม่นับเป็นบัคเก็ตไหน */ }
          else row.notRecordedDays++;

          if (otHours > 0 && otMatchesProject) row.otHours += otHours;
        });
      });

      const rows = Object.values(localMap)
        .map((row) => {
          const flags: string[] = [];
          if (row.absentDays > 0) flags.push(`ขาด ${row.absentDays}`);
          if (row.leaveDays > 0) flags.push(`ลา ${row.leaveDays}`);
          if (row.notRecordedDays > 0) flags.push(`ค้างลง ${row.notRecordedDays}`);
          if (row.wrongProjectDays > 0) flags.push(`ผิดโครงการ ${row.wrongProjectDays}`);
          if (row.otHours > 0) flags.push(`OT ${row.otHours.toFixed(1)} ชม.`);
          return {
            employeeId: row.employeeId,
            employeeCode: row.employeeCode,
            fullName: row.name,
            position: row.position || "-",
            employeeType: row.employeeType || "-",
            presentDays: row.presentDays,
            lateDays: row.lateDays,
            absentDays: row.absentDays,
            leaveDays: row.leaveDays,
            notRecordedDays: row.notRecordedDays,
            wrongProjectDays: row.wrongProjectDays,
            otHours: row.otHours,
            flags,
          };
        })
        .sort(
          (a, b) =>
            b.notRecordedDays - a.notRecordedDays ||
            b.absentDays - a.absentDays ||
            b.wrongProjectDays - a.wrongProjectDays ||
            b.otHours - a.otHours
        );

      return rows;
    };

    const exceptionList = Object.values(exceptionMap)
      .map((row) => {
        const flags: string[] = [];
        if (row.absentDays > 0) flags.push(`ขาด ${row.absentDays}`);
        if (row.leaveDays > 0) flags.push(`ลา ${row.leaveDays}`);
        if (row.notRecordedDays > 0) flags.push(`ค้างลง ${row.notRecordedDays}`);
        if (row.wrongProjectDays > 0) flags.push(`ผิดโครงการ ${row.wrongProjectDays}`);
        if (row.otHours > 0) flags.push(`OT ${row.otHours.toFixed(1)} ชม.`);
        return { ...row, flags };
      })
      .filter((row) => row.flags.length > 0)
      .sort(
        (a, b) =>
          b.notRecordedDays - a.notRecordedDays ||
          b.absentDays - a.absentDays ||
          b.wrongProjectDays - a.wrongProjectDays ||
          b.otHours - a.otHours
      )
      .slice(0, 16);

    const projectEmployeeStatusRows: ProjectEmployeeStatusRow[] = Object.values(exceptionMap)
      .map((row) => {
        const flags: string[] = [];
        if (row.absentDays > 0) flags.push(`ขาด ${row.absentDays}`);
        if (row.leaveDays > 0) flags.push(`ลา ${row.leaveDays}`);
        if (row.notRecordedDays > 0) flags.push(`ค้างลง ${row.notRecordedDays}`);
        if (row.wrongProjectDays > 0) flags.push(`ผิดโครงการ ${row.wrongProjectDays}`);
        if (row.otHours > 0) flags.push(`OT ${row.otHours.toFixed(1)} ชม.`);
        return {
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          fullName: row.name,
          position: row.position || "-",
          employeeType: row.employeeType || "-",
          presentDays: row.presentDays,
          lateDays: row.lateDays,
          absentDays: row.absentDays,
          leaveDays: row.leaveDays,
          notRecordedDays: row.notRecordedDays,
          wrongProjectDays: row.wrongProjectDays,
          otHours: row.otHours,
          flags,
        };
      })
      .sort(
        (a, b) =>
          b.notRecordedDays - a.notRecordedDays ||
          b.absentDays - a.absentDays ||
          b.wrongProjectDays - a.wrongProjectDays ||
          b.otHours - a.otHours
      );

    const followUpProjectEmployeeStatusRows = buildProjectStatusRowsForDates(followUpWorkDates);
    const followUpExceptionList = followUpProjectEmployeeStatusRows.filter((row) => row.flags.length > 0).slice(0, 16);
    const todayAbsentLeaveProjectRows = scopedEmployees
      .map((emp) => {
        const attendance = attendanceByDate[todayReferenceDate]?.[emp.id];
        if (attendance?.status !== "ไม่มา" && attendance?.status !== "ลา") return null;
        const positionStr = selectedProject
          ? extractProjectPosition(emp.สถานะโครงการ, selectedProject, String(emp["ตำแหน่ง"] || "ไม่ระบุ"))
          : String(emp["ตำแหน่ง"] || "ไม่ระบุ");
        return {
          employeeId: emp.id,
          employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
          fullName: getEmployeeName(emp),
          position: positionStr || "-",
          employeeType: normalizeEmployeeType(emp),
          status: attendance.status,
        };
      })
      .filter((row): row is { employeeId: string; employeeCode: string; fullName: string; position: string; employeeType: string; status: "ไม่มา" | "ลา" } => row !== null)
      .sort((a, b) => (a.status === b.status ? a.fullName.localeCompare(b.fullName, "th") : a.status === "ไม่มา" ? -1 : 1));

    const coverageByType: CoverageInsightRow[] = Object.values(breakdownByType)
      .map((row) => {
        const scheduledSlots = row.employees * workDates.length;
        const gapSlots = Math.max(scheduledSlots - row.present, 0);
        return {
          key: row.key,
          label: row.label,
          assignedHeadcount: row.employees,
          scheduledSlots,
          present: row.present,
          gapSlots,
          coverageRate: scheduledSlots > 0 ? row.present / scheduledSlots : 0,
          otHours: row.otHours,
        };
      })
      .sort((a, b) => a.coverageRate - b.coverageRate || b.gapSlots - a.gapSlots || b.assignedHeadcount - a.assignedHeadcount);

    const coverageByPosition: CoverageInsightRow[] = hasRequiredRolePlan
      ? Array.from(rolePlanKeys)
          .map((normalizedKey) => {
            const baseline = requiredRolePlanBaseline[normalizedKey];
            const matchedRow = Object.values(breakdownByPosition).find((row) => normalizeRoleKey(row.label) === normalizedKey);
            const scheduledSlots = workDates.reduce((sum, date) => sum + (effectiveRolePlanByDate[date]?.[normalizedKey]?.required || 0), 0);
            const averageDailyRequired = workDates.length > 0 ? scheduledSlots / workDates.length : 0;
            const presentCount = matchedRow?.present || 0;
            const gapSlots = Math.max(scheduledSlots - presentCount, 0);
            return {
              key: normalizedKey,
              label: matchedRow?.label || baseline?.label || normalizedKey,
              assignedHeadcount: averageDailyRequired,
              scheduledSlots,
              present: presentCount,
              gapSlots,
              coverageRate: scheduledSlots > 0 ? presentCount / scheduledSlots : 0,
              otHours: matchedRow?.otHours || 0,
            };
          })
          .sort((a, b) => a.coverageRate - b.coverageRate || b.gapSlots - a.gapSlots || b.assignedHeadcount - a.assignedHeadcount)
      : Object.values(breakdownByPosition)
          .map((row) => {
            const scheduledSlots = row.employees * workDates.length;
            const gapSlots = Math.max(scheduledSlots - row.present, 0);
            return {
              key: row.key,
              label: row.label,
              assignedHeadcount: row.employees,
              scheduledSlots,
              present: row.present,
              gapSlots,
              coverageRate: scheduledSlots > 0 ? row.present / scheduledSlots : 0,
              otHours: row.otHours,
            };
          })
          .filter((row) => row.assignedHeadcount > 0)
          .sort((a, b) => a.coverageRate - b.coverageRate || b.gapSlots - a.gapSlots || b.assignedHeadcount - a.assignedHeadcount);

    const coverageDenominator = hasRequiredManpower
      ? requiredManpower * workDates.length
      : hasRequiredRolePlan
        ? workDates.reduce((sum, date) => sum + getRequiredForDate(date), 0)
        : totalSlots;
    const coverageRate = coverageDenominator > 0 ? present / coverageDenominator : 0;
    const coverageGapSlots = Math.max(coverageDenominator - present, 0);
    const averageDailyShortfall = workDates.length > 0 ? coverageGapSlots / workDates.length : 0;
    const otDependencyRate = scopedEmployees.length > 0 ? otEmployees.size / scopedEmployees.length : 0;
    const coverageBasisLabel = hasRequiredManpower
      ? `Phase 2: ใช้ required manpower ${requiredManpower} คน/วัน จากข้อมูลโครงการ`
      : hasRequiredRolePlan
        ? "Phase 2: ใช้ role plan รายวันจาก baseline + adjustments ของโครงการ"
        : "Phase 1: ยังไม่พบ required manpower หรือ role plan จึงใช้ assigned headcount ของโครงการเป็นฐาน coverage";
    const coverageTargetPerDay = hasRequiredManpower
      ? requiredManpower
      : hasRequiredRolePlan
        ? (coverageTrend.reduce((sum, row) => sum + row.required, 0) / Math.max(coverageTrendWorkDates.length, 1))
        : scopedEmployees.length;

    return {
      selectedProjectRecord,
      scopedEmployees,
      totalSlots,
      present,
      absent,
      leave,
      notRecorded,
      wrongProject,
      totalOtHours,
      otEmployees: otEmployees.size,
      dailyTrend,
      breakdownByType: Object.values(breakdownByType).sort((a, b) => b.employees - a.employees || a.label.localeCompare(b.label, "th")),
      breakdownByPosition: Object.values(breakdownByPosition).sort((a, b) => b.employees - a.employees || a.label.localeCompare(b.label, "th")),
      breakdownByDepartment: Object.values(breakdownByDepartment).sort((a, b) => b.employees - a.employees || a.label.localeCompare(b.label, "th")),
      exceptionList,
      followUpExceptionList,
      projectEmployeeStatusRows,
      followUpProjectEmployeeStatusRows,
      todayAbsentLeaveProjectRows,
      coverageRate,
      coverageGapSlots,
      averageDailyShortfall,
      otDependencyRate,
      coverageByType,
      coverageByPosition,
      coverageBasisLabel,
      coverageTrend,
      coverageTargetPerDay,
      hasRequiredManpower,
      requiredManpower,
      coverageDenominator,
      hasRequiredRolePlan,
      lateDataAvailable: projectHasLateData,
      workDaysCount: workDates.length,
      genderCounts: projectGenderCounts,
    };
  }, [employees, workDates, followUpWorkDates, coverageTrendWorkDates, attendanceByDate, overtimeByDate, selectedProject, projectRecords, todayReferenceDate]);

  const employeeTypeList = useMemo(
    () =>
      Object.entries(employeeTypeCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "th")),
    [employeeTypeCounts]
  );

  const genderList = useMemo(
    () =>
      Object.entries(hrData.genderCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [hrData.genderCounts]
  );

  const ageList = useMemo(
    () =>
      Object.entries(hrData.ageCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [hrData.ageCounts]
  );

  const tenureList = useMemo(
    () =>
      Object.entries(hrData.tenureCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [hrData.tenureCounts]
  );

  const topProjectAssignments = useMemo(
    () =>
      Object.entries(hrData.projectCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [hrData.projectCounts]
  );

  const riskEmployeeTypeOptions = useMemo(
    () => Array.from(new Set(hrData.riskEmployees.map((risk) => risk.employeeType || "ไม่ระบุ"))).sort((a, b) => a.localeCompare(b, "th")),
    [hrData.riskEmployees]
  );

  const filteredRiskEmployees = useMemo(
    () =>
      hrData.riskEmployees.filter((risk) => {
        const severityOk = riskSeverityFilter === "all" || risk.severity === riskSeverityFilter;
        const projectOk = riskProjectFilter === "all" || risk.projectNames.includes(riskProjectFilter);
        const typeOk = riskEmployeeTypeFilter === "all" || (risk.employeeType || "ไม่ระบุ") === riskEmployeeTypeFilter;
        return severityOk && projectOk && typeOk;
      }),
    [hrData.riskEmployees, riskSeverityFilter, riskProjectFilter, riskEmployeeTypeFilter]
  );

  const filteredRiskProjects = useMemo(
    () =>
      hrData.riskyProjects.filter((project) => {
        const severityOk = riskSeverityFilter === "all" || project.severity === riskSeverityFilter;
        const projectOk = riskProjectFilter === "all" || project.project === riskProjectFilter;
        return severityOk && projectOk;
      }),
    [hrData.riskyProjects, riskSeverityFilter, riskProjectFilter]
  );

  const riskSeverityDonutData = useMemo(() => {
    const counts: Record<RiskSeverity, number> = { critical: 0, high: 0, risk: 0, watch: 0, normal: 0 };
    filteredRiskEmployees.forEach((risk) => {
      counts[risk.severity] = (counts[risk.severity] || 0) + 1;
    });
    return (["critical", "high", "risk", "watch", "normal"] as RiskSeverity[]).map((sev) => ({
      name: severityLabelMap[sev],
      value: counts[sev],
      color: severityHexMap[sev],
    }));
  }, [filteredRiskEmployees, severityHexMap, severityLabelMap]);

  const riskyProjectsBarData = useMemo(
    () =>
      [...filteredRiskProjects]
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 8)
        .map((project) => ({
          name: project.project.length > 18 ? `${project.project.slice(0, 17)}…` : project.project,
          fullName: project.project,
          value: project.totalScore,
          color: severityHexMap[project.severity],
        })),
    [filteredRiskProjects, severityHexMap]
  );

  const shortenLabel = (label: string, max = 16) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);

  const coverageByTypeBarData = useMemo(
    () =>
      projectData.coverageByType.slice(0, 6).map((row) => ({
        name: shortenLabel(row.label),
        fullName: row.label,
        target: row.scheduledSlots,
        actual: row.present,
        coverageRate: row.coverageRate,
      })),
    [projectData.coverageByType]
  );

  const coverageByPositionBarData = useMemo(
    () =>
      projectData.coverageByPosition.slice(0, 6).map((row) => ({
        name: shortenLabel(row.label),
        fullName: row.label,
        target: row.scheduledSlots,
        actual: row.present,
        coverageRate: row.coverageRate,
      })),
    [projectData.coverageByPosition]
  );

  const openProjectDashboard = (projectName: string) => {
    setSelectedProject(projectName);
    setDashboardMode("project");
    setSidePanel(null);
    setMetricModal(null);
  };

  const renderMetricModalContent = () => {
    if (!metricModal) return null;

    if (metricModal.key === "hr-absence") {
      const rows = hrData.employeeAttendanceRows
        .filter((row) => row.metrics.absentDays > 0)
        .sort(
          (a, b) =>
            b.metrics.absentDays - a.metrics.absentDays ||
            b.metrics.consecutiveAbsentDays - a.metrics.consecutiveAbsentDays ||
            b.totalScore - a.totalScore
        )
        .slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs font-semibold text-rose-700">อัตราขาด</div>
              <div className="mt-1 text-2xl font-black text-rose-800">{formatPercent(hrData.absent, hrData.totalSlots)}</div>
              <div className="mt-1 text-xs text-rose-700">สูตร: จำนวนขาด / scheduled workforce</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">วันขาดทั้งหมด</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{hrData.absent}</div>
              <div className="mt-1 text-xs text-slate-500">นับเป็น employee-days</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">คนที่มีการขาด</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{hrData.employeeAttendanceRows.filter((row) => row.metrics.absentDays > 0).length}</div>
              <div className="mt-1 text-xs text-slate-500">ช่วง {timePresetLabel}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="px-3 py-2 text-left font-semibold">พนักงาน</th>
                  <th className="px-3 py-2 text-left font-semibold">โครงการ</th>
                  <th className="px-3 py-2 text-center font-semibold">ขาด</th>
                  <th className="px-3 py-2 text-center font-semibold">ขาดติดกัน</th>
                  <th className="px-3 py-2 text-center font-semibold">คะแนนเสี่ยง</th>
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{row.fullName}</div>
                      <div className="text-xs text-slate-500">{row.employeeCode}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.projectNames.join(", ") || "-"}</td>
                    <td className="px-3 py-2 text-center font-semibold text-rose-700">{row.metrics.absentDays}</td>
                    <td className="px-3 py-2 text-center">{row.metrics.consecutiveAbsentDays}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${severityBadgeClass[row.severity]}`}>
                        {severityLabelMap[row.severity]} | {row.totalScore}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (metricModal.key === "hr-leave") {
      const rows = hrData.employeeAttendanceRows
        .filter((row) => row.metrics.leaveDays > 0)
        .sort((a, b) => b.metrics.leaveDays - a.metrics.leaveDays || b.metrics.absentDays - a.metrics.absentDays)
        .slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold text-amber-700">อัตราลา</div>
              <div className="mt-1 text-2xl font-black text-amber-800">{formatPercent(hrData.leave, hrData.totalSlots)}</div>
              <div className="mt-1 text-xs text-amber-700">สูตร: จำนวนลา / scheduled workforce</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">วันลาทั้งหมด</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{hrData.leave}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">คนที่ลา</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{hrData.employeeAttendanceRows.filter((row) => row.metrics.leaveDays > 0).length}</div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.projectNames.join(", ") || "-"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-amber-800">{row.metrics.leaveDays} วันลา</div>
                    <div className="text-xs text-slate-500">ขาด {row.metrics.absentDays} | ค้างลง {row.metrics.notRecordedDays}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "hr-late") {
      const rows = hrData.employeeAttendanceRows
        .filter((row) => row.metrics.lateDays > 0)
        .sort((a, b) => b.metrics.lateDays - a.metrics.lateDays || b.metrics.presentDays - a.metrics.presentDays)
        .slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-xs font-semibold text-violet-700">วิธีคิด</div>
            <div className="mt-1 text-sm text-violet-800">
              {hrData.lateDataAvailable
                ? `มาสาย ${hrData.late} เหตุการณ์ จากวันที่มาทำงาน ${hrData.present} employee-days`
                : "ตอนนี้ยังไม่มี check-in time หรือ late minutes เพียงพอสำหรับการวิเคราะห์มาสาย"}
            </div>
          </div>
          {hrData.lateDataAvailable ? (
            <div className="space-y-2">
              {rows.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  ยังไม่พบเหตุการณ์มาสายในช่วงนี้
                </div>
              ) : rows.map((row) => (
                <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">{row.fullName}</div>
                      <div className="text-xs text-slate-500">{row.employeeCode} | {row.projectNames.join(", ") || "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-violet-800">{row.metrics.lateDays} ครั้ง</div>
                      <div className="text-xs text-slate-500">จากวันที่มาทำงาน {row.metrics.presentDays} วัน</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (metricModal.key === "hr-ot") {
      const rows = hrData.employeeAttendanceRows
        .filter((row) => row.metrics.otHours > 0)
        .sort((a, b) => b.metrics.otHours - a.metrics.otHours)
        .slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold text-sky-700">OT รวม</div>
              <div className="mt-1 text-2xl font-black text-sky-800">{hrData.totalOtHours.toFixed(1)} ชม.</div>
              <div className="mt-1 text-xs text-sky-700">รวม OT ทุกคนในช่วงที่เลือก</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">จำนวนคนทำ OT</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{hrData.otEmployees}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">เฉลี่ยต่อคนที่ทำ OT</div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {hrData.otEmployees > 0 ? (hrData.totalOtHours / hrData.otEmployees).toFixed(1) : "0.0"} ชม.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.projectNames.join(", ") || "-"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-sky-800">{row.metrics.otHours.toFixed(1)} ชม.</div>
                    <div className="text-xs text-slate-500">{row.employeeType}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "project-absent") {
      const rows = projectData.projectEmployeeStatusRows.filter((row) => row.absentDays > 0).slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-xs font-semibold text-rose-700">ขาดของโครงการ</div>
            <div className="mt-1 text-2xl font-black text-rose-800">{projectData.absent}</div>
            <div className="mt-1 text-xs text-rose-700">{formatPercent(projectData.absent, projectData.totalSlots)} ของ scheduled workforce</div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.position}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-rose-800">{row.absentDays} วัน</div>
                    <div className="text-xs text-slate-500">{row.employeeType}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "project-leave") {
      const rows = projectData.projectEmployeeStatusRows.filter((row) => row.leaveDays > 0).slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold text-amber-700">ลาของโครงการ</div>
            <div className="mt-1 text-2xl font-black text-amber-800">{projectData.leave}</div>
            <div className="mt-1 text-xs text-amber-700">{formatPercent(projectData.leave, projectData.totalSlots)} ของ scheduled workforce</div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.position}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-amber-800">{row.leaveDays} วัน</div>
                    <div className="text-xs text-slate-500">ขาด {row.absentDays} | ค้างลง {row.notRecordedDays}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "project-pending") {
      const rows = projectData.projectEmployeeStatusRows
        .filter((row) => row.notRecordedDays > 0 || row.wrongProjectDays > 0)
        .slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">ค้างลงเวลา</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{projectData.notRecorded}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">ลงผิดโครงการ</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{projectData.wrongProject}</div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.position}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-black text-slate-800">ค้าง {row.notRecordedDays} | ผิดโครงการ {row.wrongProjectDays}</div>
                    <div className="text-xs text-slate-500">{row.employeeType}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "project-ot") {
      const rows = projectData.projectEmployeeStatusRows.filter((row) => row.otHours > 0).slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-semibold text-sky-700">OT รวมของโครงการ</div>
            <div className="mt-1 text-2xl font-black text-sky-800">{projectData.totalOtHours.toFixed(1)} ชม.</div>
            <div className="mt-1 text-xs text-sky-700">จำนวนคนทำ OT {projectData.otEmployees} คน</div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.position}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-sky-800">{row.otHours.toFixed(1)} ชม.</div>
                    <div className="text-xs text-slate-500">{row.employeeType}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (metricModal.key === "coverage-total") {
      const lowDays = projectData.coverageTrend.filter((row) => row.coverageRate < 0.95);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className={`rounded-xl border p-4 ${getCoverageRiskTone(projectData.coverageRate).card}`}>
              <div className={`text-xs font-semibold ${getCoverageRiskTone(projectData.coverageRate).subtext}`}>Coverage รวม</div>
              <div className={`mt-1 text-2xl font-black ${getCoverageRiskTone(projectData.coverageRate).text}`}>{formatPercent(projectData.present, projectData.coverageDenominator)}</div>
              <div className={`mt-1 text-xs ${getCoverageRiskTone(projectData.coverageRate).subtext}`}>{projectData.coverageBasisLabel}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">วัน coverage ต่ำกว่า 95%</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{lowDays.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">Target เฉลี่ยต่อวัน</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{projectData.coverageTargetPerDay.toFixed(1)}</div>
            </div>
          </div>
          <div className="space-y-2">
            {projectData.coverageTrend.map((row) => {
              const tone = getCoverageRiskTone(row.coverageRate);
              return (
                <div key={row.date} className={`rounded-xl border p-3 ${tone.card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`font-semibold ${tone.text}`}>{row.label}</div>
                      <div className={`text-xs ${tone.subtext}`}>มา {row.present} / ต้องการ {row.required}</div>
                    </div>
                    <div className={`text-lg font-black ${tone.text}`}>{formatPercent(row.present, row.required)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (metricModal.key === "coverage-gap") {
      const rows = projectData.coverageByPosition.slice(0, 8);
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-xs font-semibold text-rose-700">Coverage Gap</div>
            <div className="mt-1 text-2xl font-black text-rose-800">{projectData.coverageGapSlots}</div>
            <div className="mt-1 text-xs text-rose-700">เฉลี่ยขาด {projectData.averageDailyShortfall.toFixed(1)} คน/วัน</div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => {
              const tone = getCoverageRiskTone(row.coverageRate);
              return (
                <div key={row.key} className={`rounded-xl border p-3 ${tone.card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`font-semibold ${tone.text}`}>{row.label}</div>
                      <div className={`text-xs ${tone.subtext}`}>Gap {row.gapSlots} employee-days</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black ${tone.text}`}>{formatPercent(row.present, row.scheduledSlots)}</div>
                      <div className={`text-xs ${tone.subtext}`}>{row.present}/{row.scheduledSlots}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (metricModal.key === "ot-dependency") {
      const rows = projectData.projectEmployeeStatusRows.filter((row) => row.otHours > 0).slice(0, 12);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold text-sky-700">OT Dependency</div>
              <div className="mt-1 text-2xl font-black text-sky-800">{formatPercent(projectData.otEmployees, Math.max(projectData.scopedEmployees.length, 1))}</div>
              <div className="mt-1 text-xs text-sky-700">สัดส่วนคนในโครงการที่มี OT</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">คนที่ทำ OT</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{projectData.otEmployees}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">OT รวม</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{projectData.totalOtHours.toFixed(1)} ชม.</div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.employeeId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">{row.fullName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode} | {row.position}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-sky-800">{row.otHours.toFixed(1)} ชม.</div>
                    <div className="text-xs text-slate-500">{row.employeeType}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderSidePanelContent = () => {
    if (!sidePanel) return null;

    if (sidePanel.key === "risk-projects") {
      const activeProject =
        filteredRiskProjects.find((project) => project.project === sidePanel.selectedKey) ||
        filteredRiskProjects[0];
      const activeTrendMax = activeProject
        ? Math.max(...activeProject.trend.map((row) => row.present + row.absent + row.leave + row.notRecorded + row.wrongProject), 1)
        : 1;
      return (
        <div className="space-y-3">
          {filteredRiskProjects.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              ไม่มีโครงการที่มีประเด็นความเสี่ยงในช่วงนี้
            </div>
          ) : activeProject ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-black text-slate-900">{activeProject.project}</h4>
                  <div className="mt-1 text-xs text-slate-500">กำลังคน {activeProject.headcount} คน | ช่วงวิเคราะห์ {isSingleDayView ? "ย้อนหลัง 7 วัน" : timePresetLabel}</div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${severityBadgeClass[activeProject.severity]}`}>
                    {severityLabelMap[activeProject.severity]} | {activeProject.totalScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => openProjectDashboard(activeProject.project)}
                    className="mt-3 block rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    เปิด Project Dashboard
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">เลือกโครงการ</label>
                  <select
                    value={activeProject.project}
                    onChange={(e) => setSidePanel((prev) => (prev ? { ...prev, selectedKey: e.target.value } : prev))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    {filteredRiskProjects.map((project) => (
                      <option key={project.project} value={project.project}>
                        {project.project}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="text-xs font-semibold text-amber-700">Action Summary</div>
                  <div className="mt-1 font-medium">{activeProject.recommendedAction}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {activeProject.drivers.map((driver) => (
                  <div key={driver.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">{driver.label}</div>
                    <div className="mt-1 text-xl font-black text-slate-900">{driver.points}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{driver.detail}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">Mini Trend</div>
                    <div className="text-xs text-slate-500">ดู pattern รายวันของ มา/ขาด/ลา/ค้างลง/ผิดโครงการ</div>
                  </div>
                </div>
                <MiniTrendChart rows={activeProject.trend} maxValue={activeTrendMax} />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Top Employees</div>
                  <div className="mt-1 text-xs text-slate-500">คนที่ดันความเสี่ยงของโครงการนี้มากที่สุดจากขาด/ค้างลง/ลา/ผิดโครงการ/OT</div>
                  <div className="mt-3 space-y-2">
                    {activeProject.topContributors.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        ยังไม่พบพนักงานที่มี incident ชัดเจนในโครงการนี้
                      </div>
                    ) : activeProject.topContributors.map((employee) => (
                      <div key={employee.employeeId} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800">{employee.fullName}</div>
                            <div className="mt-1 text-xs text-slate-500">{employee.employeeCode} | {employee.position} | {employee.employeeType}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {employee.flags.map((flag) => (
                                <span key={flag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">
                            {employee.contributionScore}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Driver Summary</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Driver หลัก: <span className="font-semibold text-slate-900">{activeProject.drivers[0]?.label || "-"}</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ขาดสะสม {activeProject.absent} employee-days | ลาสะสม {activeProject.leave} employee-days
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ค้างลงเวลา {activeProject.notRecorded} employee-days | OT {activeProject.otHours.toFixed(1)} ชม.
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ถ้าต้องตัดสินใจเร็ว ให้เริ่มจากคนใน Top Employees และวันที่ trend มีสีแดง/เทาสูงก่อน
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (sidePanel.key === "employee-type-members") {
      const activeType = sidePanel.selectedKey || "Supply manpower";
      const memberRows = employees
        .filter((emp) => normalizeEmployeeType(emp) === activeType)
        .map((emp) => {
          const positionStr = selectedProject
            ? extractProjectPosition(emp.สถานะโครงการ, selectedProject, String(emp["ตำแหน่ง"] || "ไม่ระบุ"))
            : String(emp["ตำแหน่ง"] || "ไม่ระบุ");
          return {
            employeeId: emp.id,
            employeeCode: String(emp["รหัสพนักงาน"] || emp.id),
            fullName: getEmployeeName(emp),
            position: positionStr || "-",
            projectNames: parseProjectList(emp.สถานะโครงการ),
            employeeTypeSource: [String(emp.employee_type || "").trim(), String(emp.สถานะกลุ่มงาน || "").trim()].filter(Boolean).join(" / ") || "-",
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "th"));
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">เลือกประเภทพนักงาน</label>
              <select
                value={activeType}
                onChange={(e) => setSidePanel((prev) => (prev ? { ...prev, selectedKey: e.target.value, title: `รายชื่อพนักงาน ${e.target.value}` } : prev))}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-300 outline-none"
              >
                {employeeTypeList.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="text-xs font-semibold text-slate-600">กติกาที่ระบบจัดกลุ่ม</div>
              <div className="mt-1">
                {activeType === "Supply manpower"
                  ? "กลุ่มนี้เกิดจากค่า employee_type/สถานะกลุ่มงาน ที่มีคำว่า supply หรือ supplydc"
                  : activeType === "DC Daily - Staff"
                    ? "กลุ่มนี้เกิดจาก employee_type เป็น Direct Team Leader และสถานะกลุ่มงานเป็น Staff"
                    : activeType === "DC Daily - Worker"
                      ? "กลุ่มนี้เกิดจาก employee_type เป็น Direct Team Leader และสถานะกลุ่มงานเป็น Worker"
                  : "แสดงรายชื่อจากผล normalize employee type ที่ dashboard ใช้อยู่จริง"}
              </div>
            </div>
          </div>

          {memberRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              ยังไม่พบพนักงานในกลุ่ม {activeType}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-xs">
                <thead>
                  <tr className="sticky top-0 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold">ชื่อ</th>
                    <th className="px-3 py-2 text-left font-semibold">ตำแหน่ง</th>
                    <th className="px-3 py-2 text-left font-semibold">โครงการ</th>
                    <th className="px-3 py-2 text-left font-semibold">ค่าต้นทางที่ใช้จัดกลุ่ม</th>
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map((row) => (
                    <tr key={row.employeeId} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">{row.fullName}</div>
                        <div className="text-[11px] text-slate-500">{row.employeeCode}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.position}</td>
                      <td className="px-3 py-2 text-slate-700">{row.projectNames.join(", ") || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{row.employeeTypeSource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (sidePanel.key === "risk-employees") {
      const activeRisk =
        filteredRiskEmployees.find((risk) => risk.employeeId === sidePanel.selectedKey) ||
        filteredRiskEmployees[0];
      const activeEmployee = activeRisk ? employees.find((emp) => emp.id === activeRisk.employeeId) : undefined;
      const incidentTimeline = activeRisk
        ? followUpWorkDates
            .map((date) => {
              const attendance = attendanceByDate[date]?.[activeRisk.employeeId];
              const overtime = overtimeByDate[date]?.[activeRisk.employeeId];
              const otHours = safeNumber(overtime?.hours);
              const lateFlag = !!attendance?.isLate || safeNumber(attendance?.lateMinutes) > 0;
              const status = attendance?.status || "ค้างลงเวลา";
              const notes: string[] = [];
              if (status === "ไม่มา") notes.push("ขาด");
              if (status === "ลา") notes.push("ลา");
              if (!attendance) notes.push("ค้างลงเวลา");
              if (attendance?.project && activeRisk.projectNames.length > 0 && !projectListIncludes(activeRisk.projectNames, attendance.project)) {
                notes.push(`ลง ${attendance.project}`);
              }
              if (lateFlag) notes.push("มาสาย");
              if (otHours > 0) notes.push(`OT ${otHours.toFixed(1)} ชม.`);
              return {
                date,
                label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
                status,
                notes,
              };
            })
            // "มา" ปกติและ "H" (วันหยุดพนักงาน) ไม่ใช่ incident จะถูกซ่อนถ้าไม่มี note พิเศษอื่น (เช่น สาย/OT/ลงผิดโครงการ)
            .filter((row) => (row.status !== "มา" && row.status !== "H") || row.notes.length > 0)
            .slice(-8)
            .reverse()
        : [];
      return (
        <div className="space-y-3">
          {filteredRiskEmployees.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              ยังไม่พบพนักงานเสี่ยงตามตัวกรองที่เลือก
            </div>
          ) : activeRisk ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-black text-slate-900">{activeRisk.fullName}</h4>
                  <div className="mt-1 text-xs text-slate-500">
                    {activeRisk.employeeCode} | {activeRisk.position || "-"} | {activeRisk.employeeType || "-"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{activeRisk.projectNames.join(", ") || "-"}</div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${severityBadgeClass[activeRisk.severity]}`}>
                    {severityLabelMap[activeRisk.severity]} | {activeRisk.totalScore}
                  </span>
                  {activeRisk.primaryProject ? (
                    <button
                      type="button"
                      onClick={() => openProjectDashboard(activeRisk.primaryProject || "")}
                      className="mt-3 block rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      เปิด Project Dashboard
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">เลือกพนักงาน</label>
                  <select
                    value={activeRisk.employeeId}
                    onChange={(e) => setSidePanel((prev) => (prev ? { ...prev, selectedKey: e.target.value } : prev))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    {filteredRiskEmployees.map((risk) => (
                      <option key={risk.employeeId} value={risk.employeeId}>
                        {risk.fullName} ({risk.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="text-xs font-semibold text-amber-700">Action Summary</div>
                  <div className="mt-1 font-medium">{activeRisk.recommendedAction || "-"}</div>
                  {onOpenFollowUp ? (
                    <button
                      type="button"
                      onClick={() => onOpenFollowUp(buildFollowUpRiskSeed(activeRisk))}
                      className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      เปิดในคิวติดตามพนักงาน
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">ขาด / ขาดติดกัน</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    {activeRisk.metrics.absentDays} / {activeRisk.metrics.consecutiveAbsentDays}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">รวมวันขาด / streak สูงสุด</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">ลา / ค้างลงเวลา</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    {activeRisk.metrics.leaveDays} / {activeRisk.metrics.notRecordedDays}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">วันลา / วันที่ไม่มี attendance</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">ผิดโครงการ / มาสาย</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    {activeRisk.metrics.wrongProjectDays} / {activeRisk.metrics.lateDays}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">ผิด project / late events</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">OT / วันที่มา</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    {activeRisk.metrics.otHours.toFixed(1)} / {activeRisk.metrics.presentDays}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">ชม. OT / วันที่มาทำงาน</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-black text-slate-900">Rule Breakdown</div>
                <div className="mt-1 text-xs text-slate-500">กฎที่ trigger จริงของพนักงานคนนี้ พร้อมคะแนนและเหตุผล</div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600">
                        <th className="px-3 py-2 text-left font-semibold">Rule</th>
                        <th className="px-3 py-2 text-left font-semibold">เหตุผล</th>
                        <th className="px-3 py-2 text-center font-semibold">คะแนน</th>
                        <th className="px-3 py-2 text-center font-semibold">Severity impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRisk.rules.map((rule) => (
                        <tr key={`${activeRisk.employeeId}-${rule.key}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800">{rule.label}</td>
                          <td className="px-3 py-2 text-slate-700">{rule.reason}</td>
                          <td className="px-3 py-2 text-center font-black text-slate-900">{rule.score}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex rounded-full px-2 py-1 font-medium ${severityBadgeClass[rule.severityImpact]}`}>
                              {severityLabelMap[rule.severityImpact]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activeRisk.rules.some((rule) => rule.key === "absence_rate") ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    หมายเหตุ: "อัตราขาดงานสูง" คำนวณจากรอบจ่ายค่าแรงปัจจุบัน ({payCycleRange.label}) เสมอ ไม่ผูกกับช่วงวันที่ที่เลือกดูรายงานด้านบน
                  </div>
                ) : null}
              </div>

              {onOpenFollowUp ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Follow-up Queue by Issue</div>
                  <div className="mt-1 text-xs text-slate-500">
                    เปิดรายการติดตามรายประเด็นจาก risk rule ที่ trigger จริง โดยไม่ต้องสร้างเคสเองก่อน (เฉพาะขาดต่อเนื่องและขาดสะสมเท่านั้นที่เข้าคิวนี้ได้
                    ส่วนอัตราขาดสูง ขาดจันทร์-ศุกร์ ลงผิดโครงการ และค้างลงเวลา ไม่แสดงในคิวนี้ เพราะเป็นเพียงสัญญาณเฝ้าระวัง/คุณภาพข้อมูลบน dashboard เท่านั้น
                    ไม่ใช่ฐานให้ดำเนินการทางวินัยกับพนักงานได้ด้วยตัวเอง)
                  </div>
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {consolidateRulesByScoreGroup(
                      activeRisk.rules.filter((rule) => rule.key !== "wrong_project_pattern")
                    ).map((rule) => {
                      const existingCase = findFollowUpCase(followUpCases, activeRisk.employeeId, rule.key);
                      return (
                        <div key={`${activeRisk.employeeId}-${rule.key}`} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800">{rule.label}</div>
                              <div className="mt-1 text-xs text-slate-500">{rule.reason}</div>
                            </div>
                            {existingCase ? (
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                                existingCase.status === "closed"
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : existingCase.status === "no_action"
                                    ? "border border-slate-200 bg-slate-100 text-slate-700"
                                  : existingCase.status === "in_progress"
                                    ? "border border-sky-200 bg-sky-50 text-sky-700"
                                    : "border border-amber-200 bg-amber-50 text-amber-700"
                              }`}>
                                {FOLLOW_UP_STATUS_LABELS[existingCase.status]}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                                เข้าคิวรอบันทึก
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-500">
                              {existingCase ? `รอบเตือน ${existingCase.warningRound}` : "1 พนักงาน ต่อ 1 ประเด็น และรอบันทึกสถานะ"}
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenFollowUp(buildFollowUpRiskSeed(activeRisk), rule.key)}
                              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              {existingCase ? "เปิดรายการ" : "เปิดในคิว"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Top Reasons</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeRisk.topReasons.map((reason) => (
                      <span key={reason} className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-slate-600">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      latest incident: <span className="font-semibold text-slate-900">{activeRisk.metrics.latestIncidentDate ? formatThaiDate(activeRisk.metrics.latestIncidentDate) : "-"}</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      absence rate: <span className="font-semibold text-slate-900">{formatPercent(activeRisk.metrics.absentDays, Math.max(activeRisk.metrics.scheduledDays, 1))}</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      employee profile: <span className="font-semibold text-slate-900">{activeEmployee ? normalizeEmployeeType(activeEmployee) : activeRisk.employeeType || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Incident Timeline</div>
                  <div className="mt-1 text-xs text-slate-500">รายการล่าสุดที่ทำให้คนนี้ถูกดึงเข้ากลุ่มติดตาม</div>
                  <div className="mt-3 space-y-2">
                    {incidentTimeline.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        ยังไม่พบ incident ย้อนหลังในช่วงวันที่เลือก
                      </div>
                    ) : incidentTimeline.map((row) => (
                      <div key={row.date} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-800">{row.label}</div>
                            <div className="mt-1 text-xs text-slate-500">สถานะ {row.status}</div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {row.notes.map((note) => (
                              <span key={`${row.date}-${note}`} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {note}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (sidePanel.key === "coverage-types") {
      const activeType =
        projectData.coverageByType.find((row) => row.key === sidePanel.selectedKey) ||
        projectData.coverageByType[0];
      const activeTypeEmployees = activeType
        ? projectData.scopedEmployees.filter((emp) => normalizeEmployeeType(emp) === activeType.key)
        : [];
      const activeTypeTrend = activeType
        ? workDates.map((date) => {
            let present = 0;
            let absent = 0;
            let leave = 0;
            let notRecorded = 0;
            let wrongProject = 0;
            let otHours = 0;
            activeTypeEmployees.forEach((emp) => {
              const attendance = attendanceByDate[date]?.[emp.id];
              const overtime = overtimeByDate[date]?.[emp.id];
              if (attendance?.status === "มา" && (!attendance.project || projectsMatch(attendance.project, selectedProject))) present++;
              else if (attendance?.status === "มา" && attendance.project && !projectsMatch(attendance.project, selectedProject)) wrongProject++;
              else if (attendance?.status === "ไม่มา") absent++;
              else if (attendance?.status === "ลา") leave++;
              else if (attendance?.status === "H") { /* วันหยุดพนักงาน — ไม่นับเป็นบัคเก็ตไหน */ }
              else notRecorded++;
              const overtimeHours = safeNumber(overtime?.hours);
              if (overtimeHours > 0 && (!overtime?.project || projectsMatch(overtime.project, selectedProject))) otHours += overtimeHours;
            });
            return {
              date,
              label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
              present,
              absent,
              leave,
              notRecorded,
              wrongProject,
              otHours,
            };
          })
        : [];
      const activeTypeTrendMax = Math.max(...activeTypeTrend.map((row) => row.present + row.absent + row.leave + row.notRecorded + row.wrongProject), 1);
      const activeTypeEmployeesWithFlags = activeType
        ? projectData.projectEmployeeStatusRows
            .filter((row) => row.employeeType === activeType.label)
            .map((row) => ({
              ...row,
              contributionScore: row.absentDays * 5 + row.notRecordedDays * 4 + row.leaveDays * 2 + row.wrongProjectDays * 3 + Math.round(row.otHours),
            }))
            .filter((row) => row.flags.length > 0)
            .sort((a, b) => b.contributionScore - a.contributionScore)
            .slice(0, 5)
        : [];
      return (
        <div className="space-y-3">
          {activeType ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-black text-slate-900">{activeType.label}</h4>
                  <div className="mt-1 text-xs text-slate-500">กลุ่มพนักงาน {activeType.assignedHeadcount} คน ในโครงการนี้</div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getCoverageRiskTone(activeType.coverageRate).emphasis}`}>
                    {formatPercent(activeType.present, activeType.scheduledSlots)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">เลือกประเภทพนักงาน</label>
                  <select
                    value={activeType.key}
                    onChange={(e) => setSidePanel((prev) => (prev ? { ...prev, selectedKey: e.target.value } : prev))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    {projectData.coverageByType.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="text-xs font-semibold text-amber-700">Action Summary</div>
                  <div className="mt-1 font-medium">
                    {activeType.coverageRate < 0.85
                      ? "กลุ่มนี้ coverage ต่ำชัดเจน ควรเช็กคนขาด/ค้างลงและกำลังทดแทนก่อน"
                      : activeType.otHours > 0
                        ? "coverage ยังพอได้ แต่กำลังพึ่ง OT ของกลุ่มนี้ ควรดูภาระงานต่อเนื่อง"
                        : "กลุ่มนี้ยังไม่เห็นสัญญาณรุนแรง แต่ควรติดตาม trend ต่อเนื่อง"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Coverage</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{formatPercent(activeType.present, activeType.scheduledSlots)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{activeType.present}/{activeType.scheduledSlots}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Gap</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeType.gapSlots}</div>
                  <div className="mt-1 text-[11px] text-slate-500">employee-days</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">OT</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeType.otHours.toFixed(1)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">ชั่วโมงสะสม</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Headcount</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeType.assignedHeadcount}</div>
                  <div className="mt-1 text-[11px] text-slate-500">กำลังคนที่ assign</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-black text-slate-900">Mini Trend</div>
                <div className="mt-1 text-xs text-slate-500">ดู pattern ของประเภทพนักงานนี้รายวันในโครงการ</div>
                <div className="mt-3">
                  <MiniTrendChart rows={activeTypeTrend} maxValue={activeTypeTrendMax} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Top Employees</div>
                  <div className="mt-1 text-xs text-slate-500">คนในประเภทนี้ที่ดัน gap หรือ incident มากที่สุด</div>
                  <div className="mt-3 space-y-2">
                    {activeTypeEmployeesWithFlags.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        ยังไม่พบ incident เด่นในประเภทพนักงานนี้
                      </div>
                    ) : activeTypeEmployeesWithFlags.map((employee) => (
                      <div key={employee.employeeId} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800">{employee.fullName}</div>
                            <div className="mt-1 text-xs text-slate-500">{employee.employeeCode} | {employee.position}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {employee.flags.map((flag) => (
                                <span key={flag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">{employee.contributionScore}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Driver Summary</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      กลุ่มนี้มี gap {activeType.gapSlots} employee-days และ OT {activeType.otHours.toFixed(1)} ชม.
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ถ้า coverage ต่ำต่อเนื่อง ให้เช็กคนใน Top Employees และวันที่ trend มีแดง/เทาสูงก่อน
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ถ้า coverage สูงแต่ OT มาก ให้ดูการกระจายภาระงานว่าเริ่มพึ่งคนกลุ่มเดิมหรือไม่
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              ยังไม่มีข้อมูล coverage ของประเภทพนักงานในโครงการนี้
            </div>
          )}
        </div>
      );
    }

    if (sidePanel.key === "coverage-roles") {
      const activeRole =
        projectData.coverageByPosition.find((row) => row.key === sidePanel.selectedKey) ||
        projectData.coverageByPosition[0];
      const activeRoleEmployees = activeRole
        ? projectData.scopedEmployees.filter((emp) => normalizeRoleKey(String(emp["ตำแหน่ง"] || "ไม่ระบุ")) === activeRole.key)
        : [];
      const activeRoleTrend = activeRole
        ? workDates.map((date) => {
            let present = 0;
            let absent = 0;
            let leave = 0;
            let notRecorded = 0;
            let wrongProject = 0;
            let otHours = 0;
            activeRoleEmployees.forEach((emp) => {
              const attendance = attendanceByDate[date]?.[emp.id];
              const overtime = overtimeByDate[date]?.[emp.id];
              if (attendance?.status === "มา" && (!attendance.project || projectsMatch(attendance.project, selectedProject))) present++;
              else if (attendance?.status === "มา" && attendance.project && !projectsMatch(attendance.project, selectedProject)) wrongProject++;
              else if (attendance?.status === "ไม่มา") absent++;
              else if (attendance?.status === "ลา") leave++;
              else if (attendance?.status === "H") { /* วันหยุดพนักงาน — ไม่นับเป็นบัคเก็ตไหน */ }
              else notRecorded++;
              const overtimeHours = safeNumber(overtime?.hours);
              if (overtimeHours > 0 && (!overtime?.project || projectsMatch(overtime.project, selectedProject))) otHours += overtimeHours;
            });
            return {
              date,
              label: new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
              present,
              absent,
              leave,
              notRecorded,
              wrongProject,
              otHours,
            };
          })
        : [];
      const activeRoleTrendMax = Math.max(...activeRoleTrend.map((row) => row.present + row.absent + row.leave + row.notRecorded + row.wrongProject), 1);
      const activeRoleEmployeesWithFlags = activeRole
        ? projectData.projectEmployeeStatusRows
            .filter((row) => normalizeRoleKey(row.position) === activeRole.key)
            .map((row) => ({
              ...row,
              contributionScore: row.absentDays * 5 + row.notRecordedDays * 4 + row.leaveDays * 2 + row.wrongProjectDays * 3 + Math.round(row.otHours),
            }))
            .filter((row) => row.flags.length > 0)
            .sort((a, b) => b.contributionScore - a.contributionScore)
            .slice(0, 5)
        : [];
      return (
        <div className="space-y-3">
          {activeRole ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-black text-slate-900">{activeRole.label}</h4>
                  <div className="mt-1 text-xs text-slate-500">
                    {projectData.hasRequiredRolePlan ? `Plan เฉลี่ย ${activeRole.assignedHeadcount.toFixed(1)} คน/วัน` : `Assign ${activeRole.assignedHeadcount} คน`} | OT {activeRole.otHours.toFixed(1)} ชม.
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getCoverageRiskTone(activeRole.coverageRate).emphasis}`}>
                    {formatPercent(activeRole.present, activeRole.scheduledSlots)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">เลือกตำแหน่ง</label>
                  <select
                    value={activeRole.key}
                    onChange={(e) => setSidePanel((prev) => (prev ? { ...prev, selectedKey: e.target.value } : prev))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    {projectData.coverageByPosition.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="text-xs font-semibold text-amber-700">Action Summary</div>
                  <div className="mt-1 font-medium">
                    {activeRole.coverageRate < 0.85
                      ? "ตำแหน่งนี้ coverage ต่ำกว่าควรอย่างชัดเจน ต้องเช็ก plan เทียบคนที่มาจริงและคนขาดทันที"
                      : activeRole.gapSlots > 0
                        ? "ตำแหน่งนี้เริ่มมีช่องว่าง coverage ควรดูคนที่ถือ role นี้และแผนสำรอง"
                        : "coverage ของตำแหน่งนี้ยังพอไหว แต่ควรติดตาม trend และ OT ต่อเนื่อง"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Coverage</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{formatPercent(activeRole.present, activeRole.scheduledSlots)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{activeRole.present}/{activeRole.scheduledSlots}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Gap</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeRole.gapSlots}</div>
                  <div className="mt-1 text-[11px] text-slate-500">employee-days</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">Plan Basis</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeRole.assignedHeadcount.toFixed(1)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{projectData.hasRequiredRolePlan ? "คน/วัน" : "คน assign"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">OT</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{activeRole.otHours.toFixed(1)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">ชั่วโมงสะสม</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-black text-slate-900">Mini Trend</div>
                <div className="mt-1 text-xs text-slate-500">ดู pattern รายวันของตำแหน่งนี้ในโครงการ</div>
                <div className="mt-3">
                  <MiniTrendChart rows={activeRoleTrend} maxValue={activeRoleTrendMax} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Top Employees</div>
                  <div className="mt-1 text-xs text-slate-500">คนในตำแหน่งนี้ที่ดัน gap หรือ incident มากที่สุด</div>
                  <div className="mt-3 space-y-2">
                    {activeRoleEmployeesWithFlags.length === 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        ยังไม่พบ incident เด่นในตำแหน่งนี้
                      </div>
                    ) : activeRoleEmployeesWithFlags.map((employee) => (
                      <div key={employee.employeeId} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800">{employee.fullName}</div>
                            <div className="mt-1 text-xs text-slate-500">{employee.employeeCode} | {employee.employeeType}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {employee.flags.map((flag) => (
                                <span key={flag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">{employee.contributionScore}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-900">Driver Summary</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      {projectData.hasRequiredRolePlan
                        ? `เทียบกับ plan เฉลี่ย ${activeRole.assignedHeadcount.toFixed(1)} คน/วัน`
                        : `เทียบกับ assign ปัจจุบัน ${activeRole.assignedHeadcount} คน`}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      gap {activeRole.gapSlots} employee-days | OT {activeRole.otHours.toFixed(1)} ชม.
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      ถ้าตำแหน่งนี้เป็น bottleneck ให้เริ่มดูคนใน Top Employees และวันที่ trend ต่ำก่อน เพื่อหาจุดขาดต่อเนื่อง
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              ยังไม่มีข้อมูล coverage ของตำแหน่งในโครงการนี้
            </div>
          )}
        </div>
      );
    }

    if (sidePanel.key === "project-exceptions") {
      return (
        <div className="space-y-2">
          {projectFollowUpStatusRows.filter((row) => row.flags.length > 0).map((row) => (
            <div
              key={row.employeeId}
              className={`rounded-lg border p-2.5 ${sidePanel.selectedKey === row.employeeId ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-sm font-semibold text-slate-800">{row.fullName}</div>
                <div className="shrink-0 text-[11px] font-medium text-slate-600">
                  ขาด {row.absentDays} · ลา {row.leaveDays} · ค้าง {row.notRecordedDays} · ผิดโครงการ {row.wrongProjectDays}
                </div>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                <span className="truncate">{row.employeeCode} | {row.position} | {row.employeeType}</span>
                {row.flags.map((flag) => (
                  <span key={flag} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-700">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-72">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (!hasAssignedProjects) {
    return (
      <div className="bg-white rounded-xl border border-orange-200 p-8 text-center">
        <AlertCircle size={40} className="mx-auto mb-3 text-orange-500" />
        <h3 className="text-base font-bold text-gray-800 mb-1">คุณยังไม่ได้ถูกกำหนดโครงการ</h3>
        <p className="text-sm text-gray-600">กรุณาติดต่อ MasterAdmin เพื่อกำหนดโครงการให้กับคุณ</p>
      </div>
    );
  }

  const maxHrTrend = Math.max(...hrData.dailyTrend.map((row) => row.present + row.absent + row.leave + row.notRecorded + row.wrongProject), 1);
  const maxProjectTrend = Math.max(...projectData.dailyTrend.map((row) => row.present + row.absent + row.leave + row.notRecorded + row.wrongProject), 1);
  const selectedProjectLabel = selectedProject || "ไม่ระบุโครงการ";
  const workdayCount = workDates.length;
  const timePresetLabel = timePreset === "today" ? "วันนี้" : timePreset === "yesterday" ? "เมื่อวาน" : timePreset === "month" ? "เดือนนี้" : "กำหนดเอง";
  const hrFollowUpSubtitle =
    isSingleDayView
      ? "วิเคราะห์ย้อนหลัง 7 วัน เรียงตามระดับความเสี่ยง, score, การขาดติดต่อกัน และ incident ล่าสุด"
      : "เรียงตามระดับความเสี่ยง, score, การขาดติดต่อกัน และ incident ล่าสุด";
  const projectFollowUpSubtitle =
    isSingleDayView
      ? "วิเคราะห์ย้อนหลัง 7 วันของโครงการนี้ เพื่อจับเคสที่ต้องติดตามจริง"
      : "คนที่ขาด ลา ค้างลงเวลา ลงผิดโครงการ หรือมี OT ในช่วงที่เลือก";
  const projectFollowUpList = isSingleDayView
    ? projectData.followUpProjectEmployeeStatusRows
        .filter((row) => row.flags.length > 0)
        .slice(0, 16)
        .map((row) => ({ ...row, id: row.employeeId, name: row.fullName }))
    : projectData.exceptionList;
  const projectFollowUpStatusRows =
    isSingleDayView ? projectData.followUpProjectEmployeeStatusRows : projectData.projectEmployeeStatusRows;
  const activePageGuide = getPageGuide(
    dashboardMode === "project" ? "project-dashboard" : "hr-dashboard"
  );

  return (
    <div ref={dashboardRef} data-export-root className="bg-gradient-to-br from-slate-50 via-sky-50 to-rose-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden text-sm">
      <div className="bg-white/90 border-b border-slate-200 px-2 py-1.5 lg:px-3 lg:py-2">
        <div className="space-y-1.5 lg:space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1 lg:gap-1.5 text-[10px] lg:text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5">
                <Calendar size={12} /> {formatThaiDate(startDate)} - {formatThaiDate(endDate)}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-0.5">
                <BarChart3 size={12} /> ช่วงวิเคราะห์: {timePresetLabel}
              </span>
              {!showOnlyRiskMonitoring && (
                <>
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                    <Users size={12} /> พนักงานใช้งาน {employees.length} คน
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5">
                    <Clock size={12} /> วันทำงานในช่วงนี้ {workdayCount} วัน
                  </span>
                </>
              )}
            </div>
            {!showOnlyRiskMonitoring && (dashboardMode === "project" || !canSeeHrDashboard) && (
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-8 w-full sm:w-[240px] shrink-0 px-3 border border-slate-200 rounded-lg bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none truncate"
              >
                {filteredProjectOptions.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            {canSeeHrDashboard && !showOnlyRiskMonitoring && (
              <div className="inline-flex h-8 shrink-0 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setDashboardMode("hr")}
                  className={`px-3 inline-flex items-center gap-1.5 text-xs font-bold ${dashboardMode === "hr" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <Users size={14} /> HR Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardMode("project")}
                  className={`px-3 inline-flex items-center gap-1.5 text-xs font-bold border-l border-slate-200 ${dashboardMode === "project" ? "bg-sky-500 text-white" : "text-slate-600 hover:bg-sky-50"}`}
                >
                  <Briefcase size={14} /> Project Dashboard
                </button>
              </div>
            )}
            <div className="inline-flex h-8 shrink-0 border border-slate-200 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => applyTimePreset("today")}
                className={`px-3 text-xs font-bold ${timePreset === "today" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset("yesterday")}
                className={`px-3 text-xs font-bold border-l border-slate-200 ${timePreset === "yesterday" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                เมื่อวานนี้
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset("month")}
                className={`px-3 text-xs font-bold border-l border-slate-200 ${timePreset === "month" ? "bg-sky-500 text-white" : "text-slate-600 hover:bg-sky-50"}`}
              >
                เดือนนี้
              </button>
              <button
                type="button"
                onClick={() => setTimePreset("custom")}
                className={`px-3 text-xs font-bold border-l border-slate-200 ${timePreset === "custom" ? "bg-emerald-500 text-white" : "text-slate-600 hover:bg-emerald-50"}`}
              >
                เลือกวันที่
              </button>
            </div>
            <button
              type="button"
              data-html2canvas-ignore="true"
              onClick={handleExportDashboard}
              disabled={exporting}
              title="ส่งออก Dashboard เป็นรูปภาพ (จัดหน้าแบบ desktop)"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? "กำลังส่งออก..." : "ส่งออกรูป"}
            </button>
            <div data-html2canvas-ignore="true">
              <PageGuideButton onClick={() => setShowPageGuide(true)} />
            </div>
            {/* ช่องวันที่: reserve พื้นที่ไว้เสมอเพื่อกัน layout เด้ง เปิดใช้งานเฉพาะโหมดเลือกวันที่ */}
            <div className={`shrink-0 items-center gap-2 transition-opacity ${timePreset === "custom" ? "flex opacity-100" : "hidden lg:flex pointer-events-none lg:opacity-0"}`}>
              <input
                type="date"
                value={startDate}
                disabled={timePreset !== "custom"}
                onChange={(e) => {
                  setTimePreset("custom");
                  setStartDate(e.target.value);
                }}
                className="h-8 w-[150px] px-3 border border-slate-200 rounded-lg bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none"
              />
              <span className="text-xs text-slate-400">ถึง</span>
              <input
                type="date"
                value={endDate}
                disabled={timePreset !== "custom"}
                onChange={(e) => {
                  setTimePreset("custom");
                  setEndDate(e.target.value);
                }}
                className="h-8 w-[150px] px-3 border border-slate-200 rounded-lg bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {!dateRange.length ? (
        <div className="p-8 text-center text-rose-600 font-medium">กรุณาเลือกช่วงวันที่ให้ถูกต้อง</div>
      ) : dashboardMode === "hr" && canSeeHrDashboard ? (
        <div className="p-2 space-y-2 lg:p-4 lg:space-y-4">
          {!showOnlyRiskMonitoring && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
                <MetricCard title="พนักงานทั้งหมด" value={employees.length} subvalue="เฉพาะสถานะทำงาน" icon={Users} accent="text-slate-900" tooltip="นับจากพนักงานที่สถานะพนักงาน = ทำงาน ใน employee master ปัจจุบัน" />
                <MetricCard title="อัตรามาทำงาน" value={formatPercent(hrData.present, hrData.totalSlots)} subvalue={`${hrData.present} / ${hrData.totalSlots} employee-days`} icon={CheckCircle} accent="text-emerald-700" tooltip="สูตร: จำนวนที่มา / scheduled workforce ทั้งช่วงที่เลือก" />
                <MetricCard
                  title="อัตราขาด"
                  value={formatPercent(hrData.absent, hrData.totalSlots)}
                  subvalue={`${hrData.absent} employee-days`}
                  icon={XCircle}
                  accent="text-rose-700"
                  tooltip="สูตร: จำนวนขาด / scheduled workforce ทั้งช่วงที่เลือก"
                  onClick={() => setMetricModal({ key: "hr-absence", title: "รายละเอียดอัตราขาด", subtitle: "เจาะดูคนที่ขาดบ่อย ขาดสะสม และขาดติดต่อกัน" })}
                />
                <MetricCard
                  title="อัตราลา"
                  value={formatPercent(hrData.leave, hrData.totalSlots)}
                  subvalue={`${hrData.leave} employee-days`}
                  icon={AlertCircle}
                  accent="text-amber-700"
                  tooltip="สูตร: จำนวนลา / scheduled workforce ทั้งช่วงที่เลือก"
                  onClick={() => setMetricModal({ key: "hr-leave", title: "รายละเอียดอัตราลา", subtitle: "สรุปรายชื่อและจำนวนวันลาของพนักงานในช่วงที่เลือก" })}
                />
                <MetricCard
                  title="อัตรามาสาย"
                  value={hrData.lateDataAvailable ? formatPercent(hrData.late, Math.max(hrData.present, 1)) : "N/A"}
                  subvalue={hrData.lateDataAvailable ? `${hrData.late} เหตุการณ์จากวันที่มาทำงาน` : "รอเก็บ check-in time / late minutes"}
                  icon={Clock}
                  accent="text-violet-700"
                  tooltip="สูตร: เหตุการณ์มาสาย / วันที่มาทำงานทั้งหมด ใช้ได้เมื่อมี check-in time หรือ late minutes"
                  onClick={() => setMetricModal({ key: "hr-late", title: "รายละเอียดอัตรามาสาย", subtitle: "แสดงความพร้อมของข้อมูล late และเหตุการณ์มาสายในช่วงที่เลือก" })}
                />
                <MetricCard
                  title="OT รวม"
                  value={hrData.totalOtHours.toFixed(1)}
                  subvalue={`มี OT ${hrData.otEmployees} คน`}
                  icon={Clock}
                  accent="text-sky-700"
                  tooltip="รวมชั่วโมง OT ของพนักงานทั้งหมดในช่วงที่เลือก"
                  onClick={() => setMetricModal({ key: "hr-ot", title: "รายละเอียด OT รวม", subtitle: "ดูคนที่แบกรับ OT มากที่สุดและค่าเฉลี่ย OT ในช่วงที่เลือก" })}
                />
                <MetricCard
                  title="เคสเสี่ยงติดตาม"
                  value={hrData.riskEmployees.length}
                  subvalue={isSingleDayView ? "วิเคราะห์ย้อนหลัง 7 วัน" : "Top risk จาก score ความเสี่ยง"}
                  icon={BarChart3}
                  accent="text-fuchsia-700"
                  tooltip="คำนวณจาก risk score ตามกฎขาดติดต่อกัน ขาดสะสม อัตราขาด Monday/Friday ค้างลงเวลา และผิดโครงการ"
                  onClick={() => setSidePanel({ key: "risk-employees", title: "รายการพนักงานเสี่ยง", subtitle: "เรียงตาม severity และ score เพื่อใช้ติดตามเคสที่ควรดูต่อทันที" })}
                />
                <div className="bg-white rounded-lg border border-slate-200 px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm">
                  <div className="inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500">
                    <span>เพศ</span>
                    <InfoTooltip content="สัดส่วนเพศของพนักงานที่มีสถานะทำงาน ใช้ field เพศ/gender หรืออนุมานจากคำนำหน้า" iconSize={11} />
                  </div>
                  {(() => {
                    const male = genderList.find((g) => g.label === "ชาย")?.value || 0;
                    const female = genderList.find((g) => g.label === "หญิง")?.value || 0;
                    const unknown = genderList.find((g) => g.label === "ไม่ระบุ")?.value || 0;
                    const totalGender = Math.max(employees.length, 1);
                    return (
                      <>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="flex h-4 w-4 lg:h-5 lg:w-5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] lg:text-xs font-bold leading-none text-white">♂</span>
                            <span className="text-sm lg:text-base font-black leading-none text-sky-700">{male}</span>
                            <span className="text-[9px] font-semibold text-slate-400">{formatPercent(male, totalGender)}</span>
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <span className="flex h-4 w-4 lg:h-5 lg:w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[10px] lg:text-xs font-bold leading-none text-white">♀</span>
                            <span className="text-sm lg:text-base font-black leading-none text-rose-600">{female}</span>
                            <span className="text-[9px] font-semibold text-slate-400">{formatPercent(female, totalGender)}</span>
                          </span>
                        </div>
                        {unknown > 0 && <div className="mt-0.5 text-[9px] leading-tight text-slate-400">ไม่ระบุ {unknown}</div>}
                      </>
                    );
                  })()}
                </div>
                <div className="col-span-2 sm:col-span-3 md:col-span-4 xl:col-span-5 bg-white rounded-lg border border-slate-200 px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
                    <div>
                      <div className="mb-1 inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500">
                        <span>อายุ</span>
                        <InfoTooltip content="อายุคำนวณจากวันเกิด (เฉพาะคนที่มีข้อมูลวันเกิด)" iconSize={11} />
                      </div>
                      <HorizontalBreakdown items={ageList} total={employees.length} accent="bg-amber-400" />
                    </div>
                    <div>
                      <div className="mb-1 inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500">
                        <span>อายุงาน</span>
                        <InfoTooltip content="อายุงานคำนวณจากวันที่เริ่มงาน (เฉพาะคนที่มีข้อมูลวันเริ่มงาน)" iconSize={11} />
                      </div>
                      <HorizontalBreakdown items={tenureList} total={employees.length} accent="bg-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
                <SectionCard
                  title="โครงสร้างกำลังคน"
                  subtitle="นับจาก employee master ที่มีสถานะทำงาน"
                  tooltip="แสดงสัดส่วนพนักงานตาม employee type เช่น Staff Monthly, DC Daily - Staff, DC Daily - Worker, Supply manpower และ Sub contractor"
                  headerAction={
                    <button
                      type="button"
                      onClick={() => setSidePanel({ key: "employee-type-members", title: "รายชื่อพนักงาน", subtitle: "ดูรายชื่อคนที่ระบบจัดเข้ากลุ่มนี้จาก employee_type/สถานะกลุ่มงาน", selectedKey: "Supply manpower" })}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      ดูรายชื่อ
                    </button>
                  }
                >
                  <HorizontalBreakdown
                    items={employeeTypeList}
                    total={employees.length}
                    accent="bg-sky-500"
                    dense
                    onItemClick={(item) =>
                      setSidePanel({
                        key: "employee-type-members",
                        title: "รายชื่อพนักงาน",
                        subtitle: "ดูรายชื่อจากผลการจัดกลุ่ม employee type ที่ dashboard ใช้อยู่จริง",
                        selectedKey: item.label,
                      })
                    }
                  />
                </SectionCard>
                <SectionCard title="แนวโน้มการมาทำงาน" subtitle="แถบสีเขียว=มา, แดง=ขาด, เหลือง=ลา, เทา=ค้าง/ผิดโครงการ" tooltip="กราฟสรุปรายวันในช่วงที่เลือก โดยดูจาก attendance records ของแต่ละวัน">
                  <MiniTrendChart rows={hrData.dailyTrend} maxValue={maxHrTrend} />
                </SectionCard>
              </div>
            </>
          )}

          {showOnlyRiskMonitoring && (
            <SectionCard title="ตัวกรองความเสี่ยง" subtitle="ใช้คัดกรองรายการพนักงานและโครงการเสี่ยงตามเงื่อนไขที่สนใจ" tooltip="ตัวกรองนี้กระทบทั้งรายการพนักงานเสี่ยงและโครงการเสี่ยงในหน้านี้">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Severity</label>
                  <select
                    value={riskSeverityFilter}
                    onChange={(e) => setRiskSeverityFilter(e.target.value as "all" | RiskSeverity)}
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="critical">วิกฤต</option>
                    <option value="high">เสี่ยงสูง</option>
                    <option value="risk">เสี่ยง</option>
                    <option value="watch">เฝ้าระวัง</option>
                    <option value="normal">ปกติ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">โครงการ</label>
                  <select
                    value={riskProjectFilter}
                    onChange={(e) => setRiskProjectFilter(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    <option value="all">ทุกโครงการ</option>
                    {filteredProjectOptions.map((project) => (
                      <option key={project} value={project}>
                        {project}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">ประเภทพนักงาน</label>
                  <select
                    value={riskEmployeeTypeFilter}
                    onChange={(e) => setRiskEmployeeTypeFilter(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-sky-300 outline-none"
                  >
                    <option value="all">ทุกประเภท</option>
                    {riskEmployeeTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
            <SectionCard
              title="ภาพรวมระดับความเสี่ยงพนักงาน"
              subtitle="สรุปจำนวนพนักงานที่ต้องติดตาม แยกตามระดับความเสี่ยง"
              tooltip="นับจากพนักงานที่มี risk score เข้าเกณฑ์ต้องติดตาม แบ่งเป็น วิกฤต/เสี่ยงสูง/เสี่ยง/เฝ้าระวัง ตามคะแนนรวม (ตัวเลข = จำนวนคน)"
            >
              <DonutChart
                data={riskSeverityDonutData}
                centerValue={filteredRiskEmployees.length}
                centerSub="คนที่ต้องติดตาม"
              />
            </SectionCard>
            {!showOnlyRiskMonitoring && (
              <SectionCard title="การกระจายพนักงานตามโครงการ" subtitle="อ้างอิงจากสถานะโครงการใน employee master" tooltip="นับจำนวนพนักงานตามสถานะโครงการที่ถูก assign ใน employee master">
                <HorizontalBreakdown items={topProjectAssignments} total={employees.length} accent="bg-indigo-400" />
              </SectionCard>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
            <SectionCard
              title="โครงการเสี่ยงจัดอันดับ"
              subtitle="Top 8 โครงการเรียงตามคะแนนความเสี่ยงรวม — กดที่แท่งเพื่อเปิด Project Dashboard"
              tooltip="คะแนนความเสี่ยงรวม (0-100) มาจากอัตราขาด + ค้างลงเวลา + ลา + ภาระ OT ในช่วงวิเคราะห์ สีแท่งสื่อระดับความเสี่ยง (วิกฤต=ม่วง, เสี่ยงสูง=แดง, เสี่ยง=ส้ม, เฝ้าระวัง=เหลือง)"
            >
              <RankedBarChart data={riskyProjectsBarData} onBarClick={openProjectDashboard} />
            </SectionCard>
            <SectionCard
              title="โครงการที่มีความเสี่ยง"
              subtitle={isSingleDayView ? "วิเคราะห์ย้อนหลัง 7 วัน เพื่อจับโครงการที่มี pattern เสี่ยงต่อเนื่อง" : "จะแสดงเฉพาะโครงการที่มีขาด ลา ค้างลงเวลา หรือ OT ในช่วงที่เลือก"}
              tooltip="ความเสี่ยงโครงการประเมินจาก absence rate, leave rate, missing rate และ OT รวมในช่วงที่เลือก"
              headerAction={
                <button
                  type="button"
                  onClick={() => setSidePanel({ key: "risk-projects", title: "โครงการที่มีความเสี่ยง", subtitle: "เจาะดูทุกโครงการที่มีคะแนนเสี่ยงและเปิดต่อไปยัง Project Dashboard ได้" })}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ดูทั้งหมด
                </button>
              }
            >
              <div className="space-y-2">
                {filteredRiskProjects.length === 0 ? (
                  <div className="text-sm text-slate-500">ไม่มีโครงการที่มีประเด็นความเสี่ยงในช่วงนี้</div>
                ) : filteredRiskProjects.slice(0, 5).map((project) => (
                  <button
                    key={project.project}
                    type="button"
                    onClick={() => setSidePanel({ key: "risk-projects", title: "โครงการที่มีความเสี่ยง", subtitle: "เจาะดูทุกโครงการที่มีคะแนนเสี่ยงและเปิดต่อไปยัง Project Dashboard ได้", selectedKey: project.project })}
                    className="block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-xs font-semibold text-slate-800">{project.project}</div>
                      <span className={`shrink-0 inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium ${severityBadgeClass[project.severity]}`}>
                        {severityLabelMap[project.severity]} | {project.totalScore}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="shrink-0 text-slate-500">กำลังคน {project.headcount} คน</span>
                      <span className="min-w-0 truncate text-right text-slate-500">
                        <span className="font-bold text-rose-600">ขาด {Math.round(project.absenceRate * 100)}%</span> · ลา {Math.round(project.leaveRate * 100)}% · ค้างลง {Math.round(project.missingRate * 100)}% · OT {project.otHours.toFixed(1)} ชม.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>

          {!showOnlyRiskMonitoring && (
            <SectionCard title="ความครบถ้วนของข้อมูล" subtitle="ใช้เพื่อตรวจว่าควรเติมข้อมูลใดก่อนสำหรับ analytics ระยะถัดไป" tooltip="ช่วยบอกว่าข้อมูลใดพร้อมแล้ว และข้อมูลใดต้องเก็บเพิ่มก่อน เช่น วันเกิด วันเริ่มงาน หรือเวลาเข้างานจริง">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  มีข้อมูลวันเกิด {employees.filter((emp) => !!emp.date_of_birth).length} / {employees.length} คน
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  มีข้อมูลวันเริ่มงาน {employees.filter((emp) => !!emp.start_date).length} / {employees.length} คน
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  ข้อมูลมาสาย {hrData.lateDataAvailable ? `พร้อมใช้งาน (${hrData.late} เหตุการณ์)` : "ยังไม่พร้อม ต้องเก็บ check-in time / late minutes เพิ่ม"}
                </div>
              </div>
            </SectionCard>
          )}

          <div className="grid grid-cols-1 gap-4">
            <SectionCard
              title="พนักงานที่ต้องติดตาม"
              subtitle={hrFollowUpSubtitle}
              tooltip="Risk score รวมจากหลายกฎ และใช้เรียงลำดับตาม severity > score > ขาดติดต่อกัน > incident ล่าสุด"
              headerAction={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSidePanel({ key: "risk-employees", title: "รายการพนักงานเสี่ยง", subtitle: "เรียงตาม severity และ score เพื่อใช้ติดตามเคสที่ควรดูต่อทันที" })}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    เปิด side panel
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRiskScoreGuide(true)}
                    className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                  >
                    ดูวิธีคิด Risk score
                  </button>
                </div>
              }
            >
              <div className="max-h-[420px] overflow-auto">
                {filteredRiskEmployees.length === 0 ? (
                  <div className="text-sm text-slate-500">ยังไม่พบพนักงานที่เข้าเกณฑ์ความเสี่ยงในช่วงนี้</div>
                ) : (
                    <table className="w-full min-w-[980px] text-[11px]">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 text-slate-600">
                          <th className="px-2 py-1.5 text-left font-semibold">ชื่อ</th>
                          <th className="px-2 py-1.5 text-left font-semibold">โครงการ</th>
                          <th className="px-2 py-1.5 text-left font-semibold">ตำแหน่ง/ประเภท</th>
                          <th className="px-2 py-1.5 text-center font-semibold">Score</th>
                          <th className="px-2 py-1.5 text-center font-semibold">ระดับ</th>
                          <th className="px-2 py-1.5 text-left font-semibold">สาเหตุหลัก</th>
                          <th className="px-2 py-1.5 text-center font-semibold">ล่าสุด</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRiskEmployees.map((risk) => (
                          <tr
                            key={risk.employeeId}
                            className="cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-sky-50"
                            onClick={() => setSidePanel({ key: "risk-employees", title: "รายการพนักงานเสี่ยง", subtitle: "เรียงตาม severity และ score เพื่อใช้ติดตามเคสที่ควรดูต่อทันที", selectedKey: risk.employeeId })}
                          >
                            <td className="px-2 py-2">
                              <div className="font-semibold text-slate-800">{risk.fullName}</div>
                              <div className="text-[11px] text-slate-500">{risk.employeeCode}</div>
                              {followUpCaseCountByEmployee[risk.employeeId] ? (
                                <div className="mt-1 text-[11px] text-sky-700">
                                  เคสติดตาม {followUpCaseCountByEmployee[risk.employeeId].total} · เปิดอยู่ {followUpCaseCountByEmployee[risk.employeeId].open}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              <div className="max-w-[180px] truncate text-slate-700" title={risk.projectNames.join(", ")}>
                                {risk.projectNames.length > 0 ? risk.projectNames.join(", ") : "-"}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <div className="text-slate-700">{risk.position || "-"}</div>
                              <div className="text-[11px] text-slate-500">{risk.employeeType || "-"}</div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className="inline-flex min-w-[42px] justify-center rounded-lg bg-slate-900 px-2 py-1 font-black text-white">
                                {risk.totalScore}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-flex rounded-full px-2 py-1 font-medium ${severityBadgeClass[risk.severity]}`}>
                                {severityLabelMap[risk.severity]}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1.5">
                                {risk.topReasons.map((reason) => (
                                  <span key={reason} className="inline-flex rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-slate-600">{formatShortThaiDate(risk.metrics.latestIncidentDate)}</td>
                            <td className="px-2 py-2 text-slate-700">
                              <div className="space-y-2">
                                <div>{risk.recommendedAction}</div>
                                {onOpenFollowUp ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenFollowUp(buildFollowUpRiskSeed(risk));
                                    }}
                                    className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                                  >
                                    {followUpCaseCountByEmployee[risk.employeeId]?.total ? "เปิดการติดตาม" : "เปิดในคิวติดตาม"}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                )}
              </div>
            </SectionCard>
            {isSingleDayView && !showOnlyRiskMonitoring && (
              <SectionCard
                title="พนักงานลา/ขาดวันนี้"
                subtitle="รายการ operation ของวันนี้จริง แยกจากกลุ่มพนักงานที่ต้องติดตาม"
                tooltip="ใช้ดูคนที่ลา/ขาดของวันปัจจุบันโดยตรง เพื่อไม่ให้ไปรวมกับผลวิเคราะห์ follow-up ย้อนหลัง"
              >
                {hrData.todayAbsentLeaveRows.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    วันนี้ยังไม่พบพนักงานที่ลา/ขาด
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full min-w-[760px] text-[11px]">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 text-slate-600">
                          <th className="px-2 py-1.5 text-left font-semibold">ชื่อ</th>
                          <th className="px-2 py-1.5 text-left font-semibold">โครงการ</th>
                          <th className="px-2 py-1.5 text-left font-semibold">ตำแหน่ง/ประเภท</th>
                          <th className="px-2 py-1.5 text-center font-semibold">สถานะวันนี้</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hrData.todayAbsentLeaveRows.map((row) => (
                          <tr key={`${row.employeeId}-${row.status}`} className="border-t border-slate-100">
                            <td className="px-2 py-2">
                              <div className="font-semibold text-slate-800">{row.fullName}</div>
                              <div className="text-[11px] text-slate-500">{row.employeeCode}</div>
                            </td>
                            <td className="px-2 py-2 text-slate-700">{row.projectNames.join(", ") || "-"}</td>
                            <td className="px-2 py-2">
                              <div className="text-slate-700">{row.position}</div>
                              <div className="text-[11px] text-slate-500">{row.employeeType}</div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-flex rounded-full px-2 py-1 font-medium ${row.status === "ไม่มา" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      ) : (
        <div className="p-2 space-y-2 lg:p-3 lg:space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm">
              <div className="flex items-start justify-between gap-1.5 lg:gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500">
                    <span>{isSingleDayView ? "คนมาทำงานวันนี้" : "จำนวนมาทำงานรวม"}</span>
                    <InfoTooltip
                      content="ตัวเลขหลักคือจำนวนมาทำงานของโครงการในช่วงที่เลือก ส่วนกำลังคนประจำโครงการคือจำนวนคนที่ assign อยู่ในโครงการ และอัตรามาทำงาน = จำนวนมา / scheduled workforce"
                      iconSize={11}
                    />
                  </div>
                  <div className="mt-0.5 text-base lg:text-[22px] leading-none font-black text-emerald-700">{projectData.present}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] lg:text-[10px] leading-tight lg:leading-4 text-slate-500">
                    <span>กำลังคน <span className="font-bold text-slate-800">{projectData.scopedEmployees.length}</span></span>
                    <span className="text-slate-300">·</span>
                    <span>อัตรามา <span className="font-bold text-emerald-700">{formatPercent(projectData.present, projectData.totalSlots)}</span></span>
                  </div>
                </div>
                <div className="hidden lg:block rounded-md border border-emerald-200 bg-emerald-50 p-1">
                  <CheckCircle size={14} className="text-emerald-700" />
                </div>
              </div>
            </div>
            <MetricCard title="ขาด" value={projectData.absent} subvalue={formatPercent(projectData.absent, projectData.totalSlots)} icon={XCircle} accent="text-rose-700" tooltip="จำนวนขาดของพนักงานที่ assign อยู่ในโครงการนี้ในช่วงที่เลือก" onClick={() => setMetricModal({ key: "project-absent", title: `รายละเอียดการขาดของ ${selectedProjectLabel}`, subtitle: "ดูรายชื่อคนที่ขาดในโครงการนี้ตามช่วงวันที่เลือก" })} />
            <MetricCard title="ลา" value={projectData.leave} subvalue={formatPercent(projectData.leave, projectData.totalSlots)} icon={AlertCircle} accent="text-amber-700" tooltip="จำนวนลาของพนักงานที่ assign อยู่ในโครงการนี้ในช่วงที่เลือก" onClick={() => setMetricModal({ key: "project-leave", title: `รายละเอียดการลาของ ${selectedProjectLabel}`, subtitle: "ดูรายชื่อคนที่ลาของโครงการนี้ในช่วงวันที่เลือก" })} />
            <MetricCard title="ค้าง/ผิดโครงการ" value={projectData.notRecorded + projectData.wrongProject} subvalue={`ค้าง ${projectData.notRecorded} | ผิดโครงการ ${projectData.wrongProject}`} icon={Clock} accent="text-slate-700" tooltip="ค้าง = ไม่มี attendance record, ผิดโครงการ = มาทำงานแต่ลงโครงการอื่น" onClick={() => setMetricModal({ key: "project-pending", title: `รายละเอียดค้าง/ผิดโครงการของ ${selectedProjectLabel}`, subtitle: "แยกดูคนที่ยังไม่ลงเวลาและคนที่ลงผิดโครงการ" })} />
            <MetricCard title="OT รวม" value={projectData.totalOtHours.toFixed(1)} subvalue={`มี OT ${projectData.otEmployees} คน`} icon={BarChart3} accent="text-sky-700" tooltip="รวมชั่วโมง OT ของพนักงานในโครงการนี้ตามช่วงวันที่ที่เลือก" onClick={() => setMetricModal({ key: "project-ot", title: `รายละเอียด OT ของ ${selectedProjectLabel}`, subtitle: "ดูคนที่มี OT สูงและภาระ OT ของโครงการ" })} />
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm">
              <div className="inline-flex items-center gap-1 text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500">
                <span>เพศ</span>
                <InfoTooltip content="สัดส่วนเพศของพนักงานที่ assign อยู่ในโครงการนี้ ใช้ field เพศ/gender หรืออนุมานจากคำนำหน้า" iconSize={11} />
              </div>
              {(() => {
                const male = projectData.genderCounts["ชาย"] || 0;
                const female = projectData.genderCounts["หญิง"] || 0;
                const unknown = projectData.genderCounts["ไม่ระบุ"] || 0;
                return (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="flex h-5 w-5 lg:h-6 lg:w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs lg:text-sm font-bold leading-none text-white">♂</span>
                        <span className="text-base lg:text-lg font-black leading-none text-sky-700">{male}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="flex h-5 w-5 lg:h-6 lg:w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs lg:text-sm font-bold leading-none text-white">♀</span>
                        <span className="text-base lg:text-lg font-black leading-none text-rose-600">{female}</span>
                      </div>
                    </div>
                    {unknown > 0 && <div className="mt-1 text-[9px] lg:text-[10px] leading-tight lg:leading-4 text-slate-400">ไม่ระบุ {unknown} คน</div>}
                  </>
                );
              })()}
            </div>
          </div>

          {(() => {
            const toggleExpand = (key: string) =>
              setExpandedTypeBreakdown((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              });
            const toggleDepartment = (key: string) =>
              setExpandedDepartmentBreakdown((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              });
            const togglePosition = (key: string) =>
              setExpandedPositionBreakdown((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              });
            const sortedBreakdown = [...projectData.breakdownByType]
              .map((row) => {
                const issueCount = row.absent + row.leave + row.notRecorded + row.wrongProject;
                const headcount = Math.max(row.employees, 1);
                return { ...row, issueCount, presentRate: row.present / headcount, issueRate: issueCount / headcount };
              })
              .sort((a, b) => b.issueRate - a.issueRate || b.issueCount - a.issueCount || b.otHours - a.otHours || a.label.localeCompare(b.label, "th"));
            const sortedDepartments = [...projectData.breakdownByDepartment]
              .map((row) => {
                const issueCount = row.absent + row.leave + row.notRecorded + row.wrongProject;
                const headcount = Math.max(row.employees, 1);
                const slots = row.present + row.absent + row.leave + row.notRecorded + row.wrongProject;
                const denomDays = Math.max(slots, 1);
                return {
                  ...row,
                  issueCount,
                  presentRate: row.present / headcount,
                  issueRate: issueCount / headcount,
                  slots,
                  presentDayRate: row.present / denomDays,
                  lateDayRate: row.late / denomDays,
                  absentDayRate: row.absent / denomDays,
                  leaveDayRate: row.leave / denomDays,
                  pendingDayRate: (row.notRecorded + row.wrongProject) / denomDays,
                  issueDayRate: issueCount / denomDays,
                };
              })
              .sort((a, b) =>
                isSingleDayView
                  ? b.issueRate - a.issueRate || b.issueCount - a.issueCount || a.label.localeCompare(b.label, "th")
                  : b.issueDayRate - a.issueDayRate || b.issueCount - a.issueCount || a.label.localeCompare(b.label, "th")
              );
            const employeesByPosition: Record<string, typeof projectData.projectEmployeeStatusRows> = {};
            projectData.projectEmployeeStatusRows.forEach((r) => {
              const key = r.position && r.position !== "-" ? r.position : "ไม่ระบุ";
              (employeesByPosition[key] = employeesByPosition[key] || []).push(r);
            });
            const isToday = isSingleDayView;
            return (
              <div className={`grid grid-cols-1 gap-2 lg:gap-4 ${isToday ? "lg:grid-cols-2" : ""}`}>
                {isToday && (
                <div>
              <SectionCard
                title="สรุปตามประเภทพนักงาน"
                subtitle="เรียงตามกลุ่มที่มีปัญหามากสุด — กดลูกศรเพื่อดูชื่อชุดแรงงาน"
                tooltip="ปัญหา = ขาด + ลา + ค้างลงเวลา + ผิดโครงการ | % มา = มา / คนในกลุ่ม | % ปัญหา = ปัญหา / คนในกลุ่ม | ชื่อชุดแรงงานมีสำหรับ Sub contractor, Supply manpower และ DC Daily - Worker"
              >
                {sortedBreakdown.length === 0 ? (
                  <div className="text-sm text-slate-500">ยังไม่มีข้อมูลประเภทพนักงานในโครงการนี้</div>
                ) : (
                  <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:overflow-visible sm:px-0">
                    <table className="w-full min-w-[520px] sm:min-w-0 table-fixed text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] text-slate-600">
                          <th className="w-4 px-0.5 py-1.5" />
                          <th className="px-1 py-1.5 text-left font-semibold">ประเภท</th>
                          <th className="w-8 px-1 py-1.5 text-center font-semibold">คน</th>
                          <th className="w-8 px-1 py-1.5 text-center font-semibold">มา</th>
                          <th className="w-12 px-1 py-1.5 text-center font-semibold">% มา</th>
                          <th className="w-8 px-1 py-1.5 text-center font-semibold">ขาด</th>
                          <th className="w-8 px-1 py-1.5 text-center font-semibold">ลา</th>
                          <th className="w-8 px-1 py-1.5 text-center font-semibold">ค้าง</th>
                          <th className="w-12 px-1 py-1.5 text-center font-semibold">% ปัญหา</th>
                          <th className="w-10 px-1 py-1.5 text-right font-semibold">OT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBreakdown.map((row) => {
                          const isHighRisk = row.issueRate >= 0.3 || row.issueCount >= 2;
                          const isWatch = !isHighRisk && (row.issueRate > 0 || row.issueCount > 0);
                          const rowTone = isHighRisk
                            ? "bg-rose-50/80 border-t border-rose-100"
                            : isWatch
                              ? "bg-amber-50/50 border-t border-amber-100"
                              : "border-t border-slate-100";
                          const groupEntries = Object.entries(row.laborGroupStats).sort(([a], [b]) => a.localeCompare(b, "th"));
                          const hasGroups = groupEntries.length > 0;
                          const isExpanded = expandedTypeBreakdown.has(row.key);
                          return (
                            <React.Fragment key={row.key}>
                              <tr className={rowTone}>
                                <td className="px-1 py-1.5 text-center">
                                  {hasGroups ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(row.key)}
                                      className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                      title={isExpanded ? "พับ" : "ขยายดูชื่อชุด"}
                                    >
                                      <span className="text-[9px] font-bold">{isExpanded ? "▲" : "▼"}</span>
                                    </button>
                                  ) : null}
                                </td>
                                <td className="px-1 py-1.5 font-medium text-slate-800">
                                  <div className="flex items-center gap-1">
                                    <span className="truncate">{row.label}</span>
                                    {isHighRisk && (
                                      <span className="shrink-0 rounded bg-rose-100 px-1 py-0 text-[9px] font-bold text-rose-700">ต้องดู</span>
                                    )}
                                    {isWatch && (
                                      <span className="shrink-0 rounded bg-amber-100 px-1 py-0 text-[9px] font-bold text-amber-700">เฝ้า</span>
                                    )}
                                    {hasGroups && (
                                      <span className="shrink-0 text-[9px] text-slate-400">{groupEntries.length} ชุด</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-1 py-1.5 text-center">{row.employees}</td>
                                <td className="px-1 py-1.5 text-center text-emerald-700 font-semibold">{row.present}</td>
                                <td className={`px-1 py-1.5 text-center font-semibold ${row.presentRate >= 0.9 ? "text-emerald-700" : row.presentRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                  {formatPercent(row.present, Math.max(row.employees, 1))}
                                </td>
                                <td className="px-1 py-1.5 text-center text-rose-700">{row.absent}</td>
                                <td className="px-1 py-1.5 text-center text-amber-700">{row.leave}</td>
                                <td className="px-1 py-1.5 text-center text-slate-600">{row.notRecorded + row.wrongProject}</td>
                                <td className={`px-1 py-1.5 text-center font-semibold ${isHighRisk ? "text-rose-700" : isWatch ? "text-amber-700" : "text-slate-600"}`}>
                                  {formatPercent(row.issueCount, Math.max(row.employees, 1))}
                                </td>
                                <td className="px-1 py-1.5 text-right font-semibold text-sky-700">{row.otHours.toFixed(1)}</td>
                              </tr>
                              {hasGroups && isExpanded && groupEntries.map(([groupName, gs]) => {
                                const gIssue = gs.absent + gs.leave + gs.notRecorded + gs.wrongProject;
                                const gPresRate = gs.employees > 0 ? gs.present / gs.employees : 0;
                                const gBad = gPresRate < 0.7 || gIssue >= 2;
                                const gWatch = !gBad && gIssue > 0;
                                const groupTone = gBad ? "bg-rose-50/40" : gWatch ? "bg-amber-50/30" : "bg-slate-50/40";
                                return (
                                  <tr key={`${row.key}-${groupName}`} className={`border-t border-slate-100 text-[10px] ${groupTone}`}>
                                    <td />
                                    <td className="py-1 pl-6 pr-2 text-slate-600">
                                      <span className="mr-1 text-slate-300">└</span>
                                      {groupName}
                                    </td>
                                    <td className="px-2 py-1 text-center text-slate-600">{gs.employees}</td>
                                    <td className="px-2 py-1 text-center font-semibold text-emerald-700">{gs.present}</td>
                                    <td className={`px-2 py-1 text-center font-semibold ${gPresRate >= 0.9 ? "text-emerald-700" : gPresRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                      {formatPercent(gs.present, Math.max(gs.employees, 1))}
                                    </td>
                                    <td className="px-2 py-1 text-center text-rose-700">{gs.absent}</td>
                                    <td className="px-2 py-1 text-center text-amber-700">{gs.leave}</td>
                                    <td className="px-2 py-1 text-center text-slate-600">{gs.notRecorded + gs.wrongProject}</td>
                                    <td className={`px-2 py-1 text-center font-semibold ${gBad ? "text-rose-700" : gWatch ? "text-amber-700" : "text-slate-500"}`}>
                                      {formatPercent(gIssue, Math.max(gs.employees, 1))}
                                    </td>
                                    <td className="px-2 py-1 text-right font-semibold text-sky-700">{gs.otHours.toFixed(1)}</td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
                </div>
                )}
                <div>
                  <SectionCard
                    title="ตำแหน่งหลักในโครงการ"
                    subtitle={
                      isSingleDayView
                        ? "สรุปรายวัน — กดลูกศรเพื่อดูรายชื่อพนักงาน"
                        : `สรุปรายเดือน (${projectData.workDaysCount} วันทำงาน) — % คิดจากสัดส่วนวันในเดือน เรียงตำแหน่งที่มีปัญหามากขึ้นก่อน`
                    }
                    tooltip={
                      isSingleDayView
                        ? "ปัญหา = ขาด + ลา + ค้างลงเวลา + ผิดโครงการ | % มา = มา / คนในตำแหน่ง | % ปัญหา = ปัญหา / คนในตำแหน่ง | กดขยายเพื่อดูรายชื่อพนักงานในตำแหน่งนั้น"
                        : "มุมมองรายเดือน: % คิดจากจำนวนวันทำงาน (employee-days) ทั้งเดือนของตำแหน่งนั้น เช่น % ขาด = วันที่ขาด / วันทำงานรวมของตำแหน่ง | % สาย ต้องมีข้อมูลเวลาเข้างานจึงจะแสดง | % ปัญหา = (ขาด+ลา+ค้าง+ผิดโครงการ) / วันทำงานรวม"
                    }
                  >
                    {sortedDepartments.length === 0 ? (
                      <div className="text-sm text-slate-500">ยังไม่มีข้อมูลตำแหน่งในโครงการนี้</div>
                    ) : (
                      <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:overflow-visible sm:px-0">
                        <table className="w-full min-w-[520px] sm:min-w-0 table-fixed text-[11px]">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] text-slate-600">
                              <th className="w-4 px-0.5 py-1.5" />
                              <th className="px-1 py-1.5 text-left font-semibold">แผนก / ตำแหน่ง</th>
                              <th className="w-8 px-1 py-1.5 text-center font-semibold">คน</th>
                              {isSingleDayView ? (
                                <>
                                  <th className="w-8 px-1 py-1.5 text-center font-semibold">มา</th>
                                  <th className="w-12 px-1 py-1.5 text-center font-semibold">% มา</th>
                                  <th className="w-8 px-1 py-1.5 text-center font-semibold">ขาด</th>
                                  <th className="w-8 px-1 py-1.5 text-center font-semibold">ลา</th>
                                  <th className="w-8 px-1 py-1.5 text-center font-semibold">ค้าง</th>
                                </>
                              ) : (
                                <>
                                  <th className="w-11 px-1 py-1.5 text-center font-semibold">% มา</th>
                                  <th className="w-11 px-1 py-1.5 text-center font-semibold">% สาย</th>
                                  <th className="w-11 px-1 py-1.5 text-center font-semibold">% ขาด</th>
                                  <th className="w-11 px-1 py-1.5 text-center font-semibold">% ลา</th>
                                  <th className="w-11 px-1 py-1.5 text-center font-semibold">% ค้าง</th>
                                </>
                              )}
                              <th className="w-12 px-1 py-1.5 text-center font-semibold">% ปัญหา</th>
                              <th className="w-10 px-1 py-1.5 text-right font-semibold">OT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedDepartments.map((deptRow) => {
                              const isDeptExpanded = expandedDepartmentBreakdown.has(deptRow.key);
                              const isHighRisk = isSingleDayView
                                ? deptRow.issueRate >= 0.3 || deptRow.issueCount >= 2
                                : deptRow.issueDayRate >= 0.2;
                              const isWatch = !isHighRisk && (isSingleDayView ? deptRow.issueRate > 0 || deptRow.issueCount > 0 : deptRow.issueDayRate > 0);
                              const rowTone = isHighRisk
                                ? "bg-rose-50/80 border-t border-rose-100"
                                : isWatch
                                  ? "bg-amber-50/50 border-t border-amber-100"
                                  : "border-t border-slate-100";
                              
                              const positions = Object.entries(deptRow.laborGroupStats).sort((a, b) => b[1].employees - a[1].employees || a[0].localeCompare(b[0], "th"));
                              const hasPositions = positions.length > 0;

                              return (
                                <React.Fragment key={deptRow.key}>
                                  <tr className={rowTone}>
                                    <td className="px-1 py-1.5 text-center">
                                      {hasPositions ? (
                                        <button
                                          type="button"
                                          onClick={() => toggleDepartment(deptRow.key)}
                                          className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                          title={isDeptExpanded ? "พับ" : "ขยายดูตำแหน่ง"}
                                        >
                                          <span className="text-[9px] font-bold">{isDeptExpanded ? "▲" : "▼"}</span>
                                        </button>
                                      ) : null}
                                    </td>
                                    <td className="px-1 py-1.5 font-medium text-slate-800">
                                      <div className="flex items-center gap-1">
                                        <span className="truncate">{deptRow.label}</span>
                                        {isHighRisk && (
                                          <span className="shrink-0 rounded bg-rose-100 px-1 py-0 text-[9px] font-bold text-rose-700">ต้องดู</span>
                                        )}
                                        {isWatch && (
                                          <span className="shrink-0 rounded bg-amber-100 px-1 py-0 text-[9px] font-bold text-amber-700">เฝ้า</span>
                                        )}
                                        {hasPositions && (
                                          <span className="shrink-0 text-[9px] text-slate-400">{positions.length} ตำแหน่ง</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-1 py-1.5 text-center">{deptRow.employees}</td>
                                    {isSingleDayView ? (
                                      <>
                                        <td className="px-1 py-1.5 text-center text-emerald-700 font-semibold">{deptRow.present}</td>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${deptRow.presentRate >= 0.9 ? "text-emerald-700" : deptRow.presentRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                          {formatPercent(deptRow.present, Math.max(deptRow.employees, 1))}
                                        </td>
                                        <td className="px-1 py-1.5 text-center text-rose-700">{deptRow.absent}</td>
                                        <td className="px-1 py-1.5 text-center text-amber-700">{deptRow.leave}</td>
                                        <td className="px-1 py-1.5 text-center text-slate-600">{deptRow.notRecorded + deptRow.wrongProject}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${deptRow.presentDayRate >= 0.9 ? "text-emerald-700" : deptRow.presentDayRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                          {formatPercent(deptRow.present, Math.max(deptRow.slots, 1))}
                                        </td>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${!projectData.lateDataAvailable ? "text-slate-300" : deptRow.lateDayRate > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                          {projectData.lateDataAvailable ? formatPercent(deptRow.late, Math.max(deptRow.slots, 1)) : "—"}
                                        </td>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${deptRow.absentDayRate > 0 ? "text-rose-700" : "text-slate-400"}`}>
                                          {formatPercent(deptRow.absent, Math.max(deptRow.slots, 1))}
                                        </td>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${deptRow.leaveDayRate > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                          {formatPercent(deptRow.leave, Math.max(deptRow.slots, 1))}
                                        </td>
                                        <td className={`px-1 py-1.5 text-center font-semibold ${deptRow.pendingDayRate > 0 ? "text-slate-600" : "text-slate-400"}`}>
                                          {formatPercent(deptRow.notRecorded + deptRow.wrongProject, Math.max(deptRow.slots, 1))}
                                        </td>
                                      </>
                                    )}
                                    <td className={`px-1 py-1.5 text-center font-semibold ${isHighRisk ? "text-rose-700" : isWatch ? "text-amber-700" : "text-slate-600"}`}>
                                      {isSingleDayView
                                        ? formatPercent(deptRow.issueCount, Math.max(deptRow.employees, 1))
                                        : formatPercent(deptRow.issueCount, Math.max(deptRow.slots, 1))}
                                    </td>
                                    <td className="px-1 py-1.5 text-right font-semibold text-sky-700">{deptRow.otHours.toFixed(1)}</td>
                                  </tr>
                                  
                                  {hasPositions && isDeptExpanded && positions.map(([posName, posStats]) => {
                                    const pIssue = posStats.absent + posStats.leave + posStats.notRecorded + posStats.wrongProject;
                                    const pSlots = isSingleDayView ? posStats.employees : posStats.present + posStats.absent + posStats.leave + posStats.notRecorded + posStats.wrongProject;
                                    const pDenomSlots = isSingleDayView ? 0 : posStats.present + posStats.absent + posStats.leave + posStats.notRecorded + posStats.wrongProject;
                                    const pDenom = isSingleDayView ? Math.max(posStats.employees, 1) : Math.max(pDenomSlots, 1);
                                    const pPresRate = posStats.present / pDenom;
                                    const pIssueRate = pIssue / pDenom;
                                    const pBad = isSingleDayView ? pIssueRate >= 0.3 || pIssue >= 2 : pIssueRate >= 0.2;
                                    const pWatch = !pBad && pIssue > 0;
                                    const pTone = pBad ? "bg-rose-50/40 border-t border-rose-50" : pWatch ? "bg-amber-50/30 border-t border-amber-50" : "bg-slate-50/40 border-t border-slate-100";
                                    
                                    const members = employeesByPosition[posName] || [];
                                    const isPosExpanded = expandedPositionBreakdown.has(`${deptRow.key}-${posName}`);
                                    
                                    return (
                                      <React.Fragment key={`${deptRow.key}-${posName}`}>
                                        <tr className={`text-[10px] ${pTone}`}>
                                          <td className="px-1 py-1.5 text-center border-r border-slate-100/50">
                                            {members.length > 0 ? (
                                              <button
                                                type="button"
                                                onClick={() => togglePosition(`${deptRow.key}-${posName}`)}
                                                className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                                title={isPosExpanded ? "พับ" : "ขยายดูรายชื่อ"}
                                              >
                                                <span className="text-[9px] font-bold">{isPosExpanded ? "▲" : "▼"}</span>
                                              </button>
                                            ) : null}
                                          </td>
                                          <td className="py-1 pl-4 pr-2 text-slate-700">
                                            <span className="mr-1 text-slate-300">└</span>
                                            {posName}
                                          </td>
                                          <td className="px-2 py-1 text-center text-slate-600">{posStats.employees}</td>
                                          {isSingleDayView ? (
                                            <>
                                              <td className="px-2 py-1 text-center font-semibold text-emerald-700">{posStats.present}</td>
                                              <td className={`px-2 py-1 text-center font-semibold ${pPresRate >= 0.9 ? "text-emerald-700" : pPresRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                                {formatPercent(posStats.present, pDenom)}
                                              </td>
                                              <td className="px-2 py-1 text-center text-rose-700">{posStats.absent}</td>
                                              <td className="px-2 py-1 text-center text-amber-700">{posStats.leave}</td>
                                              <td className="px-2 py-1 text-center text-slate-600">{posStats.notRecorded + posStats.wrongProject}</td>
                                            </>
                                          ) : (
                                            <>
                                              <td className={`px-2 py-1 text-center font-semibold ${pPresRate >= 0.9 ? "text-emerald-700" : pPresRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                                {formatPercent(posStats.present, pDenom)}
                                              </td>
                                              <td className={`px-2 py-1 text-center font-semibold ${!projectData.lateDataAvailable ? "text-slate-300" : posStats.late > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                                {projectData.lateDataAvailable ? formatPercent(posStats.late, pDenom) : "—"}
                                              </td>
                                              <td className={`px-2 py-1 text-center font-semibold ${posStats.absent > 0 ? "text-rose-700" : "text-slate-400"}`}>
                                                {formatPercent(posStats.absent, pDenom)}
                                              </td>
                                              <td className={`px-2 py-1 text-center font-semibold ${posStats.leave > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                                {formatPercent(posStats.leave, pDenom)}
                                              </td>
                                              <td className={`px-2 py-1 text-center font-semibold ${posStats.notRecorded + posStats.wrongProject > 0 ? "text-slate-600" : "text-slate-400"}`}>
                                                {formatPercent(posStats.notRecorded + posStats.wrongProject, pDenom)}
                                              </td>
                                            </>
                                          )}
                                          <td className={`px-2 py-1 text-center font-semibold ${pBad ? "text-rose-700" : pWatch ? "text-amber-700" : "text-slate-500"}`}>
                                            {formatPercent(pIssue, pDenom)}
                                          </td>
                                          <td className="px-2 py-1 text-right font-semibold text-sky-700">{posStats.otHours.toFixed(1)}</td>
                                        </tr>
                                        {isPosExpanded && members.length > 0 && (
                                          isSingleDayView ? (
                                            [...members]
                                              .sort((a, b) => a.fullName.localeCompare(b.fullName, "th"))
                                              .map((m) => {
                                                const mIssue = m.absentDays + m.leaveDays + m.notRecordedDays + m.wrongProjectDays;
                                                const mSlots = m.presentDays + mIssue;
                                                const mPresRate = mSlots > 0 ? m.presentDays / mSlots : 0;
                                                const mIssueRate = mSlots > 0 ? mIssue / mSlots : 0;
                                                const mBad = mIssueRate >= 0.3 || mIssue >= 2;
                                                const mWatch = !mBad && mIssue > 0;
                                                const memberTone = mBad ? "bg-rose-50/40" : mWatch ? "bg-amber-50/30" : "bg-slate-50/40";
                                                return (
                                                  <tr key={`${deptRow.key}-${posName}-${m.employeeId}`} className={`border-t border-slate-100 text-[10px] ${memberTone}`}>
                                                    <td className="border-r border-slate-100/50" />
                                                    <td className="py-1 pl-8 pr-1 text-slate-600">
                                                      <div className="flex items-center gap-1">
                                                        <span className="shrink-0 text-slate-300">└</span>
                                                        <span className="truncate">
                                                          <span className="text-slate-400">{m.employeeCode}</span> {m.fullName}
                                                        </span>
                                                      </div>
                                                    </td>
                                                    <td className="px-1 py-1 text-center text-slate-300">–</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.presentDays > 0 ? "text-emerald-700" : "text-slate-300"}`}>{m.presentDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${mPresRate >= 0.9 ? "text-emerald-700" : mPresRate >= 0.7 ? "text-amber-700" : "text-rose-700"}`}>
                                                      {formatPercent(m.presentDays, Math.max(mSlots, 1))}
                                                    </td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.absentDays > 0 ? "text-rose-700" : "text-slate-300"}`}>{m.absentDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.leaveDays > 0 ? "text-amber-700" : "text-slate-300"}`}>{m.leaveDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.notRecordedDays + m.wrongProjectDays > 0 ? "text-slate-600" : "text-slate-300"}`}>{m.notRecordedDays + m.wrongProjectDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${mBad ? "text-rose-700" : mWatch ? "text-amber-700" : "text-slate-400"}`}>
                                                      {formatPercent(mIssue, Math.max(mSlots, 1))}
                                                    </td>
                                                    <td className="px-1 py-1 text-right font-semibold text-sky-700">{m.otHours.toFixed(1)}</td>
                                                  </tr>
                                                );
                                              })
                                          ) : (
                                            [...members]
                                              .sort(
                                                (a, b) =>
                                                  (b.absentDays + b.leaveDays + b.notRecordedDays + b.wrongProjectDays) -
                                                    (a.absentDays + a.leaveDays + a.notRecordedDays + a.wrongProjectDays) ||
                                                  b.presentDays - a.presentDays ||
                                                  a.fullName.localeCompare(b.fullName, "th")
                                              )
                                              .map((m) => {
                                                const mIssue = m.absentDays + m.leaveDays + m.notRecordedDays + m.wrongProjectDays;
                                                const mSlots = m.presentDays + mIssue;
                                                const mIssueRate = mSlots > 0 ? mIssue / mSlots : 0;
                                                const mBad = mIssueRate >= 0.3 || mIssue >= 3;
                                                const mWatch = !mBad && mIssue > 0;
                                                const memberTone = mBad ? "bg-rose-50/40" : mWatch ? "bg-amber-50/30" : "bg-slate-50/40";
                                                return (
                                                  <tr key={`${deptRow.key}-${posName}-${m.employeeId}`} className={`border-t border-slate-100 text-[10px] ${memberTone}`}>
                                                    <td className="border-r border-slate-100/50" />
                                                    <td className="py-1 pl-8 pr-1 text-slate-600">
                                                      <div className="flex items-center gap-1">
                                                        <span className="shrink-0 text-slate-300">└</span>
                                                        <span className="truncate">
                                                          <span className="text-slate-400">{m.employeeCode}</span> {m.fullName}
                                                        </span>
                                                      </div>
                                                    </td>
                                                    <td className="px-1 py-1 text-center text-slate-300">–</td>
                                                    <td className="px-1 py-1 text-center font-semibold text-emerald-700">{m.presentDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${!projectData.lateDataAvailable ? "text-slate-300" : m.lateDays > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                                      {projectData.lateDataAvailable ? m.lateDays : "—"}
                                                    </td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.absentDays > 0 ? "text-rose-700" : "text-slate-300"}`}>{m.absentDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.leaveDays > 0 ? "text-amber-700" : "text-slate-300"}`}>{m.leaveDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${m.notRecordedDays + m.wrongProjectDays > 0 ? "text-slate-600" : "text-slate-300"}`}>{m.notRecordedDays + m.wrongProjectDays}</td>
                                                    <td className={`px-1 py-1 text-center font-semibold ${mBad ? "text-rose-700" : mWatch ? "text-amber-700" : "text-slate-400"}`}>
                                                      {formatPercent(mIssue, Math.max(mSlots, 1))}
                                                    </td>
                                                    <td className="px-1 py-1 text-right font-semibold text-sky-700">{m.otHours.toFixed(1)}</td>
                                                  </tr>
                                                );
                                              })
                                          )
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            );
          })()}

          <SectionCard
            title={isSingleDayView ? "Coverage Trend รายเดือน" : "Coverage Trend"}
            subtitle={`${isSingleDayView ? "แสดงเดือนนี้เพื่อดูแนวโน้มต่อเนื่อง" : "ดู coverage ตามช่วงที่เลือก"} | target เฉลี่ย ${projectData.coverageTargetPerDay.toFixed(1)} คน/วัน`}
            tooltip="ถ้ามี required manpower จะใช้เป็น target รายวันทันที ถ้าไม่มีแต่มี role plan จะใช้ target รายวันจาก baseline + adjustments และถ้ายังไม่มีทั้งคู่จึง fallback ไปใช้ assigned headcount"
          >
            {projectData.coverageTrend.length === 0 ? (
              <div className="text-sm text-slate-500">ยังไม่มีข้อมูล coverage รายวันในช่วงนี้</div>
            ) : (
              <div className="space-y-2 lg:space-y-3">
                <div className="overflow-x-auto">
                  <div className="flex min-w-max items-end gap-1 lg:gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 lg:p-3">
                    {projectData.coverageTrend.map((row) => {
                      const tone = getCoverageRiskTone(row.coverageRate);
                      const isTodayMarker = isSingleDayView && row.date === todayReferenceDate;
                      const barPct = row.coverageRate <= 0
                        ? 12
                        : Math.max(18, Math.min(row.coverageRate * 100, 100));
                      return (
                        <div
                          key={row.date}
                          className={`flex w-8 lg:w-10 shrink-0 flex-col items-center rounded-md px-0.5 py-1 lg:px-1 ${isTodayMarker ? "bg-sky-100 ring-1 ring-sky-300" : ""}`}
                        >
                          <div className={`mb-1 inline-flex rounded px-1 py-0.5 text-[8px] lg:text-[9px] font-bold ${tone.emphasis}`}>
                            {formatPercent(row.present, row.required)}
                          </div>
                          <div className="flex h-12 lg:h-20 w-full items-end justify-center">
                            <div
                              className={`w-4 lg:w-5 rounded-t ${tone.bar} ${isTodayMarker ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-sky-100" : ""}`}
                              style={{ height: `${barPct}%` }}
                              title={`${row.label}: ${row.present}/${row.required} | gap ${row.gapHeadcount} คน`}
                            />
                          </div>
                          <div className={`mt-1 text-[9px] lg:text-[10px] font-medium ${isTodayMarker ? "text-sky-800" : "text-slate-700"}`}>{row.label}</div>
                          <div className={`text-[8px] lg:text-[9px] ${tone.subtext}`}>{row.present}/{row.required}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {projectData.coverageTrend.some((row) => row.coverageRate < 0.95) ? (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {projectData.coverageTrend
                      .filter((row) => row.coverageRate < 0.95)
                      .slice(0, 3)
                      .map((row) => {
                        const tone = getCoverageRiskTone(row.coverageRate);
                        return (
                          <div key={row.date} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${tone.card}`}>
                            <div className={`text-sm font-black ${tone.text}`}>{formatPercent(row.present, row.required)}</div>
                            <div className="min-w-0">
                              <div className={`text-[10px] font-semibold ${tone.subtext}`}>{row.label}</div>
                              <div className={`text-[9px] leading-tight ${tone.subtext}`}>มา {row.present}/{row.required} · gap {row.gapHeadcount}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    ยังไม่พบวันที่ coverage ต่ำกว่า 95% ในช่วงที่เลือก
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 lg:gap-4">
          <SectionCard title="Coverage Analysis" subtitle="วิเคราะห์การครอบคลุมกำลังคนเทียบฐาน coverage ของโครงการ" tooltip="ถ้าโครงการมี required manpower ระบบจะใช้เป็น Phase 2 coverage ทันที ถ้ายังไม่มีจะ fallback ไปใช้ assigned headcount แบบ Phase 1">
              <div className="space-y-2 lg:space-y-3">
                <div className={`rounded-xl border p-2 lg:p-3 ${getCoverageRiskTone(projectData.coverageRate).card}`}>
                  <CoverageGaugeDonut
                    coverageRate={projectData.coverageRate}
                    present={projectData.present}
                    gap={projectData.coverageGapSlots}
                    centerClassName={getCoverageRiskTone(projectData.coverageRate).text}
                    onClick={() => setMetricModal({ key: "coverage-total", title: `Coverage รวมของ ${selectedProjectLabel}`, subtitle: "สรุป coverage รายวันเทียบ target coverage ของโครงการ" })}
                  />
                  <div className={`mt-1 text-center text-[11px] lg:text-xs ${getCoverageRiskTone(projectData.coverageRate).subtext}`}>{projectData.present} / {projectData.coverageDenominator} employee-days</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMetricModal({ key: "coverage-gap", title: `Coverage Gap ของ ${selectedProjectLabel}`, subtitle: "ดู role และวันที่เป็นตัวดัน gap ของโครงการ" })}
                    className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="text-[11px] font-semibold text-rose-700">Coverage Gap</div>
                    <div className="mt-0.5 text-base lg:text-xl font-black text-rose-800">{projectData.coverageGapSlots}</div>
                    <div className="mt-0.5 text-[10px] lg:text-[11px] text-rose-700">เฉลี่ยขาด {projectData.averageDailyShortfall.toFixed(1)} คน/วัน</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricModal({ key: "ot-dependency", title: `OT Dependency ของ ${selectedProjectLabel}`, subtitle: "ดูว่าการพึ่ง OT กระจุกตัวอยู่ที่ใครและระดับใด" })}
                    className="rounded-xl border border-sky-200 bg-sky-50 p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="text-[11px] font-semibold text-sky-700">OT Dependency</div>
                    <div className="mt-0.5 text-base lg:text-xl font-black text-sky-800">{formatPercent(projectData.otEmployees, Math.max(projectData.scopedEmployees.length, 1))}</div>
                    <div className="mt-0.5 text-[10px] lg:text-[11px] text-sky-700">OT {projectData.totalOtHours.toFixed(1)} ชม. · {projectData.otEmployees} คน</div>
                  </button>
                </div>
              </div>
              <div className="mt-2 lg:mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {projectData.coverageBasisLabel}
              </div>
            </SectionCard>

            <SectionCard
              title="Coverage ตามประเภทพนักงาน"
              subtitle="ดูว่าประเภทใดเริ่มขาด coverage หรือเริ่มพึ่ง OT สูง"
              tooltip="ตอนนี้ coverage แยกตามประเภท ยังอิง assigned distribution ของแต่ละกลุ่มภายในโครงการจนกว่าจะมีแผนกำลังคนรายประเภท"
              headerAction={
                <button
                  type="button"
                  onClick={() => setSidePanel({ key: "coverage-types", title: "Coverage ตามประเภทพนักงาน", subtitle: "ขยายดู coverage ทุกประเภทพนักงานภายในโครงการนี้" })}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ดูทั้งหมด
                </button>
              }
            >
              {projectData.coverageByType.length === 0 ? (
                <div className="text-sm text-slate-500">ยังไม่มีข้อมูล coverage ของประเภทพนักงานในโครงการนี้</div>
              ) : (
                <div className="space-y-2 lg:space-y-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                    <CoverageCompareChart data={coverageByTypeBarData} onBarClick={(key) => setSidePanel({ key: "coverage-types", title: "Coverage ตามประเภทพนักงาน", subtitle: "ขยายดู coverage ทุกประเภทพนักงานภายในโครงการนี้", selectedKey: (projectData.coverageByType.find((r) => r.label === key)?.key) })} />
                  </div>
                  {projectData.coverageByType.slice(0, 5).map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSidePanel({ key: "coverage-types", title: "Coverage ตามประเภทพนักงาน", subtitle: "ขยายดู coverage ทุกประเภทพนักงานภายในโครงการนี้", selectedKey: row.key })}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1 text-left transition-colors hover:border-sky-300 ${getCoverageRiskTone(row.coverageRate).card}`}
                    >
                      <div className={`min-w-0 flex-1 truncate text-xs font-semibold ${getCoverageRiskTone(row.coverageRate).text}`}>{row.label}</div>
                      <div className={`hidden shrink-0 text-[10px] sm:block ${getCoverageRiskTone(row.coverageRate).subtext}`}>Gap {row.gapSlots} · OT {row.otHours.toFixed(1)}</div>
                      <div className={`shrink-0 inline-flex rounded px-1.5 py-0.5 text-xs font-black ${getCoverageRiskTone(row.coverageRate).emphasis}`}>{formatPercent(row.present, row.scheduledSlots)}</div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Critical Role Coverage"
              subtitle={projectData.hasRequiredRolePlan ? "Phase 2: เทียบกับแผนกำลังคนรายตำแหน่งจริงจาก baseline + adjustments" : "Phase 1: ยังไม่มี role plan จึงอิง assigned distribution ชั่วคราว"}
              tooltip="ถ้ามี baseline role plan และ adjustments ระบบจะคำนวณ target ของแต่ละตำแหน่งตามช่วงวันที่จริงก่อนนำมาเทียบกับจำนวนที่มาทำงาน"
              headerAction={
                <button
                  type="button"
                  onClick={() => setSidePanel({ key: "coverage-roles", title: "Critical Role Coverage", subtitle: "ขยายดู coverage ทุกตำแหน่งหลักในโครงการนี้" })}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ดูทั้งหมด
                </button>
              }
            >
              {projectData.coverageByPosition.length === 0 ? (
                <div className="text-sm text-slate-500">ยังไม่มีข้อมูล coverage ของตำแหน่งในโครงการนี้</div>
              ) : (
                <div className="space-y-2 lg:space-y-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                    <CoverageCompareChart data={coverageByPositionBarData} onBarClick={(key) => setSidePanel({ key: "coverage-roles", title: "Critical Role Coverage", subtitle: "ขยายดู coverage ทุกตำแหน่งหลักในโครงการนี้", selectedKey: (projectData.coverageByPosition.find((r) => r.label === key)?.key) })} />
                  </div>
                  {projectData.coverageByPosition.slice(0, 5).map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSidePanel({ key: "coverage-roles", title: "Critical Role Coverage", subtitle: "ขยายดู coverage ทุกตำแหน่งหลักในโครงการนี้", selectedKey: row.key })}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1 text-left transition-colors hover:border-sky-300 ${getCoverageRiskTone(row.coverageRate).card}`}
                    >
                      <div className={`min-w-0 flex-1 truncate text-xs font-semibold ${getCoverageRiskTone(row.coverageRate).text}`}>{row.label}</div>
                      <div className={`hidden shrink-0 text-[10px] sm:block ${getCoverageRiskTone(row.coverageRate).subtext}`}>{projectData.hasRequiredRolePlan ? `Plan ${row.assignedHeadcount.toFixed(1)}` : `Assign ${row.assignedHeadcount}`} · {row.present}/{row.scheduledSlots}</div>
                      <div className={`shrink-0 inline-flex rounded px-1.5 py-0.5 text-xs font-black ${getCoverageRiskTone(row.coverageRate).emphasis}`}>{formatPercent(row.present, row.scheduledSlots)}</div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${isSingleDayView ? "lg:grid-cols-2" : ""}`}>
            <SectionCard
              title="รายการที่ต้องติดตาม"
              subtitle={projectFollowUpSubtitle}
              tooltip="เป็นรายการ exception ของโครงการนี้ ใช้ติดตามเคสที่ต้องตรวจสอบเป็นรายคน"
              headerAction={
                <button
                  type="button"
                  onClick={() => setSidePanel({ key: "project-exceptions", title: "รายการที่ต้องติดตาม", subtitle: "ขยายดู exception ทั้งหมดของโครงการนี้" })}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ดูทั้งหมด
                </button>
              }
            >
              {projectFollowUpList.length === 0 ? (
                <div className="text-sm text-slate-500">ไม่มี exception ในช่วงนี้</div>
              ) : (
                <div className="max-h-[420px] overflow-auto pr-1">
                  <table className="w-full min-w-[420px] sm:min-w-0 table-fixed text-[11px]">
                    <thead>
                      <tr className="sticky top-0 z-10 bg-slate-50 text-[10px] text-slate-600">
                        <th className="px-1 py-1.5 text-left font-semibold">ชื่อ</th>
                        <th className="w-8 px-1 py-1.5 text-center font-semibold">มา</th>
                        {projectData.lateDataAvailable && <th className="w-8 px-1 py-1.5 text-center font-semibold">สาย</th>}
                        <th className="w-8 px-1 py-1.5 text-center font-semibold">ขาด</th>
                        <th className="w-8 px-1 py-1.5 text-center font-semibold">ลา</th>
                        <th className="w-8 px-1 py-1.5 text-center font-semibold">ค้าง</th>
                        <th className="w-10 px-1 py-1.5 text-right font-semibold">OT</th>
                        <th className="w-4 px-0.5 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {projectFollowUpList.map((row) => {
                        const pending = row.notRecordedDays + row.wrongProjectDays;
                        const isBad = row.absentDays > 0 || pending > 0;
                        const rowTone = isBad ? "bg-rose-50/40 hover:bg-rose-50" : row.leaveDays > 0 ? "bg-amber-50/30 hover:bg-amber-50" : "hover:bg-sky-50";
                        return (
                          <tr
                            key={row.id}
                            onClick={() => setSidePanel({ key: "project-exceptions", title: "รายการที่ต้องติดตาม", subtitle: "ขยายดู exception ทั้งหมดของโครงการนี้", selectedKey: row.employeeId })}
                            className={`cursor-pointer border-t border-slate-100 ${rowTone}`}
                            title="กดเพื่อดูรายละเอียด"
                          >
                            <td className="px-1 py-1.5">
                              <div className="truncate font-medium text-slate-800">{row.name}</div>
                              <div className="truncate text-[9px] text-slate-400">{row.employeeCode} | {row.position}</div>
                            </td>
                            <td className="px-1 py-1.5 text-center font-semibold text-emerald-700">{row.presentDays}</td>
                            {projectData.lateDataAvailable && (
                              <td className={`px-1 py-1.5 text-center font-semibold ${row.lateDays > 0 ? "text-amber-700" : "text-slate-300"}`}>{row.lateDays}</td>
                            )}
                            <td className={`px-1 py-1.5 text-center font-semibold ${row.absentDays > 0 ? "text-rose-700" : "text-slate-300"}`}>{row.absentDays}</td>
                            <td className={`px-1 py-1.5 text-center font-semibold ${row.leaveDays > 0 ? "text-amber-700" : "text-slate-300"}`}>{row.leaveDays}</td>
                            <td className={`px-1 py-1.5 text-center font-semibold ${pending > 0 ? "text-slate-600" : "text-slate-300"}`}>{pending}</td>
                            <td className={`px-1 py-1.5 text-right font-semibold ${row.otHours > 0 ? "text-sky-700" : "text-slate-300"}`}>{row.otHours.toFixed(1)}</td>
                            <td className="px-0.5 py-1.5 text-center text-slate-300">›</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
            {isSingleDayView && (
              <SectionCard
                title="พนักงานลา/ขาดวันนี้"
                subtitle="รายการลา/ขาดของโครงการนี้ในวันนี้จริง แยกจากรายการติดตามย้อนหลัง"
                tooltip="ช่วยให้ Project Dashboard แยกมุม operation วันนี้ ออกจากมุม follow-up ย้อนหลัง 7 วัน"
              >
                {projectData.todayAbsentLeaveProjectRows.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    วันนี้ยังไม่พบพนักงานลา/ขาดในโครงการนี้
                  </div>
                ) : (
                  <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                    {projectData.todayAbsentLeaveProjectRows.map((row) => (
                      <div key={`${row.employeeId}-${row.status}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-800">{row.fullName}</div>
                          <div className="truncate text-[10px] text-slate-500">{row.employeeCode} | {row.position} | {row.employeeType}</div>
                        </div>
                        <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${row.status === "ไม่มา" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      <DashboardModal
        open={metricModal !== null}
        title={metricModal?.title || ""}
        subtitle={metricModal?.subtitle}
        onClose={() => setMetricModal(null)}
      >
        {renderMetricModalContent()}
      </DashboardModal>

      <DashboardSidePanel
        open={sidePanel !== null}
        title={sidePanel?.title || ""}
        subtitle={sidePanel?.subtitle}
        onClose={() => setSidePanel(null)}
      >
        {renderSidePanelContent()}
      </DashboardSidePanel>

      <PageGuideModal
        open={showPageGuide}
        guide={activePageGuide}
        onClose={() => setShowPageGuide(false)}
      />

      {showLandscapeHint && (
        <div data-html2canvas-ignore="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <RotateCw size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">แนะนำให้หมุนหน้าจอแนวนอน</h3>
            <p className="mt-1 text-sm text-slate-600">
              Dashboard มีข้อมูลหลายคอลัมน์ การเปิดแบบแนวนอน (landscape) จะอ่านง่ายและเห็นภาพรวมชัดกว่า
            </p>
            <p className="mt-2 text-xs text-slate-400">
              หรือกดปุ่ม “ส่งออกรูป” เพื่อดาวน์โหลดภาพ Dashboard แบบหน้าจอคอมพิวเตอร์
            </p>
            <button
              type="button"
              onClick={dismissLandscapeHint}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              <X size={16} /> เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}

      {showRiskScoreGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">วิธีคิด Risk score</h3>
                <p className="mt-1 text-sm text-slate-600">
                  ใช้อธิบายเกณฑ์พนักงานที่ต้องติดตาม โดยอิงจากกฎที่ระบบใช้จริงในหน้า Dashboard และ Risk Monitoring
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskScoreGuide(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                ปิด
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-5 py-4 space-y-5 text-sm text-slate-700">
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div className="font-bold text-sky-900">สูตรรวมคะแนน</div>
                <div className="mt-2">Risk score = ผลรวมคะแนนจาก rule ที่เข้าเงื่อนไข โดยนับคะแนนสูงสุดเพียง 1 rule ต่อกลุ่มเงื่อนไขที่มาจากเหตุการณ์เดียวกัน</div>
                <div className="mt-1">
                  เช่น ขาดต่อเนื่อง / ขาดสะสม / อัตราขาดสูง / ขาดจันทร์-ศุกร์ ล้วนสะท้อนการขาดงานชุดเดียวกัน จึงนับคะแนนของ rule ที่สูงสุดในกลุ่มนี้เพียงรายการเดียว
                  ไม่บวกซ้ำกัน
                </div>
                <div className="mt-1">คะแนนสูงสุดถูกจำกัดไว้ที่ 100 คะแนน</div>
                <div className="mt-2 rounded-lg border border-sky-300 bg-white/60 px-3 py-2 text-xs text-sky-900">
                  หมายเหตุ: กฎ "อัตราขาดงานสูง" ใช้รอบจ่ายค่าแรงปัจจุบันเสมอ (รอบนี้: {payCycleRange.label}) แยกต่างหากจากช่วงวันที่ที่เลือกดูรายงานด้านบน
                  (วันนี้/เมื่อวาน/รายเดือน/กำหนดเอง) เพื่อไม่ให้สับสนกับรายงานปกติ
                </div>
              </div>

              <div>
                <h4 className="text-sm font-black text-slate-900">เกณฑ์คะแนนรวมและระดับความเสี่ยง</h4>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-800">Watch</div>
                    <div className="mt-1 text-xs text-slate-600">20-39 คะแนน</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="font-semibold text-amber-800">Risk</div>
                    <div className="mt-1 text-xs text-amber-700">40-59 คะแนน</div>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <div className="font-semibold text-rose-800">High</div>
                    <div className="mt-1 text-xs text-rose-700">60-79 คะแนน</div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="font-semibold text-red-800">Critical</div>
                    <div className="mt-1 text-xs text-red-700">80 คะแนนขึ้นไป</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  หมายเหตุ: หาก rule บางข้อมีผลต่อระดับความรุนแรงสูงกว่าคะแนนรวม ระบบจะยกระดับ severity ตาม rule นั้น
                </p>
              </div>

              <div>
                <h4 className="text-sm font-black text-slate-900">กฎการให้คะแนนรายข้อ</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600">
                        <th className="px-3 py-2 text-left font-semibold">Rule</th>
                        <th className="px-3 py-2 text-left font-semibold">เงื่อนไข</th>
                        <th className="px-3 py-2 text-center font-semibold">คะแนน</th>
                        <th className="px-3 py-2 text-left font-semibold">ผลต่อระดับ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-3 py-2 font-medium">ขาดติดต่อกัน</td>
                        <td className="px-3 py-2">3 วัน = 40, 4 วันขึ้นไป = 55 (ขาดติดกันไม่ถึง 3 วัน ไม่ให้คะแนน)</td>
                        <td className="px-3 py-2 text-center font-bold">40 / 55</td>
                        <td className="px-3 py-2">Critical</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">ขาดสะสม</td>
                        <td className="px-3 py-2">3 วัน = 15, 4 วัน = 20, 5 วันขึ้นไป = 30</td>
                        <td className="px-3 py-2 text-center font-bold">15 / 20 / 30</td>
                        <td className="px-3 py-2">Risk, High หรือ Critical</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">อัตราขาด (รอบจ่ายค่าแรง)</td>
                        <td className="px-3 py-2">10% = 15, 15% = 25, 20% ขึ้นไป = 35 (คำนวณจากรอบจ่ายค่าแรง 1-15/16-สิ้นเดือน ไม่ใช่ช่วงวันที่เลือกดูรายงาน)</td>
                        <td className="px-3 py-2 text-center font-bold">15 / 25 / 35</td>
                        <td className="px-3 py-2">Risk, High หรือ Critical</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">ขาดวันจันทร์/ศุกร์</td>
                        <td className="px-3 py-2">2 ครั้ง = 10, 3 ครั้งขึ้นไป = 20</td>
                        <td className="px-3 py-2 text-center font-bold">10 / 20</td>
                        <td className="px-3 py-2">Watch หรือ High</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">ค้างลงเวลา + ขาด</td>
                        <td className="px-3 py-2">ค้าง 2 ครั้งและขาด 1 วัน = 10, ค้าง 3 ครั้งและขาด 2 วันขึ้นไป = 18</td>
                        <td className="px-3 py-2 text-center font-bold">10 / 18</td>
                        <td className="px-3 py-2">Risk หรือ High</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">ลงผิดโครงการ + ขาด</td>
                        <td className="px-3 py-2">ผิดโครงการ 2 ครั้งและขาด 1 วัน = 10, ผิดโครงการ 3 ครั้งและขาด 2 วันขึ้นไป = 18</td>
                        <td className="px-3 py-2 text-center font-bold">10 / 18</td>
                        <td className="px-3 py-2">Risk หรือ High</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <li>
                    <span className="font-semibold text-slate-800">กลุ่มขาดงาน (ขาดต่อเนื่อง/ขาดสะสม/อัตราขาดสูง/ขาดจันทร์-ศุกร์):</span>{" "}
                    ทั้ง 4 rule สะท้อนการขาดงานชุดเดียวกัน จึงนับคะแนนสูงสุดในกลุ่มนี้เพียง rule เดียว ไม่บวกซ้ำ
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">อัตราขาดงานสูง / ขาดจันทร์-ศุกร์:</span>{" "}
                    เป็นเพียงสัญญาณเฝ้าระวังบน dashboard เท่านั้น ไม่ใช่ฐานตามกฎหมายที่จะดำเนินการทางวินัยกับพนักงานได้ด้วยตัวเอง
                    จึงไม่ถูกส่งเข้าคิวติดตามพนักงานโดยอัตโนมัติ ต้องรอให้พบขาดต่อเนื่องหรือขาดสะสมจริงก่อนจึงจะเปิดเคสติดตามได้
                    (อัตราขาดงานสูงคำนวณจากรอบจ่ายค่าแรง 1-15/16-สิ้นเดือน ไม่ใช่ช่วงวันที่ที่เลือกดูรายงาน)
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">ค้างลงเวลา + ขาด / ลงผิดโครงการ + ขาด:</span>{" "}
                    มักสะท้อนความบกพร่องของการบันทึกเวลา/ผู้ลงเวลา ไม่ใช่พฤติกรรมพนักงานโดยตรง จึงยังคงนับคะแนนและแสดงใน dashboard
                    แต่ไม่ถูกส่งเข้าคิวติดตามพนักงานโดยอัตโนมัติเช่นกัน
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-black text-slate-900">วิธีอ่านข้อมูลในตาราง</h4>
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    <li>Score คือผลรวมคะแนนจากทุก rule ที่ trigger จริงของพนักงานคนนั้น</li>
                    <li>ระดับ คือ severity สุดท้ายหลังพิจารณาทั้งคะแนนรวมและ rule override</li>
                    <li>สาเหตุหลัก คือเหตุผลที่ระบบดึงจาก rule ที่กระทบมากที่สุดของเคสนั้น</li>
                    <li>ล่าสุด คือวันที่เกิด incident ล่าสุดในช่วงวันที่ที่กำลังวิเคราะห์</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-black text-slate-900">หลักการเรียงลำดับ</h4>
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    <li>เรียงตาม severity จากสูงไปต่ำก่อน</li>
                    <li>หากระดับเท่ากัน จะเรียงตาม score มากไปน้อย</li>
                    <li>ถ้ายังเท่ากัน จะดูจำนวนขาดติดต่อกันมากกว่าอยู่ก่อน</li>
                    <li>จากนั้นใช้ incident ล่าสุด, จำนวนขาด, ค้างลงเวลา และผิดโครงการ เป็นตัวตัดสินเพิ่มเติม</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                คะแนนนี้ใช้เพื่อคัดกรองและจัดลำดับเคสที่ควรติดตามก่อน ไม่ได้ใช้แทนการตรวจสอบข้อเท็จจริงรายบุคคล
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};





