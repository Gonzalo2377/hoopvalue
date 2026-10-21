/* ============================================================
   HOOPVALUE — peticiones HTTP con reintentos
   ------------------------------------------------------------
   getJSON(url) → objeto o null. Reintenta 3 veces con espera
   creciente. Nunca lanza: un fallo de red no debe romper el robot.
   ============================================================ */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, { tries = 4, headers = {}, onResponse } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: ctl.signal });
      clearTimeout(timer);
      if (onResponse) onResponse(r);
      if (r.status === 404 || r.status === 401 || r.status === 422) return null;   // no reintentar
      if (r.status === 429) {                                                      // demasiadas peticiones → esperar
        if (i === tries - 1) throw new Error('HTTP 429');
        const wait = (+r.headers.get('retry-after') || 0) * 1000 || 4000 * (i + 1);
        await sleep(wait); continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) { console.log(`  · fallo ${short(url)}: ${e.message}`); return null; }
      await sleep(800 * (i + 1));
    }
  }
  return null;
}
const short = u => u.replace(/apiKey=[^&]+/, 'apiKey=***').slice(0, 110);

/* ejecuta tareas async con concurrencia limitada (no saturar las APIs) */
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

module.exports = { getJSON, pool, sleep };
