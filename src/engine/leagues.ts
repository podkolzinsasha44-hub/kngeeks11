// Rules and calendars of the simulated leagues. Everything here is the same for every club of a
// league; nothing depends on which club the user manages.
import type { Game, League, LeagueId, Player, Team } from './types';

export interface LeagueCfg {
  id: LeagueId;
  name: string;
  short: string;
  country: string;
  tier: number;
  /** [month, day] of the first and the last round. */
  start: [number, number];
  end: [number, number];
  /** Winter break: no rounds between these [month, day] dates (inclusive). */
  pause?: [[number, number], [number, number]];
  /** Playing style of the league (same for both teams): shot volume and finishing multipliers. */
  style: { shot: number; fin: number };
  /** The divisions below and above, the bottom places relegated directly and those that go to the play-offs. */
  down?: LeagueId;
  up?: LeagueId;
  relegate: number;
  playoff: number;
  /** Top places promoted directly and those that go to the promotion play-offs (with `up`). */
  promote?: number;
  promotePO?: number;
  /** "в Премьер-Лигу": the league in the accusative, for texts about promotion into it. */
  into?: string;
  /** Places that count as a success for the board: European places / podium. */
  top: number;
  wageMul: number;
  /** Typical money: prize pool per place and base TV income, EUR. */
  income: number;
}

export const LEAGUES: Record<LeagueId, LeagueCfg> = {
  RPL: { id: 'RPL', name: 'Российская Премьер-Лига', short: 'РПЛ', into: 'в Премьер-Лигу', country: 'RUS', tier: 1, start: [7, 24], end: [5, 29], pause: [[12, 8], [2, 25]], style: { shot: 0.96, fin: 0.99 }, down: 'FNL', relegate: 2, playoff: 2, top: 3, wageMul: 0.9, income: 14e6 },
  // 18 clubs: 1-2 up, 3-4 to the play-offs with 14th and 13th of the RPL; 17-18 down to division A, 16th plays 3rd of division A.
  FNL: { id: 'FNL', name: 'Первая лига', short: 'Первая лига', into: 'в Первую лигу', country: 'RUS', tier: 2, start: [7, 18], end: [5, 23], pause: [[12, 1], [2, 26]], style: { shot: 0.93, fin: 0.95 }, up: 'RPL', down: 'L2A', promote: 2, promotePO: 2, relegate: 2, playoff: 1, top: 2, wageMul: 0.45, income: 2.5e6 },
  // Division A of the Second League, 2026-27: the 17 clubs of both groups of the first stage in one table (in reality
  // two groups, "gold" and "silver", with a second stage in spring). 1-2 up, 3rd to the play-offs with 16th of the First
  // League; the last one goes down to group 3 of division B (the only group of division B in the game).
  L2A: { id: 'L2A', name: 'Вторая лига А', short: 'Вторая лига А', into: 'во Вторую лигу А', country: 'RUS', tier: 3, start: [7, 11], end: [5, 23], pause: [[11, 30], [3, 6]], style: { shot: 0.9, fin: 0.94 }, up: 'FNL', down: 'L2B', promote: 2, promotePO: 1, relegate: 1, playoff: 0, top: 2, wageMul: 0.3, income: 0.9e6 },
  // Group 3 of division B of the Second League (Oryol, Kursk, Tula, Penza…). Played on the calendar of the game
  // (July–May) instead of the real March–October. The winner goes up to division A.
  L2B: { id: 'L2B', name: 'Вторая лига Б, группа 3', short: 'Вторая лига Б', into: 'во Вторую лигу Б', country: 'RUS', tier: 4, start: [7, 25], end: [5, 30], pause: [[11, 29], [3, 6]], style: { shot: 1.0, fin: 1.0 }, up: 'L2A', promote: 1, promotePO: 0, relegate: 0, playoff: 0, top: 1, wageMul: 0.2, income: 0.4e6 },
  // Youth league of players born in 2009 (Oryol and neighbouring regions): squads typed in by the user.
  U17: { id: 'U17', name: 'Юношеская лига 2009 г. р.', short: 'Юноши 2009', country: 'RUS', tier: 9, start: [8, 29], end: [5, 23], pause: [[11, 15], [3, 20]], style: { shot: 1.0, fin: 1.0 }, relegate: 0, playoff: 0, top: 3, wageMul: 0, income: 0 },
  EPL: { id: 'EPL', name: 'Премьер-лига', short: 'АПЛ', country: 'ENG', tier: 1, start: [8, 15], end: [5, 23], style: { shot: 1.0, fin: 1.01 }, relegate: 0, playoff: 0, top: 4, wageMul: 1.35, income: 150e6 },
  ESP: { id: 'ESP', name: 'Ла Лига', short: 'Ла Лига', country: 'ESP', tier: 1, start: [8, 15], end: [5, 23], style: { shot: 0.95, fin: 0.99 }, relegate: 0, playoff: 0, top: 4, wageMul: 1, income: 70e6 },
  ITA: { id: 'ITA', name: 'Серия A', short: 'Серия A', country: 'ITA', tier: 1, start: [8, 22], end: [5, 23], style: { shot: 0.97, fin: 0.97 }, relegate: 0, playoff: 0, top: 4, wageMul: 0.95, income: 60e6 },
  GER: { id: 'GER', name: 'Бундеслига', short: 'Бундеслига', country: 'GER', tier: 1, start: [8, 21], end: [5, 15], pause: [[12, 21], [1, 14]], style: { shot: 1.07, fin: 1.04 }, relegate: 0, playoff: 0, top: 4, wageMul: 1, income: 65e6 },
  FRA: { id: 'FRA', name: 'Лига 1', short: 'Лига 1', country: 'FRA', tier: 1, start: [8, 21], end: [5, 15], style: { shot: 1.0, fin: 1.0 }, relegate: 0, playoff: 0, top: 4, wageMul: 0.85, income: 40e6 },
};
export const LEAGUE_IDS = Object.keys(LEAGUES) as LeagueId[];
export const isLeague = (comp: string): comp is LeagueId => comp in LEAGUES;

export function leagueTeams(L: League, lg: LeagueId): Team[] {
  const out: Team[] = [];
  for (const id in L.teams) if (L.teams[id].lg === lg) out.push(L.teams[id]);
  return out;
}

/** Champions League: the clubs of the top leagues against each other, a little more open than a domestic game (calibrated). */
export const UCL_STYLE = { shot: 1.13, fin: 1.08 };
/** Playing style for a game: league games use the league's, the Champions League its own, cups and play-offs the neutral one. */
export const styleOf = (g: Pick<Game, 'comp'>) => (isLeague(g.comp) ? LEAGUES[g.comp].style : g.comp === 'UCL' ? UCL_STYLE : { shot: 1, fin: 1 });

/** Citizens of the Eurasian Economic Union are not counted as foreign players in Russia. */
const HOME_RUS = new Set(['RUS', 'BLR', 'KAZ', 'ARM', 'KGZ']);
export const isForeign = (p: Player, country: string) => (country === 'RUS' ? !HOME_RUS.has(p.ctry) : false);

/**
 * Foreign-player limit of the Russian leagues: [in the squad, on the pitch].
 * 2026-27: 12 and 7; 2027-28: 11 and 6; from 2028-29: 10 and 5 (ministry order, reference values).
 */
export function foreignLimit(lg: LeagueId, season: number): [number, number] | null {
  if (LEAGUES[lg]?.country !== 'RUS') return null;
  // The Second League admits only citizens of Russia (and of the Eurasian Economic Union): no foreigners at all.
  if (lg === 'L2A' || lg === 'L2B') return [0, 0];
  return season <= 2026 ? [12, 7] : season === 2027 ? [11, 6] : [10, 5];
}

const iso = (y: number, md: [number, number]) => `${y}-${String(md[0]).padStart(2, '0')}-${String(md[1]).padStart(2, '0')}`;
export function leagueDates(lg: LeagueId, season: number) {
  const c = LEAGUES[lg];
  return {
    start: iso(season, c.start),
    end: iso(season + 1, c.end),
    pause: c.pause ? [iso(c.pause[0][0] >= 7 ? season : season + 1, c.pause[0]), iso(season + 1, c.pause[1])] as [string, string] : null,
  };
}

/** Summer and winter transfer windows of a season. */
export function transferWindows(season: number): [string, string][] {
  return [[`${season}-06-20`, `${season}-09-10`], [`${season + 1}-01-20`, `${season + 1}-02-20`]];
}
export const windowOpen = (L: League) => L.windows.some(([a, b]) => L.date >= a && L.date <= b);
/** The day every league rolls over to the next season: contracts end, tables reset. */
export const rolloverDay = (season: number) => `${season + 1}-06-20`;

export const statKey = (season: number, comp: string) => `${season}:${comp}`;
