import Link from "next/link";
import { AccessRequestLink } from "@/components/access-request-link";
import { buttonVariants } from "@/components/ui/button";
import { getAccessRequestUrl } from "@/lib/app-env";

export default function NoAutorizado() {
  const puedeSolicitar = getAccessRequestUrl() !== null;

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">No autorizado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        No tienes permiso para ver este módulo. Pide a un administrador que asigne la ruta en Accesos.
      </p>
      {puedeSolicitar ? (
        <div className="flex flex-col items-center gap-2">
          <p className="max-w-md text-sm text-muted-foreground">
            ¿Quieres probar este módulo? Solicita acceso con el correo de tu cuenta.
          </p>
          <AccessRequestLink
            newTabLabel="se abre en una pestaña nueva"
            showHost
            className={buttonVariants({ variant: "outline", size: "sm" })}
            hostClassName="font-normal text-muted-foreground"
          >
            Solicitar acceso
          </AccessRequestLink>
        </div>
      ) : null}
      <Link href="/dashboard" className="text-sm underline">
        Volver al dashboard
      </Link>
    </div>
  );
}
