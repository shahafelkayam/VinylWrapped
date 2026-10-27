// Shared chart plumbing: palette roles, tooltip, responsive width, chart card with table view.
import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

/** Validated against the card surface #fbf5e8 (see README › Design). */
export const VIZ = {
  series: '#c4501f',
  series2: '#008f84',
  track: '#efe4cf',
  grid: '#e6dcc8',
  axis: '#cbbda5',
  /** Sequential ramp for heatmaps, light → dark. */
  ramp: ['#e38a5c', '#d66d3c', '#c4501f', '#a43f17', '#823113', '#5f230f'],
};

export function rampColor(value: number, max: number): string {
  if (value <= 0) return VIZ.track;
  if (max <= VIZ.ramp.length) return VIZ.ramp[Math.min(VIZ.ramp.length - 1, value - 1)];
  const i = Math.min(VIZ.ramp.length - 1, Math.floor(((value - 1) / max) * VIZ.ramp.length));
  return VIZ.ramp[i];
}

export interface TipContent {
  value: string;
  label: string;
  extra?: string;
}

/** Hover + keyboard-focus tooltips. Tooltips enhance; every value is also in the table view. */
export function useTooltip<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [tip, setTip] = useState<{ x: number; y: number; content: TipContent } | null>(null);

  const place = (clientX: number, clientY: number, content: TipContent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(Math.max(clientX - box.left, 70), box.width - 70);
    setTip({ x, y: clientY - box.top, content });
  };

  const bind = (content: TipContent) => ({
    onPointerMove: (e: PointerEvent) => place(e.clientX, e.clientY, content),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<Element>) => {
      const b = e.currentTarget.getBoundingClientRect();
      place(b.left + b.width / 2, b.top, content);
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
    'aria-label': `${content.label}: ${content.value}${content.extra ? `, ${content.extra}` : ''}`,
  });

  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
      <strong>{tip.content.value}</strong>
      <span>{tip.content.label}</span>
      {tip.content.extra && <span className="tooltip-extra">{tip.content.extra}</span>}
    </div>
  ) : null;

  return { ref, bind, node, active: tip?.content };
}

/** Tracks an element's width. Returns a callback ref, so it also works for elements that mount later. */
export function useWidth<T extends HTMLElement>(fallback = 600): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback(
    (el: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      setWidth(el.clientWidth || fallback);
      const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
      ro.observe(el);
      observer.current = ro;
    },
    [fallback],
  );
  return [ref, width];
}

/** Round, human tick values from 0 to ≥ max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export function DataTable({ columns, rows }: TableData) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === 'number' ? 'num' : ''}>
                  {typeof cell === 'number' ? cell.toLocaleString('en') : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ChartCardProps {
  /** Small label above the title, e.g. "A1". */
  kicker?: string;
  title: string;
  subtitle?: ReactNode;
  table?: TableData;
  className?: string;
  children: ReactNode;
}

/** A chart's figure: title, optional subtitle, and a Chart/Table toggle (the accessible twin). */
export function ChartCard({ kicker, title, subtitle, table, className = '', children }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card chart-card ${className}`}>
      <header className="card-head">
        <div>
          {kicker && <span className="kicker">{kicker}</span>}
          <h2>{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="view-toggle" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>
      {asTable && table ? <DataTable {...table} /> : children}
    </section>
  );
}

export function EmptyChart({ children = 'Nothing spun in this range yet.' }: { children?: ReactNode }) {
  return <p className="empty-chart">{children}</p>;
}
