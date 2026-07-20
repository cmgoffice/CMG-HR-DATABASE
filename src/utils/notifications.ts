import {
  addDoc,
  collection,
  doc,
  Firestore,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

export const NOTIFICATIONS_COLLECTION = "notifications";

export type FollowUpNotificationType =
  | "proposal_submitted"
  | "hrm_approved"
  | "hrm_commented"
  | "ready_to_close"
  | "case_closed"
  | "no_action"
  | "owner_assigned"
  | "case_reset";

export interface AppNotification {
  id: string;
  recipientUid: string;
  module: "follow_up";
  type: FollowUpNotificationType;
  title: string;
  message: string;
  caseId: string;
  read: boolean;
  createdAt: number;
  createdByUid: string;
  createdByName: string;
}

export interface CreateNotificationPayload {
  module: "follow_up";
  type: FollowUpNotificationType;
  title: string;
  message: string;
  caseId: string;
  createdByUid: string;
  createdByName: string;
}

/**
 * สร้างการแจ้งเตือนให้ผู้รับหลายคนพร้อมกัน (1 เอกสารต่อผู้รับ 1 คน)
 * ตัดผู้ส่ง (createdByUid) ออกจากรายชื่อผู้รับเสมอ เพื่อไม่แจ้งเตือนตัวเอง
 * เป็น fire-and-forget: ถ้าเขียนไม่สำเร็จจะไม่ throw ออกไปกระทบการบันทึกเคสหลัก
 */
export const createNotifications = async (
  db: Firestore,
  recipientUids: (string | undefined | null)[],
  payload: CreateNotificationPayload
): Promise<void> => {
  try {
    const uniqueRecipients = Array.from(
      new Set(
        recipientUids
          .map((uid) => (uid || "").trim())
          .filter((uid) => !!uid && uid !== payload.createdByUid)
      )
    );
    if (uniqueRecipients.length === 0) return;

    const now = Date.now();
    const col = collection(db, "CMG-HR-Database", "root", NOTIFICATIONS_COLLECTION);
    await Promise.all(
      uniqueRecipients.map((recipientUid) =>
        addDoc(col, {
          recipientUid,
          module: payload.module,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          caseId: payload.caseId,
          read: false,
          createdAt: now,
          createdByUid: payload.createdByUid,
          createdByName: payload.createdByName,
        })
      )
    );
  } catch (error) {
    // ไม่ให้การแจ้งเตือนล้มเหลวไปกระทบการบันทึกเคสหลัก แค่ log ไว้เฉยๆ
    console.error("createNotifications failed", error);
  }
};

export const markNotificationRead = async (db: Firestore, id: string): Promise<void> => {
  try {
    await updateDoc(doc(db, "CMG-HR-Database", "root", NOTIFICATIONS_COLLECTION, id), {
      read: true,
      readAt: Date.now(),
    });
  } catch (error) {
    console.error("markNotificationRead failed", error);
  }
};

export const markAllNotificationsRead = async (db: Firestore, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  try {
    const now = Date.now();
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, "CMG-HR-Database", "root", NOTIFICATIONS_COLLECTION, id), {
        read: true,
        readAt: now,
      });
    });
    await batch.commit();
  } catch (error) {
    console.error("markAllNotificationsRead failed", error);
  }
};
