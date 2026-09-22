import Link from "next/link";

export default function NoAutorizado() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">No autorizado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        No tienes permiso para ver este módulo. Pide a un administrador que asigne la ruta en Accesos.
      </p>
      <Link href="/dashboard" className="text-sm underline">
        Volver al dashboard
      </Link>
    </div>
  );
}
