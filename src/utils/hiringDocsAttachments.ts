import { arrayUnion, doc, getFirestore, updateDoc } from "firebase/firestore";
import { HIRING_DOCS_MAX_FILE_SIZE_BYTES, HiringAttachment } from "../components/recruitmentIntakeConfig";

// ---------------------------------------------------------------------------
// เอกสารแนบรายคน (hiring documents) — ยิงเข้า Google Apps Script Web App ตัวเดิม
// ที่ระบบ Recruitment ใช้อยู่แล้ว (เก็บไฟล์จริงบน Google Drive) แล้วบันทึกลิงก์ที่ได้
// กลับเข้า `attachments` array ของ Firestore doc เดิม (ห้ามสร้างที่เก็บ/โฟลเดอร์ใหม่)
//
// อ้างอิงสเปคจากทีม Recruitment (ส่งมาให้ทีม Data):
// - Endpoint: ตั้งค่าใน .env เป็น REACT_APP_HIRING_DOCS_UPLOAD_URL
//   (โปรเจกต์นี้ใช้ Create React App ซึ่งต้องใช้ prefix REACT_APP_ ไม่ใช่ VITE_
//   เหมือนที่ระบุในสเปค — ถ้า endpoint จริงมาจากอีกระบบที่ใช้ Vite ให้ตั้งชื่อ env
//   คนละตัวที่นั่น ค่า URL เป็นค่าเดียวกัน)
// - Method POST, ห้ามตั้ง header Content-Type เอง (เลี่ยง CORS preflight)
// - body เป็น JSON string ตรง ๆ (fetch จะเซ็ต Content-Type เป็น text/plain ให้อัตโนมัติ
//   เมื่อไม่ได้ตั้ง header เอง ซึ่งเป็น "simple request" ไม่ trigger preflight)
// ---------------------------------------------------------------------------

export const HIRING_DOCS_UPLOAD_URL =
  (process.env.REACT_APP_HIRING_DOCS_UPLOAD_URL || "").trim();

export interface HiringDocUploadMeta {
  /** ต้องตรงกับที่ใช้ครั้งแรก (ชื่อเต็มผู้สมัคร/พนักงาน) */
  candidateName: string;
  /** ต้องตรงกับที่ใช้ครั้งแรก */
  position: string;
  /**
   * กุญแจที่ทำให้ไฟล์ไปลงโฟลเดอร์คนเดิม — ต้องดึงมาจาก record เดิมเท่านั้น
   * (เช่น candidateId / hiringPacketId จาก recruitment_pending_employees หรือ hiringPackets)
   * ห้ามสุ่ม/สร้างใหม่ ไม่งั้นจะได้โฟลเดอร์ซ้ำซ้อนใน Drive
   */
  candidateKey: string;
  /** ชื่อประเภทเอกสาร เช่น cert_xxx หรือพิมพ์เองก็ได้ */
  docType: string;
}

export interface HiringDocUploadResponse {
  success: boolean;
  url: string;
  fileId?: string;
  fileName?: string;
  folderUrl?: string;
  error?: string;
}

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:<mime>;base64,<data>" -> เอาแค่ส่วน base64 ล้วน ๆ
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });

/**
 * อัปโหลดไฟล์เอกสาร 1 ไฟล์ไปยัง Apps Script Web App เดิม (เก็บบน Google Drive
 * โฟลเดอร์ของผู้สมัคร/พนักงานคนนั้น จับคู่จาก candidateName_position_candidateKey)
 */
export const uploadHiringDocumentFile = async (
  file: File,
  meta: HiringDocUploadMeta
): Promise<HiringDocUploadResponse> => {
  if (!HIRING_DOCS_UPLOAD_URL) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า REACT_APP_HIRING_DOCS_UPLOAD_URL ใน .env (URL ของ Google Apps Script Web App สำหรับอัปโหลดเอกสาร)"
    );
  }
  if (!meta.candidateKey) {
    throw new Error("ไม่พบ candidateKey ของรายการนี้ — ห้ามอัปโหลดโดยไม่มี key เดิม (จะทำให้ได้โฟลเดอร์ซ้ำซ้อน)");
  }
  if (file.size > HIRING_DOCS_MAX_FILE_SIZE_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกินไป (จำกัดไม่เกิน ${HIRING_DOCS_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB)`);
  }

  const fileBase64 = await readFileAsBase64(file);

  const payload = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileBase64,
    candidateName: meta.candidateName,
    position: meta.position,
    candidateKey: meta.candidateKey,
    docType: meta.docType,
  };

  // สำคัญ: ห้ามตั้ง header "Content-Type" เอง เพื่อเลี่ยง CORS preflight (ตามสเปค)
  const res = await fetch(HIRING_DOCS_UPLOAD_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`อัปโหลดไม่สำเร็จ (HTTP ${res.status})`);
  }

  const data = (await res.json()) as HiringDocUploadResponse;
  if (!data.success) {
    throw new Error(data.error || "อัปโหลดไม่สำเร็จ (ระบบปลายทางแจ้ง success=false)");
  }
  return data;
};

/**
 * เติม attachment เข้า `recruitment_pending_employees/{hiringPacketId}.attachments`
 * ต่อท้าย array เดิมด้วย arrayUnion เสมอ (ห้าม setDoc ทับทั้ง doc เด็ดขาด)
 */
export const appendAttachmentToRecruitmentPending = async (
  hiringPacketId: string,
  attachment: HiringAttachment
): Promise<void> => {
  const db = getFirestore();
  const ref = doc(db, "CMG-HR-Database", "root", "recruitment_pending_employees", hiringPacketId);
  await updateDoc(ref, { attachments: arrayUnion(attachment) });
};

/**
 * เติม attachment เข้า `employee_data/{employeeCode}.attachments` — ใช้กรณีพนักงาน/แรงงาน
 * ที่เข้าระบบโดยไม่ผ่าน Recruitment (ไม่มี record ใน recruitment_pending_employees ให้อ้างอิง)
 * ใช้ endpoint อัปโหลดตัวเดิม แต่ candidateKey ในกรณีนี้คือรหัสพนักงานเอง (โฟลเดอร์ใหม่ของคนนี้)
 */
export const appendAttachmentToEmployee = async (
  employeeCode: string,
  attachment: HiringAttachment
): Promise<void> => {
  const db = getFirestore();
  const ref = doc(db, "CMG-HR-Database", "root", "employee_data", employeeCode);
  await updateDoc(ref, { attachments: arrayUnion(attachment) });
};
