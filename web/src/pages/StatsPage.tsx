import { useMemo, type ReactNode } from 'react';
import { computeStats, type Stats } from '../../../shared/stats.ts';
import { displayGenre } from '../../../shared/genres.ts';
import { formatDate, formatHour, MONTH_SHORT, todayLocal, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../../shared/time.ts';
import { useStore } from '../lib/store.tsx';
import { href, type Route } from '../lib/router.ts';
import { resolveRange } from '../lib/ranges.ts';
import { countryName, countryWithFlag, flag, fmtAgo, fmtDuration, fmtHours, fmtNumber, fmtPct, plural } from '../lib/format.ts';
import { RangePicker } from '../components/RangePicker.tsx';
import { Notice, Sleeve, StatTile } from '../components/bits.tsx';
import { Cover } from '../components/Cover.tsx';
import { Vinyl } from '../components/Vinyl.tsx';
import { ChartCard } from '../components/charts/common.tsx';
import { BarList, type BarRow } from '../components/charts/BarList.tsx';
import { ColumnChart, type Column } from '../components/charts/ColumnChart.tsx';
import { HourClock } from '../components/charts/HourClock.tsx';
import { CalendarHeatmap, WeekHourHeatmap } from '../components/charts/Heatmaps.tsx';

export function StatsPage({ route }: { route: Route }) {
  const { library, settings } = useStore();
  const today = todayLocal();
  const current = resolveRange(route.query, today, library);
  const { from, to } = current.range;
  const stats = useMemo(
    () => computeStats(library, { from, to }, { today, weekend: settings.weekend }),
    [library, from, to, today, settings.weekend],
  );

  if (!Object.keys(library.records).length && !library.listens.length) return <EmptyCrate />;

  return (
    <div className="page stats-page">
      <RangePicker current={current} today={today} basePath="/" />
      {stats.unlinkedTags.length > 0 && (
        <Notice tone="warn">
          {plural(stats.unlinkedTags.length, 'scanned tag')} {stats.unlinkedTags.length === 1 ? "isn't" : "aren't"} linked to a record yet:{' '}
          {stats.unlinkedTags.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ', '}
              <a href={href(`/add?tag=${t.id}`)}>
                <code>{t.id}</code>
              </a>{' '}
              ({plural(t.count, 'spin')})
            </span>
          ))}
          . Link them so those spins count.
        </Notice>
      )}
      <Hero stats={stats} phrase={current.phrase} />
      <Kpis stats={stats} />
      {stats.totals.spins === 0 ? (
        <section className="card quiet-card">
          <Vinyl size={120} />
          <div>
            <h2>Silence on the turntable</h2>
            <p>No spins {current.phrase}. Pick a longer range above, or go drop a needle.</p>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-2">
            <HeavyRotation stats={stats} />
            <ChartCard
              kicker="A2"
              title="Top artists"
              table={{ columns: ['Artist', 'Spins', 'Time'], rows: stats.topArtists.slice(0, 25).map((a) => [a.item.name, a.count, fmtDuration(a.minutes)]) }}
            >
              <BarList
                rows={stats.topArtists.slice(0, 8).map<BarRow>((a) => ({
                  key: a.key,
                  label: a.item.name,
                  text: a.item.name,
                  sub: a.item.country ? countryWithFlag(a.item.country) : undefined,
                  value: a.count,
                  detail: `${fmtDuration(a.minutes)} · ${fmtPct(a.share)} of spins`,
                  thumb: a.item.sample ? <Cover record={a.item.sample} size={36} showText={false} className="thumb" /> : undefined,
                }))}
              />
            </ChartCard>
          </div>

          <div className="grid grid-2">
            <ChartCard
              kicker="A3"
              title="Genres"
              subtitle="Each spin counts toward its record's top three genres."
              table={{ columns: ['Genre', 'Spins', 'Share'], rows: stats.topGenres.map((g) => [displayGenre(g.item), g.count, fmtPct(g.share)]) }}
            >
              <BarList
                rows={stats.topGenres.slice(0, 10).map<BarRow>((g) => ({
                  key: g.key,
                  label: displayGenre(g.item),
                  text: displayGenre(g.item),
                  value: g.count,
                  detail: `${fmtPct(g.share)} of spins · ${fmtDuration(g.minutes)}`,
                }))}
              />
            </ChartCard>
            <ChartCard
              kicker="A4"
              title="Genre families"
              subtitle={`Diversity score ${Math.round(stats.diversity * 100)}/100: how evenly your spins spread across families.`}
              table={{ columns: ['Family', 'Spins', 'Share'], rows: stats.topFamilies.map((g) => [g.item, g.count, fmtPct(g.share)]) }}
            >
              <BarList
                rows={stats.topFamilies.slice(0, 10).map<BarRow>((g) => ({
                  key: g.key,
                  label: g.item,
                  text: g.item,
                  value: g.count,
                  display: fmtPct(g.share),
                  detail: `${plural(g.count, 'spin')} · ${fmtDuration(g.minutes)}`,
                }))}
                unit="of spins"
              />
            </ChartCard>
          </div>

          <ListeningTimes stats={stats} />
          <Trend stats={stats} />
          {stats.days >= 28 && (
            <ChartCard
              kicker="B5"
              title="Groove calendar"
              subtitle={`${plural(stats.totals.activeDays, 'day')} with music out of ${fmtNumber(stats.days)}. Longest run: ${plural(stats.longestStreak.length, 'day')} in a row.`}
              table={{ columns: ['Date', 'Spins'], rows: [...stats.daily.entries()].sort().map(([d, c]) => [formatDate(d), c]) }}
            >
              <CalendarHeatmap daily={stats.daily} range={stats.range} />
            </ChartCard>
          )}
          <TimeMachine stats={stats} />
          <div className="grid grid-2">
            <ChartCard
              kicker="C2"
              title="Around the world"
              subtitle="Where your artists come from."
              table={{ columns: ['Country', 'Spins'], rows: stats.topCountries.map((c) => [countryName(c.item), c.count]) }}
            >
              <BarList
                rows={stats.topCountries.slice(0, 8).map<BarRow>((c) => ({
                  key: c.key,
                  label: (
                    <>
                      <span className="flag" aria-hidden="true">
                        {flag(c.item)}
                      </span>{' '}
                      {countryName(c.item)}
                    </>
                  ),
                  text: countryName(c.item),
                  value: c.count,
                  detail: fmtPct(c.share),
                }))}
              />
            </ChartCard>
            <ChartCard
              kicker="C3"
              title="Labels"
              subtitle="The imprints on your center labels."
              table={{ columns: ['Label', 'Spins'], rows: stats.topLabels.map((l) => [l.item, l.count]) }}
            >
              <BarList rows={stats.topLabels.slice(0, 8).map<BarRow>((l) => ({ key: l.key, label: l.item, text: l.item, value: l.count, detail: fmtPct(l.share) }))} />
            </ChartCard>
          </div>
          <Highlights stats={stats} />
          <Personality stats={stats} />
          <Dusty stats={stats} phrase={current.phrase} />
        </>
      )}
    </div>
  );
}

function Hero({ stats, phrase }: { stats: Stats; phrase: string }) {
  const top = stats.topRecords[0]?.item;
  return (
    <section className="hero card">
      <div className="hero-copy">
        <span className="kicker">Now playing: your stats {phrase}</span>
        <p className="hero-figure">
          {fmtHours(stats.totals.minutes)}
          <span>hours of wax</span>
        </p>
        <p className="hero-line">
          {plural(stats.totals.spins, 'needle drop')} · {plural(stats.totals.records, 'record')} · {plural(stats.totals.artists, 'artist')}
        </p>
      </div>
      <div className="hero-art">
        <Vinyl size="100%" labelImage={top?.coverUrl} spinning={stats.totals.spins > 0} speed={5} />
      </div>
    </section>
  );
}

function Kpis({ stats }: { stats: Stats }) {
  const t = stats.totals;
  return (
    <div className="kpis">
      <StatTile label="Spins" value={fmtNumber(t.spins)} current={t.spins} previous={stats.previous.spins} />
      <StatTile label="Listening time" value={fmtDuration(t.minutes)} current={t.minutes} previous={stats.previous.minutes} />
      <StatTile label="Different records" value={fmtNumber(t.records)} current={t.records} previous={stats.previous.records} />
      <StatTile label="Active days" value={fmtNumber(t.activeDays)} note={`of ${fmtNumber(stats.days)} · ${fmtPct(stats.days ? t.activeDays / stats.days : 0)}`} />
      <StatTile
        label="Current streak"
        value={fmtNumber(stats.currentStreak.length)}
        unit={stats.currentStreak.length === 1 ? 'day' : 'days'}
        note={`best in range: ${plural(stats.longestStreak.length, 'day')}`}
      />
      <StatTile label="First spins" value={fmtNumber(t.discoveries)} note="records heard for the first time" />
    </div>
  );
}

function HeavyRotation({ stats }: { stats: Stats }) {
  const [first, ...rest] = stats.topRecords;
  if (!first) return null;
  return (
    <ChartCard
      kicker="A1"
      title="Heavy rotation"
      className="heavy-rotation"
      table={{ columns: ['Record', 'Artist', 'Spins', 'Time'], rows: stats.topRecords.slice(0, 25).map((r) => [r.item.title, r.item.artistCredit, r.count, fmtDuration(r.minutes)]) }}
    >
      <div className="heavy-top">
        <Sleeve record={first.item} badge={`#1`} />
        <div>
          <p className="heavy-count">
            <strong>{fmtNumber(first.count)}</strong> spins
          </p>
          <p className="muted">
            {fmtDuration(first.minutes)} · {fmtPct(first.share)} of everything you played
          </p>
        </div>
      </div>
      <BarList
        rows={rest.slice(0, 7).map<BarRow>((r) => ({
          key: r.key,
          label: r.item.title,
          text: `${r.item.title} by ${r.item.artistCredit}`,
          sub: r.item.artistCredit,
          value: r.count,
          detail: fmtDuration(r.minutes),
          href: href(`/record/${r.item.id}`),
          thumb: <Cover record={r.item} size={36} showText={false} className="thumb" />,
        }))}
        ranked={false}
      />
    </ChartCard>
  );
}

function ListeningTimes({ stats }: { stats: Stats }) {
  const peakDay = stats.weekdays.indexOf(Math.max(...stats.weekdays));
  const peakHour = stats.hours.indexOf(Math.max(...stats.hours));
  return (
    <div className="grid grid-3">
      <ChartCard
        kicker="B1"
        title="Your listening clock"
        subtitle={`Busiest hour: ${formatHour(peakHour)}. ${fmtPct(stats.shares.night)} of spins after 9pm.`}
        table={{ columns: ['Hour', 'Spins'], rows: stats.hours.map((v, h) => [formatHour(h), v]) }}
      >
        <HourClock hours={stats.hours} />
      </ChartCard>
      <ChartCard
        kicker="B2"
        title="Days of the week"
        subtitle={`${WEEKDAY_LONG[peakDay]}s rule. Weekends hold ${fmtPct(stats.shares.weekend)} of your spins.`}
        table={{ columns: ['Day', 'Spins'], rows: stats.weekdays.map((v, d) => [WEEKDAY_LONG[d], v]) }}
      >
        <ColumnChart
          height={220}
          data={stats.weekdays.map<Column>((v, d) => ({ key: String(d), label: WEEKDAY_SHORT[d], title: WEEKDAY_LONG[d], value: v }))}
          highlight={String(peakDay)}
        />
      </ChartCard>
      <ChartCard
        kicker="B3"
        title="Week at a glance"
        subtitle="When the needle drops, by day and hour."
        table={{
          columns: ['Day', ...Array.from({ length: 24 }, (_, h) => formatHour(h))],
          rows: stats.heat.map((row, d) => [WEEKDAY_SHORT[d], ...row]),
        }}
      >
        <WeekHourHeatmap heat={stats.heat} />
      </ChartCard>
    </div>
  );
}

function trendLabel(start: string, g: Stats['granularity'], multiYear: boolean): { label: string; title: string } {
  const [y, m, d] = start.split('-').map(Number);
  if (g === 'month') return { label: multiYear ? `${MONTH_SHORT[m - 1]} ’${String(y).slice(2)}` : MONTH_SHORT[m - 1], title: `${MONTH_SHORT[m - 1]} ${y}` };
  if (g === 'week') return { label: `${MONTH_SHORT[m - 1]} ${d}`, title: `Week of ${formatDate(start)}` };
  return { label: String(d), title: formatDate(start) };
}

function Trend({ stats }: { stats: Stats }) {
  const multiYear = stats.range.from.slice(0, 4) !== stats.range.to.slice(0, 4);
  const per = { day: 'day', week: 'week', month: 'month' }[stats.granularity];
  return (
    <ChartCard
      kicker="B4"
      title={`Spins per ${per}`}
      table={{ columns: [per[0].toUpperCase() + per.slice(1), 'Spins', 'Time'], rows: stats.trend.map((b) => [trendLabel(b.start, stats.granularity, true).title, b.count, fmtDuration(b.minutes)]) }}
    >
      <ColumnChart
        height={200}
        data={stats.trend.map<Column>((b) => {
          const { label, title } = trendLabel(b.start, stats.granularity, multiYear);
          return { key: b.start, label, title, value: b.count, detail: fmtDuration(b.minutes) };
        })}
      />
    </ChartCard>
  );
}

function TimeMachine({ stats }: { stats: Stats }) {
  const { era } = stats;
  return (
    <div className="grid grid-2-1">
      <ChartCard
        kicker="C1"
        title="Time machine"
        subtitle="Spins by the decade each album first came out."
        table={{ columns: ['Decade', 'Spins'], rows: stats.decades.map((d) => [`${d.item}s`, d.count]) }}
      >
        <ColumnChart height={200} data={stats.decades.map<Column>((d) => ({ key: d.key, label: `’${String(d.item).slice(2)}s`, title: `The ${d.item}s`, value: d.count, detail: fmtPct(d.share) }))} />
      </ChartCard>
      <section className="card facts-card">
        <span className="kicker">C1 · liner notes</span>
        <dl className="facts">
          {era.medianYear && (
            <div>
              <dt>Your musical birth year</dt>
              <dd>{era.medianYear}</dd>
            </div>
          )}
          {era.averageAgeAtSpin !== undefined && (
            <div>
              <dt>Average record age when played</dt>
              <dd>{plural(era.averageAgeAtSpin, 'year')}</dd>
            </div>
          )}
          {era.oldest && (
            <div>
              <dt>Oldest wax</dt>
              <dd>
                <a href={href(`/record/${era.oldest.id}`)}>{era.oldest.title}</a> ({era.oldest.year})
              </dd>
            </div>
          )}
          {era.newest && (
            <div>
              <dt>Freshest pressing</dt>
              <dd>
                <a href={href(`/record/${era.newest.id}`)}>{era.newest.title}</a> ({era.newest.year})
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}

function Highlights({ stats }: { stats: Stats }) {
  const items: { title: string; body: ReactNode; record?: Stats['topRecords'][number]['item'] }[] = [];
  if (stats.peakDay) items.push({ title: 'Biggest day', body: `${formatDate(stats.peakDay.date)}: ${plural(stats.peakDay.count, 'spin')}.` });
  if (stats.binge) items.push({ title: 'On repeat', body: `${stats.binge.record.title}, ${stats.binge.value}× on ${formatDate(stats.binge.date)}.`, record: stats.binge.record });
  if (stats.longestSession && stats.longestSession.spins > 1)
    items.push({
      title: 'Longest session',
      body: `${plural(stats.longestSession.spins, 'record')} back to back (${fmtDuration(stats.longestSession.minutes)}) on ${formatDate(stats.longestSession.date)}.`,
      record: stats.longestSession.records[0],
    });
  for (const c of stats.comebacks.slice(0, 2)) items.push({ title: 'The comeback', body: `${c.record.title} returned after ${plural(c.value, 'day')} on the shelf.`, record: c.record });
  if (stats.firstSpin?.rec) items.push({ title: 'First needle drop', body: `${stats.firstSpin.rec.title}, ${formatDate(stats.firstSpin.local.date)}.`, record: stats.firstSpin.rec });

  return (
    <section className="highlights">
      <div className="section-title">
        <span className="kicker">C4</span>
        <h2>Highlights</h2>
      </div>
      <div className="grid grid-auto">
        {items.map((it, i) => (
          <article key={i} className="card highlight">
            {it.record && <Cover record={it.record} size={56} showText={false} className="thumb" />}
            <div>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </div>
          </article>
        ))}
      </div>
      {stats.discoveries.length > 0 && (
        <div className="card discoveries">
          <div className="card-head">
            <div>
              <span className="kicker">C5</span>
              <h2>First spins</h2>
              <p className="card-sub">Records you played for the very first time in this range.</p>
            </div>
          </div>
          <div className="sleeve-row">
            {stats.discoveries.slice(0, 12).map((d) => (
              <Sleeve key={d.record.id} record={d.record} badge={d.value} caption={`first spun ${formatDate(d.date, { year: false })}`} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Personality({ stats }: { stats: Stats }) {
  const p = stats.personality;
  return (
    <section className="card personality">
      <div className="personality-badge" aria-hidden="true">
        <Vinyl size="100%" labelColor="#e8a33d" />
      </div>
      <div>
        <span className="kicker">D1 · your listening personality</span>
        <h2 className="personality-title">{p.title}</h2>
        <p className="personality-tagline">{p.tagline}</p>
        {p.traits.length > 0 && (
          <ul className="traits">
            {p.traits.map((t) => (
              <li key={t.id}>
                <strong>{t.label}</strong> {t.detail}
              </li>
            ))}
          </ul>
        )}
        <a className="btn" href={href(`/wrapped`)}>
          Play your Wrapped ▶
        </a>
      </div>
    </section>
  );
}

function Dusty({ stats, phrase }: { stats: Stats; phrase: string }) {
  if (!stats.dusty.length) return null;
  return (
    <section className="card dusty">
      <div className="card-head">
        <div>
          <span className="kicker">D2</span>
          <h2>Gathering dust</h2>
          <p className="card-sub">
            {plural(stats.dusty.length, 'record')} in your crate didn't get a spin {phrase}. Maybe tonight?
          </p>
        </div>
      </div>
      <div className="sleeve-row">
        {stats.dusty.slice(0, 10).map((d) => (
          <Sleeve key={d.record.id} record={d.record} caption={d.lastSpin ? `last spun ${fmtAgo(d.lastSpin)}` : 'never spun'} />
        ))}
      </div>
    </section>
  );
}

function EmptyCrate() {
  return (
    <div className="page">
      <section className="card onboarding">
        <Vinyl size={160} spinning />
        <div>
          <span className="kicker">Side A, track 1</span>
          <h1>Your crate is empty</h1>
          <p>Add your first record, write its link to an NFC sticker, and every scan from now on becomes part of your story.</p>
          <div className="btn-row">
            <a className="btn" href={href('/add')}>
              Add a record
            </a>
            <a className="btn btn-ghost" href={href('/settings?section=nfc')}>
              How the NFC tags work
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
