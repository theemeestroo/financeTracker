export { projectRunway } from "./project-runway";
export { projectDoNothingBaseline } from "./baseline";
export { sensitivityAnalysis } from "./sensitivity";
export type { SensitivityEntry } from "./sensitivity";
export { isAccrualMonth, periodicAccrual, resolveSavingsPrincipal } from "./savings";
export { aggregateAnnualIncomeByMember } from "./annual-income";
export type { AnnualIncomeByMember, AnnualIncomeSource } from "./annual-income";
export { precedingMonthsSeries } from "./preceding-months";
export type {
  ResolvedSeveranceScenario,
  ResolvedRunwayProfile,
  ResolvedIncome,
  ResolvedSavingsRule,
  RunwayPhase,
  RunwayEvent,
  RunwayPoint,
  RunwayLineItem,
  RunwayMonthBreakdown,
  RunwayResult,
  SeveranceStream,
} from "./types";
