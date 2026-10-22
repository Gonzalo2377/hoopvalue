/* ============================================================
   EUROPICKS — histórico de la NBA (data/history/nba-<temporada>.json)
   Mismo formato que el de la Euroliga: { teams, games }.
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { ROOT, readJSON, writeJSON, DAY, ymd } = require('./lib/util');
const { pool } = require('./lib/http');
const nba = require('./sources/espn-nba');

const DIR = path.join(ROOT, 'data', 'history');
const file = season => path.join(DIR, `nba-${season}.json`);
const load = season => { const d = readJSON(file(season), null) || {}; return { teams: d.teams || {}, games: d.games || {} }; };
const save = (season, db) => writeJSON(file(season), db);

function allGames() {
  const games = [], teams = {};
  if (!fs.existsSync(DIR)) return { games, teams };
  fs.readdirSync(DIR).filter(f => /^nba-.*\.json$/.test(f)).sort().forEach(f => {
    const d = readJSON(path.join(DIR, f), {});
    Object.assign(teams, d.teams || {});
    Object.values(d.games || {}).forEach(g => games.push(g));
  });
  games.sort((a, b) => a.date < b.date ? -1 : 1);
  return { games, teams };
}

function upsert(db, g) {
  const { _teams, ...game } = g;
  (_teams || []).forEach(t => { db.teams[t.code] = Object.assign(db.teams[t.code] || {}, t); });
  db.games[game.id] = Object.assign(db.games[game.id] || {}, game);
}
const needsDetail = g => g.status === 'final' && (!g.box || !g.players || !g.players.length);

/* recorre los días [from, to] y completa los boxscores de los partidos terminados */
async function sync(fromISO, toISO) {
  const days = [];
  for (let t = Date.parse(fromISO); t <= Date.parse(toISO); t += DAY) days.push(ymd(t));
  const dbs = new Map(), getDb = s => { if (!dbs.has(s)) dbs.set(s, load(s)); return dbs.get(s); };
  let seen = 0;
  await pool(days, 4, async d => { ((await nba.dayGames(d)) || []).forEach(g => { upsert(getDb(g.season), g); seen++; }); });
  const pending = [];
  dbs.forEach(db => Object.values(db.games).forEach(g => { if (needsDetail(g)) pending.push(g); }));
  let done = 0;
  await pool(pending, 6, async g => { const det = await nba.gameDetail(g.id); if (det) { Object.assign(g, det); done++; } });
  dbs.forEach((db, s) => save(s, db));
  console.log(`· NBA ${fromISO.slice(0, 10)}→${toISO.slice(0, 10)}: ${seen} partidos · ${done}/${pending.length} boxscores nuevos`);
}

function setLine(season, gameId, line) { const db = load(season); if (db.games[gameId]) { db.games[gameId].line = line; save(season, db); } }

module.exports = { load, save, allGames, sync, setLine };
