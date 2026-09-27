import { ProtectedPage } from '@/components/utils/ProtectedPage';
import AttendancePage from '@/components/workforce/attendance';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/attendance">
      <AttendancePage />
    </ProtectedPage>
  );
}
