// Loans out of the user's club: a player who would sit on the bench goes to a club where he plays,
// grows with the minutes (development needs playing time) and comes back on June 30.
import { canRegister } from './contracts';
import { LEAGUE_IDS, LEAGUES, windowOpen } from './leagues';
import { squad, touchSquads, validateLineup } from './lineup';
import { pushNews } from './news';
import { autoFixUserLineup, saleBlock } from './transfers';
import type { League, Player, Team } from './types';
import { dispName } from './util';

export interface LoanTarget {
  t: Team;
  /** 'start' — a regular in the eleven, 'rotation' — about half of the games. */
  role: 'start' | 'rotation';
  /** Rank of the player among the club's players of his line. */
  rank: number;
}

const STARTERS = { G: 1, D: 4, M: 4, F: 3 } as const;

/** Why the user's player cannot go on loan now, or null. */
export function loanBlock(L: League, p: Player): string | null {
  if (p.team !== L.user) return 'Игрок не из вашего клуба';
  if (p.loan) return 'Игрок сам находится в аренде';
  const b = saleBlock(p);
  if (b) return b.replace('продать, выставить на трансфер или отпустить', 'отдать в аренду');
  if (!windowOpen(L)) return 'Аренда оформляется только в трансферное окно';
  if (!p.c || p.c.until <= L.season + 1) return 'Контракт истекает этим летом — сначала продлите его, иначе игрок уйдёт свободным агентом прямо из аренды';
  if (squad(L, L.user).length <= 18) return 'В составе останется меньше 18 игроков';
  return null;
}

/** Clubs that would take the player and give him games, the strongest first. */
export function loanTargets(L: League, p: Player, n = 5): LoanTarget[] {
  const out: LoanTarget[] = [];
  const me = L.teams[L.user];
  for (const lg of LEAGUE_IDS) {
    if (lg === 'U17') continue;
    for (const id in L.teams) {
      const t = L.teams[id];
      if (t.lg !== lg || t.id === me.id) continue;
      if (canRegister(L, t, p, 0, true)) continue;
      const line = squad(L, t.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
      const rank = line.filter((x) => x.ovr > p.ovr).length;
      const k = STARTERS[p.pos];
      if (rank >= k * 2) continue;
      // A club far below the player's level is no school for him (and he would not go).
      const top = squad(L, t.id).map((x) => x.ovr).sort((a, b) => b - a).slice(0, 11);
      const avg = top.reduce((s, x) => s + x, 0) / Math.max(1, top.length);
      if (p.ovr - avg > 9) continue;
      out.push({ t, role: rank < k ? 'start' : 'rotation', rank });
    }
  }
  // The strongest club where he plays: the higher the level, the better the school.
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === 'start' ? -1 : 1) || LEAGUES[a.t.lg].tier - LEAGUES[b.t.lg].tier || b.t.rep - a.t.rep).slice(0, n);
}

/** Sends the player on loan until the end of the season: the borrowing club pays his wages. */
export function loanOut(L: League, p: Player, to: string): string | null {
  const block = loanBlock(L, p);
  if (block) return block;
  const t = L.teams[to];
  if (!t || !loanTargets(L, p, 99).some((x) => x.t.id === to)) return 'Этот клуб не готов взять игрока';
  p.loan = { from: L.user, until: L.season + 1 };
  p.team = to;
  p.listed = false;
  if (!p.teams.includes(to)) p.teams.push(to);
  touchSquads();
  const me = L.teams[L.user];
  if (me.lineup.cover) for (const k in me.lineup.cover) if (Number(k) === p.id || me.lineup.cover[k] === p.id) delete me.lineup.cover[k];
  // His slot in a manual eleven goes to the best fitting reserve; the rest of the team stays as set.
  if (!me.lineup.auto && me.lineup.xi.includes(p.id)) validateLineup(L, me);
  autoFixUserLineup(L);
  L.transfers.unshift({ id: L.nextMsgId++, date: L.date, season: L.season, player: p.id, name: dispName(p), from: L.user, to, fee: 0, loan: true, user: true });
  pushNews(L, { kind: 'transfer', title: `${dispName(p)} уходит в аренду из «${me.ru}» в «${t.ru}» до конца сезона`, team: me.id, players: [p.id] });
  return null;
}

/** The user's players who are out on loan right now. */
export const loanedOut = (L: League) => Object.values(L.players).filter((p) => p.loan?.from === L.user && p.team && p.team !== L.user);
