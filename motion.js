/* ==========================================================================
   NOLA LABS · TABLERO FINANCIERO — motion.js
   Motion cues: cifras que cuentan, aparición escalonada, indicador del dock.
   Respeta prefers-reduced-motion. Se carga ANTES de app.js; usa fmtCOP/fmtShort
   de app.js solo en tiempo de ejecución.
   ========================================================================== */

const MOTION = {
  reduce: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
};
if (!MOTION.reduce) document.documentElement.classList.add('js-motion');

function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

// Formatea según data-fmt (cop | short | pct | int | months | plain)
function motionFmt(v, fmt) {
  switch (fmt) {
    case 'short': return fmtShort(v);
    case 'pct': return fmtPct(v);
    case 'pct1': return fmtPct(v, 1);
    case 'int': return String(Math.round(v));
    case 'months': return fmtMonths(v);
    case 'plain': return String(Math.round(v));
    default: return fmtCOP(v);
  }
}

// Cuenta desde 0 (o desde data-from) hasta data-count
function countUp(el) {
  const target = Number(el.dataset.count) || 0;
  const from = Number(el.dataset.from) || 0;
  const fmt = el.dataset.fmt || 'cop';
  const dur = Number(el.dataset.dur) || 1100;
  if (MOTION.reduce || Math.abs(target - from) < 0.5) { el.textContent = motionFmt(target, fmt); return; }
  const t0 = performance.now();
  el.classList.add('counting');
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = motionFmt(from + (target - from) * easeOutExpo(p), fmt);
    if (p < 1) requestAnimationFrame(step); else el.classList.remove('counting');
  };
  requestAnimationFrame(step);
}

// Aplica motion a una vista recién renderizada: aparición escalonada + cifras que cuentan.
// animate=false (re-render por una edición): sin animación, para no "parpadear" al editar.
function viewMotion(root, animate = true) {
  if (!root) return;
  if (!animate || MOTION.reduce) {
    root.querySelectorAll('[data-count]').forEach(el => { el.dataset.counted = '1'; });
    return;
  }
  const targets = root.querySelectorAll('.hero, .card, .callout, .alert-card, .person, .mcard');
  let i = 0;
  targets.forEach(el => {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal');
    el.style.setProperty('--d', Math.min(i, 14) * 40 + 'ms');
    i++;
  });
  root.querySelectorAll('[data-count]').forEach(el => { if (el.dataset.counted) return; el.dataset.counted = '1'; countUp(el); });
}

// Indicador deslizante del dock flotante
function navIndicator() {
  const ind = document.getElementById('fnavInd');
  const nav = document.getElementById('fnav');
  if (!ind || !nav) return;
  const act = nav.querySelector('.fnav-item.active');
  if (!act || !act.offsetWidth) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.left = act.offsetLeft + 'px';
  ind.style.width = act.offsetWidth + 'px';
  ind.style.top = act.offsetTop + 'px';
  ind.style.height = act.offsetHeight + 'px';
}

// Efecto sutil de "spotlight" en cards oscuras (sigue el cursor; solo desktop)
function cardSpotlight(root) {
  if (MOTION.reduce || !window.matchMedia('(hover: hover)').matches) return;
  (root || document).querySelectorAll('.kpi--dark, .hero-fig').forEach(c => {
    if (c.dataset.spot) return; c.dataset.spot = '1';
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  });
}
