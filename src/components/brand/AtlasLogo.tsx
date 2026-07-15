type AtlasLogoProps = {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'header' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'h-8 w-auto max-h-8',
  header: 'h-16 w-auto max-h-16',
  md: 'h-20 w-auto max-h-20',
  lg: 'h-28 w-auto max-h-28',
};

function logoSrc(variant: 'light' | 'dark') {
  return variant === 'light'
    ? '/brand/atlas-logo-stacked-light.png'
    : '/brand/atlas-logo-stacked.png';
}

export default function AtlasLogo({
  variant = 'dark',
  size = 'md',
  className = '',
}: AtlasLogoProps) {
  return (
    <img
      src={logoSrc(variant)}
      alt="Atlas Analytics"
      className={`block shrink-0 object-contain object-left ${sizeClasses[size ?? 'md']} ${className}`}
    />
  );
}

export function AtlasWatermark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/brand/atlas-logo-stacked.png"
      alt=""
      aria-hidden="true"
      className={`pointer-events-none select-none opacity-10 object-contain ${className}`}
    />
  );
}
