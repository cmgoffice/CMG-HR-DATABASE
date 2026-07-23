import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * เอกสารประกอบการย้ายโครงการ (บัตรประชาชน ประกัน ใบรับรองแพทย์ ฯลฯ)
 * เก็บที่ Firebase Storage ใต้ transfer-attachments/{transferId}/...
 */
export const uploadTransferAttachment = async (transferId: string, file: File): Promise<string> => {
  const storage = getStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `transfer-attachments/${transferId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
  });
  return getDownloadURL(storageRef);
};

export const removeTransferAttachment = async (url: string): Promise<void> => {
  try {
    const storage = getStorage();
    await deleteObject(ref(storage, url));
  } catch {
    // ไม่มีสิทธิ์ลบหรือ URL ไม่ตรง path — ปล่อยผ่าน
  }
};
