#!/usr/bin/env bash
# Una pasada completa del robot: Euroliga, NBA, publicaciones de /x, guardar y publicar en Cloudflare.
# El workflow la repite cada 20 minutos durante casi 6 horas, porque GitHub solo lanza
# el cron "cada hora" cada 4-6 horas en la práctica: así nunca hay huecos largos
# y los resultados de la noche están resueltos antes del resumen de la mañana.
set -u
node robot/daily.js || echo "⚠ robot Euroliga falló"
node robot/daily-nba.js || echo "⚠ robot NBA falló"
node robot/social.js || echo "⚠ publicaciones X fallaron"

# recalibrar el modelo una vez los lunes (primera pasada a partir de las 07 UTC)
if [ "$(date -u +%u)" = "1" ] && [ "$(date -u +%H)" -ge 7 ] && [ ! -f /tmp/backtest-done ]; then
  node robot/backtest.js; node robot/backtest.js nba; touch /tmp/backtest-done
fi

git add data public/data
if git diff --staged --quiet; then echo "Sin cambios."; exit 0; fi
git commit -q -m "chore: robot euroliga"
for i in 1 2 3; do
  git pull -q --rebase --autostash origin main && git push -q && break
  echo "push rechazado, reintento $i…"; sleep 5
done

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # EuroPicks (dirección principal) + hoopvalue (la antigua, para no romper enlaces)
  for p in europicks hoopvalue; do npx --yes wrangler@3 pages deploy public --project-name=$p --branch=main --commit-dirty=true >/dev/null 2>&1 || echo "⚠ deploy $p falló"; done
  echo "✓ publicado"
fi
