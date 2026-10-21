/* ============================================================
   HOOPVALUE — motor de picks: «el pick más seguro», no la mejor cuota
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
  minOdd: +(process.env.MIN_ODD || 1.30),
  minProb: 0.55,
  minEV: -0.03,
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
function mainLine(list) {
  const c = {}; list.forEach(x => { c[x.point] = (c[x.point] || 0) + 1; });
  const best = Object.entries(c).sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0];
  return best ? +best[0] : null;
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
    if (T.home.shortRest || T.away.shortRest) add(!over, 'Semana doble: el cansancio suele bajar el acierto');
    return out;
  }
  const d10 = (me.l10.w - me.l10.l) - (op.l10.w - op.l10.l);
  if (Math.abs(d10) >= 4) add(d10 > 0, `Forma L10: ${me.l10.w}-${me.l10.l} frente a ${op.l10.w}-${op.l10.l}`);
  if (Math.abs(me.momentum) >= 4) add(me.momentum > 0, `Momentum: ${me.momentum > 0 ? '+' : ''}${me.momentum} pts sobre su media en los últimos 5`);
  if (Math.abs(op.momentum) >= 4) add(op.momentum < 0, `Rival con momentum ${op.momentum > 0 ? '+' : ''}${op.momentum}`);
  if (op.shortRest && !me.shortRest) add(true, 'Rival con semana doble (menos descanso)'); else if (me.shortRest && !op.shortRest) add(false, 'Juega con semana doble (menos descanso)');
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
    const sigs = signals(side, market, trends, { ...ctx, line });
    const net = sigs.filter(s => s.ok).length - sigs.filter(s => !s.ok).length;
    const gap = Math.abs(pModel - pMarket);
    const safety = pFinal - 0.5 * Math.max(0, gap - 0.03) + clamp(net * 0.01, -0.03, 0.03);
    cands.push({ gameId: game.id, market, side, label, line, odd: round(best.price, 2), book: best.book,
      pModel: round(pModel, 3), pMarket: round(pMarket, 3), pFinal: round(pFinal, 3), ev: round(ev, 3), safety: round(safety, 3),
      fair: round(1 / pFinal, 2), sharp: !!sharp, signals: sigs,
      qualifies: best.price >= CFG.minOdd && pFinal >= CFG.minProb && ev >= CFG.minEV });
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

const tier = s => s >= 0.68 ? 'A' : s >= 0.61 ? 'B' : 'C';


module.exports = { evaluate, marketSummary, marketFromLine, modelProbs, twoWay, tier, CFG };
