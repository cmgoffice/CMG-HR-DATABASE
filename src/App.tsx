import React, { useState, useEffect, useMemo, useRef } from "react";
import type { User } from "firebase/auth";
import type { CollectionReference, DocumentData, Query } from "firebase/firestore";

// --- TYPE DEFINITIONS ---
interface SchemaField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
}

interface DataRecord {
  id: string;
  [key: string]: unknown;
}

type ProjectRolePlanBaselineRow = {
  id: string;
  position: string;
  required: number;
};

type ProjectRolePlanAdjustmentRow = {
  id: string;
  position: string;
  delta: number;
};

type ProjectRolePlanAdjustment = {
  id: string;
  start_date: string;
  end_date: string;
  note: string;
  rows: ProjectRolePlanAdjustmentRow[];
};

interface LogRecord {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  details: string;
  createdAt: number;
}

interface ModuleConfig {
  collection: string;
  subcollection?: string;
  label: string;
  filterField?: string;
  filterValue?: string | string[];
  schemaSource?: string; // อ้างอิง moduleId อื่นเพื่อใช้ schema ร่วมกัน
}

type SortConfig = { key: string; direction: 'asc' | 'desc' | null };

const DEFAULT_SORT_CONFIG: SortConfig = { key: "รหัสพนักงาน", direction: 'asc' };

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

const createLocalId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseLegacyRolePlanText = (value: unknown): ProjectRolePlanBaselineRow[] => {
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
      if (!match) return null;
      const position = match[1].trim();
      const required = Number(match[2]);
      if (!position || !Number.isFinite(required) || required <= 0) return null;
      return { id: createLocalId(), position, required: Math.round(required) };
    })
    .filter((row): row is ProjectRolePlanBaselineRow => row !== null);
};

const normalizeProjectRolePlanBaseline = (value: unknown, legacyValue?: unknown): ProjectRolePlanBaselineRow[] => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const source = row as Record<string, unknown>;
        const position = String(source.position || "").trim();
        const required = Number(source.required);
        return {
          id: String(source.id || createLocalId()),
          position,
          required: Number.isFinite(required) ? Math.round(required) : 0,
        };
      })
      .filter((row): row is ProjectRolePlanBaselineRow => row !== null);
    return normalized.length > 0 ? normalized : parseLegacyRolePlanText(legacyValue);
  }
  return parseLegacyRolePlanText(legacyValue);
};

const normalizeProjectRolePlanAdjustments = (value: unknown): ProjectRolePlanAdjustment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ProjectRolePlanAdjustment | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const rows = Array.isArray(source.rows)
        ? source.rows
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const rowSource = row as Record<string, unknown>;
              const position = String(rowSource.position || "").trim();
              const delta = Number(rowSource.delta);
              return {
                id: String(rowSource.id || createLocalId()),
                position,
                delta: Number.isFinite(delta) ? Math.round(delta) : 0,
              };
            })
            .filter((row): row is ProjectRolePlanAdjustmentRow => row !== null)
        : [];

      return {
        id: String(source.id || createLocalId()),
        start_date: String(source.start_date || ""),
        end_date: String(source.end_date || ""),
        note: String(source.note || ""),
        rows,
      };
    })
    .filter((item): item is ProjectRolePlanAdjustment => item !== null);
};

const sanitizeProjectRolePlanBaseline = (value: unknown, legacyValue?: unknown): ProjectRolePlanBaselineRow[] =>
  normalizeProjectRolePlanBaseline(value, legacyValue).filter((row) => row.position && row.required > 0);

const sanitizeProjectRolePlanAdjustments = (value: unknown): ProjectRolePlanAdjustment[] =>
  normalizeProjectRolePlanAdjustments(value)
    .map((item) => ({
      ...item,
      rows: item.rows.filter((row) => row.position && row.delta !== 0),
    }))
    .filter((item) => item.start_date && item.end_date && item.rows.length > 0);

import {
  LayoutDashboard,
  Users,
  HardHat,
  Truck,
  ShoppingCart,
  Gavel,
  ClipboardList,
  UserCog,
  Plus,
  Search,
  Download,
  Upload,
  Edit,
  Trash2,
  Save,
  X,
  ChevronRight,
  ChevronDown,
  Settings,
  Database,
  Filter,
  FileText,
  Activity,
  MoreHorizontal,
  CheckCircle,
  Loader2,
  AlertCircle,
  Check,
  Info,
  GripVertical,
  HelpCircle,
  Briefcase,
  Columns,
  Wifi,
  WifiOff,
  PanelLeft,
  PanelLeftClose,
  Clock,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Menu,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  getDoc,
  onSnapshot,
  deleteField,
  arrayRemove,
  arrayUnion,
} from "firebase/firestore";

// --- FIREBASE CONFIGURATION (ใช้ project cmg-hr-database ให้ตรงกับ Rules ใน Console) ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "cmg-hr-database.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "cmg-hr-database",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "cmg-hr-database.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "625046761441",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:625046761441:web:22493e0b56a984cf5daca0",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-Z8DWB4YM0S",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- MODULE CONFIGURATION ---
const MODULE_CONFIG = {
  users_data: { collection: "CMG-HR-Database", subcollection: "users_data", label: "ผู้ใช้งาน" },
  activity_logs: { collection: "CMG-HR-Database", subcollection: "activity_logs", label: "Activity Logs" },
  // Employee Modules (Shared Collection: employee_data)
  emp_indirect: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Staff Monthly",
    filterField: "employee_type",
    filterValue: ["Indirect"],
  },
  emp_direct_leader: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "DC Daily",
    filterField: "employee_type",
    filterValue: ["Direct_TeamLeader", "Direct: Team Leader", "Direct - Team Leader"],
  },
  emp_direct_supply: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Supply manpower",
    filterField: "employee_type",
    filterValue: ["Direct_SupplyDC", "Direct: Supply DC", "Direct - Supply DC"],
    schemaSource: "emp_direct_leader", // ใช้ schema เดียวกับ Team Leader
  },
  emp_direct_sub: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Sub contractor",
    filterField: "employee_type",
    filterValue: ["Direct_SubContractor", "Direct: Sub Contractor", "Direct - Sub Contractor"],
    schemaSource: "emp_direct_leader", // ใช้ schema เดียวกับ Team Leader
  },
  position_labor: {
    collection: "CMG-HR-Database",
    subcollection: "position_labor",
    label: "Position Labor",
  },
  projects: {
    collection: "CMG-HR-Database",
    subcollection: "projects",
    label: "โครงการ",
  },
};

// --- STATUS FIELD IDs (for pastel coloring) ---
const STATUS_FIELD_IDS = ["สถานะพนักงาน", "สถานะกลุ่มงาน", "สถานะโครงการ"];
const STATUS_COLORS: Record<string, { header: string; cell: string; badge: string }> = {
  สถานะพนักงาน: {
    header: "bg-rose-50 text-rose-700",
    cell: "bg-rose-50/60",
    badge: "bg-rose-100 text-rose-700 border border-rose-200",
  },
  สถานะกลุ่มงาน: {
    header: "bg-sky-50 text-sky-700",
    cell: "bg-sky-50/60",
    badge: "bg-sky-100 text-sky-700 border border-sky-200",
  },
  สถานะโครงการ: {
    header: "bg-emerald-50 text-emerald-700",
    cell: "bg-emerald-50/60",
    badge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  },
};

// ฟังก์ชันสำหรับกำหนดสีของ badge ตามค่าของสถานะพนักงาน
const getEmployeeStatusBadgeColor = (status: string): string => {
  if (status === "ทำงาน") {
    return "bg-green-100 text-green-700 border border-green-300";
  } else if (status === "ลาออก") {
    return "bg-gray-100 text-gray-600 border border-gray-300";
  }
  // default (สีชมพูเดิม)
  return "bg-rose-100 text-rose-700 border border-rose-200";
};

// ฟังก์ชันสำหรับกำหนดสีของ badge ตามค่าของสถานะกลุ่มงาน
const getWorkGroupBadgeColor = (group: string): string => {
  const colors: Record<string, string> = {
    "Indirect": "bg-purple-100 text-purple-700 border border-purple-300",
    "Direct_TeamLeader": "bg-blue-100 text-blue-700 border border-blue-300",
    "Direct: Team Leader": "bg-blue-100 text-blue-700 border border-blue-300",
    "Direct_SupplyDC": "bg-amber-100 text-amber-700 border border-amber-300",
    "Direct: Supply DC": "bg-amber-100 text-amber-700 border border-amber-300",
    "Direct_SubContractor": "bg-orange-100 text-orange-700 border border-orange-300",
    "Direct: Sub Contractor": "bg-orange-100 text-orange-700 border border-orange-300",
  };
  return colors[group] || "bg-sky-100 text-sky-700 border border-sky-200"; // default
};

// ฟังก์ชันสำหรับกำหนดสีของ badge ตามโครงการ (ใช้ตัวอักษรแรกของรหัสโครงการ)
const getProjectBadgeColor = (projectNo: string): string => {
  // ตัดเอาตัวอักษรหลัง - ตัวแรก เช่น J-001 → J, K-002 → K
  const projectCode = projectNo.split('-')[0] || projectNo.charAt(0);
  
  const colors: Record<string, string> = {
    "J": "bg-emerald-100 text-emerald-700 border border-emerald-300",
    "K": "bg-teal-100 text-teal-700 border border-teal-300",
    "L": "bg-cyan-100 text-cyan-700 border border-cyan-300",
    "M": "bg-indigo-100 text-indigo-700 border border-indigo-300",
    "N": "bg-violet-100 text-violet-700 border border-violet-300",
    "O": "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300",
    "P": "bg-pink-100 text-pink-700 border border-pink-300",
    "Q": "bg-rose-100 text-rose-700 border border-rose-300",
  };
  
  return colors[projectCode] || "bg-emerald-100 text-emerald-700 border border-emerald-200"; // default
};



// --- INITIAL CONFIGURATION (Fallbacks) ---
const DEFAULT_SCHEMAS = {
  employee_data: [
    { id: "รหัสพนักงาน", label: "รหัสพนักงาน", type: "text", required: true },
    { id: "โครงการ", label: "โครงการ", type: "text" },
    {
      id: "ชื่อต้น",
      label: "ชื่อต้น",
      type: "select",
      options: ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."],
    },
    { id: "ชื่อตัว", label: "ชื่อตัว", type: "text", required: true },
    { id: "ชื่อสกุล", label: "ชื่อสกุล", type: "text", required: true },
    {
      id: "gender",
      label: "เพศ",
      type: "select",
      options: ["ชาย", "หญิง", "ไม่ระบุ"],
    },
    { id: "date_of_birth", label: "วันเกิด", type: "date" },
    { id: "start_date", label: "วันที่เริ่มงาน", type: "date" },
    { id: "ตำแหน่ง", label: "ตำแหน่ง", type: "select", options: [] },
    { id: "แผนก", label: "แผนก", type: "text" },
    {
      id: "Type",
      label: "Type",
      type: "select",
      options: ["Full-time", "Part-time", "Contract"],
    },
    {
      id: "employee_type",
      label: "Employee Type",
      type: "select",
      options: ["Indirect", "Direct_TeamLeader", "Direct_SupplyDC", "Direct_SubContractor"],
    },
    {
      id: "สถานะพนักงาน",
      label: "สถานะพนักงาน",
      type: "select",
      options: ["ทำงาน", "พักงาน", "ลาคลอด", "ลาออก", "เลิกจ้าง"],
    },
    { id: "employment_status_reason", label: "เหตุผลสถานะพนักงาน", type: "text" },
    {
      id: "สถานะกลุ่มงาน",
      label: "สถานะกลุ่มงาน",
      type: "select",
      options: ["Staff", "Worker", "Subcontract", "Supply Contract"],
    },
    {
      id: "สถานะโครงการ",
      label: "สถานะโครงการ",
      type: "select",
      options: [],
    },
  ],
  position_labor: [
    { id: "position", label: "Position", type: "text", required: true },
    { id: "labor_cost_baht", label: "ค่าแรง (บาท)", type: "number", required: true },
  ],
  projects: [
    { id: "project_no", label: "Project No.", type: "text", required: true },
    { id: "project_name", label: "ชื่อโครงการ", type: "text", required: true },
    { id: "required_manpower", label: "กำลังคนตามแผน (Required Manpower)", type: "number" },
    { id: "required_role_plan", label: "แผนกำลังคนรายตำแหน่ง (required_role_plan)", type: "textarea" },
    { id: "start_date", label: "วันที่เริ่มสัญญา", type: "date" },
    { id: "end_date", label: "วันที่สิ้นสุดสัญญา", type: "date" },
    { id: "project_manager", label: "Project Manager", type: "text" },
    { id: "construction_manager", label: "Construction Manager", type: "text" },
  ],
  users_data: [
    { id: "uid", label: "User ID", type: "text", required: true },
    { id: "username", label: "ชื่อผู้ใช้", type: "text", required: true },
    {
      id: "role",
      label: "สิทธิ์การใช้งาน",
      type: "select",
      options: ["Admin", "Viewer"],
    },
  ],
};

// --- LAYOUT CONSTANTS ---
const SIDEBAR_WIDTH = 218;   // ~w-64 ย่อลง 15%
const SIDEBAR_COLLAPSED_WIDTH = 56; // ~w-16 ย่อลง 15%

// --- COMPONENTS ---

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { PendingApprovalPage } from './auth/PendingApprovalPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { UserManagement } from './components/UserManagement';
import { NotificationBell } from './components/NotificationBell';
import { WhatsNewModal } from './components/WhatsNewModal';
import { AttendancePage } from './components/AttendancePage';
import { OvertimePage } from './components/OvertimePage';
import { ManpowerDashboard } from './components/ManpowerDashboard';
import { DayOffPage } from './components/DayOffPage';
import { ActivityLogPage } from './components/ActivityLogPage';
import { RiskMonitoringPage } from './components/RiskMonitoringPage';
import { EvaluationPage } from './components/EvaluationPage';
import { InfoTooltip } from './components/InfoTooltip';
import { ColumnMappingModal } from './components/ColumnMappingModal';
import { ImportPreviewModal } from './components/ImportPreviewModal';
import { RolePermissionSettings } from './components/RolePermissionSettings';
import {
  RolePermissionConfig,
  ROLE_PERMISSIONS_COLLECTION,
  ROLE_PERMISSIONS_DOC_ID,
  isModuleVisible,
} from './config/rolePermissions';

type SidebarSubItem = {
  id: string;
  label: string;
};

type SidebarLinkItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  sub?: undefined;
  isDivider?: false;
};

type SidebarGroupItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  sub: SidebarSubItem[];
  badge?: number;
  isDivider?: false;
};

type SidebarDividerItem = {
  id: string;
  isDivider: true;
  label?: undefined;
  icon?: undefined;
  badge?: undefined;
  sub?: undefined;
};

type SidebarMenuItem = SidebarLinkItem | SidebarGroupItem | SidebarDividerItem;

const hasSubMenu = (item: SidebarMenuItem): item is SidebarGroupItem => Array.isArray(item.sub);

const Sidebar = ({ activeModule, setActiveModule, dbConnected, sidebarOpen, onToggleSidebar, isMobile }: {
  activeModule: string; setActiveModule: (id: string) => void; dbConnected: boolean;
  sidebarOpen: boolean; onToggleSidebar: () => void; isMobile: boolean;
}) => {
  const { userProfile, firebaseUser, hasRole, logout } = useAuth();
  // On mobile the sidebar behaves as an off-canvas drawer: it is always shown fully
  // expanded (with labels) when open, and hidden off-screen when closed.
  const expanded = isMobile ? true : sidebarOpen;
  const selectAndClose = (id: string) => {
    setActiveModule(id);
    if (isMobile) onToggleSidebar();
  };
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [pendingCount, setPendingCount] = useState(0);
  // true ถ้า uid ของผู้ใช้ปรากฏใน tier1Uids/tier2Uids ของ evaluation_assignments ใด ๆ
  const [isAssignedEvaluator, setIsAssignedEvaluator] = useState(false);
  const db = getFirestore(app);

  useEffect(() => {
    if (hasRole(['MasterAdmin'])) {
      const q = query(collection(db, "CMG-HR-Database", "root", "users"), where("status", "==", "pending"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setPendingCount(snapshot.size);
      });
      return () => unsubscribe();
    }
  }, [hasRole, db]);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setIsAssignedEvaluator(false);
      return;
    }
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "evaluation_assignments"), (snap) => {
      const assigned = snap.docs.some((d) => {
        const data = d.data() as { tier1Uids?: string[]; tier2Uids?: string[] };
        return (data.tier1Uids || []).includes(uid) || (data.tier2Uids || []).includes(uid);
      });
      setIsAssignedEvaluator(assigned);
    });
    return () => unsub();
  }, [firebaseUser?.uid, db]);

  // Role-permission override config (settings/role_permissions). `null` while
  // loading -> treated as "no overrides" so default gating applies.
  const [rolePermConfig, setRolePermConfig] = useState<RolePermissionConfig | null>(null);
  useEffect(() => {
    const ref = doc(db, "CMG-HR-Database", "root", ROLE_PERMISSIONS_COLLECTION, ROLE_PERMISSIONS_DOC_ID);
    const unsub = onSnapshot(
      ref,
      (snap) => setRolePermConfig(snap.exists() ? (snap.data() as RolePermissionConfig) : {}),
      () => setRolePermConfig({})
    );
    return () => unsub();
  }, [db]);

  const userRoles = userProfile?.role || [];
  // Apply the config override on top of the existing default gating.
  const canSee = (moduleKey: string, defaultVisible: boolean) =>
    isModuleVisible(moduleKey, userRoles, rolePermConfig, defaultVisible);

  // Existing hard-coded defaults, kept intact as the fallback layer.
  const dfManagement = hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR']);
  const dfUsers = hasRole(['MasterAdmin']);
  const dfAttendance = hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR', 'Admin Site']);
  const dfDayOff = hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR']);
  const dfReporting = hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'HRM', 'HR']);

  const employeeSubDefs: SidebarSubItem[] = [
    { id: "emp_indirect", label: "Staff Monthly" },
    { id: "emp_direct_leader", label: "DC Daily" },
    { id: "emp_direct_supply", label: "Supply manpower" },
    { id: "emp_direct_sub", label: "Sub contractor" },
          { id: "position_labor", label: "Position Labor" },
  ];
  const visibleEmployeeSubs = employeeSubDefs.filter((s) => canSee(s.id, dfManagement));

  const managementItems: SidebarMenuItem[] = [
    ...(canSee("projects", dfManagement)
      ? [{ id: "projects", label: "โครงการ", icon: Briefcase } as SidebarLinkItem]
      : []),
    ...(visibleEmployeeSubs.length > 0
      ? [{ id: "employees", label: "พนักงาน (Employees)", icon: Users, sub: visibleEmployeeSubs } as SidebarGroupItem]
      : []),
  ];

  const dashboardItem: SidebarLinkItem = {
    id: "manpower_dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  };
  // Dashboard is visible to everyone by default; config can still override it.
  const showDashboard = canSee("manpower_dashboard", true);

  const manpowerItems: SidebarMenuItem[] = [
    ...(canSee("attendance", dfAttendance)
      ? [{ id: "attendance", label: "ลงเวลาการมาทำงาน", icon: Clock } as SidebarLinkItem]
      : []),
    ...(canSee("overtime", dfAttendance)
      ? [{ id: "overtime", label: "ลง Overtime", icon: Clock } as SidebarLinkItem]
      : []),
    ...(canSee("day_off", dfDayOff)
      ? [{ id: "day_off", label: "วันหยุด (Day Off)", icon: Calendar } as SidebarLinkItem]
      : []),
  ];

  // เห็นเมนูประเมินได้เมื่อ: (ก) เป็น role ที่ทำ Tier 3/4 หรือมอบหมายชุดได้
  // หรือ (ข) ถูก assign เป็น Tier 1/2 ของชุดใด ๆ (role ใดก็ได้ รวม Staff/Admin Site)
  const canSeeEvaluationDefault =
    hasRole(['MasterAdmin', 'MD', 'GM', 'PD', 'PM', 'CM', 'HRM', 'HR']) || isAssignedEvaluator;
  const evaluationItems: SidebarMenuItem[] = canSee("evaluation", canSeeEvaluationDefault)
    ? [{ id: "evaluation", label: "ประเมินผลพนักงาน", icon: ClipboardList } as SidebarLinkItem]
    : [];

  // Admin Site เห็น Risk Monitoring ได้เช่นกัน แต่ถูกจำกัดขอบเขตเฉพาะโครงการของตนภายในหน้านั้น
  const reportingItems: SidebarMenuItem[] = [
    ...(canSee("risk_monitoring", dfReporting || hasRole(["Admin Site"]))
      ? [{ id: "risk_monitoring", label: "Risk Monitoring", icon: AlertCircle } as SidebarLinkItem]
      : []),
    ...(canSee("activity_logs", dfReporting)
      ? [{ id: "activity_logs", label: "Activity Logs", icon: Activity } as SidebarLinkItem]
      : []),
  ];

  // System settings section ("ตั้งค่าระบบ").
  // - จัดการผู้ใช้ keeps its existing role-based gating (dfUsers).
  // - จัดการสิทธิ์การเข้าถึงตาม Role is strictly MasterAdmin-only (handled inside canSee).
  const settingsItems: SidebarMenuItem[] = [
    ...(canSee("users_data", dfUsers)
      ? [{ id: "users_data", label: "จัดการผู้ใช้ (Admin)", icon: UserCog, badge: pendingCount > 0 ? pendingCount : undefined } as SidebarLinkItem]
      : []),
    ...(canSee("role_permissions", hasRole(['MasterAdmin']))
      ? [{ id: "role_permissions", label: "จัดการสิทธิ์การเข้าถึงตาม Role", icon: ShieldCheck } as SidebarLinkItem]
      : []),
  ];

  const menuItems: SidebarMenuItem[] = [
    ...(showDashboard ? [dashboardItem] : []),
    ...managementItems,
    ...manpowerItems,
    ...evaluationItems,
    ...reportingItems,
    ...settingsItems,
  ];

  const renderMenuItem = (item: SidebarMenuItem) => (
    <div key={item.id}>
      {item.isDivider ? (
        <div className="border-t border-slate-800 my-1.5 mx-2" />
      ) : !hasSubMenu(item) ? (
        <button
          onClick={() => selectAndClose(item.id)}
          className={`w-full flex items-center rounded-lg transition-colors ${
            expanded ? "gap-3 px-4 py-2" : "justify-center p-2.5"
          } ${
            activeModule === item.id ? "bg-blue-600 text-white shadow-md" : "text-slate-300 hover:bg-slate-800"
          }`}
          title={!expanded ? item.label : undefined}
        >
          {item.icon && <item.icon size={20} className="shrink-0" />}
          {expanded && <span className="text-sm font-medium truncate">{item.label}</span>}
          {expanded && item.badge && <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{item.badge}</span>}
          {!expanded && item.badge && <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></span>}
        </button>
      ) : (
        <div className="space-y-1">
          <button
            onClick={() => expanded ? toggleMenu(item.id) : onToggleSidebar()}
            className={`w-full flex items-center rounded-lg transition-colors hover:bg-slate-800 ${
              expanded ? "justify-between px-4 py-2" : "justify-center p-2.5"
            } ${
              expandedMenus[item.id] ? "text-white bg-slate-800/50" : "text-slate-400"
            }`}
            title={!expanded ? item.label : undefined}
          >
            <div className={`flex items-center ${expanded ? "gap-3" : ""}`}>
              {item.icon && <item.icon size={20} className="shrink-0" />}
              {expanded && <span className="text-sm font-semibold truncate">{item.label}</span>}
            </div>
            {expanded && (expandedMenus[item.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
          </button>

          {expanded && expandedMenus[item.id] && (
            <div className="pl-2 space-y-0.5 border-l-2 border-slate-800 ml-3 animate-fade-in-down">
              {item.sub.map((subItem: SidebarSubItem) => (
                <button
                  key={subItem.id}
                  onClick={() => selectAndClose(subItem.id)}
                  className={`w-full text-left px-2.5 py-1.5 text-sm rounded-md transition-colors ${
                    activeModule === subItem.id ? "text-blue-400 font-medium bg-slate-800" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {subItem.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderSection = (sectionKey: string, title: string, icon: LucideIcon, items: SidebarMenuItem[]) => {
    if (items.length === 0) return null;

    const SectionIcon = icon;

    return (
      <div className="mb-1" key={sectionKey}>
        <button
          onClick={() => expanded ? toggleMenu(sectionKey) : onToggleSidebar()}
          className={`w-full flex items-center rounded-lg transition-colors hover:bg-slate-800 ${
            expanded ? "justify-between px-4 py-2" : "justify-center p-2.5"
          } ${
            expandedMenus[sectionKey] ? "text-white bg-slate-800/50" : "text-slate-300"
          }`}
          title={!expanded ? title : undefined}
        >
          <div className={`flex items-center ${expanded ? "gap-3" : ""}`}>
            <SectionIcon size={20} className="shrink-0" />
            {expanded && <span className="text-sm font-semibold truncate">{title}</span>}
          </div>
          {expanded && (expandedMenus[sectionKey] ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </button>

        {expanded && expandedMenus[sectionKey] && (
          <div className="mt-0.5 pl-2 space-y-0.5 border-l-2 border-slate-800 ml-3 animate-fade-in-down">
            {items.map((item) => renderMenuItem(item))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const parentMenu = menuItems.find(
      (item) =>
        hasSubMenu(item) && item.sub.some((subItem) => subItem.id === activeModule)
    );
    if (parentMenu) {
      setExpandedMenus((prev) => ({ ...prev, [parentMenu.id]: true }));
    }

    const activeInManagement = managementItems.some((item) => {
      if (item.isDivider) return false;
      if (hasSubMenu(item)) {
        return item.id === activeModule || item.sub.some((subItem) => subItem.id === activeModule);
      }
      return item.id === activeModule;
    });

    if (activeInManagement) {
      setExpandedMenus((prev) => ({ ...prev, management_section: true }));
    }

    const activeInManpower = manpowerItems.some((item) => {
      if (item.isDivider) return false;
      if (hasSubMenu(item)) {
        return item.id === activeModule || item.sub.some((subItem) => subItem.id === activeModule);
      }
      return item.id === activeModule;
    });

    if (activeInManpower) {
      setExpandedMenus((prev) => ({ ...prev, manpower_section: true }));
    }

    const activeInEvaluation = evaluationItems.some((item) => {
      if (item.isDivider) return false;
      if (hasSubMenu(item)) {
        return item.id === activeModule || item.sub.some((subItem) => subItem.id === activeModule);
      }
      return item.id === activeModule;
    });

    if (activeInEvaluation) {
      setExpandedMenus((prev) => ({ ...prev, evaluation_section: true }));
    }

    const activeInReporting = reportingItems.some((item) => {
      if (item.isDivider) return false;
      if (hasSubMenu(item)) {
        return item.id === activeModule || item.sub.some((subItem) => subItem.id === activeModule);
      }
      return item.id === activeModule;
    });

    if (activeInReporting) {
      setExpandedMenus((prev) => ({ ...prev, reporting_section: true }));
    }

    const activeInSettings = settingsItems.some((item) => {
      if (item.isDivider) return false;
      if (hasSubMenu(item)) {
        return item.id === activeModule || item.sub.some((subItem) => subItem.id === activeModule);
      }
      return item.id === activeModule;
    });

    if (activeInSettings) {
      setExpandedMenus((prev) => ({ ...prev, settings_section: true }));
    }
  }, [activeModule]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }));
  };

  const isConnected = firebaseUser || dbConnected;

  return (
    <>
      {/* Mobile top bar with hamburger (only visible on small screens) */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-12 z-30 bg-slate-900 text-white flex items-center gap-2 px-3 shadow-md">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="เปิดเมนู"
          >
            <Menu size={22} />
          </button>
          <div className="relative shrink-0">
            <Database className="text-blue-400" size={20} />
            <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          </div>
          <span className="font-semibold text-sm truncate flex-1">CMG Master Database</span>
        </div>
      )}

      {/* Backdrop for mobile drawer */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
          onClick={onToggleSidebar}
          aria-hidden="true"
        />
      )}

      <div
        className={`bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden shadow-xl transition-[width,transform] duration-200 ease-in-out ${
          isMobile
            ? `z-40 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : "z-10 translate-x-0"
        }`}
        style={{ width: isMobile ? SIDEBAR_WIDTH : sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
    >
      {/* Header */}
      <div className={`border-b border-slate-700 flex items-center gap-3 shrink-0 ${expanded ? "p-4" : "p-3 justify-center"}`}>
        <div className="relative shrink-0">
          <Database className="text-blue-400" size={expanded ? 28 : 24} />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
        </div>
        {expanded && (
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-base leading-tight">
              Master Database
              <br />
              CMG
            </h1>
            <p className={`text-[10px] flex items-center gap-1 ${isConnected ? "text-green-400" : "text-red-400"}`}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isConnected ? "Connected" : "Disconnected"}
            </p>
          </div>
        )}
      </div>

      {/* Toggle button - top */}
      <div className={`shrink-0 flex ${expanded ? "justify-end px-2 pt-2" : "justify-center p-2"}`}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={isMobile ? "ปิดเมนู" : sidebarOpen ? "ย่อเมนู" : "ขยายเมนู"}
        >
          {isMobile ? <X size={20} /> : sidebarOpen ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1 min-w-0">
        {showDashboard && renderMenuItem(dashboardItem)}
        {showDashboard && <div className="border-t border-slate-800 my-1.5 mx-2" />}

        {renderSection("management_section", "การจัดการ", Settings, managementItems)}
        {renderSection("manpower_section", "Manpower", Clock, manpowerItems)}
        {renderSection("evaluation_section", "ประเมินผล", ClipboardList, evaluationItems)}
        {renderSection("reporting_section", "รายงาน", Activity, reportingItems)}
        {renderSection("settings_section", "ตั้งค่าระบบ", ShieldCheck, settingsItems)}
      </nav>

      <div className={`border-t border-slate-800 shrink-0 ${expanded ? "p-4" : "p-2 flex justify-center"}`}>
        {expanded ? (
          <div className="flex items-center gap-3 text-slate-400 text-sm w-full">
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center text-blue-200 font-bold shrink-0">
                {userProfile?.firstName?.charAt(0) || firebaseUser?.email?.charAt(0).toUpperCase() || "A"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{userProfile?.firstName} {userProfile?.lastName}</p>
              <p className="text-[10px] text-blue-400 font-medium truncate">{userProfile?.role?.join(', ')}</p>
            </div>
            <NotificationBell setActiveModule={setActiveModule} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-slate-700" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center text-blue-200 font-bold text-sm">
                {userProfile?.firstName?.charAt(0) || firebaseUser?.email?.charAt(0).toUpperCase() || "A"}
              </div>
            )}
            <NotificationBell setActiveModule={setActiveModule} />
          </div>
        )}
      </div>
    </div>
    </>
  );
};

const DynamicInput = ({ field, value, onChange, disabled }: { field: SchemaField; value: unknown; onChange: (val: string | boolean) => void; disabled?: boolean }) => {
  const baseClass = `w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm ${
    disabled
      ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200"
      : "bg-white"
  }`;

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className={`${baseClass} min-h-[120px] resize-y`}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`ระบุ ${field.label}`}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={baseClass}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`ระบุ ${field.label}`}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className={baseClass}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "time":
      return (
        <input
          type="time"
          className={baseClass}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <select
          className={baseClass}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">-- กรุณาเลือก --</option>
          {field.options?.map((opt: string, i: number) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="w-5 h-5 text-blue-600 rounded"
            checked={value === true || value === "true"}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span className="text-gray-700 text-sm">{field.label}</span>
        </div>
      );
    default: // text
      return (
        <input
          type="text"
          className={baseClass}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`ระบุ ${field.label}`}
          disabled={disabled}
        />
      );
  }
};

const Modal = ({ isOpen, onClose, title, children, footer }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] h-[90vh] flex flex-col animate-fade-in-up">
        <div className="flex justify-between items-center p-5 border-b shrink-0">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="p-5 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

const NotificationModal = ({ isOpen, onClose, type, title, message }: { isOpen: boolean; onClose: () => void; type: string; title: string; message: string }) => {
  if (!isOpen) return null;

  const styles = {
    success: {
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-50",
      border: "border-green-200",
    },
    error: {
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-50",
      border: "border-red-200",
    },
    info: {
      icon: Info,
      color: "text-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  };

  const currentStyle = styles[type as keyof typeof styles] || styles.info;
  const Icon = currentStyle.icon;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        <div
          className={`p-6 flex flex-col items-center text-center ${currentStyle.bg}`}
        >
          <div
            className={`w-16 h-16 rounded-full bg-white flex items-center justify-center mb-4 shadow-sm ${currentStyle.color}`}
          >
            <Icon size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-lg font-semibold text-white shadow-md transition-transform active:scale-95 ${
              type === "error"
                ? "bg-red-500 hover:bg-red-600"
                : type === "success"
                ? "bg-green-500 hover:bg-green-600"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-4 shadow-sm text-orange-500 border border-orange-200">
            <HelpCircle size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-2.5 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 shadow-md transition-colors"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION COMPONENT ---
function MasterDatabaseApp() {
  const { userProfile, firebaseUser, logout, updateColumnPreferences, hasRole } = useAuth();
  const [activeModule, setActiveModule] = useState(""); // เริ่มต้นเป็นว่าง ไม่โหลดจนกว่าจะกดเมนู
  const [dbConnected, setDbConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      // Close the drawer automatically when growing back to desktop
      if (!e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  
  // ตรวจสอบสิทธิ์ตาม Role
  const canEdit = useMemo(() => hasRole(['MasterAdmin', 'MD', 'GM', 'HRM', 'HR', 'Admin Site']), [hasRole]);
  const canDelete = useMemo(() => hasRole(['MasterAdmin', 'MD', 'GM', 'HRM', 'Admin Site']), [hasRole]);
  const canAdd = useMemo(() => hasRole(['MasterAdmin', 'MD', 'GM', 'HRM', 'HR', 'Admin Site']), [hasRole]);
  
  const [notification, setNotification] = useState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [schemas, setSchemas] = useState<Record<string, SchemaField[]>>({});
  const [currentData, setCurrentData] = useState<DataRecord[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dcDailyGroupFilter, setDcDailyGroupFilter] = useState<"all" | "staff" | "worker">("all");
  const [employeeProjectFilter, setEmployeeProjectFilter] = useState("all");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("all");
  const [employeeWorkGroupFilter, setEmployeeWorkGroupFilter] = useState("all");
  const [employeePositionFilter, setEmployeePositionFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT_CONFIG);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DataRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [projectFormTab, setProjectFormTab] = useState<"general" | "plan">("general");
  const [newColumn, setNewColumn] = useState({
    label: "",
    type: "text",
    options: "",
  });

  // --- Dynamic options from related collections ---
  const [projectStatusOptions, setProjectStatusOptions] = useState<string[]>([]);
  const [positionOptions, setPositionOptions] = useState<string[]>([]);

  const applyDynamicSchemaOptions = (fields: SchemaField[], projectOptions = projectStatusOptions, positions = positionOptions) => {
    return fields.map((f) => {
      if (f.id === "สถานะโครงการ") return { ...f, options: projectOptions };
      if (f.id === "ตำแหน่ง") return { ...f, type: "select", options: positions };
      return f;
    });
  };

  const isEmployeeModule = activeModule === "employee_data" || activeModule.startsWith("emp_");

  const getEmployeeRowProjects = (row: DataRecord): string[] => {
    const projectStatus = row["สถานะโครงการ"];
    if (Array.isArray(projectStatus)) {
      return projectStatus.map((item) => String(item || "").trim()).filter(Boolean);
    }
    if (projectStatus != null && String(projectStatus).trim() !== "") {
      return [String(projectStatus).trim()];
    }
    const fallbackProject = String(row["โครงการ"] || "").trim();
    return fallbackProject ? [fallbackProject] : [];
  };

  const fetchProjectOptions = async () => {
    try {
      const q = collection(db, "CMG-HR-Database", "root", "projects");
      const snap = await getDocs(q);
      const opts = snap.docs.map(d => {
        const data = d.data();
        return data.project_name ? `${data.project_no} - ${data.project_name}` : data.project_no;
      }).filter(Boolean);
      
      setProjectStatusOptions(opts as string[]);
      
      setSchemas((prev) => {
        const updated: Record<string, SchemaField[]> = {};
        for (const [modId, fields] of Object.entries(prev)) {
          updated[modId] = applyDynamicSchemaOptions(fields as SchemaField[], opts as string[], positionOptions);
        }
        return updated;
      });
    } catch (e) {
      console.error("Error fetching project options:", e);
    }
  };

  const fetchPositionOptions = async () => {
    try {
      const q = collection(db, "CMG-HR-Database", "root", "position_labor");
      const snap = await getDocs(q);
      const opts = snap.docs
        .map((d) => String(d.data().position || d.id || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "th"));

      setPositionOptions(opts);

      setSchemas((prev) => {
        const updated: Record<string, SchemaField[]> = {};
        for (const [modId, fields] of Object.entries(prev)) {
          updated[modId] = applyDynamicSchemaOptions(fields as SchemaField[], projectStatusOptions, opts);
        }
        return updated;
      });
    } catch (e) {
      console.error("Error fetching position options:", e);
    }
  };

  const openProjectEditor = (item: DataRecord | null) => {
    const nextFormData = item
      ? {
          ...item,
          required_role_plan_baseline: normalizeProjectRolePlanBaseline(item["required_role_plan_baseline"], item["required_role_plan"]),
          required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(item["required_role_plan_adjustments"]),
        }
      : {
          required_role_plan_baseline: [] as ProjectRolePlanBaselineRow[],
          required_role_plan_adjustments: [] as ProjectRolePlanAdjustment[],
        };

    setEditingItem(item);
    setFormData(nextFormData);
    setProjectFormTab("general");
    setIsAddModalOpen(true);
  };

  useEffect(() => {
    if (dbConnected) {
      fetchProjectOptions();
      fetchPositionOptions();
    }
  }, [dbConnected, activeModule]);
  const [hiddenColumnsMap, setHiddenColumnsMap] = useState<Record<string, string[]>>({});
  const [isColVisOpen, setIsColVisOpen] = useState(false);
  const [skipImportRows, setSkipImportRows] = useState(0);
  const [selectedColumnIdsForDelete, setSelectedColumnIdsForDelete] = useState<Set<string>>(new Set());
  
  // Column Mapping Modal state
  const [isColumnMappingOpen, setIsColumnMappingOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  // Import Preview state
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<Record<string, string>[]>([]);
  const [importColumnMapping, setImportColumnMapping] = useState<Record<string, string>>({});
  
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollbarRailRef = useRef<HTMLDivElement>(null);
  const tableElementRef = useRef<HTMLTableElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(48);

  const isColumnProtected = (colId: string) =>
    colId === "Customer_ID" || colId === "con_id" || colId === "รหัสพนักงาน" || colId === "uid";

  const getModuleInfo = (moduleId: string): ModuleConfig => {
    return (MODULE_CONFIG as Record<string, ModuleConfig>)[moduleId] || { collection: "CMG-HR-Database", subcollection: moduleId, label: moduleId };
  };

  const getPrimaryKeyField = () => {
    const currentSchema = schemas[activeModule] || [];
    
    // Define fixed primary key for each module (not affected by column reordering)
    const primaryKeyMap: Record<string, string> = {
      'client_list': 'Customer_ID',
      'contractors': 'con_id',
      'emp_indirect': 'รหัสพนักงาน',
      'emp_direct_leader': 'รหัสพนักงาน',
      'emp_direct_supply': 'รหัสพนักงาน',
      'emp_direct_sub': 'รหัสพนักงาน',
      'employee_data': 'รหัสพนักงาน',
      'position_labor': 'position',
      'projects': 'project_no',
      'users_data': 'uid',
    };
    
    // Return fixed primary key for the module
    if (primaryKeyMap[activeModule]) {
      return primaryKeyMap[activeModule];
    }
    
    // Fallback: use first column (old behavior)
    return currentSchema.length > 0 ? currentSchema[0].id : null;
  };

  // --- AUTO ID GENERATION HELPER ---
  const generateNextID = (module: string, data: DataRecord[]): string => {
    if (module === "client_list") {
      const ids = data
        .map((item) => item.Customer_ID as string)
        .filter(
          (id) =>
            id &&
            typeof id === "string" &&
            id.toLowerCase().startsWith("customer")
        )
        .map((id) =>
          parseInt(
            String(id)
              .toLowerCase()
              .replace(/[^0-9]/g, ""),
            10
          )
        )
        .filter((num) => !isNaN(num));
      const maxId = ids.length > 0 ? Math.max(...ids) : 0;
      return `customer${String(maxId + 1).padStart(3, "0")}`;
    }
    if (module === "contractors") {
      const ids = data
        .map((item) => item.con_id as string)
        .filter((id) => id && typeof id === "string" && id.startsWith("CT-"))
        .map((id) => parseInt(id.replace("CT-", ""), 10))
        .filter((num) => !isNaN(num));
      const maxId = ids.length > 0 ? Math.max(...ids) : 0;
      return `CT-${String(maxId + 1).padStart(3, "0")}`;
    }
    return "";
  };

  const getAutoIdConfig = (module: string) => {
    if (module === "client_list") {
      return { field: "Customer_ID", prefix: "customer", pad: 3 };
    }
    if (module === "contractors") {
      return { field: "con_id", prefix: "CT-", pad: 3 };
    }
    return null;
  };

  const getMaxAutoIdNumber = (module: string, data: DataRecord[]): number => {
    const autoIdConfig = getAutoIdConfig(module);
    if (!autoIdConfig) return 0;

    const { field, prefix } = autoIdConfig;
    const normalizedPrefix = prefix.toLowerCase();

    const ids = data
      .map((item) => item[field])
      .filter(
        (id) =>
          id &&
          typeof id === "string" &&
          id.toLowerCase().startsWith(normalizedPrefix)
      )
      .map((id) =>
        parseInt(
          String(id).toLowerCase().replace(normalizedPrefix, ""),
          10
        )
      )
      .filter((num) => !isNaN(num));

    return ids.length > 0 ? Math.max(...ids) : 0;
  };

  const formatAutoId = (module: string, idNumber: number): string => {
    const autoIdConfig = getAutoIdConfig(module);
    if (!autoIdConfig) return "";
    return `${autoIdConfig.prefix}${String(idNumber).padStart(autoIdConfig.pad, "0")}`;
  };

  const showNotification = (type: string, title: string, message: string) =>
    setNotification({ isOpen: true, type, title, message });
  const closeNotification = () =>
    setNotification((prev) => ({ ...prev, isOpen: false }));

  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmation({ isOpen: true, title, message, onConfirm });
  const closeConfirm = () =>
    setConfirmation((prev) => ({ ...prev, isOpen: false }));

  const toggleColumnVisibility = async (colId: string) => {
    const currentModuleHidden = hiddenColumnsMap[activeModule] || [];
    let newHidden: string[];
    
    if (currentModuleHidden.includes(colId)) {
      newHidden = currentModuleHidden.filter((id: string) => id !== colId);
    } else {
      newHidden = [...currentModuleHidden, colId];
    }
    
    // อัพเดท local state
    setHiddenColumnsMap((prev) => {
      return { ...prev, [activeModule]: newHidden };
    });
    
    // บันทึกลง Firestore
    await updateColumnPreferences(activeModule, newHidden);
  };

  // โหลดการตั้งค่าคอลัมน์จาก user profile เมื่อ component mount หรือ user profile เปลี่ยน
  useEffect(() => {
    if (userProfile?.columnPreferences) {
      setHiddenColumnsMap(userProfile.columnPreferences);
    }
  }, [userProfile]);

  useEffect(() => {
    // Only setting DB connected state, since Firebase auth is handled globally now
    setDbConnected(true);
    setLoading(false);
  }, []);

  // อ่าน Firebase เฉพาะตอนกดเข้าเมนู (lazy load) เพื่อลดโควต้า Read
  const fetchModuleRef = useRef<string | null>(null);

  useEffect(() => {
    const moduleId = activeModule;
    // ถ้ายังไม่ได้เลือกเมนู ไม่โหลดข้อมูล
    if (!moduleId) return;

    fetchModuleRef.current = moduleId;
    setDataLoading(true);

    const config = getModuleInfo(moduleId);
    const subcollectionName = config.subcollection || moduleId;

    const load = async () => {
      try {
        setDbConnected(true);
        // อ่าน schema ครั้งเดียว (1 read) — ถ้ามี schemaSource ให้โหลดจาก module ต้นทางแทน
        const schemaModuleId = config.schemaSource || moduleId;
        const schemaRef = doc(db, "CMG-HR-Database", "root", "module_schemas", schemaModuleId);
        const schemaSnap = await getDoc(schemaRef);
        if (fetchModuleRef.current !== moduleId) return;

        // --- Status field definitions to auto-inject ---
        const STATUS_FIELD_DEFS: SchemaField[] = [
          {
            id: "สถานะพนักงาน",
            label: "สถานะพนักงาน",
            type: "select",
            options: ["ทำงาน", "พักงาน", "ลาคลอด", "ลาออก", "เลิกจ้าง"],
          },
          {
            id: "สถานะกลุ่มงาน",
            label: "สถานะกลุ่มงาน",
            type: "select",
            options: ["Staff", "Worker", "Subcontract", "Supply Contract"],
          },
          {
            id: "สถานะโครงการ",
            label: "สถานะโครงการ",
            type: "select",
            options: projectStatusOptions,
          },
        ];
        const PROJECT_FIELD_DEFS: SchemaField[] = [
          {
            id: "required_manpower",
            label: "กำลังคนตามแผน (Required Manpower)",
            type: "number",
          },
          {
            id: "required_role_plan",
            label: "แผนกำลังคนรายตำแหน่ง (required_role_plan)",
            type: "textarea",
          },
        ];

        if (schemaSnap.exists()) {
          let loadedFields: SchemaField[] = schemaSnap.data().fields as SchemaField[];
          const existingIds = new Set(loadedFields.map((f) => f.id));
          const missingStatusFields = STATUS_FIELD_DEFS.filter((f) => !existingIds.has(f.id));
          const missingProjectFields = schemaModuleId === "projects"
            ? PROJECT_FIELD_DEFS.filter((f) => !existingIds.has(f.id))
            : [];
          const missingFields = [...missingStatusFields, ...missingProjectFields];
          if (missingFields.length > 0) {
            loadedFields = [...loadedFields, ...missingFields];
            try {
              await setDoc(
                doc(db, "CMG-HR-Database", "root", "module_schemas", schemaModuleId),
                { fields: loadedFields }
              );
            } catch (e) {
              console.warn("Could not auto-save merged schema:", e);
            }
          } else {
            loadedFields = applyDynamicSchemaOptions(loadedFields);
          }
          setSchemas((prev) => ({ ...prev, [moduleId]: loadedFields }));
        } else {
          const fallbackKey = subcollectionName;
          let defaultSchema = (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[schemaModuleId]
            ?? (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[moduleId]
            ?? (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[fallbackKey]
            ?? [];
          defaultSchema = applyDynamicSchemaOptions(defaultSchema);
          setSchemas((prev) => ({ ...prev, [moduleId]: defaultSchema }));
        }

        // โหลดข้อมูลทั้งหมดในครั้งเดียวสำหรับทุกเมนู รวมถึง Employee และ Position Labor
        let dataQuery: CollectionReference<DocumentData> | Query<DocumentData> = collection(
          db, "CMG-HR-Database", "root", subcollectionName
        );
        if (config.filterField && config.filterValue) {
          if (Array.isArray(config.filterValue)) {
            dataQuery = query(dataQuery as CollectionReference<DocumentData>, where(config.filterField, "in", config.filterValue));
          } else {
            dataQuery = query(dataQuery as CollectionReference<DocumentData>, where(config.filterField, "==", config.filterValue));
          }
        }
        const snapshot = await getDocs(dataQuery);
        if (fetchModuleRef.current !== moduleId) return;
        const items = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as DataRecord))
          .filter((item) => item.id !== "_schema_metadata");
        if (subcollectionName === "activity_logs") {
          const logItems = items as unknown as LogRecord[];
          logItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          setLogs(logItems);
        } else {
          setCurrentData(items);
        }
      } catch (error) {
        if (fetchModuleRef.current === moduleId) {
          console.error("Fetch error:", error);
        }
      } finally {
        if (fetchModuleRef.current === moduleId) {
          setDataLoading(false);
        }
      }
    };
    load();
  }, [activeModule]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSortConfig(DEFAULT_SORT_CONFIG); // Reset sort by employee ID when changing module
    setSearchQuery(""); // Reset search when changing module
  }, [activeModule]);

  useEffect(() => {
    if (dataLoading) return;
    const updateWidth = () => {
      requestAnimationFrame(() => {
        const table = tableElementRef.current;
        const w = table?.scrollWidth ?? 0;
        setTableScrollWidth(w);
      });
    };
    const wrapper = tableScrollRef.current;
    const table = tableElementRef.current;
    const t = setTimeout(updateWidth, 100);
    const ro = new ResizeObserver(updateWidth);
    if (wrapper) ro.observe(wrapper);
    if (table) ro.observe(table);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [activeModule, currentData.length, searchQuery, schemas, dataLoading]);

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeaderHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dataLoading]);

  const syncTableScrollFromRail = () => {
    const rail = scrollbarRailRef.current;
    const table = tableScrollRef.current;
    if (rail && table) table.scrollLeft = rail.scrollLeft;
  };
  const syncRailScrollFromTable = () => {
    const rail = scrollbarRailRef.current;
    const table = tableScrollRef.current;
    if (rail && table) rail.scrollLeft = table.scrollLeft;
  };

  const fetchModuleData = async (moduleId = activeModule, applyModuleFilter = true): Promise<DataRecord[]> => {
    const config = getModuleInfo(moduleId);
    const subcollectionName = config.subcollection || moduleId;
    let dataQuery: CollectionReference<DocumentData> | Query<DocumentData> = collection(
      db,
      "CMG-HR-Database",
      "root",
      subcollectionName
    );
    if (applyModuleFilter && config.filterField && config.filterValue) {
        if (Array.isArray(config.filterValue)) {
          dataQuery = query(
            dataQuery as CollectionReference<DocumentData>,
            where(config.filterField, "in", config.filterValue)
          );
        } else {
          dataQuery = query(
            dataQuery as CollectionReference<DocumentData>,
            where(config.filterField, "==", config.filterValue)
          );
        }
    }

    const snapshot = await getDocs(dataQuery);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as DataRecord))
      .filter((item) => item.id !== "_schema_metadata");
  };

  const refreshCurrentModuleData = async (): Promise<DataRecord[]> => {
    const config = getModuleInfo(activeModule);
    const subcollectionName = config.subcollection || activeModule;
    try {
      const items = await fetchModuleData(activeModule);
      setCurrentData(items);
      if (subcollectionName === "activity_logs") {
        const logItems = items as unknown as LogRecord[];
        logItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setLogs(logItems);
      }
      if (activeModule === "projects") {
        await fetchProjectOptions();
      }
      if (activeModule === "position_labor") {
        await fetchPositionOptions();
      }
      return items;
    } catch (e) {
      console.error("Refresh error:", e);
      return [];
    }
  };

  const addLog = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: firebaseUser?.email ?? "anonymous",
        module: activeModule,
        action: action,
        details: details,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.error("Log error:", e);
    }
  };

  const moduleInfo = getModuleInfo(activeModule);
  const currentSchema = schemas[activeModule] || [];

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("colIndex", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, droppedIndex: number) => {
    const draggedIndexStr = e.dataTransfer.getData("colIndex");
    if (draggedIndexStr === "") return;
    const draggedIndex = parseInt(draggedIndexStr, 10);
    if (draggedIndex === droppedIndex) return;
    const newSchema = [...currentSchema];
    const [reorderedItem] = newSchema.splice(draggedIndex, 1);
    newSchema.splice(droppedIndex, 0, reorderedItem);
    setSchemas((prev) => ({ ...prev, [activeModule]: newSchema }));
    try {
      const schemaTargetId = (MODULE_CONFIG as Record<string, ModuleConfig>)[activeModule]?.schemaSource || activeModule;
      await setDoc(
        doc(db, "CMG-HR-Database", "root", "module_schemas", schemaTargetId),
        { fields: newSchema }
      );
      await addLog("ปรับลำดับ", `ย้ายคอลัมน์ใน ${activeModule}`);
    } catch (error) {
      showNotification("error", "บันทึกลำดับไม่สำเร็จ", (error as Error).message);
    }
  };

  // V18: Prevent deletion of core Auto-ID fields
  const handleDeleteColumn = (index: number, colLabel: string, colId: string) => {
    if (colId === "Customer_ID" || colId === "con_id") {
      showNotification(
        "error",
        "ไม่อนุญาต",
        "ไม่สามารถลบคอลัมน์รหัสหลักของระบบได้"
      );
      return;
    }

    showConfirm(
      "ยืนยันการลบคอลัมน์",
      `ต้องการลบคอลัมน์ "${colLabel}" ใช่หรือไม่?`,
      async () => {
        const newSchema = [...currentSchema];
        newSchema.splice(index, 1);
        try {
          const schemaTargetId = (MODULE_CONFIG as Record<string, ModuleConfig>)[activeModule]?.schemaSource || activeModule;
          await setDoc(
            doc(db, "CMG-HR-Database", "root", "module_schemas", schemaTargetId),
            { fields: newSchema }
          );
          setSchemas((prev) => ({ ...prev, [activeModule]: newSchema }));
          await addLog("ลบคอลัมน์", `ลบคอลัมน์ "${colLabel}"`);
          showNotification("success", "สำเร็จ", `ลบคอลัมน์ "${colLabel}" แล้ว`);
        } catch (error) {
          showNotification("error", "ลบคอลัมน์ไม่สำเร็จ", (error as Error).message);
        }
      }
    );
  };

  const handleSaveItem = async () => {
    try {
      const config = getModuleInfo(activeModule);
      const cleanData: Record<string, unknown> = Object.entries(formData).reduce((acc: Record<string, unknown>, [k, v]) => {
        if (v !== undefined) acc[k] = v;
        return acc;
      }, {});

      if (activeModule === "projects") {
        const baselineRows = sanitizeProjectRolePlanBaseline(cleanData["required_role_plan_baseline"], cleanData["required_role_plan"]);
        const adjustmentRows = sanitizeProjectRolePlanAdjustments(cleanData["required_role_plan_adjustments"]);

        cleanData["required_role_plan_baseline"] = baselineRows.map((row) => ({
          position: row.position,
          required: row.required,
        }));
        cleanData["required_role_plan_adjustments"] = adjustmentRows
          .map((item) => ({
            id: item.id,
            start_date: item.start_date,
            end_date: item.end_date,
            note: item.note || "",
            rows: item.rows.map((row) => ({
              position: row.position,
              delta: row.delta,
            })),
          }));
        cleanData["required_role_plan"] = baselineRows
          .map((row) => `${row.position}: ${row.required}`)
          .join("\n");
      }

      if (config.filterField && config.filterValue) {
        cleanData[config.filterField] = Array.isArray(config.filterValue) ? config.filterValue[0] : config.filterValue;
      }

      // --- Handle project status field - Force replace with only selected values ---
      const projectStatusField = "สถานะโครงการ";
      
      // Always process project status field if it exists in schema
      const hasProjectStatusField = schemas[activeModule]?.some(field => field.id === projectStatusField);
      
      if (hasProjectStatusField) {
        // Get selected projects from form data
        const selectedProjects: string[] = cleanData[projectStatusField]
          ? Array.isArray(cleanData[projectStatusField])
            ? cleanData[projectStatusField] as string[]
            : [String(cleanData[projectStatusField])]
          : [];
        
        console.log(`📋 สถานะโครงการที่เลือก: [${selectedProjects.join(', ')}]`);
        
        // Log changes if editing existing item
        if (editingItem) {
          const originalProjects: string[] = editingItem[projectStatusField]
            ? Array.isArray(editingItem[projectStatusField])
              ? editingItem[projectStatusField] as string[]
              : [String(editingItem[projectStatusField])]
            : [];
          
          console.log(`🔄 อัพเดทสถานะโครงการ:`);
          console.log(`   เดิม: [${originalProjects.join(', ')}]`);
          console.log(`   ใหม่: [${selectedProjects.join(', ')}]`);
          
          const removedProjects = originalProjects.filter(project => !selectedProjects.includes(project));
          const addedProjects = selectedProjects.filter(project => !originalProjects.includes(project));
          
          // IMPORTANT: Always force-update the field to ensure complete replacement
          // We need to handle this specially because Firestore may merge arrays
          if (originalProjects.length > 0 || selectedProjects.length > 0) {
            console.log(`🔄 จะอัพเดทฟิลด์สถานะโครงการแบบพิเศษเพื่อให้แน่ใจว่าจะ replace ทั้งหมด`);
            
            // Don't delete field here - we'll force replace in the main update
            // Mark that we need special handling
            cleanData[`__forceReplace_${projectStatusField}`] = true;
          }
          
          // Log the actions
          if (removedProjects.length > 0) {
            await addLog("ลบโครงการจากบุคคล", `ลบโครงการ: ${removedProjects.join(', ')} (ID: ${editingItem.id})`);
          }
          if (addedProjects.length > 0) {
            await addLog("เพิ่มโครงการให้บุคคล", `เพิ่มโครงการ: ${addedProjects.join(', ')} (ID: ${editingItem.id})`);
          }
        }
        
        // Set the new values (or empty array to clear all)
        cleanData[projectStatusField] = selectedProjects;
        console.log(`💾 ตั้งค่าโครงการใหม่: [${selectedProjects.join(', ')}]`);
      }

      // Continue with normal save process
      const primaryKeyField = getPrimaryKeyField();
      console.log(`🔑 Primary Key Field for ${activeModule}:`, primaryKeyField);
      
      if (!primaryKeyField) {
        showNotification("error", "Error", "ไม่พบโครงสร้างตาราง");
        return;
      }

      if (editingItem) {
        console.log(`✏️ EDITING existing item:`, editingItem.id);
        const subcollectionName = config.subcollection || activeModule;
        const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, editingItem.id);
        
        // Check if we have project status field to update
        const hasProjectStatus = projectStatusField in cleanData;
        
        if (hasProjectStatus) {
          // Special handling for project status field - MUST replace entire array
          console.log(`🔄 พบฟิลด์สถานะโครงการ - จะทำการ replace ทั้งหมด`);
          
          // Remove the marker if exists
          delete cleanData[`__forceReplace_${projectStatusField}`];
          
          // Extract project status value
          const projectStatusValue = cleanData[projectStatusField] || [];
          
          // Remove from main update data
          const updateDataWithoutProjects = { ...cleanData };
          delete updateDataWithoutProjects[projectStatusField];
          
          // Step 1: Delete the entire field first
          console.log(`🗑️ Step 1: ลบฟิลด์สถานะโครงการเก่าทั้งหมด...`);
          await updateDoc(docRef, {
            [projectStatusField]: deleteField()
          });
          
          // Wait a moment to ensure deletion completes
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Step 2: Update other fields (if any)
          if (Object.keys(updateDataWithoutProjects).length > 0) {
            console.log(`📝 Step 2: อัพเดทข้อมูลอื่นๆ...`);
            await updateDoc(docRef, updateDataWithoutProjects as any);
          }
          
          // Step 3: Set the project status field with new value
          console.log(`💾 Step 3: บันทึกสถานะโครงการใหม่:`);
          console.log(`   - Type: ${Array.isArray(projectStatusValue) ? 'Array' : typeof projectStatusValue}`);
          console.log(`   - Value: ${JSON.stringify(projectStatusValue)}`);
          console.log(`   - Count: ${Array.isArray(projectStatusValue) ? projectStatusValue.length : 'N/A'}`);
          
          await updateDoc(docRef, {
            [projectStatusField]: projectStatusValue
          });
          
          console.log(`✅ อัพเดทสถานะโครงการเสร็จสมบูรณ์`);
        } else {
          // Normal update for other fields
          await updateDoc(docRef, cleanData as any);
        }
        
        await addLog("แก้ไข", `แก้ไขรายการ ID: ${editingItem.id}`);
        showNotification("success", "บันทึกสำเร็จ", "ข้อมูลถูกแก้ไขเรียบร้อยแล้ว");
        await refreshCurrentModuleData();
      } else {
        console.log(`➕ CREATING new item`);
        console.log(`📝 Form Data:`, cleanData);
        console.log(`🔑 Primary Key Field:`, primaryKeyField);
        console.log(`📊 Primary Key Value:`, cleanData[primaryKeyField]);
        
        const freshModuleData = await fetchModuleData(activeModule);
        let docId;
        // Auto ID Generation strictly at save time for new items
        if (activeModule === "client_list") {
          docId = generateNextID("client_list", freshModuleData);
          cleanData["Customer_ID"] = docId;
          console.log(`🆔 Auto-generated Customer_ID:`, docId);
        } else if (activeModule === "contractors") {
          docId = generateNextID("contractors", freshModuleData);
          cleanData["con_id"] = docId;
          console.log(`🆔 Auto-generated con_id:`, docId);
        } else if (activeModule === "emp_direct_sub") {
          // Sub Contractor: ใช้ชื่อตัว+ชื่อสกุลเป็น unique key
          const firstName = String(cleanData["ชื่อตัว"] || "").trim();
          const lastName = String(cleanData["ชื่อสกุล"] || "").trim();
          if (!firstName || !lastName) {
            showNotification("error", "ข้อมูลไม่ครบ", "กรุณาระบุ ชื่อตัว และ ชื่อสกุล");
            return;
          }
          const fullName = `${firstName} ${lastName}`;
          const isDuplicate = freshModuleData.some((item) => {
            const iFirst = String(item["ชื่อตัว"] || "").trim();
            const iLast = String(item["ชื่อสกุล"] || "").trim();
            return iFirst === firstName && iLast === lastName;
          });
          if (isDuplicate) {
            showNotification("error", "ชื่อซ้ำ", `"${fullName}" มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้`);
            return;
          }
          docId = `${firstName}_${lastName}`.replace(/[\/#${}\s]/g, "_");
          console.log(`🆔 Generated docId from name:`, docId);
        } else {
          docId = cleanData[primaryKeyField];
          console.log(`🆔 Using primary key value as docId:`, docId);
        }

        if (!docId) {
          console.error(`❌ No docId! Primary key "${primaryKeyField}" is missing or empty`);
          showNotification(
            "error",
            "ข้อมูลไม่ครบ",
            `กรุณาระบุ ${primaryKeyField}`
          );
          return;
        }

        docId = String(docId).replace(/[\/\.\#\$\{\}]/g, "_");
        console.log(`🆔 Final docId (after sanitization):`, docId);
        
        const subcollectionName = config.subcollection || activeModule;
        console.log(`📂 Subcollection:`, subcollectionName);
        console.log(`📍 Full path: CMG-HR-Database/root/${subcollectionName}/${docId}`);
        
        // Check if document ID already exists. Auto IDs are advanced until they are really free.
        let docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
        let docSnap = await getDoc(docRef);
        const autoIdConfig = getAutoIdConfig(activeModule);
        if (autoIdConfig) {
          let nextNumber = getMaxAutoIdNumber(activeModule, freshModuleData) + 1;
          while (docSnap.exists()) {
            nextNumber++;
            docId = formatAutoId(activeModule, nextNumber);
            cleanData[autoIdConfig.field] = docId;
            docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
            docSnap = await getDoc(docRef);
          }
        }
        
        if (docSnap.exists()) {
          console.error(`❌ Document already exists!`);
          showNotification(
            "error",
            "ข้อมูลซ้ำ",
            `${primaryKeyField} "${cleanData[primaryKeyField]}" มีอยู่ในระบบแล้ว\nไม่สามารถเพิ่มซ้ำได้`
          );
          return;
        }
        
        console.log(`✅ Document doesn't exist, proceeding to create...`);
        console.log(`💾 Data to save:`, cleanData);
        
        await setDoc(docRef, cleanData);
        console.log(`✅ Document created successfully!`);
        
        await addLog("เพิ่มใหม่", `เพิ่มรายการ ID: ${docId}`);
        showNotification("success", "บันทึกสำเร็จ", `เพิ่มข้อมูล ${docId} เรียบร้อยแล้ว`);
        await refreshCurrentModuleData();
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      setFormData({});
      setProjectFormTab("general");
    } catch (error) {
      showNotification("error", "ผิดพลาด", (error as Error).message);
    }
  };

  const handleDeleteItem = (id: string) => {
    const config = getModuleInfo(activeModule);
    showConfirm("ยืนยันการลบ", "ต้องการลบข้อมูลนี้ใช่หรือไม่?", async () => {
      try {
        const subcollectionName = config.subcollection || activeModule;
        await deleteDoc(doc(db, "CMG-HR-Database", "root", subcollectionName, id));
        await addLog("ลบ", `ลบรายการ ID: ${id}`);
        showNotification("success", "ลบสำเร็จ", "ข้อมูลถูกลบแล้ว");
        await refreshCurrentModuleData();
      } catch (error) {
        showNotification("error", "ผิดพลาด", (error as Error).message);
      }
    });
  };

  const toggleSelectAll = () => {
    if (filteredData.length === 0) return;
    const allIds = new Set(filteredData.map((r) => r.id));
    const allSelected = allIds.size > 0 && Array.from(allIds).every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set(Array.from(prev).concat(Array.from(allIds))));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const config = getModuleInfo(activeModule);
    const subcollectionName = config.subcollection || activeModule;
    const count = selectedIds.size;
    showConfirm(
      "ยืนยันการลบ",
      `ต้องการลบรายการที่เลือก ${count} รายการใช่หรือไม่?`,
      async () => {
        try {
          const idsToDelete = Array.from(selectedIds);
          for (const id of idsToDelete) {
            await deleteDoc(doc(db, "CMG-HR-Database", "root", subcollectionName, id));
          }
          await addLog("ลบหลายรายการ", `ลบ ${count} รายการ`);
          setSelectedIds(new Set());
          showNotification("success", "ลบสำเร็จ", `ลบ ${count} รายการแล้ว`);
          await refreshCurrentModuleData();
        } catch (error) {
          showNotification("error", "ผิดพลาด", (error as Error).message);
        }
      }
    );
  };

  const handleAddColumn = async () => {
    if (!newColumn.label) {
      showNotification("error", "ข้อมูลไม่ครบ", "กรุณาระบุชื่อคอลัมน์");
      return;
    }
    const fieldId = newColumn.label.toLowerCase().replace(/\s+/g, "_");
    const newField = {
      id: fieldId,
      label: newColumn.label,
      type: newColumn.type,
      options:
        newColumn.type === "select" && newColumn.options
          ? newColumn.options.split(",").map((s) => s.trim())
          : [],
    };
    try {
      const updatedFields = [...currentSchema, newField];
      setSchemas((prev) => ({ ...prev, [activeModule]: updatedFields }));
      const schemaTargetId = (MODULE_CONFIG as Record<string, ModuleConfig>)[activeModule]?.schemaSource || activeModule;
      await setDoc(
        doc(db, "CMG-HR-Database", "root", "module_schemas", schemaTargetId),
        { fields: updatedFields }
      );
      
      console.log("Schema saved successfully");
      await addLog("ปรับโครงสร้าง", `เพิ่มคอลัมน์ "${newColumn.label}"`);
      showNotification("success", "สำเร็จ", `เพิ่มคอลัมน์แล้ว`);
      setIsSchemaModalOpen(false);
      setNewColumn({ label: "", type: "text", options: "" });
    } catch (error) {
      console.error("Error adding column:", error);
      showNotification("error", "เพิ่มคอลัมน์ไม่สำเร็จ", (error as Error).message);
    }
  };

  const toggleSelectColumnForDelete = (colId: string) => {
    if (isColumnProtected(colId)) return;
    setSelectedColumnIdsForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const handleDeleteSelectedColumns = () => {
    if (selectedColumnIdsForDelete.size === 0) return;
    const idsToDelete = Array.from(selectedColumnIdsForDelete);
    const idsSet = new Set(idsToDelete);
    showConfirm(
      "ยืนยันการลบคอลัมน์",
      `ต้องการลบคอลัมน์ที่เลือก ${idsToDelete.length} คอลัมน์ใช่หรือไม่?`,
      async () => {
        try {
          const newSchema = currentSchema.filter((col) => !idsSet.has(col.id));
          const schemaTargetId = (MODULE_CONFIG as Record<string, ModuleConfig>)[activeModule]?.schemaSource || activeModule;
          await setDoc(
            doc(db, "CMG-HR-Database", "root", "module_schemas", schemaTargetId),
            { fields: newSchema }
          );
          setSchemas((prev) => ({ ...prev, [activeModule]: newSchema }));
          setSelectedColumnIdsForDelete(new Set());
          await addLog("ลบคอลัมน์หลายรายการ", `ลบ ${idsToDelete.length} คอลัมน์`);
          showNotification("success", "สำเร็จ", `ลบคอลัมน์ ${idsToDelete.length} คอลัมน์แล้ว`);
        } catch (error) {
          showNotification("error", "ลบคอลัมน์ไม่สำเร็จ", (error as Error).message);
        }
      }
    );
  };

  const createUtf8BomBlob = (content: string): Blob => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const encoded = new TextEncoder().encode(content);
    const withBom = new Uint8Array(bom.length + encoded.length);
    withBom.set(bom, 0);
    withBom.set(encoded, bom.length);
    return new Blob([withBom], { type: "text/csv;charset=utf-8;" });
  };

  const downloadCSV = () => {
    if (currentData.length === 0)
      return showNotification("info", "ไม่มีข้อมูล", "ไม่มีข้อมูลให้ Export");
    const headers = ["ลำดับ", ...currentSchema.map((col) => col.label)].join(",");
    const rows = currentData
      .map((row, idx) =>
        [idx + 1, ...currentSchema.map((col) => {
          const v = row[col.id];
          // สถานะโครงการ: join array ด้วย | เพื่อ export
          const strVal = Array.isArray(v) ? (v as string[]).join("|") : (v || "");
          return `"${strVal}"`;
        })].join(",")
      )
      .join("\n");
    const blob = createUtf8BomBlob(`${headers}\n${rows}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModule}_export.csv`;
    link.click();
    showNotification("success", "ดาวน์โหลด", "เริ่มการดาวน์โหลดไฟล์ CSV");
  };

  const downloadTemplate = () => {
    let templateSchema = currentSchema;
    if (activeModule === "client_list") {
      templateSchema = currentSchema.filter((col) => col.id !== "Customer_ID");
    } else if (activeModule === "contractors") {
      templateSchema = currentSchema.filter((col) => col.id !== "con_id");
    }
    const headers = templateSchema
      .map((col) => col.label)
      .join(activeModule === "client_list" ? "\t" : ",");
    const blob = createUtf8BomBlob(headers);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModule}_template.csv`;
    link.click();
    showNotification("success", "ดาวน์โหลด", "เริ่มการดาวน์โหลด Template");
  };

  // --- SMART IMPORT LOGIC: รองรับทั้ง UTF-8 และ Windows-874 (Excel บน Windows ภาษาไทย) ---
  const decodeCSVFile = (buffer: ArrayBuffer): string => {
    const uint8 = new Uint8Array(buffer);
    const hasUTF8BOM = uint8.length >= 3 && uint8[0] === 0xef && uint8[1] === 0xbb && uint8[2] === 0xbf;
    const tryDecode = (encoding: string): string => {
      try {
        return new TextDecoder(encoding).decode(buffer);
      } catch {
        return "";
      }
    };
    const countBad = (s: string) => (s.match(/\uFFFD/g) || []).length + (s.match(/\?\?\?/g) || []).length;
    let text: string;
    if (hasUTF8BOM) {
      text = tryDecode("utf-8").replace(/^\uFEFF/, "");
    } else {
      const utf8 = tryDecode("utf-8");
      const win874 = tryDecode("windows-874");
      const badUtf8 = countBad(utf8);
      const bad874 = countBad(win874);
      text = bad874 <= badUtf8 ? win874 : utf8;
    }
    const replacementCount = countBad(text);
    if (replacementCount > text.length * 0.01) {
      const other = tryDecode(hasUTF8BOM ? "windows-874" : "utf-8");
      if (countBad(other) < replacementCount) text = other;
    }
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    
    setPendingFile(file);
    setDataLoading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawResult = e.target?.result;
        if (rawResult == null || !(rawResult instanceof ArrayBuffer)) {
          setDataLoading(false);
          return;
        }
        
        const text = decodeCSVFile(rawResult);
        const rows = text.split("\n").filter((r) => r.trim() !== "");

        if (rows.length < 2) {
          showNotification(
            "error",
            "ไฟล์ไม่ถูกต้อง",
            "ต้องมี Header และข้อมูลอย่างน้อย 1 แถว"
          );
          setDataLoading(false);
          return;
        }

        const firstLine = rows[0];
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const delimiter = tabCount > commaCount ? "\t" : ",";

        const parseCSVRow = (row: string): string[] => {
          const out: string[] = [];
          let cur = "";
          let inQuotes = false;
          for (let i = 0; i < row.length; i++) {
            const c = row[i];
            if (c === '"') {
              if (inQuotes && row[i + 1] === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (!inQuotes && c === delimiter) {
              out.push(cur.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
              cur = "";
            } else {
              cur += c;
            }
          }
          out.push(cur.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
          return out;
        };

        const headers = parseCSVRow(rows[0]);
        const dataRows = rows.slice(1).map(parseCSVRow);
        
        // Store headers and rows for later use
        setCsvHeaders(headers);
        setCsvRows(dataRows);
        
        // Open column mapping modal
        setIsColumnMappingOpen(true);
        setDataLoading(false);
        
      } catch (error) {
        console.error("CSV Parse Error:", error);
        showNotification("error", "อ่านไฟล์ล้มเหลว", (error as Error).message);
        setDataLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmMapping = async (columnMapping: Record<string, string>, selectedIndices?: number[]) => {
    // Preview mode: ยังไม่มี row ที่เลือก → แสดง preview ก่อน
    if (!selectedIndices) {
      const reverseMapping: Record<string, string> = {};
      Object.entries(columnMapping).forEach(([fieldId, csvHeader]) => {
        if (csvHeader) reverseMapping[csvHeader] = fieldId;
      });
      
      const dataStartIndex = Math.max(0, skipImportRows || 0);
      const rows: Record<string, string>[] = [];
      
      for (let i = dataStartIndex; i < csvRows.length; i++) {
        const values = csvRows[i];
        const rowData: Record<string, string> = {};
        csvHeaders.forEach((csvHeader, index) => {
          const fieldId = reverseMapping[csvHeader];
          if (fieldId) {
            rowData[fieldId] = (values[index] ?? "").trim();
          }
        });
        rows.push(rowData);
      }
      
      setImportColumnMapping(columnMapping);
      setImportPreviewRows(rows);
      setIsImportPreviewOpen(true);
      setIsColumnMappingOpen(false);
      return;
    }
    
    setDataLoading(true);
    setIsColumnMappingOpen(false);
    setIsImportPreviewOpen(false);
    
    try {
      // Debug: Show Firebase project info
      console.log("🔥 Firebase Project ID:", db.app.options.projectId);
      console.log("🔥 Firebase Auth Domain:", db.app.options.authDomain);
      
      // Refresh data first to ensure we have the latest data from Firebase
      console.log("🔄 Refreshing data before import...");
      const latestModuleData = await refreshCurrentModuleData();
      const importedData: DataRecord[] = [];
      console.log("✅ Data refreshed. Current records:", latestModuleData.length);
      
      const config = getModuleInfo(activeModule);
      const subcollectionName = config.subcollection || activeModule;
      
      console.log("📍 Active Module:", activeModule);
      console.log("📍 Subcollection Name:", subcollectionName);
      console.log("📍 Full Path: CMG-HR-Database/root/" + subcollectionName);
      
      // Create reverse mapping: CSV header -> field ID
      const reverseMapping: Record<string, string> = {};
      Object.entries(columnMapping).forEach(([fieldId, csvHeader]) => {
        if (csvHeader) {
          reverseMapping[csvHeader] = fieldId;
        }
      });
      
      console.log("🗺️ Column Mapping:", columnMapping);
      console.log("🔄 Reverse Mapping:", reverseMapping);
      console.log("📦 Subcollection:", subcollectionName);
      console.log("📊 Total rows to process:", csvRows.length);
      
      const primaryKeyField = getPrimaryKeyField() || currentSchema[0]?.id || "รหัสพนักงาน";
      
      let successCount = 0;
      let updateCount = 0;
      let skipCount = 0;
      let errorCount = 0;
      let skippedIds: any[] = [];
      let errorMessages: string[] = [];
      let currentMaxIdNum = 0;
      let visibleAfterRefreshCount = 0;

      // Find max ID before processing loop
      if (activeModule === "client_list" || activeModule === "contractors") {
        currentMaxIdNum = getMaxAutoIdNumber(activeModule, latestModuleData);
      }

      const dataStartIndex = Math.max(0, skipImportRows || 0);
      const indicesToProcess = selectedIndices.map(idx => idx + dataStartIndex);
      
      console.log(`🚀 Starting import of ${indicesToProcess.length} selected rows...`);
      setImportProgress({ current: 0, total: indicesToProcess.length });
      
      let processedRows = 0;
      for (const i of indicesToProcess) {
        processedRows++;
        setImportProgress({ current: processedRows, total: indicesToProcess.length });
        try {
          const values = csvRows[i];
          const docData: Record<string, unknown> = {};
          let hasActualData = false;

          // Map CSV values to schema fields using column mapping
          csvHeaders.forEach((csvHeader, index) => {
            const fieldId = reverseMapping[csvHeader];
            const raw = (values[index] ?? "").trim();
            
            if (fieldId && raw !== "") {
              // สถานะโครงการ: parse pipe-separated values → array
              if (fieldId === "สถานะโครงการ" && raw.includes("|")) {
                docData[fieldId] = raw.split("|").map((s) => s.trim()).filter(Boolean);
              } else if (fieldId === "สถานะโครงการ") {
                docData[fieldId] = [raw]; // single value → wrap as array
              } else {
                docData[fieldId] = raw;
              }
              
              // Verify if row actually has data
              if (fieldId !== "Customer_ID" && fieldId !== "con_id") {
                hasActualData = true;
              }
            }
          });

          // Prevent processing completely empty rows
          if (!hasActualData && Object.keys(docData).length === 0) {
            console.log(`⏭️ Row ${i}: Empty, skipping`);
            continue;
          }
          
          console.log(`📝 Row ${i}: Processing data:`, docData);

          if (config.filterField && config.filterValue) {
            docData[config.filterField] = Array.isArray(config.filterValue) ? config.filterValue[0] : config.filterValue;
            console.log(`🏷️ Added filter: ${config.filterField} = ${docData[config.filterField]}`);
          }

          // V18: Force Auto ID if it's missing OR empty
          if (activeModule === "client_list") {
            if (
              !docData["Customer_ID"] ||
              String(docData["Customer_ID"]).trim() === ""
            ) {
              currentMaxIdNum++;
              docData["Customer_ID"] = formatAutoId(activeModule, currentMaxIdNum);
            }
          } else if (activeModule === "contractors") {
            if (!docData["con_id"] || String(docData["con_id"]).trim() === "") {
              currentMaxIdNum++;
              docData["con_id"] = formatAutoId(activeModule, currentMaxIdNum);
            }
          }

          // Sub Contractor: ใช้ชื่อตัว+ชื่อสกุลเป็น unique key แทนรหัสพนักงาน
          if (activeModule === "emp_direct_sub") {
            const firstName = String(docData["ชื่อตัว"] || "").trim();
            const lastName = String(docData["ชื่อสกุล"] || "").trim();
            if (!firstName || !lastName) {
              console.log(`⏭️ Row ${i}: Missing name, skipping`);
              continue;
            }
            const fullName = `${firstName} ${lastName}`;
              const alreadyInDb = [...latestModuleData, ...importedData].some((item) => {
              const iFirst = String(item["ชื่อตัว"] || "").trim();
              const iLast = String(item["ชื่อสกุล"] || "").trim();
              return iFirst === firstName && iLast === lastName;
            });
            if (alreadyInDb) {
              skipCount++;
              skippedIds.push(fullName);
              console.log(`❌ Row ${i}: Duplicate name ${fullName}`);
            } else {
              const docId = `${firstName}_${lastName}`.replace(/[\/#${}\s]/g, "_");
              const docPath = `CMG-HR-Database/root/${subcollectionName}/${docId}`;
              console.log(`💾 Row ${i}: Writing to ${docPath}`);
              const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
              await setDoc(docRef, docData);
              const verifySnap = await getDoc(docRef);
              if (verifySnap.exists()) {
                importedData.push({ id: docId, ...docData } as DataRecord);
                successCount++;
                console.log(`✅ Row ${i}: Success!`);
              } else {
                errorCount++;
                errorMessages.push(`Row ${i}: Write succeeded but document not found`);
                console.error(`❌ Row ${i}: Write succeeded but document not found!`);
              }
            }
          } else if (docData[primaryKeyField]) {
            const rawId = docData[primaryKeyField];
            const docId = String(rawId).replace(/[\/\.\#\$\{\}]/g, "_");
            
            // สำหรับ Employee modules: เช็คจากรหัสพนักงานในข้อมูลที่มีอยู่แล้ว
            const isEmployeeModule = activeModule.startsWith("emp_") || activeModule === "employee_data";
            
            if (isEmployeeModule && docData["รหัสพนักงาน"]) {
              // เช็คว่ามีรหัสพนักงานนี้อยู่ในระบบแล้วหรือไม่
              const employeeId = String(docData["รหัสพนักงาน"] || "").trim();
              
              console.log(`👤 Row ${i}: Checking Employee ID: ${employeeId}`);
              
              if (!employeeId) {
                console.log(`⚠️ Row ${i}: No employee ID found, skipping`);
                continue;
              }
              
              // เช็คจาก Firebase โดยตรง แทนการเช็คจาก currentData
              // เพราะ currentData อาจถูก filter แล้ว ไม่ครบทั้งหมด
              const checkQuery = query(
                collection(db, "CMG-HR-Database", "root", subcollectionName),
                where("รหัสพนักงาน", "==", employeeId)
              );
              const checkSnapshot = await getDocs(checkQuery);
              const alreadyImported = importedData.some(
                (item) => String(item["รหัสพนักงาน"] || "").trim() === employeeId
              );
              const alreadyExists = !checkSnapshot.empty || alreadyImported;
              
              if (alreadyExists) {
                // UPDATE existing record instead of skipping
                let existingId: string | null = null;
                if (!checkSnapshot.empty) {
                  existingId = checkSnapshot.docs[0].id;
                } else {
                  const existingIndex = importedData.findIndex(
                    (item) => String(item["รหัสพนักงาน"] || "").trim() === employeeId
                  );
                  if (existingIndex >= 0) {
                    existingId = importedData[existingIndex].id;
                  }
                }

                if (existingId) {
                  try {
                    const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, existingId);
                    await setDoc(docRef, docData, { merge: true });
                    const existingIndex = importedData.findIndex(
                      (item) => String(item["รหัสพนักงาน"] || "").trim() === employeeId
                    );
                    if (existingIndex >= 0) {
                      importedData[existingIndex] = { id: existingId, ...docData } as DataRecord;
                    } else {
                      importedData.push({ id: existingId, ...docData } as DataRecord);
                    }
                    updateCount++;
                    console.log(`🔄 Row ${i}: Employee ${employeeId} updated`);
                  } catch (writeError) {
                    errorCount++;
                    errorMessages.push(`Row ${i}: ${(writeError as Error).message}`);
                    console.error(`❌ Row ${i}: Update error:`, writeError);
                  }
                } else {
                  skipCount++;
                  skippedIds.push(employeeId);
                  console.log(`❌ Row ${i}: Employee ID ${employeeId} already exists in Firebase`);
                }
              } else {
                const docPath = `CMG-HR-Database/root/${subcollectionName}/${docId}`;
                console.log(`💾 Row ${i}: Writing employee ${employeeId} to ${docPath}`);
                console.log(`📄 Document ID:`, docId);
                console.log(`📄 Data to write:`, JSON.stringify(docData, null, 2));
                
                try {
                  const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
                  await setDoc(docRef, docData);
                  
                  // Verify the write was successful
                  const verifySnap = await getDoc(docRef);
                  if (verifySnap.exists()) {
                    importedData.push({ id: docId, ...docData } as DataRecord);
                    successCount++;
                    console.log(`✅ Row ${i}: Employee ${employeeId} imported and verified!`);
                  } else {
                    errorCount++;
                    errorMessages.push(`Row ${i}: Write succeeded but document not found`);
                    console.error(`❌ Row ${i}: Write succeeded but document not found!`);
                  }
                } catch (writeError) {
                  errorCount++;
                  errorMessages.push(`Row ${i}: ${(writeError as Error).message}`);
                  console.error(`❌ Row ${i}: Write error:`, writeError);
                }
              }
            } else {
              // สำหรับ module อื่นๆ: เช็คจาก document ID ตามเดิม
              let finalDocId = docId;
              let finalRawId = rawId;
              let docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, finalDocId);
              let docSnap = await getDoc(docRef);
              const autoIdConfig = getAutoIdConfig(activeModule);
              if (autoIdConfig) {
                while (docSnap.exists()) {
                  currentMaxIdNum++;
                  finalDocId = formatAutoId(activeModule, currentMaxIdNum);
                  finalRawId = finalDocId;
                  docData[autoIdConfig.field] = finalDocId;
                  docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, finalDocId);
                  docSnap = await getDoc(docRef);
                }
              }

              if (docSnap.exists()) {
                skipCount++;
                skippedIds.push(finalRawId);
                console.log(`❌ Row ${i}: Document ${finalDocId} already exists`);
              } else {
                console.log(`💾 Row ${i}: Writing document ${finalDocId}`);
                await setDoc(docRef, docData);
                const verifySnap = await getDoc(docRef);
                if (verifySnap.exists()) {
                  importedData.push({ id: finalDocId, ...docData } as DataRecord);
                  successCount++;
                  console.log(`✅ Row ${i}: Document ${finalDocId} imported successfully!`);
                } else {
                  errorCount++;
                  errorMessages.push(`Row ${i}: Write succeeded but document not found`);
                  console.error(`❌ Row ${i}: Write succeeded but document not found!`);
                }
              }
            }
          } else {
            console.log(`⚠️ Row ${i}: No primary key field found, skipping`);
          }
        } catch (rowError) {
          errorCount++;
          const errorMsg = `Row ${i}: ${(rowError as Error).message}`;
          errorMessages.push(errorMsg);
          console.error(`❌ Error processing row ${i}:`, rowError);
        }
      }

      console.log(`\n📊 Import Summary:`);
      console.log(`✅ New: ${successCount}`);
      console.log(`🔄 Updated: ${updateCount}`);
      console.log(`⏭️ Skipped: ${skipCount}`);
      console.log(`❌ Errors: ${errorCount}`);
      
      await addLog(
        "Import CSV",
        `New ${successCount}, Updated ${updateCount}, Skipped ${skipCount}, Errors ${errorCount}`
      );
      
      // Always refresh data after import to show new records
      console.log("🔄 Refreshing data to show imported records...");
      if (successCount > 0 && searchQuery) {
        setSearchQuery("");
      }
      const refreshedItems = await refreshCurrentModuleData();
      const refreshedIds = new Set(refreshedItems.map((item) => item.id));
      visibleAfterRefreshCount = importedData.filter((item) => refreshedIds.has(item.id)).length;
      console.log("✅ Data refreshed!");
      
      let msg = `เพิ่มใหม่: ${successCount} รายการ\nอัปเดต: ${updateCount} รายการ\nข้าม (มีอยู่แล้ว): ${skipCount} รายการ`;
      if (errorCount > 0) {
        msg += `\nข้อผิดพลาด: ${errorCount} รายการ`;
      }
      if (successCount > 0) {
        msg += `\nแสดงในหน้าปัจจุบัน: ${visibleAfterRefreshCount}/${successCount} รายการ`;
      }
      if (successCount > 0 && visibleAfterRefreshCount < successCount) {
        msg += `\n\nมีบางรายการถูกบันทึกแล้วแต่ไม่เข้าเงื่อนไขหน้าปัจจุบัน กรุณาตรวจสอบประเภทข้อมูล/โมดูลที่เลือก และคอลัมน์ที่ใช้ Import`;
      }
      if (skipCount > 0)
        msg += `\n(ID ที่ข้าม: ${skippedIds.slice(0, 5).join(", ")}${
          skippedIds.length > 5 ? "..." : ""
        })`;
      if (errorCount > 0 && errorMessages.length > 0) {
        msg += `\n\nข้อผิดพลาด:\n${errorMessages.slice(0, 3).join("\n")}${
          errorMessages.length > 3 ? "\n..." : ""
        }`;
      }
      
      showNotification(
        errorCount > 0 || (successCount > 0 && visibleAfterRefreshCount === 0)
          ? "error"
          : skipCount > 0 && successCount === 0
            ? "info"
            : successCount > 0 && visibleAfterRefreshCount < successCount
              ? "info"
              : "success",
        "ผลการ Import",
        msg
      );
    } catch (error) {
      console.error("❌ Import Error:", error);
      showNotification("error", "Import ล้มเหลว", (error as Error).message);
    } finally {
      setDataLoading(false);
      setImportProgress(null);
      setPendingFile(null);
      setCsvHeaders([]);
      setCsvRows([]);
    }
  };

  // Handle column header sort - cycle through: null -> asc -> desc -> null
  const handleSort = (columnKey: string) => {
    setSortConfig((prev) => {
      if (prev.key !== columnKey) {
        // New column - start with ascending
        return { key: columnKey, direction: 'asc' };
      }
      
      // Same column - cycle through states
      if (prev.direction === null) {
        return { key: columnKey, direction: 'asc' };
      } else if (prev.direction === 'asc') {
        return { key: columnKey, direction: 'desc' };
      } else {
        // desc -> null (clear sort)
        return { key: '', direction: null };
      }
    });
  };

  const filteredData = useMemo(() => {
    let data = currentData;

    if (activeModule === "emp_direct_leader" && dcDailyGroupFilter !== "all") {
      data = data.filter((row) => {
        const workGroup = String(row["สถานะกลุ่มงาน"] || "").toLowerCase().trim();
        return dcDailyGroupFilter === "staff" ? workGroup === "staff" : workGroup === "worker";
      });
    }

    if (isEmployeeModule && employeeProjectFilter !== "all") {
      data = data.filter((row) => getEmployeeRowProjects(row).includes(employeeProjectFilter));
    }

    if (isEmployeeModule && employeeStatusFilter !== "all") {
      data = data.filter((row) => String(row["สถานะพนักงาน"] || "").trim() === employeeStatusFilter);
    }

    if (isEmployeeModule && employeeWorkGroupFilter !== "all") {
      data = data.filter((row) => String(row["สถานะกลุ่มงาน"] || "").trim() === employeeWorkGroupFilter);
    }

    if (isEmployeeModule && employeePositionFilter !== "all") {
      data = data.filter((row) => String(row["ตำแหน่ง"] || "").trim() === employeePositionFilter);
    }
    
    // Filter by search query
    if (searchQuery) {
      data = data.filter((row) =>
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }
    
    // Sort data
    if (sortConfig.key && sortConfig.direction) {
      data = [...data].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;
        
        // Convert to string for comparison
        const aStr = String(aVal);
        const bStr = String(bVal);
        
        // Try to parse as numbers
        const aNum = parseFloat(aStr);
        const bNum = parseFloat(bStr);
        
        // If both are valid numbers, compare as numbers
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // Otherwise compare as strings (with Thai locale support)
        const comparison = aStr.localeCompare(bStr, 'th', { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    
    return data;
  }, [activeModule, currentData, dcDailyGroupFilter, employeePositionFilter, employeeProjectFilter, employeeStatusFilter, employeeWorkGroupFilter, isEmployeeModule, searchQuery, sortConfig]);

  const employeeProjectOptions = useMemo(
    () =>
      Array.from(new Set(currentData.flatMap((row) => getEmployeeRowProjects(row))))
        .sort((a, b) => a.localeCompare(b, "th")),
    [currentData]
  );

  const employeeStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          currentData
            .map((row) => String(row["สถานะพนักงาน"] || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "th")),
    [currentData]
  );

  const employeeWorkGroupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          currentData
            .map((row) => String(row["สถานะกลุ่มงาน"] || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "th")),
    [currentData]
  );

  const employeePositionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          currentData
            .map((row) => String(row["ตำแหน่ง"] || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "th")),
    [currentData]
  );

  const dcDailySummary = useMemo(() => {
    if (activeModule !== "emp_direct_leader") {
      return { staff: 0, worker: 0 };
    }
    const scopedRows = currentData.filter((row) => {
      const projectOk = employeeProjectFilter === "all" || getEmployeeRowProjects(row).includes(employeeProjectFilter);
      const statusOk = employeeStatusFilter === "all" || String(row["สถานะพนักงาน"] || "").trim() === employeeStatusFilter;
      return projectOk && statusOk;
    });
    return scopedRows.reduce(
      (acc, row) => {
        const workGroup = String(row["สถานะกลุ่มงาน"] || "").toLowerCase().trim();
        if (workGroup === "staff") acc.staff += 1;
        if (workGroup === "worker") acc.worker += 1;
        return acc;
      },
      { staff: 0, worker: 0 }
    );
  }, [activeModule, currentData, employeeProjectFilter, employeeStatusFilter]);

  useEffect(() => {
    if (activeModule !== "emp_direct_leader") {
      setDcDailyGroupFilter("all");
    }
  }, [activeModule]);

  useEffect(() => {
    setEmployeeProjectFilter("all");
    setEmployeeStatusFilter("all");
    setEmployeeWorkGroupFilter("all");
    setEmployeePositionFilter("all");
  }, [activeModule]);

  const resetEmployeeFilters = () => {
    setSearchQuery("");
    setEmployeeProjectFilter("all");
    setEmployeeStatusFilter("all");
    setEmployeeWorkGroupFilter("all");
    setEmployeePositionFilter("all");
    setDcDailyGroupFilter("all");
  };

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) {
      const some = selectedIds.size > 0 && filteredData.length > 0;
      const all = filteredData.length > 0 && filteredData.every((r) => selectedIds.has(r.id));
      el.indeterminate = some && !all;
    }
  }, [selectedIds, filteredData]);

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 flex-col gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-600">กำลังเชื่อมต่อฐานข้อมูล...</p>
      </div>
    );

  // ยังไม่ได้เลือกเมนู - แสดงหน้าต้อนรับ (ไม่โหลด Firebase)
  if (!activeModule)
    return (
      <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
        <Sidebar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          dbConnected={dbConnected}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          isMobile={isMobile}
        />
        <main
          className="flex-1 flex flex-col items-center justify-center min-w-0 transition-[margin-left] duration-200 ease-in-out"
          style={{ marginLeft: isMobile ? 0 : sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
        >
          <div className="text-center p-12">
            <Database className="text-blue-200 mx-auto mb-6" size={72} />
            <h2 className="text-2xl font-bold text-gray-700 mb-2">CMG Master Database</h2>
            <p className="text-gray-400 text-sm">กรุณาเลือกเมนูจากแถบด้านซ้ายเพื่อเริ่มต้น</p>
          </div>
        </main>
      </div>
    );


  if (activeModule === "activity_logs")
    return (
      <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
        <Sidebar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          dbConnected={dbConnected}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          isMobile={isMobile}
        />
        <main
          className="flex-1 p-4 pt-16 sm:p-6 lg:p-8 lg:pt-8 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-in-out"
          style={{ marginLeft: isMobile ? 0 : sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
        >
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Activity className="text-orange-500" /> บันทึกกิจกรรม
              <InfoTooltip content="แสดงข้อมูลจาก activity_logs โดยเรียงตาม createdAt ล่าสุด และสรุปจากรายการที่ถูกดึงมาแสดง" />
            </h1>
          </header>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto overflow-y-hidden">
            {dataLoading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-gray-100 text-gray-600 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-0.5 border-b w-14 text-center">ลำดับ</th>
                    <th className="px-3 py-0.5 border-b">เวลา</th>
                    <th className="px-3 py-0.5 border-b">ผู้ใช้</th>
                    <th className="px-3 py-0.5 border-b">Module</th>
                    <th className="px-3 py-0.5 border-b">กิจกรรม</th>
                    <th className="px-3 py-0.5 border-b">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {logs.map((log, idx) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 py-0.5 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-0.5">{log.timestamp}</td>
                      <td className="px-3 py-0.5 font-medium">{log.user}</td>
                      <td className="px-3 py-0.5">
                        <span className="px-2 py-0.5 bg-slate-100 rounded border">
                          {log.module}
                        </span>
                      </td>
                      <td className="px-3 py-0.5 text-blue-600">{log.action}</td>
                      <td className="px-3 py-0.5 text-gray-500">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    );

  if (activeModule === "role_permissions")
    return (
      <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
        <Sidebar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          dbConnected={dbConnected}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          isMobile={isMobile}
        />
        <main
          className="flex-1 p-4 pt-16 sm:p-6 lg:p-8 lg:pt-8 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-in-out"
          style={{ marginLeft: isMobile ? 0 : sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
        >
          <RolePermissionSettings />
        </main>
      </div>
    );

  const config = getModuleInfo(activeModule);
  const moduleTooltipMap: Record<string, React.ReactNode> = {
    projects: "รายการโครงการหลักของระบบ ใช้เป็น master สำหรับการ assign พนักงานและการวิเคราะห์ใน dashboard",
    employee_data: "ข้อมูลพนักงานหลัก ใช้เป็นฐานคำนวณโครงสร้างกำลังคน เพศ อายุ อายุงาน และรายการเสี่ยง",
    emp_indirect: "ข้อมูลพนักงานกลุ่ม Staff Monthly ที่ใช้ทั้งการจัดการ master data และสรุปกำลังคน",
    emp_direct_leader: "ข้อมูลพนักงานกลุ่ม DC Daily ที่ใช้ทั้งการจัดการ master data และสรุปกำลังคน โดยสามารถกรองย่อยตามสถานะกลุ่มงานเป็น Staff หรือ Worker ได้",
    emp_direct_supply: "ข้อมูลพนักงานกลุ่ม Supply manpower ที่ใช้ทั้งการจัดการ master data และสรุปกำลังคน",
    emp_direct_sub: "ข้อมูลพนักงานกลุ่ม Sub contractor ที่ใช้ทั้งการจัดการ master data และสรุปกำลังคน",
    position_labor: "รายการตำแหน่งแรงงานที่ใช้เป็นข้อมูลอ้างอิงในพนักงานและสรุปตำแหน่งในโครงการ",
    users_data: "หน้ากำหนดสิทธิ์ผู้ใช้งาน อนุมัติผู้ใช้ และกำหนดโครงการที่เข้าถึง",
    attendance: "ข้อมูลลงเวลารายวัน ใช้เป็นฐานคำนวณอัตรามา ขาด ลา และความเสี่ยงหลายตัว",
    overtime: "ข้อมูล OT รายวัน ใช้สรุปชั่วโมง OT รายบุคคล รายโครงการ และภาระงาน",
    manpower_dashboard: "Dashboard สรุป KPI ฝั่ง HR และโครงการ โดยคำนวณจากช่วงวันที่ที่เลือก",
    risk_monitoring: "หน้าแสดงเฉพาะความเสี่ยงของพนักงานและโครงการ โดยใช้ risk score เดียวกับ dashboard",
    evaluation: "ประเมินผลพนักงานกลุ่ม Supply manpower / Sub contractor / DC Daily - Worker ตามเกณฑ์ 5 ด้าน (ถ่วงน้ำหนัก) รอบทดลองงาน 14 วันแรกและรายเดือน",
    activity_logs: "บันทึกกิจกรรมการเปลี่ยนแปลงข้อมูลในระบบ เรียงตามเวลาล่าสุด",
    day_off: "วันหยุดบริษัทที่ใช้เป็นฐานตัดวันทำงานในหน้าลงเวลาและหน้า OT",
  };
  const moduleTooltipContent =
    moduleTooltipMap[activeModule] ||
    `หน้าจัดการข้อมูล ${config.label} ใช้สำหรับเพิ่ม แก้ไข ค้นหา และส่งออกข้อมูลในโมดูลนี้`;

  const currentModuleHidden = hiddenColumnsMap[activeModule] || [];
  const visibleSchema = currentSchema.filter(
    (col) => !currentModuleHidden.includes(col.id)
  );

  // V18 Logic: Separate columns and prevent moving core IDs
  let tableColumns = [...visibleSchema];
  let fixedColumn: SchemaField | null = null;
  let draggableColumns = tableColumns;

  // Determine fixed column ID based on module
  let fixedColId: string | null = null;
  if (activeModule === "client_list") fixedColId = "Customer_ID";
  if (activeModule === "contractors") fixedColId = "con_id";

  if (fixedColId) {
    const fixedIndex = tableColumns.findIndex((col) => col.id === fixedColId);
    if (fixedIndex !== -1) {
      fixedColumn = tableColumns[fixedIndex];
      draggableColumns = tableColumns.filter((col) => col.id !== fixedColId);
    }
  }

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
      <Sidebar
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        dbConnected={dbConnected}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
          isMobile={isMobile}
      />
      <main
        className="flex-1 flex flex-col px-3 pt-14 pb-3 sm:px-4 lg:px-6 lg:pt-4 lg:pb-4 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-in-out h-screen"
        style={{ marginLeft: isMobile ? 0 : sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
      >
        <header className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <h1 className="text-base font-bold text-gray-800 whitespace-nowrap flex items-center gap-2 shrink-0">
            {activeModule === 'users_data' 
              ? 'จัดการสิทธิ์ผู้ใช้งาน' 
              : activeModule === 'attendance' 
                ? 'ลงเวลาการมาทำงาน' 
                : activeModule === 'overtime'
                  ? 'ลง Overtime'
                  : activeModule === 'manpower_dashboard'
                    ? 'Manpower Dashboard'
                    : activeModule === 'risk_monitoring'
                      ? 'Risk Monitoring'
                    : activeModule === 'evaluation'
                      ? 'ประเมินผลพนักงาน'
                    : activeModule === 'activity_logs'
                      ? 'บันทึกกิจกรรมระบบ (Activity Logs)'
                      : config.label}
            <InfoTooltip content={moduleTooltipContent} iconSize={14} />
          </h1>
          {activeModule === "emp_direct_leader" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                Staff <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-blue-900">{dcDailySummary.staff}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                Worker <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] text-amber-900">{dcDailySummary.worker}</span>
              </span>
            </div>
          )}
          
          {activeModule !== 'attendance' && activeModule !== 'overtime' && activeModule !== 'manpower_dashboard' && activeModule !== 'risk_monitoring' && activeModule !== 'evaluation' && activeModule !== 'activity_logs' && (
            <>
              <div className="w-px h-5 bg-gray-200 shrink-0" />

              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="ค้นหา..."
                  className="w-full pl-10 pr-4 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {isEmployeeModule && (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
                    <span className="font-semibold whitespace-nowrap">โครงการ</span>
                    <select
                      value={employeeProjectFilter}
                      onChange={(e) => setEmployeeProjectFilter(e.target.value)}
                      className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="all">ทั้งหมด</option>
                      {employeeProjectOptions.map((project) => (
                        <option key={project} value={project}>
                          {project}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
                    <span className="font-semibold whitespace-nowrap">สถานะพนักงาน</span>
                    <select
                      value={employeeStatusFilter}
                      onChange={(e) => setEmployeeStatusFilter(e.target.value)}
                      className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      <option value="all">ทั้งหมด</option>
                      {employeeStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900">
                    <span className="font-semibold whitespace-nowrap">ตำแหน่ง</span>
                    <select
                      value={employeePositionFilter}
                      onChange={(e) => setEmployeePositionFilter(e.target.value)}
                      className="rounded border border-violet-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="all">ทั้งหมด</option>
                      {employeePositionOptions.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activeModule !== "emp_direct_leader" && (
                    <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900">
                      <span className="font-semibold whitespace-nowrap">สถานะกลุ่มงาน</span>
                      <select
                        value={employeeWorkGroupFilter}
                        onChange={(e) => setEmployeeWorkGroupFilter(e.target.value)}
                        className="rounded border border-sky-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        <option value="all">ทั้งหมด</option>
                        {employeeWorkGroupOptions.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              {activeModule === "emp_direct_leader" && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800">
                  <span className="font-semibold whitespace-nowrap">DC Daily:</span>
                  <select
                    value={dcDailyGroupFilter}
                    onChange={(e) => setDcDailyGroupFilter(e.target.value as "all" | "staff" | "worker")}
                    className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="staff">Staff</option>
                    <option value="worker">Worker</option>
                  </select>
                </div>
              )}
              {isEmployeeModule && (
                <button
                  type="button"
                  onClick={resetEmployeeFilters}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  ล้าง filter ทั้งหมด
                </button>
              )}
              <div className="flex gap-2 text-sm items-center flex-wrap">
                <div className="relative">
                  <button
                    onClick={() => setIsColVisOpen(!isColVisOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 text-xs"
                  >
                    <Columns size={16} /> เลือกคอลัมน์
                  </button>
                  {isColVisOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsColVisOpen(false)}
                      ></div>
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto p-2">
                        <div className="text-xs font-semibold text-gray-500 px-2 py-1 mb-1">
                          แสดง/ซ่อน คอลัมน์
                        </div>
                        {currentSchema.map((col) => {
                          // V18: Prevent hiding the core IDs
                          const isFixed =
                            (activeModule === "client_list" &&
                              col.id === "Customer_ID") ||
                            (activeModule === "contractors" && col.id === "con_id");
                          if (isFixed) return null;

                          return (
                            <div
                              key={col.id}
                              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                              onClick={() => toggleColumnVisibility(col.id)}
                            >
                              <div
                                className={`w-4 h-4 flex items-center justify-center rounded border ${
                                  currentModuleHidden.includes(col.id)
                                    ? "border-gray-300"
                                    : "bg-blue-500 border-blue-500"
                                }`}
                              >
                                {!currentModuleHidden.includes(col.id) && (
                                  <Check size={12} className="text-white" />
                                )}
                              </div>
                              <span
                                className={`text-sm ${
                                  currentModuleHidden.includes(col.id)
                                    ? "text-gray-400"
                                    : "text-gray-700"
                                }`}
                              >
                                {col.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={async () => {
                    setDataLoading(true);
                    await refreshCurrentModuleData();
                    setDataLoading(false);
                  }}
                  disabled={dataLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  title="รีเฟรชข้อมูล"
                >
                  <RefreshCw size={16} className={dataLoading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 text-xs"
                >
                  <Download size={16} /> Export
                </button>
                <div className="relative group">
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 text-xs"
                  >
                    <FileText size={16} /> Template
                  </button>
                  <div className="absolute left-0 top-full mt-1 w-72 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
                    ไฟล์เป็น UTF-8 BOM ถ้าเปิดใน Excel แล้วตัวหนังสือเป็น ??? ให้ใช้: ข้อมูล → จากไฟล์ข้อความ/CSV → เลือกไฟล์ → ตั้ง Encoding เป็น Unicode (UTF-8) แล้วบันทึกเป็น CSV UTF-8
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500 whitespace-nowrap" title="ข้าม N แถวข้อมูลหลังหัวตาราง (เช่น 5 = นำเข้าเฉพาะแถวที่ 6 เป็นต้นไป)">
                    ข้ามแถวแรก:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={skipImportRows}
                    onChange={(e) => setSkipImportRows(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-14 px-2 py-1 border rounded text-sm text-center"
                    title="จำนวนแถวข้อมูลที่ข้าม (หลังหัวตาราง)"
                  />
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 cursor-pointer bg-blue-50 text-blue-700 font-medium text-xs">
                    <Upload size={16} /> Import{" "}
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv"
                      onChange={handleImportCSV}
                    />
                  </label>
                </div>
                {selectedIds.size > 0 && canDelete && (
                  <>
                    <span className="text-sm text-gray-500">เลือกแล้ว {selectedIds.size} รายการ</span>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-white bg-red-600 hover:bg-red-700 rounded border border-red-700 text-xs font-medium"
                    >
                      <Trash2 size={16} /> ลบที่เลือก
                    </button>
                  </>
                )}
                <div className="w-px h-5 bg-gray-200 shrink-0" />
                <button
                  onClick={() => setIsSchemaModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-xs font-medium whitespace-nowrap shrink-0"
                >
                  <Settings size={14} /> ตั้งค่าคอลัมน์
                </button>
                {canAdd && (
                  <button
                    onClick={() => {
                        if (activeModule === "projects") {
                          openProjectEditor(null);
                        } else {
                      setEditingItem(null);
                      setFormData({});
                      setIsAddModalOpen(true);
                        }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    <Plus size={14} /> {activeModule === "position_labor" ? "Add Position" : "เพิ่มรายการ"}
                  </button>
                )}
              </div>
            </>
          )}
          
          <div className="ml-auto flex items-center gap-4 border-l pl-4">
            <button onClick={logout} className="text-xs font-semibold text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors">
              ออกจากระบบ
            </button>
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-gray-800">{userProfile?.firstName}</p>
                <p className="text-[10px] text-gray-500">{userProfile?.role?.[0]}</p>
              </div>
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                  {userProfile?.firstName?.charAt(0) || "U"}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`relative flex-1 min-h-0 flex flex-col ${activeModule === 'manpower_dashboard' ? '' : 'bg-white rounded-xl shadow-sm border border-gray-200'}`} style={{ maxWidth: "100%" }}>
          <div
            ref={tableScrollRef}
            className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
            style={{ scrollbarWidth: "thin" }}
            onScroll={syncRailScrollFromTable}
          >
            {activeModule === 'manpower_dashboard' ? (
              <div className="p-0">
                <ManpowerDashboard projectOptions={projectStatusOptions} />
              </div>
            ) : activeModule === 'risk_monitoring' ? (
              <RiskMonitoringPage projectOptions={projectStatusOptions} />
            ) : activeModule === 'evaluation' ? (
              <EvaluationPage projectOptions={projectStatusOptions} />
            ) : activeModule === 'attendance' ? (
              <div className="p-6">
                <AttendancePage projectOptions={projectStatusOptions} />
              </div>
            ) : activeModule === 'overtime' ? (
              <div className="p-6">
                <OvertimePage projectOptions={projectStatusOptions} />
              </div>
            ) : activeModule === 'day_off' ? (
              <DayOffPage />
            ) : activeModule === 'users_data' ? (
              <UserManagement projectOptions={projectStatusOptions} />
            ) : activeModule === 'activity_logs' ? (
              <ActivityLogPage />
            ) : dataLoading ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 gap-3">
                <Loader2 className="animate-spin text-blue-500" size={32} />
                <p>{importProgress ? "กำลังนำเข้าข้อมูล..." : "กำลังประมวลผล..."}</p>
                {importProgress && (
                  <div className="w-64 mt-2">
                    <div className="flex justify-between text-xs mb-1 font-medium text-gray-500">
                      <span>{importProgress.current} / {importProgress.total}</span>
                      <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${Math.max(0, Math.min(100, (importProgress.current / importProgress.total) * 100))}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeModule === "projects" ? (
              <div className="p-6 h-full overflow-y-auto">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {filteredData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] border-collapse">
                        <thead className="bg-slate-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">โครงการ</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ชื่อโครงการ</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ระยะสัญญา</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Project Manager</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Construction Manager</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.map((row) => {
                            const projectNo = String(row.project_no || row.id);
                            const projectName = String(row.project_name || "-");
                            const startDate = String(row.start_date || "").trim();
                            const endDate = String(row.end_date || "").trim();
                            const projectPeriod = startDate && endDate
                              ? `${startDate} - ${endDate}`
                              : startDate || endDate || "-";
                            const projectManager = String(row.project_manager || "-");
                            const constructionManager = String(row.construction_manager || "-");

                            return (
                              <tr key={row.id} className="border-b border-gray-100 last:border-b-0 hover:bg-slate-50/70">
                                <td className="px-4 py-3 align-top">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                      <Briefcase size={18} />
                      </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-gray-900 truncate" title={projectNo}>{projectNo}</div>
                                      <div className="text-xs text-gray-500">{formatProjectNo(projectNo)}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="font-medium text-gray-800 break-words">{projectName}</div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-xs font-medium">
                                    {projectPeriod}
                        </span>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="text-sm text-gray-700 break-words">{projectManager}</div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="text-sm text-gray-700 break-words">{constructionManager}</div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => { openProjectEditor(row); }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100"
                                    >
                                      <Edit size={14} />
                                      แก้ไข
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(row.id)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
                                    >
                                      <Trash2 size={14} />
                                      ลบ
                                    </button>
                      </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                ) : (
                    <div className="p-12 text-center text-gray-400">ยังไม่มีข้อมูลโครงการ</div>
                )}
                </div>
              </div>
            ) : (
              <table ref={tableElementRef} className="w-full text-left border-collapse min-w-max">
                <thead ref={theadRef} className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-0.5 w-10 bg-gray-50 border-r border-gray-200 sticky left-0 z-10">
                    <input
                      type="checkbox"
                      ref={selectAllCheckboxRef}
                      checked={filteredData.length > 0 && filteredData.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="เลือกทั้งหมด"
                    />
                  </th>
                  <th className="px-3 py-0.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 text-center bg-gray-50 border-r border-gray-200 sticky left-0 z-10">ลำดับ</th>
                  {/* จัดการ — ย้ายมาอยู่คอลัมน์แรก */}
                  <th className="px-3 py-0.5 text-center text-xs font-semibold text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                    จัดการ
                  </th>
                  {/* V18: Fixed Column Header (No Drag, No Delete Button) */}
                  {fixedColumn && (
                    <th 
                      className="px-3 py-0.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-100 border-r border-gray-200 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() => handleSort(fixedColumn!.id)}
                    >
                      <div className="flex items-center gap-2">
                        {fixedColumn.label}
                        {sortConfig.key === fixedColumn.id && (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp size={14} className="text-blue-600" />
                          ) : sortConfig.direction === 'desc' ? (
                            <ArrowDown size={14} className="text-blue-600" />
                          ) : null
                        )}
                        {sortConfig.key !== fixedColumn.id && (
                          <ArrowUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                  )}
                  {/* Draggable Columns */}
                  {draggableColumns.map((col, index) => {
                    const statusColor = STATUS_COLORS[col.id];
                    return (
                      <th
                        key={col.id}
                        className={`px-3 py-0.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap group ${
                          statusColor
                            ? `${statusColor.header} hover:brightness-95`
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical
                            size={14}
                            className="text-current opacity-40 group-hover:opacity-70 cursor-move"
                          />
                          <span 
                            className="cursor-pointer select-none flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSort(col.id);
                            }}
                          >
                            {col.label}
                            {sortConfig.key === col.id && (
                              sortConfig.direction === 'asc' ? (
                                <ArrowUp size={14} className="inline ml-1 text-blue-600" />
                              ) : sortConfig.direction === 'desc' ? (
                                <ArrowDown size={14} className="inline ml-1 text-blue-600" />
                              ) : null
                            )}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteColumn(index, col.label, col.id);
                            }}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                <tr aria-hidden="true">
                  <td colSpan={visibleSchema.length + 3} className="p-0 border-0 align-top" style={{ height: 20, lineHeight: 0 }} />
                </tr>
                {filteredData.length > 0 ? (
                  filteredData.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className={`hover:bg-blue-50/50 group ${selectedIds.has(row.id) ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-2 py-0.5 bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-0.5 text-center text-gray-500 font-medium bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {idx + 1}
                      </td>
                      {/* จัดการ — ย้ายมาอยู่คอลัมน์แรก */}
                      <td className="px-3 py-0.5 border-r border-gray-100">
                        <div className="flex justify-center gap-1 opacity-80 group-hover:opacity-100">
                          {canEdit && (
                            <button
                              onClick={() => {
                                if (activeModule === "projects") {
                                  openProjectEditor(row);
                                } else {
                                setEditingItem(row);
                                setFormData(row);
                                setIsAddModalOpen(true);
                                }
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="แก้ไข"
                            >
                              <Edit size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteItem(row.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                              title="ลบ"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {!canEdit && !canDelete && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      {/* Fixed Cell */}
                      {fixedColumn && (
                        <td className="px-3 py-0.5 text-gray-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis font-bold bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          {String(row[fixedColumn.id] || "-")}
                        </td>
                      )}
                      {/* Draggable Cells */}
                      {draggableColumns.map((col) => {
                        const statusColor = STATUS_COLORS[col.id];
                        // สถานะโครงการ อาจเป็น array
                        const rawVal = row[col.id];
                        const isMultiProject = col.id === "สถานะโครงการ" && Array.isArray(rawVal);
                        let cellVal: string;
                        if (isMultiProject) {
                          cellVal = (rawVal as string[]).map(formatProjectNo).join(", ");
                        } else if (col.id === "สถานะโครงการ" && rawVal) {
                          cellVal = formatProjectNo(String(rawVal));
                        } else {
                          cellVal = String(rawVal || "-");
                        }
                        return (
                          <td
                            key={col.id}
                            className={`px-3 py-0.5 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis ${
                              statusColor ? statusColor.cell : "text-gray-700"
                            }`}
                          >
                            {statusColor && cellVal !== "-" ? (
                              isMultiProject ? (
                                <span className="flex flex-wrap gap-1">
                                  {(rawVal as string[]).map((v) => (
                                    <span 
                                      key={v} 
                                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getProjectBadgeColor(formatProjectNo(v))}`} 
                                      title={v}
                                    >
                                      {formatProjectNo(v)}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span 
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    col.id === "สถานะพนักงาน" 
                                      ? getEmployeeStatusBadgeColor(cellVal)
                                      : col.id === "สถานะกลุ่มงาน"
                                        ? getWorkGroupBadgeColor(cellVal)
                                        : col.id === "สถานะโครงการ"
                                          ? getProjectBadgeColor(cellVal)
                                          : statusColor.badge
                                  }`} 
                                  title={String(rawVal)}
                                >
                                  {cellVal}
                                </span>
                              )
                            ) : cellVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={visibleSchema.length + 3}
                      className="p-12 text-center text-gray-400"
                    >
                      ยังไม่มีข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          </div>
          {!dataLoading && activeModule !== "projects" && tableScrollWidth > 0 && (
            <div
              ref={scrollbarRailRef}
              className="absolute left-0 right-0 overflow-x-scroll overflow-y-hidden bg-gray-100 border-b border-gray-200 z-10 scrollbar-rail-horizontal"
              style={{
                top: headerHeight,
                height: 20,
                minHeight: 20,
                scrollbarWidth: "thin",
              }}
              onScroll={syncTableScrollFromRail}
            >
            <div style={{ width: tableScrollWidth, height: 1, minWidth: "100%" }} />
            </div>
          )}
        </div>
      </main>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setProjectFormTab("general");
        }}
        title={editingItem ? "แก้ไขข้อมูล" : activeModule === "position_labor" ? "เพิ่ม Position" : "เพิ่มข้อมูลใหม่"}
        footer={
          <>
            <button
              onClick={() => {
                setIsAddModalOpen(false);
                setProjectFormTab("general");
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSaveItem}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save size={18} /> บันทึก
            </button>
          </>
        }
      >
        {/* Separate status fields from normal fields */}
        {(() => {
          const isProjectModule = activeModule === "projects";
          const projectSpecialFieldIds = new Set(["required_manpower", "required_role_plan"]);
          const normalFields = currentSchema.filter(
            (f) => !STATUS_FIELD_IDS.includes(f.id) && (!isProjectModule || !projectSpecialFieldIds.has(f.id))
          );
          const statusFields = currentSchema.filter((f) =>
            STATUS_FIELD_IDS.includes(f.id)
          );
          const requiredManpowerField = currentSchema.find((f) => f.id === "required_manpower");
          const baselineRows = normalizeProjectRolePlanBaseline(formData["required_role_plan_baseline"], formData["required_role_plan"]);
          const adjustmentRows = normalizeProjectRolePlanAdjustments(formData["required_role_plan_adjustments"]);

          const empStatusField = statusFields.find((f) => f.id === "สถานะพนักงาน");
          const grpStatusField = statusFields.find((f) => f.id === "สถานะกลุ่มงาน");
          const projStatusField = statusFields.find((f) => f.id === "สถานะโครงการ");

          return (
            <div className="space-y-6">
              {isProjectModule && (
                <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                  <button
                    type="button"
                    onClick={() => setProjectFormTab("general")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${projectFormTab === "general" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    ข้อมูลทั่วไป
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectFormTab("plan")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${projectFormTab === "plan" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    แผนกำลังคน
                  </button>
                </div>
              )}

              {(!isProjectModule || projectFormTab === "general") && (
                <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalFields.map((field) => {
                  const isClientAuto =
                    activeModule === "client_list" && field.id === "Customer_ID";
                  const isContractorAuto =
                    activeModule === "contractors" && field.id === "con_id";
                  if ((isClientAuto || isContractorAuto) && !editingItem) return null;
                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        {field.label}
                      </label>
                      <DynamicInput
                        field={field}
                        value={(formData[field.id] as string | boolean) ?? ""}
                        onChange={(val) => setFormData({ ...formData, [field.id]: val })}
                        disabled={isClientAuto || isContractorAuto}
                      />
                    </div>
                  );
                })}
              </div>

              {statusFields.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3">
                    {empStatusField && (
                      <div className="p-4 bg-rose-50/70 border-r border-rose-100 space-y-1">
                        <label className="text-sm font-semibold text-rose-700 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                          {empStatusField.label}
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-rose-200 rounded-md focus:ring-2 focus:ring-rose-400 focus:border-transparent outline-none transition-all text-sm bg-white text-rose-800"
                          value={(formData[empStatusField.id] as string) ?? ""}
                          onChange={(e) => setFormData({ ...formData, [empStatusField.id]: e.target.value })}
                        >
                          <option value="">-- กรุณาเลือก --</option>
                          {empStatusField.options?.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {grpStatusField && (
                      <div className="p-4 bg-sky-50/70 border-r border-sky-100 space-y-1">
                        <label className="text-sm font-semibold text-sky-700 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
                          {grpStatusField.label}
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-sky-200 rounded-md focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none transition-all text-sm bg-white text-sky-800"
                          value={(formData[grpStatusField.id] as string) ?? ""}
                          onChange={(e) => setFormData({ ...formData, [grpStatusField.id]: e.target.value })}
                        >
                          <option value="">-- กรุณาเลือก --</option>
                          {grpStatusField.options?.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {projStatusField && (
                      <div className="p-4 bg-emerald-50/70 space-y-2">
                        <label className="text-sm font-semibold text-emerald-700 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                          {projStatusField.label}
                          <span className="text-xs font-normal text-emerald-500 ml-1">(เลือกได้หลายโครงการ)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {projectStatusOptions.map((opt) => {
                            const selected: string[] = Array.isArray(formData[projStatusField.id])
                              ? (formData[projStatusField.id] as string[])
                              : formData[projStatusField.id]
                                ? [String(formData[projStatusField.id])]
                                : [];
                            const isChecked = selected.includes(opt);
                            const toggle = () => {
                              const next = isChecked
                                ? selected.filter((s) => s !== opt)
                                : [...selected, opt];
                              setFormData({ ...formData, [projStatusField.id]: next });
                            };
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={toggle}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                  isChecked
                                    ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                                    : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                }`}
                                    title={opt}
                              >
                                {isChecked && <Check size={11} />}
                                {formatProjectNo(opt)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {isProjectModule && projectFormTab === "plan" && (
                <div className="space-y-6">
                  {requiredManpowerField && (
                    <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                      <label className="text-sm font-semibold text-slate-700">{requiredManpowerField.label}</label>
                      <DynamicInput
                        field={requiredManpowerField}
                        value={(formData[requiredManpowerField.id] as string | boolean) ?? ""}
                        onChange={(val) => setFormData({ ...formData, [requiredManpowerField.id]: val })}
                      />
                      <p className="text-xs text-slate-500">ใช้สำหรับ Coverage รวมของโครงการ ถ้าไม่กรอก ระบบจะอิงผลรวม role plan รายวันหรือ assigned headcount ตามลำดับ</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">แผนตั้งต้นรายตำแหน่ง</h4>
                        <p className="text-xs text-slate-500">ใช้เป็น baseline ก่อนมีการปรับเพิ่มหรือลดระหว่างงาน</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            required_role_plan_baseline: [
                              ...normalizeProjectRolePlanBaseline(prev["required_role_plan_baseline"], prev["required_role_plan"]),
                              { id: createLocalId(), position: "", required: 1 },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Plus size={14} /> เพิ่มตำแหน่ง
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {baselineRows.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">ยังไม่มีแผนตั้งต้นรายตำแหน่ง</div>
                      ) : baselineRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_48px]">
                          <select
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            value={row.position}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                required_role_plan_baseline: normalizeProjectRolePlanBaseline(prev["required_role_plan_baseline"], prev["required_role_plan"]).map((item) =>
                                  item.id === row.id ? { ...item, position: e.target.value } : item
                                ),
                              }))
                            }
                          >
                            <option value="">-- เลือกตำแหน่ง --</option>
                            {positionOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            value={row.required}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                required_role_plan_baseline: normalizeProjectRolePlanBaseline(prev["required_role_plan_baseline"], prev["required_role_plan"]).map((item) =>
                                  item.id === row.id ? { ...item, required: Math.max(Number(e.target.value || 0), 0) } : item
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                required_role_plan_baseline: normalizeProjectRolePlanBaseline(prev["required_role_plan_baseline"], prev["required_role_plan"]).filter((item) => item.id !== row.id),
                              }))
                            }
                            className="rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} className="mx-auto" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">การปรับเพิ่ม/ลดระหว่างงาน</h4>
                        <p className="text-xs text-slate-500">ใช้บันทึกช่วงเวลาที่ต้องเพิ่มหรือลดกำลังคนจากแผนตั้งต้น</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            required_role_plan_adjustments: [
                              ...normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]),
                              { id: createLocalId(), start_date: "", end_date: "", note: "", rows: [{ id: createLocalId(), position: "", delta: 1 }] },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <Plus size={14} /> เพิ่มช่วงปรับแผน
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      {adjustmentRows.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">ยังไม่มีรายการปรับแผน</div>
                      ) : adjustmentRows.map((adjustment) => (
                        <div key={adjustment.id} className="rounded-xl border border-slate-200 p-4 space-y-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-600">วันที่เริ่มมีผล</label>
                              <input
                                type="date"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                value={adjustment.start_date}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                      item.id === adjustment.id ? { ...item, start_date: e.target.value } : item
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-600">วันที่สิ้นสุด</label>
                              <input
                                type="date"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                value={adjustment.end_date}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                      item.id === adjustment.id ? { ...item, end_date: e.target.value } : item
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-600">หมายเหตุ</label>
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                value={adjustment.note || ""}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                      item.id === adjustment.id ? { ...item, note: e.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="เช่น เร่งงานฐานราก / ลดกำลังคนช่วง close project"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            {adjustment.rows.map((detail) => (
                              <div key={detail.id} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_48px]">
                                <select
                                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                  value={detail.position}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                        item.id === adjustment.id
                                          ? {
                                              ...item,
                                              rows: item.rows.map((row) =>
                                                row.id === detail.id ? { ...row, position: e.target.value } : row
                                              ),
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                >
                                  <option value="">-- เลือกตำแหน่ง --</option>
                                  {positionOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                  value={detail.delta}
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                        item.id === adjustment.id
                                          ? {
                                              ...item,
                                              rows: item.rows.map((row) =>
                                                row.id === detail.id ? { ...row, delta: Number(e.target.value || 0) } : row
                                              ),
                                            }
                                          : item
                                      ),
                                    }))
                                  }
                                  placeholder="+/- จำนวน"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                        item.id === adjustment.id
                                          ? { ...item, rows: item.rows.filter((row) => row.id !== detail.id) }
                                          : item
                                      ),
                                    }))
                                  }
                                  className="rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={14} className="mx-auto" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).map((item) =>
                                    item.id === adjustment.id
                                      ? { ...item, rows: [...item.rows, { id: createLocalId(), position: "", delta: 1 }] }
                                      : item
                                  ),
                                }))
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              <Plus size={13} /> เพิ่มตำแหน่งในช่วงนี้
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  required_role_plan_adjustments: normalizeProjectRolePlanAdjustments(prev["required_role_plan_adjustments"]).filter((item) => item.id !== adjustment.id),
                                }))
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              <Trash2 size={13} /> ลบช่วงปรับแผนนี้
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={isSchemaModalOpen}
        onClose={() => {
          setIsSchemaModalOpen(false);
          setSelectedColumnIdsForDelete(new Set());
        }}
        title="ตั้งค่าคอลัมน์"
        footer={
          <>
            <button
              onClick={() => {
                setIsSchemaModalOpen(false);
                setSelectedColumnIdsForDelete(new Set());
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              ปิด
            </button>
            {selectedColumnIdsForDelete.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelectedColumns}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 size={18} /> ลบที่เลือก ({selectedColumnIdsForDelete.size})
              </button>
            )}
            <button
              onClick={handleAddColumn}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus size={18} /> เพิ่มคอลัมน์
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-yellow-800 text-sm mb-4">
            <p>
              ⚠️ กำลังแก้ไขโครงสร้างของ Collection:{" "}
              <strong>{config.collection}</strong>
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <p className="text-sm font-medium text-gray-700 mb-2">เลือกคอลัมน์ที่ต้องการลบ</p>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {currentSchema.map((col) => {
                const protectedCol = isColumnProtected(col.id);
                return (
                  <label
                    key={col.id}
                    className={`flex items-center gap-2 py-2 px-2 rounded cursor-pointer ${
                      protectedCol ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedColumnIdsForDelete.has(col.id)}
                      onChange={() => toggleSelectColumnForDelete(col.id)}
                      disabled={protectedCol}
                      className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">{col.label}</span>
                    {protectedCol && (
                      <span className="text-xs text-gray-500">(ไม่สามารถลบได้)</span>
                    )}
                  </label>
                );
              })}
            </div>
            {selectedColumnIdsForDelete.size > 0 && (
              <p className="text-xs text-gray-500 mt-2">เลือกแล้ว {selectedColumnIdsForDelete.size} คอลัมน์</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อคอลัมน์
            </label>
            <input
              type="text"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="เช่น เบอร์โทรศัพท์"
              value={newColumn.label}
              onChange={(e) =>
                setNewColumn({ ...newColumn, label: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ประเภทข้อมูล
            </label>
            <select
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              value={newColumn.type}
              onChange={(e) =>
                setNewColumn({ ...newColumn, type: e.target.value })
              }
            >
              <option value="text">ข้อความ</option>
              <option value="textarea">ข้อความหลายบรรทัด</option>
              <option value="number">ตัวเลข</option>
              <option value="date">วันที่</option>
              <option value="select">ตัวเลือก (Dropdown)</option>
              <option value="boolean">Checkbox</option>
            </select>
          </div>
          {newColumn.type === "select" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ตัวเลือก (คั่นด้วยจุลภาค)
              </label>
              <input
                type="text"
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="เช่น A, B, C"
                value={newColumn.options}
                onChange={(e) =>
                  setNewColumn({ ...newColumn, options: e.target.value })
                }
              />
            </div>
          )}
        </div>
      </Modal>

      <NotificationModal
        isOpen={notification.isOpen}
        onClose={closeNotification}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmation.onConfirm}
        title={confirmation.title}
        message={confirmation.message}
      />
      <ColumnMappingModal
        isOpen={isColumnMappingOpen}
        onClose={() => {
          setIsColumnMappingOpen(false);
          setPendingFile(null);
          setCsvHeaders([]);
          setCsvRows([]);
        }}
        onConfirm={handleConfirmMapping}
        csvHeaders={csvHeaders}
        schemaFields={currentSchema}
      />
      <ImportPreviewModal
        isOpen={isImportPreviewOpen}
        onClose={() => {
          setIsImportPreviewOpen(false);
          setPendingFile(null);
          setCsvHeaders([]);
          setCsvRows([]);
        }}
        onConfirm={(selected) => handleConfirmMapping(importColumnMapping, selected)}
        rows={importPreviewRows}
        schemaFields={currentSchema}
      />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pending" element={
        <ProtectedRoute requireApproved={false}>
          <PendingApprovalPage />
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <>
            <WhatsNewModal />
            <MasterDatabaseApp />
          </>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

