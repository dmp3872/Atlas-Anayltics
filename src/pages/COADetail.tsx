import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Shield, CheckCircle, XCircle,
  ArrowLeft, Copy, Check, Droplets, Boxes, AlertTriangle, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, PanelResult } from '../lib/types';
import { formatDate, formatDateTime } from '../lib/utils';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import { hydrateCoaImages, prepareVialImage, readCoaPdfStats, resolveCoaHeaderLogo, resolveCoaWatermark } from '../lib/coaImages';
import { matrixTypeFromSampleMetadata } from '../lib/coaPanels';
import { partitionCoaPanels } from '../lib/coaDisplayPanels';
import { COA_DETAIL_COLUMNS, fetchCoaImageRow } from '../lib/coaSelect';
import { casForSampleName } from '../lib/labCoaForm';
import { compressImageDataUrl } from '../lib/imageCompress';
import { coaDigitalPdfFilename, downloadCoaPdfFromElement } from '../lib/coaPdf';
import { coaHasDirectorSignature, coaSignatureProgress, coaWorkflowStage } from '../lib/coaWorkflow';
import { sampleIntakeAt } from '../lib/services/orderWorkflow';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import AtlasLogo from '../components/brand/AtlasLogo';
import InteractiveChromatogram from '../components/coa/InteractiveChromatogram';
import CoaQrCode from '../components/coa/CoaQrCode';

function footerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="coa-info-field py-1.5 border-b border-atlas-border">
      <p className="coa-info-label text-[10px] font-bold uppercase tracking-wider text-neutral-500 leading-normal">
        {label}
      </p>
      <p className="coa-info-value text-sm font-medium text-black mt-0.5 leading-snug break-all">
        {value || '—'}
      </p>
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
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';
  const exportMode = searchParams.get('export') === '1';
  const hideChrome = autoPrint || exportMode;
  const { user, loading: authLoading } = useAuth();
  const [coa, setCoa] = useState<COA | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoWatermark, setLogoWatermark] = useState('');
  const [hplcPhoto, setHplcPhoto] = useState('');
  const [clientLogo, setClientLogo] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!slug) return;
    // Export iframe should not wait on auth — public slug fetch is enough and avoids remount races.
    if (authLoading && !exportMode) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setLogoWatermark('');
    setHplcPhoto('');
    setClientLogo('');

    (async () => {
      try {
        // Phase 1: certificate shell without multi‑MB image columns (those freeze the tab).
        const { data, error } = await supabase
          .from('coas')
          .select(COA_DETAIL_COLUMNS)
          .eq('slug', slug)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) {
          console.warn('COA load failed:', error?.message);
          setNotFound(true);
          setLoading(false);
          return;
        }

        const hydrated = hydrateCoaImages(data as COA);
        setCoa(hydrated);
        setLogoWatermark(hydrated.chromatogram_image || '');
        setHplcPhoto(hydrated.hplc_image || '');
        setClientLogo(hydrated.company_logo || '');
        setLoading(false);

        // Phase 2: images + profile fallbacks (non-blocking). Compress before state so a
        // leftover multi‑MB base64 row cannot freeze the tab / IDE embedded browser.
        // Sync Matrix Type + Received Date from the linked order sample (intake is source of truth).
        const summary0 = (hydrated.result_summary && typeof hydrated.result_summary === 'object'
          ? hydrated.result_summary
          : {}) as Record<string, unknown>;
        const chrom0 = (hydrated.chromatogram_data && typeof hydrated.chromatogram_data === 'object'
          ? hydrated.chromatogram_data
          : {}) as Record<string, unknown>;
        const hasMatrix = [summary0.matrix_type, summary0.sample_matrix, chrom0.sample_matrix]
          .some(v => typeof v === 'string' && v.trim());

        const sampleFieldBackfill = hydrated.sample_id
          ? (async () => {
              let sampleRes = await supabase
                .from('order_samples')
                .select('metadata, received_at, status, created_at')
                .eq('id', hydrated.sample_id)
                .maybeSingle();
              if (sampleRes.error && /received_at/i.test(sampleRes.error.message || '')) {
                sampleRes = await supabase
                  .from('order_samples')
                  .select('metadata, status, created_at')
                  .eq('id', hydrated.sample_id)
                  .maybeSingle();
              }
              const sample = sampleRes.data;
              if (cancelled || !sample) return null;

              const matrix = !hasMatrix ? matrixTypeFromSampleMetadata(sample.metadata) : '';
              const intakeAt = sampleIntakeAt(sample);
              const receivedDate = intakeAt ? formatDate(intakeAt) : '';
              const receivedNeedsSync = Boolean(
                intakeAt
                && (
                  summary0.received_at !== intakeAt
                  || summary0.received_date !== receivedDate
                  || !String(summary0.received_date || summary0.received_at || '').trim()
                ),
              );
              if (!matrix && !receivedNeedsSync) return null;

              const nextSummary = {
                ...summary0,
                ...(matrix ? { matrix_type: matrix, sample_matrix: matrix } : {}),
                ...(receivedNeedsSync && intakeAt
                  ? { received_at: intakeAt, received_date: receivedDate }
                  : {}),
              };
              const nextChrom = matrix
                ? { ...chrom0, sample_matrix: matrix }
                : chrom0;

              setCoa(prev => prev ? {
                ...prev,
                result_summary: nextSummary,
                chromatogram_data: nextChrom as COA['chromatogram_data'],
              } : prev);
              // Persist so PDF / public views keep matrix + received without re-query.
              void supabase.from('coas').update({
                result_summary: nextSummary,
                chromatogram_data: nextChrom,
              }).eq('id', hydrated.id);
              return { matrix, receivedDate };
            })()
          : Promise.resolve(null);

        const [imgRow, header, watermark] = await Promise.all([
          fetchCoaImageRow(hydrated.id),
          resolveCoaHeaderLogo(hydrated),
          resolveCoaWatermark(hydrated),
          sampleFieldBackfill,
        ]);
        if (cancelled) return;

        const rawVial = imgRow?.vial_image || hydrated.vial_image || '';
        // Crop + zoom so the vial fills/centers in the certificate frame.
        const preparedVial = rawVial ? await prepareVialImage(rawVial) : '';
        // Header logo: keep the original src for display. Re-compressing large brand PNGs
        // can return '' and wipe the client mark from the certificate + PNG export.
        const rawHeader =
          header
          || imgRow?.company_logo
          || hydrated.company_logo
          || '';
        const [vial, chrom, hplc, nextWatermark] = await Promise.all([
          compressImageDataUrl(preparedVial),
          compressImageDataUrl(imgRow?.chromatogram_image || hydrated.chromatogram_image || ''),
          compressImageDataUrl(imgRow?.hplc_image || hydrated.hplc_image || ''),
          compressImageDataUrl(watermark || ''),
        ]);
        if (cancelled) return;

        const resolvedWatermark = nextWatermark || chrom || '';

        if (resolvedWatermark) setLogoWatermark(resolvedWatermark);
        if (hplc) setHplcPhoto(hplc);
        if (rawHeader) setClientLogo(rawHeader);
        if (vial || chrom || hplc || rawHeader || resolvedWatermark) {
          setCoa(prev => prev ? {
            ...prev,
            vial_image: vial || prev.vial_image,
            chromatogram_image: resolvedWatermark || chrom || prev.chromatogram_image,
            hplc_image: hplc || prev.hplc_image,
            company_logo: rawHeader || prev.company_logo,
          } : prev);
        }
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, authLoading, exportMode]);

  useEffect(() => {
    // print=1 used to auto-open the browser print dialog; keep param harmless.
    if (!autoPrint || loading || !coa) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('print')) {
      url.searchParams.delete('print');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [autoPrint, loading, coa]);

  async function downloadPdf() {
    const root = document.querySelector('.coa-print-root');
    if (!(root instanceof HTMLElement) || !coa) return;
    setDownloadingPdf(true);
    try {
      // Brief wait for phase-2 media; never block download if one image is slow/broken.
      const mediaReady = () => {
        const imgs = Array.from(root.querySelectorAll('img')).filter(img => (img.currentSrc || img.src || '').trim());
        if (imgs.length === 0) return true;
        const decoded = imgs.filter(img => img.complete && img.naturalWidth > 0).length;
        return decoded >= Math.min(imgs.length, 1);
      };
      for (let i = 0; i < 15 && !mediaReady(); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      await downloadCoaPdfFromElement(root, coaDigitalPdfFilename(coa));
    } catch (err) {
      console.error('COA PDF download failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      const insecure = /insecure|tainted|SecurityError/i.test(msg);
      window.alert(
        insecure
          ? 'Could not save PDF (browser blocked the image export). Hard-refresh and try again.'
          : (msg || 'Could not download PDF. Try again.'),
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

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

  const { main: mainPanels, metals: metalPanels } = partitionCoaPanels(
    Array.isArray(coa.panel_results) ? coa.panel_results : [],
  );
  const isOwner = !!user && user.id === coa.user_id;
  const integrity = verifyCoaIntegrity(coa);
  const stats = readCoaPdfStats(coa);
  const summary = (coa.result_summary && typeof coa.result_summary === 'object'
    ? coa.result_summary
    : {}) as Record<string, unknown>;
  const chrom = (coa.chromatogram_data && typeof coa.chromatogram_data === 'object'
    ? coa.chromatogram_data
    : {}) as Record<string, unknown>;

  const vialSize =
    (typeof chrom.vial_size === 'string' && chrom.vial_size.trim())
      || '—';
  const matrix =
    (typeof summary.matrix_type === 'string' && summary.matrix_type.trim())
    || (typeof summary.sample_matrix === 'string' && summary.sample_matrix.trim())
    || (typeof chrom.sample_matrix === 'string' && chrom.sample_matrix.trim())
    || '—';
  const received =
    (typeof summary.received_date === 'string' && summary.received_date.trim())
    || (typeof summary.received_at === 'string' && formatDate(summary.received_at))
    || '—';
  const published = coa.published_at
    ? formatDate(coa.published_at)
    : coa.issued_at
      ? formatDate(coa.issued_at)
      : '—';
  const vialsTested =
    (typeof summary.mean_of_vials_tested === 'string' && summary.mean_of_vials_tested.trim())
    || (typeof summary.vials_tested === 'string' && summary.vials_tested.trim())
    || (typeof summary.vial_count === 'number' ? String(summary.vial_count) : '')
    || (() => {
      const net = mainPanels.find(p => /net content|peptide content/i.test(p.panel_name));
      const n = (net?.result || '').split(',').map(s => s.trim()).filter(Boolean).length;
      return n > 0 ? String(n) : '';
    })()
    || '—';
  const casRaw = (coa.peptide_sequence || '').trim();
  const casNumber = /^\d+-\d+-\d+$/.test(casRaw)
    ? casRaw
    : (casForSampleName(coa.sample_name) || casForSampleName(coa.display_name || '') || casRaw || '—');

  const clientWebsite =
    (typeof summary.client_website === 'string' && summary.client_website.trim())
    || (typeof summary.website === 'string' && summary.website.trim())
    || (typeof summary.company_website === 'string' && summary.company_website.trim())
    || '';
  const clientAddress =
    (typeof summary.client_address === 'string' && summary.client_address.trim())
    || (typeof summary.address === 'string' && summary.address.trim())
    || (typeof summary.company_address === 'string' && summary.company_address.trim())
    || '';
  const resolvedClientLogo = clientLogo || coa.company_logo || '';

  const infoRows = [
    [
      { label: 'Sample Code', value: coa.slug },
      { label: 'Sample Name', value: coa.display_name || coa.sample_name || '—' },
    ],
    [
      { label: 'Matrix Type', value: matrix },
      { label: 'Lot Code', value: coa.batch_number || '—' },
    ],
    [
      { label: 'CAS Number', value: casNumber },
      { label: 'Vials Tested', value: vialsTested },
    ],
    [
      { label: 'Received Date', value: received },
      { label: 'Published Date', value: published },
    ],
  ];
  const vialSizeBadge = (() => {
    if (!vialSize || vialSize === '—') return '';
    const m = vialSize.match(/(\d+(?:\.\d+)?)\s*m?l/i);
    if (m) return `${m[1]} ml`;
    return vialSize.trim();
  })();

  return (
    <>
      {!hideChrome && (
        <div className="no-print"><Header /></div>
      )}
      <div className="min-h-screen bg-white coa-print-root flex flex-col">
        <div className="coa-header-bar">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AtlasLogo variant="light" size="md" />
              {(coa.company_name || resolvedClientLogo) && (
                <>
                  <span className="hidden sm:block h-10 w-px bg-neutral-700 shrink-0" aria-hidden />
                  <div className="flex items-center gap-2.5 min-w-0">
                    {resolvedClientLogo ? (
                      <div className="coa-client-logo-chip shrink-0 bg-white rounded-sm p-1 border border-white/20">
                        <img
                          src={resolvedClientLogo}
                          alt=""
                          className="h-9 w-9 object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">Client</p>
                      <p className="text-sm font-semibold text-white truncate leading-tight">
                        {coa.company_name || '—'}
                      </p>
                      {clientWebsite ? (
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">{clientWebsite.replace(/^https?:\/\//i, '')}</p>
                      ) : null}
                      {clientAddress ? (
                        <p className="text-[10px] text-neutral-500 truncate">{clientAddress}</p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="text-right shrink-0">
              <h1 className="text-sm sm:text-base font-bold text-brand-500 uppercase tracking-[0.25em]">
                Certificate of Analysis
              </h1>
              <a
                href="http://atlasanalyticlab.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-400 mt-1 inline-block hover:text-brand-500"
              >
                atlasanalyticlab.com
              </a>
            </div>
          </div>
        </div>
        <div className="coa-gold-divider" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 coa-print-body flex-1 flex flex-col w-full">
          <div className="flex items-center justify-between gap-3 mb-3 no-print">
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

          <div className="mb-3">
            {infoRows.map((row) => (
              <div key={row.map(f => f.label).join('-')} className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
                {row.map(({ label, value }) => (
                  <InfoField key={label} label={label} value={value} />
                ))}
              </div>
            ))}
          </div>

          <div
            className={`mb-3 grid gap-2 items-stretch coa-print-media flex-1 min-h-[11rem] ${
              coa.vial_image ? 'grid-cols-1 sm:grid-cols-[104px_1fr]' : 'grid-cols-1'
            }`}
          >
            {coa.vial_image ? (
              <div className="coa-print-vial flex flex-col gap-1 w-full sm:w-[104px] h-full min-h-0 overflow-visible">
                <div className="border border-black bg-white flex-1 min-h-[7.5rem] p-0 overflow-hidden flex items-center justify-center">
                  <img
                    src={coa.vial_image}
                    alt="Sample vial"
                    className="block w-full h-full min-h-[7.5rem] object-cover object-center scale-[1.06]"
                  />
                </div>
                {vialSizeBadge ? (
                  <div className="coa-vial-size-badge border border-black bg-white px-1.5 py-1 text-center shrink-0 relative z-[1]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-black tabular-nums leading-normal">
                      {vialSizeBadge}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 w-full coa-print-chromatogram flex flex-col h-full min-h-[9.5rem] sm:min-h-[10.5rem]">
              <InteractiveChromatogram
                data={coa.chromatogram_data}
                chromatographPhoto={hplcPhoto || coa.hplc_image || undefined}
                logoWatermark={logoWatermark || undefined}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Boxes size={20} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Average Net Peptide Content</p>
                  <p className="text-xl font-bold text-black mt-0.5 tabular-nums">
                    {stats.avg_net_peptide_content
                      || (coa.purity_percent ? `${(Number(coa.purity_percent) * 0.1).toFixed(1)} mg` : '—')}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Mean of {vialsTested !== '—' ? vialsTested : '—'} vials tested
                  </p>
                </div>
              </div>
            </div>
            <div className="coa-stat-card">
              <div className="flex items-start gap-3">
                <Droplets size={20} className="text-brand-500 flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Average Purity</p>
                  <p className="text-xl font-bold text-black mt-0.5 tabular-nums">
                    {stats.avg_purity || (coa.purity_percent != null ? `${coa.purity_percent}%` : '—')}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Mean of {vialsTested !== '—' ? vialsTested : '—'} results
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3 overflow-hidden border border-atlas-border coa-table-wrap">
            <table className="w-full text-sm coa-print-table table-fixed">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[32%]" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="coa-table-header">
                  <th className="text-left px-3 py-1.5">Test</th>
                  <th className="text-left px-3 py-1.5">Specification</th>
                  <th className="text-left px-3 py-1.5">Result</th>
                  <th className="text-left px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {mainPanels.map((r, i) => {
                  const isNetContent = /net content|peptide content/i.test(r.panel_name);
                  return (
                    <tr key={`main-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-3 py-1 font-medium border-t border-atlas-border">{r.panel_name}</td>
                      <td className="px-3 py-1 text-neutral-600 border-t border-atlas-border">{r.specification || '—'}</td>
                      <td className="px-3 py-1 font-medium border-t border-atlas-border">{r.result || '—'}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td className="px-3 py-1 border-t border-atlas-border">
                        {isNetContent ? (
                          <span className="font-bold uppercase text-xs text-neutral-500">N/A</span>
                        ) : (
                          <span className={`font-bold uppercase text-xs ${r.pass ? 'text-atlas-success' : 'text-red-600'}`}>
                            {r.pass ? 'Pass' : 'Fail'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mb-4 overflow-hidden border border-atlas-border coa-table-wrap">
            <table className="w-full text-sm coa-print-table table-fixed">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[32%]" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="coa-table-header">
                  <th className="text-left px-3 py-1.5">Heavy Metals</th>
                  <th className="text-left px-3 py-1.5">USP {'<232>'} Limits</th>
                  <th className="text-left px-3 py-1.5">Result</th>
                  <th className="text-left px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {metalPanels.map((r, i) => {
                  const resultText = r.result?.trim()
                    ? `${r.result}${r.unit ? ` ${r.unit}` : ''}`
                    : 'Not Detected';
                  const showPass = !r.result?.trim() || r.pass;
                  return (
                    <tr key={`metal-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-3 py-1 font-medium border-t border-atlas-border">{r.panel_name}</td>
                      <td className="px-3 py-1 text-neutral-600 border-t border-atlas-border">{r.specification || ''}</td>
                      <td className="px-3 py-1 font-medium border-t border-atlas-border text-black">
                        {resultText}
                      </td>
                      <td className="px-3 py-1 border-t border-atlas-border">
                        <span className={`font-bold uppercase text-xs ${showPass ? 'text-atlas-success' : 'text-red-600'}`}>
                          {showPass ? 'Pass' : 'Fail'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {coa.content_hash && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-600 font-mono bg-neutral-50 px-3 py-2 border border-atlas-border mb-3 no-print">
              <Shield size={11} className="text-brand-500" />
              <span>Hash: {coa.content_hash}</span>
              <span className="text-neutral-300">·</span>
              <span>Sig: {coa.signature || `AM-${coa.slug.slice(0, 8).toUpperCase()}`}</span>
            </div>
          )}

          <div className="coa-cert-footer bg-[#0a1628] text-white px-4 sm:px-5 py-2.5 mt-auto">
            <div className="coa-footer-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3 w-full">
              <div className="coa-footer-sigs flex flex-wrap items-center gap-x-5 gap-y-3 min-w-0">
                {(() => {
                  const sig = coaSignatureProgress(coa);
                  const directorSigned = coaHasDirectorSignature(coa);
                  const stage = coaWorkflowStage(coa);
                  const showChemistSig = sig.signed >= 1;
                  return (
                    <>
                      {(stage === 'issued' || stage === 'pending_review' || directorSigned) && (
                        <p className="w-full text-[10px] font-bold uppercase tracking-wider text-brand-500">
                          {sig.label}
                        </p>
                      )}
                <div className={`min-w-0 shrink-0 ${showChemistSig ? '' : 'opacity-40'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/90 mb-1">Results Reviewed By:</p>
                  <div className="flex items-center gap-2.5">
                    {showChemistSig ? (
                      <img
                        src="/brand/signatures/brad-martin.png"
                        alt="D. Brad Martin signature"
                        className="h-8 w-auto max-w-[130px] object-contain object-left shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-[100px] border border-dashed border-white/30 rounded-sm flex items-center justify-center text-[9px] text-white/50">
                        Pending
                      </div>
                    )}
                    <div className="text-[11px] leading-snug">
                      <p className="font-semibold">D. Brad Martin</p>
                      <p className="text-white/70">Lead Chemist</p>
                      <p className="text-white/70 tabular-nums">{showChemistSig ? footerDate(coa.issued_at) : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className={`min-w-0 shrink-0 ${directorSigned ? '' : 'opacity-40'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/90 mb-1">Results Certified By:</p>
                  <div className="flex items-center gap-2.5">
                    {directorSigned ? (
                      <img
                        src="/brand/signatures/gokul-gondi.png"
                        alt="Dr. Gokul Gondi signature"
                        className="h-9 w-auto max-w-[110px] object-contain object-left shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-[100px] border border-dashed border-white/30 rounded-sm flex items-center justify-center text-[9px] text-white/50">
                        Pending
                      </div>
                    )}
                    <div className="text-[11px] leading-snug">
                      <p className="font-semibold">Dr. Gokul Gondi MD</p>
                      <p className="text-white/70">Lab Director</p>
                      <p className="text-white/70 tabular-nums">
                        {directorSigned ? footerDate(coa.verified_at || coa.issued_at) : 'Awaiting sign-off'}
                      </p>
                    </div>
                  </div>
                </div>
                    </>
                  );
                })()}
              </div>

              <div className="coa-footer-verify min-w-0 flex items-center gap-3 shrink-0">
                <div className="text-[11px] leading-snug text-right">
                  <p className="font-bold uppercase tracking-wide">atlasanalytics.io</p>
                  <p className="font-mono text-white/80 mt-0.5">
                    {(coa.signature || `AM-${coa.slug.slice(0, 8).toUpperCase()}`).slice(0, 12)}
                  </p>
                  <p className="text-white/70 tabular-nums mt-0.5">{footerDate(coa.issued_at)}</p>
                </div>
                <CoaQrCode slug={coa.slug} size={64} compact />
              </div>
            </div>
            <p className="coa-footer-disclaimer text-[9px] text-white/50 text-center mt-2 leading-snug">
              This report applies only to the samples tested and may not be reproduced, except in full, without written approval.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 no-print">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={downloadingPdf}
              className="btn-outline flex-1 gap-2 justify-center"
            >
              <Download size={16} /> {downloadingPdf ? 'Saving…' : 'Download PDF'}
            </button>
            <button type="button" onClick={copyLink} className="btn-outline flex-1 gap-2 justify-center">
              {copied ? <><Check size={16} className="text-atlas-success" /> Copied</> : <><Copy size={16} /> Copy Link</>}
            </button>
            <Link to={`/verify?slug=${encodeURIComponent(coa.slug)}`} className="btn-primary flex-1 gap-2 justify-center">
              <Shield size={16} /> Verify
            </Link>
          </div>
        </div>
      </div>
      {!hideChrome && (
        <div className="no-print"><Footer /></div>
      )}
    </>
  );
}
