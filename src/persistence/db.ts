import Dexie, { type Table } from 'dexie';
import type { League } from '../engine/types';

export interface SaveMeta {
  id: string;
  name: string;
  team: string;
  season: number;
  date: string;
  updated: number;
}

class DB extends Dexie {
  saves!: Table<SaveMeta, string>;
  blobs!: Table<{ id: string; data: League }, string>;
  constructor() {
    super('football-gm');
    this.version(1).stores({ saves: 'id, updated', blobs: 'id' });
  }
}

export const db = new DB();

const LAST = 'football-gm:last-save';

export function lastSaveId(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
function setLast(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* storage unavailable */
  }
}

export async function saveLeague(id: string, L: League) {
  const meta: SaveMeta = { id, name: `${L.gm.name} · ${L.teams[L.user]?.ru ?? ''}`, team: L.user, season: L.season, date: L.date, updated: Date.now() };
  await db.transaction('rw', db.saves, db.blobs, async () => {
    await db.blobs.put({ id, data: L });
    await db.saves.put(meta);
  });
  setLast(id);
}

export async function loadLeague(id: string): Promise<League | null> {
  const b = await db.blobs.get(id);
  if (b) setLast(id);
  return b?.data ?? null;
}

export async function listSaves() {
  return db.saves.orderBy('updated').reverse().toArray();
}

export async function deleteSave(id: string) {
  await db.transaction('rw', db.saves, db.blobs, async () => {
    await db.saves.delete(id);
    await db.blobs.delete(id);
  });
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export function exportFile(L: League) {
  const blob = new Blob([JSON.stringify(L)], { type: 'application/json' });
  const name = `football-gm-${L.user}-${L.date}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], title: 'Сохранение Football GM' }).catch(() => download(blob, name));
  }
  download(blob, name);
  return Promise.resolve();
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file: File): Promise<League> {
  const text = await file.text();
  const L = JSON.parse(text) as League;
  if (!L.teams || !L.players || !L.user || !L.comps) throw new Error('Неверный файл сохранения');
  return L;
}
