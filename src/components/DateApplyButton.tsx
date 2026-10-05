import React from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The "Filter" button of a date range: the data changes only when this is pressed. */
export const DateApplyButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <Button type="button" size="sm" className="h-9 shrink-0" onClick={onClick} disabled={disabled}>
    <Filter className="w-4 h-4 mr-1" />Filter
  </Button>
);

export default DateApplyButton;
