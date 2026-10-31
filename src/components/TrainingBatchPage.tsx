import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  Inbox,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  buildEmployeeFullName,
  canManageTrainingBatches,
  CONGENITAL_DISEASE_OPTIONS,
  DEFAULT_TRAINING_COURSE_OPTIONS,
  employeeProjectNames,
  HEALTH_CHECK_STATUS_OPTIONS,
  HealthCheckStatus,
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

interface EmployeeRow {
  id: string;
  รหัสพนักงาน?: string;
  คำนำหน้าชื่อ?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  แผนก?: string;
  สัญชาติ?: string;
  สถานะพนักงาน?: string;
  โครงการ?: string;
  โครงการปัจจุบัน?: string;
  สถานะโครงการ?: string | string[];
  attachments?: unknown[];
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
                <input
                  required
                  list="training-project-options"
                  value={batchForm.project}
                  onChange={(e) => setBatchForm((f) => ({ ...f, project: e.target.value }))}
                  className="input"
                />
                <datalist id="training-project-options">
                  {projectOptions.map((p) => <option key={p} value={p} />)}
                </datalist>
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
  onBack,
  onChangeStatus,
}: {
  batch: TrainingBatch;
  enrollments: TrainingEnrollment[];
  employees: EmployeeRow[];
  canManage: boolean;
  onBack: () => void;
  onChangeStatus: (status: TrainingBatchStatus) => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();
  const [showPicker, setShowPicker] = useState(false);

  const meta = TRAINING_BATCH_STATUS_META[batch.status] || TRAINING_BATCH_STATUS_META.planned;
  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.employeeId)), [enrollments]);

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
          const record: Omit<TrainingEnrollment, "id"> = {
            batchId: batch.id,
            project: batch.project,
            employeeId: emp.id,
            employeeCode: emp.รหัสพนักงาน || "",
            employeeName: buildEmployeeFullName(emp),
            position: emp.ตำแหน่ง || "",
            company: emp.แผนก || "",
            nationality: emp.สัญชาติ || "",
            language,
            status: "registered",
            documentSnapshot: {
              isMigrant,
              documentsComplete: !isMigrant ? (emp.attachments || []).length > 0 : false,
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
            {batch.project} • {batch.date} {batch.timeSlot ? `(${batch.timeSlot})` : ""} • {batch.location || "-"} • วิทยากร: {batch.trainer || "-"}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batch.status}
              onChange={(e) => onChangeStatus(e.target.value as TrainingBatchStatus)}
              className="input max-w-[160px]"
            >
              {Object.entries(TRAINING_BATCH_STATUS_META).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 whitespace-nowrap"
            >
              <UserPlus size={16} /> เพิ่มรายชื่อ
            </button>
          </div>
        )}
      </div>

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
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สุขภาพ (ครั้งนี้)</th>
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
                  onRemove={() => handleRemove(en)}
                  onUpdate={(patch) => handleUpdateEnrollment(en, patch)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showPicker && (
        <EmployeePickerModal
          batch={batch}
          employees={employees}
          enrolledIds={enrolledIds}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddEmployees}
        />
      )}

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

const EnrollmentRow = ({
  enrollment,
  canManage,
  onRemove,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  canManage: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const statusMeta = TRAINING_ENROLLMENT_STATUS_META[enrollment.status] || TRAINING_ENROLLMENT_STATUS_META.registered;
  const snapshot = enrollment.documentSnapshot;
  const docBadge = !snapshot
    ? { label: "ไม่ได้ตรวจสอบ", cls: "bg-gray-100 text-gray-500 border border-gray-200" }
    : snapshot.documentsComplete
      ? { label: "ครบ", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" }
      : { label: snapshot.isMigrant ? "แรงงานต่างด้าว: ตรวจที่หน้าเอกสาร" : "ยังไม่มีเอกสารแนบ", cls: "bg-amber-50 text-amber-700 border border-amber-200" };

  const health = enrollment.healthCheck || { status: "not_checked" as HealthCheckStatus };

  return (
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
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${docBadge.cls}`}>{docBadge.label}</span>
      </td>
      <td className="p-3 min-w-[180px]">
        {canManage ? (
          <select
            value={health.status}
            onChange={(e) =>
              onUpdate({ healthCheck: { ...health, status: e.target.value as HealthCheckStatus } })
            }
            className="input !py-1"
          >
            {HEALTH_CHECK_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          HEALTH_CHECK_STATUS_OPTIONS.find((o) => o.value === health.status)?.label || "-"
        )}
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
  );
};

const EmployeePickerModal = ({
  batch,
  employees,
  enrolledIds,
  onClose,
  onConfirm,
}: {
  batch: TrainingBatch;
  employees: EmployeeRow[];
  enrolledIds: Set<string>;
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
      .filter((e) => (onlySameProject ? employeeProjectNames(e).includes(batch.project) : true))
      .filter((e) => {
        if (!kw) return true;
        const name = buildEmployeeFullName(e).toLowerCase();
        return name.includes(kw) || (e.รหัสพนักงาน || "").toLowerCase().includes(kw) || (e.ตำแหน่ง || "").toLowerCase().includes(kw);
      });
  }, [employees, enrolledIds, onlySameProject, batch.project, search]);

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
                  const docOk = !isMigrant && (e.attachments || []).length > 0;
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
                        {isMigrant ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            แรงงานต่างด้าว — ตรวจที่หน้าเอกสาร
                          </span>
                        ) : docOk ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            มีเอกสารแนบแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            ยังไม่มีเอกสารแนบ
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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    {children}
  </label>
);
