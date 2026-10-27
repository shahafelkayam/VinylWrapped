import { VIZ } from './common.tsx';

/** A small trend line with an end dot; context only, values live in the table/labels nearby. */
export function Sparkline({ values, width = 160, height = 40, label }: { values: number[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 5;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = `${line}L${x(values.length - 1)},${height - pad}L${x(0)},${height - pad}Z`;
  const last = values.length - 1;
  return (
    <svg className="sparkline" width={width} height={height} role="img" aria-label={label}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke={VIZ.axis} />
      <path d={area} fill={VIZ.series} opacity="0.1" />
      <path d={line} fill="none" stroke={VIZ.series} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="4" fill={VIZ.series} stroke="#fbf5e8" strokeWidth="2" />
    </svg>
  );
}
