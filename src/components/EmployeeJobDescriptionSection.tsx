import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, query, where } from "firebase/firestore";
import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";
import { AlertTriangle, Bot, ClipboardList, Download, FileEdit, Link2, Loader2, ShieldAlert } from "lucide-react";
import {
  buildEmployeeJobDescriptionDocId,
  JOB_DESCRIPTIONS_COLLECTION,
  JobDescription,
  migrateResponsibilityStakeholders,
  RACI_CHIP_CLASS,
  resolveEmployeeHiringPacketId,
  sortStakeholderEntries,
} from "./jobDescriptionConfig";
import { EmployeeJobDescriptionForm } from "./EmployeeJobDescriptionForm";

interface EmployeeLike {
  id: string;
  รหัสพนักงาน?: string;
  recruitmentSourceId?: string;
  hiringPacketId?: string;
}

// แปลง Firestore Timestamp หรือ millis เป็นข้อความวันที่อ่านง่าย — ไม่ import firebase/firestore Timestamp
// ตรงๆ เพราะค่านี้อาจมาจากทั้ง client Timestamp และ serverTimestamp placeholder ระหว่างรอ sync
const formatWhen = (value: unknown): string => {
  if (!value) return "-";
  const anyValue = value as { toDate?: () => Date; seconds?: number };
  const d = typeof anyValue?.toDate === "function" ? anyValue.toDate() : new Date(anyValue as number);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  const anyValue = value as { toDate?: () => Date; seconds?: number };
  if (typeof anyValue?.toDate === "function") return anyValue.toDate().getTime();
  if (typeof anyValue?.seconds === "number") return anyValue.seconds * 1000;
  const d = new Date(value as number);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

export const EmployeeJobDescriptionSection: React.FC<{ employee: EmployeeLike }> = ({ employee }) => {
  const empCode = employee.รหัสพนักงาน || employee.id;
  const hiringPacketKey = resolveEmployeeHiringPacketId(employee);

  const [packetDoc, setPacketDoc] = useState<JobDescription | null>(null);
  const [employeeDoc, setEmployeeDoc] = useState<JobDescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const db = getFirestore();
    const unsubs: Array<() => void> = [];

    // เอกสารที่ฝั่ง Data สร้าง/แก้เอง (ถ้ามี)
    unsubs.push(
      onSnapshot(
        doc(db, "CMG-HR-Database", "root", JOB_DESCRIPTIONS_COLLECTION, buildEmployeeJobDescriptionDocId(empCode)),
        (snap) => {
          setEmployeeDoc(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as JobDescription) : null);
          setLoading(false);
        },
        (err) => {
          console.error("[EmployeeJobDescriptionSection] อ่าน employee: doc ไม่สำเร็จ:", err);
          setError(err.message);
          setLoading(false);
        }
      )
    );

    // เอกสารที่มาจากระบบสรรหา (ถ้าพนักงานคนนี้เคยผ่าน pipeline สรรหา)
    if (hiringPacketKey) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "CMG-HR-Database", "root", JOB_DESCRIPTIONS_COLLECTION),
            where("hiringPacketId", "==", hiringPacketKey)
          ),
          (snap) => {
            const found = snap.docs[0];
            setPacketDoc(found ? ({ id: found.id, ...(found.data() as object) } as JobDescription) : null);
          },
          (err) => {
            console.error("[EmployeeJobDescriptionSection] query hiringPacketId ไม่สำเร็จ:", err);
          }
        )
      );
    } else {
      setPacketDoc(null);
    }

    return () => unsubs.forEach((u) => u());
  }, [empCode, hiringPacketKey]);

  // ถ้ามีทั้งสองแหล่ง (กรณีหายาก) ให้ยึดจากระบบสรรหาเป็นหลักในการแสดงผล — ฟอร์มแก้ไขจะเขียนทับที่ doc นี้ตรงๆ
  const activeDoc = packetDoc || employeeDoc;

  const showConflictBanner = useMemo(() => {
    if (!activeDoc?.syncedAt || !activeDoc?.dataTeamEditedAt) return false;
    return toMillis(activeDoc.syncedAt) > toMillis(activeDoc.dataTeamEditedAt);
  }, [activeDoc]);

  // ดาวน์โหลด JD ที่แสดงอยู่เป็น PDF (แคปหน้าจอ section นี้ -> ฝัง PNG ลง PDF หน้าเดียว)
  // ใช้แพทเทิร์นเดียวกับ handleExportPdf ใน OvertimePage.tsx (html2canvas + pdf-lib)
  const handleDownloadPdf = async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(bytes);
      const maxPageWidthPt = 1600;
      const scale = Math.min(1, maxPageWidthPt / pngImage.width);
      const pageWidth = pngImage.width * scale;
      const pageHeight = pngImage.height * scale;
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(pngImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = (activeDoc?.jobTitle || "JD").toString().replace(/[^\w\u0E00-\u0E7F]+/g, "_").slice(0, 40);
      link.href = url;
      link.download = `JD-${empCode}-${safeName}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error("[EmployeeJobDescriptionSection] ส่งออก PDF ไม่สำเร็จ:", err);
      window.alert("ดาวน์โหลด JD ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
          <ClipboardList size={13} className="text-indigo-600" /> ใบพรรณนางาน (JD) / Job Matrix / Skill Matrix
        </h4>
        <div className="flex items-center gap-3">
          {activeDoc && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:underline disabled:opacity-50"
            >
              {exporting ? <Loader2 className="animate-spin" size={13} /> : <Download size={13} />} ดาวน์โหลด JD
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
          >
            <FileEdit size={13} /> {activeDoc ? "แก้ไข JD" : "เพิ่ม JD"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
          <Loader2 className="animate-spin" size={14} /> กำลังโหลดข้อมูล JD...
        </div>
      ) : error ? (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
      ) : !activeDoc ? (
        <p className="text-sm text-gray-400">ยังไม่มีข้อมูล JD สำหรับพนักงานคนนี้</p>
      ) : (
        <div ref={exportRef} className="flex flex-col gap-3 bg-white p-3 rounded-lg">
          {showConflictBanner && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>
                ระบบสรรหาซิงค์ข้อมูลใหม่ล่าสุดเมื่อ {formatWhen(activeDoc.syncedAt)} ซึ่งใหม่กว่าครั้งล่าสุดที่ทีม
                Data เคยแก้ไข ({formatWhen(activeDoc.dataTeamEditedAt)}) — ควรตรวจสอบว่าข้อมูลที่เคยแก้ไว้ยังอยู่ครบไหม
              </span>
            </div>
          )}

          <div className="text-xs text-gray-400">
            {`อัปเดตล่าสุดจากระบบสรรหา: ${formatWhen(activeDoc.syncedAt)}` +
              (activeDoc.dataTeamEditedAt
                ? ` · แก้ไขล่าสุดโดยทีม Data: ${formatWhen(activeDoc.dataTeamEditedAt)}`
                : "")}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm bg-gray-50 rounded-lg p-3">
            <div><span className="text-gray-400">ตำแหน่ง:</span> {activeDoc.jobTitle || "-"}</div>
            <div><span className="text-gray-400">รหัสตำแหน่ง:</span> {activeDoc.jobCode || "-"}</div>
            <div><span className="text-gray-400">แผนก:</span> {activeDoc.department || "-"}</div>
            <div><span className="text-gray-400">ระดับ:</span> {activeDoc.jobLevel || "-"}</div>
            <div className="col-span-2"><span className="text-gray-400">รายงานต่อ:</span> {activeDoc.reportsTo || "-"}</div>
          </div>

          {activeDoc.jobPurpose && (
            <div className="text-sm">
              <div className="text-xs font-semibold text-gray-500 mb-1">วัตถุประสงค์ของตำแหน่ง</div>
              <p className="text-gray-700 whitespace-pre-wrap">{activeDoc.jobPurpose}</p>
            </div>
          )}

          {!!activeDoc.responsibilities?.length && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">หน้าที่ + Job Matrix (RACI)</div>
              <div className="flex flex-col gap-1.5">
                {activeDoc.responsibilities.map((r, idx) => {
                  const stakeholders = sortStakeholderEntries(migrateResponsibilityStakeholders(r));
                  return (
                    <div key={idx} className="text-xs bg-gray-50 rounded-lg p-2">
                      <div className="font-medium text-gray-700">{r.task || "-"}</div>
                      <div className="text-gray-500 mt-0.5">KPI: {r.kpi || "-"}</div>
                      {!!stakeholders.length && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stakeholders.map((s, sIdx) => (
                            <span
                              key={`${s.raci}-${s.name}-${sIdx}`}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                RACI_CHIP_CLASS[s.raci] || RACI_CHIP_CLASS.I
                              }`}
                            >
                              {s.raci} {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!!activeDoc.skillMatrix?.length && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">Skill Matrix</div>
              <div className="flex flex-col gap-1.5">
                {activeDoc.skillMatrix.map((s, idx) => (
                  <div key={idx} className="text-xs bg-gray-50 rounded-lg p-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-700 truncate">{s.skill || "-"}</div>
                      <div className="text-gray-500 mt-0.5">
                        {s.category || "-"} · คาดหวัง {s.expectedLevel ?? "-"} / ปัจจุบัน {s.actualLevel ?? "-"}
                        {typeof s.expectedLevel === "number" && typeof s.actualLevel === "number" && (
                          <> · gap {s.actualLevel - s.expectedLevel}</>
                        )}
                      </div>
                    </div>
                    {s.aiSuggested && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold whitespace-nowrap">
                        <Bot size={11} /> AI ร่าง ยังไม่ยืนยัน
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!activeDoc.linkedContracts?.length && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">สัญญาจ้าง</div>
              <div className="flex flex-col gap-1.5">
                {activeDoc.linkedContracts.map((c, idx) => (
                  <div key={idx} className="text-xs bg-gray-50 rounded-lg p-2 flex items-center justify-between gap-2">
                    <span className="text-gray-700">
                      {c.type || "-"} · {c.status || "-"} ({c.startDate || "?"} – {c.endDate || "?"})
                    </span>
                    {c.signedAttachmentUrl && (
                      <a href={c.signedAttachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold flex items-center gap-1 shrink-0">
                        <Link2 size={12} /> เปิดไฟล์
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDoc.status === "draft" && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <AlertTriangle size={13} className="text-gray-400" /> สถานะ: ร่าง (ยังไม่ยืนยันใช้งานจริง)
            </div>
          )}
        </div>
      )}

      {showForm && (
        <EmployeeJobDescriptionForm
          employeeCode={empCode}
          existingDoc={activeDoc}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};
