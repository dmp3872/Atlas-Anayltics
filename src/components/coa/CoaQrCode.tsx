import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { verifyUrl } from '../../lib/coaVerify';

export default function CoaQrCode({ slug, size = 120, label = 'Scan to verify' }: { slug: string; size?: number; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = verifyUrl(slug);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [url, size]);

  return (
    <div className="flex flex-col items-center gap-2 print:block">
      <canvas ref={canvasRef} className="rounded border border-atlas-border bg-white" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 text-center">{label}</p>
      <p className="text-[9px] font-mono text-neutral-400 break-all text-center max-w-[140px] print:text-black">{slug}</p>
    </div>
  );
}
