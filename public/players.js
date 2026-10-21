/* ============================================================
   HOOPVALUE — pestaña Jugadores: lista, ficha y gráfico de barras
   Cada barra = un partido. Verde (✓) si supera la línea, rojo
   rayado (✗) si se queda por debajo. La línea es la de la casa de
   apuestas si existe; si no, nuestra proyección; o la que escribas.
   ============================================================ */
const PX = { index: null, team: {}, state: {} };
const STATS = [
  ['pts', 'Puntos'], ['reb', 'Rebotes'], ['ast', 'Asistencias'], ['tpm', 'Triples'], ['pra', 'P+R+A'],
  ['pr', 'P+R'], ['pa', 'P+A'], ['ra', 'R+A'], ['min', 'Minutos'], ['stl', 'Robos'], ['blk', 'Tapones'],
];
const statVal = (r, k) => k === 'pra' ? r.pts + r.reb + r.ast : k === 'pr' ? r.pts + r.reb : k === 'pa' ? r.pts + r.ast : k === 'ra' ? r.reb + r.ast : r[k];
const STAT_LABEL = Object.fromEntries(STATS);

async function loadPlayersIndex() {
  if (!PX.index) PX.index = await fetch('data/players/index.json?v=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
  return PX.index;
}
async function loadTeam(code) {
  if (!PX.team[code]) PX.team[code] = await fetch(`data/players/${code}.json?v=` + Date.now()).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return PX.team[code];
}
const teamName = c => (PX.index && PX.index.teams[c] && PX.index.teams[c].name) || c;
const teamLogo = c => (PX.index && PX.index.teams[c] && PX.index.teams[c].logo) || '';

/* ---------- LISTA ---------- */
function viewPlayers() {
  if (!PX.index) { loadPlayersIndex().then(() => { if (location.hash.startsWith('#players')) route(); }); return '<p class="muted pad">Cargando jugadores…</p>'; }
  const st = PX.state.list || (PX.state.list = { q: '', team: '', sort: 'pra' });
  const teams = Object.keys(PX.index.teams).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  return `<h2>Jugadores</h2>
  <div class="filters">
    <input id="pq" class="inp" type="search" placeholder="Buscar jugador…" value="${esc(st.q)}" oninput="PX.state.list.q=this.value;renderPlayerRows()">
    <select class="inp" onchange="PX.state.list.team=this.value;renderPlayerRows()"><option value="">Todos los equipos</option>${teams.map(t => `<option value="${t}" ${st.team === t ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}</select>
    <select class="inp" onchange="PX.state.list.sort=this.value;renderPlayerRows()">${['pra', 'pts', 'reb', 'ast', 'tpm', 'min'].map(k => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>Ordenar por ${STAT_LABEL[k]}</option>`).join('')}</select>
  </div>
  <div class="card scroll"><table id="ptable"></table></div>
  ${(setTimeout(renderPlayerRows, 0), '')}<p class="muted">Proyección para su próximo partido. «Línea» = cuota de la casa (si la hay). Pulsa un jugador para ver su ficha con gráficos.</p>`;
}
function renderPlayerRows() {
  const el = document.getElementById('ptable'); if (!el) return;
  const st = PX.state.list, q = st.q.trim().toLowerCase();
  const val = p => (p.proj && p.proj[st.sort] != null ? p.proj[st.sort] : (p.avg && p.avg[st.sort]) || 0);
  const list = PX.index.players.filter(p => (!st.team || p.team === st.team) && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => val(b) - val(a)).slice(0, 150);
  const n = x => x == null ? '—' : x;
  el.innerHTML = `<tr><th>Jugador</th><th>Equipo</th><th>Próximo</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">Triples</th><th class="num">P+R+A</th><th>Línea casa</th></tr>` +
    list.map(p => {
      const pr = p.proj || {}, ln = p.lines && (p.lines.pts || p.lines.pra);
      return `<tr class="click" onclick="location.hash='player/${encodeURIComponent(p.id)}'"><td><b>${esc(p.name)}</b> <span class="muted">${esc(p.pos)}</span></td>
      <td><div class="teams">${teamLogo(p.team) ? `<img src="${esc(teamLogo(p.team))}" alt="" loading="lazy">` : ''}${esc(teamName(p.team))}</div></td>
      <td>${p.next ? `${p.next.home ? 'vs' : '@'} ${esc(teamName(p.next.opp))}` : '—'}</td>
      <td class="num">${n(pr.min)}</td><td class="num">${n(pr.pts)}</td><td class="num">${n(pr.reb)}</td><td class="num">${n(pr.ast)}</td><td class="num">${n(pr.tpm)}</td><td class="num"><b>${n(pr.pra)}</b></td>
      <td>${ln ? `${p.lines.pts ? 'Pts ' + p.lines.pts.line : ''}${p.lines.pra ? ' · PRA ' + p.lines.pra.line : ''}` : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
}

/* ---------- FICHA ---------- */
function viewPlayer(id) {
  id = decodeURIComponent(id || '');
  if (!PX.index) { loadPlayersIndex().then(route); return '<p class="muted pad">Cargando…</p>'; }
  const p = PX.index.players.find(x => x.id === id);
  if (!p) return `<button class="back" onclick="history.back()">← Volver</button><p class="muted">Jugador no encontrado.</p>`;
  if (!PX.team[p.team]) { loadTeam(p.team).then(route); return '<p class="muted pad">Cargando partidos…</p>'; }
  const rows = (PX.team[p.team] || {})[p.id] || [];
  const st = PX.state[p.id] || (PX.state[p.id] = { stat: 'pts', range: '10', venue: 'all', vs: false, line: null });
  setTimeout(() => renderPlayerChart(p, rows), 0);
  const nx = p.next;
  return `<button class="back" onclick="history.back()">← Volver</button>
  <div class="card"><div class="row">
    <div class="teams" style="font-size:18px">${teamLogo(p.team) ? `<img src="${esc(teamLogo(p.team))}" alt="">` : ''}${esc(p.name)}</div>
    <span class="badge">${esc(p.pos || '—')}</span><span class="sp"></span>
    ${nx ? `<span class="muted">Próximo: ${nx.home ? 'vs' : '@'} <b>${esc(teamName(nx.opp))}</b> · ${new Date(nx.start).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}
  </div>
  ${p.proj ? `<div class="kv kv6">${['min', 'pts', 'reb', 'ast', 'tpm', 'pra'].map(k => `<div><small>Proyección ${STAT_LABEL[k]}</small><b>${p.proj[k]}</b>${p.lines && p.lines[k] ? `<small>Casa: ${p.lines[k].line} (${p.lines[k].over || '—'} / ${p.lines[k].under || '—'})</small>` : ''}</div>`).join('')}</div>` : '<p class="muted">Sin proyección (pocos partidos o sin próximo partido).</p>'}
  </div>
  <div class="card" style="margin-top:12px">
    <div class="filters">
      <div class="chips" role="group" aria-label="Estadística">${STATS.map(([k, l]) => `<button class="chip ${st.stat === k ? 'on' : ''}" onclick="setPS('${esc(p.id)}','stat','${k}')">${l}</button>`).join('')}</div>
    </div>
    <div class="filters">
      <div class="chips" role="group" aria-label="Partidos">${[['5', 'Últ. 5'], ['10', 'Últ. 10'], ['20', 'Últ. 20'], ['season', 'Temporada'], ['all', 'Todos']].map(([k, l]) => `<button class="chip ${st.range === k ? 'on' : ''}" onclick="setPS('${esc(p.id)}','range','${k}')">${l}</button>`).join('')}</div>
      <div class="chips" role="group" aria-label="Lugar">${[['all', 'Casa y fuera'], ['home', 'Casa'], ['away', 'Fuera']].map(([k, l]) => `<button class="chip ${st.venue === k ? 'on' : ''}" onclick="setPS('${esc(p.id)}','venue','${k}')">${l}</button>`).join('')}</div>
      ${nx ? `<div class="chips"><button class="chip ${st.vs ? 'on' : ''}" onclick="setPS('${esc(p.id)}','vs',${!st.vs})">Solo vs ${esc(teamName(nx.opp))}</button></div>` : ''}
    </div>
    <div class="filters">
      <label class="muted" for="pline">Línea</label>
      <input id="pline" class="inp num-inp" type="number" step="0.5" onchange="setPS('${esc(p.id)}','line',this.value===''?null:+this.value)">
      <span id="plinesrc" class="muted"></span>
      <button class="chip" onclick="setPS('${esc(p.id)}','line',null)">Restablecer</button>
    </div>
    <div id="psummary" class="row" style="margin:6px 0 2px"></div>
    <div id="pchart" class="scroll chart-wrap"></div>
    <div id="ptip" class="tip" role="status" hidden></div>
    <div class="legend muted"><span><i class="sw sw-ok"></i>✓ Supera la línea</span><span><i class="sw sw-ko"></i>✗ Por debajo</span><span><i class="sw sw-line"></i>Línea</span></div>
  </div>
  <h2>Medias</h2><div id="psplits" class="stats"></div>
  <h2>Partidos</h2><div id="plog" class="card scroll"></div>`;
}
/* cambia un filtro y repinta la ficha sin mover la página */
function setPS(id, k, v) { PX.state[id][k] = v; $app.innerHTML = viewPlayer(id); }

/* línea por defecto: la de la casa; si no hay, la proyección */
function defaultLine(p, stat) {
  if (p.lines && p.lines[stat]) return { v: p.lines[stat].line, src: `Casa de apuestas (${p.lines[stat].books} casas · más ${p.lines[stat].over || '—'} / menos ${p.lines[stat].under || '—'})` };
  if (p.proj && p.proj[stat] != null) return { v: p.proj[stat], src: 'Proyección HoopValue (sin cuota de la casa)' };
  return { v: null, src: 'Sin línea' };
}

function filtered(p, rows, st) {
  let r = rows.slice();
  if (st.venue === 'home') r = r.filter(x => x.h); else if (st.venue === 'away') r = r.filter(x => !x.h);
  if (st.vs && p.next) r = r.filter(x => x.o === p.next.opp);
  if (st.range === 'season') r = r.filter(x => x.s === PX.index.season);
  else if (st.range !== 'all') r = r.slice(-(+st.range));
  return r;
}

function renderPlayerChart(p, rows) {
  const st = PX.state[p.id], box = document.getElementById('pchart'); if (!box) return;
  const dl = defaultLine(p, st.stat);
  const line = st.line != null ? st.line : dl.v;
  const inp = document.getElementById('pline'); if (inp && document.activeElement !== inp) inp.value = line == null ? '' : line;
  document.getElementById('plinesrc').textContent = st.line != null ? 'Línea personalizada' : dl.src;
  const data = filtered(p, rows, st).map(r => ({ r, v: statVal(r, st.stat) }));
  if (!data.length) { box.innerHTML = '<p class="muted pad">No hay partidos con estos filtros.</p>'; document.getElementById('psummary').innerHTML = ''; renderSplits(p, rows, st); renderLog([], st, line); return; }
  /* resumen */
  const vals = data.map(d => d.v), over = line == null ? 0 : vals.filter(v => v > line).length, under = line == null ? 0 : vals.filter(v => v < line).length;
  const avg = vals.reduce((s, x) => s + x, 0) / vals.length, sorted = [...vals].sort((a, b) => a - b), med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  document.getElementById('psummary').innerHTML = line == null ? `<span class="muted">Media ${avg.toFixed(1)} · Mediana ${med}</span>` :
    `<span class="hit ${over / vals.length >= 0.5 ? 'good' : 'bad'}">${over}/${vals.length} superan ${line} (${Math.round(over / vals.length * 100)}%)</span><span class="muted">· ${under} por debajo · Media ${avg.toFixed(1)} · Mediana ${med} · Máx ${sorted[sorted.length - 1]} · Mín ${sorted[0]}</span>`;
  /* geometría */
  const W = Math.max(box.clientWidth || 600, 280), H = 240, padL = 34, padR = 8, padT = 22, padB = 46;
  const n = data.length, gap = 2;
  const bw = Math.max(12, Math.min(40, (W - padL - padR) / n - gap));
  const plotW = Math.max(W - padL - padR, n * (bw + gap));
  const maxV = Math.max(1, ...vals, line || 0) * 1.12;
  const y = v => padT + (H - padT - padB) * (1 - v / maxV);
  const ticks = niceTicks(maxV);
  let svg = `<svg width="${plotW + padL + padR}" height="${H}" role="img" aria-label="${esc(STAT_LABEL[st.stat])} por partido">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--bad)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--panel)" stroke-width="2" opacity=".45"/></pattern></defs>`;
  ticks.forEach(t => { svg += `<line x1="${padL}" x2="${padL + plotW}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${t}</text>`; });
  data.forEach((d, i) => {
    const x = padL + i * (bw + gap) + gap / 2, top = y(d.v), h = Math.max(0, y(0) - top);
    const cls = line == null ? 'b-n' : d.v > line ? 'b-ok' : d.v < line ? 'b-ko' : 'b-eq';
    const mark = line == null ? '' : d.v > line ? '✓' : d.v < line ? '✗' : '=';
    const r4 = Math.min(4, bw / 2, h);
    svg += `<g class="bar" data-i="${i}">
      <rect x="${x - 1}" y="${padT}" width="${bw + 2}" height="${H - padT - padB + 30}" fill="transparent"/>
      <path d="${roundTop(x, top, bw, h, r4)}" class="${cls}"/>
      ${n <= 25 ? `<text x="${x + bw / 2}" y="${top - 5}" class="val" text-anchor="middle">${d.v}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - padB + 14}" class="xl ${cls}-t" text-anchor="middle">${mark}</text>
      ${n <= 25 ? `<text x="${x + bw / 2}" y="${H - padB + 28}" class="xl" text-anchor="middle">${esc(d.r.o)}</text><text x="${x + bw / 2}" y="${H - padB + 40}" class="xl muted-t" text-anchor="middle">${d.r.h ? 'C' : 'F'}</text>` : ''}
    </g>`;
  });
  if (line != null) svg += `<line x1="${padL}" x2="${padL + plotW}" y1="${y(line)}" y2="${y(line)}" class="pline"/><text x="${padL + plotW - 4}" y="${y(line) - 5}" class="plabel" text-anchor="end">${line}</text>`;
  svg += `<line x1="${padL}" x2="${padL + plotW}" y1="${y(0)}" y2="${y(0)}" class="base"/></svg>`;
  box.innerHTML = svg;
  /* tooltip */
  const tip = document.getElementById('ptip');
  box.querySelectorAll('.bar').forEach(g => {
    const d = data[+g.dataset.i];
    const show = e => {
      tip.hidden = false;
      tip.innerHTML = `<b>${d.r.d}</b> · ${d.r.h ? 'vs' : '@'} ${esc(teamName(d.r.o))}<br>${STAT_LABEL[st.stat]}: <b>${d.v}</b>${line != null ? ` (${d.v > line ? 'supera' : d.v < line ? 'por debajo de' : 'igual a'} ${line})` : ''}<br>${d.r.min} min · ${d.r.pts} pts · ${d.r.reb} reb · ${d.r.ast} ast<br><span class="muted">${d.r.w ? 'Victoria' : 'Derrota'} ${d.r.sc}${d.r.st ? ' · titular' : ''}</span>`;
      const b = box.getBoundingClientRect(), gx = (e.clientX || b.left) - b.left + box.scrollLeft;
      tip.style.left = Math.min(Math.max(gx - 90, 0), b.width - 190) + 'px'; tip.style.top = '40px';
    };
    g.addEventListener('mousemove', show); g.addEventListener('click', show); g.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
  renderSplits(p, rows, st);
  renderLog(data, st, line);
}
function roundTop(x, y, w, h, r) {
  if (h <= 0) return `M${x},${y}h${w}`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function niceTicks(max) { const step = max > 40 ? 10 : max > 20 ? 5 : max > 8 ? 2 : 1; const t = []; for (let v = 0; v <= max; v += step) t.push(v); return t; }

function renderSplits(p, rows, st) {
  const el = document.getElementById('psplits'); if (!el) return;
  const k = st.stat, cur = rows.filter(r => r.s === PX.index.season);
  const a = list => list.length ? (list.reduce((s, r) => s + statVal(r, k), 0) / list.length).toFixed(1) : '—';
  const cards = [['Temporada', cur], ['En casa', cur.filter(r => r.h)], ['Fuera', cur.filter(r => !r.h)], ['Últimos 5', rows.slice(-5)], ['Últimos 10', rows.slice(-10)]];
  if (p.next) cards.push([`vs ${teamName(p.next.opp)}`, rows.filter(r => r.o === p.next.opp)]);
  el.innerHTML = cards.map(([l, list]) => `<div class="stat"><small>${esc(l)} · ${list.length} PJ</small><b>${a(list)}</b><small>${STAT_LABEL[k]}</small></div>`).join('');
}
function renderLog(data, st, line) {
  const el = document.getElementById('plog'); if (!el) return;
  el.innerHTML = `<table><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">Triples</th><th class="num">Rob</th><th class="num">Tap</th><th class="num">${esc(STAT_LABEL[st.stat])}</th></tr>` +
    [...data].reverse().map(({ r, v }) => `<tr><td>${r.d}</td><td>${r.h ? 'vs' : '@'} ${esc(teamName(r.o))}</td><td class="${r.w ? 'good' : 'bad'}">${r.w ? 'V' : 'D'} ${r.sc}</td><td class="num">${r.min}</td><td class="num">${r.pts}</td><td class="num">${r.reb}</td><td class="num">${r.ast}</td><td class="num">${r.tpm}</td><td class="num">${r.stl}</td><td class="num">${r.blk}</td>
      <td class="num"><b>${v}</b> ${line == null ? '' : v > line ? '<span class="good">✓</span>' : v < line ? '<span class="bad">✗</span>' : '='}</td></tr>`).join('') + '</table>';
}
