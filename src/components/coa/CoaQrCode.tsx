import { verifyUrl } from '../../lib/coaVerify';

export default function CoaQrCode({
  slug,
  size = 120,
  label = 'Scan to verify',
  compact = false,
}: {
  slug: string;
  size?: number;
  label?: string;
  /** Footer / corner placement — QR only, no captions. */
  compact?: boolean;
}) {
  const url = verifyUrl(slug);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=1`;

  if (compact) {
    return (
      <img
        src={qrSrc}
        width={size}
        height={size}
        alt={label}
        className="coa-print-qr-img bg-white shrink-0"
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={qrSrc}
        width={size}
        height={size}
        alt={label}
        className="rounded border border-atlas-border bg-white"
      />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 text-center">{label}</p>
      <p className="text-[9px] font-mono text-neutral-400 break-all text-center max-w-[140px]">{slug}</p>
    </div>
  );
}
