"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { ConfigPreview, type Config } from "@/components/ConfigPreview";
import { RunningView } from "@/components/RunningView";
import { useSim } from "@/lib/simulation-context";
import { useSSE } from "@/lib/use-sse";

type Phase = "config" | "running";

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
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const { setSim } = useSim();

  const sseUrl = runId ? `http://localhost:8000/api/runs/${runId}/stream` : null;
  const { data: latencyHistory } = useSSE(sseUrl);

  useEffect(() => {
    return () => setSim(null);
  }, [setSim]);

  // Fetch config on mount based on search params
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
        if (!res.ok)
          return res.json().then((d) => Promise.reject(d.detail ?? res.statusText));
        return res.json();
      })
      .then((data: Config) => {
        setConfig(data);
        setSim({
          baseUrl: data.base_url,
          endpoints: data.endpoints.map((ep) => ({
            method: ep.method,
            path: ep.path,
          })),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [platform, concurrency, rampUp, duration, setSim]);

  // Start a simulation run
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
          platform,
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
      setProgress(0);
      startedAtRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [config, concurrency, rampUp, duration, platform]);

  // Auto-start simulation once config is loaded
  useEffect(() => {
    if (config && phase === "config") {
      startRun();
    }
  }, [config, phase, startRun]);

  // Timer management during the running phase
  useEffect(() => {
    if (phase !== "running") return;

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

    return () => {
      clearInterval(timer);
      clearInterval(smoothProgress);
      clearTimeout(endTimeout);
    };
  }, [phase, duration]);

  return (
    <main className="flex flex-1 flex-col items-center px-12 pt-0">
      <div className="w-full max-w-full">
        {phase === "config" && <BackButton href="/configure" />}

        {phase === "config" && (
          <>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Simulate
            </h1>
            <p className="mt-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              {concurrency} users · {rampUp}s ramp-up · {duration}s duration
            </p>
          </>
        )}

        {!platform && (
          <p className="mt-16 text-center text-zinc-500 dark:text-zinc-500">
            No configuration provided.
            <br />
            <a href="/configure" className="text-amber-600 underline">
              Configure a run
            </a>{" "}
            first.
          </p>
        )}

        {loading && (
          <div className="mt-16 flex flex-col items-center gap-3 text-zinc-500 dark:text-zinc-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-amber-600" />
            <p className="text-sm">
              Generating traffic configuration from your description...
            </p>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {config && phase === "config" && (
          <ConfigPreview
            config={config}
            concurrency={concurrency}
            rampUp={rampUp}
            duration={duration}
            onStart={startRun}
          />
        )}

        {config && phase === "running" && (
          <RunningView
            latencyHistory={latencyHistory}
            concurrency={concurrency}
            rampUp={rampUp}
            duration={duration}
            elapsed={elapsed}
            progress={progress}
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
