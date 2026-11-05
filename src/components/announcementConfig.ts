// ---------------------------------------------------------------------------
// Announcement config (ระบบ "ประกาศภายในบริษัท")
//
// Firestore path: CMG-HR-Database/root/announcements/{id}
// เลขที่เอกสารออกโดย src/utils/documentNumbering.ts -> getNextAnnouncementDocumentNumber
// (แยกรันเลขเป็นของตัวเอง เริ่ม 001 ใหม่ แยกตามหมวดหมู่ + ปี พ.ศ. — ดู ANNOUNCEMENT_CATEGORY_PREFIX)
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

export type AnnouncementCategoryCode =
  | "general"
  | "holiday"
  | "policy"
  | "personnel"
  | "welfare"
  | "safety"
  | "event"
  | "other";

export interface AnnouncementCategoryOption {
  code: AnnouncementCategoryCode;
  label: string;
  description: string;
}

/** หมวดหมู่ประกาศมาตรฐาน — แต่ละหมวดรันเลขที่เอกสารแยกจากกัน (ดู ANNOUNCEMENT_CATEGORY_PREFIX ใน documentNumbering.ts) */
export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategoryOption[] = [
  { code: "general", label: "ทั่วไป", description: "ประกาศทั่วไปที่ไม่เข้าหมวดอื่น" },
  { code: "holiday", label: "วันหยุด / ปฏิทินทำงาน", description: "วันหยุดประเพณี วันหยุดพิเศษ ตารางทำงาน" },
  { code: "policy", label: "นโยบาย / ระเบียบ", description: "ระเบียบข้อบังคับ นโยบายบริษัท" },
  { code: "personnel", label: "บุคคล (แต่งตั้ง/โยกย้าย/เลื่อนตำแหน่ง)", description: "แต่งตั้ง โยกย้าย เลื่อนตำแหน่ง พ้นสภาพ" },
  { code: "welfare", label: "สวัสดิการ", description: "สวัสดิการ สิทธิประโยชน์พนักงาน" },
  { code: "safety", label: "ความปลอดภัย", description: "ความปลอดภัยในการทำงาน อาชีวอนามัย" },
  { code: "event", label: "กิจกรรม / CSR", description: "กิจกรรมบริษัท งานเลี้ยง CSR" },
  { code: "other", label: "อื่น ๆ", description: "เรื่องอื่น ๆ ที่ไม่เข้าหมวดข้างต้น" },
];

export const announcementCategoryLabel = (code: string): string =>
  ANNOUNCEMENT_CATEGORIES.find((c) => c.code === code)?.label || code;

/** แถวตารางประกอบ (เช่น ตารางวันหยุดประเพณี: ลำดับ/วันที่/วัน/รายการ) — ใช้ได้กับทุกหมวด ไม่บังคับใส่ */
export interface AnnouncementTableRow {
  cells: string[];
}

export interface AnnouncementTable {
  headers: string[];
  rows: AnnouncementTableRow[];
}

export interface AnnouncementRecord {
  id: string;
  categoryCode: AnnouncementCategoryCode;
  title: string;
  /** บรรทัดขึ้นต้น เช่น "เรียน พนักงานทุกท่าน" */
  salutation: string;
  /** เนื้อหาแบ่งเป็นย่อหน้า (แต่ละสมาชิกคือ 1 ย่อหน้า) */
  bodyParagraphs: string[];
  table?: AnnouncementTable | null;
  /** รูปภาพประกอบ (แนบได้หลายรูป) — แปะเป็นหน้าต่อท้าย PDF ให้อัตโนมัติตอนสร้างเอกสาร */
  attachments?: string[];
  closingNote?: string;
  signerName: string;
  signerTitle: string;
  effectiveDate?: string; // yyyy-MM-dd
  status: "draft" | "issued";
  documentNumber?: string;
  pdfUrl?: string;
  issuedAt?: number;
  issuedByUid?: string;
  issuedByName?: string;
  createdAt: number;
  createdByUid: string;
  createdByName: string;
  updatedAt: number;
}

const COLLECTION_PATH = ["CMG-HR-Database", "root", "announcements"] as const;

export type AnnouncementDraftInput = Omit<
  AnnouncementRecord,
  "id" | "createdAt" | "updatedAt" | "status" | "documentNumber" | "pdfUrl" | "issuedAt" | "issuedByUid" | "issuedByName"
>;

export const subscribeAnnouncements = (
  onChange: (records: AnnouncementRecord[]) => void
): (() => void) => {
  const db = getFirestore();
  const q = query(collection(db, ...COLLECTION_PATH), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnnouncementRecord, "id">) })));
    },
    () => onChange([])
  );
};

export const useAnnouncements = (): AnnouncementRecord[] => {
  const [records, setRecords] = useState<AnnouncementRecord[]>([]);
  useEffect(() => subscribeAnnouncements(setRecords), []);
  return records;
};

/** สร้างร่างประกาศใหม่ (ยังไม่มีเลขที่เอกสาร) */
export const createAnnouncementDraft = async (input: AnnouncementDraftInput): Promise<string> => {
  const db = getFirestore();
  const now = Date.now();
  const ref = await addDoc(collection(db, ...COLLECTION_PATH), {
    ...input,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
};

export const updateAnnouncementDraft = async (
  id: string,
  input: Partial<AnnouncementDraftInput>
): Promise<void> => {
  const db = getFirestore();
  await updateDoc(doc(db, ...COLLECTION_PATH, id), { ...input, updatedAt: Date.now() });
};

/** บันทึกผลการออกประกาศจริง (เลขที่เอกสาร + ลิงก์ไฟล์ PDF) หลังขอเลขที่จาก getNextAnnouncementDocumentNumber แล้ว */
export const markAnnouncementIssued = async (
  id: string,
  info: { documentNumber: string; pdfUrl?: string; issuedByUid: string; issuedByName: string }
): Promise<void> => {
  const db = getFirestore();
  const now = Date.now();
  await updateDoc(doc(db, ...COLLECTION_PATH, id), {
    status: "issued",
    documentNumber: info.documentNumber,
    pdfUrl: info.pdfUrl || null,
    issuedAt: now,
    issuedByUid: info.issuedByUid,
    issuedByName: info.issuedByName,
    updatedAt: now,
  });
};

export const deleteAnnouncementDraft = async (id: string): Promise<void> => {
  const db = getFirestore();
  await deleteDoc(doc(db, ...COLLECTION_PATH, id));
};
