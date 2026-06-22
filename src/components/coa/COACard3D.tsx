import { useRef, useState, MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Shield, FlaskConical, ExternalLink } from 'lucide-react';
import { COA, PanelResult } from '../../lib/types';
import { formatDate } from '../../lib/utils';

const MAX_TILT = 12;
const SHINE_OPACITY = 0.18;

function PanelDot({ r }: { r: PanelResult }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const color = r.pass
    ? 'bg-emerald-400 border-emerald-300 hover:bg-emerald-300'
    : 'bg-red-400 border-red-300 hover:bg-red-300';

  return (
    <div className="relative">
      <button
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className={`w-2.5 h-2.5 rounded-full border transition-all duration-150 ${color} focus:outline-none`}
        aria-label={r.panel_name}
      />
      {show && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          style={{ minWidth: 220 }}
        >
          <div className="bg-slate-900 text-white text-xs rounded-xl shadow-2xl px-3.5 py-3 border border-slate-700">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold text-slate-100 leading-tight">{r.panel_name}</span>
              {r.pass
                ? <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs flex-shrink-0"><CheckCircle size={10} /> Pass</span>
                : <span className="flex items-center gap-1 text-red-400 font-semibold text-xs flex-shrink-0"><XCircle size={10} /> Fail</span>
              }
            </div>
            <div className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Result</span>
                <span className="font-medium text-slate-200">{r.result}{r.unit ? ` ${r.unit}` : ''}</span>
              </div>
              {r.specification && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Spec</span>
                  <span className="font-medium text-slate-200">{r.specification}</span>
                </div>
              )}
            </div>
            {(r as PanelResult & { description?: string }).description && (
              <p className="mt-2 text-slate-400 leading-snug text-[10px] border-t border-slate-700 pt-2">
                {(r as PanelResult & { description?: string }).description}
              </p>
            )}
          </div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 mx-auto" />
        </div>
      )}
    </div>
  );
}

function MiniChromatogram({ points, retentionTime }: { points?: { x: number; y: number }[]; retentionTime?: number }) {
  if (!points || points.length < 2) return null;
  const w = 200;
  const h = 44;
  const maxX = points[points.length - 1]?.x || 20;
  const maxY = Math.max(...points.map(p => p.y), 0.01);
  const toSvg = (p: { x: number; y: number }) => ({
    x: (p.x / maxX) * w,
    y: h - (p.y / maxY) * (h - 4) - 2,
  });
  const pathD = points.map((p, i) => {
    const { x, y } = toSvg(p);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const areaD = pathD + ` L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 44 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`cg-${retentionTime}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#cg-${retentionTime})`} />
      <path d={pathD} stroke="#14b8a6" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface COACard3DProps {
  coa: COA;
}

export default function COACard3D({ coa }: COACard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('');
  const [shine, setShine] = useState({ x: 50, y: 50, opacity: 0 });
  const [hovering, setHovering] = useState(false);

  const panelResults: (PanelResult & { description?: string })[] = Array.isArray(coa.panel_results)
    ? coa.panel_results
    : [];

  const passCount = panelResults.filter(r => r.pass).length;
  const failCount = panelResults.filter(r => !r.pass).length;
  const chromPoints = coa.chromatogram_data?.points;
  const retentionTime = coa.chromatogram_data?.retention_time;

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    const rotX = -dy * MAX_TILT;
    const rotY = dx * MAX_TILT;
    setTransform(`perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.03,1.03,1.03)`);
    const sx = ((e.clientX - rect.left) / rect.width) * 100;
    const sy = ((e.clientY - rect.top) / rect.height) * 100;
    setShine({ x: sx, y: sy, opacity: SHINE_OPACITY });
  }

  function onMouseLeave() {
    setTransform('perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
    setShine(s => ({ ...s, opacity: 0 }));
    setHovering(false);
  }

  function onMouseEnter() {
    setHovering(true);
  }

  const overallColor = coa.overall_result === 'pass'
    ? { bg: 'from-emerald-950 to-slate-900', accent: '#10b981', textAccent: 'text-emerald-400', borderAccent: 'border-emerald-500/30' }
    : coa.overall_result === 'fail'
    ? { bg: 'from-red-950 to-slate-900', accent: '#ef4444', textAccent: 'text-red-400', borderAccent: 'border-red-500/30' }
    : { bg: 'from-amber-950 to-slate-900', accent: '#f59e0b', textAccent: 'text-amber-400', borderAccent: 'border-amber-500/30' };

  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseEnter={onMouseEnter}
      className="relative select-none cursor-pointer"
      style={{
        transform: transform || 'perspective(900px)',
        transition: hovering ? 'transform 0.08s ease-out' : 'transform 0.45s cubic-bezier(0.23, 1, 0.32, 1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
    >
      <div
        className={`relative rounded-2xl bg-gradient-to-br ${overallColor.bg} border ${overallColor.borderAccent} shadow-2xl overflow-hidden`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none z-10 transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,${shine.opacity * 2}) 0%, rgba(255,255,255,${shine.opacity * 0.3}) 40%, transparent 70%)`,
            opacity: shine.opacity > 0 ? 1 : 0,
          }}
        />

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="p-5" style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600/30 border border-brand-500/30 flex items-center justify-center flex-shrink-0"
                style={{ transform: 'translateZ(8px)' }}>
                <FlaskConical size={14} className="text-brand-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none mb-0.5">Atlas Analytics</p>
                <p className="text-[9px] text-slate-600 font-mono">COA</p>
              </div>
            </div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${overallColor.borderAccent} bg-white/5`}
              style={{ transform: 'translateZ(6px)' }}>
              {coa.overall_result === 'pass'
                ? <><CheckCircle size={10} className="text-emerald-400" /><span className="text-emerald-400">PASS</span></>
                : coa.overall_result === 'fail'
                ? <><XCircle size={10} className="text-red-400" /><span className="text-red-400">FAIL</span></>
                : <><Clock size={10} className="text-amber-400" /><span className="text-amber-400">PENDING</span></>
              }
            </div>
          </div>

          <div style={{ transform: 'translateZ(14px)' }}>
            <h3 className="text-lg font-bold text-white leading-tight mb-0.5 truncate">
              {coa.display_name || coa.sample_name}
            </h3>
            <p className="text-xs text-slate-400 truncate">{coa.sample_name}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2" style={{ transform: 'translateZ(10px)' }}>
            {coa.purity_percent != null && (
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Purity</p>
                <p className="text-2xl font-bold text-white mt-0.5">{coa.purity_percent}<span className="text-sm text-slate-400">%</span></p>
              </div>
            )}
            {coa.molecular_weight != null && (
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Mol. Weight</p>
                <p className="text-2xl font-bold text-white mt-0.5 leading-none">{coa.molecular_weight}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Da</p>
              </div>
            )}
          </div>

          {chromPoints && chromPoints.length > 1 && (
            <div className="mt-3 rounded-xl overflow-hidden bg-white/5 border border-white/10" style={{ transform: 'translateZ(6px)' }}>
              <MiniChromatogram points={chromPoints} retentionTime={retentionTime} />
            </div>
          )}

          {panelResults.length > 0 && (
            <div className="mt-4" style={{ transform: 'translateZ(16px)' }}>
              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Test Panel · hover to inspect
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {panelResults.map((r, i) => <PanelDot key={i} r={r} />)}
                <span className="text-[10px] text-slate-500 ml-1">
                  {passCount}P {failCount > 0 ? `${failCount}F` : ''}
                </span>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between" style={{ transform: 'translateZ(8px)' }}>
            <div className="flex items-center gap-1.5">
              <Shield size={9} className="text-brand-500" />
              <span className="text-[9px] font-mono text-slate-500 truncate max-w-[120px]">
                {coa.content_hash?.slice(0, 14)}…
              </span>
            </div>
            <div className="text-right">
              {coa.batch_number && <p className="text-[9px] text-slate-500 font-mono">{coa.batch_number}</p>}
              <p className="text-[9px] text-slate-500">{formatDate(coa.issued_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <Link
        to={`/coa/${coa.slug}`}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`View COA for ${coa.display_name || coa.sample_name}`}
        onClick={e => e.stopPropagation()}
      />

      <div className="mt-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{coa.display_name || coa.sample_name}</p>
        <Link
          to={`/coa/${coa.slug}`}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          <ExternalLink size={11} /> View
        </Link>
      </div>
    </div>
  );
}
