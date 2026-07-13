import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";

const useIsMobile = (query = "(max-width: 1023px)"): boolean => {
  const [matches, setMatches] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
};

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export const DonutChart = ({
  data,
  centerValue,
  centerSub,
  height,
  unit = "คน",
}: {
  data: DonutDatum[];
  centerValue: React.ReactNode;
  centerSub?: string;
  height?: number;
  unit?: string;
}) => {
  const isMobile = useIsMobile();
  const resolvedHeight = height ?? (isMobile ? 165 : 220);
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: resolvedHeight }}>
        ไม่มีข้อมูลในช่วงนี้
      </div>
    );
  }
  return (
    <div className="relative" style={{ height: resolvedHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="none"
          >
            {filtered.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} ${unit}`, name] as [string, typeof name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={9}
            formatter={(value) => <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ paddingBottom: 28 }}
      >
        <div className="text-xl lg:text-2xl font-black leading-none text-slate-900">{centerValue}</div>
        {centerSub && <div className="mt-1 text-[10px] lg:text-[11px] text-slate-500">{centerSub}</div>}
      </div>
    </div>
  );
};

const coverageColor = (rate: number): string => {
  if (rate <= 0) return "#b91c1c";
  if (rate < 0.8) return "#ef4444";
  if (rate < 0.95) return "#f59e0b";
  return "#10b981";
};

export interface CoverageBarDatum {
  name: string;
  fullName: string;
  target: number;
  actual: number;
  coverageRate: number;
}

export const CoverageCompareChart = ({
  data,
  height,
  yAxisWidth = 120,
  onBarClick,
}: {
  data: CoverageBarDatum[];
  height?: number;
  yAxisWidth?: number;
  onBarClick?: (fullName: string) => void;
}) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: height ?? 80 }}>
        ไม่มีข้อมูลในช่วงนี้
      </div>
    );
  }
  const chartHeight = height ?? Math.max(80, 26 + data.length * 28);
  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 34, top: 4, bottom: 4 }}
          barGap={1}
          barCategoryGap="22%"
        >
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={yAxisWidth}
            tick={{ fontSize: 11, fill: "#475569" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            formatter={(value, name) => [`${value} employee-days`, name] as [string, typeof name]}
            labelFormatter={(_label: any, payload: any) => (payload && payload[0] ? payload[0].payload.fullName : "")}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconType="circle"
            iconSize={9}
            formatter={(value) => <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>}
          />
          <Bar dataKey="target" name="ต้องการ (แผน)" fill="#cbd5e1" radius={[0, 3, 3, 0]} maxBarSize={11}>
            <LabelList dataKey="target" position="right" style={{ fontSize: 9, fill: "#94a3b8" }} />
          </Bar>
          <Bar
            dataKey="actual"
            name="มาจริง"
            radius={[0, 3, 3, 0]}
            maxBarSize={11}
            onClick={(entry: any) => onBarClick && entry && onBarClick(entry.fullName)}
            cursor={onBarClick ? "pointer" : undefined}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={coverageColor(d.coverageRate)} />
            ))}
            <LabelList dataKey="actual" position="right" style={{ fontSize: 9, fill: "#475569", fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export interface RankedBarDatum {
  name: string;
  fullName: string;
  value: number;
  color: string;
}

export const RankedBarChart = ({
  data,
  height,
  maxValue = 100,
  valueSuffix = "",
  yAxisWidth,
  onBarClick,
}: {
  data: RankedBarDatum[];
  height?: number;
  maxValue?: number;
  valueSuffix?: string;
  yAxisWidth?: number;
  onBarClick?: (fullName: string) => void;
}) => {
  const isMobile = useIsMobile();
  const resolvedHeight = height ?? (isMobile ? 200 : 240);
  const resolvedYAxisWidth = yAxisWidth ?? (isMobile ? 96 : 130);
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: resolvedHeight }}>
        ไม่มีข้อมูลในช่วงนี้
      </div>
    );
  }
  return (
    <div style={{ height: resolvedHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 32, top: 4, bottom: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={[0, maxValue]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={resolvedYAxisWidth}
            tick={{ fontSize: 11, fill: "#475569" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#f8fafc" }}
            formatter={(value) => [`${value}${valueSuffix}`, "คะแนนเสี่ยง"] as [string, string]}
            labelFormatter={(_label: any, payload: any) => (payload && payload[0] ? payload[0].payload.fullName : "")}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            onClick={(entry: any) => onBarClick && entry && onBarClick(entry.fullName)}
            cursor={onBarClick ? "pointer" : undefined}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: "#475569", fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
