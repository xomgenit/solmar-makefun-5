// SOLMAR — Streets of the Sun. Small shared helpers: math, seeded random, rects.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Deterministic PRNG (mulberry32) so a saved seed rebuilds the same city.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function intRange(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
// Push a circle out of an axis-aligned rect; returns true when a push happened.
export function pushCircleOutOfRect(px, py, r, rect) {
  const cx = clamp(px, rect.x, rect.x + rect.w);
  const cy = clamp(py, rect.y, rect.y + rect.h);
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r, nx: dx / d, ny: dy / d };
  }
  // Centre inside the rect: push out along the smallest penetration.
  const left = px - rect.x, right = rect.x + rect.w - px;
  const top = py - rect.y, bottom = rect.y + rect.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: py, nx: -1, ny: 0 };
  if (m === right) return { x: rect.x + rect.w + r, y: py, nx: 1, ny: 0 };
  if (m === top) return { x: px, y: rect.y - r, nx: 0, ny: -1 };
  return { x: px, y: rect.y + rect.h + r, nx: 0, ny: 1 };
}
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}
export function formatCash(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
