"use client";

import { LatencyChart, type LatencyPoint } from "@/components/LatencyChart";

export function RunningView({
  latencyHistory,
  concurrency,
  rampUp,
  duration,
  elapsed,
  progress,
}: {
  latencyHistory: LatencyPoint[];
  concurrency: string;
  rampUp: string;
  duration: string;
  elapsed: number;
  progress: number;
}) {
  const totalDuration = Number(duration);

  return (
    <div className="mt-2 space-y-4">
      {/* Progress bar */}
      <div className="glass-card rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Running
            </span>
          </div>
          <span className="text-sm tabular-nums text-zinc-500">
            {elapsed}s / {totalDuration}s
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${progress}%` }}
          />
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

      {/* Chart legend + Latency chart + Logs placeholder */}
      <div className="flex gap-4">
        <div className="flex-1 glass-card rounded-lg px-4 pt-4 pb-2 min-h-[480px]">
          <div className="flex items-center gap-4 mb-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Latency
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500/60" />
              <span className="text-zinc-400">Cache</span>
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
          <div className="h-[calc(100%-20px)]">
            <LatencyChart data={latencyHistory} />
          </div>
        </div>
        <div className="w-72 glass-card rounded-lg px-4 py-4 flex items-center justify-center min-h-[480px]">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Logs coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
