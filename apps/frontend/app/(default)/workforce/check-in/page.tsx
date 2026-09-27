import { ProtectedPage } from '@/components/utils/ProtectedPage';
import CheckInPage from '@/components/workforce/check-in';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/check-in">
      <CheckInPage />
    </ProtectedPage>
  );
}
