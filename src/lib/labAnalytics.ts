import { COA, OrderSample } from './types';
import { testsForSample } from './labQueue';

export interface DailyIntakePoint {
  date: string;
  label: string;
  count: number;
}

export interface TestVolumeStat {
  testName: string;
  total: number;
  avgPerDay: number;
}

export interface TestTurnaroundStat {
  testName: string;
  completedCount: number;
  avgDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sample counts per day for the last N days (including today). */
export function dailySampleIntake(samples: OrderSample[], days = 30): DailyIntakePoint[] {
  const today = startOfDay(new Date());
  const buckets = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets.set(isoDay(d), 0);
  }

  for (const sample of samples) {
    const day = isoDay(startOfDay(new Date(sample.created_at)));
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({
    date,
    label: formatDayLabel(new Date(`${date}T12:00:00`)),
    count,
  }));
}

export function averageDailyIntake(samples: OrderSample[], days = 30): number {
  const series = dailySampleIntake(samples, days);
  if (!series.length) return 0;
  const total = series.reduce((s, p) => s + p.count, 0);
  return Math.round((total / series.length) * 10) / 10;
}

/** How often each test appears across samples in the window; avg per day = total / days. */
export function testVolumeStats(samples: OrderSample[], days = 30): TestVolumeStat[] {
  const cutoff = Date.now() - days * DAY_MS;
  const counts = new Map<string, number>();

  for (const sample of samples) {
    if (new Date(sample.created_at).getTime() < cutoff) continue;
    for (const test of testsForSample(sample)) {
      counts.set(test, (counts.get(test) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([testName, total]) => ({
      testName,
      total,
      avgPerDay: Math.round((total / days) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Avg days from sample arrival (created_at) to COA issued, per test on completed samples. */
export function testTurnaroundStats(samples: OrderSample[], coas: COA[]): TestTurnaroundStat[] {
  const coaBySample = new Map<string, COA>();
  for (const coa of coas) {
    if (coa.sample_id) coaBySample.set(coa.sample_id, coa);
  }

  const totals = new Map<string, { sumDays: number; count: number }>();

  for (const sample of samples) {
    const coa = coaBySample.get(sample.id);
    if (!coa?.issued_at) continue;

    const arrival = new Date(sample.created_at).getTime();
    const issued = new Date(coa.issued_at).getTime();
    if (issued <= arrival) continue;

    const days = (issued - arrival) / DAY_MS;
    for (const test of testsForSample(sample)) {
      const cur = totals.get(test) ?? { sumDays: 0, count: 0 };
      cur.sumDays += days;
      cur.count += 1;
      totals.set(test, cur);
    }
  }

  return [...totals.entries()]
    .map(([testName, { sumDays, count }]) => ({
      testName,
      completedCount: count,
      avgDays: Math.round((sumDays / count) * 10) / 10,
    }))
    .sort((a, b) => a.avgDays - b.avgDays);
}

export function intakeSparklineMax(points: DailyIntakePoint[]): number {
  return Math.max(1, ...points.map(p => p.count));
}
