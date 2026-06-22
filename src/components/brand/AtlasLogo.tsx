type AtlasLogoProps = {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
};

const sizes = {
  sm: { icon: 28, atlas: 'text-sm', analytics: 'text-[8px]', gap: 'gap-2' },
  md: { icon: 36, atlas: 'text-lg', analytics: 'text-[10px]', gap: 'gap-2.5' },
  lg: { icon: 48, atlas: 'text-2xl', analytics: 'text-xs', gap: 'gap-3' },
};

function AtlasIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 42 L24 6 L40 42" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M14 28 L34 28" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <path d="M12 36 L36 36" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export default function AtlasLogo({
  variant = 'dark',
  size = 'md',
  showWordmark = true,
  className = '',
}: AtlasLogoProps) {
  const s = sizes[size];
  const isLight = variant === 'light';
  const primaryColor = isLight ? '#FFFFFF' : '#000000';
  const goldColor = '#C5A059';
  const analyticsColor = isLight ? goldColor : goldColor;

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <AtlasIcon size={s.icon} color={isLight ? '#FFFFFF' : goldColor} />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className={`${s.atlas} font-bold tracking-wide ${isLight ? 'text-white' : 'text-black'}`}>
            ATLAS
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-px w-3 bg-brand-500" />
            <span
              className={`${s.analytics} font-semibold tracking-[0.2em] uppercase`}
              style={{ color: analyticsColor }}
            >
              Analytics
            </span>
            <span className="h-px w-3 bg-brand-500" />
          </div>
        </div>
      )}
    </div>
  );
}

export function AtlasWatermark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none select-none ${className}`}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <path d="M20 105 L60 15 L100 105" stroke="#E0E0E0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35 70 L85 70" stroke="#E0E0E0" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
