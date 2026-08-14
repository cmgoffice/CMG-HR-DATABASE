import React, { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import {
  Award,
  Building2,
  Loader2,
  Star,
  Target,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { DonutChart, RankedBarChart, TrendLineChart, DonutDatum, RankedBarDatum, TrendPoint } from "./DashboardCharts";
import { MetricCard, SectionCard, HorizontalBreakdown } from "./DashboardUI";
import { EvalScoreRecord, finalPersonScore, monthLabelTh } from "./evaluationConfig";

interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  ระดับตำแหน่ง?: string;
  แผนก?: string;
  สถานะพนักงาน?: string;
  สถานะโครงการ?: string | string[];
  employee_type?: string;
  Type?: string;
  gender?: string;
  เพศ?: string;
  ชื่อต้น?: string;
  date_of_birth?: string;
  start_date?: string;
  resignation_date?: string;
  resignation_reason_category?: string;
  resignation_reason_detail?: string;
  [key: string]: any;
}

const NO_DEPARTMENT = "ไม่ระบุ";

const parseProjectList = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const projectListIncludes = (projects: string[], target: string): boolean =>
  projects.some((p) => String(p || "").trim() === String(target || "").trim());

const formatPercent = (numerator: number, denominator: number): string => {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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

const inferGender = (emp: Employee): string => {
  const explicit = String(emp.gender || emp.เพศ || "").trim().toLowerCase();
  if (explicit === "male" || explicit === "ชาย" || explicit === "m") return "ชาย";
  if (explicit === "female" || explicit === "หญิง" || explicit === "f") return "หญิง";
  const title = String(emp["ชื่อต้น"] || "").trim().toLowerCase();
  if (title === "นาย" || title === "mr.") return "ชาย";
  if (title === "นาง" || title === "นางสาว" || title === "mrs." || title === "ms.") return "หญิง";
  return "ไม่ระบุ";
};

const isContractEmployee = (emp: Employee): boolean => {
  const type = String(emp.employee_type || "").toLowerCase();
  const kind = String(emp.Type || "").toLowerCase();
  return (
    kind.includes("contract") ||
    type.includes("supply") ||
    type.includes("sub")
  );
};

const monthKeyFromDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const lastNMonthKeys = (n: number): string[] => {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
};

const GRADE_LABELS: Record<string, string> = {
  A: "ดีเยี่ยม",
  B: "ดีมาก",
  C: "ดี",
  D: "พอใช้",
  F: "ต้องปรับปรุง",
};

const GRADE_COLORS: Record<string, string> = {
  A: "#2563eb",
  B: "#16a34a",
  C: "#0ea5e9",
  D: "#f59e0b",
  F: "#ef4444",
};

const REASON_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#64748b",
  "#ec4899",
];

const EmptyDataNote = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
    {message}
  </div>
);

export const HRAnalyticsTab = ({
  activeEmployees,
  canSeeAllProjects,
  assignedProjects,
}: {
  activeEmployees: Employee[];
  canSeeAllProjects: boolean;
  assignedProjects: string[];
}) => {
  const db = getFirestore();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [scores, setScores] = useState<EvalScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonDetailFilter, setReasonDetailFilter] = useState<string | null>(null);

  useEffect(() => {
    const employeeRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    const scoresRef = collection(db, "CMG-HR-Database", "root", "evaluation_scores");

    const unsubEmployees = onSnapshot(
      employeeRef,
      (snapshot) => {
        let list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Employee));
        if (!canSeeAllProjects) {
          list = list.filter((emp) =>
            parseProjectList(emp.สถานะโครงการ).some((project) => projectListIncludes(assignedProjects, project))
          );
        }
        setAllEmployees(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubScores = onSnapshot(scoresRef, (snapshot) => {
      setScores(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as EvalScoreRecord)));
    });

    return () => {
      unsubEmployees();
      unsubScores();
    };
  }, [canSeeAllProjects, assignedProjects.join("|")]);

  const currentYear = new Date().getFullYear();

  // ---------- Headcount Summary ----------
  const newHiresYTD = useMemo(
    () => allEmployees.filter((e) => e.start_date && new Date(`${e.start_date}T00:00:00`).getFullYear() === currentYear).length,
    [allEmployees, currentYear]
  );

  const hasResignationDates = useMemo(() => allEmployees.some((e) => !!e.resignation_date), [allEmployees]);

  const resignedEmployees = useMemo(
    () => allEmployees.filter((e) => e["สถานะพนักงาน"] === "ลาออก" || e["สถานะพนักงาน"] === "เลิกจ้าง"),
    [allEmployees]
  );

  const resignationsYTD = useMemo(() => {
    if (hasResignationDates) {
      return allEmployees.filter(
        (e) => e.resignation_date && new Date(`${e.resignation_date}T00:00:00`).getFullYear() === currentYear
      ).length;
    }
    return resignedEmployees.length;
  }, [allEmployees, hasResignationDates, resignedEmployees, currentYear]);

  const contractEmployeeCount = useMemo(
    () => activeEmployees.filter(isContractEmployee).length,
    [activeEmployees]
  );

  const departmentDonutData: DonutDatum[] = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const dept = String(e.แผนก || "").trim() || NO_DEPARTMENT;
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: REASON_COLORS[i % REASON_COLORS.length] }));
  }, [activeEmployees]);

  // ---------- Turnover Rate ----------
  const turnoverTrend: TrendPoint[] = useMemo(() => {
    const months = lastNMonthKeys(6);
    return months.map((key) => {
      const [y, m] = key.split("-").map((n) => parseInt(n, 10));
      const monthEnd = new Date(y, m, 0);
      const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;

      const headcountAtMonth = allEmployees.filter((e) => {
        if (!e.start_date || e.start_date > monthEndStr) return false;
        if (e.resignation_date && e.resignation_date <= monthEndStr) return false;
        return true;
      }).length;

      const resignationsInMonth = allEmployees.filter((e) => monthKeyFromDate(e.resignation_date) === key).length;

      const rate = headcountAtMonth > 0 ? Math.round((resignationsInMonth / headcountAtMonth) * 1000) / 10 : null;
      return { label: monthLabelTh(key), value: hasResignationDates ? rate : null, meta: `ลาออก ${resignationsInMonth} คน` };
    });
  }, [allEmployees, hasResignationDates]);

  const turnoverByDepartment: RankedBarDatum[] = useMemo(() => {
    const counts: Record<string, number> = {};
    resignedEmployees.forEach((e) => {
      const dept = String(e.แผนก || "").trim() || NO_DEPARTMENT;
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({ name, fullName: name, value, color: REASON_COLORS[i % REASON_COLORS.length] }));
  }, [resignedEmployees]);

  const turnoverByReason: DonutDatum[] = useMemo(() => {
    const counts: Record<string, number> = {};
    resignedEmployees.forEach((e) => {
      const reason = String(e.resignation_reason_category || "").trim() || "ไม่ระบุเหตุผล";
      counts[reason] = (counts[reason] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: REASON_COLORS[i % REASON_COLORS.length] }));
  }, [resignedEmployees]);

  const resignedByReasonDetail = useMemo(() => {
    if (!reasonDetailFilter) return [];
    return resignedEmployees.filter(
      (e) => (String(e.resignation_reason_category || "").trim() || "ไม่ระบุเหตุผล") === reasonDetailFilter
    );
  }, [resignedEmployees, reasonDetailFilter]);

  // ---------- Employee Demographics ----------
  const genderList = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const g = inferGender(e);
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [activeEmployees]);

  const ageList = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const b = bucketAge(getAge(e.date_of_birth));
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [activeEmployees]);

  const tenureList = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const b = bucketTenure(getTenureYears(e.start_date));
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [activeEmployees]);

  const positionLevelData: DonutDatum[] = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const level = String(e.ระดับตำแหน่ง || "").trim() || "ไม่ระบุ";
      counts[level] = (counts[level] || 0) + 1;
    });
    const palette: Record<string, string> = {
      ปฏิบัติการ: "#0ea5e9",
      หัวหน้างาน: "#6366f1",
      ผู้จัดการ: "#f59e0b",
      ผู้บริหาร: "#ef4444",
      ไม่ระบุ: "#94a3b8",
    };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, color: palette[name] || "#94a3b8" }));
  }, [activeEmployees]);

  const hasPositionLevelData = useMemo(() => activeEmployees.some((e) => !!e.ระดับตำแหน่ง), [activeEmployees]);

  // ---------- Performance Management ----------
  const latestScoresByEmployee = useMemo(() => {
    const byEmployee = new Map<string, EvalScoreRecord[]>();
    scores.forEach((s) => {
      const list = byEmployee.get(s.employeeId) || [];
      list.push(s);
      byEmployee.set(s.employeeId, list);
    });

    const results: { employeeId: string; employeeName: string; total: number; grade: string }[] = [];
    byEmployee.forEach((records, employeeId) => {
      const periods = Array.from(new Set(records.map((r) => r.period)));
      const monthlyPeriods = periods.filter((p) => p !== "PROBATION").sort().reverse();
      const chosenPeriod = monthlyPeriods[0] || periods[0];
      if (!chosenPeriod) return;
      const periodRecords = records.filter((r) => r.period === chosenPeriod);
      const final = finalPersonScore(periodRecords);
      if (!final) return;
      results.push({
        employeeId,
        employeeName: periodRecords[0]?.employeeName || employeeId,
        total: final.total,
        grade: final.grade,
      });
    });
    return results;
  }, [scores]);

  const avgEvalScore = useMemo(() => {
    if (latestScoresByEmployee.length === 0) return null;
    const sum = latestScoresByEmployee.reduce((s, r) => s + r.total, 0);
    return Math.round((sum / latestScoresByEmployee.length) * 10) / 10;
  }, [latestScoresByEmployee]);

  const gradeDistribution: DonutDatum[] = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    latestScoresByEmployee.forEach((r) => {
      counts[r.grade] = (counts[r.grade] || 0) + 1;
    });
    return (["A", "B", "C", "D", "F"] as const).map((g) => ({
      name: GRADE_LABELS[g],
      value: counts[g] || 0,
      color: GRADE_COLORS[g],
    }));
  }, [latestScoresByEmployee]);

  const topPerformerCount = useMemo(() => latestScoresByEmployee.filter((r) => r.grade === "A").length, [latestScoresByEmployee]);
  const needsDevelopmentCount = useMemo(
    () => latestScoresByEmployee.filter((r) => r.grade === "D" || r.grade === "F").length,
    [latestScoresByEmployee]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูล HR Analytics...
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2 lg:p-4 lg:space-y-4">
      {/* Headcount Summary */}
      <SectionCard
        title="Headcount Summary"
        subtitle="สรุปจำนวนพนักงาน"
        tooltip="พนักงานปัจจุบันนับเฉพาะสถานะทำงาน พนักงานใหม่/ลาออกนับตามปีปฏิทินปัจจุบัน (YTD)"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard title="พนักงานปัจจุบัน" value={activeEmployees.length} subvalue="สถานะทำงาน" icon={Users} accent="text-slate-900" />
          <MetricCard title="พนักงานใหม่ (YTD)" value={newHiresYTD} subvalue={`ปี ${currentYear}`} icon={UserPlus} accent="text-emerald-700" />
          <MetricCard
            title="พนักงานลาออก (YTD)"
            value={resignationsYTD}
            subvalue={hasResignationDates ? `ปี ${currentYear}` : "สะสมทั้งหมด (รอข้อมูลวันที่)"}
            icon={UserMinus}
            accent="text-rose-700"
          />
          <MetricCard title="พนักงานสัญญาจ้าง" value={contractEmployeeCount} subvalue="Supply/Sub contractor" icon={Building2} accent="text-amber-700" />
        </div>
        <div className="mt-3">
          <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
            <span>พนักงานแยกตามแผนก</span>
            <InfoTooltip content="ใช้ field แผนก ของพนักงานที่มีสถานะทำงาน" iconSize={11} />
          </div>
          {departmentDonutData.length === 0 ? (
            <EmptyDataNote message="ยังไม่มีข้อมูลแผนกของพนักงาน" />
          ) : (
            <DonutChart data={departmentDonutData} centerValue={activeEmployees.length} centerSub="คนทั้งหมด" />
          )}
        </div>
      </SectionCard>

      {/* Turnover Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
        <SectionCard
          title="Turnover Rate"
          subtitle="อัตราการลาออกรายเดือน"
          tooltip="สูตร: จำนวนลาออกในเดือน / จำนวนพนักงานที่ยังทำงานอยู่ ณ สิ้นเดือนนั้น ต้องมีข้อมูลวันที่ลาออก (resignation_date) จึงจะคำนวณ trend ได้"
        >
          {!hasResignationDates ? (
            <EmptyDataNote message="ยังไม่มีข้อมูล &quot;วันที่ลาออก&quot; ของพนักงาน — กรอกฟิลด์วันที่ลาออกในหน้าจัดการพนักงานเพื่อดู trend ย้อนหลัง" />
          ) : (
            <TrendLineChart data={turnoverTrend} unit="%" domain={[0, Math.max(10, ...turnoverTrend.map((t) => t.value || 0))]} color="#ef4444" valueLabel="Turnover Rate" />
          )}
        </SectionCard>

        <SectionCard title="ลาออกแยกตามแผนก" subtitle="จำนวนพนักงานที่ลาออกสะสม แยกตามแผนก" tooltip="นับจากพนักงานที่สถานะพนักงาน = ลาออก/เลิกจ้าง แยกตาม field แผนก">
          {turnoverByDepartment.length === 0 ? (
            <EmptyDataNote message="ยังไม่มีข้อมูลพนักงานลาออก" />
          ) : (
            <RankedBarChart data={turnoverByDepartment} maxValue={Math.max(...turnoverByDepartment.map((d) => d.value), 1)} valueLabel="จำนวนลาออก" />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="เหตุผลการลาออก"
        subtitle="สรุปเป็นหมวด พร้อมดูรายละเอียดจริงรายคนได้"
        tooltip="ใช้ field หมวดเหตุผลลาออก (resignation_reason_category) กดที่แต่ละหมวดเพื่อดูรายละเอียดจริงจาก resignation_reason_detail"
      >
        {turnoverByReason.length === 0 ? (
          <EmptyDataNote message="ยังไม่มีข้อมูลหมวดเหตุผลลาออก" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DonutChart data={turnoverByReason} centerValue={resignedEmployees.length} centerSub="คนลาออกสะสม" />
            <div>
              <HorizontalBreakdown
                items={turnoverByReason.map((r) => ({ label: r.name, value: r.value }))}
                total={resignedEmployees.length}
                accent="bg-rose-400"
                onItemClick={(item) => setReasonDetailFilter(item.label === reasonDetailFilter ? null : item.label)}
              />
              {reasonDetailFilter && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                  <div className="mb-1 font-bold text-slate-700">รายละเอียด: {reasonDetailFilter}</div>
                  {resignedByReasonDetail.length === 0 ? (
                    <div className="text-slate-400">ไม่มีรายละเอียดเพิ่มเติม</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {resignedByReasonDetail.map((e) => (
                        <li key={e.id} className="border-b border-slate-200 pb-1.5 last:border-0">
                          <div className="font-semibold text-slate-800">
                            {e["ชื่อตัว"] || ""} {e["ชื่อสกุล"] || ""} <span className="font-normal text-slate-400">({e.รหัสพนักงาน || e.id})</span>
                          </div>
                          <div className="text-slate-500">{e.resignation_reason_detail || "(ไม่ได้กรอกรายละเอียด)"}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Employee Demographics */}
      <SectionCard title="Employee Demographics" subtitle="โครงสร้างพนักงาน" tooltip="อายุ/อายุงาน คำนวณเฉพาะคนที่มีข้อมูลวันเกิด/วันเริ่มงาน">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">ช่วงอายุ</div>
            <HorizontalBreakdown items={ageList} total={activeEmployees.length} accent="bg-amber-400" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">อายุงาน</div>
            <HorizontalBreakdown items={tenureList} total={activeEmployees.length} accent="bg-emerald-400" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">เพศ</div>
            <HorizontalBreakdown items={genderList} total={activeEmployees.length} accent="bg-sky-400" />
          </div>
          <div>
            <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              <span>ระดับตำแหน่ง</span>
              <InfoTooltip content="ใช้ field ระดับตำแหน่ง (ปฏิบัติการ/หัวหน้างาน/ผู้จัดการ/ผู้บริหาร)" iconSize={11} />
            </div>
            {!hasPositionLevelData ? (
              <EmptyDataNote message="ยังไม่มีข้อมูลระดับตำแหน่งของพนักงาน" />
            ) : (
              <DonutChart data={positionLevelData} centerValue={activeEmployees.length} centerSub="คนทั้งหมด" height={160} />
            )}
          </div>
        </div>
      </SectionCard>

      {/* Performance Management */}
      <SectionCard
        title="Performance Management"
        subtitle="การบริหารผลการปฏิบัติงาน"
        tooltip="ใช้คะแนนล่าสุดต่อคนจากระบบประเมินผล (evaluation_scores) รอบที่มีข้อมูลล่าสุดของแต่ละคน"
      >
        {latestScoresByEmployee.length === 0 ? (
          <EmptyDataNote message="ยังไม่มีข้อมูลคะแนนประเมินผล — ไปที่หน้าประเมินผลเพื่อเริ่มให้คะแนน" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <MetricCard title="คะแนนประเมินเฉลี่ย" value={avgEvalScore ?? "-"} subvalue="จาก 100" icon={Star} accent="text-amber-600" />
              <MetricCard title="ผู้ประเมินแล้ว" value={latestScoresByEmployee.length} subvalue="คนที่มีผลล่าสุด" icon={Users} accent="text-slate-900" />
              <MetricCard title="Top Performers" value={topPerformerCount} subvalue="เกรด A (ดีเยี่ยม)" icon={Award} accent="text-emerald-700" />
              <MetricCard title="ต้องพัฒนา" value={needsDevelopmentCount} subvalue="เกรด D/F" icon={Target} accent="text-rose-700" />
            </div>
            <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">ผลการประเมิน (รอบล่าสุดของแต่ละคน)</div>
            <DonutChart data={gradeDistribution} centerValue={avgEvalScore ?? "-"} centerSub="คะแนนเฉลี่ย" unit="คน" />
          </>
        )}
      </SectionCard>
    </div>
  );
};
