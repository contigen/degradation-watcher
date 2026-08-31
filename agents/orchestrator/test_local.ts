import { orchestratorAgent } from "./agent.js";
import { Runner, InMemorySessionService } from "@google/adk";

async function test() {
  const sessionService = new InMemorySessionService();
  const runner = new Runner({
    agent: orchestratorAgent,
    appName: "test",
    sessionService,
  });
  
  const session = await sessionService.createSession({ appName: "test", userId: "test" });
  
  const prompt = `
Process this imagery_ready event:
{
  "assetId": "bridge_pittsburgh_fort_pitt",
  "assetType": "bridge",
  "timestamp": "2026-08-28T22:00:00Z",
  "imageUrls": [
    "file:///Users/macbook/.gemini/antigravity/brain/2a52b2a3-effa-45d8-ab15-a54b4ea71400/.user_uploaded/media_1787954016463.png"
  ],
  "cloudCoverPct": 58.5,
  "bandsCaptured": [
    "visual"
  ],
  "captureDate": "2026-08-25"
}

Execute the full pipeline for asset bridge_pittsburgh_fort_pitt.
Images captured: 2026-08-25
Cloud cover: 58.5%
Image URLs: file:///Users/macbook/.gemini/antigravity/brain/2a52b2a3-effa-45d8-ab15-a54b4ea71400/.user_uploaded/media_1787954016463.png
  `.trim();

  console.log("Starting local run...");
  try {
    for await (const chunk of runner.runAsync({
      sessionId: session.id,
      userId: "test",
      newMessage: { role: "user", parts: [{ text: prompt }] },
    })) {
      if (chunk.content?.parts) {
        for (const part of chunk.content.parts) {
          if (part.text) console.log("[orchestrator]", part.text);
        }
      }
    }
    console.log("Run finished successfully.");
  } catch (error) {
    console.error("Run crashed with error:", error);
  }
}

test().catch(console.error);
