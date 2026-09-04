// ── Config: เพดาน OT (Overtime Ceiling) ──────────────────────────────────
// ใช้ร่วมกันระหว่างหน้า "ลง Overtime" (OvertimePage) และ Manpower Dashboard
// เก็บค่าที่แก้ไขได้จริงไว้ที่ Firestore: CMG-HR-Database/root/settings/overtime_limits
// (ดูการอ่าน/เขียนที่ src/hooks/useOvertimeLimits.ts) — ไฟล์นี้เป็นแค่ types + default + helper

import type { UserRole } from "../auth/AuthContext";

export type OvertimeColorKey = "green" | "yellow" | "orange" | "red" | "darkred";

export interface OvertimeTier {
  id: string;
  label: string; // เช่น "ปกติ", "เฝ้าระวัง", "ใกล้เพดาน", "เกินเพดานปกติ", "Exceptional"
  minHours: number; // รวมค่านี้ (inclusive)
  maxHours: number | null; // รวมค่านี้ (inclusive); null = ไม่มีเพดานบน
  colorKey: OvertimeColorKey;
  action: string; // คำอธิบายการจัดการ เช่น "หัวหน้างานอนุมัติได้ตามระบบ"

  // ── ฟิลด์เผื่ออนาคต (ยังไม่มี UI/logic ใช้งานจริงใน V1) ──
  // เผื่อไว้สำหรับ workflow ขออนุมัติ/แจ้งเตือนจริงในเฟสถัดไป โดยไม่ต้องแก้ type/schema ซ้ำ
  requiresReason?: boolean; // ต้องระบุเหตุผลก่อนขอ OT เพิ่มหรือไม่
  requiresApprovalRoles?: string[]; // role ที่ต้องอนุมัติเมื่อเข้า tier นี้
  notifyRoles?: string[]; // role ที่ควรได้รับแจ้งเตือนเมื่อเข้า tier นี้
}

export interface OvertimeLimitConfig {
  weeklyCapHours: number; // เพดาน OT ปกติต่อสัปดาห์ (แจ้งเตือนอย่างเดียว ไม่มี tier ย่อย)
  monthlyTiers: OvertimeTier[]; // เพดาน OT สะสมต่อเดือน แบ่งเป็นระดับ
  updatedAt?: number;
  updatedBy?: string;
}

export const OT_LIMITS_DOC_PATH = ["CMG-HR-Database", "root", "settings", "overtime_limits"] as const;

// role ที่มีสิทธิ์แก้ไขค่าเพดาน OT (ต่างจาก canEditOvertime ที่ใช้กรอกชั่วโมง OT รายวัน)
export const OT_LIMITS_EDITOR_ROLES: UserRole[] = ["MasterAdmin", "MD", "GM", "HR"];

export const DEFAULT_OT_LIMITS: OvertimeLimitConfig = {
  weeklyCapHours: 8,
  monthlyTiers: [
    {
      id: "normal",
      label: "ปกติ",
      minHours: 0,
      maxHours: 20,
      colorKey: "green",
      action: "หัวหน้างานอนุมัติได้ตามระบบ",
    },
    {
      id: "watch",
      label: "เฝ้าระวัง",
      minHours: 21,
      maxHours: 24,
      colorKey: "yellow",
      action: "ระบบแจ้งเตือนหัวหน้างาน",
      notifyRoles: ["Admin Site", "HR"],
    },
    {
      id: "near_cap",
      label: "ใกล้เพดาน",
      minHours: 25,
      maxHours: 30,
      colorKey: "orange",
      action: "ต้องระบุเหตุผลก่อนขอเพิ่ม",
      requiresReason: true,
      notifyRoles: ["Admin Site", "HR"],
    },
    {
      id: "over_cap",
      label: "เกินเพดานปกติ",
      minHours: 31,
      maxHours: 48,
      colorKey: "red",
      action: "ต้องขออนุมัติระดับสูงขึ้น",
      requiresReason: true,
      requiresApprovalRoles: ["GM", "MD"],
      notifyRoles: ["HR", "GM", "MD"],
    },
    {
      id: "exceptional",
      label: "Exceptional",
      minHours: 49,
      maxHours: null,
      colorKey: "darkred",
      action: "ใช้เฉพาะกรณีงานเร่งด่วน/โครงการจำเป็น",
      requiresReason: true,
      requiresApprovalRoles: ["GM", "MD"],
      notifyRoles: ["HR", "GM", "MD"],
    },
  ],
};

/** คืน tier ปัจจุบันตามจำนวนชั่วโมง OT สะสม/เดือน (pure function ใช้ซ้ำได้ทุกที่) */
export const getMonthlyTier = (
  hours: number,
  tiers: OvertimeTier[] = DEFAULT_OT_LIMITS.monthlyTiers
): OvertimeTier | null => {
  if (!Number.isFinite(hours) || hours <= 0) return tiers.find((t) => t.id === "normal") || tiers[0] || null;
  const sorted = [...tiers].sort((a, b) => a.minHours - b.minHours);
  for (const tier of sorted) {
    if (hours >= tier.minHours && (tier.maxHours === null || hours <= tier.maxHours)) {
      return tier;
    }
  }
  // ถ้าเกินทุก tier ที่กำหนดไว้ (เช่น maxHours สุดท้ายไม่ใช่ null) ให้ fallback เป็น tier สุดท้าย
  return sorted[sorted.length - 1] || null;
};

/** ตรวจว่าจำนวนชั่วโมง OT ในสัปดาห์นั้นเกินเพดานรายสัปดาห์หรือไม่ */
export const isOverWeeklyCap = (weeklyHours: number, weeklyCapHours: number = DEFAULT_OT_LIMITS.weeklyCapHours): boolean =>
  Number.isFinite(weeklyHours) && weeklyHours > weeklyCapHours;

export const OT_COLOR_CLASSES: Record<OvertimeColorKey, { bg: string; border: string; text: string; dot: string }> = {
  green: { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
  yellow: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-700", dot: "bg-yellow-500" },
  orange: { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700", dot: "bg-orange-500" },
  red: { bg: "bg-red-100", border: "border-red-300", text: "text-red-700", dot: "bg-red-500" },
  darkred: { bg: "bg-red-200", border: "border-red-400", text: "text-red-900", dot: "bg-red-700" },
};
