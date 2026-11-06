/** packages/core: the only place that decides numbers and world correctness. */
export const PACKAGE = "@kimi/core";

export * from "./schema/index.ts";
// The schema form of a rational is exported above as Rational; the exact bigint form is ExactRational.
export {
  add,
  cmp,
  div,
  eq,
  fromSchema,
  inv,
  isInteger,
  isZero,
  mul,
  neg,
  rat,
  sub,
  toSchema,
  toString,
  type Rational as ExactRational,
} from "./rational/index.ts";
export {
  MAX_CONFLICT_SOURCES,
  solve,
  withoutConstraints,
  type ImpossibleMark,
  type ImpossibleReason,
  type SolveResult,
} from "./solve/index.ts";
