# 🛰️ Degradation Watcher

An autonomous multi-agent system that watches agricultural land degrade in slow motion — and acts before crop failure or severe soil erosion becomes irreversible.

---

## Overview

Degradation Watcher is a continuously running, asynchronous fleet of AI agents that monitors agricultural farmland and critical land assets via free Sentinel-2 satellite imagery — detecting vegetation degradation, drought stress, and soil decline weeks before traditional surveys, and autonomously drafting actionable mitigation reports with **Gemini 3.6 Flash**.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js 16 Dashboard (TypeScript · Server Components)   │
│  Interactive temporal diffing · Asset map · Risk score timeline        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Firestore real-time listeners
┌──────────────────────────────────▼─────────────────────────────────────┐
│  ADK Agent Fleet (TypeScript — @google/adk · Gemini 3.6 Flash)         │
│  Orchestrator → Risk Scorer → Response Drafter                         │
│  Context Enricher (Open-Meteo weather + USGS seismic context)          │
│  Deployed on Cloud Run, triggered by Pub/Sub                           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Pub/Sub event: imagery ready
┌──────────────────────────────────▼─────────────────────────────────────┐
│  Imagery Service (Python · FastAPI · Pillow)                           │
│  Sentinel-2 STAC fetch · NDVI · Web thumbnail downsampling             │
│  Cloud Run + Cloud Scheduler (every 5 days)                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| **AI Model**     | **Gemini 3.6 Flash** (Google GenAI / Vertex AI)                       |
| Agent Framework  | Google ADK TypeScript `@google/adk`                                   |
| Frontend         | Next.js 16, React 19, Tailwind CSS v4, Recharts, MapLibre             |
| Imagery Pipeline | Python 3.11, pystac-client, rasterio, Pillow downsampler, FastAPI     |
| Satellite Data   | Sentinel-2 (ESA/Copernicus) via AWS Element84 STAC — free / open      |
| Weather Context  | Open-Meteo API (soil moisture, temperature, precipitation) — free     |
| Seismic Context  | USGS Earthquake Hazards API — free                                    |
| State & Storage  | Firestore (asset registry, degradation history), Google Cloud Storage |
| Event Streaming  | Google Cloud Pub/Sub (asynchronous event-driven agent pipeline)       |
| Scheduling       | Cloud Scheduler (5-day satellite revisit cadence)                     |
| Compute          | Google Cloud Run (microservices architecture)                         |

---

## Key Features

1. **Multimodal Temporal Diffing**: Evaluates multi-temporal satellite imagery side-by-side using Gemini 3.6 Flash to identify vegetation decline, fallow transitions, and drought stress.
2. **Clamped Composite Risk Scoring**: Blends visual change severity (1–5 scale with strict mathematical clamping) with real-time weather stress, seismic proximity, and crop parameters.
3. **Automated Thumbnail Downsampling**: Downsamples raw 200MB+ Sentinel-2 GeoTIFF tiles to web-optimized 1024x1024 visual PNGs prior to GCS upload, eliminating frontend latency.
4. **Interactive Agricultural Dashboard**: Sleek dark terminal UI with interactive capture timeline, side-by-side comparison, real-time alert feed, and farmland parcel submission.

---

## Setup & Running Guide

### Prerequisites

- **Node.js 20+** and **Bun** (or npm)
- **Python 3.11+**
- **Google Cloud SDK (`gcloud`)** authenticated: `gcloud auth application-default login`
- Google Cloud project with billing enabled

---

### 1. Environment Configuration

Clone the repository and create your local environment file:

```bash
git clone https://github.com/contigen/degradation-watcher.git
cd degradation-watcher
cp .env.example .env
```

Configure your `.env` with your project credentials:

```bash
GCP_PROJECT=your-google-cloud-project-id
GCP_REGION=us-central1
GEMINI_API_KEY=your-gemini-api-key
GCS_BUCKET=your-google-cloud-project-id
```

---

### Option A: Local Development Setup

#### 1. Seed the Farmland Registry

Seed Firestore with real agricultural parcels (Central Valley Almonds, Iowa Corn Belt, Kansas Wheat, etc.):

```bash
node infrastructure/seed-assets.js
```

#### 2. Run the Next.js Web Dashboard

Start the local dashboard with Bun:

```bash
cd apps/web
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### 3. Run the Python Imagery Service Locally (Optional)

```bash
cd services/imagery
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

---

### Option B: Cloud Deployment (Google Cloud Run & Pub/Sub)

#### 1. Enable Google Cloud APIs

```bash
gcloud services enable \
  run.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  aiplatform.googleapis.com
```

#### 2. Create Service Account & Storage Bucket

```bash
# Create Service Account
gcloud iam service-accounts create degradation-watcher-sa \
  --display-name="Degradation Watcher Agent Fleet"

# Create GCS Bucket for Satellite Imagery
gcloud storage buckets create gs://$GCP_PROJECT --location=$GCP_REGION
```

#### 3. Automated One-Command Cloud Deployment

Run the automated infrastructure deployment script:

```bash
chmod +x infrastructure/deploy.sh infrastructure/wire-subscriptions.sh infrastructure/setup-scheduler.sh
./infrastructure/deploy.sh
./infrastructure/wire-subscriptions.sh
./infrastructure/setup-scheduler.sh
```

#### 4. Manual Cloud Run Service Deployment (Alternative)

##### Deploy Python Imagery Service:

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

##### Deploy Orchestrator Agent:

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

---

## Triggering a Live Demo Run (Backend)

To trigger the end-to-end autonomous analysis pipeline manually during a demo:

```bash
curl -X POST https://imagery-service-xxx.a.run.app/fetch-single \
  -H "Content-Type: application/json" \
  -d '{"asset_id": "farm_california_central_valley"}'
```

Watch the pipeline logs stream, satellite tiles downsample, Gemini 3.6 Flash diff the images, and the dashboard update in real-time!

---

---

## Reproducible Testing Guide (Judge Walkthrough)

To verify all features and agent workflows locally:

### 1. View Farmland Fleet & Map

- Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view active agricultural parcels across the US, risk score distribution, and live alerts.
- Click **Farmlands** ([http://localhost:3000/assets](http://localhost:3000/assets)) to browse the full farmland registry.

### 2. Test Multimodal Temporal Diffing & Gemini Vision Reasoning

- Open the [Central Valley Almond Orchard](http://localhost:3000/assets/farm_california_central_valley) on localhost.
- In the **Capture Timeline** on the left, click through historical captures to observe how the side-by-side satellite imagery, **Gemini 3.6 Flash** reasoning commentary, and 4-factor risk breakdown update reactively.

### 3. Test Live Asset Ingest & Automated Pipeline

- Click **`+ Submit Farmland for Monitoring`** in the top bar.
- Select a quick preset (e.g. `+ Salinas (lettuce)`) or enter custom coordinates and crop parameters.
- Click **Submit for Sentinel-2 Monitoring**.
- The system registers the parcel in Firestore, pulls the latest Sentinel-2 L2A scene from the STAC catalog, downsamples the visual tile, and navigates directly to the new asset view.

### 4. Manual Pipeline Verification (Optional Backend Test)

Trigger an on-demand satellite fetch and multi-agent evaluation via HTTP POST:

```bash
curl -X POST https://imagery-service-hotx43jlqq-uc.a.run.app/run/farm_california_central_valley
```
