import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getFirestore, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Inbox,
  Loader2,
  Lock,
  Paperclip,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  appendAttachmentToRecruitmentPending,
  uploadHiringDocumentFile,
} from "../utils/hiringDocsAttachments";
import {
  buildFullName,
  canManageRecruitmentIntake,
  EMPLOYEE_TYPE_BY_GROUP_STATUS,
  EMPLOYEE_TYPE_OPTIONS,
  getSourceGroup,
  GROUP_STATUS_BY_EMPLOYEE_TYPE,
  HIRING_DOC_TYPE_OPTIONS,
  HiringAttachment,
  RecruitmentPendingEmployee,
  RECRUITMENT_PENDING_EMPLOYEES_COLLECTION,
  RecruitmentSourceGroup,
  SOURCE_GROUP_META,
  toDateSafe,
} from "./recruitmentIntakeConfig";

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

export const RecruitmentIntakePage = ({ projectOptions = [] }: { projectOptions?: string[] }) => {
  const { firebaseUser, userProfile } = useAuth();
  const canViewSalary = canViewSalaryInfo(userProfile?.role);
  const canManage = canManageRecruitmentIntake(userProfile?.role);

  const [items, setItems] = useState<RecruitmentPendingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | RecruitmentSourceGroup>("all");

  // ฟอร์มเพิ่มเข้าระบบ
  const [formTarget, setFormTarget] = useState<RecruitmentPendingEmployee | null>(null);
  const [form, setForm] = useState<IntakeFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // แผงเอกสารแนบ
  const [docsTarget, setDocsTarget] = useState<RecruitmentPendingEmployee | null>(null);
  const [docType, setDocType] = useState<string>(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
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

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((c) => (groupFilter === "all" ? true : getSourceGroup(c.source) === groupFilter))
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
  }, [items, groupFilter, search]);

  const counts = useMemo(() => {
    const result: Record<"all" | RecruitmentSourceGroup, number> = {
      all: items.length,
      external: 0,
      internal_transfer: 0,
      other: 0,
    };
    items.forEach((c) => {
      const g = getSourceGroup(c.source);
      result[g] += 1;
    });
    return result;
  }, [items]);

  // ------------------------------------------------------------------------
  // ส่วนที่ 1: เพิ่มเข้าระบบพนักงาน
  // ------------------------------------------------------------------------

  const openIntakeForm = (candidate: RecruitmentPendingEmployee) => {
    const groupStatus = (candidate.สถานะกลุ่มงาน as string) || "Staff";
    const empType = EMPLOYEE_TYPE_BY_GROUP_STATUS[groupStatus] || "Indirect";
    setFormTarget(candidate);
    setDuplicateWarning(null);
    setForm({
      รหัสพนักงาน: (candidate.รหัสพนักงานเดิม as string) || "",
      คำนำหน้า: candidate.ชื่อต้น || "",
      ชื่อตัว: (candidate.ชื่อตัว || "").trim(),
      ชื่อสกุล: candidate.ชื่อสกุล || "",
      ตำแหน่ง: candidate.ตำแหน่ง || "",
      แผนก: candidate.แผนก || "",
      โครงการ: candidate.โครงการ || "",
      employee_type: empType,
      start_date: candidate.วันเริ่มงาน || "",
      เลขบัตรประชาชน: candidate.เลขบัตรประชาชน || "",
      โทรศัพท์: candidate.โทรศัพท์ || "",
      เพศ: candidate.เพศ || "",
      สัญชาติ: candidate.สัญชาติ || "",
      วันเกิด: candidate.วันเกิด || "",
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
    setSaving(true);
    try {
      const db = getFirestore();
      const empCode = form.รหัสพนักงาน.trim();
      const groupStatus = GROUP_STATUS_BY_EMPLOYEE_TYPE[form.employee_type] || "Staff";

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
    setDocType(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
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
    setUploading(true);
    setDocsError(null);
    try {
      const candidateKey = resolveCandidateKey(docsTarget);
      const uploadResult = await uploadHiringDocumentFile(docFile, {
        candidateName: buildFullName(docsTarget),
        position: docsTarget.ตำแหน่ง || "",
        candidateKey,
        docType: docType || "other",
      });

      const attachment: HiringAttachment = {
        docType: docType || "other",
        name: uploadResult.fileName || docFile.name,
        url: uploadResult.url,
        uploadedAt: new Date().toISOString(),
      };

      // record นี้มาจาก recruitment_pending_employees (ผ่าน GM อนุมัติแล้ว) -> ต่อท้าย attachments เดิมที่นี่
      await appendAttachmentToRecruitmentPending(docsTarget.id, attachment);

      setDocFile(null);
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

      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "all", label: "ทั้งหมด" },
          { key: "external", label: SOURCE_GROUP_META.external.label },
          { key: "internal_transfer", label: SOURCE_GROUP_META.internal_transfer.label },
          { key: "other", label: SOURCE_GROUP_META.other.label },
        ] as { key: "all" | RecruitmentSourceGroup; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setGroupFilter(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              groupFilter === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label} <span className="ml-1 text-xs font-bold text-gray-400">({counts[t.key] || 0})</span>
          </button>
        ))}
      </div>

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
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โทรศัพท์</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">วันเริ่มงาน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะกลุ่มงาน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">
                  Pay Type {!canViewSalary && <Lock size={11} className="inline ml-1 text-gray-400" />}
                </th>
                <th className="p-3 text-right font-semibold text-gray-600 border-b whitespace-nowrap">
                  Salary {!canViewSalary && <Lock size={11} className="inline ml-1 text-gray-400" />}
                </th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">
                  Benefits {!canViewSalary && <Lock size={11} className="inline ml-1 text-gray-400" />}
                </th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">Source</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัสพนักงานเดิม</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สร้างเมื่อ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะ</th>
                {canManage && <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>}
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
                    <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildFullName(c)}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.ตำแหน่ง || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.แผนก || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.โครงการ || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.โทรศัพท์ || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.วันเริ่มงาน || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.สถานะกลุ่มงาน || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">
                      {canViewSalary ? (c.payType || "-") : <MaskedCell />}
                    </td>
                    <td className="p-3 text-gray-600 text-right whitespace-nowrap">
                      {canViewSalary ? (
                        c.salaryAmount !== undefined && c.salaryAmount !== null && c.salaryAmount !== ""
                          ? Number(c.salaryAmount).toLocaleString("th-TH")
                          : "-"
                      ) : (
                        <MaskedCell />
                      )}
                    </td>
                    <td className="p-3 text-gray-600 max-w-[220px] truncate" title={canViewSalary ? formatBenefits(c.benefits) : undefined}>
                      {canViewSalary ? formatBenefits(c.benefits) : <MaskedCell />}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.source || "-"}</div>
                    </td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.รหัสพนักงานเดิม || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {imported ? (
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
                    {canManage && (
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          {!imported && (
                            <button
                              onClick={() => openIntakeForm(c)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                            >
                              <UserPlus size={14} /> เพิ่มเข้าระบบ
                            </button>
                          )}
                          <button
                            onClick={() => openDocsPanel(c)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 whitespace-nowrap"
                          >
                            <Paperclip size={14} /> เอกสารแนบ ({attachmentCount})
                          </button>
                        </div>
                      </td>
                    )}
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
                  value={form.employee_type}
                  onChange={(e) => setForm((f) => (f ? { ...f, employee_type: e.target.value } : f))}
                  className="input"
                >
                  {EMPLOYEE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
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
                <input value={form.ตำแหน่ง} onChange={(e) => setForm((f) => (f ? { ...f, ตำแหน่ง: e.target.value } : f))} className="input" />
              </Field>
              <Field label="แผนก">
                <input value={form.แผนก} onChange={(e) => setForm((f) => (f ? { ...f, แผนก: e.target.value } : f))} className="input" />
              </Field>
              <Field label="โครงการ *">
                <input
                  required
                  list="recruitment-intake-project-options"
                  value={form.โครงการ}
                  onChange={(e) => setForm((f) => (f ? { ...f, โครงการ: e.target.value } : f))}
                  className="input"
                />
                <datalist id="recruitment-intake-project-options">
                  {projectOptions.map((p) => <option key={p} value={p} />)}
                </datalist>
              </Field>
              <Field label="วันเริ่มงาน">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                  className="input"
                />
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
                    {((docsTarget.attachments as HiringAttachment[]) || []).map((a, idx) => (
                      <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-700 truncate">{a.name}</div>
                          <div className="text-[11px] text-gray-400">{a.docType}</div>
                        </div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          เปิดไฟล์
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">เพิ่มเอกสารใหม่</h4>
                <div className="flex flex-col gap-2">
                  <Field label="ประเภทเอกสาร">
                    <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input">
                      {HIRING_DOC_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                      <option value="other">อื่น ๆ (พิมพ์เอง)</option>
                    </select>
                  </Field>
                  {docType === "other" && (
                    <input
                      placeholder="พิมพ์ชื่อประเภทเอกสาร"
                      onChange={(e) => setDocType(e.target.value)}
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
