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

export default function InteractiveChromatogram({
  data,
  backgroundImage,
}: {
  data: COA['chromatogram_data'];
  backgroundImage?: string;
}) {
  const points = useMemo(() => data?.points ?? generateDemoPoints(), [data?.points]);
  const maxY = Math.max(...points.map(p => p.y));
  const width = 560;
  const height = 180;
  const padL = 40;
  const padB = 28;
  const innerW = width - padL - 20;
  const innerH = height - padB - 20;

  const [hover, setHover] = useState<{ x: number; y: number; rt: number; intensity: number } | null>(null);

  const pathD = points.map((p, i) => {
    const x = padL + (p.x / (points[points.length - 1]?.x || 1)) * innerW;
    const y = 14 + (1 - p.y / maxY) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * width;
    if (mx < padL || mx > width - 20) { setHover(null); return; }
    const rt = ((mx - padL) / innerW) * (points[points.length - 1]?.x || 20);
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - rt) < Math.abs(nearest.x - rt)) nearest = p;
    }
    setHover({ x: mx, y: 14 + (1 - nearest.y / maxY) * innerH, rt: nearest.x, intensity: nearest.y });
  }

  const mainPeak = points.reduce((a, b) => (b.y > a.y ? b : a), points[0]);

  return (
    <div className="relative border border-atlas-border bg-white overflow-hidden">
      {backgroundImage ? (
        <img src={backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" />
      ) : (
        <AtlasWatermark className="absolute inset-0 m-auto w-28 h-28 opacity-30 pointer-events-none" />
      )}
      <div className="relative px-4 pt-4 pb-1 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
          HPLC Chromatogram
        </p>
        {hover && (
          <p className="text-[10px] font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
            RT {hover.rt.toFixed(2)} min · {((hover.intensity / maxY) * 100).toFixed(1)}% rel. intensity
          </p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative w-full h-44 cursor-crosshair"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={padL} y1={14 + (1 - t) * innerH} x2={width - 20} y2={14 + (1 - t) * innerH} stroke={GRID} strokeWidth="1" />
        ))}
        <line x1={padL} y1={14} x2={padL} y2={height - padB} stroke="#999" strokeWidth="1" />
        <line x1={padL} y1={height - padB} x2={width - 20} y2={height - padB} stroke="#999" strokeWidth="1" />
        <path d={pathD} stroke={GOLD} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Main peak marker */}
        {mainPeak && (
          <circle
            cx={padL + (mainPeak.x / (points[points.length - 1]?.x || 1)) * innerW}
            cy={14 + (1 - mainPeak.y / maxY) * innerH}
            r="4"
            fill={GOLD}
            stroke="#fff"
            strokeWidth="1.5"
          />
        )}
        {hover && (
          <>
            <line x1={hover.x} y1={14} x2={hover.x} y2={height - padB} stroke={GOLD} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
            <circle cx={hover.x} cy={hover.y} r="5" fill={GOLD} stroke="#fff" strokeWidth="2" />
          </>
        )}
        <text x={padL} y={height - 8} fill="#666" fontSize="9" textAnchor="middle">0 min</text>
        <text x={padL + innerW} y={height - 8} fill="#666" fontSize="9" textAnchor="middle">
          {(points[points.length - 1]?.x ?? 20).toFixed(0)} min
        </text>
        {data?.retention_time && (
          <text x={width / 2} y={height - 8} fill="#666" fontSize="9" textAnchor="middle">
            Main RT: {data.retention_time} min
          </text>
        )}
      </svg>
      <p className="text-[10px] text-neutral-400 px-4 pb-3">Hover over the trace to inspect retention time and peak intensity.</p>
    </div>
  );
}
