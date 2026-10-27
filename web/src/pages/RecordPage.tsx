import { useMemo, useState } from 'react';
import { computeRecordStats } from '../../../shared/stats.ts';
import { displayGenre, recordFamily } from '../../../shared/genres.ts';
import { formatDate, formatHour, MONTH_SHORT, todayLocal, toLocalIso } from '../../../shared/time.ts';
import { newListenId } from '../../../shared/ids.ts';
import type { VinylRecord } from '../../../shared/types.ts';
import { useStore } from '../lib/store.tsx';
import { href, navigate } from '../lib/router.ts';
import { tagUrl } from '../lib/config.ts';
import { countryName, countryWithFlag, flag, fmtAgo, fmtDuration, fmtTime, ordinal, plural } from '../lib/format.ts';
import { Cover } from '../components/Cover.tsx';
import { Vinyl } from '../components/Vinyl.tsx';
import { CopyButton, Notice, StatTile } from '../components/bits.tsx';
import { ChartCard } from '../components/charts/common.tsx';
import { ColumnChart } from '../components/charts/ColumnChart.tsx';

export function RecordPage({ id }: { id: string }) {
  const { library, send, mode, pending } = useStore();
  const rec = library.records[id];
  const today = todayLocal();
  const stats = useMemo(() => computeRecordStats(library, id, today), [library, id, today]);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [pastAt, setPastAt] = useState(() => toLocalIso(new Date()).slice(0, 16));

  if (!rec) {
    return (
      <div className="page narrow">
        <section className="card">
          <h1>{stats.spins ? 'An unlinked tag' : 'Record not found'}</h1>
          {stats.spins ? (
            <>
              <p>
                The tag <code>{id}</code> was scanned {plural(stats.spins, 'time')} but isn't linked to a record yet.
              </p>
              <a className="btn" href={href(`/add?tag=${id}`)}>
                Link it to a record
              </a>
            </>
          ) : (
            <p>
              There's no record with the id <code>{id}</code> in your crate. <a href={href('/crate')}>Back to the crate</a>
            </p>
          )}
        </section>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const logSpin = (at: string, source: 'web' | 'manual') => run(() => send('spin', { record: id, id: newListenId(), at, source, force: true }));
  const refreshing = pending.some((p) => p.type === 'refresh-record' && (p.payload as { id: string }).id === id);
  const sides = groupSides(rec);

  return (
    <div className="page record-page">
      <a className="link-button back" href={href('/crate')}>
        ← Crate
      </a>
      <section className="record-hero">
        <div className="record-art">
          <div className="record-art-vinyl">
            <Vinyl size="100%" labelImage={rec.coverUrl} spinning={stats.spins > 0 && false} />
          </div>
          <Cover record={rec} className="record-art-cover" />
        </div>
        <div className="record-meta">
          <span className="kicker">
            {[rec.type, recordFamily(rec.genres) !== 'Other' ? recordFamily(rec.genres) : undefined].filter(Boolean).join(' · ') || 'Record'}
          </span>
          <h1>{rec.title}</h1>
          <p className="record-artist">{rec.artistCredit}</p>
          <dl className="record-facts">
            {rec.year && (
              <div>
                <dt>Released</dt>
                <dd>{rec.year}</dd>
              </div>
            )}
            {rec.label && (
              <div>
                <dt>Label</dt>
                <dd>
                  {rec.label}
                  {rec.catalogNumber ? ` · ${rec.catalogNumber}` : ''}
                </dd>
              </div>
            )}
            {(rec.format || rec.pressingYear) && (
              <div>
                <dt>Your pressing</dt>
                <dd>
                  {[rec.format, rec.pressingYear, rec.pressingCountry ? countryWithFlag(rec.pressingCountry) : undefined].filter(Boolean).join(' · ')}
                </dd>
              </div>
            )}
            {rec.durationMs && (
              <div>
                <dt>Runtime</dt>
                <dd>{fmtDuration(rec.durationMs / 60_000)}</dd>
              </div>
            )}
            {rec.artists.filter((a) => a.country || a.area).map((a) => (
              <div key={a.mbid ?? a.name}>
                <dt>{rec.artists.length > 1 ? a.name : 'From'}</dt>
                <dd>
                  {a.country ? `${flag(a.country)} ` : ''}
                  {[a.area, a.country ? countryName(a.country) : undefined].filter(Boolean).join(', ')}
                  {a.begin ? ` · since ${a.begin}` : ''}
                </dd>
              </div>
            ))}
          </dl>
          {rec.genres.length > 0 && (
            <ul className="chips">
              {rec.genres.map((g) => (
                <li key={g}>{displayGenre(g)}</li>
              ))}
              {rec.tags.slice(0, 5).map((t) => (
                <li key={t} className="chip-quiet">
                  {t}
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => logSpin(toLocalIso(new Date()), 'web')}>
              ▶ Log a spin now
            </button>
            {rec.discogs && (
              <a className="btn btn-ghost" href={rec.discogs.url} target="_blank" rel="noreferrer">
                Discogs ↗
              </a>
            )}
            {rec.mbid && (
              <a className="btn btn-ghost" href={`https://musicbrainz.org/release/${rec.mbid}`} target="_blank" rel="noreferrer">
                MusicBrainz ↗
              </a>
            )}
          </div>
          {rec.discogs && (rec.discogs.have || rec.discogs.want) ? (
            <p className="muted small">
              On Discogs: {rec.discogs.have?.toLocaleString('en')} collectors have it, {rec.discogs.want?.toLocaleString('en')} want it
              {rec.discogs.rating ? ` · rated ${rec.discogs.rating}/5` : ''}.
            </p>
          ) : null}
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="kpis">
        <StatTile label="Spins" value={String(stats.spins)} note={stats.rank ? `your ${ordinal(stats.rank)} most played` : undefined} />
        <StatTile label="Time on the platter" value={fmtDuration(stats.minutes)} />
        <StatTile label="First spin" value={stats.firstSpin ? formatDate(stats.firstSpin) : '—'} />
        <StatTile label="Last spin" value={stats.lastSpin ? fmtAgo(stats.lastSpin) : '—'} />
        <StatTile label="Favorite hour" value={stats.favoriteHour !== undefined ? formatHour(stats.favoriteHour) : '—'} />
      </div>

      <div className="grid grid-2-1">
        <ChartCard
          kicker="Last 12 months"
          title="Spins per month"
          table={{ columns: ['Month', 'Spins'], rows: stats.monthly.map((b) => [`${MONTH_SHORT[Number(b.start.slice(5, 7)) - 1]} ${b.start.slice(0, 4)}`, b.count]) }}
        >
          <ColumnChart
            height={190}
            data={stats.monthly.map((b) => ({
              key: b.start,
              label: MONTH_SHORT[Number(b.start.slice(5, 7)) - 1],
              title: `${MONTH_SHORT[Number(b.start.slice(5, 7)) - 1]} ${b.start.slice(0, 4)}`,
              value: b.count,
            }))}
          />
        </ChartCard>
        <section className="card">
          <span className="kicker">NFC tag</span>
          <h2>The sticker link</h2>
          <div className="tag-url">
            <code>{tagUrl(rec.id)}</code>
            <CopyButton text={tagUrl(rec.id)} />
          </div>
          <p className="muted small">
            Write it with NFC Tools (Write › URL). <a href={href('/settings?section=nfc')}>Guide</a>
          </p>
        </section>
      </div>

      <div className={sides.length ? 'grid grid-2' : 'grid'}>
        {sides.length > 0 && (
          <section className="card">
            <span className="kicker">Tracklist</span>
            {sides.map(([side, tracks]) => (
              <div key={side} className="side">
                <h3>Side {side}</h3>
                <ol className="tracks">
                  {tracks.map((t) => (
                    <li key={t.position + t.title}>
                      <span className="track-pos">{t.position}</span>
                      <span className="track-title">{t.title}</span>
                      <span className="track-len">{t.lengthMs ? `${Math.floor(t.lengthMs / 60000)}:${String(Math.round((t.lengthMs % 60000) / 1000)).padStart(2, '0')}` : ''}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}
        <section className="card">
          <span className="kicker">Logbook</span>
          <h2>Recent spins</h2>
          {stats.history.length === 0 && <p className="muted">Not spun yet.</p>}
          <ul className="log-list compact">
            {[...stats.history]
              .reverse()
              .slice(0, 12)
              .map((l) => (
                <li key={l.id}>
                  <span>
                    {formatDate(l.local.date)} · {fmtTime(l.at)}
                  </span>
                  <span className="muted small">{l.source}</span>
                  <button
                    className="icon-button"
                    aria-label={`Delete spin on ${formatDate(l.local.date)}`}
                    onClick={() => confirm('Delete this spin?') && run(() => send('delete-listen', { id: l.id }))}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (pastAt) void logSpin(`${pastAt}:00${toLocalIso(new Date(pastAt)).slice(19)}`, 'manual');
            }}
          >
            <label>
              <span className="small muted">Log a past spin</span>
              <input type="datetime-local" value={pastAt} max={toLocalIso(new Date()).slice(0, 16)} onChange={(e) => setPastAt(e.target.value)} />
            </label>
            <button className="btn btn-small" type="submit">
              Add
            </button>
          </form>
        </section>
      </div>

      <section className="card">
        <span className="kicker">Liner notes</span>
        {editing ? (
          <EditForm
            rec={rec}
            onCancel={() => setEditing(false)}
            onSave={(patch) =>
              run(async () => {
                await send('update-record', { id, patch });
                setEditing(false);
              })
            }
          />
        ) : (
          <>
            {rec.notes ? <p className="notes">{rec.notes}</p> : <p className="muted">No notes yet. Where did you find it? Who gave it to you?</p>}
            <div className="btn-row">
              <button className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
                Edit notes & genres
              </button>
              {rec.mbid && (
                <button className="btn btn-small btn-ghost" disabled={refreshing} onClick={() => run(() => send('refresh-record', { id }))}>
                  {refreshing ? 'Refreshing…' : 'Refresh from MusicBrainz'}
                </button>
              )}
              <button
                className="btn btn-small btn-danger"
                onClick={() => {
                  if (!confirm(`Remove “${rec.title}” and its ${plural(stats.spins, 'spin')} from your crate?`)) return;
                  void run(async () => {
                    await send('delete-record', { id });
                    navigate('/crate');
                  });
                }}
              >
                Remove from crate
              </button>
            </div>
          </>
        )}
        {mode === 'demo' && <p className="muted small">Demo mode: changes are local only.</p>}
      </section>
    </div>
  );
}

function groupSides(rec: VinylRecord): [string, VinylRecord['tracks']][] {
  const sides = new Map<string, VinylRecord['tracks']>();
  for (const t of rec.tracks) {
    const side = /^([A-Z])/i.exec(t.position)?.[1]?.toUpperCase() ?? '·';
    sides.set(side, [...(sides.get(side) ?? []), t]);
  }
  return [...sides];
}

function EditForm({ rec, onSave, onCancel }: { rec: VinylRecord; onSave: (patch: Partial<VinylRecord>) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState(rec.notes ?? '');
  const [genres, setGenres] = useState(rec.genres.join(', '));
  const [year, setYear] = useState(rec.year ? String(rec.year) : '');
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const patch: Partial<VinylRecord> = {};
        const g = genres.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (notes !== (rec.notes ?? '')) patch.notes = notes;
        if (g.join(',') !== rec.genres.join(',')) patch.genres = g;
        if (year && Number(year) !== rec.year) patch.year = Number(year);
        if (Object.keys(patch).length) onSave(patch);
        else onCancel();
      }}
    >
      <label className="field span-2">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </label>
      <label className="field">
        <span>Genres (comma separated, best first)</span>
        <input value={genres} onChange={(e) => setGenres(e.target.value)} />
      </label>
      <label className="field">
        <span>Original year</span>
        <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" pattern="\d{4}" />
      </label>
      <div className="btn-row span-2">
        <button className="btn btn-small" type="submit">
          Save
        </button>
        <button className="btn btn-small btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
