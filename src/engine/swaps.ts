// Player swaps between the user's club and another club, with money either way or none. Players move with the
// contracts they have. The other club weighs what it gives (its asking price — the same as for a sale) against what
// it gets: a player it would start is worth his market value to it, one it does not need much less. No randomness in
// the answer: the same offer gets the same reply.
import { foreignLimit, isForeign, windowOpen } from './leagues';
import { autoLineup, squad, touchSquads } from './lineup';
import { interest, wageBill } from './contracts';
import { pushNews } from './news';
import { askingPrice, autoFixUserLineup, record, saleBlock, squadRank, wouldStart } from './transfers';
import type { League, Player, Team } from './types';
import { ageOn, dispName, money, roundMoney } from './util';
import { isYouth, youthPlayer } from './youth';

/** How much a club values one of the user's players it would receive in a swap. */
export function swapWorth(L: League, club: Team, p: Player): number {
  let w = p.val * (wouldStart(L, club, p) ? 1 : 0.6);
  if (ageOn(p.bd, L.date) >= 31) w *= 0.85;
  return roundMoney(w);
}

export interface SwapReply {
  status: 'accepted' | 'countered' | 'rejected';
  text: string;
  /** Countered: how much more money the user must add (or ask for less) for the club to agree. */
  need?: number;
}

/** Why the players cannot change clubs this way (squad rules, wages, money), or null. */
function swapBlock(L: League, club: Team, toUser: Player[], fromUser: Player[], userPays: number): string | null {
  const me = L.teams[L.user];
  if (userPays > me.budget) return `На трансферы осталось ${money(me.budget)}`;
  if (-userPays > club.budget) return `У «${club.ru}» нет таких денег на доплату (бюджет ${money(club.budget)})`;
  const net = (t: Team, inn: Player[], out: Player[]) => wageBill(L, t.id) + inn.reduce((s, p) => s + (p.c?.wage ?? 0), 0) - out.reduce((s, p) => s + (p.c?.wage ?? 0), 0);
  if (net(me, toUser, fromUser) > me.wageBudget * 1.02) return `Зарплаты не помещаются в лимит (${money(me.wageBudget)} в год): поднимите его в «Финансах» или отдайте игрока с большей зарплатой`;
  if (net(club, fromUser, toUser) > Math.max(club.wageBudget * 1.02, wageBill(L, club.id))) return `«${club.ru}» не потянет зарплаты: отдайте игрока с меньшей зарплатой`;
  for (const [t, inn, out] of [[me, toUser, fromUser], [club, fromUser, toUser]] as const) {
    const lim = foreignLimit(L, t.lg);
    if (!lim) continue;
    const f = squad(L, t.id).filter((p) => isForeign(p, t.country)).length + inn.filter((p) => isForeign(p, t.country)).length - out.filter((p) => isForeign(p, t.country)).length;
    if (f > lim[0]) return `${t.id === L.user ? 'У вас' : `У «${t.ru}»`} не хватит мест для легионеров (не больше ${lim[0]} в заявке)`;
  }
  return null;
}

/** Players and money change clubs. `userPays` > 0: the user adds money; < 0: the other club does. */
export function doSwap(L: League, club: Team, toUser: Player[], fromUser: Player[], userPays: number) {
  const me = L.teams[L.user];
  me.budget -= userPays;
  club.budget += userPays;
  if (userPays > 0) L.seasonLog.spent += userPays; else L.seasonLog.earned -= userPays;
  const given = fromUser.map(dispName).join(', ');
  const value = (list: Player[]) => list.reduce((s, p) => s + p.val, 0);
  for (const p of toUser) {
    record(L, p, club.id, me.id, Math.max(0, roundMoney(value(fromUser) / toUser.length + userPays / toUser.length)));
    p.team = me.id; p.listed = false; p.wantsOut = false; p.joined = L.season;
    p.bought = { fee: Math.max(0, userPays), date: L.date, from: `${club.ru} (обмен на ${given})` };
    if (!p.teams.includes(me.id)) p.teams.push(me.id);
  }
  for (const p of fromUser) {
    record(L, p, me.id, club.id, roundMoney(p.val));
    p.team = club.id; p.listed = false; p.wantsOut = false; p.joined = L.season;
    delete p.bought;
    if (!p.teams.includes(club.id)) p.teams.push(club.id);
  }
  const moved = new Set([...toUser, ...fromUser].map((p) => p.id));
  L.offers = L.offers.filter((o) => !moved.has(o.player));
  for (const id of moved) delete L.negotiations[id];
  touchSquads();
  autoFixUserLineup(L);
  autoLineup(L, club);
  const cash = userPays > 0 ? ` + ${money(userPays)} от «${me.ru}»` : userPays < 0 ? ` + ${money(-userPays)} от «${club.ru}»` : '';
  pushNews(L, { kind: 'transfer', title: `Обмен: ${toUser.map(dispName).join(', ')} → «${me.ru}», ${given} → «${club.ru}»${cash}`, team: me.id, players: [...moved], important: true });
}

/**
 * The user offers his players (and money, either way) for a player of another club. The club answers at once:
 * yes, "add this much", or no.
 */
export function proposeSwap(L: League, targetId: number, giveIds: number[], userPays: number): SwapReply {
  const me = L.teams[L.user];
  const target = L.players[targetId];
  const club = target?.team ? L.teams[target.team] : null;
  if (!target || !club || target.team === L.user) return { status: 'rejected', text: 'Обменяться можно только с клубом из лиг игры.' };
  if (isYouth(me) || youthPlayer(L, target)) return { status: 'rejected', text: 'Юношеские команды в обменах не участвуют.' };
  if (!windowOpen(L)) return { status: 'rejected', text: 'Трансферное окно закрыто: обмены — с 20 июня по 10 сентября и с 20 января по 20 февраля.' };
  if (target.loan) return { status: 'rejected', text: `${dispName(target)} в аренде — его нельзя обменять.` };
  const give = giveIds.map((id) => L.players[id]).filter((p) => p && p.team === L.user && !p.loan);
  if (!give.length) return { status: 'rejected', text: 'Выберите хотя бы одного своего игрока.' };
  for (const p of give) { const b = saleBlock(p); if (b) return { status: 'rejected', text: `${dispName(p)}: ${b.toLowerCase()}.` }; }
  if (interest(L, target, me) < 0.35) return { status: 'rejected', text: `${dispName(target)} не рассматривает переход в «${me.ru}».` };
  const unwilling = give.find((p) => interest(L, p, club) < 0.2);
  if (unwilling) return { status: 'rejected', text: `${dispName(unwilling)} не хочет переходить в «${club.ru}».` };
  const block = swapBlock(L, club, [target], give, userPays);
  if (block) return { status: 'rejected', text: block };
  const ask = askingPrice(L, target, me);
  const got = give.reduce((s, p) => s + swapWorth(L, club, p), 0) + userPays;
  const who = `«${club.ru}»`;
  if (got >= ask * 0.97) {
    doSwap(L, club, [target], give, userPays);
    return { status: 'accepted', text: `${who} согласен: ${dispName(target)} переходит к вам${userPays > 0 ? ` с вашей доплатой ${money(userPays)}` : userPays < 0 ? `, а ${who} доплачивает вам ${money(-userPays)}` : ''}.` };
  }
  const need = roundMoney(ask - got + 1);
  // Far apart: the club does not bother; close enough: it names the difference.
  if (got < ask * 0.5) return { status: 'rejected', text: `${who} отказывается: такой обмен ему невыгоден (за ${dispName(target)} клуб хочет около ${money(ask)}).` };
  return { status: 'countered', need, text: `${who}: «${userPays < 0 ? `Доплатим меньше — на ${money(need)}` : `Добавьте ${money(need)}`}, и по рукам».` };
}

/**
 * A swap the other club offers for one of the user's players: one of its own players of a similar value who is not
 * a key man for it, and money for the difference — either way. Null when it has nobody suitable.
 */
export function swapFor(L: League, club: Team, p: Player, fee: number): { give: number[]; cash: number } | null {
  const pool = squad(L, club.id).filter((q) => !q.loan && !saleBlock(q) && squadRank(L, q) >= 4 && q.val >= fee * 0.4 && q.val <= fee * 1.6);
  if (!pool.length) return null;
  const q = pool.sort((a, b) => Math.abs(a.val - p.val) - Math.abs(b.val - p.val))[0];
  const cash = roundMoney(fee - q.val);
  if (cash > club.budget) return null;
  return { give: [q.id], cash };
}

/** The user accepts a swap offered by another club (`TransferOffer.swap`). */
export function acceptSwapOffer(L: League, club: Team, mine: Player, swap: { give: number[]; cash: number }): string | null {
  const theirs = swap.give.map((id) => L.players[id]).filter((q) => q && q.team === club.id);
  if (theirs.length !== swap.give.length) return 'Игрок «' + club.ru + '» уже не в клубе: обмен не состоится.';
  const block = saleBlock(mine) ?? swapBlock(L, club, theirs, [mine], -swap.cash);
  if (block) return block;
  doSwap(L, club, theirs, [mine], -swap.cash);
  return null;
}

export const swapCashText = (club: Team, cash: number) => (cash > 0 ? `«${club.ru}» доплачивает вам ${money(cash)}` : cash < 0 ? `вы доплачиваете ${money(-cash)}` : 'без доплаты');
