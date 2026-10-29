import React, { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import { AlertTriangle, FileUp, Inbox, Loader2, Paperclip, Search, X } from "lucide-react";
import {
  appendAttachmentToEmployee,
  uploadHiringDocumentFile,
} from "../utils/hiringDocsAttachments";
import { HIRING_DOC_TYPE_OPTIONS, HiringAttachment } from "./recruitmentIntakeConfig";

// path ที่หน้านี้อ่านแบบ realtime: CMG-HR-Database/root/employee_data (ใช้ร่วมกับหน้าพนักงานหลักทุกกลุ่ม)
const FIRESTORE_PATH = "CMG-HR-Database/root/employee_data";

// key เดียวกับที่ปุ่ม "เอกสารแนบ" ในตารางพนักงานหลัก (App.tsx) ใช้ส่ง รหัสพนักงาน มาเปิดอัตโนมัติที่นี่
export const OPEN_EMPLOYEE_DOCUMENTS_STORAGE_KEY = "cmg_open_employee_documents_code";

interface EmployeeRecord {
  id: string;
  รหัสพนักงาน?: string;
  ชื่อต้น?: string;
  คำนำหน้าชื่อ?: string;
  ชื่อตัว?: string;
  ชื่อสกุล?: string;
  ตำแหน่ง?: string;
  แผนก?: string;
  โครงการ?: string;
  employee_type?: string;
  สถานะพนักงาน?: string;
  attachments?: HiringAttachment[];
  [key: string]: unknown;
}

const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  Indirect: "Staff Monthly",
  Direct_TeamLeader: "DC Daily",
  Direct_SupplyDC: "Supply manpower",
  Direct_SubContractor: "Sub contractor",
};

const INACTIVE_STATUSES = ["ลาออก", "เลิกจ้าง"];

const buildFullName = (e: EmployeeRecord): string =>
  [e.ชื่อต้น || e.คำนำหน้าชื่อ, e.ชื่อตัว, e.ชื่อสกุล]
    .map((p) => (p || "").toString().trim())
    .filter(Boolean)
    .join(" ") || e.id;

export const EmployeeDocumentsPage = () => {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [docsTarget, setDocsTarget] = useState<EmployeeRecord | null>(null);
  const [docType, setDocType] = useState<string>(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const db = getFirestore();
    const colRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) } as EmployeeRecord))
          .filter((e) => e.id !== "_schema_metadata");
        setEmployees(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[EmployeeDocumentsPage] Firestore read failed at path "${FIRESTORE_PATH}":`, err);
        setError(`อ่านข้อมูลจาก ${FIRESTORE_PATH} ไม่สำเร็จ: ${err.message}`);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // รองรับการกระโดดมาจากปุ่ม "เอกสารแนบ" ในตารางพนักงานหลัก (เปิด panel ของคนนั้นอัตโนมัติ)
  useEffect(() => {
    if (loading || employees.length === 0) return;
    const code = sessionStorage.getItem(OPEN_EMPLOYEE_DOCUMENTS_STORAGE_KEY);
    if (!code) return;
    const target = employees.find((e) => (e.รหัสพนักงาน || e.id) === code);
    if (target) {
      setDocsTarget(target);
      setDocType(HIRING_DOC_TYPE_OPTIONS[0]?.value || "");
      setDocFile(null);
      setDocsError(null);
    }
    sessionStorage.removeItem(OPEN_EMPLOYEE_DOCUMENTS_STORAGE_KEY);
  }, [loading, employees]);

  // sync docsTarget กับข้อมูลล่าสุดแบบ realtime (เห็น attachments ใหม่ทันทีหลังอัปโหลดสำเร็จ)
  useEffect(() => {
    if (!docsTarget) return;
    const fresh = employees.find((e) => e.id === docsTarget.id);
    if (fresh && fresh !== docsTarget) setDocsTarget(fresh);
  }, [employees, docsTarget]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return employees
      .filter((e) => (showInactive ? true : !INACTIVE_STATUSES.includes(String(e.สถานะพนักงาน || ""))))
      .filter((e) => (typeFilter === "all" ? true : e.employee_type === typeFilter))
      .filter((e) => {
        if (!kw) return true;
        return (
          buildFullName(e).toLowerCase().includes(kw) ||
          (e.รหัสพนักงาน || e.id || "").toLowerCase().includes(kw) ||
          (e.ตำแหน่ง || "").toLowerCase().includes(kw) ||
          (e.โครงการ || "").toLowerCase().includes(kw)
        );
      });
  }, [employees, search, typeFilter, showInactive]);

  const openDocsPanel = (e: EmployeeRecord) => {
    setDocsTarget(e);
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
    const empCode = docsTarget.รหัสพนักงาน || docsTarget.id;
    setUploading(true);
    setDocsError(null);
    try {
      const uploadResult = await uploadHiringDocumentFile(docFile, {
        candidateName: buildFullName(docsTarget),
        position: docsTarget.ตำแหน่ง || "",
        // พนักงานกลุ่มนี้ไม่ได้มาจาก Recruitment จึงไม่มี candidateKey เดิมให้ใช้ -> ใช้รหัสพนักงาน
        // เป็น key แทน (สร้างโฟลเดอร์ใหม่ของคนนี้ใน Drive ครั้งแรกที่อัปโหลด)
        candidateKey: empCode,
        docType: docType || "other",
      });

      const attachment: HiringAttachment = {
        docType: docType || "other",
        name: uploadResult.fileName || docFile.name,
        url: uploadResult.url,
        uploadedAt: new Date().toISOString(),
      };

      await appendAttachmentToEmployee(empCode, attachment);
      setDocFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด";
      console.error(`[EmployeeDocumentsPage] Upload document failed for employee "${empCode}":`, err);
      setDocsError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full">
      <div>
        <h2 className="text-lg font-bold text-gray-800">เอกสารพนักงาน</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          เก็บเอกสารรายคนของพนักงานทุกกลุ่ม (ที่ไม่ได้มาจากระบบ Recruitment หรือเพิ่มเอกสารเพิ่มเติมภายหลัง)
          ไฟล์เก็บผ่าน Apps Script → Google Drive ตัวเดียวกับระบบ Recruitment
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสพนักงาน / ตำแหน่ง / โครงการ..."
            className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg text-sm px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">ทุกประเภท</option>
          {Object.entries(EMPLOYEE_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงพ้นสภาพด้วย
        </label>
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
            <p className="text-sm">ไม่พบรายการที่ตรงกับเงื่อนไข</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัสพนักงาน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อเต็ม</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">แผนก</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โครงการ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ประเภท</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะ</th>
                <th className="p-3 text-center font-semibold text-gray-600 border-b whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => {
                const count = (e.attachments || []).length;
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-700 font-mono whitespace-nowrap">{e.รหัสพนักงาน || e.id}</td>
                    <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildFullName(e)}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{e.ตำแหน่ง || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{e.แผนก || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{e.โครงการ || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{EMPLOYEE_TYPE_LABEL[e.employee_type || ""] || e.employee_type || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{e.สถานะพนักงาน || "-"}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => openDocsPanel(e)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          count > 0 ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        <Paperclip size={14} /> เอกสารแนบ ({count})
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
                  รหัสพนักงาน: {docsTarget.รหัสพนักงาน || docsTarget.id}
                </p>
              </div>
              <button onClick={closeDocsPanel} className="text-gray-400 hover:text-red-500 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1 flex flex-col gap-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2">เอกสารที่มีอยู่แล้ว</h4>
                {(docsTarget.attachments || []).length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีเอกสารแนบ</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(docsTarget.attachments || []).map((a, idx) => (
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
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">ประเภทเอกสาร</span>
                    <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100">
                      {HIRING_DOC_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                      <option value="other">อื่น ๆ (พิมพ์เอง)</option>
                    </select>
                  </label>
                  {docType === "other" && (
                    <input
                      placeholder="พิมพ์ชื่อประเภทเอกสาร"
                      onChange={(e) => setDocType(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                  <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="text-sm" />
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
    </div>
  );
};
