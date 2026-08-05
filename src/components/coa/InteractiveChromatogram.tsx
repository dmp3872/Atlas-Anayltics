import { useMemo, useState } from 'react';
import { AtlasWatermark } from '../brand/AtlasLogo';
import { COA_CHROMATOGRAM_ZOOM } from '../../lib/coaImages';
import { hasMeasuredChromatogram } from '../../lib/chromatogramParse';
import { COA } from '../../lib/types';

const GOLD = '#C5A059';
const GRID = '#E8E8E8';

function generateDemoPoints() {
  const pts: { x: number; y: number }[] = [];
  for (let x = 0; x <= 20; x += 0.2) {
    const peak1 = 0.5 * Math.exp(-Math.pow(x - 4, 2) / 0.3);
    const peak2 = 1.0 * Math.exp(-Math.pow(x - 8, 2) / 0.5);
    const peak3 = 0.8 * Math.exp(-Math.pow(x - 12.4, 2) / 0.8);
    pts.push({ x: Math.round(x * 10) / 10, y: Math.max(0, peak1 + peak2 + peak3 + Math.random() * 0.02) });
  }
  return pts;
}

/** Local maxima for static RT annotations on print/PDF (not hover-only). */
function findLabeledPeaks(
  points: { x: number; y: number }[],
  minY: number,
  spanY: number,
): { x: number; y: number }[] {
  if (points.length < 3) return points.slice(0, 1);
  const minRel = 0.12;
  const minSep = Math.max(0.45, (points[points.length - 1].x - points[0].x) * 0.04);
  const candidates: { x: number; y: number }[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (cur.y < prev.y || cur.y < next.y) continue;
    if ((cur.y - minY) / spanY < minRel) continue;
    const last = candidates[candidates.length - 1];
    if (last && Math.abs(cur.x - last.x) < minSep) {
      if (cur.y > last.y) candidates[candidates.length - 1] = cur;
      continue;
    }
    candidates.push(cur);
  }
  if (candidates.length === 0) {
    const main = points.reduce((a, b) => (b.y > a.y ? b : a), points[0]);
    return [main];
  }
  // Cap labels so dense traces stay readable in PDF.
  return candidates
    .slice()
    .sort((a, b) => b.y - a.y)
    .slice(0, 6)
    .sort((a, b) => a.x - b.x);
}

function WatermarkLayer({ logoWatermark }: { logoWatermark?: string }) {
  if (logoWatermark) {
    return (
      <img
        src={logoWatermark}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 m-auto max-h-[58%] max-w-[48%] object-contain opacity-[0.18] pointer-events-none z-[1]"
      />
    );
  }
  return <AtlasWatermark className="absolute inset-0 m-auto w-28 h-28 opacity-[0.14] pointer-events-none z-[1]" />;
}

export default function InteractiveChromatogram({
  data,
  chromatographPhoto,
  backgroundImage,
  logoWatermark,
}: {
  data: COA['chromatogram_data'];
  /** Chemist-uploaded unique HPLC / chromatograph photo. */
  chromatographPhoto?: string;
  /** Optional faint background (rare). */
  backgroundImage?: string;
  /** Client company logo — faint watermark over the chromatograph. */
  logoWatermark?: string;
}) {
  const photo = (chromatographPhoto || '').trim();
  const measured = hasMeasuredChromatogram(data);

  const points = useMemo(() => {
    const raw = data?.points;
    if (Array.isArray(raw) && raw.length > 1) return raw;
    return generateDemoPoints();
  }, [data?.points]);

  const width = 720;
  const height = 230;
  const padL = 28;
  const padR = 12;
  const padB = 40;
  const padT = 22;
  const innerW = width - padL - padR;
  const innerH = height - padB - padT;

  const ys = points.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = Math.max(maxY - minY, 1e-9);
  const maxX = points[points.length - 1]?.x || 1;
  const minX = points[0]?.x ?? 0;
  const spanX = Math.max(maxX - minX, 1e-9);

  const minuteTicks = useMemo(() => {
    const ticks: number[] = [];
    const first = Math.ceil(minX - 1e-9);
    const last = Math.floor(maxX + 1e-9);
    for (let m = first; m <= last; m += 1) ticks.push(m);
    // Short runs that don't cross an integer still get endpoint minutes.
    if (ticks.length === 0) {
      ticks.push(Math.round(minX));
      if (Math.round(maxX) !== Math.round(minX)) ticks.push(Math.round(maxX));
    }
    return ticks;
  }, [minX, maxX]);

  // Label every minute on typical HPLC runs; thin labels only on very long traces.
  const labelEvery = spanX > 45 ? 5 : spanX > 30 ? 2 : 1;

  const labeledPeaks = useMemo(
    () => findLabeledPeaks(points, minY, spanY),
    [points, minY, spanY],
  );

  const projectX = (x: number) => padL + ((x - minX) / spanX) * innerW;
  const projectY = (y: number) => padT + (1 - (y - minY) / spanY) * innerH;

  const [hover, setHover] = useState<{ x: number; y: number; rt: number; intensity: number } | null>(null);

  const pathD = points.map((p, i) => {
    const x = projectX(p.x);
    const y = projectY(p.y);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * width;
    if (mx < padL || mx > width - padR) { setHover(null); return; }
    const rt = minX + ((mx - padL) / innerW) * spanX;
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - rt) < Math.abs(nearest.x - rt)) nearest = p;
    }
    setHover({
      x: projectX(nearest.x),
      y: projectY(nearest.y),
      rt: nearest.x,
      intensity: nearest.y,
    });
  }

  const mainPeak = points.reduce((a, b) => (b.y > a.y ? b : a), points[0]);
  const relIntensity = ((mainPeak.y - minY) / spanY) * 100;

  // Photo fills the certificate when we don't have measured HPLC points.
  // Measured raw data always drives the interactive digital chromatogram.
  if (photo && !measured) {
    return (
      <div className="coa-chrom-photo relative border border-atlas-border bg-white overflow-hidden flex flex-col h-full min-h-[9.5rem]">
        <div className="relative px-3 pt-1.5 pb-1 flex items-center justify-center shrink-0 z-[2] bg-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700 text-center leading-normal">
            HPLC Chromatogram Report
          </p>
        </div>
        <div className="relative flex-1 min-h-[8.5rem] overflow-hidden bg-white">
          <img
            src={photo}
            alt="HPLC chromatograph"
            className="absolute inset-0 m-auto w-full h-full object-contain object-center bg-white"
            style={{ transform: `scale(${COA_CHROMATOGRAM_ZOOM})` }}
          />
          <WatermarkLayer logoWatermark={logoWatermark} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative border border-atlas-border bg-white overflow-hidden flex flex-col h-full min-h-0">
      {backgroundImage && (
        <img src={backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none" />
      )}
      <WatermarkLayer logoWatermark={logoWatermark} />
      <div className="relative px-3 pt-2 pb-0.5 flex items-center justify-center shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700 text-center">
          HPLC Chromatogram Report
        </p>
        {measured && (
          <p className="absolute left-3 top-2 text-[8px] font-bold uppercase tracking-[0.14em] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
            Measured
          </p>
        )}
        {(data?.retention_time || (measured && mainPeak)) && (
          <p className="absolute right-3 top-2 text-[8px] font-mono font-semibold text-neutral-600 bg-white/90 px-1.5 py-0.5 rounded border border-atlas-border">
            Main RT {(data?.retention_time ?? mainPeak.x).toFixed(2)} min
            {measured ? ` · ${relIntensity.toFixed(0)}%` : ''}
          </p>
        )}
        {hover && (
          <p className="absolute right-3 top-7 text-[10px] font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200 no-print">
            RT {hover.rt.toFixed(2)} · {(((hover.intensity - minY) / spanY) * 100).toFixed(1)}% rel.
          </p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative w-full flex-1 min-h-[9.5rem] cursor-crosshair coa-chrom-svg"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} y1={padT + (1 - t) * innerH} x2={width - padR} y2={padT + (1 - t) * innerH} stroke={GRID} strokeWidth="1" />
        ))}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="#999" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke="#999" strokeWidth="1" />
        {/* Vertical minute grid + static RT axis numbers (survive PDF rasterization) */}
        {minuteTicks.map(m => {
          const x = projectX(m);
          const showLabel = m % labelEvery === 0;
          return (
            <g key={`min-${m}`}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={height - padB}
                stroke="#ECECEC"
                strokeWidth="1"
              />
              <line
                x1={x}
                y1={height - padB}
                x2={x}
                y2={height - padB + (showLabel ? 6 : 3)}
                stroke="#555"
                strokeWidth="1.25"
              />
              {showLabel && (
                <text
                  x={x}
                  y={height - 14}
                  fill="#222"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  textAnchor="middle"
                  className="coa-chrom-rt-label"
                >
                  {m}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={(padL + width - padR) / 2}
          y={height - 3}
          fill="#666"
          fontSize="8"
          fontWeight="600"
          textAnchor="middle"
          className="coa-chrom-rt-label"
        >
          Retention time (min)
        </text>
        <path d={pathD} stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Static peak RT callouts — visible on screen and in downloaded PDF */}
        {labeledPeaks.map(peak => {
          const cx = projectX(peak.x);
          const cy = projectY(peak.y);
          const label = peak.x.toFixed(2);
          const labelY = Math.max(padT + 2, cy - 10);
          return (
            <g key={`rt-${peak.x.toFixed(3)}-${peak.y.toFixed(4)}`} className="coa-chrom-rt-peak">
              <line
                x1={cx}
                y1={cy - 5}
                x2={cx}
                y2={labelY + 2}
                stroke={GOLD}
                strokeWidth="1"
                opacity="0.55"
              />
              <circle
                cx={cx}
                cy={cy}
                r="3.5"
                fill={GOLD}
                stroke="#fff"
                strokeWidth="1.25"
              />
              <rect
                x={cx - 18}
                y={labelY - 10}
                width="36"
                height="12"
                rx="2"
                fill="#fff"
                stroke={GOLD}
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={cx}
                y={labelY - 1}
                fill="#1a1a1a"
                fontSize="9"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                textAnchor="middle"
                className="coa-chrom-rt-label"
              >
                {label}
              </text>
            </g>
          );
        })}
        {hover && (
          <>
            <line x1={hover.x} y1={padT} x2={hover.x} y2={height - padB} stroke={GOLD} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
            <circle cx={hover.x} cy={hover.y} r="5" fill={GOLD} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      <p className="text-[10px] text-neutral-400 px-3 pb-2 no-print shrink-0">
        {measured
          ? 'Interactive trace from uploaded HPLC data — hover to inspect retention time and intensity.'
          : 'Hover over the trace to inspect retention time and peak intensity.'}
      </p>
    </div>
  );
}
