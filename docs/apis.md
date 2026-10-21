# APIs evaluadas para la Euroliga (21-oct-2026)

Probadas en vivo salvo donde se indica.

## Resultados y estadísticas (gratis, sin clave)
| Fuente | Qué da | Estado |
|---|---|---|
| **feeds.incrowdsports.com** (`/provider/euroleague-feeds/v2/competitions/E/seasons/E2026/games?limit=500`, `/games/{código}/stats`) | Calendario, marcadores, cuartos y prórrogas, boxscore de equipo y de jugadores, escudos | ✅ **Fuente principal.** Es el feed que usa euroleague.net y aguanta bien muchas peticiones. |
| **api-live.euroleague.net** v1/v2/v3 y **live.euroleague.net/api** (Boxscore, PlaybyPlay) | Lo mismo + jugada a jugada y estadísticas acumuladas (v3) | ✅ Respaldo. ⚠️ Bloquea con HTTP 429 si se le pide deprisa (nos bloqueó durante la carga). |
| ESPN (`basketball/euroleague`) | Liga existe pero sin partidos | ❌ No sirve para la Euroliga. |
| SofaScore | Muy completo | ❌ 403 a robots. |

## Cuotas
| Fuente | Euroliga | Gratis | Comentario |
|---|---|---|---|
| **The Odds API** (`basketball_euroleague`) | Ganador, hándicap, totales; casas EU/UK (Pinnacle suele estar en la región eu) | 500 créditos/mes | ✅ **Elegida.** La conocemos de golvalue/acevalue. Coste = mercados × regiones por petición. |
| **OddsPapi** (torneo 138) | Según su web, 180+ casas, Pinnacle, históricos gratis (máx. 3 casas por petición) | 250 peticiones/mes | Buena candidata para añadir **cuotas históricas** (backtest) y más casas. Fuente de las cifras: su propio blog. |
| pinnapi (Pinnacle) | Pinnacle cerró su API pública en julio de 2025 | 100/día | Alternativa si se quiere Pinnacle directo. |
| SportsGameOdds, odds-api.io, TheRundown, OpticOdds | Variable | Limitado o de pago (desde ~49-99 $/mes) | No necesarias para empezar. |

## Decisiones
- No existen cuotas históricas gratis de la Euroliga en The Odds API (cuestan 10× créditos) → el robot **guarda apertura y cierre** de cada partido desde el primer día.
- Siguiente mejora sugerida: cargar históricos de OddsPapi para tener backtest contra cuotas reales ya esta temporada.
