"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

type RunSummary = {
  id: string;
  parent_id: string;
  profile_label: string;
  status: string;
  concurrency: number;
  ramp_up: number;
  duration: number;
  avg_cache_ms: number | null;
  avg_no_cache_ms: number | null;
  comparison: { winner: string; percentage_faster: number; difference_ms: number } | null;
  analysis: { why: string; recommendation: string } | null;
  started_at: string | null;
  completed_at: string | null;
};

type ParentSummary = {
  id: string;
  label: string;
  created_at: string | null;
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

function ComparisonSummary({ comparison }: { comparison: RunSummary["comparison"] }) {
  if (!comparison) return <span className="text-zinc-400 text-xs">—</span>;
  if (comparison.winner === "tie") return <span className="text-xs text-zinc-500">Tie</span>;
  const isCache = comparison.winner === "cache";
  return (
    <span className={`text-xs font-medium ${isCache ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
      {isCache ? "Cache" : "No-cache"} {comparison.percentage_faster}% faster
    </span>
  );
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/runs`).then((r) => r.json()),
      fetch(`${API_BASE}/api/parents`).then((r) => r.json()),
    ]).then(([runsData, parentsData]) => {
      const all = Array.isArray(runsData) ? runsData : [];
      setRuns(all.filter((r: RunSummary) => r.status === "completed"));
      setParents(Array.isArray(parentsData) ? parentsData : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parents) map.set(p.id, p.label);
    return map;
  }, [parents]);

  const parentDates = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of parents) map.set(p.id, p.created_at);
    return map;
  }, [parents]);

  const grouped = useMemo(() => {
    const groups = new Map<string, RunSummary[]>();
    for (const run of runs) {
      const pid = run.parent_id || "__orphaned__";
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(run);
    }
    // Sort groups by parent created_at desc (most recent parent first)
    return [...groups.entries()].sort((a, b) => {
      const da = parentDates.get(a[0]) ?? "";
      const db = parentDates.get(b[0]) ?? "";
      return db.localeCompare(da);
    });
  }, [runs, parentDates]);

  const deleteRun = useCallback(async (e: React.MouseEvent, runId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`${API_BASE}/api/runs/${runId}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== runId));
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center px-4 md:px-12 pt-6 pb-12">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">History</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Past simulation runs and their results.</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && runs.length === 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No runs yet.</p>
            <Link href="/configure" className="mt-2 inline-block text-sm font-medium text-amber-600 hover:underline">
              Configure your first run
            </Link>
          </div>
        )}

        {!loading && runs.length > 0 && (
          <div className="space-y-6">
            {grouped.map(([parentId, groupRuns]) => (
              <div key={parentId}>
                <div className="mb-2">
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {parentMap.get(parentId) || "Unnamed"}
                  </h2>
                  {parentDates.get(parentId) && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{fmtDate(parentDates.get(parentId)!)}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {groupRuns.map((run) => (
                    <div
                      key={run.id}
                      className="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all"
                    >
                      <Link href={`/runs/${run.id}`} className="block px-4 py-2.5 pb-7">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                {run.profile_label || "Unnamed"}
                              </span>
                              <span className="text-xs text-zinc-400">Ran for {run.duration}s</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                              <span>{run.concurrency} users</span>
                              <span>{run.ramp_up}s ramp-up</span>
                              {run.started_at && <span>{fmtDate(run.started_at)}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <ComparisonSummary comparison={run.comparison} />
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={(e) => deleteRun(e, run.id)}
                        className="absolute bottom-1 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out text-xs font-bold text-red-400 hover:text-red-300 border border-transparent hover:border-red-400/40 hover:bg-red-500/10 rounded px-1.5 py-0.5 scale-90 hover:scale-100"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
