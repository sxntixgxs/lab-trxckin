import { ProtectedPage } from '@/components/utils/ProtectedPage';
import EmployeesPage from '@/components/workforce/employees';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ProtectedPage requiredPermission="workforce/employees">
      <EmployeesPage />
    </ProtectedPage>
  );
}
