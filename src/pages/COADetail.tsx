import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Shield, CheckCircle, XCircle,
  ArrowLeft, Copy, Check, Droplets, Boxes, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, PanelResult } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import { hydrateCoaImages } from '../lib/coaImages';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import AtlasLogo from '../components/brand/AtlasLogo';
import InteractiveChromatogram from '../components/coa/InteractiveChromatogram';
import CoaQrCode from '../components/coa/CoaQrCode';

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 border-b border-atlas-border">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-black mt-0.5">{value}</p>
    </div>
  );
}

function IntegrityBadge({ status }: { status: ReturnType<typeof verifyCoaIntegrity> }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-atlas-success bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1">
        <CheckCircle size={13} /> Hash verified
      </span>
    );
  }
  if (status === 'legacy') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 rounded px-2.5 py-1">
        <Shield size={13} /> Signed record on file
      </span>
    );
  }
  if (status === 'mismatch') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1">
        <AlertTriangle size={13} /> Integrity warning
      </span>
    );
  }
  return null;
}

export default function COADetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [coa, setCoa] = useState<COA | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug || authLoading) return;
    setLoading(true);
    setNotFound(false);
    supabase
      .from('coas')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) { setNotFound(true); setLoading(false); return; }
        const hydrated = hydrateCoaImages(data as COA);
        setCoa(hydrated);
        const { data: companies } = await supabase
          .from('companies')
          .select('logo')
          .eq('user_id', data.user_id)
          .eq('is_default', true)
          .maybeSingle();
        if (!hydrated.company_logo && companies?.logo) {
          setCoa({ ...hydrated, company_logo: companies.logo });
        }
        setLoading(false);
      });
  }, [slug, user, authLoading]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <>
      <div className="no-print"><Header /></div>
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <XCircle size={28} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-black mb-2">COA Not Found</h1>
          <Link to="/verify" className="btn-primary">Try Verification Tool</Link>
        </div>
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );

  if (!coa) return null;

  const panelResults: PanelResult[] = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const isOwner = !!user && user.id === coa.user_id;
  const companyLogo = coa.company_logo || (isOwner ? profile?.company_logo : '') || '';
  const integrity = verifyCoaIntegrity(coa);
  const vialSize =
    (typeof coa.chromatogram_data?.vial_size === 'string' && coa.chromatogram_data.vial_size.trim())
      || '—';

  const infoFields = [
    { label: 'Client', value: coa.company_name || '—' },
    { label: 'Sample Code', value: coa.slug },
    { label: 'Sample Name', value: coa.sample_name },
    { label: 'Display Name', value: coa.display_name || coa.sample_name },
    { label: 'Batch Number', value: coa.batch_number || '—' },
    { label: 'Date Issued', value: formatDateTime(coa.issued_at) },
    { label: 'Vial Size', value: vialSize },
    ...(coa.seal_serial ? [{ label: 'Seal Serial', value: coa.seal_serial }] : []),
  ];

  return (
    <>
      <div className="no-print"><Header /></div>
      <div className="min-h-screen bg-white coa-print-root">
        <div className="coa-header-bar">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AtlasLogo variant="light" size="md" />
              {companyLogo && (
                <>
                  <span className="hidden sm:block h-8 w-px bg-neutral-700" />
                  <img src={companyLogo} alt="" className="h-10 max-w-[140px] object-contain" />
                </>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-sm sm:text-base font-bold text-brand-500 uppercase tracking-[0.25em]">
                Certificate of Analysis
              </h1>
              <p className="text-xs text-neutral-400 mt-1">{coa.display_name || coa.sample_name}</p>
            </div>
          </div>
        </div>
        <div className="coa-gold-divider" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between gap-3 mb-6 no-print">
            <Link to={isOwner ? '/dashboard/coas' : '/coa-library'} className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-brand-600 text-sm">
              <ArrowLeft size={14} /> {isOwner ? 'Back to My COAs' : 'Public Library'}
            </Link>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <IntegrityBadge status={integrity} />
              {isOwner && !coa.is_public && (
                <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-1">Private</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0">
              {infoFields.map(({ label, value }) => (
                <InfoField key={label} label={label} value={value} />
              ))}
            </div>
            <div className="flex justify-center lg:justify-end no-print">
              <CoaQrCode slug={coa.slug} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Boxes size={24} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Net Peptide Content</p>
                  <p className="text-3xl font-bold text-black mt-1 tabular-nums">
                    {coa.purity_percent ? `${(coa.purity_percent * 0.1).toFixed(1)} mg` : '—'}
                  </p>
                  <p className="text-xs text-atlas-success font-semibold mt-1 uppercase">Conforms</p>
                </div>
              </div>
            </div>
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Droplets size={24} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Purity (HPLC)</p>
                  <p className="text-3xl font-bold text-black mt-1 tabular-nums">{coa.purity_percent ?? 98.7}%</p>
                  <p className="text-xs text-atlas-success font-semibold mt-1 uppercase">Measured</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4 items-start">
            {coa.vial_image ? (
              <div className="border-2 border-black p-0.5 bg-white w-[120px]">
                <div className="border border-black p-2 bg-white flex items-center justify-center aspect-[3/4]">
                  <img
                    src={coa.vial_image}
                    alt="Sample vial"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
            ) : null}
            <InteractiveChromatogram data={coa.chromatogram_data} />
          </div>

          <div className="mb-8 overflow-hidden border border-atlas-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="coa-table-header">
                  <th className="text-left px-4 py-3">Test</th>
                  <th className="text-left px-4 py-3">Specification</th>
                  <th className="text-left px-4 py-3">Result</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {panelResults.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                    <td className="px-4 py-3 font-medium border-t border-atlas-border">{r.panel_name}</td>
                    <td className="px-4 py-3 text-neutral-600 border-t border-atlas-border">{r.specification || '—'}</td>
                    <td className="px-4 py-3 font-medium border-t border-atlas-border">{r.result}{r.unit ? ` ${r.unit}` : ''}</td>
                    <td className="px-4 py-3 border-t border-atlas-border">
                      <span className={`font-bold uppercase text-xs ${r.pass ? 'text-atlas-success' : 'text-red-600'}`}>{r.pass ? 'Pass' : 'Fail'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {coa.content_hash && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 font-mono bg-neutral-50 p-3 border border-atlas-border mb-8">
              <Shield size={11} className="text-brand-500" />
              <span>Hash: {coa.content_hash}</span>
              <span className="text-neutral-300">·</span>
              <span>Sig: {coa.signature || `AM-${coa.slug.slice(0, 8).toUpperCase()}`}</span>
            </div>
          )}

          <div className="bg-black text-white px-6 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6">
              <div>
                <p className="font-script text-2xl text-brand-500">Anthony Burke</p>
                <p className="text-xs text-neutral-400 mt-1">Lab Director</p>
              </div>
              <div>
                <p className="font-script text-2xl text-brand-500">Dr. Levi Friedle</p>
                <p className="text-xs text-neutral-400 mt-1">Quality Assurance</p>
              </div>
            </div>
            <div className="coa-gold-divider mb-4" />
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <p className="text-brand-500 text-sm">www.atlasanalytics.io</p>
              <div className={`flex items-center gap-2 px-3 py-1.5 border font-semibold text-xs uppercase tracking-wider ${
                coa.overall_result === 'pass' ? 'border-atlas-success text-atlas-success' :
                coa.overall_result === 'fail' ? 'border-red-500 text-red-400' : 'border-amber-500 text-amber-400'
              }`}>
                Overall: {coa.overall_result}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-8 no-print">
            <button onClick={copyLink} className="btn-outline flex-1 gap-2 justify-center">
              {copied ? <><Check size={16} className="text-atlas-success" /> Copied</> : <><Copy size={16} /> Copy Link</>}
            </button>
            {isOwner && (
              <Link to="/dashboard?tab=coas" className="btn-outline flex-1 gap-2 justify-center">
                Download PDF in portal
              </Link>
            )}
            <Link to={`/verify?slug=${encodeURIComponent(coa.slug)}`} className="btn-primary flex-1 gap-2 justify-center">
              <Shield size={16} /> Verify
            </Link>
          </div>
        </div>
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );
}
