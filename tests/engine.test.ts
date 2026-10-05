import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { foreignLimit, isForeign, LEAGUES } from '../src/engine/leagues';
import { FORMATIONS, lineupValid, squad, teamPower, touchSquads } from '../src/engine/lineup';
import { simulateMatch } from '../src/engine/match';
import { gameOdds, quickOdds, ratingOf, sideOf } from '../src/engine/projection';
import { seedState, useState_ } from '../src/engine/rng';
import { advanceDay, lastUserBox, nextUserGame } from '../src/engine/season';
import { negotiate, userBid } from '../src/engine/transfers';
import { canRegister, interest, startTalks } from '../src/engine/contracts';
import { dealFor, transferAdvice } from '../src/engine/advice';
import { aiLineup, foreignOnPitch } from '../src/engine/ai';
import { lineupOptions } from '../src/engine/bestxi';
import { autoRenew, renewalCases } from '../src/engine/renewals';
import { offerView, saleView, sellAdvice } from '../src/engine/sale';
import { buyerCeiling, purchaseOf, respondOffer } from '../src/engine/transfers';
import { modelValue, wageBill, wageFor } from '../src/engine/contracts';
import type { League } from '../src/engine/types';
import { newCareer, upgradeSave, type WorldJson } from '../src/engine/world';
import { editYouthPlayer } from '../src/engine/youth';
import { initPlayoffs } from '../src/engine/cup';
import { rollover } from '../src/engine/offseason';
import { sortedTeams } from '../src/engine/standings';
import { club, drawLeague, makePots, matchdays, rosterOf, uclOrder, UCL } from '../src/engine/ucl';

// These tests play real days of the season: a slower runner must not fail them on the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

let world: WorldJson;
beforeAll(() => {
  world = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'world.json'), 'utf8'));
});
const career = (team = 'SPA', seed = 7) => newCareer(world, { team, gmName: 'Test', seed });
function playUntilUserGame(L: League) {
  for (let i = 0; i < 60; i++) {
    const r = advanceDay(L);
    if (r.userGame || r.blocked) return r;
  }
  throw new Error('no user game in 60 days');
}

describe('data', () => {
  it('every player at the start is a real person with a club, a contract and sane ratings', () => {
    expect(world.players.length).toBeGreaterThan(6000);
    for (const p of world.players) {
      expect(p.o).toBeGreaterThanOrEqual(40);
      expect(p.o).toBeLessThanOrEqual(97);
      expect(p.p).toBeGreaterThanOrEqual(p.o);
      expect(p.bd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const L = career();
    // The youth league ships no players (they are minors): its placeholders are marked and editable.
    expect(Object.values(L.players).every((p) => p.real || (p.custom && L.teams[p.team!]?.lg === 'U17'))).toBe(true);
    const youth = new Set(world.leagues.U17.teams);
    expect(world.players.some((p) => p.t && youth.has(p.t))).toBe(false);
  });
  it('has the sixteen clubs of the 2026-27 Premier League, each with a playable squad', () => {
    expect(world.leagues.RPL.teams).toHaveLength(16);
    expect(world.leagues.RPL.teams).toEqual(expect.arrayContaining(['ZEN', 'SPA', 'CSK', 'KRA', 'ROD', 'FAK']));
    const L = career();
    for (const id of world.leagues.RPL.teams) {
      const sq = squad(L, id);
      expect(sq.length).toBeGreaterThanOrEqual(20);
      expect(sq.filter((p) => p.pos === 'G').length).toBeGreaterThanOrEqual(2);
      const lim = foreignLimit('RPL', L.season)!;
      expect(sq.filter((p) => isForeign(p, 'RUS')).length).toBeLessThanOrEqual(lim[0]);
    }
  });
});

describe('the team the user picks is the team that plays', () => {
  it('a manual line-up is used exactly as set', () => {
    const L = career();
    const t = L.teams.SPA;
    expect(t.lineup.auto).toBe(false);
    // Deliberately odd choices: the weakest outfield reserve starts instead of the best striker.
    const roles = FORMATIONS[t.lineup.form];
    const st = roles.lastIndexOf('ST');
    const reserve = squad(L, 'SPA').filter((p) => p.pos !== 'G' && !t.lineup.xi.includes(p.id)).sort((a, b) => a.ovr - b.ovr)[0];
    t.lineup.xi[st] = reserve.id;
    t.lineup.bench = t.lineup.bench.filter((id) => id !== reserve.id);
    const picked = [...t.lineup.xi];
    const r = playUntilUserGame(L);
    expect(r.blocked).toBeFalsy();
    const starters = r.userGame!.box.players.filter((p) => p.started && p.p.team === 'SPA').map((p) => p.id);
    expect(starters.sort()).toEqual([...picked].sort());
    expect(L.teams.SPA.lineup.xi).toEqual(picked);
    // Substitutes come only from the bench the user named.
    const subs = r.userGame!.box.players.filter((p) => !p.started && p.p.team === 'SPA').map((p) => p.id);
    for (const id of subs) expect(t.lineup.bench).toContain(id);
    expect(lastUserBox?.game.id).toBe(r.userGame!.game.id);
  });

  it('an unavailable starter stops the game day instead of silently changing the team', () => {
    const L = career();
    const t = L.teams.SPA;
    const picked = [...t.lineup.xi];
    const day = nextUserGame(L)!.day;
    while (L.date < day) advanceDay(L);
    const hurt = L.players[picked[5]];
    hurt.inj = { type: 'test', days: 20, total: 20 };
    expect(lineupValid(L, t)).toBe(false);
    const r = advanceDay(L);
    expect(r.blocked).toBe(true);
    expect(L.date).toBe(day);
    expect(L.stops).toContain('lineup');
    expect(t.lineup.xi).toEqual(picked);
    // Continuing without a fix replaces only the injured player.
    const r2 = advanceDay(L);
    expect(r2.blocked).toBeFalsy();
    const now = L.teams.SPA.lineup.xi;
    expect(now.filter((id, i) => id !== picked[i])).toHaveLength(1);
    expect(now).not.toContain(hurt.id);
  });
});

describe('odds follow the players on the pitch', () => {
  it('a weaker eleven means lower chances, in the odds and in the engine alike', () => {
    const L = career();
    const g = nextUserGame(L)!;
    const before = gameOdds(L, g.h, g.a, g.comp, 600);
    const mineBefore = g.h === 'SPA' ? before.h : before.a;
    const t = L.teams.SPA;
    const powerBefore = teamPower(L, t);
    // Replace the six best outfield starters with the weakest reserves.
    const reserves = squad(L, 'SPA').filter((p) => p.pos !== 'G' && !t.lineup.xi.includes(p.id)).sort((a, b) => a.ovr - b.ovr);
    const order = t.lineup.xi.map((id, i) => ({ id, i })).filter((x) => L.players[x.id].pos !== 'G').sort((a, b) => L.players[b.id].ovr - L.players[a.id].ovr);
    order.slice(0, Math.min(6, reserves.length)).forEach((x, k) => { t.lineup.xi[x.i] = reserves[k].id; });
    expect(teamPower(L, t)).toBeLessThan(powerBefore - 2);
    const after = gameOdds(L, g.h, g.a, g.comp, 600);
    const mineAfter = g.h === 'SPA' ? after.h : after.a;
    expect(mineAfter).toBeLessThan(mineBefore - 0.06);
  });

  it('the analytic formula used for season forecasts agrees with the engine', () => {
    const L = career();
    let err = 0, n = 0;
    for (const g of L.games.filter((x) => x.comp === 'RPL' && Number(x.rd) <= 2)) {
      const mc = gameOdds(L, g.h, g.a, g.comp, 800);
      const q = quickOdds(ratingOf(L, L.teams[g.h]), ratingOf(L, L.teams[g.a]), LEAGUES.RPL.style);
      err += Math.abs(mc.h - q.h) + Math.abs(mc.d - q.d) + Math.abs(mc.a - q.a);
      n += 3;
    }
    expect(err / n).toBeLessThan(0.04);
  });
});

describe('fair play', () => {
  it('the match engine has no notion of the user', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'match.ts'), 'utf8');
    expect(src).not.toMatch(/\buser\b|isUser|L\.user/);
    expect(src).not.toMatch(/Math\.random/);
  });
  it('no Math.random anywhere in the engine except choosing the seed of a new career', () => {
    const dir = path.join(__dirname, '..', 'src', 'engine');
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const hits = (src.match(/Math\.random/g) ?? []).length;
      expect(hits, f).toBe(f === 'world.ts' ? 1 : 0);
    }
  });
  it('swapping home and away sides gives mirrored results', () => {
    const L = career();
    const a = sideOf(L.teams.ZEN), b = sideOf(L.teams.FAK);
    let w1 = 0, w2 = 0;
    useState_(seedState(1));
    for (let i = 0; i < 800; i++) { const r = simulateMatch(L.players, a, b, { neutral: true }).result; if (r.hs > r.as) w1++; }
    useState_(seedState(2));
    for (let i = 0; i < 800; i++) { const r = simulateMatch(L.players, b, a, { neutral: true }).result; if (r.as > r.hs) w2++; }
    expect(Math.abs(w1 - w2) / 800).toBeLessThan(0.07);
    expect(w1 / 800).toBeGreaterThan(0.55);
  });
  it('the same seed and the same decisions give the same season', () => {
    const run = () => { const L = career('KRA', 99); L.teams.KRA.lineup.auto = true; for (let i = 0; i < 70; i++) advanceDay(L); return L.games.filter((g) => g.played).map((g) => `${g.id}:${g.hs}-${g.as}`).join(','); };
    expect(run()).toBe(run());
  });
});

describe('market', () => {
  it('a transfer moves the player, the money and keeps the squad rules', () => {
    const L = career('ZEN');
    const me = L.teams.ZEN;
    me.budget = 60e6;
    me.wageBudget *= 2;
    const target = squad(L, 'ROS').filter((p) => !isForeign(p, 'RUS')).sort((a, b) => b.ovr - a.ovr)[3];
    const from = L.teams.ROS.budget;
    let res = userBid(L, target.id, 1000);
    expect(res.status).toBe('rejected');
    res = userBid(L, target.id, Math.min(me.budget, target.val * 3));
    expect(res.status).toBe('accepted');
    const n = L.negotiations[target.id];
    expect(n.kind).toBe('transfer');
    const r = negotiate(L, target.id, n.ask.wage, n.ask.years);
    expect(r.status).toBe('signed');
    expect(target.team).toBe('ZEN');
    expect(L.teams.ROS.budget).toBeGreaterThan(from);
    expect(me.budget).toBeLessThan(60e6);
    expect(L.transfers[0].player).toBe(target.id);
  });
  it('a full squad of 40 does not block a transfer, but does block a free agent', () => {
    const L = career('ZEN');
    const me = L.teams.ZEN;
    me.budget = 200e6;
    me.wageBudget *= 4;
    const filler = Object.values(L.players).filter((p) => p.team && L.teams[p.team].lg === 'FNL' && !isForeign(p, 'RUS'));
    for (const p of filler.slice(0, 40 - squad(L, 'ZEN').length)) p.team = 'ZEN';
    touchSquads();
    expect(squad(L, 'ZEN').length).toBe(40);
    const target = squad(L, 'ROS').filter((p) => !isForeign(p, 'RUS')).sort((a, b) => b.ovr - a.ovr)[3];
    expect(userBid(L, target.id, Math.min(me.budget, target.val * 3)).status).toBe('accepted');
    const n = L.negotiations[target.id];
    expect(negotiate(L, target.id, n.ask.wage, n.ask.years).status).toBe('signed');
    expect(squad(L, 'ZEN').length).toBe(41);
    const fa = Object.values(L.players).find((p) => p.st === 'FA' && !isForeign(p, 'RUS'))!;
    const t = startTalks(L, fa, 'ZEN', 'free');
    expect(negotiate(L, fa.id, t.ask.wage * 2, t.ask.years).text).toContain('40 игроков');
  });
  it('a contract extension keeps the player and moves the end date', () => {
    const L = career();
    const p = squad(L, 'SPA').sort((a, b) => b.ovr - a.ovr)[0];
    const until = p.c!.until;
    const n = startTalks(L, p, 'SPA', 'extend');
    const r = negotiate(L, p.id, n.ask.wage, 2);
    expect(r.status).toBe('signed');
    expect(p.team).toBe('SPA');
    expect(p.c!.until).toBe(Math.max(until, L.season + 1 + 2));
  });
});

describe('transfer advice', () => {
  it('recommends only realistic deals that really make the eleven stronger', () => {
    const L = career('ROS');
    const me = L.teams.ROS;
    const t0 = performance.now();
    const adv = transferAdvice(L);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(adv.now.length).toBeGreaterThan(0);
    expect(adv.future.length).toBeGreaterThan(0);
    for (const x of [...adv.now, ...adv.value, ...adv.free]) {
      expect(x.p.team).not.toBe('ROS');
      expect(x.fee).toBeLessThanOrEqual(me.budget);
      expect(interest(L, x.p, me)).toBeGreaterThanOrEqual(0.35);
      expect(canRegister(L, me, x.p, x.wage, x.fee > 0)).toBeNull();
      expect(x.gain).toBeGreaterThan(0);
    }
    for (let i = 1; i < adv.now.length; i++) expect(adv.now[i - 1].gain).toBeGreaterThanOrEqual(adv.now[i].gain - 1e-9);
    expect(transferAdvice(L).now.map((x) => x.p.id)).toEqual(adv.now.map((x) => x.p.id));
  });
  it('the top pick can actually be bought and makes the team stronger as promised', () => {
    const L = career('ROS');
    const me = L.teams.ROS;
    const top = transferAdvice(L).now.find((x) => !x.notes.length)!;
    expect(top).toBeTruthy();
    expect(userBid(L, top.p.id, top.fee).status).toBe('accepted');
    const n = L.negotiations[top.p.id];
    expect(n.ask.wage).toBe(top.wage);
    expect(negotiate(L, top.p.id, n.ask.wage, n.ask.years).status).toBe('signed');
    expect(top.p.team).toBe('ROS');
    expect(purchaseOf(L, top.p)).toMatchObject({ fee: top.fee, date: L.date });
    const before = teamPower(L, me);
    me.lineup.xi[top.slot] = top.p.id;
    expect(teamPower(L, me) - before).toBeCloseTo(top.gain, 6);
  });
});

describe('best line-up', () => {
  it('tries every formation, beats the staff pick and keeps the rules', () => {
    for (const id of ['AKH', 'ZEN']) {
      const L = career(id);
      const t = L.teams[id];
      aiLineup(L, t, undefined, false);
      const auto = teamPower(L, t);
      const { options, current } = lineupOptions(L, t);
      expect(current).toBeCloseTo(auto, 9);
      expect(new Set(options.map((o) => o.form)).size).toBe(Object.keys(FORMATIONS).length);
      expect(options[0].power).toBeGreaterThanOrEqual(auto - 1e-9);
      for (let i = 1; i < options.length; i++) expect(options[i - 1].power).toBeGreaterThanOrEqual(options[i].power);
      for (const o of options) {
        const roles = FORMATIONS[o.form];
        expect(new Set(o.lineup.xi).size).toBe(11);
        o.lineup.xi.forEach((pid, i) => expect(L.players[pid].pos === 'G').toBe(roles[i] === 'GK'));
        t.lineup = o.lineup;
        expect(lineupValid(L, t)).toBe(true);
        expect(foreignOnPitch(L, t)).toBeLessThanOrEqual(foreignLimit(t.lg, L.season)![1]);
        // The power shown is what the engine plays with.
        expect(teamPower(L, t)).toBeCloseTo(o.power, 9);
      }
    }
  });
});

describe('who can join now', () => {
  it('every player the market lists for the club really signs for the price and the wage shown', () => {
    for (const kind of ['ACT', 'FA'] as const) {
      const L = career('ORL');
      L.date = `${L.season}-08-01`;
      const me = L.teams.ORL;
      // There are no free agents at the start: release a few players of the level of the division.
      if (kind === 'FA') {
        for (const p of Object.values(L.players).filter((x) => x.team && L.teams[x.team].lg === 'L2A' && x.ovr >= 56 && x.ovr <= 60).slice(0, 8)) {
          p.team = null; p.st = 'FA'; p.c = null;
        }
        touchSquads();
      }
      const ok = Object.values(L.players).map((p) => ({ p, d: dealFor(L, p, me) })).filter((x) => x.d);
      expect(ok.length).toBeGreaterThan(20);
      // No foreigners in the Second League, nothing above the budgets.
      for (const { p, d } of ok) {
        expect(isForeign(p, 'RUS')).toBe(false);
        expect(d!.fee).toBeLessThanOrEqual(me.budget);
        expect(wageBill(L, me.id) + d!.wage).toBeLessThanOrEqual(me.wageBudget * 1.02);
      }
      const best = ok.filter((x) => x.p.st === kind).sort((a, b) => b.p.ovr - a.p.ovr)[0];
      expect(best, kind).toBeTruthy();
      if (kind === 'ACT') expect(userBid(L, best.p.id, best.d!.fee).status).toBe('accepted');
      else startTalks(L, best.p, me.id, 'free');
      const n = L.negotiations[best.p.id];
      expect(n.ask.wage).toBe(best.d!.wage);
      expect(negotiate(L, best.p.id, n.ask.wage, n.ask.years).status).toBe('signed');
      expect(best.p.team).toBe('ORL');
    }
  });
});

describe('contract renewals', () => {
  const toDate = (L: League, d: string) => { while (L.date < d) advanceDay(L); };
  it('judges every expiring contract and keeps only sensible deals', () => {
    const L = career('ROS', 7);
    L.settings.autoRenew = false;
    toDate(L, `${L.season}-09-30`);
    const me = L.teams.ROS;
    const cs = renewalCases(L);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.p.team).toBe('ROS');
      expect(c.p.c!.until).toBeLessThanOrEqual(L.season + 2);
      expect(c.why.length).toBeGreaterThan(0);
      if (c.verdict === 'extend') {
        expect(c.wage / wageFor(c.p.ovr, me.lg)).toBeLessThanOrEqual(1.45);
        expect(c.p.wantsOut).toBeFalsy();
      }
      expect(c.auto).toBe(c.verdict === 'extend' && c.final);
    }
    // A player who wants to leave is never extended.
    const star = cs.find((c) => c.verdict === 'extend')!.p;
    star.wantsOut = true;
    expect(renewalCases(L).find((c) => c.p.id === star.id)!.verdict).not.toBe('extend');
  });
  it('auto-renewal signs the good deals on the player\'s terms and nothing else', () => {
    const run = (on: boolean) => {
      const L = career('ROS', 7);
      L.settings.autoRenew = on;
      toDate(L, `${L.season}-09-30`);
      const before = renewalCases(L);
      const wages = wageBill(L, 'ROS');
      // The day of September 30 and then October 1, when the monthly renewal runs.
      advanceDay(L);
      advanceDay(L);
      return { L, before, wages };
    };
    const { L, before } = run(true);
    const auto = before.filter((c) => c.auto);
    expect(auto.length).toBeGreaterThan(0);
    // Each signature is followed by a fresh look: a depth player may no longer be needed once the others stay.
    const now = renewalCases(L);
    for (const c of auto) {
      if (c.p.c!.until > L.season + 1) expect(c.p.c!.wage).toBe(c.wage);
      else expect(now.find((x) => x.p.id === c.p.id)!.verdict).not.toBe('extend');
    }
    expect(auto.filter((c) => c.p.c!.until > L.season + 1).length).toBeGreaterThan(auto.length / 2);
    for (const c of before.filter((x) => x.final && x.verdict !== 'extend')) expect(c.p.c!.until).toBe(L.season + 1);
    expect(L.inbox.some((m) => m.title.startsWith('Автопродление'))).toBe(true);
    const off = run(false);
    expect(off.L.inbox.some((m) => m.title.startsWith('Автопродление'))).toBe(false);
    for (const c of off.before.filter((x) => x.final)) expect(c.p.c!.until).toBe(off.L.season + 1);
    expect(autoRenew(off.L)).toEqual([]);
  });
});

describe('sale advice', () => {
  const offer = (L: League, pid: number, fee: number) => {
    const o = { id: L.nextMsgId++, date: L.date, player: pid, from: 'LIV', to: L.user, fee, status: 'pending' as const, expires: L.date };
    L.offers.push(o);
    return o;
  };
  it('a better offer never gets a worse verdict, and the suggested ask is accepted by the buyer', () => {
    const L = career('ZEN');
    const rank = { reject: 0, counter: 1, accept: 2 };
    for (const p of squad(L, 'ZEN').sort((a, b) => b.ovr - a.ovr).slice(0, 12)) {
      let last = -1;
      for (const k of [0.5, 0.8, 1, 1.2, 1.5, 2]) {
        const v = offerView(L, { id: 0, date: L.date, player: p.id, from: 'LIV', to: 'ZEN', fee: Math.round(p.val * k), status: 'pending', expires: L.date });
        expect(rank[v.verdict]).toBeGreaterThanOrEqual(last);
        last = rank[v.verdict];
        expect(v.good).toBeGreaterThanOrEqual(v.min);
        if (v.ask != null) expect(v.ask).toBeLessThanOrEqual(v.ceiling);
      }
    }
    const p = squad(L, 'ZEN').sort((a, b) => b.ovr - a.ovr)[1];
    const o = offer(L, p.id, Math.round(p.val * 0.9));
    const v = offerView(L, o);
    expect(v.ask).not.toBeNull();
    respondOffer(L, o.id, 'counter', v.ask!);
    expect(p.team).toBe('LIV');
    expect(L.transfers[0].fee).toBe(v.ask);
  });
  it('suggests selling only players the team can spare, with a price the market can pay', () => {
    for (const team of ['ZEN', 'ROS', 'PSG']) {
      const L = career(team);
      const list = sellAdvice(L);
      expect(list.length).toBeGreaterThan(0);
      for (const x of list) {
        expect(x.p.team).toBe(team);
        expect(x.view.keep).toBe(false);
        expect(x.view.loss).toBeLessThan(0.35);
        const max = Object.values(L.teams).filter((t) => t.id !== team).reduce((m, t) => Math.max(m, buyerCeiling(L, t, x.p)), 0);
        expect(x.best).toBeLessThanOrEqual(max);
      }
    }
  });
  it('a player who wants to leave or is out of contract may go for less', () => {
    const L = career('ZEN');
    const p = squad(L, 'ZEN').sort((a, b) => b.ovr - a.ovr)[4];
    const before = saleView(L, p).min;
    p.wantsOut = true;
    expect(saleView(L, p).min).toBeLessThan(before);
    expect(saleView(L, p).min).toBeLessThanOrEqual(Math.round(p.val * 0.5 / 1e5) * 1e5 + 1e5);
  });
});

describe('injuries in the advice', () => {
  const injure = (L: League, team: string, days: number) => {
    const t = L.teams[team];
    const before = transferAdvice(L);
    // The best outfield starter gets hurt; the staff puts a stand-in in his place.
    const p = t.lineup.xi.map((id) => L.players[id]).filter((x) => x.pos !== 'G').sort((a, b) => b.ovr - a.ovr)[0];
    p.inj = { type: 'растяжение', days, total: days };
    aiLineup(L, t, undefined, true);
    expect(t.lineup.xi).not.toContain(p.id);
    return { p, before };
  };
  it('a short injury does not make the advice look for a replacement', () => {
    const L = career('ZEN');
    const { p, before } = injure(L, 'ZEN', 14);
    const after = transferAdvice(L);
    expect(after.now.map((x) => x.p.id)).toEqual(before.now.map((x) => x.p.id));
    expect(after.weak).toEqual(before.weak);
    expect(after.away.find((a) => a.p.id === p.id)?.long).toBe(false);
  });
  it('a long injury is reported, and selling or renewing still counts on the player', () => {
    const L = career('ZEN');
    const healthy = saleView(L, squad(L, 'ZEN').filter((x) => x.pos !== 'G').sort((a, b) => b.ovr - a.ovr)[0]);
    const { p } = injure(L, 'ZEN', 90);
    expect(transferAdvice(L).away.find((a) => a.p.id === p.id)?.long).toBe(true);
    expect(saleView(L, p).loss).toBeCloseTo(healthy.loss, 6);
    expect(sellAdvice(L).some((x) => x.p.id === p.id)).toBe(false);
  });
});

/** Checks the league-phase rules for a set of fixtures. */
function checkLeaguePhase(L: League, games: { h: string; a: string }[], pots: string[][]) {
  const potOf = new Map(pots.flatMap((p, i) => p.map((id) => [id, i] as [string, number])));
  expect(games).toHaveLength(144);
  for (const id of potOf.keys()) {
    const mine = games.filter((g) => g.h === id || g.a === id);
    expect(mine, id).toHaveLength(8);
    expect(mine.filter((g) => g.h === id), id).toHaveLength(4);
    const opp = mine.map((g) => (g.h === id ? g.a : g.h));
    expect(new Set(opp).size, id).toBe(8);
    for (let p = 0; p < 4; p++) expect(opp.filter((o) => potOf.get(o) === p), `${id} pot ${p + 1}`).toHaveLength(2);
    const ctry = club(L, id).country;
    expect(opp.filter((o) => club(L, o).country === ctry), id).toHaveLength(0);
    const per = new Map<string, number>();
    for (const o of opp) per.set(club(L, o).country, (per.get(club(L, o).country) ?? 0) + 1);
    expect(Math.max(...per.values()), id).toBeLessThanOrEqual(2);
  }
}

describe('Second League B, group 3', () => {
  it('has the sixteen real clubs of Oryol\'s group with real squads and no foreigners', () => {
    const L = career();
    const clubs = Object.values(L.teams).filter((t) => t.lg === 'L2B');
    expect(clubs).toHaveLength(16);
    expect(L.teams.ORL.ru).toBe('Орёл');
    for (const t of clubs) {
      const sq = squad(L, t.id);
      expect(sq.length, t.id).toBeGreaterThanOrEqual(20);
      expect(sq.every((p) => p.real), t.id).toBe(true);
      expect(sq.filter((p) => p.pos === 'G').length, t.id).toBeGreaterThanOrEqual(2);
      expect(sq.filter((p) => isForeign(p, 'RUS')), t.id).toHaveLength(0);
    }
    expect(L.games.filter((g) => g.comp === 'L2B')).toHaveLength(240);
    // A strong free agent does not go down to the fourth division.
    const star = Object.values(L.players).find((p) => p.ovr >= 78 && p.ctry === 'RUS')!;
    expect(interest(L, { ...star, team: null, st: 'FA', c: null }, L.teams.ORL)).toBeLessThan(0.45);
  });
});

describe('Second League A and the way up', () => {
  it('has the seventeen real clubs of division A with real squads and no foreigners', () => {
    const L = career();
    const clubs = Object.values(L.teams).filter((t) => t.lg === 'L2A');
    expect(clubs).toHaveLength(17);
    for (const t of clubs) {
      const sq = squad(L, t.id);
      expect(sq.length, t.id).toBeGreaterThanOrEqual(18);
      expect(sq.every((p) => p.real), t.id).toBe(true);
      expect(sq.filter((p) => p.pos === 'G').length, t.id).toBeGreaterThanOrEqual(2);
      expect(sq.filter((p) => isForeign(p, 'RUS')), t.id).toHaveLength(0);
    }
    // 17 clubs, double round-robin: 16 × 17 games.
    expect(L.games.filter((g) => g.comp === 'L2A')).toHaveLength(272);
  });

  /** Final tables in a given order: the club listed first in each league is the champion. */
  function finish(L: League, order: Partial<Record<string, string[]>> = {}) {
    for (const lg of ['RPL', 'FNL', 'L2A', 'L2B'] as const) {
      const first = order[lg] ?? [];
      const rest = Object.values(L.teams).filter((t) => t.lg === lg && !first.includes(t.id)).sort((a, b) => a.id.localeCompare(b.id));
      [...first.map((id) => L.teams[id]), ...rest].forEach((t, i) => { t.rec.pts = 200 - i; t.rec.gp = 30; });
      L.comps[lg].phase = 'done';
    }
    L.games = L.games.filter((g) => g.played);
  }

  it('play-offs: 13th and 14th of the RPL meet 4th and 3rd of the First League, 16th of the First League meets 3rd of division A', () => {
    const L = career('ORL');
    finish(L);
    initPlayoffs(L, L.season);
    const rpl = sortedTeams(L, 'RPL'), fnl = sortedTeams(L, 'FNL'), l2a = sortedTeams(L, 'L2A');
    const ties = L.cups.PO!.ties.map((t) => [t.h, t.a]);
    expect(ties).toEqual(expect.arrayContaining([[fnl[3].id, rpl[12].id], [fnl[2].id, rpl[13].id], [l2a[2].id, fnl[15].id]]));
    expect(ties).toHaveLength(3);
  });

  it('Oryol can climb from division B to the Premier League, one division a season', () => {
    const L = career('ORL');
    const sizes = () => Object.fromEntries((['RPL', 'FNL', 'L2A', 'L2B'] as const).map((lg) => [lg, Object.values(L.teams).filter((t) => t.lg === lg).length]));
    const before = sizes();
    for (const want of ['L2A', 'FNL', 'RPL']) {
      const lg = L.teams.ORL.lg;
      finish(L, { [lg]: ['ORL'] });
      const down = sortedTeams(L, LEAGUES[lg].up!).slice(-1)[0];
      L.date = `${L.season + 1}-06-20`;
      rollover(L);
      expect(L.teams.ORL.lg).toBe(want);
      expect(down.lg).toBe(lg);
      expect(sizes()).toEqual(before);
      expect(L.history[0].userRecord.place).toBe(1);
    }
    // Every division of the new season has its calendar.
    for (const lg of ['RPL', 'FNL', 'L2A', 'L2B']) expect(L.games.some((g) => g.comp === lg), lg).toBe(true);
  });
});

describe('market values', () => {
  it('the same player is worth several times less at a club of the Second League, and an old save is revalued', () => {
    const L = career('ORL');
    const p = { ...L.players[20030151], ovr: 70, pot: 72 };
    const at = (lg: 'RPL' | 'FNL' | 'L2A' | 'L2B') => modelValue(p, '2029-10-01', lg);
    expect(at('L2B')).toBeLessThan(at('L2A'));
    expect(at('L2A')).toBeLessThan(at('FNL'));
    expect(at('FNL')).toBe(at('RPL'));
    expect(at('L2B')).toBeLessThan(500_000);
    // A save made before the league factor: values of the Second League come back to the model.
    const old = L.players[20030151];
    old.val = 2_500_000;
    L.v = 2;
    upgradeSave(L, world);
    expect(L.v).toBe(3);
    expect(old.val).toBe(modelValue(old, L.date, 'L2B'));
  });
});

describe('Russian Cup', () => {
  it('the lower divisions start in August, the RPL joins in the last 32, the lower club plays at home', () => {
    const L = career('ORL');
    const cup = L.cups.CUP!;
    const r1 = cup.ties.filter((t) => t.round === 0);
    expect(r1).toHaveLength(19);
    expect(r1.some((t) => t.h === 'ORL' || t.a === 'ORL')).toBe(true);
    const tier = (id: string) => LEAGUES[L.teams[id].lg].tier;
    for (const t of r1) {
      expect(tier(t.h)).toBeGreaterThanOrEqual(tier(t.a));
      expect(L.teams[t.h].lg).not.toBe('RPL');
      expect(L.teams[t.a].lg).not.toBe('RPL');
    }
    // No club plays a cup match on a day next to one of its league games.
    const g0 = L.games.filter((g) => g.comp === 'CUP');
    for (const g of g0) for (const id of [g.h, g.a]) {
      const near = L.games.filter((x) => x !== g && (x.h === id || x.a === id) && Math.abs(Date.parse(x.day) - Date.parse(g.day)) <= 86_400_000);
      expect(near, `${id} ${g.day}`).toHaveLength(0);
    }
    for (let i = 0; i < 70 && !cup.ties.some((t) => t.round === 2); i++) { advanceDay(L); L.stops.length = 0; }
    const r2 = cup.ties.filter((t) => t.round === 1), last32 = cup.ties.filter((t) => t.round === 2);
    expect(r2).toHaveLength(16);
    expect(last32).toHaveLength(16);
    // Every tie of the last 32: one RPL club, away at a club of a lower division.
    for (const t of last32) {
      expect(L.teams[t.a].lg).toBe('RPL');
      expect(L.teams[t.h].lg).not.toBe('RPL');
    }
  });
});

describe('youth league 2009', () => {
  it('starts with editable placeholders and stays out of the transfer market', () => {
    const L = career('RUS09', 3);
    const sq = squad(L, 'RUS09');
    expect(sq.length).toBe(20);
    expect(sq.every((p) => p.custom && !p.real && p.bd.startsWith('2009'))).toBe(true);
    const p = sq[0];
    editYouthPlayer(L, p.id, { fn: 'Иван', ln: 'Петров', role: 'ST', num: 9, year: 2009, ovr: 60 });
    expect(L.players[p.id].ru).toBe('Иван Петров');
    expect(L.players[p.id].pos).toBe('F');
    expect(Math.abs(L.players[p.id].ovr - 60)).toBeLessThanOrEqual(2);
    // Adults do not join a youth team, and its boys are not for sale.
    const adult = Object.values(L.players).find((x) => x.team === 'ORL')!;
    expect(interest(L, adult, L.teams.RUS09)).toBe(0);
    expect(interest(L, L.players[p.id], L.teams.ORL)).toBe(0);
    for (let i = 0; i < 60; i++) { advanceDay(L); L.stops.length = 0; }
    expect(squad(L, 'RUS09').every((x) => x.custom)).toBe(true);
    expect(L.games.filter((g) => g.comp === 'U17')).toHaveLength(56);
  });
});

describe('Champions League', () => {
  it('2026-27 is the real draw: 36 clubs, 144 fixtures, the guests with real squads', () => {
    const L = career();
    const u = L.ucl!;
    expect(u.holder).toBe('PSG');
    expect(u.pots.flat()).toHaveLength(36);
    expect(Object.keys(L.ext!)).toHaveLength(15);
    const games = L.games.filter((g) => g.comp === UCL);
    checkLeaguePhase(L, games, u.pots);
    expect(games.find((g) => g.h === 'AEK' && g.a === 'LAS')?.day).toBe('2026-09-08');
    for (const id of Object.keys(L.ext!)) {
      const sq = rosterOf(L, id);
      expect(sq.length, id).toBeGreaterThanOrEqual(20);
      expect(sq.filter((p) => p.pos === 'G').length, id).toBeGreaterThanOrEqual(2);
      expect(sq.every((p) => p.real || p.yth), id).toBe(true);
      expect(club(L, id).lineup.xi, id).toHaveLength(11);
    }
    // No club plays twice within two days.
    for (const g of games) {
      const near = L.games.filter((x) => x !== g && [x.h, x.a].some((id) => id === g.h || id === g.a) && Math.abs(Date.parse(x.day) - Date.parse(g.day)) <= 86_400_000);
      expect(near, `${g.h}-${g.a} ${g.day}`).toHaveLength(0);
    }
  });
  it('later draws follow the rules and fit into eight matchdays', () => {
    const L = career();
    const ids = L.ucl!.pots.flat();
    for (let s = 1; s <= 5; s++) {
      useState_(seedState(s));
      const order = [...ids].sort((a, b) => club(L, b).rep - club(L, a).rep);
      const pots = makePots(order, (id) => club(L, id).country);
      const pairs = drawLeague(pots, (id) => club(L, id).country)!;
      expect(pairs).toBeTruthy();
      checkLeaguePhase(L, pairs.map(([h, a]) => ({ h, a })), pots);
      const md = matchdays(pairs, ids)!;
      expect(md).toBeTruthy();
      for (let d = 0; d < 8; d++) {
        const on = pairs.filter((_, i) => md[i] === d).flat();
        expect(new Set(on).size).toBe(36);
      }
    }
  });
  it('an old save gets the guests, and the tournament if the first matchday is still ahead', () => {
    const before = career();
    delete before.ucl; delete before.ext; delete before.cups.UCL;
    before.games = before.games.filter((g) => g.comp !== UCL);
    upgradeSave(before, world);
    expect(before.games.filter((g) => g.comp === UCL)).toHaveLength(144);
    const late = career();
    delete late.ucl; delete late.ext; delete late.cups.UCL;
    late.games = late.games.filter((g) => g.comp !== UCL);
    late.date = '2026-10-01';
    upgradeSave(late, world);
    expect(late.ucl).toBeUndefined();
    expect(Object.keys(late.ext!)).toHaveLength(15);
  });
});

describe('a full season', () => {
  it('runs through promotion, relegation, the cup, the Champions League and the rollover', () => {
    const L = career('SPA', 5);
    L.teams.SPA.lineup.auto = true;
    L.settings.noFiring = true;
    while (L.date < '2027-06-19') { advanceDay(L); L.stops.length = 0; }
    // Champions League: league phase, play-offs, round of 16 … the final.
    const u = L.ucl!, cup = L.cups[UCL];
    expect(u.phase).toBe('done');
    expect(L.games.filter((g) => g.comp === UCL && g.played)).toHaveLength(189);
    expect(u.champion).toBeTruthy();
    expect(u.history[0].champion).toBe(u.champion);
    const order = uclOrder(L);
    const r16 = cup.ties.filter((t) => t.round === 1);
    expect(r16).toHaveLength(8);
    // The top eight are seeded in the round of 16 and host the second leg; 1st and 2nd are in different halves.
    for (const t of r16) expect(order.indexOf(t.a)).toBeLessThan(8);
    const half = (id: string) => Math.floor(r16.findIndex((t) => t.a === id) / 4);
    expect(half(order[0])).not.toBe(half(order[1]));
    const final = L.games.find((g) => g.comp === UCL && g.rd === 'Финал')!;
    expect(final.neutral).toBe(true);
    expect(club(L, u.champion!).trophies.at(-1)).toMatch(/Лига чемпионов/);
    while (L.season === 2026) { advanceDay(L); L.stops.length = 0; }
    expect(L.date).toBe('2027-06-21');
    const rpl = Object.values(L.teams).filter((t) => t.lg === 'RPL'), fnl = Object.values(L.teams).filter((t) => t.lg === 'FNL');
    expect(rpl).toHaveLength(16);
    expect(fnl).toHaveLength(18);
    expect(L.comps.RPL.history[0].champion).toBeTruthy();
    expect(L.history[0].promoted.length).toBeGreaterThanOrEqual(2);
    expect(L.history[0].cup).toBeTruthy();
    expect(L.games.filter((g) => g.comp === 'RPL')).toHaveLength(240);
    expect(L.games.every((g) => !g.played)).toBe(true);
    for (const t of rpl) expect(squad(L, t.id).length).toBeGreaterThanOrEqual(18);
    // The next Champions League is drawn from the final tables, with the holder in pot 1.
    expect(L.ucl!.season).toBe(2027);
    expect(L.ucl!.pots[0][0]).toBe(u.champion);
    checkLeaguePhase(L, L.games.filter((g) => g.comp === UCL), L.ucl!.pots);
  }, 180_000);
});
