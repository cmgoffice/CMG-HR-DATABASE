import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 420;
const PANEL_GAP = 8;

interface PanelCoords {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
}

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
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
      const target = e.target as Node;
      const clickedButton = buttonRef.current && buttonRef.current.contains(target);
      const clickedPanel = panelRef.current && panelRef.current.contains(target);
      if (!clickedButton && !clickedPanel) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateCoords = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();

      // Anchor the panel's right edge to the button's right edge, but clamp
      // it horizontally so it can never extend past either viewport edge.
      // (Bug fix: previously this used CSS `right` computed from the button,
      // which - for a button sitting near the left edge of a narrow sidebar -
      // pushed a 320px-wide panel far off the left side of the screen.)
      const idealLeft = rect.right - PANEL_WIDTH;
      const maxLeft = window.innerWidth - PANEL_WIDTH - PANEL_GAP;
      const left = Math.min(Math.max(idealLeft, PANEL_GAP), Math.max(maxLeft, PANEL_GAP));

      const spaceAbove = rect.top - PANEL_GAP;
      const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;

      if (preferBelow) {
        setCoords({
          top: rect.bottom + PANEL_GAP,
          left,
          // Never exceed the actually available space - forcing a taller
          // minimum than what fits was the other source of clipping.
          maxHeight: Math.max(0, Math.min(PANEL_MAX_HEIGHT, spaceBelow)),
        });
      } else {
        setCoords({
          bottom: window.innerHeight - rect.top + PANEL_GAP,
          left,
          maxHeight: Math.max(0, Math.min(PANEL_MAX_HEIGHT, spaceAbove)),
        });
      }
    };
    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
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
    <div className="relative shrink-0">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
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

      {open && coords &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl z-50"
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: PANEL_WIDTH,
              maxHeight: coords.maxHeight,
            }}
          >
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
          </div>,
          document.body
        )}
    </div>
  );
};
