import { Vinyl } from './Vinyl.tsx';

interface TurntableProps {
  playing: boolean;
  labelImage?: string;
  className?: string;
}

/** A top-down turntable: wooden plinth, platter, record and a tonearm that swings in when playing. */
export function Turntable({ playing, labelImage, className = '' }: TurntableProps) {
  return (
    <div className={`turntable ${playing ? 'is-playing' : ''} ${className}`}>
      <div className="turntable-platter">
        <Vinyl size="100%" labelImage={labelImage} spinning={playing} speed={2.4} />
      </div>
      <svg className="turntable-arm" viewBox="0 0 100 160" aria-hidden="true">
        <circle cx="70" cy="22" r="15" fill="#d8ccb4" stroke="#1d1611" strokeWidth="2.5" />
        <circle cx="70" cy="22" r="6" fill="#1d1611" />
        <path d="M70 22 L70 112 L52 140" fill="none" stroke="#e9e1d0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M70 22 L70 112 L52 140" fill="none" stroke="#1d1611" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <rect x="40" y="134" width="20" height="13" rx="2.5" fill="#1d1611" transform="rotate(32 52 140)" />
      </svg>
      <div className="turntable-controls" aria-hidden="true">
        <span className="turntable-light" />
        <span className="turntable-speed">33⅓</span>
      </div>
    </div>
  );
}
