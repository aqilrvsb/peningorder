import HRUsers from '@/components/hr/HRUsers';
import HRAttendance from '@/components/hr/HRAttendance';
import HRRoles from '@/components/hr/HRRoles';

// HQ → HR. The sidebar's HR group has three sub-menus, each its own route:
//   /dashboard/hr/users       — Team marketers (read-only) + extra staff
//   /dashboard/hr/attendance  — daily attendance for both (DFR logic + half day)
//   /dashboard/hr/roles       — the HQ's staff roles (the Role dropdown in Add/Edit Staff)
const VIEWS = {
  users: { title: 'User', desc: 'Senarai staff — marketer dari Team dan staff tambahan.', el: <HRUsers /> },
  attendance: { title: 'Attendance', desc: 'Kehadiran harian untuk marketer dan staff tambahan.', el: <HRAttendance /> },
  roles: { title: 'Role', desc: 'Senarai role staff — dipapar dalam dropdown Role bila tambah staff.', el: <HRRoles /> },
};

export default function HR({ view }: { view: keyof typeof VIEWS }) {
  const v = VIEWS[view];
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">{v.title}</h1>
        <p className="text-sm text-muted-foreground">{v.desc}</p>
      </div>
      {v.el}
    </div>
  );
}
