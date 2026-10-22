/* ============================================================
   HOOPVALUE — nombres de equipo de las casas → código oficial
   ------------------------------------------------------------
   Las casas escriben los nombres a su manera ("Olympiakos",
   "Olimpia Milano"...). Aquí se traducen al código fijo de la liga
   (OLY, MIL...) para enlazar cada cuota con su partido por ID.
   Si sale "equipo sin emparejar" en el log, añade el alias aquí.
   ============================================================ */
const { norm } = require('./util');

const ALIASES = {
  nba: {
    ATL: ['atlanta hawks', 'hawks'], BOS: ['boston celtics', 'celtics'], BKN: ['brooklyn nets', 'nets'], CHA: ['charlotte hornets', 'hornets'],
    CHI: ['chicago bulls', 'bulls'], CLE: ['cleveland cavaliers', 'cavaliers', 'cavs'], DAL: ['dallas mavericks', 'mavericks', 'mavs'],
    DEN: ['denver nuggets', 'nuggets'], DET: ['detroit pistons', 'pistons'], GS: ['golden state warriors', 'warriors'], HOU: ['houston rockets', 'rockets'],
    IND: ['indiana pacers', 'pacers'], LAC: ['los angeles clippers', 'la clippers', 'clippers'], LAL: ['los angeles lakers', 'la lakers', 'lakers'],
    MEM: ['memphis grizzlies', 'grizzlies'], MIA: ['miami heat', 'heat'], MIL: ['milwaukee bucks', 'bucks'], MIN: ['minnesota timberwolves', 'timberwolves', 'wolves'],
    NO: ['new orleans pelicans', 'pelicans'], NY: ['new york knicks', 'knicks'], OKC: ['oklahoma city thunder', 'thunder'], ORL: ['orlando magic', 'magic'],
    PHI: ['philadelphia 76ers', '76ers', 'sixers'], PHX: ['phoenix suns', 'suns'], POR: ['portland trail blazers', 'trail blazers', 'blazers'],
    SA: ['san antonio spurs', 'spurs'], SAC: ['sacramento kings', 'kings'], TOR: ['toronto raptors', 'raptors'], UTAH: ['utah jazz', 'jazz'], WSH: ['washington wizards', 'wizards'],
  },
  euroleague: {
    BAR: ['fc barcelona', 'barcelona', 'barca'], MAD: ['real madrid'], PAM: ['valencia basket', 'valencia'], BAS: ['baskonia', 'saski baskonia', 'kosner baskonia'],
    OLY: ['olympiacos', 'olympiakos', 'olympiacos piraeus'], PAN: ['panathinaikos'], ULK: ['fenerbahce', 'fenerbahce beko'], IST: ['anadolu efes', 'efes'],
    TEL: ['maccabi tel aviv', 'maccabi'], HTA: ['hapoel tel aviv', 'hapoel'], RED: ['crvena zvezda', 'red star', 'zvezda'], PAR: ['partizan', 'partizan belgrade'],
    ZAL: ['zalgiris', 'zalgiris kaunas'], MIL: ['olimpia milano', 'ea7 emporio armani milan', 'armani milan', 'milan', 'milano'], VIR: ['virtus bologna', 'virtus'],
    MUN: ['bayern munich', 'fc bayern munich', 'bayern', 'bayern munchen'], PRS: ['paris basketball', 'paris'], ASV: ['asvel', 'ldlc asvel', 'asvel villeurbanne', 'villeurbanne'],
    MCO: ['as monaco', 'monaco'], DUB: ['dubai basketball', 'dubai'], BES: ['besiktas'],
  },
};
/* palabras de patrocinador o relleno que no ayudan a identificar */
const STOP = new Set(['fc', 'bc', 'kk', 'bk', 'basket', 'basketball', 'club', 'the', 'de', 'sad', 'cf', 'ac', 'as', 'beko', 'meridianbet', 'mozzart', 'bet', 'rapyd', 'aktor', 'athens', 'belgrade', 'istanbul', 'kaunas', 'piraeus', 'ldlc', 'kosner']);
const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w));

/* devuelve el código del equipo o null. `extra` = nombres conocidos del histórico {code:{name, short, alias}} */
function matchTeam(name, league, extra) {
  const n = norm(name);
  const table = { ...(ALIASES[league] || {}) };
  Object.entries(extra || {}).forEach(([code, t]) => {
    table[code] = [...(table[code] || []), t.name, t.short, ...(t.alias || [])].filter(Boolean).map(norm);
  });
  for (const [code, al] of Object.entries(table)) if (al.some(a => norm(a) === n)) return code;   // exacto
  /* aproximado: solapamiento de palabras significativas, exige ganador claro */
  const tn = toks(name); if (!tn.length) return null;
  let best = null, second = 0;
  for (const [code, al] of Object.entries(table)) {
    let s = 0;
    al.forEach(a => { const ta = toks(a); if (!ta.length) return; const inter = ta.filter(w => tn.includes(w)).length; s = Math.max(s, inter / Math.max(ta.length, tn.length)); });
    if (!best || s > best.s) { second = best ? best.s : 0; best = { code, s }; } else if (s > second) second = s;
  }
  return best && best.s >= 0.5 && best.s > second ? best.code : null;
}

module.exports = { matchTeam, ALIASES };
