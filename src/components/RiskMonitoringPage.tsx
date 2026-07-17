import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { EmployeeFollowUpPolicyTab } from "./EmployeeFollowUpPolicyTab";
import { EmployeeFollowUpTab } from "./EmployeeFollowUpTab";
import { InfoTooltip } from "./InfoTooltip";
import { ManpowerDashboard } from "./ManpowerDashboard";
import {
  EMPLOYEE_FOLLOW_UP_COLLECTION,
  EmployeeFollowUpCase,
  FOLLOW_UP_POLICY_COLLECTION,
  FOLLOW_UP_POLICY_DOC_ID,
  FollowUpRiskSeed,
  RiskRuleKey,
  getDefaultHrmReviewStatus,
  getFollowUpDocId,
  isFollowUpOpenStatus,
  isFollowUpProcessedStatus,
  normalizeFollowUpCase,
} from "./employeeFollowUpConfig";
import {
  canEditRiskMonitoringSettings,
  canViewFollowUpQueueTab,
  canViewRiskMonitoringSettings,
  DEFAULT_RISK_MONITORING_SETTINGS,
  normalizeRiskMonitoringSettings,
  RISK_MONITORING_SETTINGS_COLLECTION,
  RISK_MONITORING_SETTINGS_DOC_ID,
  RiskMonitoringSettings,
} from "./riskMonitoringSettingsConfig";

export const RiskMonitoringPage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { firebaseUser, userProfile } = useAuth();
  const db = getFirestore();

  const [tab, setTab] = useState<"risk" | "follow_up" | "backlog" | "policy">("risk");
  const [followUpCases, setFollowUpCases] = useState<EmployeeFollowUpCase[]>([]);
  const [detectedRiskSeeds, setDetectedRiskSeeds] = useState<FollowUpRiskSeed[]>([]);
  const [settingsDoc, setSettingsDoc] = useState<unknown>(null);
  const [legacyPolicyDoc, setLegacyPolicyDoc] = useState<unknown>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<null | {
    seed: FollowUpRiskSeed;
    preferredIssueKey?: RiskRuleKey;
    requestedAt: number;
  }>(null);

  const roles = userProfile?.role || [];
  const canViewFollowUp = canViewFollowUpQueueTab(roles);
  // Backlog / นโยบายเป็นภาพรวมระดับองค์กร ไม่เปิดให้ Admin Site ที่เห็นได้เฉพาะแท็บ "การติดตามพนักงาน" แบบจำกัดขอบเขต
  const canViewOrgWideTabs = canViewRiskMonitoringSettings(roles);
  const canEditSettings = canEditRiskMonitoringSettings(roles);
  const riskSettings = useMemo<RiskMonitoringSettings>(
    () => normalizeRiskMonitoringSettings(settingsDoc, legacyPolicyDoc),
    [legacyPolicyDoc, settingsDoc]
  );

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "CMG-HR-Database", "root", EMPLOYEE_FOLLOW_UP_COLLECTION), (snap) => {
      setFollowUpCases(
        snap.docs.map((item) =>
          normalizeFollowUpCase({ id: item.id, ...(item.data() as any) } as EmployeeFollowUpCase)
        )
      );
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const settingsRef = doc(
      db,
      "CMG-HR-Database",
      "root",
      RISK_MONITORING_SETTINGS_COLLECTION,
      RISK_MONITORING_SETTINGS_DOC_ID
    );
    const legacyPolicyRef = doc(db, "CMG-HR-Database", "root", FOLLOW_UP_POLICY_COLLECTION, FOLLOW_UP_POLICY_DOC_ID);

    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        setSettingsDoc(snap.exists() ? snap.data() : null);
      },
      () => {
        setSettingsDoc(DEFAULT_RISK_MONITORING_SETTINGS);
      }
    );
    const unsubLegacyPolicy = onSnapshot(
      legacyPolicyRef,
      (snap) => {
        setLegacyPolicyDoc(snap.exists() ? snap.data() : null);
      },
      () => {
        setLegacyPolicyDoc(null);
      }
    );

    return () => {
      unsubSettings();
      unsubLegacyPolicy();
    };
  }, [db]);

  useEffect(() => {
    if (!canViewFollowUp && tab !== "risk") {
      setTab("risk");
    }
  }, [canViewFollowUp, tab]);

  const detectedIssueIds = useMemo(
    () => new Set(detectedRiskSeeds.flatMap((seed) => seed.rules.map((rule) => getFollowUpDocId(seed.employeeId, rule.key)))),
    [detectedRiskSeeds]
  );

  const queueCount = useMemo(() => {
    const activePersistedOutsideCurrentRisk = followUpCases.filter(
      (item) => !detectedIssueIds.has(item.id) && isFollowUpOpenStatus(item.status)
    ).length;
    return detectedIssueIds.size + activePersistedOutsideCurrentRisk;
  }, [detectedIssueIds, followUpCases]);

  const backlogCount = useMemo(
    () =>
      followUpCases.filter((item) => {
        const hrmReviewStatus = getDefaultHrmReviewStatus(item);
        return (
          !detectedIssueIds.has(item.id) &&
          isFollowUpProcessedStatus(item.status) &&
          hrmReviewStatus !== "pending" &&
          hrmReviewStatus !== "commented"
        );
      }).length,
    [detectedIssueIds, followUpCases]
  );

  const saveRiskSettings = async (draft: RiskMonitoringSettings, options?: { publish?: boolean }) => {
    if (!canEditSettings) return;
    const publish = options?.publish === true;
    const now = Date.now();
    const actorName =
      `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.trim() || firebaseUser?.email || "unknown";
    const actorRole = roles.includes("MasterAdmin") ? "MasterAdmin" : roles.includes("HRM") ? "HRM" : roles[0] || "";
    const nextDraftVersion = Math.max(riskSettings.versioning.draftVersion || 1, draft.versioning.draftVersion || 1) + 1;

    const payload = normalizeRiskMonitoringSettings({
      ...draft,
      versioning: {
        ...draft.versioning,
        status: publish ? "published" : "draft",
        draftVersion: nextDraftVersion,
        publishedVersion: publish ? nextDraftVersion : Math.max(0, draft.versioning.publishedVersion || 0),
        lastUpdatedAt: now,
        lastUpdatedByUid: firebaseUser?.uid || "",
        lastUpdatedByName: actorName,
        lastUpdatedByRole: actorRole,
        publishedAt: publish ? now : draft.versioning.publishedAt || 0,
        publishedByUid: publish ? firebaseUser?.uid || "" : draft.versioning.publishedByUid || "",
        publishedByName: publish ? actorName : draft.versioning.publishedByName || "",
        publishedByRole: publish ? actorRole : draft.versioning.publishedByRole || "",
      },
    });

    setSettingsSaving(true);
    try {
      await setDoc(
        doc(db, "CMG-HR-Database", "root", RISK_MONITORING_SETTINGS_COLLECTION, RISK_MONITORING_SETTINGS_DOC_ID),
        payload
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleOpenFollowUp = (seed: FollowUpRiskSeed, preferredIssueKey?: RiskRuleKey) => {
    if (!canViewFollowUp) return;
    setPendingLaunch({ seed, preferredIssueKey, requestedAt: Date.now() });
    setTab("follow_up");
  };

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-600">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-900">
              <span>Risk Monitoring</span>
              <InfoTooltip
                content="หน้านี้แสดงเฉพาะรายการความเสี่ยงของพนักงานและโครงการ โดยใช้กฎ risk score ชุดเดียวกับหน้า Dashboard"
              />
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              หน้านี้แสดงเฉพาะรายการความเสี่ยงของโครงการและพนักงานที่ต้องติดตาม โดยใช้กฎ risk score เดียวกับหน้า
              Dashboard
            </p>
          </div>
        </div>
      </div>

      <div className="-mx-6 sticky top-0 z-10 border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "risk"} onClick={() => setTab("risk")} label="ความเสี่ยง" />
          {canViewFollowUp && (
            <TabButton
              active={tab === "follow_up"}
              onClick={() => setTab("follow_up")}
              label={`การติดตามพนักงาน${queueCount > 0 ? ` (${queueCount})` : ""}`}
            />
          )}
          {canViewOrgWideTabs && (
            <>
              <TabButton
                active={tab === "backlog"}
                onClick={() => setTab("backlog")}
                label={`Backlog / ประวัติ${backlogCount > 0 ? ` (${backlogCount})` : ""}`}
              />
              <TabButton active={tab === "policy"} onClick={() => setTab("policy")} label="ตั้งค่า Risk Monitoring" />
            </>
          )}
        </div>
      </div>

      {tab === "risk" || !canViewFollowUp ? (
        <ManpowerDashboard
          projectOptions={projectOptions}
          showOnlyRiskMonitoring={true}
          riskSettings={riskSettings}
          followUpCases={followUpCases}
          onOpenFollowUp={handleOpenFollowUp}
          onFollowUpQueueSeedsChange={setDetectedRiskSeeds}
        />
      ) : tab === "policy" ? (
        <EmployeeFollowUpPolicyTab
          settings={riskSettings}
          canEdit={canEditSettings}
          saving={settingsSaving}
          onSave={saveRiskSettings}
        />
      ) : (
        <EmployeeFollowUpTab
          view={tab === "backlog" ? "backlog" : "queue"}
          cases={followUpCases}
          detectedRiskSeeds={detectedRiskSeeds}
          policyConfig={riskSettings.followUpPolicy}
          pendingLaunch={pendingLaunch}
          onPendingLaunchHandled={() => setPendingLaunch(null)}
        />
      )}
    </div>
  );
};

const TabButton = ({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
      active ? "border-rose-600 text-rose-700" : "border-transparent text-slate-500 hover:text-slate-700"
    }`}
  >
    {label}
  </button>
);
