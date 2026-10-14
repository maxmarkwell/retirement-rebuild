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

type PerformancePoint = {
  date: string;
  totalValue: number;
};

type PerformanceChartProps = {
  data: PerformancePoint[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function PerformanceChart({
  data,
}: PerformanceChartProps) {
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("ALL");
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
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-500">
          No snapshot history available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{visibleData.length} recorded snapshots</span><div className="flex flex-wrap gap-1" role="group" aria-label="Chart time range">{(["1M", "3M", "6M", "1Y", "ALL"] as const).map((option) => <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)} className={`rounded-md px-3 py-2 text-xs font-semibold ${range === option ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{option === "ALL" ? "All" : option}</button>)}</div></div>
      <div className="h-72 w-full sm:h-80"><ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={visibleData}
          margin={{
            top: 10,
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
              `$${Number(value).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}`
            }
            domain={["auto", "auto"]}
          />

          <Tooltip
            labelFormatter={(label) =>
              new Date(`${String(label)}T12:00:00`).toLocaleDateString(
                "en-US",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }
              )
            }
            formatter={(value) => [
              formatCurrency(Number(value)),
              "Portfolio Value",
            ]}
          />

          <Line
            type="monotone"
            dataKey="totalValue"
            name="Portfolio Value"
            strokeWidth={3}
            dot={visibleData.length <= 12 ? { r: 3 } : false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer></div>
    </div>
  );
}