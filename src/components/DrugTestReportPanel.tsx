import { useMemo, useState } from "react";
import { downloadDrugTestReportDocx } from "../utils/drugTestReportDocx";
import type { TrainingEnrollment } from "./trainingBatchConfig";
import type { EmployeeRow } from "./TrainingBatchPage";

export const DrugTestReportPanel = ({ project, enrollments, employees }: {
  project: string; enrollments: TrainingEnrollment[]; employees: EmployeeRow[];
}) => {
  const [session, setSession] = useState("");
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(enrollments.map((person) => person.id)));
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const people = useMemo(() => enrollments.filter((person) => selected.has(person.id)), [enrollments, selected]);
  const filtered = enrollments.filter((person) => `${person.employeeName} ${person.employeeCode || ""} ${person.position || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadDrugTestReportDocx(project, session, date, people, employees);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "สร้างเอกสารตรวจสารเสพติดไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <details className="border rounded-lg p-3 my-4 bg-gray-50">
      <summary className="cursor-pointer font-semibold text-sm text-indigo-800">เอกสารผลตรวจสารเสพติด — สร้างแยกแต่ละครั้งตรวจ</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <p className="text-xs text-gray-600">เติมรายชื่อ ตำแหน่ง บริษัท และวันที่ตรวจให้ ผลตรวจ รูปหลักฐาน และหมายเหตุเว้นไว้กรอกหลังตรวจ ดาวน์โหลดเป็น Word แยกครั้ง</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">ชื่อครั้งตรวจ
            <input required value={session} disabled={downloading} onChange={(event) => setSession(event.target.value)} placeholder="เช่น ครั้งที่ 1 / ตรวจซ้ำ" className="w-full border rounded px-3 py-2 mt-1" />
          </label>
          <label className="text-sm">วันที่ตรวจ
            <input required type="date" value={date} disabled={downloading} onChange={(event) => setDate(event.target.value)} className="w-full border rounded px-3 py-2 mt-1" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span aria-live="polite">เลือก {people.length} / {enrollments.length} คน</span>
          <button type="button" disabled={downloading} onClick={() => setSelected(new Set(enrollments.map((person) => person.id)))} className="text-indigo-700">เลือกทุกคนในรอบ</button>
          <button type="button" disabled={downloading} onClick={() => setSelected(new Set())} className="text-red-600">ล้างการเลือก</button>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ / รหัส / ตำแหน่ง" aria-label="ค้นหารายชื่อสำหรับครั้งตรวจ" className="w-full border rounded px-3 py-2 text-sm" />
        <div className="max-h-56 overflow-y-auto border rounded bg-white divide-y">
          {filtered.map((person) => (
            <label key={person.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.has(person.id)} disabled={downloading} onChange={() => setSelected((previous) => {
                const next = new Set(previous);
                if (next.has(person.id)) next.delete(person.id);
                else next.add(person.id);
                return next;
              })} />
              <span>{person.employeeName} <span className="text-xs text-gray-500">{person.position || ""}</span></span>
            </label>
          ))}
          {!filtered.length && <p className="p-3 text-sm text-gray-500">ไม่พบรายชื่อ</p>}
        </div>
        <button type="submit" disabled={downloading || !people.length || !session.trim() || !date} className="px-4 py-2 bg-indigo-700 text-white rounded text-sm disabled:opacity-50">{downloading ? "กำลังสร้างเอกสาร..." : "ดาวน์โหลดรายชื่อสำหรับครั้งตรวจนี้ (Word)"}</button>
      </form>
    </details>
  );
};
