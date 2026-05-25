"use client";

type Endpoint = {
  method: string;
  path: string;
  description: string;
  weight: number;
  body_template: Record<string, unknown> | null;
};

export type Config = {
  base_url: string;
  endpoints: Endpoint[];
};

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-blue-400",
  PUT: "text-orange-400",
  PATCH: "text-yellow-400",
  DELETE: "text-red-400",
};

export function ConfigPreview({
  config,
  concurrency,
  rampUp,
  duration,
  onStart,
}: {
  config: Config;
  concurrency: string;
  rampUp: string;
  duration: string;
  onStart: () => void;
}) {
  const totalWeight = config.endpoints.reduce((s, e) => s + e.weight, 0) ?? 1;

  return (
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
                {Math.round((ep.weight / totalWeight) * 100)}%
              </div>
              <div className="mt-0.5 h-1 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${(ep.weight / totalWeight) * 100}%` }}
                />
              </div>
            </div>
            {ep.body_template && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0">
                {"{...}"}
              </span>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="glow-btn mt-8 w-full rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 transition-all"
      >
        Run Simulation
      </button>
    </div>
  );
}
