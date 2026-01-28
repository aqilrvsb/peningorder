import React, { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FileText, Loader2 } from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const PNL: React.FC = () => {
  const { profile, user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  // Generate year options (current year and 5 years back)
  const yearOptions = useMemo(() => {
    const years = [];
    for (let i = 0; i < 6; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);

  // Open salary slip in new tab
  const openSalarySlip = (month: number) => {
    const userId = user?.id || profile?.id;
    if (!userId) {
      console.error('User ID not found');
      return;
    }
    const url = `/salary/${userId}/${selectedYear}/${month}`;
    window.open(url, '_blank');
  };

  if (!user && !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">PNL Statement</h1>
        <p className="text-muted-foreground mt-1">View your monthly salary statements</p>
      </div>

      {/* Year Filter */}
      <div className="stat-card">
        <div className="flex items-center gap-4">
          <Label className="font-medium">Select Year:</Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Monthly Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">Monthly Salary - {selectedYear}</h2>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-16">No</th>
                <th>Month</th>
                <th className="text-center w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr key={month.value}>
                  <td className="font-medium">{month.value}</td>
                  <td>{month.label} {selectedYear}</td>
                  <td className="text-center">
                    <Button
                      size="sm"
                      onClick={() => openSalarySlip(month.value)}
                      className="gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      View Salary
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PNL;
