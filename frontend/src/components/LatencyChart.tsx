"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export type LatencyPoint = {
  t: number;
  cache: number;
  noCache: number;
  cachePct: number;
  noCachePct: number;
};

export function LatencyChart({ data }: { data: LatencyPoint[] }) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(113 113 122 / 0.25)" />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }}
          tickLine={false}
          axisLine={false}
          label={{ value: "seconds", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }}
          tickLine={false}
          axisLine={false}
          width={48}
          label={{ value: "ms", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
        />
        <YAxis
          yAxisId="error"
          orientation="right"
          tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }}
          tickLine={false}
          axisLine={false}
          width={64}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          label={{ value: "errors", angle: 90, position: "insideRight", offset: 6, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(24, 24, 27, 0.9)",
            border: "1px solid rgba(113, 113, 122, 0.35)",
            borderRadius: 6,
            fontSize: 12,
            color: "#fafafa",
          }}
          labelFormatter={(v) => `@ ${v}s`}
          formatter={(value: number, name: string) => {
            if (name === "No Cache" || name === "Cache") {
              return [`${value.toFixed(1)} ms`, name];
            }
            return [`${value.toFixed(1)}%`, name];
          }}
        />
        <Area
          type="monotone"
          dataKey="noCache"
          name="No Cache"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.15}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="cache"
          name="Cache"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.25}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Area
          yAxisId="error"
          type="monotone"
          dataKey="noCachePct"
          name="No Cache Errors"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 3"
          fill="none"
          dot={false}
          isAnimationActive={false}
        />
        <Area
          yAxisId="error"
          type="monotone"
          dataKey="cachePct"
          name="Cache Errors"
          stroke="#22c55e"
          strokeWidth={1}
          strokeDasharray="4 3"
          fill="none"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
