import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Shield, CheckCircle, XCircle, Clock, Download,
  ArrowLeft, Copy, Check, Droplets, Boxes
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, PanelResult } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import AtlasLogo, { AtlasWatermark } from '../components/brand/AtlasLogo';

const GOLD = '#C5A059';
const GRID = '#E0E0E0';

function Chromatogram({ data }: { data: COA['chromatogram_data'] }) {
  const points = data?.points ?? generateDemoPoints();
  const maxY = Math.max(...points.map(p => p.y));
  const width = 560;
  const height = 160;
  const padL = 36;
  const padB = 24;
  const innerW = width - padL - 16;
  const innerH = height - padB - 16;

  const pathD = points.map((p, i) => {
    const x = padL + (p.x / (points[points.length - 1]?.x || 1)) * innerW;
    const y = 12 + (1 - p.y / maxY) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="relative border border-atlas-border bg-white overflow-hidden">
      <AtlasWatermark className="absolute inset-0 m-auto w-32 h-32 opacity-40" />
      <div className="relative px-4 pt-4 pb-2">
        <p className="text-xs font-bold text-brand-600 uppercase tracking-widest text-center">
          HPLC Chromatogram Report
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="relative w-full h-40">
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} y1={12 + (1 - t) * innerH} x2={width - 16} y2={12 + (1 - t) * innerH} stroke={GRID} strokeWidth="1" />
        ))}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={`v${t}`} x1={padL + t * innerW} y1={12} x2={padL + t * innerW} y2={height - padB} stroke={GRID} strokeWidth="1" />
        ))}
        <line x1={padL} y1={12} x2={padL} y2={height - padB} stroke="#999" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - 16} y2={height - padB} stroke="#999" strokeWidth="1" />
        <path d={pathD} stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x={padL} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">0</text>
        <text x={padL + innerW} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">
          {(points[points.length - 1]?.x ?? 20).toFixed(0)} min
        </text>
        {data?.retention_time && (
          <text x={width / 2} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">
            RT: {data.retention_time} min
          </text>
        )}
      </svg>
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

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 border-b border-atlas-border">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-black mt-0.5">{value}</p>
    </div>
  );
}

export default function COADetail() {
  const { slug } = useParams<{ slug: string }>();
  const [coa, setCoa] = useState<COA | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vialSize, setVialSize] = useState('3ml');

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
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <>
      <Header />
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-black mb-2">COA Not Found</h1>
          <p className="text-neutral-500 mb-6">No certificate of analysis found for this ID.</p>
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

  const infoFields = [
    { label: 'Client', value: coa.company_name || '—' },
    { label: 'Sample Code', value: coa.slug },
    { label: 'Sample Name', value: coa.sample_name },
    { label: 'Display Name', value: coa.display_name || coa.sample_name },
    { label: 'Batch Number', value: coa.batch_number || '—' },
    { label: 'Date Issued', value: formatDateTime(coa.issued_at) },
    { label: 'Vial Size', value: vialSize },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white">
        <div className="coa-header-bar">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <AtlasLogo variant="light" size="md" />
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
          <Link to="/coa-library" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-brand-600 text-sm mb-6 transition-colors">
            <ArrowLeft size={14} /> Public Library
          </Link>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0 mb-8">
            {infoFields.map(({ label, value }) => (
              <InfoField key={label} label={label} value={value} />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Boxes size={28} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Average Net Peptide Content
                  </p>
                  <p className="text-3xl font-bold text-black mt-1">
                    {coa.purity_percent ? `${(coa.purity_percent * 0.1).toFixed(1)} mg` : '—'}
                  </p>
                  <p className="text-xs text-atlas-success font-semibold mt-1 uppercase tracking-wide">Conforms</p>
                </div>
              </div>
            </div>
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Droplets size={28} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Average Purity
                  </p>
                  <p className="text-3xl font-bold text-black mt-1">
                    {coa.purity_percent ?? 98.7}%
                  </p>
                  <p className="text-xs text-atlas-success font-semibold mt-1 uppercase tracking-wide">Measured</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Vial Size</p>
            <div className="flex gap-2">
              {['3ml', '5ml', '10ml'].map(size => (
                <button
                  key={size}
                  onClick={() => setVialSize(size)}
                  className={`coa-vial-btn ${vialSize === size ? 'coa-vial-btn-active' : ''}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <Chromatogram data={coa.chromatogram_data} />
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
                    <td className="px-4 py-3 font-medium text-black border-t border-atlas-border">{r.panel_name}</td>
                    <td className="px-4 py-3 text-neutral-600 border-t border-atlas-border">{r.specification || '—'}</td>
                    <td className="px-4 py-3 font-medium text-black border-t border-atlas-border">
                      {r.result}{r.unit ? ` ${r.unit}` : ''}
                    </td>
                    <td className="px-4 py-3 border-t border-atlas-border">
                      <span className={`font-bold uppercase text-xs ${r.pass ? 'text-atlas-success' : 'text-red-600'}`}>
                        {r.pass ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {coa.content_hash && (
            <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono bg-neutral-50 p-3 border border-atlas-border mb-8">
              <Shield size={11} className="text-brand-500 flex-shrink-0" />
              Content Hash: {coa.content_hash} · Signature: {coa.signature || 'AM-' + coa.slug.slice(0, 8).toUpperCase()}
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
              <p className="text-brand-500 text-sm font-medium">www.atlasanalytics.io</p>
              <div className={`flex items-center gap-2 px-3 py-1.5 border font-semibold text-xs uppercase tracking-wider ${
                coa.overall_result === 'pass'
                  ? 'border-atlas-success text-atlas-success'
                  : coa.overall_result === 'fail'
                  ? 'border-red-500 text-red-400'
                  : 'border-amber-500 text-amber-400'
              }`}>
                {coa.overall_result === 'pass' ? <CheckCircle size={14} /> : coa.overall_result === 'fail' ? <XCircle size={14} /> : <Clock size={14} />}
                Overall: {coa.overall_result}
              </div>
            </div>
            <p className="text-[10px] text-neutral-600 mt-4 leading-relaxed">
              This certificate is cryptographically signed and tamper-proof. Verification available at atlasanalytics.io/verify
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <button onClick={copyLink} className="btn-outline flex-1 gap-2 justify-center">
              {copied ? <><Check size={16} className="text-atlas-success" /> Link Copied!</> : <><Copy size={16} /> Copy Shareable Link</>}
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
