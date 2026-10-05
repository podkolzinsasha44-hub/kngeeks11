import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

/**
 * iOS home-screen apps (viewport-fit=cover, translucent status bar) sometimes lay fixed elements out in a
 * viewport shorter than the screen by the height of the status bar, while the page is still painted down to
 * the bottom edge: the app ends early and a dark band remains below it. Other launches (and other iOS
 * versions) give the full height. So nothing is assumed: a fixed probe measures where `bottom: 0` really is,
 * and only a real shortfall moves the page, the tab bar, the buttons and the sheets down (--vh-gap).
 * In a browser tab or on a computer the gap is 0.
 */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none';
document.documentElement.appendChild(probe);
function fitStandalone() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerWidth <= window.innerHeight;
  const full = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  const fixed = probe.getBoundingClientRect().height;
  // A gap the size of a status bar (20–62 pt) is the iOS bug; anything else is a real window size.
  const short = full - fixed;
  const gap = standalone && short >= 18 && short <= 70 ? short : 0;
  document.documentElement.style.setProperty('--vh-gap', `${gap}px`);
}
fitStandalone();
window.addEventListener('resize', fitStandalone);
window.visualViewport?.addEventListener('resize', fitStandalone);
window.addEventListener('orientationchange', () => setTimeout(fitStandalone, 300));
window.addEventListener('pageshow', fitStandalone);
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fitStandalone, 100); });
// iOS sometimes settles the viewport only after the first frames.
for (const ms of [250, 1000, 2500]) setTimeout(fitStandalone, ms);

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __fgm: unknown }).__fgm = { game: useGame, nav: useNav };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
