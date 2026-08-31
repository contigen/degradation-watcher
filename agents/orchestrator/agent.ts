import os from "os";
import path from "path";

import { LlmAgent as Agent, FunctionTool as tool, InMemorySessionService, Runner } from "@google/adk";
import { z } from "zod";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { GoogleGenAI } from "@google/genai";
import { Storage } from "@google-cloud/storage";
import express from "express";

const db = new Firestore({ project: process.env.GCP_PROJECT });
const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT });
const storage = new Storage({ projectId: process.env.GCP_PROJECT });

// We must explicitly use the Gemini API endpoint to avoid Vertex AI auth conflict
const globalAi_var = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ============================================================
// Types
// ============================================================

export interface Asset {
  id: string;
  type: "bridge" | "farmland" | "powerline" | "dam";
  geometry: { type: string; coordinates: any[] };
  properties: Record<string, any>;
  monitoring?: {
    cadenceDays: number;
    sensorTypes: string[];
    alertThreshold: number;
  };
}

export type ActionTier = "monitor" | "inspect_soon" | "urgent";

export interface VisualAnalysis {
  changeDetected: boolean;
  changeSeverity: number; // 1-5 scale
  changeRegions: Array<{ type: string; coordinates: any[] }>;
  changeTypes: string[];
  confidence: number;
  reasoning: string;
  recommendedAction: ActionTier;
  imageComparisonUrls: string[];
  analyzedAt: string;
}

export interface DegradationRecord {
  id: string;
  assetId: string;
  captureDate: string;
  imageUrls: string[];
  visualAnalysis: VisualAnalysis;
  createdAt: string;
}

export interface ImageryReadyEvent {
  assetId: string;
  assetType: string;
  timestamp: string;
  imageUrls: string[];
  ndviMean?: number;
  ndviDelta?: number;
  cloudCoverPct: number;
  bandsCaptured: string[];
  captureDate: string;
}

export interface Alert {
  id: string;
  assetId: string;
  riskScore: number;
  changeSeverity: number;
  actionTier: ActionTier;
  status: "pending" | "investigating" | "resolved";
  createdAt: string;
  reportUrl?: string;
}

// ============================================================
// Tools
// ============================================================

const getAssetDetails = new tool({
  name: "get_asset_details",
  description: "Retrieve baseline information and metadata for a specific asset from Firestore.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
  }),
  async execute(input: unknown) {
    const { assetId } = input as { assetId: string }; console.log("Executing getAssetDetails");
    const doc = await db.collection("assets").doc(assetId).get();
    if (!doc.exists) throw new Error(`Asset ${assetId} not found`);
    return doc.data();
  },
});

const getPreviousAnalyses = new tool({
  name: "get_previous_analyses",
  description: "Retrieve the last N degradation records for an asset to establish a baseline for change detection.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    limit: z.number().default(4),
  }),
  async execute(input: unknown) {
    const { assetId, limit = 4 } = input as { assetId: string, limit?: number }; console.log("Executing getPreviousAnalyses");
    const snapshot = await db
      .collection("assets")
      .doc(assetId)
      .collection("degradation_records")
      .orderBy("captureDate", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map((d) => d.data());
  },
});

const triggerContextEnricher = new tool({
  name: "trigger_context_enricher",
  description: "Dispatch a Pub/Sub message to the context-enricher agent to pull weather/news data in parallel.",
  // @ts-ignore
  parameters: z.object({ assetId: z.string(), assetType: z.string().optional(), imageUrls: z.array(z.string()).optional(), captureDate: z.string().optional() }),
  async execute(input: unknown) {
    const { assetId, captureDate } = input as { assetId: string, captureDate?: string };
    console.log("Executing triggerContextEnricher");
    const topic = pubsub.topic(process.env.CONTEXT_ENRICHER_TOPIC || "context-enricher-trigger");
    await topic.publishMessage({ json: { assetId, captureDate } });
    return { dispatched: true };
  },
});

const runGeminiVisualAnalysis = new tool({
  name: "run_gemini_visual_analysis",
  description: "Runs the visual analysis using Gemini 3.5 Flash and writes the degradation record to Firestore.",
  // @ts-ignore
  parameters: z.object({ assetId: z.string(), assetType: z.string().optional(), imageUrls: z.array(z.string()).optional(), captureDate: z.string().optional() }),
  async execute(input: unknown) {
    const { assetId, assetType = "bridge", imageUrls = [], captureDate = "2026-08-25" } = input as { assetId: string, assetType?: string, imageUrls?: string[], captureDate?: string };
    console.log("Running visual analysis with params:", JSON.stringify({ assetId, assetType, imageUrls, captureDate }));

    console.log(`Running visual analysis for ${assetId}...`);

    // Temporal Diffing: Fetch previous capture image
    const prevSnap = await db.collection("assets").doc(assetId).collection("degradation_records").orderBy("captureDate", "desc").limit(1).get();
    if (!prevSnap.empty && prevSnap.docs[0].data().imageUrls) {
      const prevUrl = prevSnap.docs[0].data().imageUrls.find((u: string) => u.endsWith(".png") || u.endsWith(".jpg"));
      if (prevUrl && !imageUrls.includes(prevUrl)) {
        console.log(`Found previous image for temporal diffing: ${prevUrl}`);
        imageUrls.unshift(prevUrl);
      }
    }

    const isAgriculture = assetType === "farmland";
    const analysisPrompt = isAgriculture
      ? `Analyze these recent satellite images of the farmland (${assetId}). Focus on signs of drought, crop stress, and soil degradation. Quantify the severity if possible (from 1 to 5, where 5 is maximum severity). Confidence must be a float between 0.0 and 1.0. ONLY identify features actually visible in the images. Return the response in strict JSON format: { "changeDetected": boolean, "changeSeverity": number, "changeRegions": [], "changeTypes": [], "confidence": number, "reasoning": "string", "recommendedAction": "monitor" | "inspect_soon" | "urgent" }`
      : `Analyze these recent satellite images of the infrastructure (${assetId}). Focus on signs of structural stress, surface cracking, and rust. Quantify the severity if possible. Return the response in strict JSON format: { "changeDetected": boolean, "changeSeverity": number, "changeRegions": [], "changeTypes": [], "confidence": number, "reasoning": "string", "recommendedAction": "monitor" | "inspect_soon" | "urgent" }`;

    let parts: any[] = [];
    
    // Fetch images from GCS and encode to base64
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      if (url.endsWith(".tif")) continue;
      const match = url.match(/^gs:\/\/([^\/]+)\/(.+)$/);
      if (match) {
        const bucket = match[1];
        const file = match[2];
        const tmpPath = path.join(os.tmpdir(), `img_${Date.now()}_${i}.png`);
        await storage.bucket(bucket).file(file).download({ destination: tmpPath });
        
        const uploadResult = await globalAi_var.files.upload({ file: tmpPath, config: { mimeType: "image/png" } });
        
        parts.push({
          fileData: {
            mimeType: "image/png",
            fileUri: uploadResult.uri
          }
        });
      }
    }

    parts.push({ text: analysisPrompt });

    const request = {
      contents: [{ role: "user", parts }],
    };

    let responseText = "{}";
    try {
      const response = await globalAi_var.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });
      responseText = response.text || "{}";
    } catch (e) {
      console.error("Gemini generation failed:", e);
      throw e;
    }

    let parsed: any;
    try {
      const raw = JSON.parse(responseText);
      parsed = {
        changeDetected: Boolean(raw.changeDetected),
        changeSeverity: Math.min(5, Math.max(1, Number(raw.changeSeverity) || 1)),
        changeRegions: Array.isArray(raw.changeRegions) ? raw.changeRegions : [],
        changeTypes: Array.isArray(raw.changeTypes) ? raw.changeTypes : [],
        confidence: Math.min(1.0, Math.max(0.0, Number(raw.confidence) || 0.1)),
        reasoning: String(raw.reasoning) || "",
        recommendedAction: (raw.recommendedAction as ActionTier) || "monitor",
        imageComparisonUrls: imageUrls,
        analyzedAt: new Date().toISOString(),
      };
    } catch {
      // Graceful fallback if JSON parse fails
      parsed = {
        changeDetected: false,
        changeSeverity: 1,
        changeRegions: [],
        changeTypes: [],
        confidence: 0.1,
        reasoning: "Analysis failed to parse — flagging for manual review",
        recommendedAction: "inspect_soon",
        imageComparisonUrls: imageUrls,
        analyzedAt: new Date().toISOString(),
      };
    }

    // Save analysis to degradation record
    const recordRef = db
      .collection("assets")
      .doc(assetId)
      .collection("degradation_records")
      .add({
        assetId,
        captureDate: captureDate,
        imageUrls,
        visualAnalysis: parsed,
        createdAt: new Date().toISOString(),
      });

    const docRef = await recordRef;

    return { ...parsed, degradationRecordId: docRef.id };
  },
});

const triggerRiskScorer = new tool({
  name: "trigger_risk_scorer",
  description: "Dispatch a Pub/Sub message to the risk scorer agent after visual analysis and context enrichment are complete.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    degradationRecordId: z.string(),
  }),
  async execute(input: unknown) {
    const { assetId, degradationRecordId } = input as { assetId: string, degradationRecordId: string }; console.log("Executing a tool");
    const topic = pubsub.topic(process.env.RISK_SCORER_TOPIC || "risk-scorer-trigger");
    await topic.publishMessage({ json: { assetId, degradationRecordId } });
    return { dispatched: true };
  },
});

const checkAlertThreshold = new tool({
  name: "check_alert_threshold",
  description: "Check if the latest risk score for an asset exceeds its configured alert threshold.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    riskScore: z.number(),
    changeSeverity: z.number(),
  }),
  async execute(input: unknown) {
    const { assetId, riskScore, changeSeverity } = input as { assetId: string, riskScore: number, changeSeverity: number };
    const assetDoc = await db.collection("assets").doc(assetId).get();
    const asset = assetDoc.data() as Asset;
    const threshold = asset.monitoring?.alertThreshold ?? 60;
    const shouldAlert = riskScore >= threshold || changeSeverity >= 4;
    return { shouldAlert, threshold, riskScore, changeSeverity };
  },
});

const createAlert = new tool({
  name: "create_alert",
  description: "Create a pending alert in Firestore and dispatch to the response-drafter agent.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    riskScore: z.number(),
    changeSeverity: z.number(),
    actionTier: z.enum(["monitor", "inspect_soon", "urgent"]),
  }),
  async execute(input: unknown) {
    const { assetId, riskScore, changeSeverity, actionTier } = input as { assetId: string, riskScore: number, changeSeverity: number, actionTier: "monitor" | "inspect_soon" | "urgent" };
    const alertRef = db.collection("alerts").doc();
    const alert: Partial<Alert> = {
      id: alertRef.id,
      assetId,
      riskScore,
      changeSeverity,
      actionTier,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await alertRef.set(alert);

    const topic = pubsub.topic(process.env.RESPONSE_DRAFTER_TOPIC || "response-drafter-trigger");
    await topic.publishMessage({ json: { alertId: alertRef.id, assetId } });

    return { alertId: alertRef.id, dispatched: true };
  },
});

const logPipelineEvent = new tool({
  name: "log_pipeline_event",
  description: "Write an audit log entry to Firestore for observability.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    event: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  async execute(input: unknown) {
    const { assetId, event, details } = input as { assetId: string, event: string, details?: Record<string, unknown> };
    await db.collection("pipeline_logs").add({
      assetId,
      event,
      details: details ?? {},
      timestamp: new Date().toISOString(),
    });
    return { logged: true };
  },
});

export const orchestratorAgent = new Agent({
  name: "degradation_orchestrator",
  model: "gemini-3.6-flash",
  description: "Master orchestrator for the Degradation Watcher pipeline. Coordinates the full async workflow.",
  instruction: `
You are the orchestrator agent for Degradation Watcher.

When you receive an imagery_ready event for an asset, execute this pipeline in order:

1. **Retrieve asset details** using get_asset_details
2. **Get previous analyses** (last 4 records) using get_previous_analyses
3. **Dispatch context enrichment** using trigger_context_enricher (runs in parallel — don't wait)
4. **Log the pipeline initiation** using log_pipeline_event
5. **Run Gemini visual analysis** using run_gemini_visual_analysis with all image URLs and asset metadata. This will write the degradation_record to Firestore and return the degradationRecordId. 
6. **Dispatch risk scoring** using trigger_risk_scorer with the returned degradationRecordId.
7. **Check alert threshold** using check_alert_threshold with the resulting risk score
8. **If threshold exceeded**, create an alert using create_alert and log it

Rules:
- CRITICAL: You are an autonomous backend pipeline. Do NOT generate conversational text or wait for user confirmation between steps. You MUST execute all tools required to complete the pipeline in a continuous chain.
- Always log pipeline events for observability
- If cloud cover > 80%, log a skip event and do not proceed with analysis
- Never fabricate data — if a tool fails, log the error and halt gracefully
- CRITICAL: You are an autonomous backend pipeline. Do NOT generate conversational text. Do NOT wait for user confirmation between steps. You MUST execute all tools required to complete the pipeline before finishing.
  `.trim(),

  tools: [
    getAssetDetails,
    getPreviousAnalyses,
    triggerContextEnricher,
    runGeminiVisualAnalysis,
    triggerRiskScorer,
    checkAlertThreshold,
    createAlert,
    logPipelineEvent,
  ],
});

const app = express();
app.use(express.json());

const sessionService = new InMemorySessionService();
const runner = new Runner({
  agent: orchestratorAgent,
  appName: "degradation-orchestrator",
  sessionService,
});

app.post("/pubsub", async (req, res) => {
  try {
    const envelope = req.body;
    const data = Buffer.from(envelope.message.data, "base64").toString("utf-8");
    const event: ImageryReadyEvent = JSON.parse(data);

    if (event.cloudCoverPct > 80) {
      console.log(`Skipping ${event.assetId} — cloud cover ${event.cloudCoverPct}%`);
      return res.status(200).json({ skipped: true });
    }

    console.log(`Orchestrating pipeline for asset: ${event.assetId}`);

    console.log(`Orchestrating pipeline for asset: ${event.assetId}`);

    // Hackathon bypass: execute tools sequentially to bypass ADK parallel tool response hang
    await (getAssetDetails as any).execute({ assetId: event.assetId });
    await (getPreviousAnalyses as any).execute({ assetId: event.assetId, limit: 4 });
    await (triggerContextEnricher as any).execute({ assetId: event.assetId, captureDate: event.captureDate });
    await (logPipelineEvent as any).execute({ assetId: event.assetId, event: 'pipeline_initiated' });

    const visualResult = await (runGeminiVisualAnalysis as any).execute({
      assetId: event.assetId,
      assetType: event.assetType,
      imageUrls: event.imageUrls,
      captureDate: event.captureDate
    });

    const scorerResult = await (triggerRiskScorer as any).execute({
      assetId: event.assetId,
      degradationRecordId: (visualResult as any).degradationRecordId
    });

    await (logPipelineEvent as any).execute({ assetId: event.assetId, event: 'visual_analysis_completed' });

    res.status(200).json({ ok: true, assetId: event.assetId });
  } catch (err) {
    const errorObj = err as any; console.error("Orchestrator error details:", String(err), errorObj.stack); await db.collection("pipeline_logs").add({ assetId: "unknown", event: "pipeline_error", details: { error: String(err), stack: errorObj.stack }, timestamp: new Date().toISOString() });
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8080", 10);
app.listen(PORT, () => console.log(`Orchestrator listening on :${PORT}`));
