// Seeded PRNG (xoshiro128**). All randomness in the engine goes through this module,
// so a league with the same seed and the same decisions always plays out identically.

export type RngState = [number, number, number, number];

let s: RngState = [1, 2, 3, 4];

function splitmix32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0);
  };
}

export function seedState(seed: number): RngState {
  const sm = splitmix32(seed);
  return [sm(), sm(), sm(), sm()];
}

export function useState_(state: RngState) {
  s = state;
}
export function getState(): RngState {
  return s;
}

export function next(): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9);
  const t = s[1] << 9;
  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  return (result >>> 0) / 4294967296;
}

function rotl(x: number, k: number) {
  return (x << k) | (x >>> (32 - k));
}

export const rand = next;
export const chance = (p: number) => next() < p;
export const int = (a: number, b: number) => a + Math.floor(next() * (b - a + 1));
export const range = (a: number, b: number) => a + next() * (b - a);
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(next() * arr.length)];
}
export function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  let r = next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
export function normal(mean = 0, sd = 1) {
  const u = 1 - next();
  const v = next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function poisson(lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= next();
  } while (p > L);
  return k - 1;
}
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Stable hash-based random in [0,1) for a numeric key — for cosmetic, decision-independent traits. */
export function hash01(key: number, salt = 0) {
  let h = 2166136261 ^ (key * 2654435761) ^ (salt * 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
