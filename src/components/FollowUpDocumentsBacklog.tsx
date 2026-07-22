import React, { useMemo, useState } from "react";
import { doc, getFirestore, updateDoc } from "firebase/firestore";
import { Download, Eye, FileText, Loader2, Search, Trash2 } from "lucide-react";
import { EMPLOYEE_FOLLOW_UP_COLLECTION } from "./employeeFollowUpConfig";
import type { EmployeeFollowUpCase, FollowUpActionType, FollowUpDocumentRecord } from "./employeeFollowUpConfig";
import { generateAndDownloadFollowUpDocument } from "../utils/followUpDocuments";

interface FlatFollowUpDocument extends FollowUpDocumentRecord {
  caseId: string;
  employeeName: string;
  employeeCode: string;
  projectName: string;
}

const TEMPLATE_FILTER_OPTIONS: { value: "all" | FollowUpDocumentRecord["templateKey"]; label: string }[] = [
  { value: "all", label: "ทุกประเภทเอกสาร" },
  { value: "warning_memo", label: "FM-HR-017 บันทึกข้อความขอออกหนังสือตักเตือน" },
  { value: "warning_letter", label: "FM-HR-018 หนังสือเตือน" },
  { value: "termination_notice", label: "หนังสือแจ้งพ้นสภาพการเป็นพนักงาน" },
];

/**
 * หา action ที่แท้จริงที่ใช้สร้างเอกสารฉบับนี้ (ข้าม action ประเภทเวิร์กโฟลว์ เช่น เสนอ/อนุมัติ/ส่งร่าง)
 * เพื่อใช้ประกอบการ re-generate PDF ตอนดาวน์โหลดซ้ำจาก backlog
 */
const lastExecutedFollowUpEvent = (item: EmployeeFollowUpCase) =>
  [...(item.actions || [])].reverse().find((event) =>
    event.type !== "document_issued" &&
    event.type !== "document_submitted" &&
    event.type !== "document_approved" &&
    event.type !== "document_commented" &&
    event.type !== "hrm_approved" &&
    event.type !== "hrm_commented" &&
    event.type !== "proposed_action" &&
    event.type !== "status_updated"
  );

/**
 * รายการเอกสารทั้งหมดที่เคยออกแล้ว (ไม่ใช่รายการเคส) รวมจากทุกเคสในระบบ ให้ HR/HRM ค้นหา/ตรวจสอบย้อนหลัง
 * และกด "ดูเคส" เพื่อกระโดดไปเปิดเคสต้นทางของเอกสารนั้นได้ทันที หรือกด "ดาวน์โหลด" เพื่อโหลดไฟล์ PDF ฉบับนั้นได้ทันที
 * โดยไม่ต้องเปิดเคสก่อน (สร้าง PDF ใหม่จากข้อมูลเดิมที่บันทึกไว้ ใช้เลขที่เอกสารเดิม ไม่ออกเลขใหม่)
 */
export const FollowUpDocumentsBacklog = ({
  cases,
  onOpenCase,
  canManage,
}: {
  cases: EmployeeFollowUpCase[];
  onOpenCase: (caseId: string) => void;
  /** ลบบันทึกเอกสารได้เฉพาะ HR/HRM (สิทธิ์เดียวกับที่จัดการเคสได้) */
  canManage: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | FollowUpDocumentRecord["templateKey"]>("all");
  const [downloadBusyId, setDownloadBusyId] = useState<string>("");
  const [deleteBusyId, setDeleteBusyId] = useState<string>("");

  const downloadDocument = async (docItem: FlatFollowUpDocument) => {
    const sourceCase = cases.find((item) => item.id === docItem.caseId);
    if (!sourceCase) {
      window.alert("ไม่พบเคสต้นทางของเอกสารนี้ ไม่สามารถดาวน์โหลดได้");
      return;
    }
    const actionType: FollowUpActionType | undefined =
      docItem.actionType || sourceCase.pendingActionType || (lastExecutedFollowUpEvent(sourceCase)?.type as FollowUpActionType | undefined);
    if (!actionType) {
      window.alert("ไม่พบข้อมูลการดำเนินการที่ใช้สร้างเอกสารนี้ ไม่สามารถดาวน์โหลดซ้ำได้");
      return;
    }
    const draft = sourceCase.documentDraft;
    const executedEvent = lastExecutedFollowUpEvent(sourceCase);
    setDownloadBusyId(docItem.id);
    try {
      await generateAndDownloadFollowUpDocument(docItem.templateKey, {
        followUpCase: sourceCase,
        actionType,
        note: draft?.facts || executedEvent?.note,
        violatedRule: draft?.violatedRule,
        incidentDate: draft?.incidentDate,
        incidentTime: draft?.incidentTime,
        suspensionStartDate: draft?.suspensionStartDate,
        suspensionEndDate: draft?.suspensionEndDate,
        suspensionTotalDays: executedEvent?.suspensionDays,
        terminationDate: draft?.terminationDate,
        employmentStartDate: draft?.employmentStartDate,
        lastWorkDate: draft?.lastWorkDate,
        absenceStartDate: draft?.absenceStartDate,
        warningRound: executedEvent?.warningRound || sourceCase.warningRound,
        preparer: { uid: docItem.generatedByUid, name: docItem.generatedByName },
        approver:
          docItem.usedSignatureOfUid || docItem.usedSignatureOfName
            ? { uid: docItem.usedSignatureOfUid || "", name: docItem.usedSignatureOfName || "" }
            : undefined,
        // ใช้เลขที่เอกสารเดิมที่เคยออกไว้แล้ว ห้ามออกเลขใหม่ตอนดาวน์โหลดซ้ำ
        documentNumber: docItem.documentNumber,
        attachments: draft?.attachments,
      });
    } catch (error) {
      window.alert(`ดาวน์โหลดเอกสารไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setDownloadBusyId("");
    }
  };

  /**
   * ลบบันทึกเอกสารฉบับเดียวออกจากประวัติเคสต้นทาง (ไม่ลบทั้งเคส) ใช้เมื่อออกเอกสารทดสอบผิดพลาด
   * เลขที่เอกสารเดิมจะไม่ถูกนำมาใช้ซ้ำ (ตัวนับเดินหน้าต่อไปเรื่อยๆ) เพื่อไม่ให้เลขที่ซ้ำกับเอกสารจริงที่อาจพิมพ์ไปแล้ว
   */
  const deleteDocument = async (docItem: FlatFollowUpDocument) => {
    const sourceCase = cases.find((item) => item.id === docItem.caseId);
    if (!sourceCase) {
      window.alert("ไม่พบเคสต้นทางของเอกสารนี้ ไม่สามารถลบได้");
      return;
    }
    if (
      !window.confirm(
        `ยืนยันลบบันทึกเอกสาร "${docItem.templateLabel}${
          docItem.documentNumber ? ` (เลขที่ ${docItem.documentNumber})` : ""
        }" ของ ${docItem.employeeName} ออกจากประวัติเคส? (เลขที่เอกสารเดิมจะไม่ถูกนำมาใช้ซ้ำ)`
      )
    ) {
      return;
    }
    setDeleteBusyId(docItem.id);
    try {
      const nextDocuments = (sourceCase.documents || []).filter((item) => item.id !== docItem.id);
      const caseRef = doc(getFirestore(), "CMG-HR-Database", "root", EMPLOYEE_FOLLOW_UP_COLLECTION, sourceCase.id);
      await updateDoc(caseRef, { documents: nextDocuments, updatedAt: Date.now() });
    } catch (error) {
      window.alert(`ลบไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด"}`);
    } finally {
      setDeleteBusyId("");
    }
  };

  const flatDocuments = useMemo<FlatFollowUpDocument[]>(() => {
    const list: FlatFollowUpDocument[] = [];
    cases.forEach((item) => {
      (item.documents || []).forEach((docRecord) => {
        list.push({
          ...docRecord,
          caseId: item.id,
          employeeName: item.employeeName,
          employeeCode: item.employeeCode,
          projectName: item.projectName,
        });
      });
    });
    return list.sort((a, b) => b.generatedAt - a.generatedAt);
  }, [cases]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return flatDocuments.filter((docItem) => {
      if (templateFilter !== "all" && docItem.templateKey !== templateFilter) return false;
      if (!term) return true;
      return (
        docItem.employeeName.toLowerCase().includes(term) ||
        docItem.employeeCode.toLowerCase().includes(term) ||
        (docItem.documentNumber || "").toLowerCase().includes(term) ||
        docItem.templateLabel.toLowerCase().includes(term) ||
        (docItem.projectName || "").toLowerCase().includes(term)
      );
    });
  }, [flatDocuments, search, templateFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-600">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Backlog เอกสาร</h2>
            <p className="mt-1 text-sm text-slate-600">
              รวมเอกสารทุกฉบับที่เคยออกแล้วจากทุกเคส (บันทึกข้อความ / หนังสือเตือน / หนังสือแจ้งพ้นสภาพ) ค้นหาแล้วกด
              "ดูเคส" เพื่อเปิดเคสต้นทางของเอกสารนั้น
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อพนักงาน / รหัสพนักงาน / เลขที่เอกสาร / โครงการ"
            className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value as "all" | FollowUpDocumentRecord["templateKey"])}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100"
        >
          {TEMPLATE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">เลขที่เอกสาร</th>
              <th className="px-4 py-3">ประเภทเอกสาร</th>
              <th className="px-4 py-3">พนักงาน</th>
              <th className="px-4 py-3">โครงการ</th>
              <th className="px-4 py-3">ออกโดย</th>
              <th className="px-4 py-3">วันที่ออก</th>
              <th className="px-4 py-3 text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDocuments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  ไม่พบเอกสารที่ตรงกับเงื่อนไข
                </td>
              </tr>
            ) : (
              filteredDocuments.map((docItem) => (
                <tr key={docItem.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{docItem.documentNumber || "-"}</td>
                  <td className="px-4 py-3">{docItem.templateLabel}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{docItem.employeeName}</div>
                    <div className="text-xs text-slate-400">{docItem.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{docItem.projectName || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{docItem.generatedByName}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(docItem.generatedAt).toLocaleString("th-TH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={downloadBusyId === docItem.id}
                        onClick={() => void downloadDocument(docItem)}
                        title={`ดาวน์โหลด ${docItem.templateLabel}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {downloadBusyId === docItem.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Download size={13} />
                        )}
                        ดาวน์โหลด
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenCase(docItem.caseId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Eye size={13} />
                        ดูเคส
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          disabled={deleteBusyId === docItem.id}
                          onClick={() => void deleteDocument(docItem)}
                          title="ลบบันทึกเอกสารฉบับนี้ออกจากประวัติเคส (เลขที่เอกสารจะไม่ถูกนำมาใช้ซ้ำ)"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {deleteBusyId === docItem.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
