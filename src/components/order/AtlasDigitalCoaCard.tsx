import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  LabTestService,
  WizardSample,
  categoryLabel,
  formatLabelClaim,
  sampleIncludesConformity,
  sampleIncludesFentanyl,
} from '../../lib/orderCatalog';
import {
  TrackingStage,
  WizardStage,
  conformityChartVialCount,
  methodsForSample,
  previewSampleForPackage,
} from '../../lib/orderProjection';

/**
 * Optional card features — flip any of these to false to remove that element.
 * atlasSeal:       gold hexagonal Atlas seal + live signature fragment in the header
 * accessionHero:   large centered accession number treatment on the card front
 * instrumentChips: instrument-style pending chips (HPLC / MS / LAL…) with pulse
 * flipSide:        click/tap flips the card to a verification back face
 */
const CARD_FEATURES = {
  atlasSeal: true,
  accessionHero: true,
  instrumentChips: true,
  flipSide: true,
};

/** Per-vial assay readings shown on the conformity chart + top chips. */
export type DigitalCoaAssayResults = {
  purity?: number[];
  quantity?: number[];
  identity?: boolean[];
  quantityUnit?: string;
};

type Props = {
  samples: WizardSample[];
  catalog?: LabTestService[];
  companyName?: string;
  /** Wizard companion stage — drives seal / chip / accession progression. */
  stage?: WizardStage;
  /** Optional package id to morph the preview without committing selection. */
  previewPackageId?: 'full_qc' | 'atlas_pro' | null;
  /** Real accession once assigned at receiving (tracker mode). */
  accession?: string | null;
  /** Post-submit tracking stage. */
  trackingStage?: TrackingStage | null;
  readinessPercent?: number;
  overallResult?: 'pass' | 'fail' | 'pending';
  /** Real lab readings when available; otherwise a deterministic preview is used. */
  assayResults?: DigitalCoaAssayResults | null;
  /** Runs a one-time seal pulse and front/back reveal animation. */
  celebrate?: boolean;
};

type AssaysSeries = {
  vials: number[];
  purity: number[];
  quantity: number[];
  identity: boolean[];
  quantityUnit: string;
};

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function formatPurityPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function formatQuantityAmt(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  const num =
    rounded % 1 === 0
      ? String(rounded)
      : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${num} ${unit}`.trim();
}

function padOrTrim<T>(values: T[] | undefined, n: number, fill: (i: number) => T): T[] {
  const out = Array.from({ length: n }, (_, i) => (values && values[i] !== undefined ? values[i]! : fill(i)));
  return out;
}

/** Deterministic preview traces — or real readings when assayResults is provided. */
function buildAssaySeries(
  vialCount: number,
  quantityBase: number,
  quantityUnit: string,
  assayResults?: DigitalCoaAssayResults | null,
): AssaysSeries {
  const n = Math.max(1, Math.round(vialCount));
  const vials = Array.from({ length: n }, (_, i) => i + 1);
  const wave = (base: number, amp: number, phase: number) =>
    vials.map(v => Math.round((base + Math.sin(v * 1.1 + phase) * amp + (v % 3) * amp * 0.15) * 100) / 100);

  const baseQty = quantityBase > 0 ? quantityBase : 10;
  const purity = padOrTrim(assayResults?.purity, n, i => wave(99.35, 0.18, 0.2)[i]!);
  const quantity = padOrTrim(assayResults?.quantity, n, i => wave(baseQty, Math.max(0.08, baseQty * 0.014), 1.1)[i]!);
  const identity = padOrTrim(assayResults?.identity, n, () => true);
  return {
    vials,
    purity,
    quantity,
    identity,
    quantityUnit: assayResults?.quantityUnit?.trim() || quantityUnit || 'mg',
  };
}

const CHART = { w: 300, h: 148, left: 14, right: 14, bottomPad: 16 };
const BANDS: Array<[number, number]> = [
  [22, 46],
  [62, 86],
  [104, 128],
];

function seriesPoints(values: number[], band: [number, number]) {
  const [top, bottom] = band;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = CHART.w - CHART.left - CHART.right;
  const denom = Math.max(1, values.length - 1);
  return values.map((v, i) => {
    const x = values.length === 1
      ? CHART.left + innerW / 2
      : CHART.left + (innerW * i) / denom;
    const y = values.length === 1
      ? top + (bottom - top) / 2
      : bottom - ((v - min) / span) * (bottom - top);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

function identityPoints(identity: boolean[], band: [number, number]) {
  const [top, bottom] = band;
  const mid = top + (bottom - top) * 0.35;
  const failY = top + (bottom - top) * 0.85;
  const innerW = CHART.w - CHART.left - CHART.right;
  const denom = Math.max(1, identity.length - 1);
  return identity.map((pass, i) => {
    const x = identity.length === 1
      ? CHART.left + innerW / 2
      : CHART.left + (innerW * i) / denom;
    return { x: Math.round(x * 10) / 10, y: pass ? mid : failY, pass };
  });
}

function ConformityChart({ series }: { series: AssaysSeries }) {
  const { vials, purity, quantity, identity, quantityUnit } = series;
  const chartKey = `${vials.join('-')}-${purity.join(',')}-${quantity.join(',')}-${identity.map(v => (v ? 1 : 0)).join('')}`;

  const purityPts = seriesPoints(purity, BANDS[0]);
  const quantityPts = seriesPoints(quantity, BANDS[1]);
  const identityPts = identityPoints(identity, BANDS[2]);

  const lines: Array<{
    key: string;
    color: string;
    label: string;
    band: [number, number];
    pts: Array<{ x: number; y: number }>;
    pointLabels: string[];
  }> = [
    {
      key: 'purity',
      color: '#D4AF37',
      label: 'Purity %',
      band: BANDS[0],
      pts: purityPts,
      pointLabels: purity.map(formatPurityPct),
    },
    {
      key: 'quantity',
      color: '#8AB4F8',
      label: 'Quantity',
      band: BANDS[1],
      pts: quantityPts,
      pointLabels: quantity.map(v => formatQuantityAmt(v, quantityUnit)),
    },
    {
      key: 'identity',
      color: '#4ADE80',
      label: 'Identity',
      band: BANDS[2],
      pts: identityPts,
      pointLabels: identity.map(pass => (pass ? 'Pass' : 'Fail')),
    },
  ];

  return (
    <svg
      key={chartKey}
      viewBox={`0 0 ${CHART.w} ${CHART.h + CHART.bottomPad}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Conformity across ${vials.length} vials for purity, quantity, and identity`}
    >
      <defs>
        {lines.map(s => (
          <linearGradient key={s.key} id={`coa-line-${s.key}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
            <stop offset="50%" stopColor={s.color} stopOpacity="1" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.35" />
          </linearGradient>
        ))}
      </defs>

      {vials.map((v, i) => {
        const innerW = CHART.w - CHART.left - CHART.right;
        const x = vials.length === 1
          ? CHART.left + innerW / 2
          : CHART.left + (innerW * i) / (vials.length - 1);
        return (
          <g key={v}>
            <line x1={x} y1={14} x2={x} y2={CHART.h - 4} stroke="#FFFFFF" strokeOpacity="0.08" strokeDasharray="2 4" />
            <text x={x} y={CHART.h + 12} textAnchor="middle" fontSize="7.5" fill="#9CA3AF" fontFamily="ui-monospace, monospace">
              V{v}
            </text>
          </g>
        );
      })}

      {lines.map((s, idx) => {
        const path = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
        return (
          <g key={s.key}>
            <path
              d={path}
              fill="none"
              stroke={`url(#coa-line-${s.key})`}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset="1"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="1"
                to="0"
                dur="1.4s"
                begin={`${idx * 0.25}s`}
                fill="freeze"
                calcMode="spline"
                keySplines="0.4 0 0.2 1"
                keyTimes="0;1"
              />
            </path>
            {s.pts.map((p, i) => {
              const isFail = s.key === 'identity' && !identity[i];
              const color = isFail ? '#F87171' : s.color;
              // Label above the dot by default; flip below when the dot is near
              // the top of its band so the value never sits under the line or
              // the band title.
              const labelAbove = p.y - 7 >= s.band[0] + 1;
              const labelY = labelAbove ? p.y - 6 : p.y + 11;
              // Nudge edge labels inward so they aren't clipped by the viewBox.
              const labelX = Math.min(Math.max(p.x, CHART.left + 10), CHART.w - CHART.right - 10);
              return (
                <g key={`${s.key}-${i}`}>
                  <circle cx={p.x} cy={p.y} r="4" fill={color} opacity="0.18" />
                  <circle cx={p.x} cy={p.y} r="1.7" fill={color} />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize="6.5"
                    fontWeight="700"
                    fill={color}
                    fontFamily="ui-monospace, monospace"
                    stroke="#0A0A0A"
                    strokeWidth="2"
                    paintOrder="stroke"
                  >
                    {s.pointLabels[i]}
                  </text>
                </g>
              );
            })}
            <text
              x={CHART.w - CHART.right}
              y={s.band[0] - 6}
              textAnchor="end"
              fontSize="7"
              fontWeight="700"
              fill={s.color}
              fontFamily="ui-monospace, monospace"
              letterSpacing="0.08em"
            >
              {s.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** FNV-1a based pseudo-signature so the fragment updates live with order details. */
function previewSignature(input: string): string {
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (const ch of input || 'atlas-analytics-preview') {
      h ^= ch.codePointAt(0) ?? 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return hash(0x811c9dc5) + hash(0x01935fe1);
}

function AtlasSeal({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="atlas-seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="55%" stopColor="#C5A059" />
          <stop offset="100%" stopColor="#997532" />
        </linearGradient>
      </defs>
      <polygon
        points="20,2 36,11 36,29 20,38 4,29 4,11"
        fill="none"
        stroke="url(#atlas-seal-gold)"
        strokeWidth="1.4"
        opacity="0.9"
      />
      <polygon points="20,5.5 33,12.8 33,27.2 20,34.5 7,27.2 7,12.8" fill="url(#atlas-seal-gold)" />
      <text
        x="20"
        y="25.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#000000"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        A
      </text>
    </svg>
  );
}

function FieldValue({ value, placeholderWidth = 'w-20' }: { value?: string; placeholderWidth?: string }) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return <span className={`inline-block h-2 rounded-sm bg-white/15 align-middle ${placeholderWidth}`} />;
  }
  return (
    <span className="max-w-[65%] truncate text-right font-bold text-white normal-case tracking-normal" title={trimmed}>
      {trimmed}
    </span>
  );
}

const CHIP_INSTRUMENTS: Record<string, string> = {
  Identity: 'MS',
  Purity: 'HPLC',
  Quantity: 'HPLC',
  'Heavy metals': 'ICP-MS',
  Endotoxin: 'LAL',
  Sterility: 'PCR',
  Fentanyl: 'LC-MS',
};

function PendingChip({
  label,
  status = 'pending',
  value,
}: {
  label: string;
  status?: 'pending' | 'queued' | 'pass' | 'fail';
  /** When set, shown instead of Pending/Pass/Fail (e.g. avg purity / quantity). */
  value?: string;
}) {
  const statusLabel =
    value?.trim() ||
    (status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : status === 'queued' ? 'Queued' : 'Pending');
  const statusClass = value
    ? status === 'fail'
      ? 'text-red-300'
      : status === 'pass'
        ? 'text-emerald-300'
        : 'text-white'
    : status === 'pass'
      ? 'text-emerald-300'
      : status === 'fail'
        ? 'text-red-300'
      : status === 'queued'
        ? 'text-sky-300'
        : 'text-amber-300';
  const dotClass = value
    ? status === 'fail'
      ? 'bg-red-300'
      : status === 'pass'
        ? 'bg-emerald-300'
        : 'bg-atlas-gold'
    : status === 'pass'
      ? 'bg-emerald-300'
      : status === 'fail'
        ? 'bg-red-300'
      : status === 'queued'
        ? 'bg-sky-300 animate-pulse'
        : 'bg-amber-300 animate-pulse';

  if (!CARD_FEATURES.instrumentChips) {
    return (
      <div className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-neutral-400">{label}</p>
        <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass}`}>{statusLabel}</p>
      </div>
    );
  }
  const instrument = CHIP_INSTRUMENTS[label] ?? 'LAB';
  return (
    <div className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1.5 text-center">
      <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-400">
        {label} <span className="text-neutral-500">· {instrument}</span>
      </p>
      <p className={`mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide ${statusClass}`}>
        <span className={`h-1 w-1 rounded-full ${dotClass}`} aria-hidden="true" />
        {statusLabel}
      </p>
    </div>
  );
}

function pickPreviewSample(samples: WizardSample[]): WizardSample | null {
  if (!samples.length) return null;
  return (
    samples.find(s => s.sample_name.trim() || s.peptide_identification.trim() || s.batch_number.trim()) ??
    samples[0]
  );
}

function productLabel(sample: WizardSample): string {
  return (
    sample.sample_name.trim() ||
    sample.display_name.trim() ||
    sample.peptide_identification.trim() ||
    ''
  );
}

function typeLabel(sample: WizardSample): string {
  // Card header uses a short matrix-style word (PEPTIDE / BLEND / CAPSULES / …)
  if (sample.category === 'single_peptide') return 'Peptide';
  if (sample.category === 'peptide_blend') return 'Blend';
  if (sample.category === 'bac_water') return 'BAC Water';
  if (sample.category === 'other') {
    const matrix = (sample.sample_matrix || '').trim();
    return matrix || 'Other';
  }
  return sample.sample_matrix?.trim() || categoryLabel(sample.category) || 'Sample';
}

function hasConformityTesting(sample: WizardSample): boolean {
  return sampleIncludesConformity(sample);
}

function chipStatus(
  stage: WizardStage,
  tracking?: TrackingStage | null,
  overallResult?: 'pass' | 'fail' | 'pending',
): 'pending' | 'queued' | 'pass' | 'fail' {
  if (overallResult === 'fail') return 'fail';
  if (overallResult === 'pass') return 'pass';
  if (tracking === 'complete' || tracking === 'issued') return 'pass';
  if (tracking === 'analyzing' || tracking === 'in_review' || tracking === 'received') return 'queued';
  if (stage === 'submitted' || stage === 'tracking') return 'queued';
  return 'pending';
}

const TILT_MAX_DEG = 10;

/** Pointer-follow 3D tilt with a moving glare highlight. */
function useCardTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [glare, setGlare] = useState<React.CSSProperties>({ opacity: 0 });

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setStyle({
        transform: `perspective(900px) rotateX(${(0.5 - py) * TILT_MAX_DEG}deg) rotateY(${(px - 0.5) * TILT_MAX_DEG}deg) scale(1.02)`,
        transition: 'transform 60ms linear',
      });
      setGlare({
        opacity: 1,
        background: `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.14), rgba(255,255,255,0.04) 35%, transparent 60%)`,
      });
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setStyle({
      transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
      transition: 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
    });
    setGlare({ opacity: 0, transition: 'opacity 450ms ease' });
  }, []);

  return { ref, style, glare, onPointerMove, onPointerLeave };
}

function CardTexture() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#C5A059 1px, transparent 1px), linear-gradient(90deg, #C5A059 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <img
        src="/brand/atlas-logo-stacked-light.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute left-1/2 top-1/2 w-3/4 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.07]"
      />
    </>
  );
}

const CARD_FACE_CLASS =
  'overflow-hidden rounded-2xl border border-atlas-gold/40 bg-atlas-black shadow-lg';

export default function AtlasDigitalCoaCard({
  samples,
  companyName = '',
  stage = 'package',
  previewPackageId = null,
  accession = null,
  trackingStage = null,
  readinessPercent,
  overallResult,
  assayResults = null,
  celebrate = false,
}: Props) {
  const tilt = useCardTilt();
  const [flipped, setFlipped] = useState(false);
  const baseSample = pickPreviewSample(samples);
  const sample = baseSample && previewPackageId
    ? previewSampleForPackage(baseSample, previewPackageId)
    : baseSample;
  const conformityOn = sample ? hasConformityTesting(sample) : false;
  const chartVials = conformityOn ? conformityChartVialCount(sample) : 0;
  const claimQty = Number.parseFloat(sample?.labeled_content?.trim() || '') || 0;
  const claimUnit = sample?.label_claim_unit?.trim() || 'mg';
  const assaySeries = buildAssaySeries(Math.max(1, chartVials || 3), claimQty, claimUnit, assayResults);
  const avgPurity = average(assaySeries.purity);
  const avgQuantity = average(assaySeries.quantity);
  const identityPass = assaySeries.identity.every(Boolean);
  const name = sample ? productLabel(sample) : '';
  const lot = sample?.batch_number.trim() ?? '';
  const client = companyName.trim();
  const clientLot = [client, lot].filter(Boolean).join(' · ');
  const claim = sample ? formatLabelClaim(sample.labeled_content, sample.label_claim_unit) : '';
  const filled = Boolean(name || clientLot || claim);
  const methods = methodsForSample(sample);
  const methodKeys = new Set(methods.map(m => m.key));
  const showEndotoxin = methodKeys.has('endotoxin_usp85');
  const showSterility = methodKeys.has('sterility_pcr') || methodKeys.has('sterility_culture');
  const showHeavyMetals = methodKeys.has('heavy_metals_icpms');
  const fentanyl = sample ? sampleIncludesFentanyl(sample) : false;
  const yy = String(new Date().getFullYear()).slice(-2);
  const signature = previewSignature([name, lot, client, sample?.primary_test_id ?? '', stage].join('|'));
  const accessionDisplay = accession?.trim() || null;
  const accessionGhost = `${yy}-\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF`;
  const chipSt = chipStatus(stage, trackingStage, overallResult);
  const showConformityChart = conformityOn && chartVials > 0;
  const identityChipStatus: 'pending' | 'queued' | 'pass' | 'fail' = showConformityChart
    ? identityPass
      ? 'pass'
      : 'fail'
    : chipSt;
  const purityChipValue = showConformityChart ? formatPurityPct(avgPurity) : undefined;
  const quantityChipValue = showConformityChart
    ? formatQuantityAmt(avgQuantity, assaySeries.quantityUnit)
    : undefined;
  const sealLocked = stage === 'checkout' || stage === 'submitted' || stage === 'tracking' || !!trackingStage;
  const stageBadge =
    trackingStage === 'complete'
      ? 'Issued'
      : trackingStage === 'issued'
        ? 'Issued'
        : trackingStage === 'in_review'
          ? 'In review'
          : trackingStage === 'analyzing'
            ? 'Analyzing'
            : trackingStage === 'received'
              ? 'Received'
              : trackingStage === 'awaiting_sample' || stage === 'submitted'
                ? 'Submitted'
                : stage === 'checkout'
                  ? 'Checkout'
                  : stage === 'details'
                    ? 'Details'
                    : previewPackageId
                      ? 'Comparing'
                      : 'Preview';

  useEffect(() => {
    if (!celebrate || !CARD_FEATURES.flipSide) return;
    setFlipped(false);
    const reveal = window.setTimeout(() => setFlipped(true), 650);
    const returnToResults = window.setTimeout(() => setFlipped(false), 1550);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(returnToResults);
    };
  }, [celebrate]);

  const toggleFlip = useCallback(() => {
    if (!CARD_FEATURES.flipSide) return;
    // Reset tilt to flat so the flip rotation animates cleanly on its own.
    tilt.onPointerLeave();
    setFlipped(f => !f);
  }, [tilt]);

  const header = (
    <div className="relative px-4 pt-4 pb-3 border-b border-white/10">
      <div className="flex items-center gap-2.5">
        {CARD_FEATURES.atlasSeal ? (
          <span className={celebrate ? 'animate-pulse drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]' : ''}>
            <AtlasSeal />
          </span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-atlas-gold to-atlas-gold-dark text-black">
            <ShieldCheck size={15} strokeWidth={2.5} />
          </span>
        )}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white leading-none">
            Atlas Verified<span className="text-atlas-gold">&trade;</span>
          </p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-atlas-gold">
            Digital Certificate of Analysis
          </p>
          {CARD_FEATURES.atlasSeal && (
            <p className="mt-1 font-mono text-[7px] tracking-[0.14em] text-neutral-500">
              {sealLocked ? 'SEAL LOCKED · ' : 'SIG SHA-256 · '}
              {signature.slice(0, 12)}&hellip;
              {typeof readinessPercent === 'number' ? ` · ${readinessPercent}%` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const front = (
    <div
      className={`relative ${CARD_FACE_CLASS}`}
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      <CardTexture />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10" style={tilt.glare} />
      <span className="absolute right-3 top-3 rotate-2 rounded border border-amber-300/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-amber-300/80">
        {stageBadge}
      </span>

      {header}

      <div className="relative px-4 py-3 space-y-2.5">
        <p className="text-lg font-extrabold uppercase tracking-[0.12em] text-white leading-none">
          {sample ? typeLabel(sample) : 'Sample'}
        </p>

        <div className="flex items-baseline justify-between gap-3 text-[9px] font-mono uppercase tracking-wider text-neutral-400">
          <span className="shrink-0">Product</span>
          <FieldValue value={name} placeholderWidth="w-28" />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[9px] font-mono uppercase tracking-wider text-neutral-400">
          <span className="shrink-0">Client / Lot</span>
          <FieldValue value={clientLot} placeholderWidth="w-20" />
        </div>
        {claim ? (
          <div className="flex items-baseline justify-between gap-3 text-[9px] font-mono uppercase tracking-wider text-neutral-400">
            <span className="shrink-0">Label claim</span>
            <FieldValue value={claim} placeholderWidth="w-16" />
          </div>
        ) : null}

        {CARD_FEATURES.accessionHero ? (
          <div className="rounded-lg border border-atlas-gold/25 bg-atlas-gold/[0.06] px-3 py-2 text-center">
            <p className="text-[7px] font-bold uppercase tracking-[0.24em] text-neutral-400">Accession</p>
            <p className="mt-0.5 font-mono text-xl font-extrabold tracking-[0.18em] text-atlas-gold">
              {accessionDisplay ?? accessionGhost}
            </p>
            <p className="text-[7px] uppercase tracking-[0.18em] text-neutral-500">
              {accessionDisplay ? 'Assigned at intake' : 'Locks in at lab intake'}
            </p>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3 text-[9px] font-mono uppercase tracking-wider text-neutral-400">
            <span className="shrink-0">Accession</span>
            <span className="font-bold text-atlas-gold">{accessionDisplay ?? 'Assigned at intake'}</span>
          </div>
        )}

        <div className="flex gap-1.5 pt-0.5">
          <PendingChip label="Identity" status={identityChipStatus} />
          <PendingChip label="Purity" status={chipSt} value={purityChipValue} />
          <PendingChip label="Quantity" status={chipSt} value={quantityChipValue} />
        </div>
        {(showEndotoxin || showSterility || showHeavyMetals || fentanyl) && (
          <div className="flex flex-wrap gap-1.5">
            {showHeavyMetals && <PendingChip label="Heavy metals" status={chipSt} />}
            {showEndotoxin && <PendingChip label="Endotoxin" status={chipSt} />}
            {showSterility && <PendingChip label="Sterility" status={chipSt} />}
            {fentanyl && <PendingChip label="Fentanyl" status={chipSt} />}
          </div>
        )}
      </div>

      {showConformityChart && (
        <div className="relative px-4 pb-3">
          <p className="mb-1 text-[8px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Conformity Testing{' '}
            <span className="text-atlas-gold">
              / {chartVials} vial{chartVials === 1 ? '' : 's'}
            </span>
          </p>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <ConformityChart series={assaySeries} />
          </div>
        </div>
      )}

      <div className="relative flex items-center justify-between border-t border-white/10 px-4 py-2.5">
        <div aria-hidden="true" className="flex h-5 items-end gap-[2px]">
          {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 2, 1, 2].map((wgt, i) => (
            <span
              key={i}
              className="inline-block bg-neutral-300"
              style={{ width: wgt, height: i % 4 === 0 ? 20 : 14 }}
            />
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-300">
          <QrCode size={12} className="text-atlas-gold" />
          Scan to verify
        </span>
      </div>
    </div>
  );

  const back = CARD_FEATURES.flipSide ? (
    <div
      className={`absolute inset-0 flex flex-col ${CARD_FACE_CLASS}`}
      style={{
        position: 'absolute',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: 'rotateY(180deg)',
      }}
    >
      <CardTexture />

      {header}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        <p className="text-[8px] font-bold uppercase tracking-[0.24em] text-neutral-400">Public Verification</p>

        <div className="mt-2 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-atlas-gold/30 bg-atlas-black">
            <QrCode size={26} className="text-atlas-gold" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[8px] font-bold text-white">
              atlasanalytics.com/verify/{accessionDisplay ?? accessionGhost}
            </p>
            <p className="mt-0.5 text-[7px] leading-relaxed text-neutral-400">
              Live LIMS verify · no account required
            </p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] font-mono uppercase tracking-wider text-neutral-400">
          <div className="flex items-baseline justify-between gap-2 col-span-2">
            <span className="shrink-0">SHA-256</span>
            <span className="truncate font-bold text-atlas-gold">{signature.slice(0, 16)}&hellip;</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="shrink-0">Chemist</span>
            <span className="font-bold text-white">At issue</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="shrink-0">Intake</span>
            <span className="font-bold text-white">Pending</span>
          </div>
        </div>

        <div
          className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-2 pr-0.5"
          onClick={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
        >
          <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.24em] text-neutral-400">
            Methods on this order
          </p>
          <ul className="space-y-1.5">
            {methods.map(m => (
              <li key={m.key} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-white">{m.label}</p>
                  <p className="shrink-0 font-mono text-[7px] font-bold uppercase tracking-[0.14em] text-atlas-gold">
                    {m.instrument}
                  </p>
                </div>
                <p className="mt-0.5 text-[8px] leading-snug text-neutral-400 normal-case tracking-normal">
                  {m.blurb}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-2 shrink-0 text-center text-[7px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          Tamper-evident · hashed &amp; signed at issue
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative isolate rounded-2xl ${celebrate ? 'animate-pulse ring-2 ring-atlas-gold/70 ring-offset-4 ring-offset-transparent' : ''}`}>
      <div className="relative overflow-visible">
        <div
          ref={tilt.ref}
          onPointerMove={flipped ? undefined : tilt.onPointerMove}
          onPointerLeave={flipped ? undefined : tilt.onPointerLeave}
          onClick={toggleFlip}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleFlip();
            }
          }}
          role={CARD_FEATURES.flipSide ? 'button' : undefined}
          tabIndex={CARD_FEATURES.flipSide ? 0 : undefined}
          aria-pressed={CARD_FEATURES.flipSide ? flipped : undefined}
          aria-label={CARD_FEATURES.flipSide ? 'Digital COA preview card — activate to flip' : undefined}
          style={{ ...tilt.style, perspective: '1100px', transformStyle: 'preserve-3d' }}
          className={`relative will-change-transform touch-manipulation ${CARD_FEATURES.flipSide ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-atlas-gold' : ''}`}
        >
          <div
            className="relative"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {front}
            {back}
          </div>
        </div>

        {CARD_FEATURES.flipSide && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              toggleFlip();
            }}
            className="absolute -right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-atlas-gold/60 bg-atlas-black text-atlas-gold shadow-lg transition-colors hover:bg-atlas-gold hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-gold"
            aria-label={flipped ? 'Flip back to results preview' : 'Flip to verification side'}
            title={flipped ? 'Show front' : 'Show verification side'}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-atlas-gold">
        {CARD_FEATURES.flipSide
          ? flipped
            ? 'Verification side'
            : filled
              ? 'Your digital COA preview'
              : 'Digital COA preview'
          : filled
            ? 'Your digital COA preview'
            : 'Digital COA preview'}
        {CARD_FEATURES.flipSide && (
          <span className="ml-1.5 normal-case font-semibold tracking-normal text-neutral-400">· click to flip</span>
        )}
      </p>
    </div>
  );
}
