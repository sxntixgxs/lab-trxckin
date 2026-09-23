import { ProtectedPage } from "@/components/utils/ProtectedPage";
import { TercerosErpClient } from "./terceros-erp-client";

export default function TercerosErpPage() {
  return (
    <ProtectedPage requiredPermission="administracion/terceros-erp">
      <TercerosErpClient />
    </ProtectedPage>
  );
}
