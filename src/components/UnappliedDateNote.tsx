import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDMY } from '@/lib/utils';

/**
 * Shown next to a date filter's Filter/Apply button when the picked dates differ
 * from the ones the data was loaded for — so a changed-but-unapplied range can't
 * be mistaken for the figures on screen.
 */
export const UnappliedDateNote: React.FC<{ pendingStart: string; pendingEnd: string; startDate: string; endDate: string }> = ({
  pendingStart, pendingEnd, startDate, endDate,
}) => {
  if (pendingStart === startDate && pendingEnd === endDate) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      Tarikh belum ditapis — tekan Filter. Sedang papar: {formatDMY(startDate)} – {formatDMY(endDate)}
    </span>
  );
};

export default UnappliedDateNote;
