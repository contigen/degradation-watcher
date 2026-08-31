# 🛰️ Degradation Watcher

> An autonomous multi-agent system that watches the physical world erode in slow motion — and acts before it becomes a catastrophe.

Built for the **All Things Agentic Hackathon** by Google Cloud.

## What It Does

Degradation Watcher is a continuously running, asynchronous fleet of AI agents that monitors civil infrastructure (bridges, roads) and agricultural land via free satellite imagery — detecting degradation weeks before human inspection would catch it, and autonomously drafting response briefs routed to the right people.

**178 million vehicles cross structurally deficient bridges every day. Nobody is watching them between inspections. Until now.**

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Next.js 16 Dashboard (TypeScript)                  │
│  Asset map · Degradation timelines · Alert inbox    │
└──────────────────┬──────────────────────────────────┘
                   │ Firestore real-time listeners
┌──────────────────▼──────────────────────────────────┐
│  ADK Agent Fleet (TypeScript — @google/adk)         │
│  Orchestrator → Risk Scorer → Response Drafter      │
│  Context Enricher (NOAA + USGS + Open-Meteo)        │
│  Deployed on Cloud Run, triggered by Pub/Sub        │
└──────────────────┬──────────────────────────────────┘
                   │ Pub/Sub event: imagery ready
┌──────────────────▼──────────────────────────────────┐
│  Imagery Service (Python — FastAPI)                 │
│  Sentinel-2 fetch · NDVI · Cloud Storage export     │
│  Cloud Run + Cloud Scheduler (every 5 days)         │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer            | Technology                                                |
| ---------------- | --------------------------------------------------------- |
| AI Model         | Gemini 3.5 Flash (Vertex AI)                              |
| Agent Framework  | Google ADK TypeScript `@google/adk`                       |
| Frontend         | Next.js 15, Tailwind CSS, MapLibre GL, Recharts           |
| Imagery Pipeline | Python, pystac-client, rasterio, FastAPI                  |
| Satellite Data   | Sentinel-2 (ESA/Copernicus) via AWS Element84 STAC — free |
| Asset Location   | OpenStreetMap Overpass API + FHWA NBI — free              |
| Weather Context  | NOAA CDO API, Open-Meteo — free                           |
| Seismic Context  | USGS Earthquake API — free                                |
| State            | Firestore (asset registry, degradation history, alerts)   |
| Events           | Pub/Sub (async agent pipeline)                            |
| Scheduling       | Cloud Scheduler (5-day imagery cadence)                   |
| Compute          | Cloud Run (all services)                                  |
| Safety           | Model Armor (report drafter guardrails)                   |

## Asset Classes

- **Infrastructure**: Bridges and roads — visual change detection (cracking, staining, spalling, subsidence)
- **Agriculture**: Farmland — NDVI time-series (crop stress, irrigation failure, soil degradation)

## Data Sources (All Free)

| Source              | Data                           | Auth                |
| ------------------- | ------------------------------ | ------------------- |
| AWS Element84 STAC  | Sentinel-2 imagery             | None                |
| Google Earth Engine | NAIP, Landsat archive          | GEE OAuth (free)    |
| OSM Overpass API    | Bridge/road/farmland locations | None                |
| FHWA NBI            | US bridge inventory + ratings  | None (CSV download) |
| NOAA CDO API        | Historical weather             | Free token          |
| Open-Meteo          | Soil moisture, temperature     | None                |
| USGS Earthquake     | Seismic events                 | None                |
| USDA NASS           | Crop yield baselines           | Free API key        |

## Quickstart

### Prerequisites

- Node.js 20+
- Python 3.11+
- Google Cloud project with billing enabled
- `gcloud` CLI authenticated

### 1. Clone & configure

```bash
git clone <repo>
cd degradation-watcher
cp .env.example .env
# Fill in your GCP project ID, Gemini API key, NOAA token
```

### 2. Enable GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  aiplatform.googleapis.com \
  earthengine.googleapis.com
```

### 3. Seed infrastructure

```bash
cd infrastructure
node seed-assets.js   # Seeds Firestore with 15 real assets
node setup-pubsub.js  # Creates topics and subscriptions
node setup-scheduler.js  # Creates Cloud Scheduler jobs
```

### 4. Deploy imagery service

```bash
cd services/imagery
pip install -r requirements.txt
gcloud run deploy imagery-service \
  --source . \
  --region us-central1 \
  --set-env-vars GCS_BUCKET=$GCS_BUCKET,PUBSUB_TOPIC=$PUBSUB_TOPIC
```

### 5. Deploy ADK agents

```bash
cd agents/orchestrator
npm install
npx adk deploy cloud_run . \
  --project $GCP_PROJECT \
  --region us-central1 \
  --service_name degradation-orchestrator
```

### 6. Run dashboard locally

```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:3000
```

## Judging Criteria Alignment

| Criterion                | How We Address It                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Innovation (40%)**     | Novel domain (physical world monitoring), async long-running agents that genuinely cannot work in single sessions, dual asset class (infrastructure + agriculture) |
| **Architecture (30%)**   | Full A2A multi-agent fleet, Pub/Sub async pipeline, persistent Firestore state, Model Armor guardrails, Cloud Run microservices, OpenTelemetry traces              |
| **Demo Readiness (30%)** | Live dashboard, pre-seeded real assets with synthetic degradation history, working Gemini analysis chain, GCP console proof                                        |

## Bonus Points

- ✅ Blog post: "How we built a satellite-powered infrastructure agent on Google Cloud"
- ✅ Gemini multimodal (vision) — core of the Analyst agent
- ✅ Veo integration path documented (video timelapse generation)
