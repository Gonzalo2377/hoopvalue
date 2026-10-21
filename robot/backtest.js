/* ============================================================
   HOOPVALUE — backtest de la Euroliga
   ------------------------------------------------------------
   Recorre los partidos guardados en orden. Para cada jornada calcula
   las valoraciones SOLO con partidos anteriores (sin mirar el futuro)
   y predice. Mide:
     · acierto del ganador y error medio en margen y total
     · calibración: cuando el modelo dice 70 %, ¿gana el 70 %?
     · motor de picks contra cuotas reales, en los partidos que ya
       tengan cuota de cierre guardada (se irá llenando solo)
   Guarda:
     data/model-params.json    → desviaciones típicas calibradas
     public/data/backtest.json → informe para la web
   Uso: node robot/backtest.js
   ============================================================ */
const path = require('path');
const { ROOT, writeJSON, readJSON, mean, sd, round, phi } = require('./lib/util');
const H = require('./history');
const { teamRows, rate } = require('./model/ratings');
const { predictGame, modelWeight } = require('./model/game');
const { teamTrends, headToHead } = require('./model/trends');
const P = require('./model/picks');
const { result } = require('./settle');

const PARAMS_FILE = path.join(ROOT, 'data', 'model-params.json');
const LG = 'euroleague';

function summarize(list) {
  const s = list.filter(x => x.res !== 'P');
  const w = s.filter(x => x.res === 'W').length;
  const profit = s.reduce((a, x) => a + (x.res === 'W' ? x.odd - 1 : -1), 0);
  return { n: s.length, w, hit: s.length ? round(w / s.length, 3) : null, roi: s.length ? round(profit / s.length, 3) : null,
    avgOdd: s.length ? round(mean(s.map(x => x.odd)), 2) : null, avgP: s.length ? round(mean(s.map(x => x.pFinal)), 3) : null };
}

function run(sig) {
  const { games } = H.allGames();
  const rows = teamRows(games);
  const finals = games.filter(g => g.status === 'final' && g.hs != null && g.box);
  const byDay = {};
  finals.forEach(g => { (byDay[g.date.slice(0, 10)] = byDay[g.date.slice(0, 10)] || []).push(g); });
  const out = { resid: { margin: [], total: [] }, acc: [], calib: [], picks: [], bySeason: {} };
  for (const d of Object.keys(byDay).sort()) {
    const asOf = Math.min(...byDay[d].map(g => Date.parse(g.date)));   // ningún partido entra en su propia valoración
    const season = byDay[d][0].season;
    const R = rate(rows, asOf, LG, season);
    if (!R) continue;
    for (const g of byDay[d]) {
      const h = R.teams[g.home], a = R.teams[g.away];
      if (!h || !a || h.weight < 4 || a.weight < 4) continue;
      const t0 = Date.parse(g.date);
      const tH = teamTrends(games, g.home, t0, season), tA = teamTrends(games, g.away, t0, season);
      const pred = predictGame(R, g.home, g.away, g.neutral, { tH, tA });
      if (!pred) continue;
      out.resid.margin.push((g.hs - g.as) - pred.margin); out.resid.total.push((g.hs + g.as) - pred.total);
      const pH = phi(pred.margin / sig.margin), ok = (pH > 0.5) === (g.hs > g.as);
      out.acc.push(ok ? 1 : 0); out.calib.push({ p: Math.max(pH, 1 - pH), win: ok });
      (out.bySeason[season] = out.bySeason[season] || []).push(ok ? 1 : 0);
      if (!g.line) continue;
      const cands = P.evaluate({ game: { id: g.id, homeName: g.home, awayName: g.away }, pred, sig, mk: P.marketFromLine(g.line),
        trends: { home: tH, away: tA }, ctx: { injH: 0, injA: 0, h2h: headToHead(games, g.home, g.away, t0), homeCode: g.home, awayCode: g.away, pace: pred.pace - R.Lp },
        wModel: modelWeight(tH.gp, tA.gp) });
      const best = cands.find(c => c.qualifies);
      if (best) out.picks.push({ ...best, res: result(best, g) });
    }
  }
  return out;
}

(async () => {
  const params = readJSON(PARAMS_FILE, {});
  /* 1ª pasada: calibrar desviaciones típicas con los errores reales */
  const first = run({ margin: 11.5, total: 15 });
  if (first.resid.margin.length < 50) { console.log(`· pocos partidos para backtest (${first.resid.margin.length}). Ejecuta antes: node robot/backfill.js`); return; }
  const sig = { margin: round(sd(first.resid.margin), 2), total: round(sd(first.resid.total), 2) };
  params.euroleague = { ...sig, bias: { margin: round(mean(first.resid.margin), 2), total: round(mean(first.resid.total), 2) }, games: first.resid.margin.length, updatedAt: new Date().toISOString() };
  /* 2ª pasada con las desviaciones calibradas */
  const r = run(sig);
  const rep = {
    generatedAt: new Date().toISOString(), games: r.resid.margin.length, sig,
    mae: { margin: round(mean(r.resid.margin.map(Math.abs)), 2), total: round(mean(r.resid.total.map(Math.abs)), 2) },
    winnerAccuracy: round(mean(r.acc), 3),
    bySeason: Object.fromEntries(Object.entries(r.bySeason).map(([s, xs]) => [s, { n: xs.length, acc: round(mean(xs), 3) }])),
    calibration: [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([a, b]) => {
      const xs = r.calib.filter(c => c.p >= a && c.p < b);
      return { range: `${Math.round(a * 100)}-${Math.min(100, Math.round(b * 100))}%`, n: xs.length,
        expected: xs.length ? round(mean(xs.map(x => x.p)), 3) : null, actual: xs.length ? round(xs.filter(x => x.win).length / xs.length, 3) : null };
    }),
    picks: r.picks.length ? { all: summarize(r.picks), byTier: Object.fromEntries(['A', 'B', 'C'].map(t => [t, summarize(r.picks.filter(p => P.tier(p.safety) === t))])),
      byMarket: Object.fromEntries(['ml', 'spread', 'total'].map(m => [m, summarize(r.picks.filter(p => p.market === m))])) } : null,
  };
  writeJSON(PARAMS_FILE, params, true);
  writeJSON(path.join(ROOT, 'public', 'data', 'backtest.json'), rep, true);
  console.log(`· ${rep.games} partidos · acierto ganador ${(rep.winnerAccuracy * 100).toFixed(1)} % · σ margen ${sig.margin} · σ total ${sig.total} · error medio margen ${rep.mae.margin}`);
  console.log(`  por temporada ${JSON.stringify(rep.bySeason)}`);
  console.log(`  calibración ${JSON.stringify(rep.calibration)}`);
  console.log(rep.picks ? `  picks con cuota real: ${JSON.stringify(rep.picks.all)}` : '  picks: aún no hay cuotas de cierre guardadas');
})();
