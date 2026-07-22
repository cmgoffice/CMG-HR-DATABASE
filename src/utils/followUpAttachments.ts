import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * ภาพประกอบ/หลักฐานที่แนบมากับร่างเอกสาร (เช่น ภาพเหตุการณ์ ภาพหลักฐานการกระทำผิด) เก็บไว้ที่
 * Firebase Storage ใต้ follow-up-attachments/{caseId}/... แล้วเก็บ URL ไว้ใน documentDraft.attachments
 * (อาเรย์ เพราะแนบได้หลายภาพ) เมื่อออกเอกสารจริง ระบบจะแปะภาพเหล่านี้เป็นหน้าต่อท้าย PDF ให้อัตโนมัติ
 */
export const uploadFollowUpAttachment = async (caseId: string, file: File): Promise<string> => {
  const storage = getStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `follow-up-attachments/${caseId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
};

export const removeFollowUpAttachment = async (url: string): Promise<void> => {
  try {
    const storage = getStorage();
    await deleteObject(ref(storage, url));
  } catch {
    // ไม่มีสิทธิ์ลบไฟล์เดิม หรือ URL ไม่ตรงรูปแบบ path ของ storage — ปล่อยผ่าน ไม่กระทบการล้างค่าที่บันทึกไว้
  }
};
