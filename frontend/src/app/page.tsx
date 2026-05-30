import { FeatureCard } from "@/components/FeatureCard/FeatureCard";
import { Brand } from "@/components/Brand";
import { BgCanvas } from "@/components/BgCanvas";

export default function Home() {
  return (
    <>
      <BgCanvas />
      {/* Hero with orange glow backdrop */}
      <main className="hero-glow flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="max-w-2xl text-center relative">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            <Brand />
          </h1>
          <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Scale simulation platform — understand how your system behaves under load.
          </p>

          {/* Feature cards */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <FeatureCard
              title="Configure"
              description="Set target URL, concurrency, ramp-up, duration — then fire."
              icon="config"
              href="/configure"
            />
            <FeatureCard
              title="Simulate"
              description="Virtual users generate realistic traffic against your system."
              icon="play"
              href="/simulate"
            />
            <FeatureCard
              title="History"
              description="Browse past runs, compare results, and review AI analysis."
              icon="chart"
              href="/history"
            />
          </div>
        </div>
      </main>
    </>
  );
}
