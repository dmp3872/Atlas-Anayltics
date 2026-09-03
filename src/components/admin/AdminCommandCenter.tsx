import { Link } from 'react-router-dom';
import { type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, Clock, DollarSign,
  FlaskConical, Package, UserPlus, Users, Zap,
} from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import {
  formatDateTime, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, normalizePaymentStatus,
} from '../../lib/utils';
import {
  adminOpsSnapshot, formatAgeHours,
} from '../../lib/adminMetrics';
import { computeAdminNeedsYou } from '../../lib/needsYou';
import NeedsYouStrip from '../shared/NeedsYouStrip';
import { LAB_PRIORITY_LABELS, orderLabPriority } from '../../lib/labQueue';
import { resolveEtaAt } from '../../lib/etaHeat';
import PriorityBanner from '../lab/PriorityBanner';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  users: UserProfile[];
  onNavigate: (section: string) => void;
}

/**
 * Admin Ops Bench — customer workflow, exceptions, and behindness.
 * Intentionally not a chemist testing queue mirror (that lives on /lab).
 */
export default function AdminCommandCenter({ samples, orders, coas, users, onNavigate }: Props) {
  const ops = adminOpsSnapshot(samples, orders, coas, users);
  const needsYou = computeAdminNeedsYou(orders, samples, coas, users);

  const health = {
    clear: {
      label: 'On track',
      blurb: 'No major overdue backlog or chemist lag.',
      icon: CheckCircle2,
    },
    watch: {
      label: 'Needs attention',
      blurb: 'Unpaid, unassigned, or approaching overdue work.',
      icon: Clock,
    },
    behind: {
      label: 'Behind',
      blurb: 'Overdue ETAs and/or assigned chemists lagging — intervene.',
      icon: AlertTriangle,
    },
  }[ops.behindLevel];

  return (
    <div className="space-y-7">
      <div className={`aa-portal-panel aa-portal-panel-pad aa-animate ${
        ops.behindLevel === 'behind' ? 'aa-needs-urgent' : ops.behindLevel === 'watch' ? 'aa-needs-warning' : 'aa-needs-empty'
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <health.icon size={20} className="flex-shrink-0 mt-0.5" strokeWidth={1.6} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Ops status</p>
              <h2 className="text-xl font-semibold tracking-tight mt-0.5" style={{ letterSpacing: '-0.03em' }}>{health.label}</h2>
              <p className="text-sm mt-1 opacity-80">{health.blurb}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 aa-animate" style={{ animationDelay: '60ms' }}>
        <StatChip label="Overdue" value={ops.overdue.length} alert={ops.overdue.length > 0} />
        <StatChip label="Chemist lag" value={ops.chemistsBehind.length} alert={ops.chemistsBehind.length > 0} />
        <StatChip label="Unassigned" value={ops.unassigned.length} alert={ops.unassigned.length > 0} />
        <StatChip label="Unpaid" value={ops.unpaid.length} alert={ops.unpaid.length > 0} />
      </div>

      <p className="text-xs aa-animate" style={{ color: 'var(--aa-muted)', animationDelay: '80ms' }}>
        Customer workflow, money, ETAs, and staffing exceptions.
        Testing lives on the{' '}
        <Link to="/lab" className="font-semibold hover:underline" style={{ color: 'var(--aa-ink)' }}>Chemist Console</Link>.
      </p>

      <NeedsYouStrip
        items={needsYou}
        onSection={onNavigate}
        emptyLabel="Ops are clear — no exceptions need you right now."
      />

      {/* Customer workflow lanes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold tracking-tight text-black">Customer workflow</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted)' }}>Where orders sit for the client.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1"
          >
            All orders <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <WorkflowLane
            title="Unpaid"
            icon={DollarSign}
            count={ops.unpaid.length}
            hint="Confirm payment or waive"
            tone={ops.unpaid.length ? 'amber' : 'ok'}
            onSeeAll={() => onNavigate('orders')}
            orders={ops.unpaid.slice(0, 4)}
          />
          <WorkflowLane
            title="Awaiting sample"
            icon={Package}
            count={ops.awaitingSample.length}
            hint="Client hasn't shipped / not received"
            tone={ops.awaitingSample.length > 8 ? 'amber' : 'ok'}
            onSeeAll={() => onNavigate('orders')}
            orders={ops.awaitingSample.slice(0, 4)}
          />
          <WorkflowLane
            title="In lab"
            icon={FlaskConical}
            count={ops.inLab.length}
            hint="Processing → review"
            tone="ok"
            onSeeAll={() => onNavigate('orders')}
            orders={ops.inLab.slice(0, 4)}
          />
          <WorkflowLane
            title="Overdue ETA"
            icon={AlertTriangle}
            count={ops.overdue.length}
            hint="Past promised ready date"
            tone={ops.overdue.length ? 'red' : 'ok'}
            onSeeAll={() => onNavigate('orders')}
            orders={ops.overdue.slice(0, 4)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Who's behind */}
        <div className="aa-portal-panel aa-portal-panel-pad">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold tracking-tight text-black flex items-center gap-2">
                <Users size={16} style={{ color: 'var(--aa-gold)' }} strokeWidth={1.6} /> Who&apos;s behind
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted)' }}>
                Assigned chemists with overdue work or samples aging past 48h.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('lab')}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Staff load →
            </button>
          </div>
          {ops.chemistsBehind.length === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">
              No chemist lag right now — assignees are within SLA.
            </p>
          ) : (
            <div className="space-y-3">
              {ops.chemistsBehind.map(c => (
                <div key={c.chemistId} className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-black">{c.name}</p>
                      <p className="text-xs text-red-800 mt-0.5">
                        {c.laggingCount} lagging · {c.assignedCount} assigned · oldest {formatAgeHours(c.oldestHours)}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-red-100 text-red-900 border-red-200 flex-shrink-0">
                      Behind
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {c.currentSamples.slice(0, 3).map(({ sample, order, ageHours }) => (
                      <li key={sample.id} className="text-xs text-neutral-700 flex items-center justify-between gap-2">
                        <Link to={`/admin/orders/${order.id}`} className="truncate hover:underline font-medium">
                          {sample.display_name || sample.sample_name}
                          <span className="text-neutral-400 font-normal"> · {order.order_number}</span>
                        </Link>
                        <span className="tabular-nums text-neutral-500 flex-shrink-0">{formatAgeHours(ageHours)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {ops.behindAssigned.length > 0 && ops.chemistsBehind.length === 0 && (
            <p className="text-xs text-amber-800 mt-3">
              {ops.behindAssigned.length} assigned sample{ops.behindAssigned.length === 1 ? '' : 's'} aging — check dispatch / ETAs.
            </p>
          )}
        </div>

        {/* Exceptions */}
        <div className="aa-portal-panel aa-portal-panel-pad">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold tracking-tight text-black">Exceptions & money</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted)' }}>Refunds, cancellations, and urgent priority.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('clients')}
              className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1"
            >
              <Building2 size={12} /> Clients
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <MiniStat
              label="Urgent"
              value={ops.urgent.length}
              onClick={() => onNavigate('orders')}
              alert={ops.urgent.length > 0}
            />
            <MiniStat
              label="Refunded"
              value={ops.refunded.length}
              onClick={() => onNavigate('orders')}
            />
            <MiniStat
              label="Client info"
              value={ops.clientInfoNeeded}
              onClick={() => onNavigate('coas')}
              alert={ops.clientInfoNeeded > 0}
            />
          </div>

          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Urgent orders</h4>
          {ops.urgent.length === 0 ? (
            <p className="text-sm text-neutral-500 mb-4">No urgent priority orders.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {ops.urgent.slice(0, 4).map(order => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}

          <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Recent cancellations</h4>
          {ops.cancelledRecent.length === 0 ? (
            <p className="text-sm text-neutral-500">None recently.</p>
          ) : (
            <div className="space-y-2">
              {ops.cancelledRecent.slice(0, 4).map(order => (
                <OrderRow key={order.id} order={order} muted />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unassigned needs dispatch — admin action, not chemist claim */}
      {ops.unassigned.length > 0 && (
        <div className="aa-portal-panel overflow-hidden">
          <div className="px-5 py-3 border-b border-atlas-border flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-black flex items-center gap-2">
                <UserPlus size={14} className="text-amber-600" /> Needs dispatch
              </h3>
              <p className="text-xs text-neutral-500">Unassigned testing-ready samples — assign from the dispatch board.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dispatch')}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Open dispatch
            </button>
          </div>
          <div className="divide-y divide-atlas-border">
            {ops.unassigned.slice(0, 5).map(item => (
              <div key={item.sample.id} className="overflow-hidden">
                <PriorityBanner priority={item.priority} rush={item.order.rush_processing} compact />
                <div className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-black truncate">
                      {item.sample.display_name || item.sample.sample_name}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      <Link to={`/admin/orders/${item.order.id}`} className="font-mono text-brand-700 hover:underline">
                        {item.order.order_number}
                      </Link>
                      {' · '}{item.order.company_name || '—'}
                      {' · '}{formatAgeHours(item.ageHours)} waiting
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <QuickLink onClick={() => onNavigate('orders')}>Orders & priority</QuickLink>
        <QuickLink onClick={() => onNavigate('dispatch')}>Dispatch board</QuickLink>
        <QuickLink onClick={() => onNavigate('clients')}>Client CRM</QuickLink>
        <QuickLink onClick={() => onNavigate('coas')}>COA overrides</QuickLink>
        <Link to="/lab" className="aa-admin-pill">
          Chemist console
        </Link>
      </div>
    </div>
  );
}

function StatChip({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`portal-stat-card ${alert ? 'ring-1 ring-amber-300/80' : ''}`}>
      <p className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: 'var(--aa-ink)', letterSpacing: '-0.03em' }}>
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted)' }}>{label}</p>
    </div>
  );
}

function MiniStat({
  label, value, onClick, alert,
}: { label: string; value: number; onClick: () => void; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left hover:bg-black/[0.03] ${
        alert ? 'border-amber-200/80 bg-amber-50/40' : ''
      }`}
      style={alert ? undefined : { borderColor: 'var(--aa-line)', background: 'rgba(255,255,255,0.5)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-lg font-bold text-black tabular-nums">{value}</p>
    </button>
  );
}

function WorkflowLane({
  title, icon: Icon, count, hint, tone, orders, onSeeAll,
}: {
  title: string;
  icon: typeof Clock;
  count: number;
  hint: string;
  tone: 'ok' | 'amber' | 'red';
  orders: Order[];
  onSeeAll: () => void;
}) {
  const toneClass = {
    ok: '',
    amber: 'aa-needs-warning',
    red: 'aa-needs-urgent',
  }[tone];

  return (
    <div className={`aa-admin-lane ${toneClass}`}>
      <div className="px-4 py-3 border-b border-atlas-border/80 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Icon size={12} /> {title}
          </p>
          <p className="text-2xl font-bold text-black tabular-nums mt-0.5">{count}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>
        </div>
        <button type="button" onClick={onSeeAll} className="text-[11px] font-semibold text-brand-700 hover:underline flex-shrink-0">
          View
        </button>
      </div>
      <div className="divide-y divide-atlas-border min-h-[88px]">
        {orders.length === 0 ? (
          <p className="px-4 py-6 text-xs text-neutral-400 text-center">Clear</p>
        ) : orders.map(order => (
          <OrderRow key={order.id} order={order} compact />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order, compact, muted }: { order: Order; compact?: boolean; muted?: boolean }) {
  const priority = orderLabPriority(order);
  const payment = normalizePaymentStatus(order.payment_status);
  const eta = resolveEtaAt(order);

  return (
    <Link
      to={`/admin/orders/${order.id}`}
      className={`flex items-start gap-2 hover:bg-neutral-50/80 ${compact ? 'px-3 py-2' : 'px-0 py-2'} ${muted ? 'opacity-75' : ''}`}
    >
      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        priority === 'urgent' ? 'bg-red-500' : priority === 'high' ? 'bg-amber-500' : 'bg-neutral-300'
      }`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-black truncate font-mono">
          {order.order_number}
          {order.rush_processing && (
            <span className="inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-purple-700 font-bold uppercase">
              <Zap size={9} /> Rush
            </span>
          )}
        </p>
        <p className="text-[11px] text-neutral-500 truncate">
          {order.company_name || '—'}
          {' · '}{ORDER_STATUS_LABELS[order.status]}
          {!compact && <> · {PAYMENT_STATUS_LABELS[payment]}</>}
          {!compact && priority !== 'normal' && <> · {LAB_PRIORITY_LABELS[priority]}</>}
          {eta && compact && <> · ETA {formatDateTime(eta)}</>}
        </p>
      </div>
    </Link>
  );
}

function QuickLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="aa-admin-pill">
      {children}
    </button>
  );
}

