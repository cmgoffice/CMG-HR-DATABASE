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

const requestSync = async (date: string, token: string): Promise<ScanSummary> => {
  const response = await fetch(getSyncUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(body, response.status));
  return (body?.summary || body || {}) as ScanSummary;
};

const formatSummary = (date: string, summary: ScanSummary) => {
  const failed = Number(summary.failed || 0);
  const processed = Number(summary.processed || 0);
  const updated = Number(summary.updated || 0);
  const details = [
    ...(summary.failureDetails || []).slice(0, 3).map(item => `${item.empCode || item.employeeId || "ไม่ทราบรหัส"}: ${item.reason || "ไม่ทราบสาเหตุ"}`),
    ...(summary.skippedDetails || []).slice(0, 3).map(item => `${item.empCode || item.employeeId || "ไม่ทราบรหัส"}: ${item.reason || "ข้ามรายการ"}`),
  ];
  const detailText = details.length ? ` · รายละเอียด: ${details.join(" | ")}` : "";
  if (failed > 0) {
    return `ตรวจไม่สำเร็จ ${failed} คน · ตรวจแล้ว ${processed} คน · อัปเดต ${updated} คน${detailText}`;
  }
  return `ตรวจสอบสำเร็จ ${date} · ตรวจพนักงานทำงาน ${processed} คน · อัปเดตเวลาออก ${updated} คน · ไม่พบเวลาออก ${Number(summary.missingPunch || 0)} คน`;
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
    () => doc(db, "CMG-HR-Database", "root", "ot_scan_settings", "global"),
    [db],
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
    if (!canEdit || !firebaseUser) {
      setMessage("กรุณาเข้าสู่ระบบก่อนดึงข้อมูล");
      return;
    }
    setBusy(true);
    setMessage("กำลังส่งงานให้ backend ตรวจข้อมูลลงเวลา...");
    try {
      const token = await firebaseUser.getIdToken();
      const summary = await requestSync(date, token);
      setMessage(formatSummary(date, summary));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึงข้อมูลไม่สำเร็จ กรุณาตรวจสอบ backend");
    } finally {
      setBusy(false);
    }
  };

  const pullFromMonthStart = async () => {
    if (!canEdit || !firebaseUser) {
      setMessage("กรุณาเข้าสู่ระบบก่อนดึงข้อมูล");
      return;
    }
    const today = thaiDate();
    const fromDate = `${today.slice(0, 8)}01`;
    const toDate = nextDate(today, -1);
    if (fromDate > toDate) {
      setMessage("ยังไม่มีวันที่ก่อนหน้าให้ดึงข้อมูล");
      return;
    }

    setBusy(true);
    try {
      const token = await firebaseUser.getIdToken();
      const dates: string[] = [];
      for (let date = fromDate; date <= toDate; date = nextDate(date)) dates.push(date);
      let updated = 0;
      let missingPunch = 0;
      let failed = 0;

      for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index];
        setMessage(`กำลังดึงข้อมูล ${date} (${index + 1}/${dates.length})...`);
        try {
          const summary = await requestSync(date, token);
          updated += Number(summary.updated || 0);
          missingPunch += Number(summary.missingPunch || 0);
          failed += Number(summary.failed || 0);
        } catch {
          failed += 1;
        }
      }
      setMessage(`ดึงข้อมูลตั้งแต่ ${fromDate} ถึง ${toDate} สำเร็จ · อัปเดตเวลาออก ${updated} คน · ไม่พบเวลาออก ${missingPunch} คน${failed ? ` · มีวันที่/รายการผิดพลาด ${failed}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดึงข้อมูลย้อนหลังไม่สำเร็จ กรุณาตรวจสอบ backend");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!canEdit) return;
    try {
      await setDoc(settingsRef, {
        project: "all",
        time,
        enabled,
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
      <div className="text-xs">ดึงพนักงานที่มีสถานะ “ทำงาน” ทุกโครงการผ่าน backend แม้ปิดหน้าเว็บอยู่</div>
      <label className="flex gap-2"><input type="checkbox" checked={enabled} disabled={!canEdit || busy} onChange={e => setEnabled(e.target.checked)} />เปิดดึงอัตโนมัติ</label>
      <input aria-label="เวลาดึงข้อมูล" type="time" value={time} disabled={!canEdit || busy} onChange={e => setTime(e.target.value)} />
      <button disabled={!canEdit || busy || !time} className="border rounded px-2" onClick={() => void saveSettings()}>บันทึก</button>
      <button disabled={!canEdit || busy} className="block border rounded px-2" onClick={() => void pull(nextDate(thaiDate(), -1))}>ดึงข้อมูลเมื่อวานตอนนี้</button>
      <button disabled={!canEdit || busy} className="block border rounded px-2" onClick={() => void pullFromMonthStart()}>ดึงข้อมูลตั้งแต่วันที่ 1 ถึงเมื่อวาน</button>
      <div className="text-[11px] text-gray-500">การดึงย้อนหลังจะไล่ทำทีละวัน ควรเปิดหน้านี้ไว้จนกว่าจะเสร็จ</div>
      {saved?.lastSuccess && <div className="text-xs">สำเร็จล่าสุด {new Date(saved.lastSuccess).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</div>}
      <div role="status" className="text-xs">{message}</div>
    </div>}
  </div>;
}
