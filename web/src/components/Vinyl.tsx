import { useId, type ReactNode } from 'react';

interface VinylProps {
  size?: number | string;
  /** Image for the center label (usually the album cover). */
  labelImage?: string;
  labelColor?: string;
  spinning?: boolean;
  /** Seconds per revolution. 33⅓ rpm is 1.8s, which is a lot; we go slower for calm. */
  speed?: number;
  className?: string;
  children?: ReactNode;
}

/** A vinyl record in SVG: grooves, sheen and a center label. */
export function Vinyl({ size = 200, labelImage, labelColor = '#d9622b', spinning = false, speed = 3.6, className = '', children }: VinylProps) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`vinyl ${spinning ? 'is-spinning' : ''} ${className}`}
      style={{ width: size, height: size, ['--spin-duration' as string]: `${speed}s` }}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`disc-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2a2622" />
          <stop offset="100%" stopColor="#0f0d0b" />
        </radialGradient>
        <linearGradient id={`sheen-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`label-${id}`}>
          <circle cx="100" cy="100" r="34" />
        </clipPath>
        <filter id={`soft-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {/* Light only catches the grooves, not the paper label. */}
        <mask id={`grooves-${id}`}>
          <circle cx="100" cy="100" r="99" fill="#fff" />
          <circle cx="100" cy="100" r="37" fill="#000" />
        </mask>
      </defs>
      <g className="vinyl-disc">
        <circle cx="100" cy="100" r="99" fill={`url(#disc-${id})`} />
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx="100" cy="100" r={40 + i * 2.6} fill="none" stroke="#fff" strokeOpacity={i % 5 === 0 ? 0.09 : 0.04} strokeWidth="0.6" />
        ))}
        <circle cx="100" cy="100" r="36" fill="#0c0b0a" />
        {labelImage ? (
          <image href={labelImage} x="66" y="66" width="68" height="68" clipPath={`url(#label-${id})`} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <circle cx="100" cy="100" r="34" fill={labelColor} />
        )}
        {children}
        <circle cx="100" cy="100" r="34" fill="none" stroke="#000" strokeOpacity="0.25" />
        <circle cx="100" cy="100" r="3.2" fill="#f3e9d4" stroke="#000" strokeOpacity="0.4" />
      </g>
      <g mask={`url(#grooves-${id})`}>
        <g filter={`url(#soft-${id})`}>
          <path d="M100 1 A99 99 0 0 1 199 100 L100 100 Z" fill={`url(#sheen-${id})`} opacity="0.55" />
          <path d="M100 199 A99 99 0 0 1 1 100 L100 100 Z" fill={`url(#sheen-${id})`} opacity="0.4" />
        </g>
      </g>
    </svg>
  );
}
