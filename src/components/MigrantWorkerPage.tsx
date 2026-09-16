import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  FileWarning,
  Globe2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { MetricCard } from "./DashboardUI";
import {
  canManageMigrantWorkers,
  canViewMigrantWorkers,
  COMPLETENESS_META,
  isMigrantWorker,
  MIGRANT_DOCUMENT_FILES_COLLECTION,
  MIGRANT_DOCUMENT_HISTORY_COLLECTION,
  MIGRANT_DOCUMENT_TYPES,
  MIGRANT_DOCUMENTS_FIELD,
  MigrantDocumentEntry,
  MigrantDocumentFileRecord,
  MigrantDocumentTypeKey,
  MigrantDocumentsMap,
  MigrantWorkerHistoryRecord,
  overallWorkerStatus,
  summarizeWorkerDocuments,
  URGENCY_META,
  WorkerDocumentSummary,
} from "./migrantWorkerConfig";
import { removeMigrantDocumentFile, uploadMigrantDocumentFile } from "../utils/migrantWorkerAttachments";

interface MigrantEmployee {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  สัญชาติ?: string;
  โครงการ?: string;
  โครงการปัจจุบัน?: string;
  สถานะพนักงาน?: string;
  ตำแหน่ง?: string;
  employee_type?: string;
  start_date?: string;
  [MIGRANT_DOCUMENTS_FIELD]?: MigrantDocumentsMap;
}

const EMPLOYEE_TYPE_OPTIONS = [
  { value: "Indirect", label: "Indirect (Staff Monthly)" },
  { value: "Direct_TeamLeader", label: "Direct: Team Leader (DC Daily)" },
  { value: "Direct_SupplyDC", label: "Direct: Supply DC" },
  { value: "Direct_SubContractor", label: "Direct: Sub Contractor" },
];

const employeeName = (e: MigrantEmployee) => `${e.ชื่อต้น || ""}${e.ชื่อตัว || ""} ${e.ชื่อสกุล || ""}`.trim() || "(ไม่ระบุชื่อ)";

const COMPLETENESS_ORDER: Record<string, number> = {
  expired: 0,
  urgent: 1,
  warning: 2,
  watch: 3,
  normal: 4,
  awaiting_file: 5,
  awaiting_data: 6,
  missing: 7,
  none: 8,
};

export const MigrantWorkerPage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();
  const roles = userProfile?.role || [];
  const canManage = canManageMigrantWorkers(roles);
  const canView = canViewMigrantWorkers(roles);

  const [tab, setTab] = useState<"overview" | "registry" | "tracking">("overview");
  const [employees, setEmployees] = useState<MigrantEmployee[]>([]);
  const [files, setFiles] = useState<MigrantDocumentFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "employee_data"), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as MigrantEmployee))
        .filter((e) => isMigrantWorker(e.สัญชาติ));
      setEmployees(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_FILES_COLLECTION), (snap) => {
      setFiles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MigrantDocumentFileRecord)));
    });
    return () => unsub();
  }, [db]);

  // employeeId -> docType -> latest file record
  const fileMapByEmployee = useMemo(() => {
    const map = new Map<string, Partial<Record<MigrantDocumentTypeKey, MigrantDocumentFileRecord>>>();
    for (const f of files) {
      const current = map.get(f.employeeId) || {};
      const existing = current[f.docType];
      if (!existing || (f.uploadedAt || 0) > (existing.uploadedAt || 0)) {
        current[f.docType] = f;
      }
      map.set(f.employeeId, current);
    }
    return map;
  }, [files]);

  const enriched = useMemo(() => {
    return employees.map((e) => {
      const fileByType: Partial<Record<MigrantDocumentTypeKey, boolean>> = {};
      const fileRecByType = fileMapByEmployee.get(e.id) || {};
      MIGRANT_DOCUMENT_TYPES.forEach(({ key }) => {
        fileByType[key] = !!fileRecByType[key];
      });
      const summaries = summarizeWorkerDocuments(e[MIGRANT_DOCUMENTS_FIELD], fileByType);
      const overall = overallWorkerStatus(summaries);
      return { employee: e, summaries, overall };
    });
  }, [employees, fileMapByEmployee]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enriched.filter(({ employee }) => {
      const matchesProject =
        projectFilter === "all" ||
        employee.โครงการ === projectFilter ||
        employee.โครงการปัจจุบัน === projectFilter;
      if (!matchesProject) return false;
      if (!term) return true;
      const haystack = `${employeeName(employee)} ${employee.รหัสพนักงาน || ""} ${employee.สัญชาติ || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [enriched, search, projectFilter]);

  // ภาพรวมสำหรับ Dashboard mini cards
  const stats = useMemo(() => {
    let expired = 0;
    let urgent = 0;
    let warning = 0;
    let watch = 0;
    let missingDocs = 0;
    enriched.forEach(({ summaries }) => {
      summaries.forEach((s) => {
        if (s.completeness === "complete") {
          if (s.urgency === "expired") expired++;
          else if (s.urgency === "urgent") urgent++;
          else if (s.urgency === "warning") warning++;
          else if (s.urgency === "watch") watch++;
        } else {
          missingDocs++;
        }
      });
    });
    return { total: enriched.length, expired, urgent, warning, watch, missingDocs };
  }, [enriched]);

  const trackingRows = useMemo(() => {
    const rows: Array<{ employee: MigrantEmployee; summary: WorkerDocumentSummary }> = [];
    enriched.forEach(({ employee, summaries }) => {
      summaries.forEach((summary) => rows.push({ employee, summary }));
    });
    rows.sort((a, b) => {
      const orderA = COMPLETENESS_ORDER[a.summary.completeness === "complete" ? a.summary.urgency : a.summary.completeness];
      const orderB = COMPLETENESS_ORDER[b.summary.completeness === "complete" ? b.summary.urgency : b.summary.completeness];
      if (orderA !== orderB) return orderA - orderB;
      const daysA = a.summary.daysRemaining ?? Infinity;
      const daysB = b.summary.daysRemaining ?? Infinity;
      return daysA - daysB;
    });
    return rows;
  }, [enriched]);

  const recentWorkers = useMemo(() => {
    return [...enriched]
      .sort((a, b) => String(b.employee.start_date || "").localeCompare(String(a.employee.start_date || "")))
      .slice(0, 5);
  }, [enriched]);

  const selected = enriched.find((e) => e.employee.id === selectedId) || null;

  if (!canView) {
    return (
      <div className="p-8 text-center text-gray-500">
        <ShieldAlert className="mx-auto mb-2 text-gray-400" size={32} />
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Globe2 size={20} className="text-blue-600" /> ระบบจัดการแรงงานต่างด้าว
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ข้อมูลเชื่อมกับทะเบียนพนักงานเดิม (สัญชาติ ≠ ไทย) — เอกสาร 1 ประเภท แยกเป็นข้อมูล + ไฟล์เสมอ
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[
              { id: "overview", label: "ภาพรวม" },
              { id: "registry", label: "ทะเบียนแรงงาน" },
              { id: "tracking", label: "ติดตามเอกสาร" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === t.id ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> เพิ่มแรงงานต่างด้าว
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} /> กำลังโหลดข้อมูล...
        </div>
      ) : tab === "overview" ? (
        <OverviewTab stats={stats} recentWorkers={recentWorkers} onSelect={setSelectedId} onGoTracking={() => setTab("tracking")} />
      ) : tab === "registry" ? (
        <RegistryTab
          filtered={filtered}
          search={search}
          setSearch={setSearch}
          projectFilter={projectFilter}
          setProjectFilter={setProjectFilter}
          projectOptions={projectOptions}
          onSelect={setSelectedId}
        />
      ) : (
        <TrackingTab rows={trackingRows} onSelect={setSelectedId} />
      )}

      {selected && (
        <WorkerProfileDrawer
          data={selected}
          canManage={canManage}
          db={db}
          actorEmail={firebaseUser?.email || userProfile?.email || "unknown"}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showAddModal && (
        <AddMigrantWorkerModal
          db={db}
          projectOptions={projectOptions}
          existingCodes={employees.map((e) => String(e.รหัสพนักงาน || "").trim().toLowerCase()).filter(Boolean)}
          actorEmail={firebaseUser?.email || userProfile?.email || "unknown"}
          onClose={() => setShowAddModal(false)}
          onCreated={(id) => {
            setShowAddModal(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
const OverviewTab = ({
  stats,
  recentWorkers,
  onSelect,
  onGoTracking,
}: {
  stats: { total: number; expired: number; urgent: number; warning: number; watch: number; missingDocs: number };
  recentWorkers: Array<{ employee: MigrantEmployee; overall: ReturnType<typeof overallWorkerStatus> }>;
  onSelect: (id: string) => void;
  onGoTracking: () => void;
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
      <MetricCard title="แรงงานต่างด้าวทั้งหมด" value={stats.total} icon={Users} accent="text-blue-600" />
      <MetricCard title="หมดอายุแล้ว" value={stats.expired} icon={AlertTriangle} accent="text-red-600" onClick={onGoTracking} />
      <MetricCard title="ด่วน (≤30 วัน)" value={stats.urgent} icon={AlertTriangle} accent="text-orange-600" onClick={onGoTracking} />
      <MetricCard title="แจ้งเตือน (≤60 วัน)" value={stats.warning} icon={FileWarning} accent="text-amber-600" onClick={onGoTracking} />
      <MetricCard title="เฝ้าระวัง (≤90 วัน)" value={stats.watch} icon={FileWarning} accent="text-yellow-600" onClick={onGoTracking} />
      <MetricCard title="เอกสารยังไม่ครบ" value={stats.missingDocs} icon={ShieldAlert} accent="text-slate-600" onClick={onGoTracking} />
    </div>

    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">แรงงานล่าสุด</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {recentWorkers.length === 0 && <div className="p-4 text-sm text-slate-400 text-center">ยังไม่มีข้อมูลแรงงานต่างด้าว</div>}
        {recentWorkers.map(({ employee, overall }) => (
          <button
            key={employee.id}
            onClick={() => onSelect(employee.id)}
            className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-medium text-slate-800 truncate">{employeeName(employee)}</span>
              <span className="text-xs text-slate-400 shrink-0">#{employee.รหัสพนักงาน || employee.id}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge completeness={overall.completeness} urgency={overall.urgency} />
              <span className="text-xs text-slate-400">{employee.start_date || "-"}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Registry tab
// ---------------------------------------------------------------------------
const RegistryTab = ({
  filtered,
  search,
  setSearch,
  projectFilter,
  setProjectFilter,
  projectOptions,
  onSelect,
}: {
  filtered: Array<{ employee: MigrantEmployee; overall: ReturnType<typeof overallWorkerStatus> }>;
  search: string;
  setSearch: (v: string) => void;
  projectFilter: string;
  setProjectFilter: (v: string) => void;
  projectOptions: string[];
  onSelect: (id: string) => void;
}) => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
    <div className="p-3 flex flex-wrap gap-2 border-b border-slate-100">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / รหัสพนักงาน / สัญชาติ"
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <select
        value={projectFilter}
        onChange={(e) => setProjectFilter(e.target.value)}
        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <option value="all">ทุกโครงการ</option>
        {projectOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">ชื่อ-สกุล</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">รหัสพนักงาน</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">สัญชาติ</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">โครงการ</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">สถานะเอกสาร</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ employee, overall }) => (
            <tr key={employee.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
              <td className="px-4 py-2">
                <button onClick={() => onSelect(employee.id)} className="font-medium text-blue-700 hover:underline text-left">
                  {employeeName(employee)}
                </button>
              </td>
              <td className="px-4 py-2 text-slate-600">{employee.รหัสพนักงาน || "-"}</td>
              <td className="px-4 py-2 text-slate-600">{employee.สัญชาติ || "-"}</td>
              <td className="px-4 py-2 text-slate-600">{employee.โครงการปัจจุบัน || employee.โครงการ || "-"}</td>
              <td className="px-4 py-2">
                <StatusBadge completeness={overall.completeness} urgency={overall.urgency} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                ไม่พบข้อมูลแรงงานต่างด้าว
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Tracking tab
// ---------------------------------------------------------------------------
const TrackingTab = ({
  rows,
  onSelect,
}: {
  rows: Array<{ employee: MigrantEmployee; summary: WorkerDocumentSummary }>;
  onSelect: (id: string) => void;
}) => (
  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">ความเร่งด่วน</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">ชื่อ-สกุล</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">ประเภทเอกสาร</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">สถานะเอกสาร</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">วันหมดอายุ</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">เหลือ (วัน)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee, summary }, idx) => {
            const docLabel = MIGRANT_DOCUMENT_TYPES.find((d) => d.key === summary.docType)?.shortLabel || summary.docType;
            const urgencyMeta = summary.completeness === "complete" ? URGENCY_META[summary.urgency] : null;
            return (
              <tr key={`${employee.id}-${summary.docType}-${idx}`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                <td className="px-4 py-2">
                  {urgencyMeta ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${urgencyMeta.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${urgencyMeta.dot}`} /> {urgencyMeta.label}
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${COMPLETENESS_META[summary.completeness].badge}`}>
                      {COMPLETENESS_META[summary.completeness].label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => onSelect(employee.id)} className="font-medium text-blue-700 hover:underline text-left">
                    {employeeName(employee)}
                  </button>
                  <span className="text-xs text-slate-400 ml-1">#{employee.รหัสพนักงาน || employee.id}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{docLabel}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${COMPLETENESS_META[summary.completeness].badge}`}>
                    {COMPLETENESS_META[summary.completeness].label}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{summary.entry?.expiryDate || "-"}</td>
                <td className="px-4 py-2 text-slate-600">
                  {summary.completeness === "complete" && summary.daysRemaining !== null ? summary.daysRemaining : "-"}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                ไม่มีรายการเอกสารให้ติดตาม
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Status badge (worker-level)
// ---------------------------------------------------------------------------
const StatusBadge = ({ completeness, urgency }: { completeness: string; urgency: string }) => {
  if (completeness === "complete") {
    const meta = URGENCY_META[urgency as keyof typeof URGENCY_META] || URGENCY_META.none;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
      </span>
    );
  }
  const label = completeness === "missing" ? "ไม่มีเอกสาร" : "เอกสารยังไม่ครบ";
  const cls = completeness === "missing" ? COMPLETENESS_META.missing.badge : "bg-amber-100 text-amber-700 border border-amber-200";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
};

// ---------------------------------------------------------------------------
// Worker profile drawer — basic info + documents (data + file) + history
// ---------------------------------------------------------------------------
const WorkerProfileDrawer = ({
  data,
  canManage,
  db,
  actorEmail,
  onClose,
}: {
  data: { employee: MigrantEmployee; summaries: WorkerDocumentSummary[]; overall: ReturnType<typeof overallWorkerStatus> };
  canManage: boolean;
  db: ReturnType<typeof getFirestore>;
  actorEmail: string;
  onClose: () => void;
}) => {
  const { employee, summaries, overall } = data;
  const [history, setHistory] = useState<MigrantWorkerHistoryRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MigrantDocumentEntry>>({});
  const [savingType, setSavingType] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_HISTORY_COLLECTION), where("employeeId", "==", employee.id));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MigrantWorkerHistoryRecord));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setHistory(rows);
    });
    return () => unsub();
  }, [db, employee.id]);

  const draftFor = (typeKey: string): MigrantDocumentEntry => {
    if (drafts[typeKey]) return drafts[typeKey];
    const entry = summaries.find((s) => s.docType === typeKey)?.entry;
    return { docNumber: entry?.docNumber || "", expiryDate: entry?.expiryDate || "" };
  };

  const updateDraft = (typeKey: string, patch: Partial<MigrantDocumentEntry>) => {
    setDrafts((prev) => ({ ...prev, [typeKey]: { ...draftFor(typeKey), ...patch } }));
  };

  const logHistory = async (type: MigrantWorkerHistoryRecord["type"], docType: MigrantDocumentTypeKey | undefined, detail: string) => {
    await addDoc(collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_HISTORY_COLLECTION), {
      employeeId: employee.id,
      type,
      docType: docType || null,
      detail,
      actor: actorEmail,
      createdAt: Date.now(),
    });
  };

  const saveDocData = async (typeKey: MigrantDocumentTypeKey) => {
    const draft = draftFor(typeKey);
    setSavingType(typeKey);
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", "employee_data", employee.id), {
        [`${MIGRANT_DOCUMENTS_FIELD}.${typeKey}`]: {
          docNumber: draft.docNumber || "",
          expiryDate: draft.expiryDate || "",
        },
      });
      const label = MIGRANT_DOCUMENT_TYPES.find((d) => d.key === typeKey)?.label || typeKey;
      await logHistory("data_update", typeKey, `อัปเดตข้อมูล${label}: เลขที่ ${draft.docNumber || "-"} หมดอายุ ${draft.expiryDate || "-"}`);
    } finally {
      setSavingType(null);
    }
  };

  const handleUpload = async (typeKey: MigrantDocumentTypeKey, file: File) => {
    setUploadingType(typeKey);
    try {
      const { url, fileName } = await uploadMigrantDocumentFile(employee.id, typeKey, file);
      await addDoc(collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_FILES_COLLECTION), {
        employeeId: employee.id,
        docType: typeKey,
        fileName,
        fileUrl: url,
        uploadedBy: actorEmail,
        uploadedAt: Date.now(),
      });
      const label = MIGRANT_DOCUMENT_TYPES.find((d) => d.key === typeKey)?.label || typeKey;
      await logHistory("file_upload", typeKey, `แนบไฟล์${label}: ${fileName}`);
    } finally {
      setUploadingType(null);
    }
  };

  const handleRemoveFile = async (record: MigrantDocumentFileRecord) => {
    await removeMigrantDocumentFile(record.fileUrl);
    await deleteDoc(doc(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_FILES_COLLECTION, record.id));
    const label = MIGRANT_DOCUMENT_TYPES.find((d) => d.key === record.docType)?.label || record.docType;
    await logHistory("file_removed", record.docType, `ลบไฟล์${label}: ${record.fileName}`);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <h3 className="text-base font-bold text-slate-800">{employeeName(employee)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              #{employee.รหัสพนักงาน || employee.id} · {employee.สัญชาติ || "-"} · {employee.โครงการปัจจุบัน || employee.โครงการ || "-"}
            </p>
            <div className="mt-1.5">
              <StatusBadge completeness={overall.completeness} urgency={overall.urgency} />
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">ข้อมูลพื้นฐาน</h4>
            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-3 border border-slate-100">
              <InfoRow label="ชื่อ-สกุล" value={employeeName(employee)} />
              <InfoRow label="รหัสพนักงาน" value={employee.รหัสพนักงาน || "-"} />
              <InfoRow label="สัญชาติ" value={employee.สัญชาติ || "-"} />
              <InfoRow label="สถานะพนักงาน" value={employee.สถานะพนักงาน || "-"} />
              <InfoRow label="โครงการ" value={employee.โครงการปัจจุบัน || employee.โครงการ || "-"} />
              <InfoRow label="วันที่เริ่มงาน" value={employee.start_date || "-"} />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">เอกสาร</h4>
            <div className="space-y-3">
              {MIGRANT_DOCUMENT_TYPES.map(({ key, label }) => {
                const summary = summaries.find((s) => s.docType === key)!;
                const draft = draftFor(key);
                return (
                  <DocumentCard
                    key={key}
                    typeKey={key}
                    label={label}
                    summary={summary}
                    draft={draft}
                    canManage={canManage}
                    saving={savingType === key}
                    uploading={uploadingType === key}
                    onChange={(patch) => updateDraft(key, patch)}
                    onSave={() => saveDocData(key)}
                    onUpload={(file) => handleUpload(key, file)}
                    employeeId={employee.id}
                    db={db}
                    onRemoveFile={handleRemoveFile}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">ประวัติ</h4>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {history.length === 0 && <div className="text-xs text-slate-400">ยังไม่มีประวัติ</div>}
              {history.map((h) => (
                <div key={h.id} className="text-xs border-l-2 border-slate-200 pl-2 py-0.5">
                  <div className="text-slate-700">{h.detail}</div>
                  <div className="text-slate-400">
                    {h.actor} · {new Date(h.createdAt).toLocaleString("th-TH")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Add new migrant worker — creates the base record directly in employee_data
// (the same shared collection used by the existing "พนักงาน" menus), so the
// person immediately shows up everywhere else in the system too.
// ---------------------------------------------------------------------------
const AddMigrantWorkerModal = ({
  db,
  projectOptions,
  existingCodes,
  actorEmail,
  onClose,
  onCreated,
}: {
  db: ReturnType<typeof getFirestore>;
  projectOptions: string[];
  existingCodes: string[];
  actorEmail: string;
  onClose: () => void;
  onCreated: (employeeId: string) => void;
}) => {
  const [form, setForm] = useState({
    รหัสพนักงาน: "",
    ชื่อต้น: "นาย",
    ชื่อตัว: "",
    ชื่อสกุล: "",
    สัญชาติ: "",
    employee_type: "",
    โครงการ: "",
    ตำแหน่ง: "",
    start_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async () => {
    setError(null);
    const code = form.รหัสพนักงาน.trim();
    const firstName = form.ชื่อตัว.trim();
    const lastName = form.ชื่อสกุล.trim();
    const nationality = form.สัญชาติ.trim();

    if (!code || !firstName || !lastName) {
      setError("กรุณากรอก รหัสพนักงาน, ชื่อตัว และ ชื่อสกุล ให้ครบ");
      return;
    }
    if (!nationality) {
      setError("กรุณาระบุสัญชาติ");
      return;
    }
    if (!isMigrantWorker(nationality)) {
      setError("สัญชาติที่ระบุนับเป็น 'ไทย' — หน้านี้สำหรับแรงงานต่างด้าวเท่านั้น กรุณาเพิ่มที่เมนู 'พนักงาน' แทน");
      return;
    }
    if (!form.employee_type) {
      setError("กรุณาเลือกประเภทพนักงาน");
      return;
    }
    if (existingCodes.includes(code.toLowerCase())) {
      setError(`รหัสพนักงาน "${code}" มีอยู่ในระบบแล้ว`);
      return;
    }

    setSaving(true);
    try {
      const docId = code.replace(/[/.#${}\s]/g, "_");
      const docRef = doc(db, "CMG-HR-Database", "root", "employee_data", docId);
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        setError(`รหัสพนักงาน "${code}" มีอยู่ในระบบแล้ว`);
        setSaving(false);
        return;
      }

      await setDoc(docRef, {
        รหัสพนักงาน: code,
        ชื่อต้น: form.ชื่อต้น,
        ชื่อตัว: firstName,
        ชื่อสกุล: lastName,
        สัญชาติ: nationality,
        employee_type: form.employee_type,
        โครงการ: form.โครงการ || "",
        โครงการปัจจุบัน: form.โครงการ || "",
        ตำแหน่ง: form.ตำแหน่ง || "",
        start_date: form.start_date || "",
        สถานะพนักงาน: "ทำงาน",
      });

      await addDoc(collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_HISTORY_COLLECTION), {
        employeeId: docId,
        type: "onboarding",
        detail: `เพิ่มแรงงานต่างด้าวใหม่: ${firstName} ${lastName} (${nationality})`,
        actor: actorEmail,
        createdAt: Date.now(),
      });

      onCreated(docId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Plus size={16} className="text-blue-600" /> เพิ่มแรงงานต่างด้าว
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-500">
            ข้อมูลนี้จะถูกสร้างในทะเบียนพนักงานหลัก (เชื่อมกับระบบเดิม) แล้วจึงเปิดให้กรอกเอกสาร (พาสปอร์ต/Work Permit/วีซ่า/Border Pass) ต่อทันที
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="รหัสพนักงาน *">
              <input
                value={form.รหัสพนักงาน}
                onChange={(e) => set({ รหัสพนักงาน: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
            <Field label="คำนำหน้า">
              <select
                value={form.ชื่อต้น}
                onChange={(e) => set({ ชื่อต้น: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              >
                {["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ชื่อตัว *">
              <input
                value={form.ชื่อตัว}
                onChange={(e) => set({ ชื่อตัว: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
            <Field label="ชื่อสกุล *">
              <input
                value={form.ชื่อสกุล}
                onChange={(e) => set({ ชื่อสกุล: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
            <Field label="สัญชาติ *">
              <input
                value={form.สัญชาติ}
                onChange={(e) => set({ สัญชาติ: e.target.value })}
                placeholder="เช่น เมียนมา, กัมพูชา, ลาว"
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
            <Field label="ประเภทพนักงาน *">
              <select
                value={form.employee_type}
                onChange={(e) => set({ employee_type: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              >
                <option value="">— เลือก —</option>
                {EMPLOYEE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="โครงการ">
              <select
                value={form.โครงการ}
                onChange={(e) => set({ โครงการ: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              >
                <option value="">— ไม่ระบุ —</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ตำแหน่ง">
              <input
                value={form.ตำแหน่ง}
                onChange={(e) => set({ ตำแหน่ง: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
            <Field label="วันที่เริ่มงาน">
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => set({ start_date: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md"
              />
            </Field>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md">
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3.5 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก และไปกรอกเอกสาร"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[10px] uppercase text-slate-400 font-semibold">{label}</label>
    <div className="mt-0.5">{children}</div>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
    <div className="text-slate-800 font-medium">{value}</div>
  </div>
);

const DocumentCard = ({
  typeKey,
  label,
  summary,
  draft,
  canManage,
  saving,
  uploading,
  onChange,
  onSave,
  onUpload,
  employeeId,
  db,
  onRemoveFile,
}: {
  typeKey: MigrantDocumentTypeKey;
  label: string;
  summary: WorkerDocumentSummary;
  draft: MigrantDocumentEntry;
  canManage: boolean;
  saving: boolean;
  uploading: boolean;
  onChange: (patch: Partial<MigrantDocumentEntry>) => void;
  onSave: () => void;
  onUpload: (file: File) => void;
  employeeId: string;
  db: ReturnType<typeof getFirestore>;
  onRemoveFile: (record: MigrantDocumentFileRecord) => void;
}) => {
  const [fileRecords, setFileRecords] = useState<MigrantDocumentFileRecord[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", MIGRANT_DOCUMENT_FILES_COLLECTION),
      where("employeeId", "==", employeeId),
      where("docType", "==", typeKey)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MigrantDocumentFileRecord));
      rows.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      setFileRecords(rows);
    });
    return () => unsub();
  }, [db, employeeId, typeKey]);

  const urgencyMeta = summary.completeness === "complete" ? URGENCY_META[summary.urgency] : null;

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        {urgencyMeta ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${urgencyMeta.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${urgencyMeta.dot}`} /> {urgencyMeta.label}
          </span>
        ) : (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${COMPLETENESS_META[summary.completeness].badge}`}>
            {COMPLETENESS_META[summary.completeness].label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase text-slate-400 font-semibold">เลขที่เอกสาร</label>
          <input
            disabled={!canManage}
            value={draft.docNumber || ""}
            onChange={(e) => onChange({ docNumber: e.target.value })}
            className="w-full mt-0.5 px-2 py-1 text-sm border border-slate-200 rounded-md disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase text-slate-400 font-semibold">วันหมดอายุ</label>
          <input
            type="date"
            disabled={!canManage}
            value={draft.expiryDate || ""}
            onChange={(e) => onChange({ expiryDate: e.target.value })}
            className="w-full mt-0.5 px-2 py-1 text-sm border border-slate-200 rounded-md disabled:bg-slate-50"
          />
        </div>
      </div>

      {canManage && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
          <label className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-md cursor-pointer hover:bg-slate-50 flex items-center gap-1">
            <Upload size={12} /> {uploading ? "กำลังอัปโหลด..." : "แนบไฟล์"}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {fileRecords.length > 0 && (
        <div className="mt-2 space-y-1">
          {fileRecords.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-md px-2 py-1">
              <a href={f.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 hover:underline truncate">
                <Paperclip size={12} /> {f.fileName}
              </a>
              {canManage && (
                <button onClick={() => onRemoveFile(f)} className="text-slate-400 hover:text-red-600 shrink-0">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
