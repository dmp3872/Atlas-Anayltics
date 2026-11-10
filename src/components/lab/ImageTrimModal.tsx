import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Loader, X } from 'lucide-react';
import { trimImageWhitespace } from '../../lib/coaImages';

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';

interface Props {
  src: string;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
  /** Suggested portrait frame for vials (~2:3). Chemist can unlock Free. */
  defaultAspect?: number | null;
  title?: string;
}

const MIN = 24;

function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  let { x, y, w, h } = r;
  w = Math.max(MIN, Math.min(w, maxW));
  h = Math.max(MIN, Math.min(h, maxH));
  x = Math.max(0, Math.min(x, maxW - w));
  y = Math.max(0, Math.min(y, maxH - h));
  return { x, y, w, h };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

export default function ImageTrimModal({
  src,
  onApply,
  onClose,
  defaultAspect = 2 / 3,
  title = 'Trim vial photo',
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [display, setDisplay] = useState({ w: 0, h: 0, scale: 1 });
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 100, h: 100 });
  const [aspect, setAspect] = useState<number | null>(defaultAspect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    origin: Rect;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImage(src).then(img => {
      if (cancelled) return;
      const nw = img.naturalWidth || img.width;
      const nh = img.naturalHeight || img.height;
      setNatural({ w: nw, h: nh });
      const maxW = Math.min(720, window.innerWidth - 48);
      const maxH = Math.min(520, window.innerHeight - 220);
      const scale = Math.min(maxW / nw, maxH / nh, 1);
      const dw = Math.max(1, Math.round(nw * scale));
      const dh = Math.max(1, Math.round(nh * scale));
      setDisplay({ w: dw, h: dh, scale });
      const a = defaultAspect;
      let w = dw * 0.86;
      let h = a ? w / a : dh * 0.86;
      if (h > dh * 0.92) {
        h = dh * 0.92;
        w = a ? h * a : w;
      }
      setCrop(clampRect({
        x: (dw - w) / 2,
        y: (dh - h) / 2,
        w,
        h,
      }, dw, dh));
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load image.');
    });
    return () => { cancelled = true; };
  }, [src, defaultAspect]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d || !display.w) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const next = { ...d.origin };
      const { handle } = d;
      if (handle === 'move') {
        next.x = d.origin.x + dx;
        next.y = d.origin.y + dy;
      } else {
        if (handle.includes('e')) next.w = d.origin.w + dx;
        if (handle.includes('s')) next.h = d.origin.h + dy;
        if (handle.includes('w')) {
          next.x = d.origin.x + dx;
          next.w = d.origin.w - dx;
        }
        if (handle.includes('n')) {
          next.y = d.origin.y + dy;
          next.h = d.origin.h - dy;
        }
        if (aspect) {
          if (handle === 'e' || handle === 'w') next.h = next.w / aspect;
          else if (handle === 'n' || handle === 's') next.w = next.h * aspect;
          else {
            next.h = next.w / aspect;
            if (handle.includes('n')) next.y = d.origin.y + d.origin.h - next.h;
            if (handle.includes('w')) next.x = d.origin.x + d.origin.w - next.w;
          }
        }
      }
      setCrop(clampRect(next, display.w, display.h));
    }
    function onUp() {
      drag.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [aspect, display.w, display.h]);

  function startDrag(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...crop },
    };
  }

  async function applyCrop() {
    if (!natural.w || busy) return;
    setBusy(true);
    setError('');
    try {
      const img = await loadImage(src);
      const sx = Math.round(crop.x / display.scale);
      const sy = Math.round(crop.y / display.scale);
      const sw = Math.max(1, Math.round(crop.w / display.scale));
      const sh = Math.max(1, Math.round(crop.h / display.scale));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not crop image.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      onApply(canvas.toDataURL('image/jpeg', 0.92));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop image.');
    } finally {
      setBusy(false);
    }
  }

  async function autoTrim() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const trimmed = await trimImageWhitespace(src, { padRatio: 0.04, threshold: 248 });
      if (!trimmed) throw new Error('Auto trim could not find the vial edges.');
      onApply(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto trim failed.');
    } finally {
      setBusy(false);
    }
  }

  const handles: Handle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
  const handleStyle = (h: Handle): React.CSSProperties => {
    const size = 12;
    const half = size / 2;
    const midX = crop.x + crop.w / 2 - half;
    const midY = crop.y + crop.h / 2 - half;
    const map: Record<Handle, React.CSSProperties> = {
      nw: { left: crop.x - half, top: crop.y - half, cursor: 'nwse-resize' },
      n: { left: midX, top: crop.y - half, cursor: 'ns-resize' },
      ne: { left: crop.x + crop.w - half, top: crop.y - half, cursor: 'nesw-resize' },
      w: { left: crop.x - half, top: midY, cursor: 'ew-resize' },
      e: { left: crop.x + crop.w - half, top: midY, cursor: 'ew-resize' },
      sw: { left: crop.x - half, top: crop.y + crop.h - half, cursor: 'nesw-resize' },
      s: { left: midX, top: crop.y + crop.h - half, cursor: 'ns-resize' },
      se: { left: crop.x + crop.w - half, top: crop.y + crop.h - half, cursor: 'nwse-resize' },
      move: {},
    };
    return {
      position: 'absolute',
      width: size,
      height: size,
      background: '#fff',
      border: '2px solid #b45309',
      borderRadius: 2,
      ...map[h],
    };
  };

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-trim-title"
        className="relative z-[1] w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl border border-atlas-border shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-atlas-border">
          <div>
            <h2 id="image-trim-title" className="text-lg font-bold text-black inline-flex items-center gap-2">
              <Crop size={18} className="text-brand-600" />
              {title}
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Drag the box to frame the vial. Corners resize. Apply saves the cropped photo to this COA.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5 shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAspect(2 / 3)}
              className={`btn-outline text-xs py-1.5 ${aspect === 2 / 3 ? 'border-brand-500 bg-brand-50' : ''}`}
            >
              Portrait (COA)
            </button>
            <button
              type="button"
              onClick={() => setAspect(null)}
              className={`btn-outline text-xs py-1.5 ${aspect == null ? 'border-brand-500 bg-brand-50' : ''}`}
            >
              Free
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void autoTrim()}
              className="btn-outline text-xs py-1.5 disabled:opacity-50"
              title="Trim empty white margins automatically"
            >
              Auto trim edges
            </button>
          </div>

          <div className="flex justify-center bg-neutral-100 rounded-xl border border-atlas-border p-3 overflow-auto">
            {display.w > 0 ? (
              <div
                ref={stageRef}
                className="relative select-none"
                style={{ width: display.w, height: display.h }}
              >
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                <div
                  className="absolute border-2 border-amber-500 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] cursor-move z-[1]"
                  style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
                  onPointerDown={e => startDrag('move', e)}
                />
                {handles.map(h => (
                  <div
                    key={h}
                    role="presentation"
                    className="z-[2]"
                    style={handleStyle(h)}
                    onPointerDown={e => startDrag(h, e)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 py-16 inline-flex items-center gap-2">
                <Loader size={14} className="animate-spin" /> Loading image…
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-atlas-border bg-neutral-50">
          <button type="button" onClick={onClose} className="btn-outline text-sm py-2" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void applyCrop()}
            disabled={busy || !display.w}
            className="btn-primary text-sm py-2 gap-2 disabled:opacity-50"
          >
            {busy ? <Loader size={14} className="animate-spin" /> : <Crop size={14} />}
            Apply trim
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
