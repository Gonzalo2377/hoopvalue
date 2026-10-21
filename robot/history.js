/* ============================================================
   HOOPVALUE — base de datos histórica de la Euroliga
   ------------------------------------------------------------
   data/history/euroleague-<temporada>.json
     { teams: { CODE: {name, short, logo, alias} },
       games: { id: {fecha, equipos, marcador, cuartos, box, jugadores, línea} } }
   Es la memoria de la web: modelo, tendencias y backtest salen de
   aquí. Nunca se recorta.
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { ROOT, readJSON, writeJSON } = require('./lib/util');
const { sleep } = require('./lib/http');
const el = require('./sources/euroleague');

const DIR = path.join(ROOT, 'data', 'history');
const file = season => path.join(DIR, `euroleague-${season}.json`);

function load(season) {
  const d = readJSON(file(season), null) || {};
  return { teams: d.teams || {}, games: d.games || {} };
}
function save(season, db) { writeJSON(file(season), db); }

/* todas las temporadas guardadas, partidos ordenados por fecha */
function allGames() {
  const games = [], teams = {};
  if (!fs.existsSync(DIR)) return { games, teams };
  fs.readdirSync(DIR).filter(f => /^euroleague-.*\.json$/.test(f)).sort().forEach(f => {
    const d = readJSON(path.join(DIR, f), {});
    Object.assign(teams, d.teams || {});
    Object.values(d.games || {}).forEach(g => games.push(g));
  });
  games.sort((a, b) => a.date < b.date ? -1 : 1);
  return { games, teams };
}

/* fusiona un partido con lo que ya teníamos (sin perder el detalle) */
function upsert(db, g) {
  const { _teams, ...game } = g;
  (_teams || []).forEach(t => { db.teams[t.code] = Object.assign(db.teams[t.code] || {}, t); });
  db.games[game.id] = Object.assign(db.games[game.id] || {}, game);
  return db.games[game.id];
}

const needsDetail = g => g.status === 'final' && (!g.box || !g.players || !g.players.length);

/* calendario completo de una temporada + boxscores que falten.
   La API oficial bloquea si se le pide deprisa (HTTP 429): vamos de uno en
   uno con pausa, guardamos cada 25 y, si falla 3 veces seguidas, paramos
   limpio. La siguiente ejecución sigue donde se quedó. */
async function sync(code, { pauseMs = 250 } = {}) {
  const season = el.seasonKey(code);
  const db = load(season);
  const list = await el.seasonGames(code);
  if (!list) { console.log(`· Euroliga ${code}: API no disponible`); return { seen: 0, details: 0 }; }
  list.forEach(g => upsert(db, g));
  save(season, db);
  const pending = Object.values(db.games).filter(needsDetail).sort((a, b) => a.date < b.date ? 1 : -1);   // primero lo más reciente
  let done = 0, fails = 0;
  for (const g of pending) {
    const det = await el.gameDetail(code, g.gameCode, g.home);
    if (det) { Object.assign(g, det); done++; fails = 0; } else if (++fails >= 3) { console.log('  · la API no responde: se continúa en la próxima ejecución'); break; }
    if (done && done % 25 === 0) save(season, db);
    await sleep(pauseMs);
  }
  save(season, db);
  console.log(`· Euroliga ${code}: ${list.length} partidos · ${done}/${pending.length} boxscores nuevos`);
  return { seen: list.length, details: done };
}

/* anota la línea de cierre (nuestro histórico de cuotas) en el partido */
function setLine(season, gameId, line) {
  const db = load(season);
  if (!db.games[gameId]) return;
  db.games[gameId].line = line;
  save(season, db);
}

module.exports = { load, save, allGames, upsert, sync, setLine, DIR };
