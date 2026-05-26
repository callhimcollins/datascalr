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
} from "recharts";

export type LogEvent = {
  level: "info" | "warn" | "error";
  msg: string;
};

export type LatencyPoint = {
  t: number;
  cache: number | null;
  noCache: number | null;
  cachePct: number | null;
  noCachePct: number | null;
  cacheCount?: number;
  noCacheCount?: number;
  cacheRps?: number;
  noCacheRps?: number;
  events?: LogEvent[];
};

function CustomTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !payload || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="rounded-lg border border-zinc-600/35 bg-[rgba(24,24,27,0.9)] px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1.5 font-medium text-zinc-400">@ {String(label)}s</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-green-500/70" />
          <span className="text-zinc-300">Cache</span>
          <span className="ml-auto tabular-nums">
            {row.cache !== null && row.cache !== undefined
              ? `${Number(row.cache).toFixed(1)} ms`
              : "—"}
          </span>
          <span className="text-zinc-500">
            {row.cacheRps !== undefined ? `${row.cacheRps}/s` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-red-500/70" />
          <span className="text-zinc-300">No Cache</span>
          <span className="ml-auto tabular-nums">
            {row.noCache !== null && row.noCache !== undefined
              ? `${Number(row.noCache).toFixed(1)} ms`
              : "—"}
          </span>
          <span className="text-zinc-500">
            {row.noCacheRps !== undefined ? `${row.noCacheRps}/s` : ""}
          </span>
        </div>
        {(row.cachePct !== null && row.cachePct !== undefined) ||
        (row.noCachePct !== null && row.noCachePct !== undefined) ? (
          <div className="border-t border-zinc-700/50 pt-1 mt-1">
            {row.cachePct !== null && row.cachePct !== undefined ? (
              <p className="text-green-400/80">
                Cache errors: {Number(row.cachePct).toFixed(1)}%
              </p>
            ) : null}
            {row.noCachePct !== null && row.noCachePct !== undefined ? (
              <p className="text-red-400/80">
                No cache errors: {Number(row.noCachePct).toFixed(1)}%
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LatencyChart({ data }: { data: LatencyPoint[] }) {
  const avgCache = useMemo(() => {
    const vals = data.map((d) => d.cache).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [data]);

  const avgNoCache = useMemo(() => {
    const vals = data.map((d) => d.noCache).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [data]);

  const avgCacheRps = useMemo(() => {
    const vals = data.map((d) => d.cacheRps).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [data]);

  const avgNoCacheRps = useMemo(() => {
    const vals = data.map((d) => d.noCacheRps).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
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
            <Tooltip content={<CustomTooltip />} />
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
      </div>
      <div className="shrink-0 flex items-center justify-center gap-6 pt-2 pb-1 text-xs border-t border-zinc-700/30 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-green-500/60" />
          <span className="text-zinc-400">Cache:</span>
          <span className="font-mono tabular-nums text-green-400">{avgCache.toFixed(1)} ms</span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono tabular-nums text-zinc-400">{avgCacheRps} rps</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500/60" />
          <span className="text-zinc-400">No Cache:</span>
          <span className="font-mono tabular-nums text-red-400">{avgNoCache.toFixed(1)} ms</span>
          <span className="text-zinc-500">·</span>
          <span className="font-mono tabular-nums text-zinc-400">{avgNoCacheRps} rps</span>
        </span>
      </div>
    </div>
  );
}
