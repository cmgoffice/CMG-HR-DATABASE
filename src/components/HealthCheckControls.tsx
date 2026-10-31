import React, { useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Paperclip, Users } from "lucide-react";
import {
  HEALTH_CHECK_RESULT_OPTIONS,
  HealthCheckRecord,
  HealthCheckResult,
  isHealthCheckStillValid,
  TrainingEnrollment,
} from "./trainingBatchConfig";
import { recordHealthCheckResult, recordSharedHealthCheckResult } from "../utils/healthCheckActions";

const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Badge: สรุปสถานะผลตรวจสุขภาพล่าสุดของพนักงาน 1 คน (ใช้ทั้งหน้า HR และหน้าคลินิก)
// ---------------------------------------------------------------------------
export const HealthCheckBadge = ({ latest }: { latest: HealthCheckRecord | undefined }) => {
  if (!latest) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
        ยังไม่เคยตรวจ
      </span>
    );
  }
  const stillValid = isHealthCheckStillValid(latest.expiryDate);
  if (latest.result === "unfit") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200" title={`ตรวจเมื่อ ${latest.checkedDate}`}>
        ไม่ผ่านเกณฑ์ ({latest.checkedDate})
      </span>
    );
  }
  if (stillValid) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={`ตรวจเมื่อ ${latest.checkedDate}`}>
        มีผลตรวจ ถึง {latest.expiryDate}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200" title={`ตรวจเมื่อ ${latest.checkedDate}`}>
      ผลตรวจหมดอายุแล้ว ({latest.expiryDate})
    </span>
  );
};

// ---------------------------------------------------------------------------
// แถวบันทึกผลตรวจรายคน — ใช้ได้ทั้งใน TrainingBatchPage (HR กรอกแทน) และ ClinicCheckupPortal (คลินิกกรอกเอง)
// ---------------------------------------------------------------------------
export const HealthCheckRowEditor = ({
  enrollment,
  latestRecord,
  source,
  actorName,
  actorUid,
}: {
  enrollment: TrainingEnrollment;
  latestRecord: HealthCheckRecord | undefined;
  source: "clinic_portal" | "hr_manual";
  actorName?: string;
  actorUid?: string;
}) => {
  const [checkedDate, setCheckedDate] = useState(todayStr());
  const [result, setResult] = useState<HealthCheckResult>("fit");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await recordHealthCheckResult({
        enrollment,
        checkedDate,
        result,
        file,
        employeeFirstName: enrollment.employeeFirstName || enrollment.employeeName.split(" ")[0] || "emp",
        source,
        actorName,
        actorUid,
      });
      setSaved(true);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 min-w-[260px]">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={checkedDate} onChange={(e) => setCheckedDate(e.target.value)} className="input !py-1 !w-auto" />
        <select value={result} onChange={(e) => setResult(e.target.value as HealthCheckResult)} className="input !py-1 !w-auto">
          {HEALTH_CHECK_RESULT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs max-w-[160px]" />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
          บันทึกผลตรวจ
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[11px] text-emerald-600">บันทึกผลตรวจแล้ว</p>}
      <HealthCheckBadge latest={latestRecord} />
      {latestRecord?.fileUrl && (
        <a href={latestRecord.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
          <Paperclip size={11} /> {latestRecord.fileName || "ไฟล์ใบรับรองแพทย์"}
        </a>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// อัปโหลดไฟล์รวม 1 ไฟล์ แล้วติ๊กเลือกว่าครอบคลุมพนักงานคนไหนบ้าง (ไม่ตัดแบ่งไฟล์จริง)
// ---------------------------------------------------------------------------
export const SharedFileUploadPanel = ({
  enrollments,
  source,
  actorName,
  actorUid,
}: {
  enrollments: TrainingEnrollment[];
  source: "clinic_portal" | "hr_manual";
  actorName?: string;
  actorUid?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [checkedDate, setCheckedDate] = useState(todayStr());
  const [result, setResult] = useState<HealthCheckResult>("fit");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const picked = useMemo(() => enrollments.filter((e) => selected.has(e.id)), [enrollments, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!file) {
      setError("กรุณาเลือกไฟล์");
      return;
    }
    if (picked.length === 0) {
      setError("กรุณาเลือกพนักงานอย่างน้อย 1 คนที่ไฟล์นี้ครอบคลุม");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordSharedHealthCheckResult({ enrollments: picked, checkedDate, result, file, source, actorName, actorUid });
      setSaved(true);
      setFile(null);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 whitespace-nowrap"
      >
        <FileUp size={14} /> อัปโหลดไฟล์รวม (กรณีไม่สะดวกแนบรายคน)
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Users size={15} /> อัปโหลดไฟล์รวม — เลือกคนที่ไฟล์นี้ครอบคลุม
        </h4>
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500 hover:text-gray-800">
          ยุบ
        </button>
      </div>
      <p className="text-[11px] text-gray-500">
        ไฟล์เดียวกันจะถูกอ้างอิงไว้ในประวัติผลตรวจของทุกคนที่เลือก (ระบบไม่ได้ตัดแบ่งไฟล์จริง)
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={checkedDate} onChange={(e) => setCheckedDate(e.target.value)} className="input !py-1 !w-auto" />
        <select value={result} onChange={(e) => setResult(e.target.value as HealthCheckResult)} className="input !py-1 !w-auto">
          {HEALTH_CHECK_RESULT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
      </div>
      <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
        {enrollments.map((e) => (
          <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
            {e.employeeName} <span className="text-gray-400 text-xs">({e.employeeCode || "-"})</span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="text-xs text-emerald-600">บันทึกผลตรวจให้ {picked.length} คนแล้ว</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="self-start flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
        บันทึกผลตรวจให้ {selected.size} คน
      </button>
    </div>
  );
};