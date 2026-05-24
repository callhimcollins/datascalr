import Link from "next/link";

export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="glow-btn mt-8 inline-block rounded-lg bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900"
    >
      ← Back
    </Link>
  );
}
