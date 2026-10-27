// Pure operations on the library, shared by the ingest workflow and the web app's demo mode.
// They must be fast and deterministic: ingest re-applies them on a fresh checkout whenever a push races another run.
import { DUPLICATE_SPIN_WINDOW_MS, type Library, type Listen, type RecordFields, type VinylRecord } from './types.ts';
import { instantOf } from './time.ts';
import { uniqueRecordId } from './ids.ts';

export type PreparedOp =
  | { type: 'spin'; listen: Listen; force: boolean }
  | { type: 'add-record'; id?: string; record: RecordFields; addedAt: string }
  | { type: 'update-record'; id: string; patch: Partial<RecordFields> }
  | { type: 'refresh-record'; id: string; record: RecordFields }
  | { type: 'delete-record'; id: string }
  | { type: 'delete-listen'; id: string };

export interface ApplyResult {
  changed: boolean;
  /** Commit message / job summary line. */
  message: string;
}

function describe(rec?: VinylRecord, fallbackId?: string) {
  return rec ? `${rec.artistCredit} — ${rec.title}` : `unlinked tag "${fallbackId}"`;
}

export function insertListen(listens: Listen[], listen: Listen): void {
  const t = instantOf(listen.at);
  let i = listens.length;
  while (i > 0 && instantOf(listens[i - 1].at) > t) i--;
  listens.splice(i, 0, listen);
}

export function applyOp(library: Library, op: PreparedOp): ApplyResult {
  switch (op.type) {
    case 'spin': {
      const { listen } = op;
      const rec = library.records[listen.record];
      if (library.listens.some((l) => l.id === listen.id)) {
        return { changed: false, message: `Spin ${listen.id} was already logged.` };
      }
      if (!op.force) {
        const t = instantOf(listen.at);
        const dupe = library.listens.find((l) => l.record === listen.record && Math.abs(instantOf(l.at) - t) < DUPLICATE_SPIN_WINDOW_MS);
        if (dupe) {
          return { changed: false, message: `Ignored a double scan of ${describe(rec, listen.record)} (already logged at ${dupe.at}).` };
        }
      }
      insertListen(library.listens, listen);
      return { changed: true, message: `🎶 Spin: ${describe(rec, listen.record)} @ ${listen.at}` };
    }

    case 'add-record': {
      const existing = op.id ? library.records[op.id] : undefined;
      const id = op.id ?? uniqueRecordId(op.record.title, (candidate) => candidate in library.records);
      library.records[id] = { id, ...op.record, addedAt: existing?.addedAt ?? op.addedAt };
      const linked = library.listens.filter((l) => l.record === id).length;
      const verb = existing ? 'Relinked' : 'Added';
      return {
        changed: true,
        message: `💿 ${verb} ${op.record.artistCredit} — ${op.record.title} as "${id}"${linked && !existing ? ` (claimed ${linked} earlier spin${linked === 1 ? '' : 's'})` : ''}`,
      };
    }

    case 'update-record': {
      const rec = library.records[op.id];
      if (!rec) throw new Error(`No record with id "${op.id}".`);
      library.records[op.id] = { ...rec, ...op.patch, id: rec.id, addedAt: rec.addedAt };
      return { changed: true, message: `✏️ Updated ${describe(rec)}: ${Object.keys(op.patch).join(', ')}` };
    }

    case 'refresh-record': {
      const rec = library.records[op.id];
      if (!rec) throw new Error(`No record with id "${op.id}".`);
      library.records[op.id] = { ...op.record, id: rec.id, addedAt: rec.addedAt, ...(rec.notes ? { notes: rec.notes } : {}) };
      return { changed: true, message: `🔄 Refreshed ${describe(library.records[op.id])}` };
    }

    case 'delete-record': {
      const rec = library.records[op.id];
      const before = library.listens.length;
      library.listens = library.listens.filter((l) => l.record !== op.id);
      const removedListens = before - library.listens.length;
      if (!rec && !removedListens) return { changed: false, message: `Nothing to delete for "${op.id}".` };
      delete library.records[op.id];
      return { changed: true, message: `🗑️ Removed ${describe(rec, op.id)} and ${removedListens} spin${removedListens === 1 ? '' : 's'}` };
    }

    case 'delete-listen': {
      const listen = library.listens.find((l) => l.id === op.id);
      if (!listen) return { changed: false, message: `Spin ${op.id} doesn't exist (already deleted?).` };
      library.listens = library.listens.filter((l) => l.id !== op.id);
      return { changed: true, message: `🗑️ Removed spin of ${describe(library.records[listen.record], listen.record)} @ ${listen.at}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Serialization. One listen per line keeps the data branch's git history readable.
// ---------------------------------------------------------------------------

export function serializeListens(listens: Listen[]): string {
  if (!listens.length) return '[]\n';
  return `[\n${listens.map((l) => JSON.stringify({ id: l.id, record: l.record, at: l.at, source: l.source })).join(',\n')}\n]\n`;
}

export function serializeRecords(records: Record<string, VinylRecord>): string {
  const sorted = Object.fromEntries(Object.keys(records).sort().map((k) => [k, records[k]]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
