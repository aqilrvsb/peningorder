import * as React from 'react';
import { Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared building blocks for the dashboard's soft-UI look. Colours come from index.css
// (.icon-tile-*, .shimmer, .section-label).

export type Tone = 'brand' | 'blue' | 'indigo' | 'purple' | 'pink' | 'green' | 'amber' | 'orange' | 'red' | 'cyan' | 'slate';

// Written out in full: Tailwind only keeps classes it can see as literal strings,
// so `icon-tile-${tone}` would drop every tone not spelled out somewhere else.
const TONE_CLASS: Record<Tone, string> = {
  brand: 'icon-tile-brand', blue: 'icon-tile-blue', indigo: 'icon-tile-indigo', purple: 'icon-tile-purple',
  pink: 'icon-tile-pink', green: 'icon-tile-green', amber: 'icon-tile-amber', orange: 'icon-tile-orange',
  red: 'icon-tile-red', cyan: 'icon-tile-cyan', slate: 'icon-tile-slate',
};

/** Coloured square behind an icon. */
export function IconTile({ icon: Icon, tone = 'brand', size = 'md', className }: {
  icon: React.ElementType; tone?: Tone; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <span className={cn(size === 'sm' ? 'icon-tile-sm' : 'icon-tile', TONE_CLASS[tone] ?? TONE_CLASS.brand, className)}>
      <Icon />
    </span>
  );
}

/** Page title row: icon tile + title + description, actions wrap under on phones. */
export function PageHeader({ title, description, icon, tone = 'brand', actions, className }: {
  title: React.ReactNode; description?: React.ReactNode; icon?: React.ElementType; tone?: Tone;
  actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone} className="mt-0.5 hidden sm:inline-flex" />}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** Stat card: tile + value + small label. Clickable when onClick is given (lifts on hover). */
export function StatCard({ icon, tone = 'blue', label, value, hint, onClick, active, className }: {
  icon: React.ElementType; tone?: Tone; label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode;
  onClick?: () => void; active?: boolean; className?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        // Phones: small tile on top, value gets the full card width (2-up grids are ~160px wide).
        'flex w-full flex-col items-start gap-2 rounded-xl border border-border/80 bg-card p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:gap-3 sm:p-4',
        onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15',
        active && 'border-primary/40 ring-2 ring-primary/15',
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4 sm:h-10 sm:w-10 sm:rounded-xl sm:[&_svg]:h-5 sm:[&_svg]:w-5" />
      <div className="min-w-0 w-full">
        <p className="break-words text-lg font-bold leading-tight tracking-tight sm:text-2xl">{value}</p>
        <p className="mt-1 line-clamp-2 text-xs font-medium text-muted-foreground">{label}</p>
        {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </Comp>
  );
}

/** Grey shimmer rows while a table/list loads (instead of a spinner). */
export function TableSkeleton({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 py-2', className)} aria-busy="true" aria-label="Loading">
      <div className="flex gap-3">
        {Array.from({ length: cols }).map((_, i) => <div key={i} className="shimmer h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => <div key={c} className="shimmer h-8 flex-1 rounded-lg" />)}
        </div>
      ))}
    </div>
  );
}

/** Grey shimmer cards while stats load. */
export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="shimmer h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2"><div className="shimmer h-5 w-16" /><div className="shimmer h-3 w-24" /></div>
        </div>
      ))}
    </div>
  );
}

/**
 * Guidance instead of an error popup: shows what's still needed (✓ for done fields).
 * items: [{ label: 'Nama', done: !!name }, …]. Renders nothing once everything is done.
 */
export function MissingHint({ items, className }: { items: { label: string; done: boolean }[]; className?: string }) {
  const missing = items.filter((i) => !i.done);
  if (missing.length === 0) return null;
  return (
    <div className={cn('rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300', className)}>
      <p className="flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" /> Masih diperlukan: {missing.map((m) => m.label).join(', ')}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((i) => (
          <span key={i.label} className={cn('inline-flex items-center gap-1', i.done ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700/80 dark:text-amber-300/80')}>
            {i.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />} {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Friendly empty state for tables/lists. */
export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon?: React.ElementType; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-12 text-center', className)}>
      {Icon && <IconTile icon={Icon} tone="slate" className="mb-1" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
