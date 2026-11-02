import { generatePublicToken } from "./trainingBatchConfig";

// ---------------------------------------------------------------------------
// ลิงก์สาธารณะส่งให้ "พนักงาน CMG รายคน" แนบเอกสารของตัวเองที่ยังขาดอยู่
// (ต่างจาก training_contractor_links ที่เป็นของผู้รับเหมา/Supply manpower และ
// ผูกบริษัท — อันนี้ผูกกับพนักงาน 1 คนโดยตรง ใช้ได้กับพนักงานทุกกลุ่ม เช่น
// Staff Monthly / DC Daily ที่ HR กรอกไว้ในระบบแล้วแต่เอกสารยังไม่ครบ)
//
// HR เลือกรายการ "ประเภทเอกสารที่ขาด" ไว้ตอนสร้างลิงก์ (requestedDocTypes) —
// หน้า public จะโชว์ checklist ให้เห็นชัดว่าขาดอะไรบ้าง แนบแล้วติ๊กครบอัตโนมัติ
// ไฟล์ที่แนบจะถูกเก็บเข้า employee_data/{id}.attachments เหมือนช่องทางอื่นๆ ทุกจุด
// (หน้า "เอกสารพนักงาน", หน้าผู้รับเหมา ฯลฯ ใช้ attachments ชุดเดียวกันหมด)
//
// Firestore path: CMG-HR-Database/root/employee_document_links/{token}
//   (ใช้ token เป็น document id โดยตรง เพื่อให้หน้า public เปิดดูได้ด้วย getDoc เดียว)
// ---------------------------------------------------------------------------

export const EMPLOYEE_DOCUMENT_LINKS_COLLECTION = "employee_document_links";

export interface EmployeeDocumentLink {
  id: string; // = token
  employeeId: string; // = employee_data doc id
  employeeCode?: string; // snapshot ไว้แสดงผล เผื่อข้อมูลพนักงานเปลี่ยนภายหลัง
  employeeName?: string;
  // ประเภทเอกสารที่ HR ระบุว่าคนนี้ขาด (value ตรงกับ documentTypeCatalog) — ถ้าไม่ระบุเลย (ว่าง)
  // ถือว่าเปิดกว้างให้แนบไฟล์ประเภทไหนก็ได้ ไม่มี checklist บังคับ
  requestedDocTypes?: string[];
  note?: string;
  createdAt: number;
  createdByUid?: string;
  createdByName?: string;
}

export const buildEmployeeDocumentPortalUrl = (token: string): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/my-documents/${token}`;
};

export const createEmployeeDocumentLinkToken = (): string => generatePublicToken();
