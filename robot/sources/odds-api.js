/* ============================================================
   HOOPVALUE — cuotas de la Euroliga vía The Odds API (the-odds-api.com)
   ------------------------------------------------------------
   Mercados: h2h (ganador, prórroga incluida) · spreads (hándicap) · totals
   Coste: nº de mercados × nº de regiones créditos por petición.
     3 mercados × "eu,uk" = 6 créditos por ejecución con partidos.
   El robot solo pide cuotas si hay partidos en las próximas 36 h,
   así que el plan gratuito (500 créditos/mes) alcanza de sobra.
   Devuelve las cuotas ya normalizadas por casa.
   ============================================================ */
const HOST = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_euroleague';

const credits = { remaining: null, used: null, last: null };
const track = r => {
  const rem = r.headers.get('x-requests-remaining'), used = r.headers.get('x-requests-used'), last = r.headers.get('x-requests-last');
  if (rem != null) credits.remaining = +rem; if (used != null) credits.used = +used; if (last != null) credits.last = +last;
};

/* evento → { home, away, start, books: { key: {title, h2h:{home,away}, spreads:[{point,home,away}], totals:[{point,over,under}]} } } */
function normalize(ev) {
  const books = {};
  for (const b of ev.bookmakers || []) {
    const o = books[b.key] = { title: b.title, h2h: null, spreads: [], totals: [], updated: b.last_update };
    for (const m of b.markets || []) {
      if (m.key === 'h2h') {
        const h = m.outcomes.find(x => x.name === ev.home_team), a = m.outcomes.find(x => x.name === ev.away_team);
        if (h && a) o.h2h = { home: h.price, away: a.price };
      } else if (m.key === 'spreads') {
        const h = m.outcomes.find(x => x.name === ev.home_team), a = m.outcomes.find(x => x.name === ev.away_team);
        if (h && a && h.point != null) o.spreads.push({ point: h.point, home: h.price, away: a.price });   // point = hándicap del LOCAL
      } else if (m.key === 'totals') {
        const ov = m.outcomes.find(x => /over/i.test(x.name)), un = m.outcomes.find(x => /under/i.test(x.name));
        if (ov && un && ov.point != null) o.totals.push({ point: ov.point, over: ov.price, under: un.price });
      }
    }
  }
  return { oddsId: ev.id, home: ev.home_team, away: ev.away_team, start: ev.commence_time, books };
}

/* una petición; devuelve { data } o { status, msg } para poder explicar el fallo en el log */
async function request(key, regions, markets) {
  const url = `${HOST}/sports/${SPORT}/odds?apiKey=${encodeURIComponent(key.trim())}&regions=${regions}&markets=${markets}&oddsFormat=decimal&dateFormat=iso`;
  try {
    const r = await fetch(url);
    track(r);
    const body = await r.text();
    if (!r.ok) { let msg = body; try { msg = JSON.parse(body).message || body; } catch (e) {} return { status: r.status, msg: String(msg).slice(0, 200) }; }
    return { data: JSON.parse(body) };
  } catch (e) { return { status: 0, msg: e.message }; }
}

async function fetchOdds(key, { regions = 'eu,uk', markets = 'h2h,spreads,totals' } = {}) {
  if (!key) return null;
  /* si la API rechaza la combinación (422), se prueba algo más sencillo */
  const tries = [[regions, markets], ['eu', markets], ['eu', 'h2h']];
  for (const [rg, mk] of tries) {
    const res = await request(key, rg, mk);
    if (res.data && Array.isArray(res.data)) {
      console.log(`· The Odds API (${rg} · ${mk}): ${res.data.length} partidos con cuotas · créditos restantes ${credits.remaining}`);
      return res.data.map(normalize);
    }
    console.log(`· The Odds API (${rg} · ${mk}): HTTP ${res.status} → ${res.msg}`);
    if (res.status === 401) { console.log('  · la clave ODDS_API_KEY no es válida: revisa el secret (sin espacios ni saltos de línea)'); return null; }
    if (res.status === 429) { console.log('  · créditos agotados o demasiadas peticiones'); return null; }
  }
  return null;
}

module.exports = { fetchOdds, credits };
