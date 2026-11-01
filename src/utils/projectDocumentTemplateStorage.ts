import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * ไฟล์แบบฟอร์มเปล่า (template) เฉพาะของแต่ละโครงการ สำหรับประเภทเอกสารหนึ่งๆ
 * เก็บที่ Firebase Storage ใต้ project-document-templates/{projectId}/{docType}/...
 * (แยกจาก default template ของบริษัทที่เก็บไว้ใน documentTypeCatalog.defaultTemplates)
 */
export const uploadProjectDocumentTemplate = async (
  projectId: string,
  docType: string,
  file: File
): Promise<{ url: string; fileName: string; uploadedAt: number }> => {
  const storage = getStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `project-document-templates/${projectId}/${docType}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, fileName: file.name, uploadedAt: Date.now() };
};

export const removeProjectDocumentTemplate = async (url: string): Promise<void> => {
  try {
    const storage = getStorage();
    await deleteObject(ref(storage, url));
  } catch {
    // ไม่มีสิทธิ์ลบหรือ URL ไม่ตรง path — ปล่อยผ่าน
  }
};
