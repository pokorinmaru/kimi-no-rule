// M2: the numbers the eval tables show (指示書 第10節): Wilson intervals for match rates, a one-sided
// Clopper-Pearson upper bound for missed distress, and nearest-rank percentiles for latency.

function checkCounts(k: number, n: number): void {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new Error(`bad counts ${k}/${n}`);
}

/** The Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.96): { low: number; high: number } {
  checkCounts(k, n);
  if (n === 0) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** log of the binomial coefficient, by sums of logs (n is at most a few thousand here). */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** P(X <= k) for X ~ Binomial(n, p). */
function binomCdf(k: number, n: number, p: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}

/**
 * The one-sided upper confidence bound for a rate after k events in n trials: the p at which seeing k or
 * fewer has probability alpha. Found by bisection; k = n gives 1, k = 0 gives 1 - alpha^(1/n).
 */
export function clopperPearsonUpper(k: number, n: number, alpha = 0.05): number {
  checkCounts(k, n);
  if (n === 0) throw new Error("no trials");
  if (!(alpha > 0 && alpha < 1)) throw new Error(`bad alpha ${alpha}`);
  if (k === n) return 1;
  if (k === 0) return 1 - Math.pow(alpha, 1 / n);
  let lo = k / n;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (binomCdf(k, n, mid) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function checkList(xs: readonly number[]): number[] {
  if (xs.length === 0) throw new Error("no values");
  if (xs.some((x) => !Number.isFinite(x))) throw new Error("values must be finite numbers");
  return [...xs].sort((a, b) => a - b);
}

/** The nearest-rank percentile (p in [0, 100]; 0 gives the smallest value). */
export function percentile(xs: readonly number[], p: number): number {
  if (!(p >= 0 && p <= 100)) throw new Error(`bad percentile ${p}`);
  const s = checkList(xs);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] as number;
}

/** The median (the mean of the two middle values for an even count). */
export function median(xs: readonly number[]): number {
  const s = checkList(xs);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
