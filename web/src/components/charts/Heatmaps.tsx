import { addDays, diffDays, formatDate, formatHour, MONTH_SHORT, startOfWeek, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../../../shared/time.ts';
import type { DateRange } from '../../../../shared/stats.ts';
import { EmptyChart, rampColor, useTooltip, useWidth, VIZ } from './common.tsx';

function ScaleLegend({ max }: { max: number }) {
  const steps = Math.min(VIZ.ramp.length, Math.max(1, max));
  return (
    <div className="scale-legend" aria-hidden="true">
      <span>fewer</span>
      <i style={{ background: VIZ.track }} />
      {VIZ.ramp.slice(0, steps).map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
      <span>more spins</span>
    </div>
  );
}

/** Weekday × hour grid. */
export function WeekHourHeatmap({ heat }: { heat: number[][] }) {
  const tip = useTooltip();
  const max = Math.max(0, ...heat.flat());
  if (!max) return <EmptyChart />;
  return (
    <div className="week-hour tip-layer" ref={tip.ref}>
      <div className="week-hour-grid" role="img" aria-label="Spins by weekday and hour">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="axis-text week-hour-col">
            {h % 6 === 0 ? formatHour(h) : ''}
          </span>
        ))}
        {heat.map((row, d) => (
          <div key={d} className="week-hour-row">
            <span className="axis-text">{WEEKDAY_SHORT[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className="heat-cell hit"
                style={{ background: rampColor(v, max) }}
                {...tip.bind({ value: `${v} spin${v === 1 ? '' : 's'}`, label: `${WEEKDAY_LONG[d]}s, ${formatHour(h)}` })}
              />
            ))}
          </div>
        ))}
      </div>
      <ScaleLegend max={max} />
      {tip.node}
    </div>
  );
}

/** GitHub-style calendar, a "groove" per week. Shows up to the last 53 weeks of the range. */
export function CalendarHeatmap({ daily, range }: { daily: Map<string, number>; range: DateRange }) {
  const [measure, width] = useWidth<HTMLDivElement>();
  const tip = useTooltip();
  const from = diffDays(range.from, range.to) > 370 ? addDays(range.to, -370) : range.from;
  const first = startOfWeek(from);
  const weeks = Math.ceil((diffDays(first, range.to) + 1) / 7);
  const labelW = 30;
  const gap = 3;
  const cell = Math.max(8, Math.min(18, Math.floor((width - labelW) / weeks) - gap));
  const max = Math.max(0, ...daily.values());

  const months: { x: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const weekEnd = addDays(first, w * 7 + 6);
    const d = weekEnd > range.to ? range.to : weekEnd;
    const m = Number(d.slice(5, 7)) - 1;
    if (m !== lastMonth && d >= from) {
      months.push({ x: labelW + w * (cell + gap), label: MONTH_SHORT[m] });
      lastMonth = m;
    }
  }

  const svgW = labelW + weeks * (cell + gap);
  const svgH = 18 + 7 * (cell + gap);

  return (
    <div className="calendar" ref={measure}>
      <div className="tip-layer" ref={tip.ref}>
        <svg width={svgW} height={svgH} role="img" aria-label="Spins per day calendar">
          {months.map((m, i) =>
            i > 0 && m.x - months[i - 1].x < 28 ? null : (
              <text key={`${m.label}-${m.x}`} x={m.x} y={11} className="axis-text">
                {m.label}
              </text>
            ),
          )}
          {[0, 2, 4, 6].map((d) => (
            <text key={d} x={0} y={18 + d * (cell + gap) + cell / 2} dy="0.32em" className="axis-text">
              {WEEKDAY_SHORT[d]}
            </text>
          ))}
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const date = addDays(first, i);
            if (date < from || date > range.to) return null;
            const w = Math.floor(i / 7);
            const d = i % 7;
            const v = daily.get(date) ?? 0;
            return (
              <rect
                key={date}
                x={labelW + w * (cell + gap)}
                y={18 + d * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                fill={rampColor(v, max)}
                className="hit"
                {...tip.bind({ value: `${v} spin${v === 1 ? '' : 's'}`, label: formatDate(date) })}
              />
            );
          })}
        </svg>
        {tip.node}
      </div>
      <ScaleLegend max={max} />
    </div>
  );
}
