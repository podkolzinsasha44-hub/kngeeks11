// National teams: the World Cup every four years (2030, 2034…) and the European Championship
// (2028, 2032…). Squads are picked from every real player of the country, wherever he plays.
// Qualification is not played: the field is the strongest nations by confederation quota.
import { FORMATION_IDS, bestXI, pickBench } from './lineup';
import { simulateMatch, type MatchSide } from './match';
import { pushMsg, pushNews } from './news';
import { shuffle } from './rng';
import { line } from './stats';
import type { IntlGame, IntlKind, IntlRecord, League, Lineup, OutfieldAttrs, Player, Tournament } from './types';
import { addDays, clamp, dispName } from './util';

/** [Russian name, flag] by FIFA code — static data loaded with the world file. */
export let NATIONS: Record<string, [string, string]> = {};
export const setNations = (n: Record<string, [string, string]>) => { NATIONS = n; };
export const nationName = (c: string) => NATIONS[c]?.[0] ?? c;
export const flag = (c: string) => NATIONS[c]?.[1] ?? '🏳️';

const UEFA = 'ESP ENG FRA GER POR NED ITA BEL CRO SUI DEN AUT UKR TUR SWE POL WAL SRB CZE SCO HUN NOR GRE ROU SVK SVN IRL NIR FIN ISL BIH MNE MKD ALB KOS BUL GEO ARM AZE BLR KAZ MDA LVA LTU EST ISR CYP LUX MLT FRO AND RUS'.split(' ');
const CONMEBOL = 'ARG BRA URU COL CHI PER PAR ECU VEN BOL'.split(' ');
const CONCACAF = 'USA MEX CAN CRC PAN HON SLV GUA JAM HAI CUW SUR TRI DOM CUB'.split(' ');
const AFC = 'JPN KOR IRN AUS KSA QAT UAE IRQ JOR CHN UZB KGZ TJK TKM SYR LBN PLE IDN THA VIE PHI IND'.split(' ');
const OFC = ['NZL'];
export function confed(c: string) {
  return UEFA.includes(c) ? 'UEFA' : CONMEBOL.includes(c) ? 'CONMEBOL' : CONCACAF.includes(c) ? 'CONCACAF' : AFC.includes(c) ? 'AFC' : OFC.includes(c) ? 'OFC' : 'CAF';
}
const WC_QUOTA: Record<string, number> = { UEFA: 16, CAF: 10, AFC: 9, CONMEBOL: 6, CONCACAF: 6, OFC: 1 };

export function eligible(L: League, code: string): Player[] {
  const out: Player[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.ctry === code && p.st !== 'RET') out.push(p);
  }
  return out;
}

/** Strength of a national team: mean rating of its best fourteen players. */
export function nationPower(L: League, code: string, pool?: Player[]) {
  const best = (pool ?? eligible(L, code)).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 14);
  return best.length >= 14 ? best.reduce((a, b) => a + b, 0) / 14 : 0;
}

export function updateRanking(L: League) {
  const by = new Map<string, Player[]>();
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    (by.get(p.ctry) ?? by.set(p.ctry, []).get(p.ctry)!).push(p);
  }
  L.intl.ranking = [...by].map(([c, ps]) => ({ c, v: nationPower(L, c, ps) })).filter((x) => x.v > 0 && NATIONS[x.c]).sort((a, b) => b.v - a.v).map((x) => x.c);
}

export function initIntl(L: League, real: { medals: string[]; mvp?: number }) {
  L.intl = {
    current: null, ranking: [], nextGameId: 1,
    history: [{ id: 'wc2026', kind: 'wc', year: 2026, name: 'Чемпионат мира 2026', medals: real.medals, mvp: real.mvp, real: true }],
  };
  updateRanking(L);
}

/** Squad of 26: three keepers and the best outfield players with every line covered. */
export function pickSquad(L: League, code: string): number[] {
  const pool = eligible(L, code).filter((p) => !p.inj || p.inj.days < 12).sort((a, b) => b.ovr + b.form - (a.ovr + a.form));
  const out: Player[] = pool.filter((p) => p.pos === 'G').slice(0, 3);
  for (const [pos, n] of [['D', 8], ['M', 8], ['F', 7]] as const) out.push(...pool.filter((p) => p.pos === pos).slice(0, n));
  for (const p of pool) { if (out.length >= 26) break; if (!out.includes(p)) out.push(p); }
  return out.slice(0, 26).map((p) => p.id);
}

function nationLineup(L: League, ids: number[]): Lineup {
  const ps = ids.map((id) => L.players[id]).filter((p) => p && !p.inj && p.st !== 'RET');
  let best: { xi: Player[]; score: number } | null = null, form = FORMATION_IDS[0];
  for (const f of FORMATION_IDS) { const r = bestXI(ps, f); if (!best || r.score > best.score) { best = r; form = f; } }
  const xi = best?.xi ?? [];
  const pen = [...xi].filter((p) => p.pos !== 'G').sort((a, b) => (b.r as OutfieldAttrs).sho - (a.r as OutfieldAttrs).sho)[0]?.id;
  return { form, xi: xi.map((p) => p.id), bench: pickBench(ps, xi, 12).map((p) => p.id), auto: true, pen };
}

const HOSTS: Record<number, [string, string[]]> = {
  2028: ['Великобритания и Ирландия', ['ENG', 'SCO', 'WAL', 'IRL']],
  2030: ['Испания, Португалия и Марокко', ['ESP', 'POR', 'MAR']],
  2032: ['Италия и Турция', ['ITA', 'TUR']],
  2034: ['Саудовская Аравия', ['KSA']],
};

function field(L: League, kind: IntlKind, year: number): string[] {
  const rank = L.intl.ranking.filter((c) => c !== 'RUS' || L.settings.intlRussia);
  const hosts = (HOSTS[year]?.[1] ?? []).filter((c) => rank.includes(c));
  if (kind === 'euro') {
    const eu = rank.filter((c) => confed(c) === 'UEFA');
    return [...new Set([...hosts, ...eu])].slice(0, 24);
  }
  const out = new Set(hosts);
  for (const cf in WC_QUOTA) {
    let n = WC_QUOTA[cf] - [...out].filter((c) => confed(c) === cf).length;
    for (const c of rank) { if (n <= 0) break; if (confed(c) === cf && !out.has(c)) { out.add(c); n--; } }
  }
  for (const c of rank) { if (out.size >= 48) break; out.add(c); }
  return [...out].slice(0, 48);
}

const emptyRec = (): IntlRecord => ({ gp: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0 });

export function createTournament(L: League, kind: IntlKind, year: number): Tournament {
  updateRanking(L);
  const teams = field(L, kind, year);
  const rank = L.intl.ranking;
  const seeded = [...teams].sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
  const nGroups = kind === 'wc' ? 12 : 6;
  const groups: Record<string, string[]> = {};
  const letters = 'ABCDEFGHIJKL'.slice(0, nGroups).split('');
  for (const l of letters) groups[l] = [];
  for (let pot = 0; pot < 4; pot++) {
    const part = shuffle(seeded.slice(pot * nGroups, (pot + 1) * nGroups));
    part.forEach((c, i) => groups[letters[i]].push(c));
  }
  const start = kind === 'wc' ? `${year}-06-13` : `${year}-06-09`;
  const T: Tournament = {
    id: `${kind}${year}`, kind, year, name: `${kind === 'wc' ? 'Чемпионат мира' : 'Чемпионат Европы'} ${year}`, host: HOSTS[year]?.[0] ?? '',
    start, end: addDays(start, 31), select: addDays(start, -12), teams, groups, rosters: {}, lineups: {}, games: [], table: {}, phase: 'upcoming',
  };
  for (const c of teams) T.table[c] = emptyRec();
  // Group stage: three match days, groups spread over four days each.
  const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[3, 0], [1, 2]]];
  letters.forEach((l, gi) => {
    pairs.forEach((md, k) => {
      for (const [a, b] of md) T.games.push({ id: L.intl.nextGameId++, day: addDays(start, k * 4 + (gi % 4)), h: groups[l][a], a: groups[l][b], stage: l });
    });
  });
  return T;
}

function nameSquads(L: League, T: Tournament) {
  T.named = true;
  const mine: string[] = [];
  for (const c of T.teams) {
    T.rosters[c] = pickSquad(L, c);
    for (const id of T.rosters[c]) if (L.players[id].team === L.user) mine.push(`${dispName(L.players[id])} (${nationName(c)})`);
  }
  pushNews(L, { kind: 'intl', title: `${T.name}: объявлены заявки сборных`, important: true });
  if (mine.length) pushMsg(L, { from: 'Спортивный отдел', kind: 'staff', title: `Наши игроки едут на ${T.kind === 'wc' ? 'чемпионат мира' : 'чемпионат Европы'}`, body: mine.join('\n'), ref: { type: 'screen', id: 'intl' } });
}

function sideFor(L: League, T: Tournament, c: string): MatchSide {
  const ln = nationLineup(L, T.rosters[c]);
  T.lineups[c] = ln;
  return { id: c, short: c, lineup: ln, tactic: 'balanced', coach: 75 };
}

function playIntl(L: League, T: Tournament, g: IntlGame) {
  const ko = g.stage.length > 1;
  const box = simulateMatch(L.players, sideFor(L, T, g.h), sideFor(L, T, g.a), { knockout: ko, neutral: true });
  const r = box.result;
  g.played = true; g.hs = r.hs; g.as = r.as; g.mom = r.mom;
  if (r.et) g.et = true;
  if (r.pen) g.pen = r.pen;
  if (!ko) {
    const upd = (c: string, gf: number, ga: number) => {
      const t = T.table[c];
      t.gp++; t.gf += gf; t.ga += ga;
      if (gf > ga) { t.w++; t.pts += 3; } else if (gf === ga) { t.d++; t.pts++; } else t.l++;
    };
    upd(g.h, r.hs, r.as); upd(g.a, r.as, r.hs);
  }
  const key = `${T.year}:${T.kind === 'wc' ? 'WC' : 'EURO'}`;
  for (const s of box.players) {
    const l = line(s.p, key);
    l.gp++; if (s.started) l.gs++;
    l.min += s.min; l.g += s.g; l.a += s.a; l.sh += s.sh; l.rt += Math.round(s.rt * 10);
    if (s.yc) l.yc++;
    if (s.rc) l.rc++;
    if (s.p.pos === 'G') { l.ga += s.ga; l.sv += s.sv; if (s.ga === 0 && s.min >= 60) l.cs++; }
    if (r.mom === s.id) l.mom++;
    s.p.caps++; s.p.ig += s.g;
    s.p.fit = clamp(s.p.fit - (s.min / 90) * 14, 35, 100);
  }
  for (const inj of r.injuries) {
    const p = L.players[inj.id];
    if (!p || p.inj) continue;
    p.inj = { type: inj.type, days: inj.days, total: inj.days };
    if (p.team === L.user) pushMsg(L, { from: 'Медицинский штаб', kind: 'staff', title: `Травма в сборной: ${dispName(p)}`, body: `${inj.type}, ориентировочно ${inj.days} дн.`, ref: { type: 'player', id: p.id } });
  }
}

export const winnerOf = (g: IntlGame) => (g.hs! !== g.as! ? (g.hs! > g.as! ? g.h : g.a) : (g.pen?.[0] ?? 0) > (g.pen?.[1] ?? 0) ? g.h : g.a);
const cmp = (T: Tournament) => (a: string, b: string) => {
  const x = T.table[a], y = T.table[b];
  return y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || (a < b ? -1 : 1);
};
export const groupOrder = (T: Tournament, l: string) => [...T.groups[l]].sort(cmp(T));

const STAGES = ['r32', 'r16', 'qf', 'sf', 'final'];

function advance(L: League, T: Tournament, date: string) {
  const open = T.games.some((g) => !g.played);
  if (open) return;
  if (T.phase === 'group') {
    const firsts: string[] = [], seconds: string[] = [], thirds: string[] = [];
    for (const l in T.groups) { const o = groupOrder(T, l); firsts.push(o[0]); seconds.push(o[1]); thirds.push(o[2]); }
    const c = cmp(T);
    const q = [...firsts.sort(c), ...seconds.sort(c), ...thirds.sort(c).slice(0, T.kind === 'wc' ? 8 : 4)];
    T.phase = 'playoff';
    const stage = T.kind === 'wc' ? 'r32' : 'r16';
    const day = addDays(date, 3);
    for (let i = 0; i < q.length / 2; i++) T.games.push({ id: L.intl.nextGameId++, day: addDays(day, i % 4), h: q[i], a: q[q.length - 1 - i], stage });
    return;
  }
  const last = T.games[T.games.length - 1].stage;
  if (last === 'final') return finish(L, T);
  const prev = T.games.filter((g) => g.stage === last);
  const next = STAGES[STAGES.indexOf(last) + 1];
  const w = prev.map(winnerOf);
  const day = addDays(date, 3);
  if (next === 'final') {
    const losers = prev.map((g) => (winnerOf(g) === g.h ? g.a : g.h));
    T.games.push({ id: L.intl.nextGameId++, day, h: losers[0], a: losers[1], stage: 'bronze' });
    T.games.push({ id: L.intl.nextGameId++, day: addDays(day, 1), h: w[0], a: w[1], stage: 'final' });
    return;
  }
  for (let i = 0; i < w.length; i += 2) T.games.push({ id: L.intl.nextGameId++, day: addDays(day, (i / 2) % 2), h: w[i], a: w[i + 1], stage: next });
}

function finish(L: League, T: Tournament) {
  const fin = T.games.find((g) => g.stage === 'final')!, br = T.games.find((g) => g.stage === 'bronze')!;
  const gold = winnerOf(fin), silver = gold === fin.h ? fin.a : fin.h, bronze = winnerOf(br);
  T.medals = [gold, silver, bronze];
  T.phase = 'done';
  const key = `${T.year}:${T.kind === 'wc' ? 'WC' : 'EURO'}`;
  let top: Player | null = null, mvp: Player | null = null;
  for (const c of T.teams) {
    for (const id of T.rosters[c] ?? []) {
      const p = L.players[id], s = p?.stats[key];
      if (!p || !s) continue;
      if (!top || s.g > top.stats[key].g) top = p;
      if (c === gold && s.gp >= 4 && (!mvp || s.rt / s.gp > mvp.stats[key].rt / mvp.stats[key].gp)) mvp = p;
    }
  }
  T.mvp = mvp?.id;
  [gold, silver, bronze].forEach((c, i) => {
    for (const id of T.rosters[c] ?? []) {
      const p = L.players[id];
      if (!p) continue;
      (p.intl ??= []).push(`${T.kind}:${T.year}:${['gold', 'silver', 'bronze'][i]}`);
      if (i === 0) p.morale = clamp(p.morale + 10, 0, 100);
    }
  });
  L.intl.history.unshift({ id: T.id, kind: T.kind, year: T.year, name: T.name, medals: T.medals, mvp: mvp?.id, topScorer: top ? { id: top.id, name: dispName(top), g: top.stats[key].g } : undefined });
  if (T.kind === 'wc') L.meta.worldChampion = gold;
  pushNews(L, { kind: 'intl', title: `🏆 ${nationName(gold)} — ${T.kind === 'wc' ? 'чемпион мира' : 'чемпион Европы'}! В финале обыграна сборная ${nationName(silver)}`, important: true });
  L.intl.prev = T;
  L.intl.current = null;
  L.stops.push('intl');
}

export function intlDaily(L: League) {
  const date = L.date;
  const year = Number(date.slice(0, 4));
  if (!L.intl.current && year % 2 === 0 && year >= 2028 && date === `${year}-05-25`) {
    L.intl.current = createTournament(L, year % 4 === 2 ? 'wc' : 'euro', year);
    pushNews(L, { kind: 'intl', title: `${L.intl.current.name}: жеребьёвка и состав участников определены`, important: true });
  }
  const T = L.intl.current;
  if (!T) return;
  if (!T.named && date >= T.select) nameSquads(L, T);
  if (T.phase === 'upcoming' && date >= T.start) T.phase = 'group';
  if (T.phase === 'upcoming') return;
  for (const g of T.games) if (g.day === date && !g.played) playIntl(L, T, g);
  advance(L, T, date);
}
