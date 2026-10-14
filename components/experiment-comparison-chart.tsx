"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ComparisonPoint = {
  date: string;
  realPortfolio: number | null;
  acceleratedGrowth: number | null;
  benchmark: number | null;
};

type ExperimentComparisonChartProps = {
  data: ComparisonPoint[];
};

function formatDate(date: string) {
  return new Date(
    `${date}T12:00:00`
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatPercent(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

export default function ExperimentComparisonChart({
  data,
}: ExperimentComparisonChartProps) {
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("ALL");
  const [shown, setShown] = useState({ realPortfolio: true, acceleratedGrowth: true, benchmark: true });
  const seriesOptions = [{ key: "realPortfolio", label: "Real Portfolio", color: "#2563eb" }, { key: "acceleratedGrowth", label: "Accelerated Growth", color: "#16a34a" }, { key: "benchmark", label: "VOO Benchmark", color: "#dc2626" }] as const;
  function toggleSeries(key: keyof typeof shown) { setShown((current) => ({ ...current, [key]: !current[key] })); }
  const visibleData = useMemo(() => {
    if (range === "ALL" || data.length === 0) return data;
    const latest = new Date(`${data[data.length - 1].date}T12:00:00`);
    if (Number.isNaN(latest.getTime())) return data;
    const cutoff = new Date(latest);
    cutoff.setMonth(cutoff.getMonth() - ({ "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[range]));
    return data.filter((point) => new Date(`${point.date}T12:00:00`) >= cutoff);
  }, [data, range]);
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-500">
          No comparison snapshot history available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{visibleData.length} comparison dates</span><div className="flex flex-wrap gap-1" role="group" aria-label="Comparison time range">{(["1M", "3M", "6M", "1Y", "ALL"] as const).map((option) => <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)} className={`rounded-md px-3 py-2 text-xs font-semibold ${range === option ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{option === "ALL" ? "All" : option}</button>)}</div></div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Visible portfolios">{seriesOptions.map((series) => <button key={series.key} type="button" aria-pressed={shown[series.key]} onClick={() => toggleSeries(series.key)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${shown[series.key] ? "border-slate-300 bg-white text-slate-900" : "border-slate-200 bg-slate-100 text-slate-500"}`}><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color, opacity: shown[series.key] ? 1 : 0.35 }} />{series.label}</button>)}</div>
      <p className="mb-3 text-xs text-slate-500">Portfolio lines show recorded investment returns, not projected results.</p>
      <div className="h-80 w-full sm:h-96"><ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={visibleData}
          margin={{
            top: 15,
            right: 8,
            left: 0,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            minTickGap={24}
          />

          <YAxis
            tickFormatter={(value) =>
              `${Number(value).toFixed(2)}%`
            }
            domain={["auto", "auto"]}
          />

          <Tooltip
            labelFormatter={(label) =>
              new Date(
                `${String(label)}T12:00:00`
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            }
            formatter={(value, name) => [
              formatPercent(Number(value)),
              name,
            ]}
          />



          <ReferenceLine
            y={0}
            stroke="#9ca3af"
            strokeDasharray="4 4"
          />

          {shown.realPortfolio && <Line
            type="monotone"
            dataKey="realPortfolio"
            name="Real Portfolio"
            stroke="#2563eb"
            strokeWidth={3}
            dot={visibleData.length <= 12 ? { r: 3 } : false}
            activeDot={{ r: 6 }}
            connectNulls
          />}

          {shown.acceleratedGrowth && <Line
            type="monotone"
            dataKey="acceleratedGrowth"
            name="Accelerated Growth"
            stroke="#16a34a"
            strokeWidth={3}
            dot={visibleData.length <= 12 ? { r: 3 } : false}
            activeDot={{ r: 6 }}
            connectNulls
          />}

          {shown.benchmark && <Line
            type="monotone"
            dataKey="benchmark"
            name="VOO Benchmark"
            stroke="#dc2626"
            strokeWidth={3}
            strokeDasharray="3 3"
            dot={{ r: 3 }}
            activeDot={{ r: 6 }}
            connectNulls
          />}
        </LineChart>
      </ResponsiveContainer></div>
    </div>
  );
}
