/* ============================================================
   HOOPVALUE — liquidación de picks (lecciones de acevalue/golvalue)
   ------------------------------------------------------------
   1. Se liquida SIEMPRE por el código oficial del partido de la Euroliga,
      nunca comparando nombres o apellidos.
   2. Un pick NUNCA se borra: o se liquida (W/L/P) o se anula (V).
      · partido aplazado/cancelado o sin resultado 7 días después → V
      · prop de un jugador que no juega → V (regla habitual de las casas)
   3. Ganador y hándicap/total incluyen la prórroga (regla estándar del
      mercado «ganador del partido» en baloncesto). OJO: el 1X2 a tiempo
      reglamentario es otro mercado; no lo usamos.
   4. El historial completo se guarda; la web muestra lo que quiera.
   ============================================================ */
const { DAY } = require('./lib/util');

function result(p, g) {
  const m = g.hs - g.as, t = g.hs + g.as;
  if (p.market === 'ml') return (p.side === 'home') === (m > 0) ? 'W' : 'L';
  if (p.market === 'spread') { const v = (p.side === 'home' ? m : -m) + p.line; return v > 0 ? 'W' : v < 0 ? 'L' : 'P'; }
  if (p.market === 'total') { const v = p.side === 'over' ? t - p.line : p.line - t; return v > 0 ? 'W' : v < 0 ? 'L' : 'P'; }
  if (p.market === 'prop') {
    const row = (g.players || []).find(r => String(r[0]) === String(p.playerId));
    if (!row) return 'V';                                         // no jugó → anulada (regla de las casas)
    const val = { pts: row[6], reb: row[7], ast: row[8], tpm: row[9], pra: row[6] + row[7] + row[8], pr: row[6] + row[7], pa: row[6] + row[8], ra: row[7] + row[8] }[p.stat];
    const v = p.side === 'over' ? val - p.line : p.line - val;
    return v > 0 ? 'W' : v < 0 ? 'L' : 'P';
  }
  return null;
}

/* pending: lista de picks pendientes · gamesById: histórico · devuelve {still, settled} */
function settleAll(pending, gamesById, now = Date.now()) {
  const still = [], settled = [];
  for (const p of pending) {
    const g = gamesById[p.gameId];
    const start = Date.parse(p.start);
    if (g && g.status === 'final' && g.hs != null && (p.market !== 'prop' || (g.players && g.players.length))) {
      const r = result(p, g);
      if (r) { settled.push({ ...p, result: r, score: `${g.hs}-${g.as}`, settledAt: new Date(now).toISOString() }); continue; }
    }
    if ((g && g.status === 'postponed' && now - start > DAY) || now - start > 7 * DAY) {
      settled.push({ ...p, result: 'V', note: g && g.status === 'postponed' ? 'aplazado' : 'sin resultado oficial en 7 días', settledAt: new Date(now).toISOString() });
      continue;
    }
    still.push(p);
  }
  return { still, settled };
}

/* resumen del historial: aciertos, ROI (stake 1) y CLV medio por mercado y nivel */
function stats(record) {
  const sum = list => {
    const s = list.filter(x => x.result === 'W' || x.result === 'L');
    const w = s.filter(x => x.result === 'W').length;
    const profit = s.reduce((a, x) => a + (x.result === 'W' ? x.odd - 1 : -1), 0);
    return { n: s.length, w, l: s.length - w, push: list.filter(x => x.result === 'P').length, void: list.filter(x => x.result === 'V').length,
      hit: s.length ? +(w / s.length).toFixed(3) : null, profit: +profit.toFixed(2), roi: s.length ? +(profit / s.length).toFixed(3) : null,
      clv: (c => c.length ? +(c.reduce((a, x) => a + x, 0) / c.length).toFixed(4) : null)(list.filter(x => x.clv != null).map(x => x.clv)) };
  };
  const by = (key, vals) => Object.fromEntries(vals.map(v => [v, sum(record.filter(x => x[key] === v))]));
  return { all: sum(record), market: by('market', ['ml', 'spread', 'total', 'prop']), tier: by('tier', ['A', 'B', 'C']),
    last30: sum(record.filter(x => Date.now() - Date.parse(x.start) < 30 * DAY)) };
}

module.exports = { settleAll, stats, result };
