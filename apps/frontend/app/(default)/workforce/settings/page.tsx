import { ProtectedPage } from '@/components/utils/ProtectedPage';
import SettingsPage from '@/components/workforce/settings';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/settings">
      <SettingsPage />
    </ProtectedPage>
  );
}
