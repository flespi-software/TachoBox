// Public entry point for the compliance engine. Framework-free and
// dependency-free - analyses EU 561/2006 + 2016/403 over normalized driver
// activity records. Consumers import from here; rule parameters are in ./rules.
export {
  analyzeDayViolations,
  continuousDrivingStretches,
  maxContinuousDriving,
  analyzeDailyDriving,
  analyzeDailyRest,
  analyzeWeeklyRest,
  analyzeWeeklyViolations,
  getDayStatus,
  dayStatusMap,
  detectAnomalies,
  detectUsageErrors,
  placeBufferBoundary,
  crossReference,
} from './violations.js'

export {
  LIMITS,
  SEVERITY,
  SEVERITY_RESIDUAL,
  SEVERITY_DEFAULT,
  RULES_VERSION,
  classifySeverity,
  classifyDailyDriving,
} from './rules.js'
export { explainKey } from './explain.js'
export { MINUTES_IN_DAY, filterDriverChanges } from './activity.js'
