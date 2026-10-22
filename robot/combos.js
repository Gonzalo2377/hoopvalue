/* ============================================================
   EUROPICKS — combinadas del día
   ------------------------------------------------------------
   Tres combinadas con objetivos distintos (a partir de los picks que
   ya pasaron el filtro de seguridad):
     🛡️ segura   → 2-3 selecciones con la mayor probabilidad conjunta
     💎 valor    → 3 selecciones con el mejor valor esperado conjunto
                   (probabilidad conjunta ≥ 25 %)
     🏀 jugadores → solo props de jugador
   Reglas: nunca dos selecciones del mismo partido (van correlacionadas
   y la probabilidad conjunta engañaría). Se registran y se liquidan
   como los picks: gana si ganan todas; nulo/anulado = cuota 1.
   ============================================================ */
const { round } = require('./lib/util');
const { result } = require('./settle');
const { DAY } = require('./lib/util');

const leg = p => ({ id: p.id || [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|'), gameId: p.gameId, start: p.start, match: p.match,
  market: p.market, side: p.side, line: p.line, stat: p.stat, playerId: p.playerId, player: p.player, label: p.label, odd: p.odd, pFinal: p.pFinal, book: p.book });
const summary = (type, legs) => {
  const odd = legs.reduce((s, l) => s * l.odd, 1), prob = legs.reduce((s, l) => s * l.pFinal, 1);
  return { type, legs: legs.map(leg), odd: round(odd, 2), prob: round(prob, 3), ev: round(prob * odd - 1, 3), start: legs.map(l => l.start).sort()[0] };
};
const distinctGames = legs => new Set(legs.map(l => l.gameId)).size === legs.length;

/* todas las combinaciones de k elementos (k ≤ 3, lista corta) */
function combos(arr, k) {
  const out = [];
  const rec = (start, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } };
  rec(0, []);
  return out;
}

function build(picks) {
  const pool = picks.filter(p => p.qualifies !== false).slice(0, 14);
  const res = [];
  /* 🛡️ segura: la mayor probabilidad conjunta con cuota total ≥ 1,60 */
  const safe = [...combos(pool, 2), ...combos(pool, 3)].filter(distinctGames).map(c => summary('segura', c))
    .filter(c => c.odd >= 1.6 && c.prob >= 0.4).sort((a, b) => b.prob - a.prob || b.ev - a.ev)[0];
  if (safe) res.push(safe);
  /* 💎 valor: mejor valor esperado con 3 selecciones (prob. conjunta ≥ 25 %) */
  const value = combos(pool, 3).filter(distinctGames).map(c => summary('valor', c))
    .filter(c => c.prob >= 0.25 && !(safe && sameLegs(c, safe))).sort((a, b) => b.ev - a.ev)[0];
  if (value) res.push(value);
  /* 🏀 jugadores: solo props, la más probable con cuota ≥ 1,60 */
  const props = pool.filter(p => p.market === 'prop');
  const pc = [...combos(props, 2), ...combos(props, 3)].filter(distinctGames).map(c => summary('jugadores', c))
    .filter(c => c.odd >= 1.6 && c.prob >= 0.35 && !res.some(r => sameLegs(r, c))).sort((a, b) => b.prob - a.prob)[0];
  if (pc) res.push(pc);
  return res;
}
const sameLegs = (a, b) => a.legs.map(l => l.id).sort().join() === b.legs.map(l => l.id).sort().join();
const comboKey = c => c.type + '|' + c.legs.map(l => l.id).sort().join('+');

/* liquidación: gana si ganan todas las piernas; nulos/anulados cuentan como cuota 1 */
function settle(pending, gamesById, now = Date.now()) {
  const still = [], settled = [];
  for (const c of pending) {
    const states = c.legs.map(l => {
      const g = gamesById[l.gameId];
      if (g && g.status === 'final' && g.hs != null && (l.market !== 'prop' || (g.players && g.players.length))) return result(l, g);
      if (now - Date.parse(l.start) > 7 * DAY || (g && g.status === 'postponed')) return 'V';
      return null;
    });
    if (states.includes('L')) { settled.push({ ...c, result: 'L', legStates: states, settledAt: new Date(now).toISOString() }); continue; }   // una perdida = combinada perdida
    if (states.some(s => s === null)) { still.push(c); continue; }
    const live = c.legs.filter((_, i) => states[i] === 'W');
    const odd = round(live.reduce((s, l) => s * l.odd, 1), 2);
    settled.push({ ...c, result: live.length ? 'W' : 'V', oddFinal: live.length ? odd : 1, legStates: states, settledAt: new Date(now).toISOString() });
  }
  return { still, settled };
}

function stats(record) {
  const by = t => {
    const s = record.filter(c => (!t || c.type === t) && (c.result === 'W' || c.result === 'L'));
    const w = s.filter(c => c.result === 'W').length;
    const profit = s.reduce((a, c) => a + (c.result === 'W' ? (c.oddFinal || c.odd) - 1 : -1), 0);
    return { n: s.length, w, hit: s.length ? round(w / s.length, 3) : null, profit: round(profit, 2), roi: s.length ? round(profit / s.length, 3) : null };
  };
  return { all: by(), segura: by('segura'), valor: by('valor'), jugadores: by('jugadores') };
}

module.exports = { build, settle, stats, comboKey };
