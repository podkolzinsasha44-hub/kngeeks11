// Injuries and suspensions off the pitch: how long a player is out and what he misses.
import { squad } from './lineup';
import type { Game, League, Player } from './types';
import { addDays } from './util';

/** Puts a player out injured; the club's medical staff shortens (or lengthens) the recovery. Returns the days out. */
export function injure(L: League, p: Player, inj: { type: string; days: number }): number {
  const med = p.team ? L.teams[p.team]?.staff.med ?? 2 : 2;
  const days = Math.max(1, Math.round(inj.days * (1.15 - med * 0.075)));
  p.inj = { type: inj.type, days, total: days };
  return days;
}

/** Rough length of an absence in words. */
export const absenceText = (days: number) => (days <= 3 ? 'несколько дней' : days <= 10 ? 'до полутора недель' : days < 45 ? `${Math.round(days / 7)} нед.` : `${Math.round(days / 30)} мес.`);

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** '2026-10-12' → '12 октября'. */
export const dateRu = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export interface Absence {
  p: Player;
  kind: 'inj' | 'susp';
  /** Day the player can play again (injury) or the first match he may play (suspension). */
  back: string | null;
  /** Club matches he misses from today. */
  misses: number;
  /** Share of the recovery already behind (injury), 0..1. */
  progress: number;
  /** Who plays in his place in a manual line-up. */
  cover?: Player;
}

/** Everyone of the club who cannot play now, soonest back first. */
export function absences(L: League, teamId: string): Absence[] {
  const t = L.teams[teamId];
  const games: Game[] = L.games.filter((g) => !g.played && (g.h === teamId || g.a === teamId)).sort((a, b) => (a.day < b.day ? -1 : 1));
  const coverOf = (id: number) => {
    const c = t?.lineup.cover;
    if (!c) return undefined;
    for (const k in c) if (c[k] === id) return L.players[Number(k)];
    return undefined;
  };
  const out: Absence[] = [];
  for (const p of squad(L, teamId)) {
    if (p.inj) {
      const back = addDays(L.date, p.inj.days);
      out.push({ p, kind: 'inj', back, misses: games.filter((g) => g.day < back).length, progress: p.inj.total ? 1 - p.inj.days / p.inj.total : 0, cover: coverOf(p.id) });
    } else if ((p.susp ?? 0) > 0) {
      const n = p.susp!;
      out.push({ p, kind: 'susp', back: games[n]?.day ?? null, misses: Math.min(n, games.length), progress: 0, cover: coverOf(p.id) });
    }
  }
  return out.sort((a, b) => (a.back ?? '9999') < (b.back ?? '9999') ? -1 : 1);
}
