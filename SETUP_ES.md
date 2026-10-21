# Puesta en marcha (paso a paso, sin programar)

## 1. Crear el repositorio en GitHub
1. Entra en GitHub → **New repository** → nombre `hoopvalue` (público o privado, como prefieras).
2. Sube el contenido de la carpeta `HOOPVALUE` (igual que hiciste con acevalue y golvalue: *Add file → Upload files*, arrastrando todo, **incluida la carpeta `.github`**).
   - Si la carpeta `.github` no se sube arrastrando, crea a mano el archivo `.github/workflows/robot.yml` con *Add file → Create new file* y pega su contenido.

## 2. Clave de cuotas (The Odds API)
1. Crea una cuenta gratis en https://the-odds-api.com con un correo **distinto** al de acevalue y golvalue. Cada web debe tener su propia clave: golvalue se quedó sin créditos el 12 de octubre por compartir cuota.
2. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**
   - Nombre: `ODDS_API_KEY`
   - Valor: tu clave
3. Consumo previsto: 6 créditos por ejecución con partidos (3 mercados × regiones eu+uk). Solo pide cuotas si hay partidos en las próximas 36 h → unos 150-300 créditos/mes, dentro de los 500 gratis.

## 3. Activar el robot
1. Pestaña **Actions** → si pide permiso, pulsa *I understand… enable*.
2. **Settings → Actions → General → Workflow permissions → Read and write** → Save.
3. Actions → **Robot Euroliga** → **Run workflow** para la primera ejecución.
   Después va solo: 07:10, 16:40 (cuotas casi de cierre) y 23:20 UTC (resultados).
4. Si GitHub retrasa los horarios, usa el Worker de `cloudflare-cron/worker.js` (instrucciones dentro del archivo), igual que en acevalue.

## 4. Publicar la web (Cloudflare Pages)
1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → elige `hoopvalue`.
2. Build command: *(vacío)* · Build output directory: `public`.
3. Cada vez que el robot guarda datos, la web se actualiza sola.

## 5. Revisar que todo va bien
- En Actions, abre la última ejecución y mira el paso «Ejecutar robot»:
  - `The Odds API: N partidos con cuotas · créditos restantes X` → cuotas OK.
  - `equipo sin emparejar: "…"` → añade ese nombre en `robot/lib/teams.js`.
  - `liquidados N picks` → historial funcionando.
- En la web, pestaña **Historial**: acierto, ROI y sobre todo **CLV**. Un CLV positivo sostenido indica que el método funciona.
