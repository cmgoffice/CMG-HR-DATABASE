import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Paperclip, UserCircle2 } from "lucide-react";
import { HiringAttachment } from "./recruitmentIntakeConfig";
import { useDocumentTypeCatalog } from "./documentTypeCatalog";
import {
  uploadHiringDocumentFile,
  appendAttachmentToEmployee,
  resolveEmployeeDocumentCandidateKey,
} from "../utils/hiringDocsAttachments";
import {
  EMPLOYEE_DOCUMENT_LINKS_COLLECTION,
  EmployeeDocumentLink,
} from "./employeeDocumentLinkConfig";

interface EmployeeRow {
  id: string;
  รหัสพนักงาน?: string;
  คำนำหน้าชื่อ?: string;
  ชื่อต้น?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  แผนก?: string;
  attachments?: HiringAttachment[];
  // มีค่าเฉพาะพนักงานที่เคยผ่านระบบ Recruitment มาก่อน — ใช้หา folder Drive เดิมของคนนี้
  hiringPacketId?: string;
  recruitmentSourceId?: string;
}

const buildFullName = (e: EmployeeRow): string =>
  [e.ชื่อต้น || e.คำนำหน้าชื่อ, e.ชื่อตัว, e.ชื่อสกุล]
    .map((p) => (p || "").toString().trim())
    .filter(Boolean)
    .join(" ") || e.id;

/**
 * หน้าสาธารณะสำหรับพนักงาน CMG รายคน (ไม่จำกัดประเภทพนักงาน) — ไม่ต้อง login
 * เข้าถึงด้วย token ในลิงก์ เส้นทาง: /my-documents/:token
 * ให้พนักงานแนบเอกสารของตัวเองที่ยังขาดตาม checklist ที่ HR ระบุไว้ตอนสร้างลิงก์
 * (หรือแนบได้อิสระถ้า HR ไม่ได้ระบุ checklist ไว้)
 */
export const EmployeeDocumentPortal = () => {
  const { token } = useParams<{ token: string }>();
  const db = getFirestore();

  const [link, setLink] = useState<EmployeeDocumentLink | null | undefined>(undefined);
  const [employee, setEmployee] = useState<EmployeeRow | null | undefined>(undefined);
  const documentTypeOptions = useDocumentTypeCatalog();

  const [docType, setDocType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLink(null);
      return;
    }
    const ref = doc(db, "CMG-HR-Database", "root", EMPLOYEE_DOCUMENT_LINKS_COLLECTION, token);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLink(null);
          return;
        }
        setLink({ id: snap.id, ...(snap.data() as object) } as EmployeeDocumentLink);
      },
      () => setLink(null)
    );
    return () => unsub();
  }, [db, token]);

  useEffect(() => {
    if (!link?.employeeId) return;
    const ref = doc(db, "CMG-HR-Database", "root", "employee_data", link.employeeId);
    const unsub = onSnapshot(ref, (snap) => {
      setEmployee(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as EmployeeRow) : null);
    });
    return () => unsub();
  }, [db, link?.employeeId]);

  const requestedTypes = useMemo(() => link?.requestedDocTypes || [], [link]);
  const haveTypes = useMemo(
    () => new Set((employee?.attachments || []).map((a) => String(a?.docType || "").trim())),
    [employee]
  );
  const missingTypes = useMemo(
    () => requestedTypes.filter((t) => !haveTypes.has(t)),
    [requestedTypes, haveTypes]
  );

  useEffect(() => {
    // ตั้งค่า default ของ dropdown ประเภทเอกสารที่จะแนบ: เอาตัวที่ยังขาดก่อน ถ้าครบหมดแล้วค่อย fallback ไปตัวแรกของ catalog
    if (docType) return;
    if (missingTypes.length > 0) {
      setDocType(missingTypes[0]);
    } else if (documentTypeOptions.length > 0) {
      setDocType(documentTypeOptions[0].value);
    }
  }, [missingTypes, documentTypeOptions, docType]);

  const handleUpload = async () => {
    if (!file || !employee || !link) return;
    const empCode = employee.รหัสพนักงาน || employee.id;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadHiringDocumentFile(file, {
        candidateName: buildFullName(employee),
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

  if (link === undefined || (link && employee === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (link === null || employee === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 p-6 text-center">
        <AlertTriangle className="text-amber-500" size={36} />
        <p className="text-gray-700 font-semibold">ไม่พบลิงก์นี้ในระบบ</p>
        <p className="text-sm text-gray-500">กรุณาตรวจสอบลิงก์อีกครั้ง หรือติดต่อ HR เพื่อขอลิงก์ใหม่</p>
      </div>
    );
  }

  const allComplete = requestedTypes.length > 0 && missingTypes.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-8">
      <div className="max-w-lg mx-auto flex flex-col gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserCircle2 className="text-blue-600" size={22} />
            แนบเอกสารของฉัน
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {buildFullName(employee!)} <span className="text-xs text-gray-400">({employee!.รหัสพนักงาน || employee!.id})</span>
          </p>
          {employee!.ตำแหน่ง && <p className="text-xs text-gray-400 mt-0.5">{employee!.ตำแหน่ง} {employee!.แผนก ? `• ${employee!.แผนก}` : ""}</p>}

          {requestedTypes.length > 0 && (
            <div className={`mt-3 border rounded-lg p-3 text-xs ${allComplete ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <p className="font-semibold mb-1">
                {allComplete ? "แนบเอกสารครบแล้ว ขอบคุณค่ะ/ครับ" : `เอกสารที่ HR ขอให้แนบเพิ่ม (ขาดอีก ${missingTypes.length} รายการ):`}
              </p>
              <ul className="list-none space-y-1">
                {requestedTypes.map((t) => {
                  const label = documentTypeOptions.find((o) => o.value === t)?.label || t;
                  const done = haveTypes.has(t);
                  return (
                    <li key={t} className="flex items-center gap-1.5">
                      {done ? (
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      ) : (
                        <span className="inline-block w-[13px] h-[13px] rounded-full border border-amber-400 shrink-0" />
                      )}
                      <span className={done ? "line-through text-gray-400" : ""}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {link!.note && (
            <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
              <p className="font-semibold mb-0.5">ข้อความจาก HR:</p>
              <p>{link!.note}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">เอกสารที่แนบไว้แล้ว</h2>
          {(employee!.attachments || []).length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีเอกสารแนบ</p>
          ) : (
            <ul className="flex flex-col gap-1.5 mb-4">
              {(employee!.attachments || []).map((a, idx) => (
                <li key={`${a.url}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-200">
                  <span className="flex items-center gap-1.5 text-gray-600 truncate">
                    <Paperclip size={12} /> {a.name}{" "}
                    <span className="text-gray-400">({documentTypeOptions.find((o) => o.value === a.docType)?.label || a.docType})</span>
                  </span>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline shrink-0">เปิดไฟล์</a>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t pt-3 flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-gray-500">แนบไฟล์เพิ่ม</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input !w-auto">
                {documentTypeOptions.map((o) => (
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
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </div>

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; background: white; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};
