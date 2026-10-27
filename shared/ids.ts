/** Lowercase, ASCII, dash-separated. Empty when the text has no Latin letters/digits (e.g. Hebrew titles). */
export function slugify(text: string, maxLength = 32): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

export function randomToken(length = 5): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Picks a record id that isn't taken: "abbey-road", then "abbey-road-2", ... */
export function uniqueRecordId(base: string, taken: (id: string) => boolean): string {
  const root = slugify(base) || `rec-${randomToken()}`;
  if (!taken(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!taken(candidate)) return candidate;
  }
}

export const RECORD_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidRecordId(id: string): boolean {
  return RECORD_ID_RE.test(id);
}

export function newListenId(now = Date.now()): string {
  return `l${now.toString(36)}${randomToken(4)}`;
}
