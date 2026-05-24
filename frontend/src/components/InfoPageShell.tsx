import { BackButton } from "@/components/BackButton";

interface InfoPageShellProps {
  title: string;
  description: string;
}

export function InfoPageShell({ title, description }: InfoPageShellProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
        <BackButton />
      </div>
    </main>
  );
}
