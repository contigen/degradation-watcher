// @ts-nocheck
import { LlmAgent as Agent, FunctionTool as tool, InMemorySessionService, Runner } from "@google/adk";
import { z } from "zod";
import { Firestore } from "@google-cloud/firestore";
import type { WeatherContext, SeismicContext, WeatherEvent } from "./types.js";

const db = new Firestore({ projectId: process.env.GCP_PROJECT });

// ============================================================
// Tools
// ============================================================

const fetchWeatherContext = new tool({
  name: "fetch_weather_context",
  description:
    "Fetch historical weather data from NOAA CDO API and Open-Meteo for a location over a given period. Returns precipitation totals, temperature extremes, freeze-thaw cycles, and notable weather events.",
  parameters: z.object({
    assetId: z.string(),
    lat: z.number(),
    lng: z.number(),
    periodDays: z.number().default(90),
  }),
  async execute({ assetId, lat, lng, periodDays }) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // Open-Meteo historical archive — no auth required
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("start_date", fmt(startDate));
    url.searchParams.set("end_date", fmt(endDate));
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,soil_moisture_0_to_7cm_mean,et0_fao_evapotranspiration"
    );
    url.searchParams.set("timezone", "UTC");

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Open-Meteo error: ${resp.status}`);
    const raw = (await resp.json()) as {
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        soil_moisture_0_to_7cm_mean: number[];
        et0_fao_evapotranspiration: number[];
      };
    };

    const d = raw.daily;
    let totalPrecip = 0;
    let maxTemp = -999;
    let minTemp = 999;
    let freezeThawCycles = 0;
    let prevAboveZero: boolean | null = null;
    const extremeEvents: WeatherEvent[] = [];

    for (let i = 0; i < d.time.length; i++) {
      const tMax = d.temperature_2m_max[i] ?? 0;
      const tMin = d.temperature_2m_min[i] ?? 0;
      const precip = d.precipitation_sum[i] ?? 0;

      totalPrecip += precip;
      if (tMax > maxTemp) maxTemp = tMax;
      if (tMin < minTemp) minTemp = tMin;

      // Freeze-thaw: crosses 0°C between days
      const aboveZero = tMax > 0 && tMin < 0;
      if (prevAboveZero !== null && aboveZero !== prevAboveZero) freezeThawCycles++;
      prevAboveZero = aboveZero;

      // Flag extreme events
      if (precip > 50) {
        extremeEvents.push({
          date: d.time[i],
          type: "heavy_rain",
          severity: precip > 100 ? "extreme" : "severe",
          description: `${precip.toFixed(1)}mm precipitation`,
        });
      }
      if (tMin < -10) {
        extremeEvents.push({
          date: d.time[i],
          type: "freeze",
          severity: tMin < -20 ? "extreme" : "severe",
          description: `Minimum temperature ${tMin.toFixed(1)}°C`,
        });
      }
      if (tMax > 38) {
        extremeEvents.push({
          date: d.time[i],
          type: "heat_wave",
          severity: tMax > 44 ? "extreme" : "severe",
          description: `Maximum temperature ${tMax.toFixed(1)}°C`,
        });
      }
    }

    const soilMoistureArr = d.soil_moisture_0_to_7cm_mean.filter((v) => v != null);
    const soilMoistureMean =
      soilMoistureArr.length > 0
        ? soilMoistureArr.reduce((a, b) => a + b, 0) / soilMoistureArr.length
        : undefined;

    const etArr = d.et0_fao_evapotranspiration.filter((v) => v != null);
    const evapotranspirationMm =
      etArr.length > 0 ? etArr.reduce((a, b) => a + b, 0) : undefined;

    const context: WeatherContext = {
      assetId,
      periodDays,
      totalPrecipitationMm: Math.round(totalPrecip * 10) / 10,
      maxTemperatureC: Math.round(maxTemp * 10) / 10,
      minTemperatureC: Math.round(minTemp * 10) / 10,
      freezeThawCycles,
      extremeEvents: extremeEvents.slice(0, 10), // cap at 10 events
      soilMoistureMean,
      evapotranspirationMm,
      fetchedAt: new Date().toISOString(),
    };

    return context;
  },
});

const fetchSeismicContext = new tool({
  name: "fetch_seismic_context",
  description:
    "Query the USGS Earthquake Hazards API for seismic events within 100km of a location over a period. Returns event count, max magnitude, and individual events.",
  parameters: z.object({
    assetId: z.string(),
    lat: z.number(),
    lng: z.number(),
    periodDays: z.number().default(90),
    radiusKm: z.number().default(100),
    minMagnitude: z.number().default(2.0),
  }),
  async execute({ assetId, lat, lng, periodDays, radiusKm, minMagnitude }) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
    url.searchParams.set("format", "geojson");
    url.searchParams.set("starttime", startDate.toISOString().split("T")[0]);
    url.searchParams.set("endtime", endDate.toISOString().split("T")[0]);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("maxradiuskm", String(radiusKm));
    url.searchParams.set("minmagnitude", String(minMagnitude));
    url.searchParams.set("orderby", "magnitude");
    url.searchParams.set("limit", "20");

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`USGS API error: ${resp.status}`);

    const raw = (await resp.json()) as {
      features: Array<{
        properties: {
          mag: number;
          place: string;
          time: number;
          depth?: number;
        };
        geometry: { coordinates: [number, number, number] };
      }>;
    };

    const events = raw.features.map((f) => {
      const [eLng, eLat] = f.geometry.coordinates;
      // Haversine distance
      const R = 6371;
      const dLat = ((eLat - lat) * Math.PI) / 180;
      const dLon = ((eLng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((eLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return {
        date: new Date(f.properties.time).toISOString(),
        magnitude: f.properties.mag,
        depth: f.geometry.coordinates[2] ?? 0,
        distanceKm: Math.round(distanceKm),
        location: f.properties.place,
      };
    });

    const maxMagnitude = events.length > 0 ? Math.max(...events.map((e) => e.magnitude)) : 0;

    const context: SeismicContext = {
      assetId,
      periodDays,
      eventCount: events.length,
      maxMagnitude,
      events: events.slice(0, 10),
      fetchedAt: new Date().toISOString(),
    };

    return context;
  },
});

const saveContextToFirestore = new tool({
  name: "save_context_to_firestore",
  description:
    "Persist weather and seismic context to Firestore under the asset's pending_context collection, ready for the risk scorer.",
  parameters: z.object({
    assetId: z.string(),
    weatherContext: z.record(z.unknown()),
    seismicContext: z.record(z.unknown()),
  }),
  async execute({ assetId, weatherContext, seismicContext }) {
    await db
      .collection("assets")
      .doc(assetId)
      .collection("pending_context")
      .doc("latest")
      .set({
        weatherContext,
        seismicContext,
        savedAt: new Date().toISOString(),
      });
    return { saved: true, assetId };
  },
});

// ============================================================
// Context Enricher Agent
// ============================================================

export const contextEnricherAgent = new Agent({
  name: "context_enricher",
  model: "gemini-3.5-flash",
  description:
    "Fetches and synthesises external context data — weather history, seismic activity, soil moisture — that explains *why* degradation may be accelerating for a given asset.",

  instruction: `
You are the Context Enricher agent for Degradation Watcher.

When given an asset ID, lat/lng, and period:
1. Fetch weather context using fetch_weather_context
2. Fetch seismic context using fetch_seismic_context  
3. Save both to Firestore using save_context_to_firestore

Analyse the data briefly:
- Note if freeze-thaw cycles are unusually high (>15 in 90 days is significant for infrastructure)
- Flag if any seismic events > M3.5 occurred within 50km
- For agriculture, flag if soil moisture is below 0.2 (drought stress) or above 0.4 (waterlogging)
- Highlight any extreme weather events that correlate with the imagery capture date

Be factual and concise. Do not speculate beyond what the data shows.
  `.trim(),

  tools: [fetchWeatherContext, fetchSeismicContext, saveContextToFirestore],
});

// ============================================================
// Cloud Run entry point
// ============================================================

import express from "express";

const app = express();
app.use(express.json());

const sessionService = new InMemorySessionService();
const runner = new Runner({
  agent: contextEnricherAgent,
  appName: "context-enricher",
  sessionService,
});

app.post("/pubsub", async (req, res) => {
  try {
    const data = Buffer.from(req.body.message.data, "base64").toString("utf-8");
    const payload = JSON.parse(data) as {
      assetId: string;
      lat: number;
      lng: number;
      periodDays: number;
    };

    const session = await sessionService.createSession({
      appName: "context-enricher",
      userId: "system",
    });

    const prompt = `
Enrich context for asset ${payload.assetId}
Location: lat ${payload.lat}, lng ${payload.lng}
Period: ${payload.periodDays} days
    `.trim();

    for await (const chunk of runner.runAsync({
      sessionId: session.id,
      userId: "system",
      newMessage: { role: "user", parts: [{ text: prompt }] },
    })) {
      if (chunk.content?.parts) {
        for (const part of chunk.content.parts) {
          if (part.text) console.log("[context-enricher]", part.text);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Context enricher error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8081", 10);
app.listen(PORT, () => console.log(`Context enricher listening on :${PORT}`));
