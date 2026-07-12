import React from "react";
import { ShieldAlert } from "lucide-react";
import { ManpowerDashboard } from "./ManpowerDashboard";
import { InfoTooltip } from "./InfoTooltip";

export const RiskMonitoringPage = ({ projectOptions }: { projectOptions: string[] }) => {
  return (
    <div className="p-6 h-full overflow-y-auto space-y-4">
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

      <ManpowerDashboard projectOptions={projectOptions} showOnlyRiskMonitoring={true} />
    </div>
  );
};
