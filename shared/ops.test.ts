import { describe, expect, it } from 'vitest';
import type { Library } from './types.ts';
import { applyOp } from './ops.ts';

const record = { title: 'Abbey Road', artistCredit: 'The Beatles', artists: [], genres: ['rock'], tags: [], tracks: [] };

function fresh(): Library {
  return {
    records: { 'abbey-road': { ...record, id: 'abbey-road', addedAt: '2026-01-01T00:00:00+00:00' } },
    listens: [{ id: 'a', record: 'abbey-road', at: '2026-10-01T20:00:00+03:00', source: 'nfc' }],
  };
}

describe('spin', () => {
  it('inserts in chronological order', () => {
    const lib = fresh();
    const res = applyOp(lib, { type: 'spin', force: false, listen: { id: 'b', record: 'abbey-road', at: '2026-09-01T20:00:00+03:00', source: 'web' } });
    expect(res.changed).toBe(true);
    expect(lib.listens.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('ignores accidental double scans unless forced', () => {
    const lib = fresh();
    const dupe = { id: 'c', record: 'abbey-road', at: '2026-10-01T17:03:00Z', source: 'nfc' as const };
    expect(applyOp(lib, { type: 'spin', force: false, listen: dupe }).changed).toBe(false);
    expect(applyOp(lib, { type: 'spin', force: true, listen: dupe }).changed).toBe(true);
    expect(lib.listens).toHaveLength(2);
  });

  it('is idempotent on listen id', () => {
    const lib = fresh();
    const listen = { id: 'a', record: 'abbey-road', at: '2026-11-01T20:00:00+02:00', source: 'nfc' as const };
    expect(applyOp(lib, { type: 'spin', force: true, listen }).changed).toBe(false);
  });
});

describe('records', () => {
  it('generates a unique id when none is requested', () => {
    const lib = fresh();
    applyOp(lib, { type: 'add-record', record, addedAt: '2026-10-26T00:00:00+00:00' });
    expect(Object.keys(lib.records).sort()).toEqual(['abbey-road', 'abbey-road-2']);
  });

  it('relinks an existing id but keeps its addedAt', () => {
    const lib = fresh();
    const res = applyOp(lib, { type: 'add-record', id: 'abbey-road', record: { ...record, title: 'Let It Be' }, addedAt: '2026-10-26T00:00:00+00:00' });
    expect(res.message).toMatch(/Relinked/);
    expect(lib.records['abbey-road']).toMatchObject({ title: 'Let It Be', addedAt: '2026-01-01T00:00:00+00:00' });
  });

  it('claims earlier spins of an unlinked tag', () => {
    const lib: Library = { records: {}, listens: [{ id: 'x', record: 'tag-7', at: '2026-10-01T20:00:00+03:00', source: 'nfc' }] };
    const res = applyOp(lib, { type: 'add-record', id: 'tag-7', record, addedAt: '2026-10-26T00:00:00+00:00' });
    expect(res.message).toMatch(/claimed 1 earlier spin/);
  });

  it('deletes a record together with its spins', () => {
    const lib = fresh();
    applyOp(lib, { type: 'delete-record', id: 'abbey-road' });
    expect(lib).toEqual({ records: {}, listens: [] });
  });

  it('updates without touching id or addedAt', () => {
    const lib = fresh();
    applyOp(lib, { type: 'update-record', id: 'abbey-road', patch: { notes: 'UK first press' } });
    expect(lib.records['abbey-road']).toMatchObject({ id: 'abbey-road', notes: 'UK first press', addedAt: '2026-01-01T00:00:00+00:00' });
  });
});
