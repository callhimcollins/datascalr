"use client";

import { useEffect, useRef, useState } from "react";
import type { LatencyPoint, CacheComparison, RateLimitComparison } from "./types";

type RawSSEMessage = {
  t: number;
  cacheHit: number | null;
  cacheMissRate: number | null;
  noCache: number | null;
  cachePct: number | null;
  noCachePct: number | null;
  cacheCount?: number;
  noCacheCount?: number;
  cacheRps?: number;
  noCacheRps?: number;
  rateLimited?: number;
  rateLimitedPct?: number;
  throttledVus?: number;
  totalRps?: number;
  events?: { level: string; chart?: string; msg: string }[];
  done?: boolean;
  stopped?: boolean;
  comparison?: CacheComparison | RateLimitComparison;
};

export function useSSE(url: string | null): {
  data: LatencyPoint[];
  isComplete: boolean;
  isStopped: boolean;
  error: string | null;
  comparison: CacheComparison | RateLimitComparison | null;
} {
  const [data, setData] = useState<LatencyPoint[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CacheComparison | RateLimitComparison | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    setData([]);
    setIsComplete(false);
    setIsStopped(false);
    setError(null);
    setComparison(null);

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg: RawSSEMessage = JSON.parse(e.data);
        if (msg.done) {
          if (msg.comparison) {
            setComparison(msg.comparison);
          }
          if (msg.stopped) {
            setIsStopped(true);
          }
          setIsComplete(true);
          es.close();
          return;
        }
        setData((prev) => [...prev, msg as LatencyPoint]);
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      setError("Connection lost");
      es.close();
    };

    return () => {
      es.close();
    };
  }, [url]);

  return { data, isComplete, isStopped, error, comparison };
}
