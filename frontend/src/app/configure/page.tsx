"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSim, type FullConfig, type EndpointConfig } from "@/lib/simulation-context";

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-blue-400",
  PUT: "text-orange-400",
  PATCH: "text-yellow-400",
  DELETE: "text-red-400",
};

function WeightSlider({
  ep,
  value,
  onChange,
}: {
  ep: EndpointConfig;
  value: number;
  onChange: (newVal: number) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="glass-card rounded-lg px-4 py-3 flex items-center gap-3">
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
      <div
        className="relative w-24 h-5 shrink-0"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden pointer-events-none">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${value}%` }}
          />
        </div>
        {hovered && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-amber-600 z-20 pointer-events-none"
            style={{ left: `${value}%` }}
          />
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
      </div>
      <div className="shrink-0 text-right w-6">
        <div className="text-xs tabular-nums text-zinc-400">{value}%</div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mt-4 mb-6">
      <span className={`h-2 w-2 rounded-full ${step >= 1 ? "bg-amber-600" : "border border-zinc-400 dark:border-zinc-600"}`} />
      <div className="h-0.5 w-4 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
      <span className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-amber-600" : "border border-zinc-400 dark:border-zinc-600"}`} />
    </div>
  );
}

function ConfigureInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSim } = useSim();

  const [step, setStep] = useState(1);
  const [generatedConfig, setGeneratedConfig] = useState<FullConfig | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [weights, setWeights] = useState<number[]>([]);

  const [form, setForm] = useState({
    platform: params.get("platform") ?? "",
    concurrency: params.get("concurrency") ?? "10",
    rampUp: params.get("rampUp") ?? "5",
    duration: params.get("duration") ?? "30",
  });

  const valid = form.platform.trim().length > 0;

  function setNum(key: "concurrency" | "rampUp" | "duration", raw: string) {
    if (raw === "") {
      setForm({ ...form, [key]: "" });
      return;
    }
    const n = Number(raw);
    if (!isNaN(n)) {
      setForm({ ...form, [key]: raw });
    }
  }

  async function handleNext() {
    if (!valid) return;
    setGenerating(true);
    setGenError(null);

    try {
      const res = await fetch("http://localhost:8000/api/generate-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: form.platform,
          concurrency: Number(form.concurrency || "1"),
          ramp_up: Number(form.rampUp || "0"),
          duration: Number(form.duration || "1"),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail ?? "Failed to generate config");
      }

      const data: FullConfig = await res.json();
      setGeneratedConfig(data);
      // Normalize initial weights to sum to 100
      const raw = data.endpoints.map((ep) => ep.weight);
      const total = raw.reduce((s, v) => s + v, 0) || 1;
      const normalized = raw.map((w) => Math.round((w / total) * 100));
      // Fix rounding to ensure exactly 100
      const sum = normalized.reduce((s, v) => s + v, 0);
      if (sum !== 100 && normalized.length > 0) {
        normalized[normalized.length - 1] += 100 - sum;
      }
      setWeights(normalized);
      setSim({
        baseUrl: data.base_url,
        endpoints: data.endpoints.map((ep, i) => ({
          method: ep.method,
          path: ep.path,
          weight: normalized[i],
        })),
      });
      setStep(2);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function handleSimulate() {
    if (!generatedConfig) return;
    const adjusted = generatedConfig.endpoints.map((ep, i) => ({
      method: ep.method,
      path: ep.path,
      weight: weights[i] ?? 0,
    }));
    setSim({ baseUrl: generatedConfig.base_url, endpoints: adjusted });

    const qs = new URLSearchParams({
      platform: form.platform,
      concurrency: form.concurrency || "1",
      rampUp: form.rampUp || "0",
      duration: form.duration || "1",
    });
    router.push(`/simulate?${qs.toString()}`);
  }

  const handleWeightChange = useCallback((changedIndex: number, newVal: number) => {
    setWeights((prev) => {
      const n = prev.length;
      if (n <= 1) return prev;

      newVal = Math.max(0, Math.min(100, Math.round(newVal)));
      const result = [...prev];
      result[changedIndex] = newVal;

      const remaining = 100 - newVal;
      const otherSum = prev.reduce((s, v, i) => s + (i !== changedIndex ? v : 0), 0);

      if (otherSum === 0) {
        // All others were 0 — split remaining evenly
        const share = Math.floor(remaining / (n - 1));
        for (let i = 0; i < n; i++) {
          if (i !== changedIndex) result[i] = share;
        }
      } else {
        let allocated = 0;
        for (let i = 0; i < n; i++) {
          if (i === changedIndex) continue;
          const r = Math.round((prev[i] / otherSum) * remaining);
          result[i] = r;
          allocated += r;
        }
        // Fix rounding so we hit exactly 100
        const diff = remaining - allocated;
        if (diff !== 0) {
          for (let i = 0; i < n; i++) {
            if (i !== changedIndex && result[i] + diff >= 0) {
              result[i] += diff;
              break;
            }
          }
        }
      }

      return result;
    });
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <BackButton />

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground">
          Configure
        </h1>

        <StepIndicator step={step} />

        {/* ── Step 1: Form ── */}
        {step === 1 && (
          <>
            <p className="mb-10 text-sm font-semibold text-muted-foreground">
              Describe your REST API — DataScalr handles the rest.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
            >
              <Card className="border-border/50 shadow-sm">
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="platform">What are you testing?</Label>
                    <Textarea
                      id="platform"
                      rows={4}
                      placeholder='e.g. "A REST API for a task manager..."'
                      value={form.platform}
                      onChange={(e) =>
                        setForm({ ...form, platform: e.target.value })
                      }
                      className="field-sizing-content"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="concurrency">Concurrency</Label>
                      <Input
                        id="concurrency"
                        type="number"
                        min={1}
                        max={5000}
                        value={form.concurrency}
                        onChange={(e) => setNum("concurrency", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rampUp">Ramp-up (s)</Label>
                      <Input
                        id="rampUp"
                        type="number"
                        min={0}
                        max={300}
                        value={form.rampUp}
                        onChange={(e) => setNum("rampUp", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (s)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={1}
                      max={3600}
                      value={form.duration}
                      onChange={(e) => setNum("duration", e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!valid || generating}
                    className="!mt-6 w-full cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:from-amber-600 disabled:hover:to-orange-600 shadow-sm hover:shadow-md hover:shadow-amber-600/20 transition-all"
                    size="lg"
                  >
                    {generating ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Generating...
                      </span>
                    ) : (
                      "Next"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </>
        )}

        {/* ── Step 2: Weight Distribution ── */}
        {step === 2 && generatedConfig && (
          <div className="space-y-6">
            <p className="text-sm font-semibold text-muted-foreground">
              Review the traffic distribution before simulating.
            </p>

            {/* Base URL */}
            {generatedConfig.base_url && (
              <div className="glass-card rounded-lg px-4 py-3">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                  Target
                </span>
                <p className="mt-0.5 text-sm font-mono text-zinc-900 dark:text-zinc-200">
                  {generatedConfig.base_url}
                </p>
              </div>
            )}

            {/* Run params summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card rounded-lg px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {form.concurrency || "1"}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Users
                </div>
              </div>
              <div className="glass-card rounded-lg px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {form.rampUp || "0"}s
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Ramp-up
                </div>
              </div>
              <div className="glass-card rounded-lg px-3 py-2.5 text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {form.duration || "1"}s
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Duration
                </div>
              </div>
            </div>

            {/* Endpoints / weight distribution */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">
                Request Distribution
              </span>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 text-right -mt-1 mb-1">
                Total: {weights.reduce((s, v) => s + v, 0)}%
              </div>
              {generatedConfig.endpoints.map((ep, i) => (
                <WeightSlider
                  key={i}
                  ep={ep}
                  value={weights[i] ?? 0}
                  onChange={(v) => handleWeightChange(i, v)}
                />
              ))}
            </div>

            {/* Simulate button */}
            <Button
              onClick={handleSimulate}
              className="!mt-8 w-full cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-sm hover:shadow-md hover:shadow-amber-600/20 transition-all"
              size="lg"
            >
              Simulate
            </Button>

            {/* Back to edit */}
            <button
              onClick={() => setStep(1)}
              className="w-full text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              ← Back to edit
            </button>
          </div>
        )}

        {/* ── Generation error ── */}
        {genError && (
          <div className="mt-8 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {genError}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ConfigurePage() {
  return (
    <Suspense>
      <ConfigureInner />
    </Suspense>
  );
}
