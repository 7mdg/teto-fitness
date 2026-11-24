// iOS 26 bug: in Home Screen web apps the layout viewport can end above the physical screen bottom,
// so `position: fixed; bottom: 0` floats and the safe-area padding is counted twice.
// We measure the gap and expose it as --vp-gap; CSS subtracts it from the bottom padding.
// https://developer.apple.com/forums/thread/799216 · https://bugs.webkit.org/show_bug.cgi?id=297779

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function viewportInfo() {
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  return { innerHeight: window.innerHeight, screenHeight: screenH, gap: Math.max(0, screenH - window.innerHeight) };
}

export function measureViewportGap() {
  const apply = () => {
    const { gap } = viewportInfo();
    // Only trust the measurement in standalone mode; in Safari the browser toolbars cause legitimate differences.
    const useGap = standalone() && gap > 0 && gap < 120 ? gap : 0;
    document.documentElement.style.setProperty('--vp-gap', `${useGap}px`);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 300));
}
