/* ============================================================
   HOOPVALUE — cuotas de JUGADORES de la Euroliga vía OddsPapi
   ------------------------------------------------------------
   OddsPapi (oddspapi.io) junta 200+ casas. Para los props:
     1. /v4/markets  → catálogo de mercados (se guarda en caché 30 días):
                       cada línea de prop es un marketId con su `handicap`
     2. /v4/fixtures → partidos de la Euroliga (sportId 11, torneo 138)
     3. /v4/odds     → todas las casas de UN partido (1 petición por partido)
        bookmakerOdds → casa → markets → marketId → outcomes → outcomeId
        → players → playerId → { playerName: "Apellido, Nombre", price, active }
   Plan gratuito: 250 peticiones/mes compartidas con acevalue → solo se pide
   para los partidos de las próximas 24 h y como mucho PROPS_MAX partidos.
   Devuelve { "nombre normalizado": { pts:{line, over, under, overBook, underBook, books}, … } }
   ============================================================ */
const path = require('path');
const { ROOT, readJSON, writeJSON, norm, DAY } = require('../lib/util');
const { matchTeam } = require('../lib/teams');
const { sleep } = require('../lib/http');

const HOST = 'https://api.oddspapi.io/v4';
const CATALOG = path.join(ROOT, 'data', 'oddspapi-markets.json');

async function get(pathQ, key) {
  try {
    const r = await fetch(`${HOST}/${pathQ}${pathQ.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(key.trim())}`);
    const body = await r.text();
    if (!r.ok) { console.log(`· OddsPapi ${pathQ.split('?')[0]}: HTTP ${r.status} → ${body.slice(0, 160)}`); return null; }
    return JSON.parse(body);
  } catch (e) { console.log('· OddsPapi error:', e.message); return null; }
}

/* qué estadística es cada mercado de prop (por su nombre) */
function statOf(name) {
  const n = (name || '').toLowerCase();
  if (/quarter|half|1st|2nd|3rd|4th/.test(n)) return null;                 // solo partido completo
  if (/point.*rebound.*assist|points \+ assists \+ rebounds|pra\b/.test(n)) return 'pra';
  if (/point.*rebound|points \+ rebounds/.test(n)) return 'pr';
  if (/point.*assist|points \+ assists/.test(n)) return 'pa';
  if (/rebound.*assist|rebounds \+ assists/.test(n)) return 'ra';
  if (/three|3-point|3 point|threes/.test(n)) return 'tpm';
  if (/rebound/.test(n)) return 'reb';
  if (/assist/.test(n)) return 'ast';
  if (/point/.test(n)) return 'pts';
  return null;
}

/* catálogo de props de baloncesto, guardado 30 días */
async function catalog(key) {
  const c = readJSON(CATALOG, null);
  if (c && Date.now() - (c.ts || 0) < 30 * DAY) return c.markets;
  const all = await get('markets', key);
  if (!Array.isArray(all)) return c ? c.markets : {};
  const markets = {};
  all.filter(m => m.sportId === 11 && m.playerProp).forEach(m => {
    const stat = statOf(m.marketName);
    if (!stat) return;
    markets[m.marketId] = { stat, line: m.handicap, name: m.marketName, outcomes: Object.fromEntries((m.outcomes || []).map(o => [o.outcomeId, o.outcomeName])) };
  });
  writeJSON(CATALOG, { ts: Date.now(), markets });
  console.log(`· OddsPapi: catálogo de props de baloncesto → ${Object.keys(markets).length} mercados`);
  return markets;
}

/* "Micic, Vasilije" → "vasilije micic" */
const playerKey = n => { const [last, first] = String(n || '').split(',').map(s => s.trim()); return norm(first ? `${first} ${last}` : last); };

async function fetchProps(key, upcoming, teams, { max = 8 } = {}) {
  if (!key || !upcoming.length) return {};
  const now = Date.now();
  const soon = upcoming.filter(g => Date.parse(g.date) - now < 24 * 3600e3).slice(0, max);
  if (!soon.length) return {};
  const markets = await catalog(key);
  if (!Object.keys(markets).length) { console.log('· OddsPapi: sin catálogo de props'); return {}; }
  const ymdd = t => new Date(t).toISOString().slice(0, 10);
  const fx = await get(`fixtures?sportId=11&tournamentId=138&from=${ymdd(now)}&to=${ymdd(now + 2 * DAY)}`, key);
  if (!Array.isArray(fx)) return {};
  const out = {};           // jugador → stat → línea → { over:[{price,book}], under:[...] }
  let calls = 0, propPrices = 0;
  for (const g of soon) {
    const f = fx.find(x => matchTeam(x.participant1Name, 'euroleague', teams) === g.home && matchTeam(x.participant2Name, 'euroleague', teams) === g.away);
    if (!f) { console.log(`  · OddsPapi: no encuentro ${g.home}-${g.away}`); continue; }
    const j = await get(`odds?fixtureId=${f.fixtureId}&oddsFormat=decimal`, key); calls++;
    await sleep(1100);
    if (!j || !j.bookmakerOdds) continue;
    for (const [book, b] of Object.entries(j.bookmakerOdds)) {
      if (b.suspended) continue;
      for (const [mid, m] of Object.entries(b.markets || {})) {
        const def = markets[mid]; if (!def) continue;
        for (const [oid, o] of Object.entries(m.outcomes || {})) {
          const oname = (def.outcomes[oid] || '').toLowerCase();
          let side = /over|more|\+$/.test(oname) ? 'over' : /under|less/.test(oname) ? 'under' : null;
          let line = def.line;
          const ladder = oname.match(/^(\d+)\+$/);                        // formato escalera "10+" = más de 9.5
          if (ladder) { side = 'over'; line = +ladder[1] - 0.5; }
          if (!side || line == null) continue;
          for (const p of Object.values(o.players || {})) {
            if (!p.active || !p.playerName || !(p.price > 1)) continue;
            const k = playerKey(p.playerName);
            const S = ((out[k] = out[k] || { name: p.playerName, game: g.id })[def.stat] = out[k][def.stat] || {});
            (S[line] = S[line] || { over: [], under: [] })[side].push({ price: p.price, book });
            propPrices++;
          }
        }
      }
    }
  }
  console.log(`· OddsPapi: ${calls} partidos consultados · ${propPrices} cuotas de jugador · ${Object.keys(out).length} jugadores`);
  return summarize(out);
}

/* por jugador y estadística: la línea con más casas y sus mejores cuotas */
function summarize(raw) {
  const res = {};
  for (const [k, pl] of Object.entries(raw)) {
    const r = res[k] = { name: pl.name, game: pl.game };
    for (const [stat, lines] of Object.entries(pl)) {
      if (stat === 'name' || stat === 'game') continue;
      const best = Object.entries(lines).map(([line, v]) => ({ line: +line, ...v, n: new Set([...v.over, ...v.under].map(x => x.book)).size }))
        .sort((a, b) => (b.over.length && b.under.length) - (a.over.length && a.under.length) || b.n - a.n)[0];
      if (!best) continue;
      const top = arr => arr.reduce((m, x) => x.price > m.price ? x : m, { price: 0 });
      const o = top(best.over), u = top(best.under);
      r[stat] = { line: best.line, over: o.price || null, overBook: o.book || null, under: u.price || null, underBook: u.book || null, books: best.n };
    }
  }
  return res;
}

module.exports = { fetchProps, playerKey };
