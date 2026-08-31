// ============================================================
// Shared domain types — used by all ADK agents
// ============================================================

export type AssetType = "bridge" | "farmland" | "road" | "dam";

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type ActionTier =
  | "monitor"       // Continue watching, no action needed
  | "inspect_soon"  // Schedule inspection within 30 days
  | "urgent";       // Immediate human review required

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ---- Asset Registry ----------------------------------------

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  coordinates: GeoCoordinate;
  bbox: BoundingBox;
  metadata: AssetMetadata;
  monitoring: MonitoringConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AssetMetadata {
  // Infrastructure
  yearBuilt?: number;
  material?: string; // "concrete" | "steel" | "timber" | "masonry"
  lastInspectionRating?: number; // 0-9 FHWA scale
  lastInspectionDate?: string;
  averageDailyTraffic?: number;
  // Agriculture
  cropType?: string;
  fieldAreaHectares?: number;
  soilType?: string;
  irrigationType?: string;
  // Shared
  ownerId?: string; // Municipal authority / farmer
  ownerContact?: string;
  sourceDataset?: string; // "FHWA_NBI" | "OSM" | "USDA_CDL"
  externalId?: string;
}

export interface MonitoringConfig {
  active: boolean;
  frequencyDays: number; // How often to fetch imagery
  alertThreshold: number; // change_severity >= this triggers alert
  notifyEmails: string[];
}

// ---- Imagery Events -----------------------------------------

export interface ImageryReadyEvent {
  assetId: string;
  assetType: AssetType;
  timestamp: string;
  imageUrls: string[]; // GCS URLs for this capture
  ndviMean?: number; // Agriculture only
  ndviDelta?: number; // vs previous capture
  cloudCoverPct: number;
  bandsCaptured: string[]; // e.g. ["B04", "B08", "TCI"]
  captureDate: string;
}

// ---- Visual Analysis (Gemini output) ----------------------

export interface VisualAnalysis {
  changeDetected: boolean;
  changeSeverity: number; // 1-5
  changeRegions: string[];
  changeTypes: ChangeType[];
  confidence: number; // 0.0-1.0
  reasoning: string;
  recommendedAction: ActionTier;
  imageComparisonUrls: string[]; // URLs of images analysed
  analyzedAt: string;
}

export type ChangeType =
  | "cracking"
  | "spalling"
  | "staining"
  | "subsidence"
  | "corrosion"
  | "scour"
  | "vegetation_loss"
  | "crop_stress"
  | "irrigation_failure"
  | "soil_erosion"
  | "discoloration"
  | "structural_deformation";

// ---- Context (NOAA + USGS + Open-Meteo) ------------------

export interface WeatherContext {
  assetId: string;
  periodDays: number;
  totalPrecipitationMm: number;
  maxTemperatureC: number;
  minTemperatureC: number;
  freezeThawCycles: number; // Times crossed 0°C boundary
  extremeEvents: WeatherEvent[];
  soilMoistureMean?: number; // Agriculture
  evapotranspirationMm?: number; // Agriculture
  fetchedAt: string;
}

export interface WeatherEvent {
  date: string;
  type: "heavy_rain" | "freeze" | "heat_wave" | "drought" | "flood";
  severity: "moderate" | "severe" | "extreme";
  description: string;
}

export interface SeismicContext {
  assetId: string;
  periodDays: number;
  eventCount: number;
  maxMagnitude: number;
  events: SeismicEvent[];
  fetchedAt: string;
}

export interface SeismicEvent {
  date: string;
  magnitude: number;
  depth: number;
  distanceKm: number;
  location: string;
}

// ---- Risk Score --------------------------------------------

export interface RiskScore {
  assetId: string;
  compositeScore: number; // 0-100
  riskLevel: RiskLevel;
  velocity: number; // Rate of change vs previous period (-100 to +100)
  components: RiskComponents;
  previousScore?: number;
  projectedCriticalDays?: number; // Days until critical if trend continues
  scoredAt: string;
}

export interface RiskComponents {
  visualChangeScore: number; // 0-40
  weatherStressScore: number; // 0-30
  seismicScore: number; // 0-15
  ageScore: number; // 0-15 (based on asset age vs design life)
}

// ---- Degradation Record (Firestore subcollection) ---------

export interface DegradationRecord {
  id: string;
  assetId: string;
  captureDate: string;
  imageUrls: string[];
  visualAnalysis: VisualAnalysis;
  weatherContext: WeatherContext;
  seismicContext: SeismicContext;
  riskScore: RiskScore;
  createdAt: string;
}

// ---- Alerts ------------------------------------------------

export interface Alert {
  id: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  riskLevel: RiskLevel;
  actionTier: ActionTier;
  riskScore: number;
  changeSeverity: number;
  summary: string;
  report: InspectionReport;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
}

export type AlertStatus = "pending" | "acknowledged" | "resolved" | "dismissed";

export interface InspectionReport {
  title: string;
  assetName: string;
  assetType: AssetType;
  coordinates: GeoCoordinate;
  riskLevel: RiskLevel;
  riskScore: number;
  executiveSummary: string;
  observedChanges: string[];
  contributingFactors: string[];
  recommendedActions: string[];
  urgency: ActionTier;
  beforeImageUrl: string;
  afterImageUrl: string;
  generatedAt: string;
  validUntil: string; // Report expires after 30 days
}

// ---- Pub/Sub message schemas ------------------------------

export interface PubSubMessage<T = unknown> {
  messageId: string;
  publishTime: string;
  data: T;
}

export type ImageryReadyMessage = PubSubMessage<ImageryReadyEvent>;
export type AlertCreatedMessage = PubSubMessage<{ alertId: string; assetId: string }>;
