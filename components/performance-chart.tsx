"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 10,
            right: 20,
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
            dot
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}