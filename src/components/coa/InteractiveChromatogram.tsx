import { useMemo, useState } from 'react';
import { AtlasWatermark } from '../brand/AtlasLogo';
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

  const points = useMemo(() => {
    const raw = data?.points;
    if (Array.isArray(raw) && raw.length > 1) return raw;
    return generateDemoPoints();
  }, [data?.points]);
  const maxY = Math.max(...points.map(p => p.y), 0.0001);
  const width = 720;
  const height = 200;
  const padL = 18;
  const padR = 8;
  const padB = 22;
  const padT = 8;
  const innerW = width - padL - padR;
  const innerH = height - padB - padT;

  const [hover, setHover] = useState<{ x: number; y: number; rt: number; intensity: number } | null>(null);

  const pathD = points.map((p, i) => {
    const x = padL + (p.x / (points[points.length - 1]?.x || 1)) * innerW;
    const y = padT + (1 - p.y / maxY) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * width;
    if (mx < padL || mx > width - padR) { setHover(null); return; }
    const rt = ((mx - padL) / innerW) * (points[points.length - 1]?.x || 20);
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - rt) < Math.abs(nearest.x - rt)) nearest = p;
    }
    setHover({ x: mx, y: padT + (1 - nearest.y / maxY) * innerH, rt: nearest.x, intensity: nearest.y });
  }

  const mainPeak = points.reduce((a, b) => (b.y > a.y ? b : a), points[0]);

  // Unique uploaded chromatograph takes priority over the interactive SVG demo.
  if (photo) {
    return (
      <div className="relative border border-atlas-border bg-white overflow-hidden flex flex-col h-full min-h-[9.5rem]">
        <div className="relative px-3 pt-2 pb-0.5 flex items-center justify-between shrink-0 z-[2]">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
            HPLC Chromatogram Report
          </p>
        </div>
        <div className="relative flex-1 min-h-[8.5rem]">
          <img
            src={photo}
            alt="HPLC chromatograph"
            className="absolute inset-0 w-full h-full object-contain bg-white"
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
      <div className="relative px-3 pt-2 pb-0.5 flex items-center justify-between shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
          HPLC Chromatogram Report
        </p>
        {hover && (
          <p className="text-[10px] font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
            RT {hover.rt.toFixed(2)} min · {((hover.intensity / maxY) * 100).toFixed(1)}% rel. intensity
          </p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="relative w-full flex-1 min-h-[9.5rem] cursor-crosshair coa-chrom-svg"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} y1={padT + (1 - t) * innerH} x2={width - padR} y2={padT + (1 - t) * innerH} stroke={GRID} strokeWidth="1" />
        ))}
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="#999" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke="#999" strokeWidth="1" />
        <path d={pathD} stroke={GOLD} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {mainPeak && (
          <circle
            cx={padL + (mainPeak.x / (points[points.length - 1]?.x || 1)) * innerW}
            cy={padT + (1 - mainPeak.y / maxY) * innerH}
            r="4"
            fill={GOLD}
            stroke="#fff"
            strokeWidth="1.5"
          />
        )}
        {hover && (
          <>
            <line x1={hover.x} y1={padT} x2={hover.x} y2={height - padB} stroke={GOLD} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
            <circle cx={hover.x} cy={hover.y} r="5" fill={GOLD} stroke="#fff" strokeWidth="2" />
          </>
        )}
        <text x={padL} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">0 min</text>
        <text x={padL + innerW} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">
          {(points[points.length - 1]?.x ?? 20).toFixed(0)} min
        </text>
        {data?.retention_time && (
          <text x={width / 2} y={height - 6} fill="#666" fontSize="9" textAnchor="middle">
            Main RT: {data.retention_time} min
          </text>
        )}
      </svg>
      <p className="text-[10px] text-neutral-400 px-3 pb-2 no-print shrink-0">Hover over the trace to inspect retention time and peak intensity.</p>
    </div>
  );
}
