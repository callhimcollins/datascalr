"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LatencyChart, type LatencyPoint } from "@/components/LatencyChart";
import { ErrorChart } from "@/components/ErrorChart";
import type { Comparison } from "@/lib/use-sse";

export function RunningView({
  latencyHistory,
  concurrency,
  rampUp,
  duration,
  elapsed,
  progress,
  isComplete,
  comparison,
  aiAnalysis,
  onRunAgain,
  onConfigure,
}: {
  latencyHistory: LatencyPoint[];
  concurrency: string;
  rampUp: string;
  duration: string;
  elapsed: number;
  progress: number;
  isComplete: boolean;
  comparison: Comparison | null;
  aiAnalysis: { why: string; recommendation: string } | null;
  onRunAgain: () => void;
  onConfigure: () => void;
}) {
  const totalDuration = Number(duration);
  const logRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ t: number; chart: string } | null>(null);
  const hoveredPoint = hoveredEvent != null ? latencyHistory.find((d) => d.t === hoveredEvent.t) ?? null : null;

  const runAnalysis = useMemo(() => {
    const n = Number(rampUp) || 0;
    const steady = latencyHistory.filter((d) => d.t >= Math.max(n + 1, 1));
    if (steady.length < 2) return null;

    const cacheVals = steady.map((d) => d.cacheHit).filter((v): v is number => v != null);
    const noCacheVals = steady.map((d) => d.noCache).filter((v): v is number => v != null);
    const missRates = steady.map((d) => d.cacheMissRate).filter((v): v is number => v != null);
    const cacheErrs = steady.filter((d) => (d.cachePct ?? 0) > 0);
    const noCacheErrs = steady.filter((d) => (d.noCachePct ?? 0) > 0);
    const maxMiss = missRates.length ? Math.max(...missRates) : 0;
    const avgMiss = missRates.length ? missRates.reduce((a, b) => a + b, 0) / missRates.length : 0;
    const avgRps = steady.length
      ? steady.reduce((s, d) => s + (d.cacheRps ?? 0) + (d.noCacheRps ?? 0), 0) / steady.length
      : 0;

    const cacheHigh = cacheVals.length ? Math.max(...cacheVals) : 0;
    const noCacheHigh = noCacheVals.length ? Math.max(...noCacheVals) : 0;
    const avgCache = cacheVals.length ? cacheVals.reduce((a, b) => a + b, 0) / cacheVals.length : 0;
    const avgNoCache = noCacheVals.length ? noCacheVals.reduce((a, b) => a + b, 0) / noCacheVals.length : 0;

    const totalExpected = Number(concurrency) || 0;
    const througputLow = totalExpected > 0 && avgRps < totalExpected * 0.3;

    const bothHighError = cacheErrs.length > steady.length * 0.3 && noCacheErrs.length > steady.length * 0.3;
    const cacheOnlyError = cacheErrs.length > steady.length * 0.3 && noCacheErrs.length <= steady.length * 0.15;
    const noCacheOnlyError = noCacheErrs.length > steady.length * 0.3 && cacheErrs.length <= steady.length * 0.15;

    const diff = avgNoCache - avgCache;
    const pctDiff = avgNoCache > 0 ? (diff / avgNoCache) * 100 : 0;

    if (througputLow && bothHighError) {
      return `At ${totalExpected} virtual users, throughput was only ${Math.round(avgRps)} req/s — well below the expected ${totalExpected}. Both cache and no-cache errored throughout the run. The bottleneck is the httpx connection pool (max 1000): VUs spent more time waiting for HTTP connections than making requests. The error chart shows cache and no-cache errors rising together, confirming a system-wide saturation rather than a specific backend issue.`;
    }

    if (througputLow && cacheHigh < 200) {
      return `Despite ${totalExpected} virtual users, throughput was only ${Math.round(avgRps)} req/s. Cache latency stayed low (${Math.round(avgCache)}ms avg) but VUs weren't producing requests at the expected rate. This suggests the think time between requests or asyncio scheduling overhead is limiting throughput more than backend performance.`;
    }

    if (pctDiff > 20 && comparison?.winner === "cache") {
      const msgs: string[] = [`Cache was ${Math.round(pctDiff)}% faster than querying PostgreSQL directly (${Math.round(avgCache)}ms vs ${Math.round(avgNoCache)}ms).`];
      const hasErrors = noCacheErrs.length > 0 || cacheErrs.length > 0;
      if (hasErrors && noCacheErrs.length > cacheErrs.length) {
        msgs.push(` The uncached path also saw more timeout errors (${noCacheErrs.length} of ${steady.length} ticks) than cache (${cacheErrs.length} ticks), suggesting PostgreSQL's connection pool (max_size=4) was the limiting factor.`);
      } else if (hasErrors) {
        msgs.push(` Both paths errored under the load, but cache maintained lower latency on successful requests.`);
      } else {
        msgs.push(` Low error rates confirm both Redis and PostgreSQL kept up — Redis was simply faster for the request pattern.`);
      }
      if (avgMiss > 20) msgs.push(` Cache miss rate averaged ${Math.round(avgMiss)}% with a peak of ${Math.round(maxMiss)}% — Redis TTL expiry caused periodic cache repopulation spikes.`);
      return msgs.join("");
    }

    if (pctDiff < -20 && comparison?.winner === "no_cache") {
      const msgs: string[] = [`No-cache was ${Math.round(Math.abs(pctDiff))}% faster than cache (${Math.round(avgNoCache)}ms vs ${Math.round(avgCache)}ms).`];
      if (avgCache > 1000 && avgMiss < 15) {
        msgs.push(` Redis latency averaged ${Math.round(avgCache)}ms under load — the single-threaded event loop became the bottleneck. With an uneven weight split, the cached endpoint received more traffic, amplifying Redis contention.`);
      } else if (avgMiss > 40) {
        msgs.push(` Cache miss rate averaged ${Math.round(avgMiss)}% — most "cached" requests hit PostgreSQL anyway due to expired keys, negating the cache advantage. This is typical of TTL expiry storms under sustained load.`);
      } else if (bothHighError) {
        msgs.push(` However, both paths saw errors (${Math.round(noCacheErrs.length / steady.length * 100)}% of ticks for no-cache, ${Math.round(cacheErrs.length / steady.length * 100)}% for cache) — system-wide httpx connection pool saturation.`);
      }
      return msgs.join("");
    }

    if (comparison?.winner === "cache" && pctDiff <= 20) {
      const msgs: string[] = [`Cache was ${Math.round(pctDiff)}% faster (${Math.round(avgCache)}ms vs ${Math.round(avgNoCache)}ms), but the margin is narrow.`];
      if (avgMiss > 30) msgs.push(` Cache miss rate averaged ${Math.round(avgMiss)}% (peak ${Math.round(maxMiss)}%), meaning Redis TTL cycles kept forcing cache requests through to PostgreSQL.`);
      if (avgCache > 100) msgs.push(` Redis itself was under strain at ${Math.round(avgCache)}ms average — not far from PostgreSQL's ${Math.round(avgNoCache)}ms.`);
      return msgs.join("");
    }

    if (comparison?.winner === "no_cache" && Math.abs(pctDiff) <= 20) {
      const msgs: string[] = [`No-cache was ${Math.round(Math.abs(pctDiff))}% faster, but within the margin of noise.`];
      if (avgMiss > 30) msgs.push(` Cache miss rate averaged ${Math.round(avgMiss)}% — a better TTL strategy or cache warming would likely flip the result.`);
      return msgs.join("");
    }

    return null;
  }, [latencyHistory, rampUp, concurrency, comparison]);

  const logEntries = useMemo(() => {
    const entries: { t: number; level: string; chart: string; msg: string }[] = [];
    for (const pt of latencyHistory) {
      if (pt.events && pt.events.length > 0) {
        for (const ev of pt.events) {
          entries.push({ t: pt.t, level: ev.level, chart: ev.chart ?? (ev.level === "error" ? "errors" : "latency"), msg: ev.msg });
        }
      }
    }
    return entries;
  }, [latencyHistory]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logEntries.length]);

  return (
    <div className="mt-2 space-y-4">
      {/* Progress bar — smoothly shrinks when complete */}
      <div className="glass-card rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isComplete ? "bg-zinc-400" : "bg-green-500 animate-pulse"}`} />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {isComplete ? "Complete" : "Running"}
            </span>
          </div>
          <span className="text-sm tabular-nums text-zinc-500">
            {elapsed}s / {totalDuration}s
          </span>
        </div>

        {/* Bar + retry row — bar smoothly makes room for retry icon when complete */}
        <div className="flex items-center gap-2">
          <div
            className="rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden transition-[width] duration-700 ease-in-out"
            style={{ width: isComplete ? "calc(100% - 3rem)" : "100%" }}
          >
            <div
              className="h-2 rounded-full bg-amber-500 transition-[width] duration-700 ease-in-out"
              style={{ width: isComplete ? "100%" : `${progress}%` }}
            />
          </div>
          <div
            className="transition-all duration-500 ease-in-out overflow-hidden flex items-center justify-center shrink-0"
            style={{ width: isComplete ? "2.5rem" : "0", opacity: isComplete ? 1 : 0 }}
          >
            <button
              onClick={onRunAgain}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="Run again"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-lg px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {concurrency}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Users
          </div>
        </div>
        <div className="glass-card rounded-lg px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {rampUp}s
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Ramp-up
          </div>
        </div>
        <div className="glass-card rounded-lg px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-amber-600">{elapsed}s</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            Elapsed
          </div>
        </div>
      </div>

      {/* Chart legend + Latency chart + Events log */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 glass-card rounded-lg px-6 pt-4 pb-3 h-[300px] lg:h-[420px] flex flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-0.5 shrink-0">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Latency
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500/60" />
              <span className="text-zinc-400">Cache Hit</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500/60" />
              <span className="text-zinc-400">No Cache</span>
            </span>
          </div>
          <div className="h-[280px]">
            <LatencyChart data={latencyHistory} activeLine={hoveredEvent?.t ?? null} hoveredPoint={hoveredEvent?.chart === "latency" ? hoveredPoint : null} />
          </div>
          {latencyHistory.some(
            (d) =>
              (d.noCachePct != null && d.noCachePct > 0) ||
              (d.cachePct != null && d.cachePct > 0) ||
              (d.cacheMissRate != null && d.cacheMissRate > 0),
          ) && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 mb-0.5 shrink-0 border-t border-zinc-700/30 pt-1.5">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Errors
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-px w-3 border-b border-dashed border-red-400" />
                  <span className="text-zinc-400">No Cache</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-px w-3 border-b border-dashed border-green-400" />
                  <span className="text-zinc-400">Cache</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-px w-3 border-b border-dashed border-amber-400" />
                  <span className="text-zinc-400">Miss Rate</span>
                </span>
              </div>
              <div className="shrink-0 h-[150px]">
                <ErrorChart data={latencyHistory} activeLine={hoveredEvent?.t ?? null} hoveredPoint={hoveredEvent?.chart === "errors" ? hoveredPoint : null} />
              </div>
            </>
          )}
        </div>
        <div className="w-full lg:w-80 glass-card rounded-lg px-5 py-4 lg:h-[420px] h-[200px] flex flex-col">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 shrink-0">
            Events
          </span>
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1.5 text-[11px] font-mono scroll-log break-words" ref={logRef}>
            {logEntries.length === 0 && (
              <p className="text-zinc-500 italic pt-8 text-center">Waiting for data...</p>
            )}
            {logEntries.map((e, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 leading-tight rounded px-1 -mx-1 cursor-pointer transition-colors hover:bg-zinc-700/40"
                onMouseEnter={() => setHoveredEvent({ t: e.t, chart: e.chart })}
                onMouseLeave={() => setHoveredEvent(null)}
              >
                <span className="shrink-0 mt-0.5 tabular-nums text-zinc-600">@{String(e.t).padStart(2, "\xa0")}</span>
                <span className="shrink-0">
                  {e.level === "error" ? (
                    <span className="text-red-400">✕</span>
                  ) : e.level === "warn" ? (
                    <span className="text-amber-400">△</span>
                  ) : (
                    <span className="text-zinc-500">○</span>
                  )}
                </span>
                <span className={
                  e.level === "error" ? "text-red-300" :
                  e.level === "warn" ? "text-amber-300" :
                  "text-zinc-400"
                }>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison card — appears when complete */}
      {isComplete && comparison && (
        <div className="glass-card rounded-lg px-4 py-4">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Cache Comparison (Steady-state)
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {comparison.cache_ms}ms
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Cache</div>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {comparison.no_cache_ms}ms
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">No Cache</div>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-3">
            <div className="text-center">
              {comparison.winner === "tie" ? (
                <div>
                  <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Performance is tied
                  </div>
                </div>
              ) : comparison.winner === "cache" ? (
                <div>
                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                    Cache is {comparison.percentage_faster}% faster
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {comparison.difference_ms}ms advantage
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    No-cache is {Math.abs(comparison.percentage_faster)}% faster
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {Math.abs(comparison.difference_ms)}ms advantage
                  </div>
                </div>
              )}
            </div>
          </div>
          {runAnalysis && (
            <div className="mt-3 rounded-lg bg-zinc-100/60 dark:bg-zinc-800/60 px-3 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {runAnalysis}
            </div>
          )}
          {aiAnalysis && (
            <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-1">
              <p>{aiAnalysis.why}</p>
              <p className="text-zinc-500 dark:text-zinc-400">{aiAnalysis.recommendation}</p>
            </div>
          )}
        </div>
      )}

      {/* Configure — full width at bottom */}
      {isComplete && (
        <button
          onClick={onConfigure}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
        >
          Configure
        </button>
      )}
    </div>
  );
}
