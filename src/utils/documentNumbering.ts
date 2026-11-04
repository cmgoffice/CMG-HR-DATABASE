import { doc, runTransaction } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { FollowUpTemplateKey } from "./followUpDocuments";

/**
 * รูปแบบเลขที่เอกสาร: "<รหัสฟอร์ม>-<ลำดับ 3 หลัก>/<ปี พ.ศ.>" เช่น "FM-HR-018-005/2569"
 * - แยกรันเลขตามประเภทฟอร์ม (warning_memo / warning_letter / termination_notice) แต่ละฟอร์มเริ่มที่ 001 ของตัวเอง
 * - รีเซ็ตกลับเป็น 001 ทุกต้นปี (ปี พ.ศ.) ตามธรรมเนียมเอกสารราชการ/บริษัทไทย
 * - ออกเลขที่ ณ ตอนออกเอกสารจริง (เมื่อ HRM อนุมัติแล้วกดปุ่ม "ออกเอกสาร") ไม่ใช่ตอนดูร่าง/พรีวิว
 */

const FORM_CODE_BY_TEMPLATE: Record<FollowUpTemplateKey, string> = {
  warning_memo: "FM-HR-017",
  warning_letter: "FM-HR-018",
  termination_notice: "FM-HR-TERM",
};

const DOCUMENT_COUNTERS_COLLECTION = "document_counters";

const toBuddhistYear = (date: Date): number => date.getFullYear() + 543;

/**
 * รหัสหมวดหมู่ "ประกาศภายในบริษัท" (แยกรันเลขเอกสารอิสระจากฟอร์ม FM-HR เดิมทั้งหมด — เริ่มนับ 001 ใหม่ของตัวเอง)
 * รูปแบบเลขที่: "AN-HR-<รหัสหมวด>-<ลำดับ 3 หลัก>/<ปี พ.ศ.>" เช่น "AN-HR-HOL-001/2569"
 * เพิ่มหมวดใหม่ได้ด้วยการเพิ่ม key ในนี้ — แต่ละหมวดจะเริ่มรันที่ 001 ของตัวเองโดยอัตโนมัติ (ไม่กระทบหมวดอื่น)
 */
export const ANNOUNCEMENT_CATEGORY_PREFIX: Record<string, string> = {
  general: "AN-HR-GEN",
  holiday: "AN-HR-HOL",
  policy: "AN-HR-POL",
  personnel: "AN-HR-PER",
  welfare: "AN-HR-WEL",
  safety: "AN-HR-SAF",
  event: "AN-HR-EVT",
  other: "AN-HR-OTH",
};

/**
 * ขอเลขที่ "ประกาศ" ถัดไปแบบอะตอมมิก แยกรันเลขตามหมวดหมู่ + ปี (พ.ศ.) เหมือนกับเอกสาร follow-up
 * เรียกใช้เฉพาะตอนกด "ออกประกาศ" จริงเท่านั้น ห้ามเรียกตอนดูร่าง/พรีวิว
 */
export const getNextAnnouncementDocumentNumber = async (
  db: Firestore,
  categoryCode: string,
  now: number = Date.now()
): Promise<string> => {
  const prefix = ANNOUNCEMENT_CATEGORY_PREFIX[categoryCode] || ANNOUNCEMENT_CATEGORY_PREFIX.other;
  const year = toBuddhistYear(new Date(now));
  const counterId = `announcement_${categoryCode}_${year}`;
  const counterRef = doc(db, "CMG-HR-Database", "root", DOCUMENT_COUNTERS_COLLECTION, counterId);

  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().count) || 0 : 0;
    const next = current + 1;
    tx.set(
      counterRef,
      { count: next, prefix, categoryCode, year, updatedAt: now },
      { merge: true }
    );
    return next;
  });

  const seqText = String(nextSeq).padStart(3, "0");
  return `${prefix}-${seqText}/${year}`;
};

/**
 * ขอเลขที่เอกสารถัดไปแบบอะตอมมิก (กันเลขชนกันเมื่อมีคนออกเอกสารพร้อมกัน) แล้วคืนค่าเป็นสตริงที่จัดรูปแบบแล้ว
 * เรียกใช้เฉพาะตอนออกเอกสารจริงเท่านั้น ห้ามเรียกตอนพรีวิว/ร่าง เพราะจะทำให้เลขกระโดดข้ามโดยไม่มีเอกสารจริงรองรับ
 */
export const getNextFollowUpDocumentNumber = async (
  db: Firestore,
  templateKey: FollowUpTemplateKey,
  now: number = Date.now()
): Promise<string> => {
  const formCode = FORM_CODE_BY_TEMPLATE[templateKey];
  const year = toBuddhistYear(new Date(now));
  const counterId = `${templateKey}_${year}`;
  const counterRef = doc(db, "CMG-HR-Database", "root", DOCUMENT_COUNTERS_COLLECTION, counterId);

  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().count) || 0 : 0;
    const next = current + 1;
    tx.set(
      counterRef,
      { count: next, formCode, templateKey, year, updatedAt: now },
      { merge: true }
    );
    return next;
  });

  const seqText = String(nextSeq).padStart(3, "0");
  return `${formCode}-${seqText}/${year}`;
};
