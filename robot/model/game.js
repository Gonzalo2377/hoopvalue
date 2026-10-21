/* ============================================================
   HOOPVALUE — predicción final de un partido de Euroliga
   valoraciones de equipo + bajas probables + descanso → margen y total
   ============================================================ */
const { predict } = require('./ratings');

/* semana doble (< 52 h desde el último partido) frente a un rival descansado */
const SHORT_REST = { margin: 1.2, total: 0.8 };

function predictGame(R, home, away, neutral, { tH, tA, absH = 0, absA = 0 } = {}) {
  const base = predict(R, home, away, neutral);
  if (!base) return null;
  const p = { ...base, adj: [] };
  const sH = tH && tH.shortRest, sA = tA && tA.shortRest;
  if (sH && !sA) { p.margin -= SHORT_REST.margin; p.total -= SHORT_REST.total; p.adj.push(`Local con semana doble (−${SHORT_REST.margin})`); }
  if (sA && !sH) { p.margin += SHORT_REST.margin; p.total -= SHORT_REST.total; p.adj.push(`Visitante con semana doble (+${SHORT_REST.margin})`); }
  if (absH) { p.margin -= absH; p.total -= absH * 0.5; p.adj.push(`Bajas probables local (−${absH.toFixed(1)})`); }
  if (absA) { p.margin += absA; p.total -= absA * 0.5; p.adj.push(`Bajas probables visitante (+${absA.toFixed(1)})`); }
  p.ptsH = (p.total + p.margin) / 2; p.ptsA = (p.total - p.margin) / 2;
  return p;
}

/* peso del modelo frente al mercado: crece con los partidos jugados esta temporada.
   Prudente a propósito: en el backtest NBA contra la línea de cierre el óptimo
   estuvo en ~0.20 (más peso al modelo metía ruido). Se revisará con el CLV real. */
const modelWeight = (gpH, gpA) => 0.12 + 0.08 * Math.min(1, Math.min(gpH || 0, gpA || 0) / 12);

module.exports = { predictGame, modelWeight };
