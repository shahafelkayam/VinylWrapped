// Small presentational pieces used across pages.
import type { ReactNode } from 'react';
import type { VinylRecord } from '../../../shared/types.ts';
import { fmtDelta } from '../lib/format.ts';
import { href } from '../lib/router.ts';
import { Cover } from './Cover.tsx';
import { Vinyl } from './Vinyl.tsx';

export function StatTile({ label, value, unit, current, previous, note }: { label: string; value: string; unit?: string; current?: number; previous?: number; note?: ReactNode }) {
  const delta = current !== undefined && previous !== undefined ? fmtDelta(current, previous) : undefined;
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {delta && (
        <span className={`stat-delta is-${delta.direction}`}>
          <span aria-hidden="true">{delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'}</span> {delta.text}
          <span className="sr-only"> compared with the previous period</span>
          <span className="stat-delta-vs" aria-hidden="true">
            {' '}
            vs prev.
          </span>
        </span>
      )}
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

/** A record sleeve with the vinyl peeking out on hover. */
export function Sleeve({ record, badge, caption }: { record: VinylRecord; badge?: ReactNode; caption?: ReactNode }) {
  return (
    <a className="sleeve" href={href(`/record/${record.id}`)}>
      <div className="sleeve-art">
        <div className="sleeve-vinyl">
          <Vinyl size="100%" labelImage={record.coverUrl} />
        </div>
        <Cover record={record} className="sleeve-cover" />
        {badge !== undefined && <span className="sleeve-badge">{badge}</span>}
      </div>
      <div className="sleeve-text">
        <strong>{record.title}</strong>
        <span>{record.artistCredit}</span>
        {caption && <span className="sleeve-caption">{caption}</span>}
      </div>
    </a>
  );
}

export function Spinner({ label = 'Cueing up…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <Vinyl size={88} spinning speed={1.6} />
      <span>{label}</span>
    </div>
  );
}

export function Stripes({ className = '' }: { className?: string }) {
  return (
    <div className={`stripes ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export function SectionTitle({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div className="section-title">
      {kicker && <span className="kicker">{kicker}</span>}
      <h2>{children}</h2>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-small btn-ghost"
      onClick={async (e) => {
        const btn = e.currentTarget;
        try {
          await navigator.clipboard.writeText(text);
          btn.dataset.copied = 'true';
          setTimeout(() => delete btn.dataset.copied, 1600);
        } catch {
          window.prompt('Copy this:', text);
        }
      }}
    >
      <span className="copy-label">{label}</span>
      <span className="copied-label">Copied ✓</span>
    </button>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const icon = { info: '♪', warn: '!', error: '✕', ok: '✓' }[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">
        {icon}
      </span>
      <div>{children}</div>
    </div>
  );
}
