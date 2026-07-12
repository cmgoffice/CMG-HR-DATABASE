import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
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
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { InfoTooltip } from "./InfoTooltip";

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
  ชื่อชุด?: string;
  [key: string]: any;
}

interface OvertimeEntry {
  hours: string;       // "1.5", "2.0", etc. or ""
  type?: string;       // "x1.5", "x2"
  recordedAt: number;  // Unix timestamp (ms)
  project?: string;    // โครงการที่ลงเวลา (เฉพาะเมื่อ hours != "")
}

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  widthPx: number;
  sticky: boolean;
}

const formatProjectNo = (projectNo: string): string => {
  if (!projectNo || projectNo === "ไม่ระบุ") return projectNo;
  const cleanProjectNo = projectNo.includes(' - ') ? projectNo.split(' - ')[0] : projectNo;
  const parts = cleanProjectNo.split('-');
  if (parts.length >= 2) return parts.slice(-2).join('-');
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

export const OvertimePage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { firebaseUser, userProfile, hasRole } = useAuth();
  const db = getFirestore();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [overtimeData, setOvertimeData] = useState<Record<string, Record<string, OvertimeEntry>>>({});
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [filterOtType, setFilterOtType] = useState<string>("all");
  const [dayOffs, setDayOffs] = useState<Record<string, string>>({});

  type SortKey = 'รหัสพนักงาน' | 'name' | 'ตำแหน่ง' | 'ชื่อชุด';
  interface SortState { key: SortKey; direction: 'asc' | 'desc'; }
  const [sortState, setSortState] = useState<SortState | null>(null);

  const handleSort = (key: SortKey) => {
    setSortState((prev) => {
      if (prev?.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: 'asc' };
    });
  };

  const filteredProjectOptions = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) return projectOptions;
    const assignedProjects = userProfile?.assignedProjects || [];
    return projectOptions.filter((project) => assignedProjects.includes(project));
  }, [projectOptions, userProfile, hasRole]);

  useEffect(() => {
    if (hasRole(['Admin Site', 'Staff']) && filteredProjectOptions.length > 0) {
      setSelectedProject(filteredProjectOptions[0]);
    }
  }, [hasRole, filteredProjectOptions]);

  const canEditOvertime = useMemo(() => hasRole(['MasterAdmin', 'MD', 'GM', 'HR', 'Admin Site']), [hasRole]);
  const hasAssignedProjects = useMemo(() => {
    if (hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR'])) return true;
    return filteredProjectOptions.length > 0;
  }, [hasRole, filteredProjectOptions]);

  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragState = useRef<{ active: boolean; startX: number; scrollLeft: number }>({
    active: false, startX: 0, scrollLeft: 0,
  });

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
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

  useEffect(() => {
    setLoading(true);
    const employeeCollectionRef = collection(db, "CMG-HR-Database", "root", "employee_data");
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

  useEffect(() => {
    if (employees.length === 0) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const unsubscribes: (() => void)[] = [];
    
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const overtimeDocRef = doc(db, "CMG-HR-Database", "root", "overtime", dateStr);
      
      const unsubscribe = onSnapshot(overtimeDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const raw = docSnap.data();
          const records: Record<string, OvertimeEntry> = {};
          if (raw.records) {
            for (const [empId, val] of Object.entries(raw.records)) {
              if (val && typeof val === "object") {
                records[empId] = val as OvertimeEntry;
              }
            }
          }
          setOvertimeData((prev) => ({ ...prev, [dateStr]: records }));
        } else {
          setOvertimeData((prev) => ({ ...prev, [dateStr]: {} }));
        }
      }, (error) => console.error(`Error listening to overtime for ${dateStr}:`, error));
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

  const filteredEmployees = useMemo(() => {
    if (selectedProject === "all") return employees;
    return employees.filter((emp) => {
      const p = emp.สถานะโครงการ;
      return Array.isArray(p) ? p.includes(selectedProject) : p === selectedProject;
    });
  }, [employees, selectedProject]);

  const groupedEmployees = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    filteredEmployees.forEach((emp) => {
      const groupKey = emp.สถานะกลุ่มงาน || "ไม่ระบุ";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(emp);
    });
    Object.keys(groups).forEach((groupKey) => {
      const hasSetColumn = groupKey === "Supply Contract" || groupKey === "Worker" || groupKey === "Subcontract";
      groups[groupKey].sort((a, b) => {
        if (sortState) {
          let cmp = 0;
          switch (sortState.key) {
            case 'รหัสพนักงาน': cmp = (a.รหัสพนักงาน || "").localeCompare(b.รหัสพนักงาน || "", 'th', { numeric: true }); break;
            case 'name': cmp = (`${a.ชื่อตัว || ""} ${a.ชื่อสกุล || ""}`).localeCompare(`${b.ชื่อตัว || ""} ${b.ชื่อสกุล || ""}`, 'th'); break;
            case 'ตำแหน่ง': cmp = (a.ตำแหน่ง || "").localeCompare(b.ตำแหน่ง || "", 'th'); break;
            case 'ชื่อชุด': cmp = (a.ชื่อชุด || "ไม่ระบุชุด").localeCompare(b.ชื่อชุด || "ไม่ระบุชุด", 'th'); break;
          }
          return sortState.direction === 'asc' ? cmp : -cmp;
        }
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

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = date.getDay();
      const checkDate = new Date(year, month, day);
      checkDate.setHours(0, 0, 0, 0);
      const isToday = checkDate.getTime() === today.getTime();
      return { day, dateStr, isWeekend: dow === 0 || dow === 6, isToday };
    });
  }, [currentMonth]);

  const isLocked = (entry: OvertimeEntry | undefined): boolean => {
    if (!entry || !entry.hours) return false;
    const now = Date.now();
    const recorded = entry.recordedAt || 0;
    return now - recorded > 24 * 60 * 60 * 1000;
  };

  const handleOvertimeChange = useCallback(async (
    employeeId: string,
    dateStr: string,
    isOtherProject: boolean,
    newHours: string,
    newType: string = "x1.5"
  ) => {
    setOvertimeData((prevData) => {
      if (isOtherProject) return prevData;

      const currentEntry = prevData[dateStr]?.[employeeId];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const targetDate = new Date(dateStr); targetDate.setHours(0, 0, 0, 0);
      
      if (targetDate > today) return prevData;
      if (currentEntry && isLocked(currentEntry)) return prevData;
      
      const cur = currentEntry?.hours || "";
      const curType = currentEntry?.type || "x1.5";
      if (cur === newHours && curType === newType) return prevData;

      const now = Date.now();
      let newEntry: OvertimeEntry | null = null;
      
      if (newHours !== "") {
        newEntry = { hours: newHours, type: newType, recordedAt: now };
        if (selectedProject !== "all") newEntry.project = selectedProject;
      }

      const dayRecords = { ...(prevData[dateStr] || {}) };
      if (newEntry === null) delete dayRecords[employeeId];
      else dayRecords[employeeId] = newEntry;
      
      const updatedData = { ...prevData, [dateStr]: dayRecords };

      (async () => {
        setSaving(true);
        try {
          const overtimeRef = doc(db, "CMG-HR-Database", "root", "overtime", dateStr);
          await setDoc(overtimeRef, {
            date: dateStr,
            records: dayRecords,
            lastUpdatedBy: firebaseUser?.email || "unknown",
            lastUpdatedAt: now,
          }, { merge: false });
        } catch (err) {
          console.error("Save error:", err);
          setOvertimeData((prev) => {
            const revertRecords = { ...(prev[dateStr] || {}) };
            if (currentEntry) revertRecords[employeeId] = currentEntry;
            else delete revertRecords[employeeId];
            return { ...prev, [dateStr]: revertRecords };
          });
        } finally {
          setSaving(false);
        }
      })();

      return updatedData;
    });
  }, [db, firebaseUser, selectedProject]);

  const getProjectShortCode = (projectName: string): string => {
    const cleanProjectNo = projectName.includes(' - ') ? projectName.split(' - ')[0] : projectName;
    const match = cleanProjectNo.match(/PRJ-\d{4}-([A-Z]+)-0*(\d+[A-Z]*)$/i);
    if (match) {
      const letter = match[1].toUpperCase();
      let number = match[2];
      if (/^\d+$/.test(number)) number = number.padStart(2, '0');
      else {
        const numMatch = number.match(/^(\d+)([A-Z]+)$/i);
        if (numMatch) number = numMatch[1].padStart(2, '0') + numMatch[2].toUpperCase();
      }
      return `${letter}${number}`;
    }
    return projectName;
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + offset);
      return d;
    });
  };

  const toggleColumnVisibility = (id: string) => setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
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

  const visibleColumns = useMemo(() => {
    let left = 0;
    return columns.filter((c) => c.visible).map((c) => {
      const col = { ...c, computedLeft: left };
      left += c.widthPx;
      return col;
    });
  }, [columns]);

  const getOTStyles = (type: string, isToday: boolean, locked: boolean) => {
    let bg = "", text = "";
    if (type === 'x2') {
      bg = locked ? "bg-orange-100" : "bg-orange-100 hover:bg-orange-200";
      if (isToday) bg = locked ? "bg-orange-200 border border-gray-300" : "bg-orange-200 hover:bg-orange-300 border border-gray-300";
      text = "text-orange-700 font-semibold";
    } else { // x1.5
      bg = locked ? "bg-fuchsia-100" : "bg-fuchsia-100 hover:bg-fuchsia-200";
      if (isToday) bg = locked ? "bg-fuchsia-200 border border-gray-300" : "bg-fuchsia-200 hover:bg-fuchsia-300 border border-gray-300";
      text = "text-purple-700 font-semibold";
    }
    return { bg, text };
  };

  // --- Overtima Input Component ---
  const OvertimeCell = ({ 
    employeeId, dateStr, entry, canEdit, isOtherProject, locked, isToday, isWeekend, employee, handleOvertimeChange, filterOtType, dayOffName
  }: any) => {
    const [localVal, setLocalVal] = useState(entry?.hours || "");
    const [localType, setLocalType] = useState(entry?.type || "x1.5");
    const [showPopup, setShowPopup] = useState(false);

    useEffect(() => {
      setLocalVal(entry?.hours || "");
      setLocalType(entry?.type || "x1.5");
    }, [entry?.hours, entry?.type]);

    const handleBlur = () => {
      if (!canEdit) return;
      // Delay closing popup slightly to allow clicks on popup buttons
      setTimeout(() => setShowPopup(false), 150);
      
      let finalVal = localVal.trim();
      if (finalVal !== "") {
        const num = parseFloat(finalVal);
        if (!isNaN(num)) {
          finalVal = num.toFixed(1);
        } else {
          finalVal = "";
        }
      }
      setLocalVal(finalVal);
      if (finalVal !== (entry?.hours || "") || localType !== (entry?.type || "x1.5")) {
        handleOvertimeChange(employeeId, dateStr, isOtherProject, finalVal, localType);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        const inputs = Array.from(document.querySelectorAll(`input[data-date="${dateStr}"]`)) as HTMLInputElement[];
        const currentIdx = inputs.indexOf(e.currentTarget);
        if (currentIdx !== -1 && currentIdx < inputs.length - 1) inputs[currentIdx + 1].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        const inputs = Array.from(document.querySelectorAll(`input[data-date="${dateStr}"]`)) as HTMLInputElement[];
        const currentIdx = inputs.indexOf(e.currentTarget);
        if (currentIdx !== -1 && currentIdx > 0) inputs[currentIdx - 1].focus();
      }
    };

    let bg = dayOffName ? "bg-fuchsia-50 hover:bg-fuchsia-100" : (isWeekend ? "bg-gray-100" : "bg-white hover:bg-gray-50");
    let textCls = "text-purple-700 font-semibold";
    
    if (isToday && !localVal) {
      bg = "bg-blue-100 hover:bg-blue-200 border border-gray-300";
    }

    let tooltipExtra = "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr); targetDate.setHours(0, 0, 0, 0);
    const isFuture = targetDate > today;

    if (isFuture) {
      bg = "bg-gray-50";
      tooltipExtra = " ⏭️ ไม่สามารถลงล่วงหน้าได้";
    } else if (isOtherProject) {
      bg = locked ? "bg-green-100" : "bg-green-100 hover:bg-green-200";
      textCls = "text-green-700 font-semibold";
      if (isToday) bg = locked ? "bg-green-200 border border-gray-300" : "bg-green-200 hover:bg-green-300 border border-gray-300";
      tooltipExtra = ` 📍 มีโอทีที่โครงการ: ${entry?.project}`;
    } else if (localVal || localType !== "x1.5") {
      if (filterOtType !== "all" && localType !== filterOtType) {
        // Un-highlight if it doesn't match the selected filter
        bg = isWeekend ? "bg-gray-100" : (locked ? "bg-gray-50" : "bg-white hover:bg-gray-50");
        textCls = "text-gray-400";
        if (isToday) bg = "bg-blue-50 border border-gray-300";
      } else {
        // Pastel coloring for overtime based on type
        const styles = getOTStyles(localType, isToday, locked);
        bg = styles.bg;
        textCls = styles.text;
      }
      
      if (!locked) {
        const remaining = 24 * 60 * 60 * 1000 - (Date.now() - (entry?.recordedAt || 0));
        const hrs = Math.floor(remaining / 3_600_000);
        const mins = Math.floor((remaining % 3_600_000) / 60_000);
        tooltipExtra = ` (แก้ไขได้อีก ${hrs}ชม. ${mins}น.)`;
      } else {
        tooltipExtra = " 🔒 ล็อคแล้ว";
      }
    }

    if (dayOffName) {
      tooltipExtra = ` 🌴 ${dayOffName}` + tooltipExtra;
    }

    if (isToday) tooltipExtra = " 📅 วันนี้" + tooltipExtra;

    if (isOtherProject || !canEdit) {
      return (
        <td
          className={`border border-gray-200 text-center select-none ${bg} ${textCls} cursor-not-allowed opacity-60 relative`}
          style={{ minWidth: 40, maxWidth: 40, width: 40, padding: 0, fontSize: 10, height: 24 }}
          title={`${dateStr}${tooltipExtra}`}
        >
          {isOtherProject ? getProjectShortCode(entry?.project || "") : localVal}
        </td>
      );
    }

    return (
      <td
        className={`border border-gray-200 text-center transition-colors p-0 relative ${bg} focus-within:ring-2 focus-within:ring-inset focus-within:ring-purple-500`}
        style={{ minWidth: 40, maxWidth: 40, width: 40, height: 24 }}
        title={`${dateStr}${tooltipExtra}`}
      >
        <input
          data-date={dateStr}
          type="number"
          step="0.1"
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onFocus={() => setShowPopup(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`relative z-10 w-full h-full text-center bg-transparent outline-none ${textCls} text-[10px] m-0 p-0`}
          style={{ appearance: 'textfield' }} // Remove browser spinners if possible
        />
        {showPopup && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white shadow-xl border border-gray-200 rounded p-1 flex gap-1 items-center">
            {['x1.5', 'x2'].map((t) => (
              <button
                key={t}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLocalType(t);
                  // Keep focus on input, type will be saved on blur
                }}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  localType === t 
                    ? 'bg-purple-500 text-white border-purple-500 font-bold' 
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </td>
    );
  };

  const renderStatusCell = (employeeId: string, dateStr: string, isWeekend: boolean, isToday: boolean, employee: Employee) => {
    const entry = overtimeData[dateStr]?.[employeeId];
    const locked = isLocked(entry);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr); targetDate.setHours(0, 0, 0, 0);
    const isFuture = targetDate > today;

    const empProjects = employee.สถานะโครงการ;
    const projectList = Array.isArray(empProjects) ? empProjects : empProjects ? [empProjects] : [];
    const isMultiProject = projectList.length > 1;
    const attendedProject = entry?.project;
    const isOtherProject = !!(isMultiProject && attendedProject && selectedProject !== "all" && attendedProject !== selectedProject && entry?.hours);
    const canEdit = !isFuture && !locked && canEditOvertime && !isOtherProject;
    const dayOffName = dayOffs[dateStr];

    return <OvertimeCell 
      key={dateStr}
      employeeId={employeeId} 
      dateStr={dateStr} 
      entry={entry} 
      canEdit={canEdit} 
      isOtherProject={isOtherProject} 
      locked={locked} 
      isToday={isToday} 
      isWeekend={isWeekend} 
      employee={employee}
      handleOvertimeChange={handleOvertimeChange}
      filterOtType={filterOtType}
      dayOffName={dayOffName}
    />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-purple-600" size={40} />
      </div>
    );
  }

  const monthName = currentMonth.toLocaleDateString("th-TH", { year: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span>Overtime</span>
          <InfoTooltip
            content={
              <div>
                <div className="font-semibold text-slate-800 mb-1">วิธีอ่านข้อมูล</div>
                <div>ตารางนี้แสดงชั่วโมง OT รายวันของพนักงานในเดือนและโครงการที่เลือก</div>
                <div>สูตรสรุปหลัก: OT รวม = ผลรวมชั่วโมง OT ทุก record ในช่วงที่แสดง</div>
              </div>
            }
          />
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          ใช้ตรวจสอบชั่วโมง OT, ประเภท OT และโครงการที่มีภาระงานสูง
        </p>
      </div>
      {/* ── Controls ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1"><Calendar size={13} className="inline mr-1" />เลือกเดือน</label>
            <div className="flex items-center gap-1">
              <button onClick={() => changeMonth(-1)} className="p-1.5 border rounded hover:bg-gray-100"><ChevronLeft size={16} /></button>
              <div className="flex-1 text-center font-bold text-sm">{monthName}</div>
              <button onClick={() => changeMonth(1)} className="p-1.5 border rounded hover:bg-gray-100"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1"><Users size={13} className="inline mr-1" />กรองตามโครงการ</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500 outline-none bg-white"
            >
              {hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR']) && <option value="all">ทุกโครงการ</option>}
              {filteredProjectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1"><AlertCircle size={13} className="inline mr-1" />ดูชนิด OT</label>
            <select
              value={filterOtType}
              onChange={(e) => setFilterOtType(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500 outline-none bg-white"
            >
              <option value="all">All Type</option>
              <option value="x1.5">OT x1.5</option>
              <option value="x2">OT x2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1"><Columns size={13} className="inline mr-1" />จัดการคอลัมน์</label>
            <div className="relative">
              <button onClick={() => setIsColumnMenuOpen((o) => !o)} className="w-full px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center justify-between">
                <span>แสดง/ซ่อน &amp; จัดเรียง</span><Columns size={15} />
              </button>
              {isColumnMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsColumnMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-xl z-30 overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500">ลากเพื่อจัดเรียง · คลิก ✓ เพื่อซ่อน</div>
                    {columns.map((col, i) => (
                      <div
                        key={col.id} draggable onDragStart={() => handleDragStart(i)} onDragOver={handleDragOver} onDrop={() => handleDrop(i)}
                        className={`flex items-center gap-2 px-3 py-2 border-b border-gray-100 cursor-move hover:bg-gray-50 ${draggedIdx === i ? "opacity-40" : ""}`}
                      >
                        <GripVertical size={13} className="text-gray-400 shrink-0" />
                        <div
                          className={`w-4 h-4 flex items-center justify-center rounded border shrink-0 cursor-pointer ${col.visible ? "bg-purple-500 border-purple-500" : "border-gray-300"}`}
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
      <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center gap-4 text-xs flex-wrap">
        <span className="font-semibold text-purple-900">คำอธิบาย (Overtime):</span>
        {[
          { bg: "bg-fuchsia-100 border-fuchsia-300", text: "text-purple-700 font-semibold", label: "1.5", desc: "OT x1.5" },
          { bg: "bg-orange-100 border-orange-300", text: "text-orange-700 font-semibold", label: "2.0", desc: "OT x2" },
          { bg: "bg-green-100 border-green-300", text: "text-green-700 font-semibold", label: "J01", desc: "= มี OT ที่โครงการอื่น" },
          { bg: "bg-gray-100 border-gray-300",    text: "",              label: "",     desc: "= วันหยุด" },
        ].map((item, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className={`w-8 h-5 border rounded flex items-center justify-center ${item.bg} ${item.text}`} style={{ fontSize: 9 }}>
              {item.label}
            </div>
            {item.desc && <span className="text-gray-600">{item.desc}</span>}
          </div>
        ))}
        <span className="text-gray-400 ml-auto">🔒 = ล็อคหลังกรอก 24 ชม.</span>
      </div>

      {/* ── Tables ── */}
      {!hasAssignedProjects ? (
        <div className="bg-white rounded-lg border border-purple-200 p-12 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-purple-500" />
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
          const hasSetColumn = groupName === "Supply Contract" || groupName === "Worker" || groupName === "Subcontract";
          
          return (
          <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-slate-800 px-4 py-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={15} />
                {groupName}
                <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full text-xs">{groupEmps.length} คน</span>
              </h2>
            </div>
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
                          className={`border border-gray-400 bg-purple-500 text-white px-1 py-0.5 sticky z-20 text-left select-none ${isSortable ? 'cursor-pointer hover:bg-purple-600' : ''}`}
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
                    {hasSetColumn && (
                      <th
                        className="border border-gray-400 bg-purple-500 text-white px-1 py-0.5 sticky z-20 text-left cursor-pointer hover:bg-purple-600 select-none"
                        style={{ width: 100, minWidth: 100, left: visibleColumns.reduce((sum, c) => sum + c.widthPx, 0) }}
                        onClick={() => handleSort('ชื่อชุด')}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          ชื่อชุด
                          {sortState?.key === 'ชื่อชุด' && (sortState.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </span>
                      </th>
                    )}
                    {daysInMonth.map(({ day, isWeekend, isToday }) => (
                      <th
                        key={day}
                        className={`border border-gray-400 text-white px-0 py-0.5 text-center transition-opacity ${
                          isToday 
                            ? "bg-fuchsia-500 font-bold shadow-md" 
                            : isWeekend 
                              ? "bg-purple-400" 
                              : "bg-purple-500"
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
                      className="hover:bg-purple-50 transition-colors group"
                      style={{ height: 24 }}
                    >
                      {visibleColumns.map((col) => {
                        let content: React.ReactNode = "-";
                        if (col.id === "index") content = idx + 1;
                        else if (col.id === "รหัสพนักงาน") content = emp.รหัสพนักงาน || "-";
                        else if (col.id === "name") content = `${emp.ชื่อตัว || ""} ${emp.ชื่อสกุล || ""}`.trim() || "-";
                        else if (col.id === "ตำแหน่ง") content = emp.ตำแหน่ง || "-";
                        else if (col.id === "สถานะกลุ่มงาน") content = (
                          <span className="px-1 py-0.5 bg-fuchsia-100 text-fuchsia-700 rounded" style={{ fontSize: 10 }}>
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
                            className={`border border-gray-200 px-1 py-0 sticky z-10 overflow-hidden whitespace-nowrap text-ellipsis transition-colors ${isHighlightCol ? "bg-white group-focus-within:bg-purple-100" : "bg-white"}`}
                            style={{ width: col.widthPx, minWidth: col.widthPx, left: col.computedLeft }}
                          >
                            {content}
                          </td>
                        );
                      })}
                      {hasSetColumn && (
                        <td
                          className="border border-gray-200 px-1 py-0 sticky bg-white z-10 overflow-hidden whitespace-nowrap text-ellipsis"
                          style={{ width: 100, minWidth: 100, left: visibleColumns.reduce((sum, c) => sum + c.widthPx, 0) }}
                        >
                          <span className="px-1 py-0.5 bg-fuchsia-100 text-fuchsia-700 rounded" style={{ fontSize: 10 }}>
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

      {saving && (
        <div className="fixed bottom-4 right-4 bg-purple-600 text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 text-xs">
          <Loader2 size={13} className="animate-spin" />
          กำลังบันทึก...
        </div>
      )}
    </div>
  );
};
