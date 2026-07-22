import React, { useMemo, useState } from "react";
import { Eye, FileText, Search } from "lucide-react";
import type { EmployeeFollowUpCase, FollowUpDocumentRecord } from "./employeeFollowUpConfig";

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
 * รายการเอกสารทั้งหมดที่เคยออกแล้ว (ไม่ใช่รายการเคส) รวมจากทุกเคสในระบบ ให้ HR/HRM ค้นหา/ตรวจสอบย้อนหลัง
 * และกด "ดูเคส" เพื่อกระโดดไปเปิดเคสต้นทางของเอกสารนั้นได้ทันที
 */
export const FollowUpDocumentsBacklog = ({
  cases,
  onOpenCase,
}: {
  cases: EmployeeFollowUpCase[];
  onOpenCase: (caseId: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | FollowUpDocumentRecord["templateKey"]>("all");

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
                    <button
                      type="button"
                      onClick={() => onOpenCase(docItem.caseId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Eye size={13} />
                      ดูเคส
                    </button>
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
