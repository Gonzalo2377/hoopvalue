/* ============================================================
   HOOPVALUE — interfaz (lee los JSON que genera el robot)
   ============================================================ */
const $app = document.getElementById('app');
const D = { today: null, teams: null, record: null, backtest: null };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => x == null ? '—' : (x * 100).toFixed(d) + '%';
const sgn = x => x == null ? '—' : (x > 0 ? '+' : '') + x;
const MK = { ml: 'Ganador', spread: 'Hándicap', total: 'Total puntos' };
const TIER = { A: 'Muy seguro', B: 'Seguro', C: 'Moderado' };

async function load() {
  const get = f => fetch('data/' + f + '?v=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
  [D.today, D.teams, D.record, D.backtest] = await Promise.all(['today.json', 'teams.json', 'record.json', 'backtest.json'].map(get));
  if (D.today) document.getElementById('updated').textContent = 'Actualizado: ' + new Date(D.today.meta.updatedAt).toLocaleString('es-ES');
  route();
}

/* ---------- navegación ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
window.onhashchange = route;
function route() {
  const [tab, arg] = (location.hash.slice(1) || 'picks').split('/');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ({ game: 'games', player: 'players' }[tab] || tab)));
  const V = { picks: viewPicks, games: viewGames, game: () => viewGame(arg), players: viewPlayers, player: () => viewPlayer(arg), teams: viewTeams, record: viewRecord, how: viewHow }[tab] || viewPicks;
  $app.innerHTML = V();
  window.scrollTo(0, 0);
}

/* ---------- piezas comunes ---------- */
const logo = t => t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : '';
const form = s => `<span class="form">${(s || '').split('').map(c => `<span class="${c}">${c === 'W' ? 'V' : 'D'}</span>`).join('')}</span>`;
const rec = r => r ? `${r.w}-${r.l}` : '—';
const tierBadge = t => `<span class="badge tier-${t}">${t} · ${TIER[t]}</span>`;

function pickCard(p, hero) {
  const sig = (p.signals || []).map(s => `<li class="${s.ok ? '' : 'no'}">${esc(s.txt)}</li>`).join('');
  return `<div class="card ${hero ? 'hero' : ''}">
    ${hero ? '<div class="kicker">Pick más seguro del día</div>' : ''}
    <div class="row"><span class="muted">${esc(p.match)} · ${new Date(p.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span><span class="sp"></span>${tierBadge(p.tier)}</div>
    <div class="row"><div class="pick-label">${esc(p.label)}</div><span class="sp"></span><span class="odd">${p.odd.toFixed(2)}</span></div>
    <div class="muted">${MK[p.market]} · mejor cuota en ${esc(p.book)}</div>
    <div class="bar"><i style="width:${(p.pFinal * 100).toFixed(0)}%"></i></div>
    <div class="kv">
      <div><small>Probabilidad</small><b>${pct(p.pFinal)}</b></div>
      <div><small>Mercado (justa)</small><b>${pct(p.pMarket)}</b></div>
      <div><small>Modelo</small><b>${pct(p.pModel)}</b></div>
      <div><small>Cuota justa</small><b>${p.fair}</b></div>
      <div><small>Valor esperado</small><b class="${p.ev >= 0 ? 'good' : 'bad'}">${sgn((p.ev * 100).toFixed(1))}%</b></div>
      <div><small>Referencia</small><b>${p.sharp ? 'Pinnacle' : 'Consenso de casas'}</b></div>
    </div>
    ${sig ? `<ul class="sig">${sig}</ul>` : ''}
    <div class="row" style="margin-top:8px"><a href="#game/${encodeURIComponent(p.gameId)}" style="color:var(--accent2)">Ver análisis completo →</a></div>
  </div>`;
}

/* ---------- PICKS ---------- */
function viewPicks() {
  const T = D.today;
  if (!T) return `<p class="muted pad">Aún no hay datos. El robot los genera en su próxima ejecución.</p>`;
  let h = '';
  if (!T.games.length) {
    h += `<div class="card"><h3>No hay partidos en las próximas 36 horas</h3><p class="muted">${T.meta.nextGame ? 'Próximo partido: ' + new Date(T.meta.nextGame).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}</p></div>`;
  } else if (!T.meta.oddsSource) {
    h += `<div class="note">Sin clave de cuotas configurada: se muestran las predicciones del modelo, pero no hay picks (se necesitan cuotas para saber qué es seguro y qué no). Ver SETUP_ES.md.</div>`;
  } else if (!T.picks.length) {
    h += `<div class="card"><h3>Hoy no hay ningún pick lo bastante seguro</h3><p class="muted">Ningún mercado supera el ${Math.round(0.55 * 100)} % con cuota ≥ ${T.meta.minOdd} sin valor esperado negativo. No apostar también es una decisión.</p></div>`;
  }
  if (T.picks.length) {
    h += pickCard(T.picks[0], true);
    if (T.combo) h += `<h2>Combinada segura</h2><div class="card"><div class="row"><b>${T.combo.legs.length} selecciones</b><span class="sp"></span><span class="odd">${T.combo.odd.toFixed(2)}</span></div>
      <ul class="sig">${T.combo.legs.map(l => `<li>${esc(l.label)} <span class="muted">(${l.odd.toFixed(2)} · ${pct(l.pFinal)})</span></li>`).join('')}</ul>
      <div class="muted" style="margin-top:6px">Probabilidad conjunta ${pct(T.combo.prob)} · valor esperado ${sgn((T.combo.ev * 100).toFixed(1))}%</div></div>`;
    if (T.picks.length > 1) h += `<h2>Resto de picks del día</h2><div class="grid">${T.picks.slice(1).map(p => pickCard(p)).join('')}</div>`;
  }
  if (T.games.length) h += `<h2>Partidos</h2>${gamesGrid(T.games)}`;
  return h;
}

/* ---------- PARTIDOS ---------- */
function gamesGrid(games) {
  return `<div class="grid">${games.map(g => {
    const m = g.model, mk = g.market;
    return `<div class="card game" onclick="location.hash='game/${encodeURIComponent(g.id)}'">
      <div class="row muted"><span>${esc(g.day)} · ${esc(g.time)}</span><span class="sp"></span><span>Jornada ${esc(g.round)}</span></div>
      <div class="row" style="margin-top:8px"><div class="teams">${logo(g.home)}${esc(g.home.name)}</div><span class="sp"></span><span class="score">${Math.round(m.ptsH)}</span></div>
      <div class="row"><div class="teams">${logo(g.away)}${esc(g.away.name)}</div><span class="sp"></span><span class="score">${Math.round(m.ptsA)}</span></div>
      <div class="bar"><i style="width:${(m.pHome * 100).toFixed(0)}%"></i></div>
      <div class="row muted"><span>Modelo: local ${pct(m.pHome)}</span><span class="sp"></span><span>${mk && mk.ml ? 'Mercado: ' + pct(mk.ml.pA) : 'Sin cuotas'}</span></div>
      <div class="row" style="margin-top:6px">${form(g.home.trends.form)}<span class="sp"></span>${form(g.away.trends.form)}</div>
    </div>`;
  }).join('')}</div>`;
}
function viewGames() {
  const T = D.today;
  if (!T || !T.games.length) return `<p class="muted pad">No hay partidos en las próximas 36 horas.</p>`;
  return `<h2>Próximos partidos</h2>${gamesGrid(T.games)}`;
}

function cmpRow(label, a, b, higherBetter = true, fmt = x => x) {
  const better = (a == null || b == null || a === b) ? 0 : ((a > b) === higherBetter ? 1 : 2);
  return `<div class="l ${better === 1 ? 'better' : ''}">${fmt(a)}</div><div class="lbl">${label}</div><div class="${better === 2 ? 'better' : ''}">${fmt(b)}</div>`;
}
function viewGame(id) {
  const g = D.today && D.today.games.find(x => x.id === decodeURIComponent(id || ''));
  if (!g) return `<button class="back" onclick="history.back()">← Volver</button><p class="muted">Partido no encontrado (puede que ya haya empezado).</p>`;
  const H = g.home, A = g.away, th = H.trends, ta = A.trends, m = g.model, mk = g.market;
  const one = x => x == null ? '—' : x.toFixed(1);
  let h = `<button class="back" onclick="history.back()">← Volver</button>
  <div class="card"><div class="row muted"><span>${esc(g.day)} · ${esc(g.time)} · Jornada ${esc(g.round)}</span></div>
    <div class="row" style="margin-top:10px"><div class="teams">${logo(H)}${esc(H.full || H.name)}</div><span class="sp"></span><span class="score">${one(m.ptsH)}</span></div>
    <div class="row"><div class="teams">${logo(A)}${esc(A.full || A.name)}</div><span class="sp"></span><span class="score">${one(m.ptsA)}</span></div>
    <div class="kv"><div><small>Prob. local (modelo)</small><b>${pct(m.pHome)}</b></div><div><small>Margen esperado</small><b>${sgn(m.margin)}</b></div><div><small>Total esperado</small><b>${m.total}</b></div>
      <div><small>Mercado ganador</small><b>${mk && mk.ml ? pct(mk.ml.pA) + ' local' : '—'}</b></div><div><small>Hándicap mercado</small><b>${mk && mk.spread ? sgn(mk.spread.line) : '—'}</b></div><div><small>Total mercado</small><b>${mk && mk.total ? mk.total.line : '—'}</b></div></div>
    ${m.adj.length ? `<div class="muted" style="margin-top:8px">Ajustes: ${m.adj.map(esc).join(' · ')}</div>` : ''}
    ${mk && mk.opening ? `<div class="muted" style="margin-top:4px">Apertura vista: ${mk.opening.spread ? 'hándicap ' + sgn(mk.opening.spread.line) : ''} ${mk.opening.total ? '· total ' + mk.opening.total.line : ''} · ${mk.books} casas</div>` : ''}
  </div>`;
  if (g.candidates.length) h += `<h2>Mercados analizados</h2><div class="card scroll"><table><tr><th>Apuesta</th><th class="num">Cuota</th><th class="num">Prob.</th><th class="num">Mercado</th><th class="num">Modelo</th><th class="num">VE</th><th>Nivel</th><th></th></tr>
    ${g.candidates.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.odd.toFixed(2)}</td><td class="num">${pct(c.pFinal)}</td><td class="num">${pct(c.pMarket)}</td><td class="num">${pct(c.pModel)}</td><td class="num ${c.ev >= 0 ? 'good' : 'bad'}">${sgn((c.ev * 100).toFixed(1))}%</td><td>${tierBadge(c.tier)}</td><td>${c.qualifies ? '✓' : ''}</td></tr>`).join('')}</table></div>`;
  h += `<h2>Cara a cara de estadísticas</h2><div class="card"><div class="cmp">
    <div class="l"><b>${esc(H.name)}</b></div><div></div><div><b>${esc(A.name)}</b></div>
    ${cmpRow('Rating neto /100', H.rating.net, A.rating.net, true, one)}
    ${cmpRow('Ataque /100', H.rating.off, A.rating.off, true, one)}
    ${cmpRow('Defensa /100 (menos = mejor)', H.rating.def, A.rating.def, false, one)}
    ${cmpRow('Ritmo', H.rating.pace, A.rating.pace, true, one)}
    <div class="l">${rec(th.season)}</div><div class="lbl">Récord</div><div>${rec(ta.season)}</div>
    <div class="l">${rec(th.home)}</div><div class="lbl">Casa (local) / Fuera (visitante)</div><div>${rec(ta.away)}</div>
    <div class="l">${form(th.form)}</div><div class="lbl">Últimos 5</div><div>${form(ta.form)}</div>
    ${cmpRow('Momentum (margen L5 − media)', th.momentum, ta.momentum, true, sgn)}
    ${cmpRow('Anota (L5)', th.pfL5, ta.pfL5, true, one)}
    ${cmpRow('Concede (L5)', th.paL5, ta.paL5, false, one)}
    ${cmpRow('Anota (temporada)', th.pfSeason, ta.pfSeason, true, one)}
    ${cmpRow('Concede (temporada)', th.paSeason, ta.paSeason, false, one)}
    ${cmpRow('Margen 1ª parte', th.h1Margin, ta.h1Margin, true, sgn)}
    ${cmpRow('Margen 4º cuarto', th.q4Margin, ta.q4Margin, true, sgn)}
    ${cmpRow('Días de descanso', th.restDays, ta.restDays, true)}
    <div class="l">${th.atsL10.n ? th.atsL10.y + '/' + th.atsL10.n : '—'}</div><div class="lbl">Cubre hándicap (L10)</div><div>${ta.atsL10.n ? ta.atsL10.y + '/' + ta.atsL10.n : '—'}</div>
    <div class="l">${th.overL10.n ? th.overL10.y + '/' + th.overL10.n : '—'}</div><div class="lbl">Over (L10)</div><div>${ta.overL10.n ? ta.overL10.y + '/' + ta.overL10.n : '—'}</div>
  </div></div>`;
  const abs = (t) => t.absences.length ? t.absences.map(a => `<li class="no">${esc(a.name)} — no jugó ${a.missed > 1 ? `los últimos ${a.missed}` : 'el último'} partido${a.missed > 1 ? 's' : ''}${a.impact ? ` (−${a.impact} pts)` : ''}</li>`).join('') : '<li>Sin ausencias detectadas</li>';
  h += `<h2>Bajas probables</h2><div class="grid"><div class="card"><b>${esc(H.name)}</b><ul class="sig">${abs(H)}</ul></div><div class="card"><b>${esc(A.name)}</b><ul class="sig">${abs(A)}</ul></div></div>
    <p class="muted">La Euroliga no publica parte médico gratis: se avisa de habituales que no jugaron el último partido. Confírmalo antes de apostar.</p>`;
  const last = t => `<table><tr><th>Fecha</th><th>Rival</th><th class="num">Resultado</th></tr>${t.lastGames.map(x => `<tr><td>${x.d.slice(5)}</td><td>${x.h ? 'vs' : '@'} ${esc(x.opp)}</td><td class="num ${x.pf > x.pa ? 'good' : 'bad'}">${x.pf}-${x.pa}</td></tr>`).join('')}</table>`;
  h += `<h2>Últimos partidos</h2><div class="grid"><div class="card scroll"><b>${esc(H.name)}</b>${last(th)}</div><div class="card scroll"><b>${esc(A.name)}</b>${last(ta)}</div></div>`;
  if (g.h2h.length) h += `<h2>Enfrentamientos directos</h2><div class="card scroll"><table>${g.h2h.map(x => `<tr><td>${x.d}</td><td>${esc(x.home)} – ${esc(x.away)}</td><td class="num">${x.hs}-${x.as}</td></tr>`).join('')}</table></div>`;
  if (g.players.length) h += `<h2>Proyección de jugadores</h2><div class="card scroll"><table><tr><th>Jugador</th><th>Eq.</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">Triples</th><th class="num">P+R+A</th><th>Puntos últimos 10</th></tr>
    ${g.players.map(p => `<tr class="click" onclick="location.hash='player/${encodeURIComponent(p.id || '')}'"><td>${esc(p.name)}${p.starter ? '' : ' <span class="muted">(B)</span>'}</td><td>${esc(p.team)}</td><td class="num">${p.min}</td><td class="num">${p.pts}</td><td class="num">${p.reb}</td><td class="num">${p.ast}</td><td class="num">${p.tpm}</td><td class="num">${p.pra}</td><td class="muted">${p.l10pts.join(' · ')}</td></tr>`).join('')}</table>
    <p class="muted">Proyección = ritmo por minuto reciente × minutos previstos × ritmo del partido × defensa rival. Pulsa un jugador para ver su ficha con gráficos.</p></div>`;
  return h;
}

/* ---------- EQUIPOS ---------- */
function viewTeams() {
  const T = D.teams;
  if (!T) return `<p class="muted pad">Sin datos de equipos todavía.</p>`;
  return `<h2>Ranking por rating neto</h2><p class="muted">Puntos por 100 posesiones respecto a la media de la liga, ajustados por rival y cancha. Media liga: ${T.L} pts/100 · ritmo ${T.pace} posesiones · ventaja de campo ${sgn(T.hca)} pts/100.</p>
  <div class="card scroll"><table><tr><th>#</th><th>Equipo</th><th class="num">Neto</th><th class="num">Ataque</th><th class="num">Defensa</th><th class="num">Ritmo</th><th class="num">Récord</th><th class="num">Casa</th><th class="num">Fuera</th><th>Últimos 5</th><th class="num">Racha</th><th class="num">Momentum</th><th class="num">Anota</th><th class="num">Concede</th></tr>
  ${T.teams.map((t, i) => `<tr><td>${i + 1}</td><td><div class="teams">${logo(t)}${esc(t.name)}</div></td><td class="num ${t.net >= 0 ? 'good' : 'bad'}">${sgn(t.net)}</td><td class="num">${sgn(t.off)}</td><td class="num">${sgn(t.def)}</td><td class="num">${sgn(t.pace)}</td>
    <td class="num">${rec(t.trends.season)}</td><td class="num">${rec(t.trends.home)}</td><td class="num">${rec(t.trends.away)}</td><td>${form(t.trends.form)}</td><td class="num">${t.trends.streak > 0 ? 'V' + t.trends.streak : 'D' + -t.trends.streak}</td>
    <td class="num ${t.trends.momentum >= 0 ? 'good' : 'bad'}">${sgn(t.trends.momentum)}</td><td class="num">${t.trends.pfSeason}</td><td class="num">${t.trends.paSeason}</td></tr>`).join('')}</table></div>`;
}

/* ---------- HISTORIAL ---------- */
function statTiles(s) {
  return `<div class="stats">
    <div class="stat"><small>Picks liquidados</small><b>${s.n}</b></div>
    <div class="stat"><small>Acierto</small><b>${pct(s.hit, 1)}</b></div>
    <div class="stat"><small>Beneficio (1 u/pick)</small><b class="${s.profit >= 0 ? 'good' : 'bad'}">${sgn(s.profit)} u</b></div>
    <div class="stat"><small>ROI</small><b class="${(s.roi || 0) >= 0 ? 'good' : 'bad'}">${s.roi == null ? '—' : sgn((s.roi * 100).toFixed(1)) + '%'}</b></div>
    <div class="stat"><small>CLV medio</small><b class="${(s.clv || 0) >= 0 ? 'good' : 'bad'}">${s.clv == null ? '—' : sgn((s.clv * 100).toFixed(1)) + '%'}</b></div>
  </div>`;
}
function viewRecord() {
  const R = D.record, B = D.backtest;
  let h = '<h2>Historial real</h2>';
  if (!R || !R.record.length) h += `<p class="muted">Todavía no hay picks liquidados. Cada pick se registra con la cuota del momento en que se publica y se liquida solo con el resultado oficial de la Euroliga.</p>`;
  else {
    h += statTiles(R.stats.all);
    h += `<h3>Por nivel y mercado</h3><div class="card scroll"><table><tr><th></th><th class="num">Picks</th><th class="num">Acierto</th><th class="num">ROI</th><th class="num">CLV</th></tr>
      ${[...Object.entries(R.stats.tier).map(([k, v]) => [TIER[k], v]), ...Object.entries(R.stats.market).map(([k, v]) => [MK[k], v])].filter(([, v]) => v.n)
        .map(([k, v]) => `<tr><td>${k}</td><td class="num">${v.n}</td><td class="num">${pct(v.hit, 1)}</td><td class="num">${v.roi == null ? '—' : (v.roi * 100).toFixed(1) + '%'}</td><td class="num">${v.clv == null ? '—' : (v.clv * 100).toFixed(1) + '%'}</td></tr>`).join('')}</table></div>
      <p class="muted">CLV = valor de nuestra cuota frente a la probabilidad justa de cierre. Si es positivo de forma sostenida, los picks son buenos aunque una racha salga mal.</p>`;
  }
  if (R && R.pending.length) h += `<h3>Pendientes (${R.pending.length})</h3><div class="card scroll"><table>${R.pending.map(p => `<tr><td>${new Date(p.start).toLocaleDateString('es-ES')}</td><td>${esc(p.match)}</td><td>${esc(p.label)}</td><td class="num">${p.odd.toFixed(2)}</td><td>${tierBadge(p.tier)}</td></tr>`).join('')}</table></div>`;
  if (R && R.record.length) h += `<h3>Últimos liquidados</h3><div class="card scroll"><table><tr><th>Fecha</th><th>Partido</th><th>Pick</th><th class="num">Cuota</th><th class="num">Resultado</th><th></th><th class="num">CLV</th></tr>${R.record.slice(0, 100).map(p => `<tr><td>${new Date(p.start).toLocaleDateString('es-ES')}</td><td>${esc(p.match)}</td><td>${esc(p.label)}</td><td class="num">${p.odd.toFixed(2)}</td><td class="num">${esc(p.score || '')}</td><td class="res-${p.result}">${{ W: 'Ganado', L: 'Perdido', P: 'Nulo', V: 'Anulado' }[p.result]}</td><td class="num">${p.clv == null ? '' : (p.clv * 100).toFixed(1) + '%'}</td></tr>`).join('')}</table></div>`;
  if (B) {
    h += `<h2>Backtest del modelo</h2><p class="muted">${B.games} partidos de temporadas pasadas, prediciendo cada uno solo con información anterior.</p>
    <div class="stats"><div class="stat"><small>Acierto del ganador</small><b>${pct(B.winnerAccuracy, 1)}</b></div><div class="stat"><small>Error medio margen</small><b>${B.mae.margin} pts</b></div><div class="stat"><small>Error medio total</small><b>${B.mae.total} pts</b></div></div>
    <h3>Calibración: ¿cuando dice X %, gana X %?</h3><div class="card scroll"><table><tr><th>Confianza</th><th class="num">Partidos</th><th class="num">Esperado</th><th class="num">Real</th></tr>${B.calibration.filter(c => c.n).map(c => `<tr><td>${c.range}</td><td class="num">${c.n}</td><td class="num">${pct(c.expected, 1)}</td><td class="num">${pct(c.actual, 1)}</td></tr>`).join('')}</table></div>`;
    if (B.picks) h += `<h3>Picks contra cuotas de cierre guardadas</h3><div class="card scroll"><table><tr><th></th><th class="num">Picks</th><th class="num">Acierto</th><th class="num">ROI</th></tr>${Object.entries(B.picks.byTier).filter(([, v]) => v.n).map(([k, v]) => `<tr><td>${TIER[k]}</td><td class="num">${v.n}</td><td class="num">${pct(v.hit, 1)}</td><td class="num">${(v.roi * 100).toFixed(1)}%</td></tr>`).join('')}</table></div>`;
    else h += `<div class="note">El backtest de picks contra cuotas reales se activará solo cuando el robot haya guardado cuotas de cierre (no existen cuotas históricas gratis de la Euroliga).</div>`;
  }
  return h;
}

/* ---------- CÓMO FUNCIONA ---------- */
function viewHow() {
  return `<div class="how"><h2>Cómo elegimos el pick más seguro</h2>
  <p>No buscamos la cuota más alta, sino la apuesta con <b>más probabilidad real de acertar</b> que además no tenga valor esperado negativo.</p>
  <ol>
    <li><b>Probabilidad del mercado:</b> quitamos el margen de las casas tomamos el consenso de todas las casas y damos prioridad a Pinnacle, la más afinada, cuando coincide con él. Es la referencia más fiable que existe.</li>
    <li><b>Probabilidad del modelo:</b> ataque y defensa por 100 posesiones ajustados por rival, ritmo, factor cancha, descanso (semanas dobles) y bajas probables. Más peso a los partidos recientes.</li>
    <li><b>Mezcla prudente:</b> el modelo pesa un 12-20 % y el mercado el resto. Si el modelo discrepa mucho del mercado, el pick pierde seguridad (casi siempre el mercado sabe algo).</li>
    <li><b>Señales:</b> forma, momentum, descanso, casa/fuera, cara a cara, hándicap cubierto, ritmo… suman o restan un poco y se muestran con ✓ y ✗.</li>
    <li><b>Filtro:</b> probabilidad ≥ 55 %, cuota ≥ ${D.today ? D.today.meta.minOdd : 1.3} y valor esperado no peor que −3 %. Niveles: A ≥ 68 %, B ≥ 61 %, C el resto.</li>
  </ol>
  <h2>Historial honesto</h2>
  <ul><li>Cada pick se guarda con la cuota del momento y no se toca nunca.</li>
    <li>Se liquida con el resultado oficial de la Euroliga por <b>código de partido</b> (no por nombres), prórroga incluida.</li>
    <li>Nada se borra: aplazados o sin resultado en 7 días quedan como anulados.</li>
    <li>Medimos el <b>CLV</b>: si nuestras cuotas son mejores que las de cierre, el método funciona aunque haya rachas malas.</li></ul>
  <h2>Fuentes</h2>
  <ul><li>Resultados, boxscores y estadísticas: API oficial de la Euroliga.</li><li>Cuotas: The Odds API (casas europeas y británicas).</li></ul>
  <p class="muted">Ningún modelo garantiza resultados. Apuesta solo lo que puedas permitirte perder.</p></div>`;
}

load();
