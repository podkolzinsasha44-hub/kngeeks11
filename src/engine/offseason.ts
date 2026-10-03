// End of a league season (titles, awards) and the yearly rollover on June 20:
// promotion and relegation, expiring contracts, development, academy intake, budgets, new calendar.
import { aiLineup, extRenewals, updateStrategies } from './ai';
import { updateValues, wageBill } from './contracts';
import { initCup } from './cup';
import { genPlayer } from './gen';
import { updateRanking } from './intl';
import { LEAGUES, LEAGUE_IDS, leagueTeams, statKey, transferWindows } from './leagues';
import { squad, touchSquads } from './lineup';
import { PRESIDENT } from './names';
import { pushMsg, pushNews } from './news';
import { evaluateSeason, ownerGoalFor, ownerReact, targetPlace } from './owner';
import { developAll, shouldRetire } from './progression';
import { int } from './rng';
import { scheduleLeague } from './schedule';
import { emptyRecord, sortedTeams } from './standings';
import { leaders } from './stats';
import { ensureSquads, returnLoans } from './transfers';
import type { League, LeagueId, Player, Team } from './types';
import { ageOn, clamp, dispName, money, seasonLabel } from './util';

const award = (p: Player, season: number, lg: LeagueId, name: string) => p.awards.push(`${seasonLabel(season)} · ${LEAGUES[lg].short}: ${name}`);

/** Called on the day the last round of a league is played. */
export function endLeague(L: League, lg: LeagueId) {
  const table = sortedTeams(L, lg);
  const champ = table[0];
  const key = statKey(L.season, lg);
  const c = L.comps[lg];
  c.champion = champ.id;
  champ.titles++;
  champ.trophies.push(`${LEAGUES[lg].short} ${seasonLabel(L.season)}`);
  const inLg = (p: Player) => !!p.team && L.teams[p.team].lg === lg;
  const top = leaders(L, key, 'g', 1, inLg)[0];
  const half = Math.max(8, Math.round(champ.rec.gp * 0.5));
  const byRating = Object.values(L.players).filter((p) => inLg(p) && (p.stats[key]?.gp ?? 0) >= half).sort((a, b) => b.stats[key].rt / b.stats[key].gp - a.stats[key].rt / a.stats[key].gp);
  const mvp = byRating[0], keeper = byRating.find((p) => p.pos === 'G'), young = byRating.find((p) => ageOn(p.bd, L.date) <= 21);
  if (top) award(top.p, L.season, lg, `лучший бомбардир (${top.v})`);
  if (mvp) award(mvp, L.season, lg, 'игрок сезона');
  if (keeper) award(keeper, L.season, lg, 'лучший вратарь');
  if (young) award(young, L.season, lg, 'лучший молодой игрок');
  for (const p of squad(L, champ.id)) if ((p.stats[key]?.gp ?? 0) > 0) p.awards.push(`${seasonLabel(L.season)} · чемпион (${LEAGUES[lg].short})`);
  c.history.unshift({
    season: L.season, champion: champ.id, second: table[1].id, third: table[2].id,
    topScorer: top ? { id: top.p.id, name: dispName(top.p), g: top.v } : undefined, mvp: mvp?.id, relegated: [],
    standings: table.map((t) => ({ id: t.id, pts: t.rec.pts })),
  });
  const mine = lg === L.teams[L.user]?.lg;
  pushNews(L, { kind: 'award', title: `🏆 «${champ.ru}» — чемпион (${LEAGUES[lg].name}), ${champ.rec.pts} очков`, team: champ.id, important: mine || LEAGUES[lg].tier === 1 });
  if (mine) {
    if (top) pushNews(L, { kind: 'award', title: `Лучший бомбардир сезона — ${dispName(top.p)}, ${top.v} голов`, players: [top.p.id] });
    if (mvp) pushNews(L, { kind: 'award', title: `Игрок сезона — ${dispName(mvp)} («${L.teams[mvp.team!].ru}»)`, players: [mvp.id] });
    if (champ.id === L.user) { L.gm.titles++; L.achievements.champion = L.date; }
  }
}

/** Clubs changing division after the season: [down, up] pairs. */
function movers(L: League): [Team, Team][] {
  const rpl = sortedTeams(L, 'RPL'), fnl = sortedTeams(L, 'FNL');
  const out: [Team, Team][] = [[rpl[rpl.length - 1], fnl[0]], [rpl[rpl.length - 2], fnl[1]]];
  for (const tie of L.cups.PO?.season === L.season ? L.cups.PO.ties : []) {
    const w = tie.winner ? L.teams[tie.winner] : null;
    if (w && w.lg === 'FNL') out.push([L.teams[w.id === tie.h ? tie.a : tie.h], w]);
  }
  return out;
}

function income(t: Team, place: number, n: number) {
  const factor = 1.6 - (1.1 * (place - 1)) / Math.max(1, n - 1);
  const base = { RPL: 12e6, FNL: 2.5e6, EPL: 42e6, ESP: 27e6, ITA: 23e6, GER: 23e6, FRA: 17e6 }[t.lg];
  return Math.round((base * factor * Math.pow(t.rep / 60, 2)) / 1e5) * 1e5;
}

export function rollover(L: League) {
  const season = L.season;
  const me = L.teams[L.user];
  const myLg = me.lg;
  const table = sortedTeams(L, myLg);
  const place = table.findIndex((t) => t.id === me.id) + 1;
  const moves = movers(L);
  const cup = L.cups.CUP?.season === season ? L.cups.CUP : null;

  // --- the board judges the season
  const relegated = moves.some(([d]) => d.id === me.id), promoted = moves.some(([, u]) => u.id === me.id);
  const champion = L.comps[myLg].champion === me.id && place === 1;
  const goalWas = L.owner.goalText, target = targetPlace(L);
  const delta = evaluateSeason(L, place, { champion, cup: cup?.champion === me.id, relegated, promoted });
  const result = `${place}-е место${champion ? ', чемпион' : ''}${cup?.champion === me.id ? ', Кубок России' : ''}${relegated ? ', вылет' : ''}${promoted ? ', повышение в классе' : ''}`;
  L.gm.history.push({ season, team: me.id, result });
  L.gm.seasons++;
  L.gm.rep = clamp(L.gm.rep + Math.round(delta / 3), 0, 100);
  const key = statKey(season, myLg);
  const top = leaders(L, key, 'g', 1, (p) => !!p.team && L.teams[p.team].lg === myLg)[0];
  L.history.unshift({
    season, lg: myLg, champion: L.comps[myLg].champion, cup: cup?.champion, awards: {},
    userRecord: { w: me.rec.w, d: me.rec.d, l: me.rec.l, pts: me.rec.pts, place, lg: myLg },
    standings: table.map((t) => ({ id: t.id, pts: t.rec.pts })), topScorer: top ? { id: top.p.id, name: dispName(top.p), g: top.v } : undefined,
    relegated: moves.map(([d]) => d.id), promoted: moves.map(([, u]) => u.id),
  });
  pushMsg(L, {
    from: PRESIDENT, kind: 'owner', title: `Итоги сезона ${seasonLabel(season)}: ${result}`,
    body: `Задача была: ${goalWas} (ориентир — ${target}-е место). ${delta >= 0 ? 'Совет директоров доволен работой.' : 'Совет директоров разочарован результатом.'} Доверие: ${L.owner.trust}/100.`,
  });

  // --- budgets from the season's income
  for (const lg of LEAGUE_IDS) {
    const tb = sortedTeams(L, lg);
    tb.forEach((t, i) => {
      const inc = income(t, i + 1, tb.length);
      t.budget = Math.round((Math.max(0, t.budget) * 0.5 + inc) / 1e5) * 1e5;
      t.last = { pos: i + 1, w: t.rec.w, d: t.rec.d, l: t.rec.l, pts: t.rec.pts, gf: t.rec.gf, ga: t.rec.ga, lg };
      // Success slowly builds the name of a club.
      t.rep = clamp(Math.round(t.rep + (tb.length / 2 - i) * 0.12 + (i === 0 ? 1 : 0)), 20, 97);
    });
  }

  // --- promotion and relegation
  for (const [down, up] of moves) {
    down.lg = 'FNL'; up.lg = 'RPL';
    L.comps.RPL.history[0]?.relegated.push(down.id);
    pushNews(L, { kind: 'league', title: `«${up.ru}» выходит в Премьер-Лигу, «${down.ru}» отправляется в Первую лигу`, important: down.id === me.id || up.id === me.id });
  }

  // --- contracts, loans, retirements, development
  returnLoans(L);
  extRenewals(L);
  const leaving: string[] = [], retiring: string[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    if (shouldRetire(L, p)) {
      if (p.team === me.id) retiring.push(dispName(p));
      if (p.ovr >= 80 || p.team === me.id) pushNews(L, { kind: 'retire', title: `${dispName(p)} завершает карьеру`, players: [p.id], team: p.team ?? undefined });
      p.st = 'RET'; p.retired = season; p.team = null; p.c = null;
      continue;
    }
    if (p.team && p.c && p.c.until <= season + 1) {
      if (p.team === me.id) leaving.push(`${dispName(p)} (${p.ovr})`);
      p.team = null; p.c = null; p.st = 'FA'; p.listed = false; p.wantsOut = false;
      p.joined = season + 1;
    } else if (p.st === 'FA' && (p.joined ?? 0) <= season) {
      // A full season without a club: the career is over (or continues below the level of the game).
      p.st = 'RET'; p.retired = season;
      continue;
    }
    p.yel = 0;
    p.susp = 0;
    p.fit = 100;
    p.form *= 0.3;
  }
  touchSquads();
  const dev = developAll(L, season);
  updateValues(L);
  // Old seasons are folded away to keep the save small: only players who actually played keep their lines.
  // Retired players stay only if the user's club or the record books remember them.
  const keep = new Set(L.album);
  for (const id in L.players) {
    const q = L.players[id];
    if (q.st === 'RET' && !keep.has(q.id) && !q.awards.length && !q.intl?.length) { delete L.players[id]; continue; }
    const st = L.players[id].stats;
    for (const k in st) if (Number(k.slice(0, 4)) < season - 7 || !st[k].gp) delete st[k];
  }

  // --- academy graduates (the only fictional players: they did not exist when the career began)
  const intake: number[] = [];
  for (const t of Object.values(L.teams)) {
    const n = int(1, 2) + (t.staff.academy >= 3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const lvl = 44 + t.rep * 0.14 + t.staff.academy * 1.5;
      const p = genPlayer(L, { team: t, ovr: clamp(lvl + int(-4, 5), 42, 66) });
      if (t.id === me.id) intake.push(p.id);
    }
  }
  L.intake = intake;

  // --- new season
  L.season = season + 1;
  L.games = [];
  L.windows = transferWindows(L.season);
  L.offers = [];
  L.negotiations = {};
  for (const t of Object.values(L.teams)) {
    t.rec = emptyRecord();
    t.lastGame = undefined;
    t.wageBudget = Math.round(Math.max(t.wageBudget * (t.lg === 'FNL' && t.last?.lg === 'RPL' ? 0.75 : 1.03), wageBill(L, t.id) * 1.08) / 1e4) * 1e4;
    if (t.id !== me.id) aiLineup(L, t);
  }
  // Clubs left short by expired contracts sign free agents (or promote a youngster) straight away.
  ensureSquads(L, (t, pos) => genPlayer(L, { team: t, role: pos === 'G' ? 'GK' : pos === 'D' ? 'CB' : pos === 'M' ? 'CM' : 'ST', age: 18 }));
  for (const t of Object.values(L.teams)) if (t.id !== me.id) aiLineup(L, t);
  for (const lg of LEAGUE_IDS) scheduleLeague(L, lg, L.season);
  initCup(L, L.season);
  delete L.cups.PO;
  updateStrategies(L);
  updateRanking(L);
  L.phase = 'preseason';
  L.seasonLog = { bought: 0, sold: 0, spent: 0, earned: 0, userGames: { w: 0, d: 0, l: 0 } };
  for (const k in L.flags) if (k.startsWith('lineup:')) delete L.flags[k];

  const goal = ownerGoalFor(L, me.id);
  L.owner.goal = goal.goal;
  L.owner.goalText = goal.text;
  const up = dev.filter((x) => x.d > 0).slice(0, 5).map((x) => `${dispName(x.p)} +${x.d} (${x.p.ovr})`);
  const down = dev.filter((x) => x.d < 0).slice(0, 4).map((x) => `${dispName(x.p)} ${x.d} (${x.p.ovr})`);
  pushMsg(L, {
    from: 'Спортивный отдел', kind: 'staff', title: `Межсезонье: что изменилось`,
    body: [
      leaving.length ? `Контракты истекли, игроки ушли свободными агентами:\n${leaving.join('\n')}` : 'Все контракты действуют.',
      retiring.length ? `Завершили карьеру: ${retiring.join(', ')}` : '',
      intake.length ? `Из академии переведены: ${intake.map((id) => `${dispName(L.players[id])} (${L.players[id].role}, ${L.players[id].ovr})`).join(', ')}` : '',
      up.length ? `Прибавили: ${up.join(', ')}` : '', down.length ? `Сдали: ${down.join(', ')}` : '',
      `Бюджет на трансферы: ${money(me.budget)}. Зарплатный бюджет: ${money(me.wageBudget)} в год.`,
    ].filter(Boolean).join('\n\n'),
    ref: { type: 'screen', id: 'roster' },
  });
  pushMsg(L, { from: PRESIDENT, kind: 'owner', title: `Задача на сезон ${seasonLabel(L.season)}`, body: `Наша цель: ${goal.text}.` });
  pushNews(L, { kind: 'league', title: `Начинается подготовка к сезону ${seasonLabel(L.season)}. Трансферное окно открыто`, important: true });
  ownerReact(L);
  L.stops.push('rollover');
}

export { leagueTeams };
