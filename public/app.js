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

/* ---------- liga activa (Euroliga / NBA) ---------- */
let LG = (() => { try { return localStorage.getItem('lg') || 'euroleague'; } catch (e) { return 'euroleague'; } })();
const DATA = () => LG === 'nba' ? 'data/nba/' : 'data/';
const LEAGUE_NAME = () => LG === 'nba' ? 'NBA' : 'Euroliga';
function setLeague(l) {
  if (l === LG) return;
  LG = l; try { localStorage.setItem('lg', l); } catch (e) {}
  Object.keys(D).forEach(k => { D[k] = null; }); RS.page = 0;
  if (typeof PX !== 'undefined') { PX.index = null; PX.team = {}; PX.state = {}; PX.tried = false; }
  if (typeof CAR !== 'undefined') CAR.i = 0;
  $app.innerHTML = '<p class="muted pad">Cargando…</p>';
  if (/^#(game|player)\//.test(location.hash)) location.hash = 'picks';
  load();
}
function paintLeague() { document.querySelectorAll('.league button').forEach(b => b.classList.toggle('on', b.dataset.league === LG)); document.title = `EuroPicks · Picks de ${LEAGUE_NAME()}`; }

async function load() {
  paintLeague();
  const get = f => fetch(DATA() + f + '?v=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
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
  if (p.market === 'prop') return propPickCard(p, hero);
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
    h += `<h2>Picks del día <span class="muted small">· ${T.picks.length} · desliza para ver más</span></h2>` + carouselHTML(T.picks);
    const combos = T.combos || (T.combo ? [{ ...T.combo, type: 'segura' }] : []);
    if (combos.length) h += `<h2>Combinadas del día</h2>` + combosHTML(combos);
    setTimeout(() => { initCarousel(); hydratePropCards(); }, 0);
  }
  if (T.games.length) h += `<h2>Partidos</h2>${gamesGrid(T.games)}`;
  return h;
}

/* ---------- PARTIDOS ---------- */
function gamesGrid(games) {
  return `<div class="grid">${games.map(g => {
    const m = g.model, mk = g.market;
    return `<div class="card game" onclick="location.hash='game/${encodeURIComponent(g.id)}'">
      <div class="row muted"><span>${esc(g.day)} · ${esc(g.time)}</span><span class="sp"></span><span>${g.round ? 'Jornada ' + esc(g.round) : esc(LEAGUE_NAME())}</span></div>
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

/* cara a cara: una barra por apartado; cuanto más se llena hacia un lado, más ventaja de ese equipo */
function faceOff(H, A) {
  const th = H.trends, ta = A.trends, one = x => x == null ? '—' : x.toFixed(1);
  const wp = r => r && (r.w + r.l) ? r.w / (r.w + r.l) : null, frac = o => o && o.n ? o.y / o.n : null;
  const rows = [
    ['Nivel general', H.rating.net, A.rating.net, true, sgn],
    ['Ataque (puntos por 100 posesiones)', H.rating.off, A.rating.off, true, sgn],
    ['Defensa (menos es mejor)', H.rating.def, A.rating.def, false, sgn],
    ['Puntos anotados · últimos 5', th.pfL5, ta.pfL5, true, one],
    ['Puntos recibidos · últimos 5', th.paL5, ta.paL5, false, one],
    ['Victorias esta temporada', wp(th.season), wp(ta.season), true, null, rec(th.season), rec(ta.season)],
    [`En casa (${esc(H.name)}) / fuera (${esc(A.name)})`, wp(th.home), wp(ta.away), true, null, rec(th.home), rec(ta.away)],
    ['Cubre el hándicap · últimos 10', frac(th.atsL10), frac(ta.atsL10), true, null, th.atsL10.n ? th.atsL10.y + '/' + th.atsL10.n : '—', ta.atsL10.n ? ta.atsL10.y + '/' + ta.atsL10.n : '—'],
    ['Días de descanso', th.restDays, ta.restDays, true, x => x == null ? '—' : x],
  ];
  let wH = 0, wA = 0;
  const bars = rows.map(([lbl, a, b, hi, fmt, ta_, tb_]) => {
    let share = 50;
    if (a != null && b != null && a !== b) {
      const d = hi ? a - b : b - a, scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
      share = Math.max(15, Math.min(85, 50 + 50 * d / (scale * (fmt === sgn ? 1 : 0.5))));
      share > 50 ? wH++ : wA++;
    }
    const va = ta_ != null ? ta_ : fmt(a), vb = tb_ != null ? tb_ : fmt(b);
    return `<div class="fo-row"><div class="fo-top"><b class="${share > 50 ? 'win' : ''}">${va}</b><span>${lbl}</span><b class="${share < 50 ? 'win' : ''}">${vb}</b></div>
      <div class="fo-bar"><i style="width:${share}%"></i></div></div>`;
  }).join('');
  const lead = wH === wA ? 'Muy igualados' : `Ventaja ${esc(wH > wA ? H.name : A.name)} en ${Math.max(wH, wA)} de ${wH + wA} apartados`;
  return `<h2>Cara a cara</h2><div class="card fo">
    <div class="fo-head"><div class="teams">${logo(H)}<b>${esc(H.name)}</b></div><span class="fo-lead">${lead}</span><div class="teams r"><b>${esc(A.name)}</b>${logo(A)}</div></div>
    <div class="fo-form"><span>${form(th.form)}</span><small>Últimos 5</small><span>${form(ta.form)}</span></div>
    ${bars}</div>`;
}
function viewGame(id) {
  const g = D.today && D.today.games.find(x => x.id === decodeURIComponent(id || ''));
  if (!g) return `<button class="back" onclick="history.back()">← Volver</button><p class="muted">Partido no encontrado (puede que ya haya empezado).</p>`;
  const H = g.home, A = g.away, th = H.trends, ta = A.trends, m = g.model, mk = g.market;
  const one = x => x == null ? '—' : x.toFixed(1);
  let h = `<button class="back" onclick="history.back()">← Volver</button>
  <div class="card"><div class="row muted"><span>${esc(g.day)} · ${esc(g.time)}${g.round ? ' · Jornada ' + esc(g.round) : ''}</span></div>
    <div class="row" style="margin-top:10px"><div class="teams">${logo(H)}${esc(H.full || H.name)}</div><span class="sp"></span><span class="score">${one(m.ptsH)}</span></div>
    <div class="row"><div class="teams">${logo(A)}${esc(A.full || A.name)}</div><span class="sp"></span><span class="score">${one(m.ptsA)}</span></div>
    <div class="kv"><div><small>Prob. local (modelo)</small><b>${pct(m.pHome)}</b></div><div><small>Margen esperado</small><b>${sgn(m.margin)}</b></div><div><small>Total esperado</small><b>${m.total}</b></div>
      <div><small>Mercado ganador</small><b>${mk && mk.ml ? pct(mk.ml.pA) + ' local' : '—'}</b></div><div><small>Hándicap mercado</small><b>${mk && mk.spread ? sgn(mk.spread.line) : '—'}</b></div><div><small>Total mercado</small><b>${mk && mk.total ? mk.total.line : '—'}</b></div></div>
    ${m.adj.length ? `<div class="muted" style="margin-top:8px">Ajustes: ${m.adj.map(esc).join(' · ')}</div>` : ''}
    ${mk && mk.opening ? `<div class="muted" style="margin-top:4px">Apertura vista: ${mk.opening.spread ? 'hándicap ' + sgn(mk.opening.spread.line) : ''} ${mk.opening.total ? '· total ' + mk.opening.total.line : ''} · ${mk.books} casas</div>` : ''}
  </div>`;
  if (g.candidates.length) h += `<h2>Mercados analizados</h2><div class="card scroll"><table><tr><th>Apuesta</th><th class="num">Cuota</th><th class="num">Prob.</th><th class="num">Mercado</th><th class="num">Modelo</th><th class="num">VE</th><th>Nivel</th><th></th></tr>
    ${g.candidates.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${c.odd.toFixed(2)}</td><td class="num">${pct(c.pFinal)}</td><td class="num">${pct(c.pMarket)}</td><td class="num">${pct(c.pModel)}</td><td class="num ${c.ev >= 0 ? 'good' : 'bad'}">${sgn((c.ev * 100).toFixed(1))}%</td><td>${tierBadge(c.tier)}</td><td>${c.qualifies ? '✓' : ''}</td></tr>`).join('')}</table></div>`;
  h += faceOff(H, A);
  const abs = (t) => t.absences.length ? t.absences.map(a => `<li class="no">${esc(a.name)} — ${a.status ? `<b>${esc(a.status)}</b>${a.detail ? ` <span class="muted">${esc(a.detail)}</span>` : ''}` : `no jugó ${a.missed > 1 ? `los últimos ${a.missed}` : 'el último'} partido${a.missed > 1 ? 's' : ''}`}${a.impact ? ` (−${a.impact} pts)` : ''}</li>`).join('') : '<li>Sin bajas</li>';
  h += `<h2>${LG === 'nba' ? 'Bajas (parte oficial)' : 'Bajas probables'}</h2><div class="grid"><div class="card"><b>${esc(H.name)}</b><ul class="sig">${abs(H)}</ul></div><div class="card"><b>${esc(A.name)}</b><ul class="sig">${abs(A)}</ul></div></div>
    <p class="muted">${LG === 'nba' ? 'Parte de lesiones oficial (ESPN). El impacto en puntos es una estimación.' : 'La Euroliga no publica parte médico gratis: se avisa de habituales que no jugaron el último partido. Confírmalo antes de apostar.'}</p>`;
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
const RS = { tab: 'picks', page: 0 };                                        // pestaña y página del historial
function recGo(tab, page = 0) { RS.tab = tab; RS.page = page; $app.innerHTML = viewRecord(); document.querySelector('.rec-tabs').scrollIntoView({ block: 'start' }); }
const PER = 25;
function pager(n) {
  const pages = Math.ceil(n / PER); if (pages < 2) return '';
  return `<div class="pager">${Array.from({ length: pages }, (_, k) => `<button class="${k === RS.page ? 'on' : ''}" onclick="recGo('${RS.tab}', ${k})">${k * PER + 1}–${Math.min(n, (k + 1) * PER)}</button>`).join('')}</div>`;
}
const RES = { W: ['Ganado', 'W'], L: ['Perdido', 'L'], P: ['Nulo', 'P'], V: ['Anulado', 'V'] };
const chip = r => `<span class="chip res-${r}">${(RES[r] || ['—'])[0]}</span>`;
const dday = t => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
function statTiles(s) {
  return `<div class="stats">
    <div class="stat"><small>Picks resueltos</small><b>${s.n}</b></div>
    <div class="stat"><small>Acierto</small><b>${pct(s.hit, 1)}</b></div>
    <div class="stat"><small>Beneficio (1 u por pick)</small><b class="${s.profit >= 0 ? 'good' : 'bad'}">${sgn(s.profit)} u</b></div>
    <div class="stat"><small>Rentabilidad</small><b class="${(s.roi || 0) >= 0 ? 'good' : 'bad'}">${s.roi == null ? '—' : sgn((s.roi * 100).toFixed(1)) + '%'}</b></div>
  </div>`;
}
function viewRecord() {
  const R = D.record, B = D.backtest, C = R && R.combos, P = R && R.predictions;
  let h = `<h2>Historial · ${LEAGUE_NAME()}</h2>
  <div class="rec-tabs">${[['picks', 'Picks'], ['combos', 'Combinadas'], ['preds', 'Predicciones']].map(([k, l]) => `<button class="${RS.tab === k ? 'on' : ''}" onclick="recGo('${k}')">${l}</button>`).join('')}</div>`;

  if (RS.tab === 'picks') {
    if (!R || !R.record.length) return h + `<p class="muted">Todavía no hay picks resueltos. Cada pick se guarda con su cuota y se resuelve solo con el resultado oficial.</p>`;
    h += statTiles(R.stats.all);
    if (R.pending.length) h += `<h3>Pendientes (${R.pending.length})</h3><div class="rlist">${R.pending.map(p => `<div class="ritem"><span class="rdate">${dday(p.start)}</span><div class="rmain"><b>${esc(p.label)}</b><small>${esc(p.match)}</small></div><span class="rodd">@${p.odd.toFixed(2)}</span><span class="chip">Pendiente</span></div>`).join('')}</div>`;
    const list = R.record, page = list.slice(RS.page * PER, (RS.page + 1) * PER);
    h += `<h3>Resueltos (${list.length})</h3><div class="rlist">${page.map(p => `<div class="ritem r-${p.result}"><span class="rdate">${dday(p.start)}</span><div class="rmain"><b>${esc(p.label)}</b><small>${esc(p.match)}${p.score ? ' · ' + esc(p.score) : ''}</small></div><span class="rodd">@${p.odd.toFixed(2)}</span>${chip(p.result)}</div>`).join('')}</div>${pager(list.length)}`;
    h += `<details class="more"><summary>Más detalle (por nivel y mercado${B ? ', backtest' : ''})</summary>
      <div class="card scroll"><table><tr><th></th><th class="num">Picks</th><th class="num">Acierto</th><th class="num">Rentabilidad</th></tr>
      ${[...Object.entries(R.stats.tier).map(([k, v]) => [TIER[k], v]), ...Object.entries(R.stats.market).map(([k, v]) => [MK[k] || 'Jugadores', v])].filter(([, v]) => v.n)
        .map(([k, v]) => `<tr><td>${k}</td><td class="num">${v.n}</td><td class="num">${pct(v.hit, 1)}</td><td class="num">${v.roi == null ? '—' : (v.roi * 100).toFixed(1) + '%'}</td></tr>`).join('')}</table></div>
      ${B ? `<p class="muted">Backtest: ${B.games} partidos de temporadas pasadas, prediciendo cada uno solo con información anterior. Acierta el ganador el ${pct(B.winnerAccuracy, 1)}; error medio del margen ${B.mae.margin} pts y del total ${B.mae.total} pts.</p>` : ''}</details>`;
  }

  if (RS.tab === 'combos') {
    const list = (C && C.record) || [], pend = (C && C.pending) || [];
    if (!list.length && !pend.length) return h + '<p class="muted">Todavía no hay combinadas resueltas.</p>';
    const cs = C.stats.all;
    if (cs && cs.n) h += `<div class="stats"><div class="stat"><small>Combinadas resueltas</small><b>${cs.n}</b></div><div class="stat"><small>Acierto</small><b>${pct(cs.hit, 1)}</b></div><div class="stat"><small>Beneficio (1 u)</small><b class="${cs.profit >= 0 ? 'good' : 'bad'}">${sgn(cs.profit)} u</b></div></div>`;
    const card = (c, st) => `<div class="ritem combo-r r-${c.result || ''}"><span class="rdate">${dday(c.legs.map(l => l.start).sort().pop())}</span>
      <div class="rmain">${c.legs.map((l, k) => { const r = (c.legStates || [])[k]; return `<div class="leg-r"><span class="mk res-${r || ''}">${r === 'W' ? '✓' : r === 'L' ? '✗' : r ? '=' : '·'}</span><b>${esc(l.label)}</b> <small>@${Number(l.odd).toFixed(2)}</small></div>`; }).join('')}<small>${esc(COMBO_META[c.type] ? COMBO_META[c.type].title : 'Combinada')}</small></div>
      <span class="rodd">@${Number(c.odd).toFixed(2)}</span>${st ? chip(c.result) : '<span class="chip">Pendiente</span>'}</div>`;
    if (pend.length) h += `<h3>Pendientes (${pend.length})</h3><div class="rlist">${pend.map(c => card(c, false)).join('')}</div>`;
    const page = list.slice(RS.page * PER, (RS.page + 1) * PER);
    h += `<h3>Resueltas (${list.length})</h3><div class="rlist">${page.map(c => card(c, true)).join('')}</div>${pager(list.length)}`;
  }

  if (RS.tab === 'preds') {
    const list = (P && P.list) || [];
    if (!list.length) return h + '<p class="muted">Aún no hay partidos terminados con predicción guardada.</p>';
    const st = P.stats;
    h += `<p class="muted">Antes de cada partido el modelo predice el marcador, haya pick o no. Aquí se compara con el resultado real.</p>
    <div class="stats"><div class="stat"><small>Partidos</small><b>${st.n}</b></div><div class="stat"><small>Ganador acertado</small><b>${st.winner}/${st.n} <span class="muted small">${pct(st.winner / st.n)}</span></b></div>
      <div class="stat"><small>Cerca (±5 pts cada equipo)</small><b>${st.close}</b></div><div class="stat"><small>Exactos 🎯</small><b>${st.exact}</b></div>
      <div class="stat"><small>Error medio en el total</small><b>${st.diff} pts</b></div></div>`;
    const page = list.slice(RS.page * PER, (RS.page + 1) * PER);
    h += `<div class="rlist">${page.map(p => `<div class="ritem ${p.winner ? 'r-W' : 'r-L'}"><span class="rdate">${dday(p.start)}</span><div class="rmain"><b>${esc(p.match)}</b><small>Predicción ${p.pred} · Real <b>${p.real}</b></small></div>
      ${p.exact ? '<span class="chip res-W">🎯 Exacto</span>' : p.close ? '<span class="chip res-W">Muy cerca</span>' : ''}<span class="chip res-${p.winner ? 'W' : 'L'}">${p.winner ? 'Ganador ✓' : 'Ganador ✗'}</span></div>`).join('')}</div>${pager(list.length)}`;
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
    <li>Nada se borra: aplazados o sin resultado en 7 días quedan como anulados.</li></ul>
  <h2>Fuentes</h2>
  <ul><li>Resultados, boxscores y estadísticas: API oficial de la Euroliga.</li><li>Cuotas de partido: The Odds API (casas europeas y británicas).</li><li>Cuotas de jugadores: oferta pública de Kambi (Unibet), el día del partido. Solo publica el lado «más de», así que su probabilidad se estima quitando un margen típico del 8 %.</li></ul>
  <p class="muted">Ningún modelo garantiza resultados. Apuesta solo lo que puedas permitirte perder.</p></div>`;
}

/* ---------- COMBINADAS ---------- */
const COMBO_META = {
  segura: { icon: '🛡️', title: 'Combinada segura', sub: 'La mayor probabilidad de acertar' },
  valor: { icon: '💎', title: 'Combinada de valor', sub: 'La que mejor paga a largo plazo' },
  jugadores: { icon: '🏀', title: 'Combinada de jugadores', sub: 'Solo props de jugador' },
};
/* anillo de probabilidad conjunta */
function ring(p) {
  const r = 26, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p));
  return `<svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Probabilidad ${Math.round(v * 100)}%">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="7"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--good)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>
    <text x="32" y="37" text-anchor="middle" class="ring-t">${Math.round(v * 100)}%</text></svg>`;
}
function combosHTML(list) {
  return `<div class="combos">${list.map(c => {
    const m = COMBO_META[c.type] || COMBO_META.segura;
    return `<div class="card combo combo-${c.type}">
      <div class="row"><span class="combo-ic" aria-hidden="true">${m.icon}</span><div><b>${m.title}</b><div class="muted small">${m.sub}</div></div><span class="sp"></span>${ring(c.prob)}</div>
      <div class="combo-legs">${c.legs.map(l => `<div class="leg">
        <span class="leg-tag ${l.market === 'prop' ? 'tp' : 'tm'}">${l.market === 'prop' ? 'Jugador' : 'Partido'}</span>
        <div class="leg-main"><div class="leg-lbl">${esc(l.label)}</div><div class="muted small">${esc(l.match || '')}</div>
          <div class="leg-bar" title="Probabilidad ${pct(l.pFinal)}"><i style="width:${Math.round(l.pFinal * 100)}%"></i></div></div>
        <div class="leg-odd">${l.odd.toFixed(2)}<small>${pct(l.pFinal)}</small></div></div>`).join('')}</div>
      <div class="combo-foot">
        <div><small>Cuota total</small><b class="odd">${c.odd.toFixed(2)}</b></div>
        <div><small>Con 10 € cobras</small><b>${(c.odd * 10).toFixed(2)} €</b></div>
        <div><small>Valor esperado</small><b class="${c.ev >= 0 ? 'good' : 'bad'}">${sgn((c.ev * 100).toFixed(1))}%</b></div>
      </div></div>`;
  }).join('')}</div>
  <p class="muted small">Nunca se combinan dos selecciones del mismo partido. Las combinadas se registran y se liquidan solas: mira su acierto en Historial.</p>`;
}

load();
