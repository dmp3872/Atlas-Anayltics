import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Order, OrderSample, UserProfile, UserRole, LabPriority } from '../lib/types';
import { normalizeLabPriority } from '../lib/labQueue';
import { computeCoaContentHash } from '../lib/coaVerify';
import { markOrderPaid } from '../lib/services/orderWorkflow';
import { useAuth } from '../context/AuthContext';
import AdminShell, { AdminSection } from '../components/admin/AdminShell';
import AdminCommandCenter from '../components/admin/AdminCommandCenter';
import AdminOrdersPanel from '../components/admin/AdminOrdersPanel';
import AdminCoaRegistry from '../components/admin/AdminCoaRegistry';
import AdminUsersPanel from '../components/admin/AdminUsersPanel';
import OpsDashboard from '../components/admin/OpsDashboard';
import LabManagerDashboard from '../components/admin/LabManagerDashboard';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';

const SECTION_META: Record<AdminSection, { title: string; subtitle: string }> = {
  command: { title: 'Command Center', subtitle: 'Live lab status, alerts, and recent intake.' },
  lab: { title: 'Lab Manager', subtitle: 'Chemist workload, turnaround, and COA control.' },
  operations: { title: 'Lab Analytics', subtitle: 'Intake trends, test volume, and turnaround.' },
  orders: { title: 'Orders & Priority', subtitle: 'Queue control — set priority for chemists.' },
  coas: { title: 'COA Registry', subtitle: 'All certificates across every workflow stage.' },
  users: { title: 'Users & Access', subtitle: 'Manage roles and account access.' },
};

export default function Admin() {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>('command');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [u, c, o, s] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('coas').select(COA_LIST_COLUMNS).order('issued_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_samples').select('*').order('created_at', { ascending: false }),
    ]);
    if (u.data) setUsers(u.data.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
    if (c.data) setCoas(c.data);
    if (o.data) setOrders(o.data);
    if (s.data) setSamples(s.data);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_samples' }, () => { loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coas' }, () => { loadAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase.from('user_profiles').update({ role }).eq('id', id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));
      setMsg({ type: 'success', text: 'Role updated.' });
    }
    setSavingId(null);
  }

  async function togglePreboarded(id: string, shippingPreboarded: boolean) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase
      .from('user_profiles')
      .update({ shipping_preboarded: shippingPreboarded })
      .eq('id', id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, shipping_preboarded: shippingPreboarded } : u)));
      setMsg({
        type: 'success',
        text: shippingPreboarded
          ? 'Client marked as RFID preboarded (UPS pickup).'
          : 'Client set to standard ship-in (no RFID plaque).',
      });
    }
    setSavingId(null);
  }

  async function setOrderPriority(orderId: string, priority: LabPriority) {
    setSavingOrderId(orderId);
    setMsg(null);
    const { error } = await supabase
      .from('orders')
      .update({ lab_priority: priority, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, lab_priority: priority } : o)));
      setMsg({ type: 'success', text: `Priority set to ${priority}.` });
    }
    setSavingOrderId(null);
  }

  async function handleMarkPaid(orderId: string, opts?: { note?: string; waived?: boolean }) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setSavingPaymentId(orderId);
    setMsg(null);
    const { error, order: updated } = await markOrderPaid(order, {
      note: opts?.note,
      waived: opts?.waived,
      changedBy: user?.id,
    });
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      if (updated) setOrders(prev => prev.map(o => (o.id === orderId ? updated : o)));
      setMsg({ type: 'success', text: opts?.waived ? 'Payment waived.' : 'Payment confirmed.' });
    }
    setSavingPaymentId(null);
  }

  async function assignSample(sampleId: string, userId: string | null) {
    const assigned_at = userId ? new Date().toISOString() : null;
    setSamples(prev => prev.map(s => (s.id === sampleId ? { ...s, assigned_to: userId, assigned_at } : s)));
    const { error } = await supabase.from('order_samples').update({ assigned_to: userId, assigned_at }).eq('id', sampleId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      loadAll();
    }
  }

  async function updateCoa(coaId: string, patch: Partial<COA>) {
    setMsg(null);
    const current = coas.find(c => c.id === coaId);
    if (!current) return;

    const merged = { ...current, ...patch };
    const fullPatch: Partial<COA> = { ...patch };

    const integrityFieldsChanged = ['sample_name', 'batch_number', 'purity_percent', 'panel_results'].some(
      key => key in patch,
    );
    if (integrityFieldsChanged) {
      fullPatch.content_hash = computeCoaContentHash({
        sample_name: merged.sample_name,
        batch_number: merged.batch_number,
        purity_percent: merged.purity_percent,
        panel_results: merged.panel_results,
      });
    }

    const { error } = await supabase.from('coas').update(fullPatch).eq('id', coaId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    const updated = { ...merged, ...fullPatch } as COA;
    setCoas(prev => prev.map(c => (c.id === coaId ? updated : c)));
    setMsg({ type: 'success', text: 'Certificate updated.' });
  }

  const normalizedOrders = useMemo(
    () => orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) })),
    [orders],
  );

  const chemists = useMemo(
    () => users.filter(u => u.role === 'chemist' || u.role === 'admin'),
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
    >
      <div className="space-y-6">
        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        {section === 'command' && (
          <AdminCommandCenter
            samples={samples}
            orders={normalizedOrders}
            coas={coas}
            users={users}
            onNavigate={(s) => setSection(s as AdminSection)}
          />
        )}

        {section === 'lab' && (
          <LabManagerDashboard
            samples={samples}
            orders={normalizedOrders}
            coas={coas}
            chemists={chemists}
            onRefresh={loadAll}
            onAssignSample={assignSample}
          />
        )}

        {section === 'operations' && (
          <OpsDashboard samples={samples} orders={normalizedOrders} coas={coas} />
        )}

        {section === 'orders' && (
          <AdminOrdersPanel
            orders={normalizedOrders}
            samples={samples}
            coas={coas}
            savingOrderId={savingOrderId}
            onSetPriority={setOrderPriority}
            onMarkPaid={handleMarkPaid}
            savingPaymentId={savingPaymentId}
          />
        )}

        {section === 'coas' && (
          <AdminCoaRegistry coas={coas} onSave={updateCoa} />
        )}

        {section === 'users' && (
          <AdminUsersPanel
            users={users}
            loading={loading}
            savingId={savingId}
            onChangeRole={changeRole}
            onTogglePreboarded={togglePreboarded}
          />
        )}
      </div>
    </AdminShell>
  );
}
