import { useState, type FormEvent } from 'react';
import { BUILD } from '../lib/config.ts';
import { GitHub, GitHubError } from '../lib/github.ts';
import { useStore } from '../lib/store.tsx';
import { navigate } from '../lib/router.ts';
import { Turntable } from '../components/Turntable.tsx';
import { Notice, Stripes } from '../components/bits.tsx';

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Pre-filled fine-grained token form: only this repo, only the permissions VinylWrapped needs. */
function tokenUrl(repo: string): string {
  const params = new URLSearchParams({
    name: 'VinylWrapped',
    description: 'Log spins and read stats for VinylWrapped',
    expires_in: '366',
    contents: 'write',
  });
  const owner = repo.split('/')[0];
  if (owner) params.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${params}`;
}

export function LoginPage({ returnTo, compact = false }: { returnTo?: string; compact?: boolean }) {
  const { login, startDemo } = useStore();
  const [repo, setRepo] = useState(BUILD.appRepo);
  const [editRepo, setEditRepo] = useState(!BUILD.appRepo);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const appRepo = repo.trim();
    if (!REPO_RE.test(appRepo)) {
      setError('The repository should look like owner/name, e.g. octocat/VinylWrapped.');
      return;
    }
    setBusy(true);
    try {
      const gh = new GitHub(token.trim());
      const r = await gh.repo(appRepo);
      if (!r.permissions?.push || !(await gh.canDispatch(appRepo))) {
        setError('That token can see the repository but can’t send events to it. Give it “Contents: Read and write” access.');
        return;
      }
      const dataRepo = appRepo === BUILD.appRepo && BUILD.dataRepo ? BUILD.dataRepo : appRepo;
      if (dataRepo !== appRepo) await gh.repo(dataRepo);
      const user = await gh.user().catch(() => undefined);
      login({ token: token.trim(), appRepo, dataRepo, dataBranch: BUILD.dataBranch, login: user?.login, avatarUrl: user?.avatar_url });
      if (returnTo) navigate(returnTo, { replace: true });
      else if (location.hash.startsWith('#/login')) navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof GitHubError && err.status === 404
          ? `GitHub couldn't find ${appRepo} with this token. Check the name, and that the token has access to that repository.`
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`login-page ${compact ? 'is-compact' : ''}`}>
      <div className="login-art">
        <div className="logo logo-big">
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </div>
        <p className="login-tagline">Every record you actually spin, wrapped up like the year-end stats you deserve.</p>
        {!compact && <Turntable playing className="login-turntable" />}
      </div>

      <form className="ticket" onSubmit={submit}>
        <Stripes className="ticket-stripes" />
        <span className="kicker">Admit one · backstage</span>
        <h1>{compact ? 'Log in once on this phone' : 'Backstage pass'}</h1>
        {compact && <p>Your spins are saved to your GitHub repository. Log in once on this device and every tag scan after that just works.</p>}

        <label className="field">
          <span>Repository</span>
          {editRepo ? (
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="you/VinylWrapped" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
          ) : (
            <span className="field-static">
              <code>{repo}</code>
              <button type="button" className="link-button" onClick={() => setEditRepo(true)}>
                change
              </button>
            </span>
          )}
        </label>

        <label className="field">
          <span>GitHub token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
            required
          />
        </label>

        {error && <Notice tone="error">{error}</Notice>}

        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Checking your pass…' : 'Enter'}
        </button>

        <details className="help">
          <summary>How do I get a token?</summary>
          <ol>
            <li>
              Open{' '}
              <a href={tokenUrl(repo)} target="_blank" rel="noreferrer">
                GitHub › New fine-grained token
              </a>
              .
            </li>
            <li>
              Under <em>Repository access</em> choose <em>Only select repositories</em> and pick <code>{repo || 'your VinylWrapped repo'}</code>.
            </li>
            <li>
              Under <em>Permissions</em> set <strong>Contents → Read and write</strong>. Nothing else is needed.
            </li>
            <li>Generate, copy, paste it here. It stays on this device only.</li>
          </ol>
        </details>

        {!compact && (
          <p className="login-demo">
            Just browsing?{' '}
            <button type="button" className="link-button" onClick={startDemo}>
              Spin the demo crate →
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
