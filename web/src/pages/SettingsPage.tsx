import { useEffect } from 'react';
import { WEEKDAY_LONG } from '../../../shared/time.ts';
import { useStore } from '../lib/store.tsx';
import { href, type Route } from '../lib/router.ts';
import { BUILD, tagUrl } from '../lib/config.ts';
import { CopyButton, Notice } from '../components/bits.tsx';
import { plural } from '../lib/format.ts';

export function SettingsPage({ route }: { route: Route }) {
  const { session, mode, logout, settings, updateSettings, library, sha } = useStore();
  const section = route.query.get('section');
  const appRepo = session?.appRepo || BUILD.appRepo || 'you/VinylWrapped';
  const example = Object.keys(library.records)[0] ?? 'abbey-road';

  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
  }, [section]);

  const shortcutBody = JSON.stringify({ event_type: 'spin', client_payload: { record: '«Shortcut Input»', source: 'shortcut' } }, null, 2);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vinylwrapped-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page narrow settings-page">
      <div className="page-head">
        <span className="kicker">Back room</span>
        <h1>Settings & setup</h1>
      </div>

      <section className="card" id="account">
        <h2>Account</h2>
        {mode === 'demo' ? (
          <p>
            You're browsing the <strong>demo crate</strong>. Nothing is saved.
          </p>
        ) : session ? (
          <div className="account">
            {session.avatarUrl && <img src={session.avatarUrl} alt="" className="avatar" />}
            <div>
              <p>
                Logged in{session.login ? ` as @${session.login}` : ''}. Events go to <code>{session.appRepo}</code>; data lives on{' '}
                <code>
                  {session.dataRepo}@{session.dataBranch}
                </code>
                {sha ? ` (commit ${sha.slice(0, 7)})` : ' (no data yet; it appears with your first event)'}.
              </p>
              <p className="btn-row">
                <a className="btn btn-small btn-ghost" href={`https://github.com/${session.appRepo}/actions/workflows/ingest.yml`} target="_blank" rel="noreferrer">
                  Ingest runs ↗
                </a>
                <a className="btn btn-small btn-ghost" href={`https://github.com/${session.dataRepo}/tree/${session.dataBranch}`} target="_blank" rel="noreferrer">
                  Data branch ↗
                </a>
              </p>
            </div>
          </div>
        ) : null}
        <button className="btn btn-small btn-danger" onClick={logout}>
          {mode === 'demo' ? 'Leave the demo' : 'Log out on this device'}
        </button>
      </section>

      <section className="card" id="nfc">
        <span className="kicker">The magic part</span>
        <h2>NFC stickers</h2>
        <p>
          Each record gets a cheap NFC sticker holding a link like <code>{tagUrl(example)}</code>. Tapping it with your iPhone opens that link, and that page
          logs the spin.
        </p>
        <h3>What to buy</h3>
        <p>
          <strong>NTAG215</strong> (or NTAG213/216) stickers: small round 25–30 mm ones fit on an inner sleeve or inside the jacket. Any brand works. Keep them off
          metal.
        </p>
        <h3>Write a tag (once per record)</h3>
        <ol className="steps">
          <li>Add the record here, then copy its sticker link from the record page.</li>
          <li>
            Install the free <strong>NFC Tools</strong> app › <em>Write</em> › <em>Add a record</em> › <em>URL / URI</em> › paste › <em>Write</em> › hold the top of
            the iPhone to the sticker.
          </li>
          <li>
            Optional: <em>Other › Lock tag</em> makes it read-only for good.
          </li>
        </ol>
        <h3>Log a spin</h3>
        <ol className="steps">
          <li>
            Hold the top edge of your iPhone near the sticker (screen on, unlocked). iPhone XS and newer read tags without any app.
          </li>
          <li>
            Tap the <em>“Open in Safari”</em> banner. The needle drops and the spin is logged.
          </li>
          <li>The first time on a phone you'll log in once; after that it's tap, tap, music.</li>
        </ol>
        <Notice>
          Shortcut: write a stack of stickers with ids like <code>tag-01</code>, <code>tag-02</code>… in one go. The first time you scan an unknown one,
          VinylWrapped asks which record it belongs to.
        </Notice>
      </section>

      <section className="card" id="shortcut">
        <span className="kicker">Optional</span>
        <h2>Zero-tap mode with iPhone Shortcuts</h2>
        <p>
          Don't want to tap the banner? A Shortcuts <em>automation</em> can log the spin silently, with no Safari involved. The catch: iOS needs one automation
          per sticker.
        </p>
        <h3>1 · Create the “Log vinyl spin” shortcut (once)</h3>
        <ol className="steps">
          <li>
            New shortcut › tap ⓘ › turn on <em>Receive input</em>: <em>Text</em> (from Share Sheet is fine).
          </li>
          <li>
            Add <strong>Get Contents of URL</strong> with URL
            <div className="tag-url">
              <code>https://api.github.com/repos/{appRepo}/dispatches</code>
              <CopyButton text={`https://api.github.com/repos/${appRepo}/dispatches`} />
            </div>
          </li>
          <li>
            Method <strong>POST</strong>. Headers: <code>Authorization</code> = <code>Bearer YOUR_TOKEN</code>, <code>Accept</code> ={' '}
            <code>application/vnd.github+json</code>.
          </li>
          <li>
            Request Body <strong>JSON</strong>: <code>event_type</code> (Text) = <code>spin</code>; <code>client_payload</code> (Dictionary) with{' '}
            <code>record</code> = <em>Shortcut Input</em> and <code>source</code> = <code>shortcut</code>. It ends up as:
            <pre className="code-block">{shortcutBody}</pre>
          </li>
          <li>
            Optional: add <strong>Show Notification</strong> “🎶 Logged”.
          </li>
        </ol>
        <h3>2 · One automation per sticker</h3>
        <ol className="steps">
          <li>
            Shortcuts › <em>Automation</em> › <em>+</em> › <em>NFC</em> › <em>Scan</em> the sticker › name it after the record.
          </li>
          <li>
            Choose <em>Run Immediately</em> and turn off <em>Notify When Run</em>.
          </li>
          <li>
            Action: <strong>Run Shortcut</strong> › <em>Log vinyl spin</em>, with input text = the record's id (e.g. <code>{example}</code>).
          </li>
        </ol>
        <p className="muted small">
          Both modes can live on the same sticker: the link still works for friends' phones or new phones. The token in the shortcut needs the same
          “Contents: Read and write” access as the one you log in with.
        </p>
      </section>

      <section className="card" id="preferences">
        <h2>Preferences</h2>
        <fieldset className="weekend">
          <legend>Weekend days (for “weekend warrior” stats)</legend>
          {WEEKDAY_LONG.map((d, i) => (
            <label key={d} className="check">
              <input
                type="checkbox"
                checked={settings.weekend.includes(i)}
                onChange={(e) =>
                  updateSettings({ ...settings, weekend: e.target.checked ? [...settings.weekend, i].sort() : settings.weekend.filter((x) => x !== i) })
                }
              />
              {d}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card" id="data">
        <h2>Your data</h2>
        <p>
          {plural(Object.keys(library.records).length, 'record')} and {plural(library.listens.length, 'spin')}. It's all plain JSON in your own repository: no
          database, no third parties.
        </p>
        <button className="btn btn-small btn-ghost" onClick={exportData}>
          Download a backup (JSON)
        </button>
        <p className="muted small">
          Stats are computed in your browser. Timezone for spins logged by Shortcuts without a time: repository variable <code>VW_TIMEZONE</code>.{' '}
          <a href={href('/')}>Back to stats</a>
        </p>
      </section>
    </div>
  );
}
