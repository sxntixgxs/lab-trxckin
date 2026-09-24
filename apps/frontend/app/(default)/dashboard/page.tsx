import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AccessRequestLink } from "@/components/access-request-link";
import { buttonVariants } from "@/components/ui/button";
import { ProtectedPage } from "@/components/utils/ProtectedPage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccessRequestUrl } from "@/lib/app-env";
import { getCurrentBackendUser, userHasPermission } from "@/lib/fetch-backend";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";

type ModuleLink = { id: string; label: string; href: string };

function accessibleLinks(item: NavItem, canAccess: (permission?: string) => boolean): ModuleLink[] {
  const children = (item.children ?? []).filter((child) => canAccess(child.permission));
  if (children.length > 0) return children;
  if (item.href && item.id !== "dashboard" && canAccess(item.permission)) {
    return [{ id: item.id, label: item.label, href: item.href }];
  }
  return [];
}

export default async function DashboardPage() {
  return (
    <ProtectedPage requiredPermission="dashboard">
      <DashboardOverview />
    </ProtectedPage>
  );
}

async function DashboardOverview() {
  const user = await getCurrentBackendUser();
  const canAccess = (permission?: string) =>
    !permission || (user !== null && userHasPermission(user, permission));

  const sections = NAV_ITEMS.map((item) => ({ item, links: accessibleLinks(item, canAccess) })).filter(
    (section) => section.links.length > 0,
  );
  // New self-registered accounts (role `member`) only get the dashboard and Perfil.
  const withoutModules = user !== null && !sections.some(({ item }) => item.id !== "perfil");

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mt-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {user ? `Hola, ${user.nombre.split(" ")[0]}` : "Bienvenido"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estos son los módulos a los que tienes acceso.
        </p>
      </div>

      {withoutModules ? (
        <SinModulos />
      ) : sections.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Sin módulos asignados</CardTitle>
            <CardDescription>
              Tu rol todavía no tiene permisos sobre ningún módulo. Pide a un administrador que te
              asigne acceso.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {sections.length > 0 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ item, links }) => {
            const Icon = item.icon;
            return (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="h-5 w-5 text-slate-500" aria-hidden />
                    {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {links.map((link) => (
                      <li key={link.id}>
                        <Link
                          href={link.href}
                          className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {link.label}
                          <ArrowRight
                            className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Account without modules: says how to get them instead of leaving only the Perfil card. */
function SinModulos() {
  const puedeSolicitar = getAccessRequestUrl() !== null;

  return (
    <Card className="mt-6 border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <CardHeader>
        <CardTitle>Aún no tienes módulos</CardTitle>
        <CardDescription>
          Tu cuenta está activa, pero por ahora solo incluye el dashboard y tu perfil.{" "}
          {puedeSolicitar
            ? "Solicita acceso indicando el correo con el que te registraste y se activarán los módulos que quieras probar."
            : "Pide a un administrador que te asigne acceso."}
        </CardDescription>
      </CardHeader>
      {puedeSolicitar ? (
        <CardContent>
          <AccessRequestLink
            newTabLabel="se abre en una pestaña nueva"
            showHost
            className={buttonVariants({ size: "sm" })}
            hostClassName="font-normal opacity-75"
          >
            Solicitar acceso
          </AccessRequestLink>
        </CardContent>
      ) : null}
    </Card>
  );
}
