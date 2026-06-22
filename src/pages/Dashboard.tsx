import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText, ArrowRight, CheckCircle, Clock, Package, TrendingUp } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Order } from '../lib/types';
import { formatCurrency, formatDate, ORDER_STATUS_LABELS, ORDER_STATUS_STEPS } from '../lib/utils';

function StatusPipeline({ status }: { status: string }) {
  const steps = ORDER_STATUS_STEPS.filter(s => s !== 'cancelled');
  const currentIdx = steps.indexOf(status as typeof steps[number]);
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full transition-colors ${i <= currentIdx ? 'bg-brand-500' : 'bg-slate-200'}`} />
          {i < steps.length - 1 && (
            <div className={`w-4 h-0.5 ${i < currentIdx ? 'bg-brand-500' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
      <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
        status === 'complete' ? 'bg-emerald-100 text-emerald-700' :
        status === 'in_review' ? 'bg-orange-100 text-orange-700' :
        status === 'analyzing' ? 'bg-amber-100 text-amber-700' :
        status === 'processing' ? 'bg-brand-100 text-brand-800' :
        'bg-slate-100 text-slate-600'
      }`}>
        {ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS]}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [coaCount, setCoaCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('coas').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]).then(([ordersRes, coasRes]) => {
      if (ordersRes.data) setOrders(ordersRes.data);
      setCoaCount(coasRes.count ?? 0);
      setLoading(false);
    });
  }, [user]);

  const activeOrders = orders.filter(o => o.status !== 'complete' && o.status !== 'cancelled');
  const completedOrders = orders.filter(o => o.status === 'complete');
  const totalSpent = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Good morning, {firstName}</h1>
          <p className="text-slate-500 mt-1">Here's your AccuMark account overview.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Orders', value: activeOrders.length, icon: Package, color: 'text-brand-700 bg-brand-50' },
            { label: 'Completed Orders', value: completedOrders.length, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'My COAs', value: coaCount, icon: FileText, color: 'text-brand-600 bg-brand-50' },
            { label: 'Total Spent', value: formatCurrency(totalSpent), icon: TrendingUp, color: 'text-slate-600 bg-slate-100' },
          ].map((stat) => (
            <div key={stat.label} className="card p-5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                <stat.icon size={18} />
              </div>
              <p className="text-xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {profile?.is_first_order && (
          <div className="card p-5 mb-6 bg-gradient-to-r from-brand-50 to-brand-100/50 border-brand-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                  <TrendingUp size={20} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">50% off your first order</p>
                  <p className="text-sm text-slate-600">First-order discount applied automatically at checkout.</p>
                </div>
              </div>
              <Link to="/order" className="btn-primary text-sm gap-1.5">
                Order Now <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Recent Orders</h2>
              <Link to="/dashboard/orders" className="text-sm text-brand-600 hover:text-brand-700 font-medium">View all</Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-10">
                <ShoppingCart size={28} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500 mb-3">No orders yet</p>
                <Link to="/order" className="btn-primary text-sm">Submit Your First Samples</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 4).map((order) => (
                  <Link key={order.id} to="/dashboard/orders" className="block p-3.5 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-900">{order.order_number}</span>
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(order.total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{formatDate(order.created_at)}</span>
                      <StatusPipeline status={order.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Quick Actions</h2>
            </div>
            <div className="space-y-2.5">
              {[
                { icon: Package, label: 'Submit New Samples', sub: 'No minimums · 50% first order', href: '/order', primary: true },
                { icon: FileText, label: 'View My COAs', sub: 'Digital certificates of analysis', href: '/dashboard/coas', primary: false },
                { icon: ShoppingCart, label: 'Order History', sub: 'All past and active orders', href: '/dashboard/orders', primary: false },
                { icon: Clock, label: 'Verify a COA', sub: 'Public verification tool', href: '/verify', primary: false },
              ].map((action) => (
                <Link key={action.href} to={action.href} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${action.primary ? 'border-brand-200 bg-brand-50 hover:bg-brand-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${action.primary ? 'bg-brand-600' : 'bg-slate-100'}`}>
                    <action.icon size={17} className={action.primary ? 'text-white' : 'text-slate-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{action.label}</p>
                    <p className="text-xs text-slate-500">{action.sub}</p>
                  </div>
                  <ArrowRight size={15} className="text-slate-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
