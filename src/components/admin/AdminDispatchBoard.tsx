import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Search } from "lucide-react";
import { COA, Order, OrderSample, UserProfile } from "../../lib/types";
import {
  buildQueueItems,
  isFullyUnassigned,
  LAB_PRIORITY_LABELS,
} from "../../lib/labQueue";
import { chemistWorkloadStats } from "../../lib/labAnalytics";
import { formatAgeHours } from "../../lib/adminMetrics";
interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  chemists: UserProfile[];
  onAssignSample: (
    sampleId: string,
    userId: string | null,
  ) => void | Promise<void>;
}
export default function AdminDispatchBoard({
  samples,
  orders,
  coas,
  chemists,
  onAssignSample,
}: Props) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workload = useMemo(
    () => chemistWorkloadStats(samples, orders, coas, chemists),
    [samples, orders, coas, chemists],
  );
  const loadByChemist = useMemo(
    () => new Map(workload.map((w) => [w.chemistId, w.assignedCount])),
    [workload],
  );
  const rankedChemists = useMemo(
    () =>
      [...chemists].sort(
        (a, b) =>
          (loadByChemist.get(a.id) ?? 0) - (loadByChemist.get(b.id) ?? 0),
      ),
    [chemists, loadByChemist],
  );
  const unassigned = useMemo(
    () =>
      buildQueueItems(samples, orders, coas, true).filter((item) =>
        isFullyUnassigned(item.sample, item.tests),
      ),
    [samples, orders, coas],
  );
  const filtered = unassigned.filter(
    (item) =>
      (priority === "all" || item.priority === priority) &&
      `${item.sample.display_name} ${item.sample.sample_name} ${item.order.order_number} ${item.order.company_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 20) - 1),
  );
  const lightest = rankedChemists[0];
  async function handleAssign(sampleId: string, userId: string) {
    if (assigningId) return;
    setAssigningId(sampleId);
    setError(null);
    try {
      await onAssignSample(sampleId, userId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Assignment failed. Please try again.",
      );
    } finally {
      setAssigningId(null);
    }
  }
  return (
    <div>
      {error && (
        <div className="aa-admin-toast is-err mb-4" role="alert">
          {error}
        </div>
      )}
      <div className="admin-dispatch-layout">
        <section className="admin-surface" aria-label="Unassigned samples">
          <div className="admin-surface-heading">
            <div>
              <h2>Ready for assignment</h2>
              <p>
                Paid, received samples. Priority first, then overdue and oldest
                work.
              </p>
            </div>
            <span className="admin-status">{unassigned.length} samples</span>
          </div>
          <div className="admin-toolbar">
            <label className="admin-search">
              <Search size={16} />
              <span className="sr-only">Search dispatch queue</span>
              <input
                value={search}
                placeholder="Search sample, order or company"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="admin-field">
              Priority
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </label>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sample / order</th>
                  <th>Priority</th>
                  <th>Age</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice(currentPage * 20, currentPage * 20 + 20)
                  .map(
                    ({
                      sample,
                      order,
                      priority: level,
                      testsLabel,
                      ageHours,
                      overdue,
                    }) => (
                      <tr key={sample.id}>
                        <td>
                          <strong>
                            {sample.display_name || sample.sample_name}
                          </strong>
                          <span className="admin-cell-sub">
                            <Link
                              className="admin-order-id"
                              to={`/admin/orders/${order.id}`}
                            >
                              {order.order_number}
                            </Link>{" "}
                            · {order.company_name || "—"}
                          </span>
                          <span className="admin-cell-sub" title={testsLabel}>
                            {testsLabel}
                          </span>
                        </td>
                        <td>
                          <span className={`admin-priority is-${level}`}>
                            <i />
                            {LAB_PRIORITY_LABELS[level]}
                          </span>
                          {order.rush_processing && (
                            <span className="admin-cell-sub">Rush</span>
                          )}
                        </td>
                        <td>
                          <span className={overdue ? "admin-danger" : ""}>
                            {formatAgeHours(ageHours)}
                          </span>
                          {overdue && (
                            <span className="admin-cell-sub admin-danger">
                              Overdue
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="admin-assignment">
                            <select
                              className="admin-select"
                              aria-label={`Assign ${sample.display_name || sample.sample_name}, ${order.order_number}`}
                              value=""
                              disabled={!!assigningId || !chemists.length}
                              onChange={(e) => {
                                if (e.target.value)
                                  void handleAssign(sample.id, e.target.value);
                              }}
                            >
                              <option value="">
                                {assigningId === sample.id
                                  ? "Assigning…"
                                  : "Select chemist"}
                              </option>
                              {rankedChemists.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name || "Chemist"} ·{" "}
                                  {loadByChemist.get(c.id) ?? 0} open
                                </option>
                              ))}
                            </select>
                          </div>
                          {lightest && (
                            <button
                              className="admin-text-link mt-2"
                              title={`Assign to ${lightest.full_name || "chemist"} with ${loadByChemist.get(lightest.id) ?? 0} open samples`}
                              disabled={!!assigningId}
                              onClick={() =>
                                void handleAssign(sample.id, lightest.id)
                              }
                            >
                              Assign lightest load <ArrowUpRight size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="admin-empty">
              <CheckCircle2 size={26} />
              <h3>
                {unassigned.length
                  ? "No matching samples"
                  : "Dispatch queue is clear"}
              </h3>
              <p>
                {unassigned.length
                  ? "Try another search or priority."
                  : "Every testing-ready sample has an assignee."}
              </p>
            </div>
          )}
          <div className="admin-table-footer">
            <span>
              {filtered.length
                ? `${currentPage * 20 + 1}–${Math.min((currentPage + 1) * 20, filtered.length)}`
                : "0"}{" "}
              of {filtered.length} samples
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
                disabled={(currentPage + 1) * 20 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
        <aside className="admin-surface admin-workload">
          <div className="admin-surface-heading">
            <h2>Available team</h2>
            <span className="admin-status">{chemists.length}</span>
          </div>
          <p className="admin-rail-description">
            Sorted by open assignments. Includes sample leads and per-test
            assignments.
          </p>
          {rankedChemists.map((c) => (
            <div className="admin-workload-row" key={c.id}>
              <span className="admin-avatar">
                {(c.full_name || "C")
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <div className="admin-workload-name">
                  <span>{c.full_name || "Chemist"}</span>
                  <strong>{loadByChemist.get(c.id) ?? 0}</strong>
                </div>
                <span className="admin-cell-sub">
                  {c.role === "admin" ? "Administrator" : "Chemist"} · open
                  samples
                </span>
              </div>
            </div>
          ))}
          {!chemists.length && (
            <div className="admin-empty">
              <h3>No chemists available</h3>
              <p>Add a chemist in Team & access before assigning samples.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
