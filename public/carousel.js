/* ============================================================
   EUROPICKS — carrusel 3D de los picks del día
   Todas las tarjetas forman un anillo: delante la elegida, las demás
   giradas y hundidas a los lados. Se pasa arrastrando (dedo o ratón),
   con las flechas, con el teclado o pulsando una tarjeta lateral.
   ============================================================ */
const CAR = { i: 0, n: 0, drag: null, bound: false };

function carouselHTML(picks) {
  return `<div class="car" id="car" tabindex="0" aria-roledescription="carrusel" aria-label="Picks del día">
    <div class="car-stage" id="car-stage">
      ${picks.map((p, i) => `<div class="car-item" data-i="${i}" aria-hidden="${i ? 'true' : 'false'}">
        <div class="car-rank">${i === 0 ? 'Pick más seguro del día' : `Pick ${i + 1} de ${picks.length}`}</div>
        ${pickCard(p, false)}
      </div>`).join('')}
    </div>
    <button class="car-btn prev" aria-label="Pick anterior" onclick="carGo(-1)">‹</button>
    <button class="car-btn next" aria-label="Pick siguiente" onclick="carGo(1)">›</button>
  </div>
  <div class="car-dots" role="tablist">${picks.map((_, i) => `<button class="dot" aria-label="Pick ${i + 1}" onclick="carTo(${i})"></button>`).join('')}</div>`;
}

/* distancia circular más corta entre la tarjeta y la elegida (−n/2 … n/2) */
const carOff = (i, cur, n) => { let d = (i - cur) % n; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };

function carLayout(dragFrac = 0) {
  const stage = document.getElementById('car-stage'); if (!stage) return;
  const items = [...stage.children], n = items.length;
  const narrow = stage.clientWidth < 640;
  const step = narrow ? 62 : 80;                                  // % del ancho de la tarjeta entre vecinas
  items.forEach((el, i) => {
    const d = carOff(i, CAR.i, n) + dragFrac, a = Math.abs(d);
    const show = a < 1.9;                                         // delante + una a cada lado (+ la siguiente insinuada)
    el.style.transform = `translateX(calc(-50% + ${d * step}%)) translateZ(${-a * 170}px) rotateY(${-Math.max(-1.6, Math.min(1.6, d)) * 34}deg) scale(${1 - Math.min(a, 2) * 0.1})`;
    el.style.opacity = show ? String(a <= 1 ? 1 - a * 0.45 : Math.max(0, 0.55 - (a - 1) * 0.6)) : '0';
    el.style.zIndex = String(100 - Math.round(a * 10));
    el.style.pointerEvents = show ? 'auto' : 'none';
    el.classList.toggle('front', a < 0.5);
    el.setAttribute('aria-hidden', a < 0.5 ? 'false' : 'true');
  });
  document.querySelectorAll('.car-dots .dot').forEach((b, i) => b.classList.toggle('on', i === CAR.i));
  /* la altura del escenario = la de la tarjeta de delante (no salta al cambiar) */
  const front = items[CAR.i]; if (front) stage.style.height = front.offsetHeight + 'px';
}

function carTo(i) { CAR.i = ((i % CAR.n) + CAR.n) % CAR.n; carLayout(); }
function carGo(dir) { carTo(CAR.i + dir); }

function initCarousel() {
  const car = document.getElementById('car'), stage = document.getElementById('car-stage');
  if (!car) return;
  CAR.n = stage.children.length; CAR.i = Math.min(CAR.i, CAR.n - 1);
  stage.classList.add('dragging');                                 // primera colocación sin animación
  carLayout();
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('dragging')));
  /* las tarjetas de jugador cargan su gráfico después: recolocar cuando cambie su altura */
  if (window.ResizeObserver) new ResizeObserver(() => carLayout()).observe(stage.children[CAR.i] || stage);
  setTimeout(() => carLayout(), 600);

  /* pulsar una tarjeta lateral la trae al frente (sin seguir el enlace) */
  stage.addEventListener('click', e => {
    const it = e.target.closest('.car-item'); if (!it) return;
    const i = +it.dataset.i;
    if (i !== CAR.i) { e.preventDefault(); e.stopPropagation(); carTo(i); }
  }, true);

  car.addEventListener('keydown', e => { if (e.key === 'ArrowRight') carGo(1); if (e.key === 'ArrowLeft') carGo(-1); });

  /* arrastrar: la tarjeta sigue al dedo; al soltar decide si pasa a la siguiente */
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('a,button')) return;
    CAR.drag = { x: e.clientX, y: e.clientY, w: stage.clientWidth * 0.6, moved: false };
    stage.classList.add('dragging');
  });
  if (CAR.bound) return;                                          // los listeners globales, una sola vez
  CAR.bound = true;
  window.addEventListener('pointermove', e => {
    const d = CAR.drag; if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved && Math.abs(e.clientY - d.y) > Math.abs(dx)) { CAR.drag = null; stage.classList.remove('dragging'); return; }   // scroll vertical
    d.moved = true;
    carLayout(Math.max(-1.2, Math.min(1.2, dx / d.w)));
  });
  const end = e => {
    const d = CAR.drag; if (!d) return;
    CAR.drag = null; stage.classList.remove('dragging');
    const frac = (e.clientX - d.x) / d.w;
    if (d.moved && Math.abs(frac) > 0.18) carGo(frac < 0 ? 1 : -1); else carLayout();
  };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => carLayout());
}
