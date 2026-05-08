import React, { useState, useEffect, useMemo } from "react";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot
} from "firebase/firestore";
import {
  Users,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  BarChart3,
  DollarSign,
  Briefcase,
  Table2,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

interface Employee {
  id: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  [key: string]: any;
}

const formatProjectNo = (projectNo: string): string => {
  if (!projectNo || projectNo === "ไม่ระบุ") return projectNo;
  const cleanProjectNo = projectNo.includes(" - ") ? projectNo.split(" - ")[0] : projectNo;
  const parts = cleanProjectNo.split("-");
  if (parts.length >= 2) return parts.slice(-2).join("-");
  return cleanProjectNo;
};

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface AttendanceEntry {
  status: string;
  recordedAt: number;
  project?: string;
}

interface ReportRow {
  key: string;
  label: string;
  total: number;
  present: number;
  absent: number;
  leave: number;
  otherProject: number;
  notRecorded: number;
  laborCost: number;
}

type DashboardView = "table" | "chart";

export const ManpowerDashboard = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile, hasRole } = useAuth();
  const db = getFirestore();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceEntry>>({});
  const [laborByPosition, setLaborByPosition] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const canSeeAllProjects = hasRole(["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"]);
  const [selectedProject, setSelectedProject] = useState<string>(canSeeAllProjects ? "all" : "");
  const [viewMode, setViewMode] = useState<DashboardView>("table");

  const filteredProjectOptions = useMemo(() => {
    if (canSeeAllProjects) return projectOptions;
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => assignedProjects.includes(project));
  }, [projectOptions, userProfile, canSeeAllProjects]);

  useEffect(() => {
    if (!canSeeAllProjects && filteredProjectOptions.length > 0 && !filteredProjectOptions.includes(selectedProject)) {
      setSelectedProject(filteredProjectOptions[0]);
    }
    if (canSeeAllProjects && selectedProject && selectedProject !== "all" && !filteredProjectOptions.includes(selectedProject)) {
      setSelectedProject("all");
    }
  }, [canSeeAllProjects, filteredProjectOptions, selectedProject]);

  const hasAssignedProjects = useMemo(() => {
    if (canSeeAllProjects) return true;
    return filteredProjectOptions.length > 0;
  }, [canSeeAllProjects, filteredProjectOptions]);

  useEffect(() => {
    setLoading(true);
    const employeeCollectionRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    const unsubscribeEmployees = onSnapshot(employeeCollectionRef, (snapshot) => {
      let list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Employee))
        .filter((e) => e["สถานะพนักงาน"] === "ทำงาน");

      if (!canSeeAllProjects) {
        const assignedProjects = userProfile?.assignedProjects || [];
        list = list.filter((emp) => {
          const empProjects = emp.สถานะโครงการ;
          const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
          return projectList.some((proj) => assignedProjects.includes(proj));
        });
      }

      setEmployees(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to employees:", error);
      setLoading(false);
    });

    const positionLaborRef = collection(db, "CMG-HR-Database", "root", "position_labor");
    const unsubscribePositionLabor = onSnapshot(positionLaborRef, (snapshot) => {
      const rates: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const position = String(data.position || d.id || "").trim();
        const rawLabor = data.labor_cost_baht;
        const laborCost = typeof rawLabor === "number" ? rawLabor : Number(String(rawLabor || "").replace(/,/g, ""));
        if (position && Number.isFinite(laborCost)) rates[position] = laborCost;
      });
      setLaborByPosition(rates);
    }, (error) => {
      console.error("Error listening to position labor:", error);
    });

    return () => {
      unsubscribeEmployees();
      unsubscribePositionLabor();
    };
  }, [db, canSeeAllProjects, userProfile]);

  useEffect(() => {
    const attendanceDocRef = doc(db, "CMG-HR-Database", "root", "attendance", selectedDate);
    const unsubscribeAttendance = onSnapshot(attendanceDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const records: Record<string, AttendanceEntry> = {};
        if (data.records) {
          for (const [empId, val] of Object.entries(data.records)) {
            if (typeof val === "string") records[empId] = { status: val, recordedAt: 0 };
            else if (val && typeof val === "object") records[empId] = val as AttendanceEntry;
          }
        }
        setAttendance(records);
      } else {
        setAttendance({});
      }
    }, (error) => {
      console.error("Error listening to selected attendance:", error);
      setAttendance({});
    });

    return () => unsubscribeAttendance();
  }, [db, selectedDate]);

  const projectScopedEmployees = useMemo(() => {
    if (selectedProject === "all") return employees;
    return employees.filter((emp) => {
      const empProjects = emp.สถานะโครงการ;
      const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
      return projectList.includes(selectedProject);
    });
  }, [employees, selectedProject]);

  const getLaborCost = (emp: Employee) => {
    const position = String(emp["ตำแหน่ง"] || "").trim();
    return laborByPosition[position] || 0;
  };

  const isPresentForSelection = (emp: Employee) => {
    const entry = attendance[emp.id];
    if (entry?.status !== "มา") return false;
    if (selectedProject === "all") return true;
    return !entry.project || entry.project === selectedProject;
  };

  const report = useMemo(() => {
    const rowsByPosition: Record<string, ReportRow> = {};
    const rowsByGroup: Record<string, ReportRow> = {};
    const absentList: Employee[] = [];
    const otherProjectList: Employee[] = [];
    let present = 0;
    let absent = 0;
    let leave = 0;
    let otherProject = 0;
    let notRecorded = 0;
    let laborCost = 0;

    const ensureRow = (bucket: Record<string, ReportRow>, key: string) => {
      if (!bucket[key]) {
        bucket[key] = { key, label: key, total: 0, present: 0, absent: 0, leave: 0, otherProject: 0, notRecorded: 0, laborCost: 0 };
      }
      return bucket[key];
    };

    projectScopedEmployees.forEach((emp) => {
      const entry = attendance[emp.id];
      const isOtherProject = selectedProject !== "all" && entry?.status === "มา" && !!entry.project && entry.project !== selectedProject;
      const isPresent = isPresentForSelection(emp);
      const position = String(emp["ตำแหน่ง"] || "ไม่ระบุ").trim() || "ไม่ระบุ";
      const group = String(emp.สถานะกลุ่มงาน || emp.employee_type || "ไม่ระบุ").trim() || "ไม่ระบุ";
      const positionRow = ensureRow(rowsByPosition, position);
      const groupRow = ensureRow(rowsByGroup, group);
      const targets = [positionRow, groupRow];

      targets.forEach((row) => row.total++);

      if (isPresent) {
        const cost = getLaborCost(emp);
        present++;
        laborCost += cost;
        targets.forEach((row) => {
          row.present++;
          row.laborCost += cost;
        });
      } else if (isOtherProject) {
        otherProject++;
        otherProjectList.push(emp);
        targets.forEach((row) => row.otherProject++);
      } else if (entry?.status === "ไม่มา") {
        absent++;
        absentList.push(emp);
        targets.forEach((row) => row.absent++);
      } else if (entry?.status === "ลา") {
        leave++;
        absentList.push(emp);
        targets.forEach((row) => row.leave++);
      } else {
        notRecorded++;
        absentList.push(emp);
        targets.forEach((row) => row.notRecorded++);
      }
    });

    const total = projectScopedEmployees.length;
    return {
      total,
      present,
      absent,
      leave,
      otherProject,
      notRecorded,
      laborCost,
      presentPercent: total > 0 ? Math.round((present / total) * 100) : 0,
      positionRows: Object.values(rowsByPosition).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "th")),
      groupRows: Object.values(rowsByGroup).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "th")),
      absentList,
      otherProjectList,
    };
  }, [projectScopedEmployees, attendance, selectedProject, laborByPosition]);

  const selectedProjectLabel = selectedProject === "all" ? "ทุกโครงการ" : selectedProject || "ไม่ระบุโครงการ";
  const selectedProjectCode = selectedProject === "all" ? "ALL" : formatProjectNo(selectedProject);
  const formattedDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedLaborCost = report.laborCost.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const maxGroupTotal = Math.max(...report.groupRows.map((row) => row.total), 1);
  const maxPositionTotal = Math.max(...report.positionRows.map((row) => row.total), 1);
  const topPositionRows = report.positionRows.slice(0, 12);
  const statusChart = [
    { label: "มา", value: report.present, color: "bg-emerald-500", text: "text-emerald-700" },
    { label: "ไม่มา", value: report.absent, color: "bg-rose-500", text: "text-rose-700" },
    { label: "ลา", value: report.leave, color: "bg-amber-500", text: "text-amber-700" },
    { label: "อื่น/ยังไม่ลง", value: report.otherProject + report.notRecorded, color: "bg-slate-500", text: "text-slate-700" },
  ];
  const chartTotal = Math.max(report.total, 1);
  const pPresent = (report.present / chartTotal) * 100;
  const pAbsent = (report.absent / chartTotal) * 100;
  const pLeave = (report.leave / chartTotal) * 100;
  const pOther = ((report.otherProject + report.notRecorded) / chartTotal) * 100;
  const donutBg = `conic-gradient(
    #6ee7b7 0% ${pPresent}%,
    #fda4af ${pPresent}% ${pPresent + pAbsent}%,
    #fcd34d ${pPresent + pAbsent}% ${pPresent + pAbsent + pLeave}%,
    #cbd5e1 ${pPresent + pAbsent + pLeave}% 100%
  )`;

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

  return (
    <div className="bg-gradient-to-br from-rose-50 via-orange-50 to-sky-50 border border-rose-100 rounded-xl shadow-sm overflow-hidden text-sm">
      <div className="bg-white/90 border-b border-rose-100 px-3 py-2">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black text-rose-500 uppercase tracking-wide">Daily Manpower</div>
            <h1 className="text-lg md:text-xl font-black text-slate-900 truncate">{selectedProjectLabel}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 rounded">
                <Briefcase size={12} /> {selectedProjectCode}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 border border-sky-200 rounded">
                <Calendar size={12} /> {formattedDate}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-8 px-2 border border-rose-200 rounded bg-white text-xs focus:ring-2 focus:ring-rose-300 outline-none"
            />
            <select
              value={selectedProject || (canSeeAllProjects ? "all" : filteredProjectOptions[0] || "")}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="h-8 min-w-[220px] px-2 border border-sky-200 rounded bg-white text-xs focus:ring-2 focus:ring-sky-300 outline-none"
            >
              {canSeeAllProjects && <option value="all">ทุกโครงการ</option>}
              {filteredProjectOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="inline-flex h-8 border border-orange-200 rounded overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-2.5 inline-flex items-center gap-1 text-xs font-bold ${viewMode === "table" ? "bg-rose-400 text-white" : "text-slate-600 hover:bg-rose-50"}`}
              >
                <Table2 size={13} /> ตาราง
              </button>
              <button
                type="button"
                onClick={() => setViewMode("chart")}
                className={`px-2.5 inline-flex items-center gap-1 text-xs font-bold border-l border-orange-200 ${viewMode === "chart" ? "bg-sky-400 text-white" : "text-slate-600 hover:bg-sky-50"}`}
              >
                <BarChart3 size={13} /> กราฟ
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 border-b border-rose-100 bg-white/85">
        {[
          { label: "แรงงาน", value: report.total, icon: Users, color: "text-slate-900" },
          { label: "มา", value: report.present, icon: CheckCircle, color: "text-emerald-700" },
          { label: "ไม่มา", value: report.absent, icon: XCircle, color: "text-rose-700" },
          { label: "ลา", value: report.leave, icon: AlertCircle, color: "text-amber-700" },
          { label: "ค้าง", value: report.otherProject + report.notRecorded, icon: Clock, color: "text-slate-600" },
          { label: "ค่าแรง", value: `${formattedLaborCost} ฿`, icon: DollarSign, color: "text-emerald-800" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="px-3 py-2 border-r border-b md:border-b-0 border-rose-100 last:border-r-0 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-slate-500 uppercase truncate">{item.label}</div>
                  <div className={`text-xl font-black ${item.color} truncate`}>{item.value}</div>
                </div>
                <Icon size={17} className="text-rose-300 shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-3 items-start">
          <section className="bg-white border border-rose-100 rounded-xl overflow-hidden min-w-0 w-fit max-w-full shadow-sm">
            <div className="bg-gradient-to-r from-rose-300 to-orange-300 text-slate-800 px-2.5 py-1.5 font-black text-xs flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5"><BarChart3 size={14} /> MANPOWER REPORT</span>
              <span>{report.presentPercent}%</span>
            </div>

            {viewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-max max-w-full text-xs leading-tight border-collapse table-auto">
                  <thead>
                    <tr className="bg-rose-100 text-slate-800">
                      <th className="border border-rose-200 px-2 py-1 text-left whitespace-nowrap w-1">ตำแหน่ง</th>
                      <th className="border border-rose-200 px-2 py-1 text-center whitespace-nowrap w-1">ทั้งหมด</th>
                      <th className="border border-rose-200 px-2 py-1 text-center whitespace-nowrap w-1">มา</th>
                      <th className="border border-rose-200 px-2 py-1 text-center whitespace-nowrap w-1">ไม่มา</th>
                      <th className="border border-rose-200 px-2 py-1 text-center whitespace-nowrap w-1">ลา</th>
                      <th className="border border-rose-200 px-2 py-1 text-center whitespace-nowrap w-1">อื่น</th>
                      <th className="border border-rose-200 px-2 py-1 text-right whitespace-nowrap w-1">ค่าแรง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.positionRows.length === 0 ? (
                      <tr><td colSpan={7} className="border border-rose-200 px-2 py-3 text-center text-slate-500">ไม่มีข้อมูล</td></tr>
                    ) : report.positionRows.map((row) => (
                      <tr key={row.key} className="odd:bg-white even:bg-rose-50/40 h-6">
                        <td className="border border-rose-200 px-2 py-1 font-semibold text-slate-800 whitespace-nowrap max-w-[260px] truncate">{row.label}</td>
                        <td className="border border-rose-200 px-2 py-1 text-center font-bold whitespace-nowrap w-1">{row.total}</td>
                        <td className="border border-rose-200 px-2 py-1 text-center text-emerald-700 font-bold whitespace-nowrap w-1">{row.present}</td>
                        <td className="border border-rose-200 px-2 py-1 text-center text-rose-700 whitespace-nowrap w-1">{row.absent}</td>
                        <td className="border border-rose-200 px-2 py-1 text-center text-amber-700 whitespace-nowrap w-1">{row.leave}</td>
                        <td className="border border-rose-200 px-2 py-1 text-center text-slate-600 whitespace-nowrap w-1">{row.otherProject + row.notRecorded}</td>
                        <td className="border border-rose-200 px-2 py-1 text-right font-bold text-emerald-800 whitespace-nowrap w-1">{row.laborCost.toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-700 text-white font-black">
                      <td className="border border-slate-600 px-2 py-1 whitespace-nowrap">TOTAL</td>
                      <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap w-1">{report.total}</td>
                      <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap w-1">{report.present}</td>
                      <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap w-1">{report.absent}</td>
                      <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap w-1">{report.leave}</td>
                      <td className="border border-slate-600 px-2 py-1 text-center whitespace-nowrap w-1">{report.otherProject + report.notRecorded}</td>
                      <td className="border border-slate-600 px-2 py-1 text-right whitespace-nowrap w-1">{formattedLaborCost}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {report.positionRows.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">ไม่มีข้อมูล</div>
                ) : report.positionRows.map((row) => (
                  <div key={row.key} className="grid grid-cols-[minmax(140px,220px)_1fr_auto] gap-2 items-center text-xs">
                    <div className="font-bold text-slate-700 truncate" title={row.label}>{row.label}</div>
                    <div className="h-4 bg-orange-50 border border-orange-100 relative overflow-hidden rounded-sm">
                      <div className="h-full bg-sky-200" style={{ width: `${Math.max((row.total / maxPositionTotal) * 100, 3)}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${Math.max((row.present / maxPositionTotal) * 100, row.present > 0 ? 3 : 0)}%` }} />
                    </div>
                    <div className="w-12 text-right font-black text-slate-900">{row.present}/{row.total}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-sky-100 rounded-xl overflow-hidden min-w-0 w-fit max-w-full shadow-sm">
            <div className="bg-gradient-to-r from-sky-300 to-cyan-300 text-slate-800 px-2.5 py-1.5 font-black text-xs">ABSENT / REMAINING</div>
            <div className="overflow-x-auto">
              <table className="w-max max-w-full text-xs leading-tight border-collapse table-auto">
                <thead className="bg-sky-100">
                  <tr>
                    <th className="border border-sky-200 px-2 py-1 text-left whitespace-nowrap w-1">รหัส</th>
                    <th className="border border-sky-200 px-2 py-1 text-left whitespace-nowrap w-1">ชื่อ</th>
                    <th className="border border-sky-200 px-2 py-1 text-left whitespace-nowrap w-1">ตำแหน่ง</th>
                    <th className="border border-sky-200 px-2 py-1 text-left whitespace-nowrap w-1">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.absentList.length === 0 && report.otherProjectList.length === 0 ? (
                    <tr><td colSpan={4} className="border border-sky-200 px-2 py-3 text-center text-slate-500">ไม่มีรายการค้าง/ขาด/ลา</td></tr>
                  ) : [...report.absentList, ...report.otherProjectList].map((emp) => {
                    const entry = attendance[emp.id];
                    const name = `${emp["ชื่อตัว"] || ""} ${emp["ชื่อสกุล"] || ""}`.trim() || emp.name || "-";
                    const status = entry?.status === "มา" && entry.project && selectedProject !== "all" && entry.project !== selectedProject
                      ? `อยู่ ${formatProjectNo(entry.project)}`
                      : entry?.status || "ยังไม่ลง";
                    return (
                      <tr key={emp.id} className="odd:bg-white even:bg-sky-50/40 h-6">
                        <td className="border border-sky-200 px-2 py-1 whitespace-nowrap">{emp["รหัสพนักงาน"] || emp.id}</td>
                        <td className="border border-sky-200 px-2 py-1 font-semibold whitespace-nowrap max-w-[260px] truncate">{name}</td>
                        <td className="border border-sky-200 px-2 py-1 whitespace-nowrap max-w-[220px] truncate" title={emp["ตำแหน่ง"] || "-"}>{emp["ตำแหน่ง"] || "-"}</td>
                        <td className="border border-sky-200 px-2 py-1 font-bold whitespace-nowrap">{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-amber-100 rounded-xl overflow-hidden min-w-0 shadow-sm">
            <div className="bg-gradient-to-r from-amber-200 to-orange-200 text-slate-800 px-2.5 py-1.5 font-black text-xs">STATUS</div>
            <table className="w-max max-w-full text-xs leading-tight border-collapse table-auto">
              <tbody>
                <tr><td className="border border-amber-200 px-2 py-1 font-bold bg-amber-50 whitespace-nowrap w-1">Project</td><td className="border border-amber-200 px-2 py-1 whitespace-nowrap">{selectedProjectCode}</td></tr>
                <tr><td className="border border-amber-200 px-2 py-1 font-bold bg-amber-50 whitespace-nowrap w-1">Manpower</td><td className="border border-amber-200 px-2 py-1 font-black whitespace-nowrap">{report.total}</td></tr>
                <tr><td className="border border-amber-200 px-2 py-1 font-bold bg-amber-50 whitespace-nowrap w-1">Labor Cost</td><td className="border border-amber-200 px-2 py-1 font-black text-emerald-800 whitespace-nowrap">{formattedLaborCost} บาท</td></tr>
                <tr><td className="border border-amber-200 px-2 py-1 font-bold bg-amber-50 whitespace-nowrap w-1">Not Recorded</td><td className="border border-amber-200 px-2 py-1 whitespace-nowrap">{report.notRecorded}</td></tr>
              </tbody>
            </table>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-3 items-start">
          <section className="bg-white border border-emerald-100 rounded-xl overflow-hidden min-w-0 shadow-sm">
            <div className="bg-gradient-to-r from-emerald-200 to-sky-200 text-slate-800 px-2.5 py-1.5 font-black text-xs">SUMMARY GRAPH</div>
            <div className="p-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="grid grid-cols-[112px_1fr] gap-3 items-center">
                <div
                  className="aspect-square rounded-full p-3 flex items-center justify-center"
                  style={{ background: donutBg }}
                >
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center border border-emerald-100">
                    <div className="text-center">
                      <div className="text-xl font-black text-slate-900">{report.presentPercent}%</div>
                      <div className="text-[10px] font-bold text-slate-500">PRESENT</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex">
                    <div className="h-full bg-emerald-300" style={{ width: `${pPresent}%` }} />
                    <div className="h-full bg-rose-300" style={{ width: `${pAbsent}%` }} />
                    <div className="h-full bg-amber-300" style={{ width: `${pLeave}%` }} />
                    <div className="h-full bg-slate-300" style={{ width: `${pOther}%` }} />
                  </div>
                  {statusChart.map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs font-bold mb-0.5">
                        <span className={item.text}>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${report.total > 0 ? (item.value / report.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-sky-100 rounded overflow-hidden">
                <div className="bg-sky-50 px-2 py-1 text-[11px] font-black text-slate-600">กลุ่มงาน</div>
                <div className="p-3 space-y-1.5">
                  {report.groupRows.map((row) => (
                    <div key={row.key}>
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-0.5">
                        <span className="truncate pr-2">{row.label}</span>
                        <span>{row.present}/{row.total}</span>
                      </div>
                      <div className="h-4 bg-sky-50 border border-sky-100 relative overflow-hidden">
                        <div className="h-full bg-sky-300" style={{ width: `${Math.max((row.total / maxGroupTotal) * 100, 4)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-rose-100 rounded overflow-hidden">
                <div className="bg-rose-50 px-2 py-1 text-[11px] font-black text-slate-600">Top ตำแหน่ง</div>
                <div className="p-3 space-y-1.5">
                  {topPositionRows.map((row) => (
                    <div key={row.key}>
                      <div className="flex justify-between text-xs font-bold text-slate-700 mb-0.5">
                        <span className="truncate pr-2" title={row.label}>{row.label}</span>
                        <span>{row.present}/{row.total}</span>
                      </div>
                      <div className="h-4 bg-rose-50 border border-rose-100 relative overflow-hidden">
                        <div className="h-full bg-rose-200" style={{ width: `${Math.max((row.total / maxPositionTotal) * 100, 4)}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${Math.max((row.present / maxPositionTotal) * 100, row.present > 0 ? 4 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};





