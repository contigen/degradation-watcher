#!/bin/bash
# ============================================================
# Degradation Watcher — Deploy all services to Cloud Run
# Run: bash infrastructure/deploy.sh
# ============================================================

set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-us-central1}"
GCS_BUCKET="${GCS_BUCKET:-${PROJECT}-degradation-imagery}"
SA="degradation-watcher-sa@${PROJECT}.iam.gserviceaccount.com"

IMAGERY_TOPIC="imagery-ready"
CONTEXT_TOPIC="context-enricher-trigger"
ANALYST_TOPIC="analyst-trigger"
RISK_SCORER_TOPIC="risk-scorer-trigger"
RISK_RESULT_TOPIC="risk-result"
RESPONSE_DRAFTER_TOPIC="response-drafter-trigger"

echo "🛰️  Deploying Degradation Watcher to Cloud Run"
echo "   Project: $PROJECT | Region: $REGION"

# ── 1. Imagery Service (Python) ───────────────────────────────
echo ""
echo "── [1/5] Deploying imagery microservice..."
gcloud run deploy imagery-service \
  --source ./services/imagery \
  --region "$REGION" \
  --project "$PROJECT" \
  --service-account "$SA" \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 540 \
  --concurrency 10 \
  --set-env-vars "GCP_PROJECT=$PROJECT,GCS_BUCKET=$GCS_BUCKET,PUBSUB_TOPIC=$IMAGERY_TOPIC"

IMAGERY_URL=$(gcloud run services describe imagery-service \
  --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ imagery-service → $IMAGERY_URL"

# ── 2. Context Enricher Agent ─────────────────────────────────
echo ""
echo "── [2/5] Deploying context-enricher agent..."
gcloud run deploy context-enricher \
  --source ./agents/context-enricher \
  --region "$REGION" \
  --project "$PROJECT" \
  --service-account "$SA" \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT=$PROJECT,GCP_REGION=$REGION,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION"

CONTEXT_URL=$(gcloud run services describe context-enricher \
  --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ context-enricher → $CONTEXT_URL"

# ── 3. Risk Scorer Agent ─────────────────────────────────────
echo ""
echo "── [3/5] Deploying risk-scorer agent..."
gcloud run deploy risk-scorer \
  --source ./agents/risk-scorer \
  --region "$REGION" \
  --project "$PROJECT" \
  --service-account "$SA" \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT=$PROJECT,GCP_REGION=$REGION,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION,RISK_RESULT_TOPIC=$RISK_RESULT_TOPIC"

RISK_URL=$(gcloud run services describe risk-scorer \
  --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ risk-scorer → $RISK_URL"

# ── 4. Response Drafter Agent ────────────────────────────────
echo ""
echo "── [4/5] Deploying response-drafter agent..."
gcloud run deploy response-drafter \
  --source ./agents/response-drafter \
  --region "$REGION" \
  --project "$PROJECT" \
  --service-account "$SA" \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT=$PROJECT,GCP_REGION=$REGION,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION"

DRAFTER_URL=$(gcloud run services describe response-drafter \
  --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ response-drafter → $DRAFTER_URL"

# ── 5. Orchestrator Agent ────────────────────────────────────
echo ""
echo "── [5/5] Deploying orchestrator agent..."
gcloud run deploy degradation-orchestrator \
  --source ./agents/orchestrator \
  --region "$REGION" \
  --project "$PROJECT" \
  --service-account "$SA" \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 540 \
  --set-env-vars "GCP_PROJECT=$PROJECT,GCP_REGION=$REGION,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION,\
CONTEXT_ENRICHER_TOPIC=$CONTEXT_TOPIC,\
ANALYST_TOPIC=$ANALYST_TOPIC,\
RISK_SCORER_TOPIC=$RISK_SCORER_TOPIC,\
RESPONSE_DRAFTER_TOPIC=$RESPONSE_DRAFTER_TOPIC"

ORCH_URL=$(gcloud run services describe degradation-orchestrator \
  --region "$REGION" --project "$PROJECT" \
  --format "value(status.url)")
echo "   ✓ degradation-orchestrator → $ORCH_URL"

# ── Write service URLs to env file ───────────────────────────
echo ""
echo "── Writing service URLs..."
cat > infrastructure/.service-urls.env << EOF
IMAGERY_URL=$IMAGERY_URL
CONTEXT_URL=$CONTEXT_URL
RISK_URL=$RISK_URL
DRAFTER_URL=$DRAFTER_URL
ORCH_URL=$ORCH_URL
EOF

echo ""
echo "✅ All 5 services deployed."
echo ""
echo "Next: bash infrastructure/wire-subscriptions.sh"
