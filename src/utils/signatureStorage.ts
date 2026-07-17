import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, getFirestore, updateDoc } from "firebase/firestore";

/**
 * ลายเซ็นดิจิทัลสำหรับผู้อนุมัติ/ผู้จัดทำเอกสาร (HR/HRM ในเบื้องต้น) เก็บเป็นรูปภาพใน Firebase Storage
 * แล้วบันทึก URL ไว้ที่ users/{uid}.signatureImageUrl เพื่อดึงมาแปะอัตโนมัติตอนสร้างเอกสาร
 * ลายเซ็นของพนักงาน/พยานจะไม่ใช้กลไกนี้ ต้องเซ็นสดด้วยมือเสมอ
 */
export const uploadUserSignature = async (uid: string, file: File): Promise<string> => {
  const storage = getStorage();
  const extension = file.type === "image/jpeg" ? "jpg" : "png";
  const path = `signatures/${uid}.${extension}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/png" });
  const url = await getDownloadURL(storageRef);

  const db = getFirestore();
  await updateDoc(doc(db, "CMG-HR-Database", "root", "users", uid), {
    signatureImageUrl: url,
    signatureUpdatedAt: Date.now(),
  });
  return url;
};

export const removeUserSignature = async (uid: string, existingUrl?: string): Promise<void> => {
  const db = getFirestore();
  await updateDoc(doc(db, "CMG-HR-Database", "root", "users", uid), {
    signatureImageUrl: "",
    signatureUpdatedAt: Date.now(),
  });
  if (!existingUrl) return;
  try {
    const storage = getStorage();
    await deleteObject(ref(storage, existingUrl));
  } catch {
    // ไม่มีสิทธิ์ลบไฟล์เดิม หรือ URL ไม่ตรงรูปแบบ path ของ storage — ปล่อยผ่าน ไม่กระทบการล้างค่าใน Firestore
  }
};
