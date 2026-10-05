// Room sync: keeps the open career and its room in the cloud in step. Uploads a few seconds after the game saves
// and when the app goes to the background; when the app comes back, downloads what another device played meanwhile.
import { create } from 'zustand';
import type { League } from '../engine/types';
import { saveLeague } from '../persistence/db';
import { CloudError, newCode, pullRoom, pushRoom, roomLink, roomMeta, setRoomLink, type RoomMeta } from '../persistence/cloud';
import { useGame } from './game';

export interface Conflict {
  /** The career as it is in the room (played on another device). */
  remote: RoomMeta;
}

interface CloudState {
  busy: boolean;
  error: string | null;
  conflict: Conflict | null;
  /** Bumped on every change of links, to re-render the settings. */
  ver: number;
}

export const useCloud = create<CloudState>(() => ({ busy: false, error: null, conflict: null, ver: 0 }));
const patch = (p: Partial<CloudState>) => useCloud.setState((s) => ({ ...p, ver: s.ver + 1 }));

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
const PUSH_DELAY = 8000;

const current = () => {
  const { L, saveId } = useGame.getState();
  return L && saveId ? { L, saveId, link: roomLink(saveId) } : null;
};

const message = (e: unknown) => (e instanceof CloudError ? e.message : 'Не удалось синхронизировать');

/** Called after every local save: marks the career as changed and schedules an upload. */
export function afterSave(saveId: string) {
  const link = roomLink(saveId);
  if (!link) return;
  if (!link.dirty) setRoomLink(saveId, { ...link, dirty: true });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { pushNow(); }, PUSH_DELAY);
}

async function serial(fn: () => Promise<void>) {
  while (running) await running;
  running = fn().finally(() => { running = null; });
  return running;
}

/** Uploads the open career (or the one being closed, `target`) if it has changes. */
export function pushNow(force = false, target?: { L: League; saveId: string }): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const t = target ?? current();
  return serial(async () => {
    const link = t && roomLink(t.saveId);
    if (!t || !link || (!link.dirty && !force)) return;
    const c = { ...t, link };
    patch({ busy: true });
    try {
      const meta = await pushRoom(c.link.code, c.L, c.link.rev, force);
      setRoomLink(c.saveId, { code: c.link.code, rev: meta.rev, dirty: false, synced: Date.now() });
      patch({ busy: false, error: null, conflict: null });
    } catch (e) {
      if (e instanceof CloudError && e.kind === 'conflict') {
        const remote = await roomMeta(c.link.code).catch(() => null);
        patch({ busy: false, error: null, conflict: remote ? { remote } : null });
      } else patch({ busy: false, error: message(e) });
    }
  });
}

/** Checks the room: takes a newer career from another device, or asks when both devices played on. */
export function pullIfNewer(): Promise<void> {
  return serial(async () => {
    const c = current();
    if (!c?.link || useGame.getState().sim?.running) return;
    try {
      const meta = await roomMeta(c.link.code);
      if (!meta || meta.rev <= c.link.rev) {
        patch({ error: null });
        // An upload cut off in the background (iOS stops a hidden app) is retried on return.
        if (c.link.dirty) setTimeout(() => { pushNow(); }, 0);
        return;
      }
      if (c.link.dirty) { patch({ conflict: { remote: meta }, error: null }); return; }
      await takeRemote(c.saveId, c.link.code);
      useGame.getState().toast(`Карьера обновлена с другого устройства: ${meta.date.split('-').reverse().join('.')}`, 'good');
    } catch (e) {
      patch({ error: message(e) });
    }
  });
}

async function takeRemote(saveId: string, code: string) {
  patch({ busy: true });
  try {
    const { L, meta } = await pullRoom(code);
    await saveLeague(saveId, L);
    setRoomLink(saveId, { code, rev: meta.rev, dirty: false, synced: Date.now() });
    useGame.getState().setLeague(L, saveId, { keepCloud: true });
    patch({ busy: false, error: null, conflict: null });
  } catch (e) {
    patch({ busy: false, error: message(e) });
    throw e;
  }
}

/** The user settles a conflict: the room's version or the one on this device. */
export async function resolveConflict(take: 'remote' | 'local') {
  const c = current();
  if (!c?.link) return patch({ conflict: null });
  if (take === 'local') return pushNow(true);
  await serial(() => takeRemote(c.saveId, c.link!.code)).catch(() => {});
}

/** Puts the open career into a new room and returns its code. */
export async function createRoom(): Promise<string> {
  const c = current();
  if (!c) throw new CloudError('Карьера не открыта', 'other');
  patch({ busy: true });
  try {
    const code = newCode();
    const meta = await pushRoom(code, c.L, 0);
    setRoomLink(c.saveId, { code, rev: meta.rev, dirty: false, synced: Date.now() });
    patch({ busy: false, error: null });
    return code;
  } catch (e) {
    patch({ busy: false, error: message(e) });
    throw e;
  }
}

/** Opens the career of a room on this device (a local copy is kept under its own save id). */
export async function joinRoom(code: string): Promise<League> {
  patch({ busy: true });
  try {
    const { L, meta } = await pullRoom(code);
    const saveId = `room-${code}`;
    await saveLeague(saveId, L);
    setRoomLink(saveId, { code, rev: meta.rev, dirty: false, synced: Date.now() });
    await useGame.getState().loadWorld();
    useGame.getState().setLeague(L, saveId, { keepCloud: true });
    patch({ busy: false, error: null, conflict: null });
    return L;
  } catch (e) {
    patch({ busy: false, error: null });
    throw e;
  }
}

export function leaveRoom() {
  const c = current();
  if (c) setRoomLink(c.saveId, null);
  patch({ error: null, conflict: null });
}

/** Background: upload what was played; foreground: fetch what another device played. */
export function installCloudSync() {
  document.addEventListener('visibilitychange', () => {
    if (!current()?.link) return;
    if (document.visibilityState === 'hidden') pushNow();
    else pullIfNewer();
  });
  window.addEventListener('online', () => { if (current()?.link?.dirty) pushNow(); });
}
