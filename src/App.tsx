import React, { useState, useEffect, useMemo } from "react";
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
  onSnapshot,
  getDoc,
} from "firebase/firestore";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBkufl0G5RG0Kl9NwGUty9KONciRmh3Ews",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "master-databasse-cmg.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "master-databasse-cmg",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "master-databasse-cmg.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "564913926048",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:564913926048:web:c37a11f99cc214ec4a7ec5",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-R688E2PTCE",
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
  },
  emp_direct_sub: {
    collection: "CMG-HR-Database",
    subcollection: "employee_data",
    label: "Direct - Sub Contractor",
    filterField: "employee_type",
    filterValue: "Direct_SubContractor",
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

// --- COMPONENTS ---

const Sidebar = ({ activeModule, setActiveModule, user }: { activeModule: string; setActiveModule: (id: string) => void; user: User | null }) => {
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

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 overflow-y-auto z-10 shadow-xl">
      <div className="p-6 border-b border-slate-700 flex items-center gap-3">
        <div className="relative">
          <Database className="text-blue-400" size={28} />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${
              user ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
        </div>
        <div>
          <h1 className="font-bold text-base leading-tight">
            Master Database
            <br />
            CMG
          </h1>
          <p
            className={`text-[10px] flex items-center gap-1 ${
              user ? "text-green-400" : "text-red-400"
            }`}
          >
            {user ? <Wifi size={10} /> : <WifiOff size={10} />}
            {user ? "Connected" : "Disconnected"}
          </p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <div key={item.id}>
            {!item.sub ? (
              <button
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeModule === item.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <item.icon size={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ) : (
              <div className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:bg-slate-800 ${
                    expandedMenus[item.id]
                      ? "text-white bg-slate-800/50"
                      : "text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={20} />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </div>
                  {expandedMenus[item.id] ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>

                {expandedMenus[item.id] && (
                  <div className="pl-12 space-y-1 border-l-2 border-slate-800 ml-6 animate-fade-in-down">
                    {item.sub.map((subItem) => (
                      <button
                        key={subItem.id}
                        onClick={() => setActiveModule(subItem.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          activeModule === subItem.id
                            ? "text-blue-400 font-medium bg-slate-800"
                            : "text-slate-500 hover:text-slate-300"
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
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-blue-200 font-bold">
            {user ? (user.email ?? "").charAt(0).toUpperCase() : "A"}
          </div>
          <div>
            <p className="text-white">Admin User</p>
            <p className="text-xs text-slate-500">Version 18.0</p>
          </div>
        </div>
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
  const [activeModule, setActiveModule] = useState("emp_indirect"); // Set default to emp_indirect since we removed other modules
  const [user, setUser] = useState<User | null>(null);
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

  const getModuleInfo = (moduleId: string): ModuleConfig => {
    return (MODULE_CONFIG as Record<string, ModuleConfig>)[moduleId] || { collection: "CMG-HR-Database", subcollection: moduleId, label: moduleId };
  };

  const getPrimaryKeyField = () => {
    const config = getModuleInfo(activeModule);
    const schemaKey = config.subcollection || config.collection;
    const currentSchema = schemas[schemaKey] || schemas[activeModule];
    return currentSchema && currentSchema.length > 0
      ? currentSchema[0].id
      : null;
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

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setDataLoading(true);
      const config = getModuleInfo(activeModule);
      const collectionName = config.collection;
      const subcollectionName = config.subcollection || activeModule;
      
      try {
        // Schema metadata in subcollection under CMG-HR-Database/root
        const schemaRef = doc(db, "CMG-HR-Database", "root", subcollectionName, "_schema_metadata");
        const unsubscribeSchema = onSnapshot(schemaRef, (docSnap) => {
          if (docSnap.exists()) {
            setSchemas((prev) => ({
              ...prev,
              [subcollectionName]: docSnap.data().fields,
            }));
          } else {
            const defaultKey = subcollectionName;
            if ((DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[defaultKey]) {
              setSchemas((prev) => ({
                ...prev,
                [subcollectionName]: (DEFAULT_SCHEMAS as Record<string, SchemaField[]>)[defaultKey],
              }));
            } else {
              setSchemas((prev) => ({ ...prev, [subcollectionName]: [] }));
            }
          }
        });

        // Query data from subcollection under CMG-HR-Database/root
        let dataQuery: CollectionReference<DocumentData> | Query<DocumentData> = collection(db, "CMG-HR-Database", "root", subcollectionName);
        if (config.filterField && config.filterValue) {
          dataQuery = query(
            dataQuery as CollectionReference<DocumentData>,
            where(config.filterField, "==", config.filterValue)
          );
        }

        const unsubscribeData = onSnapshot(
          dataQuery,
          (snapshot) => {
            const items = snapshot.docs
              .map((doc) => ({ id: doc.id, ...doc.data() } as DataRecord))
              .filter((item) => item.id !== "_schema_metadata");
            if (subcollectionName === "activity_logs") {
              const logItems = items as unknown as LogRecord[];
              logItems.sort((a, b) => b.createdAt - a.createdAt);
              setLogs(logItems);
            } else {
              setCurrentData(items);
            }
            setDataLoading(false);
          },
          (error) => {
            console.error("Data fetch error:", error);
            setDataLoading(false);
          }
        );
        return () => {
          unsubscribeSchema();
          unsubscribeData();
        };
      } catch (error) {
        console.error("Setup error:", error);
        setDataLoading(false);
      }
    };
    let unsubscribeAll: (() => void) | undefined;
    fetchData().then((cleanupFn) => {
      if (typeof cleanupFn === "function") unsubscribeAll = cleanupFn;
    });
    return () => {
      if (unsubscribeAll) unsubscribeAll();
    };
  }, [activeModule, user]);

  const addLog = async (action: string, details: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "CMG-HR-Database", "root", "activity_logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        user: user.email ?? "",
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
  const schemaKey = moduleInfo.subcollection || moduleInfo.collection;
  const currentSchema = schemas[schemaKey] || [];

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
    const config = getModuleInfo(activeModule);
    const schemaKey = config.subcollection || config.collection;
    setSchemas((prev) => ({ ...prev, [schemaKey]: newSchema }));
    try {
      await setDoc(
        doc(db, "CMG-HR-Database", "root", schemaKey, "_schema_metadata"),
        { fields: newSchema },
        { merge: true }
      );
      await addLog("ปรับลำดับ", `ย้ายคอลัมน์ใน ${activeModule}`);
    } catch (error) {
      showNotification("error", "Error", "บันทึกลำดับไม่สำเร็จ");
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
        const config = getModuleInfo(activeModule);
        const schemaKey = config.subcollection || config.collection;
        try {
          await setDoc(
            doc(db, "CMG-HR-Database", "root", schemaKey, "_schema_metadata"),
            { fields: newSchema },
            { merge: true }
          );
          await addLog("ลบคอลัมน์", `ลบคอลัมน์ "${colLabel}"`);
          showNotification("success", "สำเร็จ", `ลบคอลัมน์ "${colLabel}" แล้ว`);
        } catch (error) {
          showNotification("error", "Error", "ลบคอลัมน์ไม่สำเร็จ");
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
        showNotification(
          "success",
          "บันทึกสำเร็จ",
          "ข้อมูลถูกแก้ไขเรียบร้อยแล้ว"
        );
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
        showNotification(
          "success",
          "บันทึกสำเร็จ",
          `เพิ่มข้อมูล ${docId} เรียบร้อยแล้ว`
        );
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
      } catch (error) {
        showNotification("error", "ผิดพลาด", (error as Error).message);
      }
    });
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
    const config = getModuleInfo(activeModule);
    const schemaKey = config.subcollection || config.collection;
    
    console.log("Adding column:", newField);
    console.log("Schema key:", schemaKey);
    console.log("Current schema:", currentSchema);
    
    try {
      const updatedFields = [...currentSchema, newField];
      console.log("Updated fields:", updatedFields);
      
      setSchemas((prev) => ({ ...prev, [schemaKey]: updatedFields }));
      
      // Save schema metadata to CMG-HR-Database/root/{subcollection}
      await setDoc(
        doc(db, "CMG-HR-Database", "root", schemaKey, "_schema_metadata"),
        { fields: updatedFields },
        { merge: true }
      );
      
      console.log("Schema saved successfully");
      await addLog("ปรับโครงสร้าง", `เพิ่มคอลัมน์ "${newColumn.label}"`);
      showNotification("success", "สำเร็จ", `เพิ่มคอลัมน์แล้ว`);
      setIsSchemaModalOpen(false);
      setNewColumn({ label: "", type: "text", options: "" });
    } catch (error) {
      console.error("Error adding column:", error);
      showNotification("error", "ผิดพลาด", (error as Error).message);
    }
  };

  const downloadCSV = () => {
    if (currentData.length === 0)
      return showNotification("info", "ไม่มีข้อมูล", "ไม่มีข้อมูลให้ Export");
    const headers = currentSchema.map((col) => col.label).join(",");
    const rows = currentData
      .map((row) =>
        currentSchema.map((col) => `"${row[col.id] || ""}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${headers}\n${rows}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModule}_export.csv`;
    link.click();
    showNotification("success", "ดาวน์โหลด", "เริ่มการดาวน์โหลดไฟล์ CSV");
  };

  const downloadTemplate = () => {
    let templateSchema = currentSchema;
    // Strip Auto-ID columns from template so user doesn't fill them
    if (activeModule === "client_list") {
      templateSchema = currentSchema.filter((col) => col.id !== "Customer_ID");
    } else if (activeModule === "contractors") {
      templateSchema = currentSchema.filter((col) => col.id !== "con_id");
    }
    const headers = templateSchema
      .map((col) => col.label)
      .join(activeModule === "client_list" ? "\t" : ",");
    const blob = new Blob([`\uFEFF${headers}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModule}_template.csv`;
    link.click();
    showNotification("success", "ดาวน์โหลด", "เริ่มการดาวน์โหลด Template");
  };

  // --- SMART IMPORT LOGIC (V18: Robust Auto-ID Generation) ---
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setDataLoading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawResult = e.target?.result;
        if (typeof rawResult !== "string") return;
        const text = rawResult
          .replace(/^\uFEFF/, "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");
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
          if (delimiter === "\t") {
            return row
              .split("\t")
              .map((v: string) => v.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
          }
          return row
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((v: string) => v.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
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

        if (schemaChanged) {
          await setDoc(
            doc(db, config.collection, "_schema_metadata"),
            { fields: updatedSchema },
            { merge: true }
          );
          setSchemas((prev) => ({
            ...prev,
            [config.collection]: updatedSchema,
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

        for (let i = 1; i < rows.length; i++) {
          const values = parseCSVRow(rows[i]);
          const docData: Record<string, unknown> = {};
          let hasActualData = false;

          // Map data, ignoring missing/empty Customer_ID in the CSV
          headerMap.forEach((fieldId: string | null, index: number) => {
            if (
              fieldId &&
              values[index] !== undefined &&
              values[index].trim() !== ""
            ) {
              docData[fieldId] = values[index];
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
            const docRef = doc(db, config.collection, docId);
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
    reader.readAsText(file);
  };

  const filteredData = useMemo(() => {
    if (!searchQuery) return currentData;
    return currentData.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [currentData, searchQuery]);

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 flex-col gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-600">กำลังเชื่อมต่อฐานข้อมูล...</p>
      </div>
    );

  if (activeModule === "activity_logs")
    return (
      <div className="flex bg-gray-50 min-h-screen font-sans">
        <Sidebar
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          user={user}
        />
        <main className="ml-64 flex-1 p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Activity className="text-orange-500" /> บันทึกกิจกรรม
            </h1>
          </header>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {dataLoading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 text-gray-600 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2 border-b">เวลา</th>
                    <th className="px-3 py-2 border-b">ผู้ใช้</th>
                    <th className="px-3 py-2 border-b">Module</th>
                    <th className="px-3 py-2 border-b">กิจกรรม</th>
                    <th className="px-3 py-2 border-b">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
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
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        user={user}
      />
      <main className="ml-64 flex-1 p-8">
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
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded border hover:border-gray-200"
            >
              <FileText size={16} /> Template
            </button>
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
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto min-h-[300px]">
          {dataLoading ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 gap-3">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <p>กำลังประมวลผล...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
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
                {filteredData.length > 0 ? (
                  filteredData.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className="hover:bg-blue-50/50 group"
                    >
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
                      colSpan={visibleSchema.length + 1}
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
        onClose={() => setIsSchemaModalOpen(false)}
        title="Dynamic Schema Builder"
        footer={
          <>
            <button
              onClick={() => setIsSchemaModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              ปิด
            </button>
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
