import React from "react";
import { AlertTriangle, FileText, Scale, ShieldAlert } from "lucide-react";
import type { FollowUpPolicyConfig } from "./employeeFollowUpConfig";

const formatWarningValidity = (days: number): string => {
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 ปี" : `${years} ปี`;
  }
  return `${days} วัน`;
};

export const EmployeeFollowUpPolicyTab = ({ policy }: { policy: FollowUpPolicyConfig }) => {
  const enabledActions = policy.actionOptions.filter((item) => item.enabled);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sky-700">
            <Scale size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">นโยบายการติดตาม</h3>
            <p className="mt-1 text-sm text-slate-600">
              หน้า MVP นี้ใช้แสดงนโยบายกลาง ชุดการดำเนินการทางวินัยที่ระบบรองรับ และแนวทางส่งต่อจาก HR ไปยัง HRM เพื่อสรุปผลสุดท้าย
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PolicyStatCard
          icon={FileText}
          title="อายุหนังสือเตือน"
          value={formatWarningValidity(policy.warningLetterValidityDays)}
          note="แสดงเป็นนโยบายกลางและแนบไปกับข้อมูลการดำเนินการ"
        />
        <PolicyStatCard
          icon={AlertTriangle}
          title="เพดานพักงานชั่วคราว"
          value={`${policy.maxSuspensionDays} วัน`}
          note="รุ่น MVP จำกัดไว้ไม่เกิน 7 วันตามนโยบายปัจจุบัน"
        />
        <PolicyStatCard
          icon={ShieldAlert}
          title="แนวทางยกระดับ"
          value={policy.allowNonSequentialEscalation ? "ไม่จำเป็นต้องเรียงลำดับตายตัว" : "เรียงลำดับตามขั้น"}
          note={
            policy.allowSeriousOffenseFastTrack
              ? "กรณีร้ายแรงอาจข้ามขั้นได้ แต่การปิดเคสสุดท้ายยังเป็นอำนาจของ HRM"
              : "ยังไม่เปิดใช้การยกระดับแบบข้ามขั้น"
          }
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-black text-slate-900">ชุดการดำเนินการที่ระบบรองรับ</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {enabledActions.map((action) => (
            <div key={action.type} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">{action.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                {action.actionKind === "warning"
                  ? "หมวดคำเตือน"
                  : action.actionKind === "suspension"
                    ? `หมวดพักงานชั่วคราว${action.suspensionDays ? ` ${action.suspensionDays} วัน` : ""}`
                    : "หมวดพ้นสภาพพนักงาน"}
              </div>
              {action.warningValidityDays ? (
                <div className="mt-2 text-xs text-slate-600">
                  อายุผลของหนังสือเตือน: {formatWarningValidity(action.warningValidityDays)}
                </div>
              ) : null}
              {action.notes?.length ? (
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {action.notes.map((note) => (
                    <div key={note}>- {note}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="text-sm font-black text-amber-900">หมายเหตุเชิงนโยบายใน MVP</div>
        <div className="mt-3 space-y-2 text-sm text-amber-900">
          <div>- หลัง HR ดำเนินการขั้นแรกเสร็จ เคสจะเข้าสู่สถานะรอ HRM พิจารณาก่อนปิดเคสจริง</div>
          <div>- HRM สามารถอนุมัติหรือส่งความเห็นกลับได้ และ HRM เป็นผู้สรุปผลปิดเคสสุดท้าย</div>
          {policy.advisoryNotes.map((note) => (
            <div key={note}>- {note}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PolicyStatCard = ({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: typeof FileText;
  title: string;
  value: string;
  note: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <Icon size={16} className="text-sky-600" />
      {title}
    </div>
    <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{note}</div>
  </div>
);
