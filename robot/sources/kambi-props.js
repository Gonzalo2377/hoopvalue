/* ============================================================
   HOOPVALUE — cuotas de JUGADORES de la Euroliga vía Kambi
   ------------------------------------------------------------
   Kambi es el proveedor de cuotas de Unibet (y otras casas). Publica
   su oferta en JSON abierto (la misma que usan sus widgets), sin clave:
     listView/basketball/euroleague.json → partidos
     betoffer/event/<id>.json            → todos los mercados de un partido
   Los props salen el DÍA del partido como escalera de hitos:
     «15+ puntos anotados por el jugador» → Sí @ 2,30   (= más de 14,5)
   Solo hay lado «Sí»: la probabilidad del mercado se estima quitando
   un margen típico (MARGIN) a la cuota.
   Devuelve { "nombre normalizado": { pts: {line, over, overBook, ladder:[{line, odd}]}, … } }
   ============================================================ */
const { norm } = require('../lib/util');
const { getJSON, sleep } = require('../lib/http');
const { matchTeam } = require('../lib/teams');

const BASE = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub';
const Q = 'lang=es_ES&market=ES&includeParticipants=true';
const BOOK = 'unibet (Kambi)';
const MARGIN = 1.08;                     // margen típico de Kambi en props de un solo lado
const TARGET_ODD = 1.87;                 // la línea "principal" = el hito con cuota más cercana a ~1,85-1,90

function statOf(englishLabel) {
  const l = (englishLabel || '').toLowerCase();
  if (/quarter|half/.test(l)) return null;
  if (/points.*rebounds.*assists|pts \+ reb \+ ast/.test(l)) return 'pra';
  if (/three|3-point|3 point/.test(l)) return 'tpm';
  if (/rebound/.test(l)) return 'reb';
  if (/assist/.test(l)) return 'ast';
  if (/point/.test(l)) return 'pts';
  return null;
}

async function fetchProps(upcoming, teams) {
  const soon = upcoming.filter(g => Date.parse(g.date) - Date.now() < 30 * 3600e3);
  if (!soon.length) return {};
  const list = await getJSON(`${BASE}/listView/basketball/euroleague.json?${Q}`);
  if (!list || !list.events) { console.log('· Kambi: sin lista de partidos'); return {}; }
  const raw = {};
  let events = 0, prices = 0;
  for (const g of soon) {
    const ev = list.events.map(e => e.event).find(e => matchTeam(e.homeName, 'euroleague', teams) === g.home && matchTeam(e.awayName, 'euroleague', teams) === g.away);
    if (!ev) { console.log(`  · Kambi: no encuentro ${g.home}-${g.away}`); continue; }
    const j = await getJSON(`${BASE}/betoffer/event/${ev.id}.json?${Q}`);
    events++; await sleep(400);
    for (const bo of (j && j.betOffers) || []) {
      const stat = statOf(bo.criterion && bo.criterion.englishLabel);
      if (!stat || !/player/i.test(bo.criterion.englishLabel)) continue;
      for (const o of bo.outcomes || []) {
        if (o.status !== 'OPEN' || !o.participant || !o.odds) continue;
        const odd = o.odds / 1000, ln = o.line / 1000;
        let line, side;
        if (o.type === 'OT_YES') { line = ln - 0.5; side = 'over'; }               // «15+» = más de 14,5
        else if (o.type === 'OT_OVER') { line = ln; side = 'over'; }
        else if (o.type === 'OT_UNDER') { line = ln; side = 'under'; }
        else continue;
        const k = norm(o.participant);
        const S = ((raw[k] = raw[k] || {})[stat] = raw[k][stat] || {});
        (S[line] = S[line] || {})[side] = odd;
        prices++;
      }
    }
  }
  console.log(`· Kambi (Unibet): ${events} partidos · ${prices} cuotas de jugador · ${Object.keys(raw).length} jugadores`);
  /* resumen: escalera completa + línea principal */
  const out = {};
  for (const [k, stats] of Object.entries(raw)) {
    out[k] = {};
    for (const [stat, lines] of Object.entries(stats)) {
      const ladder = Object.entries(lines).map(([line, v]) => ({ line: +line, odd: v.over || null, under: v.under || null })).sort((a, b) => a.line - b.line);
      const main = ladder.filter(r => r.odd).sort((a, b) => Math.abs(a.odd - TARGET_ODD) - Math.abs(b.odd - TARGET_ODD))[0] || ladder[0];
      out[k][stat] = { line: main.line, over: main.odd, overBook: BOOK, under: main.under, underBook: main.under ? BOOK : null, books: 1,
        oneSided: !main.under, margin: MARGIN, ladder: ladder.map(r => ({ line: r.line, odd: r.odd })) };
    }
  }
  return out;
}

module.exports = { fetchProps };
