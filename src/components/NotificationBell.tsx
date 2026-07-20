import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getFirestore, onSnapshot, query, where } from "firebase/firestore";
import { Bell, Check } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  AppNotification,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_COLLECTION,
} from "../utils/notifications";

const OPEN_CASE_STORAGE_KEY = "cmg_open_follow_up_case";
const MAX_VISIBLE = 30;

const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} วันที่แล้ว`;
};

export const NotificationBell = ({
  setActiveModule,
}: {
  setActiveModule: (id: string) => void;
}) => {
  const { firebaseUser } = useAuth();
  const db = getFirestore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, "CMG-HR-Database", "root", NOTIFICATIONS_COLLECTION),
      where("recipientUid", "==", uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setNotifications(rows.slice(0, MAX_VISIBLE));
    });
    return () => unsub();
  }, [db, firebaseUser?.uid]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const handleRowClick = (notification: AppNotification) => {
    if (!notification.read) void markNotificationRead(db, notification.id);
    if (notification.caseId) {
      sessionStorage.setItem(OPEN_CASE_STORAGE_KEY, notification.caseId);
    }
    setOpen(false);
    setActiveModule("risk_monitoring");
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    void markAllNotificationsRead(db, unreadIds);
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        aria-label="การแจ้งเตือน"
        title="การแจ้งเตือน"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-80 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-bold">การแจ้งเตือน</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-800"
              >
                <Check size={12} />
                ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">ไม่มีการแจ้งเตือน</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleRowClick(notification)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                    !notification.read ? "bg-sky-50/60" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      !notification.read ? "bg-sky-500" : "bg-transparent"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800">{notification.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{notification.message}</div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {formatRelativeTime(notification.createdAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
