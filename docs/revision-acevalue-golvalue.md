# Revisión de resultados: acevalue (repo `tennis`) y golvalue (repo `wordlcup`)

Fecha: 21-oct-2026. Revisado el código del robot y el historial de `daily.json` en git.

## acevalue (tenis): no liquida nada desde el 18 de julio
Estado actual de `daily.json`: **152 picks, 168 combinadas y 1.329 predicciones del modelo pendientes**. El último pick liquidado es del 18-JUL.

| # | Problema | Prueba | Arreglo |
|---|---|---|---|
| 1 | **ESPN devuelve 0 resultados.** En tenis, ESPN agrupa los partidos en `event.groupings[].competitions[]`, pero `robot/espn-results.js` lee `event.competitions[0]`, que viene vacío. | Ejecutado hoy: `winners 0 · finished 0 · voided 0` con decenas de partidos terminados en la API. | Recorrer `groupings[].competitions[]` (cada partido trae `winner:true` y una nota tipo "X bt Y 6-3 7-6"). |
| 2 | **SofaScore bloquea (HTTP 403)** a peticiones de robot, incluso desde una IP doméstica. Era la vía "más fiable" (por ID). | `curl` a `api.sofascore.com/api/v1/event/…` → 403. | No depender de SofaScore; como mucho, usarlo de refuerzo. |
| 3 | **api-tennis** no aporta nada (seguramente clave caducada o sin poner) y `results.json` manual está vacío. | No hay liquidaciones desde julio. | Revisar el secret `APITENNIS_KEY` o quitar la dependencia. |
| 4 | Códigos de SofaScore para retiradas mal mapeados: se anulan los códigos 110/120, que en SofaScore suelen ser prórroga/penaltis (fútbol); retirada y walkover suelen ser 91/92. Una retirada se liquidaría como ganada/perdida. | `robot/sofascore-results.js` | Usar los códigos de retirada/walkover; revisar con un partido real. |
| 5 | Emparejar por **apellido** (última palabra) falla con hermanos (Cerundolo, Zverev, Pliskova) y apellidos compuestos. `name-canon.js` existe pero la liquidación no lo usa. `reverifyRecords` puede **cambiar** resultados ya liquidados si el mismo par de apellidos aparece en otro partido de la ventana. | Código. | Liquidar por ID de partido de la fuente de cuotas (OddsPapi da el ID) + fecha. |
| 6 | El historial se **recorta** a 60 picks (`RECORD.slice(0,60)`): se pierde el historial. | Código. | Guardar todo y que la web muestre lo que quiera. |

## golvalue (fútbol): buen método, pero se quedó sin créditos y borra picks
Liquida por **ID de evento** de The Odds API (correcto: no depende de nombres).

| # | Problema | Prueba | Arreglo |
|---|---|---|---|
| 1 | **Créditos agotados el 12-OCT** (`credits.remaining: 0`). Desde entonces no hay cuotas nuevas (`meta.stale: true`, la web enseña partidos viejos) ni resultados. | Historial de `daily.json`. | Clave propia por web; bajar consumo (ODDS_MAX 16 × 2 ejecuciones/día ≈ 1.000 créditos/mes > 500 gratis). |
| 2 | **Los picks sin liquidar se borran solos a los 4 días** sin quedar en el historial. Arsenal–Lille, Atlético–Man. United y Villarreal–Napoli (13-OCT) desaparecieron el 18-OCT. Eso sesga el historial. | Historial de `daily.json`. | Nunca borrar: marcar como «anulado» o «sin resultado». |
| 3 | `/scores?daysFrom=3` solo mira 3 días atrás: si el robot falla 3 días seguidos, esos picks ya no se pueden liquidar. | Código. | Liquidar con una fuente de resultados por fecha (ESPN fútbol por ID, gratis) o guardar el ID y consultarlo aunque sea antiguo. |
| 4 | 25 combinadas de junio siguen pendientes para siempre (sus partidos no tienen `ts` y la limpieza las respeta). | `COMBO_PENDING`. | Anularlas o liquidarlas a mano. |
| 5 | Historial recortado a 60 picks / 40 combinadas. | Código. | Igual que en acevalue. |
| 6 | Partidos aplazados/suspendidos nunca se marcan como `completed` → acaban borrados en vez de anulados. | Código. | Tratarlos como «anulado». |

## Lecciones aplicadas en HoopValue
1. Liquidar **solo por código oficial de partido**, nunca por nombres.
2. **Nunca borrar** un pick: W / L / P (push) / V (anulado, con motivo).
3. Historial completo, sin recortes.
4. Clave de cuotas propia y consumo calculado (solo se piden cuotas si hay partidos).
5. Guardar las cuotas de cierre para medir el CLV.
