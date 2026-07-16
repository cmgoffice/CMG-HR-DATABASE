import {
  DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS,
  DEFAULT_FOLLOW_UP_POLICY_CONFIG,
  FollowUpActionType,
  FollowUpDisciplinaryActionOption,
  FollowUpPolicyConfig,
  RiskRuleKey,
  RiskSeverity,
  normalizeFollowUpPolicyConfig,
} from "./employeeFollowUpConfig";

export const RISK_MONITORING_SETTINGS_COLLECTION = "settings";
export const RISK_MONITORING_SETTINGS_DOC_ID = "risk_monitoring_settings";

export type RiskMetricKey =
  | "consecutiveAbsentDays"
  | "absentDays"
  | "absenceRate"
  | "payCycleAbsenceRate"
  | "mondayFridayAbsenceCount"
  | "notRecordedDays"
  | "wrongProjectDays";

export interface RiskMetricSnapshotLike {
  consecutiveAbsentDays: number;
  absentDays: number;
  absenceRate: number;
  payCycleAbsenceRate: number;
  mondayFridayAbsenceCount: number;
  notRecordedDays: number;
  wrongProjectDays: number;
}

export interface RiskIssueTypeConfig {
  key: RiskRuleKey;
  label: string;
  shortLabel: string;
  category: string;
  description: string;
  enabled: boolean;
}

export interface RiskRuleTierConfig {
  id: string;
  minValue: number;
  secondaryMinValue?: number;
  score: number;
  severityImpact: RiskSeverity;
  enabled: boolean;
  note?: string;
}

export interface RiskRuleConfig {
  key: RiskRuleKey;
  issueTypeKey: RiskRuleKey;
  metricKey: RiskMetricKey;
  secondaryMetricKey?: RiskMetricKey;
  valueFormat: "days" | "count" | "percent";
  secondaryValueFormat?: "days" | "count" | "percent";
  description: string;
  enabled: boolean;
  tiers: RiskRuleTierConfig[];
  /**
   * Rules sharing the same scoreGroup describe the same underlying behavior
   * (e.g. absence-based rules all derive from the same absence days). Only
   * the highest-scoring rule within a group counts toward totalScore so the
   * same incident isn't counted multiple times. Rules without a scoreGroup
   * are scored independently (grouped by their own key).
   */
  scoreGroup?: string;
}

export interface SeverityBandConfig {
  key: RiskSeverity;
  label: string;
  minScore: number;
  colorHex: string;
  guidance: string;
}

export interface RiskMonitoringVersionConfig {
  status: "draft" | "published";
  draftVersion: number;
  publishedVersion: number;
  draftNote: string;
  lastUpdatedAt: number;
  lastUpdatedByUid: string;
  lastUpdatedByName: string;
  lastUpdatedByRole: string;
  publishedAt: number;
  publishedByUid: string;
  publishedByName: string;
  publishedByRole: string;
}

export interface RiskMonitoringSettings {
  primaryLanguage: "th";
  riskRules: RiskRuleConfig[];
  severityBands: SeverityBandConfig[];
  followUpPolicy: FollowUpPolicyConfig;
  issueTypes: RiskIssueTypeConfig[];
  versioning: RiskMonitoringVersionConfig;
}

export interface EvaluatedRiskRule {
  key: RiskRuleKey;
  label: string;
  score: number;
  severityImpact: RiskSeverity;
  reason: string;
  value: number;
  scoreGroup: string;
}

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const clampSeverityKey = (value: unknown, fallback: RiskSeverity): RiskSeverity => {
  return ["normal", "watch", "risk", "high", "critical"].includes(String(value))
    ? (value as RiskSeverity)
    : fallback;
};

const metricLabelMap: Record<RiskMetricKey, string> = {
  consecutiveAbsentDays: "ขาดติดต่อกัน",
  absentDays: "ขาด",
  absenceRate: "อัตราขาด",
  payCycleAbsenceRate: "อัตราขาด (รอบจ่ายค่าแรง)",
  mondayFridayAbsenceCount: "ขาดวันจันทร์/ศุกร์",
  notRecordedDays: "ค้างลงเวลา",
  wrongProjectDays: "ลงผิดโครงการ",
};

const formatMetricValue = (value: number, format: RiskRuleConfig["valueFormat"]): string => {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "days") return `${value} วัน`;
  return `${value} ครั้ง`;
};

const severityOrder: RiskSeverity[] = ["normal", "watch", "risk", "high", "critical"];

const defaultIssueTypes: RiskIssueTypeConfig[] = [
  {
    key: "consecutive_absence",
    label: "ขาดงานต่อเนื่อง",
    shortLabel: "ขาดต่อเนื่อง",
    category: "การมาทำงาน",
    description: "ใช้ติดตามพนักงานที่ขาดงานติดกันหลายวันและควรเร่งตรวจสอบสาเหตุ",
    enabled: true,
  },
  {
    key: "total_absence",
    label: "ขาดงานสะสม",
    shortLabel: "ขาดสะสม",
    category: "การมาทำงาน",
    description: "ใช้ติดตามจำนวนวันขาดงานสะสมในช่วงวิเคราะห์เดียวกัน",
    enabled: true,
  },
  {
    key: "absence_rate",
    label: "อัตราขาดงานสูง",
    shortLabel: "อัตราขาดสูง",
    category: "การมาทำงาน",
    description:
      "คำนวณจากอัตราขาดงานในรอบจ่ายค่าแรงปัจจุบัน (1-15 หรือ 16-สิ้นเดือน) ไม่ใช่ช่วงวันที่ที่เลือกดูรายงาน เพื่อให้สอดคล้องกับรอบจ่ายค่าแรงจริงของพนักงานรายวัน/รายเดือน ไม่ใช่หลักฐานผิดวินัยเพิ่มเติมด้วยตัวเอง จึงไม่ถูกส่งเข้าคิวติดตามพนักงานอัตโนมัติ ใช้เป็นสัญญาณเฝ้าระวังบน dashboard เท่านั้น",
    enabled: true,
  },
  {
    key: "monday_friday_pattern",
    label: "รูปแบบขาดวันจันทร์/ศุกร์",
    shortLabel: "ขาดจันทร์/ศุกร์",
    category: "รูปแบบพฤติกรรม",
    description:
      "เป็นเพียงรูปแบบ (pattern) ของวันที่ขาดงานซึ่งนับซ้ำกับวันขาดงานที่ถูกนับในกลุ่มขาดต่อเนื่อง/ขาดสะสม/อัตราขาดสูงอยู่แล้ว ไม่ใช่หลักฐานผิดวินัยเพิ่มเติมด้วยตัวเอง จึงไม่ถูกส่งเข้าคิวติดตามพนักงานอัตโนมัติ ใช้เป็นสัญญาณเฝ้าระวังบน dashboard เท่านั้น",
    enabled: true,
  },
  {
    key: "missing_attendance",
    label: "ค้างลงเวลาและขาดงาน",
    shortLabel: "ค้างลงเวลา",
    category: "คุณภาพข้อมูลเวลา",
    description:
      "ค้างลงเวลามักสะท้อนความบกพร่องของการบันทึกเวลา/อุปกรณ์ ไม่ใช่พฤติกรรมพนักงานโดยตรง จึงไม่ถูกส่งเข้าคิวติดตามพนักงานอัตโนมัติ แต่ยังใช้เป็นสัญญาณคุณภาพข้อมูลบน dashboard",
    enabled: true,
  },
  {
    key: "wrong_project_pattern",
    label: "ลงผิดโครงการร่วมกับขาดงาน",
    shortLabel: "ลงผิดโครงการ",
    category: "คุณภาพข้อมูลเวลา",
    description:
      "มักสะท้อนความบกพร่องของผู้ลงเวลา (เช่น Admin Site) ไม่ใช่พฤติกรรมพนักงาน จึงไม่ถูกส่งเข้าคิวติดตามพนักงานอัตโนมัติ แต่ยังใช้เป็นสัญญาณคุณภาพข้อมูลบน dashboard",
    enabled: true,
  },
];

const defaultRiskRules: RiskRuleConfig[] = [
  {
    key: "consecutive_absence",
    issueTypeKey: "consecutive_absence",
    metricKey: "consecutiveAbsentDays",
    valueFormat: "days",
    description: "ให้คะแนนเมื่อพนักงานขาดงานติดกันตั้งแต่ 3 วันขึ้นไป (2 วันติดกันยังไม่ถือว่าเป็นความเสี่ยงที่ต้องให้คะแนน)",
    enabled: true,
    scoreGroup: "absence_days",
    tiers: [
      { id: "consecutive_absence_4", minValue: 4, score: 55, severityImpact: "critical", enabled: true, note: "เร่งติดตามทันที" },
      { id: "consecutive_absence_3", minValue: 3, score: 40, severityImpact: "critical", enabled: true, note: "ควรเริ่มเปิดเคสติดตาม" },
    ],
  },
  {
    key: "total_absence",
    issueTypeKey: "total_absence",
    metricKey: "absentDays",
    valueFormat: "days",
    description: "ให้คะแนนเมื่อจำนวนวันขาดสะสมถึงเกณฑ์",
    enabled: true,
    scoreGroup: "absence_days",
    tiers: [
      { id: "total_absence_5", minValue: 5, score: 30, severityImpact: "critical", enabled: true },
      { id: "total_absence_4", minValue: 4, score: 20, severityImpact: "high", enabled: true },
      { id: "total_absence_3", minValue: 3, score: 15, severityImpact: "risk", enabled: true },
    ],
  },
  {
    key: "absence_rate",
    issueTypeKey: "absence_rate",
    metricKey: "payCycleAbsenceRate",
    valueFormat: "percent",
    description:
      "ให้คะแนนเมื่ออัตราขาดงานในรอบจ่ายค่าแรงปัจจุบัน (1-15 หรือ 16-สิ้นเดือน) เกินเกณฑ์ ใช้รอบจ่ายค่าแรงแทนช่วงวันที่ที่เลือกดูรายงาน เพื่อสะท้อนความเสี่ยงจริงต่อรอบจ่ายเงิน และต้องมีวันทำงานผ่านไปแล้วอย่างน้อย 3 วันในรอบจึงจะเริ่มประเมิน",
    enabled: true,
    scoreGroup: "absence_days",
    tiers: [
      { id: "absence_rate_40", minValue: 0.4, score: 35, severityImpact: "critical", enabled: true },
      { id: "absence_rate_30", minValue: 0.3, score: 25, severityImpact: "high", enabled: true },
      { id: "absence_rate_20", minValue: 0.2, score: 15, severityImpact: "risk", enabled: true },
    ],
  },
  {
    key: "monday_friday_pattern",
    issueTypeKey: "monday_friday_pattern",
    metricKey: "mondayFridayAbsenceCount",
    valueFormat: "count",
    description: "ให้คะแนนเมื่อมีพฤติกรรมขาดวันจันทร์หรือศุกร์ซ้ำ",
    enabled: true,
    scoreGroup: "absence_days",
    tiers: [
      { id: "monday_friday_pattern_3", minValue: 3, score: 20, severityImpact: "high", enabled: true },
      { id: "monday_friday_pattern_2", minValue: 2, score: 10, severityImpact: "watch", enabled: true },
    ],
  },
  {
    key: "missing_attendance",
    issueTypeKey: "missing_attendance",
    metricKey: "notRecordedDays",
    secondaryMetricKey: "absentDays",
    valueFormat: "count",
    secondaryValueFormat: "days",
    description: "ให้คะแนนเมื่อมีค้างลงเวลาร่วมกับการขาดงาน",
    enabled: true,
    tiers: [
      {
        id: "missing_attendance_3_2",
        minValue: 3,
        secondaryMinValue: 2,
        score: 18,
        severityImpact: "high",
        enabled: true,
      },
      {
        id: "missing_attendance_2_1",
        minValue: 2,
        secondaryMinValue: 1,
        score: 10,
        severityImpact: "risk",
        enabled: true,
      },
    ],
  },
  {
    key: "wrong_project_pattern",
    issueTypeKey: "wrong_project_pattern",
    metricKey: "wrongProjectDays",
    secondaryMetricKey: "absentDays",
    valueFormat: "count",
    secondaryValueFormat: "days",
    description: "ให้คะแนนเมื่อพบลงผิดโครงการร่วมกับการขาดงาน",
    enabled: true,
    tiers: [
      {
        id: "wrong_project_pattern_3_2",
        minValue: 3,
        secondaryMinValue: 2,
        score: 18,
        severityImpact: "high",
        enabled: true,
      },
      {
        id: "wrong_project_pattern_2_1",
        minValue: 2,
        secondaryMinValue: 1,
        score: 10,
        severityImpact: "risk",
        enabled: true,
      },
    ],
  },
];

const defaultSeverityBands: SeverityBandConfig[] = [
  { key: "normal", label: "ปกติ", minScore: 0, colorHex: "#64748b", guidance: "ยังไม่ต้องดำเนินการ" },
  { key: "watch", label: "เฝ้าระวัง", minScore: 20, colorHex: "#f59e0b", guidance: "จับตาพฤติกรรมต่อเนื่อง" },
  { key: "risk", label: "เสี่ยง", minScore: 40, colorHex: "#f97316", guidance: "ตรวจสอบสาเหตุและเฝ้าระวัง" },
  { key: "high", label: "เสี่ยงสูง", minScore: 60, colorHex: "#f43f5e", guidance: "ติดตามภายในวันนี้" },
  { key: "critical", label: "วิกฤต", minScore: 80, colorHex: "#d946ef", guidance: "ติดตามทันทีร่วมกับหัวหน้างาน" },
];

const defaultVersioning: RiskMonitoringVersionConfig = {
  status: "draft",
  draftVersion: 1,
  publishedVersion: 0,
  draftNote: "ร่างตั้งต้นจากค่ามาตรฐานของระบบ",
  lastUpdatedAt: 0,
  lastUpdatedByUid: "",
  lastUpdatedByName: "",
  lastUpdatedByRole: "",
  publishedAt: 0,
  publishedByUid: "",
  publishedByName: "",
  publishedByRole: "",
};

export const DEFAULT_RISK_MONITORING_SETTINGS: RiskMonitoringSettings = {
  primaryLanguage: "th",
  riskRules: defaultRiskRules,
  severityBands: defaultSeverityBands,
  followUpPolicy: DEFAULT_FOLLOW_UP_POLICY_CONFIG,
  issueTypes: defaultIssueTypes,
  versioning: defaultVersioning,
};

const normalizeIssueTypes = (value: unknown): RiskIssueTypeConfig[] => {
  const raw = Array.isArray(value) ? value : [];
  return defaultIssueTypes.map((defaultItem) => {
    const matched = raw.find((item) => item && typeof item === "object" && (item as RiskIssueTypeConfig).key === defaultItem.key) as
      | Partial<RiskIssueTypeConfig>
      | undefined;
    return {
      ...defaultItem,
      label: sanitizeText(matched?.label, defaultItem.label),
      shortLabel: sanitizeText(matched?.shortLabel, defaultItem.shortLabel),
      category: sanitizeText(matched?.category, defaultItem.category),
      description: sanitizeText(matched?.description, defaultItem.description),
      enabled: matched?.enabled ?? defaultItem.enabled,
    };
  });
};

const normalizeRuleTiers = (value: unknown, defaults: RiskRuleTierConfig[]): RiskRuleTierConfig[] => {
  const raw = Array.isArray(value) ? value : [];
  const normalized = raw
    .filter((item) => !!item && typeof item === "object")
    .map((item, index) => {
      const source = item as Partial<RiskRuleTierConfig>;
      const fallback = defaults[index] || defaults[defaults.length - 1];
      return {
        id: sanitizeText(source.id, fallback?.id || `tier_${index + 1}`),
        minValue: toNumber(source.minValue, fallback?.minValue || 0),
        secondaryMinValue:
          source.secondaryMinValue === undefined ? fallback?.secondaryMinValue : toNumber(source.secondaryMinValue, 0),
        score: toNumber(source.score, fallback?.score || 0),
        severityImpact: clampSeverityKey(source.severityImpact, fallback?.severityImpact || "watch"),
        enabled: source.enabled ?? true,
        note: sanitizeText(source.note, fallback?.note || ""),
      };
    })
    .sort((a, b) => b.minValue - a.minValue || b.score - a.score);
  return normalized.length > 0 ? normalized : defaults;
};

const normalizeRiskRules = (value: unknown): RiskRuleConfig[] => {
  const raw = Array.isArray(value) ? value : [];
  return defaultRiskRules.map((defaultItem) => {
    const matched = raw.find((item) => item && typeof item === "object" && (item as RiskRuleConfig).key === defaultItem.key) as
      | Partial<RiskRuleConfig>
      | undefined;
    return {
      ...defaultItem,
      issueTypeKey: defaultItem.issueTypeKey,
      metricKey: defaultItem.metricKey,
      secondaryMetricKey: defaultItem.secondaryMetricKey,
      valueFormat: defaultItem.valueFormat,
      secondaryValueFormat: defaultItem.secondaryValueFormat,
      description: sanitizeText(matched?.description, defaultItem.description),
      enabled: matched?.enabled ?? defaultItem.enabled,
      tiers: normalizeRuleTiers(matched?.tiers, defaultItem.tiers),
    };
  });
};

const normalizeSeverityBands = (value: unknown): SeverityBandConfig[] => {
  const raw = Array.isArray(value) ? value : [];
  return defaultSeverityBands.map((defaultBand) => {
    const matched = raw.find((item) => item && typeof item === "object" && (item as SeverityBandConfig).key === defaultBand.key) as
      | Partial<SeverityBandConfig>
      | undefined;
    return {
      ...defaultBand,
      label: sanitizeText(matched?.label, defaultBand.label),
      minScore: toNumber(matched?.minScore, defaultBand.minScore),
      colorHex: sanitizeText(matched?.colorHex, defaultBand.colorHex),
      guidance: sanitizeText(matched?.guidance, defaultBand.guidance),
    };
  });
};

const normalizeActionOptions = (value: unknown, maxSuspensionDays: number, warningLetterValidityDays: number) => {
  const raw = Array.isArray(value) ? value : [];
  return DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS.map((defaultOption) => {
    const matched = raw.find(
      (item) => item && typeof item === "object" && (item as FollowUpDisciplinaryActionOption).type === defaultOption.type
    ) as Partial<FollowUpDisciplinaryActionOption> | undefined;
    const rawSuspension = toNumber(matched?.suspensionDays, defaultOption.suspensionDays || 0);
    const warningValidity = toNumber(
      matched?.warningValidityDays,
      defaultOption.warningValidityDays || warningLetterValidityDays
    );
    return {
      ...defaultOption,
      label: sanitizeText(matched?.label, defaultOption.label),
      enabled: matched?.enabled ?? defaultOption.enabled,
      suspensionDays:
        defaultOption.actionKind === "suspension"
          ? Math.max(0, Math.min(maxSuspensionDays, rawSuspension || defaultOption.suspensionDays || maxSuspensionDays))
          : matched?.suspensionDays ?? defaultOption.suspensionDays,
      warningValidityDays:
        defaultOption.actionKind === "warning"
          ? Math.max(0, warningValidity || warningLetterValidityDays)
          : matched?.warningValidityDays ?? defaultOption.warningValidityDays,
      notes: Array.isArray(matched?.notes) ? matched?.notes.map((note) => sanitizeText(note)).filter(Boolean) : defaultOption.notes,
    };
  });
};

const normalizeVersioning = (value: unknown): RiskMonitoringVersionConfig => {
  if (!value || typeof value !== "object") return defaultVersioning;
  const source = value as Partial<RiskMonitoringVersionConfig>;
  return {
    status: source.status === "published" ? "published" : "draft",
    draftVersion: Math.max(1, toNumber(source.draftVersion, defaultVersioning.draftVersion)),
    publishedVersion: Math.max(0, toNumber(source.publishedVersion, defaultVersioning.publishedVersion)),
    draftNote: sanitizeText(source.draftNote, defaultVersioning.draftNote),
    lastUpdatedAt: Math.max(0, toNumber(source.lastUpdatedAt, 0)),
    lastUpdatedByUid: sanitizeText(source.lastUpdatedByUid),
    lastUpdatedByName: sanitizeText(source.lastUpdatedByName),
    lastUpdatedByRole: sanitizeText(source.lastUpdatedByRole),
    publishedAt: Math.max(0, toNumber(source.publishedAt, 0)),
    publishedByUid: sanitizeText(source.publishedByUid),
    publishedByName: sanitizeText(source.publishedByName),
    publishedByRole: sanitizeText(source.publishedByRole),
  };
};

export const normalizeRiskMonitoringSettings = (
  value: unknown,
  legacyFollowUpPolicy?: unknown
): RiskMonitoringSettings => {
  const source = value && typeof value === "object" ? (value as Partial<RiskMonitoringSettings>) : {};
  const issueTypes = normalizeIssueTypes(source.issueTypes);
  const riskRules = normalizeRiskRules(source.riskRules);
  const severityBands = normalizeSeverityBands(source.severityBands);

  const normalizedPolicyBase = normalizeFollowUpPolicyConfig(source.followUpPolicy || legacyFollowUpPolicy || null);
  const maxSuspensionDays = Math.max(0, Math.min(7, toNumber(normalizedPolicyBase.maxSuspensionDays, 7)));
  const warningLetterValidityDays = Math.max(
    0,
    toNumber(normalizedPolicyBase.warningLetterValidityDays, DEFAULT_FOLLOW_UP_POLICY_CONFIG.warningLetterValidityDays)
  );

  const followUpPolicy: FollowUpPolicyConfig = {
    ...normalizedPolicyBase,
    maxSuspensionDays,
    warningLetterValidityDays,
    actionOptions: normalizeActionOptions(normalizedPolicyBase.actionOptions, maxSuspensionDays, warningLetterValidityDays),
  };

  return {
    primaryLanguage: "th",
    issueTypes,
    riskRules,
    severityBands,
    followUpPolicy,
    versioning: normalizeVersioning(source.versioning),
  };
};

export const canViewRiskMonitoringSettings = (roles: readonly string[] | undefined | null): boolean =>
  !!roles && roles.some((role) => ["MasterAdmin", "MD", "GM", "PD", "HR", "HRM"].includes(role));

export const canEditRiskMonitoringSettings = (roles: readonly string[] | undefined | null): boolean =>
  !!roles && roles.some((role) => role === "MasterAdmin" || role === "HRM");

export const getRiskIssueTypeMap = (
  settings: RiskMonitoringSettings
): Record<RiskRuleKey, RiskIssueTypeConfig> =>
  settings.issueTypes.reduce(
    (acc, item) => {
      acc[item.key] = item;
      return acc;
    },
    {} as Record<RiskRuleKey, RiskIssueTypeConfig>
  );

export const getSeverityBandMap = (
  settings: RiskMonitoringSettings
): Record<RiskSeverity, SeverityBandConfig> =>
  settings.severityBands.reduce(
    (acc, item) => {
      acc[item.key] = item;
      return acc;
    },
    {} as Record<RiskSeverity, SeverityBandConfig>
  );

export const evaluateConfiguredRiskRules = (
  metrics: RiskMetricSnapshotLike,
  settings: RiskMonitoringSettings
): EvaluatedRiskRule[] => {
  const issueTypeMap = getRiskIssueTypeMap(settings);
  const results: EvaluatedRiskRule[] = [];

  settings.riskRules.forEach((rule) => {
    if (!rule.enabled) return;
    const issueType = issueTypeMap[rule.issueTypeKey];
    if (!issueType || !issueType.enabled) return;

    const primaryValue = toNumber(metrics[rule.metricKey], 0);
    const secondaryValue = rule.secondaryMetricKey ? toNumber(metrics[rule.secondaryMetricKey], 0) : 0;
    const matchedTier = [...rule.tiers]
      .filter((tier) => tier.enabled)
      .sort((a, b) => b.minValue - a.minValue || b.score - a.score)
      .find((tier) => {
        const primaryPass = primaryValue >= tier.minValue;
        const secondaryPass =
          rule.secondaryMetricKey && tier.secondaryMinValue !== undefined ? secondaryValue >= tier.secondaryMinValue : true;
        return primaryPass && secondaryPass;
      });

    if (!matchedTier) return;

    const primaryText = formatMetricValue(primaryValue, rule.valueFormat);
    const reason = rule.secondaryMetricKey
      ? `${issueType.label} ${primaryText} และ${metricLabelMap[rule.secondaryMetricKey]} ${formatMetricValue(
          secondaryValue,
          rule.secondaryValueFormat || "days"
        )}`
      : `${issueType.label} ${primaryText}`;

    results.push({
      key: rule.key,
      label: issueType.shortLabel || issueType.label,
      score: matchedTier.score,
      severityImpact: matchedTier.severityImpact,
      reason,
      value: primaryValue,
      scoreGroup: rule.scoreGroup || rule.key,
    });
  });

  return results;
};

/**
 * Sums evaluated rule scores toward a single totalScore, but only counts the
 * highest-scoring rule within each scoreGroup once. This avoids the same
 * underlying incident (e.g. an absence streak) being counted multiple times
 * across related rules (ขาดต่อเนื่อง / ขาดสะสม / อัตราขาดสูง).
 */
export const computeRiskTotalScore = (rules: Array<Pick<EvaluatedRiskRule, "score" | "scoreGroup">>): number => {
  const bestScoreByGroup = new Map<string, number>();
  rules.forEach((rule) => {
    const current = bestScoreByGroup.get(rule.scoreGroup) || 0;
    if (rule.score > current) bestScoreByGroup.set(rule.scoreGroup, rule.score);
  });
  const total = Array.from(bestScoreByGroup.values()).reduce((sum, score) => sum + score, 0);
  return Math.min(100, total);
};

const getSeverityRank = (severity: RiskSeverity): number => severityOrder.indexOf(severity);

export const deriveSeverityFromSettings = (
  score: number,
  rules: Array<Pick<EvaluatedRiskRule, "severityImpact">>,
  settings: RiskMonitoringSettings
): { severity: RiskSeverity; overrideSeverity?: RiskSeverity } => {
  const orderedBands = [...settings.severityBands].sort((a, b) => a.minScore - b.minScore);
  let severity: RiskSeverity = "normal";
  orderedBands.forEach((band) => {
    if (score >= band.minScore) {
      severity = band.key;
    }
  });

  const overrideSeverity = rules.reduce<RiskSeverity | undefined>((current, rule) => {
    if (!current || getSeverityRank(rule.severityImpact) > getSeverityRank(current)) return rule.severityImpact;
    return current;
  }, undefined);

  if (overrideSeverity && getSeverityRank(overrideSeverity) > getSeverityRank(severity)) {
    return { severity: overrideSeverity, overrideSeverity };
  }
  return { severity, overrideSeverity };
};

export const getSeverityGuidance = (severity: RiskSeverity, settings: RiskMonitoringSettings): string => {
  const band = settings.severityBands.find((item) => item.key === severity);
  return band?.guidance || defaultSeverityBands.find((item) => item.key === severity)?.guidance || "";
};

export const getSeverityLabel = (severity: RiskSeverity, settings: RiskMonitoringSettings): string => {
  const band = settings.severityBands.find((item) => item.key === severity);
  return band?.label || severity;
};

export const getSeverityHex = (severity: RiskSeverity, settings: RiskMonitoringSettings): string => {
  const band = settings.severityBands.find((item) => item.key === severity);
  return band?.colorHex || "#64748b";
};

export const getDefaultRiskRuleTier = (ruleKey: RiskRuleKey): RiskRuleTierConfig => {
  const base = defaultRiskRules.find((item) => item.key === ruleKey);
  const lastTier = base?.tiers[base.tiers.length - 1];
  return {
    id: `${ruleKey}_${Date.now()}`,
    minValue: lastTier?.minValue || 1,
    secondaryMinValue: lastTier?.secondaryMinValue,
    score: lastTier?.score || 10,
    severityImpact: lastTier?.severityImpact || "watch",
    enabled: true,
    note: "",
  };
};

export const getFollowUpActionTypeOptions = (): FollowUpActionType[] =>
  DEFAULT_FOLLOW_UP_DISCIPLINARY_ACTIONS.map((item) => item.type);
