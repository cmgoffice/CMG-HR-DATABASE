import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Columns,
  Check,
  GripVertical,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

interface Employee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  สถานะกลุ่มงาน?: string;
  สถานะโครงการ?: string | string[];
  สถานะพนักงาน?: string;
  employee_type?: string;
  [key: string]: any;
}

// เก็บทั้ง status และ timestamp ที่กรอก
interface AttendanceEntry {
  status: string;       // "มา" | "ไม่มา" | "ลา"
  recordedAt: number;   // Unix timestamp (ms) ตอนที่กรอก
}

interface AttendanceDayData {
  records: Record<string, AttendanceEntry>;
  date: string;
  lastUpdatedBy: string;
  lastUpdatedAt: number;
}

type AttendanceStatus = "มา" | "ไม่มา" | "ลา" | "ขาดงาน" | "";

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  widthPx: number; // ใช้ตัวเลขเพื่อคำนวณ sticky ได้ถูกต้อง
  sticky: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "index",        label: "ลำดับ",         visible: true,  widthPx: 44,  sticky: true },
  { id: "รหัสพนักงาน",  label: "รหัสพนักงาน",   visible: true,  widthPx: 100, sticky: true },
  { id: "name",         label: "ชื่อ-นามสกุล",  visible: true,  widthPx: 160, sticky: true },
  { id: "ตำแหน่ง",      label: "ตำแหน่ง",       visible: true,  widthPx: 130, sticky: true },
  { id: "สถานะกลุ่มงาน",label: "กลุ่มงาน",      visible: true,  widthPx: 90,  sticky: true },
  { id: "สถานะโครงการ", label: "โครงการ",       visible: true,  widthPx: 160, sticky: true },
];

export const AttendancePage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { firebaseUser, userProfile, hasRole } = useAuth();
  const db = getFirestore();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // key = dateStr, value = map ของ employeeId -> AttendanceEntry
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, AttendanceEntry>>>({});
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);

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

  // ── Mouse drag-to-scroll state ────────────────────────────────────────────
  // เก็บ ref ของ scroll container แต่ละกลุ่ม (key = groupName)
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragState = useRef<{ active: boolean; startX: number; scrollLeft: number }>({
    active: false, startX: 0, scrollLeft: 0,
  });

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // ไม่ drag ถ้ากด double click (จะถูก handle โดย onDoubleClick ของ td)
    const el = e.currentTarget;
    dragState.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    e.preventDefault();
    const el = e.currentTarget;
    const walk = (e.pageX - el.offsetLeft) - dragState.current.startX;
    el.scrollLeft = dragState.current.scrollLeft - walk;
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragState.current.active = false;
    e.currentTarget.style.cursor = "grab";
    e.currentTarget.style.userSelect = "";
  }, []);

  const onMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState.current.active) {
      dragState.current.active = false;
      e.currentTarget.style.cursor = "grab";
      e.currentTarget.style.userSelect = "";
    }
  }, []);

  // ── โหลดพนักงาน ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "CMG-HR-Database", "root", "employee_data"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Employee))
          .filter((e) => e["สถานะพนักงาน"] === "ทำงาน");
        setEmployees(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db]);

  // ── โหลดข้อมูลลงเวลาทั้งเดือน ────────────────────────────────────────────
  useEffect(() => {
    if (employees.length === 0) return;
    const load = async () => {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const monthData: Record<string, Record<string, AttendanceEntry>> = {};

      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const snap = await getDoc(doc(db, "CMG-HR-Database", "root", "attendance", dateStr));
        if (snap.exists()) {
          const raw = snap.data();
          // รองรับทั้ง format เก่า (records เป็น string) และ format ใหม่ (records เป็น object)
          const records: Record<string, AttendanceEntry> = {};
          if (raw.records) {
            for (const [empId, val] of Object.entries(raw.records)) {
              if (typeof val === "string") {
                // format เก่า — ไม่มี timestamp ให้ใช้ 0 (ล็อคทันที)
                records[empId] = { status: val, recordedAt: 0 };
              } else if (val && typeof val === "object") {
                records[empId] = val as AttendanceEntry;
              }
            }
          }
          monthData[dateStr] = records;
        } else {
          monthData[dateStr] = {};
        }
      }
      setAttendanceData(monthData);
    };
    load();
  }, [currentMonth, employees, db]);

  // ── กรองพนักงานตามโครงการ ─────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    if (selectedProject === "all") return employees;
    return employees.filter((emp) => {
      const p = emp.สถานะโครงการ;
      return Array.isArray(p) ? p.includes(selectedProject) : p === selectedProject;
    });
  }, [employees, selectedProject]);

  // ── จัดกลุ่มตามสถานะกลุ่มงาน ─────────────────────────────────────────────
  const groupedEmployees = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    filteredEmployees.forEach((emp) => {
      const g = emp.สถานะกลุ่มงาน || "ไม่ระบุ";
      if (!groups[g]) groups[g] = [];
      groups[g].push(emp);
    });
    return groups;
  }, [filteredEmployees]);

  // ── รายการวันในเดือน ──────────────────────────────────────────────────────
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    
    // วันนี้สำหรับเปรียบเทียบ
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = date.getDay();
      
      // ตรวจสอบว่าเป็นวันนี้หรือไม่
      const checkDate = new Date(year, month, day);
      checkDate.setHours(0, 0, 0, 0);
      const isToday = checkDate.getTime() === today.getTime();
      
      return { day, dateStr, isWeekend: dow === 0 || dow === 6, isToday };
    });
  }, [currentMonth]);

  // ── ตรวจสอบว่าช่องนั้นล็อคหรือไม่ ───────────────────────────────────────
  // ล็อค = มีสถานะแล้ว AND ผ่านมาเกิน 24 ชั่วโมงจาก recordedAt
  const isLocked = (entry: AttendanceEntry | undefined): boolean => {
    if (!entry || !entry.status) return false; // ยังไม่มีสถานะ → ไม่ล็อค
    const now = Date.now();
    const recorded = entry.recordedAt || 0;
    return now - recorded > 24 * 60 * 60 * 1000; // > 24h
  };

  // ── แปลง "ไม่มา" → "ขาดงาน" เมื่อล็อคแล้ว ───────────────────────────────
  const getDisplayStatus = (entry: AttendanceEntry | undefined): AttendanceStatus => {
    if (!entry || !entry.status) return "";
    if (entry.status === "ไม่มา" && isLocked(entry)) return "ขาดงาน";
    return entry.status as AttendanceStatus;
  };

  // ── บันทึกการลงเวลา ───────────────────────────────────────────────────────
  const handleAttendanceClick = async (
    employeeId: string,
    dateStr: string,
    currentEntry: AttendanceEntry | undefined
  ) => {
    // ตรวจสอบว่าเป็นวันในอนาคตหรือไม่
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    
    // ห้ามลงเวลาล่วงหน้า
    if (targetDate > today) {
      return; // วันในอนาคต ไม่ให้ลง
    }
    
    // ตรวจสอบว่าล็อคแล้วหรือไม่
    if (isLocked(currentEntry)) return; // ล็อคแล้ว ไม่ทำอะไร

    const cur = currentEntry?.status || "";
    let newStatus: string;
    if (!cur) newStatus = "มา";
    else if (cur === "มา") newStatus = "ไม่มา";
    else if (cur === "ไม่มา") newStatus = "ลา";
    else newStatus = ""; // ลา → ล้างออก

    const now = Date.now();
    const newEntry: AttendanceEntry | null =
      newStatus === "" ? null : { status: newStatus, recordedAt: now };

    // อัพเดท local state ทันที
    setAttendanceData((prev) => {
      const dayRecords = { ...(prev[dateStr] || {}) };
      if (newEntry === null) {
        delete dayRecords[employeeId];
      } else {
        dayRecords[employeeId] = newEntry;
      }
      return { ...prev, [dateStr]: dayRecords };
    });

    // บันทึก Firestore
    setSaving(true);
    try {
      const attendanceRef = doc(db, "CMG-HR-Database", "root", "attendance", dateStr);
      const updatedRecords: Record<string, AttendanceEntry> = {
        ...(attendanceData[dateStr] || {}),
      };
      if (newEntry === null) {
        delete updatedRecords[employeeId];
      } else {
        updatedRecords[employeeId] = newEntry;
      }

      await setDoc(
        attendanceRef,
        {
          date: dateStr,
          records: updatedRecords,
          lastUpdatedBy: firebaseUser?.email || "unknown",
          lastUpdatedAt: now,
        },
        { merge: false } // เขียนทับทั้ง document เพื่อให้ records สะอาด
      );
    } catch (err) {
      console.error("Save error:", err);
      // revert
      setAttendanceData((prev) => {
        const dayRecords = { ...(prev[dateStr] || {}) };
        if (currentEntry) {
          dayRecords[employeeId] = currentEntry;
        } else {
          delete dayRecords[employeeId];
        }
        return { ...prev, [dateStr]: dayRecords };
      });
    } finally {
      setSaving(false);
    }
  };

  // ── เปลี่ยนเดือน ──────────────────────────────────────────────────────────
  const changeMonth = (offset: number) => {
    setCurrentMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + offset);
      return d;
    });
  };

  // ── Column management ─────────────────────────────────────────────────────
  const toggleColumnVisibility = (id: string) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  const handleDragStart = (i: number) => setDraggedIdx(i);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (dropIdx: number) => {
    if (draggedIdx === null) return;
    const next = [...columns];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(dropIdx, 0, moved);
    setColumns(next);
    setDraggedIdx(null);
  };

  // คำนวณ sticky left จาก visible columns จริงๆ
  const visibleColumns = useMemo(() => {
    let left = 0;
    return columns
      .filter((c) => c.visible)
      .map((c) => {
        const col = { ...c, computedLeft: left };
        left += c.widthPx;
        return col;
      });
  }, [columns]);

  // ── Render cell สถานะ ─────────────────────────────────────────────────────
  const renderStatusCell = (employeeId: string, dateStr: string, isWeekend: boolean, isToday: boolean) => {
    const entry = attendanceData[dateStr]?.[employeeId];
    const displayStatus = getDisplayStatus(entry);
    const locked = isLocked(entry);

    // ตรวจสอบว่าเป็นวันในอนาคตหรือไม่
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const isFuture = targetDate > today;

    let bg = isWeekend ? "bg-gray-100" : "bg-white hover:bg-gray-50";
    let text = "";
    let textCls = "text-gray-300";

    // ถ้าเป็นวันนี้ ให้มีสีพื้นหลังเด่นขึ้น
    if (isToday && !displayStatus) {
      bg = "bg-blue-50 hover:bg-blue-100 border-2 border-blue-300";
    }

    // ถ้าเป็นวันในอนาคต แสดงเป็นสีเทาและ disable
    if (isFuture) {
      bg = "bg-gray-50";
      textCls = "text-gray-300";
      text = "";
    } else if (displayStatus === "มา") {
      bg = locked ? "bg-green-100" : "bg-green-100 hover:bg-green-200";
      textCls = "text-green-700 font-semibold";
      text = "มา";
      // เพิ่มเส้นขอบถ้าเป็นวันนี้
      if (isToday) bg += " border-2 border-blue-400";
    } else if (displayStatus === "ไม่มา") {
      bg = locked ? "bg-red-100" : "bg-red-100 hover:bg-red-200";
      textCls = "text-red-700 font-semibold";
      text = "ไม่มา";
      if (isToday) bg += " border-2 border-blue-400";
    } else if (displayStatus === "ลา") {
      bg = locked ? "bg-orange-100" : "bg-orange-100 hover:bg-orange-200";
      textCls = "text-orange-700 font-semibold";
      text = "ลา";
      if (isToday) bg += " border-2 border-blue-400";
    } else if (displayStatus === "ขาดงาน") {
      bg = "bg-red-200";
      textCls = "text-red-900 font-bold";
      text = "ขาด";
      if (isToday) bg += " border-2 border-blue-400";
    }

    // คำนวณเวลาที่เหลือก่อนล็อค (สำหรับ tooltip)
    let tooltipExtra = "";
    if (isFuture) {
      tooltipExtra = " ⏭️ ไม่สามารถลงล่วงหน้าได้";
    } else if (entry?.status && !locked) {
      const remaining = 24 * 60 * 60 * 1000 - (Date.now() - (entry.recordedAt || 0));
      const hrs = Math.floor(remaining / 3_600_000);
      const mins = Math.floor((remaining % 3_600_000) / 60_000);
      tooltipExtra = ` (แก้ไขได้อีก ${hrs}ชม. ${mins}น.)`;
    } else if (locked) {
      tooltipExtra = " 🔒 ล็อคแล้ว";
    }

    if (isToday) {
      tooltipExtra = " 📅 วันนี้" + tooltipExtra;
    }

    const canEdit = !isFuture && !locked;

    return (
      <td
        key={dateStr}
        className={`border border-gray-200 text-center transition-colors select-none ${bg} ${textCls} ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
        style={{ minWidth: 40, maxWidth: 40, width: 40, padding: "1px 0", fontSize: 10, height: 24 }}
        onDoubleClick={(e) => {
          e.stopPropagation(); // ป้องกัน event bubble ไปที่ scroll container
          if (canEdit) handleAttendanceClick(employeeId, dateStr, entry);
        }}
        title={`${dateStr}: ${displayStatus || "ยังไม่ลงเวลา"}${tooltipExtra}\n${canEdit ? "(ดับเบิ้ลคลิกเพื่อเปลี่ยนสถานะ)" : ""}`}
      >
        {text}
      </td>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  const monthName = currentMonth.toLocaleDateString("th-TH", { year: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      {/* ── Controls ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* เดือน */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar size={13} className="inline mr-1" />เลือกเดือน
            </label>
            <div className="flex items-center gap-1">
              <button onClick={() => changeMonth(-1)} className="p-1.5 border rounded hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 text-center font-bold text-sm">{monthName}</div>
              <button onClick={() => changeMonth(1)} className="p-1.5 border rounded hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* โครงการ */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Users size={13} className="inline mr-1" />กรองตามโครงการ
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="all">ทุกโครงการ</option>
              {filteredProjectOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* จัดการคอลัมน์ */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Columns size={13} className="inline mr-1" />จัดการคอลัมน์
            </label>
            <div className="relative">
              <button
                onClick={() => setIsColumnMenuOpen((o) => !o)}
                className="w-full px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center justify-between"
              >
                <span>แสดง/ซ่อน &amp; จัดเรียง</span>
                <Columns size={15} />
              </button>
              {isColumnMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsColumnMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                      ลากเพื่อจัดเรียง · คลิก ✓ เพื่อซ่อน
                    </div>
                    {columns.map((col, i) => (
                      <div
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(i)}
                        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 cursor-move hover:bg-gray-50 ${draggedIdx === i ? "opacity-40" : ""}`}
                      >
                        <GripVertical size={13} className="text-gray-400 shrink-0" />
                        <div
                          className={`w-4 h-4 flex items-center justify-center rounded border shrink-0 cursor-pointer ${col.visible ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}
                          onClick={(e) => { e.stopPropagation(); toggleColumnVisibility(col.id); }}
                        >
                          {col.visible && <Check size={11} className="text-white" />}
                        </div>
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-4 text-xs flex-wrap">
        <span className="font-semibold text-blue-900">คำอธิบาย:</span>
        {[
          { bg: "bg-green-100 border-green-300", text: "text-green-700", label: "มา", desc: "= มา" },
          { bg: "bg-red-100 border-red-300",     text: "text-red-700",   label: "ไม่มา", desc: "= ไม่มา" },
          { bg: "bg-orange-100 border-orange-300",text: "text-orange-700",label: "ลา",   desc: "= ลา" },
          { bg: "bg-red-200 border-red-400",      text: "text-red-900 font-bold", label: "ขาด", desc: "= ขาดงาน 🔒" },
          { bg: "bg-gray-100 border-gray-300",    text: "",              label: "",     desc: "= วันหยุด" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className={`w-6 h-5 border rounded flex items-center justify-center ${item.bg} ${item.text}`} style={{ fontSize: 9 }}>
              {item.label}
            </div>
            <span className="text-gray-600">{item.desc}</span>
          </div>
        ))}
        <span className="text-gray-400 ml-auto">🔒 = ล็อคหลังกรอก 24 ชม.</span>
      </div>

      {/* ── Tables ── */}
      {Object.keys(groupedEmployees).length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>ไม่พบข้อมูลพนักงานในโครงการที่เลือก</p>
        </div>
      ) : (
        Object.entries(groupedEmployees).map(([groupName, groupEmps]) => (
          <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Group header */}
            <div className="bg-slate-800 px-4 py-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={15} />
                {groupName}
                <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full text-xs">{groupEmps.length} คน</span>
              </h2>
            </div>

            {/* Table */}
            <div
              className="overflow-x-auto"
              style={{ cursor: "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
            >
              <table
                className="border-collapse"
                style={{ fontSize: 11, lineHeight: "1.1", tableLayout: "fixed",
                  width: `${visibleColumns.reduce((s, c) => s + c.widthPx, 0) + daysInMonth.length * 40}px` }}
              >
                <thead>
                  <tr style={{ height: 26 }}>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        className="border border-gray-400 bg-orange-500 text-white px-1 py-0.5 sticky z-20 text-left"
                        style={{ width: col.widthPx, minWidth: col.widthPx, left: col.computedLeft }}
                      >
                        {col.label}
                      </th>
                    ))}
                    {daysInMonth.map(({ day, isWeekend, isToday }) => (
                      <th
                        key={day}
                        className={`border border-gray-400 text-white px-0 py-0.5 text-center ${
                          isToday 
                            ? "bg-blue-600 font-bold shadow-md" 
                            : isWeekend 
                              ? "bg-orange-400" 
                              : "bg-orange-500"
                        }`}
                        style={{ width: 40, minWidth: 40 }}
                        title={isToday ? "📅 วันนี้" : ""}
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupEmps.map((emp, idx) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-blue-50 transition-colors"
                      style={{ height: 24 }}
                    >
                      {visibleColumns.map((col) => {
                        let content: React.ReactNode = "-";
                        if (col.id === "index") content = idx + 1;
                        else if (col.id === "รหัสพนักงาน") content = emp.รหัสพนักงาน || "-";
                        else if (col.id === "name") content = `${emp.ชื่อตัว || ""} ${emp.ชื่อสกุล || ""}`.trim() || "-";
                        else if (col.id === "ตำแหน่ง") content = emp.ตำแหน่ง || "-";
                        else if (col.id === "สถานะกลุ่มงาน") content = (
                          <span className="px-1 py-0.5 bg-sky-100 text-sky-700 rounded" style={{ fontSize: 10 }}>
                            {emp.สถานะกลุ่มงาน || "-"}
                          </span>
                        );
                        else if (col.id === "สถานะโครงการ") content = Array.isArray(emp.สถานะโครงการ)
                          ? emp.สถานะโครงการ.join(", ")
                          : emp.สถานะโครงการ || "-";

                        return (
                          <td
                            key={col.id}
                            className="border border-gray-200 px-1 py-0 sticky bg-white z-10 overflow-hidden whitespace-nowrap text-ellipsis"
                            style={{ width: col.widthPx, minWidth: col.widthPx, left: col.computedLeft }}
                          >
                            {content}
                          </td>
                        );
                      })}
                      {daysInMonth.map(({ dateStr, isWeekend, isToday }) =>
                        renderStatusCell(emp.id, dateStr, isWeekend, isToday)
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Saving toast */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 text-xs">
          <Loader2 size={13} className="animate-spin" />
          กำลังบันทึก...
        </div>
      )}
    </div>
  );
};
