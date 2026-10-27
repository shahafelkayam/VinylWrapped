import { fmtNumber } from '../../lib/format.ts';
import { EmptyChart, niceTicks, useTooltip, useWidth, VIZ } from './common.tsx';

export interface Column {
  key: string;
  /** Axis label (may be thinned out when crowded). */
  label: string;
  /** Full label for the tooltip. */
  title: string;
  value: number;
  detail?: string;
}

interface ColumnChartProps {
  data: Column[];
  height?: number;
  unit?: string;
  /** Directly label the tallest column. */
  labelPeak?: boolean;
  /** Emphasis form: highlight one column, the rest get the light ramp step. */
  highlight?: string;
}

const M = { top: 18, right: 4, bottom: 24, left: 30 };

function columnPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/** Vertical columns from a single baseline; one series. */
export function ColumnChart({ data, height = 180, unit = 'spins', labelPeak = true, highlight }: ColumnChartProps) {
  const [measure, width] = useWidth<HTMLDivElement>();
  const tip = useTooltip();
  const empty = !data.length || data.every((d) => d.value === 0);

  return (
    <div className="column-chart" ref={measure}>
      <div className="tip-layer" ref={tip.ref}>
        {empty ? <EmptyChart /> : <Columns data={data} width={width} height={height} unit={unit} labelPeak={labelPeak} highlight={highlight} tip={tip} />}
        {tip.node}
      </div>
    </div>
  );
}

function Columns({
  data,
  width,
  height,
  unit,
  labelPeak,
  highlight,
  tip,
}: Required<Omit<ColumnChartProps, 'highlight'>> & { highlight?: string; width: number; tip: ReturnType<typeof useTooltip> }) {
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const max = Math.max(...data.map((d) => d.value));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const band = innerW / data.length;
  const barW = Math.max(2, Math.min(24, band - 2));
  // Thin out x labels only when they'd collide (~6.5px per mono character at 10.5px).
  const labelW = Math.max(...data.map((d) => d.label.length)) * 6.5 + 10;
  const every = Math.max(1, Math.ceil(labelW / band));
  const peakIndex = data.reduce((p, d, i) => (d.value > data[p].value ? i : p), 0);

  return (
    <svg width={width} height={height} role="img" aria-label={`Column chart of ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth="1" />
          <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis-text">
            {fmtNumber(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = M.left + i * band + (band - barW) / 2;
        const muted = highlight !== undefined && d.key !== highlight;
        const hovered = tip.active?.label === d.title;
        return (
          <g key={d.key}>
            <path d={columnPath(x, y(d.value), barW, y(0))} fill={muted ? VIZ.ramp[0] : VIZ.series} opacity={hovered ? 0.7 : 1} />
            {i % every === 0 && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="axis-text">
                {d.label}
              </text>
            )}
            <rect
              x={M.left + i * band}
              y={M.top}
              width={band}
              height={innerH}
              fill="transparent"
              className="hit"
              {...tip.bind({ value: `${fmtNumber(d.value)} ${unit}`, label: d.title, extra: d.detail })}
            />
          </g>
        );
      })}
      {labelPeak && data[peakIndex].value > 0 && (
        <text x={M.left + peakIndex * band + band / 2} y={y(data[peakIndex].value) - 6} textAnchor="middle" className="peak-label">
          {fmtNumber(data[peakIndex].value)}
        </text>
      )}
    </svg>
  );
}
