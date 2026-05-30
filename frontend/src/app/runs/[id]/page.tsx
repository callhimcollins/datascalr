"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { LatencyChart, type LatencyPoint } from "@/components/LatencyChart";
import { ErrorChart } from "@/components/ErrorChart";

type RunDetail = {
  run_id: string;
  status: string;
  config: {
    id: string;
    profile_label: string;
    concurrency: number;
    ramp_up: number;
    duration: number;
    avg_cache_ms: number | null;
    avg_no_cache_ms: number | null;
    avg_cache_steady_ms: number | null;
    avg_no_cache_steady_ms: number | null;
    comparison: { cache_ms: number; no_cache_ms: number; difference_ms: number; percentage_faster: number; winner: "cache" | "no_cache" | "tie" } | null;
    analysis: { why: string; recommendation: string } | null;
    started_at: string | null;
    completed_at: string | null;
    error_count: number | null;
  };
  metrics: LatencyPoint[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const parts = d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).split(", ");
  return `${parts[0]} ${parts[1]}, ${parts[2].toLowerCase()}`;
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [percentile, setPercentile] = useState<"p50" | "p95" | "p99">("p50");
  const [hoveredEvent, setHoveredEvent] = useState<{ t: number; chart: string } | null>(null);
  const hoveredPoint = hoveredEvent != null ? (run?.metrics ?? []).find((d) => d.t === hoveredEvent.t) ?? null : null;

  useEffect(() => {
    if (!runId) return;
    fetch(`${API_BASE}/api/runs/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [runId]);

  const metrics = run?.metrics ?? [];
  const config = run?.config;
  const rampUp = config?.ramp_up ?? 0;

  const logEntries = useMemo(() => {
    const entries: { t: number; level: string; chart: string; msg: string }[] = [];
    for (const pt of metrics) {
      if (pt.events && pt.events.length > 0) {
        for (const ev of pt.events) {
          entries.push({ t: pt.t, level: ev.level, chart: ev.chart ?? "latency", msg: ev.msg });
        }
      }
    }
    return entries;
  }, [metrics]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  if (!run) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-500 dark:text-zinc-400">Run not found.</p>
        <Link href="/history" className="text-sm font-medium text-amber-600 hover:underline">Back to history</Link>
      </main>
    );
  }

  const comparison = config?.comparison;
  const analysis = config?.analysis;

  return (
    <main className="flex flex-1 flex-col items-center px-4 md:px-12 pt-4 pb-12">
      <div className="w-full max-w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Link href="/history" className="text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              &larr; History
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-0.5">
              {config?.profile_label || "Run"} <span className="text-sm font-mono font-normal text-zinc-400">#{runId}</span>
            </h1>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
            run.status === "completed"
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
              : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          }`}>
            {run.status === "completed" && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
            {run.status}
          </span>
        </div>

        {/* Config info */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "Users", value: config?.concurrency },
            { label: "Ramp-up", value: config?.ramp_up ? `${config.ramp_up}s` : null },
            { label: "Duration", value: config?.duration ? `${config.duration}s` : null },
            { label: "Started", value: config?.started_at ? fmtDate(config.started_at) : null, small: true },
          ].filter((c) => c.value != null).map((c) => (
            <div key={c.label} className="glass-card rounded-lg px-3 py-2 text-center">
              <div className={`${c.small ? "text-xs" : "text-lg"} font-bold text-zinc-900 dark:text-zinc-50`}>{c.value}</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          <div className="flex-1 glass-card rounded-lg border border-zinc-200 dark:border-0 px-6 pt-4 pb-0 h-[240px] lg:h-[340px] flex flex-col">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-0.5 shrink-0">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Latency</span>
              <div className="ml-auto relative flex rounded-md border border-zinc-700/30 overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-amber-600/80 transition-all duration-200 ease-out"
                  style={{ width: "33.333%", left: `${percentile === "p50" ? 0 : percentile === "p95" ? 33.333 : 66.666}%` }}
                />
                {(["p50", "p95", "p99"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercentile(p)}
                    className={`relative z-10 flex-1 px-3 py-0.5 text-[11px] font-medium transition-colors ${
                      percentile === p ? "text-white" : "text-zinc-500 hover:text-zinc-300"
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
            </div>
            <div className="flex-1 min-h-0">
              <LatencyChart data={metrics} rampUp={rampUp} percentile={percentile} activeLine={hoveredEvent?.t ?? null} hoveredPoint={hoveredEvent?.chart === "latency" ? hoveredPoint : null} />
            </div>
          </div>

          <div className="w-full lg:w-80 glass-card rounded-lg border border-zinc-200 dark:border-0 px-5 py-4 h-[240px] lg:h-[340px] flex flex-col">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 shrink-0">Events</span>
            <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1.5 text-[11px] font-mono break-words">
              {logEntries.length === 0 && (
                <p className="text-zinc-500 italic pt-8 text-center">No events recorded.</p>
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
                      <span className="text-red-400">✕</span>
                    ) : e.level === "warn" ? (
                      <span className="text-amber-400">△</span>
                    ) : (
                      <span className="text-zinc-500">○</span>
                    )}
                  </span>
                  <span className={e.level === "error" ? "text-red-300" : e.level === "warn" ? "text-amber-300" : "text-zinc-400"}>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison */}
        {comparison && (
          <div className="glass-card rounded-lg px-4 py-4 mb-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
              Cache Comparison (Steady-state)
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{comparison.cache_ms}ms</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Cache</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{comparison.no_cache_ms}ms</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">No Cache</div>
              </div>
            </div>
            <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-3">
              <div className="text-center">
                {comparison.winner === "tie" ? (
                  <div>
                    <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Performance is tied</div>
                  </div>
                ) : comparison.winner === "cache" ? (
                  <div>
                    <div className="text-sm font-semibold text-green-600 dark:text-green-400">Cache is {comparison.percentage_faster}% faster</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{comparison.difference_ms}ms advantage</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">No-cache is {Math.abs(comparison.percentage_faster)}% faster</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{Math.abs(comparison.difference_ms)}ms advantage</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analysis */}
        {analysis && (
          <div className="glass-card rounded-lg px-4 py-4 mb-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">AI Analysis</div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-1">
              <p>{analysis.why}</p>
              <p className="text-zinc-500 dark:text-zinc-400">{analysis.recommendation}</p>
            </div>
          </div>
        )}

        {/* Error chart */}
        {metrics.some((d) => (d.noCachePct ?? 0) > 0 || (d.cachePct ?? 0) > 0 || (d.cacheMissRate ?? 0) > 0) && (
          <div className="glass-card rounded-lg border border-zinc-200 dark:border-0 px-6 pt-4 pb-3 mb-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 shrink-0">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Errors</span>
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
            <div className="h-[150px]">
              <ErrorChart data={metrics} activeLine={hoveredEvent?.t ?? null} hoveredPoint={hoveredEvent?.chart === "errors" ? hoveredPoint : null} />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/history"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-center"
          >
            Back to History
          </Link>
          <Link
            href="/configure"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-center"
          >
            Configure New Run
          </Link>
        </div>
      </div>
    </main>
  );
}
