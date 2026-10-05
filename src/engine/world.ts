// Builds a new career from the data snapshot (public/data/world.json).
import { aiLineup, updateStrategies } from './ai';
import { initCup } from './cup';
import { initIntl, setNations } from './intl';
import { LEAGUES, LEAGUE_IDS, leagueDates, transferWindows } from './leagues';
import { emptyLineup, touchSquads } from './lineup';
import { PRESIDENT } from './names';
import { pushMsg, pushNews } from './news';
import { ownerGoalFor } from './owner';
import { getState, hash01, seedState, useState_ } from './rng';
import { scheduleLeague } from './schedule';
import { emptyRecord } from './standings';
import { initUclFromWorld, makeExt, type UclWorld } from './ucl';
import type { KeeperAttrs, League, LeagueId, OutfieldAttrs, Player, Role, Settings, Team } from './types';
import { addDays, ageOn, money, posOfRole, seasonLabel } from './util';

export interface WorldPlayer {
  id: number; fn: string; ln: string; ru?: string; role: Role; alt?: Role[]; foot: 'L' | 'R' | 'B'; bd: string; ab?: 1;
  c: string; ht?: number; n?: number; t?: string; x?: string; o: number; p: number; r: number[]; v: number; w: number; u: number; cr?: 1;
  caps?: number; ig?: number; h?: (string | number)[][]; wc?: string | 1; loan?: string;
  /** Transfermarkt portrait: "<timestamp>" of a .jpg or "<timestamp>.<ext>". */
  im?: string;
  /** Full photo URL (Second League players: the league's own site). */
  iu?: string;
}
export interface WorldTeam {
  id: string; lg: LeagueId; name: string; ru: string; short: string; country: string; primary: string; secondary: string; stadium: string; cap: number;
  rep: number; coach: { name: string; rating: number }; budget: number; wages: number;
  /** Transfermarkt club id (crest image); absent when the club could not be identified reliably. */
  tm?: number;
  /** Full crest URL (Second League clubs: the league's own site). */
  logo?: string;
}
export interface WorldJson {
  v: number;
  snapshot: string;
  start: string;
  leagues: Record<LeagueId, { name: string; country: string; tier: number; teams: string[] }>;
  teams: WorldTeam[];
  players: WorldPlayer[];
  nations: Record<string, [string, string]>;
  wc2026: { groups: Record<string, string[]>; squads: Record<string, number[]>; medals: string[]; fourth: string; mvp: string; keeper: string; young: string };
  facts: { champions: Record<string, string>; cup: string; cupFinalist: string };
  /** Champions League 2026-27: the real draw and the clubs from outside the simulated leagues. */
  ucl?: UclWorld;
}

export interface NewCareerOpts {
  team: string;
  gmName: string;
  seed?: number;
  settings?: Partial<Settings>;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'real', sound: false, assistant: true, stopOnUserGames: false, watchGames: false, hideMedia: false, autoRenew: true,
};

const OUT: (keyof OutfieldAttrs)[] = ['pac', 'sho', 'pas', 'dri', 'att', 'def', 'phy', 'hea', 'dis', 'sta'];
const KEEP: (keyof KeeperAttrs)[] = ['ref', 'pos', 'han', 'kic', 'con', 'men', 'sta'];

const photoFile = (w: WorldPlayer) => (w.iu ? w.iu : w.im ? `${w.id}-${w.im}${w.im.includes('.') ? '' : '.jpg'}` : null);

/** Brings a save made with an older snapshot up to date (photos, crests, the Champions League). */
export function upgradeSave(L: League, world: WorldJson) {
  attachPhotos(L, world);
  attachLeagues(L, world);
  attachUcl(L, world);
}

/** Saves made before the Champions League: the guest clubs and their squads join the world; the real
 *  2026-27 draw is used if the first matchday is still ahead, otherwise the tournament starts next season. */
function attachUcl(L: League, world: WorldJson) {
  const w = world.ucl;
  if (!w || L.ext) return;
  const names = new Set(w.ext.map((e) => e.name));
  for (const p of world.players) {
    if (!p.x || !names.has(p.x)) continue;
    const q = L.players[p.id];
    if (!q) L.players[p.id] = expandPlayer(p, L.season);
    else if (!q.team && q.st === 'ACT' && q.ext) q.ext = p.x;
  }
  const first = w.md.reduce((m, x) => (x[1] < m ? x[1] : m), '9999');
  if (L.season === w.season && L.date < first) initUclFromWorld(L, w);
  else L.ext = Object.fromEntries(w.ext.map((e) => [e.id, makeExt(e)]));
}

/** Saves made before photos and crests were added to the snapshot get them from it. */
function attachPhotos(L: League, world: WorldJson) {
  for (const w of world.teams) if (w.tm && L.teams[w.id] && !L.teams[w.id].tm) L.teams[w.id].tm = w.tm;
  const byId = new Map(world.players.map((w) => [w.id, w]));
  for (const p of Object.values(L.players)) {
    if (p.img || !p.real) continue;
    const w = byId.get(p.id);
    if (w?.im) p.img = photoFile(w);
  }
}

function makeTeam(t: WorldTeam): Team {
  return {
    id: t.id, lg: t.lg, name: t.name, ru: t.ru, city: '', short: t.short, country: t.country, primary: t.primary, secondary: t.secondary, accent: t.secondary,
    stadium: t.stadium, cap: t.cap, rep: t.rep, tactic: 'balanced', last: null, lineup: emptyLineup(), rec: emptyRecord(), strategy: 'bubble',
    coach: { name: t.coach.name, rating: t.coach.rating, style: 'balanced', age: 50, wage: 500_000 }, fans: 60, rel: 50,
    staff: { med: 2, scouting: 2, academy: t.rep >= 70 ? 3 : t.rep >= 50 ? 2 : 1 }, titles: 0, cups: 0,
    budget: t.budget, wageBudget: Math.round((t.wages * 1.12 + 300_000) / 1e4) * 1e4, trophies: [], ...(t.tm ? { tm: t.tm } : {}), ...(t.logo ? { logo: t.logo } : {}),
  };
}

/**
 * Saves made before a league was added to the snapshot (the Second League) get its clubs and players.
 * Its calendar starts the next weekend; late in the season it starts with the next season instead.
 */
function attachLeagues(L: League, world: WorldJson) {
  for (const lg of LEAGUE_IDS) {
    if (!world.leagues[lg] || Object.values(L.teams).some((t) => t.lg === lg)) continue;
    const ids = new Set(world.leagues[lg].teams);
    for (const t of world.teams) if (ids.has(t.id) && !L.teams[t.id]) L.teams[t.id] = makeTeam(t);
    for (const w of world.players) if (w.t && ids.has(w.t) && !L.players[w.id]) L.players[w.id] = expandPlayer(w, L.season);
    L.comps[lg] = { id: lg, name: LEAGUES[lg].name, country: LEAGUES[lg].country, tier: LEAGUES[lg].tier, phase: 'done', seasonStart: '', seasonEnd: '', champion: '', history: [] };
    touchSquads();
    for (const id of ids) if (L.teams[id]) aiLineup(L, L.teams[id]);
    const { end } = leagueDates(lg, L.season);
    if (L.date <= addDays(end, -150)) scheduleLeague(L, lg, L.season, addDays(L.date, 2));
  }
}

export function expandPlayer(w: WorldPlayer, season: number): Player {
  const pos = posOfRole(w.role);
  const r = {} as Record<string, number>;
  (pos === 'G' ? KEEP : OUT).forEach((k, i) => (r[k] = w.r[i]));
  const h = (s: number) => hash01(w.id, s);
  const pers = { lead: 1 + Math.floor(h(1) * 20), prof: 4 + Math.floor(h(2) * 17), loy: 1 + Math.floor(h(3) * 20), greed: 1 + Math.floor(h(4) * 20), win: 1 + Math.floor(h(5) * 20) };
  const medal = typeof w.wc === 'string' ? [`wc:2026:${w.wc}`] : undefined;
  return {
    id: w.id, fn: w.fn, ln: w.ln, ru: w.ru, pos, role: w.role, alt: w.alt, foot: w.foot, bd: w.bd, ...(w.ab ? { bdApprox: true } : {}), ctry: w.c, ht: w.ht ?? 181, num: w.n ?? null, img: photoFile(w), real: true,
    team: w.t ?? null, ext: w.x, st: w.t || w.x ? 'ACT' : 'FA', ovr: w.o, pot: w.p, r: r as unknown as OutfieldAttrs, tr: [], val: w.v,
    c: w.t || w.x ? { wage: w.w, until: w.u, real: !!w.cr } : null,
    loan: w.loan != null && w.t ? { from: w.loan, until: season + 1 } : undefined,
    morale: 68, form: 0, fit: 100, inj: null, pers, dev: h(6) < 0.2 ? 'E' : h(6) > 0.8 ? 'L' : 'N', stats: {}, h: w.h, hist: [], awards: [],
    teams: w.t ? [w.t] : [], caps: w.caps ?? 0, ig: w.ig ?? 0, intl: medal, joined: season - 1,
  };
}

export function newCareer(world: WorldJson, o: NewCareerOpts): League {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  useState_(seedState(seed));
  setNations(world.nations);
  const season = Number(world.start.slice(0, 4));
  const L: League = {
    v: 1, seed, rng: getState(), season, date: `${season}-07-13`, phase: 'preseason', user: o.team,
    gm: { name: o.gmName || 'Спортивный директор', rep: 50, seasons: 0, titles: 0, hiredSeason: season, history: [], fired: false },
    owner: { name: PRESIDENT, trust: 60, goal: 'mid', goalText: '', patience: 2, warnings: 0 },
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    comps: {}, cups: {}, intl: { current: null, history: [], ranking: [], nextGameId: 1 },
    teams: {}, players: {}, nextId: 9_500_000, games: [], nextGameId: 1, negotiations: {}, news: [], inbox: [], nextMsgId: 1,
    offers: [], transfers: [], history: [], achievements: {}, scouting: { know: {}, shortlist: [] }, watch: [], rivals: [],
    meta: { snapshot: world.snapshot, worldChampion: world.wc2026.medals[0] }, stops: [], album: [], flags: {},
    windows: transferWindows(season), seasonLog: { bought: 0, sold: 0, spent: 0, earned: 0, userGames: { w: 0, d: 0, l: 0 } },
  };

  for (const t of world.teams) L.teams[t.id] = makeTeam(t);
  for (const w of world.players) {
    if (w.t && !L.teams[w.t]) continue;
    L.players[w.id] = expandPlayer(w, season);
  }
  for (const lg of LEAGUE_IDS) {
    const champ = world.facts.champions[lg];
    L.comps[lg] = { id: lg, name: LEAGUES[lg].name, country: LEAGUES[lg].country, tier: LEAGUES[lg].tier, phase: 'preseason', seasonStart: '', seasonEnd: '', champion: L.teams[champ] ? champ : '', history: [] };
  }
  touchSquads();
  for (const t of Object.values(L.teams)) aiLineup(L, t);
  L.teams[o.team].lineup.auto = false;
  for (const lg of LEAGUE_IDS) scheduleLeague(L, lg, season);
  initCup(L, season);
  if (world.ucl) initUclFromWorld(L, world.ucl);
  const mvp = world.players.find((p) => p.c === 'ESP' && `${p.fn} ${p.ln}`.trim().endsWith(world.wc2026.mvp))?.id;
  initIntl(L, { medals: world.wc2026.medals, mvp });
  updateStrategies(L);

  // Rivals: the closest clubs of the same league by reputation.
  const me = L.teams[o.team];
  const near = Object.values(L.teams).filter((t) => t.lg === me.lg && t.id !== me.id).sort((a, b) => Math.abs(a.rep - me.rep) - Math.abs(b.rep - me.rep)).slice(0, 2);
  L.rivals = near.map((t) => [me.id, t.id]);
  for (const p of Object.values(L.players)) if (p.team === me.id) L.album.push(p.id);

  const goal = ownerGoalFor(L, o.team);
  L.owner.goal = goal.goal;
  L.owner.goalText = goal.text;
  const champ = L.comps[me.lg].champion;
  pushMsg(L, {
    from: PRESIDENT, kind: 'owner', title: `Добро пожаловать в «${me.ru}»`,
    body: `Сезон ${seasonLabel(season)} начинается. Наша цель: ${goal.text}.\n\nБюджет на трансферы — ${money(me.budget)}, на зарплаты — ${money(me.wageBudget)} в год. Летнее окно открыто до 10 сентября.\n\nСостав на матч выставляете вы: на поле выйдут именно те одиннадцать, которых вы назовёте. Если кто-то не сможет играть, штаб предупредит до матча.`,
  });
  pushNews(L, { kind: 'league', title: `${LEAGUES[me.lg].name}: действующий чемпион — «${L.teams[champ]?.ru ?? '—'}». Обладатель Кубка России — «${L.teams[world.facts.cup]?.ru ?? '—'}»` });
  pushNews(L, { kind: 'intl', title: 'Чемпионат мира 2026: чемпион — Испания, серебро у Аргентины, бронза у Англии', important: true });
  L.rng = getState();
  return L;
}

export const ageOf = (p: Player, L: League) => ageOn(p.bd, L.date);
