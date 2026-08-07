import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
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
  AlertCircle,
  ArrowUp,
  ArrowDown,
  History,
  X,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { InfoTooltip } from "./InfoTooltip";
import { createNotifications } from "../utils/notifications";
import {
  RETRO_LEAVE_COLLECTION,
  OPEN_RETRO_LEAVE_STORAGE_KEY,
  RetroLeaveRequest,
  RETRO_LEAVE_STATUS_LABELS,
  RETRO_LEAVE_STATUS_COLORS,
  RETRO_LEAVE_REQUESTABLE_STATUSES,
  canSubmitRetroLeave,
  canApproveRetroLeave,
  makeRetroLeaveAction,
  hasPendingRetroLeaveRequest,
} from "./retroLeaveConfig";

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
  ชื่อชุด?: string; // สำหรับ Supply Contract
  [key: string]: any;
}

// เก็บทั้ง status และ timestamp ที่กรอก
interface AttendanceEntry {
  status: string;       // "มา" | "ไม่มา" | "ลา"
  recordedAt: number;   // Unix timestamp (ms) ตอนที่กรอก
  project?: string;     // โครงการที่ลงเวลา (เฉพาะเมื่อ status = "มา")
  editstatus?: string;  // "donotEdit" = ล็อคช่องนี้จากฐานข้อมูล
  color?: string;       // "red" = บังคับพื้นหลังสีแดง ตัวอักษรสีขาว
  retroRequestId?: string;  // อ้างอิงคำร้องขอลาย้อนหลังที่ทำให้ค่านี้ถูกแก้ (ใช้แสดง badge/tooltip)
  retroApprovedAt?: number; // เวลาจริงที่อนุมัติคำร้อง (recordedAt จะถูกตั้งเป็น 0 เพื่อล็อคทันที ไม่ใช่เวลาจริง)
}

interface AttendanceDayData {
  records: Record<string, AttendanceEntry>;
  date: string;
  lastUpdatedBy: string;
  lastUpdatedAt: number;
}

// "H" = วันหยุดพนักงาน (รายบุคคล) ไม่นับเป็นขาดงานและไม่นับเป็นค้างลงเวลา
type AttendanceStatus = "มา" | "ไม่มา" | "ลา" | "ขาดงาน" | "H" | "";

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  widthPx: number; // ใช้ตัวเลขเพื่อคำนวณ sticky ได้ถูกต้อง
  sticky: boolean;
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

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "index",        label: "ลำดับ",         visible: true,  widthPx: 44,  sticky: true },
  { id: "รหัสพนักงาน",  label: "รหัสพนักงาน",   visible: true,  widthPx: 100, sticky: true },
  { id: "name",         label: "ชื่อ-นามสกุล",  visible: true,  widthPx: 160, sticky: true },
  { id: "ตำแหน่ง",      label: "ตำแหน่ง",       visible: true,  widthPx: 130, sticky: true },
  { id: "สถานะกลุ่มงาน",label: "กลุ่มงาน",      visible: false, widthPx: 90,  sticky: true },
  { id: "สถานะโครงการ", label: "โครงการ",       visible: false, widthPx: 160, sticky: true },
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
  const [dayOffs, setDayOffs] = useState<Record<string, string>>({});

  // ── คำร้องขอลาย้อนหลัง ────────────────────────────────────────────────────
  const [retroRequests, setRetroRequests] = useState<RetroLeaveRequest[]>([]);
  const [retroModalTarget, setRetroModalTarget] = useState<{ employeeId: string; dateStr: string } | null>(null);
  const [showRetroPanel, setShowRetroPanel] = useState(false);
  const [retroSubmitting, setRetroSubmitting] = useState(false);
  const [retroRejectTargetId, setRetroRejectTargetId] = useState<string | null>(null);
  const [retroRejectNote, setRetroRejectNote] = useState("");

  // ── Sort state ────────────────────────────────────────────────────────────
  type SortKey = 'รหัสพนักงาน' | 'name' | 'ตำแหน่ง' | 'ชื่อชุด';
  interface SortState {
    key: SortKey;
    direction: 'asc' | 'desc';
  }
  const [sortState, setSortState] = useState<SortState | null>(null);

  const handleSort = (key: SortKey) => {
    setSortState((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // ── กรอง projectOptions ตาม assignedProjects ของ user
  // MasterAdmin, MD, GM, PD, HRM, HR เห็นทุกโครงการ
  // Admin Site, Staff เห็นเฉพาะที่ assign ให้ และไม่เห็น "ทุกโครงการ"
  const filteredProjectOptions = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) {
      return projectOptions; // เห็นทุกโครงการ
    }
    
    // Admin Site, Staff เห็นเฉพาะโครงการที่ assign
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => assignedProjects.includes(project));
  }, [projectOptions, userProfile, hasRole]);

  // ตั้งค่า default project สำหรับ Admin Site/Staff
  useEffect(() => {
    if (hasRole(['Admin Site', 'Staff']) && filteredProjectOptions.length > 0) {
      setSelectedProject(filteredProjectOptions[0]);
    }
  }, [hasRole, filteredProjectOptions]);

  // ตรวจสอบว่าสามารถลงเวลาได้หรือไม่
  // MasterAdmin, MD, GM, HR, Admin Site สามารถลงเวลาได้
  // PD, HRM, Staff ดูอย่างเดียว
  const canEditAttendance = useMemo(() => {
    return hasRole(['MasterAdmin', 'MD', 'GM', 'HR', 'Admin Site']);
  }, [hasRole]);

  // ── สิทธิ์เกี่ยวกับ "คำร้องขอลาย้อนหลัง" ──────────────────────────────────
  const canSubmitRetro = useMemo(() => canSubmitRetroLeave(userProfile?.role), [userProfile]);
  const canApproveRetro = useMemo(() => canApproveRetroLeave(userProfile?.role), [userProfile]);
  const canSeeRetroPanel = canSubmitRetro || canApproveRetro;

  // ตรวจสอบว่า Admin Site/Staff มีโครงการที่ถูกกำหนดหรือไม่
  const hasAssignedProjects = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) {
      return true; // Role เหล่านี้เห็นทุกโครงการ
    }
    return filteredProjectOptions.length > 0;
  }, [hasRole, filteredProjectOptions]);

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

  // ── โหลดพนักงาน (Realtime) ──────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    
    const employeeCollectionRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    
    // Listen to employee changes in realtime
    const unsubscribe = onSnapshot(employeeCollectionRef, (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Employee))
        .filter((e) => e["สถานะพนักงาน"] === "ทำงาน");
      setEmployees(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to employees:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  // ── โหลดข้อมูลลงเวลาทั้งเดือน (Realtime) ────────────────────────────────
  useEffect(() => {
    if (employees.length === 0) return;
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const unsubscribes: (() => void)[] = [];
    
    // Listen to each day's attendance in realtime
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const attendanceDocRef = doc(db, "CMG-HR-Database", "root", "attendance", dateStr);
      
      const unsubscribe = onSnapshot(attendanceDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const raw = docSnap.data();
          const records: Record<string, AttendanceEntry> = {};
          
          if (raw.records) {
            for (const [empId, val] of Object.entries(raw.records)) {
              if (typeof val === "string") {
                records[empId] = { status: val, recordedAt: 0 };
              } else if (val && typeof val === "object") {
                records[empId] = val as AttendanceEntry;
              }
            }
          }
          
          setAttendanceData((prev) => ({ ...prev, [dateStr]: records }));
        } else {
          setAttendanceData((prev) => ({ ...prev, [dateStr]: {} }));
        }
      }, (error) => {
        console.error(`Error listening to attendance for ${dateStr}:`, error);
      });
      
      unsubscribes.push(unsubscribe);
    }
    
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [currentMonth, employees, db]);

  // ── โหลดข้อมูลวันหยุด (Realtime) ────────────────────────────────
  useEffect(() => {
    const dayOffsRef = collection(db, "CMG-HR-Database", "root", "day_offs");
    const unsubscribe = onSnapshot(dayOffsRef, (snapshot) => {
      const data: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().name;
      });
      setDayOffs(data);
    });
    return () => unsubscribe();
  }, [db]);

  // ── โหลดคำร้องขอลาย้อนหลัง (Realtime) ────────────────────────────────────
  // HR-tier เห็นทุกคำร้อง, Admin Site เห็นเฉพาะคำร้องที่ตนยื่นเอง
  useEffect(() => {
    if (!firebaseUser?.uid || !canSeeRetroPanel) {
      setRetroRequests([]);
      return;
    }
    const colRef = collection(db, "CMG-HR-Database", "root", RETRO_LEAVE_COLLECTION);
    const q = canApproveRetro ? colRef : query(colRef, where("submittedByUid", "==", firebaseUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ ...(d.data() as RetroLeaveRequest), id: d.id }));
      rows.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      setRetroRequests(rows);
    }, (error) => {
      console.error("Error listening to retro leave requests:", error);
    });
    return () => unsubscribe();
  }, [db, firebaseUser?.uid, canApproveRetro, canSeeRetroPanel]);

  // ── เปิด panel คำร้องขอลาย้อนหลังอัตโนมัติเมื่อมาจากการแจ้งเตือน ──────────
  useEffect(() => {
    const openId = sessionStorage.getItem(OPEN_RETRO_LEAVE_STORAGE_KEY);
    if (openId) {
      sessionStorage.removeItem(OPEN_RETRO_LEAVE_STORAGE_KEY);
      setShowRetroPanel(true);
    }
  }, []);

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
      const groupKey = emp.สถานะกลุ่มงาน || "ไม่ระบุ";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(emp);
    });
    
    // Sort พนักงานภายในแต่ละกลุ่ม
    Object.keys(groups).forEach((groupKey) => {
      const hasSetColumn = groupKey === "Supply Contract" || groupKey === "Worker" || groupKey === "Subcontract";

      groups[groupKey].sort((a, b) => {
        if (sortState) {
          let cmp = 0;
          switch (sortState.key) {
            case 'รหัสพนักงาน':
              cmp = (a.รหัสพนักงาน || "").localeCompare(b.รหัสพนักงาน || "", 'th', { numeric: true });
              break;
            case 'name':
              cmp = (`${a.ชื่อตัว || ""} ${a.ชื่อสกุล || ""}`).localeCompare(`${b.ชื่อตัว || ""} ${b.ชื่อสกุล || ""}`, 'th');
              break;
            case 'ตำแหน่ง':
              cmp = (a.ตำแหน่ง || "").localeCompare(b.ตำแหน่ง || "", 'th');
              break;
            case 'ชื่อชุด':
              cmp = (a.ชื่อชุด || "ไม่ระบุชุด").localeCompare(b.ชื่อชุด || "ไม่ระบุชุด", 'th');
              break;
            default:
              cmp = 0;
          }
          return sortState.direction === 'asc' ? cmp : -cmp;
        }

        // Default sort: ถ้ากลุ่มมีชื่อชุด sort ตามชื่อชุด แล้วตามชื่อ
        if (hasSetColumn) {
          const setA = a.ชื่อชุด || "ไม่ระบุชุด";
          const setB = b.ชื่อชุด || "ไม่ระบุชุด";
          if (setA !== setB) return setA.localeCompare(setB, 'th');
        }
        return (`${a.ชื่อตัว || ""} ${a.ชื่อสกุล || ""}`).localeCompare(`${b.ชื่อตัว || ""} ${b.ชื่อสกุล || ""}`, 'th');
      });
    });

    return groups;
  }, [filteredEmployees, sortState]);

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

  // ── ตรวจสอบว่าช่องนั้นล็อคตามเวลา/ถูกสั่งห้ามแก้ไขหรือไม่ ───────────────
  // แยกสองเงื่อนไขออกจากกัน เพื่อให้ editstatus ไม่ทำให้ "ไม่มา" กลายเป็น
  // "ขาดงาน" ก่อนครบ 24 ชั่วโมง
  const isTimeLocked = (entry: AttendanceEntry | undefined): boolean => {
    if (!entry || !entry.status) return false; // ยังไม่มีสถานะ → ไม่ล็อค
    const now = Date.now();
    const recorded = entry.recordedAt || 0;
    return now - recorded > 24 * 60 * 60 * 1000; // > 24h
  };

  const isEditDisabled = (entry: AttendanceEntry | undefined): boolean => {
    return entry?.editstatus === "donotEdit";
  };

  // ── แปลง "ไม่มา" → "ขาดงาน" เมื่อล็อคแล้ว ───────────────────────────────
  const getDisplayStatus = (entry: AttendanceEntry | undefined): AttendanceStatus => {
    if (!entry || !entry.status) return "";
    if (entry.status === "ไม่มา" && isTimeLocked(entry)) return "ขาดงาน";
    return entry.status as AttendanceStatus;
  };

  // ── บันทึกการลงเวลา ───────────────────────────────────────────────────────
  const handleAttendanceClick = useCallback(async (
    employeeId: string,
    dateStr: string,
    isOtherProject: boolean = false,
    forceStatus?: string
  ) => {
    // ใช้ functional update เพื่อดึง state ล่าสุด
    setAttendanceData((prevData) => {
      if (isOtherProject) return prevData;

      const currentEntry = prevData[dateStr]?.[employeeId];

      // ฟิลด์นี้มีสิทธิ์เหนือกฎ today และการแก้ไขแบบรายช่องทั้งหมด
      if (isEditDisabled(currentEntry)) return prevData;
      
      // ตรวจสอบว่าเป็นวันในอนาคตหรือไม่
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const targetDate = new Date(dateStr);
      targetDate.setHours(0, 0, 0, 0);
      
      // ห้ามลงเวลาล่วงหน้า
      if (targetDate > today) {
        return prevData; // ไม่เปลี่ยนแปลง
      }
      
      // ตรวจสอบว่าล็อคแล้วหรือไม่
      const locked = currentEntry && currentEntry.status && 
                     (Date.now() - (currentEntry.recordedAt || 0) > 24 * 60 * 60 * 1000);
      if (locked) {
        return prevData; // ไม่เปลี่ยนแปลง
      }

      const cur = currentEntry?.status || "";
      let newStatus: string;
      if (forceStatus !== undefined) {
        newStatus = forceStatus;
        if (cur === forceStatus) return prevData; // No change needed
      } else {
        if (!cur) newStatus = "มา";
        else if (cur === "มา") newStatus = "ไม่มา";
        else if (cur === "ไม่มา") newStatus = "ลา";
        else newStatus = ""; // ลา → ล้างออก
      }

      const now = Date.now();
      let newEntry: AttendanceEntry | null = null;
      
      if (newStatus !== "") {
        newEntry = {
          ...currentEntry,
          status: newStatus,
          recordedAt: now
        };

        // project ใช้เฉพาะสถานะ "มา" เท่านั้น ส่วน metadata เช่น color และ
        // editstatus ยังคงถูกเก็บไว้เมื่อเปลี่ยนสถานะ
        delete newEntry.project;
        
        // เพิ่ม project field เฉพาะเมื่อเป็น "มา" และกรองโครงการอยู่
        if (newStatus === "มา" && selectedProject !== "all") {
          newEntry.project = selectedProject;
        }
      } else if (currentEntry?.color !== undefined || currentEntry?.editstatus !== undefined) {
        // ล้างเฉพาะสถานะ แต่ไม่ลบ metadata ที่กำหนดสี/สิทธิ์จากฐานข้อมูล
        newEntry = {
          ...currentEntry,
          status: "",
          recordedAt: now
        };
        delete newEntry.project;
      }

      // อัพเดท state
      const dayRecords = { ...(prevData[dateStr] || {}) };
      if (newEntry === null) {
        delete dayRecords[employeeId];
      } else {
        dayRecords[employeeId] = newEntry;
      }
      
      const updatedData = { ...prevData, [dateStr]: dayRecords };

      // บันทึก Firestore (async)
      (async () => {
        setSaving(true);
        try {
          const attendanceRef = doc(db, "CMG-HR-Database", "root", "attendance", dateStr);
          const updatedRecords: Record<string, AttendanceEntry> = { ...dayRecords };

          await setDoc(
            attendanceRef,
            {
              date: dateStr,
              records: updatedRecords,
              lastUpdatedBy: firebaseUser?.email || "unknown",
              lastUpdatedAt: now,
            },
            { merge: false }
          );
        } catch (err) {
          console.error("Save error:", err);
          // revert
          setAttendanceData((prev) => {
            const revertRecords = { ...(prev[dateStr] || {}) };
            if (currentEntry) {
              revertRecords[employeeId] = currentEntry;
            } else {
              delete revertRecords[employeeId];
            }
            return { ...prev, [dateStr]: revertRecords };
          });
        } finally {
          setSaving(false);
        }
      })();

      return updatedData;
    });
  }, [db, firebaseUser, selectedProject]);

  // ── ดับเบิ้ลคลิกที่หัวตารางวันที่ เพื่อเปลี่ยนสถานะทั้งวัน ─────────────────
  const handleDateHeaderDoubleClick = async (dateStr: string) => {
    // ตรวจสอบว่าเป็นวันในอนาคตหรือไม่
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    
    if (targetDate > today) {
      return; // วันในอนาคต ไม่ให้ลง
    }

    const now = Date.now();
    const currentDayRecords = attendanceData[dateStr] || {};
    
    // หาสถานะส่วนใหญ่ของวันนั้น (ที่ไม่ล็อค)
    const statuses = filteredEmployees
      .map(emp => currentDayRecords[emp.id])
      .filter(entry => !isTimeLocked(entry) && !isEditDisabled(entry))
      .map(entry => entry?.status || "");
    
    // นับสถานะ
    const statusCount: Record<string, number> = {};
    statuses.forEach(s => {
      statusCount[s] = (statusCount[s] || 0) + 1;
    });
    
    // หาสถานะที่มีมากที่สุด
    let dominantStatus = "";
    let maxCount = 0;
    for (const [status, count] of Object.entries(statusCount)) {
      if (count > maxCount) {
        maxCount = count;
        dominantStatus = status;
      }
    }
    
    // กำหนดสถานะใหม่ตามลำดับ: "" → "มา" → "ไม่มา" → ""
    let newStatus: string;
    if (!dominantStatus || dominantStatus === "") {
      newStatus = "มา";
    } else if (dominantStatus === "มา") {
      newStatus = "ไม่มา";
    } else {
      newStatus = ""; // ไม่มา → ว่าง
    }
    
    // อัพเดททุกคนในวันนั้น (เฉพาะที่ไม่ล็อค)
    const updatedRecords: Record<string, AttendanceEntry> = { ...currentDayRecords };
    
    filteredEmployees.forEach(emp => {
      const currentEntry = currentDayRecords[emp.id];
      if (isTimeLocked(currentEntry) || isEditDisabled(currentEntry)) return;

      // ข้ามพนักงานที่ลงเวลา "มา" ในโครงการอื่นแล้ว
      if (selectedProject !== "all") {
        const empProjects = emp.สถานะโครงการ;
        const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
        const isMultiProject = projectList.length > 1;
        const attendedProject = currentEntry?.project;
        if (isMultiProject && attendedProject && attendedProject !== selectedProject && currentEntry?.status === "มา") {
          return;
        }
      }

      if (newStatus === "") {
        if (currentEntry?.color !== undefined || currentEntry?.editstatus !== undefined) {
          updatedRecords[emp.id] = {
            ...currentEntry,
            status: "",
            recordedAt: now,
          };
          delete updatedRecords[emp.id].project;
        } else {
          delete updatedRecords[emp.id];
        }
      } else {
        const newEntry: AttendanceEntry = {
          ...currentEntry,
          status: newStatus,
          recordedAt: now
        };

        delete newEntry.project;
        
        // เพิ่ม project field เฉพาะเมื่อเป็น "มา" และกรองโครงการอยู่
        if (newStatus === "มา" && selectedProject !== "all") {
          newEntry.project = selectedProject;
        }
        
        updatedRecords[emp.id] = newEntry;
      }
    });
    
    // อัพเดท local state
    setAttendanceData(prev => ({
      ...prev,
      [dateStr]: updatedRecords
    }));
    
    // บันทึก Firestore
    setSaving(true);
    try {
      const attendanceRef = doc(db, "CMG-HR-Database", "root", "attendance", dateStr);
      await setDoc(
        attendanceRef,
        {
          date: dateStr,
          records: updatedRecords,
          lastUpdatedBy: firebaseUser?.email || "unknown",
          lastUpdatedAt: now,
        },
        { merge: false }
      );
    } catch (err) {
      console.error("Save error:", err);
      // revert
      setAttendanceData(prev => ({
        ...prev,
        [dateStr]: currentDayRecords
      }));
    } finally {
      setSaving(false);
    }
  };

  // ── ยื่นคำร้องขอลาย้อนหลัง (Admin Site) ───────────────────────────────────
  const handleSubmitRetroLeave = async (requestedStatus: string, reason: string) => {
    if (!retroModalTarget || !firebaseUser) return;
    const { employeeId, dateStr } = retroModalTarget;
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;

    if (hasPendingRetroLeaveRequest(retroRequests, employeeId, dateStr)) {
      alert("มีคำร้องขอลาย้อนหลังสำหรับวันนี้ที่ยังรออนุมัติอยู่แล้ว");
      return;
    }

    const currentEntry = attendanceData[dateStr]?.[employeeId];
    const currentStatus = getDisplayStatus(currentEntry);
    const roleList = userProfile?.role || [];
    const actor = { uid: firebaseUser.uid, name: firebaseUser.email || "unknown", role: roleList[0] || "" };
    const action = makeRetroLeaveAction("submitted", actor);

    const employeeName = `${employee.ชื่อตัว || ""} ${employee.ชื่อสกุล || ""}`.trim() || "-";
    const newRequest: Omit<RetroLeaveRequest, "id"> = {
      employeeId,
      employeeName,
      project: selectedProject !== "all" ? selectedProject : (currentEntry?.project || ""),
      dateStr,
      currentStatus,
      requestedStatus,
      reason,
      status: "pending",
      submittedByUid: firebaseUser.uid,
      submittedByName: firebaseUser.email || "unknown",
      submittedByRole: actor.role,
      submittedAt: Date.now(),
      actions: [action],
    };

    setRetroSubmitting(true);
    try {
      const colRef = collection(db, "CMG-HR-Database", "root", RETRO_LEAVE_COLLECTION);
      const docRef = await addDoc(colRef, newRequest);

      // แจ้งเตือน HR-tier ทุกคนที่มีสิทธิ์อนุมัติ
      const usersSnap = await getDocs(
        query(collection(db, "CMG-HR-Database", "root", "users"), where("status", "==", "approved"))
      );
      const recipientUids = usersSnap.docs
        .map((d) => ({ uid: d.id, role: (d.data().role || []) as string[] }))
        .filter((u) => canApproveRetroLeave(u.role))
        .map((u) => u.uid);

      await createNotifications(db, recipientUids, {
        module: "retro_leave",
        type: "retro_leave_submitted",
        title: "มีคำร้องขอลาย้อนหลังใหม่",
        message: `${employeeName} วันที่ ${dateStr} ขอเปลี่ยนเป็น "${requestedStatus || "ล้างสถานะ"}"`,
        caseId: docRef.id,
        createdByUid: firebaseUser.uid,
        createdByName: firebaseUser.email || "unknown",
      });

      setRetroModalTarget(null);
    } catch (err) {
      console.error("Submit retro leave error:", err);
      alert("เกิดข้อผิดพลาดในการยื่นคำร้อง กรุณาลองใหม่");
    } finally {
      setRetroSubmitting(false);
    }
  };

  // ── อนุมัติคำร้องขอลาย้อนหลัง (HR-tier) ───────────────────────────────────
  // เขียนสถานะใหม่ลง attendance พร้อมตั้ง recordedAt: 0 เพื่อให้กลไก isTimeLocked
  // เดิมมองว่าล็อคทันที ป้องกันไม่ให้แก้ไขผ่านตารางได้อีก ต้องยื่นคำร้องใหม่เท่านั้น
  const handleApproveRetroLeave = async (request: RetroLeaveRequest) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const roleList = userProfile?.role || [];
      const actor = { uid: firebaseUser.uid, name: firebaseUser.email || "unknown", role: roleList[0] || "" };
      const action = makeRetroLeaveAction("approved", actor);
      const now = Date.now();

      const reqRef = doc(db, "CMG-HR-Database", "root", RETRO_LEAVE_COLLECTION, request.id);
      await updateDoc(reqRef, {
        status: "approved",
        reviewedByUid: firebaseUser.uid,
        reviewedByName: firebaseUser.email || "unknown",
        reviewedAt: now,
        actions: [...(request.actions || []), action],
      });

      const dayRecords = { ...(attendanceData[request.dateStr] || {}) };
      const existingEntry = dayRecords[request.employeeId];
      const newEntry: AttendanceEntry = {
        ...existingEntry,
        status: request.requestedStatus,
        recordedAt: 0, // ตั้งใจให้เกิน 24 ชม.ทันที → ล็อคช่องนี้ทันทีหลังอนุมัติ
        retroRequestId: request.id,
        retroApprovedAt: now,
      };
      delete newEntry.project;
      if (request.requestedStatus === "มา" && request.project) {
        newEntry.project = request.project;
      }
      dayRecords[request.employeeId] = newEntry;

      const attendanceRef = doc(db, "CMG-HR-Database", "root", "attendance", request.dateStr);
      await setDoc(
        attendanceRef,
        {
          date: request.dateStr,
          records: dayRecords,
          lastUpdatedBy: firebaseUser.email || "unknown",
          lastUpdatedAt: now,
        },
        { merge: false }
      );

      setAttendanceData((prev) => ({ ...prev, [request.dateStr]: dayRecords }));

      await createNotifications(db, [request.submittedByUid], {
        module: "retro_leave",
        type: "retro_leave_approved",
        title: "คำร้องขอลาย้อนหลังได้รับการอนุมัติ",
        message: `${request.employeeName} วันที่ ${request.dateStr} เปลี่ยนเป็น "${request.requestedStatus || "ล้างสถานะ"}"`,
        caseId: request.id,
        createdByUid: firebaseUser.uid,
        createdByName: firebaseUser.email || "unknown",
      });
    } catch (err) {
      console.error("Approve retro leave error:", err);
      alert("เกิดข้อผิดพลาดในการอนุมัติ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  // ── ปฏิเสธคำร้องขอลาย้อนหลัง (HR-tier) ────────────────────────────────────
  const handleRejectRetroLeave = async (request: RetroLeaveRequest, note: string) => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const roleList = userProfile?.role || [];
      const actor = { uid: firebaseUser.uid, name: firebaseUser.email || "unknown", role: roleList[0] || "" };
      const action = makeRetroLeaveAction("rejected", actor, note);
      const now = Date.now();

      const reqRef = doc(db, "CMG-HR-Database", "root", RETRO_LEAVE_COLLECTION, request.id);
      await updateDoc(reqRef, {
        status: "rejected",
        reviewedByUid: firebaseUser.uid,
        reviewedByName: firebaseUser.email || "unknown",
        reviewedAt: now,
        reviewNote: note,
        actions: [...(request.actions || []), action],
      });

      await createNotifications(db, [request.submittedByUid], {
        module: "retro_leave",
        type: "retro_leave_rejected",
        title: "คำร้องขอลาย้อนหลังถูกปฏิเสธ",
        message: `${request.employeeName} วันที่ ${request.dateStr} · เหตุผล: ${note}`,
        caseId: request.id,
        createdByUid: firebaseUser.uid,
        createdByName: firebaseUser.email || "unknown",
      });

      setRetroRejectTargetId(null);
      setRetroRejectNote("");
    } catch (err) {
      console.error("Reject retro leave error:", err);
      alert("เกิดข้อผิดพลาดในการปฏิเสธ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  // ── แปลงรหัสโครงการเป็นรหัสย่อ ────────────────────────────────────────────
  const getProjectShortCode = (projectName: string): string => {
    // ตัวอย่าง: PRJ-2026-J-001 → J01
    // ตัวอย่าง: PRJ-2026-J-02B → J02B
    // ตัวอย่าง: PRJ-2026-J-001 - Project Name → J01
    
    // ถ้ามี " - " (มี project name ต่อท้าย) ให้ตัดออกก่อน
    const cleanProjectNo = projectName.includes(' - ') 
      ? projectName.split(' - ')[0] 
      : projectName;
    
    // รูปแบบ: PRJ-YYYY-X-NNN หรือ PRJ-YYYY-X-NNX
    const match = cleanProjectNo.match(/PRJ-\d{4}-([A-Z]+)-0*(\d+[A-Z]*)$/i);
    if (match) {
      const letter = match[1].toUpperCase(); // J
      let number = match[2]; // 1, 2B, 001, 02B
      
      // ลบ leading zeros และเติม 0 ข้างหน้าให้เป็น 2 หลัก (ถ้าเป็นตัวเลขล้วน)
      if (/^\d+$/.test(number)) {
        // ตัวเลขล้วน: 001 → 01, 1 → 01
        number = number.padStart(2, '0');
      } else {
        // มีตัวอักษรปนอยู่: 02B → 02B, 2B → 02B
        const numMatch = number.match(/^(\d+)([A-Z]+)$/i);
        if (numMatch) {
          const num = numMatch[1].padStart(2, '0');
          const suffix = numMatch[2].toUpperCase();
          number = num + suffix;
        }
      }
      
      return `${letter}${number}`; // J01, J02B
    }
    
    // ถ้าไม่ตรงรูปแบบ ให้แสดงชื่อเต็ม
    return projectName;
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
  const renderStatusCell = (employeeId: string, dateStr: string, isWeekend: boolean, isToday: boolean, employee: Employee) => {
    const entry = attendanceData[dateStr]?.[employeeId];
    const locked = isTimeLocked(entry);
    const editDisabled = isEditDisabled(entry);
    const forceRed = entry?.color === "red";
    const dayOffName = dayOffs[dateStr];

    // ตรวจสอบว่าเป็นวันในอนาคตหรือไม่
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const isFuture = targetDate > today;

    // ข้อมูลที่เพิ่มล่วงหน้าจาก Database ต้องแสดงสถานะจริงแบบอ่านอย่างเดียว
    // และยังไม่แปลง "ไม่มา" เป็น "ขาดงาน" จนกว่าจะถึงวันดังกล่าว
    const displayStatus = isFuture
      ? (entry?.status as AttendanceStatus) || ""
      : getDisplayStatus(entry);

    // ตรวจสอบว่าพนักงานอยู่หลายโครงการหรือไม่
    const empProjects = employee.สถานะโครงการ;
    const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
    const isMultiProject = projectList.length > 1;
    
    // ตรวจสอบว่าลงเวลาในโครงการอื่นหรือไม่
    const attendedProject = entry?.project;
    const isOtherProject = !!(isMultiProject && 
                           attendedProject && 
                           selectedProject !== "all" && 
                           attendedProject !== selectedProject &&
                           displayStatus === "มา");

    // สามารถแก้ไขได้ถ้า: ไม่ใช่วันในอนาคต และ ไม่ล็อค และ มีสิทธิ์แก้ไข และ ไม่ได้ลงเวลาที่โครงการอื่น
    const canEdit = !isFuture && !locked && !editDisabled && canEditAttendance && !isOtherProject;

    // ช่องที่ล็อคแล้วและมีสถานะอยู่ Admin Site ยื่นคำร้องขอลาย้อนหลังได้
    // (ยกเว้นถูกสั่งห้ามแก้ไขถาวร หรือมีคำร้อง pending ค้างอยู่แล้วสำหรับช่องนี้)
    const hasPendingRetro = hasPendingRetroLeaveRequest(retroRequests, employeeId, dateStr);
    const canOpenRetroRequest =
      !isFuture && locked && !editDisabled && !isOtherProject && canSubmitRetro && !hasPendingRetro;
    const wasRetroApproved = !!entry?.retroRequestId;

    let bg = dayOffName ? "bg-fuchsia-50 hover:bg-fuchsia-100" : (isWeekend ? "bg-gray-100" : "bg-white hover:bg-gray-50");
    let text = "";
    let textCls = "text-gray-300";

    // ถ้าเป็นวันนี้ ให้มีสีพื้นหลังเด่นขึ้น
    if (isToday && !displayStatus) {
      bg = "bg-blue-100 hover:bg-blue-200 border border-gray-300";
    }

    // วันอนาคตที่ไม่มีข้อมูลยังคงเป็นช่องว่าง ส่วน record ที่มีอยู่ให้แสดง
    // ด้วยเงื่อนไขสถานะด้านล่าง โดย canEdit ยังคงเป็น false
    if (isFuture && !displayStatus) {
      bg = "bg-gray-50";
      textCls = "text-gray-300";
      text = "";
    } else if (isOtherProject) {
      // แสดงรหัสย่อของโครงการที่ลงเวลา
      bg = locked ? "bg-green-100" : "bg-green-100 hover:bg-green-200";
      textCls = "text-green-700 font-semibold";
      text = getProjectShortCode(attendedProject!);
      if (isToday) bg = locked ? "bg-green-200 border border-gray-300" : "bg-green-200 hover:bg-green-300 border border-gray-300";
    } else if (displayStatus === "มา") {
      bg = locked ? "bg-green-100" : "bg-green-100 hover:bg-green-200";
      textCls = "text-green-700 font-semibold";
      text = "มา";
      // เพิ่มสีพาสเทลถ้าเป็นวันนี้
      if (isToday) bg = locked ? "bg-green-200 border border-gray-300" : "bg-green-200 hover:bg-green-300 border border-gray-300";
    } else if (displayStatus === "ไม่มา") {
      bg = locked ? "bg-red-100" : "bg-red-100 hover:bg-red-200";
      textCls = "text-red-700 font-semibold";
      text = "ไม่มา";
      if (isToday) bg = locked ? "bg-red-200 border border-gray-300" : "bg-red-200 hover:bg-red-300 border border-gray-300";
    } else if (displayStatus === "ลา") {
      bg = locked ? "bg-orange-100" : "bg-orange-100 hover:bg-orange-200";
      textCls = "text-orange-700 font-semibold";
      text = "ลา";
      if (isToday) bg = locked ? "bg-orange-200 border border-gray-300" : "bg-orange-200 hover:bg-orange-300 border border-gray-300";
    } else if (displayStatus === "ขาดงาน") {
      bg = "bg-red-200";
      textCls = "text-red-900 font-bold";
      text = "ขาด";
      if (isToday) bg = "bg-red-300 border border-gray-300";
    } else if (displayStatus === "H") {
      bg = locked ? "bg-purple-100" : "bg-purple-100 hover:bg-purple-200";
      textCls = "text-purple-700 font-semibold";
      text = "H";
      if (isToday) bg = locked ? "bg-purple-200 border border-gray-300" : "bg-purple-200 hover:bg-purple-300 border border-gray-300";
    }

    // color จากฐานข้อมูลมีสิทธิ์เหนือสีของ status, today, weekend และวันหยุด
    const forcedColorStyle: React.CSSProperties | undefined = forceRed
      ? { backgroundColor: "#dc2626", color: "#ffffff", opacity: 1 }
      : undefined;

    // คำนวณเวลาที่เหลือก่อนล็อค (สำหรับ tooltip)
    let tooltipExtra = "";
    if (isFuture) {
      tooltipExtra = entry?.status
        ? " ⏭️ ข้อมูลล่วงหน้า • อ่านอย่างเดียว"
        : " ⏭️ ไม่สามารถลงล่วงหน้าได้";
    } else if (editDisabled) {
      tooltipExtra = " 🔒 ถูกกำหนดห้ามแก้ไข";
      if (entry?.status && !locked) {
        const remaining = Math.max(0, 24 * 60 * 60 * 1000 - (Date.now() - (entry.recordedAt || 0)));
        const hrs = Math.floor(remaining / 3_600_000);
        const mins = Math.floor((remaining % 3_600_000) / 60_000);
        tooltipExtra += ` • ครบ 24 ชม.ใน ${hrs}ชม. ${mins}น.`;
      }
    } else if (isOtherProject) {
      tooltipExtra = ` 📍 ลงเวลาที่โครงการ: ${attendedProject}`;
      if (!locked) {
        const remaining = 24 * 60 * 60 * 1000 - (Date.now() - (entry.recordedAt || 0));
        const hrs = Math.floor(remaining / 3_600_000);
        const mins = Math.floor((remaining % 3_600_000) / 60_000);
        tooltipExtra += ` (แก้ไขได้อีก ${hrs}ชม. ${mins}น.)`;
      } else {
        tooltipExtra += " 🔒 ล็อคแล้ว";
      }
    } else if (entry?.status && !locked) {
      const remaining = 24 * 60 * 60 * 1000 - (Date.now() - (entry.recordedAt || 0));
      const hrs = Math.floor(remaining / 3_600_000);
      const mins = Math.floor((remaining % 3_600_000) / 60_000);
      tooltipExtra = ` (แก้ไขได้อีก ${hrs}ชม. ${mins}น.)`;
    } else if (entry?.status && locked) {
      tooltipExtra = " 🔒 ล็อคแล้ว";
    }

    if (dayOffName) {
      tooltipExtra = ` 🌴 ${dayOffName}` + tooltipExtra;
    }

    if (isToday) {
      tooltipExtra = " 📅 วันนี้" + tooltipExtra;
    }

    if (wasRetroApproved) {
      const approvedDate = entry?.retroApprovedAt ? new Date(entry.retroApprovedAt).toLocaleString("th-TH") : "";
      tooltipExtra += ` 📝 แก้ไขผ่านคำร้องขอลาย้อนหลัง${approvedDate ? ` เมื่อ ${approvedDate}` : ""} • ต้องยื่นคำร้องใหม่หากต้องการแก้ไขอีก`;
    } else if (canOpenRetroRequest) {
      tooltipExtra += " • คลิกเพื่อยื่นคำร้องขอลาย้อนหลัง";
    }

    const cursorCls = canEdit || canOpenRetroRequest ? "cursor-pointer" : "cursor-not-allowed opacity-60";
    const retroRingCls = canOpenRetroRequest ? " ring-1 ring-inset ring-indigo-400" : "";

    return (
      <td
        key={dateStr}
        data-date={dateStr}
        tabIndex={canEdit ? 0 : undefined}
        className={`relative border border-gray-200 text-center transition-colors select-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${bg} ${textCls} ${cursorCls}${retroRingCls}`}
        style={{ minWidth: 40, maxWidth: 40, width: 40, padding: "1px 0", fontSize: 10, height: 24, ...forcedColorStyle }}
        onClick={(e) => {
          if (canOpenRetroRequest) {
            e.stopPropagation();
            setRetroModalTarget({ employeeId, dateStr });
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation(); // ป้องกัน event bubble ไปที่ scroll container
          if (canEdit) handleAttendanceClick(employeeId, dateStr, isOtherProject);
        }}
        onKeyDown={(e) => {
          if (!canEdit) return;
          if (e.key === "1") {
            e.preventDefault();
            handleAttendanceClick(employeeId, dateStr, isOtherProject, "มา");
          } else if (e.key === "2") {
            e.preventDefault();
            handleAttendanceClick(employeeId, dateStr, isOtherProject, "ไม่มา");
          } else if (e.key === "3") {
            e.preventDefault();
            handleAttendanceClick(employeeId, dateStr, isOtherProject, "ลา");
          } else if (e.key === "4") {
            e.preventDefault();
            handleAttendanceClick(employeeId, dateStr, isOtherProject, "H");
          } else if (e.key === "Enter") {
            e.preventDefault();
            const cells = Array.from(document.querySelectorAll(`td[data-date="${dateStr}"]`)) as HTMLElement[];
            const currentIdx = cells.indexOf(e.currentTarget);
            if (currentIdx !== -1 && currentIdx < cells.length - 1) {
              cells[currentIdx + 1].focus();
            }
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            handleAttendanceClick(employeeId, dateStr, isOtherProject, "");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const cells = Array.from(document.querySelectorAll(`td[data-date="${dateStr}"]`)) as HTMLElement[];
            const currentIdx = cells.indexOf(e.currentTarget);
            if (currentIdx !== -1 && currentIdx < cells.length - 1) cells[currentIdx + 1].focus();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const cells = Array.from(document.querySelectorAll(`td[data-date="${dateStr}"]`)) as HTMLElement[];
            const currentIdx = cells.indexOf(e.currentTarget);
            if (currentIdx !== -1 && currentIdx > 0) cells[currentIdx - 1].focus();
          }
        }}
        title={`${dateStr}${tooltipExtra}`}
      >
        {text}
        {wasRetroApproved && (
          <span
            className="absolute top-0 right-0 w-[6px] h-[6px] rounded-full bg-indigo-500"
            style={{ transform: "translate(30%, -30%)" }}
          />
        )}
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

  const pendingRetroCount = retroRequests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span>Attendance</span>
              <InfoTooltip
                content={
                  <div>
                    <div className="font-semibold text-slate-800 mb-1">วิธีอ่านข้อมูล</div>
                    <div>ตารางนี้แสดงสถานะรายวันของพนักงานตามเดือนและโครงการที่เลือก</div>
                    <div>สูตรสรุปหลัก: จำนวนสถานะแต่ละประเภท = นับจาก attendance record รายวันของพนักงาน</div>
                  </div>
                }
              />
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              ใช้ติดตามการมา ขาด ลา มาผิดโครงการ และวันหยุดในมุมมองรายเดือน
            </p>
          </div>
          {canSeeRetroPanel && (
            <button
              onClick={() => setShowRetroPanel(true)}
              className="relative shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100"
            >
              <History size={14} />
              คำร้องขอลาย้อนหลัง
              {pendingRetroCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingRetroCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
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
              {/* Admin Site และ Staff ไม่เห็น "ทุกโครงการ" */}
              {hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR']) && (
                <option value="all">ทุกโครงการ</option>
              )}
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
          { bg: "bg-green-100 border-green-300", text: "text-green-700 font-semibold", label: "J01", desc: "= มาที่โครงการอื่น" },
          { bg: "bg-red-100 border-red-300",     text: "text-red-700",   label: "ไม่มา", desc: "= ไม่มา" },
          { bg: "bg-orange-100 border-orange-300",text: "text-orange-700",label: "ลา",   desc: "= ลา" },
          { bg: "bg-red-200 border-red-400",      text: "text-red-900 font-bold", label: "ขาด", desc: "= ขาดงาน 🔒" },
          { bg: "bg-purple-100 border-purple-300",text: "text-purple-700 font-semibold", label: "H",    desc: "= วันหยุดพนักงาน (ไม่นับขาด/ค้างลงเวลา)" },
          { bg: "bg-gray-100 border-gray-300",    text: "",              label: "",     desc: "= วันหยุด" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className={`w-6 h-5 border rounded flex items-center justify-center ${item.bg} ${item.text}`} style={{ fontSize: 9 }}>
              {item.label}
            </div>
            <span className="text-gray-600">{item.desc}</span>
          </div>
        ))}
        <span className="text-gray-400 ml-auto">
          🔒 = ล็อคหลังกรอก 24 ชม. | คีย์ลัด: 1=มา 2=ไม่มา 3=ลา 4=H
          {canSubmitRetro && " | ช่องกรอบม่วง = คลิกเพื่อยื่นคำร้องขอลาย้อนหลัง"}
        </span>
      </div>

      {/* ── Tables ── */}
      {!hasAssignedProjects ? (
        <div className="bg-white rounded-lg border border-orange-200 p-12 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-orange-500" />
          <h3 className="text-lg font-bold text-gray-800 mb-2">คุณยังไม่ได้ถูกกำหนดโครงการ</h3>
          <p className="text-gray-600">กรุณาติดต่อ MasterAdmin เพื่อกำหนดโครงการให้กับคุณ</p>
        </div>
      ) : Object.keys(groupedEmployees).length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>ไม่พบข้อมูลพนักงานในโครงการที่เลือก</p>
        </div>
      ) : (
        Object.entries(groupedEmployees).map(([groupName, groupEmps]) => {
          // กลุ่มที่มีคอลัมน์ ชื่อชุด
          const hasSetColumn = groupName === "Supply Contract" || groupName === "Worker" || groupName === "Subcontract";
          
          return (
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
              <div className="min-w-max relative">
                <table
                  className="border-collapse"
                  style={{ fontSize: 11, lineHeight: "1.1", tableLayout: "fixed",
                    width: `${visibleColumns.reduce((s, c) => s + c.widthPx, 0) + (hasSetColumn ? 100 : 0) + daysInMonth.length * 40}px` }}
                >
                <thead>
                  <tr style={{ height: 26 }}>
                    {visibleColumns.map((col) => {
                      const isSortable = col.id === 'รหัสพนักงาน' || col.id === 'name' || col.id === 'ตำแหน่ง';
                      const isActive = sortState?.key === col.id;
                      return (
                        <th
                          key={col.id}
                          className={`border border-gray-400 bg-orange-500 text-white px-1 py-0.5 sticky z-20 text-left select-none ${isSortable ? 'cursor-pointer hover:bg-orange-600' : ''}`}
                          style={{ width: col.widthPx, minWidth: col.widthPx, left: col.computedLeft }}
                          onClick={isSortable ? () => handleSort(col.id as SortKey) : undefined}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {col.label}
                            {isActive && (sortState.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </span>
                        </th>
                      );
                    })}
                    {/* เพิ่มคอลัมน์ ชื่อชุด สำหรับกลุ่มที่มีชื่อชุด */}
                    {hasSetColumn && (
                      <th
                        className="border border-gray-400 bg-orange-500 text-white px-1 py-0.5 sticky z-20 text-left cursor-pointer hover:bg-orange-600 select-none"
                        style={{ width: 100, minWidth: 100, left: visibleColumns.reduce((sum, c) => sum + c.widthPx, 0) }}
                        onClick={() => handleSort('ชื่อชุด')}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          ชื่อชุด
                          {sortState?.key === 'ชื่อชุด' && (sortState.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </span>
                      </th>
                    )}
                    {daysInMonth.map(({ day, isWeekend, isToday, dateStr }) => (
                      <th
                        key={day}
                        className={`border border-gray-400 text-white px-0 py-0.5 text-center ${canEditAttendance ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'} transition-opacity ${
                          isToday 
                            ? "bg-blue-600 font-bold shadow-md" 
                            : isWeekend 
                              ? "bg-orange-400" 
                              : "bg-orange-500"
                        }`}
                        style={{ width: 40, minWidth: 40 }}
                        title={isToday ? `📅 วันนี้${canEditAttendance ? '\n(ดับเบิ้ลคลิกเพื่อเปลี่ยนสถานะทั้งวัน)' : ''}` : (canEditAttendance ? "(ดับเบิ้ลคลิกเพื่อเปลี่ยนสถานะทั้งวัน)" : "")}
                        onDoubleClick={(e) => {
                          if (canEditAttendance) {
                            e.stopPropagation();
                            handleDateHeaderDoubleClick(dateStr);
                          }
                        }}
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
                      className="hover:bg-blue-50 transition-colors group"
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
                        else if (col.id === "สถานะโครงการ") {
                          const projects = Array.isArray(emp.สถานะโครงการ)
                            ? emp.สถานะโครงการ
                            : emp.สถานะโครงการ ? [emp.สถานะโครงการ] : ["-"];
                          content = projects.map(formatProjectNo).join(", ");
                        }

                        const isHighlightCol = col.id === "รหัสพนักงาน" || col.id === "name" || col.id === "ตำแหน่ง";

                        return (
                          <td
                            key={col.id}
                            className={`border border-gray-200 px-1 py-0 sticky z-10 overflow-hidden whitespace-nowrap text-ellipsis transition-colors ${isHighlightCol ? "bg-white group-focus-within:bg-yellow-200" : "bg-white"}`}
                            style={{ width: col.widthPx, minWidth: col.widthPx, left: col.computedLeft }}
                          >
                            {content}
                          </td>
                        );
                      })}
                      {/* เพิ่มเซลล์ ชื่อชุด สำหรับกลุ่มที่มีชื่อชุด */}
                      {hasSetColumn && (
                        <td
                          className="border border-gray-200 px-1 py-0 sticky bg-white z-10 overflow-hidden whitespace-nowrap text-ellipsis"
                          style={{ width: 100, minWidth: 100, left: visibleColumns.reduce((sum, c) => sum + c.widthPx, 0) }}
                        >
                          <span className="px-1 py-0.5 bg-purple-100 text-purple-700 rounded" style={{ fontSize: 10 }}>
                            {emp.ชื่อชุด || "-"}
                          </span>
                        </td>
                      )}
                      {daysInMonth.map(({ dateStr, isWeekend, isToday }) =>
                        renderStatusCell(emp.id, dateStr, isWeekend, isToday, emp)
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

                {/* Watermarks overlay */}
                <div 
                  className="absolute top-[26px] bottom-0 pointer-events-none flex z-10"
                  style={{ left: visibleColumns.reduce((sum, c) => sum + c.widthPx, 0) + (hasSetColumn ? 100 : 0) }}
                >
                  {daysInMonth.map(({ day, dateStr }) => (
                    <div key={day} className="w-[40px] shrink-0 h-full flex items-center justify-center overflow-hidden">
                      {dayOffs[dateStr] && (
                        <span 
                          className="text-fuchsia-400 opacity-40 font-bold whitespace-nowrap tracking-[0.2em] text-[20px]" 
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {dayOffs[dateStr]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          );
        })
      )}

      {/* Saving toast */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 text-xs">
          <Loader2 size={13} className="animate-spin" />
          กำลังบันทึก...
        </div>
      )}

      {/* Modal ยื่นคำร้องขอลาย้อนหลัง */}
      {retroModalTarget && (() => {
        const employee = employees.find((e) => e.id === retroModalTarget.employeeId);
        const employeeLabel = employee
          ? `${employee.ชื่อตัว || ""} ${employee.ชื่อสกุล || ""}`.trim() || employee.รหัสพนักงาน || "-"
          : "-";
        const currentEntry = attendanceData[retroModalTarget.dateStr]?.[retroModalTarget.employeeId];
        const currentStatusLabel = getDisplayStatus(currentEntry) || "ว่าง";
        return (
          <RetroLeaveRequestModal
            employeeLabel={employeeLabel}
            dateStr={retroModalTarget.dateStr}
            currentStatusLabel={currentStatusLabel}
            submitting={retroSubmitting}
            onSubmit={handleSubmitRetroLeave}
            onClose={() => setRetroModalTarget(null)}
          />
        );
      })()}

      {/* Panel รายการคำร้องขอลาย้อนหลัง */}
      {showRetroPanel && (
        <RetroLeavePanel
          requests={retroRequests}
          canApprove={canApproveRetro}
          rejectTargetId={retroRejectTargetId}
          rejectNote={retroRejectNote}
          onSetRejectTarget={setRetroRejectTargetId}
          onSetRejectNote={setRetroRejectNote}
          onApprove={handleApproveRetroLeave}
          onReject={handleRejectRetroLeave}
          onClose={() => setShowRetroPanel(false)}
        />
      )}
    </div>
  );
};

// ── Modal: ยื่นคำร้องขอลาย้อนหลัง (Admin Site) ──────────────────────────────
const RetroLeaveRequestModal = ({
  employeeLabel,
  dateStr,
  currentStatusLabel,
  submitting,
  onSubmit,
  onClose,
}: {
  employeeLabel: string;
  dateStr: string;
  currentStatusLabel: string;
  submitting: boolean;
  onSubmit: (requestedStatus: string, reason: string) => void;
  onClose: () => void;
}) => {
  const [requestedStatus, setRequestedStatus] = useState("ลา");
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <History size={18} className="text-indigo-600" />
            ยื่นคำร้องขอลาย้อนหลัง
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div>
              <span className="text-gray-500">พนักงาน:</span> <span className="font-semibold">{employeeLabel}</span>
            </div>
            <div>
              <span className="text-gray-500">วันที่:</span> <span className="font-semibold">{dateStr}</span>
            </div>
            <div>
              <span className="text-gray-500">สถานะปัจจุบัน:</span>{" "}
              <span className="font-semibold">{currentStatusLabel}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ต้องการเปลี่ยนเป็น</label>
            <select
              value={requestedStatus}
              onChange={(e) => setRequestedStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              {RETRO_LEAVE_REQUESTABLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผล (จำเป็น)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="เช่น พนักงานมาแจ้งลาป่วยย้อนหลัง พร้อมใบรับรองแพทย์..."
              className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">
            ยกเลิก
          </button>
          <button
            disabled={submitting || !reason.trim()}
            onClick={() => onSubmit(requestedStatus, reason.trim())}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            ยื่นคำร้อง
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Panel: รายการคำร้องขอลาย้อนหลัง (ดูของตัวเอง หรือ อนุมัติสำหรับ HR-tier) ──
const RetroLeavePanel = ({
  requests,
  canApprove,
  rejectTargetId,
  rejectNote,
  onSetRejectTarget,
  onSetRejectNote,
  onApprove,
  onReject,
  onClose,
}: {
  requests: RetroLeaveRequest[];
  canApprove: boolean;
  rejectTargetId: string | null;
  rejectNote: string;
  onSetRejectTarget: (id: string | null) => void;
  onSetRejectNote: (note: string) => void;
  onApprove: (request: RetroLeaveRequest) => void;
  onReject: (request: RetroLeaveRequest, note: string) => void;
  onClose: () => void;
}) => {
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  const renderRow = (r: RetroLeaveRequest) => (
    <div key={r.id} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-gray-800">{r.employeeName}</span>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${RETRO_LEAVE_STATUS_COLORS[r.status]}`}>
          {RETRO_LEAVE_STATUS_LABELS[r.status]}
        </span>
      </div>
      <div className="text-xs text-gray-600">
        วันที่ {r.dateStr} · {r.currentStatus || "ว่าง"} → <span className="font-semibold">{r.requestedStatus || "ว่าง"}</span>
        {r.project && <span className="text-gray-400"> · {r.project}</span>}
      </div>
      <div className="text-xs text-gray-500">เหตุผล: {r.reason}</div>
      <div className="text-[11px] text-gray-400">
        ยื่นโดย {r.submittedByName} · {new Date(r.submittedAt).toLocaleString("th-TH")}
      </div>
      {r.status !== "pending" && r.reviewedByName && (
        <div className="text-[11px] text-gray-400">
          {r.status === "approved" ? "อนุมัติโดย" : "ปฏิเสธโดย"} {r.reviewedByName}
          {r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleString("th-TH")}` : ""}
          {r.reviewNote ? ` · เหตุผล: ${r.reviewNote}` : ""}
        </div>
      )}

      {canApprove && r.status === "pending" && (
        rejectTargetId === r.id ? (
          <div className="pt-1.5 space-y-1.5">
            <textarea
              value={rejectNote}
              onChange={(e) => onSetRejectNote(e.target.value)}
              rows={2}
              placeholder="เหตุผลที่ปฏิเสธ (จำเป็น)"
              className="w-full px-2 py-1.5 text-xs border rounded resize-none"
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => { onSetRejectTarget(null); onSetRejectNote(""); }}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                disabled={!rejectNote.trim()}
                onClick={() => onReject(r, rejectNote.trim())}
                className="px-2 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 disabled:opacity-50"
              >
                ยืนยันปฏิเสธ
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              onClick={() => onSetRejectTarget(r.id)}
              className="px-2 py-1 text-xs border border-rose-300 text-rose-600 rounded hover:bg-rose-50"
            >
              ปฏิเสธ
            </button>
            <button
              onClick={() => onApprove(r)}
              className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              อนุมัติ
            </button>
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList size={18} className="text-indigo-600" />
            คำร้องขอลาย้อนหลัง
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2">รออนุมัติ ({pending.length})</div>
          {pending.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">ไม่มีคำร้องที่รออนุมัติ</div>
          ) : (
            <div className="space-y-2">{pending.map(renderRow)}</div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2">ประวัติ ({history.length})</div>
          {history.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีประวัติ</div>
          ) : (
            <div className="space-y-2">{history.map(renderRow)}</div>
          )}
        </div>
      </div>
    </div>
  );
};
