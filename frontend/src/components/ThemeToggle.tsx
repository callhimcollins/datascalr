"use client";

import { useTheme } from "@/lib/theme";
import { SunIcon, MoonIcon, SystemIcon } from "@/lib/icons";

const modes = [
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
  { value: "system" as const, label: "System", icon: SystemIcon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/10 dark:bg-zinc-800/10 backdrop-blur-md p-0.5">
      {modes.map((mode) => {
        const active = theme === mode.value;
        return (
          <button
            key={mode.value}
            onClick={() => setTheme(mode.value)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
              ${active
                ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            title={`${mode.label} mode`}
          >
            <mode.icon className="size-3.5" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
