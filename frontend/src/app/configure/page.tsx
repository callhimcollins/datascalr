"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ConfigurePage() {
  const router = useRouter();
  const [config, setConfig] = useState({
    platform: "",
    concurrency: 10,
    rampUp: 5,
    duration: 30,
  });

  const valid = config.platform.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const params = new URLSearchParams({
      platform: config.platform,
      concurrency: String(config.concurrency),
      rampUp: String(config.rampUp),
      duration: String(config.duration),
    });
    router.push(`/simulate?${params.toString()}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <BackButton />

        <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground">
          Configure
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Describe your REST API — DataScalr handles the rest.
        </p>

        <form onSubmit={handleSubmit} className="mt-10">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="space-y-5 pt-6">
              {/* Platform description */}
              <div className="space-y-2">
                <Label htmlFor="platform">What are you testing?</Label>
                <Textarea
                  id="platform"
                  rows={4}
                  placeholder='e.g. "A REST API for a task manager — GET /tasks lists all tasks, POST /tasks creates one with a title field, DELETE /tasks/:id removes it."'
                  value={config.platform}
                  onChange={(e) =>
                    setConfig({ ...config, platform: e.target.value })
                  }
                  className="field-sizing-content"
                />
              </div>

              {/* Concurrency + Ramp-up side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="concurrency">Concurrency</Label>
                  <Input
                    id="concurrency"
                    type="number"
                    min={1}
                    max={5000}
                    value={config.concurrency}
                    onChange={(e) =>
                      setConfig({ ...config, concurrency: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rampUp">Ramp-up (s)</Label>
                  <Input
                    id="rampUp"
                    type="number"
                    min={0}
                    max={300}
                    value={config.rampUp}
                    onChange={(e) =>
                      setConfig({ ...config, rampUp: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (s)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={3600}
                  value={config.duration}
                  onChange={(e) =>
                    setConfig({ ...config, duration: Number(e.target.value) })
                  }
                />
              </div>

              {/* Fire button */}
              <Button
                type="submit"
                disabled={!valid}
                className="!mt-6 w-full cursor-pointer bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:from-amber-600 disabled:hover:to-orange-600 shadow-sm hover:shadow-md hover:shadow-amber-600/20 transition-all"
                size="lg"
              >
                Simulate
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </main>
  );
}
