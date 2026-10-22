/* ============================================================
   HOOPVALUE — tendencias y contexto de cada equipo
   ------------------------------------------------------------
   Todo calculado con partidos anteriores a la fecha del partido:
     · forma L5/L10, racha, casa/fuera
     · momentum: margen medio últimos 5 vs. temporada
     · anota / concede (media L5 y temporada), ritmo
     · descanso: días desde el último partido, semana doble (< 52 h)
     · cara a cara (esta temporada y la anterior)
     · ATS y Over/Under con la línea de cierre (de nuestro histórico de cuotas)
     · por cuartos: margen medio en 1ª parte y en 4º cuarto
   ============================================================ */
const { DAY, mean, round } = require('../lib/util');

function teamGames(games, team, asOf) {
  return games.filter(g => g.status === 'final' && g.hs != null && Date.parse(g.date) < asOf && (g.home === team || g.away === team));
}
/* vista del partido desde el equipo */
function view(g, team) {
  const home = g.home === team;
  const pf = home ? g.hs : g.as, pa = home ? g.as : g.hs;
  const v = { id: g.id, date: g.date, opp: home ? g.away : g.home, home, pf, pa, margin: pf - pa, win: pf > pa, season: g.season };
  if (g.q && g.q.h && g.q.h.length >= 4) {
    const my = home ? g.q.h : g.q.a, op = home ? g.q.a : g.q.h;
    v.h1 = my[0] + my[1] - op[0] - op[1];
    v.q4 = my[3] - op[3];
  }
  if (g.line && g.line.spread != null) {
    const sp = home ? g.line.spread : -g.line.spread;            // spread desde el punto de vista del equipo
    const c = v.margin + sp; v.ats = c > 0 ? 'W' : c < 0 ? 'L' : 'P';
  }
  if (g.line && g.line.total != null) { const t = g.hs + g.as; v.ou = t > g.line.total ? 'O' : t < g.line.total ? 'U' : 'P'; }
  return v;
}

function record(list) { const w = list.filter(x => x.win).length; return { w, l: list.length - w }; }
function tally(list, key, yes) { const xs = list.filter(x => x[key] && x[key] !== 'P'); return { y: xs.filter(x => x[key] === yes).length, n: xs.length }; }

/* restHours: por debajo de esto el equipo llega cansado (Euroliga: semana doble < 52 h · NBA: back-to-back < 30 h) */
function teamTrends(games, team, asOf, season, restHours = 52) {
  const all = teamGames(games, team, asOf).map(g => view(g, team));
  const cur = all.filter(v => v.season === season);
  const base = cur.length >= 5 ? cur : all.slice(-15);              // a principio de temporada tiramos de la anterior
  const last5 = all.slice(-5), last10 = all.slice(-10);
  let streak = 0; for (let i = all.length - 1; i >= 0; i--) { if (i === all.length - 1) streak = all[i].win ? 1 : -1; else if (all[i].win === (streak > 0)) streak += streak > 0 ? 1 : -1; else break; }
  const last = all[all.length - 1];
  const restDays = last ? Math.floor((asOf - Date.parse(last.date)) / DAY) : null;
  const shortRest = !!last && (asOf - Date.parse(last.date)) < restHours * 3600 * 1000;
  const games7 = all.filter(v => asOf - Date.parse(v.date) < 7 * DAY).length;
  const h1 = base.filter(v => v.h1 != null), q4 = base.filter(v => v.q4 != null);
  return {
    gp: cur.length,
    season: record(cur), home: record(cur.filter(v => v.home)), away: record(cur.filter(v => !v.home)),
    l5: record(last5), l10: record(last10), streak,
    form: last5.map(v => v.win ? 'W' : 'L').join(''),
    marginSeason: round(mean(base.map(v => v.margin)), 1), marginL5: round(mean(last5.map(v => v.margin)), 1),
    momentum: round(mean(last5.map(v => v.margin)) - mean(base.map(v => v.margin)), 1),
    pfSeason: round(mean(base.map(v => v.pf)), 1), paSeason: round(mean(base.map(v => v.pa)), 1),
    pfL5: round(mean(last5.map(v => v.pf)), 1), paL5: round(mean(last5.map(v => v.pa)), 1),
    h1Margin: h1.length ? round(mean(h1.map(v => v.h1)), 1) : null, q4Margin: q4.length ? round(mean(q4.map(v => v.q4)), 1) : null,
    atsL10: tally(last10, 'ats', 'W'), atsSeason: tally(cur, 'ats', 'W'),
    overL10: tally(last10, 'ou', 'O'), overSeason: tally(cur, 'ou', 'O'),
    restDays, shortRest, games7,
    lastGames: all.slice(-10).reverse().map(v => ({ d: v.date.slice(0, 10), opp: v.opp, h: v.home, pf: v.pf, pa: v.pa, ats: v.ats || null, ou: v.ou || null })),
  };
}

function headToHead(games, home, away, asOf) {
  return games.filter(g => g.status === 'final' && g.hs != null && Date.parse(g.date) < asOf &&
    ((g.home === home && g.away === away) || (g.home === away && g.away === home)))
    .slice(-6).reverse().map(g => ({ d: g.date.slice(0, 10), home: g.home, away: g.away, hs: g.hs, as: g.as }));
}

module.exports = { teamTrends, headToHead, view };
