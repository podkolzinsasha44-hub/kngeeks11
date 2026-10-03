// Transfer market: prices, bids, AI clubs buying and selling, free agents, loans.
// AI clubs follow the same rules as the user: budgets, wage limits, foreign-player limits, windows.
import { canRegister, interest, offerContract, signContract, startTalks, wageBill, wageFor, type TalkResult } from './contracts';
import { foreignLimit, isForeign, windowOpen } from './leagues';
import { FORMATIONS, autoLineup, available, slotRating, squad, touchSquads } from './lineup';
import { pushMsg, pushNews, social } from './news';
import { int, next, pick, shuffle } from './rng';
import type { League, Player, Team, TransferOffer } from './types';
import { addDays, ageOn, clamp, dispName, money } from './util';

const round = (v: number) => (v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 25_000) * 25_000);

/** Rank of the player inside his squad by rating (0 = the best). */
export function squadRank(L: League, p: Player) {
  if (!p.team) return 99;
  return squad(L, p.team).filter((x) => x.ovr > p.ovr).length;
}

/** What the owner club wants for the player from this buyer. */
export function askingPrice(L: League, p: Player, buyer: Team): number {
  const seller = p.team ? L.teams[p.team] : null;
  if (!seller) return round(p.val * 1.2);
  const rank = squadRank(L, p);
  let m = rank < 2 ? 1.9 : rank < 5 ? 1.55 : rank < 11 ? 1.3 : rank < 16 ? 1.08 : 0.92;
  const age = ageOn(p.bd, L.date);
  if (seller.strategy === 'contend' && rank < 11) m *= 1.1;
  if (seller.strategy === 'rebuild' && age >= 28) m *= 0.85;
  if (p.listed) m = Math.min(m, 1) * 0.82;
  if (p.wantsOut) m *= 0.85;
  if (age <= 21 && p.pot - p.ovr >= 8) m *= 1.2;
  if (seller.lg === buyer.lg && Math.abs(seller.rep - buyer.rep) < 8) m *= 1.12;
  // Richer buyers are asked for more.
  if (buyer.rep > seller.rep + 12) m *= 1.1;
  if (buyer.id === L.user) m *= L.settings.difficulty === 'rookie' ? 0.9 : L.settings.difficulty === 'hard' ? 1.12 : 1;
  if (buyer.id === L.user) m *= 1 + (50 - seller.rel) / 400;
  return round(p.val * m);
}

function record(L: League, p: Player, from: string | null, to: string, fee: number) {
  const user = to === L.user || from === L.user;
  const ratio = fee / Math.max(25_000, p.val);
  const grade = to === L.user ? (ratio < 0.8 ? 'A' : ratio < 1.1 ? 'B' : ratio < 1.5 ? 'C' : 'D') : from === L.user ? (ratio > 1.4 ? 'A' : ratio > 1.05 ? 'B' : ratio > 0.8 ? 'C' : 'D') : undefined;
  L.transfers.unshift({ id: L.nextMsgId++, date: L.date, season: L.season, player: p.id, name: dispName(p), from, to, fee, user, grade });
  if (L.transfers.length > 300) L.transfers.length = 300;
}

/** Moves the player and the money. The contract is signed separately (signContract). */
export function completeTransfer(L: League, p: Player, to: Team, fee: number, wage: number, years: number) {
  const from = p.team && !p.loan ? L.teams[p.team] : null;
  const fromName = from ? `«${from.ru}»` : p.ext ? p.ext : 'статус свободного агента';
  to.budget -= fee;
  if (from) from.budget += fee;
  if (from?.id === L.user) { L.seasonLog.sold++; L.seasonLog.earned += fee; }
  if (to.id === L.user) L.seasonLog.spent += fee;
  record(L, p, from?.id ?? null, to.id, fee);
  const oldTeam = from;
  signContract(L, p, to, wage, years);
  const big = fee >= 8e6 || p.ovr >= 82;
  if (big || to.id === L.user || from?.id === L.user || to.lg === L.teams[L.user]?.lg) {
    pushNews(L, { kind: 'transfer', title: `${dispName(p)}: ${fromName} → «${to.ru}»${fee ? ` за ${money(fee)}` : ' (свободный агент)'}`, team: to.id, players: [p.id], important: big && (to.id === L.user || from?.id === L.user) });
  }
  if (oldTeam && oldTeam.id !== L.user) autoLineup(L, oldTeam);
  if (to.id !== L.user) autoLineup(L, to);
}

// ----- the user buys ---------------------------------------------------------------------------

export interface BidResult { status: TransferOffer['status']; text: string; ask?: number }

/** The user bids for a player of another club (or of a club outside the simulated leagues). */
export function userBid(L: League, pid: number, fee: number): BidResult {
  const p = L.players[pid];
  const me = L.teams[L.user];
  const seller = p.team ? L.teams[p.team] : null;
  if (!windowOpen(L)) return { status: 'rejected', text: 'Трансферное окно закрыто. Вне окна можно подписывать только свободных агентов.' };
  if (fee > me.budget) return { status: 'rejected', text: `На трансферы осталось ${money(me.budget)}.` };
  if (p.loan) return { status: 'rejected', text: 'Игрок в аренде — переговоры возможны после её окончания.' };
  if (interest(L, p, me) < 0.35) return { status: 'rejected', text: `${dispName(p)} не рассматривает переход в «${me.ru}»: уровень клуба ниже его амбиций.` };
  const ask = askingPrice(L, p, me);
  const who = seller ? `«${seller.ru}»` : p.ext ?? 'Клуб';
  const off: TransferOffer = { id: L.nextMsgId++, date: L.date, player: pid, from: me.id, to: seller?.id ?? '', fee, status: 'pending', expires: addDays(L.date, 7) };
  L.offers = L.offers.filter((o) => !(o.player === pid && o.from === me.id));
  L.offers.push(off);
  if (fee >= ask) {
    off.status = 'accepted';
    startTalks(L, p, me.id, 'transfer', fee);
    return { status: 'accepted', text: `${who} принимает предложение ${money(fee)}. Теперь нужно договориться с игроком.` };
  }
  if (fee >= ask * 0.72) {
    off.status = 'countered';
    off.ask = ask;
    return { status: 'countered', ask, text: `${who}: «За ${money(ask)} договоримся».` };
  }
  off.status = 'rejected';
  if (seller) seller.rel = clamp(seller.rel - (fee < ask * 0.4 ? 4 : 1), 0, 100);
  return { status: 'rejected', text: `${who} отклоняет предложение: сумма слишком далека от оценки клуба.` };
}

/** Called when contract talks of a transfer end with a signature. */
export function finishUserTransfer(L: League, pid: number, wage: number, years: number) {
  const p = L.players[pid];
  const off = L.offers.find((o) => o.player === pid && o.from === L.user && o.status === 'accepted');
  const fee = off?.fee ?? 0;
  if (off) off.status = 'done';
  completeTransfer(L, p, L.teams[L.user], fee, wage, years);
  L.offers = L.offers.filter((o) => o !== off);
}

/** One round of contract talks; when the player agrees the deal is completed according to its kind. */
export function negotiate(L: League, pid: number, wage: number, years: number): TalkResult {
  const n = L.negotiations[pid];
  if (!n) return { status: 'broken', text: 'Переговоры не ведутся.' };
  const r = offerContract(L, n, wage, years);
  if (r.status !== 'signed') return r;
  const p = L.players[pid], t = L.teams[n.team];
  if (n.kind === 'extend') signContract(L, p, t, wage, years);
  else if (n.kind === 'transfer') finishUserTransfer(L, pid, wage, years);
  else completeTransfer(L, p, t, 0, wage, years);
  return { status: 'signed', text: `${dispName(p)} подписывает контракт: ${money(wage)} в год до лета ${p.c!.until} года.` };
}

// ----- AI clubs buy from the user --------------------------------------------------------------

function wouldStart(L: League, t: Team, p: Player) {
  const sq = squad(L, t.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const n = p.pos === 'G' ? 1 : p.pos === 'D' ? 4 : p.pos === 'M' ? 4 : 3;
  return sq.filter((x) => x.ovr >= p.ovr).length < n + 1;
}

function offersToUser(L: League) {
  const mine = squad(L, L.user).filter((p) => !p.loan);
  if (!mine.length) return;
  const clubs = shuffle(Object.values(L.teams).filter((t) => t.id !== L.user));
  let made = 0;
  for (const p of shuffle(mine)) {
    if (made >= 2) break;
    if (L.offers.some((o) => o.player === p.id && o.to === L.user && o.status === 'pending')) continue;
    const pr = p.listed ? 0.5 : p.wantsOut ? 0.3 : 0.035 + (p.ovr >= 76 ? 0.03 : 0);
    if (next() > pr) continue;
    const buyer = clubs.find((t) => t.budget >= p.val * 0.8 && wouldStart(L, t, p) && interest(L, p, t) >= 0.4 && !canRegister(L, t, p, wageFor(p.ovr, t.lg)));
    if (!buyer) continue;
    const fee = round(Math.min(buyer.budget, p.val * (p.listed ? 0.75 + next() * 0.3 : 0.9 + next() * 0.45)));
    const off: TransferOffer = { id: L.nextMsgId++, date: L.date, player: p.id, from: buyer.id, to: L.user, fee, status: 'pending', expires: addDays(L.date, 6) };
    L.offers.push(off);
    pushMsg(L, {
      from: `«${buyer.ru}»`, kind: 'transfer', title: `Предложение по игроку: ${dispName(p)}`,
      body: `«${buyer.ru}» предлагает ${money(fee)} за ${dispName(p)} (оценка рынка — ${money(p.val)}). Предложение действует до ${off.expires.slice(8)}.${off.expires.slice(5, 7)}.`,
      ref: { type: 'offer', id: off.id },
    });
    L.stops.push('offer');
    made++;
  }
}

/** The user answers an incoming bid. Countering asks for a higher fee. */
export function respondOffer(L: League, id: number, action: 'accept' | 'reject' | 'counter', amount?: number): string {
  const off = L.offers.find((o) => o.id === id);
  if (!off || off.status !== 'pending') return 'Предложение уже неактуально.';
  const p = L.players[off.player];
  const buyer = L.teams[off.from];
  if (action === 'reject') {
    off.status = 'rejected';
    L.offers = L.offers.filter((o) => o !== off);
    if (p.wantsOut) p.morale = clamp(p.morale - 6, 0, 100);
    return 'Предложение отклонено.';
  }
  if (action === 'counter' && amount) {
    const max = Math.min(buyer.budget, p.val * (1.25 + (buyer.rep - 50) / 200) * (wouldStart(L, buyer, p) ? 1.15 : 0.95));
    if (amount <= max) off.fee = round(amount);
    else {
      off.status = 'rejected';
      L.offers = L.offers.filter((o) => o !== off);
      return `«${buyer.ru}» отказывается платить ${money(amount)} и выходит из переговоров.`;
    }
  }
  off.status = 'done';
  L.offers = L.offers.filter((o) => o !== off);
  completeTransfer(L, p, buyer, off.fee, wageFor(p.ovr, buyer.lg), ageOn(p.bd, L.date) >= 31 ? 2 : 4);
  autoFixUserLineup(L);
  return `${dispName(p)} переходит в «${buyer.ru}» за ${money(off.fee)}.`;
}

/** After a sale the sold player is only removed from the user's line-up; nothing else is touched. */
export function autoFixUserLineup(L: League) {
  const t = L.teams[L.user];
  if (!t) return;
  const ok = (id: number) => L.players[id]?.team === t.id;
  t.lineup.bench = t.lineup.bench.filter(ok);
  if (t.lineup.auto) autoLineup(L, t);
}

// ----- AI clubs among themselves ---------------------------------------------------------------

function weakestSlot(L: League, t: Team) {
  const roles = FORMATIONS[t.lineup.form];
  let worst = -1, wv = 999;
  t.lineup.xi.forEach((id, i) => {
    const p = L.players[id];
    const v = p ? slotRating(p, roles[i]) : 0;
    if (v < wv) { wv = v; worst = i; }
  });
  return worst >= 0 ? { role: roles[worst], rating: wv } : null;
}

function aiDeals(L: League, pool: Player[]) {
  const clubs = shuffle(Object.values(L.teams).filter((t) => t.id !== L.user)).slice(0, 14);
  for (const t of clubs) {
    if (next() > 0.4) continue;
    const need = weakestSlot(L, t);
    if (!need) continue;
    let best: Player | null = null, bv = need.rating + 1.5, price = 0;
    for (let i = 0; i < 260; i++) {
      const p = pool[int(0, pool.length - 1)];
      if (!p || p.team === t.id || p.team === L.user || p.loan || p.st !== 'ACT' || p.joined === L.season) continue;
      const v = slotRating(p, need.role);
      if (v <= bv) continue;
      const ask = askingPrice(L, p, t);
      if (ask > t.budget || interest(L, p, t) < 0.5 || canRegister(L, t, p, wageFor(p.ovr, t.lg))) continue;
      // A selling club keeps a workable squad.
      if (p.team && squad(L, p.team).length <= 20) continue;
      best = p; bv = v; price = ask;
    }
    if (best) completeTransfer(L, best, t, price, wageFor(best.ovr, t.lg), ageOn(best.bd, L.date) >= 31 ? 2 : 4);
  }
}

/** Free agents find clubs: AI clubs sign those who strengthen the squad or fill a hole. */
function aiFreeAgents(L: League) {
  const fa: Player[] = [];
  for (const id in L.players) if (L.players[id].st === 'FA') fa.push(L.players[id]);
  if (!fa.length) return;
  fa.sort((a, b) => b.ovr - a.ovr);
  const clubs = shuffle(Object.values(L.teams).filter((t) => t.id !== L.user));
  for (const p of fa.slice(0, 40)) {
    if (L.negotiations[p.id]) continue;
    if (next() > 0.35) continue;
    const t = clubs.find((c) => {
      const sq = squad(L, c.id);
      const short = sq.length < 22 || sq.filter((x) => x.pos === p.pos).length < (p.pos === 'G' ? 2 : 5);
      return (short || wouldStart(L, c, p)) && interest(L, p, c) >= 0.45 && !canRegister(L, c, p, wageFor(p.ovr, c.lg));
    });
    if (t) completeTransfer(L, p, t, 0, wageFor(p.ovr, t.lg), ageOn(p.bd, L.date) >= 31 ? 1 : 2);
  }
}

/** Every AI club keeps enough bodies to field a team (injuries, sales). */
export function ensureSquads(L: League, genYouth: (t: Team, pos: Player['pos']) => Player) {
  for (const t of Object.values(L.teams)) {
    if (t.id === L.user) continue;
    const sq = squad(L, t.id).filter(available);
    const need: [Player['pos'], number][] = [['G', 2], ['D', 6], ['M', 6], ['F', 4]];
    for (const [pos, n] of need) {
      let have = sq.filter((p) => p.pos === pos).length;
      while (have < n) {
        let best: Player | null = null;
        for (const id in L.players) {
          const p = L.players[id];
          if (p.st === 'FA' && p.pos === pos && !p.inj && (!best || p.ovr > best.ovr) && !canRegister(L, t, p, wageFor(p.ovr, t.lg))) best = p;
        }
        if (best) completeTransfer(L, best, t, 0, wageFor(best.ovr, t.lg), 1);
        else genYouth(t, pos);
        have++;
      }
    }
  }
}

export function weeklyMarket(L: League) {
  // Expired bids
  L.offers = L.offers.filter((o) => {
    if (o.expires >= L.date) return true;
    if (o.to === L.user && o.status === 'pending') pushMsg(L, { from: `«${L.teams[o.from].ru}»`, kind: 'transfer', title: 'Предложение отозвано', body: `Срок предложения по игроку ${dispName(L.players[o.player])} истёк.` });
    return false;
  });
  aiFreeAgents(L);
  if (!windowOpen(L)) return;
  const pool = Object.values(L.players).filter((p) => p.st === 'ACT' && (p.team || p.ext) && p.ovr >= 60);
  aiDeals(L, pool);
  if (L.user) offersToUser(L);
  // Rumours for the feed
  if (next() < 0.3) {
    const p = pick(pool.filter((x) => x.team && x.ovr >= 74 && L.teams[x.team].lg === L.teams[L.user]?.lg));
    if (p) social(L, `По моей информации, ${dispName(p)} может сменить клуб уже в это окно. Интерес есть`, { kind: 'insider', players: [p.id], team: p.team ?? undefined });
  }
}

/** Loans end on June 30: players go back to the owner. */
export function returnLoans(L: League) {
  for (const id in L.players) {
    const p = L.players[id];
    if (!p.loan || p.loan.until > L.season + 1) continue;
    const owner = p.loan.from ? L.teams[p.loan.from] : null;
    const was = p.team;
    p.loan = undefined;
    touchSquads();
    if (owner) { p.team = owner.id; if (!p.teams.includes(owner.id)) p.teams.push(owner.id); }
    else { p.team = null; if (!p.ext) p.st = 'FA'; }
    if (was === L.user) pushMsg(L, { from: 'Спортивный отдел', kind: 'staff', title: `Аренда завершена: ${dispName(p)}`, body: `Игрок вернулся в ${owner ? `«${owner.ru}»` : p.ext ?? 'свой клуб'}.` });
  }
}

/** The user releases a player: half of the remaining wages is paid from the budget. */
export function releasePlayer(L: League, p: Player) {
  const t = L.teams[L.user];
  const left = p.c ? Math.max(0, p.c.until - (L.season + 1)) + 0.5 : 0;
  const cost = Math.round(((p.c?.wage ?? 0) * left * 0.5) / 5000) * 5000;
  t.budget -= cost;
  p.team = null; p.c = null; p.st = 'FA'; p.listed = false; p.wantsOut = false;
  touchSquads();
  pushNews(L, { kind: 'sign', title: `«${t.ru}» расторгает контракт с игроком ${dispName(p)}`, team: t.id, players: [p.id] });
  autoFixUserLineup(L);
  return cost;
}

export const foreignLeft = (L: League, t: Team) => {
  const lim = foreignLimit(t.lg, L.season);
  return lim ? lim[0] - squad(L, t.id).filter((p) => isForeign(p, t.country)).length : null;
};
export { wageBill };
