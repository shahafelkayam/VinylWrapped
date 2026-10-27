import type { ReactNode } from 'react';
import { fmtNumber } from '../../lib/format.ts';
import { EmptyChart, useTooltip } from './common.tsx';

export interface BarRow {
  key: string;
  label: ReactNode;
  /** Plain-text label for tooltips and screen readers. */
  text: string;
  sub?: ReactNode;
  value: number;
  /** Formatted value shown at the bar tip. */
  display?: string;
  /** Extra tooltip line, e.g. "4h 12m · 18%". */
  detail?: string;
  thumb?: ReactNode;
  href?: string;
}

/** Ranked horizontal bars, one series, value at the tip. */
export function BarList({ rows, unit = 'spins', ranked = true }: { rows: BarRow[]; unit?: string; ranked?: boolean }) {
  const tip = useTooltip();
  if (!rows.length) return <EmptyChart />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist" ref={tip.ref}>
      <ol>
        {rows.map((r, i) => {
          const display = r.display ?? fmtNumber(r.value);
          return (
            <li key={r.key} className="barlist-row" {...tip.bind({ value: `${display} ${unit}`, label: r.text, extra: r.detail })}>
              {ranked && <span className="barlist-rank">{i + 1}</span>}
              {r.thumb}
              <div className="barlist-main">
                <div className="barlist-label">
                  {r.href ? (
                    <a href={r.href} tabIndex={-1}>
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}
                  {r.sub && <span className="barlist-sub">{r.sub}</span>}
                </div>
                <div className="barlist-track">
                  <span className="barlist-bar" style={{ width: `calc((100% - 3.25rem) * ${r.value / max})` }} />
                  <span className="barlist-value">{display}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {tip.node}
    </div>
  );
}
