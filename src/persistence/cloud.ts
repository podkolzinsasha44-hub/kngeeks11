// One career on several devices: the save is kept in Firestore of the same Firebase project that hosts the game,
// under a room code. Whoever knows the code can open the career on a phone, a tablet or a PC and continue it there.
// Plain REST (no SDK): the save is gzipped and split into chunks, because a Firestore document holds at most 1 MiB.
// Chunks of every revision get their own names and the room document switches to them only after all of them are
// written, with an update-time precondition, so a reader never mixes two versions and two devices cannot overwrite
// each other silently.
import type { League } from '../engine/types';

/** Letters and digits without look-alikes (0/O, 1/I/L). 9 of them ≈ 45 bits: not guessable by trying. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LEN = 9;
const CHUNK = 900_000;

export function newCode(): string {
  const r = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => ALPHABET[x % ALPHABET.length]).join('');
}
/** "ABC-DEF-GHK" for reading out and typing. */
export const showCode = (c: string) => c.replace(/(.{3})(?=.)/g, '$1-');
/** What the user typed → a code, or null when it cannot be one. */
export function parseCode(s: string): string | null {
  const c = s.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

export class CloudError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'setup' | 'missing' | 'conflict' | 'other') {
    super(message);
  }
}

let projectP: Promise<string | null> | null = null;
/** The Firebase project: set at build time, else the config Firebase Hosting serves, else the site's name. */
function project(): Promise<string | null> {
  projectP ??= (async () => {
    const env = import.meta.env.VITE_FIREBASE_PROJECT as string | undefined;
    if (env) return env;
    try {
      const r = await fetch('/__/firebase/init.json');
      if (r.ok) {
        const j = (await r.json()) as { projectId?: string };
        if (j.projectId) return j.projectId;
      }
    } catch {
      /* not on Firebase Hosting */
    }
    const m = location.hostname.match(/^([a-z0-9-]+)\.(web\.app|firebaseapp\.com)$/);
    return m ? m[1].replace(/--.*$/, '') : null;
  })();
  return projectP;
}

async function base() {
  const p = await project();
  if (!p) throw new CloudError('Синхронизация работает в версии игры на Firebase (адрес *.web.app)', 'setup');
  return `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents`;
}

type Fields = Record<string, { stringValue?: string; integerValue?: string; bytesValue?: string }>;

async function call(url: string, init?: RequestInit): Promise<{ fields?: Fields; updateTime?: string } | null> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new CloudError('Нет связи с сервером. Проверьте интернет', 'offline');
  }
  if (r.status === 404) {
    const t = await r.text();
    if (/database.*does not exist/i.test(t)) throw new CloudError('В проекте Firebase не создана база Firestore (см. README)', 'setup');
    return null;
  }
  if (r.status === 403) throw new CloudError('Firestore не пускает: не выложены правила доступа (см. README)', 'setup');
  if (r.status === 400 || r.status === 409 || r.status === 412) {
    const t = await r.text();
    if (/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND/i.test(t)) throw new CloudError('Карьера в комнате изменилась на другом устройстве', 'conflict');
    throw new CloudError('Сервер отклонил запрос', 'other');
  }
  if (!r.ok) throw new CloudError(`Ошибка сервера (${r.status})`, 'other');
  return init?.method === 'DELETE' ? null : r.json();
}

export interface RoomMeta {
  /** Revision: grows by one with every upload. */
  rev: number;
  chunks: number;
  name: string;
  team: string;
  season: number;
  date: string;
  updated: number;
}

const str = (v: string) => ({ stringValue: v });
const int = (v: number) => ({ integerValue: String(v) });

function metaOf(doc: { fields?: Fields } | null): RoomMeta | null {
  const f = doc?.fields;
  if (!f) return null;
  const n = (k: string) => Number(f[k]?.integerValue ?? 0);
  const s = (k: string) => f[k]?.stringValue ?? '';
  return { rev: n('rev'), chunks: n('chunks'), name: s('name'), team: s('team'), season: n('season'), date: s('date'), updated: n('updated') };
}

async function getRoom(code: string) {
  const doc = await call(`${await base()}/rooms/${code}`);
  return { meta: metaOf(doc), updateTime: doc?.updateTime };
}

export async function roomMeta(code: string): Promise<RoomMeta | null> {
  return (await getRoom(code)).meta;
}

/**
 * Uploads the career. `baseRev` is the revision this device last saw (0 for a new room): if the room has moved on
 * since then, nothing is written and a 'conflict' error is thrown — unless `force` (the user chose this version).
 */
export async function pushRoom(code: string, L: League, baseRev: number, force = false): Promise<RoomMeta> {
  const b = await base();
  const cur = await getRoom(code);
  if (cur.meta && cur.meta.rev !== baseRev && !force) throw new CloudError('Карьера в комнате изменилась на другом устройстве', 'conflict');
  if (!cur.meta && baseRev > 0 && !force) throw new CloudError('Комната не найдена', 'missing');
  const bytes = await gzip(JSON.stringify(L));
  const rev = (cur.meta?.rev ?? 0) + 1;
  const n = Math.ceil(bytes.length / CHUNK);
  for (let i = 0; i < n; i++) {
    await call(`${b}/rooms/${code}/chunks/${rev}-${i}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { data: { bytesValue: toB64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) } } }),
    });
  }
  const meta: RoomMeta = { rev, chunks: n, name: `${L.gm.name} · ${L.teams[L.user]?.ru ?? ''}`, team: L.user, season: L.season, date: L.date, updated: Date.now() };
  const pre = cur.updateTime ? `currentDocument.updateTime=${encodeURIComponent(cur.updateTime)}` : 'currentDocument.exists=false';
  await call(`${b}/rooms/${code}?${pre}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { rev: int(rev), chunks: int(n), name: str(meta.name), team: str(meta.team), season: int(meta.season), date: str(meta.date), updated: int(meta.updated) } }),
  });
  // The previous revision is no longer referenced.
  if (cur.meta) for (let i = 0; i < cur.meta.chunks; i++) call(`${b}/rooms/${code}/chunks/${cur.meta.rev}-${i}`, { method: 'DELETE' }).catch(() => {});
  return meta;
}

export async function pullRoom(code: string, tries = 3): Promise<{ L: League; meta: RoomMeta }> {
  const b = await base();
  const meta = await roomMeta(code);
  if (!meta) throw new CloudError('Комнаты с таким кодом нет', 'missing');
  const parts: Uint8Array[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const doc = await call(`${b}/rooms/${code}/chunks/${meta.rev}-${i}`);
    const data = doc?.fields?.data?.bytesValue;
    // The room moved to a newer revision while we were reading: start over.
    if (!data) {
      if (tries > 1) return pullRoom(code, tries - 1);
      throw new CloudError('Не удалось скачать карьеру: попробуйте ещё раз', 'other');
    }
    parts.push(fromB64(data));
  }
  const L = JSON.parse(await gunzip(concat(parts))) as League;
  if (!L.teams || !L.players || !L.user) throw new CloudError('Сохранение в комнате повреждено', 'other');
  return { L, meta };
}

async function gzip(s: string) {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(b: Uint8Array) {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function toB64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Which local save is linked to which room, and the revision this device last uploaded or downloaded.
const LINKS = 'football-gm:rooms';
export interface RoomLink { code: string; rev: number; dirty?: boolean; synced?: number }
function readLinks(): Record<string, RoomLink> {
  try {
    return JSON.parse(localStorage.getItem(LINKS) ?? '{}');
  } catch {
    return {};
  }
}
export const roomLink = (saveId: string): RoomLink | null => readLinks()[saveId] ?? null;
export function setRoomLink(saveId: string, link: RoomLink | null) {
  const all = readLinks();
  if (link) all[saveId] = link; else delete all[saveId];
  try {
    localStorage.setItem(LINKS, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
