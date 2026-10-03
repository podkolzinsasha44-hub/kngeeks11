import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { foreignLimit, isForeign, LEAGUES } from '../src/engine/leagues';
import { FORMATIONS, lineupValid, squad, teamPower } from '../src/engine/lineup';
import { simulateMatch } from '../src/engine/match';
import { gameOdds, quickOdds, ratingOf, sideOf } from '../src/engine/projection';
import { seedState, useState_ } from '../src/engine/rng';
import { advanceDay, lastUserBox, nextUserGame } from '../src/engine/season';
import { negotiate, userBid } from '../src/engine/transfers';
import { startTalks } from '../src/engine/contracts';
import type { League } from '../src/engine/types';
import { newCareer, type WorldJson } from '../src/engine/world';

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
    expect(Object.values(L.players).every((p) => p.real)).toBe(true);
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

describe('a full season', () => {
  it('runs through promotion, relegation, the cup and the rollover', () => {
    const L = career('SPA', 5);
    L.teams.SPA.lineup.auto = true;
    L.settings.noFiring = true;
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
  }, 120_000);
});
