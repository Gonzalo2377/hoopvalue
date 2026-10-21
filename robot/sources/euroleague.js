/* ============================================================
   HOOPVALUE — datos de la Euroliga (gratis, sin clave)
   ------------------------------------------------------------
   Dos fuentes con los mismos datos oficiales:
     1. feeds.incrowdsports.com → el feed que usa la propia web de la
        Euroliga (CDN, aguanta bien muchas peticiones)
     2. api-live / live.euroleague.net → API oficial (respaldo; bloquea
        con HTTP 429 si se le pide deprisa)
   · seasonGames(E2026) → calendario completo con marcadores y cuartos
   · gameDetail(E2026, gameCode) → boxscore de equipo y jugadores
   Cada partido tiene un código fijo ("el:E2026_59") y se liquida por
   ese código, nunca por nombres.
   ============================================================ */
const { getJSON } = require('../lib/http');

const FEED = 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons';
const V2 = 'https://api-live.euroleague.net/v2/competitions/E/seasons';
const LIVE = 'https://live.euroleague.net/api';

/* "E2026" ↔ "2026-27" */
const seasonKey = code => { const y = +String(code).slice(1); return `${y}-${String(y + 1).slice(2)}`; };
/* mismo ID de jugador en las dos fuentes: "P014802" / "014802" → "014802" */
const pid = id => String(id || '').trim().replace(/^P/, '');

function quarters(p) {
  if (!p) return null;
  const q = [p.partials1, p.partials2, p.partials3, p.partials4].map(x => +x || 0);
  Object.keys(p.extraPeriods || {}).sort().forEach(k => q.push(+p.extraPeriods[k] || 0));
  return q;
}

const isFinalFour = g => !!(g.phaseType && g.phaseType.code === 'FF');   // la Final Four se juega en sede neutral
/* formato del feed: status "result" = terminado; cuartos en q1..q4, ot1.. */
function fromFeed(g, code) {
  const Hm = g.home, Aw = g.away;
  const played = g.status === 'result' && Hm.score != null && Aw.score != null;
  const qs = t => t.quarters ? ['q1', 'q2', 'q3', 'q4', 'ot1', 'ot2', 'ot3', 'ot4', 'ot5'].filter((k, i) => i < 4 || t.quarters[k] != null).map(k => +t.quarters[k] || 0) : null;
  const club = t => ({ code: t.code, name: t.name, short: t.abbreviatedName || t.name, alias: [t.editorialName, t.abbreviatedName, t.tla].filter(Boolean), logo: t.imageUrls && t.imageUrls.crest });
  const out = {
    id: 'el:' + g.identifier, league: 'euroleague', season: seasonKey(code), gameCode: g.code,
    phase: (g.phaseType && g.phaseType.code) || 'RS', round: g.round && g.round.round,
    date: g.date, status: played ? 'final' : /postpon|cancel|suspend/i.test(g.status) ? 'postponed' : 'scheduled', neutral: isFinalFour(g),
    home: Hm.code, away: Aw.code, hs: played ? +Hm.score : null, as: played ? +Aw.score : null,
    _teams: [club(Hm), club(Aw)],
  };
  const qh = played && qs(Hm), qa = played && qs(Aw);
  if (qh && qa && qh.some(Boolean)) { out.q = { h: qh, a: qa }; out.ot = qh.length > 4; }
  return out;
}

async function seasonGames(code) {
  const f = await getJSON(`${FEED}/${code}/games?limit=500`);
  if (f && Array.isArray(f.data) && f.data.length) return f.data.map(g => fromFeed(g, code));
  const j = await getJSON(`${V2}/${code}/games`);
  if (!j || !j.data) return null;
  return j.data.map(g => {
    const L = g.local, R = g.road;
    const played = !!g.played && L.score != null && R.score != null;
    const out = {
      id: 'el:' + g.identifier, league: 'euroleague', season: seasonKey(code), gameCode: g.gameCode,
      phase: (g.phaseType && g.phaseType.code) || 'RS', round: g.round,
      date: g.utcDate || g.date, status: played ? 'final' : 'scheduled', neutral: !!g.isNeutralVenue,
      home: L.club.code, away: R.club.code,
      hs: played ? +L.score : null, as: played ? +R.score : null,
      _teams: [teamInfo(L.club), teamInfo(R.club)],
    };
    const qh = played && quarters(L.partials), qa = played && quarters(R.partials);
    if (qh && qa && qh.some(Boolean)) { out.q = { h: qh, a: qa }; out.ot = qh.length > 4; }
    return out;
  });
}
const teamInfo = c => ({ code: c.code, name: c.name, short: c.abbreviatedName || c.name, alias: [c.editorialName, c.abbreviatedName, c.tvCode].filter(Boolean), logo: c.images && c.images.crest });

/* "BELLO, RASHEED" → "Rasheed Bello" */
const prettyName = n => { const [last, first] = String(n || '').split(',').map(x => x.trim()); const cap = w => (w || '').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, c => c.toUpperCase()); return first ? `${cap(first)} ${cap(last)}` : cap(last); };

/* estadísticas (mismos nombres en ambas fuentes, salvo mayúscula inicial) → caja de equipo */
function teamBox(t) {
  const v = k => +(t[k] ?? t[k[0].toUpperCase() + k.slice(1)] ?? 0);
  return { fgm: v('fieldGoalsMade2') + v('fieldGoalsMade3'), fga: v('fieldGoalsAttempted2') + v('fieldGoalsAttempted3'),
    tpm: v('fieldGoalsMade3'), tpa: v('fieldGoalsAttempted3'), ftm: v('freeThrowsMade'), fta: v('freeThrowsAttempted'),
    oreb: v('offensiveRebounds'), dreb: v('defensiveRebounds'), ast: v('assistances'), stl: v('steals'), tov: v('turnovers'),
    blk: v('blocksFavour'), pf: v('foulsCommited') };
}
/* jugador: [id, nombre, equipo, pos, titular, min, pts, reb, ast, 3pm, stl, blk, tov, fga, fta] */
const playerRow = (id, name, team, pos, starter, min, s) => [pid(id), name, team, pos, starter ? 1 : 0, Math.round(min * 10) / 10,
  s.points, s.totalRebounds, s.assistances, s.fieldGoalsMade3, s.steals, s.blocksFavour, s.turnovers,
  s.fieldGoalsAttempted2 + s.fieldGoalsAttempted3, s.freeThrowsAttempted];

async function detailFeed(code, gameCode) {
  const j = await getJSON(`${FEED}/${code}/games/${gameCode}/stats`);
  if (!j || !j.local || !j.road || !j.local.total) return null;
  const out = { box: { h: teamBox(j.local.total), a: teamBox(j.road.total) }, players: [] };
  [j.local, j.road].forEach(side => (side.players || []).forEach(p => {
    const s = p.stats || {}, min = (s.timePlayed || 0) / 60; if (!min) return;
    const pl = p.player || {}, per = pl.person || {};
    out.players.push(playerRow(per.code, prettyName(per.name), (pl.club && pl.club.code) || '', (pl.positionName || '').slice(0, 1), s.startFive, min, s));
  }));
  return out;
}

const minutes = s => { const [m, sec] = String(s || '0:0').split(':').map(Number); return (m || 0) + (sec || 0) / 60; };
async function detailLive(code, gameCode, homeCode) {
  const j = await getJSON(`${LIVE}/Boxscore?gamecode=${gameCode}&seasoncode=${code}`);
  if (!j || !j.Stats || j.Stats.length < 2) return null;
  const out = { box: {}, players: [] };
  j.Stats.forEach((s, i) => {
    const team = String(((s.PlayersStats || []).find(p => p.Team) || {}).Team || '').trim();
    const side = team ? (team === homeCode ? 'h' : 'a') : (i === 0 ? 'h' : 'a');
    if (s.totr) out.box[side] = teamBox(s.totr);
    (s.PlayersStats || []).forEach(p => {
      const min = minutes(p.Minutes); if (!min) return;
      const st = { points: p.Points, totalRebounds: p.TotalRebounds, assistances: p.Assistances, fieldGoalsMade3: p.FieldGoalsMade3, steals: p.Steals,
        blocksFavour: p.BlocksFavour, turnovers: p.Turnovers, fieldGoalsAttempted2: p.FieldGoalsAttempted2, fieldGoalsAttempted3: p.FieldGoalsAttempted3, freeThrowsAttempted: p.FreeThrowsAttempted };
      out.players.push(playerRow(p.Player_ID, prettyName(p.Player), String(p.Team).trim(), '', p.IsStarter, min, st));
    });
  });
  return out;
}

async function gameDetail(code, gameCode, homeCode) {
  return (await detailFeed(code, gameCode)) || (await detailLive(code, gameCode, homeCode));
}

module.exports = { seasonGames, gameDetail, seasonKey, pid };
