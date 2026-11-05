import React, { useMemo, useRef, useState } from "react";
import { getFirestore } from "firebase/firestore";
import { Download, Eye, FileText, FileUp, ImagePlus, Loader2, Plus, Table2, Trash2, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  ANNOUNCEMENT_CATEGORIES,
  AnnouncementCategoryCode,
  AnnouncementDraftInput,
  AnnouncementRecord,
  AnnouncementTable,
  announcementCategoryLabel,
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  markAnnouncementIssued,
  updateAnnouncementDraft,
  useAnnouncements,
} from "./announcementConfig";
import { ANNOUNCEMENT_CATEGORY_PREFIX, getNextAnnouncementDocumentNumber } from "../utils/documentNumbering";
import {
  downloadAnnouncementPdf,
  generateAnnouncementPdf,
  openPdfInNewTab,
  removeAnnouncementAttachment,
  uploadAnnouncementAttachment,
  uploadAnnouncementPdf,
} from "../utils/announcementDocument";

const emptyForm = (): AnnouncementDraftInput => ({
  categoryCode: "general",
  title: "",
  salutation: "เรียน พนักงานทุกท่าน",
  bodyParagraphs: [""],
  table: null,
  attachments: [],
  closingNote: "",
  signerName: "",
  signerTitle: "",
  effectiveDate: "",
  createdByUid: "",
  createdByName: "",
});

const EMPTY_TABLE: AnnouncementTable = { headers: ["หัวข้อ 1", "หัวข้อ 2"], rows: [{ cells: ["", ""] }] };

/** แปลงข้อมูลดิบเป็นโครงสร้างตาราง (แถวแรก = หัวคอลัมน์) ใช้ร่วมกันทั้งตอนวางจาก Excel/Google Sheet และนำเข้าไฟล์ */
const rowsToTable = (rows: string[][]): AnnouncementTable | null => {
  const nonEmpty = rows.map((r) => r.map((c) => (c ?? "").toString().trim())).filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length === 0) return null;
  const colCount = Math.max(...nonEmpty.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(Math.max(0, colCount - r.length)).fill("")];
  const [headerRow, ...dataRows] = nonEmpty;
  return { headers: pad(headerRow), rows: dataRows.map((r) => ({ cells: pad(r) })) };
};

/** วางจาก Excel/Google Sheet (คัดลอกเซลล์มาวาง) — clipboard จะเป็นค่าคั่นด้วย Tab ระหว่างคอลัมน์ */
const parseClipboardTable = (text: string): AnnouncementTable | null => {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;
  const rows = lines.map((line) => line.split("\t"));
  return rowsToTable(rows);
};

/** ตัดบรรทัด CSV ออกเป็นช่องๆ รองรับกรณีเซลล์ครอบด้วย "..." (ซึ่งอาจมีจุลภาค/ขึ้นบรรทัดใหม่อยู่ข้างในได้) */
const parseCsvText = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"' && normalized[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
};

/**
 * นำเข้าไฟล์ CSV — ไฟล์ที่ export ได้จากทั้ง Excel (Save As → CSV) และ Google Sheet
 * (File → Download → Comma Separated Values) ใช้ไฟล์เดียวกันนี้ได้ทั้งคู่
 */
const parseTableFile = (file: File): Promise<AnnouncementTable | null> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== "string") return resolve(null);
        resolve(rowsToTable(parseCsvText(text)));
      } catch {
        reject(new Error("ไฟล์ไม่ถูกต้อง หรือไม่ใช่ไฟล์ CSV"));
      }
    };
    reader.readAsText(file, "utf-8");
  });

const formatDateTime = (ms?: number): string => {
  if (!ms) return "-";
  const d = new Date(ms);
  return d.toLocaleString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const STATUS_BADGE: Record<AnnouncementRecord["status"], string> = {
  draft: "bg-amber-100 text-amber-800",
  issued: "bg-emerald-100 text-emerald-800",
};

export const AnnouncementsPage = () => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();
  const announcements = useAnnouncements();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string>("");
  const [form, setForm] = useState<AnnouncementDraftInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const currentUserName = useMemo(
    () => `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() || firebaseUser?.email || "",
    [userProfile, firebaseUser]
  );

  const openNewForm = () => {
    setEditingId(null);
    setDraftKey(`new-${Date.now()}`);
    setForm({
      ...emptyForm(),
      signerName: currentUserName,
      signerTitle: userProfile?.position || "",
      effectiveDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (record: AnnouncementRecord) => {
    setEditingId(record.id);
    setDraftKey(record.id);
    setForm({
      categoryCode: record.categoryCode,
      title: record.title,
      salutation: record.salutation,
      bodyParagraphs: record.bodyParagraphs.length ? record.bodyParagraphs : [""],
      table: record.table || null,
      attachments: record.attachments || [],
      closingNote: record.closingNote || "",
      signerName: record.signerName,
      signerTitle: record.signerTitle,
      effectiveDate: record.effectiveDate || "",
      createdByUid: record.createdByUid,
      createdByName: record.createdByName,
    });
    setError(null);
    setShowForm(true);
  };

  const buildRecordForPreview = (): AnnouncementRecord => ({
    id: editingId || "preview",
    ...form,
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const validate = (): string | null => {
    if (!form.title.trim()) return "กรุณาระบุหัวเรื่องประกาศ";
    if (!form.bodyParagraphs.some((p) => p.trim())) return "กรุณาระบุเนื้อหาประกาศอย่างน้อย 1 ย่อหน้า";
    if (!form.signerName.trim()) return "กรุณาระบุชื่อผู้ลงนาม";
    return null;
  };

  const handlePreview = async () => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    try {
      const bytes = await generateAnnouncementPdf(buildRecordForPreview(), { isDraft: true });
      openPdfInNewTab(bytes);
    } catch (e: any) {
      setError(e?.message || "สร้างตัวอย่างไม่สำเร็จ");
    }
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setSaving(true);
    try {
      const payload: AnnouncementDraftInput = {
        ...form,
        createdByUid: editingId ? form.createdByUid : firebaseUser?.uid || "",
        createdByName: editingId ? form.createdByName : currentUserName,
      };
      if (editingId) {
        await updateAnnouncementDraft(editingId, payload);
      } else {
        await createAnnouncementDraft(payload);
      }
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message || "บันทึกร่างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: AnnouncementRecord) => {
    if (record.status === "issued") return;
    if (!window.confirm(`ลบร่างประกาศ "${record.title}" ?`)) return;
    await deleteAnnouncementDraft(record.id);
  };

  /** กดออกประกาศจริง: ขอเลขที่เอกสาร -> สร้าง PDF -> อัปโหลดเก็บ -> บันทึกผล -> ดาวน์โหลดให้ผู้ใช้ */
  const handleIssue = async (record: AnnouncementRecord) => {
    if (record.status === "issued") {
      const bytes = await generateAnnouncementPdf(record, { documentNumber: record.documentNumber });
      openPdfInNewTab(bytes);
      return;
    }
    if (!window.confirm(`ยืนยันออกประกาศ "${record.title}" ? ระบบจะออกเลขที่เอกสารถาวรและไม่สามารถแก้ไขเนื้อหาซ้ำได้`)) return;
    setIssuingId(record.id);
    setError(null);
    try {
      const documentNumber = await getNextAnnouncementDocumentNumber(db, record.categoryCode);
      const bytes = await generateAnnouncementPdf(record, { documentNumber });
      let pdfUrl: string | undefined;
      try {
        pdfUrl = await uploadAnnouncementPdf(bytes, documentNumber);
      } catch {
        // อัปโหลดเก็บถาวรไม่สำเร็จ (เช่นสิทธิ์ storage) — ยังออกเอกสาร/ดาวน์โหลดให้ผู้ใช้ได้ตามปกติ
      }
      await markAnnouncementIssued(record.id, {
        documentNumber,
        pdfUrl,
        issuedByUid: firebaseUser?.uid || "",
        issuedByName: currentUserName,
      });
      await downloadAnnouncementPdf(record, { documentNumber });
    } catch (e: any) {
      setError(e?.message || "ออกประกาศไม่สำเร็จ");
    } finally {
      setIssuingId(null);
    }
  };

  const updateParagraph = (index: number, value: string) => {
    setForm((f) => {
      const next = [...f.bodyParagraphs];
      next[index] = value;
      return { ...f, bodyParagraphs: next };
    });
  };

  const addParagraph = () => setForm((f) => ({ ...f, bodyParagraphs: [...f.bodyParagraphs, ""] }));
  const removeParagraph = (index: number) =>
    setForm((f) => ({ ...f, bodyParagraphs: f.bodyParagraphs.filter((_, i) => i !== index) }));

  // --- ตารางประกอบ: เพิ่ม/ลบแถว-คอลัมน์ด้วยปุ่ม หรือวาง/นำเข้าจาก Excel-Google Sheet ---
  const enableTable = () => setForm((f) => ({ ...f, table: EMPTY_TABLE }));
  const disableTable = () => setForm((f) => ({ ...f, table: null }));

  const updateHeaderCell = (colIndex: number, value: string) =>
    setForm((f) => {
      if (!f.table) return f;
      const headers = [...f.table.headers];
      headers[colIndex] = value;
      return { ...f, table: { ...f.table, headers } };
    });

  const updateBodyCell = (rowIndex: number, colIndex: number, value: string) =>
    setForm((f) => {
      if (!f.table) return f;
      const rows = f.table.rows.map((r, i) => {
        if (i !== rowIndex) return r;
        const cells = [...r.cells];
        cells[colIndex] = value;
        return { cells };
      });
      return { ...f, table: { ...f.table, rows } };
    });

  const addTableRow = () =>
    setForm((f) => {
      if (!f.table) return f;
      return { ...f, table: { ...f.table, rows: [...f.table.rows, { cells: f.table.headers.map(() => "") }] } };
    });

  const removeTableRow = (rowIndex: number) =>
    setForm((f) => {
      if (!f.table) return f;
      return { ...f, table: { ...f.table, rows: f.table.rows.filter((_, i) => i !== rowIndex) } };
    });

  const addTableColumn = () =>
    setForm((f) => {
      if (!f.table) return f;
      return {
        ...f,
        table: {
          headers: [...f.table.headers, `หัวข้อ ${f.table.headers.length + 1}`],
          rows: f.table.rows.map((r) => ({ cells: [...r.cells, ""] })),
        },
      };
    });

  const removeTableColumn = (colIndex: number) =>
    setForm((f) => {
      if (!f.table || f.table.headers.length <= 1) return f;
      return {
        ...f,
        table: {
          headers: f.table.headers.filter((_, i) => i !== colIndex),
          rows: f.table.rows.map((r) => ({ cells: r.cells.filter((_, i) => i !== colIndex) })),
        },
      };
    });

  /** วางเซลล์ที่คัดลอกมาจาก Excel/Google Sheet ลงในตารางได้เลย (แทนที่ตารางปัจจุบันด้วยข้อมูลที่วาง) */
  const handleTablePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !text.includes("\t")) return; // ปล่อยให้พฤติกรรมวางข้อความปกติทำงานถ้าไม่ใช่ตารางจริง (ไม่มี tab คั่น)
    e.preventDefault();
    const parsed = parseClipboardTable(text);
    if (parsed) setForm((f) => ({ ...f, table: parsed }));
  };

  const handleTableFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = await parseTableFile(file);
      if (!parsed) return setError("ไม่พบข้อมูลในไฟล์ที่เลือก");
      setForm((f) => ({ ...f, table: parsed }));
      setError(null);
    } catch (err: any) {
      setError(err?.message || "นำเข้าไฟล์ไม่สำเร็จ");
    }
  };

  // --- รูปภาพประกอบ ---
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingAttachment(true);
    setError(null);
    try {
      const urls = await Promise.all(files.map((file) => uploadAnnouncementAttachment(draftKey || "temp", file)));
      setForm((f) => ({ ...f, attachments: [...(f.attachments || []), ...urls] }));
    } catch (err: any) {
      setError(err?.message || "แนบรูปภาพไม่สำเร็จ");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (url: string) => {
    setForm((f) => ({ ...f, attachments: (f.attachments || []).filter((u) => u !== url) }));
    await removeAnnouncementAttachment(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" /> ประกาศภายในบริษัท
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            สร้าง/บันทึกประกาศ และออกเลขที่เอกสารอัตโนมัติ แยกตามหมวดหมู่ (รูปแบบ AN-HR-&lt;หมวด&gt;-ลำดับ/ปี พ.ศ.)
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
        >
          <Plus size={16} /> สร้างประกาศใหม่
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">เลขที่เอกสาร</th>
              <th className="px-3 py-2 text-left">หมวดหมู่</th>
              <th className="px-3 py-2 text-left">เรื่อง</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ออกโดย / วันที่</th>
              <th className="px-3 py-2 text-right">การทำงาน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {announcements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                  ยังไม่มีประกาศในระบบ
                </td>
              </tr>
            )}
            {announcements.map((record) => (
              <tr key={record.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{record.documentNumber || "-"}</td>
                <td className="px-3 py-2 text-gray-700">
                  {announcementCategoryLabel(record.categoryCode)}{" "}
                  <span className="text-[10px] font-mono text-gray-400">
                    ({ANNOUNCEMENT_CATEGORY_PREFIX[record.categoryCode]?.split("-").pop() || "OTH"})
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-800 font-medium">{record.title}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[record.status]}`}>
                    {record.status === "issued" ? "ออกประกาศแล้ว" : "ร่าง"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {record.status === "issued"
                    ? `${record.issuedByName || "-"} • ${formatDateTime(record.issuedAt)}`
                    : `${record.createdByName || "-"} • ${formatDateTime(record.createdAt)}`}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    {record.status === "draft" && (
                      <button
                        onClick={() => openEditForm(record)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        title="แก้ไขร่าง"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleIssue(record)}
                      disabled={issuingId === record.id}
                      className={`p-1.5 rounded-md ${
                        record.status === "issued"
                          ? "text-emerald-600 hover:bg-emerald-50"
                          : "text-blue-600 hover:bg-blue-50"
                      }`}
                      title={record.status === "issued" ? "ดาวน์โหลด/เปิดดู" : "ออกประกาศ (ขอเลขที่เอกสาร)"}
                    >
                      {issuingId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                    {record.status === "draft" && (
                      <button
                        onClick={() => handleDelete(record)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="ลบร่าง"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-800">{editingId ? "แก้ไขร่างประกาศ" : "สร้างประกาศใหม่"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">หมวดหมู่ประกาศ</label>
                <select
                  value={form.categoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value as AnnouncementCategoryCode }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {ANNOUNCEMENT_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label} ({ANNOUNCEMENT_CATEGORY_PREFIX[c.code]?.split("-").pop() || "OTH"})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {ANNOUNCEMENT_CATEGORIES.find((c) => c.code === form.categoryCode)?.description}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  ตัวอย่างเลขที่เอกสารของหมวดนี้:{" "}
                  <span className="font-mono font-medium text-gray-700">
                    {ANNOUNCEMENT_CATEGORY_PREFIX[form.categoryCode] || ANNOUNCEMENT_CATEGORY_PREFIX.other}-XXX/
                    {new Date().getFullYear() + 543}
                  </span>{" "}
                  (ลำดับ XXX ออกอัตโนมัติ แยกนับต่อเนื่องเฉพาะหมวดนี้ เริ่ม 001 ใหม่ทุกต้นปี)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">หัวเรื่องประกาศ</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="เช่น ประกาศวันหยุดตามประเพณี ประจำปี 2570"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">เรียน</label>
                <input
                  value={form.salutation}
                  onChange={(e) => setForm((f) => ({ ...f, salutation: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">เนื้อหาประกาศ (แต่ละช่อง = 1 ย่อหน้า)</label>
                  <button onClick={addParagraph} className="text-xs text-blue-600 hover:underline">
                    + เพิ่มย่อหน้า
                  </button>
                </div>
                <div className="space-y-2">
                  {form.bodyParagraphs.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <textarea
                        value={p}
                        onChange={(e) => updateParagraph(i, e.target.value)}
                        rows={2}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      {form.bodyParagraphs.length > 1 && (
                        <button onClick={() => removeParagraph(i)} className="p-2 text-gray-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                    <Table2 size={14} /> ตารางประกอบ (เช่น ตารางวันหยุด)
                  </label>
                  {!form.table ? (
                    <button onClick={enableTable} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Plus size={12} /> เพิ่มตาราง
                    </button>
                  ) : (
                    <button onClick={disableTable} className="text-xs text-red-500 hover:underline">
                      ลบตาราง
                    </button>
                  )}
                </div>

                {form.table && (
                  <div className="border border-gray-200 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => tableFileInputRef.current?.click()}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <FileUp size={13} /> นำเข้าจากไฟล์ CSV
                      </button>
                      <input
                        ref={tableFileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleTableFileImport}
                      />
                      <span className="text-[11px] text-gray-400">
                        (Excel: Save As → CSV, Google Sheet: File → Download → CSV) หรือคัดลอกเซลล์มาวาง (Ctrl+V) ในตารางด้านล่างได้โดยตรง
                      </span>
                    </div>

                    <div className="overflow-x-auto" onPaste={handleTablePaste}>
                      <table className="min-w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            {form.table.headers.map((h, colIndex) => (
                              <th key={colIndex} className="border border-gray-200 p-0">
                                <div className="flex items-center">
                                  <input
                                    value={h}
                                    onChange={(e) => updateHeaderCell(colIndex, e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs font-semibold bg-gray-50 outline-none min-w-[90px]"
                                  />
                                  {form.table!.headers.length > 1 && (
                                    <button
                                      onClick={() => removeTableColumn(colIndex)}
                                      className="px-1 text-gray-300 hover:text-red-600"
                                      title="ลบคอลัมน์นี้"
                                    >
                                      <X size={11} />
                                    </button>
                                  )}
                                </div>
                              </th>
                            ))}
                            <th className="border border-gray-200 p-1 w-8">
                              <button onClick={addTableColumn} className="text-blue-600 hover:text-blue-800" title="เพิ่มคอลัมน์">
                                <Plus size={13} />
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.table.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.cells.map((cell, colIndex) => (
                                <td key={colIndex} className="border border-gray-200 p-0">
                                  <input
                                    value={cell}
                                    onChange={(e) => updateBodyCell(rowIndex, colIndex, e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs outline-none min-w-[90px]"
                                  />
                                </td>
                              ))}
                              <td className="border border-gray-200 p-1 text-center">
                                <button
                                  onClick={() => removeTableRow(rowIndex)}
                                  className="text-gray-300 hover:text-red-600"
                                  title="ลบแถวนี้"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button onClick={addTableRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Plus size={12} /> เพิ่มแถว
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                    <ImagePlus size={14} /> รูปภาพประกอบ
                  </label>
                  <button
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={uploadingAttachment}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-60"
                  >
                    {uploadingAttachment ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} แนบรูปภาพ
                  </button>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAttachmentUpload}
                  />
                </div>
                {(form.attachments || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(form.attachments || []).map((url) => (
                      <div key={url} className="relative w-20 h-20 rounded-md overflow-hidden border border-gray-200 group">
                        <img src={url} alt="แนบ" className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveAttachment(url)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                          title="ลบรูปนี้"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">รูปที่แนบจะถูกแปะเป็นหน้าต่อท้ายเอกสาร PDF ให้อัตโนมัติ</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ/คำปิดท้าย (ถ้ามี)</label>
                <textarea
                  value={form.closingNote}
                  onChange={(e) => setForm((f) => ({ ...f, closingNote: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ประกาศมีผล</label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อผู้ลงนาม</label>
                  <input
                    value={form.signerName}
                    onChange={(e) => setForm((f) => ({ ...f, signerName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ตำแหน่งผู้ลงนาม</label>
                  <input
                    value={form.signerTitle}
                    onChange={(e) => setForm((f) => ({ ...f, signerTitle: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={handlePreview}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Eye size={14} /> พรีวิว
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} บันทึกร่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
