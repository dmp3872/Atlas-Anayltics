import { verifyUrl } from '../../lib/coaVerify';

export default function CoaQrCode({ slug, size = 120, label = 'Scan to verify' }: { slug: string; size?: number; label?: string }) {
  const url = verifyUrl(slug);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;

  return (
    <div className="flex flex-col items-center gap-2 print:block">
      <img
        src={qrSrc}
        width={size}
        height={size}
        alt={label}
        className="rounded border border-atlas-border bg-white"
      />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 text-center">{label}</p>
      <p className="text-[9px] font-mono text-neutral-400 break-all text-center max-w-[140px] print:text-black">{slug}</p>
    </div>
  );
}
