// Money: market value, wages, contract talks.
import { LEAGUES, foreignLimit, isForeign } from './leagues';
import { squad, touchSquads } from './lineup';
import { pushNews } from './news';
import { next } from './rng';
import type { League, LeagueId, Negotiation, Player, Team } from './types';
import { ageOn, clamp, dispName, MIN_VALUE, money, roundMoney } from './util';

/** Yearly wage a player of this level earns in a league (model: real wages are not public). */
export function wageFor(ovr: number, lg: LeagueId | null) {
  const mul = lg ? LEAGUES[lg].wageMul : 0.7;
  return Math.max(1000, roundMoney(20_000 * Math.exp((ovr - 55) * 0.185) * mul));
}

const ageAdj = (a: number) => (a < 23 ? -0.9 * Math.min(5, 23 - a) : a > 28 ? Math.min(7, a - 28) : 0);

/** Market value implied by rating, age, potential, contract length (same curve the data build inverts) and the
 *  league of his club (`market`: the Second League pays several times less for the same level). */
export function modelValue(p: Player, date: string, lg?: LeagueId | null) {
  const a = ageOn(p.bd, date);
  let lvl = p.ovr - ageAdj(a) - (p.pos === 'G' ? 2 : 0);
  if (a <= 24) lvl += 0.3 * Math.max(0, p.pot - p.ovr);
  if (a >= 33) lvl -= (a - 32) * 1.5;
  let v = lvl <= 78 ? 1e5 * Math.pow(10, (lvl - 58) / 10) : 1e7 * Math.pow(10, (lvl - 78) / 13);
  if (p.c) {
    const left = p.c.until - Number(date.slice(0, 4)) - (date.slice(5) > '06-30' ? 1 : 0);
    if (left <= 0) v *= 0.55; else if (left === 1) v *= 0.8;
  }
  v *= (lg && LEAGUES[lg].market) ?? 1;
  return Math.max(MIN_VALUE, roundMoney(v));
}

/** Monthly drift of the market value towards what the player is worth now. */
export function updateValues(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    const m = modelValue(p, L.date, p.team ? L.teams[p.team]?.lg : null);
    p.val = Math.max(MIN_VALUE, roundMoney(p.val + (m - p.val) * 0.18));
  }
}

export const wageBill = (L: League, teamId: string) => squad(L, teamId).reduce((s, p) => s + (p.loan ? 0 : p.c?.wage ?? 0), 0);

export function foreignCount(L: League, t: Team) {
  return squad(L, t.id).filter((p) => isForeign(p, t.country)).length;
}

/**
 * Can the club register this player? Returns the reason when it cannot.
 * The 40-place squad limit stops free agents only: a transfer may take a club over it (house rule, as in NHL GM).
 */
export function canRegister(L: League, t: Team, p: Player, wage: number, transfer = false): string | null {
  const sq = squad(L, t.id);
  if (!transfer && sq.length >= 40) return 'В заявке уже 40 игроков — сначала освободите место';
  const lim = foreignLimit(t.lg, L.season);
  if (lim && isForeign(p, t.country) && sq.filter((x) => isForeign(x, t.country)).length >= lim[0]) return `Лимит на легионеров: не больше ${lim[0]} в заявке`;
  if (wageBill(L, t.id) + wage > t.wageBudget * 1.02) return `Зарплатный бюджет исчерпан (${money(t.wageBudget)} в год)`;
  return null;
}

/** How much a player wants to join a club: 0..1+. Below ~0.35 he refuses to talk. */
export function interest(L: League, p: Player, to: Team) {
  // Youth teams are outside the market: adults do not join them and their boys are not for sale.
  if (to.lg === 'U17' || (p.team && L.teams[p.team]?.lg === 'U17')) return 0;
  const cur = p.team ? L.teams[p.team] : null;
  // Without a club the level of the player himself sets his standards: a free agent of 78 does not go
  // to the fourth division, one of 58 is glad to.
  const repNow = cur ? cur.rep : p.ext ? clamp(40 + (p.ovr - 65) * 2.2, 30, 92) : clamp(36 + (p.ovr - 65) * 2.2, 15, 90);
  const sq = squad(L, to.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const starters = p.pos === 'G' ? 1 : p.pos === 'D' ? 4 : p.pos === 'M' ? 4 : 3;
  const rank = sq.filter((x) => x.ovr > p.ovr).length;
  const role = rank < starters ? 0.2 : rank < starters * 2 ? 0 : -0.25;
  const home = p.ctry === to.country ? 0.12 : 0;
  // A player far above the level of the club is not interested; a step up is attractive.
  const level = clamp((to.rep - repNow) / 40, -1, 0.45);
  const need = p.st === 'FA' ? 0.3 : p.wantsOut || p.listed ? 0.15 : 0;
  // A free agent clearly better than the whole team waits for an offer of his level.
  const top = sq.length ? squad(L, to.id).map((x) => x.ovr).sort((x, y) => y - x).slice(0, 11) : [];
  const above = top.length ? p.ovr - top.reduce((s, o) => s + o, 0) / top.length : 0;
  const tooGood = p.st === 'FA' ? clamp((above - 5) * 0.08, 0, 0.8) : 0;
  return 0.5 + level + role + home + need - tooGood + (p.pers.win - 10) * (to.strategy === 'contend' ? 0.012 : -0.008);
}

/** Contract length the player wants: veterans a short deal, talents a long one. */
export const talkYears = (age: number) => (age >= 33 ? 1 : age >= 30 ? 2 : age <= 22 ? 4 : 3);

/** How keen the player is on these talks: interest in the club, or loyalty and mood for an extension. */
export const talksWill = (L: League, p: Player, t: Team, kind: Negotiation['kind']) =>
  kind === 'extend' ? 0.75 + (p.morale - 60) / 200 + (p.pers.loy - 10) * 0.012 : interest(L, p, t);

/** The yearly wage the player opens the talks with (the same number startTalks puts on the table). */
export function askingWage(L: League, p: Player, t: Team, kind: Negotiation['kind']): number {
  const a = ageOn(p.bd, L.date);
  const base = wageFor(p.ovr, t.lg);
  const cur = p.c?.wage ?? 0;
  const i = talksWill(L, p, t, kind);
  // The less he wants the move, the more it costs; young talents price in their potential.
  let ask = Math.max(base, cur * (kind === 'extend' ? 1.05 : 1.15)) * (1 + (p.pers.greed - 10) * 0.015) * (1 + clamp(0.75 - i, -0.1, 0.5));
  if (a <= 23) ask *= 1 + clamp((p.pot - p.ovr) * 0.02, 0, 0.3);
  const diff = L.settings.difficulty === 'rookie' ? 0.92 : L.settings.difficulty === 'hard' ? 1.08 : 1;
  return roundMoney(ask * diff);
}

export function startTalks(L: League, p: Player, teamId: string, kind: Negotiation['kind'], fee?: number): Negotiation {
  const t = L.teams[teamId];
  const a = ageOn(p.bd, L.date);
  const i = talksWill(L, p, t, kind);
  const ask = askingWage(L, p, t, kind);
  const years = talkYears(a);
  const n: Negotiation = {
    player: p.id, team: teamId, ask: { wage: ask, years }, floor: roundMoney(ask * (0.84 + (p.pers.loy - 10) * (kind === 'extend' ? -0.006 : 0))),
    patience: clamp(Math.round(55 + (p.pers.prof - 10) * 2 + (i - 0.5) * 40), 20, 100), rounds: 0, history: [], status: 'open', kind, fee,
  };
  L.negotiations[p.id] = n;
  return n;
}

export type TalkResult = { status: 'signed' | 'counter' | 'broken'; text: string };

/** One round of talks: the user's offer against the player's ask and hidden minimum. */
export function offerContract(L: League, n: Negotiation, wage: number, years: number): TalkResult {
  const p = L.players[n.player];
  const t = L.teams[n.team];
  const a = ageOn(p.bd, L.date);
  n.rounds++;
  // Contract length the player prefers: veterans want security, talents want a shorter deal.
  const want = n.ask.years;
  const lenPenalty = Math.abs(years - want) * (a >= 30 && years < want ? 0.04 : a <= 23 && years > want ? 0.035 : 0.015);
  const eff = wage * (1 - lenPenalty);
  const block = n.kind === 'extend' ? null : canRegister(L, t, p, wage, n.kind === 'transfer');
  if (block) {
    n.history.push({ wage, years, result: block });
    return { status: 'counter', text: block };
  }
  if (eff >= n.ask.wage || (eff >= n.floor && next() < (eff - n.floor) / Math.max(1, n.ask.wage - n.floor) + 0.15)) {
    n.status = 'signed';
    n.history.push({ wage, years, result: 'Согласен' });
    // The caller completes the deal (extension, free agent or transfer): see transfers.negotiate().
    return { status: 'signed', text: '' };
  }
  if (eff < n.floor) {
    n.patience -= Math.round(12 + ((n.floor - eff) / n.floor) * 90);
    if (n.patience <= 0) {
      n.status = 'broken';
      p.talksBlockedUntil = `${L.season + (L.date.slice(5) > '06-30' ? 1 : 0)}-${L.date.slice(5) > '06-30' ? '01-01' : '06-20'}`;
      if (n.kind === 'extend') p.morale = clamp(p.morale - 8, 0, 100);
      n.history.push({ wage, years, result: 'Переговоры сорваны' });
      return { status: 'broken', text: 'Агент прерывает переговоры: предложение слишком далеко от ожиданий.' };
    }
  } else n.patience -= 6;
  // Counter: the ask comes down a little every round.
  n.ask.wage = Math.max(n.floor, roundMoney(n.ask.wage - (n.ask.wage - n.floor) * 0.22));
  n.history.push({ wage, years, result: `Встречное: ${money(n.ask.wage)} × ${n.ask.years}` });
  return { status: 'counter', text: `Агент: «Мы рассчитываем на ${money(n.ask.wage)} в год на ${n.ask.years} ${n.ask.years === 1 ? 'год' : n.ask.years < 5 ? 'года' : 'лет'}».` };
}

/** Morale boost of a player who has just joined a new club. */
export const JOIN_MORALE = 10;

export function signContract(L: League, p: Player, t: Team, wage: number, years: number) {
  const fresh = p.team !== t.id || !!p.loan;
  // A season runs from July to June; `until` is the year the deal ends on June 30.
  const endYear = L.season + 1;
  // An extension is a new deal for `years` seasons after the current one (never shorter than the old deal).
  const until = fresh ? endYear + years - (L.date < `${L.season}-10-01` ? 1 : 0) : Math.max(p.c?.until ?? 0, endYear + years);
  p.c = { wage, until, signed: L.season };
  p.wantsOut = false;
  p.listed = false;
  if (fresh) {
    touchSquads();
    p.team = t.id;
    p.ext = undefined;
    p.st = 'ACT';
    p.loan = undefined;
    p.joined = L.season;
    p.morale = clamp(p.morale + JOIN_MORALE, 0, 100);
    if (!p.teams.includes(t.id)) p.teams.push(t.id);
    if (p.num != null && squad(L, t.id).some((x) => x.id !== p.id && x.num === p.num)) p.num = freeNumber(L, t.id);
    if (t.id === L.user) { L.seasonLog.bought++; if (!L.album.includes(p.id)) L.album.push(p.id); }
  } else {
    p.morale = clamp(p.morale + 6, 0, 100);
    if (t.id === L.user) pushNews(L, { kind: 'sign', title: `${dispName(p)} продлевает контракт с клубом «${t.ru}» до ${p.c.until} года`, team: t.id, players: [p.id] });
  }
  delete L.negotiations[p.id];
}

export function freeNumber(L: League, teamId: string) {
  const used = new Set(squad(L, teamId).map((p) => p.num));
  for (let n = 2; n < 100; n++) if (!used.has(n)) return n;
  return null;
}

/** Years left on the contract counted in seasons (0 = ends this summer). */
export function yearsLeft(L: League, p: Player) {
  if (!p.c) return 0;
  return Math.max(0, p.c.until - (L.season + 1));
}
