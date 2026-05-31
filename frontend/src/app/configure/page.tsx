"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { useSim, type FullConfig } from "@/lib/simulation-context";

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
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);

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
      const res = await fetch(`${API_BASE}/api/generate-config`, {
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
      setSelectedProfile(null);
      setStep(2);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function handleProfileSelect(index: number) {
    setSelectedProfile(index);
  }

  function handleSimulate() {
    if (!generatedConfig || selectedProfile === null) return;
    const profile = generatedConfig.profiles[selectedProfile];
    if (!profile) return;

    setSim({
      baseUrl: generatedConfig.base_url,
      parentId: generatedConfig.parent_id,
      endpoints: profile.endpoints.map((ep) => ({
        method: ep.method,
        path: ep.path,
        weight: ep.weight,
      })),
    });

    const qs = new URLSearchParams({
      platform: form.platform,
      concurrency: form.concurrency || "1",
      rampUp: form.rampUp || "0",
      duration: form.duration || "1",
      profile: profile.label,
    });
    router.push(`/simulate?${qs.toString()}`);
  }

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
              <Card className="border-border/50 shadow-sm dark:bg-[rgba(9,9,11,0.98)]">
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
                    className="!mt-6 w-full cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:from-amber-600 disabled:hover:to-orange-600 shadow-sm hover:shadow-md hover:shadow-amber-600/20 transition-all border-0"
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

        {/* ── Step 2: Profile Picker ── */}
        {step === 2 && generatedConfig && (
          <div className="space-y-6">
            <p className="text-sm font-semibold text-muted-foreground">
              Choose a traffic profile for your simulation.
            </p>

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

            {/* Profile cards */}
            <div className="space-y-3">
              {generatedConfig.profiles?.length > 0 ? (
                generatedConfig.profiles.map((profile, i) => {
                  const isSelected = selectedProfile === i;
                  return (
                  <button
                    key={i}
                    onClick={() => handleProfileSelect(i)}
                    className={`w-full text-left glass-card rounded-lg px-5 py-4 transition-colors cursor-pointer border focus-visible:outline-none ${
                      isSelected
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                        : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:border-amber-500/40 focus-visible:border-amber-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                          {profile.label}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {profile.description}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium mt-0.5 ${isSelected ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                        {isSelected ? "Selected" : "Select"}
                      </span>
                    </div>

                    {/* Endpoint weight bars */}
                    <div className="mt-3 space-y-1.5">
                      {profile.endpoints.map((ep, j) => {
                        const pct = Math.round(ep.weight * 100);
                        return (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="w-16 shrink-0 font-mono text-zinc-500 dark:text-zinc-400">
                              {ep.path.includes("cached=true") ? "Cached" : "Uncached"}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${ep.path.includes("cached=true") ? "bg-amber-500" : "bg-blue-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right font-mono text-zinc-600 dark:text-zinc-300">
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-4 text-sm text-red-700 dark:text-red-300">
                <p className="font-semibold">No profiles returned</p>
                <p className="mt-1">
                  The config generator returned an unexpected response. Try going back and describing your API again, or restart the backend server.
                </p>
              </div>
            )}
            </div>

            {/* Simulate button */}
            {selectedProfile !== null && (
              <Button
                onClick={handleSimulate}
                className="!mt-2 w-full cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-sm hover:shadow-md hover:shadow-amber-600/20 transition-all border-0"
                size="lg"
              >
                Simulate
              </Button>
            )}

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
