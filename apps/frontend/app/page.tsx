import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { user } = await withAuth();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Lab Trxckin</h1>
      <p className="text-sm text-muted-foreground">Convex + WorkOS AuthKit + NestJS</p>
      <div className="flex gap-3">
        <Link href="/sign-in" className="rounded-md bg-foreground px-4 py-2 text-background">
          Iniciar sesión
        </Link>
        <Link href="/sign-up" className="rounded-md border px-4 py-2">
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
