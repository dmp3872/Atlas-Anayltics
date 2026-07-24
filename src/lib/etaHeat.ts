import { formatDate } from './utils';

export type EtaHeatLevel = 'none' | 'ok' | 'soon' | 'today' | 'overdue';

export interface EtaHeat {
  level: EtaHeatLevel;
  /** Preferred display date (estimated_ready_at or due_at). */
  at: string | null;
  label: string;
  /** Left border / card accent */
  border: string;
  /** Soft row / card background */
  bg: string;
  /** Chip styles */
  chip: string;
  /** Compact heat bar fill */
  bar: string;
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Prefer staff-set ETA, fall back to operational due_at. */
export function resolveEtaAt(order: {
  estimated_ready_at?: string | null;
  due_at?: string | null;
}): string | null {
  return order.estimated_ready_at || order.due_at || null;
}

export function etaHeat(
  at: string | null | undefined,
  opts?: { complete?: boolean },
): EtaHeat {
  if (opts?.complete || !at) {
    return {
      level: 'none',
      at: at ?? null,
      label: at ? formatDate(at) : 'No ETA',
      border: 'border-atlas-border',
      bg: 'bg-white',
      chip: 'bg-neutral-100 text-neutral-500 border-neutral-200',
      bar: 'bg-neutral-200',
    };
  }

  const due = new Date(at).getTime();
  if (Number.isNaN(due)) {
    return etaHeat(null);
  }

  const now = Date.now();
  const days = (due - now) / MS_DAY;

  if (days < 0) {
    return {
      level: 'overdue',
      at,
      label: `Overdue · ${formatDate(at)}`,
      border: 'border-red-500',
      bg: 'bg-red-50/50',
      chip: 'bg-red-100 text-red-900 border-red-300',
      bar: 'bg-red-500',
    };
  }
  if (days <= 1) {
    return {
      level: 'today',
      at,
      label: `Due today · ${formatDate(at)}`,
      border: 'border-orange-400',
      bg: 'bg-orange-50/50',
      chip: 'bg-orange-100 text-orange-950 border-orange-300',
      bar: 'bg-orange-500',
    };
  }
  if (days <= 3) {
    return {
      level: 'soon',
      at,
      label: `Due soon · ${formatDate(at)}`,
      border: 'border-amber-400',
      bg: 'bg-amber-50/40',
      chip: 'bg-amber-100 text-amber-950 border-amber-300',
      bar: 'bg-amber-400',
    };
  }
  return {
    level: 'ok',
    at,
    label: `ETA ${formatDate(at)}`,
    border: 'border-emerald-300',
    bg: 'bg-emerald-50/30',
    chip: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    bar: 'bg-emerald-400',
  };
}

/** Compact heat bar for list rows (0–100% urgency). */
export function etaHeatPercent(level: EtaHeatLevel): number {
  switch (level) {
    case 'overdue': return 100;
    case 'today': return 85;
    case 'soon': return 55;
    case 'ok': return 25;
    default: return 0;
  }
}
