import HRUsers from '@/components/hr/HRUsers';
import HRAttendance from '@/components/hr/HRAttendance';

// HQ → HR. The sidebar's HR group has two sub-menus, each its own route:
//   /dashboard/hr/users       — Team marketers (read-only) + extra staff
//   /dashboard/hr/attendance  — daily attendance for both (DFR logic)
export default function HR({ view }: { view: 'users' | 'attendance' }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">{view === 'users' ? 'User' : 'Attendance'}</h1>
        <p className="text-sm text-muted-foreground">
          {view === 'users'
            ? 'Senarai staff — marketer dari Team dan staff tambahan.'
            : 'Kehadiran harian untuk marketer dan staff tambahan.'}
        </p>
      </div>
      {view === 'users' ? <HRUsers /> : <HRAttendance />}
    </div>
  );
}
