import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { WHATS_NEW_ENTRIES } from "../config/whatsNew";
import { useAuth } from "../auth/AuthContext";
import { recordWhatsNewAcknowledgement } from "../utils/whatsNewAcknowledgements";

const DISMISSED_IDS_KEY = "cmg_whats_new_dismissed_ids";
const SNOOZE_UNTIL_KEY = "cmg_whats_new_snooze_until";

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const readDismissedIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const WhatsNewModal = () => {
  const { userProfile, firebaseUser } = useAuth();
  const [open, setOpen] = useState(false);
  // คิวประกาศที่ผู้ใช้คนนี้ยังไม่รับทราบ เรียงเก่า -> ใหม่ (ตามลำดับใน WHATS_NEW_ENTRIES) แสดงทีละ 1 รายการ
  // ต้องกด "รับทราบแล้ว" ให้ครบทุกรายการก่อน ถึงจะไม่มีป๊อปอัปนี้ขึ้นมาอีก (แต่ละรายการหายไปเฉพาะตัวที่กดรับทราบ)
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const userRoles = userProfile?.role || [];

  useEffect(() => {
    if (!userProfile) return;
    const snoozedUntil = localStorage.getItem(SNOOZE_UNTIL_KEY);
    if (snoozedUntil && snoozedUntil >= todayStr()) return;

    const dismissedIds = new Set(readDismissedIds());
    const pending = WHATS_NEW_ENTRIES.filter((entry) => {
      if (dismissedIds.has(entry.id)) return false;
      if (!entry.targetRoles || entry.targetRoles.length === 0) return true;
      return entry.targetRoles.some((role) => userRoles.includes(role));
    }).map((entry) => entry.id);
    if (pending.length > 0) {
      setPendingIds(pending);
      setOpen(true);
    }
  }, [userProfile, userRoles]);

  const pendingEntries = useMemo(
    () => WHATS_NEW_ENTRIES.filter((entry) => pendingIds.includes(entry.id)),
    [pendingIds]
  );
  // แสดงประกาศเก่าสุดที่ยังไม่รับทราบก่อนเสมอ ทีละรายการ ไล่มาจนครบคิว
  const currentEntry = pendingEntries[0];

  if (!open || !currentEntry) return null;

  const close = () => setOpen(false);

  const handleSnoozeToday = () => {
    localStorage.setItem(SNOOZE_UNTIL_KEY, todayStr());
    close();
  };

  // รับทราบเฉพาะรายการที่กำลังแสดงอยู่ (ไม่ใช่ทั้งคิว) แล้วเลื่อนไปแสดงรายการถัดไปในคิวต่อทันที
  // ถ้าหมดคิวแล้วค่อยปิดหน้าต่าง — บันทึกฝั่งเซิร์ฟเวอร์ด้วยเพื่อให้ตรวจสอบย้อนหลังได้ว่าใครรับทราบแล้วบ้าง
  const handleAcknowledgeCurrent = () => {
    const existing = new Set(readDismissedIds());
    existing.add(currentEntry.id);
    localStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify(Array.from(existing)));
    if (firebaseUser) {
      const userName = `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() || firebaseUser.email || firebaseUser.uid;
      void recordWhatsNewAcknowledgement({
        entryId: currentEntry.id,
        uid: firebaseUser.uid,
        userName,
        userRoles: userProfile?.role || [],
        acknowledgedAt: Date.now(),
      });
    }
    const remaining = pendingIds.filter((id) => id !== currentEntry.id);
    setPendingIds(remaining);
    if (remaining.length === 0) close();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles size={20} />
            <h2 className="text-base font-bold">มีอัปเดตใหม่ในระบบ</h2>
            {pendingEntries.length > 1 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                เหลืออีก {pendingEntries.length} รายการ
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{currentEntry.title}</h3>
              <span className="shrink-0 text-[11px] font-medium text-slate-400">{currentEntry.date}</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
              {currentEntry.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
          {/* ต้องกด "รับทราบแล้ว" ทีละรายการให้ครบคิว ป๊อปอัปนี้จะเด้งขึ้นถัดไปทันทีจนกว่าจะรับทราบครบทุกรายการ */}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            ปิด (เตือนอีกครั้งพรุ่งนี้)
          </button>
          <button
            type="button"
            onClick={handleSnoozeToday}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ไม่ต้องแสดงอีกวันนี้
          </button>
          <button
            type="button"
            onClick={handleAcknowledgeCurrent}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            รับทราบแล้ว{pendingEntries.length > 1 ? " (ไปรายการถัดไป)" : " ไม่ต้องแสดงอีก"}
          </button>
        </div>
      </div>
    </div>
  );
};
