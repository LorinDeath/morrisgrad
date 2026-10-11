// Загрузка Three.js r128 из public/js/three.min.js (общий для сайта глобальный билд).
// Ядро не тянет three из npm: используем ту же версию, что и остальные 3D-игры сайта.
let pending = null;

export function loadThree(src = '/js/three.min.js') {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mc-three]');
    const script = existing || document.createElement('script');
    const done = () => (window.THREE ? resolve(window.THREE) : reject(new Error('THREE не загрузился')));
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => reject(new Error('Не удалось загрузить ' + src)), { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.mcThree = '1';
      document.head.appendChild(script);
    }
  });
  return pending;
}
