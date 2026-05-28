"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

import type { LatencyPoint } from "@/components/LatencyChart";

function CustomTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="rounded-lg border border-zinc-600/30 bg-[rgba(24,24,27,0.6)] backdrop-blur-xl px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1.5 font-medium text-zinc-400">@ {String(label)}s</p>
      <div className="space-y-1">
        {row.noCachePct !== null && row.noCachePct !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-red-500/70" />
            <span className="text-zinc-300">No Cache Errors</span>
            <span className="ml-auto tabular-nums">{Number(row.noCachePct).toFixed(1)}%</span>
          </div>
        ) : null}
        {row.cachePct !== null && row.cachePct !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-green-500/70" />
            <span className="text-zinc-300">Cache Errors</span>
            <span className="ml-auto tabular-nums">{Number(row.cachePct).toFixed(1)}%</span>
          </div>
        ) : null}
        {row.cacheMissRate !== null && row.cacheMissRate !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-amber-500/70" />
            <span className="text-zinc-300">Miss Rate</span>
            <span className="ml-auto tabular-nums">{Number(row.cacheMissRate).toFixed(1)}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorChart({ data, activeLine, hoveredPoint }: { data: LatencyPoint[]; activeLine?: number | null; hoveredPoint?: LatencyPoint | null }) {
  const avgNoCacheErr = useMemo(() => {
    const vals = data.map((d) => d.noCachePct).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [data]);

  const avgCacheErr = useMemo(() => {
    const vals = data.map((d) => d.cachePct).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [data]);

  const avgMissRate = useMemo(() => {
    const vals = data.map((d) => d.cacheMissRate).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [data]);

  const hasErrors = data.some(
    (d) =>
      (d.noCachePct != null && d.noCachePct > 0) ||
      (d.cachePct != null && d.cachePct > 0) ||
      (d.cacheMissRate != null && d.cacheMissRate > 0),
  );

  if (data.length === 0 || !hasErrors) return null;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(113 113 122 / 0.25)" />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }}
              tickLine={false}
              axisLine={false}
              label={{ value: "seconds", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 600 }}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(v: number) => `${v}%`}
              label={{ value: "%", angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={activeLine ?? -999}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={activeLine != null ? 1.5 : 0}
            />
            <Area
              type="monotone"
              dataKey="noCachePct"
              name="No Cache Errors"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="#ef4444"
              fillOpacity={0.08}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="cachePct"
              name="Cache Errors"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="#22c55e"
              fillOpacity={0.08}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="cacheMissRate"
              name="Miss Rate"
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="2 3"
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </div>
      {hoveredPoint && (
        <div className="absolute top-1 right-1 rounded-lg border border-zinc-600/30 bg-[rgba(24,24,27,0.6)] backdrop-blur-xl px-2 py-1.5 text-[11px] text-zinc-100 shadow-lg pointer-events-none z-10">
          <p className="mb-0.5 font-medium text-zinc-400">@ {hoveredPoint.t}s</p>
          <div className="space-y-[2px]">
            {hoveredPoint.noCachePct != null && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-red-500/70" />
                <span className="text-zinc-300">No Cache Errors</span>
                <span className="ml-auto tabular-nums">{hoveredPoint.noCachePct.toFixed(1)}%</span>
              </div>
            )}
            {hoveredPoint.cachePct != null && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-green-500/70" />
                <span className="text-zinc-300">Cache Errors</span>
                <span className="ml-auto tabular-nums">{hoveredPoint.cachePct.toFixed(1)}%</span>
              </div>
            )}
            {hoveredPoint.cacheMissRate != null && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-amber-500/70" />
                <span className="text-zinc-300">Miss Rate</span>
                <span className="ml-auto tabular-nums">{hoveredPoint.cacheMissRate.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="shrink-0 flex items-center justify-center gap-4 pt-1.5 pb-1 text-[11px] border-t border-zinc-700/30 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500/60" />
          <span className="text-zinc-400">No Cache Errors:</span>
          <span className="font-mono tabular-nums text-red-400">{avgNoCacheErr.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-green-500/60" />
          <span className="text-zinc-400">Cache Errors:</span>
          <span className="font-mono tabular-nums text-green-400">{avgCacheErr.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500/60" />
          <span className="text-zinc-400">Miss Rate:</span>
          <span className="font-mono tabular-nums text-amber-400">{avgMissRate.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  );
}
