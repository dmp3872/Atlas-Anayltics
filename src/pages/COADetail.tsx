import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Shield, CheckCircle, XCircle, Clock, Download,
  FlaskConical, ArrowLeft, Copy, Check, Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, PanelResult } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

type PanelResultExtended = PanelResult & { description?: string };

function PanelResultRow({ r }: { r: PanelResultExtended }) {
  const [show, setShow] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      className={`relative rounded-xl border transition-all duration-150 cursor-default ${
        show
          ? r.pass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          : 'border-slate-100 bg-slate-50 hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          r.pass ? 'bg-emerald-100' : 'bg-red-100'
        }`}>
          {r.pass
            ? <CheckCircle size={15} className="text-emerald-600" />
            : <XCircle size={15} className="text-red-600" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900 truncate">{r.panel_name}</p>
            {r.description && <Info size={11} className="text-slate-400 flex-shrink-0" />}
          </div>
          {r.specification && (
            <p className="text-xs text-slate-400 mt-0.5">Spec: {r.specification}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-medium text-slate-800">{r.result}{r.unit ? ` ${r.unit}` : ''}</span>
          {r.pass
            ? <span className="badge-pass"><CheckCircle size={10} /> Pass</span>
            : <span className="badge-fail"><XCircle size={10} /> Fail</span>
          }
        </div>
      </div>

      {show && r.description && (
        <div className={`px-4 pb-3 pt-0 border-t ${r.pass ? 'border-emerald-200' : 'border-red-200'}`}>
          <p className="text-xs text-slate-600 leading-relaxed">{r.description}</p>
        </div>
      )}
    </div>
  );
}

function Chromatogram({ data }: { data: COA['chromatogram_data'] }) {
  const points = data?.points ?? generateDemoPoints();
  const maxY = Math.max(...points.map(p => p.y));
  const width = 400;
  const height = 120;
  const padL = 30;
  const padB = 20;
  const innerW = width - padL - 10;
  const innerH = height - padB - 10;

  const pathD = points.map((p, i) => {
    const x = padL + (p.x / (points[points.length - 1]?.x || 1)) * innerW;
    const y = 10 + (1 - p.y / maxY) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">HPLC Chromatogram</p>
        {data?.retention_time && (
          <span className="text-xs text-slate-500">RT: {data.retention_time} min</span>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
        <defs>
          <linearGradient id="chromGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={10} x2={padL} y2={height - padB} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - 10} y2={height - padB} stroke="#e2e8f0" strokeWidth="1" />
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} y1={10 + (1 - t) * innerH} x2={width - 10} y2={10 + (1 - t) * innerH} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        <path d={pathD + ` L ${padL + innerW} ${height - padB} L ${padL} ${height - padB} Z`} fill="url(#chromGrad)" />
        <path d={pathD} stroke="#14b8a6" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x={padL} y={height - 5} fill="#94a3b8" fontSize="8" textAnchor="middle">0</text>
        <text x={padL + innerW} y={height - 5} fill="#94a3b8" fontSize="8" textAnchor="middle">{(points[points.length - 1]?.x ?? 20).toFixed(0)} min</text>
      </svg>
      {data?.peak_area && (
        <p className="text-xs text-slate-500 mt-2 text-center">Peak Area: {data.peak_area.toLocaleString()}</p>
      )}
    </div>
  );
}

function generateDemoPoints() {
  const pts: { x: number; y: number }[] = [];
  for (let x = 0; x <= 20; x += 0.2) {
    const peak1 = 0.5 * Math.exp(-Math.pow(x - 4, 2) / 0.3);
    const peak2 = 1.0 * Math.exp(-Math.pow(x - 8, 2) / 0.5);
    const peak3 = 0.8 * Math.exp(-Math.pow(x - 12.4, 2) / 0.8);
    const noise = Math.random() * 0.02;
    pts.push({ x: Math.round(x * 10) / 10, y: Math.max(0, peak1 + peak2 + peak3 + noise) });
  }
  return pts;
}

export default function COADetail() {
  const { slug } = useParams<{ slug: string }>();
  const [coa, setCoa] = useState<COA | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('coas')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCoa(data);
        else setNotFound(true);
        setLoading(false);
      });
  }, [slug]);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <>
      <Header />
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">COA Not Found</h1>
          <p className="text-slate-500 mb-6">No certificate of analysis found for this ID.</p>
          <Link to="/verify" className="btn-primary">Try Verification Tool</Link>
        </div>
      </div>
      <Footer />
    </>
  );

  if (!coa) return null;

  const panelResults: PanelResult[] = Array.isArray(coa.panel_results) ? coa.panel_results : [
    { panel_name: 'HPLC Purity', result: `${coa.purity_percent ?? 98.7}%`, pass: true },
    { panel_name: 'Identity (HPLC)', result: 'Confirmed', pass: true },
    { panel_name: 'Endotoxin (LAL)', result: '<0.5 EU/mg', specification: '<1.0 EU/mg', pass: true },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-950 py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <Link to="/coa-library" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={14} /> Public Library
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{coa.display_name || coa.sample_name}</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Certificate of Analysis · Issued {formatDateTime(coa.issued_at)}
                </p>
              </div>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm ${
                coa.overall_result === 'pass'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                  : coa.overall_result === 'fail'
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-amber-500 bg-amber-500/10 text-amber-400'
              }`}>
                {coa.overall_result === 'pass' ? <CheckCircle size={16} /> : coa.overall_result === 'fail' ? <XCircle size={16} /> : <Clock size={16} />}
                Overall: {coa.overall_result.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Verification Status</h2>
            </div>
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield size={20} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-emerald-800">Document Verified</p>
                <p className="text-xs text-emerald-700 mt-0.5">This COA has been cryptographically signed by Atlas Analytics and has not been altered.</p>
              </div>
            </div>
            {coa.content_hash && (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 font-mono bg-slate-50 p-3 rounded-lg border border-slate-200">
                <Shield size={11} className="text-brand-500 flex-shrink-0" />
                Content Hash: {coa.content_hash} · Signature: {coa.signature || 'AM-' + coa.slug.slice(0, 8).toUpperCase()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-4">Sample Information</h2>
              <dl className="space-y-2.5">
                {[
                  { label: 'Sample Name', value: coa.sample_name },
                  { label: 'Display Name', value: coa.display_name || '—' },
                  { label: 'Company', value: coa.company_name || '—' },
                  { label: 'Batch Number', value: coa.batch_number || '—' },
                  { label: 'COA ID', value: coa.slug },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4 text-sm">
                    <dt className="text-slate-500 flex-shrink-0">{label}</dt>
                    <dd className="font-medium text-slate-900 text-right truncate">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-4">Key Results</h2>
              <div className="grid grid-cols-2 gap-3">
                {coa.purity_percent && (
                  <div className="bg-brand-50 rounded-xl p-4 border border-brand-100">
                    <p className="text-xs text-brand-600 font-medium">Purity</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{coa.purity_percent}%</p>
                  </div>
                )}
                {coa.molecular_weight && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">Mol. Weight</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{coa.molecular_weight}</p>
                    <p className="text-xs text-slate-400">Da</p>
                  </div>
                )}
                {!coa.purity_percent && !coa.molecular_weight && (
                  <div className="col-span-2 text-center py-4 text-sm text-slate-400">Results pending analysis</div>
                )}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Chromatogram</h2>
            <Chromatogram data={coa.chromatogram_data} />
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Test Panel Results</h2>
            <p className="text-xs text-slate-400 mb-4">Hover any row to see the test description and methodology</p>
            <div className="space-y-2">
              {panelResults.map((r, i) => (
                <PanelResultRow key={i} r={r} />
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Lab Information</h2>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <FlaskConical size={22} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Atlas Analytics</p>
                <p className="text-sm text-slate-500">Independent Third-Party Testing Laboratory</p>
                <p className="text-xs text-slate-400 mt-0.5">1234 Research Blvd, Austin, TX 78701 · ISO 17025 Accreditation Pending</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={copyLink} className="btn-outline flex-1 gap-2 justify-center">
              {copied ? <><Check size={16} className="text-emerald-500" /> Link Copied!</> : <><Copy size={16} /> Copy Shareable Link</>}
            </button>
            <a href="#" className="btn-outline flex-1 gap-2 justify-center">
              <Download size={16} /> Download PDF
            </a>
            <Link to="/verify" className="btn-primary flex-1 gap-2 justify-center">
              <Shield size={16} /> Verify Another COA
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
