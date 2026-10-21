/* ============================================================
   HOOPVALUE — valoraciones de equipo ajustadas por rival
   ------------------------------------------------------------
   Para cada equipo estima, con los partidos ANTERIORES a una fecha:
     off  → puntos por 100 posesiones por encima de la media (ataque)
     def  → puntos por 100 que concede por encima de la media
            (positivo = peor defensa)
     pace → posesiones por partido por encima de la media
   Ajustado por la calidad del rival (iterativo) y por la cancha.
   Los partidos recientes pesan más (vida media configurable) y
   los de la temporada anterior pesan menos (los equipos cambian).
   ============================================================ */
const { DAY } = require('../lib/util');

const DEFAULTS = {
  euroleague: { halfLife: 50, prevSeasonFactor: 0.35, shrink: 3, hcaPrior: 3.2 },   // hca en puntos de margen
};

/* posesiones estimadas de un equipo en un partido */
const poss = b => b.fga + 0.44 * b.fta - b.oreb + b.tov;

/* filas por equipo y partido, listas para el ajuste */
function teamRows(games) {
  const rows = [];
  for (const g of games) {
    if (g.status !== 'final' || !g.box || !g.box.h || !g.box.a || g.hs == null) continue;
    const p = (poss(g.box.h) + poss(g.box.a)) / 2;
    if (!(p > 50)) continue;
    const t = Date.parse(g.date);
    rows.push({ t, season: g.season, team: g.home, opp: g.away, home: g.neutral ? 0 : 1, pts: g.hs, against: g.as, poss: p, id: g.id });
    rows.push({ t, season: g.season, team: g.away, opp: g.home, home: g.neutral ? 0 : -1, pts: g.as, against: g.hs, poss: p, id: g.id });
  }
  return rows;
}

/* valoraciones a fecha `asOf` (ms). rows = teamRows(todos los partidos) */
function rate(rows, asOf, league, season) {
  const P = DEFAULTS[league] || DEFAULTS.euroleague;
  const use = rows.filter(r => r.t < asOf);
  if (!use.length) return null;
  const w = r => Math.pow(0.5, (asOf - r.t) / DAY / P.halfLife) * (r.season === season ? 1 : P.prevSeasonFactor);
  use.forEach(r => { r.w = w(r); r.ortg = r.pts / r.poss * 100; });
  const W = use.reduce((s, r) => s + r.w, 0);
  const L = use.reduce((s, r) => s + r.w * r.ortg, 0) / W;          // eficiencia media de la liga
  const Lp = use.reduce((s, r) => s + r.w * r.poss, 0) / W;         // ritmo medio
  /* ventaja de campo: diferencia media local-visitante (en puntos/100), encogida hacia el valor típico */
  let hs = 0, hw = 0;
  use.forEach(r => { if (r.home === 1) { hs += r.w * (r.ortg - (r.against / r.poss * 100)); hw += r.w; } });
  const hcaPer100Prior = P.hcaPrior / Lp * 100;
  const hca = (hs + hcaPer100Prior * 20) / (hw + 20);                 // puntos/100 de margen a favor del local

  const teams = [...new Set(use.map(r => r.team))];
  const off = {}, def = {}, pace = {}, gp = {}, wsum = {};
  teams.forEach(t => { off[t] = 0; def[t] = 0; pace[t] = 0; gp[t] = 0; wsum[t] = 0; });
  use.forEach(r => { if (r.season === season) gp[r.team]++; wsum[r.team] += r.w; });
  for (let it = 0; it < 12; it++) {
    const no = {}, nd = {}, np = {}, ws = {};
    teams.forEach(t => { no[t] = 0; nd[t] = 0; np[t] = 0; ws[t] = 0; });
    use.forEach(r => {
      const h = r.home * hca / 2;
      no[r.team] += r.w * (r.ortg - L - def[r.opp] - h);
      nd[r.opp] += r.w * (r.ortg - L - off[r.team] - h);
      np[r.team] += r.w * (r.poss - Lp - pace[r.opp]);
      ws[r.team] += r.w;
    });
    teams.forEach(t => {
      off[t] = no[t] / (ws[t] + P.shrink);
      def[t] = nd[t] / (ws[t] + P.shrink);
      pace[t] = np[t] / (ws[t] + P.shrink);
    });
  }
  const out = {};
  teams.forEach(t => { out[t] = { off: off[t], def: def[t], net: off[t] - def[t], pace: pace[t], gp: gp[t], weight: wsum[t] }; });
  return { L, Lp, hca, teams: out };
}

/* predicción de un partido (antes de ajustes por bajas/descanso) */
function predict(R, home, away, neutral) {
  const H = R.teams[home], A = R.teams[away];
  if (!H || !A) return null;
  const pos = R.Lp + H.pace + A.pace;
  const h = neutral ? 0 : R.hca / 2;
  const ptsH = pos * (R.L + H.off + A.def + h) / 100;
  const ptsA = pos * (R.L + A.off + H.def - h) / 100;
  return { ptsH, ptsA, margin: ptsH - ptsA, total: ptsH + ptsA, pace: pos };
}

module.exports = { teamRows, rate, predict, DEFAULTS, poss };
