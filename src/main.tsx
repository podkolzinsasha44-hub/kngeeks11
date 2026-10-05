import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/oswald';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { installCloudSync } from './store/cloud';

registerSW({ immediate: true });
installCloudSync();

// Debug hooks (used by automated UI checks)
import { useGame } from './store/game';
import { useNav } from './store/nav';
(window as unknown as { __fgm: unknown }).__fgm = { game: useGame, nav: useNav };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
