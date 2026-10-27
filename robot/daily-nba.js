/* ============================================================
   EUROPICKS — robot diario de la NBA (mismo producto que la Euroliga)
   ------------------------------------------------------------
   1. Histórico: ESPN (últimos días + próximos)
   2. Liquida picks y combinadas pendientes POR ID de ESPN (+ CLV)
   3. Cuotas GRATIS: Kambi/Unibet (partido + jugadores) y la línea de
      DraftKings que publica ESPN → no gasta créditos de The Odds API
   4. Valoraciones, tendencias, bajas OFICIALES (ESPN), back-to-back
   5. Picks + combinadas → public/data/nba/*.json
   ============================================================ */
const path = require('path');
const { ROOT, DAY, ymd, readJSON, writeJSON, round, fmtTime, fmtDay } = require('./lib/util');
const HN = require('./history-nba');
const nba = require('./sources/espn-nba');
const kambi = require('./sources/kambi-props');
const store = require('./odds-store');
const { teamRows, rate } = require('./model/ratings');
const { predictGame, modelWeight } = require('./model/game');
const { teamTrends, headToHead } = require('./model/trends');
const PL = require('./model/players');
const P = require('./model/picks');
const S = require('./settle');
const C = require('./combos');
const playersData = require('./players-data');

const LG = 'nba';
const OUT = path.join(ROOT, 'public', 'data', 'nba');
const PICKS_FILE = path.join(ROOT, 'data', 'picks-nba.json');
const PRED_FILE = path.join(ROOT, 'data', 'predictions-nba.json');            // predicción de marcador de cada partido
const PR = require('./predictions');
const RESULTS_ONLY = (process.env.ODDS_MODE || '').toLowerCase() === 'results';
const PARAMS = readJSON(path.join(ROOT, 'data', 'model-params.json'), {}).nba || {};
const SIG = { margin: PARAMS.margin || 13.5, total: PARAMS.total || 18.5 };
const B2B_HOURS = 30;
const pickKey = p => [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|');
const rt = r => r ? { off: round(r.off, 1), def: round(r.def, 1), net: round(r.net, 1), pace: round(r.pace, 1) } : null;

async function main() {
  const now = Date.now();
  const season = nba.seasonOf(new Date(now).toISOString());
  const storeKey = `nba-${season}`;

  /* ---- 1. histórico ---- */
  await HN.sync(ymd(now - 3 * DAY), ymd(now + 2 * DAY));
  const { games, teams } = HN.allGames();
  const byId = Object.fromEntries(games.map(g => [g.id, g]));

  /* ---- 2. liquidar ---- */
  const book = readJSON(PICKS_FILE, { pending: [], record: [], comboPending: [], comboRecord: [] });
  const st = S.settleAll(book.pending, byId, now);
  st.settled.forEach(p => { const o = store.get(storeKey, p.gameId); const c = store.clv(p, o && o.close); if (c) Object.assign(p, c); });
  book.pending = st.still; book.record = [...st.settled, ...book.record];
  const cs = C.settle(book.comboPending || [], byId, now);
  book.comboPending = cs.still; book.comboRecord = [...cs.settled, ...(book.comboRecord || [])];
  if (st.settled.length) console.log(`· NBA liquidados ${st.settled.length} picks: ${st.settled.map(p => p.result).join('')}`);
  if (RESULTS_ONLY) { saveRecord(book, byId); writeJSON(PICKS_FILE, book, true); console.log('✓ NBA solo resultados'); return; }

  /* ---- 3. próximos partidos y cuotas gratis ---- */
  const upcoming = games.filter(g => g.status === 'scheduled' && Date.parse(g.date) > now - 2 * 3600e3 && Date.parse(g.date) < now + 36 * 3600e3)
    .sort((a, b) => a.date < b.date ? -1 : 1);
  console.log(`· NBA: ${upcoming.length} partidos en las próximas 36 h`);
  const { odds: kOdds, props } = await kambi.fetchAll(upcoming, teams, { path: 'basketball/nba', league: LG, withTeam: true });
  const oddsByGame = {};
  for (const g of upcoming) {
    const ev = kOdds[g.id] ? JSON.parse(JSON.stringify(kOdds[g.id])) : { oddsId: g.id, home: g.home, away: g.away, start: g.date, books: {} };
    const det = await nba.gameDetail(g.id);                        // línea de DraftKings (ESPN)
    const L = det && det.line;
    if (L) ev.books.draftkings = { title: 'DraftKings', h2h: L.mlH && L.mlA ? { home: L.mlH, away: L.mlA } : null,
      spreads: L.spread != null && L.spH ? [{ point: L.spread, home: L.spH, away: L.spA }] : [], totals: L.total != null && L.ov ? [{ point: L.total, over: L.ov, under: L.un }] : [] };
    if (Object.keys(ev.books).length) oddsByGame[g.id] = ev;
  }

  /* ---- 4. bajas oficiales ---- */
  const inj = await nba.injuries();
  const codeByEspn = {}; Object.values(teams).forEach(t => { if (t.espnId) codeByEspn[t.espnId] = t.code; });
  const injByTeam = {}; Object.entries(inj).forEach(([id, l]) => { if (codeByEspn[id]) injByTeam[codeByEspn[id]] = l; });

  /* ---- 5. análisis ---- */
  const R = rate(teamRows(games), now, LG, season);
  const logs = PL.playerLogs(games);
  const outGames = [], picks = [];
  for (const g of upcoming) {
    if (!R) break;
    const t0 = Date.parse(g.date);
    const tH = teamTrends(games, g.home, t0, season, B2B_HOURS), tA = teamTrends(games, g.away, t0, season, B2B_HOURS);
    const idsOf = team => games.filter(x => x.status === 'final' && Date.parse(x.date) < t0 && (x.home === team || x.away === team)).map(x => x.id);
    const idsH = idsOf(g.home), idsA = idsOf(g.away);
    const absences = (team, ids) => (injByTeam[team] || []).filter(i => /out|doubtful/i.test(i.status)).map(i => {
      const lg = i.id && logs[i.id];
      const imp = lg ? PL.injuryImpact(lg, t0, team, ids) * (/doubtful/i.test(i.status) ? 0.75 : 1) : 0;
      return { id: i.id, name: i.name, status: /out/i.test(i.status) ? 'Baja' : 'Duda', detail: i.detail, impact: round(imp, 1) };
    });
    const absH = absences(g.home, idsH), absA = absences(g.away, idsA);
    const sum = l => l.reduce((s, x) => s + x.impact, 0);
    const pred = predictGame(R, g.home, g.away, g.neutral, { tH, tA, absH: sum(absH), absA: sum(absA), league: LG });
    if (!pred) continue;
    if (PARAMS.bias && PARAMS.bias.total) pred.total += PARAMS.bias.total;
    const nm = c => (teams[c] || {}).short || c;
    const homeName = nm(g.home), awayName = nm(g.away);
    const ev = oddsByGame[g.id];
    const mk = ev ? P.marketSummary(ev) : null;
    if (mk) store.snapshot(storeKey, g.id, g.date, mk, now);
    const opening = (store.get(storeKey, g.id) || {}).open || null;
    const wModel = modelWeight(tH.gp, tA.gp);
    const ctx = { injH: sum(absH), injA: sum(absA), h2h: headToHead(games, g.home, g.away, t0), homeCode: g.home, awayCode: g.away, pace: pred.pace - R.Lp };
    const cands = P.evaluate({ game: { id: g.id, homeName, awayName }, pred, sig: SIG, mk, trends: { home: tH, away: tA }, ctx, wModel })
      .map(c => ({ ...c, start: g.date, match: `${homeName} – ${awayName}`, tier: P.tier(c.safety) }));
    const best = cands.find(c => c.qualifies);
    if (best) picks.push(best);

    const defF = team => { const o = R.teams[team]; return o ? (R.L + o.def) / R.L : 1; };
    const out = new Set([...absH, ...absA].filter(a => a.status === 'Baja').map(a => a.id));
    const players = [];
    [[g.home, idsH, g.away], [g.away, idsA, g.home]].forEach(([team, ids, opp]) => {
      PL.roster(logs, team, t0, ids).filter(l => !out.has(l.id)).map(l => PL.project(l, t0, { team, pace: pred.pace / R.Lp, defFactor: defF(opp) }))
        .filter(Boolean).sort((a, b) => b.min - a.min).slice(0, 8)
        .forEach(p => players.push({ id: p.id, name: p.name, team: p.team, min: p.min, gp: p.gp, starter: p.starter, value: p.value,
          pts: p.pts.mu, reb: p.reb.mu, ast: p.ast.mu, tpm: p.tpm.mu, pra: p.pra.mu, l10pts: p.pts.l10, avg10: { pts: p.pts.avg10, reb: p.reb.avg10, ast: p.ast.avg10 } }));
    });
    const side = (code, t, abs) => ({ code, name: nm(code), full: (teams[code] || {}).name, logo: (teams[code] || {}).logo, rating: rt(R.teams[code]), trends: t, absences: abs });
    outGames.push({
      id: g.id, start: g.date, day: fmtDay(g.date), time: fmtTime(g.date), round: null, phase: g.phase,
      home: side(g.home, tH, absH), away: side(g.away, tA, absA),
      model: { ptsH: round(pred.ptsH, 1), ptsA: round(pred.ptsA, 1), margin: round(pred.margin, 1), total: round(pred.total, 1), pace: round(pred.pace, 1),
        pHome: round(P.modelProbs(pred, SIG, null).ml.A, 3), adj: pred.adj, wModel: round(wModel, 2) },
      market: mk ? { books: Object.keys(ev.books).length, ml: mk.ml, spread: mk.spread, total: mk.total, opening } : null,
      h2h: ctx.h2h, candidates: cands.slice(0, 6), players,
    });
  }

  /* ---- 5b. jugadores: datos para la web + picks de props ---- */
  const index = playersData.build({ games, teams, logs, R, season, now, props, out: path.join(OUT, 'players') });
  const rowsOf = id => (logs[id] ? logs[id].games : []).map(x => ({ pts: x.pts, reb: x.reb, ast: x.ast, tpm: x.tpm }));
  const soonIds = new Set(upcoming.map(g => g.id));
  const outIds = new Set(Object.values(injByTeam).flat().filter(i => /out/i.test(i.status)).map(i => i.id));
  const propPicks = [];
  index.filter(e => e.lines && e.next && soonIds.has(e.next.gameId) && !outIds.has(e.id)).forEach(e => {
    const best = P.evaluateProps(e, rowsOf(e.id), modelWeight(12, 12)).filter(c => c.qualifies).sort((a, b) => b.safety - a.safety)[0];
    if (best) { const g = upcoming.find(x => x.id === best.gameId); propPicks.push({ ...best, start: g.date, match: `${(teams[g.home] || {}).short || g.home} – ${(teams[g.away] || {}).short || g.away}`, tier: P.tier(best.safety) }); }
  });
  const perGame = {};
  propPicks.sort((a, b) => b.safety - a.safety).forEach(p => { if ((perGame[p.gameId] = (perGame[p.gameId] || 0) + 1) <= 2) picks.push(p); });

  /* ---- 6. picks + combinadas → pendientes ---- */
  picks.sort((a, b) => b.safety - a.safety);
  const combos = C.build(picks);
  const knownC = new Set([...(book.comboPending || []), ...(book.comboRecord || [])].map(C.comboKey));
  combos.forEach(c => { if (!knownC.has(C.comboKey(c)) && Date.parse(c.start) > now) (book.comboPending = book.comboPending || []).push({ ...c, createdAt: new Date(now).toISOString() }); });
  const known = new Set([...book.pending, ...book.record].map(pickKey));
  picks.forEach(p => {
    if (known.has(pickKey(p)) || Date.parse(p.start) < now) return;
    book.pending.push({ id: pickKey(p), gameId: p.gameId, start: p.start, match: p.match, market: p.market, side: p.side, line: p.line,
      label: p.label, odd: p.odd, book: p.book, pFinal: p.pFinal, safety: p.safety, tier: p.tier, stat: p.stat, playerId: p.playerId, createdAt: new Date(now).toISOString() });
  });

  writeJSON(PICKS_FILE, book, true);
  PR.update(PRED_FILE, outGames, now);
  saveRecord(book, byId);
  writeJSON(path.join(OUT, 'today.json'), {
    meta: { updatedAt: new Date(now).toISOString(), season, league: LG, oddsSource: 'Unibet (Kambi) + DraftKings', sig: SIG, minOdd: P.CFG.minOdd,
      nextGame: (games.find(g => g.status === 'scheduled' && Date.parse(g.date) > now) || {}).date || null },
    picks, combos, games: outGames,
  });
  writeJSON(path.join(OUT, 'teams.json'), R ? { L: round(R.L, 1), pace: round(R.Lp, 1), hca: round(R.hca, 1), teams: Object.entries(R.teams)
    .filter(([code, r]) => teams[code] && r.gp > 0)
    .map(([code, r]) => ({ code, name: teams[code].short || code, logo: teams[code].logo, ...rt(r), gp: r.gp, trends: teamTrends(games, code, now, season, B2B_HOURS) }))
    .sort((a, b) => b.net - a.net) } : null);
  console.log(`✓ NBA: ${outGames.length} partidos · ${picks.length} picks · ${combos.length} combinadas · pendientes ${book.pending.length} · historial ${book.record.length}`);
}

function saveRecord(book, byId) {
  writeJSON(path.join(OUT, 'record.json'), { updatedAt: new Date().toISOString(), stats: S.stats(book.record), pending: book.pending, record: book.record,
    combos: { stats: C.stats(book.comboRecord || []), pending: book.comboPending || [], record: book.comboRecord || [] },
    predictions: PR.settle(readJSON(PRED_FILE, {}), byId) });
}

main().catch(e => { console.error(e); process.exit(1); });
