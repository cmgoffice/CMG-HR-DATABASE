import React, { useState, useEffect, useMemo, useRef } from "react";
import type { User } from "firebase/auth";
import type { CollectionReference, Query, DocumentData } from "firebase/firestore";

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
  filterValue?: string;
  schemaSource?: string; // อ้างอิง moduleId อื่นเพื่อใช้ schema ร่วมกัน
}
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
  ArrowLeft,
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
} from "lucide-react";

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
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
    label: "Employee Indirect",
    filterField: "employee_type",
    filterValue: "Indirect",
  },
  emp_direct_leader: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Direct - Team Leader",
    filterField: "employee_type",
    filterValue: "Direct_TeamLeader",
  },
  emp_direct_supply: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Direct - Supply DC",
    filterField: "employee_type",
    filterValue: "Direct_SupplyDC",
    schemaSource: "emp_direct_leader", // ใช้ schema เดียวกับ Team Leader
  },
  emp_direct_sub: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Direct - Sub Contractor",
    filterField: "employee_type",
    filterValue: "Direct_SubContractor",
    schemaSource: "emp_direct_leader", // ใช้ schema เดียวกับ Team Leader
  },
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
    { id: "ตำแหน่ง", label: "ตำแหน่ง", type: "text" },
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
const SIDEBAR_WIDTH = 256;   // w-64
const SIDEBAR_COLLAPSED_WIDTH = 64; // w-16

// --- COMPONENTS ---

const Sidebar = ({ activeModule, setActiveModule, user, dbConnected, sidebarOpen, onToggleSidebar }: {
  activeModule: string; setActiveModule: (id: string) => void; user: User | null; dbConnected: boolean;
  sidebarOpen: boolean; onToggleSidebar: () => void;
}) => {
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const menuItems = [
    {
      id: "employees",
      label: "พนักงาน (Employees)",
      icon: Users,
      sub: [
        { id: "emp_indirect", label: "Employee Indirect" },
        { id: "emp_direct_leader", label: "Direct: Team Leader" },
        { id: "emp_direct_supply", label: "Direct: Supply DC" },
        { id: "emp_direct_sub", label: "Direct: Sub Contractor" },
      ],
    },
    { id: "users_data", label: "จัดการผู้ใช้ (Admin)", icon: UserCog },
  ];

  useEffect(() => {
    const parentMenu = menuItems.find(
      (item) =>
        item.sub && item.sub.some((subItem) => subItem.id === activeModule)
    );
    if (parentMenu) {
      setExpandedMenus((prev) => ({ ...prev, [parentMenu.id]: true }));
    }
  }, [activeModule]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }));
  };

  const isConnected = user || dbConnected;

  return (
    <div
      className="bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden z-10 shadow-xl transition-[width] duration-200 ease-in-out"
      style={{ width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
    >
      {/* Header */}
      <div className={`border-b border-slate-700 flex items-center gap-3 shrink-0 ${sidebarOpen ? "p-6" : "p-3 justify-center"}`}>
        <div className="relative shrink-0">
          <Database className="text-blue-400" size={sidebarOpen ? 28 : 24} />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
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
      <div className={`shrink-0 flex ${sidebarOpen ? "justify-end px-2 pt-2" : "justify-center p-2"}`}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={sidebarOpen ? "ย่อเมนู" : "ขยายเมนู"}
        >
          {sidebarOpen ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1 min-w-0">
        {menuItems.map((item) => (
          <div key={item.id}>
            {!item.sub ? (
              <button
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center rounded-lg transition-colors ${
                  sidebarOpen ? "gap-3 px-4 py-3" : "justify-center p-3"
                } ${
                  activeModule === item.id ? "bg-blue-600 text-white shadow-md" : "text-slate-300 hover:bg-slate-800"
                }`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
              </button>
            ) : (
              <div className="space-y-1">
                <button
                  onClick={() => sidebarOpen ? toggleMenu(item.id) : onToggleSidebar()}
                  className={`w-full flex items-center rounded-lg transition-colors hover:bg-slate-800 ${
                    sidebarOpen ? "justify-between px-4 py-3" : "justify-center p-3"
                  } ${
                    expandedMenus[item.id] ? "text-white bg-slate-800/50" : "text-slate-400"
                  }`}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <div className={`flex items-center ${sidebarOpen ? "gap-3" : ""}`}>
                    <item.icon size={20} className="shrink-0" />
                    {sidebarOpen && <span className="text-sm font-semibold truncate">{item.label}</span>}
                  </div>
                  {sidebarOpen && (expandedMenus[item.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>

                {sidebarOpen && expandedMenus[item.id] && (
                  <div className="pl-12 space-y-1 border-l-2 border-slate-800 ml-6 animate-fade-in-down">
                    {item.sub.map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => setActiveModule(subItem.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
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
        ))}
      </nav>

      <div className={`border-t border-slate-800 shrink-0 ${sidebarOpen ? "p-4" : "p-2 flex justify-center"}`}>
        {sidebarOpen ? (
          <div className="flex items-center gap-3 text-slate-400 text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-blue-200 font-bold shrink-0">
              {user ? (user.email ?? "").charAt(0).toUpperCase() : "A"}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm">Admin User</p>
              <p className="text-xs text-slate-500">Version 18.0</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-blue-200 font-bold text-xs">
            {user ? (user.email ?? "").charAt(0).toUpperCase() : "A"}
          </div>
        )}
      </div>
    </div>
  );
};

const DynamicInput = ({ field, value, onChange, disabled }: { field: SchemaField; value: unknown; onChange: (val: string | boolean) => void; disabled?: boolean }) => {
  const baseClass = `w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm ${
    disabled
      ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200"
      : "bg-white"
  }`;

  switch (field.type) {
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
export default function MasterDatabaseApp() {
  const [activeModule, setActiveModule] = useState("emp_indirect");
  const [user, setUser] = useState<User | null>(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DataRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [newColumn, setNewColumn] = useState({
    label: "",
    type: "text",
    options: "",
  });

  const [hiddenColumnsMap, setHiddenColumnsMap] = useState<Record<string, string[]>>({});
  const [isColVisOpen, setIsColVisOpen] = useState(false);
  const [skipImportRows, setSkipImportRows] = useState(0);
  const [selectedColumnIdsForDelete, setSelectedColumnIdsForDelete] = useState<Set<string>>(new Set());
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

  const showNotification = (type: string, title: string, message: string) =>
    setNotification({ isOpen: true, type, title, message });
  const closeNotification = () =>
    setNotification((prev) => ({ ...prev, isOpen: false }));

  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmation({ isOpen: true, title, message, onConfirm });
  const closeConfirm = () =>
    setConfirmation((prev) => ({ ...prev, isOpen: false }));

  const toggleColumnVisibility = (colId: string) => {
    setHiddenColumnsMap((prev) => {
      const currentModuleHidden = prev[activeModule] || [];
      let newHidden;
      if (currentModuleHidden.includes(colId)) {
        newHidden = currentModuleHidden.filter((id: string) => id !== colId);
      } else {
        newHidden = [...currentModuleHidden, colId];
      }
      return { ...prev, [activeModule]: newHidden };
    });
  };

  useEffect(() => {
    const email = "admin@cmg.com";
    const password = "123456";
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        signInWithEmailAndPassword(auth, email, password)
          .then((userCredential) => {
            setUser(userCredential.user);
            setLoading(false);
          })
          .catch((error) => {
            console.error("Login failed:", (error as Error).message);
            setLoading(false);
          });
      }
    });
    return () => unsubscribe();
  }, []);

  // อ่าน Firebase เฉพาะตอนกดเข้าเมนู (snapshot ครั้งเดียว) เพื่อลดโควต้า Read
  const fetchModuleRef = useRef<string | null>(null);
  useEffect(() => {
    const moduleId = activeModule;
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
        if (schemaSnap.exists()) {
          setSchemas((prev) => ({ ...prev, [moduleId]: schemaSnap.data().fields }));
        } else {
          const fallbackKey = subcollectionName;
          const defaultSchema = (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[schemaModuleId]
            ?? (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[moduleId]
            ?? (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[fallbackKey];
          setSchemas((prev) => ({ ...prev, [moduleId]: defaultSchema ?? [] }));
        }

        // อ่านข้อมูลครั้งเดียว (N reads = จำนวนเอกสาร)
        let dataQuery: CollectionReference<DocumentData> | Query<DocumentData> = collection(
          db,
          "CMG-HR-Database",
          "root",
          subcollectionName
        );
        if (config.filterField && config.filterValue) {
          dataQuery = query(
            dataQuery as CollectionReference<DocumentData>,
            where(config.filterField, "==", config.filterValue)
          );
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

  const refreshCurrentModuleData = async () => {
    const config = getModuleInfo(activeModule);
    const subcollectionName = config.subcollection || activeModule;
    try {
      let dataQuery: CollectionReference<DocumentData> | Query<DocumentData> = collection(
        db,
        "CMG-HR-Database",
        "root",
        subcollectionName
      );
      if (config.filterField && config.filterValue) {
        dataQuery = query(
          dataQuery as CollectionReference<DocumentData>,
          where(config.filterField, "==", config.filterValue)
        );
      }
      const snapshot = await getDocs(dataQuery);
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
    } catch (e) {
      console.error("Refresh error:", e);
    }
  };

  const addLog = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: user?.email ?? "anonymous",
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
      if (config.filterField && config.filterValue) {
        cleanData[config.filterField] = config.filterValue;
      }

      const primaryKeyField = getPrimaryKeyField();
      if (!primaryKeyField) {
        showNotification("error", "Error", "ไม่พบโครงสร้างตาราง");
        return;
      }

      if (editingItem) {
        const subcollectionName = config.subcollection || activeModule;
        await updateDoc(doc(db, "CMG-HR-Database", "root", subcollectionName, editingItem.id), cleanData as any);
        await addLog("แก้ไข", `แก้ไขรายการ ID: ${editingItem.id}`);
        showNotification("success", "บันทึกสำเร็จ", "ข้อมูลถูกแก้ไขเรียบร้อยแล้ว");
        await refreshCurrentModuleData();
      } else {
        let docId;
        // Auto ID Generation strictly at save time for new items
        if (activeModule === "client_list") {
          docId = generateNextID("client_list", currentData);
          cleanData["Customer_ID"] = docId;
        } else if (activeModule === "contractors") {
          docId = generateNextID("contractors", currentData);
          cleanData["con_id"] = docId;
        } else {
          docId = cleanData[primaryKeyField];
        }

        if (!docId) {
          showNotification(
            "error",
            "ข้อมูลไม่ครบ",
            `กรุณาระบุ ${primaryKeyField}`
          );
          return;
        }

        docId = String(docId).replace(/[\/\.\#\$\{\}]/g, "_");
        const subcollectionName = config.subcollection || activeModule;
        await setDoc(doc(db, "CMG-HR-Database", "root", subcollectionName, docId), cleanData);
        await addLog("เพิ่มใหม่", `เพิ่มรายการ ID: ${docId}`);
        showNotification("success", "บันทึกสำเร็จ", `เพิ่มข้อมูล ${docId} เรียบร้อยแล้ว`);
        await refreshCurrentModuleData();
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      setFormData({});
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
        [idx + 1, ...currentSchema.map((col) => `"${row[col.id] || ""}"`)].join(",")
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
    setDataLoading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawResult = e.target?.result;
        if (rawResult == null || !(rawResult instanceof ArrayBuffer)) return;
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
        let updatedSchema = [...currentSchema];
        let schemaChanged = false;

        headers.forEach((headerText: string) => {
          const cleanHeader = headerText.trim();
          const exists = updatedSchema.some(
            (f) => f.label === cleanHeader || f.id === cleanHeader
          );
          if (!exists) {
            const newId = cleanHeader
              .toLowerCase()
              .replace(/\s+/g, "_")
              .replace(/[^\w\u0E00-\u0E7F_]/g, "");
            updatedSchema.push({
              id: newId,
              label: cleanHeader,
              type: "text",
              required: false,
            });
            schemaChanged = true;
          }
        });

        const config = getModuleInfo(activeModule);
        const subcollectionName = config.subcollection || activeModule;

        if (schemaChanged) {
          await setDoc(
            doc(db, "CMG-HR-Database", "root", "module_schemas", activeModule),
            { fields: updatedSchema }
          );
          setSchemas((prev) => ({
            ...prev,
            [activeModule]: updatedSchema,
          }));
        }

        const primaryKeyField = updatedSchema[0].id;
        const headerMap = headers.map((headerText: string) => {
          const cleanHeader = headerText.trim();
          const field = updatedSchema.find(
            (f) => f.label === cleanHeader || f.id === cleanHeader
          );
          return field ? field.id : null;
        });

        let successCount = 0;
        let skipCount = 0;
        let skippedIds = [];
        let currentMaxIdNum = 0;

        // Find max ID before processing loop
        if (activeModule === "client_list" || activeModule === "contractors") {
          let prefix = activeModule === "client_list" ? "customer" : "CT-";
          let key = activeModule === "client_list" ? "Customer_ID" : "con_id";

          const ids = currentData
            .map((item) => item[key])
            .filter(
              (id) =>
                id &&
                typeof id === "string" &&
                id.toLowerCase().startsWith(prefix.toLowerCase())
            )
            .map((id) =>
              parseInt(
                String(id).toLowerCase().replace(prefix.toLowerCase(), ""),
                10
              )
            )
            .filter((num) => !isNaN(num));
          currentMaxIdNum = ids.length > 0 ? Math.max(...ids) : 0;
        }

        const dataStartIndex = 1 + Math.max(0, skipImportRows || 0);
        for (let i = dataStartIndex; i < rows.length; i++) {
          let values = parseCSVRow(rows[i]);
          if (values.length > headers.length) values = values.slice(0, headers.length);
          while (values.length < headers.length) values.push("");
          const docData: Record<string, unknown> = {};
          let hasActualData = false;

          headerMap.forEach((fieldId: string | null, index: number) => {
            const raw = (values[index] ?? "").trim();
            if (fieldId && raw !== "") {
              docData[fieldId] = raw;
              // Verify if row actually has data besides empty strings
              if (fieldId !== "Customer_ID" && fieldId !== "con_id") {
                hasActualData = true;
              }
            }
          });

          // Prevent processing completely empty rows (e.g. trailing empty tabs)
          if (!hasActualData && Object.keys(docData).length === 0) continue;

          if (config.filterField && config.filterValue) {
            docData[config.filterField] = config.filterValue;
          }

          // V18: Force Auto ID if it's missing OR empty
          if (activeModule === "client_list") {
            if (
              !docData["Customer_ID"] ||
              String(docData["Customer_ID"]).trim() === ""
            ) {
              currentMaxIdNum++;
              docData["Customer_ID"] = `customer${String(
                currentMaxIdNum
              ).padStart(3, "0")}`;
            }
          } else if (activeModule === "contractors") {
            if (!docData["con_id"] || String(docData["con_id"]).trim() === "") {
              currentMaxIdNum++;
              docData["con_id"] = `CT-${String(currentMaxIdNum).padStart(
                3,
                "0"
              )}`;
            }
          }

          if (docData[primaryKeyField]) {
            const rawId = docData[primaryKeyField];
            const docId = String(rawId).replace(/[\/\.\#\$\{\}]/g, "_");
            const docRef = doc(db, "CMG-HR-Database", "root", subcollectionName, docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
              skipCount++;
              skippedIds.push(rawId);
            } else {
              await setDoc(docRef, docData);
              successCount++;
            }
          }
        }

        await addLog(
          "Import CSV",
          `Imported ${successCount}, Skipped ${skipCount}`
        );
        if (successCount > 0) await refreshCurrentModuleData();
        let msg = `นำเข้าสำเร็จ: ${successCount} รายการ\nข้าม (มีอยู่แล้ว): ${skipCount} รายการ`;
        if (skipCount > 0)
          msg += `\n(ID ที่ข้าม: ${skippedIds.slice(0, 5).join(", ")}${
            skippedIds.length > 5 ? "..." : ""
          })`;
        showNotification(
          skipCount > 0 && successCount === 0 ? "info" : "success",
          "ผลการ Import",
          msg
        );
      } catch (error) {
        console.error("Import Error:", error);
        showNotification("error", "Import ล้มเหลว", (error as Error).message);
      } finally {
        setDataLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredData = useMemo(() => {
    if (!searchQuery) return currentData;
    return currentData.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [currentData, searchQuery]);

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

  if (activeModule === "activity_logs")
    return (
      <div className="flex bg-gray-50 min-h-screen font-sans overflow-x-hidden">
        <Sidebar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          user={user}
          dbConnected={dbConnected}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <main
          className="flex-1 p-8 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-in-out"
          style={{ marginLeft: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
        >
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Activity className="text-orange-500" /> บันทึกกิจกรรม
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
                    <th className="px-3 py-2 border-b w-14 text-center">ลำดับ</th>
                    <th className="px-3 py-2 border-b">เวลา</th>
                    <th className="px-3 py-2 border-b">ผู้ใช้</th>
                    <th className="px-3 py-2 border-b">Module</th>
                    <th className="px-3 py-2 border-b">กิจกรรม</th>
                    <th className="px-3 py-2 border-b">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {logs.map((log, idx) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2">{log.timestamp}</td>
                      <td className="px-3 py-2 font-medium">{log.user}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 bg-slate-100 rounded border">
                          {log.module}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-blue-600">{log.action}</td>
                      <td className="px-3 py-2 text-gray-500">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    );

  const config = getModuleInfo(activeModule);

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
        user={user}
        dbConnected={dbConnected}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <main
        className="flex-1 p-8 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
      >
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2 capitalize flex items-center gap-3">
              {config.label}
            </h1>
            <p className="text-gray-500 text-sm flex gap-2">
              <Database size={14} className="text-green-500" /> Collection:{" "}
              {config.collection}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsSchemaModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-medium"
            >
              <Settings size={16} /> ตั้งค่าคอลัมน์
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                // Do NOT prefill formData for Auto-ID fields in "Add" mode. Let handleSaveItem generate it securely.
                setFormData({});
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 text-sm font-bold"
            >
              <Plus size={18} /> เพิ่มรายการ
            </button>
          </div>
        </header>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 justify-between items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="ค้นหา..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 text-sm items-center">
            <div className="relative">
              <button
                onClick={() => setIsColVisOpen(!isColVisOpen)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200"
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
              onClick={downloadCSV}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200"
            >
              <Download size={16} /> Export
            </button>
            <div className="relative group">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200"
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
              <label className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200 cursor-pointer bg-blue-50 text-blue-700 font-medium">
                <Upload size={16} /> Import{" "}
                <input
                  type="file"
                  className="hidden"
                  accept=".csv"
                  onChange={handleImportCSV}
                />
              </label>
            </div>
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500">เลือกแล้ว {selectedIds.size} รายการ</span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-3 py-2 text-white bg-red-600 hover:bg-red-700 rounded border border-red-700 text-sm font-medium"
                >
                  <Trash2 size={16} /> ลบที่เลือก
                </button>
              </>
            )}
          </div>
        </div>

        <div className="relative bg-white rounded-xl shadow-sm border border-gray-200 min-h-[300px]" style={{ maxWidth: "100%" }}>
          <div
            ref={tableScrollRef}
            className="overflow-x-auto overflow-y-auto min-h-[300px]"
            style={{ scrollbarWidth: "thin", maxHeight: "calc(100vh - 300px)" }}
            onScroll={syncRailScrollFromTable}
          >
            {dataLoading ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 gap-3">
                <Loader2 className="animate-spin text-blue-500" size={32} />
                <p>กำลังประมวลผล...</p>
              </div>
            ) : (
              <table ref={tableElementRef} className="w-full text-left border-collapse min-w-max">
                <thead ref={theadRef} className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-2 w-10 bg-gray-50 border-r border-gray-200 sticky left-0 z-10">
                    <input
                      type="checkbox"
                      ref={selectAllCheckboxRef}
                      checked={filteredData.length > 0 && filteredData.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="เลือกทั้งหมด"
                    />
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 text-center bg-gray-50 border-r border-gray-200 sticky left-0 z-10">ลำดับ</th>
                  {/* V18: Fixed Column Header (No Drag, No Delete Button) */}
                  {fixedColumn && (
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-100 border-r border-gray-200 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center gap-2">
                        {fixedColumn.label}
                      </div>
                    </th>
                  )}
                  {/* Draggable Columns */}
                  {draggableColumns.map((col, index) => (
                    <th
                      key={col.id}
                      className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-move hover:bg-gray-100 group"
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          size={14}
                          className="text-gray-300 group-hover:text-gray-500"
                        />{" "}
                        {col.label}
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
                  ))}
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                    จัดการ
                  </th>
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
                      <td className="px-2 py-2 bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500 font-medium bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {idx + 1}
                      </td>
                      {/* Fixed Cell */}
                      {fixedColumn && (
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis font-bold bg-gray-50/50 border-r border-gray-100 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          {String(row[fixedColumn.id] || "-")}
                        </td>
                      )}
                      {/* Draggable Cells */}
                      {draggableColumns.map((col) => (
                        <td
                          key={col.id}
                          className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis"
                        >
                          {String(row[col.id] || "-")}
                        </td>
                      ))}
                      <td className="px-3 py-2 flex justify-end gap-2 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingItem(row);
                            setFormData(row);
                            setIsAddModalOpen(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(row.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
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
          {!dataLoading && tableScrollWidth > 0 && (
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
        onClose={() => setIsAddModalOpen(false)}
        title={editingItem ? "แก้ไขข้อมูล" : "เพิ่มข้อมูลใหม่"}
        footer={
          <>
            <button
              onClick={() => setIsAddModalOpen(false)}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentSchema.map((field) => {
            const isClientAuto =
              activeModule === "client_list" && field.id === "Customer_ID";
            const isContractorAuto =
              activeModule === "contractors" && field.id === "con_id";

            // V18: Completely hide Auto-ID fields when ADDING new items. They will be generated upon save.
            // If editing, show them as disabled.
            if ((isClientAuto || isContractorAuto) && !editingItem) return null;

            return (
              <div key={field.id} className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  {field.label}
                </label>
                <DynamicInput
                  field={field}
                  value={(formData[field.id] as string | boolean) ?? ""}
                  onChange={(val) =>
                    setFormData({ ...formData, [field.id]: val })
                  }
                  disabled={isClientAuto || isContractorAuto}
                />
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
