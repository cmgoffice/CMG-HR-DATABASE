import React, { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import { CheckCircle2, ChevronDown, ChevronUp, Megaphone, XCircle } from "lucide-react";
import { WHATS_NEW_ENTRIES } from "../config/whatsNew";
import type { UserRole } from "../auth/AuthContext";
import { WHATS_NEW_ACKNOWLEDGEMENTS_COLLECTION } from "../utils/whatsNewAcknowledgements";

interface AppUserLite {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole[];
  status?: string;
}

interface AckRecord {
  entryId: string;
  uid: string;
  userName: string;
  userRoles?: string[];
  acknowledgedAt: number;
}

const userDisplayName = (user: AppUserLite): string =>
  `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.uid;

const formatDateTime = (ms: number): string =>
  ms ? new Date(ms).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";

/**
 * แท็บ "Backlog ประกาศ" ในหน้า Activity Log — รวมประกาศ (What's New) ทั้งหมดที่เคยแจ้งไปแล้ว
 * และให้ MasterAdmin/HRM ตรวจสอบย้อนหลังได้ว่าแต่ละฉบับ "ใครรับทราบแล้วบ้าง" และ "ใครยังไม่รับทราบ"
 * เทียบกับกลุ่มผู้ใช้เป้าหมาย (targetRoles) ของประกาศนั้น
 */
export const WhatsNewBacklogTab = () => {
  const db = getFirestore();
  const [users, setUsers] = useState<AppUserLite[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<AckRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string>("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", "users"), (snap) => {
      setUsers(snap.docs.map((item) => ({ uid: item.id, ...(item.data() as any) } as AppUserLite)));
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "CMG-HR-Database", "root", WHATS_NEW_ACKNOWLEDGEMENTS_COLLECTION),
      (snap) => {
        setAcknowledgements(snap.docs.map((item) => item.data() as AckRecord));
      }
    );
    return () => unsub();
  }, [db]);

  const approvedUsers = useMemo(() => users.filter((user) => (user.status || "approved") === "approved"), [users]);

  const rows = useMemo(
    () =>
      WHATS_NEW_ENTRIES.map((entry) => {
        const targetUsers = entry.targetRoles && entry.targetRoles.length > 0
          ? approvedUsers.filter((user) => (user.role || []).some((role) => entry.targetRoles!.includes(role)))
          : approvedUsers;
        const ackForEntry = acknowledgements.filter((ack) => ack.entryId === entry.id);
        const ackUidSet = new Set(ackForEntry.map((ack) => ack.uid));
        const acknowledgedUsers = targetUsers
          .filter((user) => ackUidSet.has(user.uid))
          .map((user) => ({
            user,
            acknowledgedAt: ackForEntry.find((ack) => ack.uid === user.uid)?.acknowledgedAt || 0,
          }))
          .sort((a, b) => b.acknowledgedAt - a.acknowledgedAt);
        const pendingUsers = targetUsers.filter((user) => !ackUidSet.has(user.uid));
        return { entry, targetUsers, acknowledgedUsers, pendingUsers };
      }),
    [approvedUsers, acknowledgements]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-indigo-600">
            <Megaphone size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Backlog ประกาศ</h2>
            <p className="mt-1 text-sm text-slate-600">
              รวมประกาศ (มีอัปเดตใหม่ในระบบ) ทั้งหมดที่เคยแจ้งผู้ใช้งานไปแล้ว ตรวจสอบได้ว่าแต่ละฉบับมีใครกด
              "รับทราบแล้ว" ไปแล้วบ้าง และใครยังไม่รับทราบเทียบกับกลุ่มผู้ใช้เป้าหมายของประกาศนั้น
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map(({ entry, targetUsers, acknowledgedUsers, pendingUsers }) => {
          const isExpanded = expandedId === entry.id;
          const ackPercent = targetUsers.length > 0 ? Math.round((acknowledgedUsers.length / targetUsers.length) * 100) : 0;
          return (
            <div key={entry.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? "" : entry.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{entry.title}</span>
                    <span className="shrink-0 text-[11px] font-medium text-slate-400">{entry.date}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {entry.targetRoles && entry.targetRoles.length > 0
                      ? `กลุ่มเป้าหมาย: ${entry.targetRoles.join(", ")}`
                      : "กลุ่มเป้าหมาย: ผู้ใช้งานทุกคน"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-800">
                      {acknowledgedUsers.length} / {targetUsers.length} รับทราบแล้ว
                    </div>
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full ${ackPercent === 100 ? "bg-emerald-500" : "bg-sky-500"}`}
                        style={{ width: `${ackPercent}%` }}
                      />
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="grid gap-4 border-t border-slate-100 px-5 py-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={14} />
                      รับทราบแล้ว ({acknowledgedUsers.length})
                    </div>
                    {acknowledgedUsers.length === 0 ? (
                      <div className="text-xs text-slate-400">ยังไม่มีใครรับทราบ</div>
                    ) : (
                      <ul className="space-y-1.5">
                        {acknowledgedUsers.map(({ user, acknowledgedAt }) => (
                          <li key={user.uid} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-700">{userDisplayName(user)}</span>
                            <span className="shrink-0 text-slate-400">{formatDateTime(acknowledgedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-rose-600">
                      <XCircle size={14} />
                      ยังไม่รับทราบ ({pendingUsers.length})
                    </div>
                    {pendingUsers.length === 0 ? (
                      <div className="text-xs text-slate-400">รับทราบครบทุกคนแล้ว</div>
                    ) : (
                      <ul className="space-y-1.5">
                        {pendingUsers.map((user) => (
                          <li key={user.uid} className="text-xs text-slate-600">
                            {userDisplayName(user)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
