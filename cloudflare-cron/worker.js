/* ============================================================
   HOOPVALUE — disparador puntual del robot desde Cloudflare
   ------------------------------------------------------------
   GitHub Actions a veces retrasa los cron una hora o más. Este Worker
   (gratis) despierta a la hora exacta y le pide a GitHub que ejecute
   el workflow "robot.yml".
   Variables en el panel de Cloudflare (Settings → Variables):
     OWNER    → "Gonzalo2377"
     REPO     → "hoopvalue"
     WORKFLOW → "robot.yml"
     BRANCH   → "main"
     GH_TOKEN → token de GitHub con permiso "Actions: read and write" (secreto)
   Triggers → Cron: los mismos horarios que robot.yml (10 7 * * *, 40 16 * * *, 20 23 * * *).
   Nota: al dispararlo así, el robot hace la ejecución completa (también liquida).
   ============================================================ */
async function trigger(env) {
  return fetch(`https://api.github.com/repos/${env.OWNER}/${env.REPO}/actions/workflows/${env.WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'hoopvalue-cron' },
    body: JSON.stringify({ ref: env.BRANCH || 'main' }),
  });
}
export default {
  async scheduled(event, env) { const r = await trigger(env); console.log('GitHub dispatch →', r.status); },
  async fetch(request, env) {
    const r = await trigger(env);
    return new Response('GitHub dispatch: ' + r.status + (r.status === 204 ? ' ✅ robot lanzado' : ' ❌ revisa OWNER/REPO/WORKFLOW/GH_TOKEN'));
  },
};
