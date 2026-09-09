import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { COA, Order, OrderSample, LabPriority } from "../../lib/types";
import {
  formatDateTime,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  normalizePaymentStatus,
} from "../../lib/utils";
import {
  LAB_PRIORITIES,
  LAB_PRIORITY_LABELS,
  normalizeLabPriority,
  orderLabPriority,
  prioritySortScore,
} from "../../lib/labQueue";
import { hasIssuedCoaForSample } from "../../lib/coaPanels";
import { resolveEtaAt } from "../../lib/etaHeat";
import { formatAgeHours } from "../../lib/adminMetrics";
export type OrdersFilter =
  | "active"
  | "unpaid"
  | "awaiting_sample"
  | "overdue"
  | "urgent"
  | "rush"
  | "all";
export const ORDER_FILTERS: { id: OrdersFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "unpaid", label: "Unpaid" },
  { id: "awaiting_sample", label: "Awaiting sample" },
  { id: "overdue", label: "Overdue" },
  { id: "urgent", label: "Urgent" },
  { id: "rush", label: "Rush" },
  { id: "all", label: "All orders" },
];
interface Props {
  orders: Order[];
  samples?: OrderSample[];
  coas?: COA[];
  savingOrderId?: string | null;
  onSetPriority: (orderId: string, priority: LabPriority) => void;
  onMarkPaid?: (
    orderId: string,
    opts?: { note?: string; waived?: boolean },
  ) => void;
  savingPaymentId?: string | null;
  initialFilter?: OrdersFilter;
}
interface OrderQueueStats {
  sampleCount: number;
  pendingCount: number;
  oldestPendingHours: number;
}
function isOverdue(order: Order) {
  const eta = resolveEtaAt(order);
  return (
    !!eta &&
    order.status !== "complete" &&
    order.status !== "cancelled" &&
    Date.parse(eta) < Date.now()
  );
}
export default function AdminOrdersPanel({
  orders,
  samples = [],
  coas = [],
  savingOrderId,
  onSetPriority,
  onMarkPaid,
  savingPaymentId,
  initialFilter = "active",
}: Props) {
  const [filter, setFilter] = useState<OrdersFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("priority");
  const statsByOrder = useMemo(() => {
    const map = new Map<string, OrderQueueStats>();
    const coasBySample = new Map<string, COA[]>();
    for (const coa of coas)
      if (coa.sample_id)
        coasBySample.set(coa.sample_id, [
          ...(coasBySample.get(coa.sample_id) || []),
          coa,
        ]);
    for (const sample of samples) {
      const stats = map.get(sample.order_id) ?? {
        sampleCount: 0,
        pendingCount: 0,
        oldestPendingHours: 0,
      };
      stats.sampleCount++;
      if (
        sample.status !== "complete" &&
        !hasIssuedCoaForSample(sample, coasBySample.get(sample.id) || [])
      ) {
        stats.pendingCount++;
        stats.oldestPendingHours = Math.max(
          stats.oldestPendingHours,
          Math.max(0, (Date.now() - Date.parse(sample.created_at)) / 3600000),
        );
      }
      map.set(sample.order_id, stats);
    }
    return map;
  }, [samples, coas]);
  function matches(o: Order, f: OrdersFilter) {
    if (f === "active")
      return o.status !== "complete" && o.status !== "cancelled";
    if (f === "unpaid")
      return normalizePaymentStatus(o.payment_status) === "unpaid";
    if (f === "awaiting_sample") return o.status === "awaiting_sample";
    if (f === "overdue") return isOverdue(o);
    if (f === "urgent") return orderLabPriority(o) === "urgent";
    if (f === "rush") return o.rush_processing;
    return true;
  }
  const filtered = orders
    .filter(
      (o) =>
        matches(o, filter) &&
        `${o.order_number} ${o.company_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "newest")
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      if (sort === "oldest")
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      return (
        prioritySortScore(a) - prioritySortScore(b) ||
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        Date.parse(a.created_at) - Date.parse(b.created_at)
      );
    });
  const aging = orders
    .filter((o) => matches(o, "active"))
    .map((order) => ({ order, stats: statsByOrder.get(order.id) }))
    .filter(
      (x): x is { order: Order; stats: OrderQueueStats } =>
        !!x.stats &&
        x.stats.pendingCount > 0 &&
        x.stats.oldestPendingHours >= 48,
    )
    .sort((a, b) => b.stats.oldestPendingHours - a.stats.oldestPendingHours)
    .slice(0, 5);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  return (
    <div>
      {aging.length > 0 && (
        <details className="admin-aging-summary">
          <summary>
            {aging.length} oldest orders need priority review · open samples
            older than 48 hours
          </summary>
          {aging.map(({ order, stats }) => (
            <div className="admin-aging-row" key={order.id}>
              <div>
                <Link
                  className="admin-order-id"
                  to={`/admin/orders/${order.id}`}
                >
                  {order.order_number} · {order.company_name}
                </Link>
                <span className="admin-cell-sub">
                  {stats.pendingCount} pending · oldest{" "}
                  {formatAgeHours(stats.oldestPendingHours)}
                </span>
              </div>
              <button
                className="admin-button"
                disabled={
                  savingOrderId === order.id ||
                  orderLabPriority(order) === "high"
                }
                onClick={() => onSetPriority(order.id, "high")}
              >
                Set high
              </button>
              <button
                className="admin-button"
                disabled={
                  savingOrderId === order.id ||
                  orderLabPriority(order) === "urgent"
                }
                onClick={() => onSetPriority(order.id, "urgent")}
              >
                Set urgent
              </button>
            </div>
          ))}
        </details>
      )}
      <section className="admin-surface" aria-label="Order management">
        <div className="admin-order-controls">
          <div className="admin-tabs" aria-label="Order filters">
            {ORDER_FILTERS.map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                className={filter === f.id ? "is-active" : ""}
                onClick={() => {
                  setFilter(f.id);
                  setPage(0);
                }}
              >
                {f.label}
                <span>{orders.filter((o) => matches(o, f.id)).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={16} />
            <span className="sr-only">Search orders</span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search order number or company"
            />
          </label>
          <label className="admin-field">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="priority">Priority & age</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order / client</th>
                <th>Status / samples</th>
                <th>Priority</th>
                <th>Payment</th>
                <th>Estimated ready</th>
                <th>Total / placed</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(currentPage * 25, currentPage * 25 + 25)
                .map((order) => {
                  const priority = orderLabPriority(order),
                    stats = statsByOrder.get(order.id),
                    payment = normalizePaymentStatus(order.payment_status),
                    paid = payment === "paid" || payment === "waived",
                    eta = resolveEtaAt(order),
                    overdue = isOverdue(order);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link
                          className="admin-order-id"
                          to={`/admin/orders/${order.id}`}
                        >
                          {order.order_number}
                        </Link>
                        <span className="admin-cell-sub">
                          {order.company_name || "Company not provided"}
                        </span>
                      </td>
                      <td>
                        <span className="admin-status">
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <span className="admin-cell-sub">
                          {stats?.sampleCount ?? 0} samples ·{" "}
                          {stats?.pendingCount ?? 0} pending
                        </span>
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          aria-label={`Priority for ${order.order_number}`}
                          value={normalizeLabPriority(order.lab_priority)}
                          disabled={savingOrderId === order.id}
                          onChange={(e) =>
                            onSetPriority(
                              order.id,
                              e.target.value as LabPriority,
                            )
                          }
                        >
                          {LAB_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {LAB_PRIORITY_LABELS[p]}
                            </option>
                          ))}
                        </select>
                        {order.rush_processing && (
                          <span className="admin-cell-sub">
                            Rush · {LAB_PRIORITY_LABELS[priority]} minimum
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            paid ? "admin-status" : "admin-priority is-high"
                          }
                        >
                          {PAYMENT_STATUS_LABELS[payment]}
                        </span>
                        {!paid && onMarkPaid && (
                          <button
                            className="admin-text-link admin-cell-sub"
                            disabled={savingPaymentId === order.id}
                            onClick={() => onMarkPaid(order.id)}
                          >
                            {savingPaymentId === order.id
                              ? "Saving…"
                              : "Mark paid"}
                          </button>
                        )}
                      </td>
                      <td>
                        <span className={overdue ? "admin-danger" : ""}>
                          {eta
                            ? new Date(eta).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Not set"}
                        </span>
                        {overdue ? (
                          <span className="admin-cell-sub admin-danger">
                            Overdue
                          </span>
                        ) : (
                          eta && (
                            <span className="admin-cell-sub">
                              {new Date(eta).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )
                        )}
                      </td>
                      <td>
                        <strong>
                          $
                          {(order.total ?? 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                        <span className="admin-cell-sub">
                          {formatDateTime(order.created_at)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="admin-row-open"
                          aria-label={`Open ${order.order_number}`}
                          to={`/admin/orders/${order.id}`}
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
        {!filtered.length && (
          <div className="admin-empty">
            <h3>No orders found</h3>
            <p>
              {search
                ? "Try a different order number or company."
                : "Orders matching this filter will appear here."}
            </p>
            <button
              className="admin-button"
              onClick={() => {
                setSearch("");
                setFilter("all");
                setPage(0);
              }}
            >
              View all orders
            </button>
          </div>
        )}
        <div className="admin-table-footer">
          <span>
            {filtered.length
              ? `${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)}`
              : "0"}{" "}
            of {filtered.length} orders
          </span>
          <div className="admin-pagination">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>Page {currentPage + 1}</span>
            <button
              disabled={(currentPage + 1) * 25 >= filtered.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
