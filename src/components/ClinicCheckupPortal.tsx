import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, getFirestore, onSnapshot, query, updateDoc, doc, where } from "firebase/firestore";
import { AlertTriangle, Building2, Calendar, CheckCircle2, Loader2, MapPin, Stethoscope } from "lucide-react";
import {
  HEALTH_CHECK_RECORDS_COLLECTION,
  HealthCheckRecord,
  TRAINING_BATCHES_COLLECTION,
  TRAINING_ENROLLMENTS_COLLECTION,
  TrainingBatch,
  TrainingEnrollment,
  getLatestHealthCheck,
} from "./trainingBatchConfig";
import { HealthCheckRowEditor, SharedFileUploadPanel } from "./HealthCheckControls";

/**
 * หน้าสาธารณะสำหรับส่งให้คลินิก ไม่ต้อง login — เข้าถึงได้ด้วยการรู้ token ในลิงก์เท่านั้น
 * (token เป็นสตริงสุ่มยาว เดาไม่ได้ในทางปฏิบัติ — เหมือนลิงก์แชร์ของ Google Docs)
 * เส้นทาง: /clinic/:token
 */
export const ClinicCheckupPortal = () => {
  const { token } = useParams<{ token: string }>();
  const db = getFirestore();

  const [batch, setBatch] = useState<TrainingBatch | null | undefined>(undefined); // undefined = loading, null = not found
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [records, setRecords] = useState<HealthCheckRecord[]>([]);

  const [editLocation, setEditLocation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTimeSlot, setEditTimeSlot] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  useEffect(() => {
    if (!token) {
      setBatch(null);
      return;
    }
    const q = query(collection(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION), where("healthCheckToken", "==", token));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setBatch(null);
          return;
        }
        const d = snap.docs[0];
        const data = { id: d.id, ...(d.data() as object) } as TrainingBatch;
        setBatch(data);
        setEditLocation((prev) => prev || data.location || "");
        setEditDate((prev) => prev || data.date || "");
        setEditTimeSlot((prev) => prev || data.timeSlot || "");
      },
      () => setBatch(null)
    );
    return () => unsub();
  }, [db, token]);

  useEffect(() => {
    if (!batch?.id) return;
    const q = query(collection(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION), where("batchId", "==", batch.id));
    const unsub = onSnapshot(q, (snap) => {
      setEnrollments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as TrainingEnrollment)));
    });
    return () => unsub();
  }, [db, batch?.id]);

  useEffect(() => {
    if (!batch?.id) return;
    const q = query(collection(db, "CMG-HR-Database", "root", HEALTH_CHECK_RECORDS_COLLECTION), where("batchId", "==", batch.id));
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as HealthCheckRecord)));
    });
    return () => unsub();
  }, [db, batch?.id]);

  const recordByEmployee = useMemo(() => {
    const map = new Map<string, HealthCheckRecord>();
    enrollments.forEach((e) => {
      const latest = getLatestHealthCheck(records, e.employeeId);
      if (latest) map.set(e.employeeId, latest);
    });
    return map;
  }, [enrollments, records]);

  const handleSaveSchedule = async () => {
    if (!batch) return;
    setSavingSchedule(true);
    setScheduleSaved(false);
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_BATCHES_COLLECTION, batch.id), {
        location: editLocation.trim(),
        date: editDate,
        timeSlot: editTimeSlot.trim(),
        updatedAt: Date.now(),
      });
      setScheduleSaved(true);
    } catch {
      // แสดงผลแบบเงียบ ๆ พอ — ไม่มี auth ฝั่งนี้ ไม่ต้องโชว์ error ละเอียด
    } finally {
      setSavingSchedule(false);
    }
  };

  if (batch === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (batch === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 p-6 text-center">
        <AlertTriangle className="text-amber-500" size={36} />
        <p className="text-gray-700 font-semibold">ไม่พบลิงก์นี้ในระบบ</p>
        <p className="text-sm text-gray-500">กรุณาตรวจสอบลิงก์อีกครั้ง หรือติดต่อ HR/Safety ของโครงการเพื่อขอลิงก์ใหม่</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Stethoscope className="text-blue-600" size={22} />
            ระบบตรวจสุขภาพก่อนเข้างาน — {batch.courseName}
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Building2 size={14} /> โครงการ: {batch.project}
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Calendar size={13} /> วันที่นัดตรวจ</span>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">ช่วงเวลา</span>
              <input value={editTimeSlot} onChange={(e) => setEditTimeSlot(e.target.value)} placeholder="เช่น 08:00-12:00" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600 flex items-center gap-1"><MapPin size={13} /> สถานที่</span>
              <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="input" />
            </label>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            หากคลินิกต้องการเปลี่ยนวันที่/เวลา/สถานที่นัดตรวจของรอบนี้ แก้ไขแล้วกดบันทึกด้านล่างได้เลย
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {savingSchedule ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              บันทึกวันที่/เวลา/สถานที่
            </button>
            {scheduleSaved && <span className="text-xs text-emerald-600">บันทึกแล้ว</span>}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">รายชื่อพนักงานที่ต้องตรวจสุขภาพ ({enrollments.length} คน)</h2>

          {enrollments.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีรายชื่อพนักงานในรอบนี้</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2.5 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อ-สกุล</th>
                    <th className="p-2.5 text-left font-semibold text-gray-600 border-b whitespace-nowrap">เลขบัตรประชาชน</th>
                    <th className="p-2.5 text-left font-semibold text-gray-600 border-b whitespace-nowrap">เพศ</th>
                    <th className="p-2.5 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สัญชาติ</th>
                    <th className="p-2.5 text-left font-semibold text-gray-600 border-b whitespace-nowrap">บันทึกผลตรวจ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enrollments.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="p-2.5 text-gray-800 font-medium whitespace-nowrap">{e.employeeName}</td>
                      <td className="p-2.5 text-gray-600 whitespace-nowrap">{e.idCardNumber || "-"}</td>
                      <td className="p-2.5 text-gray-600 whitespace-nowrap">{e.gender || "-"}</td>
                      <td className="p-2.5 text-gray-600 whitespace-nowrap">{e.nationality || "-"}</td>
                      <td className="p-2.5">
                        <HealthCheckRowEditor enrollment={e} latestRecord={recordByEmployee.get(e.employeeId)} source="clinic_portal" actorName="คลินิก (ลิงก์สาธารณะ)" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {enrollments.length > 0 && (
            <div className="mt-4">
              <SharedFileUploadPanel enrollments={enrollments} source="clinic_portal" actorName="คลินิก (ลิงก์สาธารณะ)" />
            </div>
          )}
        </div>
      </div>

      <style>{`.input { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; outline: none; background: white; } .input:focus { box-shadow: 0 0 0 2px #dbeafe; }`}</style>
    </div>
  );
};
