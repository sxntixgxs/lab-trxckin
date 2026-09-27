import { ProtectedPage } from '@/components/utils/ProtectedPage';
import LocationsPage from '@/components/workforce/locations';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/locations">
      <LocationsPage />
    </ProtectedPage>
  );
}
