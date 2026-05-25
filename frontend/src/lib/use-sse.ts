"use client";

import { useEffect, useRef, useState } from "react";
import type { LatencyPoint } from "@/components/LatencyChart";

type RawSSEMessage = {
  t: number;
  cache: number;
  noCache: number;
  cachePct: number;
  noCachePct: number;
  done?: boolean;
};

export function useSSE(url: string | null): {
  data: LatencyPoint[];
  isComplete: boolean;
  error: string | null;
} {
  const [data, setData] = useState<LatencyPoint[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    setData([]);
    setIsComplete(false);
    setError(null);

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg: RawSSEMessage = JSON.parse(e.data);
        if (msg.done) {
          setIsComplete(true);
          es.close();
          return;
        }
        setData((prev) => [...prev, msg]);
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

  return { data, isComplete, error };
}
