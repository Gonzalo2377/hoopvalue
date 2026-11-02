/* ============================================================
   EUROPICKS — contexto de los props de jugador
   ------------------------------------------------------------
   Lo que una media de los últimos partidos no ve:
     · bajas de compañeros → cómo rinde SIN ellos (con / sin)
     · tendencia de minutos (rol que sube o baja)
     · casa / fuera
     · lo que concede el rival en esa estadística
     · cansancio (back-to-back / semana doble)
     · riesgo de paliza (hándicap grande → titulares juegan menos)
     · historial contra ese rival y aciertos en la temporada
   Devuelve multiplicadores para la proyección y señales a favor /
   en contra (dir +1 empuja al «más», −1 al «menos»).
   ============================================================ */
const { mean, round, clamp } = require('../lib/util');

const I = { id: 0, team: 2, min: 5, pts: 6, reb: 7, ast: 8, tpm: 9 };
const BASE = ['pts', 'reb', 'ast', 'tpm'];
const NAME = { pts: 'puntos', reb: 'rebotes', ast: 'asistencias', tpm: 'triples' };
const COMP = { pts: ['pts'], reb: ['reb'], ast: ['ast'], tpm: ['tpm'], pra: ['pts', 'reb', 'ast'], pr: ['pts', 'reb'], pa: ['pts', 'ast'], ra: ['reb', 'ast'] };
const val = (r, stat) => COMP[stat].reduce((s, k) => s + (r[k] || 0), 0);

/* lo que concede cada equipo por partido (suma de los rivales) frente a la media de la liga */
function oppAllowed(games, asOf, season) {
  const fin = games.filter(g => g.status === 'final' && g.players && Date.parse(g.date) < asOf);
  const cur = fin.filter(g => g.season === season);
  const use = cur.length >= 40 ? cur : fin.slice(-150);
  const acc = {};
  for (const g of use) {
    const tot = {};
    for (const p of g.players) { const t = tot[p[I.team]] || (tot[p[I.team]] = { pts: 0, reb: 0, ast: 0, tpm: 0 }); BASE.forEach(k => { t[k] += p[I[k]] || 0; }); }
    [[g.home, g.away], [g.away, g.home]].forEach(([me, op]) => {
      if (!tot[op]) return;
      const a = acc[me] || (acc[me] = { n: 0, pts: 0, reb: 0, ast: 0, tpm: 0 });
      a.n++; BASE.forEach(k => { a[k] += tot[op][k]; });
    });
  }
  const teams = Object.entries(acc).filter(([, a]) => a.n >= 3);
  if (!teams.length) return {};
  const lg = Object.fromEntries(BASE.map(k => [k, mean(teams.map(([, a]) => a[k] / a.n))]));
  /* factor encogido hacia 1 con pocos partidos */
  return Object.fromEntries(teams.map(([t, a]) => [t, Object.fromEntries(BASE.map(k => [k, 1 + (a[k] / a.n / lg[k] - 1) * Math.min(1, a.n / 15) * 0.6]))]));
}

/* rendimiento del jugador con y sin un compañero (solo partidos en el mismo equipo) */
function withWithout(L, mate, team, asOf) {
  const mine = L.games.filter(x => x.t < asOf && x.team === team && x.min >= 5);
  const mg = mate.games.filter(x => x.team === team);
  if (mine.length < 6 || mg.length < 5) return null;
  const played = new Set(mg.map(x => x.gid)), first = mg[0].t, last = mg[mg.length - 1].t;
  const inTenure = mine.filter(x => x.t >= first - 30 * 864e5 && x.t <= last + 120 * 864e5);
  const W = inTenure.filter(x => played.has(x.gid)), WO = inTenure.filter(x => !played.has(x.gid));
  if (WO.length < 2 || W.length < 4) return null;
  const out = { n: WO.length };
  BASE.forEach(k => { out[k] = { with: mean(W.slice(-25).map(x => x[k])), without: mean(WO.slice(-25).map(x => x[k])) }; });
  out.min = { with: mean(W.slice(-25).map(x => x.min)), without: mean(WO.slice(-25).map(x => x.min)) };
  return out;
}

/* ¿el compañero venía jugando? (si lleva semanas fuera, ya está dentro de la media reciente) */
function recentlyActive(mate, team, asOf, teamIds) {
  const last8 = new Set(teamIds.slice(-8));
  const g = mate.games.filter(x => x.t < asOf && x.team === team && last8.has(x.gid));
  return g.length >= 3 && mean(g.map(x => x.min)) >= 18;
}

/* ctx: { logs, L (jugador), team, opp, home, asOf, teamIds, outMates:[ids], allowed, shortRest, spread (desde su equipo), name→nombre } */
function propContext(ctx) {
  const { logs, L, team, opp, home, asOf, teamIds = [], outMates = [], allowed = {}, shortRest, spread } = ctx;
  const mult = { pts: 1, reb: 1, ast: 1, tpm: 1 }, sigs = [];
  const add = (stats, dir, txt, w = 1, key = txt) => sigs.push({ stats, dir, txt, w, key });
  const mine = L.games.filter(x => x.t < asOf && x.team === team);
  if (mine.length < 3) return { mult, sigs };

  /* 1 · bajas de compañeros que venían jugando: se combinan (con tope) y por cada
     estadística se enseña solo la baja que más le afecta */
  const own = L.name.split(' ').filter(t => !/^(jr|sr|ii|iii|iv)\.?$/i.test(t)).pop();
  const best = {}, mf = { pts: 1, reb: 1, ast: 1, tpm: 1 };
  let minBest = null;
  for (const id of outMates) {
    const mate = logs[id];
    if (!mate || id === L.id || !recentlyActive(mate, team, asOf, teamIds)) continue;
    const ww = withWithout(L, mate, team, asOf);
    if (!ww) continue;
    const k = ww.n / (ww.n + 6), last = mate.name.split(' ').filter(t => !/^(jr|sr|ii|iii|iv)\.?$/i.test(t)).pop();
    const short = last === own ? mate.name : last;
    BASE.forEach(s => {
      if (ww[s].with < 0.5) return;
      const r = ww[s].without / ww[s].with;
      mf[s] *= clamp(1 + (r - 1) * k, 0.85, 1.35);
      const big = Math.abs(ww[s].without - ww[s].with) >= (s === 'pts' ? 2 : 1);
      if (big && (r >= 1.12 || r <= 0.85) && (!best[s] || Math.abs(r - 1) > Math.abs(best[s].r - 1))) best[s] = { r, short, ww };
    });
    const dm = ww.min.without - ww.min.with;
    if (dm >= 3 && (!minBest || dm > minBest.dm)) minBest = { dm, short, ww };
  }
  BASE.forEach(s => {
    mult[s] *= clamp(mf[s], 0.85, 1.30);                                    // varias bajas a la vez: con tope
    const x = best[s];
    if (x) add([s], x.r > 1 ? 1 : -1, x.r > 1 ? `Sin ${x.short}: ${round(x.ww[s].without, 1)} ${NAME[s]} (${x.ww.n} partidos) vs ${round(x.ww[s].with, 1)} con él`
      : `Sin ${x.short} baja a ${round(x.ww[s].without, 1)} ${NAME[s]} (${x.ww.n} partidos)`, 1.5, 'mates');
  });
  if (minBest) add(BASE, 1, `Sin ${minBest.short} juega ${round(minBest.ww.min.without, 0)} min (vs ${round(minBest.ww.min.with, 0)})`, 1, 'mates-min');

  /* 2 · tendencia de minutos: últimos 3 frente a los 10 anteriores */
  const l3 = mine.slice(-3), prev = mine.slice(-13, -3);
  if (prev.length >= 5) {
    const d = mean(l3.map(x => x.min)) - mean(prev.map(x => x.min));
    if (Math.abs(d) >= 4) add(BASE, Math.sign(d), `Minutos ${d > 0 ? 'al alza' : 'a la baja'}: ${round(mean(l3.map(x => x.min)), 0)} en los últimos 3 (antes ${round(mean(prev.map(x => x.min)), 0)})`);
  }

  /* 3 · casa / fuera (últimos 30 partidos) */
  const recent = mine.slice(-30), venue = recent.filter(x => isHome(x, team, ctx.byId) === !!home), other = recent.filter(x => isHome(x, team, ctx.byId) !== !!home);
  if (venue.length >= 4 && other.length >= 4) {
    ['pts', 'reb', 'ast'].forEach(s => {
      const a = mean(venue.map(x => x[s])), b = mean(other.map(x => x[s]));
      if (b >= 2 && Math.abs(a / b - 1) >= 0.15) add([s], Math.sign(a - b), `${home ? 'En casa' : 'Fuera'}: ${round(a, 1)} ${NAME[s]} (vs ${round(b, 1)} ${home ? 'fuera' : 'en casa'})`);
    });
  }

  /* 4 · lo que concede el rival */
  const A = allowed[opp];
  if (A) BASE.forEach(s => {
    mult[s] *= A[s];
    if (Math.abs(A[s] - 1) >= 0.05) add([s], Math.sign(A[s] - 1), `El rival concede ${A[s] > 1 ? '+' : ''}${Math.round((A[s] - 1) / 0.6 * 100)}% ${NAME[s]} respecto a la media`);
  });

  /* 5 · cansancio */
  if (shortRest) { BASE.forEach(s => { mult[s] *= 0.97; }); add(BASE, -1, 'Llega con poco descanso (back-to-back)', 0.75); }

  /* 6 · riesgo de paliza: con hándicap grande los titulares juegan menos el último cuarto */
  const starter = mine.slice(-5).filter(x => x.starter).length >= 3;
  if (spread != null && Math.abs(spread) >= 11 && starter) { BASE.forEach(s => { mult[s] *= 0.97; }); add(BASE, -1, `Riesgo de paliza (hándicap ${spread > 0 ? '+' : ''}${spread}): menos minutos al final`); }

  return { mult, sigs };
}
const isHome = (x, team, byId) => { const g = byId && byId[x.gid]; return g ? g.home === team : false; };

/* señales que dependen de la línea concreta (historial contra el rival, aciertos en la temporada) */
function lineSignals(rowsSeason, rowsVsOpp, stat, line) {
  const out = [];
  if (rowsSeason.length >= 6) {
    const h = rowsSeason.filter(r => val(r, stat) > line).length, r = h / rowsSeason.length;
    if (Math.abs(r - 0.5) >= 0.2) out.push({ stats: [stat], dir: Math.sign(r - 0.5), txt: `Temporada: supera ${line} en ${h} de ${rowsSeason.length}`, w: 1 });
  }
  if (rowsVsOpp.length >= 2) {
    const m = mean(rowsVsOpp.map(r => val(r, stat)));
    if (Math.abs(m - line) >= Math.max(1.5, line * 0.15)) out.push({ stats: [stat], dir: Math.sign(m - line), txt: `Contra este rival: ${round(m, 1)} de media (${rowsVsOpp.length} partidos)`, w: 0.75 });
  }
  return out;
}

/* contexto completo de un jugador del índice para su próximo partido */
function forEntry({ logs, games, byId, e, outMates = [], outGames = [], allowed = {}, season }) {
  const L = logs[e.id];
  if (!L || !e.next) return null;
  const asOf = Date.parse(e.next.start), team = e.team, opp = e.next.opp;
  const teamIds = games.filter(x => x.status === 'final' && Date.parse(x.date) < asOf && (x.home === team || x.away === team)).map(x => x.id);
  const og = outGames.find(x => x.id === e.next.gameId);
  const tr = og && (og.home.code === team ? og.home.trends : og.away.trends);
  const spH = og && og.market && og.market.spread ? og.market.spread.line : null;
  const spread = spH == null ? null : (e.next.home ? spH : -spH);
  const pc = propContext({ logs, L, team, opp, home: !!e.next.home, asOf, teamIds, outMates, allowed, shortRest: tr && tr.shortRest, spread, byId });
  const mine = L.games.filter(x => x.t < asOf);
  pc.season = mine.filter(x => byId[x.gid] && byId[x.gid].season === season);
  pc.vsOpp = mine.filter(x => x.opp === opp).slice(-6);
  return pc;
}

module.exports = { oppAllowed, propContext, lineSignals, forEntry, COMP, val };
