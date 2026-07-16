import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getFirestore, onSnapshot } from "firebase/firestore";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { EmployeeFollowUpPolicyTab } from "./EmployeeFollowUpPolicyTab";
import { ManpowerDashboard } from "./ManpowerDashboard";
import { EmployeeFollowUpTab } from "./EmployeeFollowUpTab";
import { InfoTooltip } from "./InfoTooltip";
import {
  canViewFollowUpModule,
  DEFAULT_FOLLOW_UP_POLICY_CONFIG,
  EMPLOYEE_FOLLOW_UP_COLLECTION,
  EmployeeFollowUpCase,
  FOLLOW_UP_POLICY_COLLECTION,
  FOLLOW_UP_POLICY_DOC_ID,
  FollowUpPolicyConfig,
  FollowUpRiskSeed,
  RiskRuleKey,
  getDefaultHrmReviewStatus,
  getFollowUpDocId,
  isFollowUpOpenStatus,
  isFollowUpProcessedStatus,
  normalizeFollowUpCase,
  normalizeFollowUpPolicyConfig,
} from "./employeeFollowUpConfig";

export const RiskMonitoringPage = ({ projectOptions }: { projectOptions: string[] }) => {
  const { userProfile } = useAuth();
  const db = getFirestore();
  const [tab, setTab] = useState<"risk" | "follow_up" | "backlog" | "policy">("risk");
  const [followUpCases, setFollowUpCases] = useState<EmployeeFollowUpCase[]>([]);
  const [detectedRiskSeeds, setDetectedRiskSeeds] = useState<FollowUpRiskSeed[]>([]);
  const [followUpPolicy, setFollowUpPolicy] = useState<FollowUpPolicyConfig>(DEFAULT_FOLLOW_UP_POLICY_CONFIG);
  const [pendingLaunch, setPendingLaunch] = useState<null | {
    seed: FollowUpRiskSeed;
    preferredIssueKey?: RiskRuleKey;
    requestedAt: number;
  }>(null);
  const canViewFollowUp = canViewFollowUpModule(userProfile?.role || []);

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
    const ref = doc(db, "CMG-HR-Database", "root", FOLLOW_UP_POLICY_COLLECTION, FOLLOW_UP_POLICY_DOC_ID);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setFollowUpPolicy(normalizeFollowUpPolicyConfig(snap.exists() ? snap.data() : null));
      },
      () => {
        setFollowUpPolicy(DEFAULT_FOLLOW_UP_POLICY_CONFIG);
      }
    );
    return () => unsub();
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
      (item) =>
        !detectedIssueIds.has(item.id) &&
        isFollowUpOpenStatus(item.status)
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

  const handleOpenFollowUp = (seed: FollowUpRiskSeed, preferredIssueKey?: RiskRuleKey) => {
    if (!canViewFollowUp) return;
    setPendingLaunch({ seed, preferredIssueKey, requestedAt: Date.now() });
    setTab("follow_up");
  };

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-600">
            <ShieldAlert size={22} />
          </div>
          <div>
                  <h2 className="text-xl font-black text-slate-900 inline-flex items-center gap-2">
                    <span>Risk Monitoring</span>
                    <InfoTooltip
                      content="หน้านี้แสดงเฉพาะรายการความเสี่ยงของพนักงานและโครงการ โดยใช้กฎ risk score ชุดเดียวกับหน้า Dashboard"
                    />
                  </h2>
            <p className="mt-1 text-sm text-slate-600">
              หน้านี้แสดงเฉพาะรายการความเสี่ยงของโครงการและพนักงานที่ต้องติดตาม
              โดยใช้กฎ risk score เดียวกับหน้า Dashboard
            </p>
          </div>
        </div>
      </div>

      <div className="-mx-6 sticky top-0 z-10 border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "risk"} onClick={() => setTab("risk")} label="ความเสี่ยง" />
          {canViewFollowUp && (
            <>
              <TabButton
                active={tab === "follow_up"}
                onClick={() => setTab("follow_up")}
                label={`การติดตามพนักงาน${queueCount > 0 ? ` (${queueCount})` : ""}`}
              />
              <TabButton
                active={tab === "backlog"}
                onClick={() => setTab("backlog")}
                label={`Backlog / ประวัติ${backlogCount > 0 ? ` (${backlogCount})` : ""}`}
              />
              <TabButton active={tab === "policy"} onClick={() => setTab("policy")} label="นโยบายการติดตาม" />
            </>
          )}
        </div>
      </div>

      {tab === "risk" || !canViewFollowUp ? (
        <ManpowerDashboard
          projectOptions={projectOptions}
          showOnlyRiskMonitoring={true}
          followUpCases={followUpCases}
          onOpenFollowUp={handleOpenFollowUp}
          onFollowUpQueueSeedsChange={setDetectedRiskSeeds}
        />
      ) : tab === "policy" ? (
        <EmployeeFollowUpPolicyTab policy={followUpPolicy} />
      ) : (
        <EmployeeFollowUpTab
          view={tab === "backlog" ? "backlog" : "queue"}
          cases={followUpCases}
          detectedRiskSeeds={detectedRiskSeeds}
          policyConfig={followUpPolicy}
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
    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
      active ? "border-rose-600 text-rose-700" : "border-transparent text-slate-500 hover:text-slate-700"
    }`}
  >
    {label}
  </button>
);
