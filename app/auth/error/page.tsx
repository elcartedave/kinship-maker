import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6 py-16">
      <section className="paper-panel w-full rounded-[2rem] p-8 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent-strong">
          Authentication
        </p>
        <h1 className="font-display mt-3 text-4xl text-ink">Sign-in issue</h1>
        <p className="mt-4 text-base leading-7 text-ink-soft">
          {message ??
            "The authentication link could not be completed. Please request a new one from the dashboard."}
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-strong"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
