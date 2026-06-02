import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const parts = d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).split(", ");
  return `${parts[0]} ${parts[1]}, ${parts[2].toLowerCase()}`;
}
