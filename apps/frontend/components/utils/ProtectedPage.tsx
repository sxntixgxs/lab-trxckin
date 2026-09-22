import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import NoAutorizado from "@/app/no-autorizado";
import { checkServerAccess } from "@/lib/fetch-backend";

interface ProtectedPageProps {
  children: React.ReactNode;
  requiredPermission: string;
  redirectToLogin?: boolean;
}

export async function ProtectedPage({
  children,
  requiredPermission,
  redirectToLogin = true,
}: ProtectedPageProps) {
  const { user } = await withAuth();

  if (!user) {
    if (redirectToLogin) {
      redirect("/sign-in");
    }
    return (
      <div className="flex max-h-[100vh] w-full flex-col items-center justify-center bg-gray-100 px-4 dark:bg-gray-900">
        <NoAutorizado />
      </div>
    );
  }

  const hasAccess = await checkServerAccess(requiredPermission);
  if (!hasAccess) {
    return (
      <div className="flex max-h-[100vh] w-full flex-col items-center justify-center bg-gray-100 px-4 dark:bg-gray-900">
        <NoAutorizado />
      </div>
    );
  }

  return <>{children}</>;
}
