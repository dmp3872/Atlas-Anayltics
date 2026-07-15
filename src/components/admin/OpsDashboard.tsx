import { useMemo } from 'react';
import { BarChart3, Clock, FlaskConical, TrendingUp } from 'lucide-react';
import { COA, Order, OrderSample } from '../../lib/types';
import {
  averageDailyIntake, dailySampleIntake, intakeSparklineMax,
  testTurnaroundStats, testVolumeStats,
} from '../../lib/labAnalytics';
import { buildQueueItems } from '../../lib/labQueue';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
}

export default function OpsDashboard({ samples, orders, coas }: Props) {
  const intake = useMemo(() => dailySampleIntake(samples, 30), [samples]);
  const avgDaily = useMemo(() => averageDailyIntake(samples, 30), [samples]);
  const volume = useMemo(() => testVolumeStats(samples, 30), [samples]);
  const turnaround = useMemo(() => testTurnaroundStats(samples, coas), [samples, coas]);
  const maxIntake = useMemo(() => intakeSparklineMax(intake), [intake]);
  const queueCount = useMemo(() => buildQueueItems(samples, orders, coas, true).length, [samples, orders, coas]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Avg daily intake (30d)', value: avgDaily, icon: TrendingUp },
          { label: 'Samples (30d)', value: intake.reduce((s, p) => s + p.count, 0), icon: BarChart3 },
          { label: 'In testing queue', value: queueCount, icon: FlaskConical },
          { label: 'Tests tracked', value: volume.length, icon: Clock },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <s.icon size={16} className="text-brand-500 mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{s.label}</p>
            <p className="text-2xl font-bold text-black">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-bold text-black mb-1">Sample intake — last 30 days</h3>
          <p className="text-xs text-neutral-500 mb-4">New samples received per day</p>
          <div className="flex items-end gap-1 h-40">
            {intake.map(point => (
              <div key={point.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-[9px] text-neutral-500 tabular-nums">{point.count || ''}</span>
                <div
                  className="w-full rounded-t bg-brand-500/90 min-h-[2px] transition-all"
                  style={{ height: `${Math.max(2, (point.count / maxIntake) * 100)}%` }}
                  title={`${point.label}: ${point.count} samples`}
                />
                <span className="text-[8px] text-neutral-400 truncate w-full text-center hidden sm:block">
                  {point.label.replace(' ', '\u00a0')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-black mb-1">Test volume — last 30 days</h3>
          <p className="text-xs text-neutral-500 mb-4">Average tests run per day by type</p>
          {volume.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">No test data in the last 30 days.</p>
          ) : (
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 border-b border-atlas-border">
                    <th className="pb-2 pr-3">Test</th>
                    <th className="pb-2 pr-3 text-right">Total</th>
                    <th className="pb-2 text-right">Avg/day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atlas-border">
                  {volume.map(row => (
                    <tr key={row.testName}>
                      <td className="py-2 pr-3 font-medium text-black">{row.testName}</td>
                      <td className="py-2 pr-3 text-right text-neutral-600 tabular-nums">{row.total}</td>
                      <td className="py-2 text-right font-semibold text-brand-800 tabular-nums">{row.avgPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-black mb-1">Average turnaround by test</h3>
        <p className="text-xs text-neutral-500 mb-4">Days from sample arrival to COA issued (completed samples)</p>
        {turnaround.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">No completed COAs with timing data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 border-b border-atlas-border">
                  <th className="pb-2 pr-4">Test</th>
                  <th className="pb-2 pr-4 text-right">Completed</th>
                  <th className="pb-2 text-right">Avg days</th>
                  <th className="pb-2 w-1/3">Visual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atlas-border">
                {turnaround.map(row => {
                  const maxDays = Math.max(...turnaround.map(r => r.avgDays), 1);
                  return (
                    <tr key={row.testName}>
                      <td className="py-2.5 pr-4 font-medium text-black">{row.testName}</td>
                      <td className="py-2.5 pr-4 text-right text-neutral-600 tabular-nums">{row.completedCount}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">{row.avgDays}d</td>
                      <td className="py-2.5">
                        <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${(row.avgDays / maxDays) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
