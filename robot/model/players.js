/* ============================================================
   HOOPVALUE — jugadores: proyecciones (props) e impacto de bajas
   ------------------------------------------------------------
   · playerLogs(games)      → historial de cada jugador
   · project(...)           → minutos y estadísticas esperadas para
                              el próximo partido (pts, reb, ast, 3pm, PRA)
   · probableAbsences(...)  → habituales que NO jugaron el último partido
                              (la Euroliga no publica parte médico gratis)
   · injuryImpact(...)      → cuántos puntos de margen pierde un equipo
                              si falta un jugador que venía jugando
   ============================================================ */
const { mean, sd, round, clamp } = require('../lib/util');

/* índices del array de jugador guardado en el histórico */
const I = { id: 0, name: 1, team: 2, pos: 3, starter: 4, min: 5, pts: 6, reb: 7, ast: 8, tpm: 9, stl: 10, blk: 11, tov: 12, fga: 13, fta: 14 };
const STATS = ['pts', 'reb', 'ast', 'tpm', 'pra'];

function playerLogs(games) {
  const logs = {};
  for (const g of games) {
    if (g.status !== 'final' || !g.players) continue;
    const t = Date.parse(g.date);
    for (const p of g.players) {
      const L = logs[p[I.id]] || (logs[p[I.id]] = { id: p[I.id], name: p[I.name], pos: p[I.pos], games: [] });
      L.name = p[I.name]; if (p[I.pos]) L.pos = p[I.pos];
      L.games.push({ t, gid: g.id, team: p[I.team], opp: p[I.team] === g.home ? g.away : g.home, starter: p[I.starter], min: p[I.min],
        pts: p[I.pts], reb: p[I.reb], ast: p[I.ast], tpm: p[I.tpm], stl: p[I.stl], blk: p[I.blk], tov: p[I.tov], fga: p[I.fga], fta: p[I.fta],
        pra: p[I.pts] + p[I.reb] + p[I.ast] });
    }
  }
  Object.values(logs).forEach(L => L.games.sort((a, b) => a.t - b.t));
  return logs;
}

/* valoración aproximada por partido (tipo Game Score de Hollinger) */
const gameScore = x => x.pts + 0.7 * x.ast + 0.35 * x.reb + x.stl + 0.7 * x.blk - x.tov - 0.35 * x.fga - 0.2 * x.fta;

/* jugadores que vienen jugando con un equipo (aparecen en sus últimos partidos) */
function roster(logs, team, asOf, teamGameIds) {
  const recent = new Set(teamGameIds.slice(-5));
  return Object.values(logs).filter(L => {
    const g = L.games.filter(x => x.t < asOf);
    const last = g[g.length - 1];
    return last && last.team === team && recent.has(last.gid);
  });
}

/* proyección de un jugador para el próximo partido */
function project(L, asOf, ctx) {
  const g = L.games.filter(x => x.t < asOf && x.team === ctx.team).slice(-15);
  if (g.length < 3) return null;
  const w = g.map((_, i) => Math.pow(0.88, g.length - 1 - i));           // más peso a lo reciente
  const W = w.reduce((s, x) => s + x, 0);
  const wavg = k => g.reduce((s, x, i) => s + w[i] * x[k], 0) / W;
  const minProj = mean(g.slice(-5).map(x => x.min)) * 0.6 + wavg('min') * 0.4;
  const totMin = g.reduce((s, x, i) => s + w[i] * x.min, 0);
  const out = { id: L.id, name: L.name, pos: L.pos || '', team: ctx.team, min: round(minProj, 1), gp: g.length, starter: g[g.length - 1].starter };
  const last10 = g.slice(-10);
  STATS.forEach(k => {
    const rate = g.reduce((s, x, i) => s + w[i] * x[k], 0) / Math.max(totMin, 1);
    let mu = rate * minProj * ctx.pace;
    if (k === 'pts' || k === 'pra' || k === 'tpm') mu *= ctx.defFactor;
    const perGame = g.map(x => x[k] * (minProj / Math.max(x.min, 8)));      // normalizado a los minutos previstos
    const s = Math.max(sd(perGame) * 0.85, Math.sqrt(Math.max(mu, 0.5)) * 0.9);
    out[k] = { mu: round(mu, 1), sd: round(s, 2), l10: last10.map(x => x[k]), avg10: round(mean(last10.map(x => x[k])), 1) };
  });
  out.value = round(mean(g.slice(-10).map(gameScore)), 1);
  return out;
}

/* impacto de una baja en puntos de margen (aprox.).
   Solo cuenta si el jugador venía jugando (≥ 5 de los últimos 10 del equipo):
   si lleva semanas fuera, su ausencia ya está dentro de las valoraciones. */
function injuryImpact(L, asOf, team, teamGameIds) {
  const last10 = new Set(teamGameIds.slice(-10));
  const g = L.games.filter(x => x.t < asOf && x.team === team && last10.has(x.gid));
  if (g.length < 5) return 0;
  const mpg = mean(g.map(x => x.min));
  const perMin = mean(g.map(gameScore)) / Math.max(mpg, 1);
  const REPLACEMENT = 0.22;                                                 // nivel de un suplente medio por minuto
  return clamp((perMin - REPLACEMENT) * mpg * 0.55, 0, 7);
}

/* habituales (≥ 5 de los 8 partidos anteriores y ≥ 15 min) ausentes en el último partido del equipo.
   Es una señal, no una certeza: puede ser rotación o descanso. */
function probableAbsences(logs, team, asOf, teamGameIds) {
  if (teamGameIds.length < 4) return [];
  const lastId = teamGameIds[teamGameIds.length - 1];
  const prev = new Set(teamGameIds.slice(-9, -1));
  return Object.values(logs).filter(L => {
    const g = L.games.filter(x => x.t < asOf && x.team === team);
    if (!g.length || g.some(x => x.gid === lastId)) return false;           // jugó el último → no está de baja
    const recent = g.filter(x => prev.has(x.gid));
    if (recent.length < 5 || mean(recent.map(x => x.min)) < 15) return false;
    const lastOverall = L.games.filter(x => x.t < asOf).pop();
    return lastOverall && lastOverall.team === team;                         // sigue en el equipo (no traspasado)
  }).map(L => ({ id: L.id, name: L.name, missed: 1 + countMissedBefore(L, team, asOf, teamGameIds) }));
}
/* cuántos partidos seguidos lleva sin jugar (sin contar el último) */
function countMissedBefore(L, team, asOf, ids) {
  const played = new Set(L.games.filter(x => x.t < asOf && x.team === team).map(x => x.gid));
  let n = 0; for (let i = ids.length - 2; i >= 0 && !played.has(ids[i]); i--) n++;
  return n;
}

module.exports = { playerLogs, roster, project, probableAbsences, injuryImpact, STATS };
