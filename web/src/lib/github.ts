// Tiny GitHub REST client. The browser talks to api.github.com directly (CORS is allowed),
// authenticated with the fine-grained token you log in with.
import type { EventMap, EventType, Library } from '../../../shared/types.ts';

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class GitHub {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request(path: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: init.accept ?? 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.ok) return res;
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Not JSON.
    }
    if (res.status === 401) message = 'GitHub rejected the token (expired or mistyped?).';
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') message = 'GitHub rate limit reached; try again in a few minutes.';
    throw new GitHubError(res.status, message);
  }

  async user(): Promise<{ login: string; avatar_url: string }> {
    return (await this.request('/user')).json();
  }

  async repo(fullName: string): Promise<{ full_name: string; private: boolean; permissions?: { push?: boolean; pull?: boolean } }> {
    return (await this.request(`/repos/${fullName}`)).json();
  }

  /** Latest commit sha of a branch, or null if the branch doesn't exist yet. */
  async branchSha(repo: string, branch: string): Promise<string | null> {
    try {
      const res = await this.request(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      const body = (await res.json()) as { object: { sha: string } };
      return body.object.sha;
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 404 || err.status === 409)) return null;
      throw err;
    }
  }

  async rawFile(repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.request(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { accept: 'application/vnd.github.raw+json' });
      return await res.text();
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  /** Loads the library pinned to a commit sha, so we never mix two versions of the data. */
  async library(repo: string, branch: string): Promise<{ sha: string | null; library: Library }> {
    const sha = await this.branchSha(repo, branch);
    if (!sha) return { sha: null, library: { records: {}, listens: [] } };
    const [records, listens] = await Promise.all([this.rawFile(repo, 'records.json', sha), this.rawFile(repo, 'listens.json', sha)]);
    return {
      sha,
      library: {
        records: records ? JSON.parse(records) : {},
        listens: listens ? JSON.parse(listens) : [],
      },
    };
  }

  /**
   * Whether this token may send events. `repo().permissions` describes the *account*, not a
   * fine-grained token, so we send an event type that no workflow listens to and see if it's accepted.
   */
  async canDispatch(repo: string): Promise<boolean> {
    try {
      await this.request(`/repos/${repo}/dispatches`, { method: 'POST', body: JSON.stringify({ event_type: 'vinylwrapped-login-check', client_payload: {} }) });
      return true;
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 403 || err.status === 404)) return false;
      throw err;
    }
  }

  async dispatch<E extends EventType>(repo: string, type: E, payload: EventMap[E]): Promise<void> {
    await this.request(`/repos/${repo}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ event_type: type, client_payload: payload }),
    });
  }
}
