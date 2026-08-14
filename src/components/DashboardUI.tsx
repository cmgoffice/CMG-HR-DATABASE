import React from "react";
import { Users } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";

export const MetricCard = ({
  title,
  value,
  subvalue,
  icon: Icon,
  accent,
  tooltip,
  onClick,
}: {
  title: string;
  value: string | number;
  subvalue?: string;
  icon: typeof Users;
  accent: string;
  tooltip?: React.ReactNode;
  onClick?: () => void;
}) => (
  <div
    className={`bg-white rounded-lg border border-slate-200 px-2 py-1.5 lg:px-2.5 lg:py-2 shadow-sm ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md" : ""}`}
    onClick={onClick}
    role={onClick ? "button" : undefined}
  >
    <div className="flex items-start justify-between gap-1.5 lg:gap-2">
      <div className="min-w-0">
        <div className="text-[9px] lg:text-[10px] font-black uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
          <span>{title}</span>
          {tooltip && <InfoTooltip content={tooltip} iconSize={11} />}
        </div>
        <div className={`mt-0.5 text-base lg:text-[22px] leading-none font-black ${accent}`}>{value}</div>
        {subvalue && <div className="mt-0.5 text-[9px] lg:text-[10px] leading-tight lg:leading-4 text-slate-500">{subvalue}</div>}
      </div>
      <div className="hidden lg:block rounded-md bg-slate-50 border border-slate-200 p-1">
        <Icon size={14} className={accent} />
      </div>
    </div>
  </div>
);

export const SectionCard = ({
  title,
  subtitle,
  children,
  tooltip,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tooltip?: React.ReactNode;
  headerAction?: React.ReactNode;
}) => (
  <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-2.5 py-1.5 lg:px-3 lg:py-2 border-b border-slate-100">
      <div className="flex items-start justify-between gap-2 lg:gap-3">
        <div className="min-w-0">
          <h3 className="text-xs lg:text-[13px] font-black text-slate-900 inline-flex items-center gap-1.5">
            <span>{title}</span>
            {tooltip && <InfoTooltip content={tooltip} iconSize={13} />}
          </h3>
          {subtitle && <p className="mt-0.5 text-[10px] lg:text-[11px] leading-tight lg:leading-4 text-slate-500">{subtitle}</p>}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
    </div>
    <div className="p-2 lg:p-3">{children}</div>
  </section>
);

export const HorizontalBreakdown = ({
  items,
  total,
  accent,
  onItemClick,
  dense,
}: {
  items: Array<{ label: string; value: number }>;
  total: number;
  accent: string;
  onItemClick?: (item: { label: string; value: number }) => void;
  dense?: boolean;
}) => (
  <div className={dense ? "space-y-1" : "space-y-2"}>
    {items.map((item) => (
      <button
        key={item.label}
        type="button"
        onClick={() => onItemClick?.(item)}
        className={`block w-full text-left ${onItemClick ? `rounded-lg px-1 transition-colors hover:bg-slate-50 ${dense ? "py-0.5" : "py-1"}` : ""}`}
      >
        <div className={`flex items-center justify-between text-xs font-medium text-slate-700 ${dense ? "mb-0.5" : "mb-1"}`}>
          <span>{item.label}</span>
          <span>{item.value}</span>
        </div>
        <div className={`rounded-full bg-slate-100 overflow-hidden ${dense ? "h-2" : "h-2.5"}`}>
          <div
            className={`h-full rounded-full ${accent}`}
            style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
          />
        </div>
      </button>
    ))}
  </div>
);
