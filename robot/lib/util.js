/* ============================================================
   HOOPVALUE — utilidades comunes (fechas, estadística, nombres)
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DAY = 24 * 3600 * 1000;

const ymd = d => new Date(d).toISOString().slice(0, 10);
const ymdCompact = d => ymd(d).replace(/-/g, '');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, obj, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, pretty ? 2 : 0));
}

/* normaliza nombres para comparar ("Fenerbahçe Beko" → "fenerbahce beko") */
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---- estadística ---- */
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
/* función de distribución normal estándar */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
/* P(X > line) con X ~ Normal(mu, sigma) */
const pOver = (mu, sigma, line) => 1 - phi((line - mu) / sigma);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/* cuota americana → decimal */
const amToDec = am => am == null || isNaN(am) ? null : (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am));

/* hora de Madrid para mostrar */
const fmtTime = iso => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fmtDay = iso => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/Madrid' });

module.exports = { ROOT, DAY, ymd, ymdCompact, readJSON, writeJSON, norm, mean, sd, phi, pOver, clamp, round, amToDec, fmtTime, fmtDay };
