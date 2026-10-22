/* ============================================================
   EUROPICKS — publicación automática en X (Twitter)
   ------------------------------------------------------------
   TWEET_MODE=pick    → tuitea el pick más seguro de hoy de cada liga
                        (con la imagen de la tarjeta si existe)
   TWEET_MODE=results → responde a los tuits de picks ya liquidados
                        con ✅ / ❌ y el balance acumulado
   Necesita (secrets de GitHub, de una app de developer.x.com con
   permiso de lectura y escritura):
     X_API_KEY · X_API_SECRET · X_ACCESS_TOKEN · X_ACCESS_SECRET
   Sin claves no hace nada. DRY_RUN=1 → solo muestra los textos.
   Registro: data/tweets.json (nunca se tuitea dos veces lo mismo).
   ============================================================ */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, readJSON, writeJSON } = require('./lib/util');

const K = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
const MODE = (process.env.TWEET_MODE || 'pick').toLowerCase();
const DRY = process.env.DRY_RUN === '1';
const LOG_FILE = path.join(ROOT, 'data', 'tweets.json');
const LEAGUES = [{ id: 'euroleague', name: 'Euroliga', dir: 'public/data', tag: '#Euroliga' }, { id: 'nba', name: 'NBA', dir: 'public/data/nba', tag: '#NBA' }];

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
  if (DRY) { console.log('--- (prueba) tuit ---\n' + text + (mediaId ? '\n[imagen]' : '') + '\n'); return 'dry-' + Date.now(); }
  const url = 'https://api.x.com/2/tweets';
  const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.data && j.data.id;
}

/* subida de imagen: API v2 y, si falla, la v1.1 clásica. Si las dos fallan, el tuit sale sin imagen */
async function uploadImage(file) {
  if (!fs.existsSync(file) || DRY) return DRY && fs.existsSync(file) ? 'dry-media' : null;
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
      console.log(`  · subida de imagen (${url.includes('/2/') ? 'v2' : 'v1.1'}): HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    } catch (e) { console.log('  · subida de imagen:', e.message); }
  }
  return null;
}

/* ---------- textos ---------- */
function pickText(p, lg) {
  const when = new Date(p.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const lines = [`🏀 Pick del día · ${lg.name}`, `${p.match} · ${when}`, '', `✅ ${p.label} @${p.odd.toFixed(2)}`];
  if (p.market === 'prop') lines.push(`📊 Cumplió ${p.hits} recientes · proyección ${p.proj} · prob. ${Math.round(p.pFinal * 100)}%`);
  else lines.push(`📊 Probabilidad ${Math.round(p.pFinal * 100)}% (modelo ${Math.round(p.pModel * 100)}% · mercado ${Math.round(p.pMarket * 100)}%)`);
  lines.push('', '👉 Análisis y gráficos: europicks.pages.dev', `${lg.tag} · +18 · Juega con responsabilidad`);
  let t = lines.join('\n');
  if (t.length > 280) t = t.replace(/\n📊[^\n]*/, '');
  return t;
}
const RES = { W: '✅ ¡Acertado!', L: '❌ Fallado', P: '↔️ Nulo (devuelto)', V: '⚪ Anulado' };

async function main() {
  if (!DRY && !(K.key && K.secret && K.token && K.tokenSecret)) { console.log('· X: sin claves configuradas, no se publica nada'); return; }
  const log = readJSON(LOG_FILE, { tweets: [] });
  const today = new Date().toISOString().slice(0, 10);

  if (MODE === 'pick') {
    for (const lg of LEAGUES) {
      const T = readJSON(path.join(ROOT, lg.dir, 'today.json'), null);
      const p = T && T.picks && T.picks[0];
      if (!p || Date.parse(p.start) < Date.now()) { console.log(`· X ${lg.name}: no hay pick para hoy`); continue; }
      const pickId = [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|');
      if (log.tweets.some(t => t.pickId === pickId || (t.date === today && t.league === lg.id))) { console.log(`· X ${lg.name}: ya publicado hoy`); continue; }
      try {
        const mediaId = await uploadImage(path.join(ROOT, `card-${lg.id}.png`));
        const id = await postTweet(pickText(p, lg), { mediaId });
        log.tweets.push({ date: today, league: lg.id, pickId, tweetId: id, label: p.label, odd: p.odd, replied: false });
        console.log(`· X ${lg.name}: publicado (${id})${mediaId ? ' con imagen' : ''}`);
      } catch (e) { console.log(`· X ${lg.name}: error al publicar → ${e.message}`); }
    }
  }

  if (MODE === 'results') {
    for (const lg of LEAGUES) {
      const R = readJSON(path.join(ROOT, lg.dir, 'record.json'), { record: [] });
      for (const t of log.tweets.filter(x => x.league === lg.id && !x.replied)) {
        const s = R.record.find(r => r.id === t.pickId);
        if (!s) continue;
        t.result = s.result;
        const done = log.tweets.filter(x => x.league === lg.id && (x.result === 'W' || x.result === 'L'));
        const w = done.filter(x => x.result === 'W').length;
        const text = `${RES[s.result] || s.result}${s.score ? ` · ${s.score}` : ''}\n${t.label} @${Number(t.odd).toFixed(2)}\n\n📈 Balance de picks del día en ${lg.name}: ${w}-${done.length - w}\nTodo el historial, sin borrar nada: europicks.pages.dev`;
        try { await postTweet(text, { replyTo: t.tweetId }); t.replied = true; console.log(`· X ${lg.name}: resultado publicado (${s.result})`); }
        catch (e) { console.log(`· X ${lg.name}: error al responder → ${e.message}`); }
      }
    }
  }
  if (!DRY) writeJSON(LOG_FILE, log, true);
}

main().catch(e => { console.error(e); process.exit(1); });
