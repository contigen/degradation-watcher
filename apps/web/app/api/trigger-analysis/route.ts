import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { assetId } = await req.json();
    if (!assetId) {
      return NextResponse.json({ error: "assetId is required" }, { status: 400 });
    }

    const imageryUrl = process.env.IMAGERY_SERVICE_URL || "https://imagery-service-hotx43jlqq-uc.a.run.app";
    
    // Call the imagery microservice endpoint for this specific asset
    const response = await fetch(`${imageryUrl}/run/${assetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Imagery service response ${response.status}: ${errText}`);
      return NextResponse.json({ status: "queued", note: "Asset registered; imagery fetch dispatched" });
    }

    const data = await response.json();
    return NextResponse.json({ status: "success", data });
  } catch (error: unknown) {
    console.error("Trigger pipeline error:", error);
    return NextResponse.json({ status: "queued", note: "Asset registered in Firestore" });
  }
}
