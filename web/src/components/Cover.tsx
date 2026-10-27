import { useState, type CSSProperties, type ReactNode } from 'react';

interface CoverProps {
  record: { id: string; title: string; artistCredit: string; coverUrl?: string };
  size?: number | string;
  className?: string;
  /** Show title text on generated covers (off for tiny thumbnails). */
  showText?: boolean;
}

/** Album art, or a generated retro sleeve when there is none (or it fails to load). */
export function Cover({ record, size = '100%', className = '', showText = true }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const style = { width: size, height: size };
  if (record.coverUrl && !failed) {
    // Cover Art Archive redirects to archive.org, which can be slow: show the generated sleeve until the art arrives.
    return (
      <span className={`cover cover-stack ${loaded ? 'is-loaded' : ''} ${className}`} style={style}>
        {!loaded && <GeneratedCover seed={record.id || record.title} title={record.title} artist={record.artistCredit} showText={showText} />}
        <img
          src={record.coverUrl}
          alt={`${record.title} by ${record.artistCredit}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return <GeneratedCover seed={record.id || record.title} title={record.title} artist={record.artistCredit} className={`cover ${className}`} style={style} showText={showText} />;
}

const PALETTES = [
  ['#f3e3c3', '#e8a33d', '#d9622b', '#8f2f1b'],
  ['#1f3b3a', '#e8a33d', '#f3e3c3', '#d9622b'],
  ['#efe1c6', '#008f84', '#1d1611', '#e8a33d'],
  ['#6b2d2d', '#f2b950', '#e98a4e', '#f3e3c3'],
  ['#151311', '#d9622b', '#f3e3c3', '#e8a33d'],
  ['#e6d2ae', '#4d6b3c', '#c4501f', '#1d1611'],
  ['#2f2a4a', '#e98a4e', '#f3e3c3', '#c94f7c'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function GeneratedCover({
  seed,
  title,
  artist,
  className,
  style,
  showText = true,
}: {
  seed: string;
  title: string;
  artist: string;
  className?: string;
  style?: CSSProperties;
  showText?: boolean;
}) {
  const h = hash(seed);
  const [bg, a, b, c] = PALETTES[h % PALETTES.length];
  const variant = (h >>> 4) % 5;
  const shortTitle = title.length > 22 ? `${title.slice(0, 21)}…` : title;

  let art: ReactNode;
  switch (variant) {
    case 0: // sunburst
      art = (
        <g>
          {Array.from({ length: 18 }, (_, i) => {
            const a0 = (i / 18) * Math.PI * 2;
            const a1 = ((i + 0.5) / 18) * Math.PI * 2;
            return <path key={i} d={`M50 62 L${50 + 90 * Math.cos(a0)} ${62 + 90 * Math.sin(a0)} L${50 + 90 * Math.cos(a1)} ${62 + 90 * Math.sin(a1)} Z`} fill={a} opacity={0.55} />;
          })}
          <circle cx="50" cy="62" r="20" fill={b} />
          <circle cx="50" cy="62" r="12" fill={c} />
        </g>
      );
      break;
    case 1: // 70s swoosh stripes
      art = (
        <g fill="none" strokeWidth="7">
          {[a, b, c].map((col, i) => (
            <path key={i} d={`M-10 ${86 - i * 9} C 30 ${86 - i * 9}, 45 ${40 - i * 9}, 110 ${34 - i * 9}`} stroke={col} />
          ))}
        </g>
      );
      break;
    case 2: // concentric target
      art = (
        <g>
          {[40, 31, 22, 13, 5].map((r, i) => (
            <circle key={r} cx={h % 2 ? 66 : 34} cy="46" r={r} fill={[a, b, c, a, bg][i]} />
          ))}
        </g>
      );
      break;
    case 3: // dot grid
      art = (
        <g>
          {Array.from({ length: 25 }, (_, i) => {
            const x = 14 + (i % 5) * 18;
            const y = 12 + Math.floor(i / 5) * 15;
            const r = 3 + ((h >>> (i % 16)) & 3) * 1.6;
            return <circle key={i} cx={x} cy={y} r={r} fill={[a, b, c][(i + (h & 3)) % 3]} />;
          })}
        </g>
      );
      break;
    default: // giant initial
      art = (
        <g>
          <rect x="0" y="0" width="100" height="64" fill={a} />
          <text x="50" y="58" textAnchor="middle" fontFamily="Shrikhand, serif" fontSize="62" fill={c}>
            {[...title.trim()][0]?.toUpperCase() ?? '♪'}
          </text>
        </g>
      );
  }

  return (
    <svg className={className} style={style} viewBox="0 0 100 100" role="img" aria-label={`${title} by ${artist}`} preserveAspectRatio="xMidYMid slice">
      <rect width="100" height="100" fill={bg} />
      {art}
      {showText && (
        <g>
          <rect x="0" y="74" width="100" height="26" fill={bg} opacity="0.92" />
          <text x="6" y="86" fontFamily="Shrikhand, serif" fontSize="8.5" fill={c === bg ? a : c}>
            {shortTitle}
          </text>
          <text x="6" y="95" fontFamily="'Space Mono', monospace" fontSize="5" letterSpacing="0.4" fill={c === bg ? a : c} opacity="0.85">
            {artist.toUpperCase().slice(0, 30)}
          </text>
        </g>
      )}
    </svg>
  );
}
