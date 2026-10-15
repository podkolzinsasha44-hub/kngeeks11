// iOS home-screen apps: once the keyboard has been open, WebKit can leave the window shorter by the height of the
// status bar (59 pt on a Dynamic Island iPhone) until the app is killed — a dead black band under the tab bar.
// Hiding and showing the full-screen root for one frame makes WebKit measure the window again.
// (Known WebKit bug; https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d)

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const typing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
};

export function installViewportFix() {
  if (!standalone()) return;
  // The tallest height seen outside typing is the app's real height (the status bar is not ours: style "black").
  let full = window.innerHeight;
  const portrait = () => window.innerHeight >= window.innerWidth;
  const expected = () => full;

  const remeasure = () => {
    if (typing() || !portrait() || expected() - window.innerHeight <= 4) return;
    const root = document.getElementById('root');
    if (!root) return;
    // Scroll positions inside the app are lost with display: none — keep and restore them.
    const scrolled: [Element, number][] = [];
    root.querySelectorAll('*').forEach((el) => { if (el.scrollTop > 0) scrolled.push([el, el.scrollTop]); });
    root.style.display = 'none';
    void root.offsetHeight;
    root.style.display = '';
    for (const [el, top] of scrolled) el.scrollTop = top;
    full = Math.max(full, window.innerHeight);
  };
  const soon = () => { setTimeout(remeasure, 150); setTimeout(remeasure, 500); };

  window.addEventListener('resize', () => { if (!typing()) full = Math.max(full, window.innerHeight); });
  document.addEventListener('focusout', soon);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
  window.addEventListener('pageshow', soon);
  soon();
}
