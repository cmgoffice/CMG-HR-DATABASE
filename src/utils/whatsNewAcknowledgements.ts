import { doc, getFirestore, setDoc } from "firebase/firestore";

/**
 * บันทึกการ "รับทราบ" ประกาศ (What's New) ของผู้ใช้แต่ละคนไว้ที่ฝั่งเซิร์ฟเวอร์ (Firestore) เพิ่มเติมจาก
 * localStorage เดิม เพื่อให้ MasterAdmin/HRM ตรวจสอบย้อนหลังได้ว่าประกาศแต่ละฉบับมีใครรับทราบแล้วบ้าง
 * ที่หน้า Activity Log > แท็บ "Backlog ประกาศ"
 *
 * โครงสร้าง: CMG-HR-Database/root/whats_new_acknowledgements/{entryId__uid}
 * ใช้ doc id แบบกำหนดตายตัว (entryId + uid) เพื่อกันบันทึกซ้ำเวลากดรับทราบหลายครั้ง/หลายอุปกรณ์
 */
export const WHATS_NEW_ACKNOWLEDGEMENTS_COLLECTION = "whats_new_acknowledgements";

export interface WhatsNewAcknowledgementRecord {
  entryId: string;
  uid: string;
  userName: string;
  userRoles: string[];
  acknowledgedAt: number;
}

export const recordWhatsNewAcknowledgement = async (record: WhatsNewAcknowledgementRecord): Promise<void> => {
  try {
    const db = getFirestore();
    const docId = `${record.entryId}__${record.uid}`;
    await setDoc(doc(db, "CMG-HR-Database", "root", WHATS_NEW_ACKNOWLEDGEMENTS_COLLECTION, docId), record, {
      merge: true,
    });
  } catch {
    // บันทึกฝั่งเซิร์ฟเวอร์ไม่สำเร็จ (เช่น ออฟไลน์) — ไม่ต้องบล็อกผู้ใช้ ยังคงมี localStorage กันเด้งซ้ำได้ตามปกติ
  }
};
