import React from 'react';
import { Users } from 'lucide-react';
import { useTeam } from '@/hooks/useTeam';

/**
 * Team filter dropdown: Semua Team / Saya / each staff. `value` is the selected
 * marketer_id_staff ('' = all team). Renders nothing unless the caller is a
 * client with staff (staff already see only their own rows via RLS).
 */
export const TeamFilter: React.FC<{ value: string; onChange: (v: string) => void; className?: string }> = ({ value, onChange, className }) => {
  const { members, showFilter } = useTeam();
  if (!showFilter) return null;
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Semua Team</option>
        {members.map((m) => (
          <option key={m.idstaff} value={m.idstaff}>
            {m.is_self ? `Saya (${m.idstaff})` : `${m.name} · ${m.idstaff}`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TeamFilter;
