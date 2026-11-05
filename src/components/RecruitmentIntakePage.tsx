import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, runTransaction, setDoc, updateDoc } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Inbox,
  Loader2,
  Lock,
  Paperclip,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  appendAttachmentToRecruitmentPending,
  removeAttachmentFromRecruitmentPending,
  uploadHiringDocumentFile,
} from "../utils/hiringDocsAttachments";
import { IdCardPhotoGuideButton, isIdCardDocType } from "./IdCardPhotoGuide";
import {
  buildFullName,
  canManageRecruitmentIntake,
  EMPLOYEE_TYPE_OPTIONS,
  getIntakeStatus,
  getSourceGroup,
  HiringAttachment,
  IntakeStatusFilter,
  INTAKE_STATUS_META,
  normalizeDateForInput,
  pickClosestOption,
  RecruitmentPendingEmployee,
  RECRUITMENT_PENDING_EMPLOYEES_COLLECTION,
  RecruitmentSourceGroup,
  SOURCE_GROUP_META,
  toDateSafe,
} from "./recruitmentIntakeConfig";
import { addCustomDocumentType, useDocumentTypeCatalog } from "./documentTypeCatalog";

// path ที่หน้านี้อ่านแบบ realtime เสมอ: CMG-HR-Database/root/recruitment_pending_employees
const FIRESTORE_PATH = "CMG-HR-Database/root/recruitment_pending_employees";

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const d = toDateSafe(value as RecruitmentPendingEmployee["createdAt"]);
  return d ? d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "-";
};

const formatBenefits = (benefits: RecruitmentPendingEmployee["benefits"]): string => {
  if (!benefits || benefits.length === 0) return "-";
  return benefits
    .map((b) => `${b.label || "-"} ${b.amount ?? ""}${b.period ? `/${b.period}` : ""}`.trim())
    .join(", ");
};

// เรื่องเงิน (payType / salaryAmount / benefits) ให้เห็นได้เฉพาะ HRM (และ MasterAdmin ซึ่ง bypass
// ทุกหน้าในระบบอยู่แล้ว) role อื่น ๆ ที่เห็นหน้านี้ได้ (เช่น HR) จะเห็นเป็นค่าพรางแทน
const canViewSalaryInfo = (roles: string[] | undefined | null): boolean =>
  !!roles && (roles.includes("HRM") || roles.includes("MasterAdmin"));

const MaskedCell = () => (
  <span className="inline-flex items-center gap-1 text-gray-300" title="ข้อมูลเงินเดือน/ค่าตอบแทน เห็นได้เฉพาะ HRM">
    <Lock size={12} /> ••••••
  </span>
);

// candidateKey ต้องดึงมาจาก record เดิมเท่านั้น (ห้ามสุ่ม/สร้างใหม่) — ใช้ candidateId เป็นหลัก
// เพราะเป็น id ของผู้สมัครที่คงที่ตลอด pipeline, ถ้าไม่มีค่อย fallback เป็น hiringPacketId/doc id
const resolveCandidateKey = (c: RecruitmentPendingEmployee): string =>
  (c.candidateId as string) || c.hiringPacketId || c.recruitmentSourceId || c.id;

interface IntakeFormState {
  รหัสพนักงาน: string;
  คำนำหน้า: string;
  ชื่อตัว: string;
  ชื่อสกุล: string;
  ตำแหน่ง: string;
  แผนก: string;
  โครงการ: string;
  employee_type: string;
  start_date: string;
  เลขบัตรประชาชน: string;
  โทรศัพท์: string;
  เพศ: string;
  สัญชาติ: string;
  วันเกิด: string;
  // ที่อยู่ปัจจุบัน (มาจากแบบฟอร์มเอกสารจ้างงานฝั่ง Recruitment)
  บ้านเลขที่: string;
  หมู่: string;
  แขวงตำบล: string;
  เขตอำเภอ: string;
  จังหวัด: string;
  ไปรษณีย์: string;
  // ผู้ติดต่อฉุกเฉิน
  ผู้ติดต่อฉุกเฉิน_ชื่อ: string;
  ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: string;
  ผู้ติดต่อฉุกเฉิน_โทร: string;
  // การศึกษา
  วุฒิการศึกษา: string;
  สถาบันการศึกษา: string;
  สาขา: string;
}

import { intakeEmployeeType, intakeWorkGroup } from "../utils/recruitmentEmployeeClassification";

export const RecruitmentIntakePage = ({
  projectOptions = [],
  positionOptions = [],
}: {
  projectOptions?: string[];
  positionOptions?: string[];
}) => {
  const { firebaseUser, userProfile } = useAuth();
  const canViewSalary = canViewSalaryInfo(userProfile?.role);
  const canManage = canManageRecruitmentIntake(userProfile?.role);
  const documentTypeOptions = useDocumentTypeCatalog();

  const [items, setItems] = useState<RecruitmentPendingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | RecruitmentSourceGroup>("all");
  // ค่าเริ่มต้นของหน้านี้ต้องเป็น "รอเพิ่มเข้าระบบ" เสมอ เพราะเป็นงานหลักที่ HR ต้องตามทำต่อ
  const [statusFilter, setStatusFilter] = useState<"all" | IntakeStatusFilter>("pending");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // ฟอร์มเพิ่มเข้าระบบ
  const [formTarget, setFormTarget] = useState<RecruitmentPendingEmployee | null>(null);
  const [form, setForm] = useState<IntakeFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  // เตือน HR เมื่อโครงการ/ตำแหน่ง/แผนกจาก Recruitment ไม่ตรงเป๊ะกับตัวเลือกในระบบ (ระบบเลือกใกล้เคียงที่สุดให้แล้ว)
  const [projectMatchNote, setProjectMatchNote] = useState<string | null>(null);
  const [positionMatchNote, setPositionMatchNote] = useState<string | null>(null);
  const [departmentMatchNote, setDepartmentMatchNote] = useState<string | null>(null);
  // เตือนเมื่อแปลงรูปแบบ "วันเกิด"/"วันเริ่มงาน" จาก Recruitment เป็น YYYY-MM-DD (ของ <input type="date">) ไม่ได้
  const [dobWarningNote, setDobWarningNote] = useState<string | null>(null);
  const [startDateWarningNote, setStartDateWarningNote] = useState<string | null>(null);

  // "position_labor" เป็น master list ที่ HR ต้องตั้งค่าเอง มักยังไม่ได้กรอกครบ/ยังว่าง จึงดึง
  // ตำแหน่ง/แผนกที่ "มีอยู่จริง" จากพนักงานใน employee_data มาเสริมด้วย เพื่อให้มีตัวเลือกให้ใช้งานจริง
  // ดึงครั้งเดียวตอนเข้าหน้านี้ (ไม่ realtime เพราะใช้แค่ประกอบตัวเลือก ไม่ต้องอัปเดตวินาทีต่อวินาที)
  const [employeePositionOptions, setEmployeePositionOptions] = useState<string[]>([]);
  const [employeeDepartmentOptions, setEmployeeDepartmentOptions] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const db = getFirestore();
        const snap = await getDocs(collection(db, "CMG-HR-Database", "root", "employee_data"));
        const positions = new Set<string>();
        const departments = new Set<string>();
        snap.docs.forEach((d) => {
          const data = d.data() as { ตำแหน่ง?: string; แผนก?: string };
          const pos = (data.ตำแหน่ง || "").toString().trim();
          const dep = (data.แผนก || "").toString().trim();
          if (pos) positions.add(pos);
          if (dep) departments.add(dep);
        });
        setEmployeePositionOptions(Array.from(positions).sort((a, b) => a.localeCompare(b, "th")));
        setEmployeeDepartmentOptions(Array.from(departments).sort((a, b) => a.localeCompare(b, "th")));
      } catch (err) {
        console.error("[RecruitmentIntakePage] โหลดตัวเลือกตำแหน่ง/แผนกจาก employee_data ไม่สำเร็จ:", err);
      }
    })();
  }, []);
  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);
  const [deletingAttachmentKey, setDeletingAttachmentKey] = useState<string | null>(null);

  // แผงดูรายละเอียด (ข้อมูลที่ไม่ได้โชว์ในตารางแล้ว เช่น ที่อยู่ ผู้ติดต่อฉุกเฉิน การศึกษา ประสบการณ์ ฯลฯ)
  const [viewTarget, setViewTarget] = useState<RecruitmentPendingEmployee | null>(null);

  // แผงเอกสารแนบ
  const [docsTarget, setDocsTarget] = useState<RecruitmentPendingEmployee | null>(null);
  const [docType, setDocType] = useState<string>(documentTypeOptions[0]?.value || "");
  // ค่าที่พิมพ์เองตอนเลือก "อื่น ๆ (พิมพ์เอง)" — เก็บแยกจาก docType (ดูเหตุผลใน EmployeeDocumentsPage.tsx)
  const [customDocTypeLabel, setCustomDocTypeLabel] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const db = getFirestore();
    const colRef = collection(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION);

    // ไม่ filter ด้วย intakeStatus เพราะต้นทาง (ระบบ Recruitment) ยังไม่มี field นี้
    // แสดงเอกสารทั้งหมดใน collection ตามที่กำหนด
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as RecruitmentPendingEmployee));
        setItems(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Log ให้เห็นชัดเจนทั้ง error และ path ที่กำลังอ่าน เพื่อวิเคราะห์ต่อ
        console.error(`[RecruitmentIntakePage] Firestore read failed at path "${FIRESTORE_PATH}":`, err);
        setError(`อ่านข้อมูลจาก ${FIRESTORE_PATH} ไม่สำเร็จ: ${err.message}`);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // sync docsTarget กับ items ล่าสุด (เพื่อให้เห็น attachments ใหม่ทันทีหลังอัปโหลดสำเร็จ แบบ realtime)
  useEffect(() => {
    if (!docsTarget) return;
    const fresh = items.find((i) => i.id === docsTarget.id);
    if (fresh && fresh !== docsTarget) setDocsTarget(fresh);
  }, [items, docsTarget]);

  // sync viewTarget กับ items ล่าสุดเช่นกัน
  useEffect(() => {
    if (!viewTarget) return;
    const fresh = items.find((i) => i.id === viewTarget.id);
    if (fresh && fresh !== viewTarget) setViewTarget(fresh);
  }, [items, viewTarget]);

  const projectOptionsInData = useMemo(
    () => Array.from(new Set(items.map((c) => (c.โครงการ || "").trim()).filter(Boolean))).sort(),
    [items]
  );
  const departmentOptionsInData = useMemo(
    () => Array.from(new Set(items.map((c) => (c.แผนก || "").trim()).filter(Boolean))).sort(),
    [items]
  );
  const employeeTypeOptionsInData = useMemo(() => {
    const types = new Set(items.map(intakeEmployeeType));
    return EMPLOYEE_TYPE_OPTIONS.filter((option) => types.has(option.value));
  }, [items]);

  // ตัวเลือก "ตำแหน่ง" ที่ใช้ในฟอร์มเพิ่มเข้าระบบ: รวม master list จาก position_labor (ถ้า HR ตั้งค่าไว้)
  // + ตำแหน่งที่มีอยู่จริงในพนักงาน (employee_data) + ตำแหน่งที่เคยเห็นในคิวรอเพิ่มนี้เอง กันตกหล่น
  const positionOptionsForForm = useMemo(() => {
    const fromPending = items.map((c) => (c.ตำแหน่ง || "").trim()).filter(Boolean);
    const merged = new Set<string>([...positionOptions, ...employeePositionOptions, ...fromPending]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "th"));
  }, [positionOptions, employeePositionOptions, items]);

  // ตัวเลือก "แผนก" ที่ใช้ในฟอร์มเพิ่มเข้าระบบ: ยังไม่มี master list แยกในระบบ จึงรวมจากแผนกที่มีอยู่จริง
  // ในพนักงาน (employee_data) + แผนกที่เคยเห็นในคิวรอเพิ่มนี้เอง
  const departmentOptionsForForm = useMemo(() => {
    const merged = new Set<string>([...employeeDepartmentOptions, ...departmentOptionsInData]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "th"));
  }, [employeeDepartmentOptions, departmentOptionsInData]);
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((c) => (groupFilter === "all" ? true : getSourceGroup(c.source) === groupFilter))
      .filter((c) => (statusFilter === "all" ? true : getIntakeStatus(c) === statusFilter))
      .filter((c) => (employeeTypeFilter === "all" ? true : intakeEmployeeType(c) === employeeTypeFilter))
      .filter((c) => (projectFilter === "all" ? true : (c.โครงการ || "").trim() === projectFilter))
      .filter((c) => (departmentFilter === "all" ? true : (c.แผนก || "").trim() === departmentFilter))
      .filter((c) => {
        if (!kw) return true;
        const name = buildFullName(c).toLowerCase();
        return (
          name.includes(kw) ||
          (c.ตำแหน่ง || "").toLowerCase().includes(kw) ||
          (c.แผนก || "").toLowerCase().includes(kw) ||
          (c.โครงการ || "").toLowerCase().includes(kw)
        );
      });
  }, [items, groupFilter, statusFilter, employeeTypeFilter, projectFilter, departmentFilter, search]);

  const counts = useMemo(() => {
    const result: Record<"all" | RecruitmentSourceGroup, number> = {
      all: items.length,
      external: 0,
      internal_transfer: 0,
      contractor: 0,
      other: 0,
    };
    items.forEach((c) => {
      const g = getSourceGroup(c.source);
      result[g] += 1;
    });
    return result;
  }, [items]);

  const statusCounts = useMemo(() => {
    const result: Record<"all" | IntakeStatusFilter, number> = { all: items.length, pending: 0, imported: 0, no_show: 0 };
    items.forEach((c) => {
      result[getIntakeStatus(c)] += 1;
    });
    return result;
  }, [items]);

  // ------------------------------------------------------------------------
  // ส่วนที่ 1: เพิ่มเข้าระบบพนักงาน
  // ------------------------------------------------------------------------

  const markNoShow = async (candidate: RecruitmentPendingEmployee) => {
    if (!canManage || statusSaving || !candidate.importedEmployeeId || candidate.source === "internal_transfer") return;
    const reason = window.prompt(`ระบุเหตุผลที่ ${buildFullName(candidate)} ไม่มาเริ่มงาน\nระบบจะเปลี่ยนสถานะใน Data เป็น “ไม่มาเริ่มงาน” และเก็บประวัติเดิมไว้`);
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("กรุณาระบุเหตุผลก่อนบันทึก");
      return;
    }
    setStatusSaving(candidate.id);
    try {
      const db = getFirestore();
      const pendingRef = doc(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION, candidate.id);
      await runTransaction(db, async (transaction) => {
        const pending = await transaction.get(pendingRef);
        const data = pending.data();
        if (!data?.importedEmployeeId || data.source === "internal_transfer") throw new Error("รายการนี้ไม่สามารถเปลี่ยนสถานะได้");
        if (data.intakeStatus === "no_show") throw new Error("รายการนี้บันทึกไม่มาเริ่มงานแล้ว");
        const employeeRef = doc(db, "CMG-HR-Database", "root", "employee_data", String(data.importedEmployeeId));
        const employee = await transaction.get(employeeRef);
        if (!employee.exists()) throw new Error("ไม่พบพนักงานที่เชื่อมกันใน Data");
        if (employee.data()?.recruitmentSourceId !== candidate.id) throw new Error("ข้อมูลใน Data เชื่อมกับรายการ Recruit อื่นแล้ว กรุณาตรวจสอบก่อนดำเนินการ");
        if (employee.data()?.สถานะพนักงาน !== "ทำงาน") throw new Error("สถานะใน Data เปลี่ยนไปแล้ว กรุณาตรวจสอบก่อนดำเนินการ");
        const audit = {
          noShowReason: reason.trim(),
          noShowAt: Date.now(),
          noShowByUid: firebaseUser?.uid || "",
          noShowByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
        };
        transaction.update(employeeRef, { สถานะพนักงาน: "ไม่มาเริ่มงาน", employment_status_reason: reason.trim(), ...audit });
        transaction.update(pendingRef, { intakeStatus: "no_show", ...audit });
      });
    } catch (err) {
      window.alert(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาด"}`);
    } finally {
      setStatusSaving(null);
    }
  };

  // ลบรายการออกจาก "รอเพิ่มเข้าระบบ" (ลบ document ใน recruitment_pending_employees)
  // ไม่แตะ employee_data เลย — ถ้ารายการนี้นำเข้าเป็นพนักงานไปแล้ว ต้องเตือนให้ชัดว่าการลบนี้
  // ไม่ลบพนักงานออกจากระบบ (แค่ตัดรายการต้นทางออกจากคิว ป้องกันเข้าใจผิดว่าลบพนักงานด้วย)
  const deleteCandidate = async (candidate: RecruitmentPendingEmployee) => {
    if (!canManage || deletingCandidateId) return;
    const name = buildFullName(candidate);
    const warnImported = candidate.importedEmployeeId
      ? `\n\n⚠️ รายการนี้นำเข้าเป็นพนักงานแล้ว (รหัส: ${candidate.importedEmployeeId}) การลบนี้จะลบแค่รายการในคิว "รอเพิ่มเข้าระบบ" เท่านั้น ไม่ลบพนักงานออกจาก Data`
      : "";
    const confirmed = window.confirm(`ยืนยันลบ "${name}" ออกจากรายชื่อรอเพิ่มจาก Recruitment?${warnImported}`);
    if (!confirmed) return;
    setDeletingCandidateId(candidate.id);
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION, candidate.id));
      if (viewTarget?.id === candidate.id) setViewTarget(null);
      if (docsTarget?.id === candidate.id) closeDocsPanel();
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setDeletingCandidateId(null);
    }
  };

  // ลบเอกสารแนบ 1 รายการ (ตัดลิงก์ออกจาก attachments array — ไม่ลบไฟล์จริงบน Drive)
  const deleteAttachment = async (candidate: RecruitmentPendingEmployee, attachment: HiringAttachment) => {
    if (deletingAttachmentKey) return;
    const confirmed = window.confirm(`ยืนยันลบเอกสาร "${attachment.name}"? (ไม่ลบไฟล์จริงบน Google Drive แค่ตัดออกจากระบบ)`);
    if (!confirmed) return;
    const key = `${candidate.id}:${attachment.url}`;
    setDeletingAttachmentKey(key);
    try {
      await removeAttachmentFromRecruitmentPending(candidate.id, attachment);
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setDeletingAttachmentKey(null);
    }
  };

  const openIntakeForm = (candidate: RecruitmentPendingEmployee) => {
    const empType = intakeEmployeeType(candidate);
    // โครงการ/ตำแหน่ง/แผนกจาก Recruitment เป็นข้อความอิสระ -> จับคู่กับตัวเลือกจริงในระบบ
    // ส่วนใหญ่ควรตรงเป๊ะ ถ้าไม่ตรงให้เลือกตัวใกล้เคียงที่สุดแทน แล้วเตือน HR ให้ตรวจสอบ
    const projectMatch = pickClosestOption(candidate.โครงการ, projectOptions);
    const positionMatch = pickClosestOption(candidate.ตำแหน่ง, positionOptionsForForm);
    const departmentMatch = pickClosestOption(candidate.แผนก, departmentOptionsForForm);
    // "วันเกิด"/"วันเริ่มงาน" จาก Recruitment อาจไม่ใช่รูปแบบ YYYY-MM-DD ที่ <input type="date"> ต้องการ
    // เป๊ะ ๆ (เช่น "15/08/1995" หรือปี พ.ศ.) -> ถ้าไม่แปลง ช่องจะโชว์ว่างเปล่าทั้งที่ Recruitment มีค่าจริง
    const normalizedDob = normalizeDateForInput(candidate.วันเกิด);
    const normalizedStartDate = normalizeDateForInput(candidate.วันเริ่มงาน);
    setFormTarget(candidate);
    setDuplicateWarning(null);
    setDobWarningNote(
      candidate.วันเกิด && !normalizedDob
        ? `⚠️ วันเกิดจาก Recruitment คือ "${candidate.วันเกิด}" แต่ระบบแปลงรูปแบบวันที่ไม่ได้ กรุณากรอกวันเกิดเอง`
        : null
    );
    setStartDateWarningNote(
      candidate.วันเริ่มงาน && !normalizedStartDate
        ? `⚠️ วันเริ่มงานจาก Recruitment คือ "${candidate.วันเริ่มงาน}" แต่ระบบแปลงรูปแบบวันที่ไม่ได้ กรุณากรอกเอง`
        : null
    );
    setProjectMatchNote(
      candidate.โครงการ && !projectMatch.exact && projectMatch.value
        ? `⚠️ โครงการจาก Recruitment คือ "${candidate.โครงการ}" — ระบบเลือกใกล้เคียงที่สุดให้ว่า "${projectMatch.value}" กรุณาตรวจสอบก่อนบันทึก`
        : null
    );
    setPositionMatchNote(
      candidate.ตำแหน่ง && !positionMatch.exact && positionMatch.value
        ? `⚠️ ตำแหน่งจาก Recruitment คือ "${candidate.ตำแหน่ง}" — ระบบเลือกใกล้เคียงที่สุดให้ว่า "${positionMatch.value}" กรุณาตรวจสอบก่อนบันทึก`
        : null
    );
    setDepartmentMatchNote(
      candidate.แผนก && !departmentMatch.exact && departmentMatch.value
        ? `⚠️ แผนกจาก Recruitment คือ "${candidate.แผนก}" — ระบบเลือกใกล้เคียงที่สุดให้ว่า "${departmentMatch.value}" กรุณาตรวจสอบก่อนบันทึก`
        : null
    );
    setForm({
      รหัสพนักงาน: (candidate.รหัสพนักงานเดิม as string) || "",
      คำนำหน้า: candidate.ชื่อต้น || "",
      ชื่อตัว: (candidate.ชื่อตัว || "").trim(),
      ชื่อสกุล: candidate.ชื่อสกุล || "",
      ตำแหน่ง: positionMatch.value || candidate.ตำแหน่ง || "",
      แผนก: departmentMatch.value || candidate.แผนก || "",
      โครงการ: projectMatch.value || candidate.โครงการ || "",
      employee_type: empType,
      start_date: normalizedStartDate,
      เลขบัตรประชาชน: candidate.เลขบัตรประชาชน || "",
      โทรศัพท์: candidate.โทรศัพท์ || "",
      เพศ: candidate.เพศ || "",
      สัญชาติ: candidate.สัญชาติ || "",
      วันเกิด: normalizedDob,
      บ้านเลขที่: candidate.บ้านเลขที่ || "",
      หมู่: candidate.หมู่ || "",
      แขวงตำบล: candidate.แขวงตำบล || "",
      เขตอำเภอ: candidate.เขตอำเภอ || "",
      จังหวัด: candidate.จังหวัด || "",
      ไปรษณีย์: candidate.ไปรษณีย์ || "",
      ผู้ติดต่อฉุกเฉิน_ชื่อ: candidate.ผู้ติดต่อฉุกเฉิน_ชื่อ || "",
      ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: candidate.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์ || "",
      ผู้ติดต่อฉุกเฉิน_โทร: candidate.ผู้ติดต่อฉุกเฉิน_โทร || "",
      วุฒิการศึกษา: candidate.วุฒิการศึกษา || "",
      สถาบันการศึกษา: candidate.สถาบันการศึกษา || "",
      สาขา: candidate.สาขา || "",
    });
    if (candidate.รหัสพนักงานเดิม) {
      setDuplicateWarning("ℹ️ มีรหัสพนักงานเดิม (เคยเป็นพนักงานมาก่อน) ระบบ prefill รหัสเดิมไว้ให้แล้ว ตรวจสอบก่อนบันทึก");
    }
  };

  const closeForm = () => {
    setFormTarget(null);
    setForm(null);
    setDuplicateWarning(null);
    setProjectMatchNote(null);
    setPositionMatchNote(null);
    setDepartmentMatchNote(null);
    setDobWarningNote(null);
    setStartDateWarningNote(null);
  };

  const checkDuplicate = async (empCode: string) => {
    if (!empCode.trim()) {
      setDuplicateWarning(null);
      return;
    }
    const db = getFirestore();
    const existing = await getDoc(doc(db, "CMG-HR-Database", "root", "employee_data", empCode.trim()));
    setDuplicateWarning(
      existing.exists()
        ? "⚠️ มีรหัสพนักงานนี้อยู่แล้วในระบบ (อาจเป็นพนักงานเก่าที่กลับเข้ามาใหม่) ตรวจสอบก่อนบันทึกทับ"
        : null
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTarget || !form) return;
    if (!form.รหัสพนักงาน.trim()) {
      window.alert("กรุณากรอกรหัสพนักงาน");
      return;
    }
    if (!form.โครงการ.trim()) {
      window.alert("กรุณาระบุโครงการที่จะเข้าทำงาน");
      return;
    }
    const groupStatus = intakeWorkGroup(form.employee_type, formTarget.สถานะกลุ่มงาน);
    if (!EMPLOYEE_TYPE_OPTIONS.some((option) => option.value === form.employee_type) || !groupStatus) {
      window.alert("กรุณาตรวจสอบประเภทพนักงานและสถานะกลุ่มงาน Staff/Worker จาก Recruitment ให้ครบก่อนนำเข้า");
      return;
    }
    setSaving(true);
    try {
      const db = getFirestore();
      const empCode = form.รหัสพนักงาน.trim();

      const employeeRecord: Record<string, unknown> = {
        id: empCode,
        รหัสพนักงาน: empCode,
        ชื่อตัว: form.ชื่อตัว.trim(),
        ชื่อสกุล: form.ชื่อสกุล.trim(),
        ตำแหน่ง: form.ตำแหน่ง.trim(),
        แผนก: form.แผนก.trim(),
        โครงการ: form.โครงการ.trim(),
        สถานะโครงการ: form.โครงการ.trim() ? [form.โครงการ.trim()] : [],
        employee_type: form.employee_type,
        สถานะกลุ่มงาน: groupStatus,
        สถานะพนักงาน: "ทำงาน",
        start_date: form.start_date,
        เลขบัตรประชาชน: form.เลขบัตรประชาชน.trim(),
        โทรศัพท์: form.โทรศัพท์.trim(),
        เพศ: form.เพศ.trim(),
        สัญชาติ: form.สัญชาติ.trim(),
        วันเกิด: form.วันเกิด.trim(),
        // ที่อยู่ปัจจุบัน — ใช้รูปแบบเดียวกับข้อมูลพนักงานเดิมในระบบ (มี "ต./อ./จ." นำหน้า)
        ที่อยู่บรรทัด_1: form.บ้านเลขที่.trim(),
        ที่อยู่บรรทัด_2: form.หมู่.trim() ? `หมู่ ${form.หมู่.trim()}` : "",
        แขวงตำบล: form.แขวงตำบล.trim() ? `ต.${form.แขวงตำบล.trim()}` : "",
        เขตอำเภอ: form.เขตอำเภอ.trim() ? `อ.${form.เขตอำเภอ.trim()}` : "",
        จังหวัด: form.จังหวัด.trim() ? `จ.${form.จังหวัด.trim()}` : "",
        ไปรษณีย์: form.ไปรษณีย์.trim(),
        // ผู้ติดต่อฉุกเฉิน
        ผู้ติดต่อฉุกเฉิน_ชื่อ: form.ผู้ติดต่อฉุกเฉิน_ชื่อ.trim(),
        ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: form.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์.trim(),
        ผู้ติดต่อฉุกเฉิน_โทร: form.ผู้ติดต่อฉุกเฉิน_โทร.trim(),
        // การศึกษา
        วุฒิการศึกษา: form.วุฒิการศึกษา.trim(),
        สถาบันการศึกษา: form.สถาบันการศึกษา.trim(),
        สาขา: form.สาขา.trim(),
        // ฟิลด์อื่น ๆ ที่ผู้สมัครกรอกตอนทำเอกสารจ้างงาน ไม่มีช่องแก้ในฟอร์มนี้ (ข้อมูลมาครบจาก Recruitment
        // อยู่แล้ว) จึงคัดลอกมาจาก record ต้นทางตรง ๆ ไม่ให้ตกหล่น
        อีเมล: formTarget.อีเมล || "",
        สถานภาพสมรส: formTarget.สถานภาพสมรส || "",
        สถานะทางทหาร: formTarget.สถานะทางทหาร || "",
        ระดับภาษาอังกฤษ: formTarget.ระดับภาษาอังกฤษ || "",
        ผู้ติดต่อฉุกเฉิน_ที่อยู่: formTarget.ผู้ติดต่อฉุกเฉิน_ที่อยู่ || "",
        เคยถูกให้ออกจากงาน: formTarget.เคยถูกให้ออกจากงาน || "",
        รายละเอียดการถูกให้ออกจากงาน: formTarget.รายละเอียดการถูกให้ออกจากงาน || "",
        ญาติหรือเพื่อนในบริษัท: formTarget.ญาติหรือเพื่อนในบริษัท || "",
        บันทึกเพิ่มเติม: formTarget.บันทึกเพิ่มเติม || "",
        ประสบการณ์ทำงาน: formTarget.ประสบการณ์ทำงาน || "",
        ไม่มีประสบการณ์ทำงาน: formTarget.ไม่มีประสบการณ์ทำงาน ?? false,
        ลักษณะงานที่เคยทำ: formTarget.ลักษณะงานที่เคยทำ || "",
        ประวัติการทำงาน: formTarget.ประวัติการทำงาน || [],
        fullPacketPdfUrl: formTarget.fullPacketPdfUrl || "",
        // เก็บลิงก์ย้อนกลับไปหา record ต้นทาง ไว้ตรวจสอบ/แนบเอกสารเพิ่มได้ภายหลัง
        recruitmentSourceId: formTarget.id,
      };

      // เอกสารแนบที่ฝั่ง Recruitment อัปโหลดไว้ (บัตร ปชช., ทะเบียนบ้าน, วุฒิการศึกษา, รูปถ่าย ฯลฯ)
      // ต้องคัดลอกมาที่ employee_data ตอนนำเข้าด้วย ไม่งั้นจะไม่โผล่ในหน้า "เอกสารแนบ" ของพนักงาน
      // (ใช้ setDoc({ merge: true }) ด้านล่าง ครั้งแรกที่นำเข้าจึงปลอดภัย ไม่ต้องกลัวทับของเดิมเพราะพนักงาน
      // ใหม่ยังไม่มี attachments ของตัวเองในระบบ HR มาก่อน)
      const sourceAttachments = (formTarget.attachments as HiringAttachment[] | undefined) || [];
      if (sourceAttachments.length > 0) {
        employeeRecord["attachments"] = sourceAttachments;
      }

      // ฟิลด์คำนำหน้าชื่อ: โมดูล Indirect ใช้ "ชื่อต้น" ส่วนโมดูล Direct_* ใช้ "คำนำหน้าชื่อ"
      // (ดู src/components/MigrantWorkerPage.tsx) ห้ามเขียนผิดฟิลด์เพราะจะไม่ขึ้นในหน้านั้น ๆ
      if (form.employee_type === "Indirect") {
        employeeRecord["ชื่อต้น"] = form.คำนำหน้า.trim();
      } else {
        employeeRecord["คำนำหน้าชื่อ"] = form.คำนำหน้า.trim();
      }

      await setDoc(doc(db, "CMG-HR-Database", "root", "employee_data", empCode), employeeRecord, { merge: true });

      // อัปเดตเฉพาะ field สถานะนำเข้า ห้ามแตะ attachments เดิม (updateDoc แบบระบุ field เท่านั้น ไม่ overwrite ทั้ง doc)
      await updateDoc(doc(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION, formTarget.id), {
        importedEmployeeId: empCode,
        importedAt: Date.now(),
        importedByUid: firebaseUser?.uid || "",
        importedByName: `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim(),
      });

      closeForm();
    } catch (error) {
      window.alert(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------------
  // ส่วนที่ 2: เอกสารแนบรายคน
  // ------------------------------------------------------------------------

  const openDocsPanel = (candidate: RecruitmentPendingEmployee) => {
    setDocsTarget(candidate);
    setDocType(documentTypeOptions[0]?.value || "");
    setCustomDocTypeLabel("");
    setDocFile(null);
    setDocsError(null);
  };

  const closeDocsPanel = () => {
    setDocsTarget(null);
    setDocFile(null);
    setDocsError(null);
  };

  const handleUploadDoc = async () => {
    if (!docsTarget || !docFile) return;
    if (docType === "other" && !customDocTypeLabel.trim()) {
      setDocsError("กรุณาพิมพ์ชื่อประเภทเอกสาร");
      return;
    }
    setUploading(true);
    setDocsError(null);
    try {
      // "อื่น ๆ (พิมพ์เอง)" ต้องลงทะเบียนเข้า catalog กลางก่อน เพื่อให้ได้ docType ที่คงที่
      // เหมือนกับประเภทเอกสารมาตรฐาน — กันไม่ให้พิมพ์คำเดิมคนละแบบแล้วกลายเป็นคนละประเภทเอกสาร
      const resolvedDocType = docType === "other" ? (await addCustomDocumentType(customDocTypeLabel)).value : docType || "other";
      const candidateKey = resolveCandidateKey(docsTarget);
      const uploadResult = await uploadHiringDocumentFile(docFile, {
        candidateName: buildFullName(docsTarget),
        position: docsTarget.ตำแหน่ง || "",
        candidateKey,
        docType: resolvedDocType,
      });

      const attachment: HiringAttachment = {
        docType: resolvedDocType,
        name: uploadResult.fileName || docFile.name,
        url: uploadResult.url,
        uploadedAt: new Date().toISOString(),
      };

      // record นี้มาจาก recruitment_pending_employees (ผ่าน GM อนุมัติแล้ว) -> ต่อท้าย attachments เดิมที่นี่
      await appendAttachmentToRecruitmentPending(docsTarget.id, attachment);

      setDocFile(null);
      setCustomDocTypeLabel("");
      setDocType(documentTypeOptions[0]?.value || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด";
      console.error(`[RecruitmentIntakePage] Upload document failed for candidate "${docsTarget.id}":`, err);
      setDocsError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full">
      <div>
        <h2 className="text-lg font-bold text-gray-800">รายชื่อรอเพิ่มจาก Recruitment</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          ข้อมูลจากระบบ Recruitment แบบ realtime จาก <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{FIRESTORE_PATH}</code> —
          กด "เพิ่มเข้าระบบ" เพื่อสร้างพนักงานจริง หรือ "เอกสารแนบ" เพื่อเพิ่ม/ดูเอกสารของคนนั้น
        </p>
      </div>

      {/* สถานะ "รอเพิ่มเข้าระบบ" คือค่า default เสมอ — ตั้งใจให้ HR เห็นงานที่ต้องตามทำต่อก่อน */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "pending", label: INTAKE_STATUS_META.pending.label },
          { key: "imported", label: INTAKE_STATUS_META.imported.label },
          { key: "no_show", label: INTAKE_STATUS_META.no_show.label },
          { key: "all", label: "ทั้งหมด" },
        ] as { key: "all" | IntakeStatusFilter; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              statusFilter === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label} <span className="ml-1 text-xs font-bold text-gray-400">({statusCounts[t.key] || 0})</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {([
          { key: "all", label: "ทั้งหมด" },
          { key: "external", label: SOURCE_GROUP_META.external.label },
          { key: "internal_transfer", label: SOURCE_GROUP_META.internal_transfer.label },
          { key: "contractor", label: SOURCE_GROUP_META.contractor.label },
          { key: "other", label: SOURCE_GROUP_META.other.label },
        ] as { key: "all" | RecruitmentSourceGroup; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setGroupFilter(t.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
              groupFilter === t.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label} ({counts[t.key] || 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก / โครงการ..."
            className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={employeeTypeFilter}
          onChange={(e) => setEmployeeTypeFilter(e.target.value)}
          className="border rounded-lg text-sm px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="all">ทุกประเภทพนักงาน</option>
          {employeeTypeOptionsInData.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="border rounded-lg text-sm px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="all">ทุกโครงการ</option>
          {projectOptionsInData.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="border rounded-lg text-sm px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        >
          <option value="all">ทุกแผนก/บริษัท</option>
          {departmentOptionsInData.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={20} /> กำลังโหลดข้อมูล...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 text-red-500 gap-2 px-4 text-center">
            <AlertTriangle size={28} />
            <p className="text-sm font-semibold">เกิดข้อผิดพลาดในการอ่านข้อมูล</p>
            <p className="text-xs text-gray-500 max-w-md">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">
              {items.length === 0 ? "ยังไม่มีข้อมูลในระบบ" : "ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อเต็ม</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">แผนก</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โครงการ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะ</th>
                <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const group = getSourceGroup(c.source);
                const meta = SOURCE_GROUP_META[group];
                const attachmentCount = (c.attachments as HiringAttachment[] | undefined)?.length || 0;
                const imported = Boolean(c.importedEmployeeId);
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap">
                      <button
                        onClick={() => setViewTarget(c)}
                        className="font-medium text-blue-700 hover:underline text-left"
                        title="ดูรายละเอียดทั้งหมด"
                      >
                        {buildFullName(c)}
                      </button>
                      <div className="mt-0.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${meta.className}`}>
                          {meta.label}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.ตำแหน่ง || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.แผนก || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.โครงการ || "-"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {c.intakeStatus === "no_show" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold bg-red-50 text-red-700 border-red-200" title={String(c.noShowReason || "")}>
                          ไม่มาเริ่มงาน
                        </span>
                      ) : imported ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 size={12} /> เพิ่มแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200">
                          รอเพิ่มเข้าระบบ
                        </span>
                      )}
                      {imported && (
                        <div className="text-[11px] text-gray-400 mt-0.5">รหัส: {c.importedEmployeeId as string}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewTarget(c)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 whitespace-nowrap"
                        >
                          ดูรายละเอียด
                        </button>
                        {canManage && imported && c.intakeStatus !== "no_show" && c.source !== "internal_transfer" && (
                          <button disabled={statusSaving !== null} onClick={() => markNoShow(c)} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 whitespace-nowrap disabled:opacity-50">
                            {statusSaving === c.id ? "กำลังบันทึก..." : "ไม่มาเริ่มงาน"}
                          </button>
                        )}
                        {canManage && !imported && (
                          <button
                            onClick={() => openIntakeForm(c)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                          >
                            <UserPlus size={14} /> เพิ่มเข้าระบบ
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => openDocsPanel(c)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 whitespace-nowrap"
                          >
                            <Paperclip size={14} /> เอกสารแนบ ({attachmentCount})
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => deleteCandidate(c)}
                            disabled={deletingCandidateId === c.id}
                            title="ลบออกจากรายชื่อรอเพิ่ม"
                            className="flex items-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 whitespace-nowrap disabled:opacity-50"
                          >
                            {deletingCandidateId === c.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ฟอร์มเพิ่มเข้าระบบพนักงาน */}
      {formTarget && form && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
          >
            <div className="p-5 border-b">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="text-blue-600" size={20} />
                เพิ่ม {buildFullName(formTarget)} เข้าระบบพนักงาน
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                ตรวจสอบและกรอกข้อมูลให้ครบก่อนบันทึก (โครงการ/รหัสพนักงาน เป็นข้อมูลที่ต้องเติมเอง) ข้อมูลอื่น
                (ที่อยู่ เลขผู้เสียภาษี ฯลฯ) ไปกรอกต่อที่หน้าพนักงานได้ภายหลัง
              </p>
            </div>

            <div className="p-5 overflow-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="รหัสพนักงาน *">
                <input
                  required
                  value={form.รหัสพนักงาน}
                  onChange={(e) => setForm((f) => (f ? { ...f, รหัสพนักงาน: e.target.value } : f))}
                  onBlur={(e) => checkDuplicate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="ประเภทพนักงาน">
                <select
                  required value={form.employee_type}
                  onChange={(e) => setForm((f) => (f ? { ...f, employee_type: e.target.value } : f))}
                  className="input"
                >
                  <option value="" disabled>เลือกประเภทพนักงาน</option>
                  {EMPLOYEE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="สถานะกลุ่มงานที่จะบันทึก">
                <input readOnly value={intakeWorkGroup(form.employee_type, formTarget.สถานะกลุ่มงาน) || "กรุณาตรวจสอบกลุ่มงานจาก Recruitment"} className="input bg-gray-50" />
              </Field>
              <Field label="คำนำหน้า">
                <input value={form.คำนำหน้า} onChange={(e) => setForm((f) => (f ? { ...f, คำนำหน้า: e.target.value } : f))} className="input" />
              </Field>
              <Field label="ชื่อตัว">
                <input value={form.ชื่อตัว} onChange={(e) => setForm((f) => (f ? { ...f, ชื่อตัว: e.target.value } : f))} className="input" />
              </Field>
              <Field label="ชื่อสกุล">
                <input value={form.ชื่อสกุล} onChange={(e) => setForm((f) => (f ? { ...f, ชื่อสกุล: e.target.value } : f))} className="input" />
              </Field>
              <Field label="ตำแหน่ง">
                {positionOptionsForForm.length > 0 ? (
                  <select
                    value={form.ตำแหน่ง}
                    onChange={(e) => setForm((f) => (f ? { ...f, ตำแหน่ง: e.target.value } : f))}
                    className="input"
                  >
                    <option value="">เลือกตำแหน่ง</option>
                    {form.ตำแหน่ง && !positionOptionsForForm.includes(form.ตำแหน่ง) && (
                      <option value={form.ตำแหน่ง}>{form.ตำแหน่ง} (ไม่อยู่ในระบบ)</option>
                    )}
                    {positionOptionsForForm.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input value={form.ตำแหน่ง} onChange={(e) => setForm((f) => (f ? { ...f, ตำแหน่ง: e.target.value } : f))} className="input" />
                )}
                {positionMatchNote && (
                  <p className="text-[11px] font-medium text-amber-700 mt-1">{positionMatchNote}</p>
                )}
              </Field>
              <Field label="แผนก">
                {departmentOptionsForForm.length > 0 ? (
                  <select
                    value={form.แผนก}
                    onChange={(e) => setForm((f) => (f ? { ...f, แผนก: e.target.value } : f))}
                    className="input"
                  >
                    <option value="">เลือกแผนก</option>
                    {form.แผนก && !departmentOptionsForForm.includes(form.แผนก) && (
                      <option value={form.แผนก}>{form.แผนก} (ไม่อยู่ในระบบ)</option>
                    )}
                    {departmentOptionsForForm.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input value={form.แผนก} onChange={(e) => setForm((f) => (f ? { ...f, แผนก: e.target.value } : f))} className="input" />
                )}
                {departmentMatchNote && (
                  <p className="text-[11px] font-medium text-amber-700 mt-1">{departmentMatchNote}</p>
                )}
              </Field>
              <Field label="โครงการ *">
                {projectOptions.length > 0 ? (
                  <select
                    required
                    value={form.โครงการ}
                    onChange={(e) => setForm((f) => (f ? { ...f, โครงการ: e.target.value } : f))}
                    className="input"
                  >
                    <option value="" disabled>เลือกโครงการ</option>
                    {form.โครงการ && !projectOptions.includes(form.โครงการ) && (
                      <option value={form.โครงการ}>{form.โครงการ} (ไม่อยู่ในระบบ)</option>
                    )}
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={form.โครงการ}
                    onChange={(e) => setForm((f) => (f ? { ...f, โครงการ: e.target.value } : f))}
                    className="input"
                  />
                )}
                {projectMatchNote && (
                  <p className="text-[11px] font-medium text-amber-700 mt-1">{projectMatchNote}</p>
                )}
              </Field>
              <Field label="วันเริ่มงาน">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                  className="input"
                />
                {startDateWarningNote && (
                  <p className="text-[11px] font-medium text-amber-700 mt-1">{startDateWarningNote}</p>
                )}
              </Field>
              <Field label="เลขบัตรประชาชน">
                <input value={form.เลขบัตรประชาชน} onChange={(e) => setForm((f) => (f ? { ...f, เลขบัตรประชาชน: e.target.value } : f))} className="input" />
              </Field>
              <Field label="วันเกิด">
                <input
                  type="date"
                  value={form.วันเกิด}
                  onChange={(e) => setForm((f) => (f ? { ...f, วันเกิด: e.target.value } : f))}
                  className="input"
                />
                {dobWarningNote && (
                  <p className="text-[11px] font-medium text-amber-700 mt-1">{dobWarningNote}</p>
                )}
              </Field>
              <Field label="โทรศัพท์">
                <input value={form.โทรศัพท์} onChange={(e) => setForm((f) => (f ? { ...f, โทรศัพท์: e.target.value } : f))} className="input" />
              </Field>
              <Field label="เพศ">
                <input value={form.เพศ} onChange={(e) => setForm((f) => (f ? { ...f, เพศ: e.target.value } : f))} className="input" />
              </Field>
              <Field label="สัญชาติ">
                <input value={form.สัญชาติ} onChange={(e) => setForm((f) => (f ? { ...f, สัญชาติ: e.target.value } : f))} className="input" />
              </Field>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">
                ที่อยู่ปัจจุบัน (จากแบบฟอร์มเอกสารจ้างงาน)
              </div>
              <Field label="บ้านเลขที่ / หมู่บ้าน">
                <input value={form.บ้านเลขที่} onChange={(e) => setForm((f) => (f ? { ...f, บ้านเลขที่: e.target.value } : f))} className="input" />
              </Field>
              <Field label="หมู่">
                <input value={form.หมู่} onChange={(e) => setForm((f) => (f ? { ...f, หมู่: e.target.value } : f))} className="input" />
              </Field>
              <Field label="ตำบล/แขวง">
                <input value={form.แขวงตำบล} onChange={(e) => setForm((f) => (f ? { ...f, แขวงตำบล: e.target.value } : f))} className="input" />
              </Field>
              <Field label="อำเภอ/เขต">
                <input value={form.เขตอำเภอ} onChange={(e) => setForm((f) => (f ? { ...f, เขตอำเภอ: e.target.value } : f))} className="input" />
              </Field>
              <Field label="จังหวัด">
                <input value={form.จังหวัด} onChange={(e) => setForm((f) => (f ? { ...f, จังหวัด: e.target.value } : f))} className="input" />
              </Field>
              <Field label="รหัสไปรษณีย์">
                <input value={form.ไปรษณีย์} onChange={(e) => setForm((f) => (f ? { ...f, ไปรษณีย์: e.target.value } : f))} className="input" />
              </Field>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">
                ผู้ติดต่อฉุกเฉิน
              </div>
              <Field label="ชื่อ-สกุล">
                <input value={form.ผู้ติดต่อฉุกเฉิน_ชื่อ} onChange={(e) => setForm((f) => (f ? { ...f, ผู้ติดต่อฉุกเฉิน_ชื่อ: e.target.value } : f))} className="input" />
              </Field>
              <Field label="เกี่ยวข้องเป็น">
                <input value={form.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์} onChange={(e) => setForm((f) => (f ? { ...f, ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์: e.target.value } : f))} className="input" />
              </Field>
              <Field label="เบอร์โทร">
                <input value={form.ผู้ติดต่อฉุกเฉิน_โทร} onChange={(e) => setForm((f) => (f ? { ...f, ผู้ติดต่อฉุกเฉิน_โทร: e.target.value } : f))} className="input" />
              </Field>

              <div className="sm:col-span-2 pt-2 mt-1 border-t text-xs font-semibold text-gray-500 uppercase tracking-wide">
                การศึกษา
              </div>
              <Field label="วุฒิการศึกษา">
                <input value={form.วุฒิการศึกษา} onChange={(e) => setForm((f) => (f ? { ...f, วุฒิการศึกษา: e.target.value } : f))} className="input" />
              </Field>
              <Field label="สถาบันการศึกษา">
                <input value={form.สถาบันการศึกษา} onChange={(e) => setForm((f) => (f ? { ...f, สถาบันการศึกษา: e.target.value } : f))} className="input" />
              </Field>
              <Field label="สาขา">
                <input value={form.สาขา} onChange={(e) => setForm((f) => (f ? { ...f, สาขา: e.target.value } : f))} className="input" />
              </Field>

              {(formTarget.ประวัติการทำงาน?.length || formTarget.ลักษณะงานที่เคยทำ) && (
                <div className="sm:col-span-2 pt-2 mt-1 border-t">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    ประสบการณ์ทำงาน (จากเอกสารจ้างงาน — อ่านอย่างเดียว ย้ายเข้าระบบอัตโนมัติ)
                  </div>
                  {formTarget.ประสบการณ์ทำงาน && (
                    <div className="text-xs text-gray-600 mb-1">ระยะเวลารวม: {formTarget.ประสบการณ์ทำงาน}</div>
                  )}
                  {formTarget.ลักษณะงานที่เคยทำ && (
                    <div className="text-xs text-gray-600 whitespace-pre-line mb-1">{formTarget.ลักษณะงานที่เคยทำ}</div>
                  )}
                  {formTarget.ประวัติการทำงาน?.map((job, idx) => (
                    <div key={idx} className="text-xs text-gray-600 border rounded p-2 mb-1 bg-gray-50">
                      <span className="font-medium">{job.company || "-"}</span>
                      {job.position ? ` · ${job.position}` : ""}
                      {job.duration ? ` (${job.duration})` : ""}
                      {job.notes ? <div className="text-gray-500 mt-0.5">{job.notes}</div> : null}
                    </div>
                  ))}
                </div>
              )}

              {duplicateWarning && (
                <div className="sm:col-span-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {duplicateWarning}
                </div>
              )}
            </div>

            <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
              <button type="button" onClick={closeForm} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-lg font-semibold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                บันทึกเป็นพนักงาน
              </button>
            </div>
          </form>
        </div>
      )}

      {/* แผงเอกสารแนบ */}
      {docsTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Paperclip className="text-blue-600" size={20} />
                  เอกสารแนบของ {buildFullName(docsTarget)}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  ไฟล์จะถูกอัปโหลดเข้าโฟลเดอร์ Drive คนเดิม (candidateKey เดิม) แล้วต่อท้าย attachments เดิมอัตโนมัติ
                </p>
              </div>
              <button onClick={closeDocsPanel} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1 flex flex-col gap-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">เอกสารที่มีอยู่แล้ว</h4>
                {((docsTarget.attachments as HiringAttachment[] | undefined) || []).length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีเอกสารแนบ</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {((docsTarget.attachments as HiringAttachment[]) || []).map((a, idx) => {
                      const key = `${docsTarget.id}:${a.url}`;
                      return (
                        <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-700 truncate">{a.name}</div>
                            <div className="text-[11px] text-gray-400">
                              {documentTypeOptions.find((o) => o.value === a.docType)?.label || a.docType}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline text-xs font-semibold whitespace-nowrap"
                            >
                              เปิดไฟล์
                            </a>
                            <button
                              type="button"
                              onClick={() => deleteAttachment(docsTarget, a)}
                              disabled={deletingAttachmentKey === key}
                              title="ลบเอกสารนี้"
                              className="text-red-500 hover:text-red-700 disabled:opacity-50 p-0.5"
                            >
                              {deletingAttachmentKey === key ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">เพิ่มเอกสารใหม่</h4>
                <div className="flex flex-col gap-2">
                  <Field label="ประเภทเอกสาร">
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
                        {documentTypeOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                        <option value="other">อื่น ๆ (พิมพ์เอง)</option>
                      </select>
                      <IdCardPhotoGuideButton highlight={isIdCardDocType(docType)} />
                    </div>
                  </Field>
                  {docType === "other" && (
                    <input
                      value={customDocTypeLabel}
                      placeholder="พิมพ์ชื่อประเภทเอกสาร"
                      onChange={(e) => setCustomDocTypeLabel(e.target.value)}
                      className="input"
                    />
                  )}
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                  {docsError && (
                    <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                      {docsError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleUploadDoc}
                    disabled={!docFile || uploading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
                    อัปโหลดและแนบเข้าระบบ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* แผงดูรายละเอียดทั้งหมด (คลิกชื่อ หรือกด "ดูรายละเอียด" จากตาราง) */}
      {viewTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{buildFullName(viewTarget)}</h3>
                <p className="text-xs text-gray-500 mt-1">{viewTarget.ตำแหน่ง || "-"} · {viewTarget.แผนก || "-"}</p>
              </div>
              <button onClick={() => setViewTarget(null)} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1 flex flex-col gap-4 text-sm">
              <DetailSection title="ข้อมูลงาน">
                <DetailRow label="โครงการ" value={viewTarget.โครงการ} />
                <DetailRow label="สถานะกลุ่มงาน" value={viewTarget.สถานะกลุ่มงาน} />
                {viewTarget.intakeStatus === "no_show" && <>
                  <DetailRow label="สถานะเริ่มงาน" value="ไม่มาเริ่มงาน" />
                  <DetailRow label="เหตุผล" value={viewTarget.noShowReason} />
                  <DetailRow label="ผู้บันทึก" value={viewTarget.noShowByName} />
                  <DetailRow label="วันที่บันทึก" value={formatDate(viewTarget.noShowAt)} />
                </>}
                <DetailRow label="วันเริ่มงาน" value={viewTarget.วันเริ่มงาน} />
                <DetailRow label="รหัสพนักงานเดิม" value={viewTarget.รหัสพนักงานเดิม as string} />
              </DetailSection>

              <DetailSection title="ข้อมูลติดต่อ/ส่วนตัว">
                <DetailRow label="โทรศัพท์" value={viewTarget.โทรศัพท์} />
                <DetailRow label="อีเมล" value={viewTarget.อีเมล} />
                <DetailRow label="เลขบัตรประชาชน" value={viewTarget.เลขบัตรประชาชน} />
                <DetailRow label="วันเกิด" value={viewTarget.วันเกิด} />
                <DetailRow label="เพศ" value={viewTarget.เพศ} />
                <DetailRow label="สัญชาติ" value={viewTarget.สัญชาติ} />
                <DetailRow label="สถานภาพสมรส" value={viewTarget.สถานภาพสมรส} />
                <DetailRow label="สถานะทางทหาร" value={viewTarget.สถานะทางทหาร} />
                <DetailRow label="ระดับภาษาอังกฤษ" value={viewTarget.ระดับภาษาอังกฤษ} />
              </DetailSection>

              <DetailSection title="ที่อยู่ปัจจุบัน">
                <DetailRow
                  label="ที่อยู่"
                  value={[viewTarget.บ้านเลขที่, viewTarget.หมู่ ? `หมู่ ${viewTarget.หมู่}` : "", viewTarget.แขวงตำบล, viewTarget.เขตอำเภอ, viewTarget.จังหวัด, viewTarget.ไปรษณีย์]
                    .filter(Boolean)
                    .join(" ")}
                />
              </DetailSection>

              <DetailSection title="ผู้ติดต่อฉุกเฉิน">
                <DetailRow label="ชื่อ-สกุล" value={viewTarget.ผู้ติดต่อฉุกเฉิน_ชื่อ} />
                <DetailRow label="เกี่ยวข้องเป็น" value={viewTarget.ผู้ติดต่อฉุกเฉิน_ความสัมพันธ์} />
                <DetailRow label="เบอร์โทร" value={viewTarget.ผู้ติดต่อฉุกเฉิน_โทร} />
                <DetailRow label="ที่อยู่" value={viewTarget.ผู้ติดต่อฉุกเฉิน_ที่อยู่ as string} />
              </DetailSection>

              <DetailSection title="การศึกษาและประสบการณ์ทำงาน">
                <DetailRow label="วุฒิการศึกษา" value={viewTarget.วุฒิการศึกษา} />
                <DetailRow label="สถาบันการศึกษา" value={viewTarget.สถาบันการศึกษา} />
                <DetailRow label="สาขา" value={viewTarget.สาขา} />
                <DetailRow label="ประสบการณ์ทำงาน" value={viewTarget.ประสบการณ์ทำงาน} />
                {viewTarget.ลักษณะงานที่เคยทำ && (
                  <div className="text-xs text-gray-600 whitespace-pre-line bg-gray-50 rounded-lg p-2 mt-1">
                    {viewTarget.ลักษณะงานที่เคยทำ as string}
                  </div>
                )}
                {(viewTarget.ประวัติการทำงาน || []).map((job, idx) => (
                  <div key={idx} className="text-xs text-gray-600 border rounded-lg p-2 mt-1 bg-gray-50">
                    <span className="font-medium">{job.company || "-"}</span>
                    {job.position ? ` · ${job.position}` : ""}
                    {job.duration ? ` (${job.duration})` : ""}
                    {job.notes ? <div className="text-gray-500 mt-0.5">{job.notes}</div> : null}
                  </div>
                ))}
              </DetailSection>

              <DetailSection title="ค่าตอบแทน">
                <DetailRow label="Pay Type" value={canViewSalary ? (viewTarget.payType as string) : "••••••"} />
                <DetailRow
                  label="เงินเดือน/ค่าแรง"
                  value={
                    canViewSalary
                      ? viewTarget.salaryAmount !== undefined && viewTarget.salaryAmount !== null && viewTarget.salaryAmount !== ""
                        ? Number(viewTarget.salaryAmount).toLocaleString("th-TH")
                        : "-"
                      : "••••••"
                  }
                />
                <DetailRow label="สวัสดิการ" value={canViewSalary ? formatBenefits(viewTarget.benefits) : "••••••"} />
              </DetailSection>

              <DetailSection title="ประวัติ/บันทึกเพิ่มเติม">
                <DetailRow label="เคยถูกให้ออกจากงาน" value={viewTarget.เคยถูกให้ออกจากงาน === "yes" ? "เคย" : viewTarget.เคยถูกให้ออกจากงาน === "no" ? "ไม่เคย" : (viewTarget.เคยถูกให้ออกจากงาน as string)} />
                {viewTarget.รายละเอียดการถูกให้ออกจากงาน ? <DetailRow label="รายละเอียด" value={viewTarget.รายละเอียดการถูกให้ออกจากงาน as string} /> : null}
                <DetailRow label="ญาติ/เพื่อนในบริษัท" value={viewTarget.ญาติหรือเพื่อนในบริษัท as string} />
                {viewTarget.บันทึกเพิ่มเติม ? <DetailRow label="บันทึกเพิ่มเติม" value={viewTarget.บันทึกเพิ่มเติม as string} /> : null}
              </DetailSection>

              <DetailSection title="เอกสาร / ที่มา">
                <DetailRow label="แหล่งที่มา" value={viewTarget.source as string} />
                {viewTarget.contractorCompany ? <DetailRow label="บริษัทผู้รับเหมา" value={viewTarget.contractorCompany} /> : null}
                <DetailRow label="สร้างเมื่อ" value={formatDate(viewTarget.createdAt)} />
                <DetailRow label="สร้างโดย" value={viewTarget.createdByName as string} />
                <DetailRow label="จำนวนเอกสารแนบ" value={String((viewTarget.attachments as HiringAttachment[] | undefined)?.length || 0)} />
                {viewTarget.fullPacketPdfUrl ? (
                  <a href={viewTarget.fullPacketPdfUrl as string} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-semibold">
                    เปิดไฟล์ใบสมัคร+เอกสารจ้างงานฉบับเต็ม (PDF)
                  </a>
                ) : null}
              </DetailSection>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between items-center gap-2">
              {canManage && (
                <button
                  onClick={() => deleteCandidate(viewTarget)}
                  disabled={deletingCandidateId === viewTarget.id}
                  className="flex items-center gap-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
                >
                  {deletingCandidateId === viewTarget.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} ลบรายการนี้
                </button>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { openDocsPanel(viewTarget); setViewTarget(null); }}
                  className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  <Paperclip size={14} /> เอกสารแนบ
                </button>
                {canManage && !viewTarget.importedEmployeeId && (
                  <button
                    onClick={() => { openIntakeForm(viewTarget); setViewTarget(null); }}
                    className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                  >
                    <UserPlus size={14} /> เพิ่มเข้าระบบ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};

const DetailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-b pb-3 last:border-b-0 last:pb-0">
    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value?: string | null }) => {
  const display = value && String(value).trim() ? value : "-";
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 min-w-[140px] shrink-0">{label}</span>
      <span className="text-gray-800 break-words">{display}</span>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    {children}
  </label>
);
