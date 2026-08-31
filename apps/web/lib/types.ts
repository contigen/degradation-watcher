// Re-export all shared domain types for use in the web app
export type {
  Asset,
  AssetType,
  AssetMetadata,
  MonitoringConfig,
  GeoCoordinate,
  BoundingBox,
  RiskLevel,
  ActionTier,
  RiskScore,
  RiskComponents,
  Alert,
  AlertStatus,
  InspectionReport,
  DegradationRecord,
  VisualAnalysis,
  ChangeType,
  WeatherContext,
  SeismicContext,
  WeatherEvent,
  SeismicEvent,
  ImageryReadyEvent,
} from "../../agents/orchestrator/types.js";

// UI-specific helpers
export const RISK_COLORS: Record<string, string> = {
  low: "#22c55e",       // green-500
  moderate: "#f59e0b",  // amber-500
  high: "#f97316",      // orange-500
  critical: "#ef4444",  // red-500
};

export const RISK_BG: Record<string, string> = {
  low: "#dcfce7",
  moderate: "#fef3c7",
  high: "#ffedd5",
  critical: "#fee2e2",
};

export const ACTION_LABELS: Record<string, string> = {
  monitor: "Continue monitoring",
  inspect_soon: "Schedule inspection",
  urgent: "Urgent — immediate action",
};
