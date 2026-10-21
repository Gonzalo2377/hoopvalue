/* ============================================================
   HOOPVALUE — nuestro propio histórico de cuotas
   ------------------------------------------------------------
   No hay cuotas históricas gratis de la Euroliga, así que las
   guardamos nosotros en cada ejecución:
     data/odds/<temporada>.json → { gameId: { open, close } }
       open  = primera foto del mercado que vimos
       close = última foto ANTES del salto inicial (cuota de cierre)
   Sirve para:
     · CLV de cada pick: ¿cogimos mejor cuota que la de cierre?
       (la mejor medida de calidad, independiente de la suerte)
     · tendencias ATS / Over con línea real
     · backtest del motor contra cuotas reales la próxima temporada
   ============================================================ */
const path = require('path');
const { ROOT, readJSON, writeJSON, round } = require('./lib/util');

const file = season => path.join(ROOT, 'data', 'odds', `${season}.json`);

/* resumen compacto de un mercado (de picks.marketSummary) */
function compact(mk) {
  const c = {};
  const two = m => m && { line: m.line != null ? m.line : null, pA: round(m.pA, 4), a: m.bestA.price, ab: m.bestA.book, b: m.bestB.price, bb: m.bestB.book, books: m.books };
  if (mk.ml) c.ml = two(mk.ml);
  if (mk.spread) c.spread = two(mk.spread);
  if (mk.total) c.total = two(mk.total);
  return c;
}

function snapshot(season, gameId, start, mk, now = Date.now()) {
  if (!mk || now >= Date.parse(start)) return;                  // tras el salto inicial ya no se toca
  const db = readJSON(file(season), {});
  const snap = { t: new Date(now).toISOString(), ...compact(mk) };
  db[gameId] = db[gameId] || { open: snap };
  db[gameId].close = snap;
  writeJSON(file(season), db);
}

function get(season, gameId) { return (readJSON(file(season), {}))[gameId] || null; }

/* cierre → formato `line` del histórico (para tendencias ATS/Over y backtest) */
function toLine(close) {
  if (!close) return null;
  const l = { src: 'cierre' };
  if (close.ml) { l.mlH = close.ml.a; l.mlA = close.ml.b; l.pH = close.ml.pA; }
  if (close.spread) { l.spread = close.spread.line; l.spH = close.spread.a; l.spA = close.spread.b; }
  if (close.total) { l.total = close.total.line; l.ov = close.total.a; l.un = close.total.b; }
  return l;
}

/* CLV de un pick contra el cierre: valor esperado de nuestra cuota con la probabilidad justa de cierre */
function clv(pick, close) {
  if (!close) return null;
  const m = close[pick.market]; if (!m) return null;
  if (pick.market !== 'ml') {
    const sameLine = pick.side === 'home' || pick.side === 'over' ? m.line === pick.line : (pick.market === 'spread' ? -m.line === pick.line : m.line === pick.line);
    if (!sameLine) return null;
  }
  const pSide = (pick.side === 'home' || pick.side === 'over') ? m.pA : 1 - m.pA;
  const closeOdd = (pick.side === 'home' || pick.side === 'over') ? m.a : m.b;
  return { closeOdd, pClose: round(pSide, 4), clv: round(pSide * pick.odd - 1, 4) };
}

module.exports = { snapshot, get, toLine, clv };
