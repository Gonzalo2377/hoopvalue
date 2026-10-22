/* ============================================================
   EUROPICKS — cuotas de Kambi (Unibet): partido y jugadores
   ------------------------------------------------------------
   Kambi publica su oferta en JSON abierto (la que usan sus widgets):
     listView/<ruta>.json     → partidos   (ruta: basketball/euroleague, basketball/nba)
     betoffer/event/<id>.json → todos los mercados de un partido
   · Partido: ganador, hándicap y total (prórroga incluida) → mismo
     formato que The Odds API, para el motor de picks.
   · Jugadores: líneas «más/menos» y escaleras de hitos («15+ puntos» =
     más de 14,5). Si solo hay «Sí», la probabilidad del mercado se
     estima quitando un margen típico (MARGIN).
   ============================================================ */
const { norm } = require('../lib/util');
const { getJSON, sleep } = require('../lib/http');
const { matchTeam } = require('../lib/teams');

const BASE = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub';
const Q = 'lang=es_ES&market=ES&includeParticipants=true';
const BOOK = 'unibet (Kambi)';
const MARGIN = 1.08;
const TARGET_ODD = 1.87;                 // línea "principal" de una escalera = la de cuota más cercana a ~1,85-1,90

function statOf(englishLabel) {
  const l = (englishLabel || '').toLowerCase();
  if (/quarter|half|double-double|triple-double/.test(l)) return null;
  if (/points.*rebounds.*assists/.test(l)) return 'pra';
  if (/points (&|and) rebounds/.test(l)) return 'pr';
  if (/points (&|and) assists/.test(l)) return 'pa';
  if (/rebounds (&|and) assists/.test(l)) return 'ra';
  if (/three|3-point|3 point/.test(l)) return 'tpm';
  if (/rebound/.test(l)) return 'reb';
  if (/assist/.test(l)) return 'ast';
  if (/point/.test(l)) return 'pts';
  return null;
}

/* mercados de partido de un evento → { books: { unibet: {h2h, spreads, totals} } } */
function teamMarkets(betOffers) {
  const b = { title: 'Unibet', h2h: null, spreads: [], totals: [] };
  for (const bo of betOffers) {
    const lab = (bo.criterion && bo.criterion.englishLabel) || '', type = (bo.betOfferType && bo.betOfferType.englishName) || '';
    if (!/including overtime/i.test(lab) || /player|quarter|half|by |race|first to|margin|odd\/even/i.test(lab)) continue;
    const o = t => bo.outcomes.find(x => x.type === t && x.status === 'OPEN');
    if (type === 'Match') { const h = o('OT_ONE'), a = o('OT_TWO'); if (h && a) b.h2h = { home: h.odds / 1000, away: a.odds / 1000 }; }
    else if (type === 'Handicap') { const h = o('OT_ONE'), a = o('OT_TWO'); if (h && a && h.line != null) b.spreads.push({ point: h.line / 1000, home: h.odds / 1000, away: a.odds / 1000 }); }
    else if (type === 'Over/Under' && /^total points/i.test(lab)) { const ov = o('OT_OVER'), un = o('OT_UNDER'); if (ov && un) b.totals.push({ point: ov.line / 1000, over: ov.odds / 1000, under: un.odds / 1000 }); }
  }
  return b;
}

/* opts: { path, league, withTeam } → { props: {jugador: {stat: {...}}}, odds: {gameId: {home, away, start, books}} } */
async function fetchAll(upcoming, teams, { path = 'basketball/euroleague', league = 'euroleague', withTeam = false } = {}) {
  const soon = upcoming.filter(g => Date.parse(g.date) - Date.now() < 30 * 3600e3);
  if (!soon.length) return { props: {}, odds: {} };
  const list = await getJSON(`${BASE}/listView/${path}.json?${Q}`);
  if (!list || !list.events) { console.log(`· Kambi ${league}: sin lista de partidos`); return { props: {}, odds: {} }; }
  const raw = {}, odds = {};
  let events = 0, prices = 0;
  for (const g of soon) {
    const ev = list.events.map(e => e.event).find(e => matchTeam(e.homeName, league, teams) === g.home && matchTeam(e.awayName, league, teams) === g.away);
    if (!ev) { console.log(`  · Kambi: no encuentro ${g.home}-${g.away}`); continue; }
    const j = await getJSON(`${BASE}/betoffer/event/${ev.id}.json?${Q}`);
    events++; await sleep(350);
    const offers = (j && j.betOffers) || [];
    if (withTeam) { const b = teamMarkets(offers); if (b.h2h || b.spreads.length || b.totals.length) odds[g.id] = { oddsId: 'kambi:' + ev.id, home: ev.homeName, away: ev.awayName, start: g.date, books: { unibet: b } }; }
    for (const bo of offers) {
      const lab = bo.criterion && bo.criterion.englishLabel;
      const stat = statOf(lab);
      if (!stat || !/player/i.test(lab)) continue;
      for (const o of bo.outcomes || []) {
        if (o.status !== 'OPEN' || !o.participant || !o.odds || o.line == null) continue;
        const odd = o.odds / 1000, ln = o.line / 1000;
        let line, side;
        if (o.type === 'OT_YES') { line = ln - 0.5; side = 'over'; }
        else if (o.type === 'OT_OVER') { line = ln; side = 'over'; }
        else if (o.type === 'OT_UNDER') { line = ln; side = 'under'; }
        else continue;
        const S = ((raw[norm(o.participant)] = raw[norm(o.participant)] || {})[stat] = raw[norm(o.participant)][stat] || {});
        (S[line] = S[line] || {})[side] = odd;
        prices++;
      }
    }
  }
  console.log(`· Kambi ${league}: ${events} partidos · ${Object.keys(odds).length} con cuotas de partido · ${prices} cuotas de jugador · ${Object.keys(raw).length} jugadores`);
  return { props: summarize(raw), odds };
}

/* por jugador y estadística: la línea principal (con «más» y «menos» si existe) y la escalera completa */
function summarize(raw) {
  const out = {};
  for (const [k, stats] of Object.entries(raw)) {
    out[k] = {};
    for (const [stat, lines] of Object.entries(stats)) {
      const ladder = Object.entries(lines).map(([line, v]) => ({ line: +line, odd: v.over || null, under: v.under || null })).sort((a, b) => a.line - b.line);
      const twoSided = ladder.filter(r => r.odd && r.under);
      const main = twoSided.length ? twoSided.sort((a, b) => Math.abs(a.odd - a.under) - Math.abs(b.odd - b.under))[0]
        : ladder.filter(r => r.odd).sort((a, b) => Math.abs(a.odd - TARGET_ODD) - Math.abs(b.odd - TARGET_ODD))[0] || ladder[0];
      out[k][stat] = { line: main.line, over: main.odd, overBook: BOOK, under: main.under, underBook: main.under ? BOOK : null, books: 1,
        oneSided: !main.under, margin: MARGIN, ladder: ladder.filter(r => r.odd).map(r => ({ line: r.line, odd: r.odd })) };
    }
  }
  return out;
}

const fetchProps = async (upcoming, teams, opts) => (await fetchAll(upcoming, teams, opts)).props;
module.exports = { fetchAll, fetchProps };
