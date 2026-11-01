import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, setDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Inbox,
  Link2,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  buildClinicPortalUrl,
  buildEmployeeFullName,
  canManageTrainingBatches,
  CONGENITAL_DISEASE_OPTIONS,
  DEFAULT_TRAINING_COURSE_OPTIONS,
  employeeProjectNames,
  generatePublicToken,
  getLatestHealthCheck,
  HEALTH_CHECK_RECORDS_COLLECTION,
  HealthCheckRecord,
  isMigrantNationality,
  TRAINING_BATCHES_COLLECTION,
  TRAINING_BATCH_STATUS_META,
  TRAINING_ENROLLMENTS_COLLECTION,
  TRAINING_ENROLLMENT_STATUS_META,
  TRAINING_LANGUAGE_OPTIONS,
  TrainingBatch,
  TrainingBatchStatus,
  TrainingEnrollment,
  TrainingEnrollmentStatus,
  TrainingLanguage,
} from "./trainingBatchConfig";
import { HealthCheckBadge, HealthCheckRowEditor, SharedFileUploadPanel } from "./HealthCheckControls";
import { generateAndDownloadTrainingNameListPdf, generateAndPreviewTrainingNameListPdf } from "../utils/trainingNameListPdf";
import { generateAndDownloadAccessBadgeRequestPdf, generateAndPreviewAccessBadgeRequestPdf } from "../utils/accessBadgeRequestPdf";
import {
  generateAndDownloadHuashiTrainingRequestFormPdf,
  generateAndPreviewHuashiTrainingRequestFormPdf,
  isHuashiTrainingRequestProject,
} from "../utils/huashiTrainingRequestFormPdf";
import {
  buildProjectAliasGroups,
  buildProjectDisplayKeys,
  checkProjectDocumentCompleteness,
  isSameProjectName,
  normalizeProjectDocumentRequirements,
  ProjectDocumentRequirement,
} from "./projectDocumentConfig";
import {
  buildContractorPortalUrl,
  CONTRACTOR_EMPLOYEE_TYPES,
  ContractorEmployeeType,
  createContractorLinkToken,
  PENDING_MEMBER_STATUS_META,
  TRAINING_CONTRACTOR_LINKS_COLLECTION,
  TRAINING_PENDING_MEMBERS_COLLECTION,
  TrainingContractorLink,
  TrainingPendingMember,
} from "./contractorPortalConfig";

export interface EmployeeRow {
  id: string;
  รหัสพนักงาน?: string;
  คำนำหน้าชื่อ?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  แผนก?: string;
  บริษัทผู้รับเหมา?: string;
  ชื่อชุด?: string;
  สัญชาติ?: string;
  เพศ?: string;
  เลขบัตรประชาชน?: string;
  สถานะพนักงาน?: string;
  โครงการ?: string;
  โครงการปัจจุบัน?: string;
  สถานะโครงการ?: string | string[];
  employee_type?: string;
  attachments?: Array<{ docType?: string }>;
  // เอกสารแรงงานต่างด้าว (ใบอนุญาตทำงาน/บัตรอนุญาตทำงาน/พาสปอร์ต/วีซ่า ฯลฯ) — ดู migrantWorkerConfig.ts
  // ใช้คำนวณช่อง "Identity verification document" ในใบปะหน้าแบบ HUASHI (J-078) อัตโนมัติ
  migrant_documents?: Record<string, { docNumber?: string; expiryDate?: string } | undefined>;
  // ฟิลด์เพิ่มเติม — ใช้ตอน export ข้อมูลทั้งชุดเพื่อไปทำใบปะหน้า/ใบรายคน (เช่น ใบขอออกบัตร)
  ชื่ออังกฤษ?: string;
  นามสกุลอังกฤษ?: string;
  วันเกิดปีเดือนวัน_คศ?: string;
  ศาสนา?: string;
  กรุ๊ปเลือด?: string;
  ที่อยู่บรรทัด_1?: string;
  ที่อยู่บรรทัด_2?: string;
  ที่อยู่บรรทัด_3?: string;
  แขวงตำบล?: string;
  เขตอำเภอ?: string;
  จังหวัด?: string;
  ประเทศ?: string;
  ไปรษณีย์?: string;
  โทรศัพท์?: string;
  อีเมล์?: string;
}

const INACTIVE_STATUSES = ["ลาออก", "เลิกจ้าง"];

const emptyBatchForm = (defaultProject: string) => ({
  project: defaultProject,
  courseName: DEFAULT_TRAINING_COURSE_OPTIONS[0],
  courseNameOther: "",
  date: "",
  timeSlot: "",
  location: "",
  trainer: "",
  capacity: "",
  note: "",
  // นัดตรวจสุขภาพ — แยกจากวันอบรม ไม่บังคับกรอกตอนสร้างรอบ (มากรอกทีหลังตอนจะสร้างลิงก์คลินิกก็ได้)
  healthCheckDate: "",
  healthCheckTimeSlot: "",
  healthCheckLocation: "",
});

export const TrainingBatchPage = ({ projectOptions = [] }: { projectOptions?: string[] }) => {
  const { firebaseUser, userProfile } = useAuth();
  const canManage = canManageTrainingBatches(userProfile?.role);
  const db = getFirestore();

  const [batches, setBatches] = useState<TrainingBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TrainingBatchStatus>("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [batchForm, setBatchForm] = useState(emptyBatchForm(projectOptions[0] || ""));
  const [saving, setSaving] = useState(false);

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // ----- Realtime subscriptions -----
  useEffect(() => {
    setLoadingBatches(true);
    const unsub = onSnapshot(
      collection(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingBatch));
        rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setBatches(rows);
        setLoadingBatches(false);
        setBatchError(null);
      },
      (err) => {
        console.error("[TrainingBatchPage] Firestore read failed (training_batches):", err);
        setBatchError(`อ่านข้อมูลรอบอบรมไม่สำเร็จ: ${err.message}`);
        setLoadingBatches(false);
      }
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingEnrollment));
      setEnrollments(rows);
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "employee_data"), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as EmployeeRow))
        .filter((e) => !INACTIVE_STATUSES.includes(String(e.สถานะพนักงาน || "").trim()));
      setEmployees(rows);
    });
    return () => unsub();
  }, [db]);

  // เอกสารที่จำเป็นของแต่ละโครงการ (ตั้งค่าไว้ที่หน้า "โครงการ") ใช้แจ้งเตือนตอนเลือกพนักงานเข้ารอบ
  const [projectDocRequirements, setProjectDocRequirements] = useState<Map<string, ProjectDocumentRequirement[]>>(new Map());
  // alias ของชื่อโครงการ (เช่น "J74" <-> "PRJ-2026-J-074 - Building GMTP") สำหรับจับคู่ข้อมูลพนักงานเก่าที่กรอกโครงการเป็นรหัสสั้น
  const [projectAliasGroups, setProjectAliasGroups] = useState<string[][]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "projects"), (snap) => {
      const map = new Map<string, ProjectDocumentRequirement[]>();
      const rawProjects: Array<{ project_no?: unknown; project_name?: unknown }> = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        rawProjects.push({ project_no: data.project_no, project_name: data.project_name });
        const requirements = normalizeProjectDocumentRequirements(data.required_documents);
        if (requirements.length === 0) return;
        buildProjectDisplayKeys({ project_no: data.project_no, project_name: data.project_name }).forEach((key) => {
          map.set(key, requirements);
        });
      });
      setProjectDocRequirements(map);
      setProjectAliasGroups(buildProjectAliasGroups(rawProjects));
    });
    return () => unsub();
  }, [db]);

  const enrollmentCountByBatch = useMemo(() => {
    const map = new Map<string, number>();
    enrollments.forEach((en) => {
      map.set(en.batchId, (map.get(en.batchId) || 0) + 1);
    });
    return map;
  }, [enrollments]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (projectFilter !== "all" && b.project !== projectFilter) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      return true;
    });
  }, [batches, projectFilter, statusFilter]);

  const activeBatch = useMemo(() => batches.find((b) => b.id === activeBatchId) || null, [batches, activeBatchId]);

  // พนักงานที่เคยลงทะเบียนอบรม (รอบไหนก็ได้) ของโครงการเดียวกับ activeBatch มาแล้ว — ใช้ตัดออกจาก
  // รายชื่อที่ให้ HR เลือกตอนสร้างลิงก์ผู้รับเหมาใหม่ (ไม่ต้องอบรมซ้ำ)
  const projectEnrolledEmployeeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeBatch) return ids;
    enrollments.forEach((en) => {
      if (isSameProjectName(en.project, activeBatch.project, projectAliasGroups)) ids.add(en.employeeId);
    });
    return ids;
  }, [enrollments, activeBatch, projectAliasGroups]);

  // ----- Create batch -----
  const openCreateForm = () => {
    setBatchForm(emptyBatchForm(projectFilter !== "all" ? projectFilter : projectOptions[0] || ""));
    setShowCreateForm(true);
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.project.trim()) {
      window.alert("กรุณาเลือกโครงการ");
      return;
    }
    if (!batchForm.date) {
      window.alert("กรุณาระบุวันที่อบรม");
      return;
    }
    const courseName =
      batchForm.courseName === "อื่นๆ (ระบุ)" ? batchForm.courseNameOther.trim() : batchForm.courseName;
    if (!courseName) {
      window.alert("กรุณาระบุชื่อหลักสูตร");
      return;
    }
    setSaving(true);
    try {
      const ref = doc(collection(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION));
      const record: Record<string, unknown> = {
        project: batchForm.project.trim(),
        courseName,
        date: batchForm.date,
        timeSlot: batchForm.timeSlot.trim(),
        location: batchForm.location.trim(),
        trainer: batchForm.trainer.trim(),
        status: "planned",
        note: batchForm.note.trim(),
        createdByUid: firebaseUser?.uid || "",
        createdByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // Firestore ไม่รับ field value เป็น undefined — ใส่ capacity เฉพาะตอนที่กรอกมาเท่านั้น
      if (batchForm.capacity.trim()) {
        record.capacity = Number(batchForm.capacity);
      }
      // นัดตรวจสุขภาพ — ไม่บังคับตอนสร้างรอบ ใส่เฉพาะตอนที่กรอกมา (จะมากรอกทีหลังก็ได้)
      if (batchForm.healthCheckDate) record.healthCheckDate = batchForm.healthCheckDate;
      if (batchForm.healthCheckTimeSlot.trim()) record.healthCheckTimeSlot = batchForm.healthCheckTimeSlot.trim();
      if (batchForm.healthCheckLocation.trim()) record.healthCheckLocation = batchForm.healthCheckLocation.trim();
      await setDoc(ref, record);
      setShowCreateForm(false);
      setActiveBatchId(ref.id);
    } catch (err) {
      window.alert(`สร้างรอบอบรมไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeBatchStatus = async (batch: TrainingBatch, status: TrainingBatchStatus) => {
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id), {
        status,
        updatedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`อัปเดตสถานะไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  const handleDeleteBatch = async (batch: TrainingBatch) => {
    if (!window.confirm(`ยืนยันลบรอบอบรม "${batch.courseName}" วันที่ ${batch.date}? (รายชื่อที่เพิ่มไว้ในรอบนี้จะลบไปด้วย)`)) return;
    try {
      const related = enrollments.filter((en) => en.batchId === batch.id);
      await Promise.all(
        related.map((en) => deleteDoc(doc(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION, en.id)))
      );
      await deleteDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id));
      if (activeBatchId === batch.id) setActiveBatchId(null);
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  // ----- Detail view -----
  if (activeBatch) {
    return (
      <TrainingBatchDetail
        batch={activeBatch}
        enrollments={enrollments.filter((en) => en.batchId === activeBatch.id)}
        employees={employees}
        canManage={canManage}
        documentRequirements={projectDocRequirements.get(activeBatch.project) || []}
        projectAliasGroups={projectAliasGroups}
        alreadyTrainedEmployeeIds={projectEnrolledEmployeeIds}
        onBack={() => setActiveBatchId(null)}
        onChangeStatus={(status) => handleChangeBatchStatus(activeBatch, status)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <GraduationCap className="text-blue-600" size={20} />
            ส่งพนักงานอบรมก่อนเข้างาน (Safety Induction Training)
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            สร้างรอบอบรม เลือกรายชื่อพนักงานเข้ารอบ ตรวจสอบความครบถ้วนของเอกสาร และบันทึกผลการอบรม — ใช้ได้ทุกโครงการ
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus size={16} /> สร้างรอบอบรมใหม่
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="input max-w-[220px]"
        >
          <option value="all">ทุกโครงการ</option>
          {projectOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | TrainingBatchStatus)}
          className="input max-w-[180px]"
        >
          <option value="all">ทุกสถานะ</option>
          {Object.entries(TRAINING_BATCH_STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        {loadingBatches ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={20} /> กำลังโหลดข้อมูล...
          </div>
        ) : batchError ? (
          <div className="flex flex-col items-center justify-center h-48 text-red-500 gap-2 px-4 text-center">
            <AlertTriangle size={28} />
            <p className="text-sm font-semibold">เกิดข้อผิดพลาดในการอ่านข้อมูล</p>
            <p className="text-xs text-gray-500 max-w-md">{batchError}</p>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">ยังไม่มีรอบอบรม</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">วันที่/เวลา</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">หลักสูตร</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โครงการ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานที่</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">วิทยากร</th>
                <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จำนวนคน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะ</th>
                {canManage && <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBatches.map((b) => {
                const count = enrollmentCountByBatch.get(b.id) || 0;
                const meta = TRAINING_BATCH_STATUS_META[b.status] || TRAINING_BATCH_STATUS_META.planned;
                return (
                  <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setActiveBatchId(b.id)}>
                    <td className="p-3 text-gray-800 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        {b.date || "-"}
                      </div>
                      <div className="text-[11px] text-gray-400">{b.timeSlot || "-"}</div>
                    </td>
                    <td className="p-3 text-gray-700 whitespace-nowrap">{b.courseName || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{b.project || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{b.location || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{b.trainer || "-"}</td>
                    <td className="p-3 text-center text-gray-700 whitespace-nowrap">
                      {count}
                      {b.capacity ? ` / ${b.capacity}` : ""}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteBatch(b)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          title="ลบรอบอบรม"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <form onSubmit={handleCreateBatch} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Plus className="text-blue-600" size={20} />
                  สร้างรอบอบรมใหม่
                </h3>
              </div>
              <button type="button" onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="โครงการ *">
                <select
                  required
                  value={batchForm.project}
                  onChange={(e) => setBatchForm((f) => ({ ...f, project: e.target.value }))}
                  className="input"
                >
                  <option value="" disabled>เลือกโครงการ...</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="วันที่อบรม *">
                <input
                  required
                  type="date"
                  value={batchForm.date}
                  onChange={(e) => setBatchForm((f) => ({ ...f, date: e.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="หลักสูตร *">
                <select
                  value={batchForm.courseName}
                  onChange={(e) => setBatchForm((f) => ({ ...f, courseName: e.target.value }))}
                  className="input"
                >
                  {DEFAULT_TRAINING_COURSE_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              {batchForm.courseName === "อื่นๆ (ระบุ)" && (
                <Field label="ระบุชื่อหลักสูตร *">
                  <input
                    required
                    value={batchForm.courseNameOther}
                    onChange={(e) => setBatchForm((f) => ({ ...f, courseNameOther: e.target.value }))}
                    className="input"
                  />
                </Field>
              )}
              <Field label="ช่วงเวลา">
                <input
                  placeholder="เช่น 08:00-12:00"
                  value={batchForm.timeSlot}
                  onChange={(e) => setBatchForm((f) => ({ ...f, timeSlot: e.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="สถานที่">
                <input value={batchForm.location} onChange={(e) => setBatchForm((f) => ({ ...f, location: e.target.value }))} className="input" />
              </Field>
              <Field label="วิทยากร">
                <input value={batchForm.trainer} onChange={(e) => setBatchForm((f) => ({ ...f, trainer: e.target.value }))} className="input" />
              </Field>
              <Field label="จำนวนรับสูงสุด (ไม่บังคับ)">
                <input
                  type="number"
                  min={0}
                  value={batchForm.capacity}
                  onChange={(e) => setBatchForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="input"
                />
              </Field>
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <p className="text-xs font-semibold text-sky-700 mb-2">
                  นัดตรวจสุขภาพ (ไม่บังคับ — กรอกเฉพาะกรณีตรวจคนละวัน/คนละสถานที่กับวันอบรม ไม่กรอกตอนนี้ก็ได้ มากรอกทีหลังก่อนสร้างลิงก์คลินิกได้)
                </p>
              </div>
              <Field label="วันที่ตรวจสุขภาพ">
                <input
                  type="date"
                  value={batchForm.healthCheckDate}
                  onChange={(e) => setBatchForm((f) => ({ ...f, healthCheckDate: e.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="ช่วงเวลาตรวจสุขภาพ">
                <input
                  placeholder="เช่น 08:00-12:00"
                  value={batchForm.healthCheckTimeSlot}
                  onChange={(e) => setBatchForm((f) => ({ ...f, healthCheckTimeSlot: e.target.value }))}
                  className="input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="สถานที่ตรวจสุขภาพ (เช่น ชื่อคลินิก/โรงพยาบาล)">
                  <input
                    value={batchForm.healthCheckLocation}
                    onChange={(e) => setBatchForm((f) => ({ ...f, healthCheckLocation: e.target.value }))}
                    className="input"
                  />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label="หมายเหตุ">
                  <textarea
                    value={batchForm.note}
                    onChange={(e) => setBatchForm((f) => ({ ...f, note: e.target.value }))}
                    className="input min-h-[70px]"
                  />
                </Field>
              </div>
            </div>
            <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
              <button type="button" onClick={() => setShowCreateForm(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                สร้างรอบอบรม
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Batch detail: roster + employee picker
// ---------------------------------------------------------------------------
const TrainingBatchDetail = ({
  batch,
  enrollments,
  employees,
  canManage,
  documentRequirements,
  projectAliasGroups,
  alreadyTrainedEmployeeIds,
  onBack,
  onChangeStatus,
}: {
  batch: TrainingBatch;
  enrollments: TrainingEnrollment[];
  employees: EmployeeRow[];
  canManage: boolean;
  documentRequirements: ProjectDocumentRequirement[];
  projectAliasGroups: string[][];
  alreadyTrainedEmployeeIds: Set<string>;
  onBack: () => void;
  onChangeStatus: (status: TrainingBatchStatus) => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();
  const [showPicker, setShowPicker] = useState(false);
  const [healthRecords, setHealthRecords] = useState<HealthCheckRecord[]>([]);
  const [clinicLinkCopied, setClinicLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [expandedHealthRow, setExpandedHealthRow] = useState<string | null>(null);
  const [showSharedUpload, setShowSharedUpload] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(batch.healthCheckDate || "");
  const [scheduleTimeSlot, setScheduleTimeSlot] = useState(batch.healthCheckTimeSlot || "");
  const [scheduleLocation, setScheduleLocation] = useState(batch.healthCheckLocation || "");
  const [savingSchedule, setSavingSchedule] = useState(false);
  // พับแผงลิงก์คลินิกเก็บไว้เป็นค่าเริ่มต้นถ้านัดตรวจ+สร้างลิงก์ไว้แล้ว เพื่อให้ตารางรายชื่อมีพื้นที่แสดงผลเยอะขึ้น
  const [clinicPanelOpen, setClinicPanelOpen] = useState(
    !((batch.healthCheckDate || "").trim() && (batch.healthCheckTimeSlot || "").trim() && (batch.healthCheckLocation || "").trim() && batch.healthCheckToken)
  );

  // ลิงก์สำหรับผู้รับเหมา/Supply manpower กรอกรายชื่อ+เอกสารเองต่อบริษัท ภายในรอบนี้
  const [contractorPanelOpen, setContractorPanelOpen] = useState(false);
  const [contractorLinks, setContractorLinks] = useState<TrainingContractorLink[]>([]);
  const [pendingMembers, setPendingMembers] = useState<TrainingPendingMember[]>([]);
  const [newLinkCompany, setNewLinkCompany] = useState("");
  const [showContractorPicker, setShowContractorPicker] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // นำเข้ารายชื่อใหม่ (ยังไม่มีในระบบ) จากไฟล์ Excel ที่ export แบบฟอร์มให้กรอกแล้วอัปโหลดกลับมา
  const meta = TRAINING_BATCH_STATUS_META[batch.status] || TRAINING_BATCH_STATUS_META.planned;
  const scheduleComplete =
    !!(batch.healthCheckDate || "").trim() &&
    !!(batch.healthCheckTimeSlot || "").trim() &&
    !!(batch.healthCheckLocation || "").trim();
  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.employeeId)), [enrollments]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", HEALTH_CHECK_RECORDS_COLLECTION),
      where("batchId", "==", batch.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      setHealthRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as HealthCheckRecord)));
    });
    return () => unsub();
  }, [db, batch.id]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION),
      where("batchId", "==", batch.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      setContractorLinks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingContractorLink)));
    });
    return () => unsub();
  }, [db, batch.id]);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", TRAINING_PENDING_MEMBERS_COLLECTION),
      where("batchId", "==", batch.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingMembers(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingPendingMember))
          .sort((a, b) => b.submittedAt - a.submittedAt)
      );
    });
    return () => unsub();
  }, [db, batch.id]);

  // บริษัทผู้รับเหมา/Supply manpower ของโครงการนี้ (สำหรับให้ HR เลือกตอนสร้างลิงก์ใหม่)
  const contractorCompanies = useMemo(() => {
    const names = new Set<string>();
    employees.forEach((e) => {
      const empType = e.employee_type || "";
      if (!CONTRACTOR_EMPLOYEE_TYPES.includes(empType as ContractorEmployeeType)) return;
      if (!employeeProjectNames(e).some((p) => isSameProjectName(p, batch.project, projectAliasGroups))) return;
      const company = (e.บริษัทผู้รับเหมา || "").trim();
      if (company) names.add(company);
    });
    return Array.from(names).sort();
  }, [employees, batch.project, projectAliasGroups]);

  // รายชื่อพนักงานของบริษัทที่เลือก ซึ่งยังไม่เคยลงทะเบียนอบรมในโครงการนี้มาก่อน — ให้ HR เลือกเฉพาะคนที่จะส่งลิงก์ให้ครั้งนี้
  const contractorLinkCandidates = useMemo(() => {
    const company = newLinkCompany.trim();
    if (!company) return [];
    return employees.filter((e) => {
      const empType = e.employee_type || "";
      if (!CONTRACTOR_EMPLOYEE_TYPES.includes(empType as ContractorEmployeeType)) return false;
      if ((e.บริษัทผู้รับเหมา || "").trim() !== company) return false;
      if (!employeeProjectNames(e).some((p) => isSameProjectName(p, batch.project, projectAliasGroups))) return false;
      if (alreadyTrainedEmployeeIds.has(e.id)) return false;
      return true;
    });
  }, [employees, newLinkCompany, batch.project, projectAliasGroups, alreadyTrainedEmployeeIds]);

  const handleCreateContractorLink = async (invitedEmployeeIds: string[]) => {
    const company = newLinkCompany.trim();
    if (!company) return;
    setCreatingLink(true);
    try {
      const token = createContractorLinkToken();
      const matchedEmployee = employees.find((e) => invitedEmployeeIds.includes(e.id));
      const employeeType = (matchedEmployee?.employee_type as ContractorEmployeeType) || "";
      const record: Omit<TrainingContractorLink, "id"> = {
        batchId: batch.id,
        project: batch.project,
        company,
        employeeType,
        invitedEmployeeIds,
        createdAt: Date.now(),
        createdByUid: firebaseUser?.uid || "",
        createdByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
      };
      await setDoc(doc(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION, token), record);
      setNewLinkCompany("");
      setShowContractorPicker(false);
    } catch (err) {
      window.alert(`สร้างลิงก์ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyContractorLink = async (link: TrainingContractorLink) => {
    const url = buildContractorPortalUrl(link.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      window.prompt("คัดลอกลิงก์นี้:", url);
    }
  };

  const handleApprovePendingMember = async (member: TrainingPendingMember) => {
    setReviewingId(member.id);
    try {
      const empRef = doc(collection(db, "CMG-HR-Database", "root", "employee_data"));
      const nameParts = member.fullName.trim().split(/\s+/);
      const docCheckRequirements = documentRequirements;
      const isMigrant = isMigrantNationality(member.nationality);
      const docCheck = checkProjectDocumentCompleteness(member.attachments, docCheckRequirements, isMigrant);
      await setDoc(empRef, {
        ชื่อตัว: nameParts[0] || member.fullName,
        ชื่อสกุล: nameParts.slice(1).join(" "),
        ตำแหน่ง: member.position || "",
        บริษัทผู้รับเหมา: member.company,
        สัญชาติ: member.nationality || "",
        เลขบัตรประชาชน: member.idCardNumber || "",
        เพศ: member.gender || "",
        employee_type: member.employeeType || "",
        โครงการ: member.project,
        สถานะพนักงาน: "ทำงาน",
        attachments: member.attachments || [],
        createdFromContractorPortal: true,
        createdAt: Date.now(),
      });

      const enrollRef = doc(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION));
      await setDoc(enrollRef, {
        batchId: batch.id,
        project: member.project,
        employeeId: empRef.id,
        employeeCode: empRef.id,
        employeeName: member.fullName,
        employeeFirstName: nameParts[0] || member.fullName,
        position: member.position || "",
        company: member.company,
        nationality: member.nationality || "",
        idCardNumber: member.idCardNumber || "",
        gender: member.gender || "",
        language: "th",
        status: "registered",
        documentSnapshot: {
          isMigrant,
          documentsComplete: docCheck.complete,
          missingDocuments: docCheck.missing.map((m) => m.label),
          checkedAt: Date.now(),
        },
        enrolledByUid: firebaseUser?.uid || "",
        enrolledByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        enrolledAt: Date.now(),
        updatedAt: Date.now(),
      });

      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_PENDING_MEMBERS_COLLECTION, member.id), {
        status: "approved",
        approvedEmployeeId: empRef.id,
        reviewedByUid: firebaseUser?.uid || "",
        reviewedByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        reviewedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`อนุมัติไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectPendingMember = async (member: TrainingPendingMember) => {
    if (!window.confirm(`ปฏิเสธรายชื่อ "${member.fullName}"?`)) return;
    setReviewingId(member.id);
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_PENDING_MEMBERS_COLLECTION, member.id), {
        status: "rejected",
        reviewedByUid: firebaseUser?.uid || "",
        reviewedByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        reviewedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`ปฏิเสธไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setReviewingId(null);
    }
  };

  const recordByEmployee = useMemo(() => {
    const map = new Map<string, HealthCheckRecord>();
    enrollments.forEach((e) => {
      const latest = getLatestHealthCheck(healthRecords, e.employeeId);
      if (latest) map.set(e.employeeId, latest);
    });
    return map;
  }, [enrollments, healthRecords]);

  useEffect(() => {
    setScheduleDate(batch.healthCheckDate || "");
    setScheduleTimeSlot(batch.healthCheckTimeSlot || "");
    setScheduleLocation(batch.healthCheckLocation || "");
  }, [batch.healthCheckDate, batch.healthCheckTimeSlot, batch.healthCheckLocation]);

  const clinicLink = batch.healthCheckToken ? buildClinicPortalUrl(batch.healthCheckToken) : null;

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id), {
        healthCheckDate: scheduleDate,
        healthCheckTimeSlot: scheduleTimeSlot.trim(),
        healthCheckLocation: scheduleLocation.trim(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleGenerateClinicLink = async () => {
    if (!scheduleComplete) {
      window.alert("กรุณากรอกและบันทึกช่วงเวลา + สถานที่ก่อนสร้างลิงก์คลินิก");
      return;
    }
    setGeneratingLink(true);
    try {
      const token = generatePublicToken();
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id), {
        healthCheckToken: token,
        updatedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`สร้างลิงก์ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyClinicLink = async () => {
    if (!clinicLink) return;
    try {
      await navigator.clipboard.writeText(clinicLink);
      setClinicLinkCopied(true);
      setTimeout(() => setClinicLinkCopied(false), 2000);
    } catch {
      window.prompt("คัดลอกลิงก์นี้:", clinicLink);
    }
  };

  const handleRemove = async (en: TrainingEnrollment) => {
    if (!window.confirm(`เอา ${en.employeeName} ออกจากรอบนี้?`)) return;
    try {
      await deleteDoc(doc(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION, en.id));
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  const handleUpdateEnrollment = async (en: TrainingEnrollment, patch: Partial<TrainingEnrollment>) => {
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION, en.id), {
        ...patch,
        updatedAt: Date.now(),
      });
    } catch (err) {
      window.alert(`อัปเดตไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  const handleAddEmployees = async (picked: EmployeeRow[], language: TrainingLanguage) => {
    try {
      await Promise.all(
        picked.map((emp) => {
          const ref = doc(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION));
          const isMigrant = isMigrantNationality(emp.สัญชาติ);
          const docCheck = checkProjectDocumentCompleteness(
            emp.attachments as Array<{ docType?: string }> | undefined,
            documentRequirements,
            isMigrant
          );
          const record: Omit<TrainingEnrollment, "id"> = {
            batchId: batch.id,
            project: batch.project,
            employeeId: emp.id,
            employeeCode: emp.รหัสพนักงาน || "",
            employeeName: buildEmployeeFullName(emp),
            employeeFirstName: emp.ชื่อตัว || "",
            position: emp.ตำแหน่ง || "",
            // "Company" ในใบปะหน้า/รายชื่อเข้าอบรม ให้เป็น CMG เสมอ เพราะทุกคน (รวมผู้รับเหมา/Supply manpower)
            // เข้ามาทำงานผ่าน CMG — ส่วนบริษัทผู้รับเหมาจริงยังเก็บแยกไว้ที่ข้อมูลพนักงาน (employee_data) ตามเดิม
            company: "CMG Engineering & Construction",
            nationality: emp.สัญชาติ || "",
            idCardNumber: emp.เลขบัตรประชาชน || "",
            gender: emp.เพศ || "",
            language,
            status: "registered",
            documentSnapshot: {
              isMigrant,
              documentsComplete: docCheck.complete,
              missingDocuments: docCheck.missing.map((m) => m.label),
              checkedAt: Date.now(),
            },
            enrolledByUid: firebaseUser?.uid || "",
            enrolledByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
            enrolledAt: Date.now(),
            updatedAt: Date.now(),
          };
          return setDoc(ref, record);
        })
      );
      setShowPicker(false);
    } catch (err) {
      window.alert(`เพิ่มรายชื่อไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  const [generatingNameListPdf, setGeneratingNameListPdf] = useState(false);

  const handlePreviewTrainingNameListPdf = async () => {
    if (enrollments.length === 0) {
      window.alert("ยังไม่มีรายชื่อในรอบนี้ให้สร้างใบปะหน้า");
      return;
    }
    setGeneratingNameListPdf(true);
    try {
      // โครงการ HUASHI Building B (J-078) ต้องใช้แบบฟอร์มของลูกค้าเอง (Training Request Form rev.0)
      // ซึ่งมีช่องเอกสารยืนยันตัวตนแรงงานต่างด้าวเพิ่มเติม ส่วนโครงการอื่นยังใช้ใบปะหน้าแบบทั่วไปเหมือนเดิม
      if (isHuashiTrainingRequestProject(batch.project)) {
        await generateAndPreviewHuashiTrainingRequestFormPdf(batch, enrollments, employees);
      } else {
        await generateAndPreviewTrainingNameListPdf(batch, enrollments);
      }
    } catch (err) {
      window.alert(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingNameListPdf(false);
    }
  };

  const handleDownloadTrainingNameListPdf = async () => {
    if (enrollments.length === 0) {
      window.alert("ยังไม่มีรายชื่อในรอบนี้ให้สร้างใบปะหน้า");
      return;
    }
    setGeneratingNameListPdf(true);
    try {
      if (isHuashiTrainingRequestProject(batch.project)) {
        await generateAndDownloadHuashiTrainingRequestFormPdf(batch, enrollments, employees);
      } else {
        await generateAndDownloadTrainingNameListPdf(batch, enrollments);
      }
    } catch (err) {
      window.alert(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingNameListPdf(false);
    }
  };

  const [generatingBadgeRequestPdf, setGeneratingBadgeRequestPdf] = useState(false);

  const handlePreviewAccessBadgeRequestPdf = async () => {
    if (enrollments.length === 0) {
      window.alert("ยังไม่มีรายชื่อในรอบนี้ให้สร้างใบรายคน");
      return;
    }
    setGeneratingBadgeRequestPdf(true);
    try {
      await generateAndPreviewAccessBadgeRequestPdf(batch, enrollments, employees, recordByEmployee);
    } catch (err) {
      window.alert(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingBadgeRequestPdf(false);
    }
  };

  const handleDownloadAccessBadgeRequestPdf = async () => {
    if (enrollments.length === 0) {
      window.alert("ยังไม่มีรายชื่อในรอบนี้ให้สร้างใบรายคน");
      return;
    }
    setGeneratingBadgeRequestPdf(true);
    try {
      await generateAndDownloadAccessBadgeRequestPdf(batch, enrollments, employees, recordByEmployee);
    } catch (err) {
      window.alert(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingBadgeRequestPdf(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
            <ChevronLeft size={16} /> กลับไปรายการรอบอบรม
          </button>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            {batch.courseName}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {batch.project} • อบรม: {batch.date} {batch.timeSlot ? `(${batch.timeSlot})` : ""} ที่ {batch.location || "-"} • วิทยากร: {batch.trainer || "-"}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-1">
            <select
              value={batch.status}
              onChange={(e) => onChangeStatus(e.target.value as TrainingBatchStatus)}
              className="input sm:!py-1.5 sm:!px-2 sm:!text-xs max-w-[160px] sm:max-w-[130px] shrink-0"
            >
              {Object.entries(TRAINING_BATCH_STATUS_META).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-blue-600 text-white rounded-lg text-sm sm:text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <UserPlus size={16} className="sm:hidden" /><UserPlus size={14} className="hidden sm:block" /> เพิ่มรายชื่อ
            </button>
            <button
              onClick={handlePreviewTrainingNameListPdf}
              disabled={enrollments.length === 0 || generatingNameListPdf}
              title="ดูตัวอย่างใบปะหน้า (Training Name List) ที่กรอกชื่อ/บริษัท/ตำแหน่งให้อัตโนมัติ เหลือแต่เซ็นชื่อหน้างาน"
              className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded-lg text-sm sm:text-xs font-semibold hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {generatingNameListPdf ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <FileSpreadsheet size={16} className="sm:hidden" /><FileSpreadsheet size={14} className="hidden sm:block" />
                </>
              )}
              ดูตัวอย่างใบปะหน้า
            </button>
            <button
              onClick={handleDownloadTrainingNameListPdf}
              disabled={enrollments.length === 0 || generatingNameListPdf}
              title="ดาวน์โหลด PDF ใบปะหน้า (Training Name List) พร้อมพิมพ์ให้คนเซ็นชื่อหน้างาน"
              className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-indigo-700 text-white rounded-lg text-sm sm:text-xs font-semibold hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download size={16} className="sm:hidden" /><Download size={14} className="hidden sm:block" /> ดาวน์โหลดใบปะหน้า (PDF)
            </button>
            <button
              onClick={handlePreviewAccessBadgeRequestPdf}
              disabled={enrollments.length === 0 || generatingBadgeRequestPdf}
              title="ดูตัวอย่างใบรายคน (Access Badge Request) — กรอกข้อมูลส่วนตัวแต่ละคนให้อัตโนมัติ เหลือแต่เซ็นชื่อ"
              className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-white border border-teal-300 text-teal-700 rounded-lg text-sm sm:text-xs font-semibold hover:bg-teal-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {generatingBadgeRequestPdf ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <FileSpreadsheet size={16} className="sm:hidden" /><FileSpreadsheet size={14} className="hidden sm:block" />
                </>
              )}
              ดูตัวอย่างใบรายคน
            </button>
            <button
              onClick={handleDownloadAccessBadgeRequestPdf}
              disabled={enrollments.length === 0 || generatingBadgeRequestPdf}
              title="ดาวน์โหลด PDF ใบรายคน (Access Badge Request) ทุกคนในรอบนี้ รวมเป็นไฟล์เดียว คนละ 1 หน้า"
              className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-teal-700 text-white rounded-lg text-sm sm:text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download size={16} className="sm:hidden" /><Download size={14} className="hidden sm:block" /> ดาวน์โหลดใบรายคน (PDF)
            </button>
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 min-w-0 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-sky-800 flex items-center gap-1.5 flex-wrap min-w-0">
              <Stethoscope size={16} className="shrink-0" /> ลิงก์สาธารณะสำหรับคลินิกตรวจสุขภาพ
              {scheduleComplete ? (
                <span className="text-xs font-normal text-sky-700">
                  — นัดตรวจ {batch.healthCheckDate} ({batch.healthCheckTimeSlot}) ที่ {batch.healthCheckLocation}
                  {clinicLink ? " • สร้างลิงก์แล้ว" : ""}
                </span>
              ) : (
                <span className="text-xs font-normal text-amber-700">— ยังไม่ได้กรอกวัน/เวลา/สถานที่ตรวจ</span>
              )}
            </span>
            <button
              onClick={() => setClinicPanelOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 whitespace-nowrap shrink-0"
            >
              <Link2 size={13} /> จัดการลิงก์คลินิก
            </button>
          </div>

          <div className="flex-1 min-w-0 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-violet-800 flex items-center gap-1.5 flex-wrap min-w-0">
              <UserPlus size={16} className="shrink-0" /> ลิงก์สำหรับผู้รับเหมา / Supply manpower
              <span className="text-xs font-normal text-violet-700">
                — {contractorLinks.length} บริษัท{pendingMembers.filter((m) => m.status === "pending").length > 0 ? ` • รออนุมัติ ${pendingMembers.filter((m) => m.status === "pending").length} คน` : ""}
              </span>
            </span>
            <button
              onClick={() => setContractorPanelOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 whitespace-nowrap shrink-0"
            >
              <Link2 size={13} /> จัดการลิงก์ผู้รับเหมา
            </button>
          </div>
        </div>
      )}

      {clinicPanelOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <h3 className="text-base font-bold text-sky-800 flex items-center gap-2">
                <Stethoscope size={18} /> ลิงก์สาธารณะสำหรับคลินิกตรวจสุขภาพ
              </h3>
              <button onClick={() => setClinicPanelOpen(false)} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex flex-col gap-3">
              <p className="text-xs text-sky-700">
                ส่งลิงก์นี้ให้คลินิก — คลินิกเปิดดูรายชื่อ ปรับวันที่/เวลา/สถานที่นัดตรวจ และบันทึกผลตรวจ/แนบใบรับรองแพทย์ได้เอง โดยไม่ต้อง login
                <br />
                <span className="text-sky-500">(นัดตรวจสุขภาพแยกจากวันอบรม — อาจเป็นคนละวัน/คนละสถานที่กันก็ได้ เช่น อบรมที่ไซต์งาน แต่ตรวจที่คลินิก)</span>
              </p>

              {scheduleComplete && (
                <p className="text-xs text-sky-800">
                  นัดตรวจ: <strong>{batch.healthCheckDate}</strong> ({batch.healthCheckTimeSlot}) ที่ <strong>{batch.healthCheckLocation}</strong>
                </p>
              )}

              {!scheduleComplete && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-amber-700">
                    ยังไม่ได้กรอก "วันที่/เวลา/สถานที่ตรวจสุขภาพ" ของรอบนี้ (คนละส่วนกับวันอบรม) — กรุณากรอกและบันทึกก่อนสร้างลิงก์คลินิก
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="input !bg-white"
                    />
                    <input
                      value={scheduleTimeSlot}
                      onChange={(e) => setScheduleTimeSlot(e.target.value)}
                      placeholder="ช่วงเวลา เช่น 08:00-12:00"
                      className="input !bg-white"
                    />
                    <input
                      value={scheduleLocation}
                      onChange={(e) => setScheduleLocation(e.target.value)}
                      placeholder="สถานที่ตรวจ (ชื่อคลินิก/รพ.)"
                      className="input !bg-white"
                    />
                  </div>
                  <button
                    onClick={handleSaveSchedule}
                    disabled={savingSchedule}
                    className="self-start flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingSchedule ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
                    บันทึกวันที่/เวลา/สถานที่ตรวจ
                  </button>
                </div>
              )}

              {clinicLink ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs bg-white border border-sky-200 rounded-lg px-2 py-1.5 break-all">{clinicLink}</code>
                  <button
                    onClick={handleCopyClinicLink}
                    className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 whitespace-nowrap"
                  >
                    <Copy size={13} /> {clinicLinkCopied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateClinicLink}
                  disabled={generatingLink || !scheduleComplete}
                  title={!scheduleComplete ? "กรุณากรอกและบันทึกช่วงเวลา + สถานที่ก่อน" : undefined}
                  className="self-start flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingLink ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />}
                  สร้างลิงก์สำหรับคลินิก
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {contractorPanelOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <h3 className="text-base font-bold text-violet-800 flex items-center gap-2">
                <UserPlus size={18} /> ลิงก์สำหรับผู้รับเหมา / Supply manpower
              </h3>
              <button onClick={() => setContractorPanelOpen(false)} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex flex-col gap-3">
              <p className="text-xs text-violet-700">
                สร้างลิงก์แยกต่อบริษัทผู้รับเหมา/Supply manpower — ส่งให้ผู้ประสานงานของบริษัทนั้นกรอกรายชื่อทีมงาน (จากที่ HR กรอกไว้แล้ว) แนบเอกสารตามที่โครงการกำหนด แล้วกดส่งเข้ารอบอบรมได้เอง หรือเพิ่มชื่อใหม่ส่งให้ HR อนุมัติ
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newLinkCompany}
                  onChange={(e) => setNewLinkCompany(e.target.value)}
                  className="input !w-auto !bg-white"
                >
                  <option value="">เลือกบริษัทผู้รับเหมา...</option>
                  {contractorCompanies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowContractorPicker(true)}
                  disabled={!newLinkCompany.trim() || creatingLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  {creatingLink ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
                  เลือกรายชื่อ & สร้างลิงก์
                </button>
              </div>

              {contractorCompanies.length === 0 && (
                <p className="text-xs text-violet-500">ยังไม่มีพนักงานกลุ่ม Supply manpower / Sub contractor ที่กรอก "บริษัทผู้รับเหมา" ในโครงการนี้ (HR ต้องกรอกชื่อพนักงาน + ระบุฟิลด์ "บริษัทผู้รับเหมา" ก่อนอย่างน้อย 1 คน เพื่อให้ระบบรู้จักชื่อบริษัท)</p>
              )}

              {contractorLinks.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {contractorLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 flex-wrap bg-white border border-violet-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{link.company}</span>
                      <code className="text-xs text-gray-500 break-all flex-1 min-w-[160px]">{buildContractorPortalUrl(link.id)}</code>
                      <button
                        onClick={() => handleCopyContractorLink(link)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 whitespace-nowrap"
                      >
                        <Copy size={12} /> {copiedLinkId === link.id ? "คัดลอกแล้ว" : "คัดลอก"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {pendingMembers.length > 0 && (
                <div className="border-t border-violet-200 pt-2 mt-1 flex flex-col gap-1.5">
                  <h4 className="text-xs font-bold text-violet-800">รายชื่อใหม่จากผู้รับเหมา</h4>
                  {pendingMembers.map((member) => {
                    const statusMeta = PENDING_MEMBER_STATUS_META[member.status];
                    return (
                      <div key={member.id} className="flex items-center gap-2 flex-wrap bg-white border border-violet-200 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{member.fullName}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{member.company} • {member.position || "-"} • เอกสาร {member.attachments.length} ไฟล์</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.cls}`}>{statusMeta.label}</span>
                        {member.status === "pending" && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <button
                              onClick={() => handleApprovePendingMember(member)}
                              disabled={reviewingId === member.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {reviewingId === member.id ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle2 size={12} />}
                              อนุมัติ
                            </button>
                            <button
                              onClick={() => handleRejectPendingMember(member)}
                              disabled={reviewingId === member.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-200 disabled:opacity-50"
                            >
                              ปฏิเสธ
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Users size={16} />
        รายชื่อในรอบนี้: {enrollments.length}
        {batch.capacity ? ` / ${batch.capacity}` : ""} คน
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">ยังไม่มีรายชื่อในรอบนี้</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อ-สกุล</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัส</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สัญชาติ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ภาษาเอกสาร</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">เอกสาร</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ผลตรวจสุขภาพ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ผลอบรม</th>
                {canManage && <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enrollments.map((en) => (
                <EnrollmentRow
                  key={en.id}
                  enrollment={en}
                  canManage={canManage}
                  latestHealthRecord={recordByEmployee.get(en.employeeId)}
                  isHealthExpanded={expandedHealthRow === en.id}
                  onToggleHealthExpand={() => setExpandedHealthRow((prev) => (prev === en.id ? null : en.id))}
                  onRemove={() => handleRemove(en)}
                  onUpdate={(patch) => handleUpdateEnrollment(en, patch)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage && enrollments.length > 0 && (
        <div>
          {!showSharedUpload ? (
            <button
              onClick={() => setShowSharedUpload(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 whitespace-nowrap"
            >
              <Users size={14} /> กรอกผลตรวจแทนคลินิก (ไฟล์รวม/หลายคน)
            </button>
          ) : (
            <SharedFileUploadPanel enrollments={enrollments} source="hr_manual" actorName={`${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim()} actorUid={firebaseUser?.uid} />
          )}
        </div>
      )}

      {showPicker && (
        <EmployeePickerModal
          batch={batch}
          employees={employees}
          enrolledIds={enrolledIds}
          documentRequirements={documentRequirements}
          projectAliasGroups={projectAliasGroups}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddEmployees}
        />
      )}

      {showContractorPicker && (
        <ContractorLinkPickerModal
          company={newLinkCompany.trim()}
          candidates={contractorLinkCandidates}
          creating={creatingLink}
          onClose={() => setShowContractorPicker(false)}
          onConfirm={handleCreateContractorLink}
        />
      )}

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

const EnrollmentRow = ({
  enrollment,
  canManage,
  latestHealthRecord,
  isHealthExpanded,
  onToggleHealthExpand,
  onRemove,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  canManage: boolean;
  latestHealthRecord?: HealthCheckRecord;
  isHealthExpanded: boolean;
  onToggleHealthExpand: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const statusMeta = TRAINING_ENROLLMENT_STATUS_META[enrollment.status] || TRAINING_ENROLLMENT_STATUS_META.registered;
  const snapshot = enrollment.documentSnapshot;
  const missingDocs = snapshot?.missingDocuments || [];
  const docBadge = !snapshot
    ? { label: "ไม่ได้ตรวจสอบ", cls: "bg-gray-100 text-gray-500 border border-gray-200", title: undefined as string | undefined }
    : snapshot.documentsComplete
      ? { label: "ครบ", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", title: undefined as string | undefined }
      : missingDocs.length > 0
        ? { label: `ขาด ${missingDocs.length} รายการ`, cls: "bg-amber-50 text-amber-700 border border-amber-200", title: `ยังขาด: ${missingDocs.join(", ")}` }
        : { label: snapshot.isMigrant ? "แรงงานต่างด้าว: ตรวจที่หน้าเอกสาร" : "ยังไม่มีเอกสารแนบ", cls: "bg-amber-50 text-amber-700 border border-amber-200", title: undefined as string | undefined };

  const columnCount = canManage ? 9 : 8;

  return (
    <>
    <tr className="hover:bg-gray-50 align-top">
      <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{enrollment.employeeName}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{enrollment.employeeCode || "-"}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{enrollment.position || "-"}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{enrollment.nationality || "-"}</td>
      <td className="p-3 whitespace-nowrap">
        {canManage ? (
          <select
            value={enrollment.language}
            onChange={(e) => onUpdate({ language: e.target.value as TrainingLanguage })}
            className="input !py-1"
          >
            {TRAINING_LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        ) : (
          TRAINING_LANGUAGE_OPTIONS.find((l) => l.value === enrollment.language)?.label || "-"
        )}
      </td>
      <td className="p-3 whitespace-nowrap">
        <span title={docBadge.title} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${docBadge.cls}`}>{docBadge.label}</span>
      </td>
      <td className="p-3 min-w-[160px]">
        <div className="flex flex-col gap-1.5 items-start">
          <HealthCheckBadge latest={latestHealthRecord} />
          {canManage && (
            <button
              type="button"
              onClick={onToggleHealthExpand}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
            >
              {isHealthExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {isHealthExpanded ? "ปิด" : "กรอกผลตรวจแทนคลินิก"}
            </button>
          )}
        </div>
      </td>
      <td className="p-3 whitespace-nowrap">
        {canManage ? (
          <select
            value={enrollment.status}
            onChange={(e) => onUpdate({ status: e.target.value as TrainingEnrollmentStatus })}
            className="input !py-1"
          >
            {Object.entries(TRAINING_ENROLLMENT_STATUS_META).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        ) : (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.badge}`}>{statusMeta.label}</span>
        )}
      </td>
      {canManage && (
        <td className="p-3 text-center">
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 p-1" title="เอาออกจากรอบ">
            <Trash2 size={16} />
          </button>
        </td>
      )}
    </tr>
    {isHealthExpanded && canManage && (
      <tr className="bg-sky-50/50">
        <td colSpan={columnCount} className="p-3 flex flex-col gap-3">
          <HealthCheckRowEditor
            enrollment={enrollment}
            latestRecord={latestHealthRecord}
            source="hr_manual"
            actorName={`${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim()}
            actorUid={firebaseUser?.uid}
          />
          <CongenitalDiseaseEditor enrollment={enrollment} onUpdate={onUpdate} />
        </td>
      </tr>
    )}
    </>
  );
};

/** ติ๊กเลือกโรคประจำตัว (ใช้กับใบรายคน/ใบขอออกบัตร — Access Badge Request) เก็บไว้ที่ enrollment.healthCheck.congenitalDiseases */
const CongenitalDiseaseEditor = ({
  enrollment,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const selected = enrollment.healthCheck?.congenitalDiseases || [];
  const otherDetail = enrollment.healthCheck?.otherDetail || "";

  const toggleDisease = (disease: string) => {
    const next = selected.includes(disease) ? selected.filter((d) => d !== disease) : [...selected, disease];
    onUpdate({ healthCheck: { status: enrollment.healthCheck?.status || "not_checked", congenitalDiseases: next, otherDetail } });
  };

  const updateOtherDetail = (value: string) => {
    onUpdate({ healthCheck: { status: enrollment.healthCheck?.status || "not_checked", congenitalDiseases: selected, otherDetail: value } });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">โรคประจำตัว (สำหรับใบรายคน/ใบขอออกบัตร)</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {CONGENITAL_DISEASE_OPTIONS.map((disease) => (
          <label key={disease} className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" checked={selected.includes(disease)} onChange={() => toggleDisease(disease)} />
            {disease}
          </label>
        ))}
      </div>
      {selected.includes("อื่นๆ") && (
        <input
          type="text"
          value={otherDetail}
          onChange={(e) => updateOtherDetail(e.target.value)}
          placeholder="ระบุรายละเอียดโรคอื่นๆ"
          className="input mt-2 !py-1 text-xs max-w-xs"
        />
      )}
    </div>
  );
};

const EmployeePickerModal = ({
  batch,
  employees,
  enrolledIds,
  documentRequirements,
  projectAliasGroups,
  onClose,
  onConfirm,
}: {
  batch: TrainingBatch;
  employees: EmployeeRow[];
  enrolledIds: Set<string>;
  documentRequirements: ProjectDocumentRequirement[];
  projectAliasGroups: string[][];
  onClose: () => void;
  onConfirm: (picked: EmployeeRow[], language: TrainingLanguage) => void;
}) => {
  const [search, setSearch] = useState("");
  const [onlySameProject, setOnlySameProject] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<TrainingLanguage>("th");

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return employees
      .filter((e) => !enrolledIds.has(e.id))
      .filter((e) =>
        onlySameProject ? employeeProjectNames(e).some((p) => isSameProjectName(p, batch.project, projectAliasGroups)) : true
      )
      .filter((e) => {
        if (!kw) return true;
        const name = buildEmployeeFullName(e).toLowerCase();
        return name.includes(kw) || (e.รหัสพนักงาน || "").toLowerCase().includes(kw) || (e.ตำแหน่ง || "").toLowerCase().includes(kw);
      });
  }, [employees, enrolledIds, onlySameProject, batch.project, search, projectAliasGroups]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id))));
  };

  const handleConfirm = () => {
    const picked = employees.filter((e) => selected.has(e.id));
    if (picked.length === 0) {
      window.alert("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
      return;
    }
    onConfirm(picked, language);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <UserPlus className="text-blue-600" size={20} />
              เลือกพนักงานเข้ารอบอบรม
            </h3>
            <p className="text-xs text-gray-500 mt-1">{batch.courseName} • {batch.project} • {batch.date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / รหัสพนักงาน / ตำแหน่ง..."
              className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={onlySameProject} onChange={(e) => setOnlySameProject(e.target.checked)} />
            เฉพาะโครงการ {batch.project}
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 whitespace-nowrap">
            ภาษาเอกสาร:
            <select value={language} onChange={(e) => setLanguage(e.target.value as TrainingLanguage)} className="input !py-1 !w-auto">
              {TRAINING_LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Inbox size={28} />
              <p className="text-sm">ไม่พบพนักงานที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-10">
                    <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} />
                  </th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อ-สกุล</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัส</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สัญชาติ</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">เอกสาร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => {
                  const isMigrant = isMigrantNationality(e.สัญชาติ);
                  const docCheck = checkProjectDocumentCompleteness(
                    e.attachments as Array<{ docType?: string }> | undefined,
                    documentRequirements,
                    isMigrant
                  );
                  const hasAnyRequirement = documentRequirements.length > 0;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(e.id)}>
                      <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                      <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildEmployeeFullName(e)}</td>
                      <td className="p-3 text-gray-600 whitespace-nowrap">{e.รหัสพนักงาน || "-"}</td>
                      <td className="p-3 text-gray-600 whitespace-nowrap">{e.ตำแหน่ง || "-"}</td>
                      <td className="p-3 text-gray-600 whitespace-nowrap">{e.สัญชาติ || "-"}</td>
                      <td className="p-3 whitespace-nowrap">
                        {isMigrant && !hasAnyRequirement ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            แรงงานต่างด้าว — ตรวจที่หน้าเอกสาร
                          </span>
                        ) : docCheck.complete ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {hasAnyRequirement ? "เอกสารครบตามที่โครงการกำหนด" : "มีเอกสารแนบแล้ว"}
                          </span>
                        ) : (
                          <span
                            title={docCheck.missing.length > 0 ? `ยังขาด: ${docCheck.missing.map((m) => m.label).join(", ")}` : undefined}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                          >
                            {docCheck.missing.length > 0 ? `ขาดเอกสาร ${docCheck.missing.length} รายการ` : "ยังไม่มีเอกสารแนบ"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-500">เลือกแล้ว {selected.size} คน</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 text-sm"
            >
              <CheckCircle2 size={16} /> เพิ่มเข้ารอบอบรม
            </button>
          </div>
        </div>
      </div>
      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// เลือกรายชื่อพนักงานของบริษัทผู้รับเหมาที่ HR จะส่งลิงก์ให้ — เฉพาะคนที่ติ๊กเลือกไว้เท่านั้น
// ที่ผู้รับเหมาจะเห็นในลิงก์ (ชื่ออื่นที่ไม่ได้เลือกต้องส่งผ่านฟอร์ม "เพิ่มชื่อใหม่" ให้ HR อนุมัติ)
// ---------------------------------------------------------------------------
const UNGROUPED_TEAM_KEY = "__no_team__";

const ContractorLinkPickerModal = ({
  company,
  candidates,
  creating,
  onClose,
  onConfirm,
}: {
  company: string;
  candidates: EmployeeRow[];
  creating: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
}) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.map((e) => e.id)));

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return candidates;
    return candidates.filter((e) => {
      const name = buildEmployeeFullName(e).toLowerCase();
      const team = (e.ชื่อชุด || "").toLowerCase();
      return (
        name.includes(kw) ||
        (e.รหัสพนักงาน || "").toLowerCase().includes(kw) ||
        (e.ตำแหน่ง || "").toLowerCase().includes(kw) ||
        team.includes(kw)
      );
    });
  }, [candidates, search]);

  // จัดกลุ่มตาม "ชื่อชุด" (ทีมงานย่อยภายในบริษัทเดียวกัน) เพื่อให้เลือกทีมทั้งชุดได้ในคลิกเดียว
  const teamGroups = useMemo(() => {
    const map = new Map<string, EmployeeRow[]>();
    filtered.forEach((e) => {
      const team = (e.ชื่อชุด || "").trim() || UNGROUPED_TEAM_KEY;
      if (!map.has(team)) map.set(team, []);
      map.get(team)!.push(e);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNGROUPED_TEAM_KEY) return 1;
      if (b === UNGROUPED_TEAM_KEY) return -1;
      return a.localeCompare(b, "th");
    });
  }, [filtered]);

  const hasTeamGrouping = teamGroups.some(([team]) => team !== UNGROUPED_TEAM_KEY);

  // พับทุกชุดไว้เป็นค่าเริ่มต้นเพื่อให้ดูง่าย (กดที่หัวชุดเพื่อขยายดูรายชื่อข้างในทีละชุด)
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (hasTeamGrouping) setCollapsedTeams(new Set(teamGroups.map(([team]) => team)));
  }, [hasTeamGrouping, candidates]);

  const toggleTeamCollapse = (team: string) => {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((e) => next.delete(e.id));
      else filtered.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const toggleTeam = (members: EmployeeRow[]) => {
    const allSelected = members.every((e) => selected.has(e.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) members.forEach((e) => next.delete(e.id));
      else members.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) {
      window.alert("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
      return;
    }
    onConfirm(Array.from(selected));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[95] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <UserPlus className="text-violet-600" size={20} />
              เลือกรายชื่อ — {company}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              เลือกเฉพาะคนที่จะส่งเข้ารอบนี้ (ตัดคนที่เคยอบรมโครงการนี้แล้วออกให้อัตโนมัติ) — ผู้รับเหมาจะเห็นเฉพาะชื่อที่เลือกไว้ตรงนี้เท่านั้น
              ชื่ออื่นต้องให้ผู้รับเหมาส่งผ่านฟอร์ม "เพิ่มชื่อใหม่" ในลิงก์แล้ว HR ค่อยอนุมัติ
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / รหัสพนักงาน / ตำแหน่ง..."
              className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 p-4 text-center">
              <Inbox size={28} />
              <p className="text-sm">ไม่พบพนักงานของบริษัทนี้ที่ยังไม่เคยอบรมโครงการนี้มาก่อน</p>
              <p className="text-xs">(ถ้ามีคนใหม่ที่ยังไม่มีในระบบ ให้สร้างลิงก์แบบไม่เลือกใครก่อน แล้วให้ผู้รับเหมาส่งชื่อผ่านฟอร์ม "เพิ่มชื่อใหม่")</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
              <Inbox size={24} />
              <p className="text-sm">ไม่พบชื่อที่ตรงกับคำค้นหา</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((e) => selected.has(e.id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อ-สกุล</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัส</th>
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                </tr>
              </thead>
              {teamGroups.map(([team, members]) => {
                const teamAllSelected = members.every((e) => selected.has(e.id));
                const teamSomeSelected = !teamAllSelected && members.some((e) => selected.has(e.id));
                const isExpanded = search.trim() !== "" || !collapsedTeams.has(team);
                const selectedInTeam = members.filter((e) => selected.has(e.id)).length;
                return (
                  <tbody key={team} className="divide-y divide-gray-100">
                    {hasTeamGrouping && (
                      <tr className="bg-violet-50/70 cursor-pointer" onClick={() => toggleTeamCollapse(team)}>
                        <td className="p-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={teamAllSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = teamSomeSelected;
                            }}
                            onChange={() => toggleTeam(members)}
                          />
                        </td>
                        <td colSpan={3} className="p-2.5 text-xs font-bold text-violet-800 flex items-center gap-1.5">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {team === UNGROUPED_TEAM_KEY ? "ไม่ระบุชุด" : team}
                          <span className="font-normal text-violet-600">
                            ({selectedInTeam > 0 ? `เลือก ${selectedInTeam}/${members.length}` : `${members.length} คน`})
                          </span>
                        </td>
                      </tr>
                    )}
                    {isExpanded &&
                      members.map((e) => (
                        <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(e.id)}>
                          <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                          </td>
                          <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildEmployeeFullName(e)}</td>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{e.รหัสพนักงาน || "-"}</td>
                          <td className="p-3 text-gray-600 whitespace-nowrap">{e.ตำแหน่ง || "-"}</td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>

        <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-500">เลือกแล้ว {selected.size} คน</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={creating}
              className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-violet-600 text-white hover:bg-violet-700 text-sm disabled:opacity-50"
            >
              {creating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} สร้างลิงก์
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    {children}
  </label>
);
