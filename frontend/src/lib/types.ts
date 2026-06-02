// ── Shared types for the DataScalr frontend ──

export type SimEndpoint = {
  method: string;
  path: string;
  weight?: number;
};

export type ProfileEndpoint = {
  method: string;
  path: string;
  description: string;
  weight: number;
};

export type Profile = {
  label: string;
  description: string;
  endpoints: ProfileEndpoint[];
};

export type FullConfig = {
  parent_id: string;
  base_url: string;
  profiles: Profile[];
};

export type LogEvent = {
  level: "info" | "warn" | "error";
  chart?: string;
  msg: string;
};

export type LatencyPoint = {
  t: number;
  cacheHit: number | null;
  cacheHit_p95: number | null;
  cacheHit_p99: number | null;
  cacheMissRate: number | null;
  noCache: number | null;
  noCache_p95: number | null;
  noCache_p99: number | null;
  cachePct: number | null;
  noCachePct: number | null;
  cacheCount?: number;
  noCacheCount?: number;
  cacheRps?: number;
  noCacheRps?: number;
  rateLimited?: number;
  rateLimitedPct?: number;
  rateLimitedVus?: number;
  totalRps?: number;
  events?: LogEvent[];
};

export type RateLimitComparison = {
  mode: "rate_limiting";
  avg_rps: number;
  peak_rps: number;
  rate_limit_ceiling: number;
  avg_rl_pct: number;
  avg_rps_pct_of_ceiling: number;
  total_rate_limited: number;
  total_passed: number;
};

export type CacheComparison = {
  cache_ms: number;
  no_cache_ms: number;
  difference_ms: number;
  percentage_faster: number;
  winner: "cache" | "no_cache" | "tie";
};

export type RunComparison = CacheComparison | RateLimitComparison;
