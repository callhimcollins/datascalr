import Link from "next/link";

export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="mt-8 inline-block rounded-lg bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-100 transition-transform duration-200 hover:scale-105 dark:bg-black dark:text-zinc-400 dark:border dark:border-zinc-800"
    >
      Back
    </Link>
  );
}
