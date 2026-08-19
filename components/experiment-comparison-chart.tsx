"use client";

import {
  CartesianGrid,
  Legend,
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
  aiActive: number | null;
  aiLongTerm: number | null;
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
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-500">
          No experiment snapshot history available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 15,
            right: 25,
            left: 15,
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

          <Legend />

          <ReferenceLine
            y={0}
            strokeDasharray="4 4"
          />

          <Line
            type="monotone"
            dataKey="aiActive"
            name="AI Active"
            strokeWidth={3}
            connectNulls
          />

          <Line
            type="monotone"
            dataKey="aiLongTerm"
            name="AI Long-Term"
            strokeWidth={3}
            connectNulls
          />

          <Line
            type="monotone"
            dataKey="benchmark"
            name="VOO Benchmark"
            strokeWidth={3}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}