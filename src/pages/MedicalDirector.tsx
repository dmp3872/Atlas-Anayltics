import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, CheckCircle2, ChevronRight, Clock3, FileSearch,
  Loader2, LogOut, Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COA } from '../lib/types';
import { formatDate, formatDateTime } from '../lib/utils';
import {
  COA_WORKFLOW_LABELS, CoaWorkflowStage, buildWorkflowStagePatch, coaWorkflowStage,
} from '../lib/coaWorkflow';
import { fetchAndAppendCoaUpdateLog, readCoaUpdateLog, type CoaUpdateLogEntry } from '../lib/coaUpdateLog';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import AtlasLogo from '../components/brand/AtlasLogo';
import { COA_MEDICAL_DIRECTOR } from '../lib/coaSignatories';
import { resolveUserRole, roleHome } from '../lib/roles';

type DirectorTab = 'review' | 'approve' | 'audit';

const LIST_COLS = `${COA_LIST_COLUMNS}, result_summary`;

function sampleLabel(coa: COA) {
  return coa.display_name || coa.sample_name || 'Untitled sample';
}

function ResultPill({ result }: { result?: string }) {
  if (result === 'pass') {
    return <span className="md-pill md-pill-pass">Pass</span>;
  }
  if (result === 'fail') {
    return <span className="md-pill md-pill-fail">Fail</span>;
  }
  return <span className="md-pill md-pill-pending">Pending</span>;
}

function StagePill({ stage }: { stage: CoaWorkflowStage }) {
  return <span className={`md-pill md-stage-${stage}`}>{COA_WORKFLOW_LABELS[stage]}</span>;
}

export default function MedicalDirector() {
  const { user, profile, signOut } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const [tab, setTab] = useState<DirectorTab>('review');
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [integrity, setIntegrity] = useState<{ ok: boolean; detail: string } | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('coas')
      .select(LIST_COLS)
      .order('issued_at', { ascending: false })
      .limit(400);
    if (error) {
      setToast({ type: 'err', text: error.message });
      setCoas([]);
    } else {
      setCoas((data as COA[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const reviewQueue = useMemo(() => {
    return coas.filter(c => {
      const s = coaWorkflowStage(c);
      return s === 'pending_review' || s === 'issued';
    });
  }, [coas]);

  const approveQueue = useMemo(() => {
    return coas.filter(c => {
      const s = coaWorkflowStage(c);
      return s === 'pending_review' || s === 'verified';
    });
  }, [coas]);

  const auditQueue = useMemo(() => {
    return coas.filter(c => {
      const s = coaWorkflowStage(c);
      return s === 'verified' || s === 'published';
    });
  }, [coas]);

  const activeList = tab === 'review' ? reviewQueue : tab === 'approve' ? approveQueue : auditQueue;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(c =>
      [c.company_name, c.sample_name, c.display_name, c.batch_number, c.slug, c.accession_number]
        .some(v => v?.toLowerCase().includes(q)),
    );
  }, [activeList, query]);

  const selected = useMemo(
    () => coas.find(c => c.id === selectedId) ?? filtered[0] ?? null,
    [coas, selectedId, filtered],
  );

  useEffect(() => {
    if (!selected) {
      setIntegrity(null);
      return;
    }
    const status = verifyCoaIntegrity(selected);
    if (status === 'verified') {
      setIntegrity({ ok: true, detail: 'Integrity check passed' });
    } else if (status === 'legacy') {
      setIntegrity({ ok: true, detail: 'Legacy signature on file' });
    } else if (status === 'unsigned') {
      setIntegrity({ ok: false, detail: 'No content hash on file' });
    } else {
      setIntegrity({ ok: false, detail: 'Hash mismatch — review carefully' });
    }
  }, [selected?.id, selected?.content_hash, selected?.panel_results]);

  useEffect(() => {
    if (selected && filtered.some(c => c.id === selected.id)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selected]);

  const counts = {
    review: reviewQueue.length,
    approve: approveQueue.filter(c => coaWorkflowStage(c) === 'pending_review').length,
    publish: approveQueue.filter(c => coaWorkflowStage(c) === 'verified').length,
    audit: auditQueue.length,
  };

  const auditLog: CoaUpdateLogEntry[] = selected
    ? readCoaUpdateLog((selected.result_summary ?? {}) as Record<string, unknown>)
    : [];

  async function advance(coa: COA, target: 'pending_review' | 'verified' | 'published') {
    setBusyId(coa.id);
    setToast(null);
    const patch = buildWorkflowStagePatch(coa, target);
    if (target === 'verified' && user?.id) patch.verified_by = user.id;
    const note =
      target === 'published' ? `Published by ${COA_MEDICAL_DIRECTOR.shortName}`
        : target === 'verified' ? `Approved by ${COA_MEDICAL_DIRECTOR.formalName} (signatures 2/2)`
          : `Queued for ${COA_MEDICAL_DIRECTOR.shortName} review`;
    const logged = await fetchAndAppendCoaUpdateLog(coa.id, note, {
      by: COA_MEDICAL_DIRECTOR.formalName,
    });
    if (logged.error || !logged.summary) {
      setToast({ type: 'err', text: logged.error || 'Could not update the audit log.' });
      setBusyId(null);
      return;
    }
    patch.result_summary = logged.summary;
    const { error } = await supabase.from('coas').update(patch).eq('id', coa.id);
    if (error) {
      setToast({ type: 'err', text: error.message });
      setBusyId(null);
      return;
    }
    setCoas(prev => prev.map(c => (c.id === coa.id ? { ...c, ...patch } as COA : c)));
    setToast({
      type: 'ok',
      text: target === 'published'
        ? `${sampleLabel(coa)} is published.`
        : target === 'verified'
          ? `${sampleLabel(coa)} is approved.`
          : `${sampleLabel(coa)} is queued for review.`,
    });
    setBusyId(null);
  }

  const directorName = COA_MEDICAL_DIRECTOR.shortName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="md-shell">
      <div className="md-ambient" aria-hidden />

      <header className="md-topbar">
        <div className="md-topbar-inner">
          <Link to={roleHome(role)} className="md-brand">
            <AtlasLogo variant="dark" size="sm" />
            <span className="md-brand-meta">
              <span className="md-brand-kicker">Atlas Analytics</span>
              <span className="md-brand-title">{COA_MEDICAL_DIRECTOR.title}</span>
            </span>
          </Link>
          <div className="md-topbar-right">
            <span className="md-user-chip">
              {COA_MEDICAL_DIRECTOR.formalName}
            </span>
            <button type="button" className="md-icon-btn" onClick={() => signOut()} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="md-main">
        <section className="md-hero md-animate">
          <p className="md-hero-kicker">
            <Sparkles size={14} /> {COA_MEDICAL_DIRECTOR.title}
          </p>
          <h1 className="md-hero-title">{greeting}, {directorName}.</h1>
          <p className="md-hero-sub">
            Your certificate desk — review, approve, and audit COAs under your sign-off.
          </p>
        </section>

        <section className="md-stats md-animate" style={{ animationDelay: '60ms' }}>
          <div className="md-stat">
            <p className="md-stat-value">{counts.review}</p>
            <p className="md-stat-label">In review</p>
          </div>
          <div className="md-stat">
            <p className="md-stat-value">{counts.approve}</p>
            <p className="md-stat-label">Awaiting approval</p>
          </div>
          <div className="md-stat">
            <p className="md-stat-value">{counts.publish}</p>
            <p className="md-stat-label">Ready to publish</p>
          </div>
          <div className="md-stat">
            <p className="md-stat-value">{counts.audit}</p>
            <p className="md-stat-label">Audit library</p>
          </div>
        </section>

        <div className="md-segment md-animate" style={{ animationDelay: '100ms' }} role="tablist">
          {(
            [
              { id: 'review', label: 'Review', count: counts.review },
              { id: 'approve', label: 'Approve', count: counts.approve + counts.publish },
              { id: 'audit', label: 'Audit', count: counts.audit },
            ] as const
          ).map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`md-seg-btn ${tab === item.id ? 'is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className="md-seg-count">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="md-toolbar md-animate" style={{ animationDelay: '120ms' }}>
          <div className="md-search">
            <Search size={16} className="md-search-icon" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search company, sample, lot, or code…"
              className="md-search-input"
            />
          </div>
          <button type="button" className="md-ghost-btn" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Refresh
          </button>
        </div>

        {toast && (
          <div className={`md-toast ${toast.type === 'ok' ? 'is-ok' : 'is-err'}`} role="status">
            {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <FileSearch size={16} />}
            {toast.text}
          </div>
        )}

        <div className="md-workspace md-animate" style={{ animationDelay: '160ms' }}>
          <aside className="md-list-pane">
            {loading ? (
              <div className="md-empty">
                <Loader2 size={20} className="animate-spin text-neutral-400" />
                <p>Loading certificates…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="md-empty">
                <ShieldCheck size={28} className="text-neutral-300" />
                <p className="font-medium text-neutral-700">All clear</p>
                <p className="text-sm text-neutral-500">Nothing in this queue right now.</p>
              </div>
            ) : (
              <ul className="md-list">
                {filtered.map(coa => {
                  const stage = coaWorkflowStage(coa);
                  const active = selected?.id === coa.id;
                  return (
                    <li key={coa.id}>
                      <button
                        type="button"
                        className={`md-list-item ${active ? 'is-active' : ''}`}
                        onClick={() => setSelectedId(coa.id)}
                      >
                        <div className="md-list-item-top">
                          <p className="md-list-name">{sampleLabel(coa)}</p>
                          <ChevronRight size={14} className="md-list-chevron" />
                        </div>
                        <p className="md-list-meta">{coa.company_name || '—'}</p>
                        <div className="md-list-foot">
                          <StagePill stage={stage} />
                          <ResultPill result={coa.overall_result} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="md-detail-pane">
            {!selected ? (
              <div className="md-empty tall">
                <p className="text-neutral-500">Select a certificate to begin.</p>
              </div>
            ) : (
              <div className="md-detail">
                <div className="md-detail-head">
                  <div>
                    <p className="md-detail-kicker">{coaWorkflowStage(selected) === 'published' ? 'Published' : 'Certificate'}</p>
                    <h2 className="md-detail-title">{sampleLabel(selected)}</h2>
                    <p className="md-detail-sub">
                      {selected.company_name || '—'}
                      {selected.batch_number ? ` · Lot ${selected.batch_number}` : ''}
                      {selected.slug ? ` · ${selected.slug}` : ''}
                    </p>
                  </div>
                  {selected.slug ? (
                    <Link
                      to={`/coa/${selected.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="md-link-btn"
                    >
                      Open COA <ArrowUpRight size={14} />
                    </Link>
                  ) : null}
                </div>

                <div className="md-detail-grid">
                  <div className="md-kv">
                    <span>Stage</span>
                    <StagePill stage={coaWorkflowStage(selected)} />
                  </div>
                  <div className="md-kv">
                    <span>Result</span>
                    <ResultPill result={selected.overall_result} />
                  </div>
                  <div className="md-kv">
                    <span>Issued</span>
                    <strong>{selected.issued_at ? formatDate(selected.issued_at) : '—'}</strong>
                  </div>
                  <div className="md-kv">
                    <span>Integrity</span>
                    <strong className={integrity?.ok ? 'text-emerald-700' : 'text-amber-700'}>
                      {integrity ? integrity.detail : 'Checking…'}
                    </strong>
                  </div>
                </div>

                {(tab === 'review' || tab === 'approve') && (
                  <div className="md-actions">
                    {coaWorkflowStage(selected) === 'issued' && (
                      <button
                        type="button"
                        className="md-ghost-btn"
                        disabled={busyId === selected.id}
                        onClick={() => void advance(selected, 'pending_review')}
                      >
                        Queue for review
                      </button>
                    )}
                    {(coaWorkflowStage(selected) === 'pending_review' || coaWorkflowStage(selected) === 'issued') && (
                      <button
                        type="button"
                        className="md-primary"
                        disabled={busyId === selected.id}
                        onClick={() => void advance(selected, 'verified')}
                      >
                        {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        Approve as Dr. Gondi
                      </button>
                    )}
                    {coaWorkflowStage(selected) === 'verified' && (
                      <button
                        type="button"
                        className="md-primary"
                        disabled={busyId === selected.id}
                        onClick={() => void advance(selected, 'published')}
                      >
                        {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Publish to client
                      </button>
                    )}
                    {coaWorkflowStage(selected) === 'published' && (
                      <p className="md-actions-note">This certificate is live for the client.</p>
                    )}
                  </div>
                )}

                <div className="md-audit">
                  <div className="md-audit-head">
                    <FileSearch size={16} />
                    <h3>Audit trail</h3>
                  </div>
                  {auditLog.length === 0 ? (
                    <p className="md-audit-empty">No recorded changes yet.</p>
                  ) : (
                    <ol className="md-timeline">
                      {[...auditLog].reverse().map((entry, i) => (
                        <li key={`${entry.at}-${i}`}>
                          <span className="md-timeline-dot" />
                          <div>
                            <p className="md-timeline-note">{entry.note}</p>
                            <p className="md-timeline-meta">
                              <Clock3 size={11} />
                              {formatDateTime(entry.at)}
                              {entry.by ? ` · ${entry.by}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
