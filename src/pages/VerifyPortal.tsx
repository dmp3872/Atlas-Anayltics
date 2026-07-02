import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Shield, Building2, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, XCircle, Clock, AlertCircle, Globe,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Company } from '../lib/types';
import { formatDate } from '../lib/utils';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import StaffHeader from '../components/layout/StaffHeader';

type CompanyProfile = {
  name: string;
  logo?: string;
  website?: string;
  coas: COA[];
};

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  return <span className="badge-pending"><Clock size={10} /> Pending</span>;
}

function normalizeCompanyName(name: string) {
  return name.trim().toLowerCase();
}

export default function VerifyPortal() {
  const [coas, setCoas] = useState<COA[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [companySearch, setCompanySearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [slug, setSlug] = useState('');
  const [verifyResult, setVerifyResult] = useState<COA | null | 'not_found'>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('coas').select('*').eq('is_public', true).order('issued_at', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
    ]).then(([coaRes, coRes]) => {
      setCoas(coaRes.data ?? []);
      setCompanies(coRes.data ?? []);
      setLoading(false);
    });
  }, []);

  const companyProfiles = useMemo(() => {
    const map = new Map<string, CompanyProfile>();

    for (const co of companies) {
      const key = normalizeCompanyName(co.name);
      if (!key) continue;
      map.set(key, {
        name: co.name,
        logo: co.logo,
        website: co.website,
        coas: [],
      });
    }

    for (const c of coas) {
      const name = c.company_name?.trim() || 'Unattributed';
      const key = normalizeCompanyName(name);
      if (!map.has(key)) {
        map.set(key, { name, coas: [] });
      }
      map.get(key)!.coas.push(c);
    }

    return Array.from(map.values())
      .map(p => ({ ...p, coas: p.coas.sort((a, b) => b.issued_at.localeCompare(a.issued_at)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, coas]);

  const filteredProfiles = useMemo(() => {
    const q = companySearch.toLowerCase().trim();
    if (!q) return companyProfiles;
    return companyProfiles
      .map(p => ({
        ...p,
        coas: p.coas.filter(c =>
          [p.name, c.sample_name, c.display_name, c.batch_number, c.slug].some(v => v?.toLowerCase().includes(q)),
        ),
      }))
      .filter(p => p.name.toLowerCase().includes(q) || p.coas.length > 0);
  }, [companyProfiles, companySearch]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    const { data } = await supabase.from('coas').select('*').eq('slug', slug.trim()).eq('is_public', true).maybeSingle();
    setVerifyResult(data ?? 'not_found');
    setVerifying(false);
  }

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const totalPublic = coas.length;

  return (
    <div className="min-h-screen bg-neutral-100">
      <StaffHeader title="COA Verification">
        <Link to="/verify" className="hidden sm:inline text-sm text-neutral-600 hover:text-brand-700 px-3 py-2">Public tool</Link>
      </StaffHeader>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-2">
            <Shield size={24} className="text-brand-500" /> Verify Certificates
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Search company profiles and browse their <strong>published public</strong> COAs, or verify a single certificate ID.
          </p>
        </div>

        <div className="card p-5">
          <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input value={slug} onChange={e => setSlug(e.target.value)} className="input-field pl-10" placeholder="Enter a public COA ID to verify" />
            </div>
            <button type="submit" disabled={verifying || !slug.trim()} className="btn-primary px-6 gap-2">
              <Shield size={16} /> Verify
            </button>
          </form>

          {verifyResult === 'not_found' && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle size={15} className="flex-shrink-0 mt-0.5" /> No public certificate found for that ID.
            </div>
          )}
          {verifyResult && verifyResult !== 'not_found' && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle size={18} className="text-atlas-success flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-emerald-900 text-sm">Verified — {verifyResult.display_name || verifyResult.sample_name}</p>
                <p className="text-sm text-emerald-800">{verifyResult.company_name || '—'} · Batch {verifyResult.batch_number || '—'} · {formatDate(verifyResult.issued_at)}</p>
                <p className="text-xs text-emerald-700 mt-1 capitalize">Integrity: {verifyCoaIntegrity(verifyResult)}</p>
                <Link to={`/coa/${verifyResult.slug}`} className="btn-primary text-xs gap-1.5 mt-3 inline-flex"><ExternalLink size={13} /> View Full COA</Link>
              </div>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-atlas-border bg-neutral-50">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="font-bold text-black flex items-center gap-2">
                  <Building2 size={18} className="text-brand-600" /> Companies
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">{companyProfiles.length} profiles · {totalPublic} public COA{totalPublic === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={companySearch}
                onChange={e => setCompanySearch(e.target.value)}
                className="input-field pl-9"
                placeholder="Search by company name, peptide, batch, or COA ID…"
              />
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-neutral-500">Loading…</p>
          ) : filteredProfiles.length === 0 ? (
            <div className="py-12 text-center px-4">
              <AlertCircle size={28} className="mx-auto mb-2 text-neutral-300" />
              <p className="text-sm text-neutral-500">No companies or public certificates match your search.</p>
              <p className="text-xs text-neutral-400 mt-1">COAs appear here after chemist workflow: Issue → Verify → Make Public.</p>
            </div>
          ) : (
            <div className="divide-y divide-atlas-border">
              {filteredProfiles.map(profile => {
                const open = expanded.has(profile.name);
                return (
                  <div key={profile.name}>
                    <button
                      type="button"
                      onClick={() => toggle(profile.name)}
                      className="w-full flex items-center justify-between gap-3 py-4 px-5 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 text-left">
                        {profile.logo ? (
                          <img src={profile.logo} alt="" className="h-10 w-10 object-contain border border-atlas-border rounded bg-white p-0.5 shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-neutral-100 flex items-center justify-center shrink-0">
                            <Building2 size={18} className="text-neutral-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-black truncate">{profile.name}</p>
                          <p className="text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1"><Globe size={11} /> {profile.coas.length} public COA{profile.coas.length === 1 ? '' : 's'}</span>
                            {profile.website && <span className="truncate">{profile.website}</span>}
                          </p>
                        </div>
                      </div>
                      {open ? <ChevronUp size={18} className="text-neutral-400 shrink-0" /> : <ChevronDown size={18} className="text-neutral-400 shrink-0" />}
                    </button>
                    {open && (
                      <div className="pb-4 px-5 pl-[4.5rem]">
                        {profile.coas.length === 0 ? (
                          <p className="text-sm text-neutral-500 py-2">No public COAs for this company yet.</p>
                        ) : (
                          <div className="border border-atlas-border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="coa-table-header">
                                  <th className="text-left px-4 py-2">Sample</th>
                                  <th className="text-left px-4 py-2 hidden sm:table-cell">Lot</th>
                                  <th className="text-left px-4 py-2 hidden sm:table-cell">Issued</th>
                                  <th className="text-left px-4 py-2">Result</th>
                                  <th className="px-4 py-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-atlas-border">
                                {profile.coas.map(c => (
                                  <tr key={c.id} className="bg-white hover:bg-neutral-50">
                                    <td className="px-4 py-2.5">
                                      <p className="font-medium text-black">{c.display_name || c.sample_name}</p>
                                      <p className="text-[11px] font-mono text-neutral-400 sm:hidden">{c.slug.slice(0, 14)}…</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-600 hidden sm:table-cell">{c.batch_number || '—'}</td>
                                    <td className="px-4 py-2.5 text-neutral-600 hidden sm:table-cell">{formatDate(c.issued_at)}</td>
                                    <td className="px-4 py-2.5"><ResultBadge result={c.overall_result} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                      <Link to={`/coa/${c.slug}`} className="btn-outline text-xs py-1 px-2 inline-flex gap-1">
                                        <ExternalLink size={12} /> View
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
