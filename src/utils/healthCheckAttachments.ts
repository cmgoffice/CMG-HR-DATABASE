import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * ไฟล์ใบรับรองแพทย์ (ผลตรวจสุขภาพก่อนเข้างาน) เก็บที่ Firebase Storage ใต้
 * health-check-documents/{employeeId}/{timestamp}-{safeFileName}
 * แยกตามโฟลเดอร์รายคนตามที่ตกลงกันไว้ (หาไฟล์ย้อนหลังของคนๆ นั้นได้ง่าย)
 *
 * fileName ที่ส่งเข้ามาควรผ่าน buildHealthCheckFileName() มาก่อนแล้ว
 * (รูปแบบ: {เลขโครงการ}_{ชื่อ}_{วันที่ตรวจ}.{นามสกุลไฟล์})
 */
export const uploadHealthCheckFile = async (
  employeeId: string,
  file: File,
  displayFileName: string
): Promise<{ url: string; fileName: string }> => {
  const storage = getStorage();
  const safeName = displayFileName.replace(/[^a-zA-Z0-9ก-๙._-]/g, "_");
  const path = `health-check-documents/${employeeId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, fileName: displayFileName };
};
