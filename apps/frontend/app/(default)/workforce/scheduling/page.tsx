import { ProtectedPage } from '@/components/utils/ProtectedPage';
import SchedulingPage from '@/components/workforce/scheduling';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/scheduling">
      <SchedulingPage />
    </ProtectedPage>
  );
}
