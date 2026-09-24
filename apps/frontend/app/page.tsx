import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { DEFAULT_RETURN_PATH, safeReturnPath, signInHref } from "@/lib/return-path";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const [{ user }, params] = await Promise.all([withAuth(), searchParams]);
  // `?next=` comes from outside links (e.g. the portfolio) and is only honored for app pages.
  const next = safeReturnPath(params.next);
  if (user) {
    redirect(next ?? DEFAULT_RETURN_PATH);
  }

  // Plain <a>: the auth routes are redirecting route handlers, which next/link would prefetch.
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Lab Trxckin</h1>
      <p className="text-sm text-muted-foreground">Convex + WorkOS AuthKit + NestJS</p>
      <div className="flex gap-3">
        <a href={signInHref(next)} className="rounded-md bg-foreground px-4 py-2 text-background">
          Iniciar sesión
        </a>
        <a href="/sign-up" className="rounded-md border px-4 py-2">
          Crear cuenta
        </a>
      </div>
    </main>
  );
}
