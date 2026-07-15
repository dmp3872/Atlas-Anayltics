import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Clock, FlaskConical, Globe, MessageCircle,
  Shield, TrendingUp, Zap,
} from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { formatDateTime, ORDER_STATUS_LABELS } from '../../lib/utils';
import { COA_WORKFLOW_LABELS } from '../../lib/coaWorkflow';
import {
  AdminAlert, adminKpis, computeAdminAlerts, staffRoleCounts, workflowPipelineCounts,
} from '../../lib/adminMetrics';
import {
  LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES, buildQueueItems, normalizeLabPriority,
} from '../../lib/labQueue';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  users: UserProfile[];
  onNavigate: (section: string) => void;
}

export default function AdminCommandCenter({ samples, orders, coas, users, onNavigate }: Props) {
  const normalized = orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) }));
  const kpis = adminKpis(samples, orders, coas);
  const alerts = computeAdminAlerts(orders, samples, coas);
  const pipeline = workflowPipelineCounts(coas);
  const roles = staffRoleCounts(users);
  const queue = buildQueueItems(samples, normalized, coas, true).slice(0, 6);
  const chemistName = (id?: string | null) => users.find(u => u.id === id)?.full_name || 'Chemist';
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <AlertBanner key={alert.id} alert={alert} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Avg daily intake', value: kpis.avgDailyIntake, suffix: '/day', icon: TrendingUp },
          { label: 'Active orders', value: kpis.activeOrders, icon: Clock },
          { label: 'Testing queue', value: kpis.queueDepth, icon: FlaskConical, highlight: kpis.queueDepth > 0 },
          { label: 'Urgent orders', value: kpis.urgentOrders, icon: AlertTriangle, highlight: kpis.urgentOrders > 0, alert: true },
          { label: 'COA pipeline', value: kpis.coasInPipeline, icon: Shield },
          { label: 'Published COAs', value: kpis.coasPublished, icon: Globe },
        ].map(k => (
          <div
            key={k.label}
            className={`card p-4 ${k.highlight ? (k.alert ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/30') : ''}`}
          >
            <k.icon size={15} className={k.alert && k.highlight ? 'text-red-500' : 'text-brand-500'} />
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-2">{k.label}</p>
            <p className="text-2xl font-bold text-black tabular-nums">
              {k.value}{k.suffix && <span className="text-sm font-normal text-neutral-500">{k.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-black">Testing queue snapshot</h3>
              <p className="text-xs text-neutral-500">What chemists should run next — synced with Lab Console</p>
            </div>
            <Link to="/lab" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1">
              Open chemist console <ArrowRight size={12} />
            </Link>
          </div>
          {queue.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">Queue is clear — no pending samples.</p>
          ) : (
            <div className="space-y-2">
              {queue.map(({ sample, order, priority, testsLabel, ageHours, assigned_to: assignedTo }) => {
                const styles = LAB_PRIORITY_STYLES[priority];
                return (
                  <div key={sample.id} className={`flex items-start gap-3 p-3 rounded-lg border ${styles.border} ${styles.bg}`}>
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${styles.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-black">{sample.display_name || sample.sample_name}</p>
                      <p className="text-xs text-neutral-600">{order.company_name} · {order.order_number}</p>
                      <p className="text-xs text-neutral-500 mt-1 truncate">{testsLabel}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {assignedTo ? `Assigned to ${chemistName(assignedTo)}` : 'Unassigned'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${styles.badge}`}>
                        {LAB_PRIORITY_LABELS[priority]}
                      </span>
                      {order.rush_processing && (
                        <p className="text-[10px] text-purple-700 font-semibold mt-1 flex items-center justify-end gap-0.5">
                          <Zap size={10} /> Rush
                        </p>
                      )}
                      <p className="text-[10px] text-neutral-400 mt-1">{Math.round(ageHours)}h waiting</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="font-bold text-black mb-3">COA workflow pipeline</h3>
            <div className="space-y-2">
              {([
                ['awaiting_info', MessageCircle],
                ['testing_in_progress', Clock],
                ['issued', FlaskConical],
                ['pending_review', Shield],
                ['verified', Shield],
                ['published', Globe],
              ] as const).map(([stage, Icon]) => (
                <div key={stage} className="flex items-center justify-between py-2 border-b border-atlas-border last:border-0">
                  <span className="text-sm text-neutral-600 flex items-center gap-2">
                    <Icon size={14} className="text-neutral-400" />
                    {COA_WORKFLOW_LABELS[stage]}
                  </span>
                  <span className="font-bold text-black tabular-nums">{pipeline[stage]}</span>
                </div>
              ))}
            </div>
            <Link to="/lab" className="mt-4 block text-center text-xs font-medium text-brand-700 hover:underline">
              Manage in Lab Console →
            </Link>
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-black mb-3">Team &amp; access</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(roles).map(([role, count]) => (
                <div key={role} className="bg-neutral-50 rounded-lg px-3 py-2 border border-atlas-border">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 capitalize">{role}</p>
                  <p className="font-bold text-black">{count}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="mt-3 w-full text-xs font-medium text-brand-700 hover:underline"
            >
              Manage roles →
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-atlas-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Recent intake</h3>
          <button type="button" onClick={() => onNavigate('orders')} className="text-xs font-medium text-brand-700 hover:underline">
            All orders →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="coa-table-header">
                <th className="text-left px-5 py-3">Order</th>
                <th className="text-left px-5 py-3">Company</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Priority</th>
                <th className="text-left px-5 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {recentOrders.map(order => {
                const p = normalizeLabPriority(order.lab_priority);
                const styles = LAB_PRIORITY_STYLES[p];
                return (
                  <tr key={order.id} className="bg-white hover:bg-neutral-50">
                    <td className="px-5 py-3 font-medium">{order.order_number}</td>
                    <td className="px-5 py-3 text-neutral-600">{order.company_name || '—'}</td>
                    <td className="px-5 py-3 text-neutral-600">{ORDER_STATUS_LABELS[order.status]}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${styles.badge}`}>
                        {LAB_PRIORITY_LABELS[p]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-neutral-500">{formatDateTime(order.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AlertBanner({ alert, onNavigate }: { alert: AdminAlert; onNavigate: (s: string) => void }) {
  const styles = {
    urgent: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-brand-50 border-brand-200 text-brand-900',
  }[alert.level];

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${styles}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <span>{alert.message}</span>
      </div>
      {alert.actionLabel && alert.actionSection && (
        <button
          type="button"
          onClick={() => onNavigate(alert.actionSection!)}
          className="text-xs font-semibold underline hover:no-underline whitespace-nowrap"
        >
          {alert.actionLabel}
        </button>
      )}
    </div>
  );
}
