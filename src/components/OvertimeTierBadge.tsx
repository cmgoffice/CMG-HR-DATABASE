import React from "react";
import { AlertTriangle } from "lucide-react";
import { getMonthlyTier, isOverWeeklyCap, OT_COLOR_CLASSES, OvertimeTier } from "../config/overtimeLimits";

interface OvertimeTierBadgeProps {
  hours: number;
  tiers: OvertimeTier[];
  /** ถ้า true จะไม่แสดง badge เมื่ออยู่ใน tier ปกติ (ใช้กับ list ที่อยากโชว์เฉพาะรายที่น่าสนใจ) */
  hideWhenNormal?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

/**
 * Badge กลางสำหรับแสดงระดับเพดาน OT รายเดือน — ใช้ร่วมกันทั้ง OvertimePage และ ManpowerDashboard
 * เพื่อให้เปลี่ยนรูปแบบ/พฤติกรรม (เช่น เพิ่มปุ่มขออนุมัติในอนาคต) ได้จากจุดเดียว
 */
export const OvertimeTierBadge: React.FC<OvertimeTierBadgeProps> = ({
  hours,
  tiers,
  hideWhenNormal = false,
  size = "xs",
  className = "",
}) => {
  const tier = getMonthlyTier(hours, tiers);
  if (!tier) return null;
  if (hideWhenNormal && tier.id === "normal") return null;

  const colors = OT_COLOR_CLASSES[tier.colorKey];
  const textSize = size === "sm" ? "text-xs" : "text-[10px]";
  const padding = size === "sm" ? "px-2 py-1" : "px-1.5 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${colors.bg} ${colors.border} ${colors.text} ${textSize} ${padding} ${className}`}
      title={tier.action}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {tier.label}
    </span>
  );
};

interface WeeklyOvertimeWarningIconProps {
  weeklyHours: number;
  weeklyCapHours: number;
  size?: number;
  className?: string;
}

/** ไอคอนเตือนเพดาน OT รายสัปดาห์ — แสดงเฉพาะเมื่อเกินเพดาน */
export const WeeklyOvertimeWarningIcon: React.FC<WeeklyOvertimeWarningIconProps> = ({
  weeklyHours,
  weeklyCapHours,
  size = 11,
  className = "",
}) => {
  if (!isOverWeeklyCap(weeklyHours, weeklyCapHours)) return null;
  return (
    <span
      className={`inline-flex items-center justify-center text-amber-600 ${className}`}
      title={`OT สัปดาห์นี้ ${weeklyHours.toFixed(1)} ชม. เกินเพดาน ${weeklyCapHours} ชม./สัปดาห์`}
    >
      <AlertTriangle size={size} />
    </span>
  );
};
