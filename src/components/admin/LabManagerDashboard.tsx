import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Download, Search } from "lucide-react";
import { COA, Order, OrderSample, UserProfile } from "../../lib/types";
import { chemistWorkloadStats } from "../../lib/labAnalytics";
import {
  buildQueueItems,
  isFullyUnassigned,
  LAB_PRIORITY_LABELS,
  type LabPriority,
} from "../../lib/labQueue";
import { downloadCsv } from "../../lib/exportCsv";
import { supabase } from "../../lib/supabase";
import { formatAgeHours } from "../../lib/adminMetrics";
interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  chemists: UserProfile[];
  onRefresh?: () => void;
  onAssignSample?: (
    sampleId: string,
    userId: string | null,
  ) => void | Promise<void>;
}
export default function LabManagerDashboard({
  samples,
  orders,
  coas,
  chemists,
  onRefresh,
  onAssignSample,
}: Props) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const stats = useMemo(
    () =>
      chemistWorkloadStats(samples, orders, coas, chemists).sort(
        (a, b) => b.assignedCount - a.assignedCount,
      ),
    [samples, orders, coas, chemists],
  );
  const queue = useMemo(
    () => buildQueueItems(samples, orders, coas, true),
    [samples, orders, coas],
  );
  const unassigned = queue.filter((i) =>
    isFullyUnassigned(i.sample, i.tests),
  ).length;
  const selectedChemist =
    stats.find((c) => c.chemistId === selected) ?? stats[0];
  const withTurnaround = stats.filter((s) => s.avgTurnaroundDays != null);
  const avg = withTurnaround.length
    ? Math.round(
        (withTurnaround.reduce(
          (sum, s) => sum + (s.avgTurnaroundDays ?? 0),
          0,
        ) /
          withTurnaround.length) *
          10,
      ) / 10
    : null;
  const assignments = (selectedChemist?.currentSamples ?? []).filter(
    ({ sample, order }) =>
      `${sample.sample_name} ${sample.display_name} ${order.order_number} ${order.company_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(assignments.length / 20) - 1),
  );
  async function handleAssign(sampleId: string, userId: string) {
    if (assigningId) return;
    setAssigningId(sampleId);
    setAssignmentError(null);
    try {
      if (onAssignSample) await onAssignSample(sampleId, userId || null);
      else {
        const { error } = await supabase
          .from("order_samples")
          .update({
            assigned_to: userId || null,
            assigned_at: userId ? new Date().toISOString() : null,
          })
          .eq("id", sampleId)
          .select("id")
          .single();
        if (error) throw error;
      }
      onRefresh?.();
    } catch (err) {
      setAssignmentError(
        err instanceof Error ? err.message : "Assignment could not be saved.",
      );
    } finally {
      setAssigningId(null);
    }
  }
  function exportWorkloadCsv() {
    downloadCsv(
      "chemist-workload.csv",
      [
        "Chemist",
        "Assigned",
        "In Progress",
        "Completed",
        "Avg Turnaround (days)",
        "Samples/Day",
      ],
      stats.map((s) => [
        s.name,
        s.assignedCount,
        s.inProgressCount,
        s.completedCount,
        s.avgTurnaroundDays ?? "",
        s.samplesPerDay,
      ]),
    );
  }
  return (
    <div className="admin-overview">
      {assignmentError && (
        <div className="aa-admin-toast is-err" role="alert">
          {assignmentError}
        </div>
      )}
      <div className="admin-metrics">
        {[
          {
            label: "Team members",
            value: chemists.length,
            detail: "Chemists and administrators",
          },
          {
            label: "Assigned samples",
            value: queue.length - unassigned,
            detail: "Unique samples with an assignee",
          },
          {
            label: "Awaiting assignment",
            value: unassigned,
            detail: "Ready for dispatch",
          },
          {
            label: "Average turnaround",
            value: avg == null ? "—" : `${avg}d`,
            detail: "Mean of team member averages",
          },
        ].map((m) => (
          <div className="admin-metric" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </div>
        ))}
      </div>
      <section className="admin-surface">
        <div className="admin-surface-heading">
          <div>
            <h2>Team workload</h2>
            <p>
              Select a team member to review and reassign their open samples.
            </p>
          </div>
          <button
            className="admin-button"
            disabled={!stats.length}
            onClick={exportWorkloadCsv}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Open samples</th>
                <th>In progress</th>
                <th>Completed</th>
                <th>Avg. turnaround</th>
                <th>Samples / day</th>
                <th>Assignments</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((c) => (
                <tr
                  key={c.chemistId}
                  className={
                    selectedChemist?.chemistId === c.chemistId
                      ? "admin-selected-row"
                      : ""
                  }
                >
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.assignedCount}</td>
                  <td>{c.inProgressCount}</td>
                  <td>{c.completedCount}</td>
                  <td>
                    {c.avgTurnaroundDays == null
                      ? "—"
                      : `${c.avgTurnaroundDays}d`}
                  </td>
                  <td>{c.samplesPerDay}</td>
                  <td>
                    <button
                      aria-pressed={selectedChemist?.chemistId === c.chemistId}
                      className="admin-text-link"
                      onClick={() => {
                        setSelected(c.chemistId);
                        setPage(0);
                        setSearch("");
                      }}
                    >
                      View assignments <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!stats.length && (
          <div className="admin-empty">
            <h3>No team members yet</h3>
            <p>Add chemists in Team & access to get started.</p>
          </div>
        )}
      </section>
      {selectedChemist && (
        <section className="admin-surface">
          <div className="admin-surface-heading">
            <div>
              <h2>{selectedChemist.name} · assignments</h2>
              <p>
                Change the sample lead here. Per-test assignments remain
                available in the chemist console.
              </p>
            </div>
            <Link className="admin-text-link" to="/lab?tab=queue">
              Testing queue <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="admin-toolbar">
            <label className="admin-search">
              <Search size={16} />
              <span className="sr-only">Search assignments</span>
              <input
                value={search}
                placeholder="Search sample, order or company"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sample / order</th>
                  <th>Client</th>
                  <th>Priority</th>
                  <th>Age</th>
                  <th>Sample lead</th>
                </tr>
              </thead>
              <tbody>
                {assignments
                  .slice(currentPage * 20, currentPage * 20 + 20)
                  .map(({ sample, order, priority, ageHours }) => (
                    <tr key={sample.id}>
                      <td>
                        <strong>
                          {sample.display_name || sample.sample_name}
                        </strong>
                        <Link
                          className="admin-cell-sub admin-text-link"
                          to={`/admin/orders/${order.id}`}
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td>{order.company_name || "—"}</td>
                      <td>
                        <span className={`admin-priority is-${priority}`}>
                          <i />
                          {LAB_PRIORITY_LABELS[priority as LabPriority]}
                        </span>
                      </td>
                      <td className={ageHours >= 48 ? "admin-danger" : ""}>
                        {formatAgeHours(ageHours)}
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          aria-label={`Sample lead for ${sample.display_name || sample.sample_name}, ${order.order_number}`}
                          value={sample.assigned_to ?? ""}
                          disabled={!!assigningId}
                          onChange={(e) =>
                            void handleAssign(sample.id, e.target.value)
                          }
                        >
                          <option value="">Unassigned lead</option>
                          {chemists.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.full_name || "Chemist"}
                            </option>
                          ))}
                        </select>
                        {sample.assigned_to !== selectedChemist.chemistId && (
                          <span className="admin-cell-sub">
                            Assigned to this chemist by test
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!assignments.length && (
            <div className="admin-empty">
              <h3>{search ? "No matching samples" : "No open assignments"}</h3>
              <p>
                {search
                  ? "Try another sample or order number."
                  : "This team member is ready for new work."}
              </p>
            </div>
          )}
          <div className="admin-table-footer">
            <span>
              {assignments.length
                ? `${currentPage * 20 + 1}–${Math.min((currentPage + 1) * 20, assignments.length)}`
                : "0"}{" "}
              of {assignments.length} assignments
            </span>
            <div className="admin-pagination">
              <button
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span>Page {currentPage + 1}</span>
              <button
                disabled={(currentPage + 1) * 20 >= assignments.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
