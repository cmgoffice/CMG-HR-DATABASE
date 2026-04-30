import React, { useState, useEffect, useMemo } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  onSnapshot
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
import { useAuth } from "../auth/AuthContext";

interface Employee {
  id: string;
  สถานะพนักงาน?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  [key: string]: any;
}

// ฟังก์ชันสำหรับตัด Project No. ให้เหลือ 5 ตัวท้าย
// เช่น PRJ-2026-J-001 → J-001
// หรือ PRJ-2026-J-001 - Project Name → J-001
const formatProjectNo = (projectNo: string): string => {
  if (!projectNo || projectNo === "ไม่ระบุ") return projectNo;
  
  // ถ้ามี " - " (มี project name ต่อท้าย) ให้ตัดออกก่อน
  const cleanProjectNo = projectNo.includes(' - ') 
    ? projectNo.split(' - ')[0] 
    : projectNo;
  
  // ตัดเอา 2 ส่วนท้ายจาก "-" เช่น PRJ-2026-J-001 → J-001
  const parts = cleanProjectNo.split('-');
  if (parts.length >= 2) {
    return parts.slice(-2).join('-'); // เอา 2 ส่วนท้ายมาต่อกัน
  }
  return cleanProjectNo;
};

interface AttendanceEntry {
  status: string;
  recordedAt: number;
  project?: string; // โครงการที่ลงเวลา
}

export const ManpowerDashboard = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile, hasRole } = useAuth();
  const db = getFirestore();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, AttendanceEntry>>({});

  // กรอง projectOptions ตาม assignedProjects ของ user
  // MasterAdmin, MD, GM, PD, HRM, HR เห็นทุกโครงการ
  // Admin Site, Staff เห็นเฉพาะที่ assign ให้
  const filteredProjectOptions = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) {
      return projectOptions; // เห็นทุกโครงการ
    }
    
    // Admin Site, Staff เห็นเฉพาะโครงการที่ assign
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => assignedProjects.includes(project));
  }, [projectOptions, userProfile, hasRole]);

  // ตรวจสอบว่า Admin Site/Staff มีโครงการที่ถูกกำหนดหรือไม่
  const hasAssignedProjects = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) {
      return true; // Role เหล่านี้เห็นทุกโครงการ
    }
    return filteredProjectOptions.length > 0;
  }, [hasRole, filteredProjectOptions]);

  // โหลดข้อมูลพนักงาน (Realtime)
  useEffect(() => {
    setLoading(true);
    
    const employeeCollectionRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    
    // Listen to employee changes in realtime
    const unsubscribeEmployees = onSnapshot(employeeCollectionRef, (snapshot) => {
      let list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Employee))
        .filter((e) => e["สถานะพนักงาน"] === "ทำงาน");
      
      // กรองพนักงานสำหรับ Admin Site และ Staff
      if (hasRole(['Admin Site', 'Staff'])) {
        const assignedProjects = userProfile?.assignedProjects || [];
        list = list.filter((emp) => {
          const empProjects = emp.สถานะโครงการ;
          const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
          // เก็บเฉพาะพนักงานที่อยู่ในโครงการที่ถูกกำหนด
          return projectList.some((proj) => assignedProjects.includes(proj));
        });
      }
      
      setEmployees(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to employees:", error);
      setLoading(false);
    });

    // โหลดข้อมูลลงเวลาวันนี้ (Realtime)
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const attendanceDocRef = doc(db, "CMG-HR-Database", "root", "attendance", dateStr);
    
    const unsubscribeAttendance = onSnapshot(attendanceDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
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
      } else {
        setTodayAttendance({});
      }
    }, (error) => {
      console.error("Error listening to today's attendance:", error);
    });

    return () => {
      unsubscribeEmployees();
      unsubscribeAttendance();
    };
  }, [db, hasRole, userProfile]);

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
      
      // ตรวจสอบว่าพนักงานลงเวลาในโครงการไหน
      const attendance = todayAttendance[emp.id];
      const attendedProject = attendance?.project; // โครงการที่ลงเวลาจริง
      
      projectList.forEach((proj) => {
        // กรองเฉพาะโครงการที่ user มีสิทธิ์เห็น
        if (!filteredProjectOptions.includes(proj) && proj !== "ไม่ระบุ") {
          return; // ข้ามโครงการที่ไม่มีสิทธิ์
        }
        
        if (!projects[proj]) {
          projects[proj] = { total: 0, present: 0 };
        }
        projects[proj].total++;
        
        // นับ present เฉพาะเมื่อ:
        // 1. ลงเวลา "มา" และไม่มีระบุโครงการ (ลงในโครงการนี้)
        // 2. ลงเวลา "มา" และระบุโครงการตรงกับโครงการนี้
        if (attendance?.status === "มา") {
          if (!attendedProject || attendedProject === proj) {
            projects[proj].present++;
          }
        }
      });
    });

    return Object.entries(projects)
      .map(([name, data]) => ({
        name: formatProjectNo(name), // แสดง Project No. แบบสั้น
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

  // ถ้ายังไม่ได้กำหนดโครงการ
  if (!hasAssignedProjects) {
    return (
      <div className="bg-white rounded-lg border border-orange-200 p-12 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-orange-500" />
        <h3 className="text-lg font-bold text-gray-800 mb-2">คุณยังไม่ได้ถูกกำหนดโครงการ</h3>
        <p className="text-gray-600">กรุณาติดต่อ MasterAdmin เพื่อกำหนดโครงการให้กับคุณ</p>
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
