// Sign in / sign up, on the "backstage pass" ticket.
import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../lib/store.tsx';
import { navigate } from '../lib/router.ts';
import { MIN_PASSWORD, USERNAME_RE, usernameAvailable } from '../lib/api.ts';
import { Turntable } from '../components/Turntable.tsx';
import { Notice, Stripes } from '../components/bits.tsx';

type Tab = 'signin' | 'signup';

export function AuthPage({ returnTo, compact = false, initialTab = 'signin' }: { returnTo?: string; compact?: boolean; initialTab?: Tab }) {
  const { backend, startDemo } = useStore();
  const [tab, setTab] = useState<Tab>(initialTab);
  const linkError = new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description');

  const done = () => navigate(returnTo ?? '/', { replace: true });

  return (
    <div className={`login-page ${compact ? 'is-compact' : ''}`}>
      <div className="login-art">
        <div className="logo logo-big">
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </div>
        <p className="login-tagline">Every record you actually spin, wrapped up like the year-end stats you deserve. And see what everyone else is spinning.</p>
        {!compact && <Turntable playing className="login-turntable" />}
      </div>

      <div className="ticket">
        <Stripes className="ticket-stripes" />
        <span className="kicker">Admit one · backstage</span>
        {compact && <p>Sign in once on this phone and every sticker you tap after that just works.</p>}
        {linkError && <Notice tone="error">{linkError.replace(/\+/g, ' ')}</Notice>}

        {!backend ? (
          <>
            <h1>Not connected yet</h1>
            <p>This copy of VinylWrapped isn’t connected to its database, so accounts aren’t available. You can still explore the demo.</p>
          </>
        ) : (
          <>
            <div className="segmented ticket-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'signin'} onClick={() => setTab('signin')}>
                Sign in
              </button>
              <button role="tab" aria-selected={tab === 'signup'} onClick={() => setTab('signup')}>
                Sign up
              </button>
            </div>
            {tab === 'signin' && <SignInForm onDone={done} />}
            {tab === 'signup' && <SignUpForm onDone={done} />}
          </>
        )}

        {!backend && !compact && (
          <p className="login-demo">
            Just browsing?{' '}
            <button type="button" className="link-button" onClick={startDemo}>
              Spin the demo crate →
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const { signIn } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(async () => {
    await signIn(username, password);
    onDone();
  });
  return (
    <form onSubmit={submit}>
      <h1>Welcome back</h1>
      <Field label="Username">
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Checking your pass…' : 'Sign in'}
      </button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const { signUp } = useStore();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [available, setAvailable] = useState<boolean>();
  const [confirmEmail, setConfirmEmail] = useState(false);
  const name = username.trim().toLowerCase();
  const nameOk = USERNAME_RE.test(name);

  const { busy, error, submit } = useSubmit(async () => {
    if (!nameOk) throw new Error('Usernames are 3–20 lowercase letters, numbers or underscores.');
    if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`);
    const ready = await signUp({ username: name, email, password, displayName });
    if (ready) onDone();
    else setConfirmEmail(true);
  });

  if (confirmEmail) {
    return (
      <div>
        <h1>Check your inbox</h1>
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Open it on this device, then sign in as <strong>@{name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h1>Get your pass</h1>
      <Field
        label="Username"
        hint={
          !username ? 'Your public handle: 3–20 lowercase letters, numbers or _.' : !nameOk ? 'Only a–z, 0–9 and _, 3–20 characters.' : available === false ? 'Taken. Try another.' : available ? `vinylwrapped/@${name} is yours to take.` : ' '
        }
      >
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setAvailable(undefined);
          }}
          onBlur={async () => setAvailable(nameOk ? await usernameAvailable(name).catch(() => undefined) : undefined)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          required
        />
      </Field>
      <Field label="Display name (optional)">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} autoComplete="nickname" />
      </Field>
      <Field label="Email" hint="Private. Never shown to anyone.">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </Field>
      <Field label="Password" hint={`At least ${MIN_PASSWORD} characters.`}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} required />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <button className="btn btn-block" type="submit" disabled={busy || available === false}>
        {busy ? 'Printing your pass…' : 'Create account'}
      </button>
    </form>
  );
}
