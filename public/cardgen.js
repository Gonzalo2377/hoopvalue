/* apuesta corta estilo X: "J. Landale más de 3.5 puntos" → "+3.5 Pts" · "Más de 236.5 puntos" → "Over 236.5" */
window.betShort = function (p) {
  const AB = { puntos: 'Pts', rebotes: 'Reb', asistencias: 'Ast', triples: 'T3', 'pts+reb+ast': 'PRA', 'pts+reb': 'P+R', 'pts+ast': 'P+A', 'reb+ast': 'R+A' };
  if (p.list) { const l = p.list.replace(/\s*\(.*\)$/, ''); const s = l.match(/[+−-][\d.]+ \S+$/); return p.market === 'prop' && s ? s[0] : l; }
  const sg = String(p.label || '').match(/([+−-])([\d.]+) (.+)$/);
  if (sg && p.market === 'prop') return `${sg[1]}${sg[2]} ${AB[sg[3]] || sg[3]}`;
  const m = String(p.label || '').match(/(más|menos) de ([\d.]+) (.+)$/i);
  if (!m) return p.label || '';
  if (p.market === 'prop') return `${/^m[aá]s/i.test(m[1]) ? '+' : '−'}${m[2]} ${AB[m[3]] || m[3]}`;
  if (p.market === 'total') return `${/^m[aá]s/i.test(m[1]) ? 'Over' : 'Under'} ${m[2]}`;
  return p.label;
};
/* pick de ganador o hándicap: últimos 10 partidos de ese equipo (margen de puntos de cada uno) */
window.teamLast10 = function (T, p) {
  if (!p || (p.market !== 'ml' && p.market !== 'spread')) return null;
  const g = T && (T.games || []).find(x => x.id === p.gameId), tm = g && g[p.side === 'away' ? 'away' : 'home'];
  const lg = tm && tm.trends && tm.trends.lastGames;
  if (!lg || !lg.length) return null;
  const rows = lg.slice(0, 10).reverse(), line = p.market === 'spread' ? -Number(p.line) : 0;        // lastGames viene del más reciente al más antiguo
  const sg = x => (x > 0 ? '+' : '') + x;
  return { team: tm.name, vals: rows.map(r => r.pf - r.pa), opp: rows.map(r => r.opp), line, ok: v => v > line,
    foot: p.market === 'ml' ? `${tm.name} · margen de puntos de cada partido` : `${tm.name} · hándicap ${sg(Number(p.line))}` };
};
/* barras hacia arriba (ganó) y hacia abajo (perdió) desde el 0; verde si cumplió el pick */
window.drawMargins = function (ctx, d, x, y, w, h, { opp = true, small = false } = {}) {
  const C = { good: '#22c55e', bad: '#ef4444', text: '#e8edf6', muted: '#8b97ab', ref: '#ffb36b' };
  const n = d.vals.length, gap = small ? 3 : 6, bw = (w - gap * (n - 1)) / n, fs = small ? 12 : 16, pad = fs + 8;
  const hi = Math.max(5, d.line, ...d.vals), lo = Math.min(-5, d.line, ...d.vals), ih = h - (opp ? 26 : 0) - 2 * pad;
  const yv = v => y + pad + ih * (hi - v) / (hi - lo), y0 = yv(0);
  const t = (s, tx, ty, size, color) => { ctx.font = `800 ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(s, tx, ty); };
  d.vals.forEach((v, k) => {
    const bx = x + k * (bw + gap), yt = yv(v);
    ctx.beginPath(); ctx.roundRect(bx, Math.min(y0, yt), bw, Math.max(2, Math.abs(yt - y0)), 4); ctx.fillStyle = d.ok(v) ? C.good : C.bad; ctx.fill();
    if (!small || bw > 18) t((v > 0 ? '+' : '') + v, bx + bw / 2, v >= 0 ? yt - 6 : yt + fs + 2, fs, C.text);
    if (opp && bw >= 26) t(d.opp[k], bx + bw / 2, y + h - 4, bw < 34 ? 11 : 13, C.muted);
  });
  ctx.strokeStyle = 'rgba(139,151,171,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + w, y0); ctx.stroke();
  if (d.line) { ctx.setLineDash([small ? 8 : 12, small ? 6 : 8]); ctx.strokeStyle = C.ref; ctx.lineWidth = small ? 2 : 3; ctx.beginPath(); ctx.moveTo(x, yv(d.line)); ctx.lineTo(x + w, yv(d.line)); ctx.stroke(); ctx.setLineDash([]); }
};
/* ============================================================
   EUROPICKS — imagen 1200×675 de un pick (para publicar en redes)
   renderCard(canvas, { league: 'euroleague' | 'nba', gameId })
     sin gameId → pick más seguro del día · con gameId → ese partido
     (o su previa si no tiene pick seguro). La usan card.html y x.html.
   ============================================================ */
window.renderCard = async function (canvas, { league = 'euroleague', gameId = null, pick = null } = {}) {
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
  /* pick concreto (publicaciones de NBA y combinadas: una foto por pick) → se busca por sus datos */
  const same = (a, b) => a.gameId === b.gameId && a.market === b.market && a.side === b.side && String(a.line) === String(b.line) && String(a.playerId || '') === String(b.playerId || '') && String(a.stat || '') === String(b.stat || '');
  const p = pick ? ((T && T.picks || []).find(x => same(x, pick)) || pick) : T && T.picks && (G ? T.picks.find(x => x.gameId === G) : T.picks[0]);
  if (p && !p.pFinal) p.pFinal = 0;                            // pick antiguo sin datos completos: se dibuja igual
  frame(`${pick ? 'Pick' : G ? (p ? 'Pick del partido' : 'Previa') : 'Pick del día'} · ${L === 'nba' ? 'NBA' : 'Euroliga'}`);
  if (!p && G) { preview(T.games.find(g => g.id === G));  return; }
  if (!p) { txt('Hoy no hay pick lo bastante seguro', 600, 360, 44, C.text, 800, 'center');  return; }
  const when = new Date(p.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  /* columna izquierda: el pick */
  txt(p.match + ' · ' + when, 60, 150, 26, C.muted, 600);
  const title = p.market === 'prop' ? p.player : p.label;
  txt(title, 60, 210, fit(title, 640, 52, 900), C.text, 900);
  if (p.market === 'prop') { const bet = betShort(p); txt(bet, 60, 262, fit(bet, 640, 36, 700), C.text, 700); }
  rr(60, 300, 230, 120, 22); ctx.fillStyle = C.panel2; ctx.fill(); txt('odds', 175, 340, 22, C.muted, 600, 'center'); txt(p.odd.toFixed(2), 175, 400, 54, C.accent2, 900, 'center');
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
    txt('Last 10 games', X + 30, Y + 52, 26, C.text, 800);
    const hits = vals.filter(v => p.side === 'over' ? v > p.line : v < p.line).length;
    txt(`${hits}/${n}`, X + W - 30, Y + 54, 34, hits / Math.max(n, 1) >= .6 ? C.good : C.text, 900, 'right');
    const cx = X + 30, cy = Y + 90, cw = W - 60, ch = 280, gap = 7, bw = (cw - gap * (n - 1)) / n, yv = v => cy + ch * (1 - v / max);
    vals.forEach((v, i) => {
      const ok = p.side === 'over' ? v > p.line : v < p.line, bx = cx + i * (bw + gap), top = yv(v);
      rr(bx, top, bw, cy + ch - top, 6); ctx.fillStyle = ok ? C.good : C.bad; ctx.fill();
      txt(String(v), bx + bw / 2, top - 8, 18, C.text, 800, 'center'); txt(rows[i].o, bx + bw / 2, cy + ch + 26, 15, C.muted, 600, 'center');
    });
    ctx.setLineDash([12, 8]); ctx.strokeStyle = C.accent2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, yv(p.line)); ctx.lineTo(cx + cw, yv(p.line)); ctx.stroke(); ctx.setLineDash([]);
    txt(`line ${p.line} · proj ${p.proj}`, X + W / 2, Y + Hh - 22, 20, C.muted, 600, 'center');
  } else if (teamLast10(T, p)) {
    const d = teamLast10(T, p), hits = d.vals.filter(d.ok).length;
    txt('Last 10 games', X + 30, Y + 52, 26, C.text, 800);
    txt(`${hits}/${d.vals.length}`, X + W - 30, Y + 54, 34, hits / d.vals.length >= .6 ? C.good : C.text, 900, 'right');
    drawMargins(ctx, d, X + 30, Y + 80, W - 60, Hh - 130);
    txt(d.foot, X + W / 2, Y + Hh - 22, fit(d.foot, W - 60, 20, 600), C.muted, 600, 'center');
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

/* ============================================================
   Tarjeta VERTICAL de un pick (7:8), para publicaciones de 2 fotos:
   X las muestra lado a lado en vertical y una tarjeta apaisada se cortaría.
   renderPickTall(canvas, { league, pick })
   ============================================================ */
window.renderPickTall = async function (canvas, { league = 'euroleague', pick } = {}) {
  const L = league === 'nba' ? 'nba' : 'euroleague', BASE = L === 'nba' ? 'data/nba/' : 'data/';
  const C = { bg: '#0b0f17', panel: '#121826', panel2: '#18202f', text: '#e8edf6', muted: '#8b97ab', accent: '#ff7a1a', accent2: '#ffb36b', good: '#22c55e', bad: '#ef4444' };
  const W = 910, H = 1040; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const txt = (s, x, y, size, color = C.text, weight = 800, align = 'left') => { ctx.font = `${weight} ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
  const fit = (s, max, size, weight = 800) => { ctx.font = `${weight} ${size}px Inter`; while (ctx.measureText(s).width > max && size > 18) { size -= 2; ctx.font = `${weight} ${size}px Inter`; } return size; };
  const val = (r, k) => k === 'pra' ? r.pts + r.reb + r.ast : k === 'pr' ? r.pts + r.reb : k === 'pa' ? r.pts + r.ast : k === 'ra' ? r.reb + r.ast : r[k];
  await Promise.all(['600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const T = await fetch(BASE + 'today.json?v=' + Date.now()).then(r => r.json()).catch(() => null);
  const same = (a, b) => a.gameId === b.gameId && a.market === b.market && a.side === b.side && String(a.line) === String(b.line) && String(a.playerId || '') === String(b.playerId || '') && String(a.stat || '') === String(b.stat || '');
  const p = ((T && T.picks) || []).find(x => same(x, pick)) || pick;
  /* fondo y cabecera */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(650, 160, 20, 650, 160, 700); g.addColorStop(0, 'rgba(255,122,26,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(54, 50, 3, 62, 58, 24); bg.addColorStop(0, '#ffb36b'); bg.addColorStop(.6, '#ff7a1a'); bg.addColorStop(1, '#b4410b');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(62, 58, 24, 0, Math.PI * 2); ctx.fill();
  txt('Euro', 98, 72, 38, C.accent, 900); ctx.font = '900 38px Inter'; txt('Picks', 98 + ctx.measureText('Euro').width + 3, 72, 38, C.text, 900);
  txt(`Pick · ${L === 'nba' ? 'NBA' : 'Euroliga'}`, W - 50, 70, 26, C.accent2, 800, 'right');
  /* el pick */
  const when = p.start ? new Date(p.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
  txt(`${p.match || ''}${when ? ' · ' + when : ''}`, 50, 140, fit(`${p.match || ''} · ${when}`, W - 100, 26, 600), C.muted, 600);
  const title = p.market === 'prop' ? (p.player || p.label) : betShort(p);
  txt(title, 50, 200, fit(title, W - 100, 54, 900), C.text, 900);
  if (p.market === 'prop') { const bet = betShort(p); txt(bet, 50, 254, fit(bet, W - 100, 36, 700), C.text, 700); }
  rr(50, 286, 395, 120, 22); ctx.fillStyle = C.panel2; ctx.fill(); txt('odds', 247, 326, 22, C.muted, 600, 'center'); txt(Number(p.odd).toFixed(2), 247, 386, 54, C.accent2, 900, 'center');
  rr(465, 286, 395, 120, 22); ctx.fillStyle = C.panel2; ctx.fill(); txt('probabilidad', 662, 326, 22, C.muted, 600, 'center'); txt(p.pFinal ? Math.round(p.pFinal * 100) + '%' : '—', 662, 386, 54, C.good, 900, 'center');
  /* gráfico */
  const X = 50, Y = 432, PW = W - 100, PH = 520;
  rr(X, Y, PW, PH, 26); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = 'rgba(255,122,26,.45)'; ctx.lineWidth = 2.5; ctx.stroke();
  if (p.market === 'prop' && p.team && p.playerId) {
    const rows = ((await fetch(`${BASE}players/${p.team}.json?v=` + Date.now()).then(r => r.json()).catch(() => ({})))[p.playerId] || []).slice(-10);
    const vals = rows.map(r => val(r, p.stat)), max = Math.max(1, ...vals, p.line) * 1.15, n = Math.max(1, vals.length);
    const hits = vals.filter(v => p.side === 'over' ? v > p.line : v < p.line).length;
    txt('Last 10 games', X + 30, Y + 52, 28, C.text, 800); txt(`${hits}/${vals.length}`, X + PW - 30, Y + 54, 38, hits / n >= .6 ? C.good : C.text, 900, 'right');
    const cx = X + 30, cy = Y + 100, cw = PW - 60, ch = 330, gap = 8, bw = (cw - gap * (n - 1)) / n, yv = v => cy + ch * (1 - v / max);
    vals.forEach((v, i) => {
      const ok = p.side === 'over' ? v > p.line : v < p.line, bx = cx + i * (bw + gap), top = yv(v);
      rr(bx, top, bw, cy + ch - top, 7); ctx.fillStyle = ok ? C.good : C.bad; ctx.fill();
      txt(String(v), bx + bw / 2, top - 9, 20, C.text, 800, 'center'); txt(rows[i].o, bx + bw / 2, cy + ch + 28, 16, C.muted, 600, 'center');
    });
    ctx.setLineDash([12, 8]); ctx.strokeStyle = C.accent2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, yv(p.line)); ctx.lineTo(cx + cw, yv(p.line)); ctx.stroke(); ctx.setLineDash([]);
    if (p.proj != null) txt(`line ${p.line} · proj ${p.proj}`, X + PW / 2, Y + PH - 24, 22, C.muted, 600, 'center');
  } else if (teamLast10(T, p)) {
    const d = teamLast10(T, p), hits = d.vals.filter(d.ok).length;
    txt('Last 10 games', X + 30, Y + 52, 28, C.text, 800);
    txt(`${hits}/${d.vals.length}`, X + PW - 30, Y + 54, 38, hits / d.vals.length >= .6 ? C.good : C.text, 900, 'right');
    drawMargins(ctx, d, X + 30, Y + 84, PW - 60, PH - 140);
    txt(d.foot, X + PW / 2, Y + PH - 24, fit(d.foot, PW - 60, 22, 600), C.muted, 600, 'center');
  } else {
    txt('Por qué este pick', X + 30, Y + 56, 28, C.text, 800);
    [['Modelo EuroPicks', p.pModel], ['Mercado (sin margen)', p.pMarket], ['Probabilidad final', p.pFinal]].forEach(([l, v], i) => {
      if (v == null) return; const y = Y + 140 + i * 120;
      txt(l, X + 30, y, 24, C.muted, 600); txt(Math.round(v * 100) + '%', X + PW - 30, y, 30, C.text, 800, 'right');
      rr(X + 30, y + 20, PW - 60, 20, 10); ctx.fillStyle = C.panel2; ctx.fill(); rr(X + 30, y + 20, (PW - 60) * v, 20, 10); ctx.fillStyle = i === 2 ? C.good : C.accent; ctx.fill();
    });
  }
  txt('europicks.pages.dev', 50, H - 36, 24, C.accent, 800); txt('+18', W - 50, H - 36, 22, C.muted, 600, 'right');
};

/* Varios picks en UNA foto (1200×675): un panel por pick con su gráfico Last 10.
   1 fila hasta 4 picks, 2 filas hasta 8. Con combo → abajo la cuota total.
   renderPicksGrid(canvas, { league, picks, from, combo }) */
window.renderPicksGrid = async function (canvas, { league = 'euroleague', picks = [], from = 1, combo = null } = {}) {
  const L = league === 'nba' ? 'nba' : 'euroleague', BASE = L === 'nba' ? 'data/nba/' : 'data/';
  const C = { bg: '#0b0f17', panel: '#121826', panel2: '#18202f', text: '#e8edf6', muted: '#8b97ab', accent: '#ff7a1a', accent2: '#ffb36b', good: '#22c55e', bad: '#ef4444' };
  const W = 1200, H = 675; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const txt = (s, x, y, size, color = C.text, weight = 800, align = 'left') => { ctx.font = `${weight} ${size}px Inter`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
  const fit = (s, max, size, weight = 800) => { ctx.font = `${weight} ${size}px Inter`; while (ctx.measureText(s).width > max && size > 12) { size -= 1; ctx.font = `${weight} ${size}px Inter`; } return size; };
  const val = (r, k) => k === 'pra' ? r.pts + r.reb + r.ast : k === 'pr' ? r.pts + r.reb : k === 'pa' ? r.pts + r.ast : k === 'ra' ? r.reb + r.ast : r[k];
  await Promise.all(['600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const T = await fetch(BASE + 'today.json?v=' + Date.now()).then(r => r.json()).catch(() => null);
  const same = (a, b) => a.gameId === b.gameId && a.market === b.market && a.side === b.side && String(a.line) === String(b.line) && String(a.playerId || '') === String(b.playerId || '') && String(a.stat || '') === String(b.stat || '');
  const legs = picks.map(l => ({ ...(((T && T.picks) || []).find(x => same(x, l)) || {}), ...l }));
  const teams = {};
  for (const t of new Set(legs.filter(l => l.market === 'prop' && l.team).map(l => l.team))) teams[t] = await fetch(`${BASE}players/${t}.json?v=` + Date.now()).then(r => r.json()).catch(() => ({}));
  /* fondo y cabecera */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(900, 120, 20, 900, 120, 800); g.addColorStop(0, 'rgba(255,122,26,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(50, 40, 3, 58, 48, 20); bg.addColorStop(0, '#ffb36b'); bg.addColorStop(.6, '#ff7a1a'); bg.addColorStop(1, '#b4410b');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(58, 48, 20, 0, Math.PI * 2); ctx.fill();
  txt('Euro', 90, 60, 32, C.accent, 900); ctx.font = '900 32px Inter'; txt('Picks', 90 + ctx.measureText('Euro').width + 3, 60, 32, C.text, 900);
  txt(`${combo ? 'Safe Parlay' : 'Picks Day'} · ${L === 'nba' ? 'NBA' : 'EuroLeague'}`, W - 40, 58, 26, C.accent2, 800, 'right');
  /* paneles */
  const n = legs.length, rows = n > 4 ? 2 : 1, cols = Math.ceil(n / rows), gap = 16, X0 = 30, Y0 = 86;
  const bottom = combo ? 560 : 610, colW = (W - 2 * X0 - gap * (cols - 1)) / cols, PH = (bottom - Y0 - gap * (rows - 1)) / rows;
  const small = rows > 1 || cols > 3;
  legs.forEach((l, i) => {
    const x = X0 + (i % cols) * (colW + gap), y = Y0 + Math.floor(i / cols) * (PH + gap);
    rr(x, y, colW, PH, 18); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = 'rgba(255,122,26,.35)'; ctx.lineWidth = 2; ctx.stroke();
    const who = l.market === 'prop' ? (l.player || l.list || l.label) : (l.match || '');
    const bet = betShort(l), head = `${i + from}. ${who}`;
    txt(head, x + 16, y + (small ? 30 : 40), fit(head, colW - 32, small ? 22 : 27, 900), C.text, 900);
    txt(bet, x + 16, y + (small ? 56 : 76), fit(bet, colW - 110, small ? 19 : 23, 700), C.muted, 700);
    txt('@' + Number(l.odd).toFixed(2), x + colW - 16, y + (small ? 56 : 76), small ? 21 : 25, C.accent2, 900, 'right');
    const hist = l.market === 'prop' && teams[l.team] ? (teams[l.team][l.playerId] || []).slice(-10) : [];
    if (hist.length) {
      const vals = hist.map(r => val(r, l.stat)), max = Math.max(1, ...vals, l.line) * 1.2, m = vals.length;
      const hits = vals.filter(v => l.side === 'over' ? v > l.line : v < l.line).length;
      const hy = y + (small ? 84 : 118);
      txt('Last 10', x + 16, hy, small ? 15 : 19, C.muted, 600); txt(`${hits}/${m}`, x + colW - 16, hy + 2, small ? 20 : 26, hits / m >= .6 ? C.good : C.text, 900, 'right');
      const cx = x + 16, cy = hy + (small ? 22 : 34), cw = colW - 32, ch = y + PH - 16 - cy, bgap = small ? 3 : 5, bw = (cw - bgap * (m - 1)) / m, yv = v => cy + ch * (1 - v / max);
      vals.forEach((v, k) => {
        const ok = l.side === 'over' ? v > l.line : v < l.line, bx = cx + k * (bw + bgap), top = yv(v);
        rr(bx, top, bw, cy + ch - top, 4); ctx.fillStyle = ok ? C.good : C.bad; ctx.fill();
        if (!small || bw > 18) txt(String(v), bx + bw / 2, top - 5, small ? 12 : 15, C.text, 800, 'center');
      });
      ctx.setLineDash([8, 6]); ctx.strokeStyle = C.accent2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, yv(l.line)); ctx.lineTo(cx + cw, yv(l.line)); ctx.stroke(); ctx.setLineDash([]);
    } else if (teamLast10(T, l)) {
      const d = teamLast10(T, l), hits = d.vals.filter(d.ok).length, hy = y + (small ? 84 : 118);
      txt('Last 10', x + 16, hy, small ? 15 : 19, C.muted, 600); txt(`${hits}/${d.vals.length}`, x + colW - 16, hy + 2, small ? 20 : 26, hits / d.vals.length >= .6 ? C.good : C.text, 900, 'right');
      drawMargins(ctx, d, x + 16, hy + 8, colW - 32, y + PH - 12 - hy - 8, { small, opp: !small });
    } else {
      txt(l.match || '', x + colW / 2, y + PH / 2 + 30, fit(l.match || '', colW - 32, 22, 700), C.muted, 700, 'center');
    }
  });
  /* pie */
  if (combo) {
    rr(X0, 576, W - 2 * X0, 64, 16); ctx.fillStyle = C.panel2; ctx.fill();
    txt('Total odds', X0 + 24, 618, 26, C.muted, 600); txt(Number(combo.odd).toFixed(2), X0 + 190, 620, 38, C.accent2, 900);
    txt('europicks.pages.dev · +18', W - X0 - 24, 616, 22, C.accent, 800, 'right');
  } else {
    txt('europicks.pages.dev', X0, 650, 22, C.accent, 800); txt('+18 · Juega con responsabilidad', W - X0, 650, 18, C.muted, 600, 'right');
  }
};
window.renderComboCard = (canvas, { league, combo }) => window.renderPicksGrid(canvas, { league, picks: combo.legs, combo });

/* ============================================================
   Tarjeta de PREDICCIÓN CLAVADA (1200×675): marcador predicho vs final con
   logos; en verde los números exactos. renderPredCard(canvas, { league, g })
   g = { home, away, hl, al (logos), pred:[h,a], real:[h,a], how:'exact'|'team'|'close', team } · o una lista de ellos
   ============================================================ */
window.renderPredCard = async function (canvas, { league = 'euroleague', g } = {}) {
  const G = Array.isArray(g) ? g : [g];
  const C = { bg: '#0a0e15', text: '#f1f5fb', muted: '#8b97ab', accent: '#ff7a1a', accent2: '#ffb36b', good: '#22c55e', good2: '#4ade80' };
  const W = 1200, H = 675; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const txt = (s, x, y, size, color = C.text, weight = 800, align = 'left', sp = 0) => { ctx.font = `${weight} ${size}px Inter`; ctx.letterSpacing = sp + 'px'; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.letterSpacing = '0px'; };
  const fit = (s, max, size, weight = 800, sp = 0) => { ctx.letterSpacing = sp + 'px'; ctx.font = `${weight} ${size}px Inter`; while (ctx.measureText(s).width > max && size > 16) { size -= 2; ctx.font = `${weight} ${size}px Inter`; } ctx.letterSpacing = '0px'; return size; };
  const img = u => new Promise(res => { if (!u) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; const t = setTimeout(() => res(null), 6000); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = u; });
  /* logo dentro de un círculo claro (los escudos oscuros se ven sobre el fondo negro) */
  const badge = (im, cx, cy, r, name) => {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#f4f6fa'; ctx.fill(); ctx.restore();
    if (im) { const k = r * 1.45 / Math.max(im.width, im.height); ctx.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k); }
    else txt(name.slice(0, 3).toUpperCase(), cx, cy + r * .2, r * .6, '#111', 900, 'center');
  };
  await Promise.all(['600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Inter`)));
  const logos = await Promise.all(G.flatMap(x => [img(x.hl), img(x.al)]));
  /* fondo */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let gr = ctx.createRadialGradient(600, 380, 10, 600, 380, 650); gr.addColorStop(0, 'rgba(34,197,94,.20)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  gr = ctx.createRadialGradient(1100, 0, 10, 1100, 0, 500); gr.addColorStop(0, 'rgba(255,122,26,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  /* cabecera */
  const bg = ctx.createRadialGradient(54, 46, 3, 62, 54, 22); bg.addColorStop(0, '#ffb36b'); bg.addColorStop(.6, '#ff7a1a'); bg.addColorStop(1, '#b4410b');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(62, 54, 22, 0, Math.PI * 2); ctx.fill();
  txt('Euro', 96, 67, 36, C.accent, 900); ctx.font = '900 36px Inter'; txt('Picks', 96 + ctx.measureText('Euro').width + 2, 67, 36, C.text, 900);
  const tag = `PREDICTION · ${league === 'nba' ? 'NBA' : 'EUROLEAGUE'}`;
  ctx.font = '800 18px Inter'; ctx.letterSpacing = '2px'; const tw = ctx.measureText(tag).width + 36; ctx.letterSpacing = '0px';
  rr(W - 50 - tw, 34, tw, 40, 20); ctx.fillStyle = 'rgba(255,122,26,.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,122,26,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  txt(tag, W - 50 - tw / 2, 60, 18, C.accent2, 800, 'center', 2);
  /* titular con brillo */
  const g0 = G[0], off = x => Math.abs(x.pred[0] - x.real[0]) + Math.abs(x.pred[1] - x.real[1]);
  const head = G.length > 1 ? (G.some(x => x.how !== 'close') ? 'PREDICTIONS NAILED' : 'SO CLOSE')
    : g0.how === 'exact' ? 'SCORE NAILED' : g0.how === 'team' ? `${g0.team.toUpperCase()} NAILED` : `ONLY ${off(g0)} POINTS OFF`;
  ctx.save(); ctx.shadowColor = 'rgba(34,197,94,.55)'; ctx.shadowBlur = 30;
  txt(head, W / 2, 150, fit(head, 1000, 66, 900, 1), C.good2, 900, 'center', 1); ctx.restore();
  /* número con píldora verde si es exacto */
  const num = (v, ok, cx, cy, size, fin) => {
    ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(String(v)).width + size * .5;
    if (ok) { rr(cx - w / 2, cy - size * .86, w, size * 1.12, size * .26); ctx.fillStyle = 'rgba(34,197,94,.16)'; ctx.fill(); ctx.strokeStyle = C.good; ctx.lineWidth = 3; ctx.stroke(); }
    txt(String(v), cx, cy, size, ok ? C.good2 : fin ? C.text : C.accent2, 900, 'center');
  };
  if (G.length === 1) {
    const x = g0;
    /* equipos a los lados */
    badge(logos[0], 190, 340, 82, x.home); badge(logos[1], 1010, 340, 82, x.away);
    txt(x.home, 190, 470, fit(x.home, 300, 34, 800), C.text, 800, 'center'); txt(x.away, 1010, 470, fit(x.away, 300, 34, 800), C.text, 800, 'center');
    /* marcadores en el centro */
    rr(330, 200, 540, 330, 28); ctx.fillStyle = 'rgba(18,24,38,.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1.5; ctx.stroke();
    [['OUR PREDICTION', x.pred, 280, false], ['FINAL SCORE', x.real, 440, true]].forEach(([l, sc, y, fin]) => {
      txt(l, 600, y - 46, 17, C.muted, 800, 'center', 3);
      num(sc[0], x.pred[0] === x.real[0], 480, y + 30, 76, fin); txt('–', 600, y + 22, 50, C.muted, 700, 'center'); num(sc[1], x.pred[1] === x.real[1], 720, y + 30, 76, fin);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(370, 362); ctx.lineTo(830, 362); ctx.stroke();
    const sub = x.how === 'exact' ? 'Exact final score' : x.how === 'team' ? `${x.team} points exact · winner right` : `Winner right · only ${off(x)} points off`;
    txt(sub, 600, 575, 24, C.good2, 700, 'center');
  } else {
    /* varios partidos: una fila por partido */
    const RH = Math.min(130, 400 / G.length), top = 190 + (400 - RH * G.length) / 2, big = RH >= 120, fz = big ? 50 : 38;
    txt('PREDICTION', 735, top - 8, 15, C.muted, 800, 'center', 2.5); txt('FINAL', 1025, top - 8, 15, C.muted, 800, 'center', 2.5);
    G.forEach((x, i) => {
      const y = top + i * RH, mid = y + RH / 2, lr = big ? 30 : 22;
      rr(50, y + 6, W - 100, RH - 12, 20); ctx.fillStyle = 'rgba(18,24,38,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1.5; ctx.stroke();
      badge(logos[2 * i], 100, mid, lr, x.home); badge(logos[2 * i + 1], 100 + lr * 2 + 10, mid, lr, x.away);
      const tx = 100 + lr * 3 + 30, name = `${x.home} – ${x.away}`;
      txt(name, tx, mid - (big ? 4 : 2), fit(name, 600 - tx, big ? 34 : 27, 800), C.text, 800);
      txt(x.how === 'exact' ? 'Exact score' : x.how === 'team' ? `${x.team} exact` : `Only ${off(x)} pts off`, tx, mid + (big ? 30 : 24), big ? 21 : 18, C.good2, 700);
      const pair = (sc, cx, fin) => { num(sc[0], x.pred[0] === x.real[0], cx - fz * 1.3, mid + fz / 3, fz, fin); txt('–', cx, mid + fz / 3 - 4, fz * .7, C.muted, 700, 'center'); num(sc[1], x.pred[1] === x.real[1], cx + fz * 1.3, mid + fz / 3, fz, fin); };
      pair(x.pred, 735, false); pair(x.real, 1025, true);
    });
  }
  /* pie */
  txt('✓ Predicted before tip-off', 50, 636, 21, C.muted, 600);
  txt('europicks.pages.dev', W - 50, 636, 24, C.accent, 800, 'right');
};
