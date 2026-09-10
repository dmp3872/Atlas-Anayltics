import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  applicationFields,
  applicationLabels,
  type ClientApplication,
  type ApplicationStatus,
} from "../../lib/clientApplications";
export default function AdminApplicationsPanel() {
  const [rows, setRows] = useState<ClientApplication[]>([]);
  const [selected, setSelected] = useState<ClientApplication | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("submitted");
  const [retry, setRetry] = useState(0);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    let query = supabase
      .from("client_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * 25, page * 25 + 24);
    if (filter) query = query.eq("status", filter);
    query.then(({ data, error, count }) => {
      if (!active) return;
      if (error) setError("Could not load applications. Try again.");
      else {
        setRows(data as ClientApplication[]);
        setCount(count || 0);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [page, filter, retry]);
  async function review(status: ApplicationStatus) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("client_applications")
      .update({ status, review_note: note.trim() })
      .eq("id", selected.id)
      .eq("status", "submitted")
      .eq("updated_at", selected.updated_at)
      .select("*")
      .single();
    if (error)
      setError(
        "Could not record this decision. Another administrator may have updated the application. Refresh and try again.",
      );
    else {
      setSelected(data as ClientApplication);
      setRetry((v) => v + 1);
    }
    setBusy(false);
  }
  return (
    <section>
      <div className="flex gap-3 items-center mb-5">
        <label className="text-sm">
          Status{" "}
          <select
            className="input-field ml-2 !w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
              setSelected(null);
            }}
          >
            <option value="">All applications</option>
            {Object.entries(applicationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-button" onClick={() => setRetry((v) => v + 1)}>
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700 mb-5">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading applications…</p>
      ) : (
        <>
          <div className="admin-panel overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b">
                  {["Company", "Contact", "Volume / month", "Status", ""].map(
                    (h, i) => (
                      <th className="p-4" key={i}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-4 font-medium">
                      {String(
                        row.details.company_name || "Company details pending",
                      )}
                    </td>
                    <td className="p-4">
                      {String(row.details.contact_email || "—")}
                    </td>
                    <td className="p-4">
                      {String(row.details.monthly_samples || "—")}
                    </td>
                    <td className="p-4">{applicationLabels[row.status]}</td>
                    <td className="p-4">
                      <button
                        className="underline"
                        onClick={() => {
                          setSelected(row);
                          setNote(row.review_note);
                        }}
                      >
                        Review application
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-8 text-neutral-500">
                No applications in this status.
              </p>
            )}
          </div>
          <div className="flex justify-between items-center my-5 text-sm">
            <span>
              {count} applications · Page {page + 1}
            </span>
            <div className="flex gap-4">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * 25 >= count}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      {selected && (
        <section className="admin-panel p-6" aria-label="Application review">
          <div className="flex justify-between gap-4">
            <h2 className="text-xl font-semibold">
              {String(selected.details.company_name || "Client application")}
            </h2>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
          <p className="text-sm mt-2 mb-6">
            {applicationLabels[selected.status]}
          </p>
          <dl className="grid sm:grid-cols-2 gap-5">
            {applicationFields.map(([, key, label]) => (
              <div key={key}>
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="text-sm mt-1 break-words">
                  {String(selected.details[key] || "—")}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-neutral-500">Testing services</dt>
              <dd className="text-sm mt-1">
                {Array.isArray(selected.details.testing_needs)
                  ? selected.details.testing_needs.join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
          {selected.status === "submitted" ? (
            <>
              <label className="block text-sm mt-6">
                Note to applicant
                <textarea
                  className="input-field mt-2"
                  maxLength={4000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </label>
              <p className="text-xs text-neutral-500 mt-2">
                Approval enables ordering. A note is required when requesting
                changes or declining.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  disabled={busy}
                  className="btn-primary"
                  onClick={() => void review("approved")}
                >
                  Approve & enable ordering
                </button>
                <button
                  disabled={busy || !note.trim()}
                  className="btn-secondary"
                  onClick={() => void review("changes_requested")}
                >
                  Request changes
                </button>
                <button
                  disabled={busy || !note.trim()}
                  className="btn-secondary"
                  onClick={() => void review("rejected")}
                >
                  Decline application
                </button>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm whitespace-pre-wrap">
              {selected.review_note}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
