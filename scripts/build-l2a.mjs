// Adds division A of the Second League (the step between division B, where FC Oryol plays, and the First
// League) to public/data/world.json. Run after build-l2b.mjs.
//
// Source: the open API of the official site of the league (fnl.pro), season 2026/27: the 17 clubs of both
// groups of the first stage ("gold" and "silver") with their current squads (date of birth, citizenship,
// height, photo, minutes and goals of the season), stadium, colours, crest and head coach. Answers are
// cached in data/raw/fnl/.
//
// As in division B there are no market valuations, so the rating is a model: the level of the division,
// the club's real points per game, the player's share of the minutes and his age. Wages and contracts are
// a model too. Players already in the world are not duplicated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOn, buildAttrs, clamp, rnd } from './ratings.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw', 'fnl');
const WORLD = path.join(ROOT, 'public', 'data', 'world.json');
const API = 'https://fnl-app.fnl.pro/api/v1';
const IMG = 'https://s3.fnl.pro:9000';
const LEAGUE = 200; // Second League, division A
const SEASON = 1184, SEASON_PREV = 1107; // 2026/27, 2025/26
const ID_BASE = 22_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(RAW, { recursive: true });
async function get(url) {
  const f = path.join(RAW, url.replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(API + url, { headers: { 'User-Agent': 'FootballGM-fan-project/0.1 (non-commercial)' } });
      if (r.ok) {
        const j = await r.json();
        fs.writeFileSync(f, JSON.stringify(j));
        await sleep(120);
        return j;
      }
    } catch { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`Request failed: ${url}`);
}

// ---------------------------------------------------------------- clubs of both groups
const groups = await get(`/info/groupsBySeason?leagueId=${LEAGUE}&seasonId=${SEASON}`);
const rank = async (season, groupId, type) => (await get(`/center/rank?leagueId=${LEAGUE}&seasonId=${season}&groupId=${groupId}&type=${type}`)).teams;
const table = [];
for (const g of groups) table.push(...(await rank(SEASON, g.id, 'ALL')).map((t) => ({ ...t, group: g.originName })));
if (table.length !== 17) throw new Error(`Expected 17 clubs, got ${table.length}`);

// Short ids of the game (unique among all clubs) and Latin names.
const ID = {
  'rodina-2': ['RD2', 'Rodina-2 Moscow'], 'dinamo-kirov': ['DKI', 'Dynamo Kirov'], 'sibir': ['SIB', 'Sibir Novosibirsk'], 'dinamo-bryansk': ['DBR', 'Dynamo Bryansk'],
  'alaniya': ['ALN', 'Alania Vladikavkaz'], 'dinamo-vladivostok': ['DVL', 'Dynamo Vladivostok'], 'mashuk-kmv': ['MSH', 'Mashuk-KMV Pyatigorsk'], 'volgar': ['VLG', 'Volgar Astrakhan'],
  'sokol-saratov': ['SOK', 'Sokol Saratov'], 'kaluga': ['KLG', 'Kaluga'], 'zenit-2': ['ZN2', 'Zenit-2 Saint Petersburg'], 'amkar-perm': ['AMK', 'Amkar Perm'],
  'tyumen': ['TYU', 'Tyumen'], 'torpedo-miass': ['TMI', 'Torpedo Miass'], 'dinamo-stavropol': ['DST', 'Dynamo Stavropol'], 'irtysh': ['IRT', 'Irtysh Omsk'],
  'dinamo-2-moskva': ['DM2', 'Dynamo-2 Moscow'],
};
const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const taken = new Set(world.teams.filter((t) => t.lg !== 'L2A').map((t) => t.id));
const colors = await get(`/info/teamColor?leagueId=${LEAGUE}`);

// ---------------------------------------------------------------- transliteration and countries
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const lat = (s) => s.split('').map((c) => { const l = c.toLowerCase(), t = TR[l]; return t === undefined ? c : c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join('').replace(/iy\b/g, 'y');
const CTRY = {
  'Российская Федерация': 'RUS', 'Россия': 'RUS', 'Беларусь': 'BLR', 'Белоруссия': 'BLR', 'Республика Беларусь': 'BLR', 'Казахстан': 'KAZ', 'Армения': 'ARM', 'Узбекистан': 'UZB', 'Таджикистан': 'TJK',
  'Киргизия': 'KGZ', 'Кыргызстан': 'KGZ', 'Азербайджан': 'AZE', 'Украина': 'UKR', 'Грузия': 'GEO', 'Молдова': 'MDA', 'Туркменистан': 'TKM', 'Сербия': 'SRB',
};
const unknownCtry = new Map();

// ---------------------------------------------------------------- squads
const ROLES = { 1: ['GK'], 2: ['CB', 'CB', 'RB', 'LB', 'CB'], 3: ['CM', 'DM', 'AM', 'CM', 'RM', 'LM'], 4: ['ST', 'RW', 'ST', 'LW'] };
const nkey = (s) => (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z]/g, '');
const existing = new Map();
for (const p of world.players) if (p.ru && p.bd && (p.id < ID_BASE || p.id >= ID_BASE + 1_000_000)) existing.set(`${p.bd}|${nkey(p.ru.split(' ').slice(-1)[0])}`, p);

const teams = [], players = [];
let skipped = 0, scorer = 0, games = 0;
for (const row of table) {
  const [id, name] = ID[row.teamSlug] ?? [];
  if (!id) throw new Error(`No id for ${row.teamSlug}`);
  if (taken.has(id)) throw new Error(`Id ${id} is taken`);
  const info = await get(`/team/info?leagueId=${LEAGUE}&teamId=${row.teamId}&seasonId=${SEASON}`);
  const coach = (await get(`/team/trainers?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=${row.teamId}`)).trainers.find((t) => /Главный/.test(t.post)) ?? null;
  const squad = (await get(`/team/players?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=${row.teamId}`)).players;
  const col = colors.find((c) => c.teamId === row.teamId);
  const ppg = row.score / Math.max(1, row.allGame);
  games = Math.max(games, row.allGame);
  const rot = {};
  for (const s of squad) {
    if (!s.playerId) continue;
    const pi = (await get(`/player/info?leagueId=${LEAGUE}&playerId=${s.playerId}&seasonId=${SEASON}`)).items?.[0]?.info?.[0]?.info ?? {};
    const gk = s.post === 1;
    const st = (await get(`/player/stats?leagueId=${LEAGUE}&playerId=${s.playerId}&seasonId=${SEASON}&teamId=${row.teamId}${gk ? '&isGoalKeeper=true' : ''}`)).stats?.stats ?? [];
    const v = (e) => st.find((x) => x.eventId === e)?.cnt ?? 0;
    const parts = s.playerName.trim().split(/\s+/);
    const [last, first] = [parts[0], parts[1] ?? ''];
    const bd = pi.birthday ?? null;
    if (!bd) { skipped++; continue; }
    if (existing.has(`${bd}|${nkey(last)}`)) { skipped++; continue; } // already in the world at another club
    const ctry = CTRY[pi.citizenship] ?? (pi.citizenship ? (unknownCtry.set(pi.citizenship, (unknownCtry.get(pi.citizenship) ?? 0) + 1), 'RUS') : 'RUS');
    const k = `${id}:${s.post}`;
    rot[k] = (rot[k] ?? 0) + 1;
    const role = ROLES[s.post][(rot[k] - 1) % ROLES[s.post].length];
    const min = v(-2), g = v(196), a = v(393), yc = v(-264), rc = v(-273);
    scorer = Math.max(scorer, g);
    players.push({
      id: ID_BASE + s.playerId, fn: lat(first), ln: lat(last), ru: `${first} ${last}`.trim(), role, bd, ctry, ht: pi.height || null, num: s.num || null,
      img: s.photoUrl ? IMG + s.photoUrl : null, team: id, min, share: min / Math.max(90, row.allGame * 90), g, a, yc, rc, ppg,
    });
  }
  const rgb = /^#[0-9a-f]{6}$/i.test(col?.color ?? '') ? col.color.toUpperCase() : '#1E4FA3';
  teams.push({
    id, name, ru: row.teamName.replace(/\s*\(.*\)$/, ''), short: id, primary: rgb, secondary: /^#[0-9a-f]{6}$/i.test(col?.colorAlt ?? '') ? col.colorAlt.toUpperCase() : '#FFFFFF',
    stadium: (info.stadium ?? '').replace(/[«»]/g, ''), cap: info.stadiumCapacity || 5000, coach: coach ? coach.name.split(' ').slice(0, 2).reverse().join(' ') : 'Главный тренер',
    logo: info.logoUrl ? IMG + info.logoUrl : null, city: info.city ?? row.teamName,
  });
}
for (const t of teams) if (world.teams.some((x) => x.lg !== 'L2A' && x.ru === t.ru)) t.ru = `${t.ru} ${t.city.replace(/^г\.\s*/, '')}`;

// ---------------------------------------------------------------- ratings (a model: no valuations at this level)
const TIER = 57;
const out = players.map((p) => {
  const a = ageOn(p.bd);
  let base = TIER + clamp((p.ppg - 1.4) * 8, -8, 8);
  base += p.share >= 0.6 ? 2.5 : p.share >= 0.35 ? 1.5 : p.share >= 0.12 ? 0 : -3;
  base += a < 20 ? -(20 - a) * 1.4 : a > 32 ? -(a - 32) * 1.2 : a >= 25 && a <= 30 ? 1 : 0;
  base += (rnd(p.id, 'lvl') - 0.5) * 5;
  if (p.role === 'GK') base += 1;
  const ovr = clamp(Math.round(base), 45, 72);
  const src = { id: p.id, role: p.role, bd: p.bd, ht: p.ht, hist: [{ season: 2026, min: p.min, g: p.g, a: p.a, yc: p.yc, rc: p.rc }] };
  const room = clamp((99 - ovr) / 22, 0.25, 1);
  const pot = clamp(Math.round(a <= 21 ? ovr + (clamp((24 - a) * 1.7, 3, 14) + rnd(p.id, 'pot') * 3) * room : a <= 25 ? ovr + ((26 - a) * 0.9 + rnd(p.id, 'pot') * 2) * room : ovr), ovr, 90);
  const val = 1e5 * Math.pow(10, (ovr + 0.3 * (pot - ovr) - 58 - (a > 28 ? Math.min(7, a - 28) : 0)) / 10);
  const until = 2027 + Math.floor(rnd(p.id, 'until') * (a >= 30 ? 1 : 2));
  return {
    id: p.id, fn: p.fn, ln: p.ln, ru: p.ru, role: p.role, foot: rnd(p.id, 'foot') < 0.24 ? 'L' : 'R', bd: p.bd, c: p.ctry, ...(p.ht ? { ht: p.ht } : {}),
    ...(p.img ? { iu: p.img } : {}), ...(p.num ? { n: p.num } : {}), t: p.team, o: ovr, p: pot, r: buildAttrs(src, ovr), v: Math.max(5000, Math.round(val / 1000) * 1000),
    w: Math.max(15_000, Math.round((20_000 * Math.exp((ovr - 55) * 0.185) * 0.3) / 1000) * 1000), u: until,
  };
});

const outTeams = teams.map((t) => {
  const sq = out.filter((p) => p.t === t.id);
  const best = [...sq].sort((a, b) => b.o - a.o).slice(0, 14);
  const lvl = best.reduce((s, p) => s + p.o, 0) / Math.max(1, best.length);
  const wages = sq.reduce((s, p) => s + p.w, 0);
  return {
    id: t.id, lg: 'L2A', name: t.name, ru: t.ru, short: t.short, country: 'RUS', primary: t.primary, secondary: t.secondary, stadium: t.stadium, cap: t.cap,
    rep: clamp(Math.round(24 + (lvl - 55) * 1.3), 18, 40), coach: { name: t.coach, rating: clamp(Math.round(lvl + 2 + (rnd(t.id, 'coach') - 0.5) * 6), 52, 72) },
    budget: Math.round((400_000 + (lvl - 55) * 50_000) / 25_000) * 25_000, wages, ...(t.logo ? { logo: t.logo } : {}),
  };
});

world.teams = world.teams.filter((t) => t.lg !== 'L2A').concat(outTeams);
world.players = world.players.filter((p) => p.id < ID_BASE || p.id >= ID_BASE + 1_000_000).concat(out);
world.leagues.L2A = { name: 'Вторая лига А', country: 'RUS', tier: 3, teams: outTeams.map((t) => t.id) };
world.facts.champions.L2A = null;
fs.writeFileSync(WORLD, JSON.stringify(world));

// ---------------------------------------------------------------- the real numbers the engine is calibrated to
// 2025/26, both stages of both groups: a club's points per game over the whole season.
const prevGroups = await get(`/info/groupsBySeason?leagueId=${LEAGUE}&seasonId=${SEASON_PREV}`);
const club = new Map();
let gp = 0, gf = 0, hw = 0, dr = 0;
for (const g of prevGroups) {
  const all = await rank(SEASON_PREV, g.id, 'ALL'), home = await rank(SEASON_PREV, g.id, 'HOME');
  const n = all.reduce((s, t) => s + t.allGame, 0) / 2;
  gp += n; gf += all.reduce((s, t) => s + t.scoredGoal, 0); hw += home.reduce((s, t) => s + t.win, 0); dr += all.reduce((s, t) => s + t.draw, 0) / 2;
  for (const t of all) { const c = club.get(t.teamId) ?? { pts: 0, gp: 0 }; c.pts += t.score; c.gp += t.allGame; club.set(t.teamId, c); }
}
const ppgs = [...club.values()].map((c) => c.pts / c.gp);
console.log(`Second League A: ${outTeams.length} clubs, ${out.length} players (${skipped} skipped: already in the world or no birthday)`);
if (unknownCtry.size) console.log('Unknown citizenship (counted as RUS):', [...unknownCtry]);
for (const t of outTeams) {
  const sq = out.filter((p) => p.t === t.id).sort((a, b) => b.o - a.o);
  console.log(`  ${t.id} ${t.ru}: ${sq.length} players, best XI ${(sq.slice(0, 11).reduce((s, p) => s + p.o, 0) / 11).toFixed(1)}, GK ${sq.filter((p) => p.role === 'GK').length}, coach ${t.coach.name}`);
}
console.log(`Real 2025/26 (${club.size} clubs, ${gp} matches): goals/match ${(gf / gp).toFixed(2)}, home wins ${(hw / gp).toFixed(3)}, draws ${(dr / gp).toFixed(3)}, ` +
  `best ${(Math.max(...ppgs) * 32).toFixed(0)} pts/32, worst ${(Math.min(...ppgs) * 32).toFixed(0)} pts/32`);
console.log(`Top scorer 2026/27 after ${games} rounds: ${scorer} goals (pace ${(scorer * 32 / Math.max(1, games)).toFixed(0)} per 32)`);
