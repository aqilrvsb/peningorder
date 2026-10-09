import { Users, ClipboardCheck, Database, Tags } from 'lucide-react';
import HRUsers from '@/components/hr/HRUsers';
import HRAttendance from '@/components/hr/HRAttendance';
import HRRoles from '@/components/hr/HRRoles';
import HRDatabaseStaff from '@/components/hr/HRDatabaseStaff';
import { PageHeader } from '@/components/common/SoftUI';

// HQ → HR. The sidebar's HR group has four sub-menus, each its own route:
//   /dashboard/hr/users       — Team marketers (read-only) + extra staff
//   /dashboard/hr/attendance  — daily attendance for both (DFR logic + half day)
//   /dashboard/hr/database-staff — personal / bank / next-of-kin / academic details (DFR)
//   /dashboard/hr/roles       — the HQ's staff roles (the Role dropdown in Add/Edit Staff)
const VIEWS = {
  users: { title: 'User', desc: 'Senarai staff — marketer dari Team dan staff tambahan.', icon: Users, el: <HRUsers /> },
  attendance: { title: 'Attendance', desc: 'Kehadiran harian untuk marketer dan staff tambahan.', icon: ClipboardCheck, el: <HRAttendance /> },
  database: { title: 'Database Staff', desc: 'Maklumat terperinci staff — diri, bank, waris dan akademik.', icon: Database, el: <HRDatabaseStaff /> },
  roles: { title: 'Role', desc: 'Senarai role staff — dipapar dalam dropdown Role bila tambah staff.', icon: Tags, el: <HRRoles /> },
};

export default function HR({ view }: { view: keyof typeof VIEWS }) {
  const v = VIEWS[view];
  return (
    <div className="space-y-4">
      <PageHeader title={v.title} description={v.desc} icon={v.icon} tone="brand" />
      {v.el}
    </div>
  );
}
