import React, { useState, useEffect, useMemo } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  BarChart3,
} from "lucide-react";

interface Employee {
  id: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  [key: string]: any;
}

interface AttendanceEntry {
  status: string;
  recordedAt: number;
}

export const ManpowerDashboard = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile, hasRole } = useAuth();
  const db = getFirestore();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, AttendanceEntry>>({});

  // กรอง projectOptions ตาม assignedProjects ของ user
  // MasterAdmin เห็นทุกโครงการ, user อื่นเห็นเฉพาะที่ assign ให้
  const filteredProjectOptions = useMemo(() => {
    if (hasRole(['MasterAdmin'])) {
      return projectOptions; // MasterAdmin เห็นทุกโครงการ
    }
    
    // User ทั่วไป เห็นเฉพาะโครงการที่ถูก assign
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => assignedProjects.includes(project));
  }, [projectOptions, userProfile, hasRole]);

  // โหลดข้อมูลพนักงาน
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "CMG-HR-Database", "root", "employee_data"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Employee))
          .filter((e) => e["สถานะพนักงาน"] === "ทำงาน");
        setEmployees(list);

        // โหลดข้อมูลลงเวลาวันนี้
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const attendanceSnap = await getDoc(doc(db, "CMG-HR-Database", "root", "attendance", dateStr));
        
        if (attendanceSnap.exists()) {
          const data = attendanceSnap.data();
          const records: Record<string, AttendanceEntry> = {};
          if (data.records) {
            for (const [empId, val] of Object.entries(data.records)) {
              if (typeof val === "string") {
                records[empId] = { status: val, recordedAt: 0 };
              } else if (val && typeof val === "object") {
                records[empId] = val as AttendanceEntry;
              }
            }
          }
          setTodayAttendance(records);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db]);

  // สถิติรวม
  const stats = useMemo(() => {
    const total = employees.length;
    const present = Object.values(todayAttendance).filter((e) => e.status === "มา").length;
    const absent = Object.values(todayAttendance).filter((e) => e.status === "ไม่มา").length;
    const leave = Object.values(todayAttendance).filter((e) => e.status === "ลา").length;
    const notRecorded = total - present - absent - leave;
    const presentPercent = total > 0 ? Math.round((present / total) * 100) : 0;

    return { total, present, absent, leave, notRecorded, presentPercent };
  }, [employees, todayAttendance]);

  // จัดกลุ่มตามสถานะกลุ่มงาน
  const groupStats = useMemo(() => {
    const groups: Record<string, { total: number; present: number }> = {};
    
    employees.forEach((emp) => {
      const group = emp.สถานะกลุ่มงาน || "ไม่ระบุ";
      if (!groups[group]) {
        groups[group] = { total: 0, present: 0 };
      }
      groups[group].total++;
      
      const attendance = todayAttendance[emp.id];
      if (attendance?.status === "มา") {
        groups[group].present++;
      }
    });

    return Object.entries(groups).map(([name, data]) => ({
      name,
      total: data.total,
      present: data.present,
      percent: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    }));
  }, [employees, todayAttendance]);

  // จัดกลุ่มตามโครงการ (เฉพาะโครงการที่ user มีสิทธิ์เห็น)
  const projectStats = useMemo(() => {
    const projects: Record<string, { total: number; present: number }> = {};
    
    employees.forEach((emp) => {
      const empProjects = emp.สถานะโครงการ;
      const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : ["ไม่ระบุ"];
      
      projectList.forEach((proj) => {
        // กรองเฉพาะโครงการที่ user มีสิทธิ์เห็น
        if (!filteredProjectOptions.includes(proj) && proj !== "ไม่ระบุ") {
          return; // ข้ามโครงการที่ไม่มีสิทธิ์
        }
        
        if (!projects[proj]) {
          projects[proj] = { total: 0, present: 0 };
        }
        projects[proj].total++;
        
        const attendance = todayAttendance[emp.id];
        if (attendance?.status === "มา") {
          projects[proj].present++;
        }
      });
    });

    return Object.entries(projects)
      .map(([name, data]) => ({
        name,
        total: data.total,
        present: data.present,
        percent: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // แสดงแค่ 10 โครงการแรก
  }, [employees, todayAttendance, filteredProjectOptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("th-TH", { 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    weekday: "long" 
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BarChart3 size={36} />
              Manpower Dashboard
            </h1>
            <p className="text-blue-100 mt-2 flex items-center gap-2">
              <Calendar size={16} />
              {today}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold">{stats.presentPercent}%</div>
            <div className="text-blue-100 text-sm">อัตราการมาทำงาน</div>
          </div>
        </div>
      </div>

      {/* สถิติรวมวันนี้ */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">พนักงานทั้งหมด</p>
              <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
            </div>
            <Users size={40} className="text-blue-500 opacity-80" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">มา</p>
              <p className="text-3xl font-bold text-green-600">{stats.present}</p>
            </div>
            <CheckCircle size={40} className="text-green-500 opacity-80" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">ไม่มา</p>
              <p className="text-3xl font-bold text-red-600">{stats.absent}</p>
            </div>
            <XCircle size={40} className="text-red-500 opacity-80" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">ลา</p>
              <p className="text-3xl font-bold text-orange-600">{stats.leave}</p>
            </div>
            <AlertCircle size={40} className="text-orange-500 opacity-80" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">ยังไม่ลง</p>
              <p className="text-3xl font-bold text-gray-600">{stats.notRecorded}</p>
            </div>
            <Clock size={40} className="text-gray-400 opacity-80" />
          </div>
        </div>
      </div>

      {/* สถิติตามกลุ่มงาน */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Users size={24} />
          สถิติตามสถานะกลุ่มงาน
        </h2>
        <div className="space-y-4">
          {groupStats.map((group) => (
            <div key={group.name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{group.name}</span>
                <span className="text-gray-600">
                  {group.present} / {group.total} ({group.percent}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    group.percent >= 80
                      ? "bg-green-500"
                      : group.percent >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${group.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* สถิติตามโครงการ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 size={24} />
          สถิติตามโครงการ (Top 10)
        </h2>
        <div className="space-y-4">
          {projectStats.map((project) => (
            <div key={project.name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 truncate max-w-md" title={project.name}>
                  {project.name}
                </span>
                <span className="text-gray-600 whitespace-nowrap ml-2">
                  {project.present} / {project.total} ({project.percent}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    project.percent >= 80
                      ? "bg-blue-500"
                      : project.percent >= 50
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${project.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
