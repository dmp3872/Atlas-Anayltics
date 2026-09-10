import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveUserRole } from "../lib/roles";
import { hasOrderingAccess } from "../lib/clientApplications";
export default function ClientAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const role = resolveUserRole(profile, user?.email);
  const [access, setAccess] = useState<{ id: string; allowed: boolean } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    if (!user || loading || role !== "client") return;
    hasOrderingAccess(user.id)
      .then((allowed) => {
        if (active) setAccess({ id: user.id, allowed });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [user, loading, role, retry]);
  if (loading) return <p className="p-10">Loading account…</p>;
  if (!user)
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  if (role !== "client") return <>{children}</>;
  if (error)
    return (
      <div className="p-10">
        <p>We could not check your account access.</p>
        <button
          className="btn-primary mt-4"
          onClick={() => setRetry((v) => v + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (access?.id !== user.id)
    return <p className="p-10">Checking account access…</p>;
  if (!access.allowed) return <Navigate to="/application" replace />;
  return <>{children}</>;
}
