/* Predicción de marcador de cada partido: se guarda la última antes del salto inicial
   y, cuando termina, se compara con el resultado real (aunque no haya pick). */
const { readJSON, writeJSON } = require('./lib/util');

/* games: partidos de today.json (id, start, home/away con name, model.ptsH/ptsA) */
function update(file, games, now) {
  const db = readJSON(file, {});
  for (const g of games) {
    if (!g.model || g.model.ptsH == null || Date.parse(g.start) <= now) continue;     // solo antes de empezar
    db[g.id] = { start: g.start, home: g.home.name, away: g.away.name, ptsH: Math.round(g.model.ptsH), ptsA: Math.round(g.model.ptsA) };
  }
  writeJSON(file, db, true);
  return db;
}

/* cruza con los resultados oficiales → lista (más reciente primero) + resumen */
function settle(db, byId) {
  const list = Object.entries(db).map(([id, p]) => {
    const g = byId[id];
    if (!g || g.status !== 'final' || g.hs == null) return null;
    const errH = Math.abs(p.ptsH - g.hs), errA = Math.abs(p.ptsA - g.as);
    return { id, start: p.start, match: `${p.home} – ${p.away}`, pred: `${p.ptsH}-${p.ptsA}`, real: `${g.hs}-${g.as}`,
      winner: (p.ptsH > p.ptsA) === (g.hs > g.as), exact: !errH && !errA, close: errH <= 5 && errA <= 5,
      diff: Math.abs((p.ptsH + p.ptsA) - (g.hs + g.as)) };
  }).filter(Boolean).sort((a, b) => b.start.localeCompare(a.start));
  const n = list.length, cnt = k => list.filter(x => x[k]).length;
  return { stats: { n, winner: cnt('winner'), close: cnt('close'), exact: cnt('exact'), diff: n ? Math.round(list.reduce((s, x) => s + x.diff, 0) / n * 10) / 10 : null }, list };
}

module.exports = { update, settle };
