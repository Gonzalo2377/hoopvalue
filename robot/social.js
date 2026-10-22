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
const mini = p => ({ id: pickId(p), league: p.league || null, label: short(p), odd: p.odd });

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
  const put = item => { const old = day[item.id]; if (old && Date.parse(old.postAt) <= NOW) return; day[item.id] = item; };

  /* Euroliga: una por partido de hoy */
  for (const g of (T.euroleague && T.euroleague.games) || []) {
    if (madridDate(g.start) !== today) continue;
    const picks = T.euroleague.picks.filter(p => p.gameId === g.id).sort((a, b) => b.safety - a.safety).slice(0, 2);
    put({ id: 'el:' + g.id, kind: 'el-game', league: 'euroleague', gameId: g.id, title: `${g.home.name} vs ${g.away.name}`, start: g.start,
      postAt: new Date(Date.parse(g.start) - 3600e3).toISOString(), text: elGame(g, picks), image: true, picks: picks.map(p => ({ ...mini(p), league: 'euroleague' })) });
  }
  /* NBA: los 3 mejores de partidos distintos que se juegan esta noche */
  const seen = new Set(), top = [];
  for (const p of (T.nba && T.nba.picks) || []) { if (Date.parse(p.start) > NOW && !seen.has(p.gameId)) { seen.add(p.gameId); top.push(p); } if (top.length === 3) break; }
  if (top.length) put({ id: 'nba-day', kind: 'nba-day', league: 'nba', title: 'NBA · picks de la noche', postAt: madridAt(today, '18:45'), text: nbaDay(top), image: true, picks: top.map(p => ({ ...mini(p), league: 'nba' })) });

  /* resumen de ayer */
  const prev = Object.values(hist.days[yday] || {}).filter(i => i.picks && i.picks.length && Date.parse(i.postAt) <= Date.parse(madridAt(today, '00:00')));
  const items = prev.flatMap(i => i.picks);
  if (items.length) {
    const rec = { euroleague: readJSON(path.join(ROOT, LG.euroleague.dir, 'record.json'), { record: [] }).record, nba: readJSON(path.join(ROOT, LG.nba.dir, 'record.json'), { record: [] }).record };
    const res = i => { const r = rec[i.league].find(x => x.id === i.id); return r ? r.result : null; };
    const [, M, D] = yday.split('-');
    const lines = [`📋 Resumen de ayer (${D}/${M})`];
    for (const lg of ['euroleague', 'nba']) {
      const l = items.filter(i => i.league === lg); if (!l.length) continue;
      lines.push('', LG[lg].name); l.forEach(i => lines.push(`${RES[res(i)] || '⏳'} ${i.label} @${Number(i.odd).toFixed(2)}`));
    }
    const done = items.map(res).filter(r => r === 'W' || r === 'L'), w = done.filter(r => r === 'W').length;
    /* balance de todo lo publicado (días anteriores a hoy) */
    const all = Object.entries(hist.days).filter(([d]) => d < today).flatMap(([, it]) => Object.values(it).filter(i => Date.parse(i.postAt) <= NOW).flatMap(i => i.picks || [])).map(res).filter(r => r === 'W' || r === 'L');
    const tw = all.filter(r => r === 'W').length;
    lines.push('', `Ayer: ${w}-${done.length - w} · Balance total: ${tw}-${all.length - tw}${all.length ? ` (${pct(tw / all.length)})` : ''}`, 'Todo el historial, sin borrar nada: link en la bio');
    let text = lines.join('\n');
    if (xLen(text) > 280) {                                     // muchos picks: una línea de iconos por liga
      text = [`📋 Resumen de ayer (${D}/${M})`, '', ...['euroleague', 'nba'].map(lg => {
        const r = items.filter(i => i.league === lg).map(res); if (!r.length) return null;
        const ww = r.filter(x => x === 'W').length, ll = r.filter(x => x === 'L').length;
        return `${LG[lg].name}: ${r.map(x => RES[x] || '⏳').join('')} (${ww}-${ll})`;
      }).filter(Boolean), '', `Ayer: ${w}-${done.length - w} · Balance total: ${tw}-${all.length - tw}${all.length ? ` (${pct(tw / all.length)})` : ''}`, 'Detalle de cada pick: link en la bio'].join('\n');
    }
    put({ id: 'summary', kind: 'summary', title: `Resumen de ayer (${D}/${M})`, postAt: madridAt(today, '09:30'), text, image: false, pending: items.some(i => !res(i)) });
  }

  /* se guardan solo los últimos 30 días de memoria */
  Object.keys(hist.days).sort().slice(0, -30).forEach(d => delete hist.days[d]);
  writeJSON(HIST, hist, true);
  const list = Object.values(day).sort((a, b) => a.postAt < b.postAt ? -1 : 1);
  writeJSON(OUT, { updatedAt: new Date(NOW).toISOString(), date: today, items: list });
  console.log(`· publicaciones para X: ${list.length} preparadas para hoy (${list.map(i => i.kind).join(', ')})`);
}

main();
