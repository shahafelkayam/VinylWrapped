import { useEffect, useState, type FormEvent } from 'react';
import { WEEKDAY_LONG } from '../../../shared/time.ts';
import { useStore } from '../lib/store.tsx';
import { href, navigate, type Route } from '../lib/router.ts';
import { tagUrl } from '../lib/config.ts';
import { MIN_PASSWORD, updatePassword, USERNAME_RE, type Visibility } from '../lib/api.ts';
import { Notice } from '../components/bits.tsx';
import { plural } from '../lib/format.ts';
import { VISIBILITY_LABEL } from './PeoplePage.tsx';

export function SettingsPage({ route }: { route: Route }) {
  const { mode, settings, updateSettings, library } = useStore();
  const section = route.query.get('section');
  const example = Object.keys(library.records)[0] ?? 'abbey-road';

  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
  }, [section]);

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
        <h1>Settings</h1>
      </div>

      {mode === 'demo' ? <DemoAccount /> : <ProfileSettings />}
      {mode === 'live' && <AccountSettings />}

      <section className="card" id="nfc">
        <span className="kicker">The magic part</span>
        <h2>NFC stickers</h2>
        <p>
          Each record gets a cheap NFC sticker holding a link like <code>{tagUrl(example)}</code>. Tapping it with your iPhone opens that link, and that page
          logs the spin to whoever is signed in on the phone.
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
          <li>Hold the top edge of your iPhone near the sticker (screen on, unlocked). iPhone XS and newer read tags without any app.</li>
          <li>
            Tap the <em>“Open in Safari”</em> banner. The needle drops and the spin is logged.
          </li>
          <li>The first time on a phone you sign in once; after that it's tap, tap, music.</li>
        </ol>
        <Notice>
          Tip: write a stack of stickers with ids like <code>tag-01</code>, <code>tag-02</code>… in one go. The first time you scan an unknown one, VinylWrapped
          asks which record it belongs to.
        </Notice>
      </section>

      <section className="card" id="preferences">
        <h2>Preferences</h2>
        <fieldset className="weekend">
          <legend>Weekend days (for “weekend warrior” stats, on this device)</legend>
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
          {plural(Object.keys(library.records).length, 'record')} and {plural(library.listens.length, 'spin')}.
          {mode === 'live' &&
            ' They live in a database that only lets you change them. Who can see them follows your profile setting above, and your email is never shown to anyone.'}
        </p>
        <button className="btn btn-small btn-ghost" onClick={exportData}>
          Download a backup (JSON)
        </button>
        <p className="muted small">
          <a href={href('/')}>Back to your stats</a>
        </p>
      </section>
    </div>
  );
}

function DemoAccount() {
  const { leaveDemo } = useStore();
  return (
    <section className="card" id="account">
      <h2>Demo crate</h2>
      <p>You're browsing the demo. Nothing is saved, and nobody else can see it.</p>
      <div className="btn-row">
        <button
          className="btn btn-small"
          onClick={() => {
            leaveDemo();
            navigate('/signup');
          }}
        >
          Create a real account
        </button>
        <button className="btn btn-small btn-ghost" onClick={leaveDemo}>
          Leave the demo
        </button>
      </div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const ok = await fn();
      if (ok) setMessage({ tone: 'ok', text: ok });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

function ProfileSettings() {
  const { me, saveProfile } = useStore();
  const [username, setUsername] = useState(me?.username ?? '');
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [visibility, setVisibility] = useState<Visibility>(me?.visibility ?? 'members');
  const { busy, message, run } = useAction();
  if (!me) return null;

  const changed = username !== me.username || displayName !== (me.displayName ?? '') || visibility !== me.visibility;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const name = username.trim().toLowerCase();
      if (!USERNAME_RE.test(name)) throw new Error('Usernames are 3–20 lowercase letters, numbers or underscores.');
      await saveProfile({ username: name, displayName, visibility });
      return 'Saved.';
    });
  };

  return (
    <form className="card" id="profile" onSubmit={submit}>
      <h2>Your profile</h2>
      <div className="form-grid">
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} maxLength={20} required />
        </label>
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder={`@${me.username}`} />
        </label>
      </div>
      <fieldset className="visibility">
        <legend>Who can see your crate, stats and Wrapped?</legend>
        {(['public', 'members', 'private'] as Visibility[]).map((v) => (
          <label key={v} className={`visibility-option ${visibility === v ? 'is-selected' : ''}`}>
            <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
            <span>
              <strong>
                {VISIBILITY_LABEL[v].icon} {VISIBILITY_LABEL[v].label}
              </strong>
              <span className="muted">{VISIBILITY_LABEL[v].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {visibility === 'public' && (
        <p className="muted small">
          Your public link: <code>{`${location.origin}${location.pathname}#/u/${me.username}`}</code>
        </p>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <button className="btn btn-small" type="submit" disabled={busy || !changed}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function AccountSettings() {
  const { me, signOut, deleteAccount } = useStore();
  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const pw = useAction();
  const del = useAction();
  if (!me) return null;

  return (
    <section className="card" id="account">
      <h2>Account</h2>
      <p>
        Signed in as <strong>@{me.username}</strong>
        {me.email && (
          <>
            {' '}
            · <span className="muted">{me.email}</span> (only you can see this)
          </>
        )}
      </p>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void pw.run(async () => {
            if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
            await updatePassword(password);
            setPassword('');
            return 'Password changed.';
          });
        }}
      >
        <label>
          <span className="small muted">New password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} />
        </label>
        <button className="btn btn-small" type="submit" disabled={pw.busy || !password}>
          Change
        </button>
      </form>
      {pw.message && <Notice tone={pw.message.tone}>{pw.message.text}</Notice>}

      <div className="btn-row account-actions">
        <button className="btn btn-small btn-ghost" onClick={() => void signOut().then(() => navigate('/', { replace: true }))}>
          Sign out on this device
        </button>
      </div>

      <details className="danger-zone">
        <summary>Delete my account</summary>
        <p>This permanently deletes your profile, your crate and every spin. It can't be undone. Download a backup first if you want one.</p>
        <label className="field">
          <span>Type your username to confirm</span>
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoCapitalize="none" spellCheck={false} />
        </label>
        {del.message && <Notice tone={del.message.tone}>{del.message.text}</Notice>}
        <button
          className="btn btn-small btn-danger"
          disabled={del.busy || confirmName.trim().toLowerCase() !== me.username}
          onClick={() =>
            void del.run(async () => {
              await deleteAccount();
              navigate('/', { replace: true });
            })
          }
        >
          {del.busy ? 'Deleting…' : 'Delete everything'}
        </button>
      </details>
    </section>
  );
}
