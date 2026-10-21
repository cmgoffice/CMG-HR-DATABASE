import React, { useEffect, useMemo, useState } from "react";
import { doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { nextDate, thaiDate } from "../utils/otScan";

interface Props {
  project: string;
  // Kept in the component contract so the existing OT page and its rendering stay unchanged.
  employees: { id: string; รหัสพนักงาน?: string; สถานะโครงการ?: string | string[] }[];
  schedule?: { workStartTime?: string; otStartTime?: string };
  canEdit: boolean;
}

interface ScanSummary {
  processed?: number;
  updated?: number;
  missingPunch?: number;
  skippedAmbiguous?: number;
  skippedOtherProject?: number;
  failed?: number;
  failureDetails?: { empCode?: string; employeeId?: string; reason?: string }[];
  skippedDetails?: { empCode?: string; employeeId?: string; reason?: string }[];
}

const getBackendBaseUrl = () => {
  const configured = (process.env.REACT_APP_ZK_FUNCTIONS_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const localHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
  return localHost || window.location.port === "3000" ? "https://cmg-hr-database.web.app" : window.location.origin;
};

const getSyncUrl = () =>
  `${getBackendBaseUrl()}/api/zkteco/sync`;

const getErrorMessage = (body: unknown, status: number) => {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const message = (body as Record<string, unknown>).error || (body as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return `เรียก backend ไม่สำเร็จ (${status})`;
};

const formatSummary = (date: string, summary: ScanSummary) => {
  const failed = Number(summary.failed || 0);
  const ambiguous = Number(summary.skippedAmbiguous || 0);
  const skippedOther = Number(summary.skippedOtherProject || 0);
  const updated = Number(summary.updated || 0);
  const details = [
    ...(summary.failureDetails || []).slice(0, 3).map(item => `${item.empCode || item.employeeId || "ไม่ทราบรหัส"}: ${item.reason || "ไม่ทราบสาเหตุ"}`),
    ...(summary.skippedDetails || []).slice(0, 3).map(item => `${item.empCode || item.employeeId || "ไม่ทราบรหัส"}: ${item.reason || "ข้ามรายการ"}`),
  ];
  const detailText = details.length ? ` · รายละเอียด: ${details.join(" | ")}` : "";
  if (failed > 0) {
    return `ตรวจไม่สำเร็จ ${failed} คน · อัปเดต ${updated} คน · ข้ามหลายโครงการ ${ambiguous + skippedOther} คน${detailText}`;
  }
  return `ตรวจสอบสำเร็จ ${date} · อัปเดต ${updated} คน · ไม่พบเวลาออก ${Number(summary.missingPunch || 0)} คน · ข้ามหลายโครงการ ${ambiguous + skippedOther} คน${detailText}`;
};

export function OtScanControl({ project, employees, canEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("09:00");
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState<Record<string, any> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const db = getFirestore();
  const settingsRef = useMemo(
    () => doc(db, "CMG-HR-Database", "root", "ot_scan_settings", encodeURIComponent(project)),
    [db, project],
  );
  const { firebaseUser } = useAuth();

  useEffect(() => {
    setSaved(null);
    setMessage("");
    return onSnapshot(settingsRef, snap => {
      const data = snap.data() || {};
      setSaved(data);
      setTime(data.time || "09:00");
      setEnabled(!!data.enabled);
    }, () => setMessage("อ่านการตั้งค่าไม่สำเร็จ"));
  }, [settingsRef]);

  const pull = async (date: string) => {
    if (!canEdit || project === "all" || !firebaseUser) {
      setMessage(project === "all" ? "กรุณาเลือกโครงการก่อนดึงข้อมูล" : "กรุณาเข้าสู่ระบบก่อนดึงข้อมูล");
      return;
    }
    setBusy(true);
    setMessage("กำลังส่งงานให้ backend ตรวจข้อมูลลงเวลา...");
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(getSyncUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project,
          date,
          // Use exactly the rows currently shown in the selected OT project.
          employeeIds: employees.map(employee => employee.id).filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(body, response.status));
      setMessage(formatSummary(date, (body?.summary || body || {}) as ScanSummary));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึงข้อมูลไม่สำเร็จ กรุณาตรวจสอบ backend");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!canEdit || project === "all") return;
    try {
      await setDoc(settingsRef, {
        project,
        time,
        enabled,
        employeeIds: employees.map(employee => employee.id).filter(Boolean),
        updatedAt: Date.now(),
      }, { merge: true });
      setMessage("บันทึกการตั้งค่าแล้ว · Cloud Scheduler จะตรวจตามเวลานี้");
    } catch {
      setMessage("บันทึกการตั้งค่าไม่สำเร็จ");
    }
  };

  return <div className="relative">
    <button type="button" className="px-3 py-1.5 text-sm border rounded" onClick={() => setOpen(!open)}>ตั้งเวลาดึงข้อมูล</button>
    {open && <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded border bg-white p-4 shadow-xl text-sm space-y-3">
      <div>ตรวจเวลาออกของวันก่อนหน้า · เวลาไทย</div>
      <div className="text-xs">ระบบจะดึงผ่าน backend ตามตาราง แม้ปิดหน้าเว็บอยู่</div>
      {project === "all" ? <div>กรุณาเลือกโครงการก่อนตั้งเวลา</div> : <>
        <label className="flex gap-2"><input type="checkbox" checked={enabled} disabled={!canEdit || busy} onChange={e => setEnabled(e.target.checked)} />เปิดดึงอัตโนมัติ</label>
        <input aria-label="เวลาดึงข้อมูล" type="time" value={time} disabled={!canEdit || busy} onChange={e => setTime(e.target.value)} />
        <button disabled={!canEdit || busy || !time} className="border rounded px-2" onClick={() => void saveSettings()}>บันทึก</button>
        <button disabled={!canEdit || busy} className="block border rounded px-2" onClick={() => void pull(nextDate(thaiDate(), -1))}>ดึงข้อมูลเมื่อวานตอนนี้</button>
        {saved?.lastSuccess && <div className="text-xs">สำเร็จล่าสุด {new Date(saved.lastSuccess).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</div>}
      </>}
      <div role="status" className="text-xs">{message}</div>
    </div>}
  </div>;
}
