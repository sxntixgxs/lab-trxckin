import { ProtectedPage } from "@/components/utils/ProtectedPage";
import { CentroCostoClient } from "./centro-costo-client";

export default function CentroCostoPage() {
  return (
    <ProtectedPage requiredPermission="administracion/centro-costo">
      <CentroCostoClient />
    </ProtectedPage>
  );
}
