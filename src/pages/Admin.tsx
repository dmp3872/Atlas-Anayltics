import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  COA,
  Order,
  OrderSample,
  UserProfile,
  UserRole,
  LabPriority,
} from "../lib/types";
import { normalizeLabPriority } from "../lib/labQueue";
import { computeCoaContentHash } from "../lib/coaVerify";
import {
  logOrderStatusChange,
  markOrderPaid,
} from "../lib/services/orderWorkflow";
import { useAuth } from "../context/AuthContext";
import AdminShell, { AdminSection } from "../components/admin/AdminShell";
import AdminCommandCenter from "../components/admin/AdminCommandCenter";
import AdminOrdersPanel from "../components/admin/AdminOrdersPanel";
import { ORDER_FILTERS, type OrdersFilter } from "../lib/adminOrderFilters";
import AdminCoaRegistry from "../components/admin/AdminCoaRegistry";
import AdminUsersPanel from "../components/admin/AdminUsersPanel";
import AdminDispatchBoard from "../components/admin/AdminDispatchBoard";
import AdminClientsPanel from "../components/admin/AdminClientsPanel";
import OpsDashboard from "../components/admin/OpsDashboard";
import LabManagerDashboard from "../components/admin/LabManagerDashboard";
import RdFolderPanel from "../components/lab/RdFolderPanel";
import AdminLiveChatInbox from "../components/admin/AdminLiveChatInbox";
import { COA_LIST_COLUMNS } from "../lib/coaSelect";

const SECTION_META: Record<AdminSection, { title: string; subtitle: string }> =
  {
    command: {
      title: "Laboratory overview",
      subtitle:
        "A clear view of your orders, team, and work that needs attention.",
    },
    dispatch: {
      title: "Dispatch queue",
      subtitle:
        "Route testing-ready samples to the right chemist, in the right order.",
    },
    lab: {
      title: "Chemist workload",
      subtitle: "Balance assignments and resolve aging work across your team.",
    },
    rd: {
      title: "R&D Folder",
      subtitle:
        "Purity & Quantity verification — complete without issuing a COA.",
    },
    livechat: {
      title: "Live Chat",
      subtitle:
        "Client messages hit admin first. Forward to chemists; only admin replies to clients.",
    },
    operations: {
      title: "Lab Analytics",
      subtitle: "Intake trends, test volume, and turnaround.",
    },
    orders: {
      title: "Orders",
      subtitle:
        "Manage incoming work, priorities, payments, and estimated ready dates.",
    },
    coas: {
      title: "COA Registry",
      subtitle: "Overrides, stage resets, and audit notes.",
    },
    clients: {
      title: "Clients",
      subtitle: "Research companies, account activity, and order history.",
    },
    users: {
      title: "Team & access",
      subtitle: "Manage roles, account access, and client capabilities.",
    },
  };

export default function Admin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedSection = params.get("section");
  const section: AdminSection =
    requestedSection &&
    Object.prototype.hasOwnProperty.call(SECTION_META, requestedSection)
      ? (requestedSection as AdminSection)
      : "command";
  const orderFilter =
    ORDER_FILTERS.find((f) => f.id === params.get("filter"))?.id ?? "active";
  function setSection(next: AdminSection, filter?: string) {
    setMsg(null);
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set("section", next);
      if (filter) updated.set("filter", filter);
      else updated.delete("filter");
      return updated;
    });
  }
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);
  const refreshPending = useRef(false);
  const mounted = useRef(true);

  const loadAll = useCallback(async () => {
    if (inFlight.current) {
      refreshPending.current = true;
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      // Explicit ranges prevent the API row limit from silently truncating worklists.
      // Keep one consistent UI snapshot: never mix successful and failed datasets.
      const fetchRows = async (table: string, columns = "*") => {
        const rows: unknown[] = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from(table)
            .select(columns)
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw new Error(`${table}: ${error.message}`);
          const page = data ?? [];
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      };
      do {
        refreshPending.current = false;
        const [u, c, o, s] = await Promise.all([
          fetchRows("user_profiles"),
          fetchRows("coas", COA_LIST_COLUMNS),
          fetchRows("orders"),
          fetchRows("order_samples"),
        ]);
        if (!mounted.current) break;
        setUsers(
          (u as UserProfile[]).sort((a, b) =>
            (a.full_name || "").localeCompare(b.full_name || ""),
          ),
        );
        setCoas(
          (c as COA[]).sort(
            (a, b) =>
              Math.max(
                Date.parse(b.created_at) || 0,
                Date.parse(b.issued_at) || 0,
              ) -
              Math.max(
                Date.parse(a.created_at) || 0,
                Date.parse(a.issued_at) || 0,
              ),
          ),
        );
        setOrders(
          (o as Order[]).sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          ),
        );
        setSamples(
          (s as OrderSample[]).sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          ),
        );
        setLoaded(true);
        setLoadError(null);
        setUpdatedAt(new Date());
      } while (refreshPending.current && mounted.current);
    } catch (err) {
      if (mounted.current)
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load laboratory data.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadAll();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void loadAll();
      }, 600);
    };
    const channel = supabase
      .channel("admin-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_samples" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coas" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_profiles" },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase
      .from("user_profiles")
      .update({ role })
      .eq("id", id);
    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      setMsg({ type: "success", text: "Role updated." });
    }
    setSavingId(null);
  }

  async function togglePreboarded(id: string, shippingPreboarded: boolean) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase
      .from("user_profiles")
      .update({ shipping_preboarded: shippingPreboarded })
      .eq("id", id);
    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, shipping_preboarded: shippingPreboarded } : u,
        ),
      );
      setMsg({
        type: "success",
        text: shippingPreboarded
          ? "Client marked as RFID preboarded (UPS pickup)."
          : "Client set to standard ship-in (no RFID plaque).",
      });
    }
    setSavingId(null);
  }

  async function toggleRdSubmissions(id: string, enabled: boolean) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase
      .from("user_profiles")
      .update({ rd_submissions_enabled: enabled })
      .eq("id", id);
    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, rd_submissions_enabled: enabled } : u,
        ),
      );
      setMsg({
        type: "success",
        text: enabled
          ? "R&D submissions enabled for this account."
          : "R&D submissions disabled for this account.",
      });
    }
    setSavingId(null);
  }

  async function setOrderPriority(orderId: string, priority: LabPriority) {
    if (savingOrderId) return;
    setSavingOrderId(orderId);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          lab_priority: priority,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select("id, lab_priority, updated_at")
        .single();
      if (error || !data)
        throw new Error(error?.message || "Priority could not be saved.");
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...data } : o)),
      );
      setMsg({ type: "success", text: `Priority set to ${priority}.` });
    } catch (err) {
      setMsg({
        type: "error",
        text:
          err instanceof Error ? err.message : "Priority could not be saved.",
      });
    } finally {
      setSavingOrderId(null);
    }
  }

  async function handleMarkPaid(
    orderId: string,
    opts?: { note?: string; waived?: boolean },
  ) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setSavingPaymentId(orderId);
    setMsg(null);
    const { error, order: updated } = await markOrderPaid(order, {
      note: opts?.note,
      waived: opts?.waived,
      changedBy: user?.id,
    });
    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      if (updated)
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      setMsg({
        type: "success",
        text: opts?.waived ? "Payment waived." : "Payment confirmed.",
      });
    }
    setSavingPaymentId(null);
  }

  async function assignSample(sampleId: string, userId: string | null) {
    const assigned_at = userId ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("order_samples")
      .update({ assigned_to: userId, assigned_at })
      .eq("id", sampleId)
      .select("id, assigned_to, assigned_at")
      .single();
    if (error || !data)
      throw new Error(
        error?.message ||
          "The assignment could not be saved. Refresh and try again.",
      );
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, ...data } : s)),
    );
    setMsg({
      type: "success",
      text: userId ? "Sample assigned." : "Sample assignment cleared.",
    });
  }

  async function updateCoa(
    coaId: string,
    patch: Partial<COA>,
    auditNote?: string,
  ) {
    setMsg(null);
    const current = coas.find((c) => c.id === coaId);
    if (!current) return;

    const merged = { ...current, ...patch };
    const fullPatch: Partial<COA> = { ...patch };

    const integrityFieldsChanged = [
      "sample_name",
      "batch_number",
      "purity_percent",
      "panel_results",
    ].some((key) => key in patch);
    if (integrityFieldsChanged) {
      fullPatch.content_hash = computeCoaContentHash({
        sample_name: merged.sample_name,
        batch_number: merged.batch_number,
        purity_percent: merged.purity_percent,
        panel_results: merged.panel_results,
      });
    }

    const { error } = await supabase
      .from("coas")
      .update(fullPatch)
      .eq("id", coaId);
    if (error) {
      setMsg({ type: "error", text: error.message });
      return;
    }
    const updated = { ...merged, ...fullPatch } as COA;
    setCoas((prev) => prev.map((c) => (c.id === coaId ? updated : c)));

    if (current.order_id) {
      const stageNote =
        typeof patch.coa_workflow_stage === "string"
          ? `coa:${patch.coa_workflow_stage}`
          : "coa:override";
      await logOrderStatusChange(current.order_id, stageNote, {
        sampleId: current.sample_id,
        note: auditNote || "Admin COA override",
        changedBy: user?.id,
      });
    }

    setMsg({
      type: "success",
      text: auditNote
        ? "Certificate updated (audit logged)."
        : "Certificate updated.",
    });
  }

  const normalizedOrders = useMemo(
    () =>
      orders.map((o) => ({
        ...o,
        lab_priority: normalizeLabPriority(o.lab_priority),
      })),
    [orders],
  );

  const chemists = useMemo(
    () => users.filter((u) => u.role === "chemist" || u.role === "admin"),
    [users],
  );

  const meta = SECTION_META[section];

  return (
    <AdminShell
      section={section}
      onSection={setSection}
      title={meta.title}
      subtitle={meta.subtitle}
      onRefresh={loadAll}
      refreshing={loading}
      updatedAt={updatedAt}
    >
      <div className="space-y-6">
        {loadError && (
          <div className="aa-admin-toast is-err" role="alert">
            <AlertCircle size={17} />
            <div>
              <strong>
                {loaded
                  ? "Refresh failed. Showing the last successful update."
                  : "Laboratory data could not be loaded."}
              </strong>
              <p>{loadError}</p>
              <button
                className="admin-text-link"
                disabled={loading}
                onClick={() => void loadAll()}
              >
                Try again
              </button>
            </div>
          </div>
        )}
        {!loaded && loading && (
          <div className="admin-loading" role="status">
            Loading laboratory workspace…
          </div>
        )}
        {loaded && (
          <>
            {msg && (
              <div
                className={`aa-admin-toast ${msg.type === "success" ? "is-ok" : "is-err"}`}
                role="status"
              >
                {msg.type === "success" ? (
                  <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                )}
                {msg.text}
              </div>
            )}

            {section === "command" && (
              <AdminCommandCenter
                samples={samples}
                orders={normalizedOrders}
                coas={coas}
                users={users}
                onNavigate={(s, filter) =>
                  setSection(s as AdminSection, filter)
                }
              />
            )}

            {section === "dispatch" && (
              <AdminDispatchBoard
                samples={samples}
                orders={normalizedOrders}
                coas={coas}
                chemists={chemists}
                onAssignSample={assignSample}
              />
            )}

            {section === "lab" && (
              <LabManagerDashboard
                samples={samples}
                orders={normalizedOrders}
                coas={coas}
                chemists={chemists}
                onRefresh={loadAll}
                onAssignSample={assignSample}
              />
            )}

            {section === "rd" && (
              <RdFolderPanel
                samples={samples}
                orders={normalizedOrders}
                clients={users}
                currentUserId={user?.id}
                onChanged={loadAll}
              />
            )}

            {section === "livechat" && (
              <AdminLiveChatInbox
                chemists={users
                  .filter((u) => u.role === "chemist")
                  .map((c) => ({
                    id: c.id,
                    name: c.full_name || c.email || "Chemist",
                  }))}
                clients={users}
                orders={normalizedOrders}
              />
            )}

            {section === "operations" && (
              <OpsDashboard
                samples={samples}
                orders={normalizedOrders}
                coas={coas}
              />
            )}

            {section === "orders" && (
              <AdminOrdersPanel
                key={orderFilter}
                initialFilter={orderFilter as OrdersFilter}
                orders={normalizedOrders}
                samples={samples}
                coas={coas}
                savingOrderId={savingOrderId}
                onSetPriority={setOrderPriority}
                onMarkPaid={handleMarkPaid}
                savingPaymentId={savingPaymentId}
              />
            )}

            {section === "coas" && (
              <AdminCoaRegistry coas={coas} onSave={updateCoa} />
            )}

            {section === "clients" && (
              <AdminClientsPanel users={users} orders={normalizedOrders} />
            )}

            {section === "users" && (
              <AdminUsersPanel
                users={users}
                loading={loading}
                savingId={savingId}
                onChangeRole={changeRole}
                onTogglePreboarded={togglePreboarded}
                onToggleRdSubmissions={toggleRdSubmissions}
              />
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
