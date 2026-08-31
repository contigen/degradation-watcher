# 🛰️ Degradation Watcher

> An autonomous multi-agent system that watches the physical world erode in slow motion — and acts before it becomes a catastrophe.

Built for the **All Things Agentic Hackathon** by Google Cloud.

## What It Does

Degradation Watcher is a continuously running, asynchronous fleet of AI agents that monitors civil infrastructure (bridges, roads) and agricultural land via free Sentinel-2 satellite imagery — detecting degradation weeks before human inspection would catch it, and autonomously drafting response briefs routed to the right people.

**178 million vehicles cross structurally deficient bridges every day. Nobody is watching them between inspections. Until now.**

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js 16 Dashboard (TypeScript · Geist Mono · Server Components)   │
│  Interactive temporal diffing · Asset map · Risk score timeline        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Firestore real-time listeners
┌──────────────────────────────────▼─────────────────────────────────────┐
│  ADK Agent Fleet (TypeScript — @google/adk · Gemini 3.6 Flash)         │
│  Orchestrator → Risk Scorer → Response Drafter                         │
│  Context Enricher (Open-Meteo weather + USGS earthquake data)          │
│  Deployed on Cloud Run, triggered by Pub/Sub                           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Pub/Sub event: imagery ready
┌──────────────────────────────────▼─────────────────────────────────────┐
│  Imagery Service (Python · FastAPI · Pillow)                           │
│  Sentinel-2 STAC fetch · NDVI · Web thumbnail downsampling             │
│  Cloud Run + Cloud Scheduler (every 5 days)                            │
└────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| **AI Model**     | **Gemini 3.6 Flash** (Google GenAI / Vertex AI)                       |
| Agent Framework  | Google ADK TypeScript `@google/adk`                                   |
| Frontend         | Next.js 16, React 19, Tailwind CSS v4, Geist Mono, Recharts, MapLibre |
| Imagery Pipeline | Python 3.11, pystac-client, rasterio, Pillow downsampler, FastAPI     |
| Satellite Data   | Sentinel-2 (ESA/Copernicus) via AWS Element84 STAC — free             |
| Asset Location   | OpenStreetMap Overpass API + FHWA NBI — free                          |
| Weather Context  | Open-Meteo (soil moisture, temperature, precipitation) — free         |
| Seismic Context  | USGS Earthquake Hazards API — free                                    |
| State & Storage  | Firestore (asset registry, degradation history), Google Cloud Storage |
| Event Streaming  | Google Cloud Pub/Sub (asynchronous event-driven agent pipeline)       |
| Scheduling       | Cloud Scheduler (5-day satellite revisit cadence)                     |
| Compute          | Google Cloud Run (microservices architecture)                         |

## Key Agent Capabilities

- **Temporal Diffing Analysis**: Evaluates high-resolution multi-temporal satellite imagery side-by-side using **Gemini 3.6 Flash** vision capabilities to identify vegetation loss, drought stress, and structural shifts.
- **Multimodal Risk Scoring**: Blends visual severity (1–5 scale with strict bounds clamping) with live weather stress, seismic proximity, and asset age.
- **Automated Imagery Downsampling**: Python service downsamples raw 200MB+ Sentinel-2 GeoTIFF tiles to web-optimized 1024x1024 visual PNGs prior to GCS upload, eliminating frontend latency.
- **Human-in-the-Loop Alerting**: Autonomously drafts contextualized inspection reports and mitigation plans when degradation crosses defined risk thresholds.

## Quickstart

### Prerequisites

- Node.js 20+ / Bun
- Python 3.11+
- Google Cloud project with billing enabled
- `gcloud` CLI authenticated

### 1. Clone & Configure

```bash
git clone <repo>
cd degradation-watcher
cp .env.example .env
# Fill in your GCP_PROJECT, GCP_REGION, and GEMINI_API_KEY
```

### 2. Enable GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  aiplatform.googleapis.com
```

### 3. Seed Infrastructure

```bash
cd infrastructure
node seed-assets.js       # Seeds Firestore with real assets
./wire-subscriptions.sh  # Sets up Pub/Sub topics and push subscriptions
./setup-scheduler.sh     # Sets up Cloud Scheduler triggers
```

### 4. Deploy Imagery Service

```bash
cd services/imagery
gcloud run deploy imagery-service \
  --source . \
  --region us-central1 \
  --project $GCP_PROJECT \
  --service-account degradation-watcher-sa@$GCP_PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT=$GCP_PROJECT,GCP_REGION=us-central1,GCS_BUCKET=$GCP_PROJECT,PUBSUB_TOPIC=imagery-ready"
```

### 5. Deploy Orchestrator & Agent Fleet

```bash
cd agents/orchestrator
npm run build
gcloud run deploy degradation-orchestrator \
  --source . \
  --region us-central1 \
  --project $GCP_PROJECT \
  --service-account degradation-watcher-sa@$GCP_PROJECT.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT=$GCP_PROJECT,GCP_REGION=us-central1,GEMINI_API_KEY=$GEMINI_API_KEY"
```

### 6. Run Dashboard Locally

````bash
cd apps/web
bun install
bun dev
# Open http://localhost:3000
```                        |
````
