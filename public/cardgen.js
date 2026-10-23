/* ============================================================
   EUROPICKS — imagen 1200×675 de un pick (para publicar en redes)
   renderCard(canvas, { league: 'euroleague' | 'nba', gameId })
     sin gameId → pick más seguro del día · con gameId → ese partido
     (o su previa si no tiene pick seguro). La usan card.html y x.html.
   ============================================================ */
window.renderCard = async function (canvas, { league = 'euroleague', gameId = null } = {}) {
const L = league === 'nba' ? 'nba' : 'euroleague', G = gameId;
const BASE = L === 'nba' ? 'data/nba/' : 'data/';
const C = { bg: '#0b0f17', panel: '#121826', panel2: '#18202f', line: '#243045', text: '#e8edf6', muted: '#8b97ab', accent: '#ff7a1a', accent2: '#ffb36b', good: '#22c55e', bad: '#ef4444' };
const ctx = canvas.getContext('2d');
const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const txt = (s, x, y, size, color = C.text, weight = 800, align = 'left') => { ctx.font = `${weight} ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
const fit = (s, max, size, weight = 800) => { ctx.font = `${weight} ${size}px Inter`; while (ctx.measureText(s).width > max && size > 18) { size -= 2; ctx.font = `${weight} ${size}px Inter`; } return size; };
const val = (r, k) => k === 'pra' ? r.pts + r.reb + r.ast : k === 'pr' ? r.pts + r.reb : k === 'pa' ? r.pts + r.ast : k === 'ra' ? r.reb + r.ast : r[k];
function ball(x, y, r) {
  const g = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); g.addColorStop(0, '#ffb36b'); g.addColorStop(.6, '#ff7a1a'); g.addColorStop(1, '#b4410b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(.3); ctx.strokeStyle = 'rgba(60,20,4,.85)'; ctx.lineWidth = r * .07;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); ctx.restore();
}
function frame(sub) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 1200, 675);
  const g = ctx.createRadialGradient(900, 200, 20, 900, 200, 800); g.addColorStop(0, 'rgba(255,122,26,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 675);
  ball(70, 62, 24); txt('Euro', 106, 76, 40, C.accent, 900); ctx.font = '900 40px Inter'; txt('Picks', 106 + ctx.measureText('Euro').width + 3, 76, 40, C.text, 900);
  txt(sub, 1140, 74, 26, C.accent2, 800, 'right');
  txt('europicks.pages.dev', 60, 640, 24, C.accent, 800); txt('+18 · Juega con responsabilidad', 1140, 640, 20, C.muted, 600, 'right');
}
/* previa de un partido sin pick seguro: lo que dice el modelo frente al mercado */
function preview(g) {
  if (!g) { txt('Partido no encontrado', 600, 360, 40, C.text, 800, 'center'); return; }
  const when = new Date(g.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  txt(when, 600, 150, 28, C.muted, 600, 'center');
  txt(g.home.name, 330, 250, fit(g.home.name, 420, 56, 900), C.text, 900, 'center'); txt('vs', 600, 250, 34, C.muted, 700, 'center'); txt(g.away.name, 870, 250, fit(g.away.name, 420, 56, 900), C.text, 900, 'center');
  txt(String(Math.round(g.model.ptsH)), 330, 340, 80, C.accent2, 900, 'center'); txt(String(Math.round(g.model.ptsA)), 870, 340, 80, C.accent2, 900, 'center');
  txt('marcador estimado por el modelo', 600, 330, 22, C.muted, 600, 'center');
  const rows = [['Modelo · gana ' + g.home.name, g.model.pHome]];
  if (g.market && g.market.ml) rows.push(['Mercado · gana ' + g.home.name, g.market.ml.pA]);
  rows.forEach(([l, v], i) => { const y = 410 + i * 80; txt(l, 200, y, 24, C.muted, 600); txt(Math.round(v * 100) + '%', 1000, y, 28, C.text, 800, 'right'); rr(200, y + 14, 800, 16, 8); ctx.fillStyle = C.panel2; ctx.fill(); rr(200, y + 14, 800 * v, 16, 8); ctx.fillStyle = i ? C.accent : C.good; ctx.fill(); });
  txt('Sin pick con seguridad suficiente: hoy no apostaríamos aquí', 600, 590, 24, C.muted, 600, 'center');
}
async function main() {
  await Promise.all(['600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const T = await fetch(BASE + 'today.json?v=' + Date.now()).then(r => r.json()).catch(() => null);
  const p = T && T.picks && (G ? T.picks.find(x => x.gameId === G) : T.picks[0]);
  frame(`${G ? (p ? 'Pick del partido' : 'Previa') : 'Pick del día'} · ${L === 'nba' ? 'NBA' : 'Euroliga'}`);
  if (!p && G) { preview(T.games.find(g => g.id === G));  return; }
  if (!p) { txt('Hoy no hay pick lo bastante seguro', 600, 360, 44, C.text, 800, 'center');  return; }
  const when = new Date(p.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  /* columna izquierda: el pick */
  txt(p.match + ' · ' + when, 60, 150, 26, C.muted, 600);
  const title = p.market === 'prop' ? p.player : p.label;
  txt(title, 60, 210, fit(title, 640, 52, 900), C.text, 900);
  if (p.market === 'prop') { const bet = p.label.replace(p.player + ' ', '').replace(/^más/, 'Más').replace(/^menos/, 'Menos'); txt(bet, 60, 262, fit(bet, 640, 36, 700), C.text, 700); }
  rr(60, 300, 230, 120, 22); ctx.fillStyle = C.panel2; ctx.fill(); txt('cuota', 175, 340, 22, C.muted, 600, 'center'); txt(p.odd.toFixed(2), 175, 400, 54, C.accent2, 900, 'center');
  rr(310, 300, 230, 120, 22); ctx.fillStyle = C.panel2; ctx.fill(); txt('probabilidad', 425, 340, 22, C.muted, 600, 'center'); txt(Math.round(p.pFinal * 100) + '%', 425, 400, 54, C.good, 900, 'center');
  const tier = { A: 'A · Muy seguro', B: 'B · Seguro', C: 'C · Moderado' }[p.tier] || '';
  rr(60, 445, 260, 50, 25); ctx.fillStyle = 'rgba(34,197,94,.15)'; ctx.fill(); txt(tier, 190, 478, 24, C.good, 800, 'center');
  (p.signals || []).slice(0, 2).forEach((s, i) => txt((s.ok ? '✓ ' : '✗ ') + s.txt, 60, 545 + i * 36, fit(s.txt, 600, 24, 600), s.ok ? C.text : C.muted, 600));
  /* columna derecha: gráfico */
  const X = 700, Y = 130, W = 440, Hh = 440;
  rr(X, Y, W, Hh, 26); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = 'rgba(255,122,26,.45)'; ctx.lineWidth = 2.5; ctx.stroke();
  if (p.market === 'prop') {
    const rows = ((await fetch(`${BASE}players/${p.team}.json?v=` + Date.now()).then(r => r.json()).catch(() => ({})))[p.playerId] || []).slice(-10);
    const vals = rows.map(r => val(r, p.stat)), max = Math.max(1, ...vals, p.line) * 1.15, n = vals.length;
    txt('Últimos 10 partidos', X + 30, Y + 52, 26, C.text, 800);
    const hits = vals.filter(v => p.side === 'over' ? v > p.line : v < p.line).length;
    txt(`${hits}/${n}`, X + W - 30, Y + 54, 34, hits / Math.max(n, 1) >= .6 ? C.good : C.text, 900, 'right');
    const cx = X + 30, cy = Y + 90, cw = W - 60, ch = 280, gap = 7, bw = (cw - gap * (n - 1)) / n, yv = v => cy + ch * (1 - v / max);
    vals.forEach((v, i) => {
      const ok = p.side === 'over' ? v > p.line : v < p.line, bx = cx + i * (bw + gap), top = yv(v);
      rr(bx, top, bw, cy + ch - top, 6); ctx.fillStyle = ok ? C.good : C.bad; ctx.fill();
      txt(String(v), bx + bw / 2, top - 8, 18, C.text, 800, 'center'); txt(rows[i].o, bx + bw / 2, cy + ch + 26, 15, C.muted, 600, 'center');
    });
    ctx.setLineDash([12, 8]); ctx.strokeStyle = C.accent2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, yv(p.line)); ctx.lineTo(cx + cw, yv(p.line)); ctx.stroke(); ctx.setLineDash([]);
    txt(`línea ${p.line} · proyección ${p.proj}`, X + W / 2, Y + Hh - 22, 20, C.muted, 600, 'center');
  } else {
    /* pick de partido: modelo vs mercado */
    txt('Por qué este pick', X + 30, Y + 52, 26, C.text, 800);
    [['Modelo EuroPicks', p.pModel], ['Mercado (sin margen)', p.pMarket], ['Probabilidad final', p.pFinal]].forEach(([l, v], i) => {
      const y = Y + 110 + i * 100; txt(l, X + 30, y, 22, C.muted, 600); txt(Math.round(v * 100) + '%', X + W - 30, y, 26, C.text, 800, 'right');
      rr(X + 30, y + 16, W - 60, 18, 9); ctx.fillStyle = C.panel2; ctx.fill(); rr(X + 30, y + 16, (W - 60) * v, 18, 9); ctx.fillStyle = i === 2 ? C.good : C.accent; ctx.fill();
    });
  }
  
}
return main();
};

/* ============================================================
   Imagen del RESUMEN del día: cada pick en su fila, verde si acertó
   y rojo si falló, agrupados por liga, con el balance arriba.
   renderSummary(canvas, item) — item = publicación 'summary' de social.json
   ============================================================ */
window.renderSummary = async function (canvas, item) {
  const C = { bg: '#0b0f17', panel: '#121826', panel2: '#18202f', line: '#243045', text: '#e8edf6', muted: '#8b97ab', accent: '#ff7a1a', accent2: '#ffb36b', good: '#22c55e', bad: '#ef4444' };
  const rows = item.rows || [], groups = ['euroleague', 'nba'].map(lg => [lg, rows.filter(r => r.league === lg)]).filter(([, l]) => l.length);
  const RH = 58, H = 240 + groups.length * 70 + rows.length * RH + 90;
  canvas.width = 1200; canvas.height = Math.max(675, H);
  const ctx = canvas.getContext('2d');
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const txt = (s, x, y, size, color = C.text, weight = 800, align = 'left') => { ctx.font = `${weight} ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
  await Promise.all(['600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Inter`)));
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createRadialGradient(900, 150, 20, 900, 150, 800); g.addColorStop(0, 'rgba(255,122,26,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  /* cabecera */
  const bg = ctx.createRadialGradient(62, 54, 3, 70, 62, 24); bg.addColorStop(0, '#ffb36b'); bg.addColorStop(.6, '#ff7a1a'); bg.addColorStop(1, '#b4410b');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(70, 62, 24, 0, Math.PI * 2); ctx.fill();
  txt('Euro', 106, 76, 40, C.accent, 900); ctx.font = '900 40px Inter'; txt('Picks', 106 + ctx.measureText('Euro').width + 3, 76, 40, C.text, 900);
  txt(item.title, 1140, 74, 28, C.accent2, 800, 'right');
  const [w, l] = (item.balance && item.balance.day) || [0, 0], [tw, tl] = (item.balance && item.balance.total) || [0, 0];
  /* unidades (1 u por pick): las que trae el resumen o, si no, las del día a partir de las filas */
  const U = (item.balance && item.balance.units) || {};
  const uDay = U.day != null ? U.day : rows.reduce((a, r) => a + (r.result === 'W' ? Number(r.odd) - 1 : r.result === 'L' ? -1 : 0), 0);
  const uTot = U.total != null ? U.total : uDay;
  const fu = x => `${x >= 0 ? '+' : ''}${Number(x).toFixed(2)} u`;
  const box = (x, label, wl, units, pctTxt, wlColor) => {
    rr(x, 110, 520, 100, 20); ctx.fillStyle = C.panel; ctx.fill();
    txt(label, x + 30, 148, 22, C.muted, 600); txt(wl, x + 30, 190, 40, wlColor, 900);
    txt(fu(units), x + 490, 160, 34, units >= 0 ? C.good : C.bad, 900, 'right'); txt(pctTxt, x + 490, 192, 20, C.muted, 600, 'right');
  };
  box(60, 'Ayer', `${w}-${l}`, uDay, `${w + l ? Math.round(w / (w + l) * 100) : 0}% de acierto`, w >= l ? C.good : C.bad);
  box(620, 'Balance total', `${tw}-${tl}`, uTot, `${tw + tl ? Math.round(tw / (tw + tl) * 100) : 0}% de acierto`, C.text);
  /* filas */
  let y = 260;
  for (const [lg, list] of groups) {
    txt(lg === 'nba' ? 'NBA' : 'Euroliga', 60, y + 30, 28, C.accent2, 900);
    const lw = list.filter(r => r.result === 'W').length, ll = list.filter(r => r.result === 'L').length;
    txt(`${lw}-${ll}`, 1140, y + 30, 28, C.text, 900, 'right'); y += 54;
    for (const r of list) {
      const ok = r.result === 'W', ko = r.result === 'L', col = ok ? C.good : ko ? C.bad : C.muted;
      rr(60, y, 1080, RH - 10, 14); ctx.fillStyle = ok ? 'rgba(34,197,94,.12)' : ko ? 'rgba(239,68,68,.12)' : C.panel2; ctx.fill();
      rr(60, y, 8, RH - 10, 4); ctx.fillStyle = col; ctx.fill();
      txt(ok ? '✓' : ko ? '✗' : r.result === 'P' ? '=' : '·', 100, y + 34, 28, col, 900, 'center');
      txt(r.label, 135, y + 33, 26, C.text, 700);
      txt('@' + Number(r.odd).toFixed(2), 1120, y + 33, 26, C.accent2, 800, 'right');
      y += RH;
    }
    y += 16;
  }
  txt('Historial completo, sin borrar nada · europicks.pages.dev', 60, canvas.height - 36, 22, C.muted, 600);
  txt('+18 · Juega con responsabilidad', 1140, canvas.height - 36, 20, C.muted, 600, 'right');
};
