"use client";

import { createContext, useContext, useState } from "react";

export type SimEndpoint = {
  method: string;
  path: string;
};

type SimState = {
  baseUrl: string;
  endpoints: SimEndpoint[];
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
