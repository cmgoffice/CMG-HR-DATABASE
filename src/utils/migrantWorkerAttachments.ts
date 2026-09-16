import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { MigrantDocumentTypeKey } from "../components/migrantWorkerConfig";

/**
 * ไฟล์สแกนเอกสารแรงงานต่างด้าว (พาสปอร์ต/Work Permit/วีซ่า/Border Pass) เก็บที่
 * Firebase Storage ใต้ migrant-worker-documents/{employeeId}/{docType}/... โดยตั้งใจแยกจาก
 * "ข้อมูลเอกสาร" (เลขที่ + วันหมดอายุ) ซึ่งเก็บอยู่ใน employee_data ทะเบียนแรงงานเดิม
 */
export const uploadMigrantDocumentFile = async (
  employeeId: string,
  docType: MigrantDocumentTypeKey,
  file: File
): Promise<{ url: string; fileName: string }> => {
  const storage = getStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `migrant-worker-documents/${employeeId}/${docType}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, fileName: file.name };
};

export const removeMigrantDocumentFile = async (url: string): Promise<void> => {
  try {
    const storage = getStorage();
    await deleteObject(ref(storage, url));
  } catch {
    // ไม่มีสิทธิ์ลบไฟล์เดิม หรือ URL ไม่ตรงรูปแบบ path ของ storage — ปล่อยผ่าน ไม่กระทบการล้างค่าที่บันทึกไว้
  }
};
