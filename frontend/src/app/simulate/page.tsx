"use client";

import { API_BASE } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunningView } from "@/components/RunningView";
import { useSim } from "@/lib/simulation-context";
import { useSSE } from "@/lib/use-sse";

function SimulateInner() {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "";
  const concurrency = searchParams.get("concurrency") ?? "10";
  const rampUp = searchParams.get("rampUp") ?? "5";
  const duration = searchParams.get("duration") ?? "30";

  const { sim } = useSim();
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [autoComplete, setAutoComplete] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const sseUrl = runId ? `${API_BASE}/api/runs/${runId}/stream` : null;
  const { data: latencyHistory, isComplete: sseComplete, comparison: sseComparison } = useSSE(sseUrl);
  const isComplete = sseComplete || autoComplete;

  // Fallback comparison from local data when SSE dropped before done message
  const comparison = useMemo(() => {
    if (sseComparison) return sseComparison;
    if (!autoComplete || latencyHistory.length < 3) return null;
    const n = Number(rampUp);
    const steadyStart = Math.max(n + 1, 1);
    const steady = latencyHistory.filter((d) => d.t >= steadyStart);
    const cacheVals = steady.map((d) => d.cacheHit).filter((v): v is number => v != null);
    const noCacheVals = steady.map((d) => d.noCache).filter((v): v is number => v != null);
    if (cacheVals.length === 0 || noCacheVals.length === 0) return null;
    const avgC = cacheVals.reduce((a, b) => a + b, 0) / cacheVals.length;
    const avgN = noCacheVals.reduce((a, b) => a + b, 0) / noCacheVals.length;
    const diff = avgN - avgC;
    return {
      cache_ms: Math.round(avgC * 10) / 10,
      no_cache_ms: Math.round(avgN * 10) / 10,
      difference_ms: Math.round(Math.abs(diff) * 10) / 10,
      percentage_faster: Math.round((Math.abs(diff) / Math.max(avgN, 1)) * 100 * 10) / 10,
      winner: (diff > 1 ? "cache" : diff < -1 ? "no_cache" : "tie") as "cache" | "no_cache" | "tie",
    };
  }, [sseComparison, autoComplete, latencyHistory, rampUp]);

  // Start a simulation run
  const startRun = useCallback(async () => {
    if (!sim) return;

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: sim.baseUrl,
          endpoints: sim.endpoints,
          concurrency: Number(concurrency),
          ramp_up: Number(rampUp),
          duration: Number(duration),
          platform,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail ?? "Failed to start run");
      }

      const data = await res.json();
      setRunId(data.run_id);
      setAutoComplete(false);
      setElapsed(0);
      setProgress(0);
      startedAtRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sim, concurrency, rampUp, duration, platform]);

  // Start on mount and on retry
  useEffect(() => {
    if (sim) {
      startRun();
    }
  }, [sim, startRun, runKey]);

  const handleRunAgain = useCallback(() => {
    setRunId(null);
    setRunKey((k) => k + 1);
    setElapsed(0);
    setProgress(0);
    setError(null);
    setAutoComplete(false);
  }, []);

  const router = useRouter();
  const handleConfigure = useCallback(() => {
    const qs = new URLSearchParams({ platform, concurrency, rampUp, duration });
    router.push(`/configure?${qs.toString()}`);
  }, [router, platform, concurrency, rampUp, duration]);

  // Timer management
  useEffect(() => {
    if (!runId) return;

    startedAtRef.current = Date.now();

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    const smoothProgress = setInterval(() => {
      if (!startedAtRef.current) return;
      const pct = Math.min(
        100,
        ((Date.now() - startedAtRef.current) / (Number(duration) * 1000)) * 100,
      );
      setProgress(pct);
    }, 16);

    const endTimeout = setTimeout(() => {
      clearInterval(timer);
      clearInterval(smoothProgress);
      setProgress(100);
    }, Number(duration) * 1000);

    // Fallback: if SSE hasn't sent done by duration + 10s, auto-complete
    const fallbackTimeout = setTimeout(() => {
      setAutoComplete(true);
    }, (Number(duration) + 10) * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(smoothProgress);
      clearTimeout(endTimeout);
      clearTimeout(fallbackTimeout);
    };
  }, [runId, duration]);

  return (
    <main className="flex flex-1 flex-col items-center px-4 md:px-12 pt-0">
      <div className="w-full max-w-full">
        {!sim && (
          <p className="mt-16 text-center text-zinc-500 dark:text-zinc-500">
            No configuration provided.
            <br />
            <a href="/configure" className="text-amber-600 underline">
              Configure a run
            </a>{" "}
            first.
          </p>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {sim && runId && (
          <RunningView
            latencyHistory={latencyHistory}
            concurrency={concurrency}
            rampUp={rampUp}
            duration={duration}
            elapsed={elapsed}
            progress={progress}
            isComplete={isComplete}
            comparison={comparison}
            onRunAgain={handleRunAgain}
            onConfigure={handleConfigure}
          />
        )}
      </div>
    </main>
  );
}

export default function SimulatePage() {
  return (
    <Suspense>
      <SimulateInner />
    </Suspense>
  );
}
