/* ============================================================
   HOOPVALUE — carga del histórico de la Euroliga
     node robot/backfill.js            → temporada actual + 3 anteriores
     node robot/backfill.js E2022      → una temporada concreta
   Más temporadas = modelo y backtest más fiables. La API oficial
   limita peticiones: si sale "HTTP 429", vuelve a lanzarlo y sigue
   donde lo dejó (solo descarga lo que falta).
   ============================================================ */
const H = require('./history');

(async () => {
  const t0 = Date.now();
  const arg = process.argv[2];
  if (arg && !/^E\d{4}$/.test(arg)) { console.log('Uso: node robot/backfill.js [E2024]'); return; }
  const now = new Date(), y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const codes = arg ? [arg] : [`E${y - 3}`, `E${y - 2}`, `E${y - 1}`, `E${y}`];
  for (const c of codes) await H.sync(c);
  console.log(`✓ backfill en ${Math.round((Date.now() - t0) / 1000)} s`);
})();
