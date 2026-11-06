// M1 step (2): exact rational numbers for solve (指示書 第5.2節). No floating point anywhere.
import type { Rational as SchemaRational } from "../schema/common.ts";

/** A rational number in lowest terms with a positive denominator; zero is always 0/1. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function toBig(x: bigint | number, what: string): bigint {
  if (typeof x === "bigint") return x;
  if (!Number.isSafeInteger(x)) throw new RangeError(`rational ${what} must be a safe integer, got ${String(x)}`);
  return BigInt(x);
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Builds a normalized rational. Throws on a zero denominator or a non-integer number. */
export function rat(num: bigint | number, den: bigint | number = 1n): Rational {
  const n = toBig(num, "numerator");
  const d = toBig(den, "denominator");
  if (d === 0n) throw new RangeError("rational denominator must not be zero");
  if (n === 0n) return { num: 0n, den: 1n };
  const g = gcd(n, d);
  const sign = d < 0n ? -1n : 1n;
  return { num: (sign * n) / g, den: (sign * d) / g };
}

export function add(a: Rational, b: Rational): Rational {
  if (a.den === b.den) return rat(a.num + b.num, a.den);
  return rat(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  if (a.den === b.den) return rat(a.num - b.num, a.den);
  return rat(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.num * b.num, a.den * b.den);
}

export function neg(a: Rational): Rational {
  return a.num === 0n ? a : { num: -a.num, den: a.den };
}

export function inv(a: Rational): Rational {
  if (a.num === 0n) throw new RangeError("cannot invert zero");
  return rat(a.den, a.num);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError("division by zero");
  return rat(a.num * b.den, a.den * b.num);
}

/** Negative, zero or positive as a is less than, equal to or greater than b. */
export function cmp(a: Rational, b: Rational): number {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function eq(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

export function isZero(a: Rational): boolean {
  return a.num === 0n;
}

export function isInteger(a: Rational): boolean {
  return a.den === 1n;
}

export function toString(a: Rational): string {
  return a.den === 1n ? a.num.toString() : `${a.num.toString()}/${a.den.toString()}`;
}

/** Reads the schema form {num, den} of plain numbers (common.ts). */
export function fromSchema(r: SchemaRational): Rational {
  return rat(r.num, r.den);
}

/** Writes the schema form; throws when a part does not fit in a safe integer. */
export function toSchema(a: Rational): SchemaRational {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (abs(a.num) > max || a.den > max) throw new RangeError(`rational ${toString(a)} does not fit the schema form`);
  return { num: Number(a.num), den: Number(a.den) };
}
