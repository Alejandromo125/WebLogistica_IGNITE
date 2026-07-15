// js/particles.js
const COLORS = ['#4FC3E0', '#FBB03B', '#9AA3B2'];
const COUNT = 50;

export function mountParticles(container) {
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

  const layer = document.createElement('div');
  layer.className = 'particle-layer';
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < COUNT; i++) {
    const dot = document.createElement('div');
    dot.className = 'particle';
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    dot.style.background = COLORS[i % COLORS.length];
    dot.style.animationDelay = `${(Math.random() * 8).toFixed(2)}s`;
    dot.style.animationDuration = `${(8 + Math.random() * 6).toFixed(2)}s`;
    layer.appendChild(dot);
  }

  container.insertBefore(layer, container.firstChild);
}
