import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  applicationFields,
  applicationLabels,
  testingServices,
  loadApplication,
  hasOrderingAccess,
  type ClientApplication as Application,
  type ApplicationDetails,
} from "../lib/clientApplications";
export default function ClientApplication() {
  const { user, profile } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [details, setDetails] = useState<ApplicationDetails>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [access, setAccess] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = user?.id;
  const userEmail = user?.email;
  useEffect(() => {
    let active = true;
    if (!userId) return;
    setLoading(true);
    setError("");
    Promise.all([loadApplication(userId), hasOrderingAccess(userId)])
      .then(([app, allowed]) => {
        if (active) {
          setApplication(app);
          setDetails(
            app?.details || {
              contact_name: profile?.full_name || "",
              contact_email: userEmail || "",
              billing_email: userEmail || "",
            },
          );
          setAccess(allowed);
        }
      })
      .catch(() => {
        if (active)
          setError("We could not load your application. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, userEmail, profile?.full_name, retry]);
  async function start() {
    if (!user) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("client_applications")
      .insert({ user_id: user.id, status: "draft", details })
      .select("*")
      .single();
    if (error) {
      setError(
        "Could not start your application. Please refresh and try again.",
      );
    } else {
      setApplication(data as Application);
    }
    setBusy(false);
  }
  async function save(submit: boolean) {
    if (!application) return;
    setBusy(true);
    setError("");
    setMessage("");
    const { data, error } = await supabase
      .from("client_applications")
      .update({ details, status: submit ? "submitted" : application.status })
      .eq("id", application.id)
      .eq("updated_at", application.updated_at)
      .select("*")
      .single();
    if (error)
      setError(
        "Could not save. Check the required fields or refresh if this application was updated elsewhere.",
      );
    else {
      setApplication(data as Application);
      setMessage(
        submit
          ? "Your application has been sent to the lab for review."
          : "Draft saved.",
      );
    }
    setBusy(false);
  }
  const editable =
    application && ["draft", "changes_requested"].includes(application.status);
  return (
    <main className="public-page">
      <div className="public-container" style={{ maxWidth: 920 }}>
        <p className="public-kicker">Client onboarding</p>
        <h1>
          {application
            ? applicationLabels[application.status]
            : "Your partnership with Atlas starts here."}
        </h1>
        {loading ? (
          <p>Loading application…</p>
        ) : (
          <>
            {error && (
              <div role="alert" className="public-message">
                {error}{" "}
                <button
                  onClick={() => setRetry((v) => v + 1)}
                  className="underline"
                >
                  Reload
                </button>
              </div>
            )}
            {message && (
              <p role="status" className="public-message">
                {message}
              </p>
            )}
            {!application &&
              !error &&
              (access ? (
                <>
                  <p className="public-lead">
                    Your account already has access to ordering.
                  </p>
                  <Link className="public-button mt-6" to="/dashboard">
                    Open client portal
                  </Link>
                </>
              ) : (
                <>
                  <p className="public-lead">
                    Tell us about your company and testing needs. You can save
                    your progress and return later. An administrator will review
                    your application before you can place orders.
                  </p>
                  <button
                    className="public-button mt-8"
                    disabled={busy}
                    onClick={() => void start()}
                  >
                    {busy ? "Starting application…" : "Start application"}
                  </button>
                </>
              ))}
            {application?.review_note && (
              <div className="public-message">
                <strong>Note from the lab</strong>
                <p className="mt-2 whitespace-pre-wrap">
                  {application.review_note}
                </p>
              </div>
            )}
            {application && !editable && (
              <>
                <p className="public-lead">
                  {application.status === "submitted"
                    ? "Your information has been submitted. Ordering will become available after administrator approval."
                    : application.status === "approved"
                      ? "You can now submit samples and manage your orders."
                      : "Please contact the lab if you have questions about your application."}
                </p>
                {application.status === "approved" ? (
                  <Link className="public-button mt-6" to="/dashboard">
                    Open client portal
                  </Link>
                ) : (
                  <button
                    className="public-button public-button-secondary mt-6"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    Refresh application status
                  </button>
                )}
              </>
            )}
            {editable && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(true);
                }}
                className="mt-8"
              >
                <p className="public-lead mb-6">
                  Complete the fields below. Fields marked * are required for
                  review.
                </p>
                {[...new Set(applicationFields.map((f) => f[0]))].map(
                  (group) => (
                    <section className="public-surface mb-6" key={group}>
                      <h2 className="text-xl mb-6">{group}</h2>
                      <div className="public-form-grid">
                        {applicationFields
                          .filter((f) => f[0] === group)
                          .map(([, key, label, type, required]) => (
                            <label className="public-field" key={key}>
                              <span>
                                {label}
                                {required ? " *" : ""}
                              </span>
                              <input
                                type={type}
                                required={required}
                                min={type === "number" ? 1 : undefined}
                                max={type === "number" ? 9999999 : undefined}
                                step={type === "number" ? 1 : undefined}
                                maxLength={1000}
                                value={String(details[key] || "")}
                                onChange={(e) =>
                                  setDetails((d) => ({
                                    ...d,
                                    [key]: e.target.value,
                                  }))
                                }
                              />
                            </label>
                          ))}
                      </div>
                      {group === "Testing requirements" && (
                        <fieldset className="mt-6">
                          <legend className="text-sm mb-3">
                            Testing services *
                          </legend>
                          {testingServices.map((service) => (
                            <label
                              key={service}
                              className="flex items-center gap-3 py-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  Array.isArray(details.testing_needs) &&
                                  details.testing_needs.includes(service)
                                }
                                onChange={(e) =>
                                  setDetails((d) => ({
                                    ...d,
                                    testing_needs: e.target.checked
                                      ? [
                                          ...(Array.isArray(d.testing_needs)
                                            ? d.testing_needs
                                            : []),
                                          service,
                                        ]
                                      : (Array.isArray(d.testing_needs)
                                          ? d.testing_needs
                                          : []
                                        ).filter((s) => s !== service),
                                  }))
                                }
                              />
                              {service}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </section>
                  ),
                )}
                <label className="flex gap-3 items-start text-sm mb-6">
                  <input
                    type="checkbox"
                    required
                    checked={details.confirmed === true}
                    onChange={(e) =>
                      setDetails((d) => ({ ...d, confirmed: e.target.checked }))
                    }
                  />
                  I confirm this information is accurate and understand that
                  orders require approval from the lab.
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="public-button public-button-secondary"
                    onClick={() => void save(false)}
                  >
                    Save draft
                  </button>
                  <button
                    disabled={
                      busy ||
                      !Array.isArray(details.testing_needs) ||
                      !details.testing_needs.length
                    }
                    className="public-button"
                  >
                    {busy ? "Saving…" : "Submit for review"}
                  </button>
                </div>
                <p className="text-xs mt-4 text-neutral-500">
                  Last saved {new Date(application.updated_at).toLocaleString()}
                  . Save your draft before leaving this page.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
