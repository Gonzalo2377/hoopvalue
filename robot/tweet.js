/* ============================================================
   EUROPICKS — publicación automática en X (Twitter)
   ------------------------------------------------------------
   Se ejecuta cada 15 minutos (workflow tweets.yml) y decide qué toca:
     · Euroliga: 1 tuit por partido ~1 hora antes del salto inicial,
       con su mejor pick (o la previa si no hay pick seguro) + imagen
     · NBA: 1 tuit al día (desde las 16:30 UTC) con los 3 mejores picks
     · Resumen: a la mañana siguiente (desde las 07:30 UTC), los picks
       tuiteados ayer en Euroliga y NBA con ✅/❌ y el balance
   Claves (secrets): X_API_KEY · X_API_SECRET · X_ACCESS_TOKEN · X_ACCESS_SECRET
   Sin claves no hace nada. DRY_RUN=1 → muestra los textos sin publicar.
   NOW=2026-10-22T17:10:00Z → simula otra hora (para probar).
   Registro en data/tweets.json: nunca publica dos veces lo mismo.
   ============================================================ */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, readJSON, writeJSON } = require('./lib/util');

const K = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const DRY = process.env.DRY_RUN === '1';
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const SITE = 'https://europicks.pages.dev';
const LOG_FILE = process.env.TWEETS_FILE || path.join(ROOT, 'data', 'tweets.json');
const MIN = 60e3;
const EL_WINDOW = [35 * MIN, 75 * MIN];          // "una hora antes": la primera pasada que caiga en este margen
const NBA_FROM_UTC = 16.5, SUMMARY_FROM_UTC = 7.5; // horas UTC (16:30 · 07:30)
const LEAGUE = { euroleague: { name: 'Euroliga', dir: 'public/data', tag: '#Euroliga' }, nba: { name: 'NBA', dir: 'public/data/nba', tag: '#NBA' } };

/* ---------- OAuth 1.0a (firma HMAC-SHA1, sin librerías) ---------- */
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function oauthHeader(method, url, extra = {}) {
  const o = { oauth_consumer_key: K.key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: K.token, oauth_version: '1.0' };
  const u = new URL(url);
  const all = { ...o, ...extra }; u.searchParams.forEach((v, k) => { all[k] = v; });
  const params = Object.keys(all).sort().map(k => `${enc(k)}=${enc(all[k])}`).join('&');
  const base = [method.toUpperCase(), enc(u.origin + u.pathname), enc(params)].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${enc(K.secret)}&${enc(K.tokenSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map(k => `${enc(k)}="${enc(o[k])}"`).join(', ');
}
async function postTweet(text, { mediaId, replyTo } = {}) {
  const body = { text };
  if (mediaId) body.media = { media_ids: [mediaId] };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  if (DRY) { console.log(`--- (prueba) tuit${mediaId ? ' + imagen' : ''} · ${xLen(text)}/280 según X ---\n${text}\n`); return 'dry-' + crypto.randomBytes(4).toString('hex'); }
  const url = 'https://api.x.com/2/tweets';
  const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.data && j.data.id;
}
/* imagen de la tarjeta: Chrome sin ventana hace la captura de la web publicada */
function cardImage(league, gameId) {
  const file = path.join(ROOT, `card-${league}-${(gameId || 'day').replace(/[^a-z0-9]/gi, '')}.png`);
  const url = `${SITE}/card?l=${league}${gameId ? '&g=' + encodeURIComponent(gameId) : ''}&v=${NOW}`;
  if (DRY) return null;
  for (const bin of ['google-chrome', 'chromium-browser', 'chromium']) {
    try {
      execFileSync(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--window-size=1200,675', '--virtual-time-budget=15000', `--screenshot=${file}`, url], { stdio: 'ignore', timeout: 60e3 });
      if (fs.existsSync(file)) return file;
    } catch (e) { /* probar el siguiente */ }
  }
  console.log('  · sin imagen (no hay Chrome)');
  return null;
}
async function uploadImage(file) {
  if (!file || !fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  for (const url of ['https://api.x.com/2/media/upload', 'https://upload.twitter.com/1.1/media/upload.json']) {
    try {
      const form = new FormData();
      form.append('media', new Blob([buf], { type: 'image/png' }), 'pick.png');
      if (url.includes('/2/')) form.append('media_category', 'tweet_image');
      const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url) }, body: form });
      const j = await r.json().catch(() => ({}));
      const id = (j.data && (j.data.id || j.data.media_id_string)) || j.media_id_string;
      if (r.ok && id) return id;
      console.log(`  · subida de imagen ${url.includes('/2/') ? 'v2' : 'v1.1'}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    } catch (e) { console.log('  · subida de imagen:', e.message); }
  }
  return null;
}

/* ---------- utilidades de texto ---------- */
const madridDate = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });            // AAAA-MM-DD
const hhmm = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const pct = p => Math.round(p * 100) + '%';
const pickId = p => [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|');
const short = p => p.market === 'prop' ? p.label.replace(/^(\S)\S*\s/, '$1. ').replace(' más de ', ' +').replace(' menos de ', ' −') : p.label;
/* longitud según X: los enlaces cuentan 23 y los emojis/caracteres fuera del latín básico cuentan 2 */
function xLen(s) {
  s = s.replace(/\b[a-z0-9.-]+\.(dev|com|es|net|org)(\/\S*)?/gi, 'x'.repeat(23));
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
  return n;
}
const fitLines = (lines, max = 280) => {
  let t = lines.join('\n'); if (xLen(t) <= max) return t;
  t = lines.filter(l => !/^📊/.test(l)).join('\n');            // sobra la línea del modelo
  while (xLen(t) > max) t = t.slice(0, -2);
  return t;
};
const RES = { W: '✅', L: '❌', P: '↔️', V: '⚪' };

/* ---------- 1. Euroliga: un tuit por partido ---------- */
async function elGames(log) {
  const T = readJSON(path.join(ROOT, LEAGUE.euroleague.dir, 'today.json'), null);
  for (const g of (T && T.games) || []) {
    const left = Date.parse(g.start) - NOW;
    if (left < EL_WINDOW[0] || left > EL_WINDOW[1]) continue;
    const key = 'el:' + g.id;
    if (log.tweets.some(t => t.key === key)) continue;
    const picks = T.picks.filter(p => p.gameId === g.id).sort((a, b) => b.safety - a.safety).slice(0, 2);
    const lines = [`🏀 Euroliga · hoy ${hhmm(g.start)}`, `${g.home.name} vs ${g.away.name}`, ''];
    if (picks.length) picks.forEach(p => lines.push(`✅ ${p.label} @${p.odd.toFixed(2)} (${pct(p.pFinal)})`));
    else lines.push('Sin pick seguro en este partido: no hay valor suficiente. A veces lo mejor es no apostar.');
    lines.push(`📊 Modelo: ${g.home.name} ${pct(g.model.pHome)} · ${g.away.name} ${pct(1 - g.model.pHome)}`, '', `👉 Análisis completo: ${SITE.replace('https://', '')}`, '#Euroliga · +18 · Juega con responsabilidad');
    const media = await uploadImage(cardImage('euroleague', g.id));
    const id = await postTweet(fitLines(lines), { mediaId: media });
    log.tweets.push({ key, kind: 'el-game', date: madridDate(g.start), tweetId: id, picks: picks.map(p => ({ id: pickId(p), league: 'euroleague', label: short(p), odd: p.odd })) });
    console.log(`· X Euroliga: ${g.home.name}-${g.away.name} publicado`);
  }
}

/* ---------- 2. NBA: los mejores picks del día ---------- */
async function nbaDay(log) {
  const h = new Date(NOW).getUTCHours() + new Date(NOW).getUTCMinutes() / 60;
  const day = madridDate(NOW), key = 'nba-day:' + day;
  if (h < NBA_FROM_UTC || log.tweets.some(t => t.key === key)) return;
  const T = readJSON(path.join(ROOT, LEAGUE.nba.dir, 'today.json'), null);
  const seen = new Set(), top = [];
  for (const p of (T && T.picks) || []) { if (Date.parse(p.start) > NOW && !seen.has(p.gameId)) { seen.add(p.gameId); top.push(p); } if (top.length === 3) break; }
  if (!top.length) return;
  const lines = ['🏀 NBA · los picks más seguros de esta noche', ''];
  top.forEach((p, i) => lines.push(`${['1️⃣', '2️⃣', '3️⃣'][i]} ${short(p)} @${p.odd.toFixed(2)} (${pct(p.pFinal)})`, `    ${p.match} · ${hhmm(p.start)}`));
  lines.push('', `👉 Gráficos y análisis: ${SITE.replace('https://', '')}`, '#NBA · +18 · Juega con responsabilidad');
  const media = await uploadImage(cardImage('nba'));
  const id = await postTweet(fitLines(lines), { mediaId: media });
  log.tweets.push({ key, kind: 'nba-day', date: day, tweetId: id, picks: top.map(p => ({ id: pickId(p), league: 'nba', label: short(p), odd: p.odd })) });
  console.log(`· X NBA: ${top.length} picks publicados`);
}

/* ---------- 3. Resumen del día anterior ---------- */
async function summary(log) {
  const h = new Date(NOW).getUTCHours() + new Date(NOW).getUTCMinutes() / 60;
  const yday = madridDate(NOW - 24 * 3600e3), key = 'summary:' + yday;
  if (h < SUMMARY_FROM_UTC || log.tweets.some(t => t.key === key)) return;
  const items = log.tweets.filter(t => t.date === yday && t.picks).flatMap(t => t.picks);
  if (!items.length) return;
  const rec = { euroleague: readJSON(path.join(ROOT, LEAGUE.euroleague.dir, 'record.json'), { record: [] }).record, nba: readJSON(path.join(ROOT, LEAGUE.nba.dir, 'record.json'), { record: [] }).record };
  items.forEach(i => { const r = rec[i.league].find(x => x.id === i.id); i.result = r ? r.result : null; });
  if (items.some(i => !i.result)) { console.log('· X resumen: aún hay picks de ayer sin resultado, espero'); if (h < 12) return; }
  const [Y, M, D] = yday.split('-');
  const lines = [`📋 Resumen de ayer (${D}/${M})`];
  for (const lg of ['euroleague', 'nba']) {
    const l = items.filter(i => i.league === lg); if (!l.length) continue;
    lines.push('', LEAGUE[lg].name);
    l.forEach(i => lines.push(`${RES[i.result] || '⏳'} ${i.label} @${Number(i.odd).toFixed(2)}`));
  }
  const done = items.filter(i => i.result === 'W' || i.result === 'L'), w = done.filter(i => i.result === 'W').length;
  /* balance total de todo lo tuiteado (incluye ayer) */
  const all = log.tweets.flatMap(t => t.picks || []).map(i => { const r = rec[i.league].find(x => x.id === i.id); return r && r.result; }).filter(r => r === 'W' || r === 'L');
  const tw = all.filter(r => r === 'W').length;
  lines.push('', `Ayer: ${w}-${done.length - w} · Balance total: ${tw}-${all.length - tw}${all.length ? ` (${pct(tw / all.length)})` : ''}`, `Todo el historial, sin borrar nada: ${SITE.replace('https://', '')}`);
  let text = lines.join('\n');
  if (xLen(text) > 280) {                                      // demasiados picks: solo los números
    const per = ['euroleague', 'nba'].map(lg => { const l = items.filter(i => i.league === lg && (i.result === 'W' || i.result === 'L')); const ww = l.filter(i => i.result === 'W').length; return l.length ? `${LEAGUE[lg].name}: ${ww}-${l.length - ww}` : null; }).filter(Boolean);
    text = [`📋 Resumen de ayer (${D}/${M})`, '', ...per, '', `Ayer: ${w}-${done.length - w} · Balance total: ${tw}-${all.length - tw}`, `Detalle de cada pick: ${SITE.replace('https://', '')}`].join('\n');
  }
  const id = await postTweet(text);
  log.tweets.push({ key, kind: 'summary', date: madridDate(NOW), tweetId: id });
  console.log(`· X resumen de ${yday} publicado (${w}-${done.length - w})`);
}

async function main() {
  if (!DRY && !(K.key && K.secret && K.token && K.tokenSecret)) { console.log('· X: sin claves configuradas, no se publica nada'); return; }
  const log = readJSON(LOG_FILE, { tweets: [] });
  for (const step of [summary, elGames, nbaDay]) {
    try { await step(log); } catch (e) { console.log(`· X ${step.name}: error → ${e.message}`); }
  }
  if (!DRY) writeJSON(LOG_FILE, log, true);
}

main().catch(e => { console.error(e); process.exit(1); });
