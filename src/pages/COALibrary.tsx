import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, LayoutGrid, List, CheckCircle, XCircle, Clock, ExternalLink, Shield } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import COACard3D from '../components/coa/COACard3D';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COA } from '../lib/types';
import { formatDate } from '../lib/utils';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={11} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={11} /> Fail</span>;
  return <span className="badge-pending"><Clock size={11} /> Pending</span>;
}

export default function COALibrary() {
  const { user } = useAuth();
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('coas')
      .select(COA_LIST_COLUMNS)
      .eq('user_id', user.id)
      .order('issued_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCoas(data);
        setLoading(false);
      });
  }, [user]);

  const filtered = coas.filter(c =>
    c.sample_name.toLowerCase().includes(search.toLowerCase()) ||
    c.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.batch_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your COAs</h1>
            <p className="text-slate-500 text-sm mt-0.5">{coas.length} certificate{coas.length !== 1 ? 's' : ''} of analysis</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded-md transition-colors ${view === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              aria-label="Grid view"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              aria-label="List view"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by sample name, batch, or COA ID..."
            className="input-field pl-10"
          />
        </div>

        {loading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-900 mb-1">
              {coas.length === 0 ? 'No COAs yet' : 'No matching COAs'}
            </p>
            <p className="text-sm text-slate-500 mb-4">
              {coas.length === 0
                ? 'COAs will appear here once your samples have been analyzed.'
                : 'Try a different search term.'}
            </p>
            {coas.length === 0 && (
              <Link to="/order-new" className="btn-primary text-sm">Submit Samples</Link>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((coa) => (
              <COACard3D key={coa.id} coa={coa} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((coa) => (
              <div key={coa.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {coa.display_name || coa.sample_name}
                      </h3>
                      <ResultBadge result={coa.overall_result} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      {coa.batch_number && <span>Batch: {coa.batch_number}</span>}
                      {coa.purity_percent && <span>Purity: {coa.purity_percent}%</span>}
                      {coa.company_name && <span>Company: {coa.company_name}</span>}
                      <span>Issued: {formatDate(coa.issued_at)}</span>
                    </div>
                    {coa.content_hash && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Shield size={11} className="text-brand-500" />
                        <span className="text-xs text-slate-500 font-mono">Hash: {coa.content_hash}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      to={`/coa/${coa.slug}`}
                      className="btn-outline text-xs px-3 py-2 gap-1.5"
                    >
                      <ExternalLink size={13} /> View COA
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'grid' && filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400 mt-8">Hover cards to tilt · hover test dots to inspect results</p>
        )}
      </div>
    </DashboardLayout>
  );
}
