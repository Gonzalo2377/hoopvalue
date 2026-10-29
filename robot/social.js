/* ============================================================
   EUROPICKS — publicaciones del día para X (modo semiautomático, gratis)
   ------------------------------------------------------------
   Prepara cada publicación con su texto y su hora; la página /x las
   muestra con un botón «Compartir en X» (texto + imagen ya puestos).
     · Euroliga: una por partido, para 1 hora antes del salto inicial
       (su mejor pick, o la previa si no hay pick seguro)
     · NBA: una al día (18:45 hora de Madrid) con todos los picks de la noche (hasta 10)
     · Combinada segura: NBA 19:00 · Euroliga 1 h 30 min antes del primer partido
     · Resumen: a la mañana siguiente (09:30) con ✅/❌ y el balance
   Una publicación se «congela» al llegar su hora: lo que se publicó
   es lo que cuenta para el resumen y el balance.
   Salida: public/data/social.json · memoria: data/social-history.json
   ============================================================ */
const path = require('path');
const { ROOT, readJSON, writeJSON } = require('./lib/util');

const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const OUT = path.join(ROOT, 'public', 'data', 'social.json');
const HIST = path.join(ROOT, 'data', 'social-history.json');
const LG = { euroleague: { name: 'Euroliga', dir: 'public/data', tag: '#Euroliga' }, nba: { name: 'NBA', dir: 'public/data/nba', tag: '#NBA' } };
const RES = { W: '✅', L: '❌', P: '↔️', V: '⚪' };
const BIO = '🔗 Análisis completo: link en la bio';

const madridDate = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const hhmm = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const pct = p => Math.round(p * 100) + '%';
const pickId = p => [p.gameId, p.market, p.side, p.line, p.playerId || '', p.stat || ''].join('|');
const short = p => p.market === 'prop' ? p.label.replace(/^(\S)\S*\s/, '$1. ').replace(' más de ', ' +').replace(' menos de ', ' −') : p.label;
/* hora de Madrid "HH:MM" de un día → instante UTC */
function madridAt(day, hm) {
  const guess = Date.parse(`${day}T${hm}:00Z`);
  const off = Date.parse(new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T') + 'Z') - guess;
  return new Date(guess - off).toISOString();
}
/* longitud según X: enlaces 23 y emojis/caracteres fuera del latín básico 2 */
function xLen(s) {
  s = s.replace(/\b[a-z0-9.-]+\.(dev|com|es|net|org)(\/\S*)?/gi, 'x'.repeat(23));
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
  return n;
}
function fit(lines) { let t = lines.join('\n'); if (xLen(t) <= 280) return t; t = lines.filter(l => !/^📊/.test(l)).join('\n'); while (xLen(t) > 280) t = t.slice(0, -2); return t; }
const mini = p => ({ id: p.id || pickId(p), league: p.league || null, label: short(p), list: listLabel(p), odd: p.odd, start: p.start,
  gameId: p.gameId, market: p.market, side: p.side, line: p.line, stat: p.stat, playerId: p.playerId, team: p.team, match: p.match, pFinal: p.pFinal });
/* "S. Curry +1.5 T3", "Gana Thunder", "Thunder −8.5", "Más 236.5 (Thunder-Nuggets)" */
const ABBR = { puntos: 'Pts', rebotes: 'Reb', asistencias: 'Ast', triples: 'T3', 'pts+reb+ast': 'PRA', 'pts+reb': 'P+R', 'pts+ast': 'P+A', 'reb+ast': 'R+A' };
function listLabel(p) {
  if (p.market === 'prop') {
    const m = p.label.match(/^(.*?) (más|menos) de ([\d.]+) (.+)$/);
    if (!m) return short(p);
    const name = m[1].replace(/^(\S)\S*\s/, '$1. ');
    return `${name} ${m[2] === 'más' ? '+' : '−'}${m[3]} ${ABBR[m[4]] || m[4]}`;
  }
  if (p.market === 'total') return p.label.replace(/^(Más|Menos) de ([\d.]+) puntos$/, (_, w, n) => `${w === 'Más' ? 'Over' : 'Under'} ${n}`) + (p.match ? ` (${p.match.replace(' – ', '-')})` : '');
  return p.label;
}
/* lista numerada "1.- …" que quepa en un tuit; si no caben todos, "…y N más en la imagen" */
function listTweet(head, picks, foot, from = 1) {
  for (let n = picks.length; n >= 1; n--) {
    const body = picks.slice(0, n).map((p, i) => `${i + from}.- ${p.list || p.label} @${Number(p.odd).toFixed(2)}`);
    if (n < picks.length) body.push(`…+${picks.length - n} more en las fotos 📸`);
    for (const f of [foot, foot.slice(-1)]) { const t = [...head, ...body, ...f].join('\n'); if (xLen(t) <= 280) return t; }
  }
  return head.join('\n');
}

function elGame(g, picks) {
  const head = [`🏀 EuroLeague · hoy ${hhmm(g.start)}`, `${g.home.name} vs ${g.away.name}`, ''];
  let h = Math.round((g.model || {}).ptsH), w = Math.round((g.model || {}).ptsA);
  if (h === w) g.model.ptsH >= g.model.ptsA ? h++ : w++;                                      // en baloncesto no hay empate
  const guess = g.model && g.model.ptsH != null ? `🔮 Prediction: ${g.home.name} ${h}-${w} ${g.away.name}` : null;
  if (!picks.length) return fit([...head, 'Sin pick seguro en este partido: no hay valor suficiente. A veces lo mejor es no apostar.', ...(guess ? ['', guess] : []), '', '#EuroLeague · +18']);
  return listTweet(head, picks.map(mini), ['', ...(guess ? [guess] : []), '📊 Last 10 games en las fotos', '#EuroLeague · +18 · Juega con responsabilidad']);
}
function nbaDay(top) {
  const lines = ['🏀 NBA · los picks más seguros de esta noche', ''];
  top.forEach((p, i) => lines.push(`${['1️⃣', '2️⃣', '3️⃣'][i]} ${short(p)} @${p.odd.toFixed(2)} (${pct(p.pFinal)})`, `    ${p.match} · ${hhmm(p.start)}`));
  lines.push('', BIO, '#NBA · +18 · Juega con responsabilidad');
  return fit(lines);
}

function main() {
  const hist = readJSON(HIST, { days: {} });
  const today = madridDate(NOW), yday = madridDate(NOW - 24 * 3600e3);
  const day = hist.days[today] = hist.days[today] || {};
  const T = { euroleague: readJSON(path.join(ROOT, LG.euroleague.dir, 'today.json'), null), nba: readJSON(path.join(ROOT, LG.nba.dir, 'today.json'), null) };
  /* actualiza una publicación salvo que ya haya pasado su hora (congelada) */
  /* se congela al llegar su hora (lo publicado es lo que cuenta)… salvo el resumen mientras le falten resultados */
  const put = item => { const old = day[item.id]; if (old && (old.manual || (Date.parse(old.postAt) <= NOW && !old.pending))) return; day[item.id] = item; };   // manual = picks que puso el usuario: no se tocan

  /* Euroliga: una por partido de hoy */
  for (const g of (T.euroleague && T.euroleague.games) || []) {
    if (madridDate(g.start) !== today) continue;
    const picks = T.euroleague.picks.filter(p => p.gameId === g.id).sort((a, b) => b.safety - a.safety).slice(0, 2);
    put({ id: g.id, kind: 'el-game', league: 'euroleague', gameId: g.id, title: `${g.home.name} vs ${g.away.name}`, start: g.start,
      postAt: new Date(Date.parse(g.start) - 3600e3).toISOString(), text: elGame(g, picks), image: true, picks: picks.map(p => ({ ...mini(p), league: 'euroleague' })) });
  }
  /* NBA: todos los picks de esta noche, ordenados por seguridad, en UNA publicación.
     X permite 280 caracteres: si no caben todos, el texto acaba en «…y N más» y la foto los enseña todos */
  const tonightEnd = Date.parse(madridAt(madridDate(NOW + 24 * 3600e3), '12:00'));     // solo partidos de esta noche (hasta mañana a mediodía)
  const top = ((T.nba && T.nba.picks) || []).filter(p => { const t = Date.parse(p.start); return t > NOW && t < tonightEnd; }).sort((a, b) => b.safety - a.safety).map(p => ({ ...mini(p), league: 'nba' }));
  Object.keys(day).filter(k => /^nba-day/.test(k) && Date.parse(day[k].postAt) > NOW && !day[k].manual).forEach(k => delete day[k]);   // se rehace con los picks actuales
  /* más de 4 picks → hilo: cada post lleva sus picks enteros en el texto y una foto por pick (X deja 4).
     Se reparten parejos (7 → 4+3 · 9 → 3+3+3) y como mucho 3 posts (12 picks, los más seguros) */
  const P = top.slice(0, 12), parts = Math.ceil(P.length / 4), date = `${today.slice(8, 10)}/${today.slice(5, 7)}`;
  for (let k = 0, from = 0; k < parts; k++) {
    const m = Math.floor(P.length / parts) + (k < P.length % parts ? 1 : 0), chunk = P.slice(from, from + m);
    const head = k ? [`🧵 NBA Picks Day · ${date} (sigue)`, ''] : [`🏀 NBA Picks Day · ${date}`, ''];
    const foot = ['', '📊 Last 10 games de cada uno en las fotos', ...(k < parts - 1 ? ['👇 Más picks en el hilo'] : []), '#NBA · +18'];
    put({ id: k ? 'nba-day-' + (k + 1) : 'nba-day', kind: 'nba-day', league: 'nba', reply: k > 0, title: k ? `↳ Hilo ${k + 1}/${parts} · picks ${from + 1}-${from + m}` : `NBA Picks Day · ${P.length} pick${P.length > 1 ? 's' : ''}`,
      postAt: madridAt(today, '18:45'), image: true, picks: chunk, text: listTweet(head, chunk, foot, from + 1) });
    from += m;
  }

  /* combinada segura del día (NBA a las 19:00 · Euroliga 1 h 30 min antes del primer partido) */
  for (const lg of ['nba', 'euroleague']) {
    const C = T[lg] && (T[lg].combos || []).find(c => c.type === 'segura');
    if (!C) continue;
    const legs = C.legs.map(l => ({ ...mini(l), league: lg }));
    const first = Math.min(...legs.map(l => Date.parse(l.start)));
    if (!(first > NOW || day['combo-' + lg])) continue;
    if (lg === 'nba' && legs.some(l => Date.parse(l.start) >= tonightEnd)) continue;
    if (lg === 'euroleague' && legs.some(l => madridDate(l.start) !== today)) continue;
    const postAt = lg === 'nba' ? madridAt(today, '19:00') : new Date(first - 90 * 60e3).toISOString();
    const text = listTweet([`🎯 Safe Parlay · ${LG[lg].name}`, ''], legs, ['', `💰 Total odds ${C.odd.toFixed(2)}`, '📊 Last 10 games de cada uno en la foto', `${LG[lg].tag} · +18 · Juega con responsabilidad`]);
    put({ id: 'combo-' + lg, kind: 'combo', league: lg, title: `Safe Parlay · ${LG[lg].name} @${C.odd.toFixed(2)}`, postAt, image: true, text, picks: [], combo: { legs, odd: C.odd, prob: C.prob } });
  }

  /* resumen de ayer: solo picks de partidos YA jugados (antes de hoy a mediodía), uno a uno con ✅/❌ */
  const recs = {}, pend = {};
  for (const lg of ['euroleague', 'nba']) { const R = readJSON(path.join(ROOT, LG[lg].dir, 'record.json'), { record: [], pending: [] }); recs[lg] = R.record || []; pend[lg] = R.pending || []; }
  const info = i => { const r = recs[i.league].find(x => x.id === i.id) || pend[i.league].find(x => x.id === i.id); return { result: r && r.result || null, start: i.start || (r && r.start) || null }; };
  const cutoff = Date.parse(madridAt(today, '12:00'));
  const played = i => { const st = info(i).start; return st && Date.parse(st) < cutoff; };
  const prev = Object.values(hist.days[yday] || {}).filter(i => ((i.picks && i.picks.length) || i.combo) && Date.parse(i.postAt) <= Date.parse(madridAt(today, '00:00')));
  const comboRow = i => {
    const st = i.combo.legs.map(l => info(l).result);
    const result = st.includes('L') ? 'L' : st.some(r => !r) ? null : st.every(r => r === 'P' || r === 'V') ? 'V' : 'W';
    const odd = +i.combo.legs.reduce((a, l, k) => a * (st[k] === 'W' || st[k] === null || st[k] === 'L' ? Number(l.odd) : 1), 1).toFixed(2);
    return { id: i.id, league: i.league, label: `Combinada: ${i.combo.legs.map(l => l.list || l.label).join(' + ')}`, odd, result, start: i.combo.legs.map(l => l.start).sort().pop(), combo: true };
  };
  const items = [...prev.flatMap(i => i.picks).filter(played).map(i => ({ ...i, result: info(i).result })),
    ...prev.filter(i => i.combo && i.combo.legs.every(played)).map(comboRow)];
  /* un resumen por liga (Euroliga 09:30 · NBA 09:40), cada uno con su imagen */
  const [, M, D] = yday.split('-');
  for (const [lg, at] of [['euroleague', '09:30'], ['nba', '09:40']]) {
    const list = items.filter(i => i.league === lg);
    if (!list.length) continue;
    const done = list.filter(i => i.result === 'W' || i.result === 'L'), w = done.filter(i => i.result === 'W').length;
    /* historial de la liga: cada día cuenta con lo que se publicó en su resumen; si ese resumen fue MANUAL
       (picks puestos por el usuario), cuentan sus filas en vez de los picks automáticos */
    const nextDay = d => new Date(Date.parse(d + 'T12:00:00Z') + 24 * 3600e3).toISOString().slice(0, 10);
    const hist_lg = Object.keys(hist.days).filter(d => d < today).sort().flatMap(d => {
      const man = (hist.days[nextDay(d)] || {})['summary-' + lg];
      if (man && man.manual) return (man.rows || []).map(r => ({ odd: r.odd, result: r.result }));
      const its = Object.values(hist.days[d]).filter(i => Date.parse(i.postAt) <= NOW && i.league === lg && i.kind !== 'summary');
      return [...its.flatMap(i => i.picks || []).filter(played).map(i => ({ odd: i.odd, result: info(i).result })),
        ...its.filter(i => i.combo && i.combo.legs.every(played)).map(i => { const r = comboRow(i); return { odd: r.odd, result: r.result }; })];
    });
    const all = hist_lg.map(i => i.result).filter(r => r === 'W' || r === 'L'), tw = all.filter(r => r === 'W').length;
    /* unidades: 1 u por pick → acierto suma (cuota − 1), fallo resta 1 */
    const units = l => +l.reduce((a, i) => a + (i.result === 'W' ? Number(i.odd) - 1 : i.result === 'L' ? -1 : 0), 0).toFixed(2);
    const uDay = units(list), uTot = units(hist_lg);
    const u = x => `${x >= 0 ? '+' : ''}${x.toFixed(2)} u`;
    const head = [`📋 ${LG[lg].name} · resultados de ayer (${D}/${M})`, ''];
    const foot = ['', `Ayer: ${w}-${done.length - w} (${u(uDay)}) · Total ${LG[lg].name}: ${tw}-${all.length - tw} (${u(uTot)})`, `${LG[lg].tag} · +18 · Juega con responsabilidad`];
    let text = [...head, ...list.map(i => `${RES[i.result] || '⏳'} ${i.label} @${Number(i.odd).toFixed(2)}`), ...foot].join('\n');
    /* si no cabe: nombres abreviados sin cuota (la cuota va en la imagen); si aún no cabe, solo iconos */
    const abbr = l => l.replace(/^\S\.\s/, '').replace(' puntos', ' pts').replace(' rebotes', ' reb').replace(' asistencias', ' ast').replace('pts+reb+ast', 'PRA');
    const compact = [`📋 ${LG[lg].name} · ayer ${D}/${M}`, ...list.map(i => `${RES[i.result] || '⏳'} ${abbr(i.label)}`),
      `${w}-${done.length - w} ayer (${u(uDay)}) · ${tw}-${all.length - tw} total (${u(uTot)})`, `${LG[lg].tag} · +18`];
    if (xLen(text) > 280) text = compact.join('\n');
    if (xLen(text) > 280) text = [...head, `${list.map(i => RES[i.result] || '⏳').join('')}`, '👇 Cada pick en la imagen', ...foot].join('\n');
    put({ id: 'summary-' + lg, kind: 'summary', league: lg, title: `${LG[lg].name} · resultados de ayer (${D}/${M})`, postAt: madridAt(today, at), text, image: true,
      pending: list.some(i => !i.result), rows: list.map(i => ({ league: lg, label: i.label, odd: i.odd, result: i.result })), balance: { day: [w, done.length - w], total: [tw, all.length - tw], units: { day: uDay, total: uTot } } });
  }
  delete day.summary;                                           // el antiguo resumen conjunto

  /* predicciones de marcador de anoche que clavamos o casi (siempre acertando el ganador):
     exacto · un equipo exacto y el otro a ≤8 · los dos a ≤3 → publicación con una tarjeta por partido */
  for (const [lg, at] of [['euroleague', '10:00'], ['nba', '10:10']]) {
    const R = readJSON(path.join(ROOT, LG[lg].dir, 'record.json'), {});
    const TM = Object.values(readJSON(path.join(ROOT, LG[lg].dir, 'teams.json'), {}).teams || {}), logo = n => (TM.find(t => t.name === n) || {}).logo || null;
    const from = Date.parse(madridAt(yday, '12:00')), to = Date.parse(madridAt(today, '12:00'));
    const hits = ((R.predictions || {}).list || []).filter(x => { const t = Date.parse(x.start); return t >= from && t < to && x.winner; }).map(x => {
      const [ph, pa] = x.pred.split('-').map(Number), [rh, ra] = x.real.split('-').map(Number), eh = Math.abs(ph - rh), ea = Math.abs(pa - ra);
      const [home, away] = x.match.split(' – ');
      const how = !eh && !ea ? 'exact' : Math.min(eh, ea) === 0 && Math.max(eh, ea) <= 8 ? 'team' : eh <= 3 && ea <= 3 ? 'close' : null;
      return how && { id: x.id, start: x.start, home, away, hl: logo(home), al: logo(away), pred: [ph, pa], real: [rh, ra], how, team: how === 'team' ? (eh ? away : home) : null, off: eh + ea };
    }).filter(Boolean).sort((a, b) => a.off - b.off).slice(0, 4);
    if (!hits.length) continue;
    const line = h => h.how === 'exact' ? `🎯 NAILED IT! ${h.home} ${h.real[0]}-${h.real[1]} ${h.away}`
      : `${h.how === 'team' ? '🎯' : '🔥'} ${h.home} ${h.real[0]}-${h.real[1]} ${h.away} (we said ${h.pred[0]}-${h.pred[1]}${h.how === 'team' ? `, ${h.team} exact` : ''})`;
    const text = fit([`🔮 EuroPicks Prediction · ${LG[lg].name === 'Euroliga' ? 'EuroLeague' : 'NBA'} (${D}/${M})`, '', ...hits.map(line), '',
      hits.some(h => h.how !== 'close') ? 'Score predicted before tip-off 👀' : 'So close 👀', `${LG[lg].tag} · +18`]);
    put({ id: 'pred-' + lg, kind: 'pred', league: lg, title: `Predicción casi clavada · ${LG[lg].name} (${hits.length})`, postAt: madridAt(today, at), image: true, games: hits, text });
  }


  /* se guardan solo los últimos 30 días de memoria */
  Object.keys(hist.days).sort().slice(0, -30).forEach(d => delete hist.days[d]);
  writeJSON(HIST, hist, true);
  const list = Object.values(day).sort((a, b) => a.postAt.localeCompare(b.postAt) || a.id.localeCompare(b.id, 'en', { numeric: true }));   // el hilo sale en orden
  writeJSON(OUT, { updatedAt: new Date(NOW).toISOString(), date: today, items: list });
  console.log(`· publicaciones para X: ${list.length} preparadas para hoy (${list.map(i => i.kind).join(', ')})`);
}

main();
