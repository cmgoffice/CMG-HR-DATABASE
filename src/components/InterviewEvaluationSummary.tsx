import { isInterviewEvaluation, InterviewEvaluation } from "./recruitmentIntakeConfig";

const LOCATION_LABELS: Record<string, string> = {
  onsite: "On-site (ที่บริษัท)",
  online: "Online (Video Call)",
};

const BACKGROUND_ROWS: { key: keyof NonNullable<InterviewEvaluation["ตรวจสอบประวัติ"]>; label: string; values: Record<string, string> }[] = [
  {
    key: "education",
    label: "การศึกษา",
    values: { appropriate: "ตรงตามสายงาน", inappropriate: "ไม่ตรงตามสายงาน" },
  },
  {
    key: "experience",
    label: "ประสบการณ์",
    values: { appropriate: "ตรงตามสายงาน", inappropriate: "ไม่ตรงตามสายงาน" },
  },
  {
    key: "workHistory",
    label: "ประวัติการเปลี่ยนงาน",
    values: { rarely: "ไม่ค่อยเปลี่ยนงาน", often: "เปลี่ยนงานบ่อย" },
  },
];

const formatInterviewDate = (value: string | undefined): string => {
  const raw = (value || "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};

const formatScore = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 1 });
};

const formatMoney = (value: number | string | null | undefined, canViewSalary: boolean): string => {
  if (!canViewSalary) return "••••••";
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("th-TH")} บาท` : String(value);
};

const labelOf = (map: Record<string, string>, value: string | undefined): string => {
  const raw = (value || "").trim();
  if (!raw) return "-";
  return map[raw] || raw;
};

/** ป้ายสั้นสำหรับคอลัมน์ในตารางรายชื่อรอเพิ่ม */
export const InterviewResultBadge = ({ value }: { value: unknown }) => {
  if (!isInterviewEvaluation(value)) {
    return <span className="text-gray-300">-</span>;
  }
  const passed = value.ผลการประเมิน === "ผ่าน";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
        passed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
      }`}
      title="แบบประเมินผลการสัมภาษณ์ FM-HR-005/00"
    >
      {value.ผลการประเมิน || "-"}
      <span className="font-medium opacity-80">{formatScore(value.คะแนนรวม)}</span>
    </span>
  );
};

/** แสดงผลประเมินสัมภาษณ์ที่ Recruitment ส่งมา อ่านอย่างเดียว
 * value === null และ showWhenNull = แรงงานรายวัน (มีฟิลด์แต่ไม่มีขั้นตอนสัมภาษณ์)
 * ไม่มีฟิลด์เลย (รายการเก่าก่อนฟีเจอร์นี้) จะไม่แสดงอะไร จนกว่าจะถูกเติมทีหลัง */
export const InterviewEvaluationSummary = ({
  value,
  canViewSalary,
  showWhenNull = false,
}: {
  value: unknown;
  canViewSalary: boolean;
  showWhenNull?: boolean;
}) => {
  if (!isInterviewEvaluation(value)) {
    if (!showWhenNull || value !== null) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-bold text-gray-700">ผลประเมินสัมภาษณ์ (FM-HR-005/00)</h4>
        <p className="text-xs text-gray-500 mt-1">
          ไม่มีผลประเมินสัมภาษณ์ในรายการนี้ — แรงงานรายวันไม่มีขั้นตอนนี้ หรือตอนอนุมัติดึงผลประเมินไม่สำเร็จ (ข้อมูลอื่นยังถูกส่งมาตามปกติ)
        </p>
      </div>
    );
  }

  const passed = value.ผลการประเมิน === "ผ่าน";
  const interviewers = value.ผู้สัมภาษณ์ || [];
  const background = value.ตรวจสอบประวัติ || {};

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-indigo-950">ผลประเมินสัมภาษณ์ (FM-HR-005/00)</h4>
          <p className="text-[11px] text-indigo-700/80 mt-0.5">จากระบบ Recruitment ตอนอนุมัติจ้าง — อ่านอย่างเดียว</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${
            passed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {value.ผลการประเมิน || "-"} · {formatScore(value.คะแนนรวม)}/50
        </span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-gray-400 shrink-0">วันที่สัมภาษณ์</dt>
          <dd className="text-gray-800">{formatInterviewDate(value.วันที่สัมภาษณ์)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 shrink-0">รูปแบบ</dt>
          <dd className="text-gray-800">{labelOf(LOCATION_LABELS, value.รูปแบบการสัมภาษณ์)}</dd>
        </div>
      </dl>

      {value.ความคิดเห็นรวม ? (
        <p className="text-sm text-gray-700 whitespace-pre-line bg-white/70 rounded-lg p-2">{value.ความคิดเห็นรวม}</p>
      ) : null}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">ตรวจสอบประวัติ</p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {BACKGROUND_ROWS.map((row) => (
            <div key={row.key} className="bg-white/70 rounded-lg px-2 py-1.5">
              <dt className="text-[11px] text-gray-400">{row.label}</dt>
              <dd className="text-sm text-gray-800">{labelOf(row.values, background[row.key])}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">กรรมการสัมภาษณ์ ({interviewers.length})</p>
        {interviewers.length === 0 ? (
          <p className="text-xs text-gray-400">-</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {interviewers.map((person, idx) => (
              <li key={`${person.ชื่อ || "interviewer"}-${idx}`} className="bg-white/70 rounded-lg px-2 py-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-800">
                    {person.ชื่อ || "-"}
                    {person.ตำแหน่ง ? <span className="font-normal text-gray-500"> · {person.ตำแหน่ง}</span> : null}
                  </span>
                  <span className="text-xs font-semibold text-indigo-700 shrink-0">{formatScore(person.คะแนนรวม)}/50</span>
                </div>
                {person.ความเห็น ? <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{person.ความเห็น}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-gray-400 shrink-0">เงินเดือนที่คาดหวัง</dt>
          <dd className="text-gray-800">{formatMoney(value.เงินเดือนที่คาดหวัง, canViewSalary)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 shrink-0">ต่อรองได้</dt>
          <dd className="text-gray-800">{formatMoney(value.เงินเดือนที่ต่อรองได้, canViewSalary)}</dd>
        </div>
      </dl>
      {canViewSalary && value.หมายเหตุเงินเดือน ? (
        <p className="text-xs text-gray-600 whitespace-pre-line">หมายเหตุเงินเดือน: {value.หมายเหตุเงินเดือน}</p>
      ) : null}
    </div>
  );
};
