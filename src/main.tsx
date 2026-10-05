import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

/**
 * iOS home-screen apps (viewport-fit=cover, translucent status bar) sometimes report a layout viewport
 * shorter than the screen by the height of the status bar: the page ends early and a dark band remains
 * below it. Only the page height is extended by the shortfall (--vh-gap); fixed elements (tab bar,
 * buttons, sheets) follow the page down by themselves and are not moved.
 *
 * The measurement (clientHeight) does not depend on the page height, so applying the gap never changes
 * the next measurement. As a safety net the value cannot flip back and forth: a change that undoes the
 * previous one within two seconds is ignored.
 * In a browser tab or on a computer the gap is 0.
 */
let applied = 0, prev = 0, changedAt = 0;
function fitStandalone() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const layout = document.documentElement.clientHeight;
  const portrait = window.innerWidth <= window.innerHeight;
  const full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  const short = full - layout;
  // A shortfall the size of a status bar is the iOS bug; anything else is a real window size.
  const gap = standalone && short >= 18 && short <= 70 ? short : 0;
  if (gap === applied) return;
  const now = performance.now();
  if (gap === prev && now - changedAt < 2000) return;
  prev = applied; applied = gap; changedAt = now;
  document.documentElement.style.setProperty('--vh-gap', `${gap}px`);
}
fitStandalone();
window.addEventListener('resize', fitStandalone);
window.addEventListener('orientationchange', () => setTimeout(fitStandalone, 300));
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fitStandalone, 100); });
setTimeout(fitStandalone, 500);

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __fgm: unknown }).__fgm = { game: useGame, nav: useNav };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
