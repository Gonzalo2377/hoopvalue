/* ============================================================
   HOOPVALUE — motor de picks v2: cuota que merezca la pena + contexto
   ------------------------------------------------------------
   Un pick de 1.30 no compensa: con dos fallos hacen falta seis aciertos.
   Ahora solo entran cuotas 1.55-2.60 y el pick tiene que estar
   RESPALDADO por el contexto: forma, momentum, bajas propias y del
   rival, casa/fuera, descanso, cara a cara, movimiento del mercado…
   (en jugadores: compañeros de baja, minutos, rival, paliza…).
   Puntuación = valor esperado + 1,2 puntos por cada factor neto a favor.
   ------------------------------------------------------------
   (versión anterior: «el pick más seguro», no la mejor cuota)
   ------------------------------------------------------------
   Para cada mercado (ganador, hándicap, total) y cada lado:
     pModel  → probabilidad de nuestro modelo (valoraciones + bajas + descanso)
     pMarket → probabilidad JUSTA del mercado (sin el margen de la casa),
               tomando Pinnacle/Betfair si están (las casas más afinadas)
     pFinal  → mezcla de ambas (el mercado pesa más a principio de temporada)
     seguridad = pFinal − penalización si modelo y mercado discrepan
                 + pequeño ajuste por señales a favor / en contra
   Solo se recomienda si: cuota ≥ mínima, pFinal ≥ 55 % y el valor
   esperado no es claramente negativo. Se ordena por seguridad.
   ============================================================ */
const { phi, pOver, clamp, round, mean } = require('../lib/util');

const CFG = {
  minOdd: +(process.env.MIN_ODD || 1.55),
  maxOdd: 2.60,
  minProb: 0.42,
  minEV: -0.02,
  minNet: 2,                                 // factores a favor − en contra (partidos)
  minNetProp: 3,                             // jugadores (proyección y últimos 10 ya suelen sumar 2)
  perNet: 0.012,                             // cuánto suma a la puntuación cada factor neto
  sharp: ['pinnacle'],                       // los exchanges en Euroliga tienen muy poca liquidez
};

const median = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null; };
const noVig = (a, b) => { const ia = 1 / a, ib = 1 / b; return ia / (ia + ib); };

/* resumen de un mercado de 2 salidas a partir de varias casas: [{book, a, b}] */
function twoWay(rows) {
  rows = rows.filter(r => r.a > 1 && r.b > 1);
  if (!rows.length) return null;
  const ma = median(rows.map(r => r.a)), mb = median(rows.map(r => r.b));
  /* fuera cuotas erróneas o desfasadas: precio muy por encima de la mediana o
     probabilidad muy lejos del consenso (p. ej. Betfair Exchange con poco dinero) */
  const pMed = median(rows.map(r => noVig(r.a, r.b)));
  const sane = rows.filter(r => r.a <= ma * 1.15 && r.b <= mb * 1.15 && Math.abs(noVig(r.a, r.b) - pMed) <= 0.08);
  if (!sane.length) return null;
  const consensus = median(sane.map(r => noVig(r.a, r.b)));
  /* las casas afinadas (Pinnacle) mandan solo si están de acuerdo con el consenso */
  const sharp = sane.filter(r => CFG.sharp.includes(r.book) && Math.abs(noVig(r.a, r.b) - consensus) <= 0.04);
  const pa = sharp.length ? mean(sharp.map(r => noVig(r.a, r.b))) : consensus;
  const bestA = sane.reduce((m, r) => r.a > m.price ? { price: r.a, book: r.book } : m, { price: 0 });
  const bestB = sane.reduce((m, r) => r.b > m.price ? { price: r.b, book: r.book } : m, { price: 0 });
  return { pA: pa, pB: 1 - pa, bestA, bestB, books: sane.length, sharp: sharp.length ? sharp.map(r => r.book) : null };
}

/* línea principal = la que ofrecen más casas */
/* línea principal = la que ofrecen más casas; a igualdad (p. ej. una sola casa con
   varias líneas), la de cuotas más equilibradas entre los dos lados */
function mainLine(list) {
  const c = {}, bal = {};
  list.forEach(x => {
    c[x.point] = (c[x.point] || 0) + 1;
    const a = x.home || x.over, b = x.away || x.under;
    if (a && b) bal[x.point] = Math.min(bal[x.point] == null ? 9 : bal[x.point], Math.abs(a - b));
  });
  const best = Object.keys(c).sort((a, b) => c[b] - c[a] || (bal[a] == null ? 9 : bal[a]) - (bal[b] == null ? 9 : bal[b]) || Math.abs(a) - Math.abs(b))[0];
  return best != null ? +best : null;
}

/* cuotas normalizadas de un partido → mercados resumidos */
function marketSummary(odds) {
  if (!odds || !odds.books) return null;
  const B = Object.entries(odds.books);
  const out = {};
  out.ml = twoWay(B.filter(([, b]) => b.h2h).map(([k, b]) => ({ book: k, a: b.h2h.home, b: b.h2h.away })));
  const sp = B.flatMap(([k, b]) => b.spreads.map(s => ({ book: k, ...s })));
  const spLine = mainLine(sp);
  if (spLine != null) { out.spread = twoWay(sp.filter(s => s.point === spLine).map(s => ({ book: s.book, a: s.home, b: s.away }))); if (out.spread) out.spread.line = spLine; }
  const to = B.flatMap(([k, b]) => b.totals.map(s => ({ book: k, ...s })));
  const toLine = mainLine(to);
  if (toLine != null) { out.total = twoWay(to.filter(s => s.point === toLine).map(s => ({ book: s.book, a: s.over, b: s.under }))); if (out.total) out.total.line = toLine; }
  return out;
}

/* línea guardada en el histórico (mejores cuotas de cierre) → mismo formato */
function marketFromLine(line) {
  if (!line) return null;
  const out = {};
  if (line.mlH && line.mlA) out.ml = twoWay([{ book: line.src || 'cierre', a: line.mlH, b: line.mlA }]);
  if (line.spread != null && line.spH && line.spA) { out.spread = twoWay([{ book: line.src || 'cierre', a: line.spH, b: line.spA }]); out.spread.line = line.spread; }
  if (line.total != null && line.ov && line.un) { out.total = twoWay([{ book: line.src || 'cierre', a: line.ov, b: line.un }]); out.total.line = line.total; }
  return out;
}

/* probabilidades del modelo para cada salida */
function modelProbs(pred, sig, mk) {
  const p = {};
  p.ml = { A: phi(pred.margin / sig.margin) };
  if (mk && mk.spread) p.spread = { A: phi((pred.margin + mk.spread.line) / sig.margin) };   // local cubre si margen + hándicap > 0
  if (mk && mk.total) p.total = { A: pOver(pred.total, sig.total, mk.total.line) };
  return p;
}

/* señales a favor (+) / en contra (−) de cada lado, en castellano */
function signals(side, market, T, ctx) {
  const me = side === 'home' ? T.home : T.away, op = side === 'home' ? T.away : T.home;
  const out = [];
  const add = (ok, txt) => out.push({ ok, txt });
  if (market === 'total') {
    const over = side === 'over', line = ctx.line;
    const proj2 = (T.home.pfL5 + T.away.pfL5 + T.home.paL5 + T.away.paL5) / 2;
    if (Math.abs(proj2 - line) >= 3) add((proj2 > line) === over, `Últimos 5: sus partidos promedian ${proj2.toFixed(1)} pts (línea ${line})`);
    const ov = (T.home.overL10.y + T.away.overL10.y), n = (T.home.overL10.n + T.away.overL10.n);
    if (n >= 8) { const r = ov / n; if (Math.abs(r - 0.5) >= 0.12) add((r > 0.5) === over, `Over en ${ov} de ${n} partidos recientes de ambos`); }
    if (ctx.pace != null && Math.abs(ctx.pace) >= 1.5) add((ctx.pace > 0) === over, ctx.pace > 0 ? 'Partido de ritmo alto' : 'Partido de ritmo lento');
    if (T.home.shortRest || T.away.shortRest) add(!over, 'Cansancio (poco descanso): suele bajar el acierto');
    return out;
  }
  const d10 = (me.l10.w - me.l10.l) - (op.l10.w - op.l10.l);
  if (Math.abs(d10) >= 4) add(d10 > 0, `Forma L10: ${me.l10.w}-${me.l10.l} frente a ${op.l10.w}-${op.l10.l}`);
  if (Math.abs(me.momentum) >= 4) add(me.momentum > 0, `Momentum: ${me.momentum > 0 ? '+' : ''}${me.momentum} pts sobre su media en los últimos 5`);
  if (Math.abs(op.momentum) >= 4) add(op.momentum < 0, `Rival con momentum ${op.momentum > 0 ? '+' : ''}${op.momentum}`);
  if (op.shortRest && !me.shortRest) add(true, 'Rival con menos descanso'); else if (me.shortRest && !op.shortRest) add(false, 'Llega con menos descanso');
  if (me.restDays != null && op.restDays != null && Math.abs(me.restDays - op.restDays) >= 2) add(me.restDays > op.restDays, `Descanso: ${me.restDays} días vs ${op.restDays}`);
  const injMe = side === 'home' ? ctx.injH : ctx.injA, injOp = side === 'home' ? ctx.injA : ctx.injH;
  if (injOp >= 2) add(true, `Bajas probables en el rival (−${injOp.toFixed(1)} pts estimados)`);
  if (injMe >= 2) add(false, `Bajas probables propias (−${injMe.toFixed(1)} pts estimados)`);
  const venue = side === 'home' ? me.home : me.away;
  if (venue.w + venue.l >= 5) { const r = venue.w / (venue.w + venue.l); if (Math.abs(r - 0.5) >= 0.2) add(r > 0.5, `${side === 'home' ? 'En casa' : 'Fuera'}: ${venue.w}-${venue.l}`); }
  if (ctx.h2h && ctx.h2h.length >= 3) {
    const code = side === 'home' ? ctx.homeCode : ctx.awayCode;
    const w = ctx.h2h.filter(g => (g.home === code ? g.hs > g.as : g.as > g.hs)).length;
    if (w / ctx.h2h.length >= 0.75 || w / ctx.h2h.length <= 0.25) add(w / ctx.h2h.length > 0.5, `Cara a cara reciente: ${w}-${ctx.h2h.length - w}`);
  }
  /* el mercado se mueve a su favor desde la apertura (suele ser dinero «listo») */
  if (ctx.open && ctx.now) {
    const key = market === 'total' ? 'total' : market === 'spread' ? 'spread' : 'ml';
    const o = ctx.open[key], n = ctx.now[key];
    if (o && n && o.pA != null && n.pA != null && (key !== 'spread' || o.line === n.line)) {
      const d = (side === 'home' ? 1 : -1) * (n.pA - o.pA);
      if (Math.abs(d) >= 0.03) add(d > 0, `Mercado ${d > 0 ? 'a su favor' : 'en contra'} desde la apertura (${Math.round((side === 'home' ? o.pA : 1 - o.pA) * 100)}% → ${Math.round((side === 'home' ? n.pA : 1 - n.pA) * 100)}%)`);
    }
  }
  if (me.games7 != null && op.games7 != null && me.games7 - op.games7 >= 2) add(false, `Calendario cargado: ${me.games7} partidos en 7 días (rival ${op.games7})`);
  else if (me.games7 != null && op.games7 != null && op.games7 - me.games7 >= 2) add(true, `Rival con calendario cargado: ${op.games7} partidos en 7 días`);
  if (Math.abs(me.streak) >= 4) add(me.streak > 0, `Racha de ${Math.abs(me.streak)} ${me.streak > 0 ? 'victorias' : 'derrotas'} seguidas`);
  if (market === 'spread' && me.atsL10.n >= 6) { const r = me.atsL10.y / me.atsL10.n; if (Math.abs(r - 0.5) >= 0.2) add(r > 0.5, `Cubre el hándicap en ${me.atsL10.y} de ${me.atsL10.n} recientes`); }
  return out;
}

/* evalúa todos los mercados de un partido → candidatos ordenados por seguridad */
function evaluate({ game, pred, sig, mk, trends, ctx, wModel }) {
  if (!mk || !pred) return [];
  const pm = modelProbs(pred, sig, mk);
  const H = game.homeName, A = game.awayName;
  const cands = [];
  const push = (market, side, label, line, pModel, pMarket, best, sharp) => {
    if (!best || !best.price || pMarket == null) return;
    const pFinal = wModel * pModel + (1 - wModel) * pMarket;
    const ev = pFinal * best.price - 1;
    const sigs = signals(side, market, trends, { ...ctx, line, now: mk }).sort((a, b) => b.ok - a.ok);
    const net = sigs.filter(s => s.ok).length - sigs.filter(s => !s.ok).length;
    const gap = Math.abs(pModel - pMarket);
    const safety = ev + CFG.perNet * Math.min(net, 6) - 0.6 * Math.max(0, gap - 0.12);   // puntuación: valor + contexto
    cands.push({ gameId: game.id, market, side, label, line, odd: round(best.price, 2), book: best.book,
      pModel: round(pModel, 3), pMarket: round(pMarket, 3), pFinal: round(pFinal, 3), ev: round(ev, 3), safety: round(safety, 3),
      fair: round(1 / pFinal, 2), sharp: !!sharp, signals: sigs, net,
      qualifies: best.price >= CFG.minOdd && best.price <= CFG.maxOdd && pFinal >= CFG.minProb && ev >= CFG.minEV && net >= CFG.minNet });
  };
  if (mk.ml) {
    push('ml', 'home', `Gana ${H}`, null, pm.ml.A, mk.ml.pA, mk.ml.bestA, mk.ml.sharp);
    push('ml', 'away', `Gana ${A}`, null, 1 - pm.ml.A, mk.ml.pB, mk.ml.bestB, mk.ml.sharp);
  }
  if (mk.spread && pm.spread) {
    const l = mk.spread.line, fmt = x => (x > 0 ? '+' : '') + x;
    push('spread', 'home', `${H} ${fmt(l)}`, l, pm.spread.A, mk.spread.pA, mk.spread.bestA, mk.spread.sharp);
    push('spread', 'away', `${A} ${fmt(-l)}`, -l, 1 - pm.spread.A, mk.spread.pB, mk.spread.bestB, mk.spread.sharp);
  }
  if (mk.total && pm.total) {
    const l = mk.total.line;
    push('total', 'over', `Más de ${l} puntos`, l, pm.total.A, mk.total.pA, mk.total.bestA, mk.total.sharp);
    push('total', 'under', `Menos de ${l} puntos`, l, 1 - pm.total.A, mk.total.pB, mk.total.bestB, mk.total.sharp);
  }
  return cands.sort((a, b) => b.safety - a.safety);
}

/* nivel de confianza según la puntuación (valor + contexto) */
const tier = s => s >= 0.06 ? 'A' : s >= 0.03 ? 'B' : 'C';


/* props de jugador: misma filosofía que los partidos.
   entry = jugador de players/index.json (proyección + línea de la casa), rows = su partido a partido */
const STAT_NAME = { pts: 'puntos', reb: 'rebotes', ast: 'asistencias', tpm: 'triples', pra: 'pts+reb+ast', pr: 'pts+reb', pa: 'pts+ast', ra: 'reb+ast' };
/* pc (contexto, opcional): { mult:{pts,reb,ast,tpm}, sigs:[{stats,dir,txt,w}], season:[filas], vsOpp:[filas] } */
const COMP = { pts: ['pts'], reb: ['reb'], ast: ['ast'], tpm: ['tpm'], pra: ['pts', 'reb', 'ast'], pr: ['pts', 'reb'], pa: ['pts', 'ast'], ra: ['reb', 'ast'] };
function evaluateProps(entry, rows, wModel, pc = null) {
  const out = [];
  if (!entry.proj || !entry.lines || !entry.next) return out;
  const last10 = rows.slice(-10);
  for (const stat of Object.keys(STAT_NAME)) {
    const L = entry.lines[stat], s = entry.proj.sd && entry.proj.sd[stat];
    /* proyección ajustada por el contexto (compañeros de baja, rival, cansancio…) */
    const mu = entry.proj[stat] == null ? null : pc ? round(COMP[stat].reduce((a, k) => a + (entry.proj[k] || 0) * (pc.mult[k] || 1), 0), 1) : entry.proj[stat];
    if (!L || mu == null || !s) continue;
    const val = r => stat === 'pra' ? r.pts + r.reb + r.ast : stat === 'pr' ? r.pts + r.reb : stat === 'pa' ? r.pts + r.ast : stat === 'ra' ? r.reb + r.ast : r[stat];
    /* cada línea ofrecida: con «más» y «menos» se quita el margen exacto;
       con un solo lado (escalera de Kambi) se estima quitando un margen típico */
    const offers = L.ladder && L.ladder.length ? L.ladder.map(r => ({ line: r.line, over: r.odd, under: r.line === L.line ? L.under : null }))
      : [{ line: L.line, over: L.over, under: L.under }];
    for (const o of offers) {
      if (!o.over) continue;
      const pOv = clamp(pOver(mu, s, o.line), 0.03, 0.97);
      const pM = o.under ? twoWay([{ book: 'casa', a: o.over, b: o.under }]) : { pA: clamp(1 / o.over / (L.margin || 1.08), 0.02, 0.98) };
      if (!pM) continue;
      const sides = [['over', pOv, pM.pA, o.over, L.overBook]];
      if (o.under) sides.push(['under', 1 - pOv, pM.pB, o.under, L.underBook]);
      sides.forEach(([side, pModel, pMarket, odd, book]) => {
        const hits = last10.filter(r => side === 'over' ? val(r) > o.line : val(r) < o.line).length;
        const pFinal = wModel * pModel + (1 - wModel) * pMarket;
        const ev = pFinal * odd - 1;
        const val2 = r => COMP[stat].reduce((a, k) => a + (r[k] || 0), 0);
        const sigs = [{ ok: side === 'over' ? mu > o.line : mu < o.line, txt: `Proyección ${mu} (línea ${o.line})` },
          { ok: hits / Math.max(1, last10.length) > 0.5, txt: `Cumplió en ${hits} de sus últimos ${last10.length}` }];
        if (pc) {
          const dirOk = d => side === 'over' ? d > 0 : d < 0;
          const seen = new Set(), venue = pc.sigs.filter(x => x.stats.some(k => COMP[stat].includes(k))).sort((p, q) => (q.w || 1) - (p.w || 1));
          venue.forEach(x => { const key = /^(En casa|Fuera)/.test(x.txt) ? 'venue' : /concede/.test(x.txt) ? 'opp' : x.key || x.txt; if (seen.has(key)) return; seen.add(key); sigs.push({ ok: dirOk(x.dir), txt: x.txt, w: x.w }); });
          const season = pc.season || [], vs = pc.vsOpp || [];
          if (season.length >= 6) { const h = season.filter(r => side === 'over' ? val2(r) > o.line : val2(r) < o.line).length; if (Math.abs(h / season.length - 0.5) >= 0.2) sigs.push({ ok: h / season.length > 0.5, txt: `Temporada: cumple en ${h} de ${season.length}` }); }
          if (vs.length >= 2) { const m = vs.reduce((a, r) => a + val2(r), 0) / vs.length; if (Math.abs(m - o.line) >= Math.max(1.5, o.line * 0.15)) sigs.push({ ok: side === 'over' ? m > o.line : m < o.line, txt: `Contra este rival: ${round(m, 1)} de media (${vs.length} partidos)`, w: 0.75 }); }
        }
        sigs.sort((a, b) => b.ok - a.ok || (b.w || 1) - (a.w || 1));
        const net = round(sigs.reduce((a, x) => a + (x.ok ? 1 : -1) * (x.w || 1), 0), 2);
        const safety = ev + CFG.perNet * Math.min(net, 6) - 0.6 * Math.max(0, Math.abs(pModel - pMarket) - 0.12);   // si el modelo se aleja mucho del mercado, el mercado sabe algo
        out.push({ gameId: entry.next.gameId, market: 'prop', stat, side, line: o.line, playerId: entry.id, player: entry.name, team: entry.team,
          label: `${entry.name} ${side === 'over' ? 'más' : 'menos'} de ${o.line} ${STAT_NAME[stat]}`, odd: round(odd, 2), book,
          pModel: round(pModel, 3), pMarket: round(pMarket, 3), pFinal: round(pFinal, 3), ev: round(ev, 3), safety: round(safety, 3), fair: round(1 / pFinal, 2),
          proj: mu, hits: `${hits}/${last10.length}`, estimated: !o.under, signals: sigs.map(({ ok, txt }) => ({ ok, txt })), net,
          qualifies: odd >= CFG.minOdd && odd <= CFG.maxOdd && pFinal >= CFG.minProb && ev >= CFG.minEV && net >= CFG.minNetProp && (side === 'over' ? mu > o.line : mu < o.line)
            && (last10.length < 5 || hits / last10.length >= 0.4) && !sigs.some(x => !x.ok && /^Temporada/.test(x.txt)) && Math.abs(pModel - pMarket) <= 0.25 });
      });
    }
  }
  return out;
}

module.exports = { evaluate, evaluateProps, marketSummary, marketFromLine, modelProbs, twoWay, tier, CFG };
