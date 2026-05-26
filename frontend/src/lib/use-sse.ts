"use client";

import { useEffect, useRef, useState } from "react";
import type { LatencyPoint, LogEvent } from "@/components/LatencyChart";

export type Comparison = {
  cache_ms: number;
  no_cache_ms: number;
  difference_ms: number;
  percentage_faster: number;
  winner: "cache" | "no_cache" | "tie";
};

type RawSSEMessage = {
  t: number;
  cache: number | null;
  noCache: number | null;
  cachePct: number | null;
  noCachePct: number | null;
  cacheCount?: number;
  noCacheCount?: number;
  cacheRps?: number;
  noCacheRps?: number;
  events?: { level: string; msg: string }[];
  done?: boolean;
  comparison?: Comparison;
};

export function useSSE(url: string | null): {
  data: LatencyPoint[];
  isComplete: boolean;
  error: string | null;
  comparison: Comparison | null;
} {
  const [data, setData] = useState<LatencyPoint[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    setData([]);
    setIsComplete(false);
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

  return { data, isComplete, error, comparison };
}
