// Your year in wax, told as full-screen story slides.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { computeStats, type Stats } from '../../../shared/stats.ts';
import { displayGenre } from '../../../shared/genres.ts';
import { formatDate, formatHour, todayLocal } from '../../../shared/time.ts';
import { useStore } from '../lib/store.tsx';
import { navigate } from '../lib/router.ts';
import { useView, useViewLink, viewPath } from '../lib/view.tsx';
import { fmtNumber, fmtPct, plural } from '../lib/format.ts';
import { Cover } from '../components/Cover.tsx';
import { Vinyl } from '../components/Vinyl.tsx';
import { Stripes } from '../components/bits.tsx';
import { VIZ } from '../components/charts/common.tsx';

const SLIDE_MS = 7000;

/** `yearParam` is the year in the URL (…/wrapped/2025); `play` opens the story. */
export function WrappedPage({ yearParam, play }: { yearParam?: string; play: boolean }) {
  const { settings, me } = useStore();
  const { library, owner, base } = useView();
  const link = useViewLink();
  // Whose name goes on the story: the listener you're viewing, or you.
  const name = owner?.username ?? me?.username;
  const today = todayLocal();
  const thisYear = Number(today.slice(0, 4));
  const years = useMemo(() => [...new Set(library.listens.map((l) => Number(l.at.slice(0, 4))))].sort((a, b) => b - a), [library]);
  const fallbackYear = years.includes(thisYear) ? thisYear : (years[0] ?? thisYear);
  const year = Number(yearParam) || fallbackYear;
  const playing = play;

  const stats = useMemo(
    () => computeStats(library, { from: `${year}-01-01`, to: year === thisYear ? today : `${year}-12-31` }, { today, weekend: settings.weekend }),
    [library, year, thisYear, today, settings.weekend],
  );

  const enough = stats.totals.spins >= 3;

  return (
    <div className="page wrapped-page">
      <section className="wrapped-landing">
        <Stripes className="wrapped-stripes" />
        <span className="kicker">VinylWrapped</span>
        <h1>
          {owner ? `@${owner.username}’s` : 'Your'} <span>{year}</span> on wax
        </h1>
        <div className="year-chips" role="tablist" aria-label="Year">
          {(years.length ? years : [thisYear]).map((y) => (
            <a key={y} role="tab" aria-selected={y === year} href={link(`/wrapped/${y}`)} className="chip-year">
              {y}
            </a>
          ))}
        </div>
        {enough ? (
          <>
            <button className="btn btn-big" onClick={() => navigate(viewPath(base, `/wrapped/${year}?play=1`))}>
              {owner ? '▶ Play their Wrapped' : '▶ Play my Wrapped'}
            </button>
            {year === thisYear && <p className="muted small">The year isn't over. These are the stats so far.</p>}
          </>
        ) : (
          <p className="muted">Not enough spins in {year} to wrap yet ({plural(stats.totals.spins, 'spin')}). Keep scanning!</p>
        )}
      </section>
      {enough && <SummaryCard stats={stats} year={year} name={name} />}
      {playing && enough && <Story stats={stats} year={year} name={name} onClose={() => navigate(viewPath(base, `/wrapped/${year}`), { replace: true })} />}
    </div>
  );
}

interface Slide {
  id: string;
  tone: 'sunset' | 'night' | 'teal' | 'cream' | 'maroon' | 'mustard';
  body: ReactNode;
}

function buildSlides(s: Stats, year: number, name?: string): Slide[] {
  const slides: Slide[] = [];
  const topRecord = s.topRecords[0];
  const topArtist = s.topArtists[0];
  const peakHour = s.hours.indexOf(Math.max(...s.hours));

  slides.push({
    id: 'intro',
    tone: 'night',
    body: (
      <div className="slide-center">
        <Vinyl size="min(62vw, 300px)" spinning labelImage={topRecord?.item.coverUrl} speed={2.4} />
        <p className="slide-kicker">{name ? `@${name}, this is` : 'This is'}</p>
        <h2 className="slide-huge">
          your {year}
          <br />
          on wax
        </h2>
      </div>
    ),
  });

  slides.push({
    id: 'spins',
    tone: 'sunset',
    body: (
      <div className="slide-stack">
        <p className="slide-kicker">You dropped the needle</p>
        <p className="slide-number">{fmtNumber(s.totals.spins)}</p>
        <p className="slide-sub">times.</p>
        <p className="slide-line">
          That's <strong>{fmtNumber(Math.round(s.totals.minutes / 60))} hours</strong> of analog, about{' '}
          <strong>{plural(Math.round((s.totals.minutes / 1440) * 10) / 10, 'day')}</strong> of sound back to back, across {plural(s.totals.records, 'record')}.
        </p>
      </div>
    ),
  });

  if (s.topFamilies[0]) {
    slides.push({
      id: 'genre',
      tone: 'teal',
      body: (
        <div className="slide-stack">
          <p className="slide-kicker">Your sound of the year</p>
          <h2 className="slide-title">{s.topFamilies[0].item}</h2>
          <p className="slide-sub">{fmtPct(s.topFamilies[0].share)} of everything you played</p>
          <p className="slide-kicker slide-kicker-small">Top genres</p>
          <ol className="slide-bars">
            {s.topGenres.slice(0, 5).map((g) => (
              <li key={g.key}>
                <span>{displayGenre(g.item)}</span>
                <i style={{ width: `${(g.count / s.topGenres[0].count) * 100}%` }} />
              </li>
            ))}
          </ol>
        </div>
      ),
    });
  }

  if (topArtist) {
    slides.push({
      id: 'artist',
      tone: 'maroon',
      body: (
        <div className="slide-stack">
          <p className="slide-kicker">Your top artist</p>
          {topArtist.item.sample && <Cover record={topArtist.item.sample} className="slide-cover" />}
          <h2 className="slide-title">{topArtist.item.name}</h2>
          <p className="slide-sub">
            {plural(topArtist.count, 'spin')} · {fmtNumber(Math.round(topArtist.minutes / 60))} hours together
          </p>
          <ol className="slide-list" start={2}>
            {s.topArtists.slice(1, 5).map((a) => (
              <li key={a.key}>{a.item.name}</li>
            ))}
          </ol>
        </div>
      ),
    });
  }

  if (topRecord) {
    slides.push({
      id: 'records',
      tone: 'mustard',
      body: (
        <div className="slide-stack">
          <p className="slide-kicker">Heavy rotation</p>
          <ol className="slide-records">
            {s.topRecords.slice(0, 5).map((r, i) => (
              <li key={r.key} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
                <span className="slide-rank">{i + 1}</span>
                <Cover record={r.item} size={i === 0 ? 92 : 64} showText={false} />
                <span>
                  <strong>{r.item.title}</strong>
                  <span>
                    {r.item.artistCredit} · {plural(r.count, 'spin')}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ),
    });
  }

  const clockTitle = s.shares.night >= 0.4 ? 'Night owl' : s.shares.morning >= 0.35 ? 'Early bird' : peakHour >= 17 ? 'Golden hour listener' : 'Daytime spinner';
  slides.push({
    id: 'clock',
    tone: 'night',
    body: (
      <div className="slide-stack">
        <p className="slide-kicker">When the needle drops</p>
        <h2 className="slide-title">{clockTitle}</h2>
        <MiniClock hours={s.hours} />
        <p className="slide-line">
          Your turntable peaks at <strong>{formatHour(peakHour)}</strong>. {fmtPct(s.shares.night)} of your spins came after 9pm.
        </p>
      </div>
    ),
  });

  if (s.era.medianYear) {
    slides.push({
      id: 'era',
      tone: 'cream',
      body: (
        <div className="slide-stack">
          <p className="slide-kicker">Your musical birth year</p>
          <p className="slide-number">{s.era.medianYear}</p>
          <p className="slide-line">
            Half your spins were older than that. Your oldest wax: <strong>{s.era.oldest?.title}</strong> ({s.era.oldest?.year}). Your freshest:{' '}
            <strong>{s.era.newest?.title}</strong> ({s.era.newest?.year}).
          </p>
        </div>
      ),
    });
  }

  if (s.discoveries.length) {
    slides.push({
      id: 'discoveries',
      tone: 'teal',
      body: (
        <div className="slide-stack">
          <p className="slide-kicker">New in the crate</p>
          <p className="slide-number">{s.discoveries.length}</p>
          <p className="slide-sub">records got their very first spin</p>
          <div className="slide-covers">
            {s.discoveries.slice(0, 8).map((d, i) => (
              <Cover key={d.record.id} record={d.record} size={68} showText={false} className={`tilt-${i % 4}`} />
            ))}
          </div>
          {s.discoveries[0] && (
            <p className="slide-line">
              The first: <strong>{s.discoveries[0].record.title}</strong> on {formatDate(s.discoveries[0].date, { year: false })}.
            </p>
          )}
        </div>
      ),
    });
  }

  slides.push({
    id: 'streaks',
    tone: 'sunset',
    body: (
      <div className="slide-stack">
        <p className="slide-kicker">Commitment</p>
        <p className="slide-number">{s.longestStreak.length}</p>
        <p className="slide-sub">days in a row with a record on</p>
        <p className="slide-line">
          {s.peakDay && (
            <>
              Your biggest day was <strong>{formatDate(s.peakDay.date, { year: false })}</strong> with {plural(s.peakDay.count, 'spin')}.{' '}
            </>
          )}
          {s.longestSession && s.longestSession.spins > 1 && <>Longest session: {plural(s.longestSession.spins, 'record')} back to back.</>}
        </p>
      </div>
    ),
  });

  slides.push({
    id: 'personality',
    tone: 'maroon',
    body: (
      <div className="slide-stack">
        <p className="slide-kicker">Your listening personality</p>
        <h2 className="slide-title">{s.personality.title}</h2>
        <p className="slide-sub">{s.personality.tagline}</p>
        <ul className="slide-traits">
          {s.personality.traits.map((t) => (
            <li key={t.id}>
              <strong>{t.label}.</strong> {t.detail}
            </li>
          ))}
        </ul>
      </div>
    ),
  });

  slides.push({
    id: 'summary',
    tone: 'cream',
    body: <SummaryCard stats={s} year={year} name={name} compact />,
  });
  return slides;
}

function MiniClock({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <svg className="mini-clock" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="38" fill="#0c0b0a" />
      <circle cx="100" cy="100" r="13" fill={VIZ.series} />
      {hours.map((v, h) => {
        const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
        const r1 = 44;
        const r2 = 44 + (v / max) * 50;
        return v ? (
          <line key={h} x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)} x2={100 + r2 * Math.cos(a)} y2={100 + r2 * Math.sin(a)} stroke="#e8a33d" strokeWidth="7" strokeLinecap="round" />
        ) : null;
      })}
    </svg>
  );
}

function Story({ stats, year, name, onClose }: { stats: Stats; year: number; name?: string; onClose: () => void }) {
  const slides = useMemo(() => buildSlides(stats, year, name), [stats, year, name]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIndex((i) => (i < slides.length - 1 ? i + 1 : i)), [slides.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [next, prev, onClose]);

  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <div className={`story tone-${slide.tone}`} role="dialog" aria-modal="true" aria-label={`Your ${year} Wrapped`}>
      <div className="story-progress">
        {slides.map((s, i) => (
          <span key={s.id} className={i < index ? 'done' : i === index ? 'active' : ''}>
            {i === index && !last && (
              <i style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} onAnimationEnd={next} />
            )}
            {i === index && last && <i className="full" />}
          </span>
        ))}
      </div>
      <button className="story-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div
        className="story-tap"
        onPointerDown={() => setPaused(true)}
        onPointerUp={(e) => {
          setPaused(false);
          const x = e.clientX / window.innerWidth;
          if (x < 0.3) prev();
          else if (!last) next();
        }}
        onPointerCancel={() => setPaused(false)}
      />
      <div className="story-slide" key={slide.id}>
        {slide.body}
      </div>
      {last && (
        <div className="story-actions">
          <button className="btn" onClick={() => setIndex(0)}>
            ↺ Replay
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ stats, year, name, compact = false }: { stats: Stats; year: number; name?: string; compact?: boolean }) {
  return (
    <section className={`summary-card ${compact ? 'is-compact' : ''}`}>
      <Stripes />
      <header>
        <span className="logo logo-small">
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </span>
        <strong>{year}</strong>
      </header>
      <div className="summary-hero">
        {stats.topRecords[0] && <Cover record={stats.topRecords[0].item} className="summary-cover" />}
        <div>
          <span className="summary-label">Spins</span>
          <span className="summary-big">{fmtNumber(stats.totals.spins)}</span>
          <span className="summary-label">Hours of wax</span>
          <span className="summary-big">{fmtNumber(Math.round(stats.totals.minutes / 60))}</span>
        </div>
      </div>
      <div className="summary-cols">
        <div>
          <span className="summary-label">Top artists</span>
          <ol>
            {stats.topArtists.slice(0, 5).map((a) => (
              <li key={a.key}>{a.item.name}</li>
            ))}
          </ol>
        </div>
        <div>
          <span className="summary-label">Top records</span>
          <ol>
            {stats.topRecords.slice(0, 5).map((r) => (
              <li key={r.key}>{r.item.title}</li>
            ))}
          </ol>
        </div>
      </div>
      <footer>
        <div>
          <span className="summary-label">Top genre</span>
          <strong>{stats.topFamilies[0]?.item ?? '—'}</strong>
        </div>
        <div>
          <span className="summary-label">Personality</span>
          <strong>{stats.personality.title}</strong>
        </div>
      </footer>
      {name && <p className="summary-name">@{name}</p>}
    </section>
  );
}
