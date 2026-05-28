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

export type LogEvent = {
  level: "info" | "warn" | "error";
  chart?: string;
  msg: string;
};

export type LatencyPoint = {
  t: number;
  cacheHit: number | null;
  cacheHit_p95: number | null;
  cacheHit_p99: number | null;
  cacheMissRate: number | null;
  noCache: number | null;
  noCache_p95: number | null;
  noCache_p99: number | null;
  cachePct: number | null;
  noCachePct: number | null;
  cacheCount?: number;
  noCacheCount?: number;
  cacheRps?: number;
  noCacheRps?: number;
  events?: LogEvent[];
};

function fmt_ms(v: number): string {
  return v < 1 ? `${v.toFixed(2)} ms` : `${v.toFixed(1)} ms`;
}

function getCacheKey(percentile: string): string {
  return percentile === "p50" ? "cacheHit" : `cacheHit_${percentile}`;
}

function getNoCacheKey(percentile: string): string {
  return percentile === "p50" ? "noCache" : `noCache_${percentile}`;
}

function getVal(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  return v !== null && v !== undefined ? Number(v) : null;
}

function CustomTooltip({ active, payload, label, percentile }: Record<string, unknown>) {
  if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload ?? {};
  const p = (percentile ?? "p50") as string;
  const cacheKey = getCacheKey(p);
  const noCacheKey = getNoCacheKey(p);
  const cacheVal = getVal(row, cacheKey);
  const noCacheVal = getVal(row, noCacheKey);

  return (
    <div className="rounded-lg border border-zinc-600/30 bg-[rgba(24,24,27,0.6)] backdrop-blur-xl px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1.5 font-medium text-zinc-400">@ {String(label)}s</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-green-500/70" />
          <span className="text-zinc-300">Cache Hit</span>
          <span className="ml-auto tabular-nums">
            {cacheVal !== null ? fmt_ms(cacheVal) : "—"}
          </span>
          <span className="text-zinc-500">
            {row.cacheRps !== undefined ? `${row.cacheRps}/s` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-red-500/70" />
          <span className="text-zinc-300">No Cache</span>
          <span className="ml-auto tabular-nums">
            {noCacheVal !== null ? fmt_ms(noCacheVal) : "—"}
          </span>
          <span className="text-zinc-500">
            {row.noCacheRps !== undefined ? `${row.noCacheRps}/s` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LatencyChart({ data, activeLine, hoveredPoint, rampUp, percentile = "p50" }: { data: LatencyPoint[]; activeLine?: number | null; hoveredPoint?: LatencyPoint | null; rampUp?: number; percentile?: "p50" | "p95" | "p99" }) {
  const cacheKey = percentile === "p50" ? "cacheHit" : `cacheHit_${percentile}`;
  const noCacheKey = percentile === "p50" ? "noCache" : `noCache_${percentile}`;

  const steadyData = useMemo(() => {
    if (rampUp == null || rampUp < 1) return data;
    return data.filter((d) => d.t >= rampUp + 1);
  }, [data, rampUp]);

  const avgCacheHit = useMemo(() => {
    const vals = steadyData.map((d) => getVal(d as unknown as Record<string, unknown>, cacheKey)).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [steadyData, cacheKey]);

  const avgNoCache = useMemo(() => {
    const vals = steadyData.map((d) => getVal(d as unknown as Record<string, unknown>, noCacheKey)).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [steadyData, noCacheKey]);

  const avgCacheRps = useMemo(() => {
    const vals = steadyData.map((d) => d.cacheRps).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [steadyData]);

  const avgNoCacheRps = useMemo(() => {
    const vals = steadyData.map((d) => d.noCacheRps).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [steadyData]);

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
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
              width={60}
              label={{ value: "ms", angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 10, fill: "#a1a1aa", fontWeight: 600 } }}
            />
            <Tooltip content={<CustomTooltip percentile={percentile} />} />
            <ReferenceLine
              x={activeLine ?? -999}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={activeLine != null ? 1.5 : 0}
            />
            <Area
              type="monotone"
              dataKey={noCacheKey}
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
              dataKey={cacheKey}
              name="Cache Hit"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.25}
              strokeWidth={1.5}
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
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-green-500/70" />
              <span className="text-zinc-300">Cache Hit</span>
              <span className="ml-auto tabular-nums">
                {getVal(hoveredPoint as unknown as Record<string, unknown>, cacheKey) != null ? fmt_ms(getVal(hoveredPoint as unknown as Record<string, unknown>, cacheKey)!) : "—"}
              </span>
            </div>
            {hoveredPoint.cacheRps != null && (
              <div className="text-[10px] text-zinc-500 pl-4 tabular-nums">
                {hoveredPoint.cacheRps} req/s
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-red-500/70" />
              <span className="text-zinc-300">No Cache</span>
              <span className="ml-auto tabular-nums">
                {getVal(hoveredPoint as unknown as Record<string, unknown>, noCacheKey) != null ? fmt_ms(getVal(hoveredPoint as unknown as Record<string, unknown>, noCacheKey)!) : "—"}
              </span>
            </div>
            {hoveredPoint.noCacheRps != null && (
              <div className="text-[10px] text-zinc-500 pl-4 tabular-nums">
                {hoveredPoint.noCacheRps} req/s
              </div>
            )}
          </div>
        </div>
      )}
      <div className="shrink-0 flex items-center justify-center gap-6 pt-2 pb-1 text-xs border-t border-zinc-700/30 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-green-500/60" />
          <span className="text-zinc-400">Hit:</span>
          <span className="font-mono tabular-nums text-green-400">{fmt_ms(avgCacheHit)}</span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono tabular-nums text-zinc-400">{avgCacheRps > 0 ? `${avgCacheRps} rps` : "— rps"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500/60" />
          <span className="text-zinc-400">No Cache:</span>
          <span className="font-mono tabular-nums text-red-400">{fmt_ms(avgNoCache)}</span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono tabular-nums text-zinc-400">{avgNoCacheRps > 0 ? `${avgNoCacheRps} rps` : "— rps"}</span>
        </span>
      </div>
    </div>
  );
}
