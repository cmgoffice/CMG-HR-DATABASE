// ---------------------------------------------------------------------------
// Document Type Catalog (ประเภทเอกสารที่ใช้ร่วมกันทั้งระบบ)
//
// รายการมาตรฐาน (HIRING_DOC_TYPE_OPTIONS) เป็นค่าตั้งต้นที่ฝังในโค้ด ส่วนประเภท
// เอกสารที่ HR เพิ่มขึ้นมาเอง (เช่น ตอนตั้งค่า "เอกสารที่จำเป็นของโครงการ" หรือตอน
// อัปโหลดเอกสารแล้วเลือก "อื่น ๆ (พิมพ์เอง)") จะถูกเก็บเพิ่มไว้ใน Firestore
// document เดียว แล้ว merge เข้ากับค่าตั้งต้นให้ใช้ร่วมกันได้ทุกหน้าในระบบ
//
// Firestore path: CMG-HR-Database/root/settings/document_type_catalog
//   { customTypes: { value: string; label: string }[] }
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { doc, getFirestore, onSnapshot, setDoc, arrayUnion, deleteField } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { HIRING_DOC_TYPE_OPTIONS } from "./recruitmentIntakeConfig";

export interface DocumentTypeOption {
  value: string;
  label: string;
}

/** ไฟล์แบบฟอร์ม/template เปล่าของประเภทเอกสาร (ให้พนักงานดาวน์โหลดไปกรอก) */
export interface DocumentTemplateInfo {
  url: string;
  fileName: string;
  uploadedAt: number;
}

const CATALOG_DOC_PATH = ["CMG-HR-Database", "root", "settings", "document_type_catalog"] as const;

const slugifyDocTypeValue = (label: string): string =>
  `custom_${label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "_")
    .replace(/^_+|_+$/g, "")}` || `custom_${Date.now()}`;

interface DocumentTypeCatalogData {
  customTypes?: DocumentTypeOption[];
  /** แก้ไขชื่อ (แก้คำผิด) ของประเภทเอกสาร ไม่ว่าจะเป็นค่าตั้งต้นในโค้ดหรือที่ HR เพิ่มเอง */
  labelOverrides?: Record<string, string>;
  /** รายการ value ของประเภทเอกสารที่ถูกลบออกจากระบบ (ซ่อนจากทุกหน้าที่ใช้ catalog นี้) */
  removedTypes?: string[];
  /**
   * แบบฟอร์มเปล่า (template) เริ่มต้นของบริษัท แยกตามประเภทเอกสาร — ใช้เป็นค่า fallback
   * เวลาโครงการไหนไม่ได้อัปโหลดแบบฟอร์มเฉพาะของตัวเองไว้ (ดู ProjectDocumentRequirement.templateUrl)
   */
  defaultTemplates?: Record<string, DocumentTemplateInfo>;
}

/** รวมรายการตั้งต้น + รายการที่ HR เพิ่มเอง แล้ว apply การแก้ไขชื่อ/ลบรายการทับ (ตัดค่าซ้ำโดยยึด value เป็นหลัก) */
export const mergeDocumentTypeOptions = (
  customTypes: DocumentTypeOption[],
  labelOverrides: Record<string, string> = {},
  removedTypes: string[] = []
): DocumentTypeOption[] => {
  const removedSet = new Set(removedTypes);
  const seen = new Set<string>();
  const merged: DocumentTypeOption[] = [];
  [...HIRING_DOC_TYPE_OPTIONS, ...customTypes].forEach((opt) => {
    const value = String(opt?.value || "").trim();
    let label = String(opt?.label || "").trim();
    if (!value || !label || seen.has(value) || removedSet.has(value)) return;
    seen.add(value);
    const override = labelOverrides[value];
    if (override && override.trim()) label = override.trim();
    merged.push({ value, label });
  });
  return merged;
};

export const subscribeDocumentTypeCatalog = (
  onChange: (options: DocumentTypeOption[]) => void
): (() => void) => {
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data() as DocumentTypeCatalogData | undefined;
      onChange(
        mergeDocumentTypeOptions(
          Array.isArray(data?.customTypes) ? data!.customTypes! : [],
          data?.labelOverrides || {},
          Array.isArray(data?.removedTypes) ? data!.removedTypes! : []
        )
      );
    },
    () => onChange(mergeDocumentTypeOptions([]))
  );
};

/** React hook: คืนรายการประเภทเอกสารทั้งหมด (ตั้งต้น + ที่ HR เพิ่มเอง) แบบ realtime */
export const useDocumentTypeCatalog = (): DocumentTypeOption[] => {
  const [options, setOptions] = useState<DocumentTypeOption[]>(HIRING_DOC_TYPE_OPTIONS);
  useEffect(() => subscribeDocumentTypeCatalog(setOptions), []);
  return options;
};

/** เพิ่มประเภทเอกสารใหม่เข้า catalog กลาง ให้ทุกหน้าที่ใช้ catalog นี้เห็นและเลือกใช้ซ้ำได้ */
export const addCustomDocumentType = async (label: string): Promise<DocumentTypeOption> => {
  const cleanLabel = label.trim();
  const value = slugifyDocTypeValue(cleanLabel);
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  await setDoc(ref, { customTypes: arrayUnion({ value, label: cleanLabel }) }, { merge: true });
  return { value, label: cleanLabel };
};

/** แก้ไขชื่อประเภทเอกสาร (แก้คำผิด) ให้มีผลทุกหน้าที่ใช้ catalog นี้ */
export const renameDocumentType = async (value: string, newLabel: string): Promise<void> => {
  const cleanValue = value.trim();
  const cleanLabel = newLabel.trim();
  if (!cleanValue || !cleanLabel) return;
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  await setDoc(ref, { labelOverrides: { [cleanValue]: cleanLabel } }, { merge: true });
};

/** ลบประเภทเอกสารออกจาก catalog กลาง (ซ่อนไม่ให้เลือกใช้อีก ไม่ว่าจะเป็นค่าตั้งต้นหรือที่เพิ่มเอง) */
export const removeDocumentType = async (value: string): Promise<void> => {
  const cleanValue = value.trim();
  if (!cleanValue) return;
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  await setDoc(ref, { removedTypes: arrayUnion(cleanValue) }, { merge: true });
};

export const subscribeDefaultDocumentTemplates = (
  onChange: (templates: Record<string, DocumentTemplateInfo>) => void
): (() => void) => {
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data() as DocumentTypeCatalogData | undefined;
      onChange(data?.defaultTemplates || {});
    },
    () => onChange({})
  );
};

/** React hook: คืน map ของแบบฟอร์มเริ่มต้นของบริษัท { [docType]: DocumentTemplateInfo } แบบ realtime */
export const useDefaultDocumentTemplates = (): Record<string, DocumentTemplateInfo> => {
  const [templates, setTemplates] = useState<Record<string, DocumentTemplateInfo>>({});
  useEffect(() => subscribeDefaultDocumentTemplates(setTemplates), []);
  return templates;
};

/** อัปโหลด/แทนที่แบบฟอร์มเริ่มต้นของบริษัทสำหรับประเภทเอกสารนี้ (fallback ให้ทุกโครงการที่ไม่มีแบบฟอร์มของตัวเอง) */
export const setDefaultDocumentTemplate = async (
  docType: string,
  file: File
): Promise<DocumentTemplateInfo> => {
  const storage = getStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `document-templates/default/${docType}/${Date.now()}-${safeName}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(fileRef);
  const info: DocumentTemplateInfo = { url, fileName: file.name, uploadedAt: Date.now() };

  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  await setDoc(ref, { defaultTemplates: { [docType]: info } }, { merge: true });
  return info;
};

/** ลบแบบฟอร์มเริ่มต้นของบริษัทสำหรับประเภทเอกสารนี้ */
export const removeDefaultDocumentTemplate = async (
  docType: string,
  existingUrl?: string
): Promise<void> => {
  const db = getFirestore();
  const ref = doc(db, ...CATALOG_DOC_PATH);
  await setDoc(ref, { [`defaultTemplates.${docType}`]: deleteField() }, { merge: true });
  if (!existingUrl) return;
  try {
    const storage = getStorage();
    await deleteObject(storageRef(storage, existingUrl));
  } catch {
    // ไม่มีสิทธิ์ลบไฟล์เดิม หรือ URL ไม่ตรงรูปแบบ path ของ storage — ปล่อยผ่าน
  }
};
