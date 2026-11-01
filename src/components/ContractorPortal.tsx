import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileUp,
  Inbox,
  Loader2,
  Paperclip,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { HIRING_DOC_TYPE_OPTIONS, HiringAttachment } from "./recruitmentIntakeConfig";
import { uploadHiringDocumentFile, appendAttachmentToEmployee } from "../utils/hiringDocsAttachments";
import {
  buildEmployeeFullName,
  isMigrantNationality,
  TRAINING_BATCHES_COLLECTION,
  TRAINING_ENROLLMENTS_COLLECTION,
  TrainingBatch,
  TrainingEnrollment,
} from "./trainingBatchConfig";
import {
  CONTRACTOR_EMPLOYEE_TYPE_LABELS,
  CONTRACTOR_EMPLOYEE_TYPES,
  PENDING_MEMBER_STATUS_META,
  TRAINING_CONTRACTOR_LINKS_COLLECTION,
  TRAINING_PENDING_MEMBERS_COLLECTION,
  TrainingContractorLink,
  TrainingPendingMember,
} from "./contractorPortalConfig";
import {
  buildProjectAliasGroups,
  buildProjectDisplayKeys,
  checkProjectDocumentCompleteness,
  isSameProjectName,
  normalizeProjectDocumentRequirements,
  ProjectDocumentRequirement,
} from "./projectDocumentConfig";

interface EmployeeRow {
  id: string;
  รหัสพนักงาน?: string;
  คำนำหน้าชื่อ?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  แผนก?: string;
  บริษัทผู้รับเหมา?: string;
  สัญชาติ?: string;
  เพศ?: string;
  เลขบัตรประชาชน?: string;
  สถานะพนักงาน?: string;
  employee_type?: string;
  โครงการ?: string;
  โครงการปัจจุบัน?: string;
  สถานะโครงการ?: string | string[];
  attachments?: HiringAttachment[];
}

const INACTIVE_STATUSES = ["ลาออก", "เลิกจ้าง"];
const createLocalId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * หน้าสาธารณะสำหรับผู้รับเหมา/Supply manpower — ไม่ต้อง login เข้าถึงด้วย token ในลิงก์
 * เส้นทาง: /contractor/:token
 * ให้ 2 อย่าง: (1) เลือกคนที่ HR กรอกชื่อไว้แล้วในระบบ ส่งเข้ารอบอบรม + แนบเอกสารตามที่
 * โครงการกำหนด (2) เพิ่มชื่อคนใหม่ที่ยังไม่มีในระบบ ส่งเป็นคำขอรอ HR ตรวจสอบ/อนุมัติ
 */
export const ContractorPortal = () => {
  const { token } = useParams<{ token: string }>();
  const db = getFirestore();

  const [link, setLink] = useState<TrainingContractorLink | null | undefined>(undefined);
  const [batch, setBatch] = useState<TrainingBatch | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [pendingMembers, setPendingMembers] = useState<TrainingPendingMember[]>([]);
  const [requirements, setRequirements] = useState<ProjectDocumentRequirement[]>([]);
  const [showAddNew, setShowAddNew] = useState(false);

  useEffect(() => {
    if (!token) {
      setLink(null);
      return;
    }
    const ref = doc(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION, token);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLink(null);
          return;
        }
        setLink({ id: snap.id, ...(snap.data() as object) } as TrainingContractorLink);
      },
      () => setLink(null)
    );
    return () => unsub();
  }, [db, token]);

  useEffect(() => {
    if (!link?.batchId) return;
    const ref = doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, link.batchId);
    const unsub = onSnapshot(ref, (snap) => {
      setBatch(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as TrainingBatch) : null);
    });
    return () => unsub();
  }, [db, link?.batchId]);

  const [projectAliasGroups, setProjectAliasGroups] = useState<string[][]>([]);
  useEffect(() => {
    if (!link) return;
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "employee_data"), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as EmployeeRow))
        .filter((e) => !INACTIVE_STATUSES.includes(String(e.สถานะพนักงาน || "").trim()))
        .filter((e) => (e.บริษัทผู้รับเหมา || "").trim() === link.company)
        .filter((e) => CONTRACTOR_EMPLOYEE_TYPES.includes((e.employee_type || "") as any))
        .filter((e) => [e.โครงการ, e.โครงการปัจจุบัน].some((p) => isSameProjectName(p, link.project, projectAliasGroups)))
        // ลิงก์ใหม่: HR เลือกรายชื่อไว้ล่วงหน้าตอนสร้างลิงก์ — แสดงเฉพาะคนที่อยู่ในรายการนี้เท่านั้น
        // (ลิงก์เก่าก่อนมีฟีเจอร์นี้ ไม่มี invitedEmployeeIds — ใช้ fallback แสดงทุกคนที่ตรงบริษัท+โครงการเหมือนเดิม)
        .filter((e) => (link.invitedEmployeeIds ? link.invitedEmployeeIds.includes(e.id) : true));
      setEmployees(rows);
    });
    return () => unsub();
  }, [db, link, projectAliasGroups]);

  useEffect(() => {
    if (!link?.batchId) return;
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION), (snap) => {
      setEnrollments(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingEnrollment))
          .filter((e) => e.batchId === link.batchId)
      );
    });
    return () => unsub();
  }, [db, link?.batchId]);

  useEffect(() => {
    if (!link) return;
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", TRAINING_PENDING_MEMBERS_COLLECTION), (snap) => {
      setPendingMembers(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingPendingMember))
          .filter((m) => m.batchId === link.batchId && m.company === link.company)
          .sort((a, b) => b.submittedAt - a.submittedAt)
      );
    });
    return () => unsub();
  }, [db, link]);

  useEffect(() => {
    if (!link) return;
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "projects"), (snap) => {
      const rawProjects: Array<{ project_no?: unknown; project_name?: unknown }> = [];
      let matchedRequirements: ProjectDocumentRequirement[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        rawProjects.push({ project_no: data.project_no, project_name: data.project_name });
        if (buildProjectDisplayKeys({ project_no: data.project_no, project_name: data.project_name }).includes(link.project)) {
          matchedRequirements = normalizeProjectDocumentRequirements(data.required_documents);
        }
      }
      setProjectAliasGroups(buildProjectAliasGroups(rawProjects));
      setRequirements(matchedRequirements);
    });
    return () => unsub();
  }, [db, link]);

  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.employeeId)), [enrollments]);

  if (link === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (link === null || !batch) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 p-6 text-center">
        <AlertTriangle className="text-amber-500" size={36} />
        <p className="text-gray-700 font-semibold">ไม่พบลิงก์นี้ในระบบ</p>
        <p className="text-sm text-gray-500">กรุณาตรวจสอบลิงก์อีกครั้ง หรือติดต่อ HR/Safety ของโครงการเพื่อขอลิงก์ใหม่</p>
      </div>
    );
  }

  const notEnrolledEmployees = employees.filter((e) => !enrolledIds.has(e.id));
  const enrolledEmployees = employees.filter((e) => enrolledIds.has(e.id));

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-blue-600" size={22} />
            ส่งทีมงานเข้าอบรมก่อนเข้างาน — {batch.courseName}
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Building2 size={14} /> โครงการ: {link.project} • บริษัท: <strong>{link.company}</strong>
            {link.employeeType && ` (${CONTRACTOR_EMPLOYEE_TYPE_LABELS[link.employeeType]})`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            วันอบรม: {batch.date || "-"} {batch.timeSlot ? `(${batch.timeSlot})` : ""} ที่ {batch.location || "-"}
          </p>
          {requirements.length > 0 && (
            <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
              <p className="font-semibold mb-1">เอกสารที่โครงการนี้กำหนด:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {requirements.map((r) => (
                  <li key={r.docType}>
                    {r.label} {r.appliesTo !== "all" && <span className="text-sky-500">({r.appliesTo === "thai" ? "เฉพาะคนไทย" : "เฉพาะแรงงานต่างด้าว"})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-1">รายชื่อทีมงานที่ยังไม่ได้ส่งเข้ารอบนี้ ({notEnrolledEmployees.length} คน)</h2>
          <p className="text-xs text-gray-400 mb-3">รายชื่อนี้ HR กรอกไว้ในระบบแล้ว — แนบเอกสารให้ครบแล้วกดส่งเข้ารอบอบรมได้เลย</p>

          {notEnrolledEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-2">
              <Inbox size={24} />
              <p className="text-sm">ไม่มีรายชื่อที่รอส่งเข้ารอบนี้ (ถ้ายังไม่มีชื่อ ให้เพิ่มชื่อใหม่ด้านล่าง)</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notEnrolledEmployees.map((e) => (
                <ContractorEmployeeRow key={e.id} employee={e} batch={batch} project={link.project} requirements={requirements} />
              ))}
            </div>
          )}
        </div>

        {enrolledEmployees.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">ส่งเข้ารอบนี้แล้ว ({enrolledEmployees.length} คน)</h2>
            <ul className="flex flex-col gap-1.5">
              {enrolledEmployees.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-gray-700">{buildEmployeeFullName(e)}</span>
                  <span className="text-xs text-gray-400">({e.รหัสพนักงาน || e.id})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">เพิ่มชื่อทีมงานใหม่ (ยังไม่มีในระบบ)</h2>
            <button
              onClick={() => setShowAddNew((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
            >
              <UserPlus size={14} /> {showAddNew ? "ปิดฟอร์ม" : "เพิ่มชื่อใหม่"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            รายชื่อที่เพิ่มตรงนี้จะถูกส่งให้ HR ตรวจสอบและอนุมัติก่อน ถึงจะถูกเพิ่มเข้าระบบและเข้ารอบอบรมจริง
          </p>

          {showAddNew && (
            <AddNewMemberForm
              batchId={batch.id}
              project={link.project}
              company={link.company}
              employeeType={link.employeeType}
              onSubmitted={() => setShowAddNew(false)}
            />
          )}

          {pendingMembers.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">รายชื่อที่ส่งไปแล้ว</h3>
              <ul className="flex flex-col gap-1.5">
                {pendingMembers.map((m) => {
                  const meta = PENDING_MEMBER_STATUS_META[m.status];
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-700">{m.fullName}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; background: white; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// แถวพนักงาน 1 คนที่มีอยู่แล้วในระบบ — แนบเอกสาร + กดส่งเข้ารอบอบรม
// ---------------------------------------------------------------------------
const ContractorEmployeeRow = ({
  employee,
  batch,
  project,
  requirements,
}: {
  employee: EmployeeRow;
  batch: TrainingBatch;
  project: string;
  requirements: ProjectDocumentRequirement[];
}) => {
  const db = getFirestore();
  const [expanded, setExpanded] = useState(false);
  const [docType, setDocType] = useState<string>(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMigrant = isMigrantNationality(employee.สัญชาติ);
  const docCheck = checkProjectDocumentCompleteness(employee.attachments, requirements, isMigrant);

  const handleUpload = async () => {
    if (!file) return;
    const empCode = employee.รหัสพนักงาน || employee.id;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadHiringDocumentFile(file, {
        candidateName: buildEmployeeFullName(employee),
        position: employee.ตำแหน่ง || "",
        candidateKey: empCode,
        docType,
      });
      await appendAttachmentToEmployee(empCode, {
        docType,
        name: file.name,
        url: res.url,
        uploadedAt: new Date().toISOString(),
      });
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    setError(null);
    try {
      const ref = doc(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION));
      const record: Omit<TrainingEnrollment, "id"> = {
        batchId: batch.id,
        project,
        employeeId: employee.id,
        employeeCode: employee.รหัสพนักงาน || "",
        employeeName: buildEmployeeFullName(employee),
        employeeFirstName: employee.ชื่อตัว || "",
        position: employee.ตำแหน่ง || "",
        company: employee.บริษัทผู้รับเหมา || employee.แผนก || "",
        nationality: employee.สัญชาติ || "",
        idCardNumber: employee.เลขบัตรประชาชน || "",
        gender: employee.เพศ || "",
        language: "th",
        status: "registered",
        documentSnapshot: {
          isMigrant,
          documentsComplete: docCheck.complete,
          missingDocuments: docCheck.missing.map((m) => m.label),
          checkedAt: Date.now(),
        },
        enrolledByUid: "",
        enrolledByName: `ผู้รับเหมา: ${employee.บริษัทผู้รับเหมา || employee.แผนก || ""} (ลิงก์สาธารณะ)`,
        enrolledAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setDoc(ref, record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งเข้ารอบไม่สำเร็จ");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-gray-50">
        <div>
          <div className="text-sm font-semibold text-gray-800">{buildEmployeeFullName(employee)}</div>
          <div className="text-xs text-gray-400">{employee.รหัสพนักงาน || employee.id} • {employee.ตำแหน่ง || "-"} • {employee.สัญชาติ || "-"}</div>
        </div>
        {docCheck.complete ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">เอกสารครบ</span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            {docCheck.missing.length > 0 ? `ขาด ${docCheck.missing.length} รายการ` : "ยังไม่มีเอกสารแนบ"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="p-3 border-t bg-gray-50 flex flex-col gap-3">
          {docCheck.missing.length > 0 && (
            <p className="text-xs text-amber-700">ยังขาด: {docCheck.missing.map((m) => m.label).join(", ")}</p>
          )}

          {(employee.attachments || []).length > 0 && (
            <ul className="flex flex-col gap-1">
              {(employee.attachments || []).map((a, idx) => (
                <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white rounded-lg px-2.5 py-1.5 border border-gray-200">
                  <span className="flex items-center gap-1.5 text-gray-600 truncate"><Paperclip size={12} /> {a.name} <span className="text-gray-400">({a.docType})</span></span>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline shrink-0">เปิดไฟล์</a>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
              {HIRING_DOC_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="animate-spin" size={13} /> : <FileUp size={13} />}
              แนบไฟล์
            </button>
          </div>

          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="self-start flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {enrolling ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
            ส่งเข้ารอบอบรมนี้
          </button>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ฟอร์มเพิ่มชื่อใหม่ (ยังไม่มีในระบบ) — ส่งเป็นคำขอรอ HR อนุมัติ
// ---------------------------------------------------------------------------
const AddNewMemberForm = ({
  batchId,
  project,
  company,
  employeeType,
  onSubmitted,
}: {
  batchId: string;
  project: string;
  company: string;
  employeeType: TrainingContractorLink["employeeType"];
  onSubmitted: () => void;
}) => {
  const db = getFirestore();
  const [pendingKey] = useState<string>(() => `contractor-pending-${createLocalId()}`);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [nationality, setNationality] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [gender, setGender] = useState("");
  const [attachments, setAttachments] = useState<HiringAttachment[]>([]);
  const [docType, setDocType] = useState<string>(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUploadAttachment = async () => {
    if (!file || !fullName.trim()) {
      setError("กรุณากรอกชื่อ-สกุลก่อนแนบไฟล์");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await uploadHiringDocumentFile(file, {
        candidateName: fullName.trim(),
        position: position.trim(),
        candidateKey: pendingKey,
        docType,
      });
      setAttachments((prev) => [...prev, { docType, name: file.name, url: res.url, uploadedAt: new Date().toISOString() }]);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setError("กรุณากรอกชื่อ-สกุล");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ref = doc(collection(db, "CMG-HR-Database", "root", TRAINING_PENDING_MEMBERS_COLLECTION));
      const record: Omit<TrainingPendingMember, "id"> = {
        batchId,
        project,
        company,
        employeeType,
        fullName: fullName.trim(),
        position: position.trim(),
        nationality: nationality.trim(),
        idCardNumber: idCardNumber.trim(),
        gender,
        attachments,
        status: "pending",
        submittedAt: Date.now(),
      };
      await setDoc(ref, record);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-3 flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ชื่อ-สกุล *" className="input" />
        <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="ตำแหน่ง" className="input" />
        <input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="สัญชาติ" className="input" />
        <input value={idCardNumber} onChange={(e) => setIdCardNumber(e.target.value)} placeholder="เลขบัตรประชาชน/พาสปอร์ต" className="input" />
        <select value={gender} onChange={(e) => setGender(e.target.value)} className="input">
          <option value="">เพศ</option>
          <option value="ชาย">ชาย</option>
          <option value="หญิง">หญิง</option>
        </select>
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attachments.map((a, idx) => (
            <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white rounded-lg px-2.5 py-1.5 border border-gray-200">
              <span className="flex items-center gap-1.5 text-gray-600 truncate"><Paperclip size={12} /> {a.name} <span className="text-gray-400">({a.docType})</span></span>
              <button onClick={() => handleRemoveAttachment(idx)} className="text-gray-300 hover:text-red-500 shrink-0"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
          {HIRING_DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
        <button
          onClick={handleUploadAttachment}
          disabled={!file || uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
          เพิ่มไฟล์แนบ
        </button>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="animate-spin" size={13} /> : <UserPlus size={13} />}
        ส่งให้ HR ตรวจสอบ
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
