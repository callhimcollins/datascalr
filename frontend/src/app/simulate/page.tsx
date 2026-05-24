"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/BackButton";

type Endpoint = {
  method: string;
  path: string;
  description: string;
  weight: number;
  body_template: Record<string, unknown> | null;
};

type Config = {
  base_url: string;
  endpoints: Endpoint[];
};

type Phase = "config" | "running" | "done";

function SimulateInner() {
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "";
  const concurrency = searchParams.get("concurrency") ?? "10";
  const rampUp = searchParams.get("rampUp") ?? "5";
  const duration = searchParams.get("duration") ?? "30";

  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("config");
  const [runId, setRunId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!platform) return;

    setLoading(true);
    setError(null);

    fetch("http://localhost:8000/api/generate-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        concurrency: Number(concurrency),
        ramp_up: Number(rampUp),
        duration: Number(duration),
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(d.detail ?? res.statusText));
        return res.json();
      })
      .then((data: Config) => {
        setConfig(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [platform, concurrency, rampUp, duration]);

  const startRun = useCallback(async () => {
    if (!config) return;

    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: config.base_url,
          endpoints: config.endpoints,
          concurrency: Number(concurrency),
          ramp_up: Number(rampUp),
          duration: Number(duration),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail ?? "Failed to start run");
      }

      const data = await res.json();
      setRunId(data.run_id);
      setPhase("running");
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      setTimeout(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase("done");
      }, Number(duration) * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [config, concurrency, rampUp, duration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const methodColors: Record<string, string> = {
    GET: "text-green-500",
    POST: "text-blue-400",
    PUT: "text-orange-400",
    PATCH: "text-yellow-400",
    DELETE: "text-red-400",
  };

  const totalWeight = config?.endpoints.reduce((s, e) => s + e.weight, 0) ?? 1;
  const totalDuration = Number(duration);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        {phase === "config" && <BackButton href="/configure" />}

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {phase === "config" && "Simulate"}
          {phase === "running" && "Running"}
          {phase === "done" && "Complete"}
        </h1>
        <p className="mt-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          {concurrency} users · {rampUp}s ramp-up · {duration}s duration
          {runId && <span className="ml-2 font-mono text-zinc-400">· #{runId}</span>}
        </p>

        {!platform && (
          <p className="mt-16 text-center text-zinc-500 dark:text-zinc-500">
            No configuration provided.{<br />}
            <a href="/configure" className="text-amber-600 underline">Configure a run</a> first.
          </p>
        )}

        {loading && (
          <div className="mt-16 flex flex-col items-center gap-3 text-zinc-500 dark:text-zinc-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-amber-600" />
            <p className="text-sm">Generating traffic configuration from your description...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── Config view ── */}
        {config && phase === "config" && (
          <div className="mt-10 space-y-6">
            <div className="glass-card rounded-lg px-4 py-3">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                Base URL
              </span>
              <p className="mt-0.5 text-sm font-mono text-zinc-900 dark:text-zinc-200">
                {config.base_url}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                Endpoints
              </span>
              {config.endpoints.map((ep, i) => (
                <div
                  key={i}
                  className="glass-card rounded-lg px-4 py-3 flex items-center gap-3"
                >
                  <span
                    className={`text-xs font-bold font-mono w-14 shrink-0 ${methodColors[ep.method] ?? "text-zinc-400"}`}
                  >
                    {ep.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-zinc-900 dark:text-zinc-200 truncate">
                      {ep.path}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {ep.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-zinc-400">
                      {Math.round(ep.weight / totalWeight * 100)}%
                    </div>
                    <div className="mt-0.5 h-1 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${ep.weight / totalWeight * 100}%` }}
                      />
                    </div>
                  </div>
                  {ep.body_template && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0">
                      {"{…}"}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={startRun}
              className="glow-btn mt-8 w-full rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 transition-all"
            >
              Run Simulation
            </button>
          </div>
        )}

        {/* ── Running view ── */}
        {config && phase === "running" && (
          <div className="mt-10 space-y-6">
            {/* Progress bar */}
            <div className="glass-card rounded-lg px-4 py-4">
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
                  className="h-full rounded-full bg-amber-500 transition-all duration-1000"
                  style={{ width: `${(elapsed / totalDuration) * 100}%` }}
                />
              </div>
            </div>

            {/* Config summary */}
            <div className="glass-card rounded-lg px-4 py-3">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                Target
              </span>
              <p className="mt-0.5 text-sm font-mono text-zinc-900 dark:text-zinc-200">
                {config.base_url}
              </p>
            </div>

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
                <div className="text-lg font-bold text-amber-600">
                  {elapsed}s
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Elapsed
                </div>
              </div>
            </div>

            {/* Placeholder for live metrics */}
            <div className="glass-card rounded-lg px-4 py-8 flex items-center justify-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Live charts coming next
              </p>
            </div>
          </div>
        )}

        {/* ── Done view ── */}
        {config && phase === "done" && (
          <div className="mt-10 space-y-6">
            <div className="glass-card rounded-lg px-4 py-4 text-center">
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                Simulation Complete
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {concurrency} users over {duration}s — run #{runId}
              </p>
            </div>

            <div className="flex gap-3">
              <a
                href="/configure"
                className="glow-btn flex-1 rounded-lg bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-100 text-center dark:bg-zinc-700 dark:text-zinc-300"
              >
                ← New Run
              </a>
              <a
                href="/analyze"
                className="glow-btn flex-1 rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white text-center hover:bg-amber-500"
              >
                Analyze Results
              </a>
            </div>
          </div>
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
