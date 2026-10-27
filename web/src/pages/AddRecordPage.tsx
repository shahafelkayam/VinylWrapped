import { useEffect, useState, type FormEvent } from 'react';
import type { RecordFields } from '../../../shared/types.ts';
import { isValidRecordId, slugify, uniqueRecordId } from '../../../shared/ids.ts';
import { useStore } from '../lib/store.tsx';
import { href, type Route } from '../lib/router.ts';
import { tagUrl } from '../lib/config.ts';
import { albumCover, pressingCover, pressingsOf, searchAlbums, type AlbumHit, type Pressing } from '../lib/musicbrainz.ts';
import { countryName } from '../lib/format.ts';
import { Cover } from '../components/Cover.tsx';
import { CopyButton, Notice, Spinner } from '../components/bits.tsx';
import { Vinyl } from '../components/Vinyl.tsx';

type Step = 'search' | 'pressing' | 'sent';

export function AddRecordPage({ route }: { route: Route }) {
  const { library, send, pending, mode } = useStore();
  const tag = route.query.get('tag') ?? '';
  const [manual, setManual] = useState(false);
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState(route.query.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [hits, setHits] = useState<AlbumHit[]>();
  const [album, setAlbum] = useState<AlbumHit>();
  const [pressings, setPressings] = useState<Pressing[]>();
  const [showAll, setShowAll] = useState(false);
  const [pressing, setPressing] = useState<Pressing>();
  const [recordId, setRecordId] = useState(tag);
  const [sentId, setSentId] = useState<string>();

  const taken = (id: string) => id in library.records;

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      setHits(await searchAlbums(query));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (route.query.get('q')) void search();
    // Run once for deep links like #/add?q=abbey+road
  }, []);

  const pickAlbum = async (hit: AlbumHit) => {
    setAlbum(hit);
    setStep('pressing');
    setPressings(undefined);
    setPressing(undefined);
    if (!tag) setRecordId(uniqueRecordId(slugify(hit.title) || hit.artist, taken));
    setBusy(true);
    setError(undefined);
    try {
      const list = await pressingsOf(hit.id);
      setPressings(list);
      setPressing(list.find((p) => p.isVinyl) ?? list[0]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const idProblem = !isValidRecordId(recordId)
    ? 'Use lowercase letters, numbers and dashes.'
    : taken(recordId) && recordId !== tag
      ? `“${library.records[recordId].title}” already uses this id; adding will replace it.`
      : undefined;

  const submit = async (payload: { id: string; mbid?: string; manual?: Partial<RecordFields> }, preview: RecordFields) => {
    setBusy(true);
    setError(undefined);
    try {
      await send('add-record', payload, { preview });
      setSentId(payload.id);
      setStep('sent');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addPressing = () => {
    if (!album || !pressing || !isValidRecordId(recordId)) return;
    void submit(
      { id: recordId, mbid: pressing.id },
      {
        title: album.title,
        artistCredit: album.artist,
        artists: [{ name: album.artist, genres: [] }],
        genres: [],
        tags: [],
        tracks: [],
        ...(album.year ? { year: album.year } : {}),
        ...(pressing.label ? { label: pressing.label } : {}),
        format: pressing.format,
        coverUrl: pressing.hasCover ? pressingCover(pressing.id, 500) : albumCover(album.id, 500),
        mbid: pressing.id,
        releaseGroupMbid: album.id,
      },
    );
  };

  if (step === 'sent' && sentId) {
    const confirmed = !pending.some((p) => p.type === 'add-record' && (p.payload as { id: string }).id === sentId);
    const rec = library.records[sentId];
    return (
      <div className="page narrow">
        <section className="card sent-card">
          <Vinyl size={140} spinning={!confirmed} labelImage={rec?.coverUrl} />
          <div>
            <span className="kicker">{confirmed ? 'In the crate' : 'At the pressing plant'}</span>
            <h1>{rec?.title ?? 'Your record'}</h1>
            <p>
              {confirmed
                ? 'Added, with genres, tracklist, label and artist details filled in.'
                : 'GitHub Actions is fetching the details from MusicBrainz. This usually takes under a minute.'}
            </p>
          </div>
        </section>
        <section className="card">
          <span className="kicker">Next: the sticker</span>
          <h2>Write this link to an NFC tag</h2>
          <div className="tag-url">
            <code>{tagUrl(sentId)}</code>
            <CopyButton text={tagUrl(sentId)} />
          </div>
          <ol className="steps">
            <li>Copy the link above.</li>
            <li>
              Open <strong>NFC Tools</strong> on your iPhone › <em>Write</em> › <em>Add a record</em> › <em>URL / URI</em>, paste, then <em>Write</em> and hold the
              phone to the sticker.
            </li>
            <li>Stick it on the sleeve (inside the cover, or on the inner sleeve) and scan it whenever this record goes on the platter.</li>
          </ol>
          <p className="muted">
            Already wrote this tag before linking it? Nothing to do: earlier scans of <code>{sentId}</code> now count for this record.{' '}
            <a href={href('/settings?section=nfc')}>More about tags</a>
          </p>
          <div className="btn-row">
            <a className="btn" href={href(`/record/${sentId}`)}>
              Open the record
            </a>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep('search');
                setHits(undefined);
                setQuery('');
                setRecordId('');
                setSentId(undefined);
              }}
            >
              Add another
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow add-page">
      <div className="page-head">
        <span className="kicker">New arrival</span>
        <h1>Add a record to your crate</h1>
        {tag && (
          <Notice>
            Linking tag <code>{tag}</code>. Pick the record it belongs to.
          </Notice>
        )}
        {mode === 'demo' && <Notice tone="warn">Demo mode: the record is added locally and disappears when you reload.</Notice>}
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={!manual} onClick={() => setManual(false)}>
            Search MusicBrainz
          </button>
          <button role="tab" aria-selected={manual} onClick={() => setManual(true)}>
            Enter manually
          </button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {manual ? (
        <ManualForm initialId={tag} taken={taken} busy={busy} onSubmit={submit} />
      ) : step === 'search' ? (
        <>
          <form className="search-bar" onSubmit={search}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Album and artist, e.g. “kind of blue miles davis”" autoFocus aria-label="Search albums" />
            <button className="btn" type="submit" disabled={busy}>
              Dig
            </button>
          </form>
          {busy && <Spinner label="Flipping through the crates…" />}
          {hits && !busy && (
            <div className="album-grid">
              {hits.length === 0 && <p className="muted">No albums found. Try fewer words, or enter it manually.</p>}
              {hits.map((h) => (
                <button key={h.id} className="album-hit" onClick={() => pickAlbum(h)}>
                  <Cover record={{ id: h.id, title: h.title, artistCredit: h.artist, coverUrl: albumCover(h.id) }} />
                  <strong>{h.title}</strong>
                  <span>{h.artist}</span>
                  <span className="muted">
                    {[h.year, h.type].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        album && (
          <div className="pressing-step">
            <button className="link-button" onClick={() => setStep('search')}>
              ← Back to results
            </button>
            <section className="card pressing-album">
              <Cover record={{ id: album.id, title: album.title, artistCredit: album.artist, coverUrl: albumCover(album.id, 500) }} size={120} />
              <div>
                <h2>{album.title}</h2>
                <p>
                  {album.artist}
                  {album.year ? ` · ${album.year}` : ''}
                </p>
              </div>
            </section>

            <section className="card">
              <h3>Which pressing is yours?</h3>
              <p className="muted">Not sure? The first vinyl one is fine; your stats use the album's original year either way.</p>
              {busy && <Spinner label="Fetching pressings…" />}
              {pressings && (
                <>
                  {!pressings.some((p) => p.isVinyl) && <p className="muted small">No vinyl pressing listed on MusicBrainz yet; pick the closest release.</p>}
                  <ul className="pressings" role="radiogroup">
                    {pressings
                      .filter((p) => showAll || p.isVinyl || !pressings.some((x) => x.isVinyl))
                      .slice(0, showAll ? 200 : 40)
                      .map((p) => (
                        <li key={p.id}>
                          <label className={pressing?.id === p.id ? 'is-selected' : ''}>
                            <input type="radio" name="pressing" checked={pressing?.id === p.id} onChange={() => setPressing(p)} />
                            <span className="pressing-main">
                              <strong>{p.format}</strong> {p.date ? `· ${p.date.slice(0, 4)}` : ''} {p.country ? `· ${countryName(p.country)}` : ''}
                            </span>
                            <span className="muted">
                              {[p.label, p.catalogNumber].filter(Boolean).join(' · ')}
                              {p.trackCount ? ` · ${p.trackCount} tracks` : ''}
                            </span>
                          </label>
                        </li>
                      ))}
                  </ul>
                  {pressings.some((p) => !p.isVinyl) && pressings.some((p) => p.isVinyl) && (
                    <button className="link-button" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Only vinyl' : `Show all ${pressings.length} releases (CD, digital…)`}
                    </button>
                  )}
                </>
              )}
            </section>

            <section className="card">
              <label className="field">
                <span>Tag id: this goes in the NFC link</span>
                <input value={recordId} onChange={(e) => setRecordId(e.target.value.toLowerCase())} disabled={!!tag} spellCheck={false} autoCapitalize="off" />
              </label>
              {recordId && <p className="muted mono small">{tagUrl(recordId)}</p>}
              {idProblem && <Notice tone={isValidRecordId(recordId) ? 'warn' : 'error'}>{idProblem}</Notice>}
              <button className="btn btn-block" onClick={addPressing} disabled={!pressing || busy || !isValidRecordId(recordId)}>
                Add to crate
              </button>
            </section>
          </div>
        )
      )}
    </div>
  );
}

function ManualForm({
  initialId,
  taken,
  busy,
  onSubmit,
}: {
  initialId: string;
  taken: (id: string) => boolean;
  busy: boolean;
  onSubmit: (payload: { id: string; manual: Partial<RecordFields> }, preview: RecordFields) => void;
}) {
  const [f, setF] = useState({ title: '', artist: '', year: '', genres: '', label: '', minutes: '', coverUrl: '', id: initialId });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const id = f.id || (f.title ? uniqueRecordId(f.title, taken) : '');

  return (
    <form
      className="card form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const manual: Partial<RecordFields> = {
          title: f.title.trim(),
          artistCredit: f.artist.trim(),
          ...(f.year ? { year: Number(f.year) } : {}),
          ...(f.genres ? { genres: f.genres.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean) } : {}),
          ...(f.label ? { label: f.label.trim() } : {}),
          ...(f.minutes ? { durationMs: Math.round(Number(f.minutes) * 60_000) } : {}),
          ...(f.coverUrl.startsWith('https://') ? { coverUrl: f.coverUrl.trim() } : {}),
        };
        onSubmit(
          { id, manual },
          { artists: [{ name: manual.artistCredit!, genres: [] }], genres: [], tags: [], tracks: [], ...manual, title: manual.title!, artistCredit: manual.artistCredit! },
        );
      }}
    >
      <label className="field">
        <span>Title *</span>
        <input value={f.title} onChange={set('title')} required />
      </label>
      <label className="field">
        <span>Artist *</span>
        <input value={f.artist} onChange={set('artist')} required />
      </label>
      <label className="field">
        <span>Original year</span>
        <input value={f.year} onChange={set('year')} inputMode="numeric" pattern="\d{4}" placeholder="1977" />
      </label>
      <label className="field">
        <span>Runtime (minutes)</span>
        <input value={f.minutes} onChange={set('minutes')} inputMode="decimal" placeholder="42" />
      </label>
      <label className="field span-2">
        <span>Genres (comma separated)</span>
        <input value={f.genres} onChange={set('genres')} placeholder="mizrahi, folk" />
      </label>
      <label className="field">
        <span>Label</span>
        <input value={f.label} onChange={set('label')} />
      </label>
      <label className="field">
        <span>Cover image URL</span>
        <input value={f.coverUrl} onChange={set('coverUrl')} placeholder="https://…" />
      </label>
      <label className="field span-2">
        <span>Tag id</span>
        <input value={f.id} onChange={set('id')} placeholder={id || 'generated from the title'} disabled={!!initialId} spellCheck={false} autoCapitalize="off" />
      </label>
      <button className="btn btn-block span-2" type="submit" disabled={busy || !f.title || !f.artist || (!!id && !isValidRecordId(id))}>
        Add to crate
      </button>
    </form>
  );
}
