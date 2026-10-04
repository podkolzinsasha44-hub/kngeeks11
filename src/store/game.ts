import { create } from 'zustand';
import type { Game, League } from '../engine/types';
import type { WorldJson, NewCareerOpts } from '../engine/world';
import { attachPhotos, newCareer } from '../engine/world';
import { advanceDay, lastUserBox } from '../engine/season';
import { setNations } from '../engine/intl';
import { saveLeague, loadLeague, requestPersistence } from '../persistence/db';
import { useNav } from './nav';

export type SimMode = 'day' | 'game' | 'week' | 'event' | 'window' | 'season' | 'date';

export interface SimResult { game: Game; res: 'W' | 'D' | 'L' }
export interface SimState {
  mode: SimMode;
  running: boolean;
  from: string;
  target?: string;
  days: number;
  last?: SimResult | null;
  results: SimResult[];
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'good' | 'bad' | 'info';
}

interface GameState {
  L: League | null;
  ver: number;
  saveId: string | null;
  world: WorldJson | null;
  sim: SimState | null;
  toasts: Toast[];
  loading: boolean;
  touch: () => void;
  loadWorld: () => Promise<WorldJson>;
  start: (opts: NewCareerOpts) => Promise<void>;
  open: (id: string) => Promise<boolean>;
  setLeague: (L: League, id?: string) => void;
  simulate: (mode: SimMode, target?: string, opts?: { watch?: boolean }) => Promise<void>;
  stopSim: () => void;
  act: <T>(fn: (L: League) => T) => T;
  save: () => Promise<void>;
  toast: (text: string, kind?: Toast['kind']) => void;
  quit: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;

/** Reasons that always stop the simulation, and those that stop the "until the next event" mode. */
const ALWAYS = new Set(['lineup', 'cup', 'season-end', 'rollover', 'intl', 'expiring']);
const EVENT = new Set([...ALWAYS, 'offer', 'injury', 'player']);

export function applyTheme(L: League | null) {
  const root = document.documentElement;
  const t = L ? L.teams[L.user] : null;
  // Very dark club colours would disappear on the dark interface: use the lighter of the two as accent.
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const accent = t ? (lum(t.primary) > 0.16 && lum(t.primary) < 0.93 ? t.primary : lum(t.secondary) > 0.16 && lum(t.secondary) < 0.93 ? t.secondary : '#7fd3ff') : '#3ddc97';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--team', t?.primary ?? '#0b3d24');
  root.style.setProperty('--team2', t?.secondary ?? '#3ddc97');
}

export const resultOf = (L: League, g: Game): 'W' | 'D' | 'L' => {
  const mine = g.h === L.user ? g.hs ?? 0 : g.as ?? 0, their = g.h === L.user ? g.as ?? 0 : g.hs ?? 0;
  if (mine !== their) return mine > their ? 'W' : 'L';
  if (g.pen) return (g.h === L.user ? g.pen[0] > g.pen[1] : g.pen[1] > g.pen[0]) ? 'W' : 'L';
  return 'D';
};

export const useGame = create<GameState>((set, get) => ({
  L: null,
  ver: 0,
  saveId: null,
  world: null,
  sim: null,
  toasts: [],
  loading: false,
  touch: () => set((s) => ({ ver: s.ver + 1 })),
  loadWorld: async () => {
    const w = get().world;
    if (w) return w;
    const res = await fetch(`${import.meta.env.BASE_URL}data/world.json`);
    const json = (await res.json()) as WorldJson;
    setNations(json.nations);
    set({ world: json });
    return json;
  },
  start: async (opts) => {
    set({ loading: true });
    const w = await get().loadWorld();
    await new Promise((r) => setTimeout(r, 30));
    const L = newCareer(w, opts);
    const id = `career-${Date.now()}`;
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id, loading: false, ver: get().ver + 1 });
    requestPersistence();
    await saveLeague(id, L);
  },
  open: async (id) => {
    set({ loading: true });
    await get().loadWorld();
    const L = await loadLeague(id);
    if (!L) {
      set({ loading: false });
      return false;
    }
    attachPhotos(L, get().world!);
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id, loading: false, ver: get().ver + 1 });
    return true;
  },
  setLeague: (L, id) => {
    const w = get().world;
    if (w) attachPhotos(L, w);
    applyTheme(L);
    useNav.getState().reset();
    set({ L, saveId: id ?? `career-${Date.now()}`, ver: get().ver + 1 });
    get().save();
  },
  simulate: async (mode, target, opts) => {
    const L = get().L;
    if (!L || get().sim?.running) return;
    if (L.gm.fired) {
      useNav.getState().go('more', 'career');
      return;
    }
    const sim: SimState = { mode, running: true, from: L.date, target, days: 0, results: [], last: null };
    set({ sim });
    let budgetStart = performance.now();
    const stopSet = mode === 'event' || mode === 'week' || mode === 'game' || mode === 'day' ? EVENT : ALWAYS;
    let reason: string | null = null;
    while (get().sim?.running) {
      L.stops = [];
      const rep = advanceDay(L);
      if (rep.blocked) { reason = 'lineup'; break; }
      sim.days++;
      if (rep.userGame) {
        const r = { game: rep.userGame.game, res: resultOf(L, rep.userGame.game) };
        sim.last = r;
        sim.results.push(r);
      }
      const hit = L.stops.find((s) => stopSet.has(s));
      if (hit) { reason = hit; break; }
      if (L.gm.fired) break;
      if (mode === 'day') break;
      if (mode === 'game' && rep.userGame) break;
      if (mode === 'week' && sim.days >= 7) break;
      if (mode === 'event' && (L.settings.stopOnUserGames || opts?.watch) && rep.userGame) break;
      if (mode === 'window' && !L.windows.some(([a, b]) => L.date >= a && L.date <= b)) break;
      if (mode === 'date' && target && L.date >= target) break;
      if (sim.days > 400) break;
      if (performance.now() - budgetStart > 34) {
        set({ sim: { ...sim }, ver: get().ver + 1 });
        await new Promise((r) => setTimeout(r, 0));
        budgetStart = performance.now();
      }
    }
    set({ sim: null, ver: get().ver + 1 });
    get().save();
    onStop(reason, mode, !!opts?.watch, !!sim.last);
  },
  stopSim: () => {
    const s = get().sim;
    if (s) set({ sim: { ...s, running: false } });
  },
  act: (fn) => {
    const L = get().L!;
    const r = fn(L);
    set({ ver: get().ver + 1 });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().save(), 1200);
    return r;
  },
  save: async () => {
    const { L, saveId } = get();
    if (!L || !saveId) return;
    try {
      await saveLeague(saveId, L);
    } catch (e) {
      console.warn('save failed', e);
    }
  },
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3400);
  },
  quit: () => {
    get().save();
    applyTheme(null);
    set({ L: null, saveId: null });
  },
}));

function onStop(reason: string | null, mode: SimMode, watch: boolean, played: boolean) {
  const nav = useNav.getState();
  const game = useGame.getState();
  const L = game.L!;
  if (L.gm.fired) return nav.go('more', 'career');
  if (reason === 'lineup') {
    game.toast('Состав на матч нужно поправить: игрок из старта не может выйти на поле', 'bad');
    return nav.go('roster', undefined, { tab: 'lineup' });
  }
  if (reason === 'cup') return nav.openModal('celebration', { what: 'cup' });
  if (reason === 'season-end') {
    if (L.comps[L.teams[L.user].lg].champion === L.user) return nav.openModal('celebration', { what: 'title' });
    return nav.go('league');
  }
  if (reason === 'rollover') return nav.go('office', 'inbox');
  if (reason === 'intl') return nav.go('more', 'intl');
  if (reason === 'offer') return nav.go('market', undefined, { tab: 'offers' });
  if (reason === 'expiring') return nav.go('more', 'finance');
  if (played && lastUserBox && (mode === 'game' || watch) && (watch || L.settings.watchGames)) nav.openModal('match', { live: true, id: lastUserBox.game.id });
}

export function useL(): League {
  useGame((s) => s.ver);
  return useGame.getState().L!;
}
