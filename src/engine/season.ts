// The daily loop: line-ups, matches of every competition, weekly and monthly routines.
import { aiLineup, aiRenewals, fixForeign, foreignOnPitch, groupByTeam, updateStrategies } from './ai';
import { updateValues } from './contracts';
import { aggregateFor, initPlayoffs, isDecider, onCupGame, PO_LEAGUES } from './cup';
import { weeklyMorale } from './events';
import { genPlayer } from './gen';
import { intlDaily } from './intl';
import { LEAGUES, LEAGUE_IDS, cardsOf, foreignLimit, isLeague, rolloverDay, statKey, styleOf, windowOpen } from './leagues';
import { FORMATIONS, lineupValid, validateLineup } from './lineup';
import { simulateMatch, type MatchBox } from './match';
import { pushMsg, pushNews, social } from './news';
import { rollover, endLeague } from './offseason';
import { sideOf } from './projection';
import { getState, next, useState_ } from './rng';
import { applyResult, sortedTeams } from './standings';
import { line } from './stats';
import { ensureSquads, weeklyMarket } from './transfers';
import type { Game, League, LeagueId, OutfieldAttrs, Player, Team } from './types';
import { addDays, clamp, dispName, dow } from './util';
import { autoRenew, renewalCases, VERDICT_RU } from './renewals';
import { club, onUclGame, rosterOf, UCL } from './ucl';

export interface DayReport {
  date: string;
  games: Game[];
  userGame?: { game: Game; box: MatchBox };
  /** The day was not played: the user has to fix the line-up first. */
  blocked?: boolean;
}

/** Last user game box, kept in memory for the match centre (not saved). */
export let lastUserBox: { game: Game; box: MatchBox } | null = null;
export function setLastBox(b: typeof lastUserBox) { lastUserBox = b; }

/**
 * The user's eleven. A manual line-up is never rebuilt: only players who cannot play are replaced,
 * and the first time that happens the simulation stops so the user can decide himself.
 */
function prepareUserLineup(L: League, t: Team, roster: Player[], date: string): boolean {
  if (t.lineup.auto) {
    aiLineup(L, t, roster, true);
    return true;
  }
  const lim = foreignLimit(t.lg, L.season);
  const tooMany = lim ? foreignOnPitch(L, t) > lim[1] : false;
  if (lineupValid(L, t) && !tooMany) return true;
  const flag = `lineup:${date}`;
  if (!L.flags[flag]) {
    L.flags[flag] = true;
    const roles = FORMATIONS[t.lineup.form];
    const out = t.lineup.xi.map((id, i) => ({ p: L.players[id], role: roles[i] })).filter((x) => !x.p || x.p.team !== t.id || x.p.inj || (x.p.susp ?? 0) > 0);
    const why = out.map((x) => (x.p ? `${dispName(x.p)} (${x.role}) — ${x.p.team !== t.id ? 'покинул клуб' : x.p.inj ? `травма, ${x.p.inj.days} дн.` : 'дисквалификация'}` : `${x.role} — позиция пуста`));
    if (tooMany) why.push(`В стартовом составе больше ${lim![1]} легионеров — это запрещено регламентом`);
    pushMsg(L, {
      from: 'Тренерский штаб', kind: 'staff', title: 'Состав на матч нужно поправить',
      body: `Сегодня игра, но выйти на поле в заявленном составе нельзя:\n${why.join('\n')}\n\nОткройте «Состав» и замените игроков. Если продолжить без изменений, штаб заменит только этих футболистов, остальные останутся на своих местах.`,
      ref: { type: 'screen', id: 'roster' },
    });
    L.stops.push('lineup');
    return false;
  }
  const notes = validateLineup(L, t, roster);
  if (tooMany || (lim && foreignOnPitch(L, t) > lim[1])) {
    fixForeign(L, t, roster);
    notes.push('Состав приведён в соответствие с лимитом на легионеров');
  }
  if (notes.length) pushMsg(L, { from: 'Тренерский штаб', kind: 'staff', title: 'Замены в стартовом составе', body: notes.join('\n') });
  return true;
}

export function playGame(L: League, g: Game): MatchBox {
  const H = club(L, g.h), A = club(L, g.a);
  const isUser = g.h === L.user || g.a === L.user;
  const box = simulateMatch(L.players, sideOf(H), sideOf(A), {
    knockout: isDecider(L, g), agg: aggregateFor(L, g), neutral: g.neutral, style: styleOf(g), cards: cardsOf(g), detail: isUser,
  });
  applyGame(L, g, box);
  if (isUser) {
    lastUserBox = { game: g, box };
    L.lastUserGame = g.id;
  }
  return box;
}

function applyGame(L: League, g: Game, box: MatchBox) {
  const r = box.result;
  g.played = true;
  g.hs = r.hs; g.as = r.as; g.shH = r.shH; g.shA = r.shA; g.mom = r.mom;
  g.xg = [Math.round(r.xgH * 100), Math.round(r.xgA * 100)];
  if (r.et) g.et = true;
  if (r.pen) g.pen = r.pen;
  const H = club(L, g.h), A = club(L, g.a);
  H.lastGame = A.lastGame = g.day;
  const league = isLeague(g.comp);
  if (league) {
    applyResult(H, r.hs, r.as, true, r.shH, r.shA);
    applyResult(A, r.as, r.hs, false, r.shA, r.shH);
  }
  const key = statKey(L.season, g.comp);
  const played = new Set<number>();
  for (const s of box.players) {
    const p = s.p;
    played.add(p.id);
    const l = line(p, key);
    l.gp++; if (s.started) l.gs++;
    l.min += s.min; l.g += s.g; l.a += s.a; l.sh += s.sh; l.rt += Math.round(s.rt * 10);
    if (s.yc) l.yc++;
    if (s.rc || s.yc === 2) l.rc++;
    if (p.pos === 'G') { l.ga += s.ga; l.sv += s.sv; if (s.ga === 0 && s.min >= 60) l.cs++; }
    if (r.mom === p.id) l.mom++;
    p.form = clamp(p.form * 0.8 + (s.rt - 6.6) * 0.25, -1, 1);
    const sta = p.pos === 'G' ? 95 : (p.r as OutfieldAttrs).sta;
    p.fit = clamp(p.fit - (s.min / 90) * (27 - sta / 6), 35, 100);
    // Suspensions: a second yellow — one match; a straight red — one to three, as the disciplinary committee decides
    // (denying a chance — one, serious foul play — two, violent conduct — three); every 4th or 5th yellow in the league.
    let ban = 0;
    if (s.yc === 2) ban = 1;
    else if (s.rc) { const u = next(); ban = u < 0.45 ? 1 : u < 0.85 ? 2 : 3; }
    if (ban) p.susp = (p.susp ?? 0) + ban;
    else if (s.yc && league) {
      p.yel = (p.yel ?? 0) + 1;
      if (p.yel % LEAGUES[g.comp as LeagueId].cards.ban === 0) {
        p.susp = (p.susp ?? 0) + 1;
        if (p.team === L.user) pushMsg(L, { from: 'Тренерский штаб', kind: 'staff', title: `${dispName(p)} пропустит следующий матч`, body: `Перебор жёлтых карточек (${p.yel}).`, ref: { type: 'player', id: p.id } });
      }
    }
    if (s.g >= 3) {
      pushNews(L, { kind: 'game', title: `Хет-трик! ${dispName(p)} («${club(L, p.team ?? (p.ext === A.name ? g.a : g.h))?.ru ?? ''}»)`, players: [p.id], team: p.team ?? undefined });
      if (p.team === L.user) social(L, `⚽⚽⚽ ${dispName(p)} оформляет хет-трик! Мяч забирает домой`, { kind: 'fan', team: L.user, players: [p.id] });
    }
    if (ban && p.team === L.user) pushMsg(L, { from: 'Тренерский штаб', kind: 'staff', title: `${dispName(p)} удалён и дисквалифицирован`, body: `Игрок пропустит ${ban === 1 ? 'следующий матч' : ban === 2 ? 'два матча' : 'три матча'}.`, ref: { type: 'player', id: p.id } });
  }
  // Suspended players of both clubs have served one match.
  for (const t of [H, A]) {
    for (const p of rosterOf(L, t.id)) if (p.susp && p.susp > 0 && !played.has(p.id)) p.susp--;
  }
  for (const inj of r.injuries) {
    const p = L.players[inj.id];
    if (!p || p.inj) continue;
    const med = p.team ? L.teams[p.team]?.staff.med ?? 2 : 2;
    const days = Math.max(1, Math.round(inj.days * (1.15 - med * 0.075)));
    p.inj = { type: inj.type, days, total: days };
    if (p.team === L.user) {
      pushMsg(L, {
        from: 'Медицинский штаб', kind: 'staff', title: `Травма: ${dispName(p)}`,
        body: `${inj.type}. Ориентировочно ${days <= 3 ? 'несколько дней' : days <= 10 ? 'до полутора недель' : days < 45 ? `${Math.round(days / 7)} нед.` : `${Math.round(days / 30)} мес.`}`,
        ref: { type: 'player', id: p.id },
      });
      if (days >= 10 && p.ovr >= L.teams[L.user].lineup.xi.reduce((s, id) => s + (L.players[id]?.ovr ?? 0), 0) / 11 - 3) L.stops.push('injury');
    } else if (days >= 40 && p.ovr >= 82) {
      pushNews(L, { kind: 'injury', title: `${dispName(p)} («${L.teams[p.team ?? '']?.ru ?? p.ext ?? ''}») выбыл на ${Math.round(days / 7)} нед.`, players: [p.id], team: p.team ?? undefined });
    }
  }
  if (g.h === L.user || g.a === L.user) {
    const mine = g.h === L.user ? r.hs : r.as, their = g.h === L.user ? r.as : r.hs;
    const won = mine > their || (mine === their && !!r.pen && (g.h === L.user ? r.pen[0] > r.pen[1] : r.pen[1] > r.pen[0]));
    if (won) L.seasonLog.userGames.w++; else if (mine === their && !r.pen) L.seasonLog.userGames.d++; else L.seasonLog.userGames.l++;
    const t = L.teams[L.user];
    t.fans = clamp(t.fans + (won ? 1.2 : mine === their ? -0.1 : -1.2) * (g.tie ? 2 : 1), 0, 100);
  }
  if (g.comp === UCL) {
    if (onUclGame(L, g) === 'final' && (g.h === L.user || g.a === L.user)) L.stops.push('ucl');
  } else if (g.tie) {
    const res = onCupGame(L, g);
    if (res === 'final' && (g.h === L.user || g.a === L.user)) L.stops.push('cup');
  }
}

function daily(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (p.inj) {
      p.inj.days--;
      if (p.inj.days <= 0) {
        p.inj = null;
        p.fit = Math.min(p.fit, 80);
        if (p.team === L.user) pushMsg(L, { from: 'Медицинский штаб', kind: 'staff', title: `${dispName(p)} здоров`, body: 'Игрок вернулся в общую группу и может выйти на поле.', ref: { type: 'player', id: p.id } });
      }
    }
    if (p.fit < 100) p.fit = Math.min(100, p.fit + (p.inj ? 1 : 3.4));
  }
}

/** Advances the world by one day. */
export function advanceDay(L: League): DayReport {
  useState_(L.rng);
  const date = L.date;
  const report: DayReport = { date, games: [] };

  for (const lg of LEAGUE_IDS) {
    const c = L.comps[lg];
    if (c.phase === 'preseason' && date >= c.seasonStart) {
      c.phase = 'regular';
      if (lg === L.teams[L.user]?.lg) { L.phase = 'regular'; pushNews(L, { kind: 'league', title: `${LEAGUES[lg].name}: сезон ${L.season}/${String((L.season + 1) % 100).padStart(2, '0')} стартовал!`, important: true }); }
    }
  }

  const todays = L.games.filter((g) => g.day === date && !g.played);
  if (todays.length) {
    const byTeam = groupByTeam(L);
    const playing = new Set<string>();
    for (const g of todays) { playing.add(g.h); playing.add(g.a); }
    // Champions League guests: their squads are not in the club index.
    for (const id of playing) if (!byTeam.has(id)) byTeam.set(id, rosterOf(L, id));
    if (playing.has(L.user) && !prepareUserLineup(L, L.teams[L.user], byTeam.get(L.user) ?? [], date)) {
      L.rng = getState();
      report.blocked = true;
      return report;
    }
    // AI coaches keep their shape between matches and reconsider it once a week.
    for (const id of playing) if (id !== L.user) aiLineup(L, club(L, id), byTeam.get(id) ?? [], club(L, id).lineup.xi.length === 11 && dow(date) !== 6);
    for (const g of todays) {
      const box = playGame(L, g);
      report.games.push(g);
      if (g.h === L.user || g.a === L.user) report.userGame = { game: g, box };
    }
    for (const lg of LEAGUE_IDS) {
      const c = L.comps[lg];
      if (c.phase === 'regular' && !L.games.some((g) => g.comp === lg && !g.played)) {
        c.phase = 'done';
        endLeague(L, lg);
        if (lg === L.teams[L.user]?.lg) L.stops.push('season-end');
      }
    }
    if (PO_LEAGUES.every((lg) => !L.comps[lg] || L.comps[lg].phase === 'done') && L.cups.PO?.season !== L.season) initPlayoffs(L, L.season);
  }

  intlDaily(L);
  daily(L);

  if (dow(date) === 1) {
    weeklyMorale(L);
    updateStrategies(L);
    weeklyMarket(L);
    ensureSquads(L, (t, pos) => genPlayer(L, { team: t, role: pos === 'G' ? 'GK' : pos === 'D' ? 'CB' : pos === 'M' ? 'CM' : 'ST', age: 18, ovr: Math.max(45, Math.round(sortedTeams(L, t.lg).length ? 40 + t.rep * 0.25 : 50)) }));
  }
  if (date.slice(8) === '01') {
    updateValues(L);
    if (['03', '04', '05'].includes(date.slice(5, 7))) aiRenewals(L);
    autoRenew(L);
    if (date.slice(5, 7) === '03') {
      const exp = renewalCases(L).filter((c) => c.final);
      if (exp.length) {
        pushMsg(L, {
          from: 'Спортивный отдел', kind: 'staff', title: `Летом истекают контракты: ${exp.length}`,
          body: `Эти игроки уйдут бесплатно 20 июня, если не продлить контракт. Совет штаба:\n${exp.map((c) => `${dispName(c.p)} (${c.p.ovr}) — ${VERDICT_RU[c.verdict]}: ${c.short}`).join('\n')}`,
          ref: { type: 'screen', id: 'finance' },
        });
        L.stops.push('expiring');
      }
    }
  }
  for (const [a, b] of L.windows) {
    if (date === a) pushNews(L, { kind: 'league', title: 'Трансферное окно открыто', important: true });
    if (date === addDays(b, -3) && windowOpen(L)) pushMsg(L, { from: 'Спортивный отдел', kind: 'staff', title: 'Окно закрывается через три дня', body: 'После закрытия окна купить игрока у другого клуба нельзя — только свободные агенты.' });
    if (date === b) pushNews(L, { kind: 'league', title: 'Трансферное окно закрыто' });
  }
  if (date === rolloverDay(L.season)) rollover(L);

  L.date = addDays(date, 1);
  L.rng = getState();
  return report;
}

export function nextUserGame(L: League) {
  return L.games.filter((g) => !g.played && (g.h === L.user || g.a === L.user)).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
}
export const userGameToday = (L: League) => L.games.find((g) => g.day === L.date && !g.played && (g.h === L.user || g.a === L.user));
export const teamGames = (L: League, team: string) => L.games.filter((g) => g.h === team || g.a === team);
