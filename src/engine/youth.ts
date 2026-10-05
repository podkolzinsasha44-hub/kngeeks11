// Youth league of players born in 2009 (Oryol and the neighbouring regions).
//
// The players are minors, so the game ships no real names: every club starts with placeholder
// players (marked `custom`), and the user types in the real squad of his own team himself. What he
// types stays in his save on his device. Youth clubs live outside the transfer market of the adults:
// nobody buys from them or sells to them; when a squad runs short, the sports school promotes a boy.
import { aiLineup } from './ai';
import { attrsFor, genPlayer } from './gen';
import { squad, touchSquads } from './lineup';
import { normal } from './rng';
import type { League, Player, Role, Team } from './types';
import { calcOvr, clamp, posOfRole } from './util';

export const YOUTH_LG = 'U17';
export const isYouth = (t: Pick<Team, 'lg'> | null | undefined) => t?.lg === YOUTH_LG;
/** A club that takes part in the transfer market (not a youth team). */
export const onMarket = (t: Pick<Team, 'lg'> | null | undefined) => !!t && t.lg !== YOUTH_LG;
/** A player of a youth team (not for sale to anyone). */
export const youthPlayer = (L: League, p: Player) => !!p.team && L.teams[p.team]?.lg === YOUTH_LG;

const SHAPE: Role[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CB', 'DM', 'CM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST'];

/** A placeholder boy of the sports school: born in the year of the team, the level of the league. */
export function youthBoy(L: League, t: Team, role: Role, ovr?: number): Player {
  const born = Number(t.name.match(/(\d{4})$/)?.[1] ?? 2009);
  const age = Number(L.date.slice(0, 4)) - born;
  const p = genPlayer(L, { team: t, role, age, ovr: ovr ?? clamp(Math.round(normal(47, 4)), 38, 58) });
  p.custom = true;
  p.yth = undefined;
  p.c = { wage: 0, until: L.season + 4, signed: L.season };
  p.val = 0;
  return p;
}

/** Placeholder squads for youth clubs that have no players yet (a new career or an old save). */
export function fillYouth(L: League) {
  for (const t of Object.values(L.teams)) {
    if (!isYouth(t) || squad(L, t.id).length) continue;
    SHAPE.forEach((role, i) => { const p = youthBoy(L, t, role); p.num = i + 1; });
  }
  touchSquads();
}

export interface YouthEdit { fn?: string; ln?: string; role?: Role; num?: number | null; year?: number; ovr?: number }

/** The user corrects a player of a youth team: name, position, number, year of birth, level. */
export function editYouthPlayer(L: League, id: number, e: YouthEdit) {
  const p = L.players[id];
  if (!p || !youthPlayer(L, p)) return;
  if (e.fn !== undefined) p.fn = e.fn.trim();
  if (e.ln !== undefined) p.ln = e.ln.trim() || p.ln;
  if (e.fn !== undefined || e.ln !== undefined) p.ru = `${p.fn} ${p.ln}`.trim();
  if (e.num !== undefined) p.num = e.num && e.num > 0 && e.num < 100 ? Math.round(e.num) : null;
  if (e.year !== undefined && e.year >= 2000 && e.year <= 2015) p.bd = `${e.year}${p.bd.slice(4)}`;
  const role = e.role ?? p.role;
  if (e.role !== undefined || e.ovr !== undefined) {
    const ovr = clamp(Math.round(e.ovr ?? p.ovr), 30, 75);
    p.role = role;
    p.pos = posOfRole(role);
    p.alt = undefined;
    p.r = attrsFor(role, ovr);
    p.ovr = calcOvr(p);
    p.pot = Math.max(p.pot, p.ovr);
  }
  p.custom = true;
  p.real = false;
}

export function addYouthPlayer(L: League, teamId: string, role: Role = 'CM'): number | null {
  const t = L.teams[teamId];
  if (!isYouth(t)) return null;
  const p = youthBoy(L, t, role);
  const used = new Set(squad(L, t.id).map((x) => x.num));
  for (let n = 1; n < 100; n++) if (!used.has(n)) { p.num = n; break; }
  touchSquads();
  return p.id;
}

export function removeYouthPlayer(L: League, id: number) {
  const p = L.players[id];
  if (!p || !youthPlayer(L, p)) return;
  const t = L.teams[p.team!];
  t.lineup.bench = t.lineup.bench.filter((x) => x !== id);
  delete L.players[id];
  touchSquads();
  // An AI coach picks a new eleven; the user's empty slot is reported before the next match.
  if (t.id !== L.user) aiLineup(L, t);
}

export function renameYouthTeam(L: League, id: string, ru: string) {
  const t = L.teams[id];
  if (!isYouth(t) || !ru.trim()) return;
  t.ru = ru.trim().slice(0, 40);
}
