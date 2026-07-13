// ระบบประเมินพนักงาน (Supply manpower / Sub contractor / DC Daily - Worker)
// ไฟล์นี้เก็บ "เกณฑ์ + น้ำหนัก + คำอธิบายระดับ 1–5" และฟังก์ชันคิดคะแนน/เกรด
// ค่าเริ่มต้นเก็บที่นี่ แต่สามารถ override ได้จาก Firestore doc: evaluation_config/criteria

export type EvalCriterionKey = "skill" | "safety" | "discipline" | "attitude" | "jobMatching";

export type EvalScores = Record<EvalCriterionKey, number>;

export interface EvalCriterion {
  key: EvalCriterionKey;
  label: string; // ภาษาไทย
  labelEn: string;
  weight: number; // น้ำหนัก (%)
  description: string; // สิ่งที่ประเมิน
  autoSuggest?: "attendance" | "jobMatching"; // มีคะแนนแนะนำจากข้อมูลระบบหรือไม่
  anchors: Record<number, string>; // คำอธิบายระดับ 1–5
}

// เกณฑ์ตามภาพที่ผู้ใช้กำหนด — 5 ด้านหลัก รวมน้ำหนัก = 100%
export const DEFAULT_EVAL_CRITERIA: EvalCriterion[] = [
  {
    key: "skill",
    label: "ทักษะการทำงาน",
    labelEn: "Skill Competency",
    weight: 30,
    description: "ทำงานได้ตามตำแหน่ง ใช้เครื่องมือเป็น เข้าใจขั้นตอน คุณภาพงาน",
    anchors: {
      5: "ทำงานได้ครบทุกขั้นตอน คุณภาพสูงมาก แทบไม่ต้องแก้งาน สอนคนอื่นได้",
      4: "ทำงานได้ดี คุณภาพน่าพอใจ ต้องแนะนำน้อยมาก",
      3: "ทำงานได้ตามมาตรฐานพื้นฐาน ยังต้องแนะนำเป็นบางครั้ง",
      2: "ทำงานได้บางส่วน คุณภาพไม่คงที่ ต้องคุมใกล้ชิด",
      1: "ทำงานไม่ได้ตามตำแหน่ง ต้องแก้งานบ่อย",
    },
  },
  {
    key: "safety",
    label: "ความปลอดภัย",
    labelEn: "Safety Behavior",
    weight: 25,
    description: "สวม PPE ปฏิบัติตามกฎ ไม่มีพฤติกรรมเสี่ยง รับฟังคำแนะนำ",
    anchors: {
      5: "สวม PPE ครบทุกครั้ง ทำตามกฎเคร่งครัด เป็นแบบอย่างด้านความปลอดภัย",
      4: "ปฏิบัติตามกฎความปลอดภัยดี ไม่พบพฤติกรรมเสี่ยง",
      3: "ทำตามกฎโดยรวม มีพลาดเล็กน้อยเป็นบางครั้ง",
      2: "ละเลยกฎความปลอดภัยบ่อย ต้องเตือนซ้ำ",
      1: "มีพฤติกรรมเสี่ยงอันตราย ไม่ทำตามกฎ",
    },
  },
  {
    key: "discipline",
    label: "วินัยการทำงาน",
    labelEn: "Work Discipline",
    weight: 20,
    description: "ตรงต่อเวลา ขยัน ไม่ขาดงาน ไม่ละทิ้งหน้าที่",
    autoSuggest: "attendance",
    anchors: {
      5: "มาทำงานครบ ตรงเวลาทุกวัน ไม่ขาดไม่สาย",
      4: "มาสม่ำเสมอ สายเล็กน้อยไม่กี่ครั้ง ไม่ขาด",
      3: "ขาด/สายบ้างพอประมาณ",
      2: "ขาดหรือสายบ่อย ต้องติดตาม",
      1: "ขาดงานสูง ละทิ้งหน้าที่",
    },
  },
  {
    key: "attitude",
    label: "ทัศนคติและการทำงานร่วมกัน",
    labelEn: "Attitude & Teamwork",
    weight: 15,
    description: "รับคำสั่งดี เรียนรู้เร็ว ทำงานร่วมกับทีมได้ ไม่สร้างปัญหา",
    anchors: {
      5: "ทัศนคติดีเยี่ยม เรียนรู้เร็ว ช่วยทีม เป็นที่พึ่งของกลุ่ม",
      4: "รับคำสั่งดี ทำงานร่วมกับทีมได้ราบรื่น",
      3: "ทำงานร่วมกับทีมได้ตามปกติ",
      2: "มีปัญหาการสื่อสาร/ร่วมงานเป็นบางครั้ง",
      1: "สร้างความขัดแย้ง ไม่รับฟัง ทำงานร่วมยาก",
    },
  },
  {
    key: "jobMatching",
    label: "ความเหมาะสมกับตำแหน่ง",
    labelEn: "Job Matching",
    weight: 10,
    description: "ทักษะและประสบการณ์ตรงกับที่โครงการร้องขอ",
    autoSuggest: "jobMatching",
    anchors: {
      5: "ตรงกับตำแหน่งที่โครงการต้องการเต็มที่ ประสบการณ์เกินความคาดหวัง",
      4: "ตรงกับตำแหน่งที่โครงการต้องการ",
      3: "พอเหมาะกับงาน แต่ยังต้องเสริมบางทักษะ",
      2: "ไม่ค่อยตรงกับตำแหน่งที่ร้องขอ",
      1: "ไม่ตรงกับตำแหน่งที่โครงการต้องการ",
    },
  },
];

// ประเภทพนักงานที่อยู่ในขอบเขตการประเมิน (label จาก normalizeEmployeeType)
export const EVALUATED_EMPLOYEE_TYPES = new Set<string>([
  "Supply manpower",
  "Sub contractor",
  "DC Daily - Worker",
]);

// role ที่เข้าถึงหน้าประเมินได้จาก role (นอกเหนือจากคนที่ถูก assign เป็น tier 1/2)
// Tier 3 = HR/HRM, Tier 4 = PD (+superuser), ผู้มอบหมาย = ASSIGNER_ROLES
export const EVALUATOR_ROLES = [
  "MasterAdmin",
  "MD",
  "GM",
  "PD",
  "PM",
  "CM",
  "HRM",
  "HR",
] as const;

// role ที่มอบหมายชุดได้ (แก้ evaluation_assignments)
export const ASSIGNER_ROLES = ["MasterAdmin", "MD", "GM", "PD", "HRM", "PM", "CM"] as const;

// role ที่เห็นได้เฉพาะโครงการที่ได้รับมอบหมาย (assignedProjects)
export const PROJECT_SCOPED_ROLES = ["Admin Site", "PM", "CM"] as const;

// role ที่เห็นทุกโครงการ
export const UNSCOPED_ROLES = ["MasterAdmin", "MD", "GM", "PD", "HRM", "HR"] as const;

// =====================================================================
// ระบบ Tier (4 ชั้น) — ทำต่อเนื่องกัน ต้องครบทุก tier รอบจึง "สมบูรณ์"
// Tier 1 = ผู้ที่ถูก assign (tier1Uids) ให้คะแนนรายคน — role ใดก็ได้
// Tier 2 = ผู้ที่ถูก assign (tier2Uids) ตรวจระดับชุด — role ใดก็ได้
// Tier 3 = HR / HRM (อิง role องค์กร)
// Tier 4 = PD (+ superuser) ปิดรอบ (อิง role)
// =====================================================================
export type EvalTier = 1 | 2 | 3 | 4;
export const ALL_TIERS: EvalTier[] = [1, 2, 3, 4];

export const TIER_LABELS: Record<EvalTier, string> = {
  1: "Tier 1 · ผู้ได้รับมอบหมายให้คะแนนรายคน",
  2: "Tier 2 · ผู้ได้รับมอบหมายตรวจระดับชุด",
  3: "Tier 3 · HR ตรวจสอบ",
  4: "Tier 4 · PD อนุมัติปิดรอบ",
};

export const TIER_SHORT: Record<EvalTier, string> = {
  1: "มอบหมาย T1",
  2: "มอบหมาย T2",
  3: "HR",
  4: "PD",
};

// role -> tier ที่กระทำได้ (เฉพาะ tier ที่อิง role เท่านั้น = 3, 4)
// Tier 1/2 เป็นแบบ assignment ไม่อิง role (เช็คจาก tier1Uids/tier2Uids)
const ROLE_TIER_MAP: Record<string, EvalTier[]> = {
  MasterAdmin: [3, 4],
  MD: [4],
  GM: [4],
  PD: [4],
  HRM: [3],
  HR: [3],
};

// tier ที่ user กระทำได้จาก "role" (ใช้กับ tier 3/4)
export const tiersForRoles = (roles: string[]): Set<EvalTier> => {
  const set = new Set<EvalTier>();
  (roles || []).forEach((r) => (ROLE_TIER_MAP[r] || []).forEach((t) => set.add(t)));
  return set;
};

// canActTier ใช้กับ tier 3/4 (role-based) เท่านั้น
export const canActTier = (roles: string[], tier: EvalTier): boolean => tiersForRoles(roles).has(tier);

export type TierStatus = "pending" | "in-progress" | "done";

// ---------- Firestore shapes (redesign) ----------
export interface EvalAssignment {
  id: string; // enc(project)__enc(group)
  project: string;
  group: string;
  tier1Uids: string[]; // ผู้ให้คะแนนรายคน (ต้อง ≥2 คนจึงจะปิด Tier 1)
  tier2Uids: string[]; // ผู้ตรวจระดับชุด
  updatedBy?: string;
  updatedAt?: number;
}

export interface EvalRound {
  id: string; // enc(project)__enc(group)__period
  project: string;
  group: string;
  period: string; // "PROBATION" | "YYYY-MM"
  periodType: "probation_14d" | "monthly";
  tierStatus: Record<EvalTier, TierStatus>;
  currentTier: EvalTier;
  closed: boolean;
  actors?: Partial<Record<EvalTier, string>>; // tier -> ชื่อผู้กระทำล่าสุด
  updatedAt?: number;
}

export interface EvalScoreRecord {
  id: string;
  project: string;
  group: string;
  period: string;
  periodType: "probation_14d" | "monthly";
  employeeId: string;
  employeeName: string;
  position: string;
  employeeType: string;
  tier: EvalTier;
  evaluatorUid: string;
  evaluatorName: string;
  evaluatorRole: string;
  scores: EvalScores;
  total: number;
  grade: string;
  isOverride: boolean; // true สำหรับ tier 2-4 ที่ปรับรายคน
  comment?: string;
  disciplineSuggested?: number;
  jobMatchingSuggested?: number;
  status: "draft" | "submitted";
  createdAt: number;
  updatedAt: number;
}

// สร้าง doc id ที่ปลอดภัย (ไม่มี "/")
export const encKey = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/[\/\s]+/g, "-")
    .replace(/__+/g, "-") || "NA";

export const assignmentId = (project: string, group: string): string =>
  `${encKey(project)}__${encKey(group)}`;

export const roundId = (project: string, group: string, period: string): string =>
  `${encKey(project)}__${encKey(group)}__${period}`;

export const scoreId = (
  project: string,
  group: string,
  period: string,
  employeeId: string,
  tier: EvalTier,
  uid: string
): string =>
  // tier 1 อนุญาตหลายผู้ประเมิน (แยกตาม uid) — tier 2-4 override 1 ใบต่อ tier
  tier === 1
    ? `${roundId(project, group, period)}__${employeeId}__t1__${encKey(uid)}`
    : `${roundId(project, group, period)}__${employeeId}__t${tier}`;

export const emptyRound = (
  project: string,
  group: string,
  period: string,
  periodType: "probation_14d" | "monthly"
): EvalRound => ({
  id: roundId(project, group, period),
  project,
  group,
  period,
  periodType,
  tierStatus: { 1: "pending", 2: "pending", 3: "pending", 4: "pending" },
  currentTier: 1,
  closed: false,
});

const averageScores = (list: EvalScores[]): EvalScores => {
  const acc = emptyScores();
  if (list.length === 0) return acc;
  (Object.keys(acc) as (keyof EvalScores)[]).forEach((k) => {
    const sum = list.reduce((s, sc) => s + (Number(sc[k]) || 0), 0);
    acc[k] = Math.round((sum / list.length) * 100) / 100;
  });
  return acc;
};

export interface FinalPersonScore {
  total: number;
  grade: GradeLetter;
  scores: EvalScores;
  sourceTier: EvalTier;
  isOverride: boolean;
}

// คะแนนสุดท้ายรายคน: override tier สูงสุดชนะ, ไม่งั้นเฉลี่ย tier 1
export const finalPersonScore = (records: EvalScoreRecord[]): FinalPersonScore | null => {
  const submitted = records.filter((r) => r.status === "submitted");
  const overrides = submitted.filter((r) => r.isOverride);
  if (overrides.length > 0) {
    const top = overrides.reduce((a, b) => (b.tier > a.tier ? b : a));
    return { total: top.total, grade: gradeFromTotal(top.total), scores: top.scores, sourceTier: top.tier, isOverride: true };
  }
  const t1 = submitted.filter((r) => r.tier === 1);
  if (t1.length === 0) return null;
  const avgScores = averageScores(t1.map((r) => r.scores));
  const avgTotal = Math.round((t1.reduce((s, r) => s + (r.total || 0), 0) / t1.length) * 10) / 10;
  return { total: avgTotal, grade: gradeFromTotal(avgTotal), scores: avgScores, sourceTier: 1, isOverride: false };
};

export const PROBATION_DAYS = 14;

// จำนวนใบขั้นต่ำที่ทำให้ผลรอบนั้น "สมบูรณ์" (multi-rater)
export const MIN_RATERS = 2;

// ตั้งค่าระบบ (เก็บที่ evaluation_config/settings) — ไม่ backfill ย้อนหลังก่อน goLiveMonth
export interface EvalSettings {
  goLiveMonth: string; // "YYYY-MM"
  probationDays: number;
  minRaters: number;
  updatedAt?: number;
}

export const currentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const defaultEvalSettings = (): EvalSettings => ({
  goLiveMonth: currentMonthKey(),
  probationDays: PROBATION_DAYS,
  minRaters: MIN_RATERS,
});

// สร้างรายการเดือนตั้งแต่ goLiveMonth ถึงเดือนปัจจุบัน (ใหม่สุดก่อน)
export const monthsSinceGoLive = (goLiveMonth: string): string[] => {
  const cur = currentMonthKey();
  const keys: string[] = [];
  let [y, m] = (goLiveMonth || cur).split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return [cur];
  // เดินหน้าจาก goLive ถึงปัจจุบัน แล้วค่อย reverse
  while (`${y}-${String(m).padStart(2, "0")}` <= cur) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (keys.length > 60) break; // กันลูปพลาด
  }
  return keys.reverse();
};

export type EvalStatus = "draft" | "submitted" | "approved" | "rejected";

export interface EvaluationRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: string;
  laborGroup: string;
  position: string;
  project: string;
  periodType: "probation_14d" | "monthly";
  periodKey: string; // "PROBATION" หรือ "YYYY-MM"
  periodStart: string;
  periodEnd: string;
  evaluatorUid: string;
  evaluatorName: string;
  evaluatorRole: string;
  scores: EvalScores;
  disciplineSuggested?: number;
  jobMatchingSuggested?: number;
  weightsSnapshot: Record<EvalCriterionKey, number>;
  total: number;
  grade: string;
  comment: string;
  status: EvalStatus;
  submittedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export const emptyScores = (): EvalScores => ({
  skill: 0,
  safety: 0,
  discipline: 0,
  attitude: 0,
  jobMatching: 0,
});

// คะแนนรวม 0–100 = Σ (คะแนนด้าน ÷ 5 × น้ำหนัก)
export const computeEvalTotal = (
  scores: EvalScores,
  criteria: EvalCriterion[] = DEFAULT_EVAL_CRITERIA
): number => {
  const total = criteria.reduce((sum, c) => {
    const raw = Number(scores[c.key]) || 0;
    const clamped = Math.max(0, Math.min(5, raw));
    return sum + (clamped / 5) * c.weight;
  }, 0);
  return Math.round(total * 10) / 10;
};

export const isEvalComplete = (
  scores: EvalScores,
  criteria: EvalCriterion[] = DEFAULT_EVAL_CRITERIA
): boolean => criteria.every((c) => (Number(scores[c.key]) || 0) >= 1);

export type GradeLetter = "A" | "B" | "C" | "D" | "F";

export const gradeFromTotal = (total: number): GradeLetter => {
  if (total >= 85) return "A";
  if (total >= 75) return "B";
  if (total >= 65) return "C";
  if (total >= 50) return "D";
  return "F";
};

export const gradeColor = (grade: GradeLetter): string => {
  switch (grade) {
    case "A":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "B":
      return "bg-green-100 text-green-700 border-green-200";
    case "C":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "D":
      return "bg-orange-100 text-orange-700 border-orange-200";
    default:
      return "bg-rose-100 text-rose-700 border-rose-200";
  }
};

export interface ActionFlag {
  label: string;
  tone: "green" | "amber" | "red";
  className: string;
}

// การนำไปใช้: <65 เฝ้าระวัง, 65–74 ต้องพัฒนา, >=75 ผ่าน
export const evalActionFlag = (total: number): ActionFlag => {
  if (total >= 75) {
    return { label: "ผ่าน", tone: "green", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }
  if (total >= 65) {
    return { label: "ต้องพัฒนา", tone: "amber", className: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  return { label: "เฝ้าระวัง/พิจารณาไม่ต่อ", tone: "red", className: "bg-rose-100 text-rose-700 border-rose-200" };
};

export interface DisciplineStat {
  workDays: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  notRecorded: number;
}

// แม็ปสถิติ attendance เป็นคะแนนแนะนำ 1–5 สำหรับด้าน "วินัยการทำงาน"
export const suggestDisciplineScore = (stat: DisciplineStat): number => {
  if (stat.workDays <= 0) return 0; // ไม่มีข้อมูล → ไม่เสนอ
  const { absent, late, notRecorded } = stat;
  const missing = absent + notRecorded; // ถือว่าไม่ลงเวลา = เสี่ยงเหมือนขาด
  if (missing === 0 && late === 0) return 5;
  if (missing === 0 && late <= 2) return 4;
  if (missing <= 1 && late <= 4) return 3;
  if (missing <= 3) return 2;
  return 1;
};

// คะแนนแนะนำ Job Matching จากการเทียบ "ตำแหน่ง" พนักงาน กับ required_role_plan ของโครงการ
export const suggestJobMatchingScore = (
  employeePosition: string,
  planPositions: string[]
): number => {
  const pos = String(employeePosition || "").trim().toLowerCase();
  if (!pos) return 0;
  if (planPositions.length === 0) return 0; // ไม่มีแผน → ไม่เสนอ
  const normalizedPlan = planPositions.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean);
  if (normalizedPlan.includes(pos)) return 5;
  // ตรงบางส่วน (คำใดคำหนึ่งซ้อนกัน) → 3
  const partial = normalizedPlan.some((p) => p.includes(pos) || pos.includes(p));
  return partial ? 3 : 2;
};

// สร้าง periodKey/label สำหรับเดือน
export const monthKey = (dateStr: string): string => dateStr.slice(0, 7); // YYYY-MM

export const monthLabelTh = (key: string): string => {
  if (key === "PROBATION") return "ทดลองงาน (14 วันแรก)";
  const [y, m] = key.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return key;
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${months[m - 1]} ${y + 543}`;
};
