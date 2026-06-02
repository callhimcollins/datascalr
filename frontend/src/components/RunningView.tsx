"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LatencyChart } from "@/components/LatencyChart";
import { ErrorChart } from "@/components/ErrorChart";
import { RpsChart } from "@/components/RpsChart";
import type { LatencyPoint, CacheComparison, RateLimitComparison } from "@/lib/types";

export function RunningView({
  mode = "cache_comparison",
  latencyHistory,
  concurrency,
  rampUp,
  duration,
  elapsed,
  progress,
  isComplete,
  isStopped,
  comparison,
  aiAnalysis,
  aiLoading,
  onRunAgain,
  onConfigure,
  onStop,
  runKey,
}: {
  mode?: "cache_comparison" | "rate_limiting";
  latencyHistory: LatencyPoint[];
  concurrency: string;
  rampUp: string;
  duration: string;
  elapsed: number;
  progress: number;
  isComplete: boolean;
  isStopped: boolean;
  comparison: CacheComparison | RateLimitComparison | null;
  aiAnalysis: { why: string; recommendation: string } | null;
  aiLoading: boolean;
  onRunAgain: () => void;
  onConfigure: () => void;
  onStop: () => void;
  runKey?: number;
}) {
  const totalDuration = Number(duration);
  const logRef = useRef<HTMLDivElement>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ t: number; chart: string } | null>(null);
  const [percentile, setPercentile] = useState<"p50" | "p95" | "p99">("p50");
  const hoveredPoint = hoveredEvent != null ? latencyHistory.find((d) => d.t === hoveredEvent.t) ?? null : null;

  const isRateLimit = mode === "rate_limiting";
  const rlComparison = isRateLimit && comparison && "mode" in comparison && comparison.mode === "rate_limiting"
    ? comparison as RateLimitComparison
    : null;

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
    <div className="mt-2 space-y-4 pb-8 md:pb-12">
      {/* Mode label */}
      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide text-center">
        {isRateLimit ? "Rate Limiting Test" : "Cache Comparison Test"}
      </div>

      {/* Progress bar — shows stop btn during run, retry btn when stopped/complete */}
      <div className="glass-card rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isStopped ? "bg-amber-400" : isComplete ? "bg-zinc-400" : "bg-green-500 animate-pulse"}`} />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {isStopped ? "Stopped" : isComplete ? "Complete" : "Running"}
            </span>
          </div>
          <span className="text-sm tabular-nums text-zinc-500">
            {elapsed}s / {totalDuration}s
          </span>
        </div>

        {/* Bar + stop/retry row */}
        <div className="flex items-center gap-2">
          <div
            className="rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden transition-[width] duration-200 ease-in-out"
            style={{ width: isComplete ? "calc(100% - 3rem)" : "calc(100% - 3rem)" }}
          >
            <div
              key={runKey}
              className={`h-2 rounded-full transition-[width] duration-200 ease-in-out ${isStopped ? "bg-amber-400" : "bg-amber-500"}`}
              style={{ width: isComplete ? "100%" : `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-center shrink-0 w-10">
            {isComplete ? (
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
            ) : (
              <button
                onClick={onStop}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-red-400/60 text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                title="Stop run"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className={`grid gap-3 ${isRateLimit ? "grid-cols-4" : "grid-cols-3"}`}>
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
        {isRateLimit && rlComparison && (
          <div className="glass-card rounded-lg px-3 py-2.5 text-center">
            <div className="text-lg font-bold text-amber-600">{rlComparison.rate_limit_ceiling} rps</div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Ceiling
            </div>
          </div>
        )}
      </div>

      {/* Chart legend + chart + Events log */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 glass-card rounded-lg border border-zinc-200 dark:border-0 px-6 pt-4 pb-3 h-[300px] lg:h-[420px] flex flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-0.5 shrink-0">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              {isRateLimit ? "Throughput" : "Latency"}
            </span>
            {!isRateLimit && (
              <>
                <div className="ml-auto relative flex rounded-md border border-zinc-700/30 overflow-hidden">
                  <div
                    className="absolute inset-y-0 bg-amber-600/80 transition-all duration-200 ease-out"
                    style={{
                      width: "33.333%",
                      left: `${percentile === "p50" ? 0 : percentile === "p95" ? 33.333 : 66.666}%`,
                    }}
                  />
                  {(["p50", "p95", "p99"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercentile(p)}
                      className={`relative z-10 flex-1 px-3 py-0.5 text-[11px] font-medium transition-colors ${
                        percentile === p
                          ? "text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm bg-green-500/60" />
                  <span className="text-zinc-400">Cache Hit</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500/60" />
                  <span className="text-zinc-400">No Cache</span>
                </span>
              </>
            )}
            {isRateLimit && (
              <>
                <span className="flex items-center gap-1.5 text-[11px] ml-auto">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-500/60" />
                  <span className="text-zinc-400">Actual RPS</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/60" />
                  <span className="text-zinc-400">Throttled %</span>
                </span>
              </>
            )}
          </div>
          <div className={isRateLimit ? "h-[calc(100%-40px)]" : "h-[280px]"}>
            {isRateLimit ? (
              <RpsChart data={latencyHistory} />
            ) : (
              <LatencyChart data={latencyHistory} percentile={percentile} activeLine={hoveredEvent?.t ?? null} hoveredPoint={hoveredEvent?.chart === "latency" ? hoveredPoint : null} />
            )}
          </div>
          {!isRateLimit && (
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
        <div className="w-full lg:w-80 glass-card rounded-lg border border-zinc-200 dark:border-0 px-5 py-4 lg:h-[420px] h-[200px] flex flex-col">
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
                <span className="shrink-0 mt-0.5 tabular-nums text-zinc-600">@{String(e.t).padStart(2, " ")}</span>
                <span className="shrink-0">
                  {e.level === "error" ? (
                    <span className="text-red-400">&#10005;</span>
                  ) : e.level === "warn" ? (
                    <span className="text-amber-400">&#9651;</span>
                  ) : (
                    <span className="text-zinc-500">&#9675;</span>
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
          {rlComparison ? (
            <>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                Rate Limit Results (Steady-state)
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {rlComparison.avg_rps} rps
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Avg Throughput</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {rlComparison.avg_rl_pct}%
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Avg Rate-Limited</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-2 text-center">
                  <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{rlComparison.peak_rps} rps</div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Peak</div>
                </div>
                <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-2 text-center">
                  <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{rlComparison.rate_limit_ceiling} rps</div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Ceiling</div>
                </div>
                </div>
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-3">
                <div className="text-center">
                  <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {rlComparison.avg_rl_pct > 50
                      ? "Ceiling was heavily hit — consider increasing the limit or optimizing endpoints"
                      : rlComparison.avg_rl_pct > 10
                      ? "Ceiling was occasionally hit — traffic near the boundary"
                      : "Traffic stayed well within the rate limit ceiling"}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {rlComparison.total_rate_limited} of {rlComparison.total_passed + rlComparison.total_rate_limited} requests rate-limited
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
                Cache Comparison (Steady-state)
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {(comparison as CacheComparison).cache_ms}ms
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Cache</div>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {(comparison as CacheComparison).no_cache_ms}ms
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">No Cache</div>
                </div>
              </div>
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-3">
                <div className="text-center">
                  {(comparison as CacheComparison).winner === "tie" ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Performance is tied
                      </div>
                    </div>
                  ) : (comparison as CacheComparison).winner === "cache" ? (
                    <div>
                      <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                        Cache is {(comparison as CacheComparison).percentage_faster}% faster
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {(comparison as CacheComparison).difference_ms}ms advantage
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        No-cache is {Math.abs((comparison as CacheComparison).percentage_faster)}% faster
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {Math.abs((comparison as CacheComparison).difference_ms)}ms advantage
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {aiLoading && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="h-3 w-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
                  Analyzing results...
                </div>
              )}
              {aiAnalysis && (
                <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-1">
                  <p>{aiAnalysis.why}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">{aiAnalysis.recommendation}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Configure — full width at bottom, shown when stopped or completed */}
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
