"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSim } from "@/lib/simulation-context";
import styles from "./Navbar.module.css";

export function Navbar() {
  const { sim } = useSim();

  return (
    <header className={styles.header}>
      <div className="flex items-center gap-3">
        <Link href="/" className={styles.logo}>
          <Brand />
        </Link>

        {sim && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 dark:text-zinc-500">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1 py-0.5 rounded-[2px]">
              GET
            </span>
            {sim.baseUrl}
          </div>
        )}
      </div>

      <ThemeToggle />
    </header>
  );
}
