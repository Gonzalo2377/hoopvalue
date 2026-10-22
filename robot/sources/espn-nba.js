/* ============================================================
   EUROPICKS — NBA vía la API pública de ESPN (gratis, sin clave)
   ------------------------------------------------------------
   · dayGames(fecha) → partidos del día (estado, marcador, IDs)
   · gameDetail(id)  → boxscore (equipo + jugadores), cuartos y la
                       línea de DraftKings (spread / total / ganador)
   · injuries()      → bajas oficiales por equipo
   Cada partido tiene un ID fijo de ESPN ("nba:401909088") y se
   liquida SIEMPRE por ese ID, nunca por nombres.
   ============================================================ */
const { getJSON } = require('../lib/http');
const { ymdCompact, amToDec } = require('../lib/util');

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const NBA_TEAMS = new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY','OKC','ORL','PHI','PHX','POR','SA','SAC','TOR','UTAH','WSH']);

/* temporada a partir de la fecha: sep-dic → "2026-27"; ene-ago → "2025-26" */
function seasonOf(iso) {
  const d = new Date(iso), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 9 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}
function statusOf(type) {
  const n = (type && type.name) || '';
  if (type && type.completed) return 'final';
  if (/POSTPONED|CANCELED|SUSPENDED|FORFEIT/.test(n)) return 'postponed';
  if (/IN_PROGRESS|HALFTIME|END_PERIOD/.test(n)) return 'live';
  return 'scheduled';
}
const teamInfo = t => ({ code: t.abbreviation, espnId: t.id, name: t.displayName, short: t.shortDisplayName || t.name, logo: t.logo });

async function dayGames(date) {
  const j = await getJSON(`${BASE}/scoreboard?dates=${ymdCompact(date)}`);
  if (!j || !j.events) return null;
  const out = [];
  for (const ev of j.events) {
    const c = ev.competitions && ev.competitions[0]; if (!c) continue;
    const st = ev.season && ev.season.type;                     // 1 pretemporada · 2 regular · 3 playoffs · 5 play-in
    if (st === 1) continue;
    const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
    if (!h || !a || !NBA_TEAMS.has(h.team.abbreviation) || !NBA_TEAMS.has(a.team.abbreviation)) continue;   // fuera All-Star
    out.push({
      id: 'nba:' + ev.id, league: 'nba', season: seasonOf(ev.date), phase: st === 3 ? 'PO' : st === 5 ? 'PI' : 'RS',
      date: ev.date, status: statusOf(c.status && c.status.type), neutral: !!c.neutralSite,
      home: h.team.abbreviation, away: a.team.abbreviation,
      hs: h.score != null && h.score !== '' ? +h.score : null, as: a.score != null && a.score !== '' ? +a.score : null,
      _teams: [teamInfo(h.team), teamInfo(a.team)],
    });
  }
  return out;
}

const pair = s => { const m = String(s || '').split('-').map(Number); return [m[0] || 0, m[1] || 0]; };
function teamBox(stats) {
  const g = n => { const s = stats.find(x => x.name === n); return s ? s.displayValue : '0'; };
  const [fgm, fga] = pair(g('fieldGoalsMade-fieldGoalsAttempted'));
  const [tpm, tpa] = pair(g('threePointFieldGoalsMade-threePointFieldGoalsAttempted'));
  const [ftm, fta] = pair(g('freeThrowsMade-freeThrowsAttempted'));
  return { fgm, fga, tpm, tpa, ftm, fta, oreb: +g('offensiveRebounds'), dreb: +g('defensiveRebounds'), ast: +g('assists'),
    stl: +g('steals'), blk: +g('blocks'), tov: +(g('totalTurnovers') || g('turnovers')), pf: +g('fouls') };
}

/* detalle de un partido: boxscore, jugadores y línea de DraftKings */
async function gameDetail(gameId) {
  const j = await getJSON(`${BASE}/summary?event=${String(gameId).replace(/^nba:/, '')}`);
  if (!j || !j.header) return null;
  const hc = j.header.competitions[0];
  const H = hc.competitors.find(x => x.homeAway === 'home'), A = hc.competitors.find(x => x.homeAway === 'away');
  const codeById = {}; hc.competitors.forEach(c => { codeById[c.id] = c.team.abbreviation; });
  const out = { status: statusOf(hc.status && hc.status.type) };
  out.q = { h: (H.linescores || []).map(l => +l.displayValue || 0), a: (A.linescores || []).map(l => +l.displayValue || 0) };
  out.ot = out.q.h.length > 4;
  const bx = j.boxscore || {};
  if (bx.teams && bx.teams.length === 2) {
    out.box = {};
    bx.teams.forEach(t => { out.box[codeById[t.team.id] === H.team.abbreviation ? 'h' : 'a'] = teamBox(t.statistics || []); });
  }
  /* jugadores: [id, nombre, equipo, pos, titular, min, pts, reb, ast, 3pm, stl, blk, tov, fga, fta] */
  out.players = [];
  (bx.players || []).forEach(tp => {
    const team = tp.team.abbreviation, st = tp.statistics && tp.statistics[0]; if (!st) return;
    const ix = n => st.keys.indexOf(n);
    (st.athletes || []).forEach(a => {
      if (a.didNotPlay || !a.stats || !a.stats.length) return;
      const v = n => a.stats[ix(n)];
      const min = +v('minutes') || 0; if (!min) return;
      out.players.push([a.athlete.id, a.athlete.displayName, team, (a.athlete.position && a.athlete.position.abbreviation) || '', a.starter ? 1 : 0,
        min, +v('points') || 0, +v('rebounds') || 0, +v('assists') || 0, pair(v('threePointFieldGoalsMade-threePointFieldGoalsAttempted'))[0],
        +v('steals') || 0, +v('blocks') || 0, +v('turnovers') || 0,
        pair(v('fieldGoalsMade-fieldGoalsAttempted'))[1], pair(v('freeThrowsMade-freeThrowsAttempted'))[1]]);
    });
  });
  const pc = (j.pickcenter || [])[0];
  if (pc && (pc.spread != null || pc.overUnder != null)) {
    const ho = pc.homeTeamOdds || {}, ao = pc.awayTeamOdds || {};
    out.line = { src: 'draftkings', spread: pc.spread != null ? Math.abs(+pc.spread) * (ho.favorite ? -1 : 1) : null, total: pc.overUnder != null ? +pc.overUnder : null,
      mlH: amToDec(ho.moneyLine), mlA: amToDec(ao.moneyLine), spH: amToDec(ho.spreadOdds), spA: amToDec(ao.spreadOdds), ov: amToDec(pc.overOdds), un: amToDec(pc.underOdds) };
  }
  return out;
}

/* bajas oficiales: { espnTeamId: [{id, name, status, detail}] } */
async function injuries() {
  const j = await getJSON(`${BASE}/injuries`);
  const out = {};
  ((j && j.injuries) || []).forEach(t => {
    out[t.id] = (t.injuries || []).map(i => {
      const link = ((i.athlete && i.athlete.links) || []).map(l => l.href).find(h => /\/id\/\d+/.test(h)) || '';
      const m = link.match(/\/id\/(\d+)/);
      return { id: m ? m[1] : null, name: i.athlete && i.athlete.displayName, status: i.status, detail: (i.shortComment || '').slice(0, 160) };
    });
  });
  return out;
}

module.exports = { dayGames, gameDetail, injuries, seasonOf, NBA_TEAMS };
