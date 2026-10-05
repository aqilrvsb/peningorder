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
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      Tarikh belum ditapis — tekan Filter. Sedang papar: {formatDMY(startDate)} – {formatDMY(endDate)}
    </span>
  );
};

export default UnappliedDateNote;
