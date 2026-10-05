// Adds group 3 of the Second League, division B (the league of FC Oryol) to public/data/world.json
// (run after build-world.mjs).
//
// Source: the open API of the official site of the league (fnl.pro, Football National League):
// current squads of the 16 clubs with date of birth, citizenship, height, photo and the 2026 statistics
// of every player; club stadium, colours, crest and head coach. Answers are cached in data/raw/fnl/.
//
// There are no market valuations at this level, so the rating is a model: the level of the division,
// the club's real points per game this season, the player's share of the minutes and his age; the
// attributes are shaped by the same formulas as everyone else (ratings.mjs). Contracts and wages are a
// model too. Players already in the world (registered at a club of the higher leagues) are not duplicated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOn, buildAttrs, clamp, rnd } from './ratings.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw', 'fnl');
const WORLD = path.join(ROOT, 'public', 'data', 'world.json');
const API = 'https://fnl-app.fnl.pro/api/v1';
const IMG = 'https://s3.fnl.pro:9000';
const LEAGUE = 300; // LEON — Second League, division B
const SEASON = 14034, SEASON_PREV = 13897; // 2026, 2025
const GROUP = 'Группа 3';
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

// ---------------------------------------------------------------- clubs of the group
const groupOf = async (season) => (await get(`/info/groupsBySeason?leagueId=${LEAGUE}&seasonId=${season}`)).find((g) => g.name === GROUP).id;
const rank = async (season, type) => (await get(`/center/rank?leagueId=${LEAGUE}&seasonId=${season}&groupId=${await groupOf(season)}&type=${type}`)).teams;
const table = await rank(SEASON, 'ALL');
if (table.length !== 16) throw new Error(`Expected 16 clubs, got ${table.length}`);

// Short ids of the game (unique among all clubs) and Latin names.
const ID = {
  'avangard': ['AVK', 'Avangard Kursk'], 'arsenal-2': ['AT2', 'Arsenal-2 Tula'], 'volna': ['VNN', 'Volna Nizhny Novgorod Oblast'], 'zenit-penza': ['ZPZ', 'Zenit Penza'],
  'kvant': ['KVO', 'Kvant Obninsk'], 'metallurg': ['MLP', 'Metallurg Lipetsk'], 'orel': ['ORL', 'Oryol'], 'rodina-3': ['RO3', 'Rodina-3 Moscow'],
  'rotor-2': ['RT2', 'Rotor-2 Volgograd'], 'ryazan': ['RZN', 'Ryazan'], 'salyut-belgorod': ['SLB', 'Salyut Belgorod'], 'saturn': ['SAT', 'Saturn Ramenskoye'],
  'ska-habarovsk-2': ['SK2', 'SKA-Khabarovsk-2'], 'spartak-tambov': ['SPT', 'Spartak Tambov'], 'strogino': ['SGN', 'Strogino Moscow'], 'shumbrat': ['SHB', 'Shumbrat Saransk'],
};
const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const taken = new Set(world.teams.filter((t) => t.lg !== 'L2B').map((t) => t.id));
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
const SPECIAL = { ё: 'е' };
const nkey = (s) => (s ?? '').toLowerCase().replace(/ё/g, (c) => SPECIAL[c]).replace(/[^а-яa-z]/g, '');
const existing = new Map();
for (const p of world.players) if (p.ru && p.bd && (p.id < 20_000_000 || p.id >= 21_000_000)) existing.set(`${p.bd}|${nkey(p.ru.split(' ').slice(-1)[0])}`, p);

const teams = [], players = [];
let skipped = 0, scorer = 0;
for (const row of table) {
  const [id, name] = ID[row.teamSlug] ?? [];
  if (!id) throw new Error(`No id for ${row.teamSlug}`);
  if (taken.has(id)) throw new Error(`Id ${id} is taken`);
  const info = await get(`/team/info?leagueId=${LEAGUE}&teamId=${row.teamId}&seasonId=${SEASON}`);
  const coach = (await get(`/team/trainers?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=${row.teamId}`)).trainers.find((t) => /Главный/.test(t.post)) ?? null;
  const squad = (await get(`/team/players?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=${row.teamId}`)).players;
  const col = colors.find((c) => c.teamId === row.teamId);
  // Real strength this season: points per game around the average of the division.
  const ppg = row.score / Math.max(1, row.allGame);
  const games = row.allGame;
  const rot = {};
  const mine = [];
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
    const dup = existing.get(`${bd}|${nkey(last)}`);
    if (dup) { skipped++; continue; } // already in the world at a club of a higher league
    const ctry = CTRY[pi.citizenship] ?? (pi.citizenship ? (unknownCtry.set(pi.citizenship, (unknownCtry.get(pi.citizenship) ?? 0) + 1), 'RUS') : 'RUS');
    const k = `${id}:${s.post}`;
    rot[k] = (rot[k] ?? 0) + 1;
    const role = ROLES[s.post][(rot[k] - 1) % ROLES[s.post].length];
    const min = v(-2), g = v(196), a = v(393), yc = v(-264), rc = v(-273);
    scorer = Math.max(scorer, g);
    mine.push({
      id: 20_000_000 + s.playerId, fn: lat(first), ln: lat(last), ru: `${first} ${last}`.trim(), role, bd, ctry, ht: pi.height || null, num: s.num || null,
      img: s.photoUrl ? IMG + s.photoUrl : null, team: id, min, share: min / Math.max(90, games * 90), g, a, yc, rc, ppg,
    });
  }
  players.push(...mine);
  const rgb = /^#[0-9a-f]{6}$/i.test(col?.color ?? '') ? col.color.toUpperCase() : '#1E4FA3';
  teams.push({
    id, lg: 'L2B', name, ru: row.teamName.replace(/\s*\(.*\)$/, '').replace(/^Орел$/, 'Орёл'), short: id, country: 'RUS', primary: rgb, secondary: /^#[0-9a-f]{6}$/i.test(col?.colorAlt ?? '') ? col.colorAlt.toUpperCase() : '#FFFFFF',
    stadium: (info.stadium ?? '').replace(/[«»]/g, ''), cap: info.stadiumCapacity || 3000, coach: coach ? coach.name.split(' ').slice(0, 2).reverse().join(' ') : 'Главный тренер',
    logo: info.logoUrl ? IMG + info.logoUrl : null, city: info.city ?? row.teamName,
  });
}
// Names of clubs that share a name with a club of a higher league get their city ("Зенит Пенза").
for (const t of teams) if (world.teams.some((x) => x.lg !== 'L2B' && x.ru === t.ru)) t.ru = `${t.ru} ${t.city.replace(/^г\.\s*/, '')}`;

// ---------------------------------------------------------------- ratings (a model: no valuations at this level)
const TIER = 53;
const out = players.map((p) => {
  const a = ageOn(p.bd);
  let base = TIER + clamp((p.ppg - 1.4) * 8, -8, 8);
  base += p.share >= 0.6 ? 2.5 : p.share >= 0.35 ? 1.5 : p.share >= 0.12 ? 0 : -3;
  base += a < 20 ? -(20 - a) * 1.4 : a > 32 ? -(a - 32) * 1.2 : a >= 25 && a <= 30 ? 1 : 0;
  base += (rnd(p.id, 'lvl') - 0.5) * 5;
  if (p.role === 'GK') base += 1;
  const ovr = clamp(Math.round(base), 42, 70);
  const src = { id: p.id, role: p.role, bd: p.bd, ht: p.ht, hist: [{ season: 2025, min: p.min, g: p.g, a: p.a, yc: p.yc, rc: p.rc }] };
  const room = clamp((99 - ovr) / 22, 0.25, 1);
  const pot = clamp(Math.round(a <= 21 ? ovr + (clamp((24 - a) * 1.7, 3, 14) + rnd(p.id, 'pot') * 3) * room : a <= 25 ? ovr + ((26 - a) * 0.9 + rnd(p.id, 'pot') * 2) * room : ovr), ovr, 90);
  const val = Math.round((1e5 * Math.pow(10, (ovr + 0.3 * (pot - ovr) - 58 - (a > 28 ? Math.min(7, a - 28) : 0)) / 10)) / 25000) * 25000;
  const until = 2027 + Math.floor(rnd(p.id, 'until') * (a >= 30 ? 1 : 2));
  return {
    id: p.id, fn: p.fn, ln: p.ln, ru: p.ru, role: p.role, foot: rnd(p.id, 'foot') < 0.24 ? 'L' : 'R', bd: p.bd, c: p.ctry, ...(p.ht ? { ht: p.ht } : {}),
    ...(p.img ? { iu: p.img } : {}), ...(p.num ? { n: p.num } : {}), t: p.team, o: ovr, p: pot, r: buildAttrs(src, ovr), v: Math.max(25_000, val),
    w: Math.max(12_000, Math.round((20_000 * Math.exp((ovr - 55) * 0.185) * 0.2) / 1000) * 1000), u: until,
  };
});

const outTeams = teams.map((t) => {
  const sq = out.filter((p) => p.t === t.id);
  const best = [...sq].sort((a, b) => b.o - a.o).slice(0, 14);
  const lvl = best.reduce((s, p) => s + p.o, 0) / Math.max(1, best.length);
  const wages = sq.reduce((s, p) => s + p.w, 0);
  return {
    id: t.id, lg: 'L2B', name: t.name, ru: t.ru, short: t.short, country: 'RUS', primary: t.primary, secondary: t.secondary, stadium: t.stadium, cap: t.cap,
    rep: clamp(Math.round(18 + (lvl - 50) * 1.3), 15, 35), coach: { name: t.coach, rating: clamp(Math.round(lvl + 2 + (rnd(t.id, 'coach') - 0.5) * 6), 50, 70) },
    budget: Math.round((150_000 + (lvl - 50) * 25_000) / 25_000) * 25_000, wages, ...(t.logo ? { logo: t.logo } : {}),
  };
});

world.teams = world.teams.filter((t) => t.lg !== 'L2B').concat(outTeams);
world.players = world.players.filter((p) => p.id < 20_000_000 || p.id >= 21_000_000).concat(out);
world.leagues.L2B = { name: 'Вторая лига Б, группа 3', country: 'RUS', tier: 4, teams: outTeams.map((t) => t.id) };
world.facts.champions.L2B = null;
fs.writeFileSync(WORLD, JSON.stringify(world));

// ---------------------------------------------------------------- the real numbers the engine is calibrated to
const real = [];
for (const season of [SEASON_PREV, SEASON]) {
  const all = await rank(season, 'ALL'), home = await rank(season, 'HOME');
  const gp = all.reduce((s, t) => s + t.allGame, 0) / 2;
  const scale = 30 / Math.max(...all.map((t) => t.allGame));
  real.push({
    season, gpm: all.reduce((s, t) => s + t.scoredGoal, 0) / gp, home: home.reduce((s, t) => s + t.win, 0) / gp, draw: all.reduce((s, t) => s + t.draw, 0) / 2 / gp,
    champ: Math.max(...all.map((t) => t.score)) * scale, last: Math.min(...all.map((t) => t.score)) * scale, n: all.length,
  });
}
console.log(`Second League B, group 3: ${outTeams.length} clubs, ${out.length} players (${skipped} skipped: already in the world or no birthday)`);
if (unknownCtry.size) console.log('Unknown citizenship (counted as RUS):', [...unknownCtry]);
for (const t of outTeams) {
  const sq = out.filter((p) => p.t === t.id).sort((a, b) => b.o - a.o);
  console.log(`  ${t.id} ${t.ru}: ${sq.length} players, best XI ${(sq.slice(0, 11).reduce((s, p) => s + p.o, 0) / 11).toFixed(1)}, GK ${sq.filter((p) => p.role === 'GK').length}, coach ${t.coach.name}`);
}
for (const r of real) console.log(`Real ${r.season === SEASON ? 2026 : 2025} (${r.n} clubs): goals/match ${r.gpm.toFixed(2)}, home wins ${r.home.toFixed(3)}, draws ${r.draw.toFixed(3)}, champion ${r.champ.toFixed(0)} pts/30, last ${r.last.toFixed(0)} pts/30`);
console.log(`Top scorer 2026 (26 rounds): ${scorer} goals`);
