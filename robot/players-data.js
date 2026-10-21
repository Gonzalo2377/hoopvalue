/* ============================================================
   HOOPVALUE — datos de jugadores para la web
   ------------------------------------------------------------
   public/data/players/index.json  → lista de jugadores de la temporada:
       equipo, próximo partido, medias, proyección y línea de la casa
   public/data/players/<EQUIPO>.json → partido a partido de cada jugador
       (todas las temporadas guardadas) para los gráficos con filtros
   ============================================================ */
const path = require('path');
const { ROOT, writeJSON, round, mean, norm } = require('./lib/util');
const PL = require('./model/players');

const OUT = path.join(ROOT, 'public', 'data', 'players');
const COMBOS = { pr: ['pts', 'reb'], pa: ['pts', 'ast'], ra: ['reb', 'ast'] };

/* ctx: { games, teams, logs, R, season, now, props } */
function build({ games, teams, logs, R, season, now, props }) {
  const byId = Object.fromEntries(games.map(g => [g.id, g]));
  const next = {};                                                           // equipo → próximo partido
  games.filter(g => g.status === 'scheduled' && Date.parse(g.date) > now - 2 * 3600e3).forEach(g => {
    [[g.home, g.away, 1], [g.away, g.home, 0]].forEach(([t, opp, h]) => { if (!next[t] || g.date < next[t].start) next[t] = { gameId: g.id, opp, home: h, start: g.date }; });
  });

  /* jugadores que han jugado esta temporada; equipo = el del último partido */
  const index = [], perTeam = {};
  for (const L of Object.values(logs)) {
    const cur = L.games.filter(x => byId[x.gid] && byId[x.gid].season === season);
    if (!cur.length) continue;
    const team = cur[cur.length - 1].team;
    if (!teams[team]) continue;
    const rows = L.games.map(x => {
      const g = byId[x.gid] || {};
      const home = g.home === x.team;
      const pf = home ? g.hs : g.as, pa = home ? g.as : g.hs;
      return { d: new Date(x.t).toISOString().slice(0, 10), s: g.season, t: x.team, o: x.opp, h: home ? 1 : 0, w: pf > pa ? 1 : 0, sc: `${pf}-${pa}`,
        st: x.starter, min: round(x.min, 1), pts: x.pts, reb: x.reb, ast: x.ast, tpm: x.tpm, stl: x.stl, blk: x.blk, tov: x.tov };
    });
    const nx = next[team] || null;
    /* proyección para su próximo partido */
    let proj = null;
    if (nx && R) {
      const o = R.teams[nx.opp], a = R.teams[team];
      const pace = o && a ? (R.Lp + o.pace + a.pace) / R.Lp : 1;
      const p = PL.project(L, Date.parse(nx.start), { team, pace, defFactor: o ? (R.L + o.def) / R.L : 1 });
      if (p) {
        proj = { min: p.min, pts: p.pts.mu, reb: p.reb.mu, ast: p.ast.mu, tpm: p.tpm.mu, pra: p.pra.mu };
        Object.entries(COMBOS).forEach(([k, [a1, a2]]) => { proj[k] = round(p[a1].mu + p[a2].mu, 1); });
        proj.sd = { pts: p.pts.sd, reb: p.reb.sd, ast: p.ast.sd, tpm: p.tpm.sd, pra: p.pra.sd };
      }
    }
    const avg = list => {
      if (!list.length) return null;
      const m = k => round(mean(list.map(r => r[k])), 1);
      const a = { gp: list.length, min: m('min'), pts: m('pts'), reb: m('reb'), ast: m('ast'), tpm: m('tpm'), stl: m('stl'), blk: m('blk') };
      a.pra = round(a.pts + a.reb + a.ast, 1);
      return a;
    };
    const curRows = rows.filter(r => r.s === season);
    const line = props[norm(L.name)] || null;
    const entry = { id: L.id, name: L.name, team, pos: L.pos || '', next: nx, proj,
      avg: avg(curRows), home: avg(curRows.filter(r => r.h)), away: avg(curRows.filter(r => !r.h)), l5: avg(rows.slice(-5)),
      vsNext: nx ? avg(rows.filter(r => r.o === nx.opp)) : null, lines: line ? stripMeta(line) : null };
    index.push(entry);
    (perTeam[team] = perTeam[team] || {})[L.id] = rows;
  }
  index.sort((a, b) => ((b.proj && b.proj.pra) || (b.avg && b.avg.pra) || 0) - ((a.proj && a.proj.pra) || (a.avg && a.avg.pra) || 0));
  writeJSON(path.join(OUT, 'index.json'), { updatedAt: new Date(now).toISOString(), season, teams: Object.fromEntries(Object.keys(perTeam).map(c => [c, { name: teams[c].short, logo: teams[c].logo }])), players: index });
  Object.entries(perTeam).forEach(([team, pl]) => writeJSON(path.join(OUT, `${team}.json`), pl));
  return index;
}
const stripMeta = l => { const { name, game, ...rest } = l; return rest; };

module.exports = { build };
