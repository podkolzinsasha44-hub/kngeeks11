import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { installCloudSync } from './store/cloud';
import { installViewportFix } from './ui/viewport';

// A home-screen app on iOS rarely restarts: look for a new version whenever the app comes back to the screen and
// every half hour; the new version takes over by itself (autoUpdate).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  },
});
installCloudSync();
installViewportFix();

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __fgm: unknown }).__fgm = { game: useGame, nav: useNav };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
