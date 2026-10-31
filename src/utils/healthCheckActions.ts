import { collection, doc, getFirestore, setDoc, updateDoc } from "firebase/firestore";
import {
  buildHealthCheckFileName,
  computeHealthCheckExpiry,
  HEALTH_CHECK_RECORDS_COLLECTION,
  HealthCheckResult,
  TRAINING_ENROLLMENTS_COLLECTION,
  TrainingEnrollment,
} from "../components/trainingBatchConfig";
import { uploadHealthCheckFile } from "./healthCheckAttachments";

export interface RecordHealthCheckInput {
  enrollment: TrainingEnrollment;
  checkedDate: string; // yyyy-mm-dd
  result: HealthCheckResult;
  file?: File | null;
  // ชื่อที่ใช้ตั้งชื่อไฟล์ (ต้องเป็นชื่อตัวอย่างเดียว ไม่มีนามสกุล) — ปกติคือ employeeFirstName
  employeeFirstName: string;
  source: "clinic_portal" | "hr_manual";
  actorName?: string;
  actorUid?: string;
}

/**
 * บันทึกผลตรวจสุขภาพของพนักงาน 1 คน:
 *  1) อัปโหลดไฟล์ใบรับรองแพทย์ (ถ้ามี) เข้าโฟลเดอร์รายคน
 *  2) สร้าง record ถาวรใน health_check_records (ไว้เช็คอายุ 6 เดือนข้ามรอบ/โครงการ)
 *  3) อัปเดต training_enrollments ของรอบนี้ให้ชี้กลับไปที่ record และปรับสถานะสุขภาพ
 */
export async function recordHealthCheckResult(input: RecordHealthCheckInput): Promise<void> {
  const { enrollment, checkedDate, result, file, employeeFirstName, source, actorName, actorUid } = input;
  const db = getFirestore();

  let fileUrl: string | undefined;
  let fileName: string | undefined;
  if (file) {
    const displayName = buildHealthCheckFileName(enrollment.project, employeeFirstName, checkedDate, file.name);
    const uploaded = await uploadHealthCheckFile(enrollment.employeeId, file, displayName);
    fileUrl = uploaded.url;
    fileName = uploaded.fileName;
  }

  const recordRef = doc(collection(db, "CMG-HR-Database", "root", HEALTH_CHECK_RECORDS_COLLECTION));
  const record: Record<string, unknown> = {
    employeeId: enrollment.employeeId,
    employeeCode: enrollment.employeeCode || "",
    employeeName: enrollment.employeeName,
    project: enrollment.project,
    batchId: enrollment.batchId,
    checkedDate,
    expiryDate: computeHealthCheckExpiry(checkedDate),
    result,
    source,
    uploadedByName: actorName || "",
    uploadedByUid: actorUid || "",
    createdAt: Date.now(),
  };
  if (fileUrl) record.fileUrl = fileUrl;
  if (fileName) record.fileName = fileName;
  await setDoc(recordRef, record);

  await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION, enrollment.id), {
    healthCheckRecordId: recordRef.id,
    healthCheck: {
      status: result === "fit" ? "fit" : "unfit",
    },
    updatedAt: Date.now(),
  });
}

export interface RecordSharedHealthCheckInput {
  enrollments: TrainingEnrollment[];
  checkedDate: string;
  result: HealthCheckResult;
  file: File; // บังคับมีไฟล์เสมอ (กรณีนี้คือไฟล์รวม)
  source: "clinic_portal" | "hr_manual";
  actorName?: string;
  actorUid?: string;
}

/**
 * กรณีคลินิกไม่สะดวกแนบไฟล์แยกรายคน — อัปโหลดไฟล์รวม "ครั้งเดียว" แล้วอ้างอิง fileUrl เดียวกัน
 * ไปยัง health_check_records ของทุกคนที่เลือก (ไม่ได้ตัดแบ่งไฟล์จริง แค่ tag คนที่ไฟล์นี้ครอบคลุม)
 */
export async function recordSharedHealthCheckResult(input: RecordSharedHealthCheckInput): Promise<void> {
  const { enrollments, checkedDate, result, file, source, actorName, actorUid } = input;
  if (enrollments.length === 0) return;
  const db = getFirestore();

  // ใช้ชื่อไฟล์อ้างอิงจากคนแรกเพื่อให้พอสื่อความหมาย (ไฟล์เดียวกันถูกใช้ร่วมกันหลายคน)
  const firstEnrollment = enrollments[0];
  const sharedDisplayName = buildHealthCheckFileName(firstEnrollment.project, "กลุ่ม", checkedDate, file.name);
  const uploaded = await uploadHealthCheckFile(`shared/${firstEnrollment.batchId}`, file, sharedDisplayName);

  await Promise.all(
    enrollments.map(async (enrollment) => {
      const recordRef = doc(collection(db, "CMG-HR-Database", "root", HEALTH_CHECK_RECORDS_COLLECTION));
      await setDoc(recordRef, {
        employeeId: enrollment.employeeId,
        employeeCode: enrollment.employeeCode || "",
        employeeName: enrollment.employeeName,
        project: enrollment.project,
        batchId: enrollment.batchId,
        checkedDate,
        expiryDate: computeHealthCheckExpiry(checkedDate),
        result,
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
        source,
        uploadedByName: actorName || "",
        uploadedByUid: actorUid || "",
        createdAt: Date.now(),
      });
      await updateDoc(doc(db, "CMG-HR-Database", "root", TRAINING_ENROLLMENTS_COLLECTION, enrollment.id), {
        healthCheckRecordId: recordRef.id,
        healthCheck: { status: result === "fit" ? "fit" : "unfit" },
        updatedAt: Date.now(),
      });
    })
  );
}
