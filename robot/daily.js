/* ============================================================
   HOOPVALUE — robot diario de la Euroliga (lo ejecuta GitHub Actions)
   ------------------------------------------------------------
   1. Actualiza el histórico (calendario + boxscores, API oficial)
   2. Liquida los picks pendientes POR CÓDIGO de partido + CLV
   3. Descarga cuotas (The Odds API) y guarda foto apertura/cierre
   4. Valoraciones, tendencias, bajas probables, jugadores
   5. Elige los picks más seguros y genera la web:
        public/data/today.json   partidos + análisis + picks
        public/data/teams.json   valoraciones y tendencias por equipo
        public/data/record.json  historial completo + estadísticas
   Variables: ODDS_API_KEY · ODDSPAPI_KEY (props, opcional) · PROPS_MAX (8) ·
              ODDS_REGIONS (eu,uk) · MIN_ODD (1.30) ·
              ODDS_MODE=results (solo liquidar, 0 créditos)
   ============================================================ */
const path = require('path');
const { ROOT, readJSON, writeJSON, round, norm, fmtTime, fmtDay } = require('./lib/util');
const H = require('./history');
const el = require('./sources/euroleague');
const odds = require('./sources/odds-api');
const store = require('./odds-store');
const oddspapi = require('./sources/oddspapi-props');
const kambi = require('./sources/kambi-props');
const playersData = require('./players-data');
const { matchTeam } = require('./lib/teams');
const { teamRows, rate } = require('./model/ratings');
const { predictGame, modelWeight } = require('./model/game');
const { teamTrends, headToHead } = require('./model/trends');
const PL = require('./model/players');
const P = require('./model/picks');
const S = require('./settle');
const C = require('./combos');

const KEY = process.env.ODDS_API_KEY || '';
const PAPI_KEY = process.env.ODDSPAPI_KEY || '';
const REGIONS = process.env.ODDS_REGIONS || 'eu,uk';
const RESULTS_ONLY = (process.env.ODDS_MODE || '').toLowerCase() === 'results';
const OUT = path.join(ROOT, 'public', 'data');
const PICKS_FILE = path.join(ROOT, 'data', 'picks.json');
const PRED_FILE = path.join(ROOT, 'data', 'predictions.json');            // predicción de marcador de cada partido
const PR = require('./predictions');
const PARAMS = readJSON(path.join(ROOT, 'data', 'model-params.json'), {}).euroleague || {};
const SIG = { margin: PARAMS.margin || 11.5, total: PARAMS.total || 15 };
const LG = 'euroleague';
const pickKey = p => [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|');

/* The Odds API cobra créditos por petición. El robot corre cada hora, así que se reutilizan
   las cuotas guardadas si tienen menos de ODDS_TTL_H horas (por defecto 5): ~4-5 peticiones al día. */
const ODDS_CACHE = path.join(ROOT, 'data', 'odds-cache.json');
async function cachedOdds() {
  const ttl = +(process.env.ODDS_TTL_H || 5) * 3600e3;
  const c = readJSON(ODDS_CACHE, null);
  if (c && Date.now() - Date.parse(c.t) < ttl) { console.log(`· cuotas de partido: reutilizo las de ${c.t.slice(11, 16)} UTC (ahorro de créditos)`); return c.events; }
  const events = await odds.fetchOdds(KEY, { regions: REGIONS });
  if (events) writeJSON(ODDS_CACHE, { t: new Date().toISOString(), events });
  return events || (c && c.events) || null;
}

async function main() {
  const now = Date.now();
  const d = new Date(now), y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const season = el.seasonKey('E' + y);

  /* ---- 1. histórico ---- */
  await H.sync('E' + y);
  let { games, teams } = H.allGames();
  const byId = Object.fromEntries(games.map(g => [g.id, g]));

  /* cierre de cuotas → partido terminado (tendencias ATS/Over y backtest futuro) */
  games.filter(g => g.status === 'final' && !g.line).forEach(g => {
    const o = store.get(g.season, g.id);
    if (o && o.close) { g.line = store.toLine(o.close); H.setLine(g.season, g.id, g.line); }
  });

  /* ---- 2. liquidar pendientes (con CLV) ---- */
  const book = readJSON(PICKS_FILE, { pending: [], record: [] });
  const st = S.settleAll(book.pending, byId, now);
  st.settled.forEach(p => { const o = store.get(season, p.gameId); const c = store.clv(p, o && o.close); if (c) Object.assign(p, c); });
  book.pending = st.still; book.record = [...st.settled, ...book.record];
  const cs = C.settle(book.comboPending || [], byId, now);
  book.comboPending = cs.still; book.comboRecord = [...cs.settled, ...(book.comboRecord || [])];
  if (cs.settled.length) console.log(`· liquidadas ${cs.settled.length} combinadas: ${cs.settled.map(c => c.result).join('')}`);
  if (st.settled.length) console.log(`· liquidados ${st.settled.length} picks: ${st.settled.map(p => p.result).join('')}`);
  if (RESULTS_ONLY) { saveRecord(book, byId); writeJSON(PICKS_FILE, book, true); console.log('✓ solo resultados'); return; }

  /* ---- 3. próximos partidos (36 h) y cuotas ---- */
  const upcoming = games.filter(g => g.status === 'scheduled' && Date.parse(g.date) > now - 2 * 3600e3 && Date.parse(g.date) < now + 36 * 3600e3)
    .sort((a, b) => a.date < b.date ? -1 : 1);
  console.log(`· ${upcoming.length} partidos en las próximas 36 h`);
  const oddsByGame = {};
  /* créditos: la Euroliga solo juega de martes a viernes por la tarde. Solo se piden cuotas
     un día de partido (martes-viernes, hora de Madrid), desde las 9:00 y con un partido en las
     próximas 14 h. Fuera de eso no se gasta nada (ODDS_ANYTIME=1 lo salta, p. ej. Final Four). */
  const mad = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const gameDay = process.env.ODDS_ANYTIME === '1' || ((mad.getDay() >= 2 && mad.getDay() <= 5) && mad.getHours() >= 9 && upcoming.some(g => Date.parse(g.date) - now < 14 * 3600e3));
  if (KEY && upcoming.length && !gameDay) console.log('· cuotas de partido: hoy no toca pedirlas (solo martes-viernes, día de partido, desde las 9:00)');
  if (KEY && upcoming.length && gameDay) {
    for (const ev of (await cachedOdds()) || []) {
      const h = matchTeam(ev.home, LG, teams), a = matchTeam(ev.away, LG, teams);
      if (!h || !a) { console.log(`  · equipo sin emparejar: "${!h ? ev.home : ev.away}" → añádelo en robot/lib/teams.js`); continue; }
      const g = upcoming.find(x => x.home === h && x.away === a && Math.abs(Date.parse(x.date) - Date.parse(ev.start)) < 12 * 3600e3);
      if (g) oddsByGame[g.id] = ev;
    }
  }

  /* ---- 4. análisis ---- */
  const R = rate(teamRows(games), now, LG, season);
  const logs = PL.playerLogs(games);
  const outGames = [], picks = [];
  for (const g of upcoming) {
    if (!R) break;
    const t0 = Date.parse(g.date);
    const tH = teamTrends(games, g.home, t0, season), tA = teamTrends(games, g.away, t0, season);
    const idsOf = team => games.filter(x => x.status === 'final' && Date.parse(x.date) < t0 && (x.home === team || x.away === team)).map(x => x.id);
    const idsH = idsOf(g.home), idsA = idsOf(g.away);
    /* bajas probables: habituales que no jugaron el último partido (impacto al 50 %: no es seguro) */
    const absences = (team, ids) => PL.probableAbsences(logs, team, t0, ids).map(a => ({ ...a, impact: round(PL.injuryImpact(logs[a.id], t0, team, ids) * 0.5, 1) }));
    const absH = absences(g.home, idsH), absA = absences(g.away, idsA);
    const sum = l => l.reduce((s, x) => s + x.impact, 0);
    const pred = predictGame(R, g.home, g.away, g.neutral, { tH, tA, absH: sum(absH), absA: sum(absA) });
    if (!pred) continue;
    if (PARAMS.bias && PARAMS.bias.total) pred.total += PARAMS.bias.total;
    const nm = c => (teams[c] || {}).short || c;
    const homeName = nm(g.home), awayName = nm(g.away);
    const ev = oddsByGame[g.id];
    const mk = ev ? P.marketSummary(ev) : null;
    if (mk) store.snapshot(season, g.id, g.date, mk, now);
    const opening = (store.get(season, g.id) || {}).open || null;
    const wModel = modelWeight(tH.gp, tA.gp);
    const ctx = { injH: sum(absH), injA: sum(absA), h2h: headToHead(games, g.home, g.away, t0), homeCode: g.home, awayCode: g.away, pace: pred.pace - R.Lp };
    const cands = P.evaluate({ game: { id: g.id, homeName, awayName }, pred, sig: SIG, mk, trends: { home: tH, away: tA }, ctx, wModel })
      .map(c => ({ ...c, start: g.date, match: `${homeName} – ${awayName}`, tier: P.tier(c.safety), round: g.round }));
    const best = cands.find(c => c.qualifies);
    if (best) picks.push(best);

    /* jugadores: proyección de los 8 con más minutos de cada equipo */
    const defF = team => { const o = R.teams[team]; return o ? (R.L + o.def) / R.L : 1; };
    const paceF = pred.pace / R.Lp;
    const absent = new Set([...absH, ...absA].map(a => a.id));
    const players = [];
    [[g.home, idsH, g.away], [g.away, idsA, g.home]].forEach(([team, ids, opp]) => {
      PL.roster(logs, team, t0, ids).filter(l => !absent.has(l.id)).map(l => PL.project(l, t0, { team, pace: paceF, defFactor: defF(opp) }))
        .filter(Boolean).sort((a, b) => b.min - a.min).slice(0, 8)
        .forEach(p => players.push({ id: p.id, name: p.name, team: p.team, min: p.min, gp: p.gp, starter: p.starter, value: p.value,
          pts: p.pts.mu, reb: p.reb.mu, ast: p.ast.mu, tpm: p.tpm.mu, pra: p.pra.mu, l10pts: p.pts.l10, avg10: { pts: p.pts.avg10, reb: p.reb.avg10, ast: p.ast.avg10 } }));
    });

    const side = (code, t, abs) => ({ code, name: nm(code), full: (teams[code] || {}).name, logo: (teams[code] || {}).logo, rating: rt(R.teams[code]), trends: t, absences: abs });
    outGames.push({
      id: g.id, start: g.date, day: fmtDay(g.date), time: fmtTime(g.date), round: g.round, phase: g.phase,
      home: side(g.home, tH, absH), away: side(g.away, tA, absA),
      model: { ptsH: round(pred.ptsH, 1), ptsA: round(pred.ptsA, 1), margin: round(pred.margin, 1), total: round(pred.total, 1), pace: round(pred.pace, 1),
        pHome: round(P.modelProbs(pred, SIG, null).ml.A, 3), adj: pred.adj, wModel: round(wModel, 2) },
      market: mk ? { books: Object.keys(ev.books).length, ml: mk.ml, spread: mk.spread, total: mk.total, opening } : null,
      h2h: ctx.h2h, candidates: cands.slice(0, 6), players,
    });
  }

  /* ---- 4b. jugadores: cuotas de props (OddsPapi, opcional) + datos para la web ---- */
  /* Kambi (gratis, sin clave) + OddsPapi (si hay clave). Si los dos dan la misma estadística, se queda la que tenga «más» y «menos». */
  const props = await kambi.fetchProps(upcoming, teams);
  const papi = PAPI_KEY ? await oddspapi.fetchProps(PAPI_KEY, upcoming, teams, { max: +(process.env.PROPS_MAX || 8) }) : {};
  Object.entries(papi).forEach(([k, stats]) => { props[k] = props[k] || {}; Object.entries(stats).forEach(([st, v]) => { if (st === 'name' || st === 'game') return; if (!props[k][st] || (v.under && !props[k][st].under)) props[k][st] = v; }); });
  const index = playersData.build({ games, teams, logs, R, season, now, props });
  const rowsOf = id => (logs[id] ? logs[id].games : []).map(x => ({ pts: x.pts, reb: x.reb, ast: x.ast, tpm: x.tpm }));
  const soonIds = new Set(upcoming.map(g => g.id));
  const propPicks = [];
  index.filter(e => e.lines && e.next && soonIds.has(e.next.gameId)).forEach(e => {
    const best = P.evaluateProps(e, rowsOf(e.id), modelWeight(12, 12)).filter(c => c.qualifies).sort((a, b) => b.safety - a.safety)[0];
    if (best) { const g = upcoming.find(x => x.id === best.gameId); propPicks.push({ ...best, start: g.date, round: g.round, match: `${(teams[g.home] || {}).short || g.home} – ${(teams[g.away] || {}).short || g.away}`, tier: P.tier(best.safety) }); }
  });
  /* como mucho 2 props por partido para no concentrar el riesgo */
  const perGame = {};
  propPicks.sort((a, b) => b.safety - a.safety).forEach(p => { if ((perGame[p.gameId] = (perGame[p.gameId] || 0) + 1) <= 2) picks.push(p); });
  if (Object.keys(props).length) console.log(`· props: ${Object.keys(props).length} jugadores con línea · ${propPicks.length} picks de jugador candidatos`);

  /* ---- 5. picks del día + registro como pendientes ---- */
  picks.sort((a, b) => b.safety - a.safety);
  const combos = C.build(picks);
  const knownC = new Set([...(book.comboPending || []), ...(book.comboRecord || [])].map(C.comboKey));
  combos.forEach(c => { if (!knownC.has(C.comboKey(c)) && Date.parse(c.start) > now) (book.comboPending = book.comboPending || []).push({ ...c, createdAt: new Date(now).toISOString() }); });
  const known = new Set([...book.pending, ...book.record].map(pickKey));
  picks.forEach(p => {
    if (known.has(pickKey(p)) || Date.parse(p.start) < now) return;
    /* se registra con la cuota del momento en que se publica y no se reescribe */
    book.pending.push({ id: pickKey(p), gameId: p.gameId, start: p.start, round: p.round, match: p.match, market: p.market, side: p.side, line: p.line,
      label: p.label, odd: p.odd, book: p.book, pFinal: p.pFinal, safety: p.safety, tier: p.tier, stat: p.stat, playerId: p.playerId, createdAt: new Date(now).toISOString() });
  });

  writeJSON(PICKS_FILE, book, true);
  PR.update(PRED_FILE, outGames, now);
  saveRecord(book, byId);
  writeJSON(path.join(OUT, 'today.json'), {
    meta: { updatedAt: new Date(now).toISOString(), season, oddsSource: KEY ? 'The Odds API' : null, credits: odds.credits, sig: SIG, minOdd: P.CFG.minOdd,
      nextGame: (games.find(g => g.status === 'scheduled' && Date.parse(g.date) > now) || {}).date || null },
    picks, combos, games: outGames,
  });
  writeJSON(path.join(OUT, 'teams.json'), teamsTable(R, games, teams, season, now));
  console.log(`✓ ${outGames.length} partidos · ${picks.length} picks (${picks.filter(p => p.tier === 'A').length} nivel A) · pendientes ${book.pending.length} · historial ${book.record.length}`);
}

const rt = r => r ? { off: round(r.off, 1), def: round(r.def, 1), net: round(r.net, 1), pace: round(r.pace, 1) } : null;

function teamsTable(R, games, teams, season, now) {
  if (!R) return null;
  return { L: round(R.L, 1), pace: round(R.Lp, 1), hca: round(R.hca, 1), teams: Object.entries(R.teams)
    .filter(([code, r]) => teams[code] && r.gp > 0)                       // solo equipos de esta temporada
    .map(([code, r]) => ({ code, name: teams[code].short || code, logo: teams[code].logo, ...rt(r), gp: r.gp, trends: teamTrends(games, code, now, season) }))
    .sort((a, b) => b.net - a.net) };
}

function saveRecord(book, byId) {
  writeJSON(path.join(OUT, 'record.json'), { updatedAt: new Date().toISOString(), stats: S.stats(book.record), pending: book.pending, record: book.record,
    combos: { stats: C.stats(book.comboRecord || []), pending: book.comboPending || [], record: book.comboRecord || [] },
    predictions: PR.settle(readJSON(PRED_FILE, {}), byId) });
}

main().catch(e => { console.error(e); process.exit(1); });
