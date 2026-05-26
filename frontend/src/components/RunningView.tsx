"use client";

import { useEffect, useMemo, useRef } from "react";
import { LatencyChart, type LatencyPoint } from "@/components/LatencyChart";
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
  onRunAgain: () => void;
  onConfigure: () => void;
}) {
  const totalDuration = Number(duration);
  const logRef = useRef<HTMLDivElement>(null);

  const logEntries = useMemo(() => {
    const entries: { t: number; level: string; msg: string }[] = [];
    for (const pt of latencyHistory) {
      if (pt.events && pt.events.length > 0) {
        for (const ev of pt.events) {
          entries.push({ t: pt.t, level: ev.level, msg: ev.msg });
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
        <div className="flex-1 glass-card rounded-lg px-4 pt-4 pb-2 min-h-[300px] md:min-h-[480px] flex flex-col">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 shrink-0">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Latency
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500/60" />
              <span className="text-zinc-400">Cache Hit</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-px w-3 border-b border-dashed border-amber-500" />
              <span className="text-zinc-400">Miss Rate</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500/60" />
              <span className="text-zinc-400">No Cache</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-px w-3 border-b border-dashed border-red-400" />
              <span className="text-zinc-400">No Cache Errors</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-px w-3 border-b border-dashed border-green-400" />
              <span className="text-zinc-400">Cache Errors</span>
            </span>
          </div>
          <div className="h-[250px] md:h-[430px]">
            <LatencyChart data={latencyHistory} />
          </div>
        </div>
        <div className="w-full lg:w-80 glass-card rounded-lg px-3 py-3 h-[200px] lg:h-[480px] flex flex-col">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 shrink-0">
            Events
          </span>
          <div className="flex-1 overflow-y-auto space-y-1 text-[11px] font-mono scroll-log" ref={logRef}>
            {logEntries.length === 0 && (
              <p className="text-zinc-500 italic pt-8 text-center">Waiting for data...</p>
            )}
            {logEntries.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 leading-tight">
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
