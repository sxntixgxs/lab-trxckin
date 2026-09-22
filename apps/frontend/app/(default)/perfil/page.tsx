import { withAuth } from "@workos-inc/authkit-nextjs";
import { ProtectedPage } from "@/components/utils/ProtectedPage";
import HeaderTitle from "@/components/ui/header-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PerfilPage() {
  const { user } = await withAuth();

  return (
    <ProtectedPage requiredPermission="perfil">
      <div className="px-4 sm:px-6 lg:px-8 pb-10">
        <HeaderTitle title="Perfil" description="Cuenta autenticada con WorkOS AuthKit" />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Email:</span> {user?.email ?? "—"}
            </p>
            <p>
              <span className="font-medium">Nombre:</span> {user?.firstName ?? user?.email ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </ProtectedPage>
  );
}
