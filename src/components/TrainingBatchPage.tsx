import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Inbox,
  Link2,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Upload as UploadIcon,
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
import { generateTrainingNameListPdf, generateAndDownloadTrainingNameListPdf, generateAndPreviewTrainingNameListPdf } from "../utils/trainingNameListPdf";
import { generateAccessBadgeRequestPdf, generateAndDownloadAccessBadgeRequestPdf, generateAndPreviewAccessBadgeRequestPdf } from "../utils/accessBadgeRequestPdf";
import { generateTrainingSubmissionZip } from "../utils/trainingSubmissionZip";
import { DrugTestReportPanel } from "./DrugTestReportPanel";
import { downloadCardReceiptFormXlsx } from "../utils/cardReceiptFormXlsx";
import {
  generateAndDownloadHuashiTrainingRequestFormPdf,
  generateAndPreviewHuashiTrainingRequestFormPdf,
  generateHuashiTrainingRequestFormPdf,
  isHuashiTrainingRequestProject,
} from "../utils/huashiTrainingRequestFormPdf";
import {
  countGmtpEnrollmentsByLanguage,
  downloadGmtpRoundForms,
  isGmtpTrainingRequestProject,
} from "../utils/gmtpTrainingRequestFormXlsx";
import {
  buildProjectAliasGroups,
  buildProjectDisplayKeys,
  checkProjectDocumentCompleteness,
  getApplicableRequirements,
  groupRequirements,
  isSameProjectName,
  normalizeProjectDocumentRequirements,
  PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD,
  ProjectDocumentRequirement,
  RequirementUnit,
} from "./projectDocumentConfig";
import {
  buildContractorPortalUrl,
  CONTRACTOR_EMPLOYEE_TYPE_LABELS,
  CONTRACTOR_EMPLOYEE_TYPES,
  ContractorEmployeeType,
  createContractorLinkToken,
  PENDING_MEMBER_STATUS_META,
  TRAINING_CONTRACTOR_LINKS_COLLECTION,
  TRAINING_PENDING_MEMBERS_COLLECTION,
  TrainingContractorLink,
  TrainingPendingMember,
} from "./contractorPortalConfig";
import { useDocumentTypeCatalog } from "./documentTypeCatalog";
import { EMPLOYEE_TYPE_OPTIONS, HiringAttachment } from "./recruitmentIntakeConfig";
import {
  appendAttachmentToEmployee,
  resolveEmployeeDocumentCandidateKey,
  uploadHiringDocumentFile,
} from "../utils/hiringDocsAttachments";
import { IdCardPhotoGuideButton, isIdCardDocType } from "./IdCardPhotoGuide";

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
  attachments?: Array<{ docType?: string; name?: string; url?: string }>;
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
  // มีค่าเฉพาะพนักงานที่เคยผ่านระบบ Recruitment มาก่อน — ใช้หา folder Drive เดิมของคนนี้
  // (ดู resolveEmployeeDocumentCandidateKey ใน src/utils/hiringDocsAttachments.ts)
  hiringPacketId?: string;
  recruitmentSourceId?: string;
}

import { GMTP_MATRIX_COURSES, GMTP_ROLE_OPTIONS, getGmtpRoleCourses, getGmtpCourseEnrollments, resolveGmtpMatrixRole, gmtpRoundDocumentRequirements } from "./gmtpTrainingMatrix";

const INACTIVE_STATUSES = ["ลาออก", "เลิกจ้าง", "ไม่มาเริ่มงาน"];

// จำค่าผู้ขออบรม (Requestor) ล่าสุดไว้ใน localStorage เพราะปกติเป็นคนเดิมทุกรอบ (เช่น Safety Officer
// ประจำโครงการ) ไม่ต้องให้กรอกใหม่ทุกครั้ง — ใช้เฉพาะโครงการที่ต้องใช้ใบปะหน้าแบบ GMTP (ดู isGmtpTrainingRequestProject)
const GMTP_REQUESTOR_STORAGE_KEY = "cmg_hr_gmtp_requestor_info_v1";

const loadLastGmtpRequestorInfo = (): { requestorName: string; requestorPosition: string; requestorMobile: string; requestorEmail: string } => {
  try {
    const raw = window.localStorage.getItem(GMTP_REQUESTOR_STORAGE_KEY);
    if (!raw) return { requestorName: "", requestorPosition: "", requestorMobile: "", requestorEmail: "" };
    const parsed = JSON.parse(raw);
    return {
      requestorName: String(parsed?.requestorName || ""),
      requestorPosition: String(parsed?.requestorPosition || ""),
      requestorMobile: String(parsed?.requestorMobile || ""),
      requestorEmail: String(parsed?.requestorEmail || ""),
    };
  } catch {
    return { requestorName: "", requestorPosition: "", requestorMobile: "", requestorEmail: "" };
  }
};

const saveLastGmtpRequestorInfo = (info: { requestorName: string; requestorPosition: string; requestorMobile: string; requestorEmail: string }) => {
  try {
    window.localStorage.setItem(GMTP_REQUESTOR_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // localStorage ใช้ไม่ได้ (เช่น private mode) — ปล่อยผ่าน ไม่ใช่ปัญหาคอขาด
  }
};

const emptyBatchForm = (defaultProject: string) => ({
  project: defaultProject,
  courseName: isGmtpTrainingRequestProject(defaultProject) ? "รอบอบรม J74" : DEFAULT_TRAINING_COURSE_OPTIONS[0],
  courseNameOther: "",
  date: "",
  timeSlot: "",
  location: "",
  trainer: "",
  note: "",
  // นัดตรวจสุขภาพ — แยกจากวันอบรม ไม่บังคับกรอกตอนสร้างรอบ (มากรอกทีหลังตอนจะสร้างลิงก์คลินิกก็ได้)
  healthCheckDate: "",
  healthCheckTimeSlot: "",
  healthCheckLocation: "",
  // ข้อมูลผู้ขออบรม — ใช้เฉพาะโครงการที่ใบปะหน้าต้องการ (เช่น GMTP/J-074) จำค่าล่าสุดไว้ให้อัตโนมัติ
  ...loadLastGmtpRequestorInfo(),
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
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingOriginalBatch, setEditingOriginalBatch] = useState<TrainingBatch | null>(null);
  const [editReturnBatchId, setEditReturnBatchId] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState(emptyBatchForm(projectOptions[0] || ""));
  const [saving, setSaving] = useState(false);

  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [newBatchId, setNewBatchId] = useState<string | null>(null);

  // ----- ลิงก์เก็บเอกสารล่วงหน้า (ไม่ผูกรอบอบรม) -----
  // "invited" = เลือกชื่อพนักงานที่มีอยู่แล้วในระบบ (ของเดิม) / "self_entry" = ผู้รับเหมาที่ "ยังไม่มีชื่อ"
  // ในระบบเลย กรอกชื่อ+แนบเอกสารเองผ่านฟอร์มสาธารณะ (ดูรายละเอียดที่ ContractorPortal.tsx)
  const [generalContractorLinks, setGeneralContractorLinks] = useState<TrainingContractorLink[]>([]);
  const [showGeneralLinkForm, setShowGeneralLinkForm] = useState(false);
  const [generalLinkMode, setGeneralLinkMode] = useState<"invited" | "self_entry">("invited");
  const [generalLinkProject, setGeneralLinkProject] = useState("");
  const [generalLinkCompany, setGeneralLinkCompany] = useState("");
  const [generalLinkEmployeeType, setGeneralLinkEmployeeType] = useState("");
  const [showGeneralLinkPicker, setShowGeneralLinkPicker] = useState(false);
  const [creatingGeneralLink, setCreatingGeneralLink] = useState(false);
  const [copiedGeneralLinkId, setCopiedGeneralLinkId] = useState<string | null>(null);

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

  // ลิงก์เก็บเอกสารล่วงหน้าทั้งหมด (ไม่มี batchId) — ใช้ซ้ำได้เรื่อยๆ ต่อ โครงการ+บริษัทผู้รับเหมา
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingContractorLink))
        .filter((l) => !l.batchId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setGeneralContractorLinks(rows);
    });
    return () => unsub();
  }, [db]);

  // เอกสารที่จำเป็นของแต่ละโครงการ (ตั้งค่าไว้ที่หน้า "โครงการ") ใช้แจ้งเตือนตอนเลือกพนักงานเข้ารอบ
  const [projectDocRequirements, setProjectDocRequirements] = useState<Map<string, ProjectDocumentRequirement[]>>(new Map());
  // alias ของชื่อโครงการ (เช่น "J74" <-> "PRJ-2026-J-074 - Building GMTP") สำหรับจับคู่ข้อมูลพนักงานเก่าที่กรอกโครงการเป็นรหัสสั้น
  const [projectAliasGroups, setProjectAliasGroups] = useState<string[][]>([]);
  // true = CMG เป็นคนออกบัตรผ่านเข้าโครงการนี้เอง (เรื่องทำบัตรจริง ไม่เกี่ยวกับปุ่ม "ใบขอออกบัตร" ที่มีอยู่แล้ว
  // ซึ่งเป็นแค่เอกสารขอ ใช้ได้ทุกโครงการ) / false หรือไม่พบ = โครงการ/ผู้ว่าจ้างทำบัตรให้เอง — ให้ Safety/Admin
  // แนบรูปบัตร/กรอกเลขบัตรที่ได้รับกลับมาแทน เพื่อปิดรอบอบรมรายคน
  const [projectIssuesOwnBadge, setProjectIssuesOwnBadge] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "projects"), (snap) => {
      const map = new Map<string, ProjectDocumentRequirement[]>();
      const badgeMap = new Map<string, boolean>();
      const rawProjects: Array<{ project_no?: unknown; project_name?: unknown }> = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        rawProjects.push({ project_no: data.project_no, project_name: data.project_name });
        const displayKeys = buildProjectDisplayKeys({ project_no: data.project_no, project_name: data.project_name });
        const requirements = normalizeProjectDocumentRequirements(data.required_documents);
        if (requirements.length > 0) {
          displayKeys.forEach((key) => map.set(key, requirements));
        }
        const issuesOwnBadge = !!data[PROJECT_ISSUES_OWN_ACCESS_BADGE_FIELD];
        displayKeys.forEach((key) => badgeMap.set(key, issuesOwnBadge));
      });
      setProjectDocRequirements(map);
      setProjectIssuesOwnBadge(badgeMap);
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

  // บริษัทผู้รับเหมา/Supply manpower ของโครงการที่เลือกไว้ตอนสร้างลิงก์เก็บเอกสารล่วงหน้า
  const generalLinkCompanies = useMemo(() => {
    if (!generalLinkProject) return [];
    const names = new Set<string>();
    employees.forEach((e) => {
      const empType = e.employee_type || "";
      if (!CONTRACTOR_EMPLOYEE_TYPES.includes(empType as ContractorEmployeeType)) return;
      if (!employeeProjectNames(e).some((p) => isSameProjectName(p, generalLinkProject, projectAliasGroups))) return;
      const company = (e.บริษัทผู้รับเหมา || "").trim();
      if (company) names.add(company);
    });
    return Array.from(names).sort();
  }, [employees, generalLinkProject, projectAliasGroups]);

  // รายชื่อพนักงานของบริษัทที่เลือกไว้ — ไม่ตัดคนที่เคยอบรมแล้วออก เพราะยังไม่ผูกรอบอบรมใดๆ
  const generalLinkCandidates = useMemo(() => {
    if (!generalLinkProject || !generalLinkCompany) return [];
    return employees.filter((e) => {
      const empType = e.employee_type || "";
      if (!CONTRACTOR_EMPLOYEE_TYPES.includes(empType as ContractorEmployeeType)) return false;
      if ((e.บริษัทผู้รับเหมา || "").trim() !== generalLinkCompany) return false;
      if (!employeeProjectNames(e).some((p) => isSameProjectName(p, generalLinkProject, projectAliasGroups))) return false;
      return true;
    });
  }, [employees, generalLinkProject, generalLinkCompany, projectAliasGroups]);

  const handleCreateGeneralLink = async (invitedEmployeeIds: string[]) => {
    if (!generalLinkProject || !generalLinkCompany) return;
    setCreatingGeneralLink(true);
    try {
      const token = createContractorLinkToken();
      const matchedEmployee = employees.find((e) => invitedEmployeeIds.includes(e.id));
      const employeeType = (matchedEmployee?.employee_type as ContractorEmployeeType) || "";
      const record: Omit<TrainingContractorLink, "id"> = {
        project: generalLinkProject,
        company: generalLinkCompany,
        employeeType,
        invitedEmployeeIds,
        createdAt: Date.now(),
        createdByUid: firebaseUser?.uid || "",
        createdByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
      };
      await setDoc(doc(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION, token), record);
      setShowGeneralLinkPicker(false);
      setShowGeneralLinkForm(false);
      setGeneralLinkProject("");
      setGeneralLinkCompany("");
    } catch (err) {
      window.alert(`สร้างลิงก์ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setCreatingGeneralLink(false);
    }
  };

  // ลิงก์สำหรับ "ผู้รับเหมาใหม่ที่ยังไม่มีชื่ออยู่ในระบบ" — ระบุแค่โครงการ + ชื่อบริษัทผู้รับเหมาเอง
  // (พิมพ์เอง ไม่ได้เลือกจากรายชื่อพนักงานที่มีอยู่แล้ว เพราะยังไม่มีใครอยู่ในระบบเลย) ไม่ต้องเลือกรายชื่อ
  // ผู้รับเหมาจะกรอกชื่อ+แนบเอกสารเองหน้า public แล้วเข้าคิว "รอเพิ่มเข้าระบบ" ที่หน้า RecruitmentIntakePage
  const handleCreateSelfEntryLink = async () => {
    const project = generalLinkProject.trim();
    const company = generalLinkCompany.trim();
    if (!project || !company) return;
    setCreatingGeneralLink(true);
    try {
      const token = createContractorLinkToken();
      const record: Omit<TrainingContractorLink, "id"> = {
        project,
        company,
        employeeType: (generalLinkEmployeeType as ContractorEmployeeType) || "",
        mode: "self_entry",
        createdAt: Date.now(),
        createdByUid: firebaseUser?.uid || "",
        createdByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
      };
      await setDoc(doc(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION, token), record);
      setShowGeneralLinkForm(false);
      setGeneralLinkProject("");
      setGeneralLinkCompany("");
      setGeneralLinkEmployeeType("");
      setGeneralLinkMode("invited");
    } catch (err) {
      window.alert(`สร้างลิงก์ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setCreatingGeneralLink(false);
    }
  };

  const handleCopyGeneralLink = async (link: TrainingContractorLink) => {
    const url = buildContractorPortalUrl(link.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGeneralLinkId(link.id);
      setTimeout(() => setCopiedGeneralLinkId(null), 2000);
    } catch {
      window.prompt("คัดลอกลิงก์นี้:", url);
    }
  };

  const handleDeleteGeneralLink = async (link: TrainingContractorLink) => {
    if (!window.confirm(`ยืนยันลบลิงก์เก็บเอกสารล่วงหน้านี้? (${link.company} — ${link.project})`)) return;
    try {
      await deleteDoc(doc(db, "CMG-HR-Database", "root", TRAINING_CONTRACTOR_LINKS_COLLECTION, link.id));
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    }
  };

  // ----- Create batch -----
  const openCreateForm = () => {
    setEditingBatchId(null);
    setEditingOriginalBatch(null);
    setEditReturnBatchId(null);
    setBatchForm(emptyBatchForm(projectFilter !== "all" ? projectFilter : projectOptions[0] || ""));
    setShowCreateForm(true);
  };

  const openEditForm = (batch: TrainingBatch, returnToDetail = false) => {
    if (!canManage || saving) return;
    const useCourseName = isGmtpTrainingRequestProject(batch.project) || DEFAULT_TRAINING_COURSE_OPTIONS.includes(batch.courseName);
    setBatchForm({
      project: batch.project,
      courseName: useCourseName ? batch.courseName : "อื่นๆ (ระบุ)",
      courseNameOther: useCourseName ? "" : batch.courseName,
      date: batch.date || "", timeSlot: batch.timeSlot || "", location: batch.location || "", trainer: batch.trainer || "", note: batch.note || "",
      healthCheckDate: batch.healthCheckDate || "", healthCheckTimeSlot: batch.healthCheckTimeSlot || "", healthCheckLocation: batch.healthCheckLocation || "",
      requestorName: batch.requestorName || "", requestorPosition: batch.requestorPosition || "", requestorMobile: batch.requestorMobile || "", requestorEmail: batch.requestorEmail || "",
    });
    setEditingBatchId(batch.id);
    setEditingOriginalBatch(batch);
    setEditReturnBatchId(returnToDetail ? batch.id : null);
    setNewBatchId(null);
    setActiveBatchId(null);
    setShowCreateForm(true);
  };

  const closeBatchForm = () => {
    if (saving) return;
    setShowCreateForm(false);
    if (editReturnBatchId) setActiveBatchId(editReturnBatchId);
    setEditingBatchId(null);
    setEditingOriginalBatch(null);
    setEditReturnBatchId(null);
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || saving) return;
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
      const ref = editingBatchId
        ? doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, editingBatchId)
        : doc(collection(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION));
      const record: Record<string, unknown> = {
        project: batchForm.project.trim(),
        courseName,
        date: batchForm.date,
        timeSlot: batchForm.timeSlot.trim(),
        location: batchForm.location.trim(),
        trainer: batchForm.trainer.trim(),
        note: batchForm.note.trim(),
        updatedAt: Date.now(),
        healthCheckDate: batchForm.healthCheckDate,
        healthCheckTimeSlot: batchForm.healthCheckTimeSlot.trim(),
        healthCheckLocation: batchForm.healthCheckLocation.trim(),
        requestorName: batchForm.requestorName.trim(),
        requestorPosition: batchForm.requestorPosition.trim(),
        requestorMobile: batchForm.requestorMobile.trim(),
        requestorEmail: batchForm.requestorEmail.trim(),
      };
      if (editingBatchId) {
        const original: Record<string, unknown> = { ...(editingOriginalBatch || {}) };
        const changes = Object.fromEntries(Object.entries(record).filter(([key, value]) => key === "updatedAt" || value !== (original[key] ?? "")));
        await updateDoc(ref, { ...changes, capacity: deleteField() });
      } else {
        await setDoc(ref, {
          ...record, status: "planned", createdByUid: firebaseUser?.uid || "",
          createdByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(), createdAt: Date.now(),
        });
      }
      if (isGmtpTrainingRequestProject(batchForm.project)) {
        saveLastGmtpRequestorInfo({
          requestorName: batchForm.requestorName.trim(),
          requestorPosition: batchForm.requestorPosition.trim(),
          requestorMobile: batchForm.requestorMobile.trim(),
          requestorEmail: batchForm.requestorEmail.trim(),
        });
      }
      setShowCreateForm(false);
      setNewBatchId(editingBatchId ? null : ref.id);
      setActiveBatchId(ref.id);
      setEditingBatchId(null);
      setEditingOriginalBatch(null);
      setEditReturnBatchId(null);
    } catch (err) {
      window.alert(`บันทึกรอบอบรมไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
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
        key={activeBatch.id}
        openEmployeePicker={newBatchId === activeBatch.id}
        batch={activeBatch}
        enrollments={enrollments.filter((en) => en.batchId === activeBatch.id)}
        employees={employees}
        canManage={canManage}
        documentRequirements={projectDocRequirements.get(activeBatch.project) || []}
        issuesOwnAccessBadge={projectIssuesOwnBadge.get(activeBatch.project) ?? false}
        projectAliasGroups={projectAliasGroups}
        alreadyTrainedEmployeeIds={projectEnrolledEmployeeIds}
        onBack={() => { setActiveBatchId(null); setNewBatchId(null); }}
        onChangeStatus={(status) => handleChangeBatchStatus(activeBatch, status)}
        onEdit={() => openEditForm(activeBatch, true)}
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <Link2 className="text-sky-600" size={16} />
              ลิงก์เก็บเอกสารล่วงหน้า (ก่อนมีรอบอบรม)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              ส่งลิงก์นี้ให้ผู้รับเหมา/Supply manpower แนบเอกสารของทีมงานรอไว้ก่อนได้เลย พอเปิดรอบอบรมจริงจะเลือกคนที่เอกสารครบแล้วส่งเข้ารอบได้ทันที
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowGeneralLinkForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 whitespace-nowrap"
            >
              <Plus size={14} /> สร้างลิงก์ใหม่
            </button>
          )}
        </div>

        {generalContractorLinks.length === 0 ? (
          <p className="text-xs text-gray-400">ยังไม่มีลิงก์เก็บเอกสารล่วงหน้า</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {generalContractorLinks.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-semibold text-gray-700 whitespace-nowrap">{link.project}</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600 whitespace-nowrap">{link.company}</span>
                {link.employeeType && (
                  <span className="text-gray-400 whitespace-nowrap">({CONTRACTOR_EMPLOYEE_TYPE_LABELS[link.employeeType]})</span>
                )}
                {link.mode === "self_entry" ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold whitespace-nowrap">
                    ผู้รับเหมาใหม่ (กรอกชื่อเอง)
                  </span>
                ) : (
                  <span className="text-gray-400 whitespace-nowrap">{(link.invitedEmployeeIds || []).length} คน</span>
                )}
                <code className="text-gray-500 break-all flex-1 min-w-[160px]">{buildContractorPortalUrl(link.id)}</code>
                <button
                  onClick={() => handleCopyGeneralLink(link)}
                  className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-sky-700 hover:bg-sky-50 whitespace-nowrap"
                >
                  {copiedGeneralLinkId === link.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  {copiedGeneralLinkId === link.id ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
                {canManage && (
                  <button onClick={() => handleDeleteGeneralLink(link)} className="text-gray-400 hover:text-red-500 p-1" title="ลบลิงก์">
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
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
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    {canManage && (
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEditForm(b)} className="text-blue-700 hover:bg-blue-50 rounded px-2 py-1 text-xs font-semibold" title="แก้ไขรอบอบรม">แก้ไข</button>
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

      {showGeneralLinkForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Link2 className="text-sky-600" size={20} />
                  สร้างลิงก์เก็บเอกสารล่วงหน้า
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {generalLinkMode === "invited"
                    ? "เลือกโครงการ + บริษัทผู้รับเหมา แล้วเลือกรายชื่อทีมงาน (ต้องมีชื่ออยู่ในระบบแล้วเท่านั้น)"
                    : "สำหรับผู้รับเหมา/Supply manpower ที่ยังไม่มีชื่อในระบบเลย — ผู้รับเหมากรอกชื่อ+แนบเอกสารเองผ่านลิงก์นี้"}
                </p>
              </div>
              <button
                onClick={() => { setShowGeneralLinkForm(false); setGeneralLinkProject(""); setGeneralLinkCompany(""); setGeneralLinkEmployeeType(""); setGeneralLinkMode("invited"); }}
                className="text-gray-400 hover:text-red-500 p-1 shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setGeneralLinkMode("invited"); setGeneralLinkCompany(""); }}
                  className={`flex-1 px-3 py-2 ${generalLinkMode === "invited" ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  เลือกชื่อที่มีในระบบแล้ว
                </button>
                <button
                  type="button"
                  onClick={() => { setGeneralLinkMode("self_entry"); setGeneralLinkCompany(""); }}
                  className={`flex-1 px-3 py-2 ${generalLinkMode === "self_entry" ? "bg-sky-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  ผู้รับเหมาใหม่ (ยังไม่มีชื่อในระบบ)
                </button>
              </div>

              <Field label="โครงการ *">
                <select
                  className="input"
                  value={generalLinkProject}
                  onChange={(e) => { setGeneralLinkProject(e.target.value); setGeneralLinkCompany(""); }}
                >
                  <option value="">เลือกโครงการ</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>

              {generalLinkMode === "invited" ? (
                <>
                  <Field label="บริษัทผู้รับเหมา/Supply manpower *">
                    <select
                      className="input"
                      value={generalLinkCompany}
                      onChange={(e) => setGeneralLinkCompany(e.target.value)}
                      disabled={!generalLinkProject}
                    >
                      <option value="">เลือกบริษัท</option>
                      {generalLinkCompanies.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  {generalLinkProject && generalLinkCompanies.length === 0 && (
                    <p className="text-xs text-amber-600">
                      ไม่พบบริษัทผู้รับเหมา/Supply manpower ของโครงการนี้ในระบบ — กรุณาเพิ่มชื่อพนักงานเข้าระบบก่อน หรือสลับไปแท็บ "ผู้รับเหมาใหม่" ด้านบน
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Field label="ชื่อบริษัทผู้รับเหมา/Supply manpower *">
                    <input
                      className="input"
                      value={generalLinkCompany}
                      onChange={(e) => setGeneralLinkCompany(e.target.value)}
                      placeholder="พิมพ์ชื่อบริษัทผู้รับเหมา"
                    />
                  </Field>
                  <Field label="ประเภทพนักงาน">
                    <select className="input" value={generalLinkEmployeeType} onChange={(e) => setGeneralLinkEmployeeType(e.target.value)}>
                      <option value="">ไม่ระบุ</option>
                      {CONTRACTOR_EMPLOYEE_TYPES.map((t) => (
                        <option key={t} value={t}>{CONTRACTOR_EMPLOYEE_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-xs text-gray-400">
                    ลิงก์นี้จะให้ผู้รับเหมากรอกชื่อ+ข้อมูลส่วนตัว+แนบเอกสารเอง รายชื่อที่กรอกจะไปรอ HR ตรวจสอบที่หน้า
                    "รายชื่อรอเพิ่ม" (แท็บผู้รับเหมา) เหมือนรายชื่อที่มาจากระบบ Recruitment
                  </p>
                </>
              )}
            </div>
            <div className="p-5 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => { setShowGeneralLinkForm(false); setGeneralLinkProject(""); setGeneralLinkCompany(""); setGeneralLinkEmployeeType(""); setGeneralLinkMode("invited"); }}
                className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
              >
                ยกเลิก
              </button>
              {generalLinkMode === "invited" ? (
                <button
                  onClick={() => setShowGeneralLinkPicker(true)}
                  disabled={!generalLinkProject || !generalLinkCompany}
                  className="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  เลือกรายชื่อ →
                </button>
              ) : (
                <button
                  onClick={handleCreateSelfEntryLink}
                  disabled={!generalLinkProject || !generalLinkCompany.trim() || creatingGeneralLink}
                  className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  {creatingGeneralLink ? <Loader2 className="animate-spin" size={15} /> : <Link2 size={15} />}
                  สร้างลิงก์
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showGeneralLinkPicker && (
        <ContractorLinkPickerModal
          company={generalLinkCompany}
          candidates={generalLinkCandidates}
          creating={creatingGeneralLink}
          onClose={() => setShowGeneralLinkPicker(false)}
          onConfirm={handleCreateGeneralLink}
        />
      )}

      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <form onSubmit={handleCreateBatch} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Plus className="text-blue-600" size={20} />
                  {editingBatchId ? "แก้ไขรอบอบรม" : "สร้างรอบอบรมใหม่"}
                </h3>
              </div>
              <button type="button" disabled={saving} onClick={closeBatchForm} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="โครงการ *">
                <select
                  required
                  value={batchForm.project}
                  disabled={!!editingBatchId}
                  onChange={(e) => setBatchForm((f) => ({ ...f, project: e.target.value,
                    courseName: isGmtpTrainingRequestProject(e.target.value) ? "รอบอบรม J74" : DEFAULT_TRAINING_COURSE_OPTIONS[0],
                  }))}
                  className="input"
                >
                  <option value="" disabled>เลือกโครงการ...</option>
                  {editingBatchId && !projectOptions.includes(batchForm.project) && <option value={batchForm.project}>{batchForm.project}</option>}
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {editingBatchId && <p className="text-xs text-gray-500 mt-1">โครงการผูกกับรายชื่อและเอกสารของรอบนี้</p>}
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
              <Field label={isGmtpTrainingRequestProject(batchForm.project) ? "ชื่อรอบอบรม *" : "หลักสูตร *"}>
                {isGmtpTrainingRequestProject(batchForm.project) ? <>
                  <input required value={batchForm.courseName} onChange={(e) => setBatchForm((f) => ({ ...f, courseName: e.target.value }))} className="input" />
                  <p className="text-xs text-gray-500 mt-1">เพิ่มรายชื่อและจับคู่ตำแหน่ง ระบบจะจัดทุกคอร์สตาม Training Matrix 74</p>
                </> : <select
                  value={batchForm.courseName}
                  onChange={(e) => setBatchForm((f) => ({ ...f, courseName: e.target.value }))}
                  className="input"
                >
                  {DEFAULT_TRAINING_COURSE_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>}
              </Field>
              {!isGmtpTrainingRequestProject(batchForm.project) && batchForm.courseName === "อื่นๆ (ระบุ)" && (
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
              <p className="text-xs text-gray-500 sm:col-span-2">เพิ่มพนักงานเข้ารอบนี้ได้ไม่จำกัดจำนวน</p>
              {isGmtpTrainingRequestProject(batchForm.project) && (
                <>
                  <div className="sm:col-span-2 border-t pt-3 mt-1">
                    <p className="text-xs font-semibold text-emerald-700 mb-2">
                      ข้อมูลผู้ขออบรม (สำหรับใบปะหน้า GMTP — จำค่าล่าสุดไว้ให้แล้ว แก้ไขได้ถ้าเปลี่ยนคนขอ)
                    </p>
                  </div>
                  <Field label="ชื่อผู้ขอ (Requestor)">
                    <input
                      value={batchForm.requestorName}
                      onChange={(e) => setBatchForm((f) => ({ ...f, requestorName: e.target.value }))}
                      className="input"
                    />
                  </Field>
                  <Field label="ตำแหน่งผู้ขอ (Position)">
                    <input
                      value={batchForm.requestorPosition}
                      onChange={(e) => setBatchForm((f) => ({ ...f, requestorPosition: e.target.value }))}
                      className="input"
                    />
                  </Field>
                  <Field label="เบอร์โทรผู้ขอ (Mobile)">
                    <input
                      value={batchForm.requestorMobile}
                      onChange={(e) => setBatchForm((f) => ({ ...f, requestorMobile: e.target.value }))}
                      className="input"
                    />
                  </Field>
                  <Field label="อีเมล์ผู้ขอ (Email)">
                    <input
                      type="email"
                      value={batchForm.requestorEmail}
                      onChange={(e) => setBatchForm((f) => ({ ...f, requestorEmail: e.target.value }))}
                      className="input"
                    />
                  </Field>
                </>
              )}
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
              <button type="button" disabled={saving} onClick={closeBatchForm} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {editingBatchId ? "บันทึกการแก้ไข" : "สร้างรอบอบรม"}
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
  openEmployeePicker,
  enrollments,
  employees,
  canManage,
  documentRequirements,
  issuesOwnAccessBadge,
  projectAliasGroups,
  alreadyTrainedEmployeeIds,
  onBack,
  onChangeStatus,
  onEdit,
}: {
  batch: TrainingBatch;
  openEmployeePicker: boolean;
  enrollments: TrainingEnrollment[];
  employees: EmployeeRow[];
  canManage: boolean;
  documentRequirements: ProjectDocumentRequirement[];
  issuesOwnAccessBadge: boolean;
  projectAliasGroups: string[][];
  alreadyTrainedEmployeeIds: Set<string>;
  onBack: () => void;
  onChangeStatus: (status: TrainingBatchStatus) => void;
  onEdit: () => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();
  const [showPicker, setShowPicker] = useState(openEmployeePicker && canManage);
  const [detailTab, setDetailTab] = useState<"roster" | "forms">("roster");
  const [generatingSubmission, setGeneratingSubmission] = useState(false);
  const [healthRecords, setHealthRecords] = useState<HealthCheckRecord[]>([]);
  const [clinicLinkCopied, setClinicLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  // รายละเอียดรายคน (เอกสาร + ผลตรวจสุขภาพ + โรคประจำตัว) รวมอยู่ในป็อบอัพเดียว แทนการขยายแถวตาราง
  // (ตารางแคบเกินไปสำหรับฟอร์มอัปโหลดเอกสาร)
  const [detailsEnrollmentId, setDetailsEnrollmentId] = useState<string | null>(null);
  const [showSharedUpload, setShowSharedUpload] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(batch.healthCheckDate || "");
  const [scheduleTimeSlot, setScheduleTimeSlot] = useState(batch.healthCheckTimeSlot || "");
  const [scheduleLocation, setScheduleLocation] = useState(batch.healthCheckLocation || "");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [clinicPanelOpen, setClinicPanelOpen] = useState(false);

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
  const [rosterSearch, setRosterSearch] = useState("");
  const filteredEnrollments = useMemo(() => {
    const kw = rosterSearch.trim().toLowerCase();
    if (!kw) return enrollments;
    return enrollments.filter(
      (en) =>
        en.employeeName.toLowerCase().includes(kw) ||
        (en.employeeCode || "").toLowerCase().includes(kw) ||
        (en.position || "").toLowerCase().includes(kw)
    );
  }, [enrollments, rosterSearch]);
  // ใช้ join สดกับข้อมูลพนักงานล่าสุด (employee_data) แทนการพึ่ง documentSnapshot ที่ freeze ไว้ตอนเพิ่มเข้ารอบ
  // เพื่อให้เอกสารที่อัปโหลดเพิ่มทีหลัง (ไม่ว่าจะอัปจากหน้าเอกสารพนักงาน หรือจากหน้านี้เอง) อัปเดตสถานะทันที
  const employeeById = useMemo(() => {
    const map = new Map<string, EmployeeRow>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

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
      const docCheckRequirements = isGmtpTrainingRequestProject(batch.project)
        ? gmtpRoundDocumentRequirements(documentRequirements, resolveGmtpMatrixRole(member.position)) : documentRequirements;
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

  const handleAddEmployees = async (picked: EmployeeRow[], language: TrainingLanguage, matrixRoles: Record<string, string> = {}) => {
    try {
      await Promise.all(
        picked.map((emp) => {
          const ref = doc(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION));
          const isMigrant = isMigrantNationality(emp.สัญชาติ);
          const docCheck = checkProjectDocumentCompleteness(
            emp.attachments as Array<{ docType?: string }> | undefined,
            isGmtpTrainingRequestProject(batch.project) ? gmtpRoundDocumentRequirements(documentRequirements, resolveGmtpMatrixRole(emp.ตำแหน่ง, matrixRoles[emp.id])) : documentRequirements,
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
            ...(isGmtpTrainingRequestProject(batch.project) ? { matrixRole: resolveGmtpMatrixRole(emp.ตำแหน่ง, matrixRoles[emp.id]) } : {}),
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
        await generateAndPreviewTrainingNameListPdf(batch, enrollments, employees);
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
        await generateAndDownloadTrainingNameListPdf(batch, enrollments, employees);
      }
    } catch (err) {
      window.alert(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingNameListPdf(false);
    }
  };

  const [generatingGmtpXlsx, setGeneratingGmtpXlsx] = useState(false);
  const [generatingCardReceipt, setGeneratingCardReceipt] = useState(false);
  const handleDownloadCardReceipt = async () => {
    if (!canManage || generatingCardReceipt || !enrollments.length) return;
    setGeneratingCardReceipt(true);
    try {
      await downloadCardReceiptFormXlsx(batch, enrollments, employees);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "สร้างใบลงชื่อรับบัตรไม่สำเร็จ");
    } finally {
      setGeneratingCardReceipt(false);
    }
  };
  const gmtpCourseGroups = useMemo(() => GMTP_MATRIX_COURSES.map((course) => {
    const people = getGmtpCourseEnrollments(enrollments, course.name);
    return { ...course, people, counts: countGmtpEnrollmentsByLanguage(people, employees) };
  }).filter((course) => course.people.length > 0), [enrollments, employees]);
  const [editingGmtpHeader, setEditingGmtpHeader] = useState(false);
  const [savingGmtpHeader, setSavingGmtpHeader] = useState(false);
  const [gmtpHeader, setGmtpHeader] = useState({
    date: "", timeSlot: "", location: "", trainer: "",
    requestorName: "", requestorPosition: "", requestorMobile: "", requestorEmail: "",
    gmtpConfirmedBy: "", gmtpConfirmedDate: "",
  });
  const openGmtpHeader = () => {
    setGmtpHeader({
      date: batch.date || "", timeSlot: batch.timeSlot || "",
      location: batch.location || "", trainer: batch.trainer || "",
      requestorName: batch.requestorName || "", requestorPosition: batch.requestorPosition || "",
      requestorMobile: batch.requestorMobile || "", requestorEmail: batch.requestorEmail || "",
      gmtpConfirmedBy: batch.gmtpConfirmedBy || "", gmtpConfirmedDate: batch.gmtpConfirmedDate || "",
    });
    setEditingGmtpHeader(true);
  };
  const saveGmtpHeader = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || savingGmtpHeader || !gmtpHeader.date) return;
    setSavingGmtpHeader(true);
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id), {
        ...gmtpHeader, updatedAt: Date.now(),
      });
      saveLastGmtpRequestorInfo(gmtpHeader);
      setEditingGmtpHeader(false);
    } catch (err) {
      window.alert(`บันทึกข้อมูลใบปะหน้าไม่สำเร็จ: ${err instanceof Error ? err.message : "กรุณาลองอีกครั้ง"}`);
    } finally {
      setSavingGmtpHeader(false);
    }
  };

  const handleDownloadGmtpXlsx = async (courseName?: string, language?: "th" | "mm") => {
    setGeneratingGmtpXlsx(true);
    try {
      await downloadGmtpRoundForms(batch, enrollments, employees, {
        requestorName: batch.requestorName || "",
        requestorPosition: batch.requestorPosition || "",
        requestorMobile: batch.requestorMobile || "",
        requestorEmail: batch.requestorEmail || "",
      }, courseName, language, documentRequirements, recordByEmployee);
    } catch (err) {
      window.alert(`สร้างใบปะหน้าไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setGeneratingGmtpXlsx(false);
    }
  };

  const handleDownloadSubmission = async () => {
    if (!canManage || generatingSubmission || !enrollments.length) return;
    setGeneratingSubmission(true);
    try {
      const cover = isHuashiTrainingRequestProject(batch.project)
        ? await generateHuashiTrainingRequestFormPdf(batch, enrollments, employees)
        : await generateTrainingNameListPdf(batch, enrollments, employees);
      const individualForms = await generateAccessBadgeRequestPdf(batch, enrollments, employees, recordByEmployee);
      const warnings: string[] = [];
      const bytes = await generateTrainingSubmissionZip([
        { name: "00_ใบปะหน้า.pdf", bytes: cover },
        { name: "01_ใบรายคน.pdf", bytes: individualForms },
      ], enrollments, employees, documentRequirements, recordByEmployee, warnings);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Training_Submission_${batch.project.replace(/[\\/:*?"<>|]/g, "_")}_${batch.date}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (warnings.length) window.alert(`ดาวน์โหลดชุดเอกสารที่มีแล้ว แต่เอกสารยังไม่ครบ:\n${Array.from(new Set(warnings)).join("\n")}\n\nมีรายการนี้แนบใน ZIP ด้วย`);
    } catch (error) {
      window.alert(`ดาวน์โหลดชุดส่งอบรมไม่สำเร็จ: ${error instanceof Error ? error.message : "กรุณาลองอีกครั้ง"}`);
    } finally {
      setGeneratingSubmission(false);
    }
  };

  const [generatingBadgeRequestPdf, setGeneratingBadgeRequestPdf] = useState(false);

  const handlePreviewAccessBadgeRequestPdf = async () => {
    if (isGmtpTrainingRequestProject(batch.project)) return;
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
    if (isGmtpTrainingRequestProject(batch.project)) return;
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
          {isGmtpTrainingRequestProject(batch.project) && <p className="text-sm text-indigo-700 mt-2">หนึ่งรอบ หลายคอร์สตาม Training Matrix 74 • รายชื่อซ้ำได้ตามคอร์สที่ตำแหน่งต้องอบรม</p>}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-1">
            <button type="button" onClick={onEdit} className="px-3 py-2 border border-blue-300 rounded-lg text-blue-700 text-sm font-semibold hover:bg-blue-50">แก้ไขรอบอบรม</button>
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
            {isGmtpTrainingRequestProject(batch.project) ? (detailTab === "forms" && (
              <>
                <button onClick={openGmtpHeader} className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50">
                  ข้อมูลผู้ขอ / ส่วนหัวใบปะหน้า
                </button>
                <button
                  onClick={() => handleDownloadGmtpXlsx()}
                  disabled={enrollments.length === 0 || generatingGmtpXlsx}
                  title="รวมใบปะหน้าและเอกสารแนบผู้เข้าอบรม แยกคอร์สและไทย–พม่าใน ZIP"
                  className="flex items-center gap-1.5 sm:gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-indigo-700 text-white rounded-lg text-sm sm:text-xs font-semibold hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {generatingGmtpXlsx ? <Loader2 className="animate-spin" size={16} /> : <Download size={14} />} ดาวน์โหลดชุดส่งอบรมทุกคอร์ส
                </button>
              </>
            )) : (detailTab === "forms" && (
              <>
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
              </>
            ))}
            {!isGmtpTrainingRequestProject(batch.project) && detailTab === "forms" && <>
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
            </>}
          </div>
        )}
      </div>

        <div role="tablist" aria-label="ข้อมูลรอบอบรม" className="flex gap-2 border-b border-gray-200 shrink-0">
          <button id="training-roster-tab" role="tab" aria-selected={detailTab === "roster"} aria-controls="training-roster-panel" onClick={() => setDetailTab("roster")} className={`px-4 py-3 text-sm font-semibold border-b-2 ${detailTab === "roster" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500"}`}>รายชื่อผู้เข้าอบรม ({enrollments.length} คน)</button>
          <button id="training-forms-tab" role="tab" aria-selected={detailTab === "forms"} aria-controls="training-forms-panel" onClick={() => setDetailTab("forms")} className={`px-4 py-3 text-sm font-semibold border-b-2 ${detailTab === "forms" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}>ใบปะหน้า / ชุดส่งอบรม {isGmtpTrainingRequestProject(batch.project) ? `(${gmtpCourseGroups.length} คอร์ส)` : ""}</button>
        </div>

      {canManage && detailTab === "roster" && (
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

      {detailTab === "roster" && <div id="training-roster-panel" role="tabpanel" aria-labelledby="training-roster-tab" className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 shrink-0">
        <Users size={16} />
        รายชื่อในรอบนี้: {enrollments.length}
        คน
        <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / ตำแหน่ง..."
            className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex-1 min-h-[240px] overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        {enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">ยังไม่มีรายชื่อในรอบนี้</p>
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">ไม่พบรายชื่อที่ตรงกับคำค้นหา</p>
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
                {!issuesOwnAccessBadge && (
                  <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">บัตรพนักงาน</th>
                )}
                <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">รายละเอียด</th>
                {canManage && <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEnrollments.map((en) => (
                <EnrollmentRow
                  key={en.id}
                  enrollment={en}
                  employee={employeeById.get(en.employeeId)}
                  documentRequirements={isGmtpTrainingRequestProject(batch.project) ? gmtpRoundDocumentRequirements(documentRequirements, resolveGmtpMatrixRole(en.position, en.matrixRole)) : documentRequirements}
                  matrixCourseName={isGmtpTrainingRequestProject(batch.project) ? batch.courseName : undefined}
                  issuesOwnAccessBadge={issuesOwnAccessBadge}
                  canManage={canManage}
                  latestHealthRecord={recordByEmployee.get(en.employeeId)}
                  onOpenDetails={() => setDetailsEnrollmentId(en.id)}
                  onRemove={() => handleRemove(en)}
                  onUpdate={(patch) => handleUpdateEnrollment(en, patch)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      </div>}

      {isGmtpTrainingRequestProject(batch.project) && detailTab === "forms" && (
        <section id="training-forms-panel" role="tabpanel" aria-labelledby="training-forms-tab" className="flex-1 min-h-0 overflow-auto border rounded-xl bg-white p-4">
          <h3 className="font-bold text-gray-800">ใบปะหน้าแยกตามคอร์สใน Training Matrix 74</h3>
          {canManage && <button type="button" onClick={handleDownloadCardReceipt} disabled={!enrollments.length || generatingCardReceipt} className="my-3 flex items-center gap-2 px-4 py-2 border border-indigo-300 rounded-lg text-indigo-700 text-sm font-semibold disabled:opacity-50">
            {generatingCardReceipt ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {generatingCardReceipt ? "กำลังสร้างใบลงชื่อรับบัตร..." : `ดาวน์โหลดใบลงชื่อรับบัตร (${enrollments.length} คน)`}
          </button>}
          {canManage && <DrugTestReportPanel project={batch.project} enrollments={enrollments} employees={employees} />}
          <p className="text-sm text-gray-500 my-2">รายชื่อคนเดิมอยู่ได้หลายคอร์สตามตำแหน่ง กำหนดการส่วนหัวใช้ร่วมกันทั้งรอบ</p>
          {gmtpCourseGroups.length === 0 && <p className="text-sm text-gray-500">เพิ่มรายชื่อและจับคู่ตำแหน่งเพื่อจัดคอร์ส</p>}
          <div className="divide-y">
            {gmtpCourseGroups.map((course) => (
              <div key={course.id} className="py-3">
                <p className="font-semibold text-sm">{course.name} <span className="font-normal text-gray-500">({course.duration})</span></p>
                <p className="text-xs text-gray-600 my-1">{course.people.map((en) => en.employeeName).join(", ")}</p>
                {course.note && <p className="text-xs text-amber-700 mb-2">{course.note}</p>}
                {canManage && <div className="flex gap-2">
                  {(["th", "mm"] as const).map((lang) => <button key={lang} disabled={generatingGmtpXlsx || course.counts[lang] === 0} onClick={() => handleDownloadGmtpXlsx(course.name, lang)} className="text-xs border rounded px-3 py-2 text-indigo-700 disabled:opacity-40">ชุดส่งอบรม {lang === "th" ? "ไทย" : "พม่า"} ({course.counts[lang]} คน)</button>)}
                </div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!isGmtpTrainingRequestProject(batch.project) && detailTab === "forms" && (
        <section id="training-forms-panel" role="tabpanel" aria-labelledby="training-forms-tab" className="flex-1 min-h-0 overflow-auto border rounded-xl bg-white p-4">
          <h3 className="font-bold text-gray-800">ชุดส่งอบรม {batch.project}</h3>
          <p className="text-sm text-gray-600 my-3">รวมใบปะหน้า {isHuashiTrainingRequestProject(batch.project) ? "HUASHI " : ""}ใบรายคน และเอกสารแนบของผู้เข้าอบรม {enrollments.length} คน แยกโฟลเดอร์รายคน เรียงเอกสารตามข้อกำหนดของโครงการ</p>
          {canManage && <button onClick={handleDownloadSubmission} disabled={!enrollments.length || generatingSubmission} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
            {generatingSubmission ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {generatingSubmission ? "กำลังรวมเอกสาร..." : "ดาวน์โหลดชุดส่งอบรมทั้งหมด (ZIP)"}
          </button>}
          <p className="text-xs text-gray-500 mt-3">ดาวน์โหลดได้แม้เอกสารยังไม่ครบ ระบบจะแจ้งรายการที่ขาดและแนบรายการติดตามไว้ใน ZIP</p>
        </section>
      )}

      {detailsEnrollmentId && (() => {
        const detailEnrollment = enrollments.find((e) => e.id === detailsEnrollmentId);
        if (!detailEnrollment) return null;
        return (
          <EnrollmentDetailModal
            enrollment={detailEnrollment}
            employee={employeeById.get(detailEnrollment.employeeId)}
            documentRequirements={isGmtpTrainingRequestProject(batch.project) ? gmtpRoundDocumentRequirements(documentRequirements, resolveGmtpMatrixRole(detailEnrollment.position, detailEnrollment.matrixRole)) : documentRequirements}
            issuesOwnAccessBadge={issuesOwnAccessBadge}
            latestHealthRecord={recordByEmployee.get(detailEnrollment.employeeId)}
            canManage={canManage}
            onClose={() => setDetailsEnrollmentId(null)}
            onUpdate={(patch) => handleUpdateEnrollment(detailEnrollment, patch)}
          />
        );
      })()}

      {canManage && detailTab === "roster" && enrollments.length > 0 && (
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

      {editingGmtpHeader && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={saveGmtpHeader} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5">
            <h3 className="font-bold text-lg mb-2">ข้อมูลผู้ขอและส่วนหัวใบปะหน้า J74</h3>
            <p className="text-sm text-gray-500 mb-4">ข้อมูลส่วนหัวและกำหนดการนี้ใช้ร่วมกันทุกคอร์สในรอบ ชื่อคอร์สในแต่ละใบมาจาก Training Matrix 74 วันที่ยืนยันให้กรอกเมื่อได้รับการยืนยันแล้ว</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ["date", "วันที่ของรอบ (ไม่ใส่ในใบปะหน้า J74)", "date"],
                ["requestorName", "ผู้ขออบรม (Requestor)", "text"],
                ["requestorPosition", "ตำแหน่งผู้ขออบรม", "text"],
                ["requestorMobile", "เบอร์โทรศัพท์", "tel"],
                ["requestorEmail", "อีเมล", "email"],
                ["trainer", "วิทยากร", "text"],
                ["location", "ห้อง / สถานที่อบรม", "text"],
                ["timeSlot", "เวลาอบรม เช่น 08:00-11:00", "text"],
                ["gmtpConfirmedBy", "ผู้ยืนยัน (Confirmed by)", "text"],
                ["gmtpConfirmedDate", "วันที่ยืนยัน (Date confirmed)", "date"],
              ] as const).map(([field, label, type]) => (
                <label key={field} className="text-sm text-gray-700">
                  {label}
                  <input type={type} value={gmtpHeader[field]} required={field === "date"}
                    disabled={savingGmtpHeader}
                    onChange={(e) => setGmtpHeader((current) => ({ ...current, [field]: e.target.value }))}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" disabled={savingGmtpHeader} onClick={() => setEditingGmtpHeader(false)} className="px-4 py-2 rounded-lg border">ยกเลิก</button>
              <button type="submit" disabled={savingGmtpHeader} className="px-4 py-2 rounded-lg bg-indigo-700 text-white disabled:opacity-50">{savingGmtpHeader ? "กำลังบันทึก..." : "บันทึกข้อมูลใบปะหน้า"}</button>
            </div>
          </form>
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

const GmtpMatrixRoleField = ({ courseName, value, onChange }: {
  courseName: string; value: string; onChange?: (value: string) => void;
}) => (
  <div className="mt-1 max-w-[280px] whitespace-normal">
    <label className="text-xs text-gray-500">ตำแหน่งตาม Training Matrix 74</label>
    <select value={value} disabled={!onChange} onChange={(e) => onChange?.(e.target.value)} className="w-full border rounded px-2 py-1 text-xs">
      <option value="">เลือกกลุ่มตำแหน่ง</option>
      {GMTP_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
    </select>
    <p className="text-xs text-gray-600 mt-1">{value ? `ต้องอบรม ${getGmtpRoleCourses(value).length} คอร์สตาม Matrix` : "กรุณาจับคู่ตำแหน่ง"}</p>
  </div>
);

const EnrollmentRow = ({
  enrollment,
  matrixCourseName,
  employee,
  documentRequirements,
  issuesOwnAccessBadge,
  canManage,
  latestHealthRecord,
  onOpenDetails,
  onRemove,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  matrixCourseName?: string;
  employee?: EmployeeRow;
  documentRequirements: ProjectDocumentRequirement[];
  issuesOwnAccessBadge: boolean;
  canManage: boolean;
  latestHealthRecord?: HealthCheckRecord;
  onOpenDetails: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const statusMeta = TRAINING_ENROLLMENT_STATUS_META[enrollment.status] || TRAINING_ENROLLMENT_STATUS_META.registered;

  // ตรวจเอกสารแบบสด ๆ จากข้อมูลพนักงานล่าสุด (employee_data) แทนการพึ่ง documentSnapshot
  // ที่ freeze ไว้ตั้งแต่ตอนเพิ่มเข้ารอบ — กันปัญหา "เอกสารที่อยู่ในระบบแล้วไม่ตามมาด้วย"
  // เมื่ออัปโหลดเอกสารเพิ่มทีหลัง (ไม่ว่าจะอัปจากหน้านี้หรือหน้าเอกสารพนักงานก็ตาม)
  const isMigrant = employee ? isMigrantNationality(employee.สัญชาติ) : !!enrollment.documentSnapshot?.isMigrant;
  const liveDocCheck = employee
    ? checkProjectDocumentCompleteness(employee.attachments, documentRequirements, isMigrant)
    : null;
  const hasRequirements = documentRequirements.length > 0;

  const docBadge = !employee
    ? { label: "ไม่พบข้อมูลพนักงาน", cls: "bg-gray-100 text-gray-500 border border-gray-200", title: undefined as string | undefined }
    : !hasRequirements
      ? (employee.attachments || []).length > 0
        ? { label: "มีเอกสารแนบแล้ว", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", title: undefined as string | undefined }
        : { label: "ยังไม่มีเอกสารแนบ", cls: "bg-amber-50 text-amber-700 border border-amber-200", title: undefined as string | undefined }
      : liveDocCheck!.complete
        ? { label: "ครบ", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", title: undefined as string | undefined }
        : {
            label: `ขาด ${liveDocCheck!.missing.length} รายการ`,
            cls: "bg-amber-50 text-amber-700 border border-amber-200",
            title: `ยังขาด: ${liveDocCheck!.missing.map((m) => m.label).join(", ")}`,
          };

  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{enrollment.employeeName}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{enrollment.employeeCode || "-"}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">
        {enrollment.position || "-"}
        {matrixCourseName && <GmtpMatrixRoleField courseName={matrixCourseName} value={resolveGmtpMatrixRole(enrollment.position, enrollment.matrixRole)} onChange={canManage ? (matrixRole) => onUpdate({ matrixRole }) : undefined} />}
      </td>
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
      <td className="p-3 whitespace-nowrap">
        <HealthCheckBadge latest={latestHealthRecord} />
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
      {!issuesOwnAccessBadge && (
        <td className="p-3 whitespace-nowrap">
          {enrollment.accessBadgeReceived?.cardNumber || enrollment.accessBadgeReceived?.cardImageUrl ? (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              title={enrollment.accessBadgeReceived?.cardNumber ? `เลขบัตร: ${enrollment.accessBadgeReceived.cardNumber}` : undefined}
            >
              ได้รับบัตรแล้ว
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              รอรับบัตร
            </span>
          )}
        </td>
      )}
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={onOpenDetails}
          className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50"
          title="ดูรายละเอียด / เพิ่มเอกสาร / กรอกผลตรวจสุขภาพ"
        >
          <Eye size={16} />
        </button>
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

/**
 * ป็อบอัพรายละเอียดรายคน — รวมสถานะเอกสาร (+ ปุ่มเพิ่มเอกสารที่ขาด), ผลตรวจสุขภาพ, และโรคประจำตัว
 * ไว้ที่เดียว แทนการขยายแถวในตาราง (พื้นที่ไม่พอสำหรับฟอร์มอัปโหลด)
 */
const EnrollmentDetailModal = ({
  enrollment,
  employee,
  documentRequirements,
  issuesOwnAccessBadge,
  latestHealthRecord,
  canManage,
  onClose,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  employee?: EmployeeRow;
  documentRequirements: ProjectDocumentRequirement[];
  issuesOwnAccessBadge: boolean;
  latestHealthRecord?: HealthCheckRecord;
  canManage: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const isMigrant = employee ? isMigrantNationality(employee.สัญชาติ) : !!enrollment.documentSnapshot?.isMigrant;
  const liveDocCheck = employee
    ? checkProjectDocumentCompleteness(employee.attachments, documentRequirements, isMigrant)
    : null;
  const hasRequirements = documentRequirements.length > 0;
  // แสดงเอกสารที่โครงการนี้ "ต้องการทั้งหมด" (ไม่ใช่แค่รายการที่ขาด) เพื่อให้กดดูไฟล์ที่อัปโหลดไว้แล้วได้ว่าถูกต้องมั้ย
  // ถ้าไม่ถูกต้องก็กด "เปลี่ยนไฟล์" อัปโหลดใหม่ทับได้เลยในที่เดียวกัน — รายการที่เป็นกลุ่มทางเลือก (เช่น ประกันสังคม/
  // ประกันอุบัติเหตุ/ประกันกลุ่ม อย่างใดอย่างหนึ่งก็พอ) จะถูกรวมแสดงเป็นหน่วยเดียว ไม่แยกถามทีละข้อ
  const applicableUnits = employee ? groupRequirements(getApplicableRequirements(documentRequirements, isMigrant)) : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-bold text-gray-800">{enrollment.employeeName}</h3>
            <p className="text-xs text-gray-500">{enrollment.employeeCode || "-"} • {enrollment.position || "-"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">เอกสาร</p>
            {!employee ? (
              <p className="text-xs text-gray-400">ไม่พบข้อมูลพนักงานนี้ในระบบ</p>
            ) : (
              <div className="flex flex-col gap-2">
                {hasRequirements && (
                  <span
                    className={`self-start inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      liveDocCheck!.complete
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {liveDocCheck!.complete ? "เอกสารครบตามที่โครงการกำหนด" : `ยังขาด ${liveDocCheck!.missing.length} รายการ`}
                  </span>
                )}
                {applicableUnits.length > 0 ? (
                  <div className="flex flex-col gap-1.5 mt-1">
                    {applicableUnits.map((unit) =>
                      unit.options.length > 1 ? (
                        <RequirementGroupRow key={unit.key} employee={employee} unit={unit} canManage={canManage} />
                      ) : (
                        <RequirementDocumentRow
                          key={unit.key}
                          employee={employee}
                          requirement={unit.options[0]}
                          attachment={(employee.attachments || []).find((a) => a.docType === unit.options[0].docType)}
                          canManage={canManage}
                        />
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    โครงการนี้ยังไม่ได้ตั้งค่ารายการเอกสารที่ต้องใช้ (ตั้งค่าได้ที่หน้า "โครงการ")
                  </p>
                )}
                {canManage && (
                  <OtherDocumentUploader employee={employee} />
                )}
              </div>
            )}
          </div>

          {!issuesOwnAccessBadge && employee && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">บัตรผ่านเข้าโครงการ</p>
              <p className="text-[11px] text-gray-400 mb-2">
                โครงการนี้ผู้ว่าจ้าง/โครงการทำบัตรให้เอง — หลังได้รับบัตรจริงแล้ว แนบรูปบัตรหรือกรอกเลขบัตร
                อย่างใดอย่างหนึ่งก็ได้ เพื่อปิดรอบอบรมของคนนี้
              </p>
              <AccessBadgeReceivedEditor enrollment={enrollment} canManage={canManage} onUpdate={onUpdate} />
            </div>
          )}

          {canManage && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">ผลตรวจสุขภาพ</p>
              <div className="flex flex-col gap-3">
                <HealthCheckRowEditor
                  enrollment={enrollment}
                  latestRecord={latestHealthRecord}
                  source="hr_manual"
                  actorName={`${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim()}
                  actorUid={firebaseUser?.uid}
                />
                <CongenitalDiseaseEditor enrollment={enrollment} onUpdate={onUpdate} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * แกนกลางอัปโหลด 1 ไฟล์ ให้ docType ที่กำหนด — ใช้ร่วมกันทั้ง RequirementDocumentRow (รายการที่โครงการกำหนด)
 * และ OtherDocumentUploader (เพิ่มเอกสารประเภทอื่น) บันทึกกลับไปที่ employee_data/{employeeId}.attachments
 * จุดเดียวกับหน้า "เอกสารพนักงาน" (แยกเก็บรายคนตามเดิม ไม่สร้างที่เก็บใหม่)
 *
 * replaceExisting = true: ใช้ตอน "เปลี่ยนไฟล์" ของรายการที่มีไฟล์เดิมอยู่แล้ว — ลบของเดิมประเภทเดียวกันออกก่อน
 * แล้วค่อยใส่ไฟล์ใหม่เข้าไป (เขียนทับทั้ง array) กันไม่ให้มีไฟล์ประเภทเดียวกันซ้ำซ้อนเรื่อยๆ
 */
const useDocumentUpload = (employee: EmployeeRow) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const employeeCode = employee.รหัสพนักงาน || employee.id;
  const employeeName = buildEmployeeFullName(employee);

  const upload = async (file: File, docType: string, replaceExisting = false): Promise<boolean> => {
    setUploading(true);
    setError(null);
    try {
      const uploadResult = await uploadHiringDocumentFile(file, {
        candidateName: employeeName,
        position: employee.ตำแหน่ง || "",
        // ใช้ hiringPacketId เดิม (ถ้ามี) ให้ไฟล์ไปลงโฟลเดอร์เดียวกับที่สร้างไว้ตอน Recruitment
        candidateKey: resolveEmployeeDocumentCandidateKey(employee),
        docType: docType || "other",
      });
      const attachment: HiringAttachment = {
        docType: docType || "other",
        name: uploadResult.fileName || file.name,
        url: uploadResult.url,
        uploadedAt: new Date().toISOString(),
      };
      if (replaceExisting) {
        const nextAttachments = [...(employee.attachments || []).filter((a) => a.docType !== docType), attachment];
        await updateDoc(doc(getFirestore(), "CMG-HR-Database", "root", "employee_data", employeeCode), {
          attachments: nextAttachments,
        });
      } else {
        await appendAttachmentToEmployee(employeeCode, attachment);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด");
      return false;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error };
};

/**
 * แถวเอกสาร 1 รายการตามที่โครงการกำหนด — แสดงทั้งรายการที่มีไฟล์แล้ว (กดดูไฟล์ได้ + เปลี่ยนไฟล์ได้ถ้าไม่ถูกต้อง)
 * และรายการที่ยังไม่มีไฟล์ (อัปโหลดได้เลย ประเภทเอกสารคงที่ตามรายการนั้น ไม่ต้องเลือกเอง)
 * ยกเว้นรายการแบบ "generated_by_system" (เช่น แบบฟอร์มที่ระบบ/HR สร้างให้ตอนจบ) ไม่ต้องให้อัปโหลด
 */
const RequirementDocumentRow = ({
  employee,
  requirement,
  attachment,
  canManage,
}: {
  employee: EmployeeRow;
  requirement: ProjectDocumentRequirement;
  attachment?: { docType?: string; name?: string; url?: string };
  canManage: boolean;
}) => {
  const { upload, uploading, error } = useDocumentUpload(employee);
  const [file, setFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  if (requirement.fulfillmentType === "generated_by_system") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 bg-sky-50/60 border border-sky-200 rounded-lg px-2.5 py-1.5">
        <span className="text-xs font-medium text-sky-800 flex-1 min-w-[140px]">{requirement.label}</span>
        <span className="text-[11px] text-sky-600 whitespace-nowrap">ระบบ/HR สร้างให้ตอนจบ — ไม่ต้องอัปโหลด</span>
      </div>
    );
  }

  const handleUpload = async () => {
    if (!file) return;
    const ok = await upload(file, requirement.docType, !!attachment);
    if (ok) {
      setFile(null);
      setReplacing(false);
    }
  };

  const showUploadControls = canManage && (!attachment || replacing);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 border ${
          attachment ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50/60 border-amber-200"
        }`}
      >
        <span className={`text-xs font-medium flex-1 min-w-[140px] ${attachment ? "text-emerald-800" : "text-amber-800"}`}>
          {requirement.label}
        </span>
        {attachment && !replacing && (
          <>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
              title={attachment.name}
            >
              <Eye size={12} /> ดูไฟล์
            </a>
            {canManage && (
              <button
                type="button"
                onClick={() => setReplacing(true)}
                className="text-xs text-gray-500 hover:text-blue-600 hover:underline whitespace-nowrap"
              >
                เปลี่ยนไฟล์
              </button>
            )}
          </>
        )}
        {showUploadControls && (
          <>
            <label className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-50 max-w-[150px]">
              <span className="truncate">{file ? file.name : "เลือกไฟล์"}</span>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? <Loader2 className="animate-spin" size={12} /> : <UploadIcon size={12} />}
              อัปโหลด
            </button>
            {attachment && replacing && (
              <button
                type="button"
                onClick={() => {
                  setReplacing(false);
                  setFile(null);
                }}
                className="text-[11px] text-gray-400 hover:text-gray-600 whitespace-nowrap"
              >
                ยกเลิก
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};

/**
 * แถวเอกสาร "กลุ่มทางเลือก" — มีไฟล์ของข้อใดข้อหนึ่งในกลุ่มก็ถือว่าครบ ไม่ต้องมีครบทุกข้อ
 * เช่น "ประกันสังคม ม.33/ม.40" หรือ "ประกันอุบัติเหตุ" หรือ "ประกันกลุ่ม" อย่างใดอย่างหนึ่งก็พอ
 * ถ้ายังไม่มีไฟล์ของข้อไหนเลย ให้เลือกว่าจะอัปโหลดแบบไหน แล้วอัปโหลดได้เลย
 */
const RequirementGroupRow = ({
  employee,
  unit,
  canManage,
}: {
  employee: EmployeeRow;
  unit: RequirementUnit;
  canManage: boolean;
}) => {
  const { upload, uploading, error } = useDocumentUpload(employee);
  const attachments = (employee.attachments || []) as Array<{ docType?: string; url?: string; name?: string }>;
  const satisfiedOption = unit.options.find((opt) => attachments.some((a) => a.docType === opt.docType));
  const satisfiedAttachment = satisfiedOption
    ? attachments.find((a) => a.docType === satisfiedOption.docType)
    : undefined;

  const [selectedDocType, setSelectedDocType] = useState<string>(unit.options[0]?.docType || "");
  const [file, setFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  const handleUpload = async () => {
    if (!file || !selectedDocType) return;
    const ok = await upload(file, selectedDocType, true);
    if (ok) {
      setFile(null);
      setReplacing(false);
    }
  };

  const showUploadControls = canManage && (!satisfiedOption || replacing);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 border ${
          satisfiedOption ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50/60 border-amber-200"
        }`}
      >
        <span className={`text-xs font-medium flex-1 min-w-[180px] ${satisfiedOption ? "text-emerald-800" : "text-amber-800"}`}>
          เลือก 1 ใน: {unit.label}
        </span>
        {satisfiedOption && !replacing && (
          <>
            <a
              href={satisfiedAttachment?.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
              title={`${satisfiedOption.label} — ${satisfiedAttachment?.name || ""}`}
            >
              <Eye size={12} /> ดูไฟล์ ({satisfiedOption.label})
            </a>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDocType(satisfiedOption.docType);
                  setReplacing(true);
                }}
                className="text-xs text-gray-500 hover:text-blue-600 hover:underline whitespace-nowrap"
              >
                เปลี่ยนไฟล์
              </button>
            )}
          </>
        )}
        {showUploadControls && (
          <>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              className="input !py-1 !text-xs !w-auto max-w-[170px]"
            >
              {unit.options.map((opt) => (
                <option key={opt.docType} value={opt.docType}>{opt.label}</option>
              ))}
            </select>
            {isIdCardDocType(selectedDocType) && <IdCardPhotoGuideButton highlight />}
            <label className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-50 max-w-[140px]">
              <span className="truncate">{file ? file.name : "เลือกไฟล์"}</span>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? <Loader2 className="animate-spin" size={12} /> : <UploadIcon size={12} />}
              อัปโหลด
            </button>
            {satisfiedOption && replacing && (
              <button
                type="button"
                onClick={() => {
                  setReplacing(false);
                  setFile(null);
                }}
                className="text-[11px] text-gray-400 hover:text-gray-600 whitespace-nowrap"
              >
                ยกเลิก
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};

/** เผื่อกรณีต้องเพิ่มเอกสารประเภทอื่นนอกเหนือจากรายการที่โครงการกำหนด — พับไว้เป็นค่าเริ่มต้น */
const OtherDocumentUploader = ({ employee }: { employee: EmployeeRow }) => {
  const documentTypeOptions = useDocumentTypeCatalog();
  const { upload, uploading, error } = useDocumentUpload(employee);
  const [expanded, setExpanded] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>(documentTypeOptions[0]?.value || "");
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    const ok = await upload(file, selectedDocType);
    if (ok) setFile(null);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-start flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5"
      >
        + เพิ่มเอกสารประเภทอื่น
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 mt-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={selectedDocType}
          onChange={(e) => setSelectedDocType(e.target.value)}
          className="input !py-1 !text-xs !w-auto max-w-[170px]"
        >
          {documentTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isIdCardDocType(selectedDocType) && <IdCardPhotoGuideButton highlight />}
        <label className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-50 max-w-[140px]">
          <span className="truncate">{file ? file.name : "เลือกไฟล์"}</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
        </label>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? <Loader2 className="animate-spin" size={12} /> : <UploadIcon size={12} />}
          อัปโหลด
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};

/** ติ๊กเลือกโรคประจำตัว (ใช้กับใบรายคน/ใบขอออกบัตร — Access Badge Request) เก็บไว้ที่ enrollment.healthCheck.congenitalDiseases */
/**
 * บันทึกบัตรผ่านเข้าโครงการที่ได้รับจริง (กรณีโครงการไม่ได้ออกบัตรเอง) — แนบรูปบัตรหรือกรอกเลขบัตร
 * อย่างใดอย่างหนึ่งก็พอ เขียนตรงเข้า enrollment doc (training_enrollments/{id}.accessBadgeReceived)
 */
const AccessBadgeReceivedEditor = ({
  enrollment,
  canManage,
  onUpdate,
}: {
  enrollment: TrainingEnrollment;
  canManage: boolean;
  onUpdate: (patch: Partial<TrainingEnrollment>) => void;
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const existing = enrollment.accessBadgeReceived;
  const [editing, setEditing] = useState(!existing);
  const [cardNumber, setCardNumber] = useState(existing?.cardNumber || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedNumber = cardNumber.trim();
    if (!trimmedNumber && !file && !existing?.cardImageUrl) {
      setError("กรอกเลขบัตร หรือแนบรูปบัตรอย่างน้อย 1 อย่าง");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      let cardImageUrl = existing?.cardImageUrl;
      let cardImageName = existing?.cardImageName;
      if (file) {
        const uploadResult = await uploadHiringDocumentFile(file, {
          candidateName: enrollment.employeeName,
          position: enrollment.position || "",
          candidateKey: enrollment.employeeCode || enrollment.employeeId,
          docType: "access_badge_card",
        });
        cardImageUrl = uploadResult.url;
        cardImageName = uploadResult.fileName || file.name;
      }
      onUpdate({
        accessBadgeReceived: {
          ...(trimmedNumber ? { cardNumber: trimmedNumber } : {}),
          ...(cardImageUrl ? { cardImageUrl, cardImageName } : {}),
          receivedAt: existing?.receivedAt || Date.now(),
          recordedByUid: firebaseUser?.uid || "",
          recordedByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        },
      });
      setEditing(false);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  if (!editing && existing) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <span className="text-xs font-medium text-emerald-800">ได้รับบัตรแล้ว</span>
        {existing.cardNumber && <span className="text-xs text-gray-600">เลขบัตร: {existing.cardNumber}</span>}
        {existing.cardImageUrl && (
          <a
            href={existing.cardImageUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Eye size={12} /> ดูรูปบัตร
          </a>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-xs text-gray-500 hover:text-blue-600 hover:underline"
          >
            แก้ไข
          </button>
        )}
      </div>
    );
  }

  if (!canManage) {
    return <p className="text-xs text-gray-400">ยังไม่ได้รับบัตร</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="เลขบัตร (ถ้ามี)"
          className="input !py-1 !text-xs !w-auto max-w-[150px]"
        />
        <label className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-50 max-w-[150px]">
          <span className="truncate">{file ? file.name : existing?.cardImageUrl ? "เปลี่ยนรูปบัตร" : "แนบรูปบัตร"}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={uploading}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? <Loader2 className="animate-spin" size={12} /> : <UploadIcon size={12} />}
          บันทึก
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setFile(null);
              setError(null);
            }}
            className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
          >
            ยกเลิก
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
};

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
  onConfirm: (picked: EmployeeRow[], language: TrainingLanguage, matrixRoles?: Record<string, string>) => void;
}) => {
  const [search, setSearch] = useState("");
  const [onlySameProject, setOnlySameProject] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<TrainingLanguage>("th");
  const [matrixRoles, setMatrixRoles] = useState<Record<string, string>>({});
  const isGmtp = isGmtpTrainingRequestProject(batch.project);
  const selectedEmployees = useMemo(() => employees.filter((employee) => selected.has(employee.id)), [employees, selected]);

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
  const allVisibleSelected = filtered.length > 0 && filtered.every((employee) => selected.has(employee.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      const removeVisible = filtered.length > 0 && filtered.every((employee) => previous.has(employee.id));
      filtered.forEach((employee) => {
        if (removeVisible) next.delete(employee.id);
        else next.add(employee.id);
      });
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = employees.filter((e) => selected.has(e.id));
    if (picked.length === 0) {
      window.alert("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
      return;
    }
    if (isGmtp && picked.some((emp) => !resolveGmtpMatrixRole(emp.ตำแหน่ง, matrixRoles[emp.id]))) {
      window.alert("กรุณาเลือกกลุ่มตำแหน่งตาม Training Matrix 74 ให้ครบสำหรับพนักงานที่เลือก");
      return;
    }
    onConfirm(picked, language, matrixRoles);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <UserPlus className="text-blue-600" size={20} />
              เลือกพนักงานเข้ารอบอบรม
            </h3>
            <p className="text-xs text-gray-500 mt-1">{batch.courseName} • {batch.project} • {batch.date}</p>
            {isGmtp && <p className="text-xs text-indigo-700">ระบบจัดหลายคอร์สตามตำแหน่งใน Training Matrix 74</p>}
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

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 overflow-auto">
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
                    <input type="checkbox" aria-label="เลือกหรือยกเลิกรายชื่อที่แสดงทั้งหมด" checked={allVisibleSelected} onChange={toggleAll} />
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
                  const role = resolveGmtpMatrixRole(e.ตำแหน่ง, matrixRoles[e.id]);
                  const requirements = isGmtp ? gmtpRoundDocumentRequirements(documentRequirements, role) : documentRequirements;
                  const docCheck = checkProjectDocumentCompleteness(
                    e.attachments as Array<{ docType?: string }> | undefined,
                    requirements,
                    isMigrant
                  );
                  const hasAnyRequirement = requirements.length > 0;
                  return (
                    <tr key={e.id} className={`${selected.has(e.id) ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"} cursor-pointer`} onClick={() => toggle(e.id)}>
                      <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                      <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildEmployeeFullName(e)}</td>
                      <td className="p-3 text-gray-600 whitespace-nowrap">{e.รหัสพนักงาน || "-"}</td>
                      <td className="p-3 text-gray-600 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                        {e.ตำแหน่ง || "-"}
                        {isGmtp && <GmtpMatrixRoleField courseName={batch.courseName} value={role} onChange={(value) => setMatrixRoles((current) => ({ ...current, [e.id]: value }))} />}
                      </td>
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

        <aside aria-label="รายชื่อพนักงานที่เลือกแล้ว" className="flex flex-col shrink-0 w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-blue-50/40 max-h-[30vh] lg:max-h-none min-h-0">
          <div className="flex items-center justify-between gap-2 p-3 border-b shrink-0">
            <h4 className="text-sm font-bold text-blue-800" aria-live="polite">เลือกแล้ว {selectedEmployees.length} คน</h4>
            <button type="button" disabled={selected.size === 0} onClick={() => setSelected(new Set())} className="text-xs text-red-600 disabled:opacity-40">ล้างการเลือก</button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {selectedEmployees.length === 0 ? <p className="text-sm text-gray-500 py-3">รายชื่อที่เลือกจะแสดงที่นี่</p> : (
              <ol className="space-y-2">
                {selectedEmployees.map((employee, index) => (
                  <li key={employee.id} className="rounded-lg bg-white border border-blue-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 break-words">{index + 1}. {buildEmployeeFullName(employee)}</p>
                        <p className="text-xs text-gray-500 mt-1">{employee.รหัสพนักงาน || "-"} • {employee.ตำแหน่ง || "-"}</p>
                      </div>
                      <button type="button" aria-label={`เอา ${buildEmployeeFullName(employee)} ออกจากรายการที่เลือก`} onClick={() => toggle(employee.id)} className="text-gray-400 hover:text-red-600 p-1 shrink-0"><X size={16} /></button>
                    </div>
                    {isGmtp && <GmtpMatrixRoleField courseName={batch.courseName} value={resolveGmtpMatrixRole(employee.ตำแหน่ง, matrixRoles[employee.id])} onChange={(value) => setMatrixRoles((current) => ({ ...current, [employee.id]: value }))} />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
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
              เลือกเฉพาะคนที่จะส่งลิงก์นี้ให้ (ตัดคนที่เคยอบรมโครงการนี้แล้วออกให้อัตโนมัติ ถ้ามี) — ผู้รับเหมาจะเห็นเฉพาะชื่อที่เลือกไว้ตรงนี้เท่านั้น
              ถ้ามีคนใหม่ที่ยังไม่มีในระบบ กรุณาเพิ่มชื่อเข้าระบบก่อน แล้วค่อยสร้างลิงก์ใหม่/เลือกเพิ่มทีหลังได้
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
              <p className="text-xs">(ถ้ามีคนใหม่ที่ยังไม่มีในระบบ กรุณาเพิ่มชื่อพนักงานเข้าระบบก่อน แล้วค่อยกลับมาสร้างลิงก์ใหม่)</p>
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
