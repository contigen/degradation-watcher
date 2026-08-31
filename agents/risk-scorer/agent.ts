import { LlmAgent as Agent, FunctionTool as tool, InMemorySessionService, Runner } from "@google/adk";
import { z } from "zod";
import { Firestore } from "@google-cloud/firestore";
import type {
  Asset,
  DegradationRecord,
  RiskScore,
  RiskComponents,
  RiskLevel,
  VisualAnalysis,
  WeatherContext,
  SeismicContext,
} from "./types.js";

const db = new Firestore({ projectId: process.env.GCP_PROJECT });

// ============================================================
// Tools
// ============================================================

const fetchScoringInputs = new tool({
  name: "fetch_scoring_inputs",
  description:
    "Fetch all inputs needed for risk scoring: asset metadata, latest visual analysis, pending weather/seismic context, and previous risk score for velocity calculation.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    degradationRecordId: z.string(),
  }),
  async execute({ assetId, degradationRecordId }: any) {
    const [assetDoc, recordDoc, contextDoc, prevScoreSnap] = await Promise.all([
      db.collection("assets").doc(assetId).get(),
      db
        .collection("assets")
        .doc(assetId)
        .collection("degradation_records")
        .doc(degradationRecordId)
        .get(),
      db
        .collection("assets")
        .doc(assetId)
        .collection("pending_context")
        .doc("latest")
        .get(),
      db
        .collection("risk_scores")
        .where("assetId", "==", assetId)
        // .orderBy("scoredAt", "desc")
        // .limit(1)
        .get(),
    ]);

    const asset = assetDoc.data() as Asset;
    const record = recordDoc.data() as DegradationRecord;
    const context = contextDoc.data() as {
      weatherContext: WeatherContext;
      seismicContext: SeismicContext;
    } | undefined;
    const prevScore = prevScoreSnap.empty
      ? null
      : (prevScoreSnap.docs[0].data() as RiskScore);

    return {
      asset,
      visualAnalysis: record?.visualAnalysis ?? null,
      weatherContext: context?.weatherContext ?? null,
      seismicContext: context?.seismicContext ?? null,
      previousRiskScore: prevScore,
    };
  },
});

const computeRiskScore = new tool({
  name: "compute_risk_score",
  description:
    "Compute composite risk score (0-100) from visual analysis, weather stress, seismic activity, and asset age. Returns score breakdown and risk level.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    assetType: z.string(),
    yearBuilt: z.number().nullable(),
    lastInspectionRating: z.number().nullable(),
    visualChangeSeverity: z.number().describe("1-5 from Gemini analyst"),
    visualChangeConfidence: z.number().describe("0.0-1.0"),
    freezeThawCycles: z.number(),
    extremeEventCount: z.number(),
    seismicMaxMagnitude: z.number(),
    seismicEventCount: z.number(),
    previousCompositeScore: z.number().nullable(),
  }),
  async execute({
    assetId,
    yearBuilt,
    lastInspectionRating,
    visualChangeSeverity,
    visualChangeConfidence,
    freezeThawCycles,
    extremeEventCount,
    seismicMaxMagnitude,
    seismicEventCount,
    previousCompositeScore,
  }: any) {
    // --- Visual Change Score (0-40) ---
    // Severity 1-5 mapped to 0-40, weighted by confidence
    const rawVisual = ((visualChangeSeverity - 1) / 4) * 40;
    const visualChangeScore = Math.round(rawVisual * visualChangeConfidence);

    // --- Weather Stress Score (0-30) ---
    // Freeze-thaw cycles: >20 in 90 days = maxed
    const ftScore = Math.min((freezeThawCycles / 20) * 15, 15);
    // Extreme events: >5 = maxed
    const evtScore = Math.min((extremeEventCount / 5) * 15, 15);
    const weatherStressScore = Math.round(ftScore + evtScore);

    // --- Seismic Score (0-15) ---
    // M3.5+ is structurally relevant for aging infrastructure
    const seismicMagScore = Math.min((Math.max(0, seismicMaxMagnitude - 2.0) / 4.0) * 10, 10);
    const seismicFreqScore = Math.min((seismicEventCount / 10) * 5, 5);
    const seismicScore = Math.round(seismicMagScore + seismicFreqScore);

    // --- Age Score (0-15) ---
    // Design life: bridges ~75 years, farmland N/A
    let ageScore = 0;
    if (yearBuilt !== null) {
      const age = new Date().getFullYear() - yearBuilt;
      const designLife = 75;
      const ageFraction = Math.min(age / designLife, 1.5); // can exceed 100% of design life
      ageScore = Math.round(ageFraction * 10);
      // Last inspection penalty: rating < 5 adds up to 5 points
      if (lastInspectionRating !== null && lastInspectionRating < 5) {
        ageScore += Math.round(((5 - lastInspectionRating) / 5) * 5);
      }
      ageScore = Math.min(ageScore, 15);
    }

    const components: RiskComponents = {
      visualChangeScore,
      weatherStressScore,
      seismicScore,
      ageScore,
    };

    const compositeScore = Math.min(
      visualChangeScore + weatherStressScore + seismicScore + ageScore,
      100
    );

    // --- Risk Level ---
    let riskLevel: RiskLevel;
    if (compositeScore >= 75) riskLevel = "critical";
    else if (compositeScore >= 55) riskLevel = "high";
    else if (compositeScore >= 35) riskLevel = "moderate";
    else riskLevel = "low";

    // --- Velocity (rate of change vs previous) ---
    const velocity =
      previousCompositeScore !== null
        ? Math.round(compositeScore - previousCompositeScore)
        : 0;

    // --- Projected days to critical ---
    let projectedCriticalDays: number | undefined;
    if (velocity > 0 && compositeScore < 75) {
      projectedCriticalDays = Math.round((75 - compositeScore) / velocity) * 30; // approximate
    }

    return {
      assetId,
      compositeScore,
      riskLevel,
      velocity,
      components,
      previousScore: previousCompositeScore ?? undefined,
      projectedCriticalDays,
      scoredAt: new Date().toISOString(),
    } satisfies RiskScore;
  },
});

const saveRiskScore = new tool({
  name: "save_risk_score",
  description:
    "Persist the computed risk score to Firestore in both the asset's subcollection and the global risk_scores collection.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    degradationRecordId: z.string(),
    riskScore: z.record(z.unknown()),
  }),
  async execute({ assetId, degradationRecordId, riskScore }: any) {
    const batch = db.batch();

    // Global risk scores collection (for dashboard queries)
    const globalRef = db.collection("risk_scores").doc();
    batch.set(globalRef, JSON.parse(JSON.stringify({ ...riskScore, id: globalRef.id })));

    // Update the degradation record with the score
    const recordRef = db
      .collection("assets")
      .doc(assetId)
      .collection("degradation_records")
      .doc(degradationRecordId);
    batch.update(recordRef, { riskScore: JSON.parse(JSON.stringify(riskScore)) });

    // Update asset's current risk summary for map display
    const assetRef = db.collection("assets").doc(assetId);
    batch.update(assetRef, {
      "currentRisk.score": (riskScore as RiskScore).compositeScore,
      "currentRisk.level": (riskScore as RiskScore).riskLevel,
      "currentRisk.velocity": (riskScore as RiskScore).velocity,
      "currentRisk.updatedAt": new Date().toISOString(),
    });

    await batch.commit();
    return { saved: true, scoreId: globalRef.id };
  },
});

const publishRiskResult = new tool({
  name: "publish_risk_result",
  description:
    "Publish the final risk score result back to the orchestrator via Pub/Sub so it can decide whether to create an alert.",
  // @ts-ignore
  parameters: z.object({
    assetId: z.string(),
    degradationRecordId: z.string(),
    compositeScore: z.number(),
    riskLevel: z.string(),
    changeSeverity: z.number(),
    actionTier: z.string(),
  }),
  async execute(params: any) {
    const { PubSub } = await import("@google-cloud/pubsub");
    const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT });
    const topic = pubsub.topic(process.env.RISK_RESULT_TOPIC!);
    await topic.publishMessage({ json: params });
    return { published: true };
  },
});

// ============================================================
// Risk Scorer Agent
// ============================================================

export const riskScorerAgent = new Agent({
  name: "risk_scorer",
  model: "gemini-3.5-flash",
  description:
    "Computes composite degradation risk scores by combining visual change analysis, weather stress, seismic activity, and asset age into a single 0-100 score with velocity tracking.",

  instruction: `
You are the Risk Scorer agent for Degradation Watcher.

When given an asset ID and degradation record ID:

1. Fetch all scoring inputs using fetch_scoring_inputs
2. Extract the required parameters from the inputs and compute the risk score using compute_risk_score
3. Save the risk score using save_risk_score
4. Publish the result using publish_risk_result so the orchestrator can decide on alerts

Score interpretation:
- 0-34: LOW — routine monitoring continues
- 35-54: MODERATE — schedule inspection within 90 days
- 55-74: HIGH — schedule inspection within 30 days (action_tier: inspect_soon)
- 75-100: CRITICAL — immediate attention required (action_tier: urgent)

Velocity matters: if compositeScore increased by >15 points since last measurement,
escalate the action_tier by one level (e.g. moderate → inspect_soon).

If visual analysis was not available (changeDetected = false with confidence < 0.5),
use only weather, seismic, and age components for the score.

Be precise with numbers. Every scoring decision is documented.
  `.trim(),

  tools: [fetchScoringInputs, computeRiskScore, saveRiskScore, publishRiskResult],
});

// ============================================================
// Cloud Run entry point
// ============================================================

import express from "express";

const app = express();
app.use(express.json());

const sessionService = new InMemorySessionService();
const runner = new Runner({
  agent: riskScorerAgent,
  appName: "risk-scorer",
  sessionService,
});

app.post("/pubsub", async (req: express.Request, res: express.Response) => {
  try {
    const data = Buffer.from(req.body.message.data, "base64").toString("utf-8");
    const payload = JSON.parse(data) as {
      assetId: string;
      degradationRecordId: string;
    };

    // Hackathon bypass: execute tools sequentially to avoid ADK hang
    const inputs = await (fetchScoringInputs as any).execute(payload);
    const scoreResult = await (computeRiskScore as any).execute({
      assetId: payload.assetId,
      assetType: inputs.asset.type,
      yearBuilt: inputs.asset.metadata?.yearBuilt ?? null,
      lastInspectionRating: inputs.asset.metadata?.lastInspectionRating ?? null,
      visualChangeSeverity: inputs.visualAnalysis?.changeSeverity ?? 1,
      visualChangeConfidence: inputs.visualAnalysis?.confidence ?? 0.0,
      freezeThawCycles: inputs.weatherContext?.freezeThawCycles ?? 0,
      extremeEventCount: inputs.weatherContext?.extremeEventCount ?? 0,
      seismicMaxMagnitude: inputs.seismicContext?.maxMagnitude ?? 0,
      seismicEventCount: inputs.seismicContext?.eventCount ?? 0,
      previousCompositeScore: inputs.previousRiskScore?.compositeScore ?? null
    });
    await (saveRiskScore as any).execute({ ...payload, riskScore: scoreResult });
    await (publishRiskResult as any).execute({
      assetId: payload.assetId,
      degradationRecordId: payload.degradationRecordId,
      compositeScore: scoreResult.compositeScore,
      riskLevel: scoreResult.riskLevel,
      changeSeverity: inputs.visualAnalysis?.changeSeverity ?? 1,
      actionTier: scoreResult.riskLevel === 'critical' ? 'urgent' : (scoreResult.riskLevel === 'high' ? 'inspect_soon' : 'monitor')
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Risk scorer error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (_req: express.Request, res: express.Response) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8082", 10);
app.listen(PORT, () => console.log(`Risk scorer listening on :${PORT}`));
