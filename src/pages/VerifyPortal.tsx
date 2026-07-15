import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Shield, Building2, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, XCircle, Clock, AlertCircle, Globe, ClipboardCheck, Library,
  MessageCircle, FlaskConical,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COA, Company } from '../lib/types';
import { formatDate } from '../lib/utils';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import {
  COA_WORKFLOW_LABELS, CoaWorkflowStage, buildWorkflowStagePatch, coaWorkflowStage,
} from '../lib/coaWorkflow';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';
import StaffHeader from '../components/layout/StaffHeader';

type CompanyProfile = {
  name: string;
  logo?: string;
  website?: string;
  coas: COA[];
};

type PortalTab = 'pipeline' | 'library';

const STAGE_BADGE_STYLES: Record<CoaWorkflowStage, string> = {
  awaiting_info: 'bg-amber-100 text-amber-800 border-amber-200',
  testing_in_progress: 'bg-sky-100 text-sky-800 border-sky-200',
  issued: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  pending_review: 'bg-violet-100 text-violet-800 border-violet-200',
  verified: 'bg-brand-100 text-brand-800 border-brand-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function StageIcon({ stage }: { stage: CoaWorkflowStage }) {
  switch (stage) {
    case 'awaiting_info': return <MessageCircle size={11} />;
    case 'testing_in_progress': return <Clock size={11} />;
    case 'pending_review': return <Shield size={11} />;
    case 'verified': return <Shield size={11} />;
    case 'published': return <Globe size={11} />;
    default: return <FlaskConical size={11} />;
  }
}

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  return <span className="badge-pending"><Clock size={10} /> Pending</span>;
}

function normalizeCompanyName(name: string) {
  return name.trim().toLowerCase();
}

export default function VerifyPortal() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PortalTab>('pipeline');

  const [coas, setCoas] = useState<COA[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Pipeline filters
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<CoaWorkflowStage | 'all'>('all');

  // Library
  const [companySearch, setCompanySearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [slug, setSlug] = useState('');
  const [verifyResult, setVerifyResult] = useState<COA | null | 'not_found'>(null);
  const [verifying, setVerifying] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [coaRes, coRes] = await Promise.all([
      supabase.from('coas').select(COA_LIST_COLUMNS).order('issued_at', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
    ]);
    setCoas(coaRes.data ?? []);
    setCompanies(coRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const pipelineCoas = useMemo(
    () => coas.filter(c => coaWorkflowStage(c) !== 'published'),
    [coas],
  );

  const filteredPipeline = useMemo(() => {
    const q = pipelineSearch.toLowerCase().trim();
    return pipelineCoas
      .filter(c => stageFilter === 'all' || coaWorkflowStage(c) === stageFilter)
      .filter(c => !q || [c.company_name, c.sample_name, c.display_name, c.batch_number, c.slug].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  }, [pipelineCoas, pipelineSearch, stageFilter]);

  const pipelineStageCounts = useMemo(() => {
    const counts: Record<CoaWorkflowStage, number> = {
      awaiting_info: 0,
      testing_in_progress: 0,
      issued: 0,
      pending_review: 0,
      verified: 0,
      published: 0,
    };
    for (const c of pipelineCoas) counts[coaWorkflowStage(c)] += 1;
    return counts;
  }, [pipelineCoas]);

  const publicCoas = useMemo(() => coas.filter(c => c.is_public), [coas]);

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

    for (const c of publicCoas) {
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
  }, [companies, publicCoas]);

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

  async function moveCoaToStage(coa: COA, targetStage: CoaWorkflowStage) {
    setSavingId(coa.id);
    setMsg(null);

    const patch = buildWorkflowStagePatch(coa, targetStage);
    if (targetStage === 'verified' && user?.id) {
      patch.verified_by = user.id;
    }

    const { error } = await supabase.from('coas').update(patch).eq('id', coa.id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      setSavingId(null);
      return;
    }

    setCoas(prev => prev.map(c => (c.id === coa.id ? { ...c, ...patch } as COA : c)));
    setMsg({
      type: 'success',
      text: targetStage === 'published'
        ? `${coa.display_name || coa.sample_name} is now published.`
        : `${coa.display_name || coa.sample_name} marked verified.`,
    });
    setSavingId(null);
  }

  const totalPublic = publicCoas.length;

  return (
    <div className="min-h-screen bg-neutral-100">
      <StaffHeader title="COA Verification">
        <Link to="/verify" className="hidden sm:inline text-sm text-neutral-600 hover:text-brand-700 px-3 py-2">Public tool</Link>
      </StaffHeader>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-2">
              <Shield size={24} className="text-brand-500" /> Verify Certificates
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Review COAs moving through the lab workflow, mark them verified, and publish them once QA is complete.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-atlas-border bg-white p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('pipeline')}
            className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              tab === 'pipeline' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <ClipboardCheck size={15} /> QA Pipeline
            {pipelineCoas.length > 0 && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 ${tab === 'pipeline' ? 'bg-white/20' : 'bg-neutral-200 text-neutral-600'}`}>
                {pipelineCoas.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              tab === 'library' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Library size={15} /> Public Library
          </button>
        </div>

        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        {tab === 'pipeline' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['awaiting_info', 'issued', 'pending_review', 'verified'] as CoaWorkflowStage[]).map(stage => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStageFilter(prev => (prev === stage ? 'all' : stage))}
                  className={`card p-3 text-left transition-colors ${stageFilter === stage ? 'ring-2 ring-brand-400' : ''}`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                    <StageIcon stage={stage} /> {COA_WORKFLOW_LABELS[stage]}
                  </p>
                  <p className="text-2xl font-bold text-black mt-1">{pipelineStageCounts[stage]}</p>
                </button>
              ))}
            </div>

            <div className="card p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={pipelineSearch}
                  onChange={e => setPipelineSearch(e.target.value)}
                  className="input-field pl-9"
                  placeholder="Search by company, peptide, batch, or COA ID…"
                />
              </div>
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value as CoaWorkflowStage | 'all')}
                className="input-field w-auto"
              >
                <option value="all">All stages</option>
                <option value="awaiting_info">Awaiting Client Info</option>
                <option value="testing_in_progress">Testing in Progress</option>
                <option value="issued">Issued COAs</option>
                <option value="pending_review">Pending Review</option>
                <option value="verified">Verified COAs</option>
                <option value="published">Published COAs</option>
              </select>
            </div>

            {loading ? (
              <div className="card p-10 text-center text-neutral-500">Loading pipeline…</div>
            ) : filteredPipeline.length === 0 ? (
              <div className="card py-12 text-center px-4">
                <ClipboardCheck size={28} className="mx-auto mb-2 text-neutral-300" />
                <p className="text-sm font-medium text-black">Pipeline is clear</p>
                <p className="text-xs text-neutral-500 mt-1">No COAs match the current filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredPipeline.map(coa => {
                  const stage = coaWorkflowStage(coa);
                  const saving = savingId === coa.id;
                  return (
                    <article key={coa.id} className="card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-black truncate">{coa.display_name || coa.sample_name}</p>
                          <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5 truncate">
                            <Building2 size={11} className="text-neutral-400 flex-shrink-0" /> {coa.company_name || 'Unattributed'}
                          </p>
                        </div>
                        <ResultBadge result={coa.overall_result} />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                        <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STAGE_BADGE_STYLES[stage]}`}>
                          <StageIcon stage={stage} /> {COA_WORKFLOW_LABELS[stage]}
                        </span>
                        {coa.batch_number && <span>Batch {coa.batch_number}</span>}
                        <span>{formatDate(coa.issued_at)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-atlas-border">
                        <Link
                          to={`/coa/${coa.slug}`}
                          className="btn-outline text-xs py-1.5 px-2 gap-1"
                        >
                          <ExternalLink size={12} /> View COA
                        </Link>

                        {(stage === 'issued' || stage === 'awaiting_info') && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => moveCoaToStage(coa, 'pending_review')}
                            className="btn-secondary text-xs py-1.5 px-2 gap-1 disabled:opacity-50"
                          >
                            <Shield size={12} /> {saving ? 'Saving…' : 'Send for review'}
                          </button>
                        )}

                        {stage === 'pending_review' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => moveCoaToStage(coa, 'verified')}
                            className="btn-primary text-xs py-1.5 px-2 gap-1 disabled:opacity-50"
                          >
                            <Shield size={12} /> {saving ? 'Saving…' : 'Sign off (2/2)'}
                          </button>
                        )}

                        {stage === 'verified' && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => moveCoaToStage(coa, 'published')}
                            className="btn-primary text-xs py-1.5 px-2 gap-1 disabled:opacity-50"
                          >
                            <Globe size={12} /> {saving ? 'Saving…' : 'Publish'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'library' && (
          <div className="space-y-6">
            <div className="card p-5">
              <p className="text-sm text-neutral-500 mb-3">
                Search company profiles and browse their <strong>published public</strong> COAs, or verify a single certificate ID.
              </p>
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
          </div>
        )}
      </main>
    </div>
  );
}
