"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { LatencyPoint } from "@/lib/types";

function RpsTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload as Record<string, unknown> ?? {};
  const labelStr = label != null ? String(label) : "";
  const totalRps = row.totalRps != null ? String(row.totalRps) : "—";
  const rateLimited = row.rateLimited != null ? Number(row.rateLimited) : 0;

  return (
    <div className="rounded-lg border border-zinc-600/30 bg-[rgba(24,24,27,0.6)] backdrop-blur-xl px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1.5 font-medium text-zinc-400">@ {labelStr}s</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-blue-500/70" />
          <span className="text-zinc-300">Actual RPS</span>
          <span className="ml-auto tabular-nums">{totalRps}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-amber-500/70" />
          <span className="text-zinc-300">Rate-limited</span>
          <span className="ml-auto tabular-nums">{rateLimited}</span>
        </div>
      </div>
    </div>
  );
}

export function RpsChart({ data }: { data: LatencyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(113 113 122 / 0.25)" />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }} tickLine={false} axisLine={false} label={{ value: "seconds", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }} />
        <YAxis tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }} tickLine={false} axisLine={false} width={50} label={{ value: "rps", angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }} />
        <Tooltip content={<RpsTooltip />} />
        <Area type="monotone" dataKey="totalRps" name="Actual RPS" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="rateLimited" name="Rate-limited (429)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
