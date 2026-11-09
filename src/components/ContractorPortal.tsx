import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getFirestore, onSnapshot, query, setDoc, where } from "firebase/firestore";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileUp,
  Inbox,
  Loader2,
  Paperclip,
  UserPlus,
  Users,
} from "lucide-react";
import {
  GROUP_STATUS_BY_EMPLOYEE_TYPE,
  HIRING_DOC_TYPE_OPTIONS,
  HiringAttachment,
  RECRUITMENT_PENDING_EMPLOYEES_COLLECTION,
  RecruitmentPendingEmployee,
  buildFullName,
  getIntakeStatus,
  INTAKE_STATUS_META,
} from "./recruitmentIntakeConfig";
import { useDocumentTypeCatalog } from "./documentTypeCatalog";
import { IdCardPhotoGuideButton, isIdCardDocType } from "./IdCardPhotoGuide";
import {
  uploadHiringDocumentFile,
  appendAttachmentToEmployee,
  appendAttachmentToRecruitmentPending,
  resolveEmployeeDocumentCandidateKey,
} from "../utils/hiringDocsAttachments";
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
  slugifyContractorCompany,
  TRAINING_CONTRACTOR_LINKS_COLLECTION,
  TrainingContractorLink,
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
  // มีค่าเฉพาะพนักงานที่เคยผ่านระบบ Recruitment มาก่อน — ใช้หา folder Drive เดิมของคนนี้
  hiringPacketId?: string;
  recruitmentSourceId?: string;
}

const INACTIVE_STATUSES = ["ลาออก", "เลิกจ้าง", "ไม่มาเริ่มงาน"];

/**
 * หน้าสาธารณะสำหรับผู้รับเหมา/Supply manpower — ไม่ต้อง login เข้าถึงด้วย token ในลิงก์
 * เส้นทาง: /contractor/:token
 *
 * ลิงก์นี้มี 2 โหมด (ดูรายละเอียดที่ contractorPortalConfig.ts):
 *  - ผูกรอบอบรม (link.batchId มีค่า): แนบเอกสาร + กดส่งเข้ารอบอบรมได้เลย (ของเดิม)
 *  - เก็บเอกสารล่วงหน้า (ไม่มี batchId): แนบเอกสารรอไว้ก่อนเฉยๆ ยังไม่มีรอบให้ส่งเข้า
 * ทั้ง 2 โหมด HR เป็นคนเลือกรายชื่อ (invitedEmployeeIds) ไว้ล่วงหน้าตอนสร้างลิงก์เสมอ
 * — ผู้รับเหมาแนบเอกสารให้เฉพาะคนที่อยู่ในรายชื่อนี้เท่านั้น ไม่มีฟอร์มเพิ่มชื่อใหม่
 */
export const ContractorPortal = () => {
  const { token } = useParams<{ token: string }>();
  const db = getFirestore();

  const [link, setLink] = useState<TrainingContractorLink | null | undefined>(undefined);
  const [batch, setBatch] = useState<TrainingBatch | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [requirements, setRequirements] = useState<ProjectDocumentRequirement[]>([]);

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

  // มีรอบอบรมผูกไว้หรือไม่ — ถ้าไม่มี (ลิงก์เก็บเอกสารล่วงหน้า) ไม่ต้องรอ batch เลย
  useEffect(() => {
    if (!link?.batchId) {
      setBatch(null);
      return;
    }
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
        .filter((e) => [e.โครงการ, e.โครงการปัจจุบัน].some((p) => isSameProjectName(p, link.project, projectAliasGroups)))
        // HR เลือกรายชื่อไว้ล่วงหน้าตอนสร้างลิงก์เสมอ — แสดงเฉพาะคนที่อยู่ในรายการนี้เท่านั้น
        // (ลิงก์เก่าก่อนมีฟีเจอร์นี้ ไม่มี invitedEmployeeIds — ใช้ fallback แสดงทุกคนที่ตรงบริษัท+โครงการเหมือนเดิม)
        .filter((e) => (link.invitedEmployeeIds ? link.invitedEmployeeIds.includes(e.id) : true));
      setEmployees(rows);
    });
    return () => unsub();
  }, [db, link, projectAliasGroups]);

  useEffect(() => {
    if (!link?.batchId) {
      setEnrollments([]);
      return;
    }
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

  // ไม่มีลิงก์ หรือ (มี batchId ผูกไว้แต่หารอบอบรมนั้นไม่เจอ) = ลิงก์เสีย
  if (link === null || (link.batchId && !batch)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 p-6 text-center">
        <AlertTriangle className="text-amber-500" size={36} />
        <p className="text-gray-700 font-semibold">ไม่พบลิงก์นี้ในระบบ</p>
        <p className="text-sm text-gray-500">กรุณาตรวจสอบลิงก์อีกครั้ง หรือติดต่อ HR/Safety ของโครงการเพื่อขอลิงก์ใหม่</p>
      </div>
    );
  }

  // โหมด "ผู้รับเหมาใหม่ที่ยังไม่มีชื่ออยู่ในระบบ" — ไม่มีรายชื่อให้เลือกแนบเอกสาร มีแต่ฟอร์มกรอกชื่อเอง
  if (link.mode === "self_entry") {
    return <SelfEntryContractorView link={link} requirements={requirements} />;
  }

  const notEnrolledEmployees = batch ? employees.filter((e) => !enrolledIds.has(e.id)) : employees;
  const enrolledEmployees = batch ? employees.filter((e) => enrolledIds.has(e.id)) : [];

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          {batch ? (
            <>
              <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Users className="text-blue-600" size={22} />
                ส่งทีมงานเข้าอบรมก่อนเข้างาน — {batch.courseName}
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                วันอบรม: {batch.date || "-"} {batch.timeSlot ? `(${batch.timeSlot})` : ""} ที่ {batch.location || "-"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FileUp className="text-sky-600" size={22} />
                เตรียมเอกสารทีมงานล่วงหน้า
              </h1>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                <Clock size={12} /> แนบเอกสารรอไว้ก่อนได้เลย — พอ HR เปิดรอบอบรมจริง จะเลือกคนที่เอกสารครบแล้วส่งเข้ารอบได้ทันที ไม่ต้องรอแนบใหม่
              </p>
            </>
          )}
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Building2 size={14} /> โครงการ: {link.project} • บริษัท: <strong>{link.company}</strong>
            {link.employeeType && ` (${CONTRACTOR_EMPLOYEE_TYPE_LABELS[link.employeeType]})`}
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
          <h2 className="text-sm font-bold text-gray-700 mb-1">
            {batch ? `รายชื่อทีมงานที่ยังไม่ได้ส่งเข้ารอบนี้ (${notEnrolledEmployees.length} คน)` : `รายชื่อทีมงาน (${notEnrolledEmployees.length} คน)`}
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            {batch
              ? "รายชื่อนี้ HR กรอกไว้ในระบบแล้ว — แนบเอกสารให้ครบแล้วกดส่งเข้ารอบอบรมได้เลย"
              : "รายชื่อนี้ HR กรอกไว้ในระบบแล้ว — แนบเอกสารรอไว้ก่อนได้เลย ถ้ามีคนที่ยังไม่มีชื่ออยู่ในนี้ กรุณาติดต่อ HR/Safety ของโครงการให้เพิ่มชื่อในระบบก่อน"}
          </p>

          {notEnrolledEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-2">
              <Inbox size={24} />
              <p className="text-sm">ไม่มีรายชื่อในลิงก์นี้ — ติดต่อ HR/Safety ของโครงการเพื่อขอลิงก์ใหม่</p>
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
      </div>

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; background: white; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// แถวพนักงาน 1 คนที่มีอยู่แล้วในระบบ — แนบเอกสาร + (ถ้ามีรอบอบรมผูกไว้) กดส่งเข้ารอบอบรม
// ---------------------------------------------------------------------------
const ContractorEmployeeRow = ({
  employee,
  batch,
  project,
  requirements,
}: {
  employee: EmployeeRow;
  batch: TrainingBatch | null;
  project: string;
  requirements: ProjectDocumentRequirement[];
}) => {
  const db = getFirestore();
  // ใช้ catalog กลาง (ไม่ใช่แค่ HIRING_DOC_TYPE_OPTIONS คงที่) เพื่อให้เลือก/แสดงชื่อเอกสารที่ HR เพิ่มเองได้ด้วย
  // (เช่น "ใบคำร้องขอมีบัตรผ่านบุคคล" ที่บางโครงการกำหนดเพิ่ม) และแปลโค้ด docType เป็นชื่อไทยให้ถูกต้องเสมอ
  const documentTypeOptions = useDocumentTypeCatalog();
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
        // ใช้ hiringPacketId เดิม (ถ้ามี) ให้ไฟล์ไปลงโฟลเดอร์เดียวกับที่สร้างไว้ตอน Recruitment
        candidateKey: resolveEmployeeDocumentCandidateKey(employee),
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
    if (!batch) return;
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
                  <span className="flex items-center gap-1.5 text-gray-600 truncate">
                    <Paperclip size={12} /> {a.name}{" "}
                    <span className="text-gray-400">({documentTypeOptions.find((o) => o.value === a.docType)?.label || a.docType})</span>
                  </span>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline shrink-0">เปิดไฟล์</a>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
              {documentTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <IdCardPhotoGuideButton highlight={isIdCardDocType(docType)} />
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
          {isIdCardDocType(docType) && (
            <p className="text-[11px] text-sky-700 flex items-center gap-1">
              📌 ก่อนถ่ายรูปบัตร กด "ดูตัวอย่างถ่ายรูปบัตร" ด้านบนเพื่อดูวิธีถ่ายให้ถูกต้อง (พื้นขาว ไม่เอียง ไม่มีแสงสะท้อน)
            </p>
          )}

          {batch && (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="self-start flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {enrolling ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
              ส่งเข้ารอบอบรมนี้
            </button>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// โหมด "ผู้รับเหมาใหม่ที่ยังไม่มีรายชื่ออยู่ในระบบ" (link.mode === "self_entry")
// ผู้รับเหมากรอกชื่อ+ข้อมูลส่วนตัว+แนบเอกสารเอง — เขียนลง recruitment_pending_employees
// collection เดียวกับที่ระบบ Recruitment ใช้ (source="contractor_new") เพื่อให้ HR ไปจัดการต่อที่
// หน้า "รายชื่อรอเพิ่ม" (RecruitmentIntakePage) ได้เหมือนรายชื่อจาก Recruitment ทุกประการ
// ---------------------------------------------------------------------------
interface SelfEntryFormState {
  คำนำหน้า: string;
  ชื่อตัว: string;
  ชื่อสกุล: string;
  ตำแหน่ง: string;
  เพศ: string;
  สัญชาติ: string;
  เลขบัตรประชาชน: string;
  วันเกิด: string;
  โทรศัพท์: string;
  บ้านเลขที่: string;
  หมู่: string;
  แขวงตำบล: string;
  เขตอำเภอ: string;
  จังหวัด: string;
  ไปรษณีย์: string;
  ผู้ติดต่อฉุกเฉิน_ชื่อ: string;
  ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: string;
  ผู้ติดต่อฉุกเฉิน_โทร: string;
  วุฒิการศึกษา: string;
  สถาบันการศึกษา: string;
  สาขา: string;
}

const emptySelfEntryForm = (): SelfEntryFormState => ({
  คำนำหน้า: "",
  ชื่อตัว: "",
  ชื่อสกุล: "",
  ตำแหน่ง: "",
  เพศ: "",
  สัญชาติ: "ไทย",
  เลขบัตรประชาชน: "",
  วันเกิด: "",
  โทรศัพท์: "",
  บ้านเลขที่: "",
  หมู่: "",
  แขวงตำบล: "",
  เขตอำเภอ: "",
  จังหวัด: "",
  ไปรษณีย์: "",
  ผู้ติดต่อฉุกเฉิน_ชื่อ: "",
  ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: "",
  ผู้ติดต่อฉุกเฉิน_โทร: "",
  วุฒิการศึกษา: "",
  สถาบันการศึกษา: "",
  สาขา: "",
});

const SelfEntryContractorView = ({
  link,
  requirements,
}: {
  link: TrainingContractorLink;
  requirements: ProjectDocumentRequirement[];
}) => {
  const db = getFirestore();
  const [members, setMembers] = useState<RecruitmentPendingEmployee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SelfEntryFormState>(emptySelfEntryForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION),
      where("contractorLinkId", "==", link.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as RecruitmentPendingEmployee))
        .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      setMembers(rows);
    });
    return () => unsub();
  }, [db, link.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ชื่อตัว.trim() || !form.ชื่อสกุล.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ref = doc(collection(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION));
      const record: Record<string, unknown> = {
        source: "contractor_new",
        contractorCompany: link.company,
        contractorLinkId: link.id,
        โครงการ: link.project,
        แผนก: link.company,
        สถานะกลุ่มงาน: GROUP_STATUS_BY_EMPLOYEE_TYPE[link.employeeType] || "",
        ชื่อต้น: form.คำนำหน้า.trim(),
        ชื่อตัว: form.ชื่อตัว.trim(),
        ชื่อสกุล: form.ชื่อสกุล.trim(),
        ตำแหน่ง: form.ตำแหน่ง.trim(),
        เพศ: form.เพศ.trim(),
        สัญชาติ: form.สัญชาติ.trim(),
        เลขบัตรประชาชน: form.เลขบัตรประชาชน.trim(),
        วันเกิด: form.วันเกิด,
        โทรศัพท์: form.โทรศัพท์.trim(),
        บ้านเลขที่: form.บ้านเลขที่.trim(),
        หมู่: form.หมู่.trim(),
        แขวงตำบล: form.แขวงตำบล.trim(),
        เขตอำเภอ: form.เขตอำเภอ.trim(),
        จังหวัด: form.จังหวัด.trim(),
        ไปรษณีย์: form.ไปรษณีย์.trim(),
        ผู้ติดต่อฉุกเฉิน_ชื่อ: form.ผู้ติดต่อฉุกเฉิน_ชื่อ.trim(),
        ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: form.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์.trim(),
        ผู้ติดต่อฉุกเฉิน_โทร: form.ผู้ติดต่อฉุกเฉิน_โทร.trim(),
        วุฒิการศึกษา: form.วุฒิการศึกษา.trim(),
        สถาบันการศึกษา: form.สถาบันการศึกษา.trim(),
        สาขา: form.สาขา.trim(),
        attachments: [],
        createdAt: Date.now(),
        createdByName: `ผู้รับเหมา: ${link.company} (ลิงก์สาธารณะ)`,
      };
      await setDoc(ref, record);
      setForm(emptySelfEntryForm());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserPlus className="text-sky-600" size={22} />
            ลงทะเบียนทีมงานใหม่ (ยังไม่มีชื่อในระบบ)
          </h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <Clock size={12} /> กรอกรายชื่อ + แนบเอกสารล่วงหน้าได้เลย HR จะตรวจสอบและเพิ่มเข้าระบบให้ภายหลัง
          </p>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Building2 size={14} /> โครงการ: {link.project} • บริษัท: <strong>{link.company}</strong>
            {link.employeeType && ` (${CONTRACTOR_EMPLOYEE_TYPE_LABELS[link.employeeType]})`}
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
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700"
          >
            <UserPlus size={15} /> เพิ่มรายชื่อใหม่
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">รายชื่อที่กรอกไว้แล้ว ({members.length} คน)</h2>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-2">
              <Inbox size={24} />
              <p className="text-sm">ยังไม่มีรายชื่อ — กด "เพิ่มรายชื่อใหม่" ด้านบนเพื่อเริ่มกรอก</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <SelfEntryMemberRow key={m.id} member={m} link={link} requirements={requirements} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="text-sky-600" size={20} />
                เพิ่มรายชื่อใหม่ — {link.company}
              </h3>
              <p className="text-xs text-gray-500 mt-1">กรอกข้อมูลให้ครบที่สุดเท่าที่ทำได้ HR จะตรวจสอบก่อนเพิ่มเข้าระบบจริง</p>
            </div>
            <div className="p-5 overflow-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelfEntryField label="คำนำหน้า (นาย/นาง/นางสาว)">
                <input value={form.คำนำหน้า} onChange={(e) => setForm((f) => ({ ...f, คำนำหน้า: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="ชื่อตัว *">
                <input required value={form.ชื่อตัว} onChange={(e) => setForm((f) => ({ ...f, ชื่อตัว: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="ชื่อสกุล *">
                <input required value={form.ชื่อสกุล} onChange={(e) => setForm((f) => ({ ...f, ชื่อสกุล: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="ตำแหน่ง">
                <input value={form.ตำแหน่ง} onChange={(e) => setForm((f) => ({ ...f, ตำแหน่ง: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="เพศ">
                <input value={form.เพศ} onChange={(e) => setForm((f) => ({ ...f, เพศ: e.target.value }))} className="input" placeholder="ชาย / หญิง" />
              </SelfEntryField>
              <SelfEntryField label="สัญชาติ">
                <input value={form.สัญชาติ} onChange={(e) => setForm((f) => ({ ...f, สัญชาติ: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="เลขบัตรประชาชน">
                <input value={form.เลขบัตรประชาชน} onChange={(e) => setForm((f) => ({ ...f, เลขบัตรประชาชน: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="วันเกิด">
                <input type="date" value={form.วันเกิด} onChange={(e) => setForm((f) => ({ ...f, วันเกิด: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="โทรศัพท์">
                <input value={form.โทรศัพท์} onChange={(e) => setForm((f) => ({ ...f, โทรศัพท์: e.target.value }))} className="input" />
              </SelfEntryField>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">ที่อยู่ปัจจุบัน</div>
              <SelfEntryField label="บ้านเลขที่ / หมู่บ้าน">
                <input value={form.บ้านเลขที่} onChange={(e) => setForm((f) => ({ ...f, บ้านเลขที่: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="หมู่">
                <input value={form.หมู่} onChange={(e) => setForm((f) => ({ ...f, หมู่: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="ตำบล/แขวง">
                <input value={form.แขวงตำบล} onChange={(e) => setForm((f) => ({ ...f, แขวงตำบล: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="อำเภอ/เขต">
                <input value={form.เขตอำเภอ} onChange={(e) => setForm((f) => ({ ...f, เขตอำเภอ: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="จังหวัด">
                <input value={form.จังหวัด} onChange={(e) => setForm((f) => ({ ...f, จังหวัด: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="รหัสไปรษณีย์">
                <input value={form.ไปรษณีย์} onChange={(e) => setForm((f) => ({ ...f, ไปรษณีย์: e.target.value }))} className="input" />
              </SelfEntryField>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">ผู้ติดต่อฉุกเฉิน</div>
              <SelfEntryField label="ชื่อ-สกุล">
                <input value={form.ผู้ติดต่อฉุกเฉิน_ชื่อ} onChange={(e) => setForm((f) => ({ ...f, ผู้ติดต่อฉุกเฉิน_ชื่อ: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="เกี่ยวข้องเป็น">
                <input value={form.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์} onChange={(e) => setForm((f) => ({ ...f, ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="เบอร์โทร">
                <input value={form.ผู้ติดต่อฉุกเฉิน_โทร} onChange={(e) => setForm((f) => ({ ...f, ผู้ติดต่อฉุกเฉิน_โทร: e.target.value }))} className="input" />
              </SelfEntryField>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">การศึกษา</div>
              <SelfEntryField label="วุฒิการศึกษา">
                <input value={form.วุฒิการศึกษา} onChange={(e) => setForm((f) => ({ ...f, วุฒิการศึกษา: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="สถาบันการศึกษา">
                <input value={form.สถาบันการศึกษา} onChange={(e) => setForm((f) => ({ ...f, สถาบันการศึกษา: e.target.value }))} className="input" />
              </SelfEntryField>
              <SelfEntryField label="สาขา">
                <input value={form.สาขา} onChange={(e) => setForm((f) => ({ ...f, สาขา: e.target.value }))} className="input" />
              </SelfEntryField>

              {error && <div className="sm:col-span-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
            </div>
            <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">ยกเลิก</button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                บันทึกรายชื่อนี้
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; background: white; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

const SelfEntryField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    {children}
  </label>
);

// แถวรายชื่อที่กรอกเองแล้ว 1 คน — แนบเอกสารเพิ่มได้ (เก็บลง recruitment_pending_employees ตัวเดิม)
const SelfEntryMemberRow = ({
  member,
  link,
  requirements,
}: {
  member: RecruitmentPendingEmployee;
  link: TrainingContractorLink;
  requirements: ProjectDocumentRequirement[];
}) => {
  const documentTypeOptions = useDocumentTypeCatalog();
  const [expanded, setExpanded] = useState(false);
  const [docType, setDocType] = useState<string>(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMigrant = isMigrantNationality(member.สัญชาติ);
  const docCheck = checkProjectDocumentCompleteness(member.attachments as HiringAttachment[] | undefined, requirements, isMigrant);
  const status = getIntakeStatus(member);
  const statusMeta = INTAKE_STATUS_META[status];

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const candidateKey = `${slugifyContractorCompany(link.company)}-${member.id}`;
      const res = await uploadHiringDocumentFile(file, {
        candidateName: buildFullName(member),
        position: member.ตำแหน่ง || "",
        candidateKey,
        docType,
      });
      await appendAttachmentToRecruitmentPending(member.id, {
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

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-gray-50">
        <div>
          <div className="text-sm font-semibold text-gray-800">{buildFullName(member)}</div>
          <div className="text-xs text-gray-400">{member.ตำแหน่ง || "-"} • {member.สัญชาติ || "-"}</div>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
      </button>

      {expanded && (
        <div className="p-3 border-t bg-gray-50 flex flex-col gap-3">
          {docCheck.missing.length > 0 && (
            <p className="text-xs text-amber-700">ยังขาด: {docCheck.missing.map((m) => m.label).join(", ")}</p>
          )}

          {((member.attachments as HiringAttachment[] | undefined) || []).length > 0 && (
            <ul className="flex flex-col gap-1">
              {((member.attachments as HiringAttachment[]) || []).map((a, idx) => (
                <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white rounded-lg px-2.5 py-1.5 border border-gray-200">
                  <span className="flex items-center gap-1.5 text-gray-600 truncate">
                    <Paperclip size={12} /> {a.name}{" "}
                    <span className="text-gray-400">({documentTypeOptions.find((o) => o.value === a.docType)?.label || a.docType})</span>
                  </span>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline shrink-0">เปิดไฟล์</a>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
              {documentTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <IdCardPhotoGuideButton highlight={isIdCardDocType(docType)} />
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
          {isIdCardDocType(docType) && (
            <p className="text-[11px] text-sky-700 flex items-center gap-1">
              📌 ก่อนถ่ายรูปบัตร กด "ดูตัวอย่างถ่ายรูปบัตร" ด้านบนเพื่อดูวิธีถ่ายให้ถูกต้อง (พื้นขาว ไม่เอียง ไม่มีแสงสะท้อน)
            </p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
};
