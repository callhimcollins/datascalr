"use client";

import { createContext, useContext, useState } from "react";
import type { SimEndpoint, ProfileEndpoint, Profile, FullConfig } from "./types";

type SimState = {
  baseUrl: string;
  parentId: string;
  endpoints: SimEndpoint[];
  mode?: "cache_comparison" | "rate_limiting";
  rateLimitRps?: number;
};

const SimContext = createContext<{
  sim: SimState | null;
  setSim: (s: SimState | null) => void;
} | null>(null);

export function SimProvider({ children }: { children: React.ReactNode }) {
  const [sim, setSim] = useState<SimState | null>(null);
  return (
    <SimContext.Provider value={{ sim, setSim }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within SimProvider");
  return ctx;
}
