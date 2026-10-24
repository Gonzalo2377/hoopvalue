/* ============================================================
   EUROPICKS — publicaciones del día para X (modo semiautomático, gratis)
   ------------------------------------------------------------
   Prepara cada publicación con su texto y su hora; la página /x las
   muestra con un botón «Compartir en X» (texto + imagen ya puestos).
     · Euroliga: una por partido, para 1 hora antes del salto inicial
       (su mejor pick, o la previa si no hay pick seguro)
     · NBA: una al día (18:45 hora de Madrid) con los 3 mejores picks
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
const mini = p => ({ id: pickId(p), league: p.league || null, label: short(p), odd: p.odd, start: p.start });

function elGame(g, picks) {
  const lines = [`🏀 Euroliga · hoy ${hhmm(g.start)}`, `${g.home.name} vs ${g.away.name}`, ''];
  if (picks.length) picks.forEach(p => lines.push(`✅ ${p.label} @${p.odd.toFixed(2)} (${pct(p.pFinal)})`));
  else lines.push('Sin pick seguro en este partido: no hay valor suficiente. A veces lo mejor es no apostar.');
  lines.push(`📊 Modelo: ${g.home.name} ${pct(g.model.pHome)} · ${g.away.name} ${pct(1 - g.model.pHome)}`, '', BIO, '#Euroliga · +18 · Juega con responsabilidad');
  return fit(lines);
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
    put({ id: 'el:' + g.id, kind: 'el-game', league: 'euroleague', gameId: g.id, title: `${g.home.name} vs ${g.away.name}`, start: g.start,
      postAt: new Date(Date.parse(g.start) - 3600e3).toISOString(), text: elGame(g, picks), image: true, picks: picks.map(p => ({ ...mini(p), league: 'euroleague' })) });
  }
  /* NBA: los 3 mejores de partidos distintos que se juegan esta noche */
  const seen = new Set(), top = [];
  const tonightEnd = Date.parse(madridAt(madridDate(NOW + 24 * 3600e3), '12:00'));     // solo partidos de esta noche (hasta mañana a mediodía)
  for (const p of (T.nba && T.nba.picks) || []) { const t = Date.parse(p.start); if (t > NOW && t < tonightEnd && !seen.has(p.gameId)) { seen.add(p.gameId); top.push(p); } if (top.length === 3) break; }
  if (top.length) put({ id: 'nba-day', kind: 'nba-day', league: 'nba', title: 'NBA · picks de la noche', postAt: madridAt(today, '18:45'), text: nbaDay(top), image: true, picks: top.map(p => ({ ...mini(p), league: 'nba' })) });

  /* resumen de ayer: solo picks de partidos YA jugados (antes de hoy a mediodía), uno a uno con ✅/❌ */
  const recs = {}, pend = {};
  for (const lg of ['euroleague', 'nba']) { const R = readJSON(path.join(ROOT, LG[lg].dir, 'record.json'), { record: [], pending: [] }); recs[lg] = R.record || []; pend[lg] = R.pending || []; }
  const info = i => { const r = recs[i.league].find(x => x.id === i.id) || pend[i.league].find(x => x.id === i.id); return { result: r && r.result || null, start: i.start || (r && r.start) || null }; };
  const cutoff = Date.parse(madridAt(today, '12:00'));
  const played = i => { const st = info(i).start; return st && Date.parse(st) < cutoff; };
  const prev = Object.values(hist.days[yday] || {}).filter(i => i.picks && i.picks.length && Date.parse(i.postAt) <= Date.parse(madridAt(today, '00:00')));
  const items = prev.flatMap(i => i.picks).filter(played).map(i => ({ ...i, result: info(i).result }));
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
      return Object.values(hist.days[d]).filter(i => Date.parse(i.postAt) <= NOW && i.league === lg && i.kind !== 'summary').flatMap(i => i.picks || []).filter(played).map(i => ({ odd: i.odd, result: info(i).result }));
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


  /* se guardan solo los últimos 30 días de memoria */
  Object.keys(hist.days).sort().slice(0, -30).forEach(d => delete hist.days[d]);
  writeJSON(HIST, hist, true);
  const list = Object.values(day).sort((a, b) => a.postAt < b.postAt ? -1 : 1);
  writeJSON(OUT, { updatedAt: new Date(NOW).toISOString(), date: today, items: list });
  console.log(`· publicaciones para X: ${list.length} preparadas para hoy (${list.map(i => i.kind).join(', ')})`);
}

main();
