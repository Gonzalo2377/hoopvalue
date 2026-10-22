# EuroPicks · Euroliga

Web: https://europicks.pages.dev (antes hoopvalue.pages.dev)

Web de análisis de la Euroliga que busca **el pick más seguro** de cada jornada (no la cuota más alta), con un historial que se puede comprobar.

## Qué hace
- **Histórico propio** de todas las temporadas cargadas: marcadores, cuartos, estadísticas de equipo y de cada jugador (`data/history/`).
- **Modelo**: ataque y defensa por 100 posesiones ajustados por rival y cancha, ritmo, descanso (semanas dobles) y bajas probables. Da más peso a lo reciente.
- **Tendencias**: forma L5/L10, racha, momentum, lo que anota y concede, casa/fuera, 1ª parte y 4º cuarto, cara a cara, hándicap y over cubiertos.
- **Jugadores**: proyección de minutos, puntos, rebotes, asistencias, triples y P+R+A.
- **Cuotas** (The Odds API): probabilidad justa del mercado sin margen, con prioridad a Pinnacle/Betfair. Se guardan apertura y cierre de cada partido.
- **Picks**: se mezcla mercado (80-88 %) y modelo (12-20 %), se penaliza si discrepan y se filtra por probabilidad ≥ 55 %, cuota ≥ 1,30 y sin valor esperado claramente negativo.
- **Historial honesto**: se liquida por código oficial de partido, nunca se borra un pick y se mide el **CLV** frente a la cuota de cierre.

## Estructura
```
robot/            el robot (Node 20, sin dependencias)
  daily.js        ejecución diaria: histórico → liquidar → cuotas → análisis → web
  backfill.js     carga de temporadas antiguas
  backtest.js     comprueba el modelo con temporadas pasadas y calibra
  settle.js       liquidación de picks
  odds-store.js   histórico propio de cuotas (apertura/cierre) y CLV
  sources/        Euroliga (feed oficial) y The Odds API
  model/          valoraciones, tendencias, jugadores, motor de picks
public/           la web (HTML + JS + CSS, sin compilación)
  data/           JSON que genera el robot y lee la web
data/             histórico, cuotas guardadas, picks y parámetros del modelo
.github/workflows/robot.yml   ejecución automática 3 veces al día
```

## Comandos
```
node robot/backfill.js     # cargar histórico (4 temporadas)
node robot/backtest.js     # calibrar el modelo
node robot/daily.js        # ejecución completa
node serve.js              # ver la web en http://localhost:3300
```

Puesta en marcha paso a paso: [SETUP_ES.md](SETUP_ES.md).
