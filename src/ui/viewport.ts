// Diagnostics only (reported by the device check). The layout no longer adjusts to these numbers:
// adjusting at runtime made bottom bars jump when the keyboard changed the viewport height.
export function viewportInfo() {
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  return { innerHeight: window.innerHeight, screenHeight: screenH, gap: Math.max(0, screenH - window.innerHeight) };
}
