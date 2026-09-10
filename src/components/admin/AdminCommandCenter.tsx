import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { COA, Order, OrderSample, UserProfile } from "../../lib/types";
import { adminOpsSnapshot, formatAgeHours } from "../../lib/adminMetrics";
import { chemistWorkloadStats } from "../../lib/labAnalytics";
import {
  LAB_PRIORITY_LABELS,
  orderLabPriority,
  prioritySortScore,
} from "../../lib/labQueue";
import { ORDER_STATUS_LABELS, formatDateTime } from "../../lib/utils";
import { resolveEtaAt } from "../../lib/etaHeat";
interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  users: UserProfile[];
  onNavigate: (section: string, filter?: string) => void;
}
export default function AdminCommandCenter({
  samples,
  orders,
  coas,
  users,
  onNavigate,
}: Props) {
  const ops = useMemo(
    () => adminOpsSnapshot(samples, orders, coas, users),
    [samples, orders, coas, users],
  );
  const workload = useMemo(
    () =>
      chemistWorkloadStats(
        samples,
        orders,
        coas,
        users.filter((u) => u.role === "chemist" || u.role === "admin"),
      ),
    [samples, orders, coas, users],
  );
  const [view, setView] = useState("attention");
  const [search, setSearch] = useState("");
  const attentionIds = new Set(
    [
      ...ops.overdue,
      ...ops.urgent,
      ...ops.unpaid,
      ...ops.unassigned.map((i) => i.order),
    ].map((o) => o.id),
  );
  const active = orders.filter(
    (o) => o.status !== "complete" && o.status !== "cancelled",
  );
  const rows = active
    .filter(
      (o) =>
        (view !== "attention" || attentionIds.has(o.id)) &&
        `${o.order_number} ${o.company_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        prioritySortScore(a) - prioritySortScore(b) ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  const metrics = [
    {
      label: "Active orders",
      value: ops.activeCount,
      detail: "Across the laboratory",
      section: "orders",
      filter: "active",
    },
    {
      label: "Awaiting assignment",
      value: ops.unassigned.length,
      detail: "Samples ready for dispatch",
      section: "dispatch",
      filter: undefined,
    },
    {
      label: "Overdue orders",
      value: ops.overdue.length,
      detail: "Past the estimated ready date",
      section: "orders",
      filter: "overdue",
    },
    {
      label: "Ready for review",
      value: ops.needsPublish,
      detail: "Certificates in review or verified",
      section: "coas",
      filter: undefined,
    },
  ];
  const stages = [
    { label: "Unpaid", count: ops.unpaid.length, filter: "unpaid" },
    {
      label: "Awaiting sample",
      count: active.filter((o) => o.status === "awaiting_sample").length,
      filter: "awaiting_sample",
    },
    { label: "In laboratory", count: ops.inLab.length, filter: "active" },
    { label: "Overdue", count: ops.overdue.length, filter: "overdue" },
  ];
  return (
    <div className="admin-overview">
      <div className="admin-metrics">
        {metrics.map((m, i) => (
          <button
            key={m.label}
            onClick={() => onNavigate(m.section, m.filter)}
            className="admin-metric"
          >
            <span>
              {m.label}
              <ArrowUpRight size={14} />
            </span>
            <strong className={i === 2 && m.value > 0 ? "admin-danger" : ""}>
              {m.value.toLocaleString()}
            </strong>
            <small>{m.detail}</small>
          </button>
        ))}
      </div>
      <div className="admin-overview-grid">
        <section
          className="admin-surface admin-order-workspace"
          aria-labelledby="orders-heading"
        >
          <div className="admin-surface-heading">
            <div>
              <p className="admin-eyebrow">DAILY OPERATIONS</p>
              <h2 id="orders-heading">Order worklist</h2>
            </div>
            <button
              className="admin-text-link"
              onClick={() => onNavigate("orders", "active")}
            >
              All orders <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="admin-worklist-tabs">
            <div className="admin-tabs" aria-label="Order worklist filters">
              <button
                aria-pressed={view === "attention"}
                className={view === "attention" ? "is-active" : ""}
                onClick={() => setView("attention")}
              >
                Needs attention <span>{attentionIds.size}</span>
              </button>
              <button
                aria-pressed={view === "active"}
                className={view === "active" ? "is-active" : ""}
                onClick={() => setView("active")}
              >
                All active <span>{active.length}</span>
              </button>
            </div>
          </div>
          <label className="admin-search">
            <Search size={16} />
            <span className="sr-only">Search worklist</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order or company"
            />
            {search && (
              <button
                aria-label="Clear worklist search"
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}
          </label>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order / client</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Estimated ready</th>
                  <th>
                    <span className="sr-only">Open order</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((o) => {
                  const priority = orderLabPriority(o),
                    eta = resolveEtaAt(o),
                    overdue = eta && Date.parse(eta) < Date.now();
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link
                          className="admin-order-id"
                          to={`/admin/orders/${o.id}`}
                        >
                          {o.order_number}
                        </Link>
                        <span className="admin-cell-sub">
                          {o.company_name || "Company not provided"}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-priority is-${priority}`}>
                          <i />
                          {LAB_PRIORITY_LABELS[priority]}
                        </span>
                        {o.rush_processing && (
                          <small className="admin-cell-sub">
                            Rush processing
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="admin-status">
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td>
                        <span className={overdue ? "admin-danger" : ""}>
                          {eta
                            ? new Date(eta).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "Not set"}
                        </span>
                        {overdue && (
                          <span className="admin-cell-sub admin-danger">
                            Overdue
                          </span>
                        )}
                      </td>
                      <td>
                        <Link
                          aria-label={`Open order ${o.order_number}`}
                          className="admin-row-open"
                          to={`/admin/orders/${o.id}`}
                        >
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="admin-empty">
              <CheckCircle2 size={25} />
              <h3>
                {search
                  ? "No matching orders"
                  : view === "attention"
                    ? "No orders need attention"
                    : "No active orders"}
              </h3>
              <p>
                {search
                  ? "Try another order number or company."
                  : "New orders will appear here when they are submitted."}
              </p>
            </div>
          )}
          <div className="admin-table-footer">
            <span>
              Showing {Math.min(8, rows.length)} of {rows.length} orders
            </span>
            <button
              className="admin-text-link"
              onClick={() => onNavigate("orders", "active")}
            >
              Manage orders <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <aside className="admin-context-rail">
          <section className="admin-dispatch-callout">
            <span className="admin-eyebrow">NEXT ACTION</span>
            <h2>
              {ops.unassigned.length
                ? "Keep the lab moving."
                : "Dispatch is clear."}
            </h2>
            <p>
              {ops.unassigned.length
                ? `${ops.unassigned.length} testing-ready samples are waiting for a chemist.`
                : "Every testing-ready sample has an assignment."}
            </p>
            <button
              onClick={() => onNavigate("dispatch")}
              className="admin-button admin-button-gold"
            >
              Open dispatch queue <ArrowRight size={15} />
            </button>
          </section>
          <section className="admin-surface admin-workload">
            <div className="admin-surface-heading">
              <h2>Chemist workload</h2>
              <button
                className="admin-text-link"
                aria-label="View chemist workload"
                onClick={() => onNavigate("lab")}
              >
                <ArrowUpRight size={16} />
              </button>
            </div>
            <p className="admin-rail-description">
              Open samples per team member
            </p>
            {workload.length === 0 ? (
              <p className="admin-rail-description">
                Add chemists in Team & access to start assigning work.
              </p>
            ) : (
              workload
                .slice()
                .sort((a, b) => b.assignedCount - a.assignedCount)
                .slice(0, 5)
                .map((w) => (
                  <div className="admin-workload-row" key={w.chemistId}>
                    <span className="admin-avatar">
                      {w.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <div className="admin-workload-name">
                        <span>{w.name}</span>
                        <strong>{w.assignedCount}</strong>
                      </div>
                      <div className="admin-workload-track">
                        <span
                          style={{
                            width: `${(w.assignedCount / Math.max(1, ...workload.map((c) => c.assignedCount))) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))
            )}
            <button
              className="admin-rail-link"
              onClick={() => onNavigate("lab")}
            >
              Manage assignments <ArrowRight size={14} />
            </button>
          </section>
          <section className="admin-watchlist">
            <h2>
              <Clock size={16} /> Operational watchlist
            </h2>
            <button onClick={() => onNavigate("orders", "unpaid")}>
              <span>Awaiting payment</span>
              <strong>{ops.unpaid.length}</strong>
              <ArrowUpRight size={13} />
            </button>
            <button onClick={() => onNavigate("lab")}>
              <span>Chemists with aging work</span>
              <strong>{ops.chemistsBehind.length}</strong>
              <ArrowUpRight size={13} />
            </button>
            <button onClick={() => onNavigate("coas")}>
              <span>Missing client information</span>
              <strong>{ops.clientInfoNeeded}</strong>
              <ArrowUpRight size={13} />
            </button>
            <button onClick={() => onNavigate("orders", "all")}>
              <span>Refunded orders</span>
              <strong>{ops.refunded.length}</strong>
              <ArrowUpRight size={13} />
            </button>
          </section>
        </aside>
      </div>
      <section className="admin-surface admin-pipeline">
        <div className="admin-surface-heading">
          <div>
            <h2>Order flow</h2>
            <p>Current volume at each operational checkpoint.</p>
          </div>
        </div>
        <div className="admin-pipeline-stages">
          {stages.map((s, i) => (
            <button
              key={s.label}
              onClick={() => onNavigate("orders", s.filter)}
            >
              <span className="admin-stage-number">0{i + 1}</span>
              <div>
                <strong>{s.count}</strong>
                <span>{s.label}</span>
              </div>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </section>
      {ops.chemistsBehind.length > 0 && (
        <section className="admin-surface">
          <div className="admin-surface-heading">
            <div>
              <h2>Assignments needing attention</h2>
              <p>Overdue estimates or open samples older than 48 hours.</p>
            </div>
            <button
              className="admin-text-link"
              onClick={() => onNavigate("lab")}
            >
              Review workload <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Chemist</th>
                  <th>Aging samples</th>
                  <th>Total assigned</th>
                  <th>Oldest sample</th>
                  <th>Current work</th>
                </tr>
              </thead>
              <tbody>
                {ops.chemistsBehind.map((c) => (
                  <tr key={c.chemistId}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td className="admin-danger">{c.laggingCount}</td>
                    <td>{c.assignedCount}</td>
                    <td>{formatAgeHours(c.oldestHours)}</td>
                    <td>
                      {c.currentSamples.slice(0, 3).map(({ sample, order }) => (
                        <Link
                          key={sample.id}
                          className="admin-cell-sub admin-text-link"
                          to={`/admin/orders/${order.id}`}
                        >
                          {sample.display_name || sample.sample_name} ·{" "}
                          {order.order_number}
                        </Link>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {ops.cancelledRecent.length > 0 && (
        <details className="admin-surface admin-disclosure">
          <summary>
            Recent cancellations <span>{ops.cancelledRecent.length}</span>
          </summary>
          {ops.cancelledRecent.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`}>
              {o.order_number} · {o.company_name}
              <span>{formatDateTime(o.updated_at || o.created_at)}</span>
            </Link>
          ))}
        </details>
      )}
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

