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
export {
  MAX_VALUE_UTTERANCES,
  apply,
  type ApplyInput,
  type ApplyResult,
  type Resolution,
} from "./apply/index.ts";
export {
  checkStatements,
  type CheckInput,
  type CheckResult,
  type ReasonCue,
  type StatementCheck,
  type StatementVerdict,
} from "./statements/index.ts";
export {
  gate,
  isVerified,
  numbersIn,
  verifiedCorrectWorld,
  verifiedDrawWorld,
  type Action,
  type GateContext,
  type GateReason,
  type GateResult,
  type Verified,
} from "./gates/index.ts";
export { sameWorld } from "./world/same-world.ts";
export {
  LAYER_ORDER,
  diagnose,
  misreadCandidates,
  problemConditions,
  type Candidate,
  type ConditionFailure,
  type DiagnoseInput,
  type Diagnosis,
  type FlipKind,
  type Layer,
  type Outcome,
} from "./diagnose/index.ts";
