import { Button } from '@/components/ui/button';

// Shared pagination footer for every data table. Shows "menunjukkan X–Y of Z"
// plus numbered page buttons so the client can see there is more data.
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Page-number window: first, last, and current ±1, with ellipses.
  const nums: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) nums.push(i);
  } else {
    const add = (n: number) => { if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n); };
    add(1);
    if (page > 3) nums.push('…');
    add(page - 1); add(page); add(page + 1);
    if (page < totalPages - 2) nums.push('…');
    add(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border">
      <div className="text-sm text-muted-foreground">
        Menunjukkan <b className="text-foreground">{start}</b>–<b className="text-foreground">{end}</b> daripada <b className="text-foreground">{total}</b>
        {totalPages > 1 && <span className="ml-1">· {totalPages} halaman</span>}
      </div>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</Button>
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-muted-foreground select-none">…</span>
          ) : (
            <Button
              key={n}
              size="sm"
              variant={n === page ? 'default' : 'outline'}
              className="h-8 min-w-8 px-2"
              onClick={() => onPageChange(n)}
            >
              {n}
            </Button>
          ),
        )}
        <Button size="sm" variant="outline" className="h-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export default TablePagination;
