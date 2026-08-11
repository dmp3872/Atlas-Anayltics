import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Shield, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA } from '../lib/types';
import { formatDate } from '../lib/utils';
import ResultBadge from '../components/ui/ResultBadge';
import EmptyState from '../components/ui/EmptyState';

export default function PublicLibrary() {
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('coas')
      .select('id, slug, sample_name, display_name, company_name, batch_number, purity_percent, overall_result, issued_at')
      .eq('is_public', true)
      .order('issued_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setCoas(data as COA[]);
        setLoading(false);
      });
  }, []);

  const filtered = coas.filter(c =>
    c.sample_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.batch_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
      <div className="min-h-screen bg-neutral-50">
        <div className="coa-header-bar">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <h1 className="text-3xl font-bold text-white mb-2">Public COA Library</h1>
            <p className="text-neutral-400 text-base mb-6">Browse all publicly available AccuMark certificates of analysis.</p>
            <div className="relative max-w-xl">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by sample, company, batch number..."
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-neutral-500">
              {loading ? 'Loading...' : `${filtered.length} certificate${filtered.length !== 1 ? 's' : ''}`}
            </p>
            <Link to="/verify" className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700">
              <Shield size={14} /> Verify a specific COA
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => <div key={i} className="h-36 bg-neutral-100 rounded-lg animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No certificates found"
              description={coas.length === 0 ? 'The public library is currently empty.' : 'Try adjusting your search.'}
              actionLabel="Verify a COA"
              actionTo="/verify"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((coa) => (
                <Link key={coa.id} to={`/coa/${coa.slug}`} className="card p-5 hover:shadow-md transition-shadow block group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                      <FileText size={16} className="text-brand-600" />
                    </div>
                    <ResultBadge result={coa.overall_result} />
                  </div>
                  <h3 className="font-semibold text-black mb-1 truncate">{coa.display_name || coa.sample_name}</h3>
                  {coa.company_name && <p className="text-xs text-neutral-500 mb-2 truncate">{coa.company_name}</p>}
                  <div className="flex items-center justify-between mt-3 text-xs text-neutral-500">
                    <div className="flex items-center gap-3">
                      {coa.purity_percent && <span className="font-semibold text-neutral-700">{coa.purity_percent}% purity</span>}
                      <span>{formatDate(coa.issued_at)}</span>
                    </div>
                    <ExternalLink size={12} className="text-brand-500 group-hover:text-brand-600" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
