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
export { canonicalWorld, sameBuild, sameStructure } from "./world/canonical.ts";
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
export { runRule, type Hypothesis } from "./rules/run.ts";
export { sameReading } from "./rules/same-reading.ts";
export { groupHypotheses, reproduction, scoreRule, type Observation, type Reproduction } from "./rules/score.ts";
export { predict, type Prediction } from "./rules/predict.ts";
export {
  CONFIRM_OBSERVATIONS,
  CONFIRM_WEIGHT,
  EPSILON_AGREEMENT,
  EPSILON_CONSTRUCTIVE,
  REVERT_WEIGHT,
  addHypothesis,
  agreementLikelihoods,
  constructiveLikelihoods,
  infoGain,
  mergeHypotheses,
  status,
  update,
  type Weights,
} from "./rules/weights.ts";
export {
  TEMPLATES,
  TEMPLATE_KEYS,
  holderName,
  itemName,
  problemNumber,
  render,
  transcript,
  type Lang,
  type Slot,
  type SlotKind,
  type SlotValues,
  type TemplateKey,
} from "./i18n/index.ts";
export { UI_READINGS, readingsFor, rubySegments, rubyTokens, spokenText, type Readings, type RubySegment } from "./i18n/furigana.ts";
export { parseRestated, restate, type RestatedSentence } from "./restate/index.ts";
export { hasChildText, redactExplanation, redactInterpretation } from "./redact/index.ts";
export {
  CARD_RULE_IDS,
  CARD_RULES,
  COMMON_FRACTION_READINGS,
  COMMON_MISREADINGS,
  CORRECT_READING_ID,
  GAIN_THRESHOLD,
  OTHER,
  POOL_MAX,
  cardFailing,
  cardFits,
  cardSlot,
  chooseNext,
  initialState,
  kohaiReading,
  observe,
  observeAgreement,
  readingCard,
  revisePool,
  ensurePool,
  supportedBy,
  type AgreementObservation,
  type Choice,
  type FirstReading,
  type KohaiReading,
  type PoolEdit,
  type PoolEntry,
  type ResearchState,
  type Revision,
  TRANSFER_CUES,
  wordingCues,
  wordingTag,
  type WordingCueId,
  type WordingTag,
} from "./research/index.ts";
export { FRACTION_BANK } from "../fixtures/problems/fraction-bank.ts";
export { judgeAnswer, judgeUnitValue } from "./answers/index.ts";
export {
  SCENE_MATERIALS,
  SCENE_MATERIAL_IDS,
  checkScene,
  checkScenePair,
  choiceOf,
  isScene,
  pickScenes,
  sceneAvoidValues,
  sceneProposal,
  viewScene,
  type CheckedScene,
  type Scene,
  type SceneCheck,
  type SceneChoice,
  type SceneFrame,
  type SceneMaterial,
  type SceneMaterialId,
  type SceneNumbers,
  type ScenePair,
  type SceneProposal,
  type SceneRefusal,
  type SceneShape,
  type SceneSpec,
  type SceneTape,
  type SceneView,
} from "./scenes/index.ts";
