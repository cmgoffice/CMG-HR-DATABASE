import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  GitBranch,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Tags,
  UploadCloud,
} from "lucide-react";
import {
  FollowUpActionType,
  RiskSeverity,
} from "./employeeFollowUpConfig";
import {
  getDefaultRiskRuleTier,
  getSeverityBandMap,
  RiskMonitoringSettings,
  RiskRuleConfig,
  RiskRuleTierConfig,
} from "./riskMonitoringSettingsConfig";

type SettingsTabKey = "rules" | "severity" | "policy" | "issue_types" | "versioning";

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string; icon: typeof Settings2 }> = [
  { key: "rules", label: "กฎความเสี่ยง", icon: AlertTriangle },
  { key: "severity", label: "ระดับความเสี่ยง", icon: ShieldCheck },
  { key: "policy", label: "นโยบายการติดตาม", icon: Settings2 },
  { key: "issue_types", label: "ประเภทเรื่อง", icon: Tags },
  { key: "versioning", label: "เวอร์ชันและการเผยแพร่", icon: GitBranch },
];

const severityOptions: RiskSeverity[] = ["normal", "watch", "risk", "high", "critical"];

const actionKindLabels: Record<FollowUpActionType, string> = {
  status_updated: "อัปเดตสถานะ",
  hrm_approved: "HRM อนุมัติ",
  hrm_commented: "HRM ให้ความเห็น",
  document_submitted: "ส่งร่างเอกสาร",
  document_approved: "อนุมัติเอกสาร",
  document_commented: "ส่งแก้ไขเอกสาร",
  proposed_action: "เสนอการดำเนินการ",
  document_issued: "ออกเอกสารประกอบการดำเนินการ",
  verbal_warning: "เตือนวาจา",
  written_warning: "ออกหนังสือเตือน",
  written_warning_round_1: "หนังสือเตือนครั้งที่ 1",
  written_warning_round_2: "หนังสือเตือนครั้งที่ 2",
  written_warning_round_3: "หนังสือเตือนครั้งที่ 3",
  suspension_3_days: "พักงาน 3 วัน",
  suspension_5_days: "พักงาน 5 วัน",
  suspension_7_days: "พักงาน 7 วัน",
  termination: "พ้นสภาพพนักงาน",
  no_action_with_reason: "ไม่ดำเนินการ",
  closed: "ปิดเคส",
};

const formatDateTime = (value?: number): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
};

const textAreaToList = (value: string): string[] =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const listToTextArea = (value?: string[]): string => (value || []).join("\n");

const cloneSettings = (settings: RiskMonitoringSettings): RiskMonitoringSettings =>
  JSON.parse(JSON.stringify(settings)) as RiskMonitoringSettings;

export const EmployeeFollowUpPolicyTab = ({
  settings,
  canEdit,
  saving,
  onSave,
}: {
  settings: RiskMonitoringSettings;
  canEdit: boolean;
  saving: boolean;
  onSave: (draft: RiskMonitoringSettings, options?: { publish?: boolean }) => Promise<void>;
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>("rules");
  const [draft, setDraft] = useState<RiskMonitoringSettings>(() => cloneSettings(settings));
  const [flashSaved, setFlashSaved] = useState(false);

  useEffect(() => {
    setDraft(cloneSettings(settings));
  }, [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const severityMap = useMemo(() => getSeverityBandMap(draft), [draft]);

  const withDraft = (updater: (current: RiskMonitoringSettings) => RiskMonitoringSettings) => {
    setDraft((current) => updater(cloneSettings(current)));
  };

  const saveDraft = async (publish = false) => {
    await onSave(draft, { publish });
    setFlashSaved(true);
    window.setTimeout(() => setFlashSaved(false), 2500);
  };

  const updateRule = (ruleKey: RiskRuleConfig["key"], updater: (rule: RiskRuleConfig) => RiskRuleConfig) => {
    withDraft((current) => ({
      ...current,
      riskRules: current.riskRules.map((rule) => (rule.key === ruleKey ? updater(rule) : rule)),
    }));
  };

  const updateRuleTier = (
    ruleKey: RiskRuleConfig["key"],
    tierId: string,
    updater: (tier: RiskRuleTierConfig) => RiskRuleTierConfig
  ) => {
    updateRule(ruleKey, (rule) => ({
      ...rule,
      tiers: rule.tiers
        .map((tier) => (tier.id === tierId ? updater(tier) : tier))
        .sort((a, b) => b.minValue - a.minValue || b.score - a.score),
    }));
  };

  const removeRuleTier = (ruleKey: RiskRuleConfig["key"], tierId: string) => {
    updateRule(ruleKey, (rule) => ({
      ...rule,
      tiers: rule.tiers.length <= 1 ? rule.tiers : rule.tiers.filter((tier) => tier.id !== tierId),
    }));
  };

  const addRuleTier = (ruleKey: RiskRuleConfig["key"]) => {
    updateRule(ruleKey, (rule) => ({
      ...rule,
      tiers: [...rule.tiers, getDefaultRiskRuleTier(ruleKey)].sort((a, b) => b.minValue - a.minValue || b.score - a.score),
    }));
  };

  const renderRulesTab = () => (
    <div className="space-y-4">
      <SectionIntro
        title="กฎความเสี่ยง"
        description="แก้ไขการเปิดใช้งานกฎ คะแนน threshold และคำอธิบายแต่ละกฎที่ใช้คำนวณ risk score ใน dashboard และ Risk Monitoring"
      />
      {draft.riskRules.map((rule) => {
        const issueType = draft.issueTypes.find((item) => item.key === rule.issueTypeKey);
        return (
          <div key={rule.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-900">{issueType?.label || rule.key}</div>
                <div className="mt-1 text-xs text-slate-500">
                  อ้างอิง metric หลักจาก `{rule.metricKey}`
                  {rule.secondaryMetricKey ? ` และ metric รองจาก \`${rule.secondaryMetricKey}\`` : ""}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateRule(rule.key, (current) => ({ ...current, enabled: e.target.checked }))}
                />
                เปิดใช้กฎนี้
              </label>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr,1fr]">
              <FieldBlock label="คำอธิบายกฎ">
                <textarea
                  rows={3}
                  value={rule.description}
                  disabled={!canEdit || saving}
                  onChange={(e) => updateRule(rule.key, (current) => ({ ...current, description: e.target.value }))}
                  className={textAreaClass(canEdit, saving)}
                />
              </FieldBlock>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500">ผูกกับประเภทเรื่อง</div>
                <div className="mt-2 text-sm font-bold text-slate-900">{issueType?.shortLabel || issueType?.label || "-"}</div>
                <div className="mt-1 text-xs text-slate-500">{issueType?.description || "ยังไม่ระบุคำอธิบาย"}</div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Threshold หลัก</th>
                    {rule.secondaryMetricKey ? <th className="px-3 py-2 text-left font-semibold">เงื่อนไขรอง</th> : null}
                    <th className="px-3 py-2 text-left font-semibold">คะแนน</th>
                    <th className="px-3 py-2 text-left font-semibold">Impact ระดับ</th>
                    <th className="px-3 py-2 text-left font-semibold">โน้ต</th>
                    <th className="px-3 py-2 text-left font-semibold">สถานะ</th>
                    <th className="px-3 py-2 text-right font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rule.tiers.map((tier) => (
                    <tr key={tier.id}>
                      <td className="px-3 py-3 align-top">
                        <NumberInput
                          value={tier.minValue}
                          disabled={!canEdit || saving}
                          step={rule.valueFormat === "percent" ? 0.01 : 1}
                          onChange={(value) =>
                            updateRuleTier(rule.key, tier.id, (current) => ({
                              ...current,
                              minValue: value,
                            }))
                          }
                        />
                      </td>
                      {rule.secondaryMetricKey ? (
                        <td className="px-3 py-3 align-top">
                          <NumberInput
                            value={tier.secondaryMinValue || 0}
                            disabled={!canEdit || saving}
                            step={rule.secondaryValueFormat === "percent" ? 0.01 : 1}
                            onChange={(value) =>
                              updateRuleTier(rule.key, tier.id, (current) => ({
                                ...current,
                                secondaryMinValue: value,
                              }))
                            }
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-3 align-top">
                        <NumberInput
                          value={tier.score}
                          disabled={!canEdit || saving}
                          step={1}
                          onChange={(value) =>
                            updateRuleTier(rule.key, tier.id, (current) => ({
                              ...current,
                              score: value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={tier.severityImpact}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            updateRuleTier(rule.key, tier.id, (current) => ({
                              ...current,
                              severityImpact: e.target.value as RiskSeverity,
                            }))
                          }
                          className={selectClass(canEdit, saving)}
                        >
                          {severityOptions.map((severityKey) => (
                            <option key={severityKey} value={severityKey}>
                              {severityMap[severityKey].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <textarea
                          rows={2}
                          value={tier.note || ""}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            updateRuleTier(rule.key, tier.id, (current) => ({
                              ...current,
                              note: e.target.value,
                            }))
                          }
                          className={textAreaClass(canEdit, saving)}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={tier.enabled}
                            disabled={!canEdit || saving}
                            onChange={(e) =>
                              updateRuleTier(rule.key, tier.id, (current) => ({
                                ...current,
                                enabled: e.target.checked,
                              }))
                            }
                          />
                          ใช้งาน
                        </label>
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <button
                          type="button"
                          disabled={!canEdit || saving || rule.tiers.length <= 1}
                          onClick={() => removeRuleTier(rule.key, tier.id)}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          ลบขั้น
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={!canEdit || saving}
                onClick={() => addRuleTier(rule.key)}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                เพิ่ม threshold
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSeverityTab = () => (
    <div className="space-y-4">
      <SectionIntro
        title="ระดับความเสี่ยง"
        description="กำหนดช่วงคะแนนขั้นต่ำ ป้ายชื่อ สี และแนวทางที่ใช้สื่อสารกับผู้ใช้งานใน dashboard และหน้า Risk Monitoring"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {draft.severityBands.map((band) => (
          <div key={band.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">{band.key}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{band.label}</div>
              </div>
              <span
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ color: band.colorHex, borderColor: `${band.colorHex}55`, backgroundColor: `${band.colorHex}12` }}
              >
                คะแนนตั้งแต่ {band.minScore}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <FieldBlock label="ชื่อแสดงผล">
                <input
                  value={band.label}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      severityBands: current.severityBands.map((item) =>
                        item.key === band.key ? { ...item, label: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
              <FieldBlock label="คะแนนขั้นต่ำ">
                <NumberInput
                  value={band.minScore}
                  disabled={!canEdit || saving}
                  step={1}
                  onChange={(value) =>
                    withDraft((current) => ({
                      ...current,
                      severityBands: current.severityBands.map((item) =>
                        item.key === band.key ? { ...item, minScore: value } : item
                      ),
                    }))
                  }
                />
              </FieldBlock>
              <FieldBlock label="สีหลัก (Hex)">
                <input
                  value={band.colorHex}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      severityBands: current.severityBands.map((item) =>
                        item.key === band.key ? { ...item, colorHex: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
              <FieldBlock label="แนวทางแนะนำ">
                <input
                  value={band.guidance}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      severityBands: current.severityBands.map((item) =>
                        item.key === band.key ? { ...item, guidance: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPolicyTab = () => (
    <div className="space-y-4">
      <SectionIntro
        title="นโยบายการติดตาม"
        description="กำหนดค่า warning validity, เพดานพักงาน, flag การยกระดับ และชุด action ที่ workflow สามารถใช้งานได้"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-black text-slate-900">นโยบายหลัก</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <FieldBlock label="อายุหนังสือเตือน (วัน)">
              <NumberInput
                value={draft.followUpPolicy.warningLetterValidityDays}
                disabled={!canEdit || saving}
                step={1}
                onChange={(value) =>
                  withDraft((current) => ({
                    ...current,
                    followUpPolicy: { ...current.followUpPolicy, warningLetterValidityDays: value },
                  }))
                }
              />
            </FieldBlock>
            <FieldBlock label="เพดานพักงานสูงสุด (วัน)">
              <NumberInput
                value={draft.followUpPolicy.maxSuspensionDays}
                disabled={!canEdit || saving}
                step={1}
                onChange={(value) =>
                  withDraft((current) => ({
                    ...current,
                    followUpPolicy: { ...current.followUpPolicy, maxSuspensionDays: Math.min(7, value) },
                  }))
                }
              />
            </FieldBlock>
          </div>
          <div className="mt-4 grid gap-3">
            <ToggleRow
              label="อนุญาตให้ข้ามลำดับการยกระดับ"
              checked={draft.followUpPolicy.allowNonSequentialEscalation}
              disabled={!canEdit || saving}
              onChange={(checked) =>
                withDraft((current) => ({
                  ...current,
                  followUpPolicy: { ...current.followUpPolicy, allowNonSequentialEscalation: checked },
                }))
              }
            />
            <ToggleRow
              label="อนุญาต fast-track กรณีร้ายแรง"
              checked={draft.followUpPolicy.allowSeriousOffenseFastTrack}
              disabled={!canEdit || saving}
              onChange={(checked) =>
                withDraft((current) => ({
                  ...current,
                  followUpPolicy: { ...current.followUpPolicy, allowSeriousOffenseFastTrack: checked },
                }))
              }
            />
          </div>
          <FieldBlock className="mt-4" label="หมายเหตุนโยบายเพิ่มเติม (1 บรรทัดต่อ 1 ข้อ)">
            <textarea
              rows={5}
              value={listToTextArea(draft.followUpPolicy.advisoryNotes)}
              disabled={!canEdit || saving}
              onChange={(e) =>
                withDraft((current) => ({
                  ...current,
                  followUpPolicy: { ...current.followUpPolicy, advisoryNotes: textAreaToList(e.target.value) },
                }))
              }
              className={textAreaClass(canEdit, saving)}
            />
          </FieldBlock>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-black text-slate-900">ชุด action ที่ workflow รองรับ</div>
          <div className="mt-4 space-y-3">
            {draft.followUpPolicy.actionOptions.map((action) => (
              <div key={action.type} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{actionKindLabels[action.type] || action.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{action.actionKind}</div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={action.enabled}
                      disabled={!canEdit || saving}
                      onChange={(e) =>
                        withDraft((current) => ({
                          ...current,
                          followUpPolicy: {
                            ...current.followUpPolicy,
                            actionOptions: current.followUpPolicy.actionOptions.map((item) =>
                              item.type === action.type ? { ...item, enabled: e.target.checked } : item
                            ),
                          },
                        }))
                      }
                    />
                    เปิดใช้
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <FieldBlock label="ชื่อปุ่ม / ชื่อแสดงผล">
                    <input
                      value={action.label}
                      disabled={!canEdit || saving}
                      onChange={(e) =>
                        withDraft((current) => ({
                          ...current,
                          followUpPolicy: {
                            ...current.followUpPolicy,
                            actionOptions: current.followUpPolicy.actionOptions.map((item) =>
                              item.type === action.type ? { ...item, label: e.target.value } : item
                            ),
                          },
                        }))
                      }
                      className={inputClass(canEdit, saving)}
                    />
                  </FieldBlock>
                  {action.actionKind === "suspension" ? (
                    <FieldBlock label="ระยะเวลาพักงาน (วัน)">
                      <NumberInput
                        value={action.suspensionDays || 0}
                        disabled={!canEdit || saving}
                        step={1}
                        onChange={(value) =>
                          withDraft((current) => ({
                            ...current,
                            followUpPolicy: {
                              ...current.followUpPolicy,
                              actionOptions: current.followUpPolicy.actionOptions.map((item) =>
                                item.type === action.type ? { ...item, suspensionDays: value } : item
                              ),
                            },
                          }))
                        }
                      />
                    </FieldBlock>
                  ) : null}
                  {action.actionKind === "warning" ? (
                    <FieldBlock label="อายุผลของหนังสือเตือน (วัน)">
                      <NumberInput
                        value={action.warningValidityDays || draft.followUpPolicy.warningLetterValidityDays}
                        disabled={!canEdit || saving}
                        step={1}
                        onChange={(value) =>
                          withDraft((current) => ({
                            ...current,
                            followUpPolicy: {
                              ...current.followUpPolicy,
                              actionOptions: current.followUpPolicy.actionOptions.map((item) =>
                                item.type === action.type ? { ...item, warningValidityDays: value } : item
                              ),
                            },
                          }))
                        }
                      />
                    </FieldBlock>
                  ) : null}
                </div>

                <FieldBlock className="mt-3" label="โน้ต action (1 บรรทัดต่อ 1 ข้อ)">
                  <textarea
                    rows={3}
                    value={listToTextArea(action.notes)}
                    disabled={!canEdit || saving}
                    onChange={(e) =>
                      withDraft((current) => ({
                        ...current,
                        followUpPolicy: {
                          ...current.followUpPolicy,
                          actionOptions: current.followUpPolicy.actionOptions.map((item) =>
                            item.type === action.type ? { ...item, notes: textAreaToList(e.target.value) } : item
                          ),
                        },
                      }))
                    }
                    className={textAreaClass(canEdit, saving)}
                  />
                </FieldBlock>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderIssueTypesTab = () => (
    <div className="space-y-4">
      <SectionIntro
        title="ประเภทเรื่อง"
        description="กำหนด label, category และคำอธิบายของประเด็นที่ใช้ทั้งใน Risk Monitoring และ follow-up workflow"
      />
      <div className="grid gap-4">
        {draft.issueTypes.map((issueType) => (
          <div key={issueType.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{issueType.key}</div>
                <div className="mt-1 text-base font-black text-slate-900">{issueType.label}</div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={issueType.enabled}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      issueTypes: current.issueTypes.map((item) =>
                        item.key === issueType.key ? { ...item, enabled: e.target.checked } : item
                      ),
                    }))
                  }
                />
                เปิดใช้
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <FieldBlock label="ชื่อเต็ม">
                <input
                  value={issueType.label}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      issueTypes: current.issueTypes.map((item) =>
                        item.key === issueType.key ? { ...item, label: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
              <FieldBlock label="ชื่อสั้น">
                <input
                  value={issueType.shortLabel}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      issueTypes: current.issueTypes.map((item) =>
                        item.key === issueType.key ? { ...item, shortLabel: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
              <FieldBlock label="หมวด">
                <input
                  value={issueType.category}
                  disabled={!canEdit || saving}
                  onChange={(e) =>
                    withDraft((current) => ({
                      ...current,
                      issueTypes: current.issueTypes.map((item) =>
                        item.key === issueType.key ? { ...item, category: e.target.value } : item
                      ),
                    }))
                  }
                  className={inputClass(canEdit, saving)}
                />
              </FieldBlock>
            </div>
            <FieldBlock className="mt-3" label="คำอธิบาย / แนวใช้">
              <textarea
                rows={3}
                value={issueType.description}
                disabled={!canEdit || saving}
                onChange={(e) =>
                  withDraft((current) => ({
                    ...current,
                    issueTypes: current.issueTypes.map((item) =>
                      item.key === issueType.key ? { ...item, description: e.target.value } : item
                    ),
                  }))
                }
                className={textAreaClass(canEdit, saving)}
              />
            </FieldBlock>
          </div>
        ))}
      </div>
    </div>
  );

  const renderVersioningTab = () => (
    <div className="space-y-4">
      <SectionIntro
        title="เวอร์ชันและการเผยแพร่"
        description="MVP นี้ใช้ draft/save/publish แบบเอกสารเดียว เพื่อให้ทีมเห็นสถานะล่าสุดของ config กลางและเผยแพร่ค่าที่พร้อมใช้งาน"
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-black text-slate-900">สถานะปัจจุบัน</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MetaCard label="สถานะเอกสาร" value={draft.versioning.status === "published" ? "Published" : "Draft"} />
            <MetaCard label="Draft version" value={`v${draft.versioning.draftVersion}`} />
            <MetaCard label="Published version" value={draft.versioning.publishedVersion ? `v${draft.versioning.publishedVersion}` : "-"} />
            <MetaCard label="อัปเดตล่าสุด" value={formatDateTime(draft.versioning.lastUpdatedAt)} />
            <MetaCard
              label="ผู้แก้ไขล่าสุด"
              value={draft.versioning.lastUpdatedByName || "-"}
              note={draft.versioning.lastUpdatedByRole || ""}
            />
            <MetaCard
              label="เผยแพร่ล่าสุด"
              value={formatDateTime(draft.versioning.publishedAt)}
              note={draft.versioning.publishedByName || ""}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-black text-slate-900">บันทึกเวอร์ชัน</div>
          <FieldBlock className="mt-4" label="Draft note">
            <textarea
              rows={6}
              value={draft.versioning.draftNote}
              disabled={!canEdit || saving}
              onChange={(e) =>
                withDraft((current) => ({
                  ...current,
                  versioning: { ...current.versioning, draftNote: e.target.value },
                }))
              }
              className={textAreaClass(canEdit, saving)}
            />
          </FieldBlock>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            การกด "บันทึกร่าง" จะเพิ่ม draft version และอัปเดต metadata ล่าสุด ส่วน "เผยแพร่" จะยก draft version ปัจจุบันขึ้นเป็น
            published version เพื่อให้ทีมอ้างอิงได้ชัดเจน
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <Settings2 size={18} className="text-sky-600" />
              <h3 className="text-lg font-black">ศูนย์ตั้งค่า Risk Monitoring</h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              หน้านี้รวมค่า threshold, severity band, policy การติดตาม, issue type และ metadata การเผยแพร่ไว้ในเอกสารกลางเดียว
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                canEdit ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {canEdit ? <ShieldCheck size={14} /> : <Lock size={14} />}
              {canEdit ? "สิทธิ์แก้ไข: HRM / MasterAdmin" : "สิทธิ์ดูอย่างเดียว"}
            </span>
            {flashSaved && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">บันทึกแล้ว</span>}
          </div>
        </div>

        {!canEdit && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            บทบาทนี้สามารถดูการตั้งค่าได้ แต่การแก้ไขและเผยแพร่สงวนไว้สำหรับ HRM และ MasterAdmin เท่านั้น
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canEdit || !dirty || saving}
            onClick={() => void saveDraft(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            บันทึกร่าง
          </button>
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={() => setDraft(cloneSettings(settings))}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw size={15} />
            รีเซ็ตการแก้ไข
          </button>
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={() => void saveDraft(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <UploadCloud size={15} />
            เผยแพร่
          </button>
          <span className="text-xs text-slate-500">{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "ไม่มีการแก้ไขค้างอยู่"}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                  active ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "rules" && renderRulesTab()}
      {activeTab === "severity" && renderSeverityTab()}
      {activeTab === "policy" && renderPolicyTab()}
      {activeTab === "issue_types" && renderIssueTypesTab()}
      {activeTab === "versioning" && renderVersioningTab()}
    </div>
  );
};

const SectionIntro = ({ title, description }: { title: string; description: string }) => (
  <div>
    <div className="text-lg font-black text-slate-900">{title}</div>
    <div className="mt-1 text-sm text-slate-500">{description}</div>
  </div>
);

const FieldBlock = ({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
    {children}
  </div>
);

const MetaCard = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    {note ? <div className="mt-1 text-[11px] text-slate-500">{note}</div> : null}
  </div>
);

const ToggleRow = ({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
    <span className="text-sm font-semibold text-slate-800">{label}</span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

const NumberInput = ({
  value,
  disabled,
  onChange,
  step,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  step: number;
}) => (
  <input
    type="number"
    step={step}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(Number(e.target.value))}
    className={inputClass(!disabled, disabled)}
  />
);

const inputClass = (canEdit: boolean, saving: boolean) =>
  `h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 ${
    !canEdit || saving ? "bg-slate-50 text-slate-500" : "bg-white"
  }`;

const selectClass = (canEdit: boolean, saving: boolean) =>
  `h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-sky-100 ${
    !canEdit || saving ? "bg-slate-50 text-slate-500" : "bg-white"
  }`;

const textAreaClass = (canEdit: boolean, saving: boolean) =>
  `w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-100 ${
    !canEdit || saving ? "bg-slate-50 text-slate-500" : "bg-white"
  }`;
