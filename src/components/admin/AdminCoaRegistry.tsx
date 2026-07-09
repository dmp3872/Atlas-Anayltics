import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { COA } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { COA_WORKFLOW_LABELS, coaWorkflowStage } from '../../lib/coaWorkflow';

interface Props {
  coas: COA[];
}

export default function AdminCoaRegistry({ coas }: Props) {
  const [filter, setFilter] = useState<'all' | 'pipeline' | 'public' | 'private'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...coas];
    if (filter === 'pipeline') list = list.filter(c => coaWorkflowStage(c) !== 'published');
    if (filter === 'public') list = list.filter(c => c.is_public);
    if (filter === 'private') list = list.filter(c => !c.is_public);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.display_name || c.sample_name).toLowerCase().includes(q)
        || (c.company_name ?? '').toLowerCase().includes(q)
        || c.slug.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
  }, [coas, filter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['all', 'pipeline', 'public', 'private'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize ${
              filter === f ? 'bg-black text-white border-black' : 'border-atlas-border'
            }`}
          >
            {f === 'pipeline' ? 'In workflow' : f}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search sample, company, or slug…"
        className="input-field max-w-md"
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 z-10">
              <tr className="coa-table-header">
                <th className="text-left px-5 py-3">Sample</th>
                <th className="text-left px-5 py-3">Company</th>
                <th className="text-left px-5 py-3">Workflow</th>
                <th className="text-left px-5 py-3">Result</th>
                <th className="text-left px-5 py-3">Issued</th>
                <th className="text-left px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No certificates found.</td></tr>
              ) : filtered.map(c => {
                const stage = coaWorkflowStage(c);
                return (
                  <tr key={c.id} className="bg-white hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-black">{c.display_name || c.sample_name}</p>
                      <p className="text-xs text-neutral-400 font-mono">{c.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-neutral-600">{c.company_name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        stage === 'published' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : stage === 'awaiting_info' ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                      }`}>
                        {COA_WORKFLOW_LABELS[stage]}
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize">{c.overall_result}</td>
                    <td className="px-5 py-3 text-xs text-neutral-500">{formatDate(c.issued_at)}</td>
                    <td className="px-5 py-3">
                      <Link to={`/coa/${c.slug}`} className="text-brand-700 hover:text-brand-800">
                        <ExternalLink size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
