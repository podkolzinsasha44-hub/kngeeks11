// Photos for real players who have none in public/data/world.json. Run after the other build scripts.
//
// 1. First League (and anyone who played there): the open API of the league's site fnl.pro — squads with photos,
//    matched by the Russian first name and surname.
// 2. Players known to Transfermarkt by id: the portrait from their profile (the datasets miss newer photos).
// 3. Players from Wikipedia squads without a Transfermarkt id: Transfermarkt's quick search by name; a photo is
//    taken only when the profile's date of birth is exactly the player's — never a look-alike.
// Answers are cached in data/raw/photos/, so a second run makes no requests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw', 'photos');
const WORLD = path.join(ROOT, 'public', 'data', 'world.json');
const FNL = 'https://fnl-app.fnl.pro/api/v1';
const FNL_IMG = 'https://s3.fnl.pro:9000';
const TM = 'https://www.transfermarkt.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(RAW, { recursive: true });

async function get(url, { json = false, pause = 150 } = {}) {
  const f = path.join(RAW, url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 200) + (json ? '.json' : '.html'));
  if (fs.existsSync(f)) return json ? JSON.parse(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8');
  // curl, not fetch: Transfermarkt answers Node's own client with 403.
  for (let i = 0; i < 4; i++) {
    const r = spawnSync('curl', ['-sSL', '-m', '30', '-A', UA, '-H', 'Accept-Language: en', '-w', '\n%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const out = r.stdout ?? '';
    const cut = out.lastIndexOf('\n');
    const code = Number(out.slice(cut + 1)), t = out.slice(0, cut);
    if (code === 200) {
      fs.writeFileSync(f, t);
      await sleep(pause);
      return json ? JSON.parse(t) : t;
    }
    if (code === 404) { fs.writeFileSync(f, json ? 'null' : ''); return json ? null : ''; }
    await sleep(2000 * (i + 1));
  }
  return json ? null : '';
}

const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const missing = () => world.players.filter((p) => !p.im && !p.iu);
const norm = (s) => (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]/g, '');
const before = missing().length;
const got = { fnl: 0, tmId: 0, tmSearch: 0 };

// ---------------------------------------------------------------- 1. fnl.pro squads
const fnlPhotos = new Map(); // "surname|first" -> url (null when two different players share the key)
for (const [league, seasons] of [[100, ['1066', '1024']], [200, ['1184']]]) {
  for (const season of seasons) {
    const teams = (await get(`${FNL}/info/teamsBySeason?leagueId=${league}&seasonId=${season}`, { json: true })) ?? [];
    for (const t of teams) {
      const sq = (await get(`${FNL}/team/players?leagueId=${league}&seasonId=${season}&teamId=${t.teamId}`, { json: true }))?.players ?? [];
      for (const s of sq) {
        if (!s.photoUrl || !s.playerName) continue;
        const [last, first] = s.playerName.split(/\s+/);
        const key = `${norm(last)}|${norm(first)}`;
        const url = FNL_IMG + s.photoUrl;
        if (!fnlPhotos.has(key)) fnlPhotos.set(key, { url, id: s.playerId });
        else if (fnlPhotos.get(key) && fnlPhotos.get(key).id !== s.playerId) fnlPhotos.set(key, null);
      }
    }
  }
}
for (const p of missing()) {
  if (!p.ru) continue;
  const parts = p.ru.split(/\s+/);
  const hit = fnlPhotos.get(`${norm(parts.slice(1).join(''))}|${norm(parts[0])}`);
  if (hit) { p.iu = hit.url; got.fnl++; }
}

// ---------------------------------------------------------------- 2–3. Transfermarkt
// The profile's own portrait (og:image), not the faces of other players on the page; "default" is no photo.
const portrait = (html) => {
  const m = /og:image" content="[^"]*portrait\/(?:big|header|medium)\/(\d+)-(\d+)\.(\w+)/.exec(html);
  return m ? { id: Number(m[1]), file: `${m[2]}.${m[3]}` } : null;
};
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const birth = (html) => {
  const m = /itemprop="birthDate"[^>]*>\s*([^<(]+)/.exec(html);
  if (!m) return null;
  const s = m[1].trim();
  let d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (d) return `${d[3]}-${d[2]}-${d[1]}`;
  d = /^(\w{3}) (\d{1,2}), (\d{4})$/.exec(s);
  if (d && MONTHS[d[1]]) return `${d[3]}-${String(MONTHS[d[1]]).padStart(2, '0')}-${d[2].padStart(2, '0')}`;
  return null;
};
const tmUrl = (ph) => `https://img.a.transfermarkt.technology/portrait/big/${ph.id}-${ph.file}?lm=1`;

for (const p of missing()) {
  if (p.id >= 9_000_000) continue;
  const ph = portrait(await get(`${TM}/x/profil/spieler/${p.id}`, { pause: 1200 }));
  if (!ph) continue;
  if (ph.id === p.id) p.im = ph.file; else p.iu = tmUrl(ph);
  got.tmId++;
}

for (const p of missing()) {
  if (p.id < 9_000_000 || p.id >= 20_000_000 || !p.bd) continue;
  const html = await get(`${TM}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(`${p.fn ?? ''} ${p.ln}`.trim())}`, { pause: 1200 });
  const ids = [...new Set([...html.matchAll(/\/[a-z0-9-]+\/profil\/spieler\/(\d+)/g)].map((m) => Number(m[1])))].slice(0, 6);
  for (const id of ids) {
    const prof = await get(`${TM}/x/profil/spieler/${id}`, { pause: 1200 });
    const bd = birth(prof);
    // The exact date of birth, or only the year when the game itself knows no more.
    if (!bd || (p.ab ? bd.slice(0, 4) !== p.bd.slice(0, 4) : bd !== p.bd)) continue;
    const ph = portrait(prof);
    if (ph && ph.id === id) { p.iu = tmUrl(ph); got.tmSearch++; }
    break;
  }
}

fs.writeFileSync(WORLD, JSON.stringify(world));
console.log(`Photos: ${before} missing → ${missing().length} (fnl.pro ${got.fnl}, Transfermarkt by id ${got.tmId}, by search ${got.tmSearch})`);
