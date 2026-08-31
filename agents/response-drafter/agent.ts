
import { LlmAgent as Agent, FunctionTool as tool, InMemorySessionService, Runner } from "@google/adk";
import { z } from "zod";
import { Firestore } from "@google-cloud/firestore";
import { VertexAI } from "@google-cloud/vertexai";
import type {
  Asset,
  Alert,
  InspectionReport,
  DegradationRecord,
  RiskScore,
  VisualAnalysis,
  ActionTier,
  RiskLevel,
} from "./types.js";

const db = new Firestore({ projectId: process.env.GCP_PROJECT });
const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT!,
  location: process.env.GCP_REGION ?? "us-central1",
});

// ============================================================
// Gemini Multi-Image Visual Analyst (called as a tool)
// ============================================================

const runGeminiVisualAnalysis = new tool({
  name: "run_gemini_visual_analysis",
  description:
    "Run Gemini 2.0 Flash multimodal analysis on sequential satellite images of an asset. Detects changes in surface condition, vegetation health, or structural integrity across time.",
  parameters: z.object({
    assetId: z.string(),
    assetType: z.string(),
    assetName: z.string(),
    yearBuilt: z.number().nullable(),
    material: z.string().nullable(),
    lastInspectionRating: z.number().nullable(),
    imageUrls: z.array(z.string()).describe("GCS URLs of sequential satellite images, oldest first"),
    captureDates: z.array(z.string()).describe("ISO dates corresponding to each image URL"),
    previousSeverity: z.number().nullable().describe("Severity from last analysis, for baseline"),
  }),
  async execute({
    assetId,
    assetType,
    assetName,
    yearBuilt,
    material,
    lastInspectionRating,
    imageUrls,
    captureDates,
    previousSeverity,
  }: any) {
    const model = vertexAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const isAgriculture = assetType === "farmland";

    // Build the content array: interleaved images + metadata
    const imageParts = imageUrls.map((url, i) => ({
      inlineData: {
        // In production: fetch from GCS and base64 encode
        // For demo: pass GCS URL directly via Vertex AI's fileData
        fileData: {
          mimeType: "image/png",
          fileUri: url,
        },
        date: captureDates[i],
      },
    }));

    const systemPrompt = isAgriculture
      ? `You are an expert agronomist and remote sensing analyst specialising in crop health and soil degradation detection from satellite imagery.`
      : `You are an expert structural engineer and remote sensing analyst specialising in infrastructure degradation detection from satellite imagery.`;

    const analysisPrompt = `
${systemPrompt}

You are analysing ${imageUrls.length} sequential satellite images of the same asset captured over time.

Asset information:
- Name: ${assetName}
- Type: ${assetType}
- Year built: ${yearBuilt ?? "unknown"}
- Material: ${material ?? "unknown"}
- Last inspection rating: ${lastInspectionRating ?? "unknown"}/9 (FHWA scale)
- Previous degradation severity: ${previousSeverity ?? "no baseline"}

Image capture dates (in order): ${captureDates.join(", ")}

${isAgriculture ? `
Focus on:
- Vegetation health changes (colour, density, uniformity)
- NDVI visual indicators (browning, yellowing, die-off patterns)
- Irrigation failure signs (irregular dry patches, edge die-off)
- Soil erosion indicators (bare soil exposure, gully formation)
- Waterlogging signs (persistent dark wet areas, ponding)
` : `
Focus on:
- Surface crack development (new cracks, existing crack propagation)
- Spalling or concrete deterioration (surface texture changes)
- Water staining or efflorescence (rust streaks, calcium deposits)
- Geometric deformation (sagging, misalignment, settlement)
- Scour or erosion at foundations
- Vegetation encroachment (roots damaging structure)
`}

Compare the images temporally. The MOST RECENT image is what matters — compare it against the earliest.

Return ONLY valid JSON matching this exact schema:
{
  "changeDetected": boolean,
  "changeSeverity": integer 1-5,
  "changeRegions": string[],
  "changeTypes": string[],
  "confidence": number 0.0-1.0,
  "reasoning": "plain English, 2-3 sentences, specific about what changed where",
  "recommendedAction": "monitor" | "inspect_soon" | "urgent",
  "temporalProgression": "stable" | "slowly_degrading" | "rapidly_degrading" | "improving"
}

changeSeverity scale:
1 = No meaningful change from baseline
2 = Minor changes, within normal variation
3 = Moderate change requiring attention
4 = Significant degradation, inspection warranted
5 = Severe / critical degradation, urgent action needed
`.trim();

    const request = {
      contents: [
        {
          role: "user" as const,
          parts: [
            // Include the image parts
            ...imageUrls.map((url, i) => ({
              fileData: {
                mimeType: "image/png",
                fileUri: url,
              },
            })),
            { text: analysisPrompt },
          ],
        },
      ],
    };

    const result = await model.generateContent(request);
    const responseText =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: VisualAnalysis;
    try {
      const raw = JSON.parse(responseText);
      parsed = {
        changeDetected: Boolean(raw.changeDetected),
        changeSeverity: Number(raw.changeSeverity) || 1,
        changeRegions: Array.isArray(raw.changeRegions) ? raw.changeRegions : [],
        changeTypes: Array.isArray(raw.changeTypes) ? raw.changeTypes : [],
        confidence: Number(raw.confidence) || 0.5,
        reasoning: String(raw.reasoning || ""),
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
        captureDate: captureDates[captureDates.length - 1],
        imageUrls,
        visualAnalysis: parsed,
        createdAt: new Date().toISOString(),
      });

    const docRef = await recordRef;

    return { ...parsed, degradationRecordId: docRef.id };
  },
});

// ============================================================
// Report drafting tools
// ============================================================

const fetchAlertDetails = new tool({
  name: "fetch_alert_details",
  description: "Fetch all data needed to draft an inspection report for a given alert.",
  parameters: z.object({ alertId: z.string(), assetId: z.string() }),
  async execute({ alertId, assetId }: any) {
    const [alertDoc, assetDoc, latestRecordSnap] = await Promise.all([
      db.collection("alerts").doc(alertId).get(),
      db.collection("assets").doc(assetId).get(),
      db
        .collection("assets")
        .doc(assetId)
        .collection("degradation_records")
        .orderBy("captureDate", "desc")
        .limit(1)
        .get(),
    ]);

    const alert = alertDoc.data() as Alert;
    const asset = assetDoc.data() as Asset;
    const latestRecord = latestRecordSnap.empty
      ? null
      : (latestRecordSnap.docs[0].data() as DegradationRecord);

    return { alert, asset, latestRecord };
  },
});

const draftInspectionReport = new tool({
  name: "draft_inspection_report",
  description:
    "Generate a structured inspection report using Gemini, combining visual analysis, context, and risk score into a clear brief for the relevant authority.",
  parameters: z.object({
    assetId: z.string(),
    assetName: z.string(),
    assetType: z.string(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }),
    riskLevel: z.string(),
    riskScore: z.number(),
    changeSeverity: z.number(),
    changeTypes: z.array(z.string()),
    reasoning: z.string(),
    weatherSummary: z.string(),
    seismicSummary: z.string(),
    beforeImageUrl: z.string(),
    afterImageUrl: z.string(),
    actionTier: z.string(),
  }),
  async execute(params: any) {
    const model = vertexAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });

    const prompt = `
You are a professional infrastructure/agricultural inspection report writer.
Generate a clear, professional inspection report brief for a municipal engineer or agronomist.

Asset: ${params.assetName} (${params.assetType})
Risk Level: ${params.riskLevel.toUpperCase()} (Score: ${params.riskScore}/100)
Change Severity: ${params.changeSeverity}/5
Change Types: ${params.changeTypes.join(", ")}

Visual Analysis Finding: ${params.reasoning}
Weather Context: ${params.weatherSummary}
Seismic Context: ${params.seismicSummary}
Action Required: ${params.actionTier}

Return ONLY valid JSON:
{
  "title": "string — report title",
  "executiveSummary": "string — 2-3 sentence summary for a non-technical reader",
  "observedChanges": ["string array — specific observed changes"],
  "contributingFactors": ["string array — weather, seismic, age factors"],
  "recommendedActions": ["string array — specific actionable steps"],
  "urgency": "${params.actionTier}"
}
`.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const raw = JSON.parse(text);

    const report: InspectionReport = {
      title: raw.title ?? `Degradation Alert — ${params.assetName}`,
      assetName: params.assetName,
      assetType: params.assetType as Asset["type"],
      coordinates: params.coordinates,
      riskLevel: params.riskLevel as RiskLevel,
      riskScore: params.riskScore,
      executiveSummary: raw.executiveSummary ?? "",
      observedChanges: raw.observedChanges ?? [],
      contributingFactors: raw.contributingFactors ?? [],
      recommendedActions: raw.recommendedActions ?? [],
      urgency: params.actionTier as ActionTier,
      beforeImageUrl: params.beforeImageUrl,
      afterImageUrl: params.afterImageUrl,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    return report;
  },
});

const saveAlertWithReport = new tool({
  name: "save_alert_with_report",
  description: "Update the alert document in Firestore with the completed inspection report.",
  parameters: z.object({
    alertId: z.string(),
    assetId: z.string(),
    assetName: z.string(),
    assetType: z.string(),
    riskLevel: z.string(),
    actionTier: z.string(),
    riskScore: z.number(),
    changeSeverity: z.number(),
    summary: z.string(),
    report: z.record(z.unknown()),
  }),
  async execute({ alertId, report, summary, ...rest }: any) {
    await db
      .collection("alerts")
      .doc(alertId)
      .set(
        {
          ...rest,
          summary,
          report,
          status: "pending",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    return { saved: true, alertId };
  },
});

// ============================================================
// Response Drafter Agent
// ============================================================

export const responseDrafterAgent = new Agent({
  name: "response_drafter",
  model: "gemini-3.5-flash",
  description:
    "Drafts structured inspection reports for high-risk assets by combining visual analysis, context data, and risk scores into actionable briefs for municipal engineers and agronomists.",

  instruction: `
You are the Response Drafter agent for Degradation Watcher.

When given an alert ID and asset ID:
1. Fetch all alert details using fetch_alert_details
2. Draft an inspection report using draft_inspection_report, extracting the required fields from the fetched data
3. Save the completed alert with its report using save_alert_with_report

Report quality standards:
- Executive summary must be understandable by a non-technical city official
- Observed changes must be specific — reference location, type, and severity
- Recommended actions must be concrete — name the type of inspection, who should do it
- Never exaggerate risk beyond what the data supports
- Never downplay risk that the data clearly shows

Tone: professional, factual, urgent where warranted.
The report will be read by engineers and government officials making real decisions.
Accuracy is paramount.
  `.trim(),

  tools: [fetchAlertDetails, draftInspectionReport, saveAlertWithReport],
});

// ============================================================
// Cloud Run entry point
// ============================================================

import express from "express";

const app = express();
app.use(express.json());

const sessionService = new InMemorySessionService();
const runner = new Runner({
  agent: responseDrafterAgent,
  appName: "response-drafter",
  sessionService,
});

// Also expose the Gemini Analyst endpoint separately
// (called by orchestrator for visual analysis)
app.post("/analyse", async (req, res) => {
  try {
    const payload = req.body;
    const session = await sessionService.createSession({
      appName: "response-drafter",
      userId: "system",
    });

    const prompt = `Run Gemini visual analysis for asset ${payload.assetId} with ${payload.imageUrls?.length} images.
Asset type: ${payload.assetType}
Asset name: ${payload.assetName}
Year built: ${payload.yearBuilt}
Material: ${payload.material}
Last inspection rating: ${payload.lastInspectionRating}
Image URLs: ${JSON.stringify(payload.imageUrls)}
Capture dates: ${JSON.stringify(payload.captureDates)}
Previous severity: ${payload.previousSeverity}

Use run_gemini_visual_analysis to analyse these images.`;

    let result: Record<string, unknown> = {};
    for await (const chunk of runner.runAsync({
      sessionId: session.id,
      userId: "system",
      newMessage: { role: "user", parts: [{ text: prompt }] },
    })) {
      if (chunk.content?.parts) {
        for (const part of chunk.content.parts) {
          if (part.text) {
            try { result = JSON.parse(part.text); } catch { /* text output */ }
            console.log("[response-drafter/analyse]", part.text.slice(0, 200));
          }
        }
      }
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("Analyst error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/pubsub", async (req, res) => {
  try {
    const data = Buffer.from(req.body.message.data, "base64").toString("utf-8");
    const payload = JSON.parse(data) as { alertId: string; assetId: string };

    const session = await sessionService.createSession({
      appName: "response-drafter",
      userId: "system",
    });

    const prompt = `Draft inspection report for alert ${payload.alertId}, asset ${payload.assetId}`;

    for await (const chunk of runner.runAsync({
      sessionId: session.id,
      userId: "system",
      newMessage: { role: "user", parts: [{ text: prompt }] },
    })) {
      if (chunk.content?.parts) {
        for (const part of chunk.content.parts) {
          if (part.text) console.log("[response-drafter]", part.text.slice(0, 200));
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Response drafter error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8083", 10);
app.listen(PORT, () => console.log(`Response drafter listening on :${PORT}`));
