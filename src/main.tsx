import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

/**
 * iOS home-screen apps (viewport-fit=cover, translucent status bar) report a layout viewport shorter
 * than the screen by the height of the status bar, while the page is still painted down to the bottom
 * edge: the app ends early and a dark band remains below it. The gap is measured here and everything
 * anchored to the bottom (page, background, tab bar, buttons, sheets) is pushed down by it.
 * In a browser tab or on a computer the gap is 0.
 */
function fitStandalone() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const layout = document.documentElement.clientHeight;
  const portrait = window.innerWidth <= window.innerHeight;
  const full = standalone ? (portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width)) : layout;
  const gap = Math.max(0, Math.min(120, full - layout));
  document.documentElement.style.setProperty('--vh-gap', `${gap}px`);
}
fitStandalone();
window.addEventListener('resize', fitStandalone);
window.addEventListener('orientationchange', () => setTimeout(fitStandalone, 300));

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __fgm: unknown }).__fgm = { game: useGame, nav: useNav };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
