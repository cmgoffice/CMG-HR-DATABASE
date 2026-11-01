import { uploadHiringDocumentFile } from "./hiringDocsAttachments";

/**
 * ไฟล์ใบรับรองแพทย์ (ผลตรวจสุขภาพก่อนเข้างาน) — เก็บที่เดียวกับเอกสารพนักงานอื่น ๆ
 * (Google Drive ผ่าน Apps Script Web App ตัวเดิมที่ระบบ Recruitment/เอกสารพนักงานใช้อยู่
 * ดู src/utils/hiringDocsAttachments.ts) ห้ามสร้างที่เก็บ/โฟลเดอร์ใหม่แยกต่างหาก
 *
 * โฟลเดอร์ย่อยจะถูกจับคู่ด้วย candidateKey = employeeId (คนเดิม เอกสารประเภทไหนก็ไปลง
 * โฟลเดอร์เดียวกัน) ส่วนชื่อไฟล์จริงใน Drive จะใช้ displayFileName ที่ผ่าน
 * buildHealthCheckFileName() มาแล้ว (รูปแบบ: {เลขโครงการ}_{ชื่อ}_{วันที่ตรวจ}.{นามสกุลไฟล์})
 * เพื่อให้หาไฟล์ย้อนหลังง่ายตามที่ตกลงกันไว้
 */
export const uploadHealthCheckFile = async (
  employeeId: string,
  file: File,
  displayFileName: string,
  employeeName: string,
  position?: string
): Promise<{ url: string; fileName: string }> => {
  // เปลี่ยนชื่อไฟล์ก่อนส่งขึ้น Drive ให้ตรงกับ displayFileName ที่ต้องการ (ไม่ใช้ชื่อไฟล์เดิมจากเครื่องคลินิก)
  const renamed = new File([file], displayFileName, { type: file.type || "application/octet-stream" });
  const result = await uploadHiringDocumentFile(renamed, {
    candidateName: employeeName || employeeId,
    position: position || "",
    candidateKey: employeeId,
    docType: "health_check",
  });
  return { url: result.url, fileName: result.fileName || displayFileName };
};
