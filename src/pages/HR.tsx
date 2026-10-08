import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, Users } from 'lucide-react';
import HRUsers from '@/components/hr/HRUsers';
import HRAttendance from '@/components/hr/HRAttendance';

// HQ → HR. Two tabs: USER (Team marketers read-only + extra staff) and ATTENDANCE
// (both lists, DFR attendance logic). The tab lives in ?tab= so a refresh keeps it.
export default function HR() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'attendance' ? 'attendance' : 'user';

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">HR</h1>
        <p className="text-sm text-muted-foreground">Urus staff dan kehadiran harian team anda.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'user' ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="user" className="gap-2"><Users className="h-4 w-4" /> User</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2"><ClipboardCheck className="h-4 w-4" /> Attendance</TabsTrigger>
        </TabsList>
        <TabsContent value="user" className="mt-4"><HRUsers /></TabsContent>
        <TabsContent value="attendance" className="mt-4"><HRAttendance /></TabsContent>
      </Tabs>
    </div>
  );
}
