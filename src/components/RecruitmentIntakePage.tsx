import React, { useEffect, useMemo, useState } from "react";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import { AlertTriangle, Inbox, Loader2, Search } from "lucide-react";
import {
  buildFullName,
  getSourceGroup,
  RecruitmentPendingEmployee,
  RECRUITMENT_PENDING_EMPLOYEES_COLLECTION,
  RecruitmentSourceGroup,
  SOURCE_GROUP_META,
  toDateSafe,
} from "./recruitmentIntakeConfig";

// path ที่หน้านี้อ่านแบบ realtime เสมอ: CMG-HR-Database/root/recruitment_pending_employees
const FIRESTORE_PATH = "CMG-HR-Database/root/recruitment_pending_employees";

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  const d = toDateSafe(value as RecruitmentPendingEmployee["createdAt"]);
  return d ? d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "-";
};

const formatBenefits = (benefits: RecruitmentPendingEmployee["benefits"]): string => {
  if (!benefits || benefits.length === 0) return "-";
  return benefits
    .map((b) => `${b.label || "-"} ${b.amount ?? ""}${b.period ? `/${b.period}` : ""}`.trim())
    .join(", ");
};

export const RecruitmentIntakePage = () => {
  const [items, setItems] = useState<RecruitmentPendingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | RecruitmentSourceGroup>("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const db = getFirestore();
    const colRef = collection(db, "CMG-HR-Database", "root", RECRUITMENT_PENDING_EMPLOYEES_COLLECTION);

    // ไม่ filter ด้วย intakeStatus เพราะต้นทาง (ระบบ Recruitment) ยังไม่มี field นี้
    // แสดงเอกสารทั้งหมดใน collection ตามที่กำหนด
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as RecruitmentPendingEmployee));
        setItems(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Log ให้เห็นชัดเจนทั้ง error และ path ที่กำลังอ่าน เพื่อวิเคราะห์ต่อ
        console.error(`[RecruitmentIntakePage] Firestore read failed at path "${FIRESTORE_PATH}":`, err);
        setError(`อ่านข้อมูลจาก ${FIRESTORE_PATH} ไม่สำเร็จ: ${err.message}`);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((c) => (groupFilter === "all" ? true : getSourceGroup(c.source) === groupFilter))
      .filter((c) => {
        if (!kw) return true;
        const name = buildFullName(c).toLowerCase();
        return (
          name.includes(kw) ||
          (c.ตำแหน่ง || "").toLowerCase().includes(kw) ||
          (c.แผนก || "").toLowerCase().includes(kw) ||
          (c.โครงการ || "").toLowerCase().includes(kw)
        );
      });
  }, [items, groupFilter, search]);

  const counts = useMemo(() => {
    const result: Record<"all" | RecruitmentSourceGroup, number> = {
      all: items.length,
      external: 0,
      internal_transfer: 0,
      other: 0,
    };
    items.forEach((c) => {
      const g = getSourceGroup(c.source);
      result[g] += 1;
    });
    return result;
  }, [items]);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full">
      <div>
        <h2 className="text-lg font-bold text-gray-800">รายชื่อรอเพิ่มจาก Recruitment</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          ข้อมูลจากระบบ Recruitment แบบ realtime (อ่านอย่างเดียว) จาก <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{FIRESTORE_PATH}</code>
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto">
        {([
          { key: "all", label: "ทั้งหมด" },
          { key: "external", label: SOURCE_GROUP_META.external.label },
          { key: "internal_transfer", label: SOURCE_GROUP_META.internal_transfer.label },
          { key: "other", label: SOURCE_GROUP_META.other.label },
        ] as { key: "all" | RecruitmentSourceGroup; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setGroupFilter(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              groupFilter === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label} <span className="ml-1 text-xs font-bold text-gray-400">({counts[t.key] || 0})</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก / โครงการ..."
          className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={20} /> กำลังโหลดข้อมูล...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 text-red-500 gap-2 px-4 text-center">
            <AlertTriangle size={28} />
            <p className="text-sm font-semibold">เกิดข้อผิดพลาดในการอ่านข้อมูล</p>
            <p className="text-xs text-gray-500 max-w-md">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Inbox size={28} />
            <p className="text-sm">
              {items.length === 0 ? "ยังไม่มีข้อมูลในระบบ" : "ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ชื่อเต็ม</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">ตำแหน่ง</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">แผนก</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โครงการ</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">โทรศัพท์</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">วันเริ่มงาน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สถานะกลุ่มงาน</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">Pay Type</th>
                <th className="p-3 text-right font-semibold text-gray-600 border-b whitespace-nowrap">Salary</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">Benefits</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">Source</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">รหัสพนักงานเดิม</th>
                <th className="p-3 text-left font-semibold text-gray-600 border-b whitespace-nowrap">สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const group = getSourceGroup(c.source);
                const meta = SOURCE_GROUP_META[group];
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-800 font-medium whitespace-nowrap">{buildFullName(c)}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.ตำแหน่ง || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.แผนก || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.โครงการ || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.โทรศัพท์ || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.วันเริ่มงาน || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.สถานะกลุ่มงาน || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.payType || "-"}</td>
                    <td className="p-3 text-gray-600 text-right whitespace-nowrap">
                      {c.salaryAmount !== undefined && c.salaryAmount !== null && c.salaryAmount !== ""
                        ? Number(c.salaryAmount).toLocaleString("th-TH")
                        : "-"}
                    </td>
                    <td className="p-3 text-gray-600 max-w-[220px] truncate" title={formatBenefits(c.benefits)}>
                      {formatBenefits(c.benefits)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.source || "-"}</div>
                    </td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{c.รหัสพนักงานเดิม || "-"}</td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
